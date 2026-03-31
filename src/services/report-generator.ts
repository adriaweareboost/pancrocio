import type { CategoryScores, QuickWin, AgentAnalysis, Mockup, Score } from '../models/interfaces.js';
import { escapeHtml, escapeJsString, sanitizeMockupHtml } from '../utils/html.js';

interface ReportInput {
  url: string;
  globalScore: number;
  scores: CategoryScores;
  quickWins: QuickWin[];
  mockups: Mockup[];
  analyses: AgentAnalysis[];
  date: string;
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
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:14px;font-weight:600;color:#070F2D">${icon} ${label}</span>
        <span style="font-size:15px;font-weight:800;color:${color};font-family:'Plus Jakarta Sans',sans-serif">${score.value}</span>
      </div>
      <div style="background:#070F2D10;border-radius:100px;height:10px;overflow:hidden">
        <div style="background:${score.value >= 60 ? 'linear-gradient(90deg,#dd974b,#db501a)' : color};height:100%;width:${score.value}%;border-radius:100px"></div>
      </div>
    </div>`;
}

function pancrocioComment(score: number): string {
  if (score >= 80) return 'Your site is looking great! Just a few tweaks and you\'ll be converting like a pro.';
  if (score >= 60) return 'Solid foundation! I\'ve found some key areas where small changes can make a big difference.';
  if (score >= 40) return 'There\'s real potential here. Let me show you the quick wins that\'ll move the needle.';
  return 'Don\'t worry \u2014 every great site started somewhere. Here are the high-impact fixes to prioritize.';
}

export function generateReportHtml(input: ReportInput): string {
  const { globalScore, scores, quickWins, mockups, analyses, date } = input;
  const url = escapeHtml(input.url);
  const urlJs = escapeJsString(input.url);

  const categoryBars = Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => renderCategoryBar(label, key as keyof CategoryScores, scores[key as keyof CategoryScores]))
    .join('');

  const quickWinCards = quickWins.map((qw) => `
    <div style="background:white;border:1px solid #e2e4ea;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(7,15,45,0.06)">
      <div class="qw-card-head" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0">${qw.rank}</div>
        <h3 style="margin:0;font-size:16px;color:#070F2D;flex:1;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700">${escapeHtml(qw.title)}</h3>
        <div class="qw-badges" style="display:flex;gap:6px;flex-wrap:wrap">
          ${impactBadge(qw.impact)}
          <span style="background:#070F2D10;color:#070F2D;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:600">${CATEGORY_ICONS[qw.category] || ''} ${CATEGORY_LABELS[qw.category] || qw.category}</span>
        </div>
      </div>
      <div style="background:#fef7f2;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:4px solid #EC5F29">
        <p style="color:#46495C;margin:0;font-size:13px;line-height:1.6"><strong style="color:#070F2D">Problem:</strong> ${escapeHtml(qw.problem)}</p>
      </div>
      <div style="background:#f0fdf4;border-radius:10px;padding:14px 16px;border-left:4px solid #22c55e">
        <p style="color:#46495C;margin:0;font-size:13px;line-height:1.6"><strong style="color:#070F2D">Recommendation:</strong> ${escapeHtml(qw.recommendation)}</p>
      </div>
    </div>
  `).join('');

  const detailSections = analyses.map((analysis) => {
    const icon = CATEGORY_ICONS[analysis.category] || '';
    const findings = analysis.findings.map((f) => `
      <div style="border-left:4px solid ${f.severity === 'critical' ? '#dc2626' : f.severity === 'warning' ? '#ea580c' : '#2563eb'};padding:14px 18px;margin-bottom:12px;background:white;border-radius:0 12px 12px 0;box-shadow:0 1px 4px rgba(7,15,45,0.05)">
        <div class="finding-head" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          ${severityBadge(f.severity)}
          <strong style="font-size:14px;color:#070F2D;font-family:'Plus Jakarta Sans',sans-serif">${escapeHtml(f.title)}</strong>
        </div>
        <p style="color:#46495C;margin:4px 0;font-size:13px;line-height:1.6">${escapeHtml(f.description)}</p>
        ${f.element ? `<p style="color:#9ca3af;margin:4px 0;font-size:11px;font-family:monospace;background:#f8f9fb;display:inline-block;padding:2px 8px;border-radius:4px">${escapeHtml(f.element)}</p>` : ''}
        <p style="color:#16a34a;margin:6px 0 0;font-size:13px;line-height:1.5"><em>${escapeHtml(f.recommendation)}</em></p>
      </div>
    `).join('');

    return `
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #e2e4ea;padding-bottom:10px;margin-bottom:16px">
          <h3 style="font-size:18px;color:#070F2D;margin:0;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700">${icon} ${CATEGORY_LABELS[analysis.category] || analysis.category}</h3>
          <span style="font-size:20px;font-weight:800;color:${scoreColor(analysis.score.value)};font-family:'Plus Jakarta Sans',sans-serif">${analysis.score.value}<span style="font-size:13px;font-weight:600;color:#9ca3af">/100</span></span>
        </div>
        ${findings}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PanCROcio Report \u2014 ${url}</title>
  <meta name="description" content="Informe CRO de ${url} generado por PanCROcio. Puntuacion: ${globalScore}/100. Incluye quick wins y mejoras accionables.">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8f9fb; color: #46495C; line-height: 1.6; -webkit-text-size-adjust: 100%; }
    h1, h2, h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
    img, svg { max-width: 100%; height: auto; }

