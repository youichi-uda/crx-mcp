import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

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

  const result = await ext.evalInServiceWorker(`
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

async function getActiveTabId(manager: BrowserManager): Promise<number | null> {
  const ext = manager.getExtension();
  const result = await ext.evalInServiceWorker(`
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.id || null;
    })()
  `);
  return result;
}
