import initSqlJs from 'sql.js';
import { existsSync, readFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { getDb, setDb, rowToRecord } from './shared.js';

const INTERNAL_EMAILS = new Set(['avidal82@gmail.com']);

// ─── Dashboard / admin queries ───

export function getAllLeads(limit = 50, mode: 'web' | 'internal' = 'web'): Record<string, unknown>[] {
  const db = getDb();
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
  return result[0].values.map((row) => rowToRecord(columns, row));
}

export function getLeadStats(): { total: number; verified: number; completed: number } {
  const db = getDb();
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
  const db = getDb();
  db.run(`DELETE FROM audit_pdfs`);
  db.run(`DELETE FROM audit_translations`);
  db.run(`DELETE FROM audits`);
  db.run(`DELETE FROM leads`);
  const result = db.exec(`SELECT changes()`);
  return (result[0]?.values[0]?.[0] as number) || 0;
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
  const db = getDb();
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
  const db = getDb();
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
    getDb().close();
    setDb(newDb);
    // Persist to disk
    const dbPath = backupDbPath || '/app/data/croagent.db';
    await writeFile(dbPath, Buffer.from(getDb().export()));
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

  console.log(`[Backup] Scheduler started -- daily backups, ${BACKUP_RETENTION_DAYS} days retention`);
}
