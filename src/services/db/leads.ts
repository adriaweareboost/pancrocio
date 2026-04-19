import { getDb } from './shared.js';

// ─── Rate limiting by email (max 5 audits per 7 days) ───

export function countRecentAuditsByEmail(email: string, days = 7): number {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.exec(
    `SELECT COUNT(*) FROM leads l JOIN audits a ON l.audit_id = a.id WHERE l.email = ? AND a.created_at > ? AND a.status = 'completed'`,
    [email, since],
  );
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return result[0].values[0][0] as number;
}

export function createLead(id: string, email: string, url: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO leads (id, email, url, created_at) VALUES (?, ?, ?, ?)`,
    [id, email, url, new Date().toISOString()]
  );
}

/** Create a batch lead -- auto-verified, source='batch', no email needed. */
export function createBatchLead(id: string, email: string, url: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO leads (id, email, url, created_at, email_verified, source) VALUES (?, ?, ?, ?, 1, 'batch')`,
    [id, email, url, new Date().toISOString()]
  );
}

export function linkLeadToAudit(leadId: string, auditId: string): void {
  const db = getDb();
  db.run(`UPDATE leads SET audit_id = ? WHERE id = ?`, [auditId, leadId]);
}

/** Check if a lead with this email already exists for this domain (normalized URL). */
export function findExistingLead(email: string, normalizedUrl: string): { id: string; audit_id: string } | null {
  const db = getDb();
  // Extract domain from normalized URL for comparison
  let domain = normalizedUrl;
  try { domain = new URL(normalizedUrl).hostname; } catch { /* use as-is */ }

  const result = db.exec(
    `SELECT l.id, l.audit_id FROM leads l
     WHERE LOWER(l.email) = LOWER(?)
     AND l.audit_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM audits a WHERE a.id = l.audit_id AND a.normalized_url LIKE ?)
     ORDER BY l.created_at DESC LIMIT 1`,
    [email, `%${domain}%`],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return {
    id: result[0].values[0][0] as string,
    audit_id: result[0].values[0][1] as string,
  };
}

export function resetLeadVerification(leadId: string): void {
  const db = getDb();
  db.run(`UPDATE leads SET email_verified = 0 WHERE id = ?`, [leadId]);
}

export function setVerifyCode(leadId: string, code: string): void {
  const db = getDb();
  db.run(`UPDATE leads SET verify_code = ? WHERE id = ?`, [code, leadId]);
}

export function verifyEmailCode(auditId: string, code: string): boolean {
  const db = getDb();
  // Master code only allowed in non-production environments
  const isMaster = code === '000000' && process.env.NODE_ENV !== 'production';
  const result = db.exec(
    isMaster
      ? `SELECT l.id FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = ?`
      : `SELECT l.id FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = ? AND l.verify_code = ?`,
    isMaster ? [auditId] : [auditId, code],
  );
  if (result.length === 0 || result[0].values.length === 0) return false;
  const leadId = result[0].values[0][0] as string;
  db.run(`UPDATE leads SET email_verified = 1 WHERE id = ?`, [leadId]);
  return true;
}

export function isEmailVerified(auditId: string): boolean {
  const db = getDb();
  // Check the MOST RECENT lead for this audit -- new visitors must verify even if a previous lead did
  const result = db.exec(
    `SELECT l.email_verified FROM leads l WHERE l.audit_id = ? ORDER BY l.created_at DESC LIMIT 1`,
    [auditId],
  );
  if (result.length === 0 || result[0].values.length === 0) return false;
  return (result[0].values[0][0] as number) === 1;
}

export function getLeadEmail(auditId: string): string | null {
  const db = getDb();
  const result = db.exec(
    `SELECT l.email FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = ?`,
    [auditId],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}
