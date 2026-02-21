# crx-mcp

MCP server for Chrome extension testing. Access `chrome.storage`, Service Workers, `declarativeNetRequest`, and more directly from AI coding agents like Claude Code.

## Why?

Existing browser MCP servers (like Playwright MCP) can't access Chrome extension internals. `crx-mcp` fills this gap with 15 purpose-built tools for extension development and testing.

## Quick Start

### With Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "crx-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "crx-mcp"]
    }
  }
}
```

Then in Claude Code:

```
> Load my extension from ./my-extension and check if storage is working

Claude will use extension_load, then storage_get to inspect chrome.storage
```

### CLI

```bash
npx crx-mcp --extension-path ./my-extension --verbose
```

## Tools (15)

### Core

| Tool | Description |
|------|-------------|
| `extension_load` | Load an unpacked extension and launch Chrome. Returns extension ID. |
| `navigate` | Navigate to a URL. Returns title and status code. |
| `snapshot` | Accessibility tree snapshot of page, popup, or side panel. |
| `storage_get` | Read from `chrome.storage` (local/sync/session). |
| `storage_set` | Write to `chrome.storage` (local/sync/session). |
| `eval_service_worker` | Execute JavaScript in the Service Worker context. |
| `console_logs` | Get console logs from all contexts (page, SW, popup, sidepanel). |

### Extension-Specific

| Tool | Description |
|------|-------------|
| `manifest_validate` | Validate `manifest.json` against MV3 requirements (no browser needed). |
| `open_popup` | Open the extension popup and return accessibility snapshot. |
| `open_sidepanel` | Open the side panel and return accessibility snapshot. |
| `dnr_rules` | List `declarativeNetRequest` rules (dynamic/session/static). |
| `permissions_check` | Compare declared vs granted permissions. |

### Advanced

| Tool | Description |
|------|-------------|
| `screenshot` | Take a PNG screenshot (base64). |
| `network_requests` | List captured network requests with URL filter. |
| `content_script_eval` | Execute JS in page context (ISOLATED or MAIN world). |
| `reload_extension` | Hot-reload the extension and re-attach to Service Worker. |

## CLI Options

```
crx-mcp [options]
  --extension-path <path>   Pre-load extension at startup
  --chrome-path <path>      Path to Chrome executable
  --user-data-dir <path>    Chrome user data directory
  --no-sandbox              Disable sandbox (for CI/Docker)
  --verbose                 Debug logging to stderr
```

## Requirements

- **Node.js** >= 18
- **Google Chrome** installed (detected automatically on Windows, macOS, Linux)
- Extensions require **headed mode** (no headless)

## How It Works

1. `extension_load` launches Chrome with `--load-extension` and detects the extension ID
2. Service Worker communication uses Chrome DevTools Protocol (CDP) sessions
3. `chrome.storage`, `declarativeNetRequest`, and `permissions` are accessed via JS evaluation in the SW context
4. Console logs are collected from all contexts (page, SW, popup, sidepanel) into a ring buffer
5. Network requests are monitored via CDP `Network.enable`
6. Popup and side panel are opened in new tabs (actual popup/sidepanel UI requires user gestures)

## Use Cases

- **Automated testing** of Chrome extensions during development
- **AI-assisted debugging** — let Claude inspect storage, logs, and network traffic
- **CI/CD validation** — validate manifests and permissions without manual testing
- **Extension factory workflows** — quickly test multiple extensions in sequence

## License

MIT
