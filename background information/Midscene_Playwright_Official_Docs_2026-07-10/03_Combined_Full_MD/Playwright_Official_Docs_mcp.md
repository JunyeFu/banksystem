# Playwright Official Documentation — MCP

<!--
Source repository: microsoft/playwright.dev
Commit: a26d4b06417a23bf50adff1795730fa2ef62e3c8
Generated: 2026-07-10
License: CC BY 4.0
Format: All official Markdown/MDX pages concatenated in deterministic path order.
The original page content is retained; MDX/JSX directives may remain for fidelity.
-->

## Document index

1. `capabilities.mdx`
2. `clients/claude-code.mdx`
3. `clients/claude-desktop.mdx`
4. `clients/cursor.mdx`
5. `clients/other-clients.mdx`
6. `clients/vscode.mdx`
7. `clients/windsurf.mdx`
8. `configuration/browser-extension.mdx`
9. `configuration/options.mdx`
10. `configuration/user-profile.mdx`
11. `installation.mdx`
12. `introduction.mdx`
13. `snapshots.mdx`
14. `tools/assertions.mdx`
15. `tools/code-execution.mdx`
16. `tools/console.mdx`
17. `tools/dialogs.mdx`
18. `tools/file-upload.mdx`
19. `tools/forms.mdx`
20. `tools/interaction.mdx`
21. `tools/keyboard-mouse.mdx`
22. `tools/navigation.mdx`
23. `tools/network-mocking.mdx`
24. `tools/pdf.mdx`
25. `tools/screenshots.mdx`
26. `tools/storage.mdx`
27. `tools/tabs.mdx`
28. `tools/tracing.mdx`
29. `tools/video.mdx`
30. `tools/waiting.mdx`
31. `vision-mode.mdx`

---

<!-- BEGIN OFFICIAL PAGE 1: capabilities.mdx -->

## Source page: `capabilities.mdx`

---
title: "Capabilities"
---

# Capabilities

Capabilities control which tools the MCP server exposes to the LLM. By default, only core tools are enabled. Add capabilities to unlock additional tool groups.

## Enabling capabilities

Via CLI argument:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=vision,pdf,devtools"]
    }
  }
}
```

Via environment variable:

```bash
PLAYWRIGHT_MCP_CAPS=vision,pdf,devtools
```

Via config file:

```json
{
  "capabilities": ["core", "vision", "pdf", "devtools", "network", "storage", "testing"]
}
```

## Capability reference

### core (always enabled)

Basic browser automation — always available, cannot be disabled.

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Go back in history |
| `browser_snapshot` | Capture accessibility snapshot |
| `browser_click` | Click an element |
| `browser_hover` | Hover over an element |
| `browser_drag` | Drag and drop |
| `browser_select_option` | Select dropdown option |
| `browser_type` | Type text into element |
| `browser_press_key` | Press a key |
| `browser_fill_form` | Fill multiple form fields |
| `browser_take_screenshot` | Take a screenshot |
| `browser_run_code` | Execute Playwright code |
| `browser_wait_for` | Wait for text/time |
| `browser_evaluate` | Evaluate JavaScript |
| `browser_handle_dialog` | Accept/dismiss dialogs |
| `browser_file_upload` | Upload files |
| `browser_console_messages` | Get console output |
| `browser_network_requests` | List network requests |
| `browser_tabs` | Manage tabs |
| `browser_close` | Close browser |
| `browser_resize` | Resize window |

### network

Network mocking and state control.

| Tool | Description |
|------|-------------|
| `browser_route` | Mock requests matching a URL pattern |
| `browser_route_list` | List active mocked routes |
| `browser_unroute` | Remove mocked routes |
| `browser_network_state_set` | Set online/offline state |

```json
"--caps=network"
```

### storage

Cookie, localStorage, and sessionStorage management plus state persistence.

| Tool | Description |
|------|-------------|
| `browser_cookie_list/get/set/delete/clear` | Manage cookies |
| `browser_localstorage_list/get/set/delete/clear` | Manage localStorage |
| `browser_sessionstorage_list/get/set/delete/clear` | Manage sessionStorage |
| `browser_storage_state` | Save cookies + localStorage to file |
| `browser_set_storage_state` | Restore saved state |

```json
"--caps=storage"
```

### testing

Assertions and test generation tools.

| Tool | Description |
|------|-------------|
| `browser_verify_element_visible` | Assert element is visible by role and name |
| `browser_verify_text_visible` | Assert text is visible |
| `browser_verify_list_visible` | Assert list with items is visible |
| `browser_verify_value` | Assert form field value |
| `browser_generate_locator` | Generate Playwright locator for test code |

```json
"--caps=testing"
```

### vision

Coordinate-based mouse tools for screenshot-driven workflows. Requires a vision-capable LLM.

| Tool | Description |
|------|-------------|
| `browser_mouse_move_xy` | Move mouse to coordinates |
| `browser_mouse_click_xy` | Click at coordinates |
| `browser_mouse_drag_xy` | Drag between coordinates |
| `browser_mouse_down` | Press mouse button |
| `browser_mouse_up` | Release mouse button |
| `browser_mouse_wheel` | Scroll with mouse wheel |

```json
"--caps=vision"
```

See [Vision Mode](./vision-mode.mdx) for usage patterns.

### pdf

PDF generation.

| Tool | Description |
|------|-------------|
| `browser_pdf_save` | Export page as PDF |

```json
"--caps=pdf"
```

### devtools

Tracing, video recording, and test debugging.

| Tool | Description |
|------|-------------|
| `browser_start_tracing` | Start execution trace |
| `browser_stop_tracing` | Stop trace and save |
| `browser_start_video` | Start video recording |
| `browser_stop_video` | Stop video and save |
| `browser_video_chapter` | Add chapter marker |
| `browser_resume` | Resume paused execution |

```json
"--caps=devtools"
```

### config

Configuration introspection.

| Tool | Description |
|------|-------------|
| `browser_get_config` | Get resolved config |

```json
"--caps=config"
```

## Common configurations

### Minimal (default)

Only core tools — navigation, snapshots, clicking, typing, screenshots:

```json
["@playwright/mcp@latest"]
```

### Full automation

Everything enabled:

```json
["@playwright/mcp@latest", "--caps=network,storage,testing,vision,pdf,devtools"]
```

### Testing workflow

Core + testing assertions + storage for auth persistence:

```json
["@playwright/mcp@latest", "--caps=testing,storage"]
```

### Debugging workflow

Core + devtools for tracing and video:

```json
["@playwright/mcp@latest", "--caps=devtools"]
```

### Data extraction

Core + network for API inspection + storage for cookies:

```json
["@playwright/mcp@latest", "--caps=network,storage"]
```

## Why capabilities exist

Capabilities limit the number of tools exposed to the LLM. Fewer tools means:

- **Lower token cost** — the tool schema is smaller
- **Fewer hallucinated tool calls** — the LLM has fewer choices to confuse
- **Faster responses** — less context to process

Only enable what you need for your use case.

<!-- END OFFICIAL PAGE 1: capabilities.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 2: clients/claude-code.mdx -->

## Source page: `clients/claude-code.mdx`

---
title: "Claude Code"
---

# Claude Code

## Installation

Use the Claude Code CLI to add the Playwright MCP server:

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

The server will be available immediately in your next Claude Code session.

<!-- END OFFICIAL PAGE 2: clients/claude-code.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 3: clients/claude-desktop.mdx -->

## Source page: `clients/claude-desktop.mdx`

---
title: "Claude Desktop"
---

# Claude Desktop

## Installation

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user) and add the following to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

The configuration file location depends on your platform:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

<!-- END OFFICIAL PAGE 3: clients/claude-desktop.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 4: clients/cursor.mdx -->

## Source page: `clients/cursor.mdx`

---
title: "Cursor"
---

# Cursor

## One-click install

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor" />](https://cursor.com/en/install-mcp?name=Playwright&config=eyJjb21tYW5kIjoibnB4IEBwbGF5d3JpZ2h0L21jcEBsYXRlc3QifQ%3D%3D)

## Manual setup

Go to `Cursor Settings` → `MCP` → `Add new MCP Server`.

- Name: `playwright`
- Type: `command`
- Command: `npx @playwright/mcp@latest`

You can also verify the config or add arguments by clicking `Edit`.

<!-- END OFFICIAL PAGE 4: clients/cursor.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 5: clients/other-clients.mdx -->

## Source page: `clients/other-clients.mdx`

---
title: "Other Clients"
---

# Other Clients

The standard configuration works with most MCP clients. Consult your client's MCP documentation for where to place the config.

## Cline

Follow the [Configuring MCP Servers](https://docs.cline.bot/mcp/configuring-mcp-servers) guide. Add to your `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "timeout": 30,
      "args": ["-y", "@playwright/mcp@latest"],
      "disabled": false
    }
  }
}
```

## Codex

```bash
codex mcp add playwright npx "@playwright/mcp@latest"
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

## Copilot CLI

```bash
/mcp add
```

