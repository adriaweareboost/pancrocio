import type { AgentAnalysis, Finding } from '../models/interfaces.js';
import type { LLMProvider } from '../models/interfaces.js';
import { buildAnalysis } from '../utils/score.js';

const PROMPT = `You are a world-class CRO (Conversion Rate Optimization) expert. Analyze this website's text content and provide a comprehensive audit covering TWO areas.

## AREA 1: Copy & Messaging (category: copyMessaging)
Evaluate:
- Headline clarity: benefit-driven and compelling?
- Value proposition: immediately clear what's offered and why it matters?
- CTA copy: action-oriented and specific? (not generic "Click here")
- Urgency/scarcity elements
- Benefits vs features focus
- Readability and scanability (short paragraphs, bullets)
- Tone consistency

## AREA 2: UX Heuristics (category: uxHeuristics)
Based on the HTML structure and content, evaluate:
- Navigation clarity and information architecture
- Consistency and standards (standard UI patterns)
- Aesthetic and minimalist design (content density)
- Recognition rather than recall
- Error prevention (forms, clear labels)
- Help and documentation availability
- Accessibility basics (headings structure, alt texts in HTML)

Return a JSON object with this EXACT structure:
{
  "copyMessaging": {
    "score": <0-100>,
    "findings": [
      {"title": "<short>", "description": "<observation with specific quotes from the page>", "severity": "critical|warning|info", "element": "<which element>", "recommendation": "<actionable fix with copy suggestions>"}
    ]
  },
  "uxHeuristics": {
    "score": <0-100>,
    "findings": [...]
  }
}

Be specific. Quote actual text from the page. Include 3-5 findings per area.`;

interface ConsolidatedResult {
  copyMessaging: AgentAnalysis;
  uxHeuristics: AgentAnalysis;
}

export async function runGroqConsolidated(
  html: string,
  url: string,
  groq: LLMProvider,
): Promise<ConsolidatedResult> {
  const start = Date.now();

  // Extract text content from HTML
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);

  // Extract structural info
  const headings = (html.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi) || [])
    .map(h => h.replace(/<[^>]+>/g, '').trim())
    .slice(0, 20)
    .join('\n');

  const links = (html.match(/<a[^>]*>[\s\S]*?<\/a>/gi) || [])
    .map(a => a.replace(/<[^>]+>/g, '').trim())
    .filter(t => t.length > 0)
    .slice(0, 30)
    .join(', ');

  const fullPrompt = `${PROMPT}

Page URL: ${url}

Page headings:
${headings}

Navigation/link texts: ${links}

Page text content:
${textContent}`;

  const parsed = await groq.generateJSON<{
    copyMessaging: { score: number; findings: Finding[] };
    uxHeuristics: { score: number; findings: Finding[] };
  }>(fullPrompt);

  const elapsed = Date.now() - start;

  return {
    copyMessaging: buildAnalysis('Copy Analysis Agent', 'copyMessaging', parsed.copyMessaging, elapsed),
    uxHeuristics: buildAnalysis('UX Heuristics Agent', 'uxHeuristics', parsed.uxHeuristics, elapsed),
  };
}
