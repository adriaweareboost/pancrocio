import { chromium, Browser } from 'playwright';
import type { ScrapingResult, MetaTag } from '../models/interfaces.js';

let browser: Browser | null = null;

export async function initBrowser(): Promise<void> {
  browser = await chromium.launch({ headless: true });
}

export async function closeBrowser(): Promise<void> {
  if (browser) await browser.close();
}

export async function scrapeUrl(url: string): Promise<ScrapingResult> {
  if (!browser) await initBrowser();

  const context = await browser!.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CROAgent/1.0',
  });

  const page = await context.newPage();
  const startTime = Date.now();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const loadTimeMs = Date.now() - startTime;

  // Above-the-fold only (viewport screenshot, NOT full page) — much smaller image
  const screenshotDesktop = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 70 });
  const pageTitle = await page.title();

  const html = await page.content();
  const truncatedHtml = html.length > 200_000 ? html.slice(0, 200_000) : html;

  const metaTags: MetaTag[] = await page.evaluate(() => {
    const metas = document.querySelectorAll('meta[name], meta[property]');
    return Array.from(metas).map((m) => ({
      name: m.getAttribute('name') || m.getAttribute('property') || '',
      content: m.getAttribute('content') || '',
    }));
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const screenshotMobile = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 70 });

  await context.close();

  return {
    html: truncatedHtml,
    screenshotDesktop: screenshotDesktop as Buffer,
    screenshotMobile: screenshotMobile as Buffer,
    metaTags,
    pageTitle,
    loadTimeMs,
  };
}
