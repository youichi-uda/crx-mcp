import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const navigateSchema = z.object({
  url: z.string().describe('URL to navigate to'),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2'])
    .optional()
    .default('domcontentloaded')
    .describe('When to consider navigation complete'),
});

export type NavigateInput = z.infer<typeof navigateSchema>;

export async function navigate(
  manager: BrowserManager,
  input: NavigateInput,
): Promise<string> {
  const page = await manager.getActivePage();
  const response = await page.goto(input.url, {
    waitUntil: input.waitUntil,
    timeout: 30000,
  });

  const title = await page.title();
  const status = response?.status() ?? 0;

  return JSON.stringify({ url: input.url, title, status });
}
