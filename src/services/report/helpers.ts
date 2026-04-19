/**
 * Helper functions for score rendering, badges, and brand comments.
 */

import type { CategoryScores, Score } from '../../models/interfaces.js';
import { escapeHtml } from '../../utils/html.js';
import type { ReportUiStrings } from './i18n.js';

export const CATEGORY_ICONS: Record<keyof CategoryScores, string> = {
  visualHierarchy: '\u{1F3AF}',
  uxHeuristics: '\u{1F9E9}',
  copyMessaging: '\u{270D}\u{FE0F}',
  trustSignals: '\u{1F6E1}\u{FE0F}',
  mobileExperience: '\u{1F4F1}',
  performance: '\u{26A1}',
};

// Static asset cache-busting token — bumped on each server start so the
// browser always fetches the latest CSS/JS even if URL is the same.
export const ASSET_VERSION = String(Date.now());

export function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#EC5F29';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

export function scoreEmoji(score: number): string {
  if (score >= 80) return '\u{1F389}';
  if (score >= 60) return '\u{1F44D}';
  if (score >= 40) return '\u{1F914}';
  return '\u{1F6A8}';
}

export function severityBadge(severity: string, ui: ReportUiStrings): string {
  const styles: Record<string, { bg: string; text: string }> = {
    critical: { bg: '#fef2f2', text: '#dc2626' },
    warning: { bg: '#fff7ed', text: '#ea580c' },
    info: { bg: '#eff6ff', text: '#2563eb' },
  };
  const labels: Record<string, string> = {
    critical: ui.severityCritical,
    warning: ui.severityWarning,
    info: ui.severityInfo,
  };
  const s = styles[severity] || { bg: '#f3f4f6', text: '#6b7280' };
  const label = labels[severity] || severity;
  return `<span style="background:${s.bg};color:${s.text};padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid ${s.text}20">${escapeHtml(label)}</span>`;
}

export function impactBadge(level: string, ui: ReportUiStrings): string {
  const colors: Record<string, string> = { high: '#dc2626', medium: '#ea580c', low: '#16a34a' };
  const labels: Record<string, string> = {
    high: ui.impactHigh,
    medium: ui.impactMedium,
    low: ui.impactLow,
  };
  const c = colors[level] || '#6b7280';
  const label = labels[level] || level;
  return `<span style="background:${c};color:white;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase">${escapeHtml(label)}</span>`;
}

export function renderScoreGauge(score: number): string {
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

export function renderCategoryBar(label: string, key: keyof CategoryScores, score: Score): string {
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

export function brandComment(score: number, ui: ReportUiStrings): string {
  if (score >= 80) return ui.brandCommentExcellent;
  if (score >= 60) return ui.brandCommentGood;
  if (score >= 40) return ui.brandCommentFair;
  return ui.brandCommentPoor;
}
