import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CLIOptions, ExtensionInfo } from '../types.js';
import { ConsoleCollector } from './console-collector.js';
import { ExtensionContext } from './extension.js';
import { BrowserNotLaunchedError } from '../utils/errors.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private extension: ExtensionContext | null = null;
  private console: ConsoleCollector = new ConsoleCollector();
  private options: CLIOptions;
  private networkEntries: Array<{
    timestamp: number;
    method: string;
    url: string;
    status?: number;
    mimeType?: string;
    size?: number;
  }> = [];

  constructor(options: CLIOptions = {}) {
    this.options = options;
  }

  get isLaunched(): boolean {
    return this.browser !== null && this.browser.connected;
  }

  getBrowser(): Browser {
    if (!this.browser || !this.browser.connected) {
      throw new BrowserNotLaunchedError();
    }
    return this.browser;
  }

  getExtension(): ExtensionContext {
    if (!this.extension) {
      throw new BrowserNotLaunchedError();
    }
    return this.extension;
  }

  getConsole(): ConsoleCollector {
    return this.console;
  }

  getNetworkEntries() {
    return this.networkEntries;
  }

  clearNetworkEntries() {
    this.networkEntries = [];
  }

  async getActivePage(): Promise<Page> {
    const browser = this.getBrowser();
    const pages = await browser.pages();
    return pages[pages.length - 1] || pages[0];
  }

  async launch(extensionPath: string, extraFlags?: string[], initialUrl?: string): Promise<ExtensionInfo> {
    // Resolve absolute path
    const absPath = path.resolve(extensionPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Extension path does not exist: ${absPath}`);
    }

    const manifestPath = path.join(absPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`manifest.json not found in: ${absPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Find Chrome
    const chromePath = this.options.chromePath || findChrome();

    // Build args
    const args = [
      `--disable-extensions-except=${absPath}`,
      `--load-extension=${absPath}`,
      '--no-first-run',
      '--disable-default-apps',
      '--disable-popup-blocking',
    ];

    if (this.options.noSandbox) {
      args.push('--no-sandbox');
    }

    if (extraFlags) {
      args.push(...extraFlags);
    }

    // User data dir
    const userDataDir =
      this.options.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'crx-mcp-'));

    // Close existing browser if any
    await this.close();

    this.browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false, // Extensions require headed mode
      args,
      userDataDir,
      defaultViewport: null,
    });

    // Detect extension ID from service worker target
    const extId = await this.detectExtensionId(absPath);

    const info: ExtensionInfo = {
      id: extId,
      name: manifest.name || 'Unknown',
      version: manifest.version || '0.0.0',
      manifestPath,
    };

    this.extension = new ExtensionContext(this.browser, info, this.console);

    // Attach to service worker if exists
    if (manifest.background?.service_worker) {
      await this.extension.attachServiceWorker();
    }

    // Attach console to existing pages
    const pages = await this.browser.pages();
    for (const page of pages) {
      this.console.attachToPage(page, 'page');
    }

    // Attach console to new pages
    this.browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) {
          this.console.attachToPage(page, 'page');
        }
      }
    });

    // Enable network monitoring via CDP
    await this.setupNetworkMonitoring();

    // Navigate to initial URL if provided
    if (initialUrl) {
      const page = await this.getActivePage();
      await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    }

    return info;
  }

  private async detectExtensionId(extensionPath: string): Promise<string> {
    const browser = this.getBrowser();

    // Wait for the extension's service worker or page to appear
    const target = await browser
      .waitForTarget(
        (t) => {
          const url = t.url();
          return (
            url.startsWith('chrome-extension://') &&
            (t.type() === 'service_worker' || t.type() === 'page')
          );
        },
        { timeout: 15000 },
      )
      .catch(() => null);

    if (target) {
      const url = target.url();
      const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) return match[1];
    }

    // Fallback: query chrome://extensions via CDP
    const page = (await browser.pages())[0];
    if (page) {
      await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
      // Try to extract extension ID from the page
      const extId = await page.evaluate(() => {
        const mgr = (document.querySelector('extensions-manager') as any);
        if (mgr?.shadowRoot) {
          const items = mgr.shadowRoot.querySelectorAll('extensions-item-list');
          // This is complex due to shadow DOM, use simpler approach
        }
        return null;
      }).catch(() => null);
    }

    throw new Error('Could not detect extension ID. Make sure the extension loads correctly.');
  }

  private async setupNetworkMonitoring(): Promise<void> {
    const browser = this.getBrowser();
    const pages = await browser.pages();
    for (const page of pages) {
      await this.attachNetworkToPage(page);
    }
  }

  async attachNetworkToPage(page: Page): Promise<void> {
    try {
      const cdp = await page.createCDPSession();
      await cdp.send('Network.enable');

      cdp.on('Network.responseReceived', (event: any) => {
        this.networkEntries.push({
          timestamp: Date.now(),
          method: event.response?.requestHeaders?.[':method'] || 'GET',
          url: event.response.url,
          status: event.response.status,
          mimeType: event.response.mimeType,
          size: event.response.encodedDataLength,
        });
        // Keep max 1000
        if (this.networkEntries.length > 1000) {
          this.networkEntries = this.networkEntries.slice(-1000);
        }
      });
    } catch {
      // CDP session may fail for certain pages
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Already closed
      }
      this.browser = null;
      this.extension = null;
    }
  }
}

function findChrome(): string {
  const candidates =
    process.platform === 'win32'
      ? [
          process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
          process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
          process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
          ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  throw new Error(
    'Chrome not found. Specify --chrome-path or set CHROME_PATH environment variable.',
  );
}
