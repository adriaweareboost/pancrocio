import type { Score, Finding, AgentAnalysis, CategoryScores } from '../models/interfaces.js';

export function scoreToLabel(score: number): Score['label'] {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 30) return 'poor';
  return 'critical';
}

export function buildAnalysis(
  agentName: string,
  category: keyof CategoryScores,
  data: { score: number; findings: Finding[] },
  timeMs: number,
): AgentAnalysis {
  const clampedScore = Math.max(0, Math.min(100, Math.round(data.score)));
  return {
    agentName,
    category,
    score: { value: clampedScore, label: scoreToLabel(clampedScore) },
    findings: (data.findings || []).map(f => ({
      title: f.title || '',
      description: f.description || '',
      severity: (f.severity as Finding['severity']) || 'info',
      element: f.element,
      recommendation: f.recommendation || '',
    })),
    executionTimeMs: timeMs,
  };
}
