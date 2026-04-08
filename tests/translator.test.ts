import { describe, it, expect, vi } from 'vitest';
import {
  parseAcceptLanguage,
  shouldTranslate,
  normalizeLangCode,
  translateReportData,
  translateUiStrings,
  translateVerifyStrings,
} from '../src/agents/translator.js';
import type { LLMProvider, QuickWin, Mockup, AgentAnalysis } from '../src/models/interfaces.js';
import { DEFAULT_UI_STRINGS } from '../src/services/report-generator.js';
import { DEFAULT_VERIFY_STRINGS } from '../src/services/verify-gate.js';

// ─── Mock LLM Provider ───────────────────────────────────────────

/**
 * Builds a mock LLMProvider whose `generateJSON` returns each input string
 * prefixed with `[lang] `, simulating a translation. Useful for asserting
 * that the translator wires inputs/outputs correctly without hitting Groq.
 */
function buildMockLlm(prefix: string): LLMProvider {
  return {
    name: 'mock',
    generateText: vi.fn(async () => 'unused'),
    generateWithImage: vi.fn(async () => 'unused'),
    generateJSON: vi.fn(async (prompt: string) => {
      // Extract the JSON array of strings from the prompt (last line).
      const match = prompt.match(/\[.*\]\s*$/s);
      if (!match) return { translations: [] };
      const inputStrings = JSON.parse(match[0]) as string[];
      return { translations: inputStrings.map((s) => `${prefix}${s}`) };
    }),
  };
}

/** Mock LLM that returns a malformed response (wrong length). */
function buildBrokenLlm(): LLMProvider {
  return {
    name: 'broken',
    generateText: vi.fn(async () => 'unused'),
    generateWithImage: vi.fn(async () => 'unused'),
    generateJSON: vi.fn(async () => ({ translations: ['only one item'] })),
  };
}

// ─── parseAcceptLanguage ─────────────────────────────────────────

describe('parseAcceptLanguage', () => {
  it('returns "es" for empty header', () => {
    expect(parseAcceptLanguage(undefined)).toBe('es');
    expect(parseAcceptLanguage(null)).toBe('es');
    expect(parseAcceptLanguage('')).toBe('es');
  });

  it('extracts the first language from a single-value header', () => {
    expect(parseAcceptLanguage('fr')).toBe('fr');
    expect(parseAcceptLanguage('en-US')).toBe('en-US');
  });

  it('extracts the first language from a multi-value header', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr-FR');
    expect(parseAcceptLanguage('de-DE,de;q=0.9,en-US;q=0.7,en;q=0.6')).toBe('de-DE');
  });

  it('strips quality parameters', () => {
    expect(parseAcceptLanguage('en;q=0.9')).toBe('en');
  });
});

// ─── shouldTranslate ─────────────────────────────────────────────

describe('shouldTranslate', () => {
  it('returns false for Spanish variants', () => {
    expect(shouldTranslate('es')).toBe(false);
    expect(shouldTranslate('es-ES')).toBe(false);
    expect(shouldTranslate('es-MX')).toBe(false);
    expect(shouldTranslate('ES')).toBe(false);
    expect(shouldTranslate('spa')).toBe(false);
  });

  it('returns true for non-Spanish languages', () => {
    expect(shouldTranslate('en')).toBe(true);
    expect(shouldTranslate('fr-FR')).toBe(true);
    expect(shouldTranslate('de')).toBe(true);
    expect(shouldTranslate('ja')).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(shouldTranslate('')).toBe(false);
  });
});

// ─── normalizeLangCode ───────────────────────────────────────────

describe('normalizeLangCode', () => {
  it('returns lowercase short code', () => {
    expect(normalizeLangCode('en-US')).toBe('en');
    expect(normalizeLangCode('FR-FR')).toBe('fr');
    expect(normalizeLangCode('de_DE')).toBe('de');
    expect(normalizeLangCode('JA')).toBe('ja');
  });

  it('falls back to "es" for empty input', () => {
    expect(normalizeLangCode('')).toBe('es');
  });
});

// ─── translateReportData ─────────────────────────────────────────

