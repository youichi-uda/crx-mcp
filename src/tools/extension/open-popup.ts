import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const openPopupSchema = z.object({});

export async function openPopup(manager: BrowserManager): Promise<string> {
  const ext = manager.getExtension();
  const browser = manager.getBrowser();

  // Get popup path from manifest
  const popupPath = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const manifest = chrome.runtime.getManifest();
      return manifest.action?.default_popup || manifest.action?.popup || null;
    })()
  `).catch(() => null);

  if (!popupPath) {
    return JSON.stringify({ error: 'No popup defined in manifest action.default_popup' });
  }

  const popupUrl = `chrome-extension://${ext.id}/${popupPath}`;

  // Open popup in a new tab (can't open actual popup programmatically)
  const page = await browser.newPage();
  await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });

  // Set viewport to typical popup dimensions
  await page.setViewport({ width: 400, height: 600 });

  const title = await page.title();
  const snapshot = await page.accessibility.snapshot();

  return JSON.stringify({
    url: popupUrl,
    title,
    note: 'Popup opened in a new tab (not as actual popup overlay)',
    accessibilityTree: snapshot ? formatTree(snapshot) : '(empty)',
  }, null, 2);
}

function formatTree(node: any, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let result = '';
  const role = node.role || '';
  const name = node.name || '';
  if (role && role !== 'none') {
    result += `${prefix}[${role}]`;
    if (name) result += ` "${name}"`;
    if (node.value) result += ` value="${node.value}"`;
    result += '\n';
  }
  if (node.children) {
    for (const child of node.children) {
      result += formatTree(child, indent + 1);
    }
  }
  return result;
}
