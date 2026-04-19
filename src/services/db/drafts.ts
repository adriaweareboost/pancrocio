import { getDb, rowsToRecords, rowToRecord } from './shared.js';

// ─── Email Drafts Pipeline ───

export function createEmailDraft(draft: {
  id: string; campaignName: string; toEmail: string; toName?: string;
  subject: string; html: string; textFallback?: string;
  leadTaskId?: string; auditId?: string; auditScore?: number; variant?: string;
}): void {
  const db = getDb();
  db.run(
    `INSERT INTO email_drafts (id, campaign_name, to_email, to_name, subject, html, text_fallback, lead_task_id, audit_id, audit_score, variant, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [draft.id, draft.campaignName, draft.toEmail, draft.toName ?? null,
     draft.subject, draft.html, draft.textFallback ?? null,
     draft.leadTaskId ?? null, draft.auditId ?? null, draft.auditScore ?? null,
     draft.variant ?? null, new Date().toISOString()]
  );
}

export function listEmailDrafts(status?: string): Array<Record<string, unknown>> {
  const db = getDb();
  const where = status ? `WHERE status = ?` : '';
  const params = status ? [status] : [];
  const result = db.exec(`SELECT id, campaign_name, to_email, to_name, subject, lead_task_id, audit_score, variant, status, created_at, sent_at FROM email_drafts ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rowsToRecords(result);
}

export function getEmailDraft(id: string): Record<string, unknown> | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM email_drafts WHERE id = ?`, [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToRecord(result[0].columns, result[0].values[0]);
}

export function updateEmailDraftStatus(id: string, status: string, sentEmailId?: string): void {
  const db = getDb();
  if (sentEmailId) {
    db.run(`UPDATE email_drafts SET status = ?, sent_email_id = ?, sent_at = ? WHERE id = ?`,
      [status, sentEmailId, new Date().toISOString(), id]);
  } else {
    db.run(`UPDATE email_drafts SET status = ?, reviewed_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id]);
  }
}

export function deleteEmailDraft(id: string): void {
  const db = getDb();
  db.run(`DELETE FROM email_drafts WHERE id = ?`, [id]);
}

export function getEmailDraftStats(): Record<string, number> {
  const db = getDb();
  const result = db.exec(`SELECT status, COUNT(*) as count FROM email_drafts GROUP BY status`);
  const stats: Record<string, number> = { draft: 0, pending: 0, sent: 0, rejected: 0 };
  if (result.length > 0) {
    result[0].values.forEach((row: unknown[]) => { stats[row[0] as string] = row[1] as number; });
  }
  return stats;
}
