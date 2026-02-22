import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const dnrMatchedRulesSchema = z.object({
  tabId: z.number().optional().describe('Tab ID to filter matched rules. Omit for all tabs.'),
});

export type DnrMatchedRulesInput = z.infer<typeof dnrMatchedRulesSchema>;

export async function dnrMatchedRules(
  manager: BrowserManager,
  input: DnrMatchedRulesInput,
): Promise<string> {
  const ext = manager.getExtension();

  const tabIdArg = input.tabId !== undefined ? input.tabId : 'undefined';

  const result = await ext.evalInServiceWorkerRaw(`
    (async () => {
      if (!chrome.declarativeNetRequest?.getMatchedRules) {
        return JSON.stringify({ error: 'declarativeNetRequest.getMatchedRules not available. Add declarativeNetRequestFeedback permission.' });
      }

      try {
        const filter = {};
        const tabId = ${tabIdArg};
        if (tabId !== undefined) filter.tabId = tabId;

        const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules(filter);
        return JSON.stringify({
          count: rulesMatchedInfo.length,
          rules: rulesMatchedInfo.map(r => ({
            ruleId: r.rule.ruleId,
            rulesetId: r.rule.rulesetId,
            tabId: r.tabId,
            timeStamp: r.timeStamp,
          })),
        });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    })()
  `);

  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}
