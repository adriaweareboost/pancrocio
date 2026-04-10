import initSqlJs, { Database } from 'sql.js';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';

let db: Database;

export async function initDatabase(dbPath: string): Promise<Database> {
  const SQL = await initSqlJs();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      audit_id TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verify_code TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      global_score INTEGER,
      scores_json TEXT,
      quick_wins_json TEXT,
      mockups_json TEXT,
      analyses_json TEXT,
      report_html TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  // Migrate: add verify columns if missing
  try {
    db.run(`ALTER TABLE leads ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.run(`ALTER TABLE leads ADD COLUMN verify_code TEXT`);
  } catch { /* column already exists */ }
  // Migrate: add analyses_json column for translator support (re-rendering needs analyses)
  try {
    db.run(`ALTER TABLE audits ADD COLUMN analyses_json TEXT`);
  } catch { /* column already exists */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_translations (
      audit_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      html TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (audit_id, lang),
      FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_pdfs (
      audit_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      pdf BLOB NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (audit_id, lang),
      FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )
  `);

  saveDatabase(dbPath);
  return db;
}

let saveInProgress = false;

export async function saveDatabase(dbPath: string): Promise<void> {
  if (saveInProgress) return; // debounce concurrent saves
  saveInProgress = true;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    await writeFile(dbPath, buffer);
  } finally {
    saveInProgress = false;
  }
}

// ─── Rate limiting by email (max 5 audits per 7 days) ───

export function countRecentAuditsByEmail(email: string, days = 7): number {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.exec(
    `SELECT COUNT(*) FROM leads l JOIN audits a ON l.audit_id = a.id WHERE l.email = ? AND a.created_at > ? AND a.status = 'completed'`,
    [email, since],
  );
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return result[0].values[0][0] as number;
}

// ─── Audit cache by URL (reuse if < 7 days old) ───

export function getRecentAuditByUrl(normalizedUrl: string, days = 7): Record<string, unknown> | null {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.exec(
    `SELECT * FROM audits WHERE normalized_url = ? AND status = 'completed' AND completed_at > ? AND report_html IS NOT NULL AND LENGTH(report_html) > 10000 ORDER BY completed_at DESC LIMIT 1`,
    [normalizedUrl, since],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  const columns = result[0].columns;
  const values = result[0].values[0];
  const row: Record<string, unknown> = {};
  columns.forEach((col: string, i: number) => { row[col] = values[i]; });
  return row;
}

// ─── Dashboard / admin queries ───

export function getAllLeads(limit = 50): Record<string, unknown>[] {
  const result = db.exec(
    `SELECT l.id, l.email, l.url, l.created_at, l.email_verified, l.audit_id,
            a.status AS audit_status, a.global_score, a.normalized_url
       FROM leads l
       LEFT JOIN audits a ON l.audit_id = a.id
      ORDER BY l.created_at DESC
      LIMIT ?`,
    [limit],
  );
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export function getLeadStats(): { total: number; verified: number; completed: number } {
  const r1 = db.exec(`SELECT COUNT(*) FROM leads`);
  const r2 = db.exec(`SELECT COUNT(*) FROM leads WHERE email_verified = 1`);
  const r3 = db.exec(`SELECT COUNT(*) FROM audits WHERE status = 'completed'`);
  return {
    total: (r1[0]?.values[0]?.[0] as number) || 0,
    verified: (r2[0]?.values[0]?.[0] as number) || 0,
    completed: (r3[0]?.values[0]?.[0] as number) || 0,
  };
}

export function linkLeadToAudit(leadId: string, auditId: string): void {
  db.run(`UPDATE leads SET audit_id = ? WHERE id = ?`, [auditId, leadId]);
}

export function createLead(id: string, email: string, url: string): void {
  db.run(
    `INSERT INTO leads (id, email, url, created_at) VALUES (?, ?, ?, ?)`,
    [id, email, url, new Date().toISOString()]
  );
}

export function createAudit(
  id: string,
  leadId: string,
  url: string,
  normalizedUrl: string
): void {
  db.run(
    `INSERT INTO audits (id, lead_id, url, normalized_url, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
    [id, leadId, url, normalizedUrl, new Date().toISOString()]
  );
  db.run(`UPDATE leads SET audit_id = ? WHERE id = ?`, [id, leadId]);
}

export function updateAuditStatus(id: string, status: string): void {
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
  db.run(
    `UPDATE audits SET status = 'completed', global_score = ?, scores_json = ?, quick_wins_json = ?, mockups_json = ?, analyses_json = ?, report_html = ?, completed_at = ? WHERE id = ?`,
    [globalScore, scoresJson, quickWinsJson, mockupsJson, analysesJson, reportHtml, new Date().toISOString(), id]
  );
}

export function getAudit(id: string): Record<string, unknown> | null {
  const result = db.exec(`SELECT * FROM audits WHERE id = ?`, [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const columns = result[0].columns;
  const values = result[0].values[0];
  const row: Record<string, unknown> = {};
  columns.forEach((col: string, i: number) => { row[col] = values[i]; });
  return row;
}

export function recoverOrphanedAudits(): number {
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

export function setVerifyCode(leadId: string, code: string): void {
  db.run(`UPDATE leads SET verify_code = ? WHERE id = ?`, [code, leadId]);
}

export function verifyEmailCode(auditId: string, code: string): boolean {
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
  const result = db.exec(
    `SELECT l.email_verified FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = ?`,
    [auditId],
  );
  if (result.length === 0 || result[0].values.length === 0) return false;
  return (result[0].values[0][0] as number) === 1;
}

export function getLeadEmail(auditId: string): string | null {
  const result = db.exec(
    `SELECT l.email FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = ?`,
    [auditId],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

export function deleteAuditByUrl(normalizedUrl: string): boolean {
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
  const result = db.exec(
    `SELECT html FROM audit_translations WHERE audit_id = ? AND lang = ?`,
    [auditId, lang],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

export function storeTranslation(auditId: string, lang: string, html: string): void {
  db.run(
    `INSERT OR REPLACE INTO audit_translations (audit_id, lang, html, created_at) VALUES (?, ?, ?, ?)`,
    [auditId, lang, html, new Date().toISOString()],
  );
}

// ─── PDF cache (persistent) ───

export function getStoredPdf(auditId: string, lang: string): Buffer | null {
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
  db.run(
    `INSERT OR REPLACE INTO audit_pdfs (audit_id, lang, pdf, created_at) VALUES (?, ?, ?, ?)`,
    [auditId, lang, pdf, new Date().toISOString()],
  );
}
