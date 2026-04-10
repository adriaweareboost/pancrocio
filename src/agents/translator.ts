// Translator agent — translates report data and UI labels via Groq.
// Strategy: translate data fields (quickwins, mockups, findings) and a fixed
// UI strings map in batched LLM calls. We DO NOT translate raw HTML to avoid
// breaking tags or attributes.

import type { LLMProvider, QuickWin, Mockup, AgentAnalysis } from '../models/interfaces.js';
import type { ReportUiStrings } from '../services/report-generator.js';
import type { VerifyGateStrings } from '../services/verify-gate.js';

export interface TranslatableReportData {
  quickWins: QuickWin[];
  mockups: Mockup[];
  analyses: AgentAnalysis[];
}

const SPANISH_LANG_CODES = new Set(['es', 'spa']);

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ca: 'Catalan',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ru: 'Russian',
  ar: 'Arabic',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  tr: 'Turkish',
  el: 'Greek',
  uk: 'Ukrainian',
};

/** Extract the primary language code from an HTTP Accept-Language header. */
export function parseAcceptLanguage(header: string | undefined | null): string {
  if (!header) return 'es';
  const first = header.split(',')[0]?.trim().split(';')[0]?.trim();
  return first || 'es';
}

/** Returns true if the target language is different from Spanish. */
export function shouldTranslate(langCode: string): boolean {
  const lc = (langCode || '').toLowerCase().split(/[-_]/)[0];
  return lc.length > 0 && !SPANISH_LANG_CODES.has(lc);
}

/** Returns the canonical short language code (e.g. "fr-FR" → "fr"). */
export function normalizeLangCode(langCode: string): string {
  return (langCode || 'es').toLowerCase().split(/[-_]/)[0] || 'es';
}

function languageName(langCode: string): string {
  const lc = normalizeLangCode(langCode);
  return LANGUAGE_NAMES[lc] || langCode;
}

interface BatchResponse {
  translations: string[];
}

/**
 * Translates an array of strings into the target language via Groq JSON mode.
 * Returns the original array if the LLM response is malformed.
 */
const CHUNK_SIZE = 15; // max strings per LLM call to avoid truncation

/**
 * Translates a single chunk of strings. The source language is auto-detected
 * by the LLM (handles English findings being translated to Spanish, etc.).
 */
async function translateChunk(
  strings: string[],
  targetLang: string,
  llm: LLMProvider,
): Promise<string[]> {
  const targetName = languageName(targetLang);
  const prompt = `You are a professional translator. Translate ALL of the following strings to ${targetName}. The source language may vary (English, Spanish, or other) — auto-detect it.

CRITICAL RULES:
- Return a JSON object with key "translations" containing an array of strings.
- The output array MUST have EXACTLY ${strings.length} items, in the SAME ORDER as the input.
- If a string is ALREADY in ${targetName}, return it unchanged.
- Some strings may contain HTML markup. Translate ONLY the visible text content; preserve ALL HTML tags, attributes, inline styles, class names, IDs, and the exact tag structure unchanged.
- Preserve numbers, emojis, URLs, currency symbols, and these brand names as-is: PanCROcio, Boost, CRO, CTA, LCP, WebP.
- Keep the tone professional but friendly, suitable for a marketing audit report.
- Do not add explanations, do not wrap output in markdown code blocks.

Input (JSON array of ${strings.length} strings):
${JSON.stringify(strings)}`;

  try {
    const response = await llm.generateJSON<BatchResponse>(prompt);
    const translated = response?.translations;
    if (!Array.isArray(translated) || translated.length !== strings.length) {
      console.warn(
        `[Translator] Malformed response for lang=${targetLang}. Expected ${strings.length} items, got ${Array.isArray(translated) ? translated.length : typeof translated}. Returning originals.`,
      );
      return strings;
    }
    return translated.map((s, i) => (typeof s === 'string' ? s : strings[i]));
  } catch (err) {
    console.warn(`[Translator] Failed for lang=${targetLang}:`, (err as Error).message);
    return strings;
  }
}

