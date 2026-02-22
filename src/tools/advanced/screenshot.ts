import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const screenshotSchema = z.object({
  target: z
    .enum(['page', 'popup', 'sidepanel'])
    .optional()
    .default('page')
    .describe('Which context to screenshot'),
  fullPage: z.boolean().optional().default(false).describe('Capture full scrollable page'),
});

export type ScreenshotInput = z.infer<typeof screenshotSchema>;

export async function screenshot(
  manager: BrowserManager,
  input: ScreenshotInput,
): Promise<{ base64: string; mimeType: string }> {
  const page = await manager.getTargetPage(input.target);

  const buffer = await page.screenshot({
    fullPage: input.fullPage,
    encoding: 'base64',
    type: 'png',
  });

  return {
    base64: buffer as unknown as string,
    mimeType: 'image/png',
  };
}
