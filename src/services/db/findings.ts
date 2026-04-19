import { getDb } from './shared.js';

// ─── Findings: save normalized findings from audit ───

export function saveFindings(auditId: string, url: string, analysesJson: string): void {
  const db = getDb();
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
export function migrateExistingFindings(): void {
  const db = getDb();
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
  const db = getDb();

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
