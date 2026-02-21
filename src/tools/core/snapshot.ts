import { z } from 'zod';
import type { BrowserManager } from '../../browser/manager.js';

export const snapshotSchema = z.object({
  target: z
    .enum(['page', 'popup', 'sidepanel'])
    .optional()
    .default('page')
    .describe('Which context to snapshot'),
});

export type SnapshotInput = z.infer<typeof snapshotSchema>;

export async function snapshot(
  manager: BrowserManager,
  input: SnapshotInput,
): Promise<string> {
  const browser = manager.getBrowser();
  let page;

  if (input.target === 'page') {
    page = await manager.getActivePage();
  } else {
    // For popup/sidepanel, find the matching page by URL pattern
    const ext = manager.getExtension();
    const prefix = `chrome-extension://${ext.id}/`;
    const pages = await browser.pages();

    if (input.target === 'popup') {
      page = pages.find((p) => p.url().includes('popup'));
    } else {
      page = pages.find((p) => p.url().includes('sidepanel') || p.url().includes('side_panel'));
    }

    if (!page) {
      page = await manager.getActivePage();
    }
  }

  const snapshot = await page.accessibility.snapshot();
  const title = await page.title();
  const url = page.url();

  return JSON.stringify({
    url,
    title,
    accessibilityTree: snapshot
      ? formatAccessibilityTree(snapshot)
      : '(empty page)',
  }, null, 2);
}

function formatAccessibilityTree(node: any, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let result = '';

  const role = node.role || '';
  const name = node.name || '';
  const value = node.value || '';

  if (role && role !== 'none') {
    result += `${prefix}[${role}]`;
    if (name) result += ` "${name}"`;
    if (value) result += ` value="${value}"`;
    result += '\n';
  }

  if (node.children) {
    for (const child of node.children) {
      result += formatAccessibilityTree(child, indent + 1);
    }
  }

  return result;
}
