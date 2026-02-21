import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const evalServiceWorkerSchema = z.object({
  expression: z.string().describe('JavaScript expression to evaluate in the Service Worker'),
});

export type EvalServiceWorkerInput = z.infer<typeof evalServiceWorkerSchema>;

export async function evalServiceWorker(
  manager: BrowserManager,
  input: EvalServiceWorkerInput,
): Promise<string> {
  const ext = manager.getExtension();
  const result = await ext.evalInServiceWorker(input.expression);
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}
