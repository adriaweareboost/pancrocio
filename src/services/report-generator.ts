import type { CategoryScores, QuickWin, AgentAnalysis, Mockup, Score } from '../models/interfaces.js';
import { escapeHtml, escapeJsString, sanitizeMockupHtml } from '../utils/html.js';

/** Translatable UI labels used in the report template. */
export interface ReportUiStrings {
  reportSubtitle: string;
  pancrocioSays: string;
  scoresByCategoryTitle: string;
  topQuickWinsTitle: string;
  topQuickWinsSubtitle: string;
  problemLabel: string;
  recommendationLabel: string;
  proposedImprovementsTitle: string;
  proposedImprovementsSubtitle: string;
  quickWinPrefix: string;
  detailedAnalysisTitle: string;
  ctaTitle: string;
  ctaSubtitle: string;
  formNameLabel: string;
  formNamePlaceholder: string;
  formEmailLabel: string;
  formMessageLabel: string;
  formMessagePlaceholderLong: string;
  formMessagePlaceholderShort: string;
  formPrivacyAccept: string;
  formPrivacyAcceptShort: string;
  formSubmitMain: string;
  formSubmitShort: string;
  formSendingButton: string;
  formRetryButton: string;
  formErrorAlert: string;
  formSuccessTitle: string;
  formSuccessSubtitle: string;
  sidebarTitle: string;
  sidebarSubtitle: string;
  sidebarFormNameLabel: string;
  sidebarFormNamePlaceholder: string;
  sidebarFormMessagePlaceholder: string;
  sidebarSuccessTitle: string;
  sidebarSuccessSubtitle: string;
  mobileTitle: string;
  mobileSubtitle: string;
  mobileSuccessTitle: string;
  mobileSuccessSubtitle: string;
  footerGeneratedBy: string;
  poweredBy: string;
  pancrocioCommentExcellent: string;
  pancrocioCommentGood: string;
  pancrocioCommentFair: string;
  pancrocioCommentPoor: string;
  // Category labels (translatable)
  catVisualHierarchy: string;
  catUxHeuristics: string;
  catCopyMessaging: string;
  catTrustSignals: string;
  catMobileExperience: string;
  catPerformance: string;
}

export const DEFAULT_UI_STRINGS: ReportUiStrings = {
  reportSubtitle: 'CRO Audit Report',
  pancrocioSays: 'PanCROcio dice:',
  scoresByCategoryTitle: 'Puntuaciones por Categoria',
  topQuickWinsTitle: 'Top Quick Wins',
  topQuickWinsSubtitle: 'Mejoras de alto impacto y bajo esfuerzo',
  problemLabel: 'Problema:',
  recommendationLabel: 'Recomendacion:',
  proposedImprovementsTitle: 'Mejoras Propuestas',
  proposedImprovementsSubtitle: 'Wireframes visuales de los cambios sugeridos',
  quickWinPrefix: 'QUICK WIN',
  detailedAnalysisTitle: 'Analisis Detallado',
  ctaTitle: 'Quieres mejorar tu conversion?',
  ctaSubtitle: 'PanCROcio ha encontrado oportunidades. Contactanos y te ayudamos a implementar estas mejoras.',
  formNameLabel: 'Nombre / Empresa',
  formNamePlaceholder: 'Nombre / Empresa',
  formEmailLabel: 'Email',
  formMessageLabel: 'Mensaje',
  formMessagePlaceholderLong: 'Quiero mejorar la conversion de mi web...',
  formMessagePlaceholderShort: 'Quiero mejorar...',
  formPrivacyAccept: 'He leido y acepto la politica de privacidad',
  formPrivacyAcceptShort: 'Acepto la privacidad',
  formSubmitMain: 'Quiero mejorar mi conversion',
  formSubmitShort: 'Contactar',
  formSendingButton: 'Enviando...',
  formRetryButton: 'Reintentar',
  formErrorAlert: 'Error al enviar. Intentalo de nuevo.',
  formSuccessTitle: 'Gracias por contactarnos!',
  formSuccessSubtitle: 'Te responderemos en menos de 24h.',
  sidebarTitle: 'Necesitas ayuda?',
  sidebarSubtitle: 'Implementamos estas mejoras por ti. Escribenos y te contamos como.',
  sidebarFormNameLabel: 'Nombre',
  sidebarFormNamePlaceholder: 'Tu nombre',
  sidebarFormMessagePlaceholder: 'Quiero mejorar...',
  sidebarSuccessTitle: 'Enviado!',
  sidebarSuccessSubtitle: 'Te escribimos pronto.',
  mobileTitle: 'Mejora tu web',
  mobileSubtitle: 'PanCROcio te ayuda',
  mobileSuccessTitle: 'Gracias!',
  mobileSuccessSubtitle: 'Te contactaremos pronto.',
  footerGeneratedBy: 'Generado por',
  poweredBy: 'Powered by',
  pancrocioCommentExcellent: 'Tu sitio se ve genial! Solo unos retoques y estaras convirtiendo como un profesional.',
  pancrocioCommentGood: 'Base solida! He encontrado areas clave donde pequenos cambios pueden marcar la diferencia.',
  pancrocioCommentFair: 'Hay potencial real aqui. Dejame mostrarte los quick wins que moveran la aguja.',
  pancrocioCommentPoor: 'No te preocupes — todo gran sitio empezo en algun lugar. Estas son las mejoras de alto impacto a priorizar.',
  catVisualHierarchy: 'Jerarquia Visual',
  catUxHeuristics: 'Heuristicas UX',
  catCopyMessaging: 'Copy y Mensajes',
  catTrustSignals: 'Senales de Confianza',
  catMobileExperience: 'Experiencia Movil',
  catPerformance: 'Rendimiento',
};

