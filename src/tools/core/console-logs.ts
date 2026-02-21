import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';
import type { ConsoleLevel, ConsoleSource } from '../../types.js';

export const consoleLogsSchema = z.object({
  source: z
    .enum(['page', 'service-worker', 'popup', 'sidepanel', 'content-script'])
    .optional()
    .describe('Filter by source'),
  level: z
    .enum(['debug', 'log', 'info', 'warn', 'error'])
    .optional()
    .describe('Minimum log level'),
  limit: z.number().optional().default(50).describe('Max entries to return'),
  clear: z.boolean().optional().default(false).describe('Clear logs after reading'),
});

export type ConsoleLogsInput = z.infer<typeof consoleLogsSchema>;

export async function consoleLogs(
  manager: BrowserManager,
  input: ConsoleLogsInput,
): Promise<string> {
  const collector = manager.getConsole();
  const entries = collector.getEntries({
    source: input.source as ConsoleSource | undefined,
    level: input.level as ConsoleLevel | undefined,
    limit: input.limit,
    clear: input.clear,
  });

  if (entries.length === 0) {
    return 'No console logs found.';
  }

  const lines = entries.map((e) => {
    const ts = new Date(e.timestamp).toISOString().slice(11, 23);
    return `[${ts}] [${e.source}] ${e.level.toUpperCase()}: ${e.text}`;
  });

  return lines.join('\n');
}
