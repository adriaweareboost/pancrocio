import type { AgentAnalysis, AgentInput, CategoryScores, QuickWin, Mockup, Score, LLMProvider, ScrapingResult } from '../models/interfaces.js';
import { runGeminiConsolidated } from '../agents/gemini-consolidated.js';
import { runGroqConsolidated } from '../agents/groq-consolidated.js';
import { createPerformanceAgent } from '../agents/performance.js';
import { generateMockups } from '../agents/mockup-generator.js';

const CATEGORY_WEIGHTS: Record<keyof CategoryScores, number> = {
  visualHierarchy: 0.20,
  uxHeuristics: 0.20,
  copyMessaging: 0.20,
  trustSignals: 0.15,
  mobileExperience: 0.15,
  performance: 0.10,
};

export interface PipelineResult {
  analyses: AgentAnalysis[];
  scores: CategoryScores;
  globalScore: number;
  quickWins: QuickWin[];
  mockups: Mockup[];
}

export async function runPipeline(
  scrapingResult: ScrapingResult,
  url: string,
  gemini: LLMProvider,
  onStatus?: (msg: string) => void,
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const input: AgentInput = {
    url,
    html: scrapingResult.html,
    screenshotDesktop: scrapingResult.screenshotDesktop,
    screenshotMobile: scrapingResult.screenshotMobile,
    metaTags: scrapingResult.metaTags,
    loadTimeMs: scrapingResult.loadTimeMs,
  };

  onStatus?.('Running AI analysis (parallel agents)...');

  // Timeout wrapper: fail gracefully after 60s per provider
  const withPipelineTimeout = <T>(promise: Promise<T>, label: string, ms = 60000): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });

  // Run vision and text analysis agents in PARALLEL
  const [geminiResult, groqResult, perfResult] = await Promise.all([
    // 1 Gemini call: visual + trust + mobile
    (async () => {
      onStatus?.('  → Gemini: analyzing visual hierarchy, trust signals, mobile...');
      try {
        const r = await withPipelineTimeout(runGeminiConsolidated(input, gemini), 'Gemini', 120000);
        onStatus?.('  ✓ Gemini analysis done');
        return r;
      } catch (err) {
        console.error('Gemini consolidated failed:', err);
        onStatus?.('  ✗ Gemini analysis failed, using fallback scores');
        return null;
      }
    })(),

    // 1 Groq call: copy + UX heuristics
    (async () => {
      onStatus?.('  → Text analysis: analyzing copy, UX heuristics...');
      try {
        const r = await withPipelineTimeout(runGroqConsolidated(scrapingResult.html, url, gemini), 'Text analysis', 120000);
        onStatus?.('  ✓ Text analysis done');
        return r;
      } catch (err) {
        console.error('Text analysis consolidated failed:', err);
        onStatus?.('  ✗ Text analysis failed, using fallback scores');
        return null;
      }
    })(),

    // Performance (local, instant)
    (async () => {
      const agent = createPerformanceAgent();
      const r = await agent.analyze(input);
      onStatus?.(`  ✓ Performance check done (score: ${r.score.value})`);
      return r;
    })(),
  ]);

  // Collect only successful analyses — failed agents are excluded from the report
  const analyses: AgentAnalysis[] = [];

  if (geminiResult) {
    analyses.push(geminiResult.visualHierarchy, geminiResult.trustSignals, geminiResult.mobileExperience);
  }

  if (groqResult) {
    analyses.push(groqResult.copyMessaging, groqResult.uxHeuristics);
  }

  analyses.push(perfResult);

  // Build category scores (only for categories with real data)
  const availableCategories = new Set(analyses.map(a => a.category));
  const defaultScore: Score = { value: 0, label: 'critical' };
  const scores: CategoryScores = {
    visualHierarchy: availableCategories.has('visualHierarchy') ? findScore(analyses, 'visualHierarchy') : defaultScore,
    uxHeuristics: availableCategories.has('uxHeuristics') ? findScore(analyses, 'uxHeuristics') : defaultScore,
    copyMessaging: availableCategories.has('copyMessaging') ? findScore(analyses, 'copyMessaging') : defaultScore,
    trustSignals: availableCategories.has('trustSignals') ? findScore(analyses, 'trustSignals') : defaultScore,
    mobileExperience: availableCategories.has('mobileExperience') ? findScore(analyses, 'mobileExperience') : defaultScore,
    performance: findScore(analyses, 'performance'),
  };

  // Calculate global score from available categories only (reweight)
  const availableWeights = Object.entries(CATEGORY_WEIGHTS)
    .filter(([key]) => availableCategories.has(key as keyof CategoryScores));
  const totalWeight = availableWeights.reduce((sum, [, w]) => sum + w, 0) || 1;
  const globalScore = Math.round(
    availableWeights.reduce((sum, [key, weight]) => {
      return sum + scores[key as keyof CategoryScores].value * (weight / totalWeight);
    }, 0)
  );

  // Extract quickwins
  const quickWins = extractQuickWins(analyses);

  // Generate mockups only if we have quickwins and time budget left (< 120s elapsed)
  let mockups: Mockup[] = [];
  const elapsedMs = Date.now() - pipelineStart;
  if (quickWins.length > 0 && elapsedMs < 120_000) {
    onStatus?.('Generating wireframe mockup...');
    try {
      mockups = await withPipelineTimeout(
        generateMockups(quickWins, url, gemini, scrapingResult.screenshotDesktop, onStatus, gemini, scrapingResult.html),
        'Mockup',
        45000,
      );
      onStatus?.(`Generated ${mockups.length} wireframe mockup`);
    } catch (err) {
      console.error('Mockup generation failed:', err);
      onStatus?.('Wireframe generation skipped');
    }
  } else {
    onStatus?.('Skipping wireframes to save time');
  }

  return { analyses, scores, globalScore, quickWins, mockups };
}

function findScore(analyses: AgentAnalysis[], category: keyof CategoryScores): Score {
  const analysis = analyses.find((a) => a.category === category);
  return analysis?.score || { value: 50, label: 'fair' };
}

function extractQuickWins(analyses: AgentAnalysis[]): QuickWin[] {
  const allFindings: QuickWin[] = [];

  for (const analysis of analyses) {
    for (const finding of analysis.findings) {
      if (finding.severity === 'info') continue;

      const impact = finding.severity === 'critical' ? 'high' : 'medium';
      // Estimate effort from recommendation complexity
      const recLen = (finding.recommendation || '').length;
      const effort: QuickWin['effort'] = recLen > 200 ? 'high' : recLen > 80 ? 'medium' : 'low';
      const priorityScore =
        (impact === 'high' ? 3 : impact === 'medium' ? 2 : 1) *
        (effort === 'low' ? 3 : effort === 'medium' ? 2 : 1);

      allFindings.push({
        rank: 0,
        title: finding.title,
        problem: finding.description,
        recommendation: finding.recommendation,
        impact: impact as QuickWin['impact'],
        effort,
        category: analysis.category,
        priorityScore,
      });
    }
  }

  return allFindings
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .map((qw, i) => ({ ...qw, rank: i + 1 }));
}
