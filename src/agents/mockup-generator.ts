import type { LLMProvider, QuickWin, Mockup } from '../models/interfaces.js';
import { CATEGORY_LABELS } from '../utils/constants.js';

function buildMockupPrompt(quickWin: QuickWin, url: string, pageDescription: string): string {
  return `You are an expert UI/UX designer creating a wireframe mockup to illustrate a CRO improvement.

CONTEXT:
- Website: ${url}
- Current page description: ${pageDescription}
- Category: ${CATEGORY_LABELS[quickWin.category] || quickWin.category}

PROBLEM FOUND:
Title: ${quickWin.title}
Problem: ${quickWin.problem}
Recommendation: ${quickWin.recommendation}

TASK:
Create a SELF-CONTAINED HTML wireframe that shows the IMPROVED version of this specific section.
This is a BEFORE/AFTER wireframe - show what the improved section should look like.

RULES:
1. Use ONLY inline styles (no external CSS/fonts)
2. Use a clean, modern design with good spacing
3. Use a muted color palette: grays (#f8fafc, #e2e8f0, #64748b, #1e293b) with ONE accent color (#2563eb)
4. Include realistic placeholder text (not lorem ipsum)
5. The wireframe should be 600px wide max
6. Add a small label at top: "PROPOSED IMPROVEMENT" in a colored badge
7. Show clear visual hierarchy with the improvement highlighted
8. Keep it simple but professional - this is a wireframe, not a full page redesign
9. Use basic shapes, borders, and background colors to represent UI elements
10. Include annotations as small gray italic text explaining the change

Return ONLY the HTML code. No markdown, no code blocks, no explanation. Start with <div> and end with </div>.`;
}

function extractPageDescription(html: string, url: string): string {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  const h1s = (html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [])
    .map(h => h.replace(/<[^>]+>/g, '').trim())
    .slice(0, 3)
    .join(', ');
  const metaDesc = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';

  return `Website "${url}". Title: "${title}". Main headings: ${h1s || 'N/A'}. ${metaDesc ? `Description: ${metaDesc}` : ''}`.trim();
}

function cleanHtmlResponse(raw: string): string {
  let html = raw
    .replace(/^```html?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  if (!html.startsWith('<')) {
    const firstTag = html.indexOf('<');
    if (firstTag >= 0) {
      html = html.slice(firstTag);
    }
  }

  return html;
}

export async function generateMockups(
  quickWins: QuickWin[],
  url: string,
  gemini: LLMProvider,
  screenshotDesktop: Buffer,
  onStatus?: (msg: string) => void,
  fallbackLlm?: LLMProvider,
  html?: string,
): Promise<Mockup[]> {
  // Try to get page description from Gemini (vision), fallback to HTML parsing
  let pageDescription: string;
  try {
    pageDescription = await gemini.generateWithImage(
      'Describe this website screenshot briefly in 3 sentences. Focus on layout, main sections, colors, and CTAs. Be factual.',
      screenshotDesktop,
    );
  } catch {
    pageDescription = html
      ? extractPageDescription(html, url)
      : `Website at ${url}`;
    console.log('[Mockup] Gemini vision failed, using HTML-based description');
  }

  const topQuickWins = quickWins.slice(0, 1);
  const mockups: Mockup[] = [];

  for (const qw of topQuickWins) {
    try {
      onStatus?.(`  → Generating wireframe for: "${qw.title}"...`);

      const prompt = buildMockupPrompt(qw, url, pageDescription);

      // Try primary LLM first, fallback to secondary
      let htmlContent: string;
      try {
        htmlContent = await gemini.generateText(prompt);
      } catch {
        if (fallbackLlm) {
          console.log('[Mockup] Primary LLM failed, using fallback');
          onStatus?.('  → Switching to fallback LLM for wireframe...');
          htmlContent = await fallbackLlm.generateText(prompt);
        } else {
          throw new Error('Gemini failed and no fallback available');
        }
      }

      htmlContent = cleanHtmlResponse(htmlContent);

      const wrappedHtml = `<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border:2px solid #e2e8f0;border-radius:12px;overflow:hidden;background:white">${htmlContent}</div>`;

      mockups.push({
        title: `Improvement: ${qw.title}`,
        description: qw.recommendation,
        htmlContent: wrappedHtml,
        relatedQuickWin: qw.rank,
      });

      onStatus?.(`  ✓ Wireframe ${mockups.length}/${topQuickWins.length} done`);
    } catch (error) {
      console.error(`Mockup generation failed for "${qw.title}":`, error);
      onStatus?.(`  ✗ Wireframe for "${qw.title}" failed, skipping`);
    }
  }

  return mockups;
}