/** Map a category key to its translated label using a uiStrings object. */
function categoryLabel(key: keyof CategoryScores, ui: ReportUiStrings): string {
  switch (key) {
    case 'visualHierarchy': return ui.catVisualHierarchy;
    case 'uxHeuristics': return ui.catUxHeuristics;
    case 'copyMessaging': return ui.catCopyMessaging;
    case 'trustSignals': return ui.catTrustSignals;
    case 'mobileExperience': return ui.catMobileExperience;
    case 'performance': return ui.catPerformance;
  }
}

interface ReportInput {
  url: string;
  globalScore: number;
  scores: CategoryScores;
  quickWins: QuickWin[];
  mockups: Mockup[];
  analyses: AgentAnalysis[];
  date: string;
  uiStrings?: ReportUiStrings;
  /** ISO 639-1 short code (e.g. "es", "fr"). Drives <html lang> + og:locale. */
  lang?: string;
  /** Public origin for canonical/OG URLs (e.g. "https://pancrocio.up.railway.app"). */
  siteOrigin?: string;
}

/** Maps short ISO codes to BCP 47 locales used in og:locale. */
const OG_LOCALES: Record<string, string> = {
  es: 'es_ES', en: 'en_US', fr: 'fr_FR', de: 'de_DE', it: 'it_IT',
  pt: 'pt_PT', nl: 'nl_NL', ca: 'ca_ES', ja: 'ja_JP', zh: 'zh_CN',
};

function normalizeShortLang(code: string | undefined): string {
  const lc = (code || 'es').toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(lc) ? lc : 'es';
}

import { CATEGORY_LABELS } from '../utils/constants.js';

const CATEGORY_ICONS: Record<keyof CategoryScores, string> = {
  visualHierarchy: '\u{1F3AF}',
  uxHeuristics: '\u{1F9E9}',
  copyMessaging: '\u{270D}\u{FE0F}',
  trustSignals: '\u{1F6E1}\u{FE0F}',
  mobileExperience: '\u{1F4F1}',
  performance: '\u{26A1}',
};

// Static asset cache-busting token — bumped on each server start so the
// browser always fetches the latest CSS/JS even if URL is the same.
const ASSET_VERSION = String(Date.now());

