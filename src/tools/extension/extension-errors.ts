import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const extensionErrorsSchema = z.object({});

export async function extensionErrors(
  manager: BrowserManager,
): Promise<string> {
  const browser = manager.getBrowser();
  const ext = manager.getExtension();

  // Navigate to chrome://extensions to extract errors
  const page = await browser.newPage();
  try {
    await page.goto('chrome://extensions', { waitUntil: 'load', timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1500));

    const errors = await page.evaluate((extId: string) => {
      const mgr = document.querySelector('extensions-manager');
      if (!mgr?.shadowRoot) return { error: 'Cannot access extensions-manager shadow DOM' };

      const itemList = mgr.shadowRoot.querySelector('extensions-item-list');
      if (!itemList?.shadowRoot) return { error: 'Cannot access extensions-item-list shadow DOM' };

      const items = itemList.shadowRoot.querySelectorAll('extensions-item');
      for (const item of items) {
        if (item.id !== extId) continue;

        // Check for error indicators in the item's shadow DOM
        const sr = item.shadowRoot;
        if (!sr) return { error: 'Cannot access extension item shadow DOM' };

        // Look for error messages
        const errorSection = sr.querySelector('.cr-rows-with-icon');
        const warnings: string[] = [];

        // Check all possible error/warning elements
        const allText = sr.querySelectorAll('.warnings-list li, .error-message, [class*="error"], [class*="warning"]');
        allText.forEach((el: Element) => {
          const text = el.textContent?.trim();
          if (text) warnings.push(text);
        });

        return { extensionId: extId, errors: warnings };
      }

      return { error: `Extension ${extId} not found on chrome://extensions page` };
    }, ext.id).catch(() => ({ error: 'Failed to evaluate chrome://extensions page' }));

    await page.close();

    // Also collect SW errors from console collector
    const consoleErrors = manager.getConsole().getEntries({
      level: 'error',
      limit: 20,
    });

    const swErrors = consoleErrors
      .filter((e) => e.source === 'service-worker')
      .map((e) => ({
        timestamp: new Date(e.timestamp).toISOString(),
        message: e.text,
      }));

    return JSON.stringify({
      chromeExtensionsPage: errors,
      recentServiceWorkerErrors: swErrors,
    }, null, 2);
  } catch (e) {
    await page.close().catch(() => {});
    return JSON.stringify({ error: `Failed to check extension errors: ${e}` });
  }
}
