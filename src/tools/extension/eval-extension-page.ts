import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const evalExtensionPageSchema = z.object({
  expression: z.string().describe('JavaScript expression to evaluate in the extension page context'),
  target: z
    .enum(['popup', 'sidepanel'])
    .describe('Which extension page to evaluate in'),
});

export type EvalExtensionPageInput = z.infer<typeof evalExtensionPageSchema>;

export async function evalExtensionPage(
  manager: BrowserManager,
  input: EvalExtensionPageInput,
): Promise<string> {
  const page = await manager.getTargetPage(input.target);

  const result = await page.evaluate(async (expr: string) => {
    try {
      const fn = new Function('return (async () => { ' + expr + ' })()');
      const res = await fn();
      if (res === undefined) return '(undefined)';
      return typeof res === 'string' ? res : JSON.stringify(res);
    } catch (e: any) {
      return JSON.stringify({ error: e.message });
    }
  }, input.expression);

  return result;
}