Or add to `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "local",
      "command": "npx",
      "tools": ["*"],
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## Goose

Go to `Advanced settings` → `Extensions` → `Add custom extension`. Use type `STDIO` and set the command to `npx @playwright/mcp`.

## Kiro

Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## Gemini CLI

Follow the MCP install [guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#configure-the-mcp-server-in-settingsjson) and use the standard config.

## opencode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": true
    }
  }
}
```

<!-- END OFFICIAL PAGE 5: clients/other-clients.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 6: clients/vscode.mdx -->

## Source page: `clients/vscode.mdx`

---
title: "VS Code"
---

# VS Code

## One-click install

Click one of the buttons below to install directly:

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code" />](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522playwright%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540playwright%252Fmcp%2540latest%2522%255D%257D) [<img alt="Install in VS Code Insiders" src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5" />](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522playwright%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540playwright%252Fmcp%2540latest%2522%255D%257D)

## CLI install

```bash
code --add-mcp '{"name":"playwright","command":"npx","args":["@playwright/mcp@latest"]}'
```

## Manual setup

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server) and use the [standard configuration](../installation.mdx).

After installation, the Playwright MCP server will be available for use with your GitHub Copilot agent in VS Code.

<!-- END OFFICIAL PAGE 6: clients/vscode.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 7: clients/windsurf.mdx -->

## Source page: `clients/windsurf.mdx`

---
title: "Windsurf"
---

# Windsurf

## Installation

Follow the Windsurf MCP [documentation](https://docs.windsurf.com/windsurf/cascade/mcp) and use the [standard configuration](../installation.mdx):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

<!-- END OFFICIAL PAGE 7: clients/windsurf.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 8: configuration/browser-extension.mdx -->

## Source page: `configuration/browser-extension.mdx`

---
title: "Connecting to Browsers"
---

# Connecting to Browsers

Instead of launching a new browser, connect to one that's already running.

## Connect by channel name

Connect to a running Chrome or Edge by its channel name. Navigate to `chrome://inspect/#remote-debugging` in the target browser and enable "Allow remote debugging for this browser instance".

<img src="/img/mcp/chrome-remote-debugging.png" width="752" height="426" alt="Chrome remote debugging settings at chrome://inspect/#remote-debugging" />

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--cdp-endpoint=chrome"]
    }
  }
}
```

Supported channels: `chrome`, `chrome-beta`, `chrome-dev`, `chrome-canary`, `msedge`, `msedge-beta`, `msedge-dev`, `msedge-canary`.

This is the simplest way to connect — no need to start Chrome with special flags or know the debugging port.

## Connect via CDP endpoint

Connect to any Chromium-based browser with a Chrome DevTools Protocol endpoint:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--cdp-endpoint=http://localhost:9222"]
    }
  }
}
```

Or in the [config file](./options.mdx):

```json
{
  "browser": {
    "cdpEndpoint": "http://localhost:9222"
  }
}
```

Works with Chrome/Chromium with `--remote-debugging-port`, Edge, Electron apps, and cloud browser services.

## Connect via browser extension

The [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm) connects to your existing browser tabs, reusing your logged-in sessions, cookies, and installed extensions.

<img src="/img/mcp/playwright-extension.png" width="662" height="427" alt="Playwright Extension in Chrome Web Store" />

1. Install the extension in Chrome or Edge
2. Configure the MCP server:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"]
    }
  }
}
```

### When to use extension mode

- **SSO / 2FA** — skip complex login flows by reusing your authenticated session
- **Browser extensions** — interact with pages that depend on installed extensions
- **Existing tabs** — automate pages you already have open

<!-- END OFFICIAL PAGE 8: configuration/browser-extension.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 9: configuration/options.mdx -->

## Source page: `configuration/options.mdx`

---
title: "Configuration"
---

# Configuration

## Headed and headless mode

By default, Playwright MCP runs the browser in **headed mode** so you can see what's happening. To run headless:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

## Browser selection

```json
["@playwright/mcp@latest", "--browser=firefox"]
```

| Value | Browser |
|-------|---------|
| `chrome` | Google Chrome (default) |
| `firefox` | Mozilla Firefox |
| `webkit` | WebKit (Safari engine) |
| `msedge` | Microsoft Edge |

## Device emulation

```json
["@playwright/mcp@latest", "--device=iPhone 15"]
```

## Viewport size

```json
["@playwright/mcp@latest", "--viewport-size=1280x720"]
```

## Proxy

```json
["@playwright/mcp@latest", "--proxy-server=http://myproxy:3128", "--proxy-bypass=localhost,*.internal.com"]
```

## Standalone HTTP server

When running a headed browser on a system without a display or from IDE worker processes, start the MCP server separately with HTTP transport:

```bash
npx @playwright/mcp@latest --port 8931
```

Then point your MCP client to the HTTP endpoint:

```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

Use `--host 0.0.0.0` to bind to all interfaces (useful in containers). Use `--shared-browser-context` to share a single browser context between multiple connected clients.

## Configuration file

For advanced settings, use a JSON config file:

```bash
npx @playwright/mcp@latest --config path/to/config.json
```

### Schema

```typescript
{
  browser?: {
    browserName?: 'chromium' | 'firefox' | 'webkit';
    isolated?: boolean;
    userDataDir?: string;
    launchOptions?: playwright.LaunchOptions;
    contextOptions?: playwright.BrowserContextOptions;
    cdpEndpoint?: string;
    cdpHeaders?: Record<string, string>;
    cdpTimeout?: number;
    remoteEndpoint?: string;
    initPage?: string[];
    initScript?: string[];
  };
  extension?: boolean;
  server?: {
    port?: number;
    host?: string;
    allowedHosts?: string[];
  };
  saveVideo?: { width: number; height: number };
  capabilities?: ('core' | 'core-navigation' | 'core-tabs' | 'core-input'
    | 'network' | 'storage' | 'testing' | 'vision' | 'pdf' | 'devtools')[];
  secrets?: Record<string, string>;
  saveSession?: boolean;
  sharedBrowserContext?: boolean;
  snapshot?: { mode?: 'full' | 'none' };
  imageResponses?: 'allow' | 'omit';
  outputDir?: string;
  outputMode?: 'file' | 'stdout';
  console?: { level?: 'error' | 'warning' | 'info' | 'debug' };
  network?: {
    allowedOrigins?: string[];
    blockedOrigins?: string[];
  };
  testIdAttribute?: string;
  timeouts?: {
    action?: number;      // default: 5000ms
    navigation?: number;  // default: 60000ms
    expect?: number;      // default: 5000ms
  };
  allowUnrestrictedFileAccess?: boolean;
  codegen?: 'typescript' | 'none';
}
```

### Init scripts

Run code on every page before the page's own scripts:

```json
{
  "browser": {
    "initScript": ["./setup.js"]
  }
}
```

```js
// setup.js
window.isPlaywrightMCP = true;
```

### Init page

Run Playwright code on the page object at startup:

```json
{
  "browser": {
    "initPage": ["./setup-page.ts"]
  }
}
```

```ts
// setup-page.ts
export default async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
};
```

## All command-line options

