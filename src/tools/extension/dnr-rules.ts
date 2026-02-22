import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const dnrRulesSchema = z.object({
  ruleType: z
    .enum(['dynamic', 'session', 'static', 'all'])
    .optional()
    .default('all')
    .describe('Type of DNR rules to retrieve'),
});

export type DnrRulesInput = z.infer<typeof dnrRulesSchema>;

export async function dnrRules(
  manager: BrowserManager,
  input: DnrRulesInput,
): Promise<string> {
  const ext = manager.getExtension();

  const result = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const ruleType = "${input.ruleType}";
      const result = {};

      if (!chrome.declarativeNetRequest) {
        return JSON.stringify({ error: 'declarativeNetRequest API not available. Check permissions.' });
      }

      try {
        if (ruleType === 'dynamic' || ruleType === 'all') {
          result.dynamic = await chrome.declarativeNetRequest.getDynamicRules();
        }
        if (ruleType === 'session' || ruleType === 'all') {
          result.session = await chrome.declarativeNetRequest.getSessionRules();
        }
        if (ruleType === 'static' || ruleType === 'all') {
          // getEnabledRulesets returns enabled static ruleset IDs
          try {
            result.enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
          } catch (e) {
            result.enabledRulesets = [];
          }
        }
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }

      return JSON.stringify(result);
    })()
  `);

  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}
