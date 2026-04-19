import type { LLMProvider } from '../models/interfaces.js';
import type { PipelineProviders } from './pipeline.js';
import { scrapeUrl } from './scraper.js';
import { runPipeline } from './pipeline.js';
import { generateReportHtml } from './report-generator.js';
import { generateReportPdf, pdfFilename as _pdfFilename } from './pdf.js';
import { translateReportData } from '../agents/translator.js';
import { updateAuditStatus, completeAudit, saveDatabase, saveFindings, logError, saveAuditTiming, storePdf } from './database.js';
import { sendVerifyCodeEmail, sendLeadNotification } from './email.js';
import { getCachedUiStrings } from './report-cache.js';

// Re-export pdfFilename so routes can import from here if needed
export { _pdfFilename as pdfFilename };

/** In-memory audit progress tracking (auto-cleanup after 30 min). */
const PROGRESS_TTL_MS = 30 * 60 * 1000;
export const auditProgress = new Map<string, { status: string; messages: string[]; createdAt: number }>();

export function cleanupProgress(): void {
  const now = Date.now();
  for (const [id, entry] of auditProgress) {
    if (now - entry.createdAt > PROGRESS_TTL_MS) auditProgress.delete(id);
  }
}

export async function runAudit(
  auditId: string,
  url: string,
  email: string,
  verifyCode: string,
  gemini: LLMProvider,
  lang = 'es',
  providers?: PipelineProviders,
  dbPath?: string,
) {
  const savePath = dbPath || '';

  let progress = auditProgress.get(auditId);
  if (!progress) {
    progress = { status: 'running', messages: [], createdAt: Date.now() };
    auditProgress.set(auditId, progress);
  }
  const addMessage = (msg: string) => {
    progress.messages.push(msg);
    progress.status = msg;
  };

  const auditStart = Date.now();

  // Step 1: Scrape
  addMessage('Scraping website...');
  updateAuditStatus(auditId, 'scraping');
  saveDatabase(savePath);
  const scrapeStart = Date.now();
  let scrapingResult;
  try {
    scrapingResult = await scrapeUrl(url);
  } catch (err) {
    logError(auditId, 'scraping', err as Error, url);
    throw err;
  }
  const scrapeMs = Date.now() - scrapeStart;
  addMessage(`Scraped: ${(Buffer.byteLength(scrapingResult.html) / 1024).toFixed(0)}KB HTML, screenshots captured (${(scrapeMs / 1000).toFixed(1)}s)`);

  // Step 2: Analyze
  addMessage('Running CRO analysis...');
  updateAuditStatus(auditId, 'analyzing');
  saveDatabase(savePath);

  const pipelineStart = Date.now();
  let pipelineResult;
  try {
    pipelineResult = await runPipeline(scrapingResult, url, gemini, addMessage, providers);
  } catch (err) {
    logError(auditId, 'pipeline', err as Error, url);
    throw err;
  }
  const pipelineMs = Date.now() - pipelineStart;

  // Check if we got meaningful results (at least 2 categories beyond Performance)
  const realCategories = pipelineResult.analyses.filter(a => a.category !== 'performance').length;
  if (realCategories === 0) {
    addMessage('Analysis failed — no LLM results. Try again later.');
    updateAuditStatus(auditId, 'failed');
    saveDatabase(savePath);
    progress.status = 'failed';
    return;
  }

  // Step 3: Translate LLM results if target lang is not English (with 30s timeout)
  const translationStart = Date.now();
  let { quickWins, mockups, analyses } = pipelineResult;
  if (lang !== 'en') {
    addMessage('Translating results...');
    try {
      const translateLlm = providers?.mockups || gemini;
      const translatePromise = translateReportData(
        { quickWins, mockups, analyses },
        lang,
        translateLlm,
        true, // force: LLM responds in English, translate to target lang
      );
      const translated = await Promise.race([
        translatePromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Translation timed out after 30s')), 30000)),
      ]);
      quickWins = translated.quickWins;
      mockups = translated.mockups;
      analyses = translated.analyses;
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[Audit] Translation to ${lang} failed, using English results:`, msg);
      logError(auditId, 'translation', err as Error, url);
    }
  }

  const translationMs = Date.now() - translationStart;

  // Step 4: Translate UI strings if not Spanish, then generate report
  const reportStart = Date.now();
  addMessage('Generating report...');
  updateAuditStatus(auditId, 'generating_report');
  saveDatabase(savePath);

  let uiStrings = undefined;
  if (lang !== 'es') {
    try {
      const uiPromise = getCachedUiStrings(lang, providers?.mockups || gemini);
      uiStrings = await Promise.race([
        uiPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('UI translation timed out')), 15000)),
      ]);
    } catch (err) {
      logError(auditId, 'ui_translation', err as Error, url);
    }
  }

  const reportHtml = generateReportHtml({
    url,
    globalScore: pipelineResult.globalScore,
    scores: pipelineResult.scores,
    quickWins,
    mockups,
    analyses,
    date: new Date().toISOString().split('T')[0],
    lang,
    uiStrings,
    pdfUrl: `/api/v1/audit/${auditId}/pdf?lang=${lang}`,
  });

  // Step 5: Save
  completeAudit(
    auditId,
    pipelineResult.globalScore,
    JSON.stringify(pipelineResult.scores),
    JSON.stringify(quickWins),
    JSON.stringify(mockups),
    JSON.stringify(analyses),
    reportHtml,
  );
  saveFindings(auditId, url, JSON.stringify(analyses));
  const reportMs = Date.now() - reportStart;
  const totalMs = Date.now() - auditStart;
  saveAuditTiming(auditId, url, { totalMs, scrapeMs, pipelineMs, translationMs, reportMs });
  saveDatabase(savePath);

  addMessage(`Audit complete! (${(totalMs / 1000).toFixed(1)}s total)`);
  progress.status = 'completed';

  // Step 6: Send verification email (only for non-batch audits)
  if (verifyCode) {
    sendVerifyCodeEmail(email, verifyCode, lang).catch((err) => {
      logError(auditId, 'verify_email', err as Error, url);
    });
    sendLeadNotification(email, url, lang, pipelineResult.globalScore, auditId).catch(() => {});
  }

  // Generate PDF in background (non-blocking)
  generateReportPdf(reportHtml).then((pdfBuf) => {
    storePdf(auditId, lang, pdfBuf);
    saveDatabase(savePath);
  }).catch((err) => {
    logError(auditId, 'pdf_generation', err as Error, url);
  });
}