| Option | Description | Env Variable |
|--------|-------------|--------------|
| `--browser <browser>` | Browser to use | `PLAYWRIGHT_MCP_BROWSER` |
| `--headless` | Run headless | `PLAYWRIGHT_MCP_HEADLESS` |
| `--caps <caps>` | Enable capabilities (comma-separated) | `PLAYWRIGHT_MCP_CAPS` |
| `--config <path>` | Config file path | `PLAYWRIGHT_MCP_CONFIG` |
| `--isolated` | In-memory profile | `PLAYWRIGHT_MCP_ISOLATED` |
| `--extension` | Connect via browser extension | `PLAYWRIGHT_MCP_EXTENSION` |
| `--user-data-dir <path>` | Custom profile directory | `PLAYWRIGHT_MCP_USER_DATA_DIR` |
| `--storage-state <path>` | Initial storage state | `PLAYWRIGHT_MCP_STORAGE_STATE` |
| `--port <port>` | HTTP transport port | `PLAYWRIGHT_MCP_PORT` |
| `--host <host>` | Server host | `PLAYWRIGHT_MCP_HOST` |
| `--device <device>` | Device to emulate | `PLAYWRIGHT_MCP_DEVICE` |
| `--executable-path <path>` | Custom browser executable | `PLAYWRIGHT_MCP_EXECUTABLE_PATH` |
| `--viewport-size <size>` | Viewport (e.g., "1280x720") | `PLAYWRIGHT_MCP_VIEWPORT_SIZE` |
| `--proxy-server <url>` | Proxy server | `PLAYWRIGHT_MCP_PROXY_SERVER` |
| `--proxy-bypass <hosts>` | Bypass proxy | `PLAYWRIGHT_MCP_PROXY_BYPASS` |
| `--user-agent <ua>` | Custom user agent | `PLAYWRIGHT_MCP_USER_AGENT` |
| `--ignore-https-errors` | Ignore HTTPS errors | `PLAYWRIGHT_MCP_IGNORE_HTTPS_ERRORS` |
| `--timeout-action <ms>` | Action timeout (5000) | `PLAYWRIGHT_MCP_TIMEOUT_ACTION` |
| `--timeout-navigation <ms>` | Navigation timeout (60000) | `PLAYWRIGHT_MCP_TIMEOUT_NAVIGATION` |
| `--console-level <level>` | Console level | `PLAYWRIGHT_MCP_CONSOLE_LEVEL` |
| `--test-id-attribute <attr>` | Test ID attribute | `PLAYWRIGHT_MCP_TEST_ID_ATTRIBUTE` |
| `--codegen <lang>` | Code generation language | `PLAYWRIGHT_MCP_CODEGEN` |
| `--init-page <path>` | Page init TypeScript | `PLAYWRIGHT_MCP_INIT_PAGE` |
| `--init-script <path>` | Page init JavaScript | `PLAYWRIGHT_MCP_INIT_SCRIPT` |
| `--blocked-origins <origins>` | Block origins | `PLAYWRIGHT_MCP_BLOCKED_ORIGINS` |
| `--allowed-origins <origins>` | Allow origins | `PLAYWRIGHT_MCP_ALLOWED_ORIGINS` |
| `--grant-permissions <perms>` | Browser permissions | `PLAYWRIGHT_MCP_GRANT_PERMISSIONS` |
| `--block-service-workers` | Block service workers | `PLAYWRIGHT_MCP_BLOCK_SERVICE_WORKERS` |
| `--no-sandbox` | Disable sandbox | `PLAYWRIGHT_MCP_NO_SANDBOX` |
| `--output-dir <path>` | Output directory | `PLAYWRIGHT_MCP_OUTPUT_DIR` |
| `--save-session` | Save session data | `PLAYWRIGHT_MCP_SAVE_SESSION` |
| `--save-video <size>` | Auto-record video (e.g., "800x600") | `PLAYWRIGHT_MCP_SAVE_VIDEO` |
| `--secrets <path>` | Secrets file (dotenv) | `PLAYWRIGHT_MCP_SECRETS_FILE` |

<!-- END OFFICIAL PAGE 9: configuration/options.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 10: configuration/user-profile.mdx -->

## Source page: `configuration/user-profile.mdx`

---
title: "Profile & State"
---

# Profile & State

Playwright MCP manages browser state through profiles. By default, login state and cookies persist between sessions automatically.

## Profile modes

### Persistent (default)

Login state, cookies, and localStorage are preserved between sessions. Each project gets a separate profile automatically based on the workspace.

| Platform | Default location |
|----------|-----------------|
| macOS | `~/Library/Caches/ms-playwright/mcp-{channel}-profile` |
| Linux | `~/.cache/ms-playwright/mcp-{channel}-profile` |
| Windows | `%LOCALAPPDATA%\ms-playwright\mcp-{channel}-profile` |

Override the profile location:

```json
["@playwright/mcp@latest", "--user-data-dir=/path/to/profile"]
```

:::note
The CLI uses **in-memory** state by default (cookies persist between commands but are lost when the browser closes). Use `--persistent` to enable disk persistence. See [Sessions & Dashboard](/agent-cli/sessions) for CLI-specific session management.
:::

### Isolated

Each session starts fresh with no saved state. Pass `--isolated` to enable:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated"]
    }
  }
}
```

Load initial state into an isolated session with `--storage-state`:

```json
["@playwright/mcp@latest", "--isolated", "--storage-state=./auth-state.json"]
```

### Browser extension

Connect to your existing browser tabs instead of launching a new browser. See [Browser Extension](./browser-extension.mdx).

## Saving and restoring state

Save authenticated state for reuse across sessions:

```txt
// Login, then save
→ browser_storage_state
  State saved to: auth-state.json

// Later: restore
→ browser_set_storage_state { path: "./auth-state.json" }
```

Or load state automatically on server startup with `--storage-state`. See [Storage & Authentication](../tools/storage.mdx) for the full workflow.

<!-- END OFFICIAL PAGE 10: configuration/user-profile.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 11: installation.mdx -->

## Source page: `installation.mdx`

---
title: "Installation"
---

# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- An MCP client: VS Code, Cursor, Windsurf, Claude Code, Claude Desktop, or similar

## Installation

Add the Playwright MCP server to your client:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

See [Client Setup](./clients/vscode.mdx) for client-specific instructions. The browser downloads automatically on first use.

## First interaction

Ask your AI assistant:

```txt
Navigate to https://demo.playwright.dev/todomvc and add a few todo items.
```

The assistant calls MCP tools to open the browser, navigate, and interact — returning accessibility snapshots at each step:

```txt
→ browser_navigate { url: "https://demo.playwright.dev/todomvc" }
→ browser_snapshot

  - heading "todos" [level=1]
  - textbox "What needs to be done?" [ref=e5]

→ browser_type { ref: "e5", text: "Buy groceries", submit: true }
→ browser_snapshot

  - heading "todos" [level=1]
  - textbox "What needs to be done?" [ref=e5]
  - listitem:
    - checkbox "Toggle Todo" [ref=e10]
    - text: "Buy groceries"
  - contentinfo:
    - text: "1 item left"
```

## The workflow

Every MCP interaction follows this cycle:

1. **Navigate** — `browser_navigate` opens a URL
2. **Snapshot** — tools return the accessibility tree with element refs
3. **Interact** — the LLM uses refs to click, type, or fill
4. **Re-snapshot** — each action returns updated state

The browser opens in **headed mode** by default so you can watch. Pass `--headless` to run without a visible window.

## Example prompts

```txt
Go to https://example.com and take a screenshot.
```

```txt
Open https://demo.playwright.dev/todomvc, add three todos,
check off the first one, and take a screenshot.
```

```txt
Navigate to https://news.ycombinator.com and list the top 5 stories.
```

```txt
Save the current browser state to auth.json so we can skip login next time.
```

## Next steps

- [Snapshots](./snapshots.mdx) — how element refs work
- [Capabilities](./capabilities.mdx) — enable network mocking, storage, testing, and more
- [Configuration](./configuration/options.mdx) — headless mode, browser selection, profiles

<!-- END OFFICIAL PAGE 11: installation.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 12: introduction.mdx -->

## Source page: `introduction.mdx`

---
title: "Introduction"
---

# Playwright MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server that provides browser automation capabilities using Playwright. Enables LLMs to interact with web pages through structured accessibility snapshots — no vision models required.

## Example

```txt
You: Navigate to https://demo.playwright.dev/todomvc and add "Buy groceries".

→ browser_navigate { url: "https://demo.playwright.dev/todomvc" }
→ browser_snapshot

  - heading "todos" [level=1]
  - textbox "What needs to be done?" [ref=e5]

→ browser_type { ref: "e5", text: "Buy groceries", submit: true }
→ browser_snapshot

  - heading "todos" [level=1]
  - textbox "What needs to be done?" [ref=e5]
  - listitem:
    - checkbox "Toggle Todo" [ref=e10]
    - text: "Buy groceries"
  - contentinfo:
    - text: "1 item left"