    /* Layout: report + sidebar */
    .page-wrapper { max-width: 1120px; margin: 0 auto; padding: 0 16px 40px; display: flex; gap: 24px; align-items: flex-start; }
    .report-main { flex: 1; min-width: 0; max-width: 100%; overflow-x: hidden; }

    /* Desktop sidebar */
    .sidebar-lead {
      width: 280px; flex-shrink: 0; position: sticky; top: 24px;
      background: white; border-radius: 20px; padding: 24px;
      box-shadow: 0 4px 24px rgba(7,15,45,0.10); border-top: 4px solid #EC5F29;
    }

    /* Mobile floating bubble */
    .mobile-bubble {
      display: none; position: fixed; bottom: 20px; right: 20px; z-index: 1000;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #dd974b, #db501a);
      box-shadow: 0 6px 20px rgba(219,80,26,0.4);
      cursor: pointer; border: none;
      animation: bubblePulse 2s infinite;
    }
    .mobile-bubble svg { width: 28px; height: 28px; }

    /* Mobile lead popup */
    .mobile-lead-popup {
      display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 1001;
      background: white; border-radius: 20px 20px 0 0; padding: 28px 20px 32px;
      box-shadow: 0 -8px 40px rgba(7,15,45,0.15);
      transform: translateY(100%); transition: transform 0.3s ease;
    }
    .mobile-lead-popup.open { transform: translateY(0); }
    .mobile-overlay {
      display: none; position: fixed; inset: 0; z-index: 1000;
      background: rgba(7,15,45,0.4); opacity: 0; transition: opacity 0.3s;
    }
    .mobile-overlay.open { opacity: 1; }

