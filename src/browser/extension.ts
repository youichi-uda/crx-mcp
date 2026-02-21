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

  /**
   * Discover and attach to the Service Worker target.
   */
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
        this.console.attachToWorker(this.swCdp, 'service-worker');
      }
    }
  }

  /**
   * Get an active SW CDPSession, reviving if needed.
   */
  async getWorkerCDP(): Promise<CDPSession | null> {
    // Check if existing session is still valid
    if (this.swCdp) {
      try {
        await this.swCdp.send('Runtime.evaluate', {
          expression: '1',
          returnByValue: true,
        });
        return this.swCdp;
      } catch {
        // SW went to sleep, try to revive
        this.swCdp = null;
        this.swTarget = null;
      }
    }

    // Wake up SW by navigating to the extension page
    const page = (await this.browser.pages())[0];
    if (page) {
      await page
        .goto(`chrome-extension://${this.id}/manifest.json`, {
          waitUntil: 'domcontentloaded',
        })
        .catch(() => {});
    }

    // Re-attach
    await this.attachServiceWorker();
    return this.swCdp;
  }

  /**
   * Execute JS in the Service Worker context.
   */
  async evalInServiceWorker(expression: string): Promise<any> {
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
    return result.result.value;
  }

  getPopupUrl(): string | null {
    // Read from info — caller should parse manifest
    return `chrome-extension://${this.id}/popup.html`;
  }

  getSidePanelUrl(): string | null {
    return `chrome-extension://${this.id}/sidepanel.html`;
  }
}
