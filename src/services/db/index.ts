// Barrel export — re-exports everything from all db modules.
// The shared module exports internals (getDb, setDb) used by sibling modules;
// we only re-export saveDatabase for external consumers.

export { saveDatabase } from './shared.js';
export { initDatabase } from './schema.js';
export {
  countRecentAuditsByEmail,
  createLead,
  createBatchLead,
  linkLeadToAudit,
  findExistingLead,
  resetLeadVerification,
  setVerifyCode,
  verifyEmailCode,
  isEmailVerified,
  getLeadEmail,
} from './leads.js';
export {
  getRecentAuditByUrl,
  createAudit,
  updateAuditStatus,
  completeAudit,
  getAudit,
  recoverOrphanedAudits,
  deleteAuditByUrl,
  getStoredTranslation,
  storeTranslation,
  getStoredPdf,
  storePdf,
} from './audits.js';
export {
  saveFindings,
  getAnalytics,
} from './findings.js';
export type {
  TopFinding,
  CategoryStats,
  AnalyticsData,
} from './findings.js';
export {
  logError,
  getErrorLog,
  deleteError,
  getErrorStats,
} from './errors.js';
export {
  saveAuditTiming,
  getTimingStats,
} from './timing.js';
export type { AuditTiming } from './timing.js';
export {
  getAllLeads,
  getLeadStats,
  purgeAllAudits,
  setBackupDbPath,
  createBackup,
  cleanupOldBackups,
  listBackups,
  getBackupFile,
  exportDatabase,
  restoreFromBackup,
  startBackupScheduler,
} from './admin.js';
export {
  createSequence,
  createSequenceStep,
  listSequences,
  getSequenceWithSteps,
  getDueSteps,
  updateStepStatus,
  markSequenceReplied,
  archiveSequence,
  getSequenceStats,
} from './sequences.js';
export {
  createEmailDraft,
  listEmailDrafts,
  getEmailDraft,
  updateEmailDraftStatus,
  deleteEmailDraft,
  getEmailDraftStats,
} from './drafts.js';
