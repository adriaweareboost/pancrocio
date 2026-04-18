import initSqlJs, { Database } from 'sql.js';
import { existsSync, readFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';

let db: Database;

export async function initDatabase(dbPath: string): Promise<Database> {
  const SQL = await initSqlJs();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log(`[DB] Loaded existing database from ${dbPath} (${(buffer.length / 1024).toFixed(0)}KB)`);
  } else {
    db = new SQL.Database();
    console.log(`[DB] Created new empty database at ${dbPath} (file did not exist)`);
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
  // Migrate: add source column to leads (batch vs web)
  try {
    db.run(`ALTER TABLE leads ADD COLUMN source TEXT NOT NULL DEFAULT 'web'`);
  } catch { /* column already exists */ }
  // Migrate: add analyses_json column for translator support (re-rendering needs analyses)
  try {
    db.run(`ALTER TABLE audits ADD COLUMN analyses_json TEXT`);
  } catch { /* column already exists */ }

  // ─── Normalized findings table for analytics ───
  db.run(`
    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      element TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )
  `);

  // Index for analytics queries
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_findings_category ON findings(category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_findings_title ON findings(title)`);
  } catch { /* indices may already exist */ }

  // Audit timings table for performance tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_timings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id TEXT NOT NULL,
      url TEXT NOT NULL,
      total_ms INTEGER NOT NULL,
      scrape_ms INTEGER,
      pipeline_ms INTEGER,
      translation_ms INTEGER,
      report_ms INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )
  `);

  // Error log table for post-mortem analysis
  db.run(`
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id TEXT,
      phase TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_stack TEXT,
      url TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Auto-migrate existing audits into findings table
  migrateExistingFindings();

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

  // Email drafts pipeline — prepared emails awaiting review before sending.
  db.run(`
    CREATE TABLE IF NOT EXISTS email_drafts (
      id TEXT PRIMARY KEY,
      campaign_name TEXT NOT NULL,
      to_email TEXT NOT NULL,
      to_name TEXT,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      text_fallback TEXT,
      lead_task_id TEXT,
      audit_id TEXT,
      audit_score INTEGER,
      variant TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_email_id TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      reviewed_at TEXT
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

const INTERNAL_EMAILS = new Set(['avidal82@gmail.com']);

export function getAllLeads(limit = 50, mode: 'web' | 'internal' = 'web'): Record<string, unknown>[] {
  const internalList = [...INTERNAL_EMAILS].map(() => '?').join(',');
  const query = mode === 'internal'
    ? `SELECT l.id, l.email, l.url, l.created_at, l.email_verified, l.audit_id, l.source,
              a.status AS audit_status, a.global_score, a.normalized_url
         FROM leads l LEFT JOIN audits a ON l.audit_id = a.id
        WHERE l.source = 'batch' OR LOWER(l.email) IN (${internalList})
        ORDER BY l.created_at DESC LIMIT ?`
    : `SELECT l.id, l.email, l.url, l.created_at, l.email_verified, l.audit_id, l.source,
              a.status AS audit_status, a.global_score, a.normalized_url
         FROM leads l LEFT JOIN audits a ON l.audit_id = a.id
        WHERE l.source != 'batch' AND LOWER(l.email) NOT IN (${internalList})
        ORDER BY l.created_at DESC LIMIT ?`;
  const params = mode === 'internal'
    ? [...INTERNAL_EMAILS, limit]
    : [...INTERNAL_EMAILS, limit];
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export function getLeadStats(): { total: number; verified: number; completed: number } {
  const internalList = [...INTERNAL_EMAILS].map(() => '?').join(',');
  const filter = `l.source != 'batch' AND LOWER(l.email) NOT IN (${internalList})`;
  const r1 = db.exec(`SELECT COUNT(*) FROM leads l WHERE ${filter}`, [...INTERNAL_EMAILS]);
  const r2 = db.exec(`SELECT COUNT(*) FROM leads l WHERE ${filter} AND l.email_verified = 1`, [...INTERNAL_EMAILS]);
  const r3 = db.exec(`SELECT COUNT(*) FROM audits a JOIN leads l ON l.audit_id = a.id WHERE ${filter} AND a.status = 'completed'`, [...INTERNAL_EMAILS]);
  return {
    total: (r1[0]?.values[0]?.[0] as number) || 0,
    verified: (r2[0]?.values[0]?.[0] as number) || 0,
    completed: (r3[0]?.values[0]?.[0] as number) || 0,
  };
}

export function purgeAllAudits(): number {
  db.run(`DELETE FROM audit_pdfs`);
  db.run(`DELETE FROM audit_translations`);
  db.run(`DELETE FROM audits`);
  db.run(`DELETE FROM leads`);
  const result = db.exec(`SELECT changes()`);
  return (result[0]?.values[0]?.[0] as number) || 0;
}

export function linkLeadToAudit(leadId: string, auditId: string): void {
  db.run(`UPDATE leads SET audit_id = ? WHERE id = ?`, [auditId, leadId]);
}

/** Check if a lead with this email already exists for this domain (normalized URL). */
export function findExistingLead(email: string, normalizedUrl: string): { id: string; audit_id: string } | null {
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

export function createLead(id: string, email: string, url: string): void {
  db.run(
    `INSERT INTO leads (id, email, url, created_at) VALUES (?, ?, ?, ?)`,
    [id, email, url, new Date().toISOString()]
  );
}

/** Create a batch lead — auto-verified, source='batch', no email needed. */
export function createBatchLead(id: string, email: string, url: string): void {
  db.run(
    `INSERT INTO leads (id, email, url, created_at, email_verified, source) VALUES (?, ?, ?, ?, 1, 'batch')`,
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

export function resetLeadVerification(leadId: string): void {
  db.run(`UPDATE leads SET email_verified = 0 WHERE id = ?`, [leadId]);
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
  // Check the MOST RECENT lead for this audit — new visitors must verify even if a previous lead did
  const result = db.exec(
    `SELECT l.email_verified FROM leads l WHERE l.audit_id = ? ORDER BY l.created_at DESC LIMIT 1`,
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

// ─── Audit timings ───

export interface AuditTiming {
  totalMs: number;
  scrapeMs: number;
  pipelineMs: number;
  translationMs: number;
  reportMs: number;
}

export function saveAuditTiming(auditId: string, url: string, timing: AuditTiming): void {
  db.run(
    `INSERT INTO audit_timings (audit_id, url, total_ms, scrape_ms, pipeline_ms, translation_ms, report_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [auditId, url, timing.totalMs, timing.scrapeMs, timing.pipelineMs, timing.translationMs, timing.reportMs, new Date().toISOString()],
  );
}

export function getTimingStats(): {
  avgTotal: number;
  avgScrape: number;
  avgPipeline: number;
  avgTranslation: number;
  avgReport: number;
  count: number;
  recent: Array<{ audit_id: string; url: string; total_ms: number; scrape_ms: number; pipeline_ms: number; translation_ms: number; report_ms: number; created_at: string }>;
} {
  const avgResult = db.exec(`
    SELECT
      ROUND(AVG(total_ms)),
      ROUND(AVG(scrape_ms)),
      ROUND(AVG(pipeline_ms)),
      ROUND(AVG(translation_ms)),
      ROUND(AVG(report_ms)),
      COUNT(*)
    FROM audit_timings
  `);
  const row = avgResult[0]?.values[0] || [0, 0, 0, 0, 0, 0];

  const recentResult = db.exec(
    `SELECT audit_id, url, total_ms, scrape_ms, pipeline_ms, translation_ms, report_ms, created_at
     FROM audit_timings ORDER BY created_at DESC LIMIT 20`,
  );
  const recent = (recentResult[0]?.values || []).map((r) => ({
    audit_id: r[0] as string,
    url: r[1] as string,
    total_ms: r[2] as number,
    scrape_ms: r[3] as number,
    pipeline_ms: r[4] as number,
    translation_ms: r[5] as number,
    report_ms: r[6] as number,
    created_at: r[7] as string,
  }));

  return {
    avgTotal: (row[0] as number) || 0,
    avgScrape: (row[1] as number) || 0,
    avgPipeline: (row[2] as number) || 0,
    avgTranslation: (row[3] as number) || 0,
    avgReport: (row[4] as number) || 0,
    count: (row[5] as number) || 0,
    recent,
  };
}

// ─── Error log ───

export function logError(auditId: string | null, phase: string, error: Error | string, url?: string): void {
  const msg = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack?.slice(0, 500) : null;
  db.run(
    `INSERT INTO error_log (audit_id, phase, error_message, error_stack, url, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [auditId, phase, msg, stack, url || null, new Date().toISOString()],
  );
}

export function getErrorLog(limit = 50): Record<string, unknown>[] {
  const result = db.exec(
    `SELECT id, audit_id, phase, error_message, url, created_at FROM error_log ORDER BY created_at DESC LIMIT ?`,
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

export function deleteError(id: number): boolean {
  db.run(`DELETE FROM error_log WHERE id = ?`, [id]);
  return true;
}

export function getErrorStats(): { phase: string; count: number; lastSeen: string }[] {
  const result = db.exec(`
    SELECT phase, COUNT(*) as cnt, MAX(created_at) as last_seen
    FROM error_log
    GROUP BY phase
    ORDER BY cnt DESC
  `);
  if (result.length === 0) return [];
  return result[0].values.map((r) => ({
    phase: r[0] as string,
    count: r[1] as number,
    lastSeen: r[2] as string,
  }));
}

// ─── Findings: save normalized findings from audit ───

export function saveFindings(auditId: string, url: string, analysesJson: string): void {
  try {
    const analyses = JSON.parse(analysesJson) as Array<{
      category: string;
      findings: Array<{
        title: string;
        description: string;
        severity: string;
        recommendation: string;
        element?: string;
      }>;
    }>;
    const now = new Date().toISOString();
    for (const analysis of analyses) {
      for (const f of analysis.findings) {
        db.run(
          `INSERT INTO findings (audit_id, url, category, title, description, severity, recommendation, element, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [auditId, url, analysis.category, f.title, f.description, f.severity, f.recommendation, f.element || null, now],
        );
      }
    }
  } catch (err) {
    console.warn('[DB] Failed to save findings:', (err as Error).message);
  }
}

/** Migrate existing completed audits into the findings table (runs once on startup). */
function migrateExistingFindings(): void {
  const countResult = db.exec(`SELECT COUNT(*) FROM findings`);
  const existingCount = (countResult[0]?.values[0]?.[0] as number) || 0;
  if (existingCount > 0) return; // already migrated

  const result = db.exec(
    `SELECT id, url, analyses_json FROM audits WHERE status = 'completed' AND analyses_json IS NOT NULL`,
  );
  if (result.length === 0 || result[0].values.length === 0) return;

  let migrated = 0;
  for (const row of result[0].values) {
    const auditId = row[0] as string;
    const url = row[1] as string;
    const analysesJson = row[2] as string;
    if (analysesJson) {
      saveFindings(auditId, url, analysesJson);
      migrated++;
    }
  }
  if (migrated > 0) console.log(`[DB] Migrated findings from ${migrated} existing audits`);
}

// ─── Analytics queries ───

export interface TopFinding {
  title: string;
  count: number;
  severity: string;
  category: string;
}

export interface CategoryStats {
  category: string;
  avgScore: number;
  totalFindings: number;
  criticalCount: number;
  warningCount: number;
}

export interface AnalyticsData {
  topFindings: TopFinding[];
  categoryStats: CategoryStats[];
  severityDistribution: { severity: string; count: number }[];
  scoreDistribution: { range: string; count: number }[];
  totalAudits: number;
  avgGlobalScore: number;
  auditsOverTime: { date: string; count: number }[];
}

export function getAnalytics(): AnalyticsData {
  // Top findings (most common errors)
  const topResult = db.exec(`
    SELECT title, COUNT(*) as cnt, severity, category
    FROM findings
    GROUP BY title
    ORDER BY cnt DESC
    LIMIT 20
  `);
  const topFindings: TopFinding[] = (topResult[0]?.values || []).map((r) => ({
    title: r[0] as string,
    count: r[1] as number,
    severity: r[2] as string,
    category: r[3] as string,
  }));

  // Category stats (avg score + finding counts)
  const catResult = db.exec(`
    SELECT
      f.category,
      ROUND(AVG(CAST(json_extract(a.scores_json, '$.' || f.category || '.value') AS REAL)), 1) as avg_score,
      COUNT(*) as total_findings,
      SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
      SUM(CASE WHEN f.severity = 'warning' THEN 1 ELSE 0 END) as warning_count
    FROM findings f
    LEFT JOIN audits a ON f.audit_id = a.id
    GROUP BY f.category
    ORDER BY total_findings DESC
  `);
  const categoryStats: CategoryStats[] = (catResult[0]?.values || []).map((r) => ({
    category: r[0] as string,
    avgScore: (r[1] as number) || 0,
    totalFindings: r[2] as number,
    criticalCount: r[3] as number,
    warningCount: r[4] as number,
  }));

  // Severity distribution
  const sevResult = db.exec(`
    SELECT severity, COUNT(*) as cnt
    FROM findings
    GROUP BY severity
    ORDER BY cnt DESC
  `);
  const severityDistribution = (sevResult[0]?.values || []).map((r) => ({
    severity: r[0] as string,
    count: r[1] as number,
  }));

  // Score distribution (ranges)
  const scoreResult = db.exec(`
    SELECT
      CASE
        WHEN global_score >= 80 THEN '80-100 (Excellent)'
        WHEN global_score >= 60 THEN '60-79 (Good)'
        WHEN global_score >= 40 THEN '40-59 (Fair)'
        WHEN global_score >= 20 THEN '20-39 (Poor)'
        ELSE '0-19 (Critical)'
      END as range,
      COUNT(*) as cnt
    FROM audits
    WHERE status = 'completed' AND global_score IS NOT NULL
    GROUP BY range
    ORDER BY global_score DESC
  `);
  const scoreDistribution = (scoreResult[0]?.values || []).map((r) => ({
    range: r[0] as string,
    count: r[1] as number,
  }));

  // Total audits + avg score
  const totalResult = db.exec(`
    SELECT COUNT(*), ROUND(AVG(global_score), 1)
    FROM audits WHERE status = 'completed'
  `);
  const totalAudits = (totalResult[0]?.values[0]?.[0] as number) || 0;
  const avgGlobalScore = (totalResult[0]?.values[0]?.[1] as number) || 0;

  // Audits over time (by day)
  const timeResult = db.exec(`
    SELECT DATE(completed_at) as day, COUNT(*) as cnt
    FROM audits
    WHERE status = 'completed' AND completed_at IS NOT NULL
    GROUP BY day
    ORDER BY day DESC
    LIMIT 30
  `);
  const auditsOverTime = (timeResult[0]?.values || []).map((r) => ({
    date: r[0] as string,
    count: r[1] as number,
  })).reverse();

  return {
    topFindings,
    categoryStats,
    severityDistribution,
    scoreDistribution,
    totalAudits,
    avgGlobalScore,
    auditsOverTime,
  };
}

// ─── Database backup system ───

const BACKUP_RETENTION_DAYS = 7;
let backupDbPath: string = '';

export function setBackupDbPath(dbPath: string): void {
  backupDbPath = dbPath;
}

function getBackupDir(): string {
  const dir = join(dirname(backupDbPath || '/app/data/croagent.db'), 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a timestamped backup of the database. Returns the backup filename. */
export async function createBackup(): Promise<string> {
  const data = db.export();
  const buffer = Buffer.from(data);
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `croagent-backup-${timestamp}.db`;
  const filepath = join(backupDir, filename);
  await writeFile(filepath, buffer);
  console.log(`[Backup] Created: ${filename} (${(buffer.length / 1024).toFixed(0)}KB)`);
  return filename;
}

/** Remove backups older than BACKUP_RETENTION_DAYS. */
export function cleanupOldBackups(): number {
  const backupDir = getBackupDir();
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  try {
    const files = readdirSync(backupDir).filter(f => f.startsWith('croagent-backup-') && f.endsWith('.db'));
    for (const file of files) {
      // Parse timestamp from filename: croagent-backup-2026-04-14T12-30-00.db
      const match = file.match(/croagent-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.db/);
      if (match) {
        const fileDate = new Date(match[1].replace(/-/g, (m, i) => i > 9 ? ':' : m));
        if (fileDate.getTime() < cutoff) {
          unlinkSync(join(backupDir, file));
          removed++;
        }
      }
    }
  } catch { /* backup dir may not exist yet */ }

  if (removed > 0) console.log(`[Backup] Cleaned up ${removed} old backups`);
  return removed;
}

/** List all available backups. */
export function listBackups(): Array<{ filename: string; size: number; date: string }> {
  const backupDir = getBackupDir();
  try {
    const files = readdirSync(backupDir)
      .filter(f => f.startsWith('croagent-backup-') && f.endsWith('.db'))
      .sort()
      .reverse();
    return files.map(f => {
      const stat = readFileSync(join(backupDir, f));
      const match = f.match(/croagent-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.db/);
      return {
        filename: f,
        size: stat.length,
        date: match ? match[1].replace(/T/, ' ').replace(/-/g, (m, i) => i > 9 ? ':' : m) : f,
      };
    });
  } catch {
    return [];
  }
}

/** Get a backup file as Buffer for download. */
export function getBackupFile(filename: string): Buffer | null {
  // Sanitize filename to prevent directory traversal
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe.startsWith('croagent-backup-') || !safe.endsWith('.db')) return null;
  const filepath = join(getBackupDir(), safe);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath);
}

/** Export current database as Buffer (for download without creating a file). */
export function exportDatabase(): Buffer {
  const data = db.export();
  return Buffer.from(data);
}

/** Restore database from a backup file. Creates a safety backup of current DB first. */
export async function restoreFromBackup(filename: string): Promise<{ ok: boolean; message: string }> {
  const backupData = getBackupFile(filename);
  if (!backupData) return { ok: false, message: 'Backup not found' };

  // Safety backup of current state before overwriting
  try {
    await createBackup();
  } catch { /* best effort */ }

  try {
    const SQL = await initSqlJs();
    const newDb = new SQL.Database(backupData);
    // Verify it's a valid database by running a simple query
    newDb.exec('SELECT COUNT(*) FROM audits');
    // Replace the live database
    db.close();
    db = newDb;
    // Persist to disk
    const dbPath = backupDbPath || '/app/data/croagent.db';
    await writeFile(dbPath, Buffer.from(db.export()));
    console.log(`[Backup] Restored from ${filename}`);
    return { ok: true, message: `Restored from ${filename}` };
  } catch (err) {
    return { ok: false, message: `Restore failed: ${(err as Error).message}` };
  }
}

/** Start daily backup scheduler. */
export function startBackupScheduler(): void {
  // Initial backup on startup (after 30s to let migrations run)
  setTimeout(async () => {
    try {
      await createBackup();
      cleanupOldBackups();
    } catch (err) {
      console.error('[Backup] Initial backup failed:', (err as Error).message);
    }
  }, 30_000);

  // Daily backup every 24 hours
  setInterval(async () => {
    try {
      await createBackup();
      cleanupOldBackups();
    } catch (err) {
      console.error('[Backup] Scheduled backup failed:', (err as Error).message);
    }
  }, 24 * 60 * 60 * 1000);

  console.log(`[Backup] Scheduler started — daily backups, ${BACKUP_RETENTION_DAYS} days retention`);
}

// ─── Email Drafts Pipeline ───

export function createEmailDraft(draft: {
  id: string; campaignName: string; toEmail: string; toName?: string;
  subject: string; html: string; textFallback?: string;
  leadTaskId?: string; auditId?: string; auditScore?: number; variant?: string;
}): void {
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
  const where = status ? `WHERE status = ?` : '';
  const params = status ? [status] : [];
  const result = db.exec(`SELECT id, campaign_name, to_email, to_name, subject, lead_task_id, audit_score, variant, status, created_at, sent_at FROM email_drafts ${where} ORDER BY created_at DESC LIMIT 200`, params);
  if (result.length === 0) return [];
  return result[0].values.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

export function getEmailDraft(id: string): Record<string, unknown> | null {
  const result = db.exec(`SELECT * FROM email_drafts WHERE id = ?`, [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col: string, i: number) => { obj[col] = result[0].values[0][i]; });
  return obj;
}

export function updateEmailDraftStatus(id: string, status: string, sentEmailId?: string): void {
  if (sentEmailId) {
    db.run(`UPDATE email_drafts SET status = ?, sent_email_id = ?, sent_at = ? WHERE id = ?`,
      [status, sentEmailId, new Date().toISOString(), id]);
  } else {
    db.run(`UPDATE email_drafts SET status = ?, reviewed_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id]);
  }
}

export function deleteEmailDraft(id: string): void {
  db.run(`DELETE FROM email_drafts WHERE id = ?`, [id]);
}

export function getEmailDraftStats(): Record<string, number> {
  const result = db.exec(`SELECT status, COUNT(*) as count FROM email_drafts GROUP BY status`);
  const stats: Record<string, number> = { draft: 0, pending: 0, sent: 0, rejected: 0 };
  if (result.length > 0) {
    result[0].values.forEach((row: unknown[]) => { stats[row[0] as string] = row[1] as number; });
  }
  return stats;
}
