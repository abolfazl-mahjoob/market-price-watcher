import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { SourceConfig } from './config.js';
import type { ObservationReader, PriceObservation } from './model.js';
import { parsePrice } from './price.js';

/** A shared Chromium process; contexts and pages remain isolated per source. */
export class BrowserHost {
  private browser: Browser | null = null;
  async get(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }
  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await browser?.close().catch(() => undefined);
  }
}

export class BrowserSourceReader implements ObservationReader {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  constructor(private readonly source: SourceConfig, private readonly host: BrowserHost) {}

  private async ready(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    await this.reset();
    const browser = await this.host.get();
    const context = await browser.newContext({ javaScriptEnabled: true });
    const allowedOrigin = new URL(this.source.url).origin;

    // Every network request is bounded to the configured origin. This is a
    // conservative allowlist, NOT a DNS-rebinding or network-layer SSRF guarantee.
    await context.route('**/*', async route => {
      let allowed = false;
      try { allowed = new URL(route.request().url()).origin === allowedOrigin; }
      catch { allowed = false; }
      if (allowed) await route.continue();
      else await route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    page.setDefaultTimeout(this.source.timeoutMs);
    this.context = context;
    this.page = page;
    try {
      await page.goto(this.source.url, {
        waitUntil: 'domcontentloaded',
        timeout: this.source.timeoutMs,
      });
      if (new URL(page.url()).origin !== allowedOrigin) {
        throw new Error('Page navigated outside configured origin');
      }
      return page;
    } catch (error) {
      await this.reset();
      throw error;
    }
  }

  async read(): Promise<PriceObservation[]> {
    const page = await this.ready(); // No reload during subsequent successful polls.
    if (new URL(page.url()).origin !== new URL(this.source.url).origin) {
      throw new Error('Unexpected navigation');
    }
    const captured: PriceObservation[] = [];
    for (const instrument of this.source.instruments) {
      const buy = instrument.buySelector
        ? await page.locator(instrument.buySelector).first().textContent()
        : null;
      const sell = instrument.sellSelector
        ? await page.locator(instrument.sellSelector).first().textContent()
        : null;
      if (!buy?.trim() && !sell?.trim()) throw new Error('Price selector missing');
      const normalizedBuy = parsePrice(buy);
      const normalizedSell = parsePrice(sell);
      if (!normalizedBuy && !normalizedSell) throw new Error('No valid price');
      captured.push({
        sourceCode: this.source.code,
        instrumentCode: instrument.code,
        buy: normalizedBuy,
        sell: normalizedSell,
        observedAt: new Date(),
      });
    }
    return captured;
  }

  async reset(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.page = null;
    // Browser context close also shuts down its page. Never persist login state.
    await context?.close().catch(() => undefined);
  }
  async close(): Promise<void> { await this.reset(); }
}
