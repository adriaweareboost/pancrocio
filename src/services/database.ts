// PanCROcio database — PostgreSQL via node-postgres (Supabase-hosted).
//
// All functions are async because pg.query is async. The schema is
// idempotent (CREATE TABLE IF NOT EXISTS) so the first server boot
// against a fresh Supabase project bootstraps everything.
//
// Connection string is read from DATABASE_URL (Supabase pooler URI in
// transaction mode). SSL is enabled with relaxed cert verification
// because Supabase pooler uses a wildcard cert.

import pg from 'pg';
const { Pool } = pg;
type PoolType = pg.Pool;

let pool: PoolType | null = null;

function getPool(): PoolType {
  if (!pool) {
    throw new Error('Database not initialised. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Initialise the connection pool and ensure the schema exists.
 * The dbPath argument is kept for backwards compatibility with the
 * SQLite-era signature; it is ignored.
 */
export async function initDatabase(_dbPath?: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      audit_id TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      verify_code TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS leads_audit_id_idx ON leads(audit_id)`);

  await pool.query(`
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS audits_status_idx ON audits(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audits_lead_id_idx ON audits(lead_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_translations (
      audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      lang TEXT NOT NULL,
      html TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (audit_id, lang)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_pdfs (
      audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      lang TEXT NOT NULL,
      pdf BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (audit_id, lang)
    )
  `);
}

/**
 * No-op kept for backwards compatibility with the SQLite era. Postgres
 * persists every committed transaction automatically; callers no longer
 * need to flush state manually.
 */
export async function saveDatabase(_dbPath?: string): Promise<void> {
  // intentional no-op
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Audits / Leads CRUD ───

export async function isUrlAudited(normalizedUrl: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT id FROM audits WHERE normalized_url = $1 AND status = 'completed'`,
    [normalizedUrl],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function createLead(id: string, email: string, url: string): Promise<void> {
  await getPool().query(
    `INSERT INTO leads (id, email, url) VALUES ($1, $2, $3)`,
    [id, email, url],
  );
}

export async function createAudit(
  id: string,
  leadId: string,
  url: string,
  normalizedUrl: string,
): Promise<void> {
  await getPool().query(
    `INSERT INTO audits (id, lead_id, url, normalized_url, status) VALUES ($1, $2, $3, $4, 'pending')`,
    [id, leadId, url, normalizedUrl],
  );
  await getPool().query(`UPDATE leads SET audit_id = $1 WHERE id = $2`, [id, leadId]);
}

export async function updateAuditStatus(id: string, status: string): Promise<void> {
  await getPool().query(`UPDATE audits SET status = $1 WHERE id = $2`, [status, id]);
}

export async function completeAudit(
  id: string,
  globalScore: number,
  scoresJson: string,
  quickWinsJson: string,
  mockupsJson: string,
  analysesJson: string,
  reportHtml: string,
): Promise<void> {
  await getPool().query(
    `UPDATE audits
       SET status = 'completed',
           global_score = $1,
           scores_json = $2,
           quick_wins_json = $3,
           mockups_json = $4,
           analyses_json = $5,
           report_html = $6,
           completed_at = NOW()
     WHERE id = $7`,
    [globalScore, scoresJson, quickWinsJson, mockupsJson, analysesJson, reportHtml, id],
  );
}

export async function countAuditsByEmail(email: string): Promise<number> {
  const result = await getPool().query(
    `SELECT COUNT(*)::int AS count
       FROM leads l
       JOIN audits a ON l.audit_id = a.id
      WHERE l.email = $1`,
    [email],
  );
  return result.rows[0]?.count ?? 0;
}

export async function getAudit(id: string): Promise<Record<string, unknown> | null> {
  const result = await getPool().query(`SELECT * FROM audits WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function recoverOrphanedAudits(): Promise<number> {
  const orphanStatuses = ['pending', 'scraping', 'analyzing', 'synthesizing', 'generating_report'];
  const result = await getPool().query(
    `UPDATE audits SET status = 'failed' WHERE status = ANY($1::text[]) RETURNING id`,
    [orphanStatuses],
  );
  return result.rowCount ?? 0;
}

// ─── Email verification ───

export async function setVerifyCode(leadId: string, code: string): Promise<void> {
  await getPool().query(`UPDATE leads SET verify_code = $1 WHERE id = $2`, [code, leadId]);
}

export async function verifyEmailCode(auditId: string, code: string): Promise<boolean> {
  // Master code only allowed in non-production environments.
  const isMaster = code === '000000' && process.env.NODE_ENV !== 'production';
  const sql = isMaster
    ? `SELECT l.id FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = $1`
    : `SELECT l.id FROM leads l JOIN audits a ON l.audit_id = a.id WHERE a.id = $1 AND l.verify_code = $2`;
  const params = isMaster ? [auditId] : [auditId, code];
  const result = await getPool().query(sql, params);
  if (result.rowCount === 0) return false;
  const leadId = result.rows[0].id as string;
  await getPool().query(`UPDATE leads SET email_verified = true WHERE id = $1`, [leadId]);
  return true;
}

export async function isEmailVerified(auditId: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT l.email_verified
       FROM leads l
       JOIN audits a ON l.audit_id = a.id
      WHERE a.id = $1`,
    [auditId],
  );
  return result.rows[0]?.email_verified === true;
}

export async function getLeadEmail(auditId: string): Promise<string | null> {
  const result = await getPool().query(
    `SELECT l.email
       FROM leads l
       JOIN audits a ON l.audit_id = a.id
      WHERE a.id = $1`,
    [auditId],
  );
  return result.rows[0]?.email ?? null;
}

export async function deleteAuditByUrl(normalizedUrl: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT id, lead_id FROM audits WHERE normalized_url = $1`,
    [normalizedUrl],
  );
  if (result.rowCount === 0) return false;
  const auditId = result.rows[0].id as string;
  const leadId = result.rows[0].lead_id as string;
  // FK ON DELETE CASCADE on audit_pdfs and audit_translations cleans those automatically.
  await getPool().query(`DELETE FROM audits WHERE id = $1`, [auditId]);
  await getPool().query(`DELETE FROM leads WHERE id = $1`, [leadId]);
  return true;
}

// ─── Translation cache (persistent) ───

export async function getStoredTranslation(auditId: string, lang: string): Promise<string | null> {
  const result = await getPool().query(
    `SELECT html FROM audit_translations WHERE audit_id = $1 AND lang = $2`,
    [auditId, lang],
  );
  return result.rows[0]?.html ?? null;
}

export async function storeTranslation(auditId: string, lang: string, html: string): Promise<void> {
  await getPool().query(
    `INSERT INTO audit_translations (audit_id, lang, html) VALUES ($1, $2, $3)
       ON CONFLICT (audit_id, lang) DO UPDATE SET html = EXCLUDED.html, created_at = NOW()`,
    [auditId, lang, html],
  );
}

// ─── PDF cache (persistent, BYTEA blob) ───

export async function getStoredPdf(auditId: string, lang: string): Promise<Buffer | null> {
  const result = await getPool().query(
    `SELECT pdf FROM audit_pdfs WHERE audit_id = $1 AND lang = $2`,
    [auditId, lang],
  );
  const blob = result.rows[0]?.pdf;
  if (!blob) return null;
  return Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
}

export async function storePdf(auditId: string, lang: string, pdf: Buffer): Promise<void> {
  await getPool().query(
    `INSERT INTO audit_pdfs (audit_id, lang, pdf) VALUES ($1, $2, $3)
       ON CONFLICT (audit_id, lang) DO UPDATE SET pdf = EXCLUDED.pdf, created_at = NOW()`,
    [auditId, lang, pdf],
  );
}
