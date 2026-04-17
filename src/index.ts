import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { initDatabase, createLead, createBatchLead, createAudit, updateAuditStatus, completeAudit, getAudit, saveDatabase, recoverOrphanedAudits, deleteAuditByUrl, setVerifyCode, verifyEmailCode, isEmailVerified, getLeadEmail, getStoredTranslation, storeTranslation, getStoredPdf, storePdf, countRecentAuditsByEmail, getRecentAuditByUrl, linkLeadToAudit, getAllLeads, getLeadStats, purgeAllAudits, saveFindings, getAnalytics, logError, getErrorLog, getErrorStats, deleteError, saveAuditTiming, getTimingStats, startBackupScheduler, setBackupDbPath, createBackup, listBackups, getBackupFile, exportDatabase, restoreFromBackup, findExistingLead, resetLeadVerification } from './services/database.js';
import { scrapeUrl, initBrowser, closeBrowser } from './services/scraper.js';
import { createGeminiProvider } from './services/gemini.js';
import { runPipeline } from './services/pipeline.js';
import { generateReportHtml, DEFAULT_UI_STRINGS } from './services/report-generator.js';
import { generateReportPdf, pdfFilename } from './services/pdf.js';
import { initEmail, sendVerifyCodeEmail, sendReportEmail, sendLeadNotification } from './services/email.js';
import { shouldTranslate, normalizeLangCode, translateReportData, translateUiStrings } from './agents/translator.js';
import type { LLMProvider, AgentAnalysis, QuickWin, Mockup, CategoryScores } from './models/interfaces.js';
import { normalizeUrl, isValidUrl, isValidEmail } from './utils/normalize-url.js';
import { escapeHtml } from './utils/html.js';
import { auditRateLimit, generalRateLimit, verifyRateLimit, sendCodeRateLimit, honeypotCheck, securityHeaders, corsProtection, hashEmail, resetRateLimits, acquireAuditSlot, releaseAuditSlot, isPrivateUrl } from './services/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1); // Trust only Railway's proxy (1 hop), not user-supplied X-Forwarded-For
app.use(securityHeaders);
app.use(corsProtection);
app.use(express.json({ limit: '1mb' })); // limit body size
app.use(express.static(path.join(__dirname, '..', 'public')));
// Rate limit all API routes except admin and progress polling (GET /api/v1/audit/:id)
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/v1/admin/')) return next();
  if (req.method === 'GET' && /^\/v1\/audit\/[a-f0-9-]+$/.test(req.path)) return next();
  return generalRateLimit(req, res, next);
});

const PORT = process.env.PORT || 3000;
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://scanandboost.weareboost.online').replace(/\/$/, '');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'croagent.db');

// In-memory audit status tracking (auto-cleanup after 30 min)
const PROGRESS_TTL_MS = 30 * 60 * 1000;
const auditProgress = new Map<string, { status: string; messages: string[]; createdAt: number }>();

// In-memory translated report cache (key: `${auditId}|${lang}`, TTL 1h)
const REPORT_CACHE_TTL_MS = 60 * 60 * 1000;
const reportCache = new Map<string, { html: string; createdAt: number }>();

// In-memory report UI strings translation cache (key: lang, no TTL)
const uiStringsCache = new Map<string, typeof DEFAULT_UI_STRINGS>();

async function getCachedUiStrings(lang: string, llm: LLMProvider): Promise<typeof DEFAULT_UI_STRINGS> {
  const normalized = normalizeLangCode(lang);
  if (!shouldTranslate(normalized)) return DEFAULT_UI_STRINGS;
  const cached = uiStringsCache.get(normalized);
  if (cached) return cached;
  try {
    const translated = await translateUiStrings(DEFAULT_UI_STRINGS, normalized, llm);
    uiStringsCache.set(normalized, translated);
    return translated;
  } catch (err) {
    console.warn(`[UiStrings] Translation failed for lang=${normalized}, using defaults:`, (err as Error).message);
    return DEFAULT_UI_STRINGS;
  }
}


function getCachedReport(key: string): string | null {
  const entry = reportCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > REPORT_CACHE_TTL_MS) {
    reportCache.delete(key);
    return null;
  }
  return entry.html;
}

function setCachedReport(key: string, html: string): void {
  reportCache.set(key, { html, createdAt: Date.now() });
}

interface ReportRenderInput {
  url: string;
  globalScore: number;
  scores: CategoryScores;
  quickWins: QuickWin[];
  mockups: Mockup[];
  analyses: AgentAnalysis[];
  date: string;
  pdfUrl?: string;
}

/**
 * Translates a report payload (data + UI labels) to the target language and
 * returns the rendered HTML. Skips translation if the lang is Spanish.
 */
async function translateAndRender(
  input: ReportRenderInput,
  lang: string,
  llm: LLMProvider,
): Promise<string> {
  const normalized = normalizeLangCode(lang);
  if (!shouldTranslate(normalized)) {
    return generateReportHtml({ ...input, lang: normalized });
  }
  const [translatedData, translatedUi] = await Promise.all([
    translateReportData(
      { quickWins: input.quickWins, mockups: input.mockups, analyses: input.analyses },
      normalized,
      llm,
    ),
    getCachedUiStrings(normalized, llm),
  ]);
  return generateReportHtml({
    ...input,
    quickWins: translatedData.quickWins,
    mockups: translatedData.mockups,
    analyses: translatedData.analyses,
    uiStrings: translatedUi,
    lang: normalized,
  });
}

