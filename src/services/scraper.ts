import { chromium, Browser } from 'playwright';
import type { ScrapingResult, MetaTag } from '../models/interfaces.js';

let browser: Browser | null = null;

export async function initBrowser(): Promise<void> {
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
  });
  browser.on('disconnected', () => {
    console.warn('[Browser] Disconnected — will relaunch on next request');
    browser = null;
  });
}

export async function closeBrowser(): Promise<void> {
  if (browser) await browser.close();
  browser = null;
}

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = null;
    await initBrowser();
  }
  return browser!;
}

export async function scrapeUrl(url: string): Promise<ScrapingResult> {
  const b = await getBrowser();

  const context = await b.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    const startTime = Date.now();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Brief wait for above-the-fold rendering (images, fonts) without waiting for all network
    await page.waitForTimeout(1500);
    const loadTimeMs = Date.now() - startTime;

    // Above-the-fold only (viewport screenshot, NOT full page) — much smaller image
    const screenshotDesktop = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 60 });
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
    const screenshotMobile = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 60 });

    return {
      html: truncatedHtml,
      screenshotDesktop: screenshotDesktop as Buffer,
      screenshotMobile: screenshotMobile as Buffer,
      metaTags,
      pageTitle,
      loadTimeMs,
    };
  } finally {
    await context.close();
  }
}
