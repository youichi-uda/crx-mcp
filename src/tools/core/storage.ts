import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const storageGetSchema = z.object({
  keys: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Key(s) to retrieve. Omit to get all.'),
  area: z
    .enum(['local', 'sync', 'session'])
    .optional()
    .default('local')
    .describe('Storage area'),
  direct: z
    .boolean()
    .optional()
    .default(false)
    .describe('Read via extension page instead of Service Worker (works even if SW is crashed)'),
});

export const storageSetSchema = z.object({
  data: z.record(z.any()).describe('Key-value pairs to store'),
  area: z
    .enum(['local', 'sync', 'session'])
    .optional()
    .default('local')
    .describe('Storage area'),
});

export type StorageGetInput = z.infer<typeof storageGetSchema>;
export type StorageSetInput = z.infer<typeof storageSetSchema>;

export async function storageGet(
  manager: BrowserManager,
  input: StorageGetInput,
): Promise<string> {
  if (input.direct) {
    return storageGetDirect(manager, input);
  }

  const ext = manager.getExtension();
  const keysArg = input.keys
    ? JSON.stringify(typeof input.keys === 'string' ? [input.keys] : input.keys)
    : 'null';

  const result = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const keys = ${keysArg};
      const data = await chrome.storage.${input.area}.get(keys);
      return JSON.stringify(data);
    })()
  `);

  return result;
}

async function storageGetDirect(
  manager: BrowserManager,
  input: StorageGetInput,
): Promise<string> {
  const ext = manager.getExtension();
  const browser = manager.getBrowser();

  // Open a throwaway extension page to access chrome.storage without SW
  const page = await browser.newPage();
  const url = `chrome-extension://${ext.id}/manifest.json`;
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});

  const keysArg = input.keys
    ? JSON.stringify(typeof input.keys === 'string' ? [input.keys] : input.keys)
    : 'null';

  const result = await page.evaluate(
    async (area: string, keys: string | null) => {
      try {
        const storage = ((globalThis as any).chrome)?.storage?.[area];
        if (!storage) return JSON.stringify({ error: `chrome.storage.${area} not available` });
        const parsedKeys = keys ? JSON.parse(keys) : null;
        const data = await storage.get(parsedKeys);
        return JSON.stringify(data);
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
    input.area,
    keysArg,
  );

  await page.close();
  return result;
}

export async function storageSet(
  manager: BrowserManager,
  input: StorageSetInput,
): Promise<string> {
  const ext = manager.getExtension();
  const dataStr = JSON.stringify(input.data);

  await ext.evalInServiceWorkerRaw(`
    (async () => {
      await chrome.storage.${input.area}.set(${dataStr});
      return 'ok';
    })()
  `);

  return JSON.stringify({ success: true, area: input.area, keys: Object.keys(input.data) });
}