// PanCROcio inline SVG (simplified for report embedding)
const PANCROCIO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="80" height="96" style="vertical-align:middle">
  <rect x="60" y="120" width="80" height="80" rx="16" fill="#f0f4ff" stroke="#c7d2fe" stroke-width="2"/>
  <path d="M80 120 L100 145 L120 120" fill="none" stroke="#818cf8" stroke-width="2"/>
  <rect x="96" y="140" width="8" height="30" rx="3" fill="#EC5F29"/>
  <polygon points="96,170 104,170 100,180" fill="#EC5F29"/>
  <circle cx="100" cy="80" r="42" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>
  <path d="M62 68 Q70 30 100 38 Q130 30 138 68" fill="#92400e" stroke="#78350f" stroke-width="1.5"/>
  <ellipse cx="84" cy="78" rx="10" ry="11" fill="white"/>
  <circle cx="86" cy="79" r="5" fill="#1e293b"/>
  <circle cx="87" cy="77" r="2" fill="white"/>
  <ellipse cx="116" cy="78" rx="10" ry="11" fill="white"/>
  <circle cx="118" cy="79" r="5" fill="#1e293b"/>
  <circle cx="119" cy="77" r="2" fill="white"/>
  <circle cx="84" cy="78" r="14" fill="none" stroke="#475569" stroke-width="2.5"/>
  <circle cx="116" cy="78" r="14" fill="none" stroke="#475569" stroke-width="2.5"/>
  <line x1="98" y1="78" x2="102" y2="78" stroke="#475569" stroke-width="2.5"/>
  <path d="M85 95 Q100 108 115 95" fill="none" stroke="#92400e" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M74 64 Q84 58 94 64" fill="none" stroke="#78350f" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M106 64 Q116 58 126 64" fill="none" stroke="#78350f" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M60 140 Q30 150 28 170" fill="none" stroke="#fbbf24" stroke-width="10" stroke-linecap="round"/>
  <circle cx="22" cy="185" r="14" fill="none" stroke="#475569" stroke-width="3"/>
  <circle cx="22" cy="185" r="10" fill="#dbeafe" opacity="0.5"/>
  <line x1="32" y1="195" x2="42" y2="208" stroke="#475569" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M140 140 Q165 148 168 168" fill="none" stroke="#fbbf24" stroke-width="10" stroke-linecap="round"/>
  <rect x="155" y="165" width="30" height="38" rx="4" fill="white" stroke="#cbd5e1" stroke-width="1.5"/>
  <rect x="155" y="165" width="30" height="8" rx="4" fill="#EC5F29"/>
  <rect x="160" y="192" width="5" height="6" fill="#22c55e"/>
  <rect x="167" y="188" width="5" height="10" fill="#f59e0b"/>
  <rect x="174" y="183" width="5" height="15" fill="#EC5F29"/>
  <rect x="75" y="158" width="20" height="15" rx="3" fill="#e0e7ff" stroke="#818cf8" stroke-width="1"/>
  <text x="85" y="169" font-size="7" font-weight="bold" fill="#4338ca" text-anchor="middle" font-family="sans-serif">CRO</text>
  <ellipse cx="82" cy="202" rx="14" ry="6" fill="#475569"/>
  <ellipse cx="118" cy="202" rx="14" ry="6" fill="#475569"/>
