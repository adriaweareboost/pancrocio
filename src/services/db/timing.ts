import { getDb } from './shared.js';

// ─── Audit timings ───

export interface AuditTiming {
  totalMs: number;
  scrapeMs: number;
  pipelineMs: number;
  translationMs: number;
  reportMs: number;
}

export function saveAuditTiming(auditId: string, url: string, timing: AuditTiming): void {
  const db = getDb();
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
  const db = getDb();
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