```

The LLM reads the accessibility snapshot, finds element refs like `e5`, and uses them to interact — clicking buttons, filling forms, checking checkboxes. No screenshots or coordinate guessing needed.

## Key Features

- **Snapshot-based** — operates on the accessibility tree, not pixels. Each interactive element gets a unique ref for deterministic interaction
- **LLM-friendly** — structured text output that LLMs parse naturally, ~200-400 tokens per snapshot vs thousands for DOM/screenshots
- **Cross-browser** — Chrome, Firefox, WebKit, and Edge support
- **Full automation** — 40+ tools covering navigation, forms, network mocking, storage, tracing, video, and more
- **Persistent sessions** — login state and cookies preserved between sessions by default
- **Works everywhere** — VS Code, Cursor, Windsurf, Claude Code, Claude Desktop, and any MCP client

## Quick Start

Add the server to your MCP client:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

The browser opens in **headed mode** by default so you can see what's happening. See [Installation](./installation.mdx) for client-specific setup.

## Playwright MCP vs Playwright CLI

| | **MCP** | **[Playwright CLI](/agent-cli/introduction)** |
|---|---------|-----------|
| **Best for** | Specialized agentic loops, exploratory automation | Coding agents (Claude Code, Copilot) working with large codebases |
| **How it works** | LLM calls MCP tools with structured parameters | Agent runs shell commands |
| **Token cost** | Higher — tool schemas + snapshots in context | Lower — concise CLI output, skills loaded on demand |
| **Default mode** | Headed | Headless |
| **Setup** | JSON config in MCP client | `npm install -g @playwright/cli` |

## Available Tools

### Core
| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Go back in history |
| `browser_navigate_forward` | Go forward in history |
| `browser_reload` | Reload the page |
| `browser_snapshot` | Capture accessibility snapshot |
| `browser_click` | Click an element by ref |
| `browser_hover` | Hover over an element |
| `browser_drag` | Drag and drop between elements |
| `browser_type` | Type text into an element |
| `browser_fill_form` | Fill multiple form fields at once |
| `browser_select_option` | Select dropdown option |
| `browser_check` | Check a checkbox or radio |
| `browser_uncheck` | Uncheck a checkbox |
| `browser_press_key` | Press a key (Enter, Tab, etc.) |
| `browser_take_screenshot` | Take a PNG/JPEG screenshot |
| `browser_tabs` | List, create, close, switch tabs |
| `browser_handle_dialog` | Accept or dismiss dialogs |
| `browser_file_upload` | Upload files |
| `browser_close` | Close the browser |
| `browser_resize` | Resize the browser window |
| `browser_wait_for` | Wait for text, element, or time |

### Network & Storage
| Tool | Description |
|------|-------------|
| `browser_network_requests` | List network requests |
| `browser_route` | Mock network requests |
| `browser_route_list` | List active mocked routes |
| `browser_unroute` | Remove mocked routes |
| `browser_cookie_list/get/set/delete/clear` | Manage cookies |
| `browser_localstorage_list/get/set/delete/clear` | Manage localStorage |
| `browser_storage_state` | Save cookies + localStorage to file |
| `browser_set_storage_state` | Restore saved state |

### Testing & Debugging
| Tool | Description |
|------|-------------|
| `browser_run_code` | Execute Playwright code snippets |
| `browser_evaluate` | Evaluate JavaScript on the page |
| `browser_console_messages` | Get console output |
| `browser_generate_locator` | Generate Playwright locator for tests |
| `browser_verify_element_visible` | Assert element is visible |
| `browser_verify_text_visible` | Assert text is visible |
| `browser_start_tracing` / `browser_stop_tracing` | Record execution traces |
| `browser_start_video` / `browser_stop_video` | Record session video |
| `browser_pdf_save` | Export page as PDF |

### Vision (optional)
| Tool | Description |
|------|-------------|
| `browser_mouse_move_xy` | Move mouse to coordinates |
| `browser_mouse_down` / `browser_mouse_up` | Mouse button press/release |
| `browser_mouse_wheel` | Scroll with mouse wheel |

<!-- END OFFICIAL PAGE 12: introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 13: snapshots.mdx -->

## Source page: `snapshots.mdx`

---
title: "Snapshots"
---

# Snapshots

Playwright MCP uses accessibility snapshots instead of screenshots. Every tool that interacts with the page returns a structured tree of accessible elements with refs for interaction.

## Snapshot format

```txt
- heading "todos" [level=1]
- textbox "What needs to be done?" [ref=e5]
- listitem:
  - checkbox "Toggle Todo" [ref=e10]
  - text: "Buy groceries"
- listitem:
  - checkbox "Toggle Todo" [ref=e14]
  - text: "Water flowers"
- contentinfo:
  - text: "2 items left"
  - link "All" [ref=e20]
  - link "Active" [ref=e21]
  - link "Completed" [ref=e22]
```

Each interactive element gets a unique **ref** (e.g., `ref=e5`). The LLM uses these refs to interact:

```
browser_type   { ref: "e5", text: "headphones" }    → type into search
browser_click  { ref: "e10" }                       → check the checkbox
browser_click  { ref: "e20" }                       → click the "All" link
```

## Element refs

Refs are **stable within a single snapshot** — the same element always has the same ref until the page changes. After navigation or DOM updates, the tool returns a fresh snapshot with new refs.

| Property | Detail |
|----------|--------|
| Format | `e` followed by a number (e.g., `e1`, `e15`, `e203`) |
| Scope | Unique within a single snapshot |
| Lifetime | Valid until the next page change |
| Assignment | Only interactive elements get refs (buttons, links, inputs, etc.) |

## On-demand snapshots

Use `browser_snapshot` to capture the page state on demand. Most tools also return a snapshot automatically after each action, so the LLM always has up-to-date page state.

## Snapshots with screenshots

For pages where visual context matters (canvas apps, charts, image-heavy layouts), combine snapshots with screenshots:

```txt
Take a snapshot and a screenshot of the current page.
```

The LLM gets both the structured accessibility tree for interaction and the visual screenshot for understanding layout. See [Vision Mode](./vision-mode.mdx) for coordinate-based interaction using screenshots.

## Why snapshots over screenshots

| | Snapshots | Screenshots |
|---|-----------|-------------|
| **Token cost** | ~200-400 tokens | ~3000-5000 tokens (vision model) |
| **Precision** | Exact — refs point to specific elements | Approximate — requires coordinate guessing |
| **Speed** | Instant — text parsing | Slower — vision model inference |
| **Reliability** | Deterministic — same structure = same interaction | Variable — layout changes break coordinates |
| **Vision model** | Not required | Required |

## Best practices

1. **Use refs, not selectors** — refs from snapshots are more reliable than CSS selectors because they point to the exact element the LLM just saw
2. **Re-snapshot after navigation** — refs are invalidated when the page changes
3. **Combine with screenshots** — when visual context is needed alongside structured data
4. **Check for dialogs** — if a tool reports a dialog is open, handle it before proceeding with other actions

<!-- END OFFICIAL PAGE 13: snapshots.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 14: tools/assertions.mdx -->

## Source page: `tools/assertions.mdx`

---
title: "Testing & Assertions"
---

# Testing & Assertions

Verify page state and generate Playwright test code. Requires the **testing** [capability](../capabilities.mdx).

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=testing"]
    }
  }
}
```

## Verify elements

### browser_verify_element_visible

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `role` | string | yes | ARIA role (`button`, `heading`, `link`, `textbox`, etc.) |
| `name` | string | yes | Accessible name |

```txt
→ browser_verify_element_visible { role: "heading", name: "Dashboard" }
  ✓ Element visible: heading "Dashboard"

→ browser_verify_element_visible { role: "button", name: "Submit" }
  ✗ Element not visible: button "Submit"
```

### browser_verify_text_visible

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to look for |

```txt
→ browser_verify_text_visible { text: "3 items left" }
  ✓ Text visible: "3 items left"
```

### browser_verify_list_visible

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `label` | string | yes | Accessible name of the list |
| `items` | string[] | yes | Expected list items |

```txt
→ browser_verify_list_visible {
    label: "Todo list",
    items: ["Buy groceries", "Walk the dog", "Read a book"]
  }
  ✓ List "Todo list" visible with 3 matching items
```

### browser_verify_value

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | Element reference |
| `value` | string | yes | Expected value |

```txt
→ browser_verify_value { ref: "e3", value: "alice@example.com" }
  ✓ Value matches: "alice@example.com"
```

## Generate test code

### browser_generate_locator

Generate a Playwright locator for an element, useful when converting exploratory automation into test files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | Element reference |

```txt
→ browser_generate_locator { ref: "e15" }
  page.getByRole('button', { name: 'Submit' })

→ browser_generate_locator { ref: "e3" }
  page.getByLabel('Email')
```

## Workflow: exploratory testing to test code

```txt
→ browser_navigate { url: "https://demo.playwright.dev/todomvc" }
→ browser_type { ref: "e5", text: "Buy groceries", submit: true }
  // Generated: await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
  // Generated: await page.getByPlaceholder('What needs to be done?').press('Enter');

→ browser_verify_text_visible { text: "Buy groceries" }
  // Generated: await expect(page.getByText('Buy groceries')).toBeVisible();

→ browser_click { ref: "e10" }
  // Generated: await page.getByRole('checkbox', { name: 'Toggle Todo' }).click();

→ browser_verify_text_visible { text: "0 items left" }
  // Generated: await expect(page.getByText('0 items left')).toBeVisible();
```

The generated code can be assembled into a Playwright test:

```typescript
test('add and complete todo', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc');
  await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
  await page.getByPlaceholder('What needs to be done?').press('Enter');
  await expect(page.getByText('Buy groceries')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Toggle Todo' }).click();
  await expect(page.getByText('0 items left')).toBeVisible();
});
```

## Workflow: testing form validation

```txt
→ browser_navigate { url: "https://app.example.com/register" }
→ browser_click { ref: "e9" }   // Submit empty form
→ browser_verify_text_visible { text: "Email is required" }
  ✓ Text visible

→ browser_type { ref: "e3", text: "not-an-email" }
→ browser_click { ref: "e9" }
→ browser_verify_text_visible { text: "Please enter a valid email" }
  ✓ Text visible

→ browser_type { ref: "e3", text: "alice@example.com" }
→ browser_type { ref: "e5", text: "password123" }
→ browser_type { ref: "e7", text: "password456" }
→ browser_click { ref: "e9" }
→ browser_verify_text_visible { text: "Passwords do not match" }
  ✓ Text visible
```

<!-- END OFFICIAL PAGE 14: tools/assertions.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 15: tools/code-execution.mdx -->

## Source page: `tools/code-execution.mdx`

---
title: "Code Execution"
---

# Code Execution

Run Playwright code for complex interactions beyond individual tool calls.

## browser_run_code

Execute a Playwright code snippet. The function receives a `page` object with the full [Playwright API](/docs/api/class-page).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | Playwright code to execute |