</svg>`;

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#EC5F29';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function scoreEmoji(score: number): string {
  if (score >= 80) return '\u{1F389}';
  if (score >= 60) return '\u{1F44D}';
  if (score >= 40) return '\u{1F914}';
  return '\u{1F6A8}';
}

function severityBadge(severity: string): string {
  const styles: Record<string, { bg: string; text: string }> = {
    critical: { bg: '#fef2f2', text: '#dc2626' },
    warning: { bg: '#fff7ed', text: '#ea580c' },
    info: { bg: '#eff6ff', text: '#2563eb' },
  };
  const s = styles[severity] || { bg: '#f3f4f6', text: '#6b7280' };
  return `<span style="background:${s.bg};color:${s.text};padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid ${s.text}20">${severity}</span>`;
}

function impactBadge(level: string): string {
  const colors: Record<string, string> = { high: '#dc2626', medium: '#ea580c', low: '#16a34a' };
  const c = colors[level] || '#6b7280';
  return `<span style="background:${c};color:white;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase">${level} IMPACT</span>`;
}

function renderScoreGauge(score: number): string {
  const color = scoreColor(score);
  return `
    <div class="score-gauge" style="position:relative;width:160px;height:160px;margin:0 auto">
      <svg viewBox="0 0 36 36" style="transform:rotate(-90deg);width:100%;height:100%">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1C1C2D" stroke-width="2.5" opacity="0.15"/>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="${color}" stroke-width="3"
          stroke-dasharray="${score} ${100 - score}" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
        <div class="score-gauge-number" style="font-size:38px;font-weight:800;color:${color};font-family:'Plus Jakarta Sans',sans-serif">${score}</div>
        <div style="font-size:12px;color:#46495C;font-weight:600">/ 100</div>
      </div>
    </div>`;
}

function renderCategoryBar(label: string, key: keyof CategoryScores, score: Score): string {
  const color = scoreColor(score.value);
  const icon = CATEGORY_ICONS[key] || '';
  return `
    <a href="#cat-${key}" class="category-bar-link" style="display:block;margin-bottom:16px;text-decoration:none;color:inherit;border-radius:8px;padding:6px 8px;margin-left:-8px;margin-right:-8px;transition:background-color 0.15s">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:14px;font-weight:600;color:#070F2D">${icon} ${label}</span>
        <span style="font-size:15px;font-weight:800;color:${color};font-family:'Plus Jakarta Sans',sans-serif">${score.value}</span>
      </div>
      <div style="background:#070F2D10;border-radius:100px;height:10px;overflow:hidden">
        <div style="background:${score.value >= 60 ? 'linear-gradient(90deg,#dd974b,#db501a)' : color};height:100%;width:${score.value}%;border-radius:100px"></div>
      </div>
    </a>`;
}

function pancrocioComment(score: number, ui: ReportUiStrings): string {
  if (score >= 80) return ui.pancrocioCommentExcellent;
  if (score >= 60) return ui.pancrocioCommentGood;
  if (score >= 40) return ui.pancrocioCommentFair;
  return ui.pancrocioCommentPoor;
}

export function generateReportHtml(input: ReportInput): string {
  const { globalScore, scores, quickWins, mockups, analyses, date } = input;
  const ui = input.uiStrings || DEFAULT_UI_STRINGS;
  const url = escapeHtml(input.url);
  const urlJs = escapeJsString(input.url);
  const lang = normalizeShortLang(input.lang);
  const ogLocale = OG_LOCALES[lang] || 'es_ES';
  const safeDate = escapeHtml(date);
  // SEO meta strings — kept short to fit Google/OG limits.
  const seoTitle = `PanCROcio CRO Report \u2014 ${url} (${globalScore}/100)`;
  const seoDescription = `${ui.reportSubtitle} \u2014 ${url}. Score ${globalScore}/100. ${quickWins.length} quick wins, ${mockups.length} mockups, ${analyses.length} category audits.`;
  // Site origin: prefer explicit input, fall back to SITE_ORIGIN env var, default to weareboost.
  // Defensive: strip trailing slash and prepend https:// if the user forgot the protocol.
  const rawOrigin = (input.siteOrigin || process.env.SITE_ORIGIN || 'https://www.weareboost.online').replace(/\/$/, '');
  const siteOrigin = /^https?:\/\//.test(rawOrigin) ? rawOrigin : `https://${rawOrigin}`;
  const canonicalUrl = `${siteOrigin}/report?u=${encodeURIComponent(input.url)}`;
  const ogImage = `${siteOrigin}/og-image.svg`;

  // JSON-LD structured data — schema.org Report. Wrapped in escapeHtml-safe JSON.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Report',
    name: `PanCROcio CRO Report for ${input.url}`,
    headline: `CRO Audit \u2014 ${input.url}`,
    description: seoDescription,
    inLanguage: lang,
    datePublished: date,
    dateCreated: date,
    url: canonicalUrl,
    author: { '@type': 'Organization', name: 'PanCROcio', url: siteOrigin },
    publisher: { '@type': 'Organization', name: 'Boost', url: 'https://www.weareboost.online' },
    about: { '@type': 'WebSite', url: input.url },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: globalScore,
      bestRating: 100,
      worstRating: 0,
    },
  }).replace(/</g, '\\u003c');

  const categoryKeys = Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[];
  const categoryBars = categoryKeys
    .map((key) => renderCategoryBar(categoryLabel(key, ui), key, scores[key]))
    .join('');

  const quickWinCards = quickWins.map((qw) => `
    <article aria-labelledby="qw-${qw.rank}-title" style="background:white;border:1px solid #e2e4ea;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(7,15,45,0.06)">
      <header class="qw-card-head" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div aria-hidden="true" style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0">${qw.rank}</div>
        <h3 id="qw-${qw.rank}-title" style="margin:0;font-size:16px;color:#070F2D;flex:1;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700">${escapeHtml(qw.title)}</h3>
        <div class="qw-badges" style="display:flex;gap:6px;flex-wrap:wrap">
          ${impactBadge(qw.impact)}
          <span style="background:#070F2D10;color:#070F2D;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:600">${CATEGORY_ICONS[qw.category] || ''} ${escapeHtml(categoryLabel(qw.category, ui))}</span>
        </div>
      </header>
      <div style="background:#fef7f2;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:4px solid #EC5F29">
        <p style="color:#46495C;margin:0;font-size:13px;line-height:1.6"><strong style="color:#070F2D">${escapeHtml(ui.problemLabel)}</strong> ${escapeHtml(qw.problem)}</p>
      </div>
      <div style="background:#f0fdf4;border-radius:10px;padding:14px 16px;border-left:4px solid #22c55e">
        <p style="color:#46495C;margin:0;font-size:13px;line-height:1.6"><strong style="color:#070F2D">${escapeHtml(ui.recommendationLabel)}</strong> ${escapeHtml(qw.recommendation)}</p>
      </div>
    </article>
  `).join('');

  const detailSections = analyses.map((analysis) => {
    const icon = CATEGORY_ICONS[analysis.category] || '';
    const headingId = `cat-${analysis.category}-title`;
    const findings = analysis.findings.map((f, idx) => `
      <article aria-labelledby="cat-${analysis.category}-finding-${idx}" style="border-left:4px solid ${f.severity === 'critical' ? '#dc2626' : f.severity === 'warning' ? '#ea580c' : '#2563eb'};padding:14px 18px;margin-bottom:12px;background:white;border-radius:0 12px 12px 0;box-shadow:0 1px 4px rgba(7,15,45,0.05)">
        <header class="finding-head" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          ${severityBadge(f.severity)}
          <strong id="cat-${analysis.category}-finding-${idx}" style="font-size:14px;color:#070F2D;font-family:'Plus Jakarta Sans',sans-serif">${escapeHtml(f.title)}</strong>
        </header>
        <p style="color:#46495C;margin:4px 0;font-size:13px;line-height:1.6">${escapeHtml(f.description)}</p>
        ${f.element ? `<p style="color:#9ca3af;margin:4px 0;font-size:11px;font-family:monospace;background:#f8f9fb;display:inline-block;padding:2px 8px;border-radius:4px"><code>${escapeHtml(f.element)}</code></p>` : ''}
        <p style="color:#16a34a;margin:6px 0 0;font-size:13px;line-height:1.5"><em>${escapeHtml(f.recommendation)}</em></p>
      </article>
    `).join('');

    return `
      <section id="cat-${analysis.category}" aria-labelledby="${headingId}" style="margin-bottom:32px;scroll-margin-top:24px">
        <header style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #e2e4ea;padding-bottom:10px;margin-bottom:16px">
          <h3 id="${headingId}" style="font-size:18px;color:#070F2D;margin:0;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700"><span aria-hidden="true">${icon}</span> ${escapeHtml(categoryLabel(analysis.category, ui))}</h3>
          <span style="font-size:20px;font-weight:800;color:${scoreColor(analysis.score.value)};font-family:'Plus Jakarta Sans',sans-serif">${analysis.score.value}<span style="font-size:13px;font-weight:600;color:#9ca3af">/100</span></span>
        </header>
        ${findings}
      </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(seoTitle)}</title>
  <meta name="description" content="${escapeHtml(seoDescription)}">
  <meta name="robots" content="noindex, nofollow">
  <meta name="author" content="PanCROcio by Boost">
  <meta name="generator" content="PanCROcio">
  <meta name="theme-color" content="#070F2D">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="PanCROcio">
  <meta property="og:locale" content="${escapeHtml(ogLocale)}">
  <meta property="og:title" content="${escapeHtml(seoTitle)}">
  <meta property="og:description" content="${escapeHtml(seoDescription)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:alt" content="PanCROcio CRO Audit Report">
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
  <header class="report-header" role="banner" style="background:#070F2D;color:white;padding:40px 20px 48px;text-align:center;margin-bottom:0">
    <div style="max-width:800px;margin:0 auto">
      <div aria-hidden="true" style="margin-bottom:12px">${PANCROCIO_SVG}</div>
      <h1 style="font-size:32px;font-weight:800;margin-bottom:6px;letter-spacing:-0.5px">Pan<span style="color:#EC5F29">CRO</span>cio <span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${escapeHtml(ui.reportSubtitle)}</span></h1>
      <p style="font-size:14px;opacity:0.7;margin-bottom:4px">${escapeHtml(ui.reportSubtitle)}</p>
      <p style="font-size:13px;opacity:0.5;word-break:break-all">${url} &middot; <time datetime="${safeDate}">${safeDate}</time></p>
    </div>
  </header>

  <div class="page-wrapper">
    <!-- ═══ MAIN REPORT ═══ -->
    <main class="report-main" role="main">
      <!-- PanCROcio comment + Score -->
      <div style="background:white;border-radius:0 0 20px 20px;padding:32px;margin-bottom:24px;text-align:center;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        ${renderScoreGauge(globalScore)}
        <blockquote style="margin-top:16px;background:linear-gradient(135deg,#fff7ed,#fef3e2);border-radius:12px;padding:16px 20px;border:1px solid #fed7aa;display:inline-block;max-width:500px">
          <p style="font-size:14px;color:#070F2D;line-height:1.6;margin:0">
            <span aria-hidden="true">${scoreEmoji(globalScore)}</span> <strong>${escapeHtml(ui.pancrocioSays)}</strong> "${escapeHtml(pancrocioComment(globalScore, ui))}"
          </p>
        </blockquote>
      </div>

      <!-- Category Scores -->
      <div style="background:white;border-radius:20px;padding:28px;margin-bottom:24px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        <section aria-labelledby="scores-title">
          <h2 id="scores-title" style="font-size:18px;margin-bottom:20px;color:#070F2D;font-weight:700">${escapeHtml(ui.scoresByCategoryTitle)}</h2>
          <nav aria-label="${escapeHtml(ui.scoresByCategoryTitle)}">${categoryBars}</nav>
        </section>
      </div>

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
          ${mockups.map((m, i) => `
            <article aria-labelledby="mockup-${i}-title" style="background:white;border-radius:20px;padding:24px;margin-bottom:20px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
              <header style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
                <span style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700">${escapeHtml(ui.quickWinPrefix)} #${m.relatedQuickWin}</span>
                <h3 id="mockup-${i}-title" style="margin:0;font-size:16px;color:#070F2D;font-weight:700">${escapeHtml(m.title)}</h3>
              </header>
              <p style="color:#46495C;font-size:13px;margin-bottom:16px;line-height:1.5">${escapeHtml(m.description)}</p>
              <figure style="margin:0;border:2px solid #e2e4ea;border-radius:12px;overflow:hidden;background:#fafbfc;padding:16px" role="img" aria-label="${escapeHtml(m.title)}">
                ${sanitizeMockupHtml(m.htmlContent)}
              </figure>
            </article>
          `).join('')}
        </section>
      </div>
      ` : ''}

      <!-- Detailed Analysis -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        <section aria-labelledby="detailed-title">
          <header class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
            <div aria-hidden="true" style="background:#070F2D;color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F50D}</div>
            <h2 id="detailed-title" style="font-size:22px;color:#070F2D;font-weight:800;margin:0">${escapeHtml(ui.detailedAnalysisTitle)}</h2>
          </header>
          ${detailSections}
        </section>
      </div>

      <!-- ═══ CONTACT FORM (bottom) ═══ -->
      <div id="contactSection" class="contact-bottom" style="background:#070F2D;border-radius:20px;padding:40px 32px;margin-top:32px;box-shadow:0 4px 24px rgba(7,15,45,0.15)">
        <section aria-labelledby="cta-title">
          <header style="text-align:center;margin-bottom:24px">
            <div aria-hidden="true" style="margin-bottom:8px">${PANCROCIO_SVG}</div>
            <h2 id="cta-title" style="font-size:24px;color:white;font-weight:800;margin-bottom:6px">${escapeHtml(ui.ctaTitle)}</h2>
            <p style="color:rgba(255,255,255,0.65);font-size:14px;max-width:420px;margin:0 auto">${escapeHtml(ui.ctaSubtitle)}</p>
          </header>
          <div class="contact-bottom-inner" style="background:white;border-radius:16px;padding:28px;max-width:480px;margin:0 auto">
            <form class="lead-form" id="contactForm" onsubmit="return handleContactSubmit(event, 'contactForm')" aria-labelledby="cta-title">
              <div class="field">
                <label for="cf_name">${escapeHtml(ui.formNameLabel)}</label>
                <input type="text" id="cf_name" name="name" placeholder="${escapeHtml(ui.formNamePlaceholder)}" autocomplete="organization" required>
              </div>
              <div class="field">
                <label for="cf_email">${escapeHtml(ui.formEmailLabel)}</label>
                <input type="email" id="cf_email" name="email" placeholder="tu@empresa.com" autocomplete="email" required>
              </div>
              <div class="field">
                <label for="cf_message">${escapeHtml(ui.formMessageLabel)}</label>
                <textarea id="cf_message" name="message" rows="3" placeholder="${escapeHtml(ui.formMessagePlaceholderLong)}" required></textarea>
              </div>
              <div class="privacy-row">
                <input type="checkbox" id="cf_privacy" name="privacy" required>
                <label for="cf_privacy" style="font-size:11px;font-weight:400;margin:0">${escapeHtml(ui.formPrivacyAccept)} <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ui.formPrivacyAccept)}">\u2192</a></label>
              </div>
              <button type="submit">${escapeHtml(ui.formSubmitMain)}</button>
            </form>
            <div class="form-success" id="contactFormSuccess" role="status" aria-live="polite" style="display:none">
              <div class="check" aria-hidden="true">\u2713</div>
              <h3 style="font-size:18px;color:#070F2D;margin-bottom:4px">${escapeHtml(ui.formSuccessTitle)}</h3>
              <p style="font-size:13px;color:#46495C">${escapeHtml(ui.formSuccessSubtitle)}</p>
            </div>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <footer role="contentinfo" style="text-align:center;margin-top:24px;padding:16px;color:#9ca3af;font-size:12px">
        <p>${escapeHtml(ui.footerGeneratedBy)} <strong style="color:#EC5F29">PanCROcio</strong> &middot; ${escapeHtml(ui.poweredBy)} <strong style="color:#070F2D">Boost</strong></p>
      </footer>
    </main>

    <!-- ═══ DESKTOP SIDEBAR (sticky) ═══ -->
    <aside class="sidebar-lead" role="complementary" aria-labelledby="sidebar-title">
      <header style="text-align:center;margin-bottom:16px">
        <span aria-hidden="true">${PANCROCIO_SVG.replace('width="80" height="96"', 'width="56" height="67"')}</span>
        <h2 id="sidebar-title" style="font-size:15px;color:#070F2D;font-weight:800;margin-top:8px">${escapeHtml(ui.sidebarTitle)}</h2>
        <p style="font-size:12px;color:#46495C;margin-top:4px;line-height:1.4">${escapeHtml(ui.sidebarSubtitle)}</p>
      </header>
      <form class="lead-form" id="sidebarForm" onsubmit="return handleContactSubmit(event, 'sidebarForm')" aria-labelledby="sidebar-title">
        <div class="field">
          <label for="sf_name">${escapeHtml(ui.sidebarFormNameLabel)}</label>
          <input type="text" id="sf_name" name="name" placeholder="${escapeHtml(ui.sidebarFormNamePlaceholder)}" autocomplete="name" required>
        </div>
        <div class="field">
          <label for="sf_email">${escapeHtml(ui.formEmailLabel)}</label>
          <input type="email" id="sf_email" name="email" placeholder="tu@empresa.com" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="sf_message">${escapeHtml(ui.formMessageLabel)}</label>
          <textarea id="sf_message" name="message" rows="2" placeholder="${escapeHtml(ui.sidebarFormMessagePlaceholder)}" required></textarea>
        </div>
        <div class="privacy-row">
          <input type="checkbox" id="sf_privacy" name="privacy" required>
          <label for="sf_privacy" style="font-size:11px;font-weight:400;margin:0">${escapeHtml(ui.formPrivacyAcceptShort)} <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ui.formPrivacyAccept)}">\u2192</a></label>
        </div>
        <button type="submit">${escapeHtml(ui.formSubmitShort)}</button>
      </form>
      <div class="form-success" id="sidebarFormSuccess" role="status" aria-live="polite" style="display:none">
        <div class="check" aria-hidden="true">\u2713</div>
        <h3 style="font-size:15px;color:#070F2D;margin-bottom:4px">${escapeHtml(ui.sidebarSuccessTitle)}</h3>
        <p style="font-size:12px;color:#46495C">${escapeHtml(ui.sidebarSuccessSubtitle)}</p>
      </div>
      <footer style="text-align:center;margin-top:14px;padding-top:14px;border-top:1px solid #e2e4ea">
        <p style="font-size:10px;color:#9ca3af">${escapeHtml(ui.poweredBy)} <strong style="color:#070F2D">Boost</strong></p>
      </footer>
    </aside>
  </div>

  <!-- ═══ MOBILE: Floating Bubble ═══ -->
  <button type="button" class="mobile-bubble" id="mobileBubble" onclick="openMobileForm()" aria-label="${escapeHtml(ui.ctaTitle)}" aria-controls="mobilePopup" aria-expanded="false">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  </button>

  <!-- MOBILE: Overlay + Popup -->
  <div class="mobile-overlay" id="mobileOverlay" onclick="closeMobileForm()" aria-hidden="true"></div>
  <div class="mobile-lead-popup" id="mobilePopup" role="dialog" aria-modal="true" aria-labelledby="mobile-popup-title">
    <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span aria-hidden="true">${PANCROCIO_SVG.replace('width="80" height="96"', 'width="40" height="48"')}</span>
        <div>
          <h2 id="mobile-popup-title" style="font-size:16px;color:#070F2D;font-weight:800;margin:0">${escapeHtml(ui.mobileTitle)}</h2>
          <p style="font-size:12px;color:#46495C;margin:0">${escapeHtml(ui.mobileSubtitle)}</p>
        </div>
      </div>
      <button type="button" onclick="closeMobileForm()" aria-label="Close" style="background:none;border:none;font-size:24px;color:#9ca3af;cursor:pointer;padding:4px">&times;</button>
    </header>
    <form class="lead-form" id="mobileForm" onsubmit="return handleContactSubmit(event, 'mobileForm')" aria-labelledby="mobile-popup-title">
      <div class="field">
        <label for="mf_name">${escapeHtml(ui.formNameLabel)}</label>
        <input type="text" id="mf_name" name="name" placeholder="${escapeHtml(ui.formNamePlaceholder)}" autocomplete="organization" required>
      </div>
      <div class="field">
        <label for="mf_email">${escapeHtml(ui.formEmailLabel)}</label>
        <input type="email" id="mf_email" name="email" placeholder="tu@empresa.com" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="mf_message">${escapeHtml(ui.formMessageLabel)}</label>
        <textarea id="mf_message" name="message" rows="2" placeholder="${escapeHtml(ui.formMessagePlaceholderLong)}" required></textarea>
      </div>
      <div class="privacy-row">
        <input type="checkbox" id="mf_privacy" name="privacy" required>
        <label for="mf_privacy" style="font-size:11px;font-weight:400;margin:0">${escapeHtml(ui.formPrivacyAccept)} <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ui.formPrivacyAccept)}">\u2192</a></label>
      </div>
      <button type="submit">${escapeHtml(ui.formSubmitMain)}</button>
    </form>
    <div class="form-success" id="mobileFormSuccess" role="status" aria-live="polite" style="display:none">
      <div class="check" aria-hidden="true">\u2713</div>
      <h3 style="font-size:16px;color:#070F2D;margin-bottom:4px">${escapeHtml(ui.mobileSuccessTitle)}</h3>
      <p style="font-size:13px;color:#46495C">${escapeHtml(ui.mobileSuccessSubtitle)}</p>
    </div>
  </div>

  <script>
    window.PANCROCIO_REPORT = {
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
