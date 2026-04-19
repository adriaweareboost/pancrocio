/**
 * Report generator — barrel re-export.
 *
 * The implementation has been split into smaller modules under ./report/.
 * This file preserves the original public API for backward compatibility.
 */

export { generateReportHtml } from './report/generate.js';
export { DEFAULT_UI_STRINGS } from './report/i18n.js';
export type { ReportUiStrings } from './report/i18n.js';
export type { ReportInput } from './report/types.js';
