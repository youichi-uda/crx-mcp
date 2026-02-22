import type { Browser, CDPSession, Page, Target } from 'puppeteer-core';
import type { ExtensionInfo } from '../types.js';
import { ConsoleCollector } from './console-collector.js';

export class ExtensionContext {
  public readonly id: string;
  public readonly info: ExtensionInfo;
  public readonly console: ConsoleCollector;
  private swTarget: Target | null = null;
  private swCdp: CDPSession | null = null;

  constructor(
    private browser: Browser,
    info: ExtensionInfo,
    console: ConsoleCollector,
  ) {
    this.id = info.id;
    this.info = info;
    this.console = console;
  }

  async attachServiceWorker(): Promise<void> {
    const target = await this.browser
      .waitForTarget(
        (t) =>
          t.type() === 'service_worker' &&
          t.url().startsWith(`chrome-extension://${this.id}/`),
        { timeout: 10000 },
      )
      .catch(() => null);

    if (target) {
      this.swTarget = target;
      const worker = await target.worker();
      if (worker) {
        this.swCdp = await target.createCDPSession();
        this.console.attachToWorker(this.swCdp, 'service-worker', target.url());
      }
    }
  }

  async getWorkerCDP(): Promise<CDPSession | null> {
    if (this.swCdp) {
      try {
        await this.swCdp.send('Runtime.evaluate', {
          expression: '1',
          returnByValue: true,
        });
        return this.swCdp;
      } catch {
        this.swCdp = null;
        this.swTarget = null;
      }
    }

    const page = (await this.browser.pages())[0];
    if (page) {
      await page
        .goto(`chrome-extension://${this.id}/manifest.json`, {
          waitUntil: 'domcontentloaded',
        })
        .catch(() => {});
    }

    await this.attachServiceWorker();
    return this.swCdp;
  }

  /**
   * Execute JS in the Service Worker context.
   * Auto-wraps in async IIFE to prevent scope pollution and support await.
   */
  async evalInServiceWorker(expression: string): Promise<any> {
    const cdp = await this.getWorkerCDP();
    if (!cdp) {
      throw new Error('Service Worker not available');
    }

    // Auto-wrap in async IIFE unless already wrapped
    const wrapped = wrapExpression(expression);

    const result = await cdp.send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          'SW evaluation error',
      );
    }
    // Handle undefined/void results
    if (result.result.type === 'undefined') {
      return undefined;
    }
    return result.result.value;
  }

  /**
   * Execute JS in the Service Worker WITHOUT auto-IIFE (raw mode).
   * Used internally by tools that already wrap their own IIFE.
   */
  async evalInServiceWorkerRaw(expression: string): Promise<any> {
    const cdp = await this.getWorkerCDP();
    if (!cdp) {
      throw new Error('Service Worker not available');
    }
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          'SW evaluation error',
      );
    }
    if (result.result.type === 'undefined') {
      return undefined;
    }
    return result.result.value;
  }

  /**
   * Find an open extension page by URL pattern.
   */
  async findExtensionPage(urlPattern: string): Promise<Page | null> {
    const pages = await this.browser.pages();
    const prefix = `chrome-extension://${this.id}/`;
    return pages.find((p) => {
      const url = p.url();
      return url.startsWith(prefix) && url.includes(urlPattern);
    }) ?? null;
  }

  /**
   * Open an extension page in a new tab and return the Page.
   */
  async openExtensionPage(path: string): Promise<Page> {
    const url = `chrome-extension://${this.id}/${path}`;
    const page = await this.browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }

  getPopupUrl(): string | null {
    return `chrome-extension://${this.id}/popup.html`;
  }

  getSidePanelUrl(): string | null {
    return `chrome-extension://${this.id}/sidepanel.html`;
  }
}

/**
 * Wrap expression in async IIFE with smart return detection.
 * - Already an IIFE → pass through
 * - Has declarations (let/const/var) → wrap with last expression as return
 * - Single expression → wrap with return
 * - Has await → wrap in async IIFE
 */
function wrapExpression(expr: string): string {
  const trimmed = expr.trim();

  // Already an IIFE — pass through
  if (/^\(async\s/.test(trimmed) && trimmed.endsWith(')')) return trimmed;
  if (/^\(function/.test(trimmed) && trimmed.endsWith(')')) return trimmed;

  // Already has explicit return → just wrap in async IIFE
  if (/\breturn\b/.test(trimmed)) {
    return `(async () => { ${trimmed} })()`;
  }

  // Multiple statements: wrap all, add return to the last expression
  const statements = trimmed.replace(/;+$/, '').split(';').map((s) => s.trim()).filter(Boolean);
  if (statements.length > 1) {
    const last = statements.pop()!;
    const init = statements.join(';\n');
    return `(async () => { ${init};\nreturn ${last}; })()`;
  }

  // Single expression: wrap with return
  return `(async () => { return ${trimmed.replace(/;$/, '')}; })()`;
}
