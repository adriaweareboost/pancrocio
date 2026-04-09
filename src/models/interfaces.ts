// CROAgent — Domain Interfaces

// ─── Value Objects ───

export interface Score {
  value: number; // 0-100
  label: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
}

export type ImpactLevel = 'high' | 'medium' | 'low';
export type EffortLevel = 'high' | 'medium' | 'low';

// ─── Entities ───

export interface Lead {
  id: string;
  email: string;
  url: string;
  createdAt: Date;
  auditId: string | null;
}

export interface Audit {
  id: string;
  leadId: string;
  url: string;
  normalizedUrl: string;
  status: AuditStatus;
  scores: CategoryScores | null;
  globalScore: number | null;
  quickWins: QuickWin[];
  mockups: Mockup[];
  reportHtml: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export type AuditStatus =
  | 'pending'
  | 'scraping'
  | 'analyzing'
  | 'synthesizing'
  | 'generating_report'
  | 'completed'
  | 'failed';

// ─── Scraping ───

export interface ScrapingResult {
  html: string;
  screenshotDesktop: Buffer;
  screenshotMobile: Buffer;
  metaTags: MetaTag[];
  pageTitle: string;
  loadTimeMs: number;
}

export interface MetaTag {
  name: string;
  content: string;
}

// ─── Agent Results ───

export interface CategoryScores {
  visualHierarchy: Score;
  uxHeuristics: Score;
  copyMessaging: Score;
  trustSignals: Score;
  mobileExperience: Score;
  performance: Score;
}

export interface AgentAnalysis {
  agentName: string;
  category: keyof CategoryScores;
  score: Score;
  findings: Finding[];
  executionTimeMs: number;
}

export interface Finding {
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  element?: string; // CSS selector or description of the element
  recommendation: string;
}

// ─── QuickWins ───

export interface QuickWin {
  rank: number;
  title: string;
  problem: string;
  recommendation: string;
  impact: ImpactLevel;
  effort: EffortLevel;
  category: keyof CategoryScores;
  priorityScore: number; // Calculated: impact vs effort
}

// ─── Mockups ───

export interface Mockup {
  title: string;
  description: string;
  htmlContent: string; // Self-contained HTML/CSS snippet
  relatedQuickWin: number; // rank reference
}

// ─── Agent Contracts ───

export interface CROAgent {
  name: string;
  category: keyof CategoryScores;
  analyze(input: AgentInput): Promise<AgentAnalysis>;
}

export interface AgentInput {
  url: string;
  html: string;
  screenshotDesktop: Buffer;
  screenshotMobile: Buffer;
  metaTags: MetaTag[];
  loadTimeMs?: number;
}

// ─── LLM Provider ───

export interface LLMProvider {
  name: string;
  generateText(prompt: string): Promise<string>;
  generateWithImage(prompt: string, image: Buffer): Promise<string>;
  generateJSON<T>(prompt: string, schema?: string): Promise<T>;
}

