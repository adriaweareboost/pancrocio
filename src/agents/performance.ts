import type { CROAgent, AgentInput, AgentAnalysis, Finding } from '../models/interfaces.js';
import { scoreToLabel } from '../utils/score.js';

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
          title: 'Carga de página muy lenta',
          description: `La página tardó ${(loadTime / 1000).toFixed(1)}s en cargar. Los usuarios abandonan tras 3 segundos.`,
          severity: 'critical',
          element: 'Página completa',
          recommendation: 'Optimizar imágenes, minimizar JS/CSS, activar compresión, usar CDN.',
        });
      } else if (loadTime > 3000) {
        score -= 15;
        findings.push({
          title: 'Carga de página lenta',
          description: `La página tardó ${(loadTime / 1000).toFixed(1)}s en cargar.`,
          severity: 'warning',
          element: 'Página completa',
          recommendation: 'Objetivo: menos de 3s. Optimizar imágenes, lazy load del contenido below the fold.',
        });
      } else {
        findings.push({
          title: 'Buen tiempo de carga',
          description: `La página cargó en ${(loadTime / 1000).toFixed(1)}s.`,
          severity: 'info',
          element: 'Página completa',
          recommendation: 'El tiempo de carga es aceptable. Monitorizar con Core Web Vitals.',
        });
      }

      // HTML size analysis
      const htmlSize = Buffer.byteLength(input.html, 'utf-8');
      if (htmlSize > 300_000) {
        score -= 15;
        findings.push({
          title: 'Documento HTML pesado',
          description: `El HTML pesa ${(htmlSize / 1024).toFixed(0)}KB. Un HTML grande aumenta el tiempo de parseo.`,
          severity: 'warning',
          element: 'Documento HTML',
          recommendation: 'Eliminar código no usado, solo inline CSS crítico, diferir recursos no críticos.',
        });
      }

      // Image analysis from HTML
      const imgCount = (input.html.match(/<img/gi) || []).length;
      const lazyCount = (input.html.match(/loading=["']lazy["']/gi) || []).length;
      if (imgCount > 5 && lazyCount < imgCount / 2) {
        score -= 10;
        findings.push({
          title: 'Imágenes sin lazy loading',
          description: `Se encontraron ${imgCount} imágenes pero solo ${lazyCount} usan lazy loading.`,
          severity: 'warning',
          element: 'Imágenes',
          recommendation: `Añadir loading="lazy" a las imágenes below the fold (${imgCount - lazyCount} imágenes).`,
        });
      }

      // Meta viewport check
      if (!input.html.includes('viewport')) {
        score -= 20;
        findings.push({
          title: 'Falta meta tag viewport',
          description: 'No se encontró meta tag viewport. Crítico para el renderizado móvil.',
          severity: 'critical',
          element: '<head>',
          recommendation: 'Añadir <meta name="viewport" content="width=device-width, initial-scale=1">',
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
