/**
 * Translatable UI strings and locale helpers for the report template.
 */

import type { CategoryScores } from '../../models/interfaces.js';

/** Translatable UI labels used in the report template. */
export interface ReportUiStrings {
  reportSubtitle: string;
  brandSays: string;
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
  brandCommentExcellent: string;
  brandCommentGood: string;
  brandCommentFair: string;
  brandCommentPoor: string;
  // Category labels (translatable)
  catVisualHierarchy: string;
  catUxHeuristics: string;
  catCopyMessaging: string;
  catTrustSignals: string;
  catMobileExperience: string;
  catPerformance: string;
  downloadPdfButton: string;
  // Impact + severity badges (translatable)
  impactHigh: string;
  impactMedium: string;
  impactLow: string;
  severityCritical: string;
  severityWarning: string;
  severityInfo: string;
}

export const DEFAULT_UI_STRINGS: ReportUiStrings = {
  reportSubtitle: 'Informe de Auditor\u00eda CRO',
  brandSays: 'Resultado del an\u00e1lisis:',
  scoresByCategoryTitle: 'Puntuaciones por Categor\u00eda',
  topQuickWinsTitle: 'Quick Wins Principales',
  topQuickWinsSubtitle: 'Mejoras de alto impacto y bajo esfuerzo',
  problemLabel: 'Problema:',
  recommendationLabel: 'Recomendaci\u00f3n:',
  proposedImprovementsTitle: 'Mejoras Propuestas',
  proposedImprovementsSubtitle: 'Wireframes visuales de los cambios sugeridos',
  quickWinPrefix: 'QUICK WIN',
  detailedAnalysisTitle: 'An\u00e1lisis Detallado',
  ctaTitle: '\u00bfQuieres mejorar tu conversi\u00f3n?',
  ctaSubtitle: 'Hemos detectado oportunidades de mejora en tu web. Cont\u00e1ctanos y te ayudamos a implementarlas.',
  formNameLabel: 'Nombre / Empresa',
  formNamePlaceholder: 'Nombre / Empresa',
  formEmailLabel: 'Email',
  formMessageLabel: 'Mensaje',
  formMessagePlaceholderLong: 'Quiero mejorar la conversi\u00f3n de mi web...',
  formMessagePlaceholderShort: 'Quiero mejorar...',
  formPrivacyAccept: 'He le\u00eddo y acepto la pol\u00edtica de privacidad',
  formPrivacyAcceptShort: 'Acepto la privacidad',
  formSubmitMain: 'Quiero mejorar mi conversi\u00f3n',
  formSubmitShort: 'Contactar',
  formSendingButton: 'Enviando...',
  formRetryButton: 'Reintentar',
  formErrorAlert: 'Error al enviar. Int\u00e9ntalo de nuevo.',
  formSuccessTitle: 'Gracias por contactarnos!',
  formSuccessSubtitle: 'Te responderemos en menos de 24h.',
  sidebarTitle: '\u00bfNecesitas ayuda?',
  sidebarSubtitle: 'Implementamos estas mejoras por ti. Escr\u00edbenos y te contamos c\u00f3mo.',
  sidebarFormNameLabel: 'Nombre',
  sidebarFormNamePlaceholder: 'Tu nombre',
  sidebarFormMessagePlaceholder: 'Quiero mejorar...',
  sidebarSuccessTitle: 'Enviado!',
  sidebarSuccessSubtitle: 'Te escribimos pronto.',
  mobileTitle: 'Mejora tu web',
  mobileSubtitle: 'Mejora tu conversi\u00f3n',
  mobileSuccessTitle: 'Gracias!',
  mobileSuccessSubtitle: 'Te contactaremos pronto.',
  footerGeneratedBy: 'Generado por',
  poweredBy: 'Powered by',
  brandCommentExcellent: '\u00a1Tu sitio se ve genial! Solo unos retoques y estar\u00e1s convirtiendo como un profesional.',
  brandCommentGood: '\u00a1Base s\u00f3lida! He encontrado \u00e1reas clave donde peque\u00f1os cambios pueden marcar la diferencia.',
  brandCommentFair: 'Hay potencial real aqu\u00ed. D\u00e9jame mostrarte los quick wins que mover\u00e1n la aguja.',
  brandCommentPoor: 'No te preocupes \u2014 todo gran sitio empez\u00f3 en alg\u00fan lugar. Estas son las mejoras de alto impacto a priorizar.',
  catVisualHierarchy: 'Jerarqu\u00eda Visual',
  catUxHeuristics: 'Heur\u00edsticas UX',
  catCopyMessaging: 'Copy y Mensajes',
  catTrustSignals: 'Se\u00f1ales de Confianza',
  catMobileExperience: 'Experiencia M\u00f3vil',
  catPerformance: 'Rendimiento',
  downloadPdfButton: 'Descargar PDF',
  impactHigh: 'IMPACTO ALTO',
  impactMedium: 'IMPACTO MEDIO',
  impactLow: 'IMPACTO BAJO',
  severityCritical: 'CR\u00cdTICO',
  severityWarning: 'AVISO',
  severityInfo: 'INFO',
};

/** Map a category key to its translated label using a uiStrings object. */
export function categoryLabel(key: keyof CategoryScores, ui: ReportUiStrings): string {
  switch (key) {
    case 'visualHierarchy': return ui.catVisualHierarchy;
    case 'uxHeuristics': return ui.catUxHeuristics;
    case 'copyMessaging': return ui.catCopyMessaging;
    case 'trustSignals': return ui.catTrustSignals;
    case 'mobileExperience': return ui.catMobileExperience;
    case 'performance': return ui.catPerformance;
  }
}

export function normalizeShortLang(code: string | undefined): string {
  const lc = (code || 'es').toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(lc) ? lc : 'es';
}
