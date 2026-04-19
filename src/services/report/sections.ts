/**
 * HTML template sections: sidebar, mobile popup, contact CTA,
 * quick-win cards, detail sections, and mockups.
 */

import type { CategoryScores, QuickWin, AgentAnalysis, Mockup } from '../../models/interfaces.js';
import { escapeHtml, sanitizeMockupHtml } from '../../utils/html.js';
import type { ReportUiStrings } from './i18n.js';
import { categoryLabel } from './i18n.js';
import { BRAND_SVG } from './brand-svg.js';
import { CATEGORY_ICONS, scoreColor, severityBadge, impactBadge } from './helpers.js';

export function renderSidebar(ui: ReportUiStrings): string {
  return `
    <aside class="sidebar-lead" role="complementary" aria-labelledby="sidebar-title">
      <header style="text-align:center;margin-bottom:16px">
        <span aria-hidden="true">${BRAND_SVG.replace('width="80" height="72"', 'width="56" height="50"')}</span>
        <p style="font-size:14px;font-weight:800;margin-top:6px;color:#070F2D;letter-spacing:-0.3px">Scan&amp;<span style="color:#EC5F29">Boost</span></p>
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
          <input type="email" id="sf_email" name="email" placeholder="you@company.com" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="sf_message">${escapeHtml(ui.formMessageLabel)}</label>
          <textarea id="sf_message" name="message" rows="2" placeholder="${escapeHtml(ui.sidebarFormMessagePlaceholder)}" required></textarea>
        </div>
        <div class="privacy-row">
          <input type="checkbox" id="sf_privacy" name="privacy" required>
          <label for="sf_privacy" style="font-size:11px;font-weight:400;margin:0">${escapeHtml(ui.formPrivacyAcceptShort)} <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ui.formPrivacyAccept)}">&rarr;</a></label>
        </div>
        <button type="submit">${escapeHtml(ui.formSubmitShort)}</button>
      </form>
      <div class="form-success" id="sidebarFormSuccess" role="status" aria-live="polite" style="display:none">
        <div class="check" aria-hidden="true">\u2713</div>
        <h3 style="font-size:15px;color:#070F2D;margin-bottom:4px">${escapeHtml(ui.sidebarSuccessTitle)}</h3>
        <p style="font-size:12px;color:#46495C">${escapeHtml(ui.sidebarSuccessSubtitle)}</p>
      </div>
      <footer style="text-align:center;margin-top:14px;padding-top:14px;border-top:1px solid #e2e4ea">
        <p style="font-size:10px;color:#9ca3af">${escapeHtml(ui.poweredBy)} <a href="https://www.weareboost.online" target="_blank" rel="noopener" style="color:#070F2D;text-decoration:none;font-weight:700">Boost</a></p>
      </footer>
    </aside>`;
}

export function renderMobilePopup(ui: ReportUiStrings): string {
  return `
  <button type="button" class="mobile-bubble" id="mobileBubble" onclick="openMobileForm()" aria-label="${escapeHtml(ui.ctaTitle)}" aria-controls="mobilePopup" aria-expanded="false">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  </button>
  <div class="mobile-overlay" id="mobileOverlay" onclick="closeMobileForm()" aria-hidden="true"></div>
  <div class="mobile-lead-popup" id="mobilePopup" role="dialog" aria-modal="true" aria-labelledby="mobile-popup-title">
    <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span aria-hidden="true">${BRAND_SVG.replace('width="80" height="72"', 'width="40" height="36"')}</span>
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
        <input type="email" id="mf_email" name="email" placeholder="you@company.com" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="mf_message">${escapeHtml(ui.formMessageLabel)}</label>
        <textarea id="mf_message" name="message" rows="2" placeholder="${escapeHtml(ui.formMessagePlaceholderLong)}" required></textarea>
      </div>
      <div class="privacy-row">
        <input type="checkbox" id="mf_privacy" name="privacy" required>
        <label for="mf_privacy" style="font-size:11px;font-weight:400;margin:0">${escapeHtml(ui.formPrivacyAccept)} <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ui.formPrivacyAccept)}">&rarr;</a></label>
      </div>
      <button type="submit">${escapeHtml(ui.formSubmitMain)}</button>
    </form>
    <div class="form-success" id="mobileFormSuccess" role="status" aria-live="polite" style="display:none">
      <div class="check" aria-hidden="true">\u2713</div>
      <h3 style="font-size:16px;color:#070F2D;margin-bottom:4px">${escapeHtml(ui.mobileSuccessTitle)}</h3>
      <p style="font-size:13px;color:#46495C">${escapeHtml(ui.mobileSuccessSubtitle)}</p>
    </div>
  </div>`;
}

