#!/usr/bin/env node

import type { CLIOptions } from './types.js';
import { createServer } from './index.js';

function parseArgs(args: string[]): CLIOptions {
  const opts: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--extension-path':
        opts.extensionPath = args[++i];
        break;
      case '--chrome-path':
        opts.chromePath = args[++i];
        break;
      case '--user-data-dir':
        opts.userDataDir = args[++i];
        break;
      case '--no-sandbox':
        opts.noSandbox = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (args[i].startsWith('-')) {
          console.error(`Unknown option: ${args[i]}`);
          process.exit(1);
        }
    }
  }

  // Also check environment variable
  if (!opts.chromePath && process.env['CHROME_PATH']) {
    opts.chromePath = process.env['CHROME_PATH'];
  }

  return opts;
}

function printHelp(): void {
  console.error(`
crx-mcp — MCP server for Chrome extension testing

Usage: crx-mcp [options]

Options:
  --extension-path <path>   Pre-load extension at startup
  --chrome-path <path>      Path to Chrome executable
  --user-data-dir <path>    Chrome user data directory
  --no-sandbox              Disable Chrome sandbox (for CI)
  --verbose                 Enable debug logging to stderr
  -h, --help                Show this help
`);
}

const opts = parseArgs(process.argv.slice(2));
const server = createServer(opts);

async function main() {
  const { StdioServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/stdio.js'
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (opts.verbose) {
    console.error('[crx-mcp] Server started on stdio');
  }
}

main().catch((err) => {
  console.error('[crx-mcp] Fatal error:', err);
  process.exit(1);
});