/**
 * Reconstructs report input from a DB audit row and (optionally) translates
 * data + UI labels to the target language. Caches the rendered HTML.
 *
 * Spanish requests are served from the pre-rendered HTML stored in DB to
 * avoid the cost of regenerating from data.
 */
async function renderLocalizedReport(
  audit: Record<string, unknown>,
  lang: string,
  llm: LLMProvider,
): Promise<string> {
  const auditId = audit.id as string;
  const normalizedLang = normalizeLangCode(lang);
  const cacheKey = `${auditId}|${normalizedLang}`;

  // Tier 1: in-memory cache (fastest).
  const memCached = getCachedReport(cacheKey);
  if (memCached) return memCached;

  // Spanish (or unknown lang) → serve the pre-rendered HTML stored in DB.
  if (!shouldTranslate(lang)) {
    const html = audit.report_html as string;
    if (!html) throw new Error(`Audit ${auditId} has no report_html`);
    setCachedReport(cacheKey, html);
    return html;
  }

  // Tier 2: persistent DB cache (survives server restarts).
  const dbCached = getStoredTranslation(auditId, normalizedLang);
  if (dbCached) {
    setCachedReport(cacheKey, dbCached);
    return dbCached;
  }

  // Tier 3: reconstruct typed data and translate.
  console.log(`[Report] Translating audit ${auditId} to ${normalizedLang} (tier 3: LLM translation)`);
  const input: ReportRenderInput = {
    url: audit.url as string,
    globalScore: audit.global_score as number,
    scores: JSON.parse(audit.scores_json as string) as CategoryScores,
    quickWins: JSON.parse(audit.quick_wins_json as string) as QuickWin[],
    mockups: JSON.parse(audit.mockups_json as string) as Mockup[],
    analyses: audit.analyses_json
      ? (JSON.parse(audit.analyses_json as string) as AgentAnalysis[])
      : [],
    date: ((audit.completed_at as string) || new Date().toISOString()).split('T')[0],
    pdfUrl: `/api/v1/audit/${auditId}/pdf?lang=${normalizedLang}`,
  };

  const html = await translateAndRender(input, lang, llm);
  setCachedReport(cacheKey, html);
  storeTranslation(auditId, normalizedLang, html);
  saveDatabase(DB_PATH);
  return html;
}

/** Periodic cache cleanup — removes expired entries from reportCache. */
function cleanupReportCache(): void {
  const now = Date.now();
  for (const [key, entry] of reportCache) {
    if (now - entry.createdAt > REPORT_CACHE_TTL_MS) reportCache.delete(key);
  }
}

function cleanupProgress(): void {
  const now = Date.now();
  for (const [id, entry] of auditProgress) {
    if (now - entry.createdAt > PROGRESS_TTL_MS) auditProgress.delete(id);
  }
}

