import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const navigateSchema = z.object({
  url: z.string().describe('URL to navigate to'),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2'])
    .optional()
    .default('domcontentloaded')
    .describe('When to consider navigation complete'),
  clearNetwork: z.boolean().optional().default(false).describe('Clear network request log before navigating'),
  clearConsole: z.boolean().optional().default(false).describe('Clear console log before navigating'),
});

export type NavigateInput = z.infer<typeof navigateSchema>;

export async function navigate(
  manager: BrowserManager,
  input: NavigateInput,
): Promise<string> {
  if (input.clearNetwork) {
    manager.clearNetworkEntries();
  }
  if (input.clearConsole) {
    manager.getConsole().clear();
  }

  const page = await manager.getActivePage();
  const response = await page.goto(input.url, {
    waitUntil: input.waitUntil,
    timeout: 30000,
  });

  const title = await page.title();
  const status = response?.status() ?? 0;

  return JSON.stringify({
    url: input.url,
    title,
    status,
    networkCleared: input.clearNetwork,
    consoleCleared: input.clearConsole,
  });
}
