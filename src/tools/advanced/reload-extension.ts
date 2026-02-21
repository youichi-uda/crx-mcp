import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const reloadExtensionSchema = z.object({});

export async function reloadExtension(manager: BrowserManager): Promise<string> {
  const ext = manager.getExtension();

  // Trigger reload via chrome.runtime.reload()
  await ext.evalInServiceWorker('chrome.runtime.reload()').catch(() => {
    // This is expected — the SW will terminate during reload
  });

  // Wait for the SW to come back
  await new Promise((r) => setTimeout(r, 2000));

  // Re-attach to the new SW
  await ext.attachServiceWorker();

  return JSON.stringify({
    success: true,
    message: 'Extension reloaded. Service Worker re-attached.',
    extensionId: ext.id,
  });
}
