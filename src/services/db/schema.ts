import initSqlJs from 'sql.js';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import { Database } from 'sql.js';
import { getDb, setDb, saveDatabase } from './shared.js';
import { migrateExistingFindings } from './findings.js';

export async function initDatabase(dbPath: string): Promise<Database> {
  const SQL = await initSqlJs();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let db: Database;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log(`[DB] Loaded existing database from ${dbPath} (${(buffer.length / 1024).toFixed(0)}KB)`);

    // Integrity check — detect corrupted database
    try {
      db.run('SELECT count(*) FROM sqlite_master');
    } catch (err) {
      const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
      console.error(`[DB] Database is corrupted: ${(err as Error).message}`);
      console.error(`[DB] Moving corrupt file to ${corruptPath} and creating fresh database`);
      db.close();
      renameSync(dbPath, corruptPath);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log(`[DB] Created new empty database at ${dbPath} (file did not exist)`);
  }

  setDb(db);

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

  // Normalized findings table for analytics
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

  // Email sequences -- 7-touch cadence engine.
  db.run(`
    CREATE TABLE IF NOT EXISTS email_sequences (
      id TEXT PRIMARY KEY,
      lead_email TEXT NOT NULL,
      lead_name TEXT,
      domain TEXT,
      country TEXT NOT NULL DEFAULT 'ES',
      campaign_name TEXT,
      audit_id TEXT,
      audit_score INTEGER,
      report_url TEXT,
      current_step INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      replied_at TEXT,
      archived_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sequence_steps (
      id TEXT PRIMARY KEY,
      sequence_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      draft_id TEXT,
      sent_email_id TEXT,
      sent_at TEXT,
      opened_at TEXT,
      replied_at TEXT,
      FOREIGN KEY (sequence_id) REFERENCES email_sequences(id) ON DELETE CASCADE
    )
  `);

  // Email drafts pipeline -- prepared emails awaiting review before sending.
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