async function main() {
  // Init database + backup system
  await initDatabase(DB_PATH);
  setBackupDbPath(DB_PATH);
  startBackupScheduler();

  // Recover orphaned audits from previous crashes
  const recovered = recoverOrphanedAudits();
  if (recovered > 0) {
    console.log(`Recovered ${recovered} orphaned audit(s) → marked as failed`);
    saveDatabase(DB_PATH);
  }

  // Init LLM providers
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable is required.');
    process.exit(1);
  }

  // 3 parallel Gemini providers with separate keys/queues for max throughput
  const geminiVision = createGeminiProvider(geminiKey);                                     // Vision: screenshots
  const geminiText = createGeminiProvider(process.env.GEMINI_API_KEY_2 || geminiKey);       // Text: copy + UX
  const geminiTranslate = createGeminiProvider(process.env.GEMINI_API_KEY_3 || geminiKey);  // Translation + mockups
  const gemini = geminiVision; // default for backwards compat

  if (process.env.GEMINI_API_KEY_2) console.log('[LLM] 3-provider mode: vision + text + translate (parallel)');
  else console.log('[LLM] Single-provider mode');

  // Init email service (reads RESEND_API_KEY from env; falls back to console.log)
  initEmail();

  // Init browser
  console.log('Starting browser...');
  await initBrowser();
  console.log('Browser ready.');

  // ─── API Routes ───

  // Submit audit (rate limited: 5/hour/IP, honeypot protected)
  app.post('/api/v1/audit', auditRateLimit, honeypotCheck, async (req, res) => {
    const { email, url, lang: requestLang } = req.body;
    const auditLang = normalizeLangCode(requestLang || 'es');

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required', code: 'INVALID_EMAIL' });
    }
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Valid URL (http/https) is required', code: 'INVALID_URL' });
    }

    // SSRF protection — block private/internal URLs
    if (await isPrivateUrl(url)) {
      return res.status(400).json({ error: 'URL must be a public website', code: 'INVALID_URL' });
    }

    // Concurrency limit — prevent resource exhaustion
    if (!acquireAuditSlot()) {
      return res.status(503).json({ error: 'Server busy. Please try again in a minute.', code: 'SERVER_BUSY' });
    }

    const normalized = normalizeUrl(url);

    // Rate limit: max 5 audits per email per week (whitelisted emails bypass)
    const whitelistEmails = (process.env.WHITELIST_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!whitelistEmails.includes(email.toLowerCase())) {
      const recentCount = countRecentAuditsByEmail(email);
      if (recentCount >= 5) {
        return res.status(429).json({
          error: 'Has alcanzado el límite de 5 auditorías por semana.',
          code: 'EMAIL_RATE_LIMIT',
        });
      }
    }

    // Cache: reuse audit if this URL was analyzed in the last 7 days
    const cachedAudit = getRecentAuditByUrl(normalized);
    if (cachedAudit) {
      releaseAuditSlot(); // cached = no actual audit running

      // Check if this email+domain combo already exists — skip creating duplicate lead
      const existingLead = findExistingLead(email, normalized);
      const cachedCode = String(crypto.randomInt(100000, 999999));

      if (existingLead) {
        // Same email + same domain = reuse existing lead, reset verification + refresh code
        resetLeadVerification(existingLead.id);
        setVerifyCode(existingLead.id, cachedCode);
        saveDatabase(DB_PATH);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache] Existing lead for ${email} + ${url} — code: ${cachedCode}`);
        } else {
          console.log(`[Cache] Existing lead for ${hashEmail(email)} + ${url}`);
        }
      } else {
        // New email for this domain — create lead to capture it
        const cachedLeadId = uuid();
        createLead(cachedLeadId, email, url);
        linkLeadToAudit(cachedLeadId, cachedAudit.id as string);
        setVerifyCode(cachedLeadId, cachedCode);
        saveDatabase(DB_PATH);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache] New lead for ${email} + ${url} — code: ${cachedCode}`);
        } else {
          console.log(`[Cache] New lead for ${hashEmail(email)} + ${url}`);
        }
        sendLeadNotification(email, url, auditLang, cachedAudit.global_score as number, cachedAudit.id as string).catch(() => {});
      }

      // Always require verification — send code
      sendVerifyCodeEmail(email, cachedCode, auditLang).catch(() => {});

      return res.status(201).json({
        auditId: cachedAudit.id,
        status: 'completed',
        message: 'Report ready (cached).',
        cached: true,
      });
    }

    // No cache — remove stale audit and run fresh
    deleteAuditByUrl(normalized);

    const leadId = uuid();
    const auditId = uuid();

    // Generate 6-digit verification code
    const verifyCode = String(crypto.randomInt(100000, 999999));

    createLead(leadId, email, url);
    createAudit(auditId, leadId, url, normalized);
    setVerifyCode(leadId, verifyCode);
    saveDatabase(DB_PATH);

    // Verification email will be sent AFTER audit completes (not before)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Verify] Audit ${auditId} — email: ${email} — code: ${verifyCode} (will send after audit completes)`);
    } else {
      console.log(`[Verify] Audit ${auditId} — email: ${hashEmail(email)} — code queued for post-audit`);
    }

    cleanupProgress();
    cleanupReportCache();
    auditProgress.set(auditId, { status: 'pending', messages: ['Audit queued'], createdAt: Date.now() });

    res.status(201).json({
      auditId,
      status: 'pending',
      message: 'Audit started. This may take 1-3 minutes.',
    });

    // Run audit in background — verification email is sent AFTER audit completes
    runAudit(auditId, url, email, verifyCode, gemini, auditLang, { vision: geminiVision, text: geminiText, mockups: geminiTranslate })
      .catch((err) => {
        console.error(`Audit ${auditId} failed:`, err);
        logError(auditId, 'audit_global', err, url);
        updateAuditStatus(auditId, 'failed');
        saveDatabase(DB_PATH);
        auditProgress.set(auditId, {
          status: 'failed',
          messages: [...(auditProgress.get(auditId)?.messages || []), `Error: ${err.message}`],
          createdAt: auditProgress.get(auditId)?.createdAt || Date.now(),
        });
      })
      .finally(() => releaseAuditSlot());
  });

  // Check audit status
  app.get('/api/v1/audit/:id', (req, res) => {
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid audit ID' });
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }

    const progress = auditProgress.get(req.params.id);
    // Filter out raw error messages from user-facing output
    const safeMessages = (progress?.messages || []).map(m => {
      if (m.includes('googleapis.com') || m.includes('Quota exceeded') || m.includes('RESOURCE_EXHAUSTED')) {
        return 'Waiting for AI service availability... (retrying automatically)';
      }
      return m;
    });
    res.json({
      auditId: audit.id,
      status: audit.status,
      messages: safeMessages,
    });
  });

  // Send verification code (re-send) — rate limited: 3/hour per audit
  app.post('/api/v1/audit/:id/send-code', sendCodeRateLimit, (req, res) => {
    const id = req.params.id as string;
    if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid audit ID' });
    const audit = getAudit(id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    const email = getLeadEmail(id);
    const newCode = String(crypto.randomInt(100000, 999999));
    const leadId = audit.lead_id as string;
    setVerifyCode(leadId, newCode);
    saveDatabase(DB_PATH);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Verify] Re-sent code for ${id} — email: ${email} — code: ${newCode}`);
    } else {
      console.log(`[Verify] Re-sent code for ${id} — ${email ? hashEmail(email) : 'unknown'}`);
    }
    // Use the audit's original language instead of hardcoded 'es'
    const auditLang = normalizeLangCode((req.body?.lang as string) || 'es');
    if (email) sendVerifyCodeEmail(email, newCode, auditLang).catch(() => {});
    res.json({ ok: true, message: 'Verification code sent to your email' });
  });

  // Verify email code — rate limited: 5 attempts per 15 min per audit
  app.post('/api/v1/audit/:id/verify', verifyRateLimit, (req, res) => {
    const id = req.params.id as string;
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required', code: 'MISSING_CODE' });
    }
    const success = verifyEmailCode(id, String(code));
    if (!success) {
      return res.status(403).json({ error: 'Invalid verification code', code: 'INVALID_CODE' });
    }
    saveDatabase(DB_PATH);
    res.json({ ok: true, verified: true });

    // Fire-and-forget: send the report email if audit is already completed.
    const siteOrigin = SITE_ORIGIN;
    const auditId = id;
    (async () => {
      const audit = getAudit(auditId);
      if (!audit || audit.status !== 'completed') return; // audit still running, will send later
      const email = getLeadEmail(auditId);
      if (!email) return;
      const lang = 'es';
      const reportUrl = `${siteOrigin}/api/v1/audit/${auditId}/report`;
      // Try to generate PDF for attachment
      let pdfBuf: Buffer | undefined;
      let pdfName: string | undefined;
      try {
        pdfBuf = getStoredPdf(auditId, lang) || undefined;
        if (!pdfBuf) {
          const html = audit.report_html as string;
          pdfBuf = await generateReportPdf(html);
          storePdf(auditId, lang, pdfBuf);
          saveDatabase(DB_PATH);
        }
        pdfName = pdfFilename(audit.url as string, lang);
      } catch (err) {
        console.warn(`[Email] PDF generation failed for report email:`, (err as Error).message);
      }
      await sendReportEmail(email, audit.url as string, audit.global_score as number, reportUrl, lang, pdfBuf, pdfName);
      await sendLeadNotification(email, audit.url as string, lang, audit.global_score as number, auditId);
    })().catch(err => console.error('[Email] Report email failed:', err));
  });

  // Check verification status
  app.get('/api/v1/audit/:id/verified', (req, res) => {
    res.json({ verified: isEmailVerified(req.params.id) });
  });

  // Get report
  app.get('/api/v1/audit/:id/report', async (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    if (audit.status !== 'completed') {
      return res.status(202).json({ error: 'Audit still in progress', code: 'AUDIT_IN_PROGRESS', status: audit.status });
    }

    const reportLang = (req.query.lang as string) || 'es';
    const verified = isEmailVerified(req.params.id);

    if (verified) {
      // Translate report on-demand if requested in a different language
      try {
        console.log(`[Report] Serving audit ${req.params.id} in lang=${reportLang} (shouldTranslate=${shouldTranslate(reportLang)})`);
        const html = await renderLocalizedReport(audit, reportLang, geminiTranslate);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } catch (err) {
        console.error(`[Report] Translation failed for lang=${reportLang}:`, (err as Error).message);
        // Fallback to original language
        res.setHeader('Content-Type', 'text/html');
        res.send(audit.report_html as string);
      }
    } else {
      const auditId = req.params.id;
      const verifyPageHtml = buildVerifyPage(auditId, audit.url as string, audit.global_score as number, reportLang);
      res.setHeader('Content-Type', 'text/html');
      res.send(verifyPageHtml);
    }
  });

  // Download report as PDF (cached in DB by auditId+lang)
  app.get('/api/v1/audit/:id/pdf', async (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    if (audit.status !== 'completed') {
      return res.status(202).json({ error: 'Audit still in progress', code: 'AUDIT_IN_PROGRESS', status: audit.status });
    }
    if (!isEmailVerified(req.params.id)) {
      return res.status(403).json({ error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' });
    }

    const lang = (req.query.lang as string) || 'es';
    const normalizedLang = normalizeLangCode(lang);
    const filename = pdfFilename(audit.url as string, normalizedLang);

    // Tier 1: persistent DB cache.
    const cached = getStoredPdf(req.params.id, normalizedLang);
    if (cached) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', cached.length);
      return res.send(cached);
    }

    // Generate fresh from the localised HTML.
    try {
      const html = await renderLocalizedReport(audit, lang, gemini);
      const pdf = await generateReportPdf(html);
      storePdf(req.params.id, normalizedLang, pdf);
      saveDatabase(DB_PATH);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdf.length);
      res.send(pdf);
    } catch (err) {
      console.error(`[PDF] Generation failed for audit ${req.params.id}/${normalizedLang}:`, err);
      res.status(500).json({ error: 'Failed to generate PDF', code: 'PDF_GENERATION_ERROR' });
    }
  });

  // Admin dashboard page
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  // /analytics now integrated in /admin — redirect
  app.get('/analytics', (_req, res) => {
    res.redirect('/admin');
  });

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // ─── Admin middleware (shared auth for all /api/v1/admin/* routes) ───
  app.use('/api/v1/admin/', (req, res, next) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.query.key !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  app.get('/api/v1/admin/leads', (_req, res) => {
    const stats = getLeadStats();
    const leads = getAllLeads(100, 'web');
    res.json({ stats, leads });
  });

  app.get('/api/v1/admin/batch/audits', (_req, res) => {
    const audits = getAllLeads(200, 'internal');
    res.json({ audits, total: audits.length });
  });

  // ─── Batch audit endpoint (admin only) ───
  const batchQueue: Array<{ url: string; email: string; lang: string; auditId: string }> = [];
  let batchRunning = false;

  async function processBatchQueue() {
    if (batchRunning) return;
    batchRunning = true;
    while (batchQueue.length > 0) {
      const item = batchQueue.shift()!;
      console.log(`[Batch] Processing ${item.url} (${batchQueue.length} remaining)`);
      try {
        if (!acquireAuditSlot()) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          batchQueue.unshift(item);
          continue;
        }
        // Audit + lead records already created in POST handler (pre-persisted).
        // Just ensure progress map is set (may have been lost on restart).
        if (!auditProgress.has(item.auditId)) {
          auditProgress.set(item.auditId, { status: 'pending', messages: ['Batch resumed'], createdAt: Date.now() });
        }

        // Run audit — pass empty verifyCode (not needed for batch), skip email sending
        await runAudit(item.auditId, item.url, item.email, '', gemini, item.lang, { vision: geminiVision, text: geminiText, mockups: geminiTranslate })
          .catch((err) => {
            console.error(`[Batch] Audit ${item.auditId} failed:`, err.message);
            logError(item.auditId, 'batch_audit', err, item.url);
            updateAuditStatus(item.auditId, 'failed');
            saveDatabase(DB_PATH);
          })
          .finally(() => releaseAuditSlot());

        // Small delay between audits to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (err) {
        console.error(`[Batch] Error processing ${item.url}:`, (err as Error).message);
      }
    }
    batchRunning = false;
    console.log('[Batch] Queue empty, done.');
  }

  app.post('/api/v1/admin/batch', (req, res) => {
    const { urls, email, lang } = req.body as { urls?: string[]; email?: string; lang?: string };
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls array is required' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (urls.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 URLs per batch' });
    }

    const auditLang = normalizeLangCode(lang || 'es');
    const jobs: Array<{ url: string; auditId: string }> = [];

    for (const rawUrl of urls) {
      if (!isValidUrl(rawUrl)) continue;
      const normalized = normalizeUrl(rawUrl);

      // Check for recent completed audit (reuse if < 7 days old).
      const existing = getRecentAuditByUrl(normalized);
      if (existing) {
        console.log(`[Batch] Reusing cached audit ${existing.id} for ${rawUrl}`);
        jobs.push({ url: rawUrl, auditId: existing.id as string });
        continue;
      }

      // Remove stale/incomplete audit for this URL to avoid UNIQUE conflict.
      deleteAuditByUrl(normalized);

      const auditId = uuid();
      try {
        const leadId = uuid();
        createBatchLead(leadId, email, rawUrl);
        createAudit(auditId, leadId, rawUrl, normalized);
        linkLeadToAudit(leadId, auditId);
        auditProgress.set(auditId, { status: 'pending', messages: ['Batch queued'], createdAt: Date.now() });
      } catch (err) {
        console.error(`[Batch] Failed to pre-create audit for ${rawUrl}:`, (err as Error).message);
        continue;
      }
      batchQueue.push({ url: rawUrl, email, lang: auditLang, auditId });
      jobs.push({ url: rawUrl, auditId });
    }

    // Persist to disk before responding (so records survive a server restart).
    saveDatabase(DB_PATH).catch((err) => {
      console.error('[Batch] saveDatabase failed:', (err as Error).message);
    });

    // Start processing in background
    processBatchQueue();

    res.json({
      ok: true,
      queued: jobs.length,
      skipped: urls.length - jobs.length,
      jobs,
      message: `${jobs.length} audits queued. They will process sequentially (~45s each).`,
    });
  });

  app.get('/api/v1/admin/batch/status', (_req, res) => {
    res.json({
      queueLength: batchQueue.length,
      running: batchRunning,
      items: batchQueue.map(i => ({ url: i.url, auditId: i.auditId })),
    });
  });

  app.post('/api/v1/admin/purge', (_req, res) => {
    purgeAllAudits();
    saveDatabase(DB_PATH);
    res.json({ ok: true, message: 'All audits, leads, and cache purged.' });
  });

  // ─── Backup endpoints (all protected by admin middleware above) ───

  app.get('/api/v1/admin/backups', (_req, res) => {
    res.json({ backups: listBackups() });
  });

  app.post('/api/v1/admin/backups/create', async (_req, res) => {
    try {
      const filename = await createBackup();
      res.json({ ok: true, filename });
    } catch (err) {
      res.status(500).json({ error: 'Backup failed', details: (err as Error).message });
    }
  });

  app.get('/api/v1/admin/backups/download', (req, res) => {
    const filename = req.query.file as string;
    if (filename) {
      if (!/^croagent-backup-[\w.-]+\.db$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid backup filename' });
      }
      const data = getBackupFile(filename);
      if (!data) return res.status(404).json({ error: 'Backup not found' });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(data);
    }
    const data = exportDatabase();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="scanboost-live-${ts}.db"`);
    res.send(data);
  });

  app.post('/api/v1/admin/backups/restore', async (req, res) => {
    const filename = req.query.file as string;
    if (!filename || !/^croagent-backup-[\w.-]+\.db$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid or missing backup filename' });
    }
    const result = await restoreFromBackup(filename);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.get('/api/v1/admin/timings', (_req, res) => {
    res.json(getTimingStats());
  });

  app.get('/api/v1/admin/errors', (_req, res) => {
    const errors = getErrorLog(100);
    const stats = getErrorStats();
    res.json({ stats, errors });
  });

  app.delete('/api/v1/admin/errors/:id', (req, res) => {
    const errorId = Number(req.params.id);
    if (!Number.isInteger(errorId) || errorId <= 0) {
      return res.status(400).json({ error: 'Invalid error ID' });
    }
    deleteError(errorId);
    saveDatabase(DB_PATH);
    res.json({ ok: true });
  });

  app.get('/api/v1/admin/analytics', (_req, res) => {
    res.json(getAnalytics());
  });

  app.post('/api/v1/admin/reset-rate-limits', (_req, res) => {
    const cleared = resetRateLimits();
    res.json({ ok: true, message: `Cleared ${cleared} rate limit buckets.` });
  });

  // Preview report with mock data (for UI/CSS testing — no DB, no verify gate).
  // Supports ?lang=fr to test translations, or falls back to Accept-Language.
  app.get('/preview', async (req, res) => {
    const lang = (req.query.lang as string) || 'es';
    const normalizedLang = normalizeLangCode(lang);
    const cacheKey = `preview|${normalizedLang}`;
    const cached = getCachedReport(cacheKey);

    let html: string;
    if (cached) {
      html = cached;
    } else {
      const mockWithPdf = { ...buildMockReportInput(), pdfUrl: `/preview/pdf?lang=${normalizedLang}` };
      try {
        html = await translateAndRender(mockWithPdf, lang, gemini);
      } catch (err) {
        console.error(`[Preview] Translation failed for lang=${lang}:`, err);
        html = generateReportHtml({ ...mockWithPdf, lang: normalizedLang });
      }
      setCachedReport(cacheKey, html);
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // Preview PDF — same mock data, regenerated each time (no cache, dev only).
  app.get('/preview/pdf', async (req, res) => {
    const lang = (req.query.lang as string) || 'es';
    try {
      const html = await translateAndRender(buildMockReportInput(), lang, gemini);
      const pdf = await generateReportPdf(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename('https://example.com', normalizeLangCode(lang))}"`);
      res.setHeader('Content-Length', pdf.length);
      res.send(pdf);
    } catch (err) {
      console.error(`[Preview PDF] Generation failed:`, err);
      res.status(500).json({ error: 'Failed to generate preview PDF', code: 'PDF_GENERATION_ERROR' });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`\n🚀 Scan&Boost running at http://localhost:${PORT}\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeBrowser();
    process.exit(0);
  });
}

async function runAudit(
  auditId: string,
  url: string,
  email: string,
  verifyCode: string,
  gemini: ReturnType<typeof createGeminiProvider>,
  lang = 'es',
  providers?: import('./services/pipeline.js').PipelineProviders,
) {
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
  saveDatabase(DB_PATH);
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
  saveDatabase(DB_PATH);

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
    saveDatabase(DB_PATH);
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
  saveDatabase(DB_PATH);

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
  saveDatabase(DB_PATH);

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
    saveDatabase(DB_PATH);
  }).catch((err) => {
    logError(auditId, 'pdf_generation', err as Error, url);
  });
}

// ─── Mock data for /preview endpoint ───
function buildMockReportInput() {
  const mkScore = (value: number) => ({
    value,
    label: (value >= 90 ? 'excellent' : value >= 70 ? 'good' : value >= 50 ? 'fair' : value >= 30 ? 'poor' : 'critical') as 'critical' | 'poor' | 'fair' | 'good' | 'excellent',
  });
  return {
    url: 'https://example.com',
    globalScore: 62,
    date: new Date().toISOString().split('T')[0],
    scores: {
      visualHierarchy: mkScore(58),
      uxHeuristics: mkScore(71),
      copyMessaging: mkScore(45),
      trustSignals: mkScore(80),
      mobileExperience: mkScore(63),
      performance: mkScore(55),
    },
    quickWins: [
      { rank: 1, title: 'CTA principal poco visible', problem: 'El boton de "Comprar ahora" se confunde con el fondo y los usuarios no lo encuentran rapido.', recommendation: 'Cambiar a color naranja contrastado, aumentar tamano un 20% y anadir microcopy "Envio gratis".', impact: 'high' as const, effort: 'low' as const, category: 'visualHierarchy' as const, priorityScore: 9 },
      { rank: 2, title: 'Falta prueba social en hero', problem: 'No hay testimonios ni numero de clientes visible above the fold.', recommendation: 'Anadir badge "+5.000 clientes confian en nosotros" debajo del CTA principal.', impact: 'high' as const, effort: 'low' as const, category: 'trustSignals' as const, priorityScore: 9 },
      { rank: 3, title: 'Formulario con demasiados campos', problem: 'El formulario de contacto pide 8 campos, lo que reduce la tasa de envio.', recommendation: 'Reducir a 3 campos esenciales: nombre, email, mensaje. Mover el resto a un segundo paso.', impact: 'medium' as const, effort: 'medium' as const, category: 'uxHeuristics' as const, priorityScore: 7 },
      { rank: 4, title: 'Headline poco claro', problem: 'El titulo principal habla de tecnologia, no de beneficios al usuario.', recommendation: 'Reescribir enfocandose en el valor: "Ahorra 3 horas al dia automatizando X".', impact: 'high' as const, effort: 'low' as const, category: 'copyMessaging' as const, priorityScore: 9 },
      { rank: 5, title: 'Imagenes sin lazy loading', problem: 'La home carga 18 imagenes a la vez, ralentizando el LCP.', recommendation: 'Anadir loading="lazy" a imagenes below the fold y usar formatos modernos (WebP).', impact: 'medium' as const, effort: 'low' as const, category: 'performance' as const, priorityScore: 8 },
      { rank: 6, title: 'Menu mobile dificil de usar', problem: 'El menu hamburguesa tiene texto muy pequeno y los enlaces estan muy juntos.', recommendation: 'Aumentar tamano de fuente a 16px y separacion vertical a minimo 12px.', impact: 'medium' as const, effort: 'low' as const, category: 'mobileExperience' as const, priorityScore: 7 },
    ],
    mockups: [
      { title: 'Hero rediseado con CTA destacado', description: 'Nueva propuesta visual del hero con CTA naranja, headline orientado a beneficios y badge de prueba social.', relatedQuickWin: 1, htmlContent: '<div style="background:linear-gradient(135deg,#070F2D,#1a2347);padding:60px 40px;border-radius:12px;text-align:center;color:white"><h1 style="font-size:36px;font-weight:800;margin-bottom:12px">Ahorra 3 horas al dia automatizando tu trabajo</h1><p style="opacity:0.7;margin-bottom:24px">Mas de 5.000 empresas ya lo hacen</p><button style="background:linear-gradient(90deg,#dd974b,#db501a);color:white;padding:16px 40px;border:none;border-radius:100px;font-size:18px;font-weight:700;cursor:pointer">Empezar gratis ahora</button><p style="font-size:12px;opacity:0.5;margin-top:12px">Sin tarjeta de credito. Cancela cuando quieras.</p></div>' },
      { title: 'Formulario simplificado', description: 'Formulario de 3 campos en vez de 8, con focus inmediato y boton ancho.', relatedQuickWin: 3, htmlContent: '<div style="background:white;padding:32px;border-radius:12px;border:1px solid #e2e4ea;max-width:400px;margin:0 auto"><h3 style="margin-bottom:20px;color:#070F2D">Contactanos</h3><input style="width:100%;padding:12px;border:1px solid #e2e4ea;border-radius:8px;margin-bottom:12px" placeholder="Nombre"><input style="width:100%;padding:12px;border:1px solid #e2e4ea;border-radius:8px;margin-bottom:12px" placeholder="Email"><textarea style="width:100%;padding:12px;border:1px solid #e2e4ea;border-radius:8px;margin-bottom:12px" placeholder="Mensaje" rows="3"></textarea><button style="width:100%;background:#EC5F29;color:white;padding:14px;border:none;border-radius:8px;font-weight:700">Enviar</button></div>' },
    ],
    analyses: (['visualHierarchy','uxHeuristics','copyMessaging','trustSignals','mobileExperience','performance'] as const).map((cat) => ({
      agentName: `Mock ${cat} agent`,
      category: cat,
      score: mkScore(60),
      executionTimeMs: 1234,
      findings: [
        { title: 'Hallazgo de ejemplo', description: 'Esta es una descripcion mock para previsualizar el informe sin necesidad de correr una auditoria real.', severity: 'warning' as const, recommendation: 'Recomendacion mock para probar el layout del informe.' },
        { title: 'Otro hallazgo', description: 'Segundo hallazgo de ejemplo con texto mas largo para verificar como se ve el informe con contenido realista. Lorem ipsum dolor sit amet consectetur adipiscing elit.', severity: 'info' as const, recommendation: 'Aplicar buenas practicas estandar.' },
      ],
    })),
  };
}

// ─── Verify page i18n ───
const VERIFY_STRINGS: Record<string, { title: string; ready: string; subtitle: string; unlock: string; error: string; openEmail: string; noCode: string; resend: string; resent: string }> = {
  es: { title: 'Verificar Email', ready: '¡Tu informe esta listo!', subtitle: 'Introduce el codigo de 6 digitos que te hemos enviado por email para desbloquear tu informe.', unlock: 'Desbloquear informe', error: 'Codigo incorrecto. Intentalo de nuevo.', openEmail: 'Abrir email', noCode: '¿No lo recibes?', resend: 'Reenviar codigo', resent: '¡Codigo reenviado!' },
  en: { title: 'Verify Email', ready: 'Your report is ready!', subtitle: 'Enter the 6-digit code we sent to your email to unlock your report.', unlock: 'Unlock report', error: 'Incorrect code. Try again.', openEmail: 'Open email', noCode: "Didn't receive it?", resend: 'Resend code', resent: 'Code resent!' },
  fr: { title: 'Verifier Email', ready: 'Votre rapport est pret !', subtitle: 'Entrez le code a 6 chiffres que nous avons envoye a votre email pour debloquer votre rapport.', unlock: 'Debloquer le rapport', error: 'Code incorrect. Reessayez.', openEmail: 'Ouvrir email', noCode: 'Pas recu ?', resend: 'Renvoyer le code', resent: 'Code renvoye !' },
  de: { title: 'E-Mail bestatigen', ready: 'Ihr Bericht ist fertig!', subtitle: 'Geben Sie den 6-stelligen Code ein, den wir an Ihre E-Mail gesendet haben, um Ihren Bericht freizuschalten.', unlock: 'Bericht freischalten', error: 'Falscher Code. Versuchen Sie es erneut.', openEmail: 'E-Mail offnen', noCode: 'Nicht erhalten?', resend: 'Code erneut senden', resent: 'Code gesendet!' },
  it: { title: 'Verifica Email', ready: 'Il tuo report e pronto!', subtitle: 'Inserisci il codice a 6 cifre che ti abbiamo inviato per email per sbloccare il tuo report.', unlock: 'Sblocca report', error: 'Codice errato. Riprova.', openEmail: 'Apri email', noCode: 'Non lo ricevi?', resend: 'Reinvia codice', resent: 'Codice reinviato!' },
  pt: { title: 'Verificar Email', ready: 'Seu relatorio esta pronto!', subtitle: 'Insira o codigo de 6 digitos que enviamos para seu email para desbloquear seu relatorio.', unlock: 'Desbloquear relatorio', error: 'Codigo incorreto. Tente novamente.', openEmail: 'Abrir email', noCode: 'Nao recebeu?', resend: 'Reenviar codigo', resent: 'Codigo reenviado!' },
};

function buildVerifyPage(auditId: string, url: string, score: number | null, lang = 'es'): string {
  const s = VERIFY_STRINGS[normalizeLangCode(lang)] || VERIFY_STRINGS.en;
  const scoreDisplay = score !== null ? `<div style="margin-top:16px"><span style="font-size:48px;font-weight:800;color:#EC5F29">${score}</span><span style="font-size:18px;color:#9ca3af">/100</span></div>` : '';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(s.title)} — Scan&amp;Boost</title>
  <link rel="icon" type="image/png" href="/favicon-boost.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Open Sans', -apple-system, sans-serif; background: #f8f9fb; color: #46495C; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    h1, h2 { font-family: 'Plus Jakarta Sans', sans-serif; }
    .verify-card { background: white; border-radius: 20px; padding: 40px 32px; box-shadow: 0 4px 24px rgba(7,15,45,0.10); max-width: 440px; width: 100%; text-align: center; }
    .logo { margin-bottom: 16px; }
    .url { font-size: 13px; color: #9ca3af; word-break: break-all; margin-top: 8px; }
    .subtitle { font-size: 15px; color: #46495C; margin: 20px 0 24px; line-height: 1.5; }
    .code-input { width: 200px; padding: 14px; border: 2px solid #e2e4ea; border-radius: 12px; font-size: 28px; text-align: center; letter-spacing: 8px; font-weight: 800; color: #070F2D; outline: none; font-family: 'Plus Jakarta Sans', monospace; }
    .code-input:focus { border-color: #EC5F29; box-shadow: 0 0 0 3px rgba(236,95,41,0.12); }
    .code-input::placeholder { color: #d1d5db; letter-spacing: 4px; font-weight: 400; }
    .submit-btn { display: block; width: 100%; max-width: 200px; margin: 20px auto 0; padding: 14px; background: linear-gradient(90deg, #dd974b, #db501a); color: white; border: none; border-radius: 100px; font-size: 16px; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif; cursor: pointer; transition: transform 0.15s, box-shadow 0.2s; }
    .submit-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(219,80,26,0.35); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .error { color: #dc2626; font-size: 13px; margin-top: 12px; display: none; }
    .resend { margin-top: 16px; font-size: 13px; color: #9ca3af; }
    .resend a { color: #EC5F29; cursor: pointer; text-decoration: underline; }
    .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="verify-card">
    <h1 style="font-size:28px;color:#070F2D;margin-bottom:4px">Scan&amp;<span style="color:#EC5F29">Boost</span></h1>
    <p style="font-size:16px;color:#070F2D;font-weight:600;margin-top:12px">${escapeHtml(s.ready)}</p>
    <p class="url">${escapeHtml(url)}</p>
    ${scoreDisplay}
    <p class="subtitle">${escapeHtml(s.subtitle)}</p>
    <input type="text" id="codeInput" class="code-input" maxlength="6" placeholder="------" autocomplete="off" inputmode="numeric" autofocus>
    <button id="verifyBtn" class="submit-btn" onclick="verify()" data-label="${escapeHtml(s.unlock)}">${escapeHtml(s.unlock)}</button>
    <div class="error" id="errorMsg">${escapeHtml(s.error)}</div>
    <div style="margin-top:16px;text-align:center">
      <a href="https://mail.google.com" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#f3f4f6;border-radius:8px;color:#46495C;text-decoration:none;font-size:13px;font-weight:600;transition:background 0.2s" onmouseover="this.style.background='#e2e4ea'" onmouseout="this.style.background='#f3f4f6'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        ${escapeHtml(s.openEmail)}
      </a>
    </div>
    <div class="resend">${escapeHtml(s.noCode)} <a onclick="resend()">${escapeHtml(s.resend)}</a></div>
    <div class="resend" id="resentMsg" style="display:none;color:#22c55e">${escapeHtml(s.resent)}</div>
  </div>
  <div class="footer">Scan&amp;Boost &middot; Powered by <strong style="color:#070F2D">Boost</strong></div>
  <script>
    var auditId = '${auditId.replace(/[^a-f0-9-]/g, '')}';
    function verify() {
      var code = document.getElementById('codeInput').value.trim();
      if (code.length !== 6) return;
      var btn = document.getElementById('verifyBtn');
      btn.disabled = true; btn.textContent = '...';
      document.getElementById('errorMsg').style.display = 'none';
      fetch('/api/v1/audit/' + auditId + '/verify', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code: code})
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.verified) { window.location.href = window.location.pathname + '?lang=' + '${lang}'; }
        else {
          document.getElementById('errorMsg').style.display = 'block';
          btn.disabled = false; btn.textContent = document.getElementById('verifyBtn').dataset.label;
        }
      }).catch(function() {
        btn.disabled = false; btn.textContent = document.getElementById('verifyBtn').dataset.label;
      });
    }
    function resend() {
      fetch('/api/v1/audit/' + auditId + '/send-code', {method:'POST'});
      document.getElementById('resentMsg').style.display = 'block';
      setTimeout(function() { document.getElementById('resentMsg').style.display = 'none'; }, 3000);
    }
    document.getElementById('codeInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') verify();
    });
  </script>
</body>
</html>`;
}

main().catch(console.error);
