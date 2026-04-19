import { Router } from 'express';
import type { LLMProvider } from '../models/interfaces.js';
import { normalizeLangCode } from '../agents/translator.js';
import { generateReportHtml } from '../services/report-generator.js';
import { generateReportPdf, pdfFilename } from '../services/pdf.js';
import { getCachedReport, setCachedReport, translateAndRender } from '../services/report-cache.js';
import { buildMockReportInput } from '../services/landing.js';

export interface PreviewRouterDeps {
  gemini: LLMProvider;
}

export function createPreviewRouter(deps: PreviewRouterDeps): Router {
  const router = Router();
  const { gemini } = deps;

  // Preview report with mock data (for UI/CSS testing)
  router.get('/', async (req, res) => {
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

  // Preview PDF
  router.get('/pdf', async (req, res) => {
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

  return router;
}