### Verify element content

```txt
→ browser_run_code {
    code: "async (page) => { return await page.getByTestId('todo-count').textContent(); }"
  }
  "3 items left"
```

### Set geolocation

```txt
→ browser_run_code {
    code: "async (page) => { await page.context().grantPermissions(['geolocation']); await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 }); }"
  }
```

### Wait for specific condition

```txt
→ browser_run_code {
    code: "async (page) => { await page.waitForSelector('.loading', { state: 'hidden' }); return 'Loading complete'; }"
  }
  "Loading complete"
```

### Handle iframes

```txt
→ browser_run_code {
    code: "async (page) => { const frame = page.frameLocator('#payment-iframe'); return await frame.locator('.total').textContent(); }"
  }
  "$49.99"
```

### Clipboard operations

```txt
→ browser_run_code {
    code: "async (page) => { await page.context().grantPermissions(['clipboard-read', 'clipboard-write']); return await page.evaluate(() => navigator.clipboard.readText()); }"
  }
```

## browser_evaluate

Evaluate JavaScript directly on the page or a specific element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `expression` | string | yes | JavaScript to evaluate |
| `ref` | string | no | Element ref to evaluate on |

```txt
→ browser_evaluate { expression: "document.title" }
  "TodoMVC - React"

→ browser_evaluate { expression: "el => el.getAttribute('data-testid')", ref: "e15" }
  "submit-button"

→ browser_evaluate { expression: "window.innerWidth + 'x' + window.innerHeight" }
  "1280x720"
```

## When to use code execution

| Scenario | Use |
|----------|-----|
| Click a button | `browser_click` |
| Fill a form field | `browser_type` or `browser_fill_form` |
| Read element text | `browser_snapshot` |
| Check computed styles | `browser_evaluate` |
| Complex multi-step logic | `browser_run_code` |
| Geolocation/permissions | `browser_run_code` |
| Custom wait conditions | `browser_run_code` |
| Iframe interactions | `browser_run_code` |

<!-- END OFFICIAL PAGE 15: tools/code-execution.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 16: tools/console.mdx -->

## Source page: `tools/console.mdx`

---
title: "Console"
---

# Console

Access browser console output for debugging. Console tools are part of the **core** capability and always available.

## browser_console_messages

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `level` | string | no | Minimum level: `error`, `warning`, `info`, `debug`. Each level includes more severe levels. |

```txt
→ browser_console_messages

  [error] Uncaught TypeError: Cannot read property 'map' of undefined
    at app.js:42:15
  [warning] Deprecation: 'window.webkitStorageInfo' is deprecated.
  [info] App initialized in 234ms
  [info] User session restored

→ browser_console_messages { level: "error" }
  [error] Uncaught TypeError: Cannot read property 'map' of undefined
    at app.js:42:15
```

## browser_console_clear

Clear the console message buffer.

## Workflow: debugging a broken page

```txt
You: The page looks broken. Check the console for errors.

→ browser_console_messages { level: "error" }
  [error] Failed to fetch: GET https://api.example.com/data 404
  [error] Uncaught Error: API returned 404

→ // LLM now knows the API endpoint is returning 404
→ // Can mock the route or investigate further
```

<!-- END OFFICIAL PAGE 16: tools/console.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 17: tools/dialogs.mdx -->

## Source page: `tools/dialogs.mdx`

---
title: "Dialogs"
---

# Dialogs

Handle browser dialogs (alert, confirm, prompt) that block page interaction.

## browser_handle_dialog

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `accept` | boolean | yes | `true` to accept, `false` to dismiss |
| `promptText` | string | no | Text to enter for prompt dialogs |

When a dialog appears, other tools will report it in their response. Handle the dialog before continuing.

### Alert dialog

```txt
→ browser_click { ref: "e5" }
  ⚠ Dialog appeared: [alert] "Are you sure you want to delete this?"

→ browser_handle_dialog { accept: true }
```

### Confirm dialog

```txt
→ browser_click { ref: "e10" }
  ⚠ Dialog appeared: [confirm] "Are you sure you want to delete this?"

→ browser_handle_dialog { accept: true }     // click OK
→ browser_handle_dialog { accept: false }    // click Cancel
```

### Prompt dialog

```txt
→ browser_click { ref: "e8" }
  ⚠ Dialog appeared: [prompt] "Enter your name:"

→ browser_handle_dialog { accept: true, promptText: "My new name" }
```

## Workflow

When a dialog appears, other tools will report it in their response. Handle the dialog before continuing:

```txt
→ browser_click { ref: "e12" }
  ⚠ Dialog appeared: [confirm] "Discard unsaved changes?"

→ browser_handle_dialog { accept: true }

→ browser_snapshot
  // Page now shows updated state after dialog was accepted
```

<!-- END OFFICIAL PAGE 17: tools/dialogs.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 18: tools/file-upload.mdx -->

## Source page: `tools/file-upload.mdx`

---
title: "File Upload"
---

# File Upload

## browser_file_upload

Handle file chooser dialogs. When a page opens a file picker, provide file paths to upload.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paths` | string[] | yes | Absolute file paths to upload. Omit to cancel. |

```txt
→ browser_click { ref: "e8" }  // clicks "Choose file" button
  ⚠ File chooser opened

→ browser_file_upload { paths: ["/home/user/documents/report.pdf"] }
→ browser_snapshot
  - text: "report.pdf selected"
  - button "Upload" [ref=e12]

→ browser_click { ref: "e12" }
```

### Multiple files

```txt
→ browser_file_upload {
    paths: [
      "/home/user/photos/image1.jpg",
      "/home/user/photos/image2.jpg"
    ]
  }
```

### Cancel file chooser

```txt
→ browser_file_upload { paths: [] }
```

:::note
By default, file uploads are restricted to paths within the MCP workspace roots. Use `--allow-unrestricted-file-access` to allow uploads from anywhere.
:::

<!-- END OFFICIAL PAGE 18: tools/file-upload.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 19: tools/forms.mdx -->

## Source page: `tools/forms.mdx`

---
title: "Forms"
---

# Forms

## browser_type

Type text into an editable element (input, textarea, contenteditable).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | Element reference |
| `text` | string | yes | Text to type |
| `submit` | boolean | no | Press Enter after typing |
| `slowly` | boolean | no | Type one character at a time (triggers key handlers) |

```txt
→ browser_type { ref: "e5", text: "Buy groceries" }
→ browser_type { ref: "e5", text: "Buy groceries", submit: true }  // types + Enter
→ browser_type { ref: "e8", text: "search query", slowly: true }   // triggers autocomplete
```

## browser_fill_form

Fill multiple form fields at once. Supports textboxes, checkboxes, radio buttons, comboboxes, and sliders.

```txt
→ browser_snapshot
  - textbox "First name" [ref=e3]
  - textbox "Last name" [ref=e5]
  - textbox "Email" [ref=e7]
  - checkbox "Accept terms" [ref=e9]
  - combobox "Country" [ref=e11]
  - radio "Monthly plan" [ref=e13]
  - radio "Annual plan" [ref=e15]

→ browser_fill_form {
    fields: [
      { ref: "e3", value: "Alice" },
      { ref: "e5", value: "Smith" },
      { ref: "e7", value: "alice@example.com" },
      { ref: "e9", value: true },
      { ref: "e11", value: "United States" },
      { ref: "e15", value: true }
    ]
  }
```

This is more efficient than calling `browser_type` and `browser_click` for each field individually.

## browser_check / browser_uncheck

Check or uncheck a checkbox or radio button.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | Element reference |

```txt
→ browser_check { ref: "e9" }     // check the "Accept terms" checkbox
→ browser_uncheck { ref: "e9" }   // uncheck it
```

## Workflow: completing a multi-step form

```txt
You: Fill out the registration form on this page.

→ browser_snapshot
  // Page 1: Personal info
  - textbox "Email" [ref=e3]
  - textbox "Password" [ref=e5]
  - button "Next" [ref=e7]

→ browser_type { ref: "e3", text: "alice@example.com" }
→ browser_type { ref: "e5", text: "s3cureP@ss!" }
→ browser_click { ref: "e7" }

→ browser_snapshot
  // Page 2: Profile
  - textbox "Display name" [ref=e3]
  - combobox "Timezone" [ref=e5]
  - checkbox "Subscribe to newsletter" [ref=e7]
  - button "Create account" [ref=e9]

→ browser_fill_form {
    fields: [
      { ref: "e3", value: "Alice S." },
      { ref: "e5", value: "US/Pacific" },
      { ref: "e7", value: true }
    ]
  }
