import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const waitForSchema = z.object({
  selector: z.string().describe('CSS selector to wait for'),
  state: z
    .enum(['visible', 'hidden', 'attached', 'detached'])
    .optional()
    .default('visible')
    .describe('Wait until element is visible/hidden/attached/detached'),
  timeout: z.number().optional().default(10000).describe('Timeout in milliseconds'),
  target: z
    .enum(['page', 'popup', 'sidepanel'])
    .optional()
    .default('page')
    .describe('Which context to interact with'),
});

export type WaitForInput = z.infer<typeof waitForSchema>;

export async function waitFor(
  manager: BrowserManager,
  input: WaitForInput,
): Promise<string> {
  const page = await manager.getTargetPage(input.target);
  const start = Date.now();

  if (input.state === 'hidden' || input.state === 'detached') {
    await page.waitForSelector(input.selector, {
      hidden: true,
      timeout: input.timeout,
    });
  } else if (input.state === 'attached') {
    await page.waitForSelector(input.selector, {
      timeout: input.timeout,
    });
  } else {
    // visible (default)
    await page.waitForSelector(input.selector, {
      visible: true,
      timeout: input.timeout,
    });
  }

  const elapsed = Date.now() - start;
  return JSON.stringify({ success: true, selector: input.selector, state: input.state, elapsedMs: elapsed });
}
