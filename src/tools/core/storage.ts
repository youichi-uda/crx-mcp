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
  const ext = manager.getExtension();
  const keysArg = input.keys
    ? JSON.stringify(typeof input.keys === 'string' ? [input.keys] : input.keys)
    : 'null';

  const result = await ext.evalInServiceWorker(`
    (async () => {
      const keys = ${keysArg};
      const data = await chrome.storage.${input.area}.get(keys);
      return JSON.stringify(data);
    })()
  `);

  return result;
}

export async function storageSet(
  manager: BrowserManager,
  input: StorageSetInput,
): Promise<string> {
  const ext = manager.getExtension();
  const dataStr = JSON.stringify(input.data);

  await ext.evalInServiceWorker(`
    (async () => {
      await chrome.storage.${input.area}.set(${dataStr});
      return 'ok';
    })()
  `);

  return JSON.stringify({ success: true, area: input.area, keys: Object.keys(input.data) });
}
