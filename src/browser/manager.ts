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

  async getTargetPage(target?: 'page' | 'popup' | 'sidepanel'): Promise<Page> {
    if (!target || target === 'page') {
      return this.getActivePage();
    }

    const ext = this.getExtension();
    const prefix = `chrome-extension://${ext.id}/`;
    const browser = this.getBrowser();
    const pages = await browser.pages();

    let page: Page | undefined;
    if (target === 'popup') {
      page = pages.find((p) => {
        const url = p.url();
        return url.startsWith(prefix) && url.includes('popup');
      });
    } else {
      // sidepanel
      page = pages.find((p) => {
        const url = p.url();
        return url.startsWith(prefix) && (url.includes('sidepanel') || url.includes('side_panel'));
      });
    }

    if (!page) {
      throw new Error(`No ${target} page found. Use open_popup or open_sidepanel first.`);
    }
    return page;
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
      // CRITICAL: Puppeteer adds --disable-extensions by default, which prevents
      // any extension from loading. We must exclude it.
      ignoreDefaultArgs: ['--disable-extensions'],
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
    const extRegex = /chrome-extension:\/\/([a-z]{32})\//;

    // Method 1: waitForTarget for service worker or extension page
    const target = await browser
      .waitForTarget(
        (t) => {
          const url = t.url();
          return (
            url.startsWith('chrome-extension://') &&
            (t.type() === 'service_worker' || t.type() === 'page')
          );
        },
        { timeout: 10000 },
      )
      .catch(() => null);

    if (target) {
      const match = target.url().match(extRegex);
      if (match) return match[1];
    }

    // Method 2: scan all existing targets via Puppeteer
    const allTargets = browser.targets();
    for (const t of allTargets) {
      const match = t.url().match(extRegex);
      if (match) return match[1];
    }

    // Method 3: use CDP Target.getTargets for comprehensive list
    const page = (await browser.pages())[0];
    if (page) {
      try {
        const cdp = await page.createCDPSession();
        const { targetInfos } = await cdp.send('Target.getTargets') as { targetInfos: Array<{ url: string; type: string }> };
        for (const info of targetInfos) {
          const match = info.url.match(extRegex);
          if (match) return match[1];
        }
        await cdp.detach();
      } catch {
        // CDP may fail
      }
    }

    // Method 4: navigate to chrome://extensions and extract ID from page content
    if (page) {
      try {
        await page.goto('chrome://extensions', { waitUntil: 'load', timeout: 10000 });
        // Wait a moment for extensions manager to render
        await new Promise((r) => setTimeout(r, 1000));
        const extId = await page.evaluate(() => {
          // The extensions page uses shadow DOM, traverse it
          const mgr = document.querySelector('extensions-manager');
          if (!mgr?.shadowRoot) return null;
          const itemList = mgr.shadowRoot.querySelector('extensions-item-list');
          if (!itemList?.shadowRoot) return null;
          const items = itemList.shadowRoot.querySelectorAll('extensions-item');
          for (const item of items) {
            const id = item.id;
            if (id && /^[a-z]{32}$/.test(id)) return id;
          }
          return null;
        }).catch(() => null);
        if (extId) return extId;
      } catch {
        // Navigation may fail
      }
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
  // Prefer Chrome for Testing / Chromium (supports --load-extension and
  // --disable-extensions-except flags needed for extension development).
  // Google Chrome stable does NOT support these flags.
  const cfTCandidates = findChromeForTesting();

  const stableCandidates =
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

  // Chrome for Testing first, then stable Chrome as fallback
  const candidates = [...cfTCandidates, ...stableCandidates];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  throw new Error(
    'Chrome not found. Install Chrome for Testing (npx playwright install chromium), ' +
      'specify --chrome-path, or set CHROME_PATH environment variable.',
  );
}

function findChromeForTesting(): string[] {
  const results: string[] = [];
  // Playwright installs Chrome for Testing in ms-playwright directory
  const playwrightDir =
    process.platform === 'win32'
      ? path.join(process.env['LOCALAPPDATA'] || '', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright');

  if (fs.existsSync(playwrightDir)) {
    try {
      const dirs = fs.readdirSync(playwrightDir)
        .filter((d) => d.startsWith('chromium-'))
        .sort()
        .reverse(); // newest first

      for (const dir of dirs) {
        const exe =
          process.platform === 'win32'
            ? path.join(playwrightDir, dir, 'chrome-win64', 'chrome.exe')
            : process.platform === 'darwin'
              ? path.join(playwrightDir, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
              : path.join(playwrightDir, dir, 'chrome-linux', 'chrome');
        results.push(exe);
      }
    } catch {
      // Directory listing may fail
    }
  }
  return results;
}
