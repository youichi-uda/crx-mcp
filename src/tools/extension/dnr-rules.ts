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
          try {
            result.enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
          } catch (e) {
            result.enabledRulesets = [];
          }
        }
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }

      // Validate rules against manifest permissions
      const warnings = [];
      const manifest = chrome.runtime.getManifest();
      const perms = new Set(manifest.permissions || []);
      const hostPerms = manifest.host_permissions || [];
      const hasHostAccess = perms.has('declarativeNetRequestWithHostAccess') || hostPerms.length > 0;

      const actionsNeedingHost = new Set(['redirect', 'modifyHeaders']);
      const allRules = [
        ...(result.dynamic || []).map(r => ({ ...r, source: 'dynamic' })),
        ...(result.session || []).map(r => ({ ...r, source: 'session' })),
      ];

      for (const rule of allRules) {
        const action = rule.action?.type;
        if (actionsNeedingHost.has(action) && !hasHostAccess) {
          warnings.push(
            'Rule ' + rule.id + ' (' + rule.source + '): "' + action + '" action requires ' +
            'declarativeNetRequestWithHostAccess permission or host_permissions. ' +
            'Without it, this rule will be silently ignored.'
          );
        }
      }

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return JSON.stringify(result);
    })()
  `);

  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}
