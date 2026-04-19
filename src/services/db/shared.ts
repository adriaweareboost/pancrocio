import { Database } from 'sql.js';
import { writeFile } from 'fs/promises';

let db: Database;

export function getDb(): Database {
  return db;
}

export function setDb(newDb: Database): void {
  db = newDb;
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

/** Convert a sql.js result row (columns + values) into a Record. */
export function rowToRecord(columns: string[], values: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => { obj[col] = values[i]; });
  return obj;
}

/** Convert all rows from a sql.js result set into Records. */
export function rowsToRecords(result: { columns: string[]; values: unknown[][] }[]): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map((row) => rowToRecord(columns, row));
}
