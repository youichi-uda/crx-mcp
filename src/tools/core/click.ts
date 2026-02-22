import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const clickSchema = z.object({
  selector: z.string().describe('CSS selector of the element to click'),
  doubleClick: z.boolean().optional().default(false).describe('Double-click instead of single click'),
  target: z
    .enum(['page', 'popup', 'sidepanel'])
    .optional()
    .default('page')
    .describe('Which context to interact with'),
});

export type ClickInput = z.infer<typeof clickSchema>;

export async function click(
  manager: BrowserManager,
  input: ClickInput,
): Promise<string> {
  const page = await manager.getTargetPage(input.target);

  if (input.doubleClick) {
    await page.click(input.selector, { count: 2 });
  } else {
    await page.click(input.selector);
  }

  return JSON.stringify({ success: true, selector: input.selector, doubleClick: input.doubleClick });
}
