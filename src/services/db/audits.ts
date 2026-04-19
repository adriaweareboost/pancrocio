import { getDb, rowToRecord } from './shared.js';

// ─── Audit cache by URL (reuse if < 7 days old) ───

export function getRecentAuditByUrl(normalizedUrl: string, days = 7): Record<string, unknown> | null {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.exec(
    `SELECT * FROM audits WHERE normalized_url = ? AND status = 'completed' AND completed_at > ? AND report_html IS NOT NULL AND LENGTH(report_html) > 10000 ORDER BY completed_at DESC LIMIT 1`,
    [normalizedUrl, since],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToRecord(result[0].columns, result[0].values[0]);
}

export function createAudit(
  id: string,
  leadId: string,
  url: string,
  normalizedUrl: string
): void {
  const db = getDb();
  db.run(
    `INSERT INTO audits (id, lead_id, url, normalized_url, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
    [id, leadId, url, normalizedUrl, new Date().toISOString()]
  );
  db.run(`UPDATE leads SET audit_id = ? WHERE id = ?`, [id, leadId]);
}

export function updateAuditStatus(id: string, status: string): void {
  const db = getDb();
  db.run(`UPDATE audits SET status = ? WHERE id = ?`, [status, id]);
}

export function completeAudit(
  id: string,
  globalScore: number,
  scoresJson: string,
  quickWinsJson: string,
  mockupsJson: string,
  analysesJson: string,
  reportHtml: string
): void {
  const db = getDb();
  db.run(
    `UPDATE audits SET status = 'completed', global_score = ?, scores_json = ?, quick_wins_json = ?, mockups_json = ?, analyses_json = ?, report_html = ?, completed_at = ? WHERE id = ?`,
    [globalScore, scoresJson, quickWinsJson, mockupsJson, analysesJson, reportHtml, new Date().toISOString(), id]
  );
}

export function getAudit(id: string): Record<string, unknown> | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM audits WHERE id = ?`, [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToRecord(result[0].columns, result[0].values[0]);
}

export function recoverOrphanedAudits(): number {
  const db = getDb();
  const orphanStatuses = ['pending', 'scraping', 'analyzing', 'synthesizing', 'generating_report'];
  const placeholders = orphanStatuses.map(() => '?').join(',');
  const result = db.exec(
    `SELECT COUNT(*) FROM audits WHERE status IN (${placeholders})`,
    orphanStatuses,
  );
  const count = (result[0]?.values[0]?.[0] as number) || 0;

  if (count > 0) {
    db.run(
      `UPDATE audits SET status = 'failed' WHERE status IN (${placeholders})`,
      orphanStatuses,
    );
  }
  return count;
}

export function deleteAuditByUrl(normalizedUrl: string): boolean {
  const db = getDb();
  const result = db.exec(
    `SELECT id, lead_id FROM audits WHERE normalized_url = ?`,
    [normalizedUrl],
  );
  if (result.length === 0 || result[0].values.length === 0) return false;

  const auditId = result[0].values[0][0] as string;
  const leadId = result[0].values[0][1] as string;

  db.run(`DELETE FROM audit_pdfs WHERE audit_id = ?`, [auditId]);
  db.run(`DELETE FROM audit_translations WHERE audit_id = ?`, [auditId]);
  db.run(`DELETE FROM audits WHERE id = ?`, [auditId]);
  db.run(`DELETE FROM leads WHERE id = ?`, [leadId]);
  return true;
}

// ─── Translation cache (persistent) ───

export function getStoredTranslation(auditId: string, lang: string): string | null {
  const db = getDb();
  const result = db.exec(
    `SELECT html FROM audit_translations WHERE audit_id = ? AND lang = ?`,
    [auditId, lang],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

export function storeTranslation(auditId: string, lang: string, html: string): void {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO audit_translations (audit_id, lang, html, created_at) VALUES (?, ?, ?, ?)`,
    [auditId, lang, html, new Date().toISOString()],
  );
}

// ─── PDF cache (persistent) ───

export function getStoredPdf(auditId: string, lang: string): Buffer | null {
  const db = getDb();
  const result = db.exec(
    `SELECT pdf FROM audit_pdfs WHERE audit_id = ? AND lang = ?`,
    [auditId, lang],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  const blob = result[0].values[0][0];
  if (!blob) return null;
  return Buffer.from(blob as Uint8Array);
}

export function storePdf(auditId: string, lang: string, pdf: Buffer): void {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO audit_pdfs (audit_id, lang, pdf, created_at) VALUES (?, ?, ?, ?)`,
    [auditId, lang, pdf, new Date().toISOString()],
  );
}
