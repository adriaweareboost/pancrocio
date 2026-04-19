import { getDb, rowsToRecords, rowToRecord } from './shared.js';

// ─── Email Sequences Engine ───

export function createSequence(seq: {
  id: string; leadEmail: string; leadName?: string; domain?: string;
  country: string; campaignName?: string; auditId?: string;
  auditScore?: number; reportUrl?: string;
}): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO email_sequences (id, lead_email, lead_name, domain, country, campaign_name, audit_id, audit_score, report_url, current_step, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
    [seq.id, seq.leadEmail, seq.leadName ?? null, seq.domain ?? null,
     seq.country, seq.campaignName ?? null, seq.auditId ?? null,
     seq.auditScore ?? null, seq.reportUrl ?? null, now, now]
  );
}

export function createSequenceStep(step: {
  id: string; sequenceId: string; stepNumber: number;
  scheduledDate: string; draftId?: string;
}): void {
  const db = getDb();
  db.run(
    `INSERT INTO sequence_steps (id, sequence_id, step_number, scheduled_date, status, draft_id)
     VALUES (?, ?, ?, ?, 'scheduled', ?)`,
    [step.id, step.sequenceId, step.stepNumber, step.scheduledDate, step.draftId ?? null]
  );
}

export function listSequences(status?: string): Array<Record<string, unknown>> {
  const db = getDb();
  const where = status ? `WHERE status = ?` : '';
  const params = status ? [status] : [];
  const result = db.exec(`SELECT * FROM email_sequences ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rowsToRecords(result);
}

export function getSequenceWithSteps(id: string): { sequence: Record<string, unknown> | null; steps: Array<Record<string, unknown>> } {
  const db = getDb();
  const seqResult = db.exec(`SELECT * FROM email_sequences WHERE id = ?`, [id]);
  if (seqResult.length === 0 || seqResult[0].values.length === 0) return { sequence: null, steps: [] };
  const seq = rowToRecord(seqResult[0].columns, seqResult[0].values[0]);

  const stepsResult = db.exec(`SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number`, [id]);
  const steps = rowsToRecords(stepsResult);

  return { sequence: seq, steps };
}

export function getDueSteps(dateStr: string): Array<Record<string, unknown>> {
  const db = getDb();
  const result = db.exec(
    `SELECT ss.*, es.lead_email, es.lead_name, es.domain, es.country, es.audit_score, es.report_url, es.campaign_name
     FROM sequence_steps ss
     JOIN email_sequences es ON ss.sequence_id = es.id
     WHERE ss.status = 'scheduled' AND ss.scheduled_date <= ? AND es.status = 'active'
     ORDER BY ss.scheduled_date`,
    [dateStr]
  );
  return rowsToRecords(result);
}

export function updateStepStatus(id: string, status: string, sentEmailId?: string): void {
  const db = getDb();
  if (sentEmailId) {
    db.run(`UPDATE sequence_steps SET status = ?, sent_email_id = ?, sent_at = ? WHERE id = ?`,
      [status, sentEmailId, new Date().toISOString(), id]);
  } else {
    db.run(`UPDATE sequence_steps SET status = ? WHERE id = ?`, [status, id]);
  }
}

export function markSequenceReplied(sequenceId: string): void {
  const db = getDb();
  db.run(`UPDATE email_sequences SET status = 'replied', replied_at = ?, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), new Date().toISOString(), sequenceId]);
  // Cancel remaining scheduled steps.
  db.run(`UPDATE sequence_steps SET status = 'cancelled' WHERE sequence_id = ? AND status = 'scheduled'`,
    [sequenceId]);
}

export function archiveSequence(sequenceId: string): void {
  const db = getDb();
  db.run(`UPDATE email_sequences SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), new Date().toISOString(), sequenceId]);
}

export function getSequenceStats(): Record<string, number> {
  const db = getDb();
  const result = db.exec(`SELECT status, COUNT(*) as c FROM email_sequences GROUP BY status`);
  const stats: Record<string, number> = { active: 0, replied: 0, archived: 0, completed: 0 };
  if (result.length > 0) {
    result[0].values.forEach((row: unknown[]) => { stats[row[0] as string] = row[1] as number; });
  }
  return stats;
}
