import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const sendMessageSchema = z.object({
  message: z.any().describe('Message to send via chrome.runtime.sendMessage()'),
  expectResponse: z.boolean().optional().default(true).describe('Whether to wait for a response'),
  timeout: z.number().optional().default(5000).describe('Timeout in milliseconds'),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function sendMessage(
  manager: BrowserManager,
  input: SendMessageInput,
): Promise<string> {
  const ext = manager.getExtension();
  const browser = manager.getBrowser();
  const messageStr = JSON.stringify(input.message);

  // Open a throwaway extension page to fire chrome.runtime.sendMessage
  const page = await browser.newPage();
  const url = `chrome-extension://${ext.id}/manifest.json`;
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});

  try {
    const result = await page.evaluate(
      async (msg: string, expectResponse: boolean, timeout: number) => {
        const parsed = JSON.parse(msg);
        try {
          const cr = (globalThis as any).chrome;
          if (!expectResponse) {
            cr.runtime.sendMessage(parsed);
            return JSON.stringify({ sent: true, response: null });
          }
          const response = await Promise.race([
            cr.runtime.sendMessage(parsed),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout waiting for response')), timeout),
            ),
          ]);
          return JSON.stringify({ sent: true, response });
        } catch (e: any) {
          return JSON.stringify({ sent: false, error: e.message });
        }
      },
      messageStr,
      input.expectResponse,
      input.timeout,
    );

    return result;
  } finally {
    await page.close().catch(() => {});
  }
}
