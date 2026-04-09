import type { AgentAnalysis, AgentInput } from '../models/interfaces.js';
import type { LLMProvider } from '../models/interfaces.js';
import { buildAnalysis } from '../utils/score.js';
import { safeParseLLMJson } from '../utils/llm.js';

const PROMPT = `You are a world-class CRO (Conversion Rate Optimization) expert. Analyze this website screenshot and provide a comprehensive audit covering THREE areas.

## AREA 1: Visual Hierarchy (category: visualHierarchy)
Evaluate:
- Clear visual hierarchy (headings, subheadings, body)
- CTA prominence and identifiability
- F-pattern/Z-pattern reading flow
- Above-the-fold content quality
- Whitespace usage
- Color contrast between key elements

## AREA 2: Trust Signals (category: trustSignals)
Evaluate:
- Social proof (testimonials, reviews, customer logos)
- Trust badges (security seals, certifications, payment icons)
- Guarantees (money-back, free trial, risk-free)
- Contact info visibility (phone, email, chat)
- Professional design credibility
- Transparency (pricing, terms)

## AREA 3: Mobile Experience (category: mobileExperience)
Based on the overall design, evaluate mobile-readiness:
- Responsive layout indicators
- Touch target sizes for buttons/links
- Text readability at smaller viewports
- Navigation simplicity
- Content priority and scanability

Return a JSON object with this EXACT structure:
{
  "visualHierarchy": {
    "score": <0-100>,
    "findings": [
      {"title": "<short>", "description": "<observation>", "severity": "critical|warning|info", "element": "<where>", "recommendation": "<actionable fix>"}
    ]
  },
  "trustSignals": {
    "score": <0-100>,
    "findings": [...]
  },
  "mobileExperience": {
    "score": <0-100>,
    "findings": [...]
  }
}

Be specific and actionable. Focus on conversion impact. Include 3-5 findings per area.
Return ONLY valid JSON. No markdown, no code blocks.`;

interface ConsolidatedResult {
  visualHierarchy: AgentAnalysis;
  trustSignals: AgentAnalysis;
  mobileExperience: AgentAnalysis;
}

export async function runGeminiConsolidated(
  input: AgentInput,
  gemini: LLMProvider,
): Promise<ConsolidatedResult> {
  const start = Date.now();

  const result = await gemini.generateWithImage(PROMPT, input.screenshotDesktop);
  const parsed = safeParseLLMJson<Record<string, { score: number; findings: Array<{ title: string; description: string; severity: 'critical' | 'warning' | 'info'; element?: string; recommendation: string }> }>>(result, 'GeminiConsolidated');
  const elapsed = Date.now() - start;

  return {
    visualHierarchy: buildAnalysis('Visual Hierarchy Agent', 'visualHierarchy', parsed.visualHierarchy, elapsed),
    trustSignals: buildAnalysis('Trust Signals Agent', 'trustSignals', parsed.trustSignals, elapsed),
    mobileExperience: buildAnalysis('Mobile Experience Agent', 'mobileExperience', parsed.mobileExperience, elapsed),
  };
}
