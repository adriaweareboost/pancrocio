import type { CategoryScores } from '../models/interfaces.js';

export const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  visualHierarchy: 'Visual Hierarchy',
  uxHeuristics: 'UX Heuristics',
  copyMessaging: 'Copy & Messaging',
  trustSignals: 'Trust Signals',
  mobileExperience: 'Mobile Experience',
  performance: 'Performance',
};
