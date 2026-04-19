import type { LLMProvider, AgentAnalysis, QuickWin, Mockup, CategoryScores } from '../models/interfaces.js';
import { generateReportHtml, DEFAULT_UI_STRINGS } from './report-generator.js';
import { shouldTranslate, normalizeLangCode, translateReportData, translateUiStrings } from '../agents/translator.js';
import { getStoredTranslation, storeTranslation, saveDatabase } from './database.js';

// ─── In-memory caches ───

const REPORT_CACHE_TTL_MS = 60 * 60 * 1000;
const reportCache = new Map<string, { html: string; createdAt: number }>();

const uiStringsCache = new Map<string, typeof DEFAULT_UI_STRINGS>();

export function getCachedReport(key: string): string | null {
  const entry = reportCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > REPORT_CACHE_TTL_MS) {
    reportCache.delete(key);
    return null;
  }
  return entry.html;
}

export function setCachedReport(key: string, html: string): void {
  reportCache.set(key, { html, createdAt: Date.now() });
}

export function cleanupReportCache(): void {
  const now = Date.now();
  for (const [key, entry] of reportCache) {
    if (now - entry.createdAt > REPORT_CACHE_TTL_MS) reportCache.delete(key);
  }
}

export async function getCachedUiStrings(lang: string, llm: LLMProvider): Promise<typeof DEFAULT_UI_STRINGS> {
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

// ─── Report rendering types and helpers ───

export interface ReportRenderInput {
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
export async function translateAndRender(
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
export async function renderLocalizedReport(
  audit: Record<string, unknown>,
  lang: string,
  llm: LLMProvider,
  dbPath: string,
): Promise<string> {
  const auditId = audit.id as string;
  const normalizedLang = normalizeLangCode(lang);
  const cacheKey = `${auditId}|${normalizedLang}`;

  // Tier 1: in-memory cache (fastest).
  const memCached = getCachedReport(cacheKey);
  if (memCached) return memCached;

  // Spanish (or unknown lang) -> serve the pre-rendered HTML stored in DB.
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
  saveDatabase(dbPath);
  return html;
}