    @keyframes bubblePulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }

    /* Responsive */
    @media (max-width: 860px) {
      .page-wrapper { flex-direction: column; padding: 0 12px 32px; }
      .sidebar-lead { display: none; }
      .mobile-bubble { display: flex; align-items: center; justify-content: center; }
    }
    @media (max-width: 600px) {
      .page-wrapper { padding: 0 6px 24px; }
      .report-main > div { border-radius: 14px !important; padding-left: 16px !important; padding-right: 16px !important; }
      .report-header { padding: 28px 16px 36px !important; }
      .report-header h1 { font-size: 26px !important; }
      .qw-card-head { flex-direction: column !important; align-items: flex-start !important; }
      .qw-badges { margin-top: 8px; }
      .finding-head { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; }
      .contact-bottom { padding: 28px 16px !important; }
      .contact-bottom-inner { padding: 20px 16px !important; }
      .score-gauge { width: 120px !important; height: 120px !important; }
      .score-gauge-number { font-size: 30px !important; }
      .section-heading h2 { font-size: 18px !important; }
    }
    @media (min-width: 861px) {
      .mobile-bubble, .mobile-lead-popup, .mobile-overlay { display: none !important; }
    }

    /* Shared form styles */
    .lead-form input, .lead-form textarea {
      width: 100%; padding: 10px 14px; border: 1px solid #e2e4ea; border-radius: 10px;
      font-size: 14px; font-family: inherit; outline: none; color: #070F2D;
      transition: border-color 0.2s;
    }
    .lead-form input:focus, .lead-form textarea:focus {
      border-color: #EC5F29; box-shadow: 0 0 0 3px rgba(236,95,41,0.12);
    }
    .lead-form input::placeholder, .lead-form textarea::placeholder { color: #9ca3af; }
    .lead-form label {
      display: block; font-size: 12px; font-weight: 600; color: #070F2D;
      margin-bottom: 4px; font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .lead-form .field { margin-bottom: 14px; }
    .lead-form button {
      width: 100%; padding: 12px; border: none; border-radius: 100px;
      background: linear-gradient(90deg, #dd974b, #db501a); color: white;
      font-weight: 700; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif;
      cursor: pointer; transition: transform 0.15s, box-shadow 0.2s;
    }
    .lead-form button:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(219,80,26,0.35); }
    .lead-form button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .lead-form .privacy-row {
      display: flex; align-items: flex-start; gap: 8px; margin-bottom: 14px; font-size: 11px; color: #46495C;
    }
    .lead-form .privacy-row input[type="checkbox"] {
      width: 16px; height: 16px; margin-top: 1px; flex-shrink: 0; accent-color: #EC5F29;
    }
    .lead-form .privacy-row a { color: #EC5F29; text-decoration: underline; }
    .lead-form .form-success {
      text-align: center; padding: 20px 0;
    }
    .lead-form .form-success .check {
      width: 48px; height: 48px; background: #22c55e; border-radius: 50%; margin: 0 auto 12px;
      display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;
    }

    @media print {
      body { background: white; }
      .sidebar-lead, .mobile-bubble, .mobile-lead-popup, .mobile-overlay { display: none !important; }
      .page-wrapper { max-width: 800px; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="report-header" style="background:#070F2D;color:white;padding:40px 20px 48px;text-align:center;margin-bottom:0">
    <div style="max-width:800px;margin:0 auto">
      <div style="margin-bottom:12px">${PANCROCIO_SVG}</div>
      <h1 style="font-size:32px;font-weight:800;margin-bottom:6px;letter-spacing:-0.5px">Pan<span style="color:#EC5F29">CRO</span>cio</h1>
      <p style="font-size:14px;opacity:0.7;margin-bottom:4px">CRO Audit Report</p>
      <p style="font-size:13px;opacity:0.5;word-break:break-all">${url} &middot; ${date}</p>
    </div>
  </div>

  <div class="page-wrapper">
    <!-- ═══ MAIN REPORT ═══ -->
    <div class="report-main">
      <!-- PanCROcio comment + Score -->
      <div style="background:white;border-radius:0 0 20px 20px;padding:32px;margin-bottom:24px;text-align:center;box-shadow:0 4px 24px rgba(7,15,45,0.08);border-top:4px solid #EC5F29">
        ${renderScoreGauge(globalScore)}
        <div style="margin-top:16px;background:linear-gradient(135deg,#fff7ed,#fef3e2);border-radius:12px;padding:16px 20px;border:1px solid #fed7aa;display:inline-block;max-width:500px">
          <p style="font-size:14px;color:#070F2D;line-height:1.6;margin:0">
            ${scoreEmoji(globalScore)} <strong>PanCROcio dice:</strong> "${pancrocioComment(globalScore)}"
          </p>
        </div>
      </div>

      <!-- Category Scores -->
      <div style="background:white;border-radius:20px;padding:28px;margin-bottom:24px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        <h2 style="font-size:18px;margin-bottom:20px;color:#070F2D;font-weight:700">Puntuaciones por Categoria</h2>
        ${categoryBars}
      </div>

      <!-- QuickWins -->
      ${quickWins.length > 0 ? `
      <div style="margin-bottom:32px">
        <div class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F680}</div>
          <div>
            <h2 style="font-size:22px;color:#070F2D;font-weight:800;margin:0">Top Quick Wins</h2>
            <p style="color:#46495C;font-size:13px;margin:0">Mejoras de alto impacto y bajo esfuerzo</p>
          </div>
        </div>
        ${quickWinCards}
      </div>
      ` : ''}

      <!-- Wireframe Mockups -->
      ${mockups.length > 0 ? `
      <div style="margin-bottom:32px">
        <div class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="background:#070F2D;color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F3A8}</div>
          <div>
            <h2 style="font-size:22px;color:#070F2D;font-weight:800;margin:0">Mejoras Propuestas</h2>
            <p style="color:#46495C;font-size:13px;margin:0">Wireframes visuales de los cambios sugeridos</p>
          </div>
        </div>
        ${mockups.map((m) => `
          <div style="background:white;border-radius:20px;padding:24px;margin-bottom:20px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
              <span style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700">QUICK WIN #${m.relatedQuickWin}</span>
              <h3 style="margin:0;font-size:16px;color:#070F2D;font-weight:700">${m.title}</h3>
            </div>
            <p style="color:#46495C;font-size:13px;margin-bottom:16px;line-height:1.5">${escapeHtml(m.description)}</p>
            <div style="border:2px solid #e2e4ea;border-radius:12px;overflow:hidden;background:#fafbfc;padding:16px">
              ${sanitizeMockupHtml(m.htmlContent)}
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Detailed Analysis -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">
        <div class="section-heading" style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
          <div style="background:#070F2D;color:white;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\u{1F50D}</div>
          <h2 style="font-size:22px;color:#070F2D;font-weight:800;margin:0">Analisis Detallado</h2>
        </div>
        ${detailSections}
      </div>

      <!-- ═══ CONTACT FORM (bottom) ═══ -->
      <div id="contactSection" class="contact-bottom" style="background:#070F2D;border-radius:20px;padding:40px 32px;margin-top:32px;box-shadow:0 4px 24px rgba(7,15,45,0.15)">
        <div style="text-align:center;margin-bottom:24px">
          <div style="margin-bottom:8px">${PANCROCIO_SVG}</div>
          <h2 style="font-size:24px;color:white;font-weight:800;margin-bottom:6px">Quieres mejorar tu conversion?</h2>
          <p style="color:rgba(255,255,255,0.65);font-size:14px;max-width:420px;margin:0 auto">PanCROcio ha encontrado oportunidades. Contactanos y te ayudamos a implementar estas mejoras.</p>
        </div>
        <div class="contact-bottom-inner" style="background:white;border-radius:16px;padding:28px;max-width:480px;margin:0 auto">
          <form class="lead-form" id="contactForm" onsubmit="return handleContactSubmit(event, 'contactForm')">
            <div class="field">
              <label for="cf_name">Nombre / Empresa</label>
              <input type="text" id="cf_name" name="name" placeholder="Nombre / Empresa" required>
            </div>
            <div class="field">
              <label for="cf_email">Email</label>
              <input type="email" id="cf_email" name="email" placeholder="tu@empresa.com" required>
            </div>
            <div class="field">
              <label for="cf_message">Mensaje</label>
              <textarea id="cf_message" name="message" rows="3" placeholder="Quiero mejorar la conversion de mi web..." required></textarea>
            </div>
            <div class="privacy-row">
              <input type="checkbox" id="cf_privacy" name="privacy" required>
              <label for="cf_privacy" style="font-size:11px;font-weight:400;margin:0">He leido y acepto la <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank">politica de privacidad</a></label>
            </div>
            <button type="submit">Quiero mejorar mi conversion</button>
          </form>
          <div class="form-success" id="contactFormSuccess" style="display:none">
            <div class="check">\u2713</div>
            <h3 style="font-size:18px;color:#070F2D;margin-bottom:4px">Gracias por contactarnos!</h3>
            <p style="font-size:13px;color:#46495C">Te responderemos en menos de 24h.</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align:center;margin-top:24px;padding:16px;color:#9ca3af;font-size:12px">
        <p>Generado por <strong style="color:#EC5F29">PanCROcio</strong> &middot; Powered by <strong style="color:#070F2D">Boost</strong></p>
      </div>
    </div>

    <!-- ═══ DESKTOP SIDEBAR (sticky) ═══ -->
    <div class="sidebar-lead">
      <div style="text-align:center;margin-bottom:16px">
        ${PANCROCIO_SVG.replace('width="80" height="96"', 'width="56" height="67"')}
        <h3 style="font-size:15px;color:#070F2D;font-weight:800;margin-top:8px">Necesitas ayuda?</h3>
        <p style="font-size:12px;color:#46495C;margin-top:4px;line-height:1.4">Implementamos estas mejoras por ti. Escrbenos y te contamos como.</p>
      </div>
      <form class="lead-form" id="sidebarForm" onsubmit="return handleContactSubmit(event, 'sidebarForm')">
        <div class="field">
          <label for="sf_name">Nombre</label>
          <input type="text" id="sf_name" name="name" placeholder="Tu nombre" required>
        </div>
        <div class="field">
          <label for="sf_email">Email</label>
          <input type="email" id="sf_email" name="email" placeholder="tu@empresa.com" required>
        </div>
        <div class="field">
          <label for="sf_message">Mensaje</label>
          <textarea id="sf_message" name="message" rows="2" placeholder="Quiero mejorar..." required></textarea>
        </div>
        <div class="privacy-row">
          <input type="checkbox" id="sf_privacy" name="privacy" required>
          <label for="sf_privacy" style="font-size:11px;font-weight:400;margin:0">Acepto la <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank">privacidad</a></label>
        </div>
        <button type="submit">Contactar</button>
      </form>
      <div class="form-success" id="sidebarFormSuccess" style="display:none">
        <div class="check">\u2713</div>
        <h3 style="font-size:15px;color:#070F2D;margin-bottom:4px">Enviado!</h3>
        <p style="font-size:12px;color:#46495C">Te escribimos pronto.</p>
      </div>
      <div style="text-align:center;margin-top:14px;padding-top:14px;border-top:1px solid #e2e4ea">
        <p style="font-size:10px;color:#9ca3af">Powered by <strong style="color:#070F2D">Boost</strong></p>
      </div>
    </div>
  </div>

  <!-- ═══ MOBILE: Floating Bubble ═══ -->
  <button class="mobile-bubble" id="mobileBubble" onclick="openMobileForm()" aria-label="Contactar">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  </button>

  <!-- MOBILE: Overlay + Popup -->
  <div class="mobile-overlay" id="mobileOverlay" onclick="closeMobileForm()"></div>
  <div class="mobile-lead-popup" id="mobilePopup">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        ${PANCROCIO_SVG.replace('width="80" height="96"', 'width="40" height="48"')}
        <div>
          <h3 style="font-size:16px;color:#070F2D;font-weight:800;margin:0">Mejora tu web</h3>
          <p style="font-size:12px;color:#46495C;margin:0">PanCROcio te ayuda</p>
        </div>
      </div>
      <button onclick="closeMobileForm()" style="background:none;border:none;font-size:24px;color:#9ca3af;cursor:pointer;padding:4px">&times;</button>
    </div>
    <form class="lead-form" id="mobileForm" onsubmit="return handleContactSubmit(event, 'mobileForm')">
      <div class="field">
        <label for="mf_name">Nombre / Empresa</label>
        <input type="text" id="mf_name" name="name" placeholder="Nombre / Empresa" required>
      </div>
      <div class="field">
        <label for="mf_email">Email</label>
        <input type="email" id="mf_email" name="email" placeholder="tu@empresa.com" required>
      </div>
      <div class="field">
        <label for="mf_message">Mensaje</label>
        <textarea id="mf_message" name="message" rows="2" placeholder="Quiero mejorar la conversion..." required></textarea>
      </div>
      <div class="privacy-row">
        <input type="checkbox" id="mf_privacy" name="privacy" required>
        <label for="mf_privacy" style="font-size:11px;font-weight:400;margin:0">Acepto la <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank">politica de privacidad</a></label>
      </div>
      <button type="submit">Quiero mejorar mi conversion</button>
    </form>
    <div class="form-success" id="mobileFormSuccess" style="display:none">
      <div class="check">\u2713</div>
      <h3 style="font-size:16px;color:#070F2D;margin-bottom:4px">Gracias!</h3>
      <p style="font-size:13px;color:#46495C">Te contactaremos pronto.</p>
    </div>
  </div>

  <script>
    function openMobileForm() {
      document.getElementById('mobileOverlay').style.display = 'block';
      document.getElementById('mobilePopup').style.display = 'block';
      setTimeout(function() {
        document.getElementById('mobileOverlay').classList.add('open');
        document.getElementById('mobilePopup').classList.add('open');
      }, 10);
    }
    function closeMobileForm() {
      document.getElementById('mobileOverlay').classList.remove('open');
      document.getElementById('mobilePopup').classList.remove('open');
      setTimeout(function() {
        document.getElementById('mobileOverlay').style.display = 'none';
        document.getElementById('mobilePopup').style.display = 'none';
      }, 300);
    }

    function handleContactSubmit(e, formId) {
      e.preventDefault();
      var form = document.getElementById(formId);
      var data = new FormData(form);
      var payload = {
        name: data.get('name'),
        email: data.get('email'),
        message: data.get('message'),
        privacy: true,
        source: 'pancrocio-report',
        auditUrl: '${urlJs}'
      };

      var btn = form.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      fetch('https://www.weareboost.online/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Error');
        form.style.display = 'none';
        document.getElementById(formId + 'Success').style.display = 'block';
        if (formId === 'mobileForm') {
          document.getElementById('mobileBubble').style.display = 'none';
        }
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = 'Reintentar';
        alert('Error al enviar. Intentalo de nuevo.');
      });
      return false;
    }
  </script>
</body>
</html>`;
}
