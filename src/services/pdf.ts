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
/* PDF print overrides — flow content naturally, avoid large blank spaces */
@page { size: A4; margin: 14mm 12mm 16mm 12mm; }
html, body { background: white !important; font-size: 13px !important; }

/* Hide interactive elements */
.sidebar-lead, .mobile-bubble, .mobile-lead-popup, .mobile-overlay,
.contact-bottom, #contactSection, .pdf-download-btn { display: none !important; }

/* Full-width layout */
.page-wrapper { display: block !important; max-width: 100% !important; padding: 0 !important; }
.report-main { max-width: 100% !important; flex: none !important; }

/* Preserve colors in print */
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

/* Allow sections to break across pages — only protect small blocks */
.report-main > div { page-break-inside: auto !important; break-inside: auto !important; }

/* Protect individual items from splitting (findings, quickwins, mockups) */
.report-main > div > div,
.report-main > div > section > div,
figure { page-break-inside: avoid; break-inside: avoid; margin-bottom: 8px; }

/* Keep headings attached to their content */
h1, h2, h3 { page-break-after: avoid; break-after: avoid; }

/* Header stays compact */
.report-header { page-break-after: avoid; padding: 20px 24px 28px !important; }

/* Tighten spacing for print density */
.report-main > div { margin-bottom: 12px !important; padding: 20px !important; border-radius: 12px !important; }
blockquote { margin-top: 12px !important; padding: 12px 16px !important; }

/* Score gauge smaller for print */
.score-gauge { width: 120px !important; height: 120px !important; }
.score-gauge-number { font-size: 30px !important; }

/* Category bars tighter */
.category-bar-link { margin-bottom: 8px !important; padding: 4px 6px !important; }

/* Mockup wireframes: allow page break but keep each mockup together */
figure { max-height: 500px; overflow: hidden; }
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
      margin: { top: '14mm', right: '12mm', bottom: '22mm', left: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;color:#9ca3af;padding:0 12mm;">
          <span>Powered by</span>
          <a href="https://www.weareboost.online" style="color:#070F2D;font-weight:700;text-decoration:none;">Boost</a>
          <span style="color:#e2e4ea;">|</span>
          <a href="https://www.weareboost.online" style="color:#EC5F29;text-decoration:none;font-weight:600;">weareboost.online</a>
          <span style="color:#e2e4ea;">|</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
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
  return `scanboost-${slug || 'report'}-${lang}.pdf`;
}