export function renderContactCta(ui: ReportUiStrings): string {
  return `
      <div id="contactSection" class="contact-bottom" style="background:#070F2D;border-radius:20px;padding:40px 32px;margin-top:32px;box-shadow:0 4px 24px rgba(7,15,45,0.15)">
        <section aria-labelledby="cta-title">
          <header style="text-align:center;margin-bottom:24px">
            <div aria-hidden="true" style="margin-bottom:4px">${BRAND_SVG}</div>
            <p style="font-size:18px;font-weight:800;margin-bottom:8px;color:white;letter-spacing:-0.3px">Scan&amp;<span style="color:#EC5F29">Boost</span></p>
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
                <input type="email" id="cf_email" name="email" placeholder="you@company.com" autocomplete="email" required>
              </div>
              <div class="field">
                <label for="cf_message">${escapeHtml(ui.formMessageLabel)}</label>
                <textarea id="cf_message" name="message" rows="3" placeholder="${escapeHtml(ui.formMessagePlaceholderLong)}" required></textarea>
              </div>
              <div class="privacy-row">
                <input type="checkbox" id="cf_privacy" name="privacy" required>
                <label for="cf_privacy" style="font-size:11px;font-weight:400;margin:0">${escapeHtml(ui.formPrivacyAccept)} <a href="https://www.weareboost.online/es/politica-privacidad" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ui.formPrivacyAccept)}">&rarr;</a></label>
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
      </div>`;
}

export function renderQuickWinCards(quickWins: QuickWin[], ui: ReportUiStrings): string {
  return quickWins.map((qw) => `
    <article aria-labelledby="qw-${qw.rank}-title" style="background:white;border:1px solid #e2e4ea;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(7,15,45,0.06)">
      <header class="qw-card-head" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div aria-hidden="true" style="background:linear-gradient(135deg,#dd974b,#db501a);color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0">${qw.rank}</div>
        <h3 id="qw-${qw.rank}-title" style="margin:0;font-size:16px;color:#070F2D;flex:1;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700">${escapeHtml(qw.title)}</h3>
        <div class="qw-badges" style="display:flex;gap:6px;flex-wrap:wrap">
          ${impactBadge(qw.impact, ui)}
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
}

export function renderDetailSections(analyses: AgentAnalysis[], ui: ReportUiStrings): string {
  return analyses.map((analysis) => {
    const icon = CATEGORY_ICONS[analysis.category] || '';
    const headingId = `cat-${analysis.category}-title`;
    const findings = analysis.findings.map((f, idx) => `
      <article aria-labelledby="cat-${analysis.category}-finding-${idx}" style="border-left:4px solid ${f.severity === 'critical' ? '#dc2626' : f.severity === 'warning' ? '#ea580c' : '#2563eb'};padding:14px 18px;margin-bottom:12px;background:white;border-radius:0 12px 12px 0;box-shadow:0 1px 4px rgba(7,15,45,0.05)">
        <header class="finding-head" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          ${severityBadge(f.severity, ui)}
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
}

export function renderMockups(mockups: Mockup[], ui: ReportUiStrings): string {
  return mockups.map((m, i) => `
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
  `).join('');
}
