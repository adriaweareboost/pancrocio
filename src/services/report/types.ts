/**
 * Report-specific types and interfaces.
 */

import type { CategoryScores } from '../../models/interfaces.js';
import type { ReportUiStrings } from './i18n.js';

export interface ReportInput {
  url: string;
  globalScore: number;
  scores: CategoryScores;
  quickWins: import('../../models/interfaces.js').QuickWin[];
  mockups: import('../../models/interfaces.js').Mockup[];
  analyses: import('../../models/interfaces.js').AgentAnalysis[];
  date: string;
  uiStrings?: ReportUiStrings;
  /** ISO 639-1 short code (e.g. "es", "fr"). Drives <html lang> + og:locale. */
  lang?: string;
  /** Public origin for canonical/OG URLs (e.g. "https://scanandboost.weareboost.online"). */
  siteOrigin?: string;
  /** If set, renders a "Download PDF" button in the header pointing to this URL. */
  pdfUrl?: string;
}

/** Maps short ISO codes to BCP 47 locales used in og:locale. */
export const OG_LOCALES: Record<string, string> = {
  es: 'es_ES', en: 'en_US', fr: 'fr_FR', de: 'de_DE', it: 'it_IT',
  pt: 'pt_PT', nl: 'nl_NL', ca: 'ca_ES', ja: 'ja_JP', zh: 'zh_CN',
};
