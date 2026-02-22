import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const permissionsCheckSchema = z.object({
  permissions: z
    .array(z.string())
    .optional()
    .describe('Specific permissions to check. Omit to list all.'),
});

export type PermissionsCheckInput = z.infer<typeof permissionsCheckSchema>;

export async function permissionsCheck(
  manager: BrowserManager,
  input: PermissionsCheckInput,
): Promise<string> {
  const ext = manager.getExtension();

  const result = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const manifest = chrome.runtime.getManifest();
      const declared = {
        permissions: manifest.permissions || [],
        hostPermissions: manifest.host_permissions || [],
        optionalPermissions: manifest.optional_permissions || [],
      };

      // Get currently granted permissions
      const granted = await chrome.permissions.getAll();

      ${
        input.permissions
          ? `
      // Check specific permissions
      const toCheck = ${JSON.stringify(input.permissions)};
      const checks = {};
      for (const p of toCheck) {
        const isHost = p.includes('://') || p === '<all_urls>';
        if (isHost) {
          checks[p] = {
            declared: declared.hostPermissions.some(h => h === p || h === '<all_urls>'),
            granted: granted.origins?.includes(p) || false,
          };
        } else {
          checks[p] = {
            declared: declared.permissions.includes(p) || declared.optionalPermissions.includes(p),
            granted: granted.permissions?.includes(p) || false,
          };
        }
      }
      return JSON.stringify({ declared, granted, checks });
      `
          : `
      return JSON.stringify({ declared, granted });
      `
      }
    })()
  `);

  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}