describe('translateReportData', () => {
  const sampleQuickWin: QuickWin = {
    rank: 1,
    title: 'Mejorar CTA',
    problem: 'No es visible',
    recommendation: 'Cambiar color',
    impact: 'high',
    effort: 'low',
    category: 'visualHierarchy',
    priorityScore: 9,
  };

  const sampleMockup: Mockup = {
    title: 'Hero rediseado',
    description: 'Nueva propuesta',
    htmlContent: '<div>Hola</div>',
    relatedQuickWin: 1,
  };

  const sampleAnalysis: AgentAnalysis = {
    agentName: 'agent',
    category: 'visualHierarchy',
    score: { value: 70, label: 'good' },
    executionTimeMs: 100,
    findings: [
      {
        title: 'Hallazgo',
        description: 'Descripcion',
        severity: 'warning',
        recommendation: 'Recomendacion',
      },
    ],
  };

  it('returns input unchanged when target lang is Spanish', async () => {
    const llm = buildMockLlm('[FR] ');
    const data = { quickWins: [sampleQuickWin], mockups: [sampleMockup], analyses: [sampleAnalysis] };
    const result = await translateReportData(data, 'es', llm);
    expect(result).toEqual(data);
    expect(llm.generateJSON).not.toHaveBeenCalled();
  });

  it('translates all data fields when target lang is non-Spanish', async () => {
    const llm = buildMockLlm('[FR] ');
    const data = { quickWins: [sampleQuickWin], mockups: [sampleMockup], analyses: [sampleAnalysis] };
    const result = await translateReportData(data, 'fr', llm);

    expect(result.quickWins[0].title).toBe('[FR] Mejorar CTA');
    expect(result.quickWins[0].problem).toBe('[FR] No es visible');
    expect(result.quickWins[0].recommendation).toBe('[FR] Cambiar color');
    // Non-translated fields preserved
    expect(result.quickWins[0].rank).toBe(1);
    expect(result.quickWins[0].impact).toBe('high');

    expect(result.mockups[0].title).toBe('[FR] Hero rediseado');
    expect(result.mockups[0].description).toBe('[FR] Nueva propuesta');
    expect(result.mockups[0].htmlContent).toBe('[FR] <div>Hola</div>');
    expect(result.mockups[0].relatedQuickWin).toBe(1);

    expect(result.analyses[0].findings[0].title).toBe('[FR] Hallazgo');
    expect(result.analyses[0].findings[0].description).toBe('[FR] Descripcion');
    expect(result.analyses[0].findings[0].recommendation).toBe('[FR] Recomendacion');
  });

  it('returns originals when LLM responds with malformed payload', async () => {
    const llm = buildBrokenLlm();
    const data = { quickWins: [sampleQuickWin], mockups: [sampleMockup], analyses: [sampleAnalysis] };
    const result = await translateReportData(data, 'fr', llm);
    // Should fall back to originals
    expect(result.quickWins[0].title).toBe('Mejorar CTA');
  });

  it('handles empty data without calling LLM', async () => {
    const llm = buildMockLlm('[FR] ');
    const result = await translateReportData({ quickWins: [], mockups: [], analyses: [] }, 'fr', llm);
    expect(result.quickWins).toEqual([]);
    // translateStrings short-circuits when array is empty
    expect(llm.generateJSON).not.toHaveBeenCalled();
  });
});

// ─── translateUiStrings ──────────────────────────────────────────

describe('translateUiStrings', () => {
  it('returns same object reference for Spanish', async () => {
    const llm = buildMockLlm('[FR] ');
    const result = await translateUiStrings(DEFAULT_UI_STRINGS, 'es', llm);
    expect(result).toBe(DEFAULT_UI_STRINGS);
  });

  it('translates every key for non-Spanish target', async () => {
    const llm = buildMockLlm('[FR] ');
    const result = await translateUiStrings(DEFAULT_UI_STRINGS, 'fr', llm);
    expect(result.scoresByCategoryTitle).toBe('[FR] ' + DEFAULT_UI_STRINGS.scoresByCategoryTitle);
    expect(result.topQuickWinsTitle).toBe('[FR] ' + DEFAULT_UI_STRINGS.topQuickWinsTitle);
    expect(result.formSubmitMain).toBe('[FR] ' + DEFAULT_UI_STRINGS.formSubmitMain);
    // Same number of keys preserved
    expect(Object.keys(result).length).toBe(Object.keys(DEFAULT_UI_STRINGS).length);
  });
});

// ─── translateVerifyStrings ──────────────────────────────────────

describe('translateVerifyStrings', () => {
  it('returns same object reference for Spanish', async () => {
    const llm = buildMockLlm('[FR] ');
    const result = await translateVerifyStrings(DEFAULT_VERIFY_STRINGS, 'es', llm);
    expect(result).toBe(DEFAULT_VERIFY_STRINGS);
  });

  it('translates verify-gate labels', async () => {
    const llm = buildMockLlm('[FR] ');
    const result = await translateVerifyStrings(DEFAULT_VERIFY_STRINGS, 'fr', llm);
    expect(result.unlockButton).toBe('[FR] ' + DEFAULT_VERIFY_STRINGS.unlockButton);
    expect(result.verifyingButton).toBe('[FR] ' + DEFAULT_VERIFY_STRINGS.verifyingButton);
    expect(result.errorMessage).toBe('[FR] ' + DEFAULT_VERIFY_STRINGS.errorMessage);
  });
});