→ browser_click { ref: "e9" }
```

<!-- END OFFICIAL PAGE 19: tools/forms.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 20: tools/interaction.mdx -->

## Source page: `tools/interaction.mdx`

---
title: "Interaction"
---

# Interaction

Click, hover, drag, and select elements using refs from accessibility snapshots.

| Tool | Description |
|------|-------------|
| `browser_click` | Click an element |
| `browser_hover` | Hover over an element |
| `browser_drag` | Drag and drop between elements |
| `browser_select_option` | Select a dropdown option |
| `browser_resize` | Resize the browser window |

## Targeting elements

Every interaction tool takes a `ref` parameter that identifies the target element. Refs come from
accessibility snapshots returned by `browser_snapshot` or after navigation. Take a snapshot first,
find the element's `[ref=...]` tag, then pass that ref to the interaction tool.

```txt
→ browser_snapshot
  - button "Submit" [ref=e12]       ← ref is "e12"
  - link "Learn more" [ref=e15]     ← ref is "e15"

→ browser_click { ref: "e12" }      // clicks the Submit button
```

## browser_click

Click an element on the page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | Element reference from snapshot |

```txt
→ browser_click { ref: "e12" }       // clicks the Submit button
→ browser_click { ref: "e15" }       // clicks the Learn more link
```

## browser_hover

Hover over an element to trigger tooltips, dropdowns, or hover states.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | Element reference from snapshot |

```txt
→ browser_hover { ref: "e3" }
→ browser_snapshot
  // Snapshot now shows the revealed dropdown menu
  - menuitem "Profile" [ref=e20]
  - menuitem "Settings" [ref=e21]
  - menuitem "Logout" [ref=e22]
```

## browser_drag

Drag one element and drop it onto another.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startRef` | string | yes | Element to drag |
| `endRef` | string | yes | Element to drop onto |

```txt
→ browser_drag { startRef: "e5", endRef: "e10" }
```

## browser_select_option

Select one or more options in a `<select>` dropdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | string | yes | The select element ref |
| `values` | string[] | yes | Values or labels to select |

```txt
→ browser_snapshot
  - combobox "Country" [ref=e7]

→ browser_select_option { ref: "e7", values: ["United States"] }
```

## browser_resize

Resize the browser window.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `width` | number | yes | Width in pixels |
| `height` | number | yes | Height in pixels |

```txt
→ browser_resize { width: 375, height: 812 }    // mobile viewport
→ browser_resize { width: 1920, height: 1080 }  // desktop
```

## Workflow: filling a form and submitting

```txt
→ browser_snapshot
  - textbox "Email" [ref=e3]
  - textbox "Password" [ref=e5]
  - combobox "Role" [ref=e7]
  - button "Sign up" [ref=e9]

→ browser_type { ref: "e3", text: "alice@example.com" }
→ browser_type { ref: "e5", text: "s3cret!" }
→ browser_select_option { ref: "e7", values: ["Admin"] }
→ browser_click { ref: "e9" }

→ browser_snapshot
  - heading "Welcome, Alice!" [level=1]
  - text: "Your account has been created."
```

<!-- END OFFICIAL PAGE 20: tools/interaction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 21: tools/keyboard-mouse.mdx -->

## Source page: `tools/keyboard-mouse.mdx`

---
title: "Keyboard & Mouse"
---

# Keyboard & Mouse

## Keyboard

### browser_press_key

Press a key or key combination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | yes | Key to press |

**Common keys:** `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`

**Key combinations:** `Control+a`, `Control+c`, `Control+v`, `Shift+Tab`, `Alt+F4`

```txt
→ browser_press_key { key: "Enter" }         // submit form
→ browser_press_key { key: "Tab" }           // move to next field
→ browser_press_key { key: "Escape" }        // close modal
→ browser_press_key { key: "Control+a" }     // select all text
→ browser_press_key { key: "ArrowDown" }     // navigate dropdown
```

### browser_type

Type text into an element. See [Forms](./forms.mdx) for details.

## Mouse (Vision mode)

These tools are available when the **vision** capability is enabled (`--caps=vision`). They use pixel coordinates from screenshots rather than element refs from snapshots.

### browser_mouse_move_xy

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `x` | number | yes | X coordinate in pixels |
| `y` | number | yes | Y coordinate in pixels |

### browser_mouse_down / browser_mouse_up

Press or release the mouse button at the current position.

### browser_mouse_wheel

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deltaX` | number | yes | Horizontal scroll (pixels) |
| `deltaY` | number | yes | Vertical scroll (pixels, positive = down) |

### browser_mouse_click_xy

Click at specific coordinates without needing to move first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `x` | number | yes | X coordinate |
| `y` | number | yes | Y coordinate |
| `button` | string | no | `left` (default), `right`, or `middle` |
| `clickCount` | number | no | Number of clicks (2 for double-click) |
| `delay` | number | no | Delay between mousedown and mouseup (ms) |

```txt
→ browser_mouse_click_xy { x: 150, y: 300 }
→ browser_mouse_click_xy { x: 150, y: 300, clickCount: 2 }  // double-click
```

### browser_mouse_drag_xy

Drag from one position to another.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startX` | number | yes | Start X coordinate |
| `startY` | number | yes | Start Y coordinate |
| `endX` | number | yes | End X coordinate |
| `endY` | number | yes | End Y coordinate |

```txt
→ browser_mouse_drag_xy { startX: 100, startY: 200, endX: 400, endY: 200 }
```

### When to use mouse tools

| Scenario | Use |
|----------|-----|
| Clicking a button, link, or form element | `browser_click` with ref (default) |
| Canvas-based apps (drawing, maps) | Mouse tools with vision |
| Custom UI controls without accessibility | Mouse tools with vision |
| Drag interactions on pixel-precise targets | Mouse tools with vision |

For most web applications, **refs from accessibility snapshots are more reliable** than coordinates. Use mouse tools only when the accessibility tree doesn't expose the elements you need.

<!-- END OFFICIAL PAGE 21: tools/keyboard-mouse.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 22: tools/navigation.mdx -->

## Source page: `tools/navigation.mdx`

---
title: "Navigation"
---

# Navigation

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Go back to the previous page |
| `browser_navigate_forward` | Go forward to the next page |
| `browser_reload` | Reload the current page |
| `browser_close` | Close the current page and browser |

## browser_navigate

Navigate to a URL in the current tab.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to navigate to |

```txt
You: Go to https://demo.playwright.dev/todomvc

→ browser_navigate { url: "https://demo.playwright.dev/todomvc" }
→ Returns snapshot of the loaded page:

  - heading "todos" [level=1]
  - textbox "What needs to be done?" [ref=e5]
```

## browser_navigate_back

Go back to the previous page in the browser history.

```txt
You: Go back to the previous page.

→ browser_navigate_back
→ Returns snapshot of the previous page
```

## browser_navigate_forward

Go forward to the next page in the browser history.

```txt
You: Go forward.

→ browser_navigate_forward
```

## browser_reload

Reload the current page.

```txt
You: Reload the page.

→ browser_reload
→ Returns fresh snapshot after reload
```

## browser_close

Close the current page and browser.

```txt
→ browser_close
```

## Workflow example

```txt
You: Open the TodoMVC app, add an item, then go back to see
     if the item persists.

→ browser_navigate { url: "https://demo.playwright.dev/todomvc" }
→ browser_type { ref: "e5", text: "Buy groceries", submit: true }
→ browser_navigate { url: "https://example.com" }
→ browser_navigate_back
→ browser_snapshot

  - heading "todos" [level=1]
  - textbox "What needs to be done?" [ref=e5]
  - listitem:
    - checkbox "Toggle Todo" [ref=e10]
    - text: "Buy groceries"
```

<!-- END OFFICIAL PAGE 22: tools/navigation.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 23: tools/network-mocking.mdx -->

## Source page: `tools/network-mocking.mdx`

---
title: "Network & Mocking"
---

# Network & Mocking

Inspect network traffic, mock API responses, and test offline behavior. Inspecting requests is part of **core** and always available. Mocking and network state control require the **network** [capability](../capabilities.mdx).

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=network"]
    }
  }
}
```

## Inspect network requests

### browser_network_requests

List requests made since page load. Part of **core** — no extra capability needed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter` | string | no | Regexp pattern to filter URLs |
| `includeStatic` | boolean | no | Include images, CSS, fonts |
| `includeBody` | boolean | no | Include request body |
| `includeHeaders` | boolean | no | Include request headers |

```txt
→ browser_network_requests { filter: "api" }

  GET  200 https://api.example.com/me              8ms   application/json
  POST 201 https://api.example.com/users/create     45ms  application/json
  GET  200 https://api.example.com/settings         12ms  application/json
```

## Mock API responses

### browser_route

Intercept requests matching a URL pattern and return a custom response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | yes | URL pattern (`**` glob supported) |
| `status` | number | no | HTTP status code |
| `body` | string | no | Response body |
| `contentType` | string | no | Content-Type header |
| `headers` | object | no | Additional response headers |
| `removeHeaders` | string[] | no | Headers to strip from request |

### Mock an API endpoint

```txt
You: Mock the /api/users endpoint to return two test users.

→ browser_route {
    pattern: "**/api/users",
    status: 200,
    body: "[{\"id\":1,\"name\":\"Alice\"},{\"id\":2,\"name\":\"Bob\"}]",
    contentType: "application/json"
  }
→ browser_reload
→ browser_snapshot
  - heading "Users" [level=1]
  - list "User list":
    - listitem: "Alice"
    - listitem: "Bob"
```

