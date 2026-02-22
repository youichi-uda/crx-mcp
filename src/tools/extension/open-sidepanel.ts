import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const openSidepanelSchema = z.object({});

export async function openSidepanel(manager: BrowserManager): Promise<string> {
  const ext = manager.getExtension();
  const browser = manager.getBrowser();

  // Try to determine sidepanel path from manifest
  const sidepanelPath = await ext.evalInServiceWorkerRaw(`
    (async () => {
      const manifest = chrome.runtime.getManifest();
      return manifest.side_panel?.default_path || null;
    })()
  `).catch(() => null);

  if (!sidepanelPath) {
    return JSON.stringify({ error: 'No side_panel.default_path defined in manifest' });
  }

  const url = `chrome-extension://${ext.id}/${sidepanelPath}`;

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.setViewport({ width: 400, height: 800 });

  const title = await page.title();
  const snapshot = await page.accessibility.snapshot();

  return JSON.stringify({
    url,
    title,
    note: 'Side panel opened in a new tab (chrome.sidePanel.open requires user gesture)',
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
