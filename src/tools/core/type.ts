import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const typeSchema = z.object({
  selector: z.string().describe('CSS selector of the input element'),
  text: z.string().describe('Text to type'),
  clear: z.boolean().optional().default(false).describe('Clear existing value before typing'),
  submit: z.boolean().optional().default(false).describe('Press Enter after typing'),
  target: z
    .enum(['page', 'popup', 'sidepanel'])
    .optional()
    .default('page')
    .describe('Which context to interact with'),
});

export type TypeInput = z.infer<typeof typeSchema>;

export async function type(
  manager: BrowserManager,
  input: TypeInput,
): Promise<string> {
  const page = await manager.getTargetPage(input.target);

  if (input.clear) {
    await page.click(input.selector, { count: 3 }); // triple-click to select all
    await page.keyboard.press('Backspace');
  }

  await page.type(input.selector, input.text);

  if (input.submit) {
    await page.keyboard.press('Enter');
  }

  return JSON.stringify({ success: true, selector: input.selector, typed: input.text.length + ' chars' });
}
