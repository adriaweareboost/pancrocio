import { getDb, rowsToRecords } from './shared.js';

// ─── Error log ───

export function logError(auditId: string | null, phase: string, error: Error | string, url?: string): void {
  const db = getDb();
  const msg = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack?.slice(0, 500) : null;
  db.run(
    `INSERT INTO error_log (audit_id, phase, error_message, error_stack, url, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [auditId, phase, msg, stack, url || null, new Date().toISOString()],
  );
}

export function getErrorLog(limit = 50): Record<string, unknown>[] {
  const db = getDb();
  const result = db.exec(
    `SELECT id, audit_id, phase, error_message, url, created_at FROM error_log ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rowsToRecords(result);
}

export function deleteError(id: number): boolean {
  const db = getDb();
  db.run(`DELETE FROM error_log WHERE id = ?`, [id]);
  return true;
}

export function getErrorStats(): { phase: string; count: number; lastSeen: string }[] {
  const db = getDb();
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
