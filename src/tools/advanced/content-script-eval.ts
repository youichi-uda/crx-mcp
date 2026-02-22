import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';
import type { Page } from 'puppeteer-core';

export const contentScriptEvalSchema = z.object({
  expression: z.string().describe('JavaScript expression to evaluate in the page'),
  world: z
    .enum(['ISOLATED', 'MAIN'])
    .optional()
    .default('ISOLATED')
    .describe('Execution world. MAIN accesses page JS context, ISOLATED is sandboxed.'),
});

export type ContentScriptEvalInput = z.infer<typeof contentScriptEvalSchema>;

export async function contentScriptEval(
  manager: BrowserManager,
  input: ContentScriptEvalInput,
): Promise<string> {
  const ext = manager.getExtension();
  const page = await manager.getActivePage();
  const url = page.url();

  // For chrome-extension:// pages, use CDP Runtime.evaluate directly
  if (url.startsWith('chrome-extension://')) {
    return evalViaCDP(page, input.expression);
  }

  if (input.world === 'MAIN') {
    // Use page.evaluate for MAIN world
    const result = await page.evaluate((expr) => {
      try {
        return JSON.stringify(eval(expr));
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }, input.expression);
    return result;
  }

  // For ISOLATED world, use chrome.scripting.executeScript via SW
  const tabId = await getActiveTabId(manager);
  if (!tabId) {
    return JSON.stringify({ error: 'No active tab found to execute script on' });
  }

  const result = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const results = await chrome.scripting.executeScript({
        target: { tabId: ${tabId} },
        world: "ISOLATED",
        func: (expr) => {
          try {
            return JSON.stringify(eval(expr));
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        },
        args: [${JSON.stringify(input.expression)}],
      });
      return results[0]?.result || null;
    })()
  `);

  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

async function evalViaCDP(page: Page, expression: string): Promise<string> {
  const cdp = await page.createCDPSession();
  try {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      return JSON.stringify({
        error: result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ?? 'Evaluation error',
      });
    }
    if (result.result.type === 'undefined') return '(undefined)';
    const val = result.result.value;
    return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function getActiveTabId(manager: BrowserManager): Promise<number | null> {
  const ext = manager.getExtension();
  const result = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.id || null;
    })()
  `);
  return result;
}
