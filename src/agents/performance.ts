import type { CROAgent, AgentInput, AgentAnalysis, Finding, Score } from '../models/interfaces.js';

export function createPerformanceAgent(): CROAgent {
  return {
    name: 'Performance Agent',
    category: 'performance',

    async analyze(input: AgentInput): Promise<AgentAnalysis> {
      const start = Date.now();
      const findings: Finding[] = [];
      let score = 100;

      // Load time analysis
      const loadTime = input.loadTimeMs || 0;
      if (loadTime > 5000) {
        score -= 30;
        findings.push({
          title: 'Very slow page load',
          description: `Page took ${(loadTime / 1000).toFixed(1)}s to load. Users abandon pages after 3 seconds.`,
          severity: 'critical',
          element: 'Full page',
          recommendation: 'Optimize images, minimize JS/CSS, enable compression, use CDN.',
        });
      } else if (loadTime > 3000) {
        score -= 15;
        findings.push({
          title: 'Slow page load',
          description: `Page took ${(loadTime / 1000).toFixed(1)}s to load.`,
          severity: 'warning',
          element: 'Full page',
          recommendation: 'Target under 3s: optimize images, lazy load below-the-fold content.',
        });
      } else {
        findings.push({
          title: 'Good load time',
          description: `Page loaded in ${(loadTime / 1000).toFixed(1)}s.`,
          severity: 'info',
          element: 'Full page',
          recommendation: 'Load time is acceptable. Monitor with Core Web Vitals.',
        });
      }

      // HTML size analysis
      const htmlSize = Buffer.byteLength(input.html, 'utf-8');
      if (htmlSize > 300_000) {
        score -= 15;
        findings.push({
          title: 'Heavy HTML document',
          description: `HTML is ${(htmlSize / 1024).toFixed(0)}KB. Large HTML increases parse time.`,
          severity: 'warning',
          element: 'HTML document',
          recommendation: 'Remove unused code, inline critical CSS only, defer non-critical resources.',
        });
      }

      // Image analysis from HTML
      const imgCount = (input.html.match(/<img/gi) || []).length;
      const lazyCount = (input.html.match(/loading=["']lazy["']/gi) || []).length;
      if (imgCount > 5 && lazyCount < imgCount / 2) {
        score -= 10;
        findings.push({
          title: 'Images not lazy-loaded',
          description: `Found ${imgCount} images but only ${lazyCount} use lazy loading.`,
          severity: 'warning',
          element: 'Images',
          recommendation: `Add loading="lazy" to images below the fold (${imgCount - lazyCount} images).`,
        });
      }

      // Meta viewport check
      if (!input.html.includes('viewport')) {
        score -= 20;
        findings.push({
          title: 'Missing viewport meta tag',
          description: 'No viewport meta tag found. Critical for mobile rendering.',
          severity: 'critical',
          element: '<head>',
          recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
        });
      }

      return {
        agentName: 'Performance Agent',
        category: 'performance',
        score: { value: Math.max(0, score), label: scoreToLabel(Math.max(0, score)) },
        findings,
        executionTimeMs: Date.now() - start,
      };
    },
  };
}

function scoreToLabel(score: number): Score['label'] {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 30) return 'poor';
  return 'critical';
}
