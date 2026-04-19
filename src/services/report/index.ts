/**
 * Report module — barrel export.
 */

export type { ReportUiStrings } from './i18n.js';
export { DEFAULT_UI_STRINGS, categoryLabel, normalizeShortLang } from './i18n.js';
export type { ReportInput } from './types.js';
export { OG_LOCALES } from './types.js';
export { BRAND_SVG, BRAND_SVG_LIGHT } from './brand-svg.js';
export {
  CATEGORY_ICONS,
  ASSET_VERSION,
  scoreColor,
  scoreEmoji,
  severityBadge,
  impactBadge,
  renderScoreGauge,
  renderCategoryBar,
  brandComment,
} from './helpers.js';
export {
  renderSidebar,
  renderMobilePopup,
  renderContactCta,
  renderQuickWinCards,
  renderDetailSections,
  renderMockups,
} from './sections.js';
export { generateReportHtml } from './generate.js';
