// PDF generator — renders the report HTML to a print-ready PDF using
// the same Playwright instance that scrapes audited sites. The HTML is
// expected to be the output of generateReportHtml(): we strip the
// external <link rel="stylesheet"> and <script> refs and inline the
// CSS so the page renders correctly without an HTTP server.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Browser } from 'playwright';
import { getBrowser } from './scraper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_CSS_PATH = join(__dirname, '..', '..', 'public', 'report.css');

let cachedReportCss: string | null = null;
function getReportCss(): string {
  if (cachedReportCss === null) {
    cachedReportCss = readFileSync(REPORT_CSS_PATH, 'utf-8');
  }
  return cachedReportCss;
}

/** PDF-only overrides applied on top of report.css */
const PDF_OVERRIDES = `
/* PDF print overrides */
@page { size: A4; margin: 18mm 14mm; }
html, body { background: white !important; }
.sidebar-lead, .mobile-bubble, .mobile-lead-popup, .mobile-overlay,
.contact-bottom, #contactSection, .pdf-download-btn { display: none !important; }
.page-wrapper { display: block !important; max-width: 100% !important; padding: 0 !important; }
.report-main { max-width: 100% !important; flex: none !important; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.report-main > div, article, section, figure { page-break-inside: avoid; break-inside: avoid; }
h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
.report-header { page-break-after: avoid; }
`;

/**
 * Renders the given report HTML into a PDF buffer.
 *
 * @param html  HTML produced by generateReportHtml() (still has external CSS/JS refs)
 * @returns     PDF binary buffer ready to send as application/pdf
 */
export async function generateReportPdf(html: string): Promise<Buffer> {
  const browser: Browser = await getBrowser();

  // Inline the report.css and strip the external refs.
  const reportCss = getReportCss();
  const standaloneHtml = html
    .replace(
      /<link[^>]*href="\/report\.css[^"]*"[^>]*>/g,
      `<style>${reportCss}\n${PDF_OVERRIDES}</style>`,
    )
    .replace(/<script[^>]*src="\/report\.js[^"]*"[^>]*><\/script>/g, '');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 1800 },
  });
  const page = await context.newPage();
  try {
    await page.setContent(standaloneHtml, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for fonts to settle.
    await page.evaluate(() => (document as Document).fonts?.ready).catch(() => {});
    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    return Buffer.from(pdfData);
  } finally {
    await context.close();
  }
}

/** Sanitises a URL into a filesystem-safe filename slug. */
export function pdfFilename(url: string, lang: string): string {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch { /* ignore */ }
  const slug = host.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `pancrocio-${slug || 'report'}-${lang}.pdf`;
}
