import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const extensionLoadSchema = z.object({
  extensionPath: z.string().describe('Path to the unpacked extension directory'),
  chromeFlags: z.array(z.string()).optional().describe('Additional Chrome flags'),
  url: z.string().optional().describe('Initial URL to navigate to after loading'),
});

export type ExtensionLoadInput = z.infer<typeof extensionLoadSchema>;

export async function extensionLoad(
  manager: BrowserManager,
  input: ExtensionLoadInput,
): Promise<string> {
  const info = await manager.launch(input.extensionPath, input.chromeFlags, input.url);

  return JSON.stringify(
    {
      extensionId: info.id,
      name: info.name,
      version: info.version,
      message: `Extension "${info.name}" loaded successfully.`,
    },
    null,
    2,
  );
}
