import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from './browser/manager.js';
import type { CLIOptions } from './types.js';
import { formatError } from './utils/errors.js';

// Core tools
import { extensionLoadSchema, extensionLoad } from './tools/core/extension-load.js';
import { navigateSchema, navigate } from './tools/core/navigate.js';
import { snapshotSchema, snapshot } from './tools/core/snapshot.js';
import { storageGetSchema, storageGet, storageSetSchema, storageSet } from './tools/core/storage.js';
import { evalServiceWorkerSchema, evalServiceWorker } from './tools/core/eval-service-worker.js';
import { consoleLogsSchema, consoleLogs } from './tools/core/console-logs.js';

// Extension-specific tools
import { manifestValidateSchema, manifestValidate } from './tools/extension/manifest-validate.js';
import { openPopupSchema, openPopup } from './tools/extension/open-popup.js';
import { openSidepanelSchema, openSidepanel } from './tools/extension/open-sidepanel.js';
import { dnrRulesSchema, dnrRules } from './tools/extension/dnr-rules.js';
import { permissionsCheckSchema, permissionsCheck } from './tools/extension/permissions-check.js';

// Advanced tools
import { screenshotSchema, screenshot } from './tools/advanced/screenshot.js';
import { networkRequestsSchema, networkRequests } from './tools/advanced/network-requests.js';
import { contentScriptEvalSchema, contentScriptEval } from './tools/advanced/content-script-eval.js';
import { reloadExtensionSchema, reloadExtension } from './tools/advanced/reload-extension.js';

export function createServer(options: CLIOptions = {}): McpServer {
  const server = new McpServer({
    name: 'crx-mcp',
    version: '0.1.0',
  });

  const manager = new BrowserManager(options);

  // Cleanup on exit
  const cleanup = async () => {
    await manager.close();
  };
  process.on('exit', () => { manager.close(); });
  process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
  process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });

  // === Core Tools ===

  server.tool(
    'extension_load',
    'Load a Chrome extension and launch the browser. Returns extension ID.',
    extensionLoadSchema.shape,
    async (input) => {
      try {
        const result = await extensionLoad(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'navigate',
    'Navigate to a URL in the browser.',
    navigateSchema.shape,
    async (input) => {
      try {
        const result = await navigate(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'snapshot',
    'Get an accessibility snapshot of the page, popup, or side panel.',
    snapshotSchema.shape,
    async (input) => {
      try {
        const result = await snapshot(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'storage_get',
    'Read from chrome.storage (local/sync/session).',
    storageGetSchema.shape,
    async (input) => {
      try {
        const result = await storageGet(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'storage_set',
    'Write to chrome.storage (local/sync/session).',
    storageSetSchema.shape,
    async (input) => {
      try {
        const result = await storageSet(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'eval_service_worker',
    'Execute JavaScript in the extension Service Worker context.',
    evalServiceWorkerSchema.shape,
    async (input) => {
      try {
        const result = await evalServiceWorker(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'console_logs',
    'Get console logs from all extension contexts (page, SW, popup, sidepanel).',
    consoleLogsSchema.shape,
    async (input) => {
      try {
        const result = await consoleLogs(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  // === Extension-Specific Tools ===

  server.tool(
    'manifest_validate',
    'Validate manifest.json against MV3 requirements (no browser needed).',
    manifestValidateSchema.shape,
    async (input) => {
      try {
        const loadedPath = manager.isLaunched
          ? manager.getExtension().info.manifestPath
          : undefined;
        const result = await manifestValidate(input.extensionPath, loadedPath);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'open_popup',
    'Open the extension popup in a new tab and return accessibility snapshot.',
    openPopupSchema.shape,
    async () => {
      try {
        const result = await openPopup(manager);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'open_sidepanel',
    'Open the extension side panel in a new tab and return accessibility snapshot.',
    openSidepanelSchema.shape,
    async () => {
      try {
        const result = await openSidepanel(manager);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'dnr_rules',
    'List declarativeNetRequest rules (dynamic/session/static).',
    dnrRulesSchema.shape,
    async (input) => {
      try {
        const result = await dnrRules(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'permissions_check',
    'Check declared vs granted extension permissions.',
    permissionsCheckSchema.shape,
    async (input) => {
      try {
        const result = await permissionsCheck(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  // === Advanced Tools ===

  server.tool(
    'screenshot',
    'Take a screenshot of the page, popup, or side panel. Returns base64 PNG.',
    screenshotSchema.shape,
    async (input) => {
      try {
        const result = await screenshot(manager, input);
        return {
          content: [
            {
              type: 'image',
              data: result.base64,
              mimeType: result.mimeType,
            },
          ],
        };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'network_requests',
    'List captured network requests with optional URL filter.',
    networkRequestsSchema.shape,
    async (input) => {
      try {
        const result = await networkRequests(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'content_script_eval',
    'Execute JavaScript in the page context (ISOLATED or MAIN world).',
    contentScriptEvalSchema.shape,
    async (input) => {
      try {
        const result = await contentScriptEval(manager, input);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  server.tool(
    'reload_extension',
    'Reload the extension and re-attach to the Service Worker.',
    reloadExtensionSchema.shape,
    async () => {
      try {
        const result = await reloadExtension(manager);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    },
  );

  return server;
}