### Test error handling

```txt
You: Test what happens when the API returns a 503 error.

→ browser_route { pattern: "**/api/users", status: 503 }
→ browser_reload
→ browser_snapshot
  - heading "Something went wrong" [level=1]
  - button "Retry" [ref=e5]

→ browser_take_screenshot
```

Remove the mock and verify recovery:

```txt
→ browser_unroute
→ browser_click { ref: "e5" }
→ browser_snapshot
  - heading "Users" [level=1]
  - list "User list":
    - listitem: "Alice Johnson"
    - listitem: "Bob Smith"
```

### Block resources

```txt
→ browser_route { pattern: "**/*.jpg", status: 404 }
→ browser_route { pattern: "**/analytics/**", status: 204 }
```

### Strip authentication headers

```txt
→ browser_route { pattern: "**/api/**", removeHeaders: ["cookie", "authorization"] }
→ browser_reload
  // Page shows 401 / login prompt
```

### Conditional mocking with code

For complex scenarios — delays, conditional responses, request body inspection — use `browser_run_code`:

```txt
→ browser_run_code {
    code: "async (page) => {
      await page.route('**/api/search', async route => {
        const url = new URL(route.request().url());
        const query = url.searchParams.get('q');
        await route.fulfill({
          body: JSON.stringify(query === 'empty' ? [] : [{ title: 'Result: ' + query }])
        });
      });
    }"
  }
```

## Manage routes

### browser_route_list

```txt
→ browser_route_list

  Pattern              Status  Content-Type
  **/api/users         200     application/json
  **/*.jpg             404     -
  **/analytics/**      204     -
```

### browser_unroute

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | no | Pattern to remove. Omit to remove all. |

## Test offline mode

### browser_network_state_set

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | yes | `online` or `offline` |

```txt
→ browser_network_state_set { state: "offline" }
→ browser_reload
→ browser_snapshot
  - heading "No internet connection" [level=1]

→ browser_network_state_set { state: "online" }
→ browser_reload
  // Page loads normally
```

<!-- END OFFICIAL PAGE 23: tools/network-mocking.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 24: tools/pdf.mdx -->

## Source page: `tools/pdf.mdx`

---
title: "PDF Export"
---

# PDF Export

Save the current page as a PDF file. Requires the **pdf** [capability](../capabilities.mdx).

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=pdf"]
    }
  }
}
```

## browser_pdf_save

Save the current page as a PDF file. The PDF is saved to the output directory.

```txt
→ browser_pdf_save
  PDF saved to: /output/page-2024-03-15.pdf
```

:::note
PDF export requires the **pdf** capability, shown in the configuration above.
:::

## Use cases

- Saving receipts or invoices from web applications
- Archiving web pages for offline review
- Generating reports from dashboards
- Creating documentation from rendered HTML

<!-- END OFFICIAL PAGE 24: tools/pdf.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 25: tools/screenshots.mdx -->

## Source page: `tools/screenshots.mdx`

---
title: "Screenshots"
---

# Screenshots

## browser_take_screenshot

Capture the current page, a specific element, or the full scrollable page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | no | `png` (default) or `jpeg` |
| `ref` | string | no | Element ref to screenshot a specific element |
| `fullPage` | boolean | no | Capture full scrollable page |

### Page screenshot

```txt
You: Take a screenshot of the current page.
→ browser_take_screenshot
→ Returns: PNG image of the viewport
```

### Element screenshot

```txt
You: Take a screenshot of just the login form.
→ browser_take_screenshot { ref: "e12" }
→ Returns: PNG image cropped to the element
```

### Full-page screenshot

```txt
You: Take a full-page screenshot including content below the fold.
→ browser_take_screenshot { fullPage: true }
→ Returns: PNG image of entire scrollable page
```

## When to use screenshots

Screenshots complement accessibility snapshots:

| Use case | Best tool |
|----------|-----------|
| Interacting with elements | Accessibility snapshot (refs) |
| Verifying visual layout | Screenshot |
| Canvas/chart content | Screenshot |
| Documenting a bug | Screenshot |
| Understanding page structure | Accessibility snapshot |
| Reading text content | Accessibility snapshot |

<!-- END OFFICIAL PAGE 25: tools/screenshots.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 26: tools/storage.mdx -->

## Source page: `tools/storage.mdx`

---
title: "Storage & Authentication"
---

# Storage & Authentication

Manage cookies, localStorage, sessionStorage, and save/restore full browser state for authentication persistence. Requires the **storage** [capability](../capabilities.mdx).

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=storage"]
    }
  }
}
```

## Storage state

Save and restore the full browser state (cookies + localStorage) in a single file. This is the primary way to persist authentication across sessions.

### browser_storage_state

Save current state to a JSON file.

```txt
→ browser_storage_state
  State saved to: auth-state.json
```

### browser_set_storage_state

Restore a previously saved state.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Path to state JSON file |

```txt
→ browser_set_storage_state { path: "./auth-state.json" }
→ browser_navigate { url: "https://app.example.com/dashboard" }
→ browser_snapshot
  // Already logged in
  - heading "Dashboard" [level=1]
```

### Workflow: save login, skip it next time

```txt
// Login once
→ browser_navigate { url: "https://app.example.com/login" }
→ browser_type { ref: "e3", text: "alice@example.com" }
→ browser_type { ref: "e5", text: "s3cret!" }
→ browser_click { ref: "e7" }
→ browser_snapshot
  - heading "Dashboard" [level=1]

// Save
→ browser_storage_state
  State saved to: auth-state.json

// Next session: restore instead of logging in
→ browser_set_storage_state { path: "./auth-state.json" }
→ browser_navigate { url: "https://app.example.com/dashboard" }
```

Or load state automatically on server startup:

```json
["@playwright/mcp@latest", "--caps=storage", "--isolated", "--storage-state=./auth-state.json"]
```

## Cookies

### browser_cookie_list

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | no | Filter by domain |
| `path` | string | no | Filter by path |

```txt
→ browser_cookie_list

  Name          Value       Domain            HttpOnly  Secure  Expires
  session_id    abc123      .example.com      true      true    2024-12-31
  theme         dark        .example.com      false     false   Session
  _ga           GA1.2...    .example.com      false     false   2026-01-01
```

### browser_cookie_get

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Cookie name |

### browser_cookie_set

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Cookie name |
| `value` | string | yes | Cookie value |
| `domain` | string | no | Cookie domain |
| `path` | string | no | Cookie path (default: `/`) |
| `expires` | number | no | Expiration as Unix timestamp |
| `httpOnly` | boolean | no | HTTP-only flag |
| `secure` | boolean | no | Secure flag |
| `sameSite` | string | no | `Strict`, `Lax`, or `None` |

### browser_cookie_delete / browser_cookie_clear

Delete a specific cookie by name, or clear all cookies.

### Workflow: test logout by clearing cookies

```txt
→ browser_cookie_clear
→ browser_reload
→ browser_snapshot
  - heading "Sign in" [level=1]
  - textbox "Email" [ref=e3]
```

## localStorage

### browser_localstorage_list / get / set / delete / clear

Manage localStorage key-value pairs for the current origin.

| Tool | Parameters |
|------|-----------|
| `browser_localstorage_list` | (none) |
| `browser_localstorage_get` | `key` (string) |
| `browser_localstorage_set` | `key` (string), `value` (string) |
| `browser_localstorage_delete` | `key` (string) |
| `browser_localstorage_clear` | (none) |

```txt
→ browser_localstorage_list
  Key                Value
  user_preferences   {"theme":"dark","lang":"en"}
  onboarding_done    true

→ browser_localstorage_set { key: "onboarding_done", value: "false" }
→ browser_reload
→ browser_snapshot
  // Onboarding wizard appears
  - heading "Welcome! Let's get started" [level=1]
```

## sessionStorage

Same interface as localStorage but session-scoped — data is cleared when the tab closes.

| Tool | Parameters |
|------|-----------|
| `browser_sessionstorage_list` | (none) |
| `browser_sessionstorage_get` | `key` (string) |
| `browser_sessionstorage_set` | `key` (string), `value` (string) |
| `browser_sessionstorage_delete` | `key` (string) |
| `browser_sessionstorage_clear` | (none) |

<!-- END OFFICIAL PAGE 26: tools/storage.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 27: tools/tabs.mdx -->

## Source page: `tools/tabs.mdx`

---
title: "Tabs"
---

# Tabs

## browser_tabs

Manage browser tabs — list, create, close, or switch between them.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | yes | `list`, `new`, `close`, or `select` |
| `url` | string | no | URL for `new` action |
| `index` | number | no | Tab index for `select` or `close` |

### List all tabs

```txt
→ browser_tabs { action: "list" }

  Tab 0: "TodoMVC" - https://demo.playwright.dev/todomvc
  Tab 1: "Example" - https://example.com
  Tab 2: "Google" - https://google.com
  * active: Tab 0
```

