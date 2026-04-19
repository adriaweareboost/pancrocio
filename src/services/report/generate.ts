/**
 * Main report HTML generator — assembles all sections into a full HTML document.
 */

import type { CategoryScores } from '../../models/interfaces.js';
import { escapeHtml, escapeJsString } from '../../utils/html.js';
import { CATEGORY_LABELS } from '../../utils/constants.js';
import type { ReportInput } from './types.js';
import { OG_LOCALES } from './types.js';
import { DEFAULT_UI_STRINGS, categoryLabel, normalizeShortLang } from './i18n.js';
import { BRAND_SVG } from './brand-svg.js';
import {
  ASSET_VERSION,
  scoreColor as _scoreColor,
  scoreEmoji,
  renderScoreGauge,
  renderCategoryBar,
  brandComment,
} from './helpers.js';
import {
  renderSidebar,
  renderMobilePopup,
  renderContactCta,
  renderQuickWinCards,
  renderDetailSections,
  renderMockups,
} from './sections.js';

export function generateReportHtml(input: ReportInput): string {
  const { globalScore, scores, quickWins, mockups, analyses, date } = input;
  const ui = input.uiStrings || DEFAULT_UI_STRINGS;
  const url = escapeHtml(input.url);
  const urlJs = escapeJsString(input.url);
  const lang = normalizeShortLang(input.lang);
  const ogLocale = OG_LOCALES[lang] || 'es_ES';
  const safeDate = escapeHtml(date);
  // SEO meta strings — kept short to fit Google/OG limits.
  const seoTitle = `Scan&Boost \u2014 ${ui.reportSubtitle} \u2014 ${url} (${globalScore}/100)`;
  const seoDescription = `${ui.reportSubtitle} \u2014 ${url}. ${globalScore}/100 puntos. ${quickWins.length} quick wins, ${mockups.length} mockups, ${analyses.length} categor\u00edas analizadas.`;
  // Site origin: prefer explicit input, fall back to SITE_ORIGIN env var, default to weareboost.
  // Defensive: strip trailing slash and prepend https:// if the user forgot the protocol.
  const rawOrigin = (input.siteOrigin || process.env.SITE_ORIGIN || 'https://www.weareboost.online').replace(/\/$/, '');
  const siteOrigin = /^https?:\/\//.test(rawOrigin) ? rawOrigin : `https://${rawOrigin}`;
  const canonicalUrl = `${siteOrigin}/report?u=${encodeURIComponent(input.url)}`;
  const ogImage = `${siteOrigin}/og-image.png`;

  // JSON-LD structured data — schema.org Report. Wrapped in escapeHtml-safe JSON.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Report',
    name: `Scan&Boost \u2014 ${ui.reportSubtitle} \u2014 ${input.url}`,
    headline: `${ui.reportSubtitle} \u2014 ${input.url}`,
    description: seoDescription,
    inLanguage: lang,
    datePublished: date,
    dateCreated: date,
    url: canonicalUrl,
    author: { '@type': 'Organization', name: 'Scan&Boost', url: siteOrigin },
    publisher: { '@type': 'Organization', name: 'Boost', url: 'https://www.weareboost.online' },
    about: { '@type': 'WebSite', url: input.url },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: globalScore,
      bestRating: 100,
      worstRating: 0,
    },
  }).replace(/</g, '\\u003c');

  // Only show categories that have real analysis data (score > 0)
  const availableCategories = new Set(analyses.map(a => a.category));
  const categoryKeys = (Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[])
    .filter(key => availableCategories.has(key));
  const categoryBars = categoryKeys
    .map((key) => renderCategoryBar(categoryLabel(key, ui), key, scores[key]))
    .join('');

  const quickWinCards = renderQuickWinCards(quickWins, ui);
  const detailSections = renderDetailSections(analyses, ui);
  const mockupCards = renderMockups(mockups, ui);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(seoTitle)}</title>
  <meta name="description" content="${escapeHtml(seoDescription)}">
  <meta name="robots" content="noindex, nofollow">
  <meta name="author" content="Scan&Boost by Boost">
  <meta name="generator" content="Scan&Boost">
  <meta name="theme-color" content="#070F2D">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" type="image/png" href="/favicon-boost.png">
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Scan&Boost">
  <meta property="og:locale" content="${escapeHtml(ogLocale)}">
  <meta property="og:title" content="${escapeHtml(seoTitle)}">
  <meta property="og:description" content="${escapeHtml(seoDescription)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:alt" content="Scan&Boost — ${escapeHtml(ui.reportSubtitle)}">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(seoTitle)}">
  <meta name="twitter:description" content="${escapeHtml(seoDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <!-- Performance hints -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="dns-prefetch" href="https://www.weareboost.online">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/report.css?v=${ASSET_VERSION}">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <!-- Site header -->
  <header class="report-header" role="banner" style="background:#070F2D;color:white;padding:40px 20px 48px;text-align:center;margin-bottom:0;position:relative">
    ${input.pdfUrl ? `<a href="${escapeHtml(input.pdfUrl)}" download class="pdf-download-btn" aria-label="${escapeHtml(ui.downloadPdfButton)}" style="position:absolute;top:20px;right:20px;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:linear-gradient(90deg,#dd974b,#db501a);color:white;text-decoration:none;border-radius:100px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:13px;box-shadow:0 4px 16px rgba(219,80,26,0.3);transition:transform 0.15s,box-shadow 0.2s">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      ${escapeHtml(ui.downloadPdfButton)}
    </a>` : ''}
    <div style="max-width:800px;margin:0 auto">
      <a href="https://scanandboost.weareboost.online" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;margin-bottom:12px" aria-hidden="true">${BRAND_SVG}</a>
      <h1 style="font-size:32px;font-weight:800;margin-bottom:6px;letter-spacing:-0.5px"><a href="https://scanandboost.weareboost.online" target="_blank" rel="noopener" style="color:white;text-decoration:none">Scan&amp;<span style="color:#EC5F29">Boost</span></a> <span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${escapeHtml(ui.reportSubtitle)}</span></h1>
      <p style="font-size:14px;opacity:0.7;margin-bottom:4px">${escapeHtml(ui.reportSubtitle)}</p>
      <p style="font-size:13px;opacity:0.5;word-break:break-all">${url} &middot; <time datetime="${safeDate}">${safeDate}</time></p>
    </div>
  </header>

  <div class="page-wrapper">
    <!-- ═══ MAIN REPORT ═══ -->
    <main class="report-main" role="main">
      <!-- Score + comment -->
      <div style="background:white;border-radius:0 0 20px 20px;padding:32px;margin-bottom:24px;text-align:center;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        ${renderScoreGauge(globalScore)}
        <blockquote style="margin-top:16px;background:linear-gradient(135deg,#fff7ed,#fef3e2);border-radius:12px;padding:16px 20px;border:1px solid #fed7aa;display:inline-block;max-width:500px">
          <p style="font-size:14px;color:#070F2D;line-height:1.6;margin:0">
            <span aria-hidden="true">${scoreEmoji(globalScore)}</span> <strong>${escapeHtml(ui.brandSays)}</strong> "${escapeHtml(brandComment(globalScore, ui))}"
          </p>
        </blockquote>
      </div>

      <!-- Category Scores (hidden if no categories available) -->
      ${categoryKeys.length > 0 ? `
      <div style="background:white;border-radius:20px;padding:28px;margin-bottom:24px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        <section aria-labelledby="scores-title">
          <h2 id="scores-title" style="font-size:18px;margin-bottom:20px;color:#070F2D;font-weight:700">${escapeHtml(ui.scoresByCategoryTitle)}</h2>
          <nav aria-label="${escapeHtml(ui.scoresByCategoryTitle)}">${categoryBars}</nav>
        </section>
      </div>
      ` : ''}

      <!-- QuickWins -->
      ${quickWins.length > 0 ? `
      <div style="margin-bottom:32px">
        <section aria-labelledby="quickwins-title">
          <header class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div aria-hidden="true" style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F680}</div>
            <div>
              <h2 id="quickwins-title" style="font-size:22px;color:#070F2D;font-weight:800;margin:0">${escapeHtml(ui.topQuickWinsTitle)}</h2>
              <p style="color:#46495C;font-size:13px;margin:0">${escapeHtml(ui.topQuickWinsSubtitle)}</p>
            </div>
          </header>
          ${quickWinCards}
        </section>
      </div>
      ` : ''}

      <!-- Wireframe Mockups -->
      ${mockups.length > 0 ? `
      <div style="margin-bottom:32px">
        <section aria-labelledby="mockups-title">
          <header class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div aria-hidden="true" style="background:#070F2D;color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F3A8}</div>
            <div>
              <h2 id="mockups-title" style="font-size:22px;color:#070F2D;font-weight:800;margin:0">${escapeHtml(ui.proposedImprovementsTitle)}</h2>
              <p style="color:#46495C;font-size:13px;margin:0">${escapeHtml(ui.proposedImprovementsSubtitle)}</p>
            </div>
          </header>
          ${mockupCards}
        </section>
      </div>
      ` : ''}

      <!-- Detailed Analysis (hidden if no analyses available) -->
      ${analyses.length > 0 ? `
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        <section aria-labelledby="detailed-title">
          <header class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
            <div aria-hidden="true" style="background:#070F2D;color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F50D}</div>
            <h2 id="detailed-title" style="font-size:22px;color:#070F2D;font-weight:800;margin:0">${escapeHtml(ui.detailedAnalysisTitle)}</h2>
          </header>
          ${detailSections}
        </section>
      </div>
      ` : ''}

      ${renderContactCta(ui)}

      <!-- Footer -->
      <footer role="contentinfo" style="text-align:center;margin-top:24px;padding:16px;color:#9ca3af;font-size:12px">
        <p>${escapeHtml(ui.footerGeneratedBy)} <a href="https://www.weareboost.online" target="_blank" rel="noopener" style="color:#EC5F29;text-decoration:none;font-weight:700">Scan&amp;Boost</a> &middot; ${escapeHtml(ui.poweredBy)} <a href="https://www.weareboost.online" target="_blank" rel="noopener" style="color:#070F2D;text-decoration:none;font-weight:700">Boost</a></p>
        <p style="margin-top:4px"><a href="https://www.weareboost.online" target="_blank" rel="noopener" style="color:#EC5F29;text-decoration:none;font-size:11px">weareboost.online</a></p>
      </footer>
    </main>

    ${renderSidebar(ui)}
  </div>

  ${renderMobilePopup(ui)}

  <script>
    window.SCANBOOST_REPORT = {
      auditUrl: '${urlJs}',
      sendingLabel: '${escapeJsString(ui.formSendingButton)}',
      retryLabel: '${escapeJsString(ui.formRetryButton)}',
      errorAlert: '${escapeJsString(ui.formErrorAlert)}'
    };
  </script>
  <script src="/report.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>`;
}