/**
 * Translates an array of strings, splitting into chunks to avoid
 * LLM truncation on large batches.
 */
async function translateStrings(
  strings: string[],
  targetLang: string,
  llm: LLMProvider,
): Promise<string[]> {
  if (strings.length === 0) return strings;
  if (strings.length <= CHUNK_SIZE) return translateChunk(strings, targetLang, llm);

  // Split into chunks and translate sequentially (to respect rate limits)
  const result: string[] = [];
  for (let i = 0; i < strings.length; i += CHUNK_SIZE) {
    const chunk = strings.slice(i, i + CHUNK_SIZE);
    const translated = await translateChunk(chunk, targetLang, llm);
    result.push(...translated);
  }
  return result;
}

/**
 * Translates report data fields (quickwins, mockups, findings).
 * Pass `force: true` to translate even when targetLang is Spanish
 * (used to translate English LLM outputs to Spanish after pipeline).
 */
export async function translateReportData(
  data: TranslatableReportData,
  targetLang: string,
  llm: LLMProvider,
  force = false,
): Promise<TranslatableReportData> {
  if (!force && !shouldTranslate(targetLang)) return data;

  // Flatten all translatable strings into a single array, remembering positions.
  const strings: string[] = [];
  const push = (s: string): number => {
    strings.push(s);
    return strings.length - 1;
  };

  const qwIdx = data.quickWins.map((qw) => ({
    title: push(qw.title),
    problem: push(qw.problem),
    recommendation: push(qw.recommendation),
  }));

  const mockupIdx = data.mockups.map((m) => ({
    title: push(m.title),
    description: push(m.description),
    htmlContent: push(m.htmlContent),
  }));

  const analysisIdx = data.analyses.map((a) => ({
    findings: a.findings.map((f) => ({
      title: push(f.title),
      description: push(f.description),
      recommendation: push(f.recommendation),
    })),
  }));

  const translated = await translateStrings(strings, targetLang, llm);

  return {
    quickWins: data.quickWins.map((qw, i) => ({
      ...qw,
      title: translated[qwIdx[i].title],
      problem: translated[qwIdx[i].problem],
      recommendation: translated[qwIdx[i].recommendation],
    })),
    mockups: data.mockups.map((m, i) => ({
      ...m,
      title: translated[mockupIdx[i].title],
      description: translated[mockupIdx[i].description],
      htmlContent: translated[mockupIdx[i].htmlContent],
    })),
    analyses: data.analyses.map((a, i) => ({
      ...a,
      findings: a.findings.map((f, j) => ({
        ...f,
        title: translated[analysisIdx[i].findings[j].title],
        description: translated[analysisIdx[i].findings[j].description],
        recommendation: translated[analysisIdx[i].findings[j].recommendation],
      })),
    })),
  };
}

/** Translates the values of a flat string map, preserving the key set. */
async function translateFlatMap(
  obj: Record<string, string>,
  targetLang: string,
  llm: LLMProvider,
): Promise<Record<string, string>> {
  if (!shouldTranslate(targetLang)) return obj;
  const keys = Object.keys(obj);
  const values = keys.map((k) => obj[k]);
  const translated = await translateStrings(values, targetLang, llm);
  const result: Record<string, string> = { ...obj };
  keys.forEach((k, i) => {
    result[k] = translated[i];
  });
  return result;
}

/** Translates the report UI labels (titles, button text, etc.). */
export async function translateUiStrings(
  ui: ReportUiStrings,
  targetLang: string,
  llm: LLMProvider,
): Promise<ReportUiStrings> {
  const out = await translateFlatMap(ui as unknown as Record<string, string>, targetLang, llm);
  return out as unknown as ReportUiStrings;
}

/** Translates the verify-gate UI labels. */
export async function translateVerifyStrings(
  strings: VerifyGateStrings,
  targetLang: string,
  llm: LLMProvider,
): Promise<VerifyGateStrings> {
  const out = await translateFlatMap(strings as unknown as Record<string, string>, targetLang, llm);
  return out as unknown as VerifyGateStrings;
}
