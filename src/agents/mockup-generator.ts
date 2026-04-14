import type { LLMProvider, QuickWin, Mockup } from '../models/interfaces.js';
import { CATEGORY_LABELS } from '../utils/constants.js';

function buildMockupPromptWithImage(quickWin: QuickWin, url: string): string {
  return `You are an expert UI/UX designer. Look at this website screenshot and create a wireframe mockup showing an improved version.

Website: ${url}
Category: ${CATEGORY_LABELS[quickWin.category] || quickWin.category}

PROBLEM: ${quickWin.title}
${quickWin.problem}

RECOMMENDATION: ${quickWin.recommendation}

Create a SELF-CONTAINED HTML wireframe of the IMPROVED section. Rules:
1. ONLY inline styles, no external CSS/fonts
2. Muted palette: grays (#f8fafc, #e2e8f0, #64748b, #1e293b) + accent #2563eb
3. Realistic text, 600px max width
4. Label "PROPOSED IMPROVEMENT" at top
5. Annotations as small gray italic text

Return ONLY HTML. No markdown, no code blocks. Start with <div>.`;
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
  const topQuickWins = quickWins.slice(0, 1);
  const mockups: Mockup[] = [];

  for (const qw of topQuickWins) {
    try {
      onStatus?.(`  → Generating wireframe for: "${qw.title}"...`);

      // Single vision call: screenshot + mockup instructions (was 2 calls before)
      const prompt = buildMockupPromptWithImage(qw, url);

      let htmlContent: string;
      try {
        htmlContent = await gemini.generateWithImage(prompt, screenshotDesktop);
      } catch {
        // Fallback: text-only with HTML description
        if (fallbackLlm || gemini) {
          const llm = fallbackLlm || gemini;
          const pageDesc = html ? extractPageDescription(html, url) : `Website at ${url}`;
          const textPrompt = prompt.replace('Look at this website screenshot and create', `Based on this page (${pageDesc}), create`);
          htmlContent = await llm.generateText(textPrompt);
        } else {
          throw new Error('Mockup generation failed');
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