### Open a new tab

```txt
→ browser_tabs { action: "new", url: "https://example.com" }
→ Returns snapshot of the new tab
```

### Switch to a tab

```txt
→ browser_tabs { action: "select", index: 1 }
→ Returns snapshot of the selected tab
```

### Close a tab

```txt
→ browser_tabs { action: "close" }           // close current tab
→ browser_tabs { action: "close", index: 2 } // close specific tab
```

## Workflow: comparing two pages

```txt
You: Open staging and production, compare the headers.

→ browser_navigate { url: "https://staging.example.com" }
→ browser_snapshot   // snapshot of staging
→ browser_tabs { action: "new", url: "https://example.com" }
→ browser_snapshot   // snapshot of production
  // LLM compares the two snapshots
```

<!-- END OFFICIAL PAGE 27: tools/tabs.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 28: tools/tracing.mdx -->

## Source page: `tools/tracing.mdx`

---
title: "Tracing"
---

# Tracing

Record execution traces that capture DOM snapshots, screenshots, network activity, and console logs at every step. Requires the **devtools** [capability](../capabilities.mdx).

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=devtools"]
    }
  }
}
```

## browser_start_tracing

```txt
→ browser_start_tracing
  Tracing started
```

## browser_stop_tracing

```txt
→ browser_stop_tracing
  Trace saved to: /output/trace-2024-03-15.zip
  Network log: /output/trace-2024-03-15.network
```

View traces in the [Playwright Trace Viewer](/docs/trace-viewer-intro):

```bash
npx playwright show-trace /output/trace-2024-03-15.zip
```

The trace viewer shows a timeline of every action with DOM snapshots (before and after), screenshots, network requests and responses, console messages, and timing.

## Workflow: debugging a broken checkout

```txt
You: Something fails during checkout. Record a trace.

→ browser_start_tracing
→ browser_navigate { url: "https://store.example.com/cart" }
→ browser_click { ref: "e15" }    // "Proceed to checkout"
→ browser_fill_form { fields: [
    { ref: "e30", value: "Alice Smith" },
    { ref: "e32", value: "123 Main St" },
    { ref: "e34", value: "94102" }
  ]}
→ browser_click { ref: "e40" }    // "Place order"
→ browser_snapshot
  - heading "Error" [level=1]
  - text: "Payment processing failed"

→ browser_console_messages { level: "error" }
  [error] POST /api/payment 422: {"error":"Card number required"}

→ browser_stop_tracing
  // Share trace with the team for full timeline analysis
```

## Automatic session recording

Save traces for every session automatically:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=devtools", "--save-session"]
    }
  }
}
```

<!-- END OFFICIAL PAGE 28: tools/tracing.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 29: tools/video.mdx -->

## Source page: `tools/video.mdx`

---
title: "Video Recording"
---

# Video Recording

Record browser sessions as WebM videos with chapter markers. Requires the **devtools** [capability](../capabilities.mdx).

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=devtools"]
    }
  }
}
```

## browser_start_video

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filename` | string | no | Custom filename |
| `width` | number | no | Video width in pixels |
| `height` | number | no | Video height in pixels |

## browser_stop_video

```txt
→ browser_stop_video
  Video saved to: /output/login-flow.webm
```

## browser_video_chapter

Add chapter markers for structured recordings.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Chapter title |
| `description` | string | no | Chapter description |
| `duration` | number | no | Display duration in ms |

## Workflow: recording a bug reproduction

```txt
→ browser_start_video { filename: "cart-bug-repro.webm" }

→ browser_video_chapter { title: "Setup: add items to cart" }
→ browser_navigate { url: "https://store.example.com" }
→ browser_click { ref: "e8" }     // Add item 1
→ browser_click { ref: "e12" }    // Add item 2
→ browser_click { ref: "e20" }    // Go to cart

→ browser_video_chapter {
    title: "Verify items in cart",
    description: "Both items should be visible"
  }
→ browser_snapshot
  - list "Cart items":
    - listitem: "Headphones - $49.99"
    - listitem: "Cable - $9.99"

→ browser_video_chapter {
    title: "Bug: refresh clears cart",
    description: "Cart should persist but items disappear"
  }
→ browser_reload
→ browser_snapshot
  - heading "Your cart is empty" [level=1]
→ browser_take_screenshot

→ browser_stop_video
  // Attach cart-bug-repro.webm to the bug report
```

## Automatic recording

Record all sessions automatically using the environment variable:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=devtools"],
      "env": { "PLAYWRIGHT_MCP_SAVE_VIDEO": "800x600" }
    }
  }
}
```

Or via the [config file](../configuration/options.mdx):

```json
{
  "saveVideo": { "width": 800, "height": 600 }
}
```

## Use cases

| Scenario | Approach |
|----------|----------|
| Bug reproduction | Record steps, attach to issue |
| Test documentation | Record with chapter markers |
| Agent monitoring | Record agent sessions for review |
| Demo creation | Record polished walkthrough |

<!-- END OFFICIAL PAGE 29: tools/video.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 30: tools/waiting.mdx -->

## Source page: `tools/waiting.mdx`

---
title: "Waiting"
---

# Waiting

## browser_wait_for

Wait for a condition before proceeding. Accepts one of three modes:

| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | number | Seconds to wait |
| `text` | string | Text to appear on the page |
| `textGone` | string | Text to disappear from the page |

### Wait for text to appear

```txt
→ browser_wait_for { text: "Upload complete" }
  ✓ Text appeared: "Upload complete"
```

### Wait for text to disappear

```txt
→ browser_wait_for { textGone: "Loading..." }
  ✓ Text disappeared: "Loading..."
```

### Wait a fixed duration

```txt
→ browser_wait_for { time: 3 }
  ✓ Waited 3 seconds
```

## Workflow: waiting for async operations

```txt
You: Click the upload button and wait for it to finish.

→ browser_click { ref: "e9" }
→ browser_snapshot
  - progressbar "Uploading..." [ref=e12]

→ browser_wait_for { textGone: "Uploading..." }
→ browser_snapshot
  - text: "Upload complete! File saved."
  - link "View file" [ref=e15]
```

For more complex wait conditions (CSS selectors, JavaScript expressions), use [browser_run_code](./code-execution.mdx):

```txt
→ browser_run_code {
    code: "async (page) => { await page.waitForSelector('.data-loaded'); }"
  }
```

<!-- END OFFICIAL PAGE 30: tools/waiting.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 31: vision-mode.mdx -->

## Source page: `vision-mode.mdx`

---
title: "Vision Mode"
---

# Vision Mode

By default, Playwright MCP uses accessibility snapshots for all interactions. Vision mode adds coordinate-based tools that work with screenshots, enabling interaction with elements not exposed in the accessibility tree.

## Enabling vision mode

Add the `vision` capability:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=vision"]
    }
  }
}
```

## Additional tools

With vision mode, these coordinate-based tools become available:

| Tool | Description |
|------|-------------|
| `browser_mouse_move_xy` | Move mouse to x,y coordinates |
| `browser_mouse_click_xy` | Click at x,y (supports button, double-click, delay) |
| `browser_mouse_drag_xy` | Drag from start to end coordinates |
| `browser_mouse_down` | Press mouse button |
| `browser_mouse_up` | Release mouse button |
| `browser_mouse_wheel` | Scroll with mouse wheel |

## Workflow: interacting with a canvas app

```txt
You: Draw a rectangle on the canvas.

→ browser_take_screenshot
  // LLM sees the canvas and identifies coordinates

→ browser_mouse_click_xy { x: 100, y: 150 }
→ browser_mouse_drag_xy { startX: 100, startY: 150, endX: 300, endY: 250 }
→ browser_take_screenshot
  // LLM verifies the rectangle was drawn
```

## Workflow: clicking an icon without accessible name

```txt
→ browser_snapshot
  // The gear icon has no accessible name in the snapshot

→ browser_take_screenshot
  // LLM sees the gear icon at approximately (850, 45)

→ browser_mouse_click_xy { x: 850, y: 45 }
→ browser_snapshot
  // Settings panel is now open with proper accessibility
  - heading "Settings" [level=2]
  - textbox "Display name" [ref=e12]
```

## When to use vision mode

| Scenario | Approach |
|----------|----------|
| Standard web pages | Use refs from snapshots (default) |
| Canvas / WebGL apps | Vision mode with screenshots |
| Map interactions | Vision mode for pan/zoom |
| Image editors | Vision mode for drawing |
| Charts / graphs | Vision mode to click data points |
| Custom widgets without ARIA | Vision mode as fallback |

For most web applications, **the default snapshot-based approach is more reliable and token-efficient**. Use vision mode only when the accessibility tree doesn't cover your use case.

## Combining capabilities

Enable multiple capabilities:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=vision,pdf,devtools"]
    }
  }
}
```

Or in the config file:

```json
{
  "capabilities": ["core", "vision", "pdf", "devtools"]
}
```

<!-- END OFFICIAL PAGE 31: vision-mode.mdx -->

---

