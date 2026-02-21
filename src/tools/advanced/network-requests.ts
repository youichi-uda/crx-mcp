import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const networkRequestsSchema = z.object({
  filter: z.string().optional().describe('Filter URLs containing this string'),
  limit: z.number().optional().default(50).describe('Max entries to return'),
  clear: z.boolean().optional().default(false).describe('Clear entries after reading'),
});

export type NetworkRequestsInput = z.infer<typeof networkRequestsSchema>;

export async function networkRequests(
  manager: BrowserManager,
  input: NetworkRequestsInput,
): Promise<string> {
  let entries = manager.getNetworkEntries();

  if (input.filter) {
    const f = input.filter.toLowerCase();
    entries = entries.filter((e) => e.url.toLowerCase().includes(f));
  }

  if (input.limit && input.limit > 0) {
    entries = entries.slice(-input.limit);
  }

  if (input.clear) {
    manager.clearNetworkEntries();
  }

  if (entries.length === 0) {
    return 'No network requests captured.';
  }

  const lines = entries.map((e) => {
    const ts = new Date(e.timestamp).toISOString().slice(11, 23);
    const status = e.status ?? '---';
    return `[${ts}] ${e.method} ${status} ${e.url}${e.mimeType ? ` (${e.mimeType})` : ''}`;
  });

  return lines.join('\n');
}
