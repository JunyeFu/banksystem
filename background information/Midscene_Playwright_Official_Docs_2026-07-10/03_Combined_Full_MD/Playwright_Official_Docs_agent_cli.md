# Playwright Official Documentation — Agent CLI

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
2. `commands/attach.mdx`
3. `commands/console-eval.mdx`
4. `commands/dialogs.mdx`
5. `commands/interaction.mdx`
6. `commands/keyboard-mouse.mdx`
7. `commands/navigation.mdx`
8. `commands/network-routing.mdx`
9. `commands/screenshots-pdf.mdx`
10. `commands/storage.mdx`
11. `commands/tabs.mdx`
12. `commands/test-debugging.mdx`
13. `commands/tracing.mdx`
14. `commands/video-recording.mdx`
15. `configuration.mdx`
16. `installation.mdx`
17. `introduction.mdx`
18. `quick-start.mdx`
19. `sessions.mdx`
20. `skills.mdx`
21. `snapshots.mdx`
22. `vision-mode.mdx`

---

<!-- BEGIN OFFICIAL PAGE 1: capabilities.mdx -->

## Source page: `capabilities.mdx`

---
title: "Capabilities"
---

# Capabilities

The CLI and MCP share the same underlying Playwright tools, organized into capability groups. In the CLI all capabilities are always available — there's no gating. This page maps commands to their capability groups for reference.

## Core

Always available. Basic browser automation.

| Command | Description |
|---------|-------------|
| `open`, `goto`, `close` | Open, navigate, close browser |
| `go-back`, `go-forward`, `reload` | History navigation |
| `click`, `dblclick`, `hover`, `drag` | Element interaction |
| `type`, `fill`, `select` | Text input and dropdowns |
| `check`, `uncheck` | Checkboxes and radio buttons |
| `press`, `keydown`, `keyup` | Keyboard input |
| `snapshot` | Capture accessibility tree |
| `screenshot` | Take screenshot |
| `upload` | Upload files |
| `dialog-accept`, `dialog-dismiss` | Handle dialogs |
| `resize` | Resize browser window |
| `eval`, `run-code` | Execute JavaScript / Playwright code |

## Network

Network inspection and mocking.

| Command | Description |
|---------|-------------|
| `network` | List network requests since page load |
| `route` | Mock requests matching a URL pattern |
| `route-list` | List active mocked routes |
| `unroute` | Remove mocked routes |
| `network-state-set` | Set online/offline state |

See [Network & Mocking](./commands/network-routing.mdx) for usage.

## Storage

Cookie, localStorage, and sessionStorage management plus state persistence.

| Command | Description |
|---------|-------------|
| `state-save`, `state-load` | Save/restore full browser state |
| `cookie-list/get/set/delete/clear` | Manage cookies |
| `localstorage-list/get/set/delete/clear` | Manage localStorage |
| `sessionstorage-list/get/set/delete/clear` | Manage sessionStorage |

See [Storage & Authentication](./commands/storage.mdx) for usage.

## Vision

Coordinate-based mouse interaction using pixel positions from screenshots. Useful for canvas apps, maps, and custom widgets without accessible elements.

| Command | Description |
|---------|-------------|
| `mousemove <x> <y>` | Move mouse to coordinates |
| `mousedown [button]` | Press mouse button |
| `mouseup [button]` | Release mouse button |
| `mousewheel <dx> <dy>` | Scroll with mouse wheel |
| `screenshot` | Capture viewport for coordinate reference |

See [Vision Mode](./vision-mode.mdx) for when and how to use coordinate-based interaction.

## DevTools

Tracing, video recording, and test debugging.

| Command | Description |
|---------|-------------|
| `console` | View console messages |
| `tracing-start`, `tracing-stop` | Record execution traces |
| `video-start`, `video-stop`, `video-chapter` | Record session videos |
| `show` | Open visual dashboard |
| `pause-at`, `resume`, `step-over` | Test debugging |

## PDF

PDF generation.

| Command | Description |
|---------|-------------|
| `pdf` | Export page as PDF |

## Testing

Assertions and test generation tools.

| Command | Description |
|---------|-------------|
| `verify-element-visible` | Assert element is visible by role and name |
| `verify-text-visible` | Assert text is visible |
| `verify-list-visible` | Assert list with items is visible |
| `verify-value` | Assert form field value |
| `generate-locator` | Generate Playwright locator for test code |

<!-- END OFFICIAL PAGE 1: capabilities.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 2: commands/attach.mdx -->

## Source page: `commands/attach.mdx`

---
title: "Attach"
---

# Attach

Connect to an existing browser instead of launching a new one.

## Commands

| Command | Description |
|---------|-------------|
| `attach --cdp=<channel>` | Connect to a running browser by channel name |
| `attach --cdp=<url>` | Connect via Chrome DevTools Protocol endpoint |
| `attach --endpoint=<url>` | Connect to a Playwright server endpoint |
| `attach --extension` | Connect via Playwright Extension (defaults to Chrome) |
| `attach --extension=<channel>` | Connect via Playwright Extension to a specific channel |

## Attach by channel name

Connect to a running Chrome or Edge instance by its channel name. The browser must have remote debugging enabled — navigate to `chrome://inspect/#remote-debugging` in the target browser and check "Allow remote debugging for this browser instance".

<img src="/img/mcp/chrome-remote-debugging.png" width="752" height="426" alt="Chrome remote debugging settings at chrome://inspect/#remote-debugging" />

```bash
# Attach to Chrome
playwright-cli attach --cdp=chrome

# Attach to Chrome Canary
playwright-cli attach --cdp=chrome-canary

# Attach to Microsoft Edge
playwright-cli attach --cdp=msedge

# Attach to Edge Dev
playwright-cli attach --cdp=msedge-dev
```

Supported channels: `chrome`, `chrome-beta`, `chrome-dev`, `chrome-canary`, `msedge`, `msedge-beta`, `msedge-dev`, `msedge-canary`.

This is the simplest way to connect — no need to start Chrome with special flags or know the debugging port.

## CDP endpoint

Connect to any Chromium-based browser with a Chrome DevTools Protocol endpoint:

```bash
# Start Chrome with remote debugging
google-chrome --remote-debugging-port=9222

# Connect from the CLI
playwright-cli attach --cdp=http://localhost:9222
playwright-cli snapshot
playwright-cli click e5
```

Works with:
- Chrome / Chromium with `--remote-debugging-port`
- Edge with remote debugging
- Electron apps exposing CDP
- Cloud browser services (Browserbase, etc.)

## Playwright server endpoint

Connect to a remote Playwright server:

```bash
playwright-cli attach --endpoint=ws://localhost:3000
playwright-cli snapshot
```

## Browser extension

Connect to your existing browser tabs using the [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm). This lets you reuse your logged-in sessions, cookies, and installed extensions.

<img src="/img/mcp/playwright-extension.png" width="662" height="427" alt="Playwright Extension in Chrome Web Store" />

```bash
# Attach to Chrome (default)
playwright-cli attach --extension

# Attach to a specific channel
playwright-cli attach --extension=chrome-canary
playwright-cli attach --extension=msedge
playwright-cli attach --extension=msedge-dev
```

If no channel is specified, the extension attaches to Chrome by default.

### When to use extension mode

- **SSO / 2FA** — skip complex login flows by reusing your authenticated session
- **Browser extensions** — interact with pages that depend on installed extensions
- **Existing tabs** — automate pages you already have open

## Named sessions

Attach creates a session. Use `-s` to name it:

```bash
playwright-cli attach --cdp=chrome -s=debug-session
playwright-cli -s=debug-session snapshot
playwright-cli -s=debug-session click e5
```

## Workflow: connect to your running Chrome

```bash
# 1. In Chrome, go to chrome://inspect/#remote-debugging
#    and enable "Allow remote debugging for this browser instance"

# 2. Attach by channel name
playwright-cli attach --cdp=chrome

# 3. Interact with your existing tabs
playwright-cli snapshot
playwright-cli screenshot --filename=current-state.png

# 4. Save state for future headless sessions
playwright-cli state-save auth.json
```

## Workflow: debugging a remote browser

```bash
# On the remote machine: start Chrome with debugging
google-chrome --remote-debugging-port=9222

# On your machine: connect via SSH tunnel
ssh -L 9222:localhost:9222 user@remote-host

# Attach and inspect
playwright-cli attach --cdp=http://localhost:9222
playwright-cli snapshot
playwright-cli screenshot --filename=remote-state.png
playwright-cli console error
```

<!-- END OFFICIAL PAGE 2: commands/attach.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 3: commands/console-eval.mdx -->

## Source page: `commands/console-eval.mdx`

---
title: "Console & Eval"
---

# Console & Eval

## Console messages

```bash
playwright-cli console                  # all messages (info and above)
playwright-cli console error            # errors only
playwright-cli console warning          # warnings and errors
playwright-cli console debug            # everything
playwright-cli console --clear          # clear the message buffer
```

```bash
$ playwright-cli console error
# [error] Uncaught TypeError: Cannot read property 'map' of undefined
#   at app.js:42:15
# [error] Failed to fetch: GET /api/users 404
```

### Workflow: debugging a broken page

```bash
# Check the console for errors
playwright-cli console error
# [error] Failed to fetch: GET https://api.example.com/data 404
# [error] Uncaught Error: API returned 404

# Now you know the API endpoint is returning 404
# Mock the route or investigate further
playwright-cli route "**/api/data" \
  --body='{"items":[]}' --content-type=application/json
playwright-cli reload
```

## JavaScript evaluation

```bash
playwright-cli eval <expression> [ref]
```

### Page-level evaluation

```bash
$ playwright-cli eval "() => document.title"
# React - TodoMVC

$ playwright-cli eval "() => window.innerWidth + 'x' + window.innerHeight"
# 1280x720
```

### Element evaluation

```bash
$ playwright-cli eval "(el) => el.getAttribute('data-id')" e15
# item-42

$ playwright-cli eval "(el) => getComputedStyle(el).color" e5
# rgb(255, 0, 0)
```

## Running Playwright code

Execute arbitrary Playwright scripts with full API access:

```bash
playwright-cli run-code <code>
playwright-cli run-code --filename=script.js
```

### Set geolocation

```bash
playwright-cli run-code "async (page) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({latitude: 37.77, longitude: -122.42});
}"
```

### Wait for specific condition

```bash
playwright-cli run-code "async (page) => {
  await page.waitForSelector('.data-loaded');
  return 'Data loaded successfully';
}"
```

### Scrape structured data

```bash
playwright-cli run-code "async (page) => {
  const items = await page.$$eval('.product', els =>
    els.map(el => ({
      name: el.querySelector('.name').textContent,
      price: el.querySelector('.price').textContent
    }))
  );
  return JSON.stringify(items, null, 2);
}"
```

<!-- END OFFICIAL PAGE 3: commands/console-eval.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 4: commands/dialogs.mdx -->

## Source page: `commands/dialogs.mdx`

---
title: "Dialogs"
---

# Dialogs

Handle browser dialogs (alert, confirm, prompt) that block page interaction.

## Commands

| Command | Description |
|---------|-------------|
| `dialog-accept [prompt]` | Accept a dialog, optionally providing prompt text |
| `dialog-dismiss` | Dismiss (cancel) a dialog |

## Alert dialogs

```bash
$ playwright-cli click e5
# ⚠ Dialog appeared: [alert] "Item has been deleted."

$ playwright-cli dialog-accept
```

## Confirm dialogs

```bash
$ playwright-cli click e10
# ⚠ Dialog appeared: [confirm] "Are you sure you want to delete this?"

# Accept (OK)
$ playwright-cli dialog-accept

# Or dismiss (Cancel)
$ playwright-cli dialog-dismiss
```

## Prompt dialogs

```bash
$ playwright-cli click e8
# ⚠ Dialog appeared: [prompt] "Enter your name:"

# Accept with text
$ playwright-cli dialog-accept "Alice"

# Or dismiss (cancels the prompt)
$ playwright-cli dialog-dismiss
```

## Workflow

When a dialog appears, other commands will report it. Handle the dialog before continuing:

```bash
$ playwright-cli click e12
# ⚠ Dialog appeared: [confirm] "Discard unsaved changes?"

$ playwright-cli dialog-accept

$ playwright-cli snapshot
# Page now shows updated state after dialog was accepted
```

<!-- END OFFICIAL PAGE 4: commands/dialogs.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 5: commands/interaction.mdx -->

## Source page: `commands/interaction.mdx`

---
title: "Interaction"
---

# Interaction

## Commands

| Command | Description |
|---------|-------------|
| `click <ref> [button]` | Click an element (left, right, or middle button) |
| `dblclick <ref> [button]` | Double-click an element |
| `fill <ref> <text>` | Clear and fill text into an input |
| `fill <ref> <text> --submit` | Fill and press Enter |
| `type <text>` | Type text into the focused element |
| `select <ref> <value>` | Select a dropdown option |
| `check <ref>` | Check a checkbox or radio button |
| `uncheck <ref>` | Uncheck a checkbox |
| `hover <ref>` | Hover over an element |
| `drag <startRef> <endRef>` | Drag and drop |
| `upload <file>` | Upload files |
| `resize <width> <height>` | Resize the browser window |

## Targeting elements

### Refs from snapshots (recommended)

```bash
playwright-cli snapshot                 # get element refs
playwright-cli click e15                # click by ref
playwright-cli fill e3 "hello"          # fill by ref
```

### CSS selectors

```bash
playwright-cli click "#main > button.submit"
playwright-cli click "[data-testid='submit']"
playwright-cli fill "#email" "test@example.com"
```

### Playwright locators

```bash
playwright-cli click "getByRole('button', { name: 'Submit' })"
playwright-cli click "getByTestId('submit-button')"
playwright-cli click "getByText('Login')"
playwright-cli fill "getByLabel('Email')" "test@example.com"
```

## Form interaction

```bash
# Fill a text field
playwright-cli fill e3 "test@example.com"

# Fill and submit (presses Enter)
playwright-cli fill e3 "search query" --submit

# Select from dropdown
playwright-cli select e7 "United States"

# Checkboxes
playwright-cli check e10                # check
playwright-cli uncheck e10              # uncheck

# File upload
playwright-cli upload /path/to/file.pdf

# Resize browser window
playwright-cli resize 375 812           # mobile viewport
playwright-cli resize 1920 1080         # desktop
```

## Workflow: login form

```bash
$ playwright-cli snapshot
# - textbox "Email" [ref=e3]
# - textbox "Password" [ref=e5]
# - checkbox "Remember me" [ref=e7]
# - button "Sign in" [ref=e9]

$ playwright-cli fill e3 "alice@example.com"
$ playwright-cli fill e5 "s3cureP@ss!"
$ playwright-cli check e7
$ playwright-cli click e9

$ playwright-cli snapshot
# - heading "Welcome back, Alice!" [level=1]
```

<!-- END OFFICIAL PAGE 5: commands/interaction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 6: commands/keyboard-mouse.mdx -->

## Source page: `commands/keyboard-mouse.mdx`

---
title: "Keyboard & Mouse"
---

# Keyboard & Mouse

## Keyboard

| Command | Description |
|---------|-------------|
| `press <key>` | Press a key (e.g., `Enter`, `ArrowLeft`, `a`) |
| `keydown <key>` | Press key down |
| `keyup <key>` | Release key |

### Common keys

`Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `Space`,
`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`,
`Home`, `End`, `PageUp`, `PageDown`

### Key combinations

```bash
playwright-cli press Control+a          # select all
playwright-cli press Control+c          # copy
playwright-cli press Control+v          # paste
playwright-cli press Shift+Tab          # focus previous
playwright-cli press Alt+Enter          # alt+enter
```

### Keyboard navigation

```bash
playwright-cli press Tab                # next field
playwright-cli press Tab                # next field
playwright-cli press ArrowDown          # navigate dropdown
playwright-cli press ArrowDown
playwright-cli press Enter              # select option
```

## Mouse

| Command | Description |
|---------|-------------|
| `mousemove <x> <y>` | Move mouse to coordinates |
| `mousedown [button]` | Press mouse button (left, right, middle) |
| `mouseup [button]` | Release mouse button |
| `mousewheel <dx> <dy>` | Scroll (dx=horizontal, dy=vertical) |

```bash
# Click at coordinates
playwright-cli mousemove 100 200
playwright-cli mousedown
playwright-cli mouseup

# Right-click
playwright-cli mousemove 300 400
playwright-cli mousedown right
playwright-cli mouseup right

# Scroll down 500 pixels
playwright-cli mousewheel 0 500

# Scroll right 200 pixels
playwright-cli mousewheel 200 0
```

### When to use mouse commands

| Scenario | Recommended approach |
|----------|---------------------|
| Clicking a button, link, or form element | `click`, `fill`, and other ref-based commands |
| Canvas-based apps (drawing, maps) | Mouse commands with coordinates |
| Custom UI controls without accessibility | Mouse commands with coordinates |
| Drag interactions on pixel-precise targets | Mouse commands with coordinates |

For most web applications, **refs from accessibility snapshots are more reliable** than coordinates. Use mouse commands only when the accessibility tree doesn't expose the elements you need.

<!-- END OFFICIAL PAGE 6: commands/keyboard-mouse.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 7: commands/navigation.mdx -->

## Source page: `commands/navigation.mdx`

---
title: "Navigation"
---

# Navigation

## Commands

| Command | Description |
|---------|-------------|
| `open [url]` | Open browser, optionally navigate to URL |
| `goto <url>` | Navigate to a URL |
| `go-back` | Go back to the previous page |
| `go-forward` | Go forward to the next page |
| `reload` | Reload the current page |
| `close` | Close the browser |

## Opening a browser

```bash
# Open browser without navigating
playwright-cli open

# Open and navigate
playwright-cli open https://example.com

# With options
playwright-cli open https://example.com --headed
playwright-cli open https://example.com --browser=firefox
playwright-cli open https://example.com --persistent
```

## Navigating

```bash
$ playwright-cli goto https://demo.playwright.dev/todomvc
### Page
- Page URL: https://demo.playwright.dev/todomvc/#/
- Page Title: React - TodoMVC
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

## History navigation

```bash
$ playwright-cli goto https://example.com/page1
$ playwright-cli goto https://example.com/page2
$ playwright-cli go-back
# Now at page1

$ playwright-cli go-forward
# Now at page2

$ playwright-cli reload
# page2 reloaded
```

## Closing

```bash
playwright-cli close                    # close current page
playwright-cli close-all                # close all browser sessions
```

## Workflow: navigation with history

```bash
$ playwright-cli open https://demo.playwright.dev/todomvc
$ playwright-cli fill e5 "Buy groceries" --submit
$ playwright-cli goto https://example.com
$ playwright-cli go-back
$ playwright-cli snapshot
# - heading "todos" [level=1]
# - textbox "What needs to be done?" [ref=e5]
# - listitem:
#   - checkbox "Toggle Todo" [ref=e10]
#   - text: "Buy groceries"
```

<!-- END OFFICIAL PAGE 7: commands/navigation.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 8: commands/network-routing.mdx -->

## Source page: `commands/network-routing.mdx`

---
title: "Network & Mocking"
---

# Network & Mocking

Inspect network traffic, mock API responses, and test offline behavior.

## Inspect network requests

```bash
playwright-cli network                  # all requests since page load
playwright-cli network --filter="api"   # filter by URL pattern
playwright-cli network --static         # include images, CSS, fonts
playwright-cli network --request-body   # include request bodies
playwright-cli network --request-headers # include headers
playwright-cli network --clear          # clear the log
```

```bash
$ playwright-cli network --filter="api"
# GET  200 https://api.example.com/users        12ms  application/json
# POST 201 https://api.example.com/users/create  45ms  application/json
```

## Mock API responses

```bash
playwright-cli route <pattern> [options]
```

| Option | Description |
|--------|-------------|
| `--status=<code>` | HTTP status code |
| `--body=<text>` | Response body (text or JSON string) |
| `--content-type=<type>` | Content-Type header |
| `--header=<name:value>` | Additional response headers |
| `--remove-header=<names>` | Headers to strip from request (comma-separated) |

### Mock an API endpoint

```bash
playwright-cli route "**/api/users" \
  --body='[{"name":"Alice"},{"name":"Bob"}]' \
  --content-type=application/json
```

### Test error handling

```bash
playwright-cli route "**/api/data" --status=500
playwright-cli route "**/api/data" --status=503
```

### Block resources

```bash
playwright-cli route "**/*.jpg" --status=404
playwright-cli route "**/analytics/**" --status=204
```

### Strip authentication headers

```bash
playwright-cli route "**/*" --remove-header=cookie,authorization
```

## Manage routes

```bash
playwright-cli route-list               # list active routes
playwright-cli unroute "**/api/users"   # remove specific route
playwright-cli unroute                  # remove all routes
```

## Conditional mocking with code

For complex scenarios -- delays, conditional responses, or request body inspection -- use `run-code`:

```bash
playwright-cli run-code "async (page) => {
  await page.route('**/api/users', async route => {
    const body = route.request().postDataJSON();
    if (body.role === 'admin') {
      await route.fulfill({
        body: JSON.stringify({ permissions: ['read', 'write', 'delete'] })
      });
    } else {
      await route.fulfill({
        body: JSON.stringify({ permissions: ['read'] })
      });
    }
  });
}"
```

## Workflow: testing error handling

```bash
# 1. Mock the API to return 503
playwright-cli route "**/api/users" --status=503

# 2. Reload to trigger the error
playwright-cli reload

# 3. Verify the error page
playwright-cli snapshot
# - heading "Something went wrong" [level=1]
# - button "Retry" [ref=e5]

# 4. Screenshot the error state
playwright-cli screenshot --filename=error-state.png

# 5. Remove mock and retry
playwright-cli unroute
playwright-cli click e5
playwright-cli snapshot
# - heading "Users" [level=1]
```

## Test offline mode

```bash
playwright-cli network-state-set offline   # go offline
playwright-cli reload                     # page shows offline state
playwright-cli snapshot
# - heading "No internet connection" [level=1]

playwright-cli network-state-set online   # restore connection
playwright-cli reload                     # page loads normally
```

<!-- END OFFICIAL PAGE 8: commands/network-routing.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 9: commands/screenshots-pdf.mdx -->

## Source page: `commands/screenshots-pdf.mdx`

---
title: "Screenshots & PDF"
---

# Screenshots & PDF

## Screenshots

| Command | Description |
|---------|-------------|
| `screenshot` | Screenshot of the viewport |
| `screenshot [ref]` | Screenshot of a specific element |
| `screenshot --filename=f` | Save with custom filename |
| `screenshot --full-page` | Full scrollable page |

```bash
$ playwright-cli screenshot
# Screenshot saved to .playwright-cli/screenshot-2026-03-15.png

$ playwright-cli screenshot e15
# Screenshot of element e15

$ playwright-cli screenshot --filename=login-page.png
$ playwright-cli screenshot --full-page --filename=full-page.png
```

## PDF export

```bash
playwright-cli pdf                      # save with auto-generated name
playwright-cli pdf --filename=page.pdf  # save with custom name
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

## Snapshots

For accessibility tree output (not a visual capture):

```bash
playwright-cli snapshot                 # full page snapshot
playwright-cli snapshot --filename=f    # custom filename
playwright-cli snapshot [ref]           # element snapshot
playwright-cli snapshot --depth=N       # limit depth
```

See [Snapshots](../snapshots.mdx) for details on the format and usage.

<!-- END OFFICIAL PAGE 9: commands/screenshots-pdf.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 10: commands/storage.mdx -->

## Source page: `commands/storage.mdx`

---
title: "Storage & Authentication"
---

# Storage & Authentication

Manage cookies, localStorage, sessionStorage, and save/restore full browser state for authentication persistence.

## Storage state (cookies + localStorage)

Save and restore the full browser state (cookies + localStorage) in a single file. This is the primary way to persist authentication across sessions.

```bash
playwright-cli state-save [filename]    # save to file (default: auto-named)
playwright-cli state-load <filename>    # restore from file
```

### Workflow: save login, skip it next time

```bash
# Login once
playwright-cli open https://app.example.com/login
playwright-cli fill e3 "user@example.com"
playwright-cli fill e5 "password123"
playwright-cli click e7

# Save authenticated state
playwright-cli state-save auth.json

# Later, skip login entirely
playwright-cli state-load auth.json
playwright-cli goto https://app.example.com/dashboard
# Already logged in!
```

## Cookies

| Command | Description |
|---------|-------------|
| `cookie-list [--domain] [--path]` | List cookies (optionally filtered by domain or path) |
| `cookie-get <name>` | Get a specific cookie |
| `cookie-set <name> <value> [options]` | Set a cookie |
| `cookie-delete <name>` | Delete a cookie |
| `cookie-clear` | Clear all cookies |

### cookie-set options

| Option | Description |
|--------|-------------|
| `--domain=<domain>` | Cookie domain |
| `--path=<path>` | Cookie path (default: `/`) |
| `--expires=<timestamp>` | Expiration as Unix timestamp |
| `--http-only` | HTTP-only flag |
| `--secure` | Secure flag |
| `--same-site=<value>` | `Strict`, `Lax`, or `None` |

```bash
$ playwright-cli cookie-list
# Name          Value       Domain            HttpOnly  Secure  Expires
# session_id    abc123      .example.com      true      true    2024-12-31
# theme         dark        .example.com      false     false   Session

$ playwright-cli cookie-list --domain=.github.com
$ playwright-cli cookie-get session_id
$ playwright-cli cookie-set theme light
$ playwright-cli cookie-set session abc123 --domain=.example.com --secure --http-only
$ playwright-cli cookie-delete session_id
$ playwright-cli cookie-clear
```

### Workflow: test logout by clearing cookies

```bash
playwright-cli cookie-clear
playwright-cli reload
playwright-cli snapshot
# - heading "Sign in" [level=1]
# - textbox "Email" [ref=e3]
```

## localStorage

| Command | Description |
|---------|-------------|
| `localstorage-list` | List all key-value pairs |
| `localstorage-get <key>` | Get a value by key |
| `localstorage-set <key> <value>` | Set a value |
| `localstorage-delete <key>` | Delete a key |
| `localstorage-clear` | Clear all |

```bash
$ playwright-cli localstorage-list
# Key                Value
# user_preferences   {"theme":"dark","lang":"en"}
# onboarding_done    true

$ playwright-cli localstorage-get user_preferences
# {"theme":"dark","lang":"en"}

$ playwright-cli localstorage-set onboarding_done "false"
$ playwright-cli reload
# Onboarding wizard appears
```

## sessionStorage

Same commands with `sessionstorage-` prefix. Data is cleared when the tab closes.

```bash
playwright-cli sessionstorage-list
playwright-cli sessionstorage-get <key>
playwright-cli sessionstorage-set <key> <value>
playwright-cli sessionstorage-delete <key>
playwright-cli sessionstorage-clear
```

<!-- END OFFICIAL PAGE 10: commands/storage.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 11: commands/tabs.mdx -->

## Source page: `commands/tabs.mdx`

---
title: "Tabs"
---

# Tabs

| Command | Description |
|---------|-------------|
| `tab-list` | List all open tabs |
| `tab-new [url]` | Open a new tab |
| `tab-select <index>` | Switch to tab by index |
| `tab-close [index]` | Close a tab |

## Listing tabs

```bash
$ playwright-cli tab-list
# Tab 0: "TodoMVC" - https://demo.playwright.dev/todomvc  [active]
# Tab 1: "Example" - https://example.com
# Tab 2: "Google" - https://google.com
```

## Creating tabs

```bash
playwright-cli tab-new                  # blank tab
playwright-cli tab-new https://example.com  # navigate immediately
```

## Switching tabs

```bash
playwright-cli tab-select 1             # switch to second tab
playwright-cli tab-select 0             # switch back to first
```

## Closing tabs

```bash
playwright-cli tab-close                # close current tab
playwright-cli tab-close 2              # close specific tab
```

## Workflow: comparing pages

```bash
playwright-cli open https://staging.example.com
playwright-cli snapshot --filename=staging.yaml
playwright-cli tab-new https://example.com
playwright-cli snapshot --filename=production.yaml
# Agent compares the two snapshots
```

<!-- END OFFICIAL PAGE 11: commands/tabs.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 12: commands/test-debugging.mdx -->

## Source page: `commands/test-debugging.mdx`

---
title: "Test Debugging"
---

# Test Debugging

Use the CLI to debug Playwright test failures interactively.

## Connecting to a paused test

Start a test with the debug flag:

```bash
npx playwright test --debug=cli
```

The test pauses at the start and outputs a session name. Connect to it:

```bash
playwright-cli attach <session-name>
```

Then explore the page state:

```bash
playwright-cli snapshot                 # see current state
playwright-cli console error           # check for errors
playwright-cli eval "() => document.title"
playwright-cli screenshot --filename=debug-state.png
```

And control execution:

```bash
playwright-cli resume                   # continue
playwright-cli step-over                # step to next action
playwright-cli pause-at test.ts:42      # set a breakpoint
```

## Workflow: investigating a flaky test

```bash
# 1. Run the failing test
npx playwright test tests/checkout.spec.ts --debug=cli

# 2. Connect
playwright-cli attach playwright-test-1

# 3. Record a trace
playwright-cli tracing-start

# 4. Step through
playwright-cli resume
playwright-cli snapshot
playwright-cli console
playwright-cli network

# 5. Investigate at the failing step
playwright-cli screenshot --filename=before-failure.png
playwright-cli eval "() => document.querySelector('.spinner')?.style.display"

# 6. Save trace
playwright-cli tracing-stop
```

<!-- END OFFICIAL PAGE 12: commands/test-debugging.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 13: commands/tracing.mdx -->

## Source page: `commands/tracing.mdx`

---
title: "Tracing"
---

# Tracing

Record execution traces that capture DOM snapshots, screenshots, network activity, and console logs at every step.

## Commands

```bash
playwright-cli tracing-start            # start recording
playwright-cli tracing-stop             # stop and save
```

## Basic recording

```bash
playwright-cli tracing-start
playwright-cli goto https://example.com
playwright-cli click e5
playwright-cli fill e3 "test"
playwright-cli tracing-stop
# Trace saved to .playwright-cli/trace.zip
```

View the trace in the [Playwright Trace Viewer](/docs/trace-viewer-intro):

```bash
npx playwright show-trace .playwright-cli/trace.zip
```

The Trace Viewer shows a timeline of every action with DOM snapshots (before and after), screenshots, network requests and responses, console messages, and timing.

## Workflow: debugging a failing scenario

```bash
# Start tracing
playwright-cli tracing-start

# Walk through the failing flow
playwright-cli goto https://store.example.com/checkout
playwright-cli fill e10 "4111111111111111"
playwright-cli click e15

# Check what went wrong
playwright-cli snapshot
# - text: "Payment processing failed"

playwright-cli console error
# [error] POST /api/payment 422: {"error":"Card number must include expiry"}

# Save trace for analysis
playwright-cli tracing-stop
# Share trace with the team for full timeline analysis
```

## Automatic session recording

Save traces for every session automatically with the `--save-session` flag:

```bash
playwright-cli --save-session
```

<!-- END OFFICIAL PAGE 13: commands/tracing.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 14: commands/video-recording.mdx -->

## Source page: `commands/video-recording.mdx`

---
title: "Video Recording"
---

# Video Recording

Record browser sessions as WebM videos with chapter markers.

## Commands

```bash
playwright-cli video-start [filename]   # start recording
playwright-cli video-chapter <title>    # add chapter marker
playwright-cli video-stop               # stop and save
```

## Basic recording

```bash
playwright-cli video-start demo.webm
playwright-cli goto https://example.com
playwright-cli click e5
playwright-cli fill e3 "test"
playwright-cli video-stop
# Video saved to: .playwright-cli/demo.webm
```

## Chapter markers

Add structure for navigation and review:

```bash
playwright-cli video-start

playwright-cli video-chapter "Step 1: Login"
playwright-cli goto https://app.example.com/login
playwright-cli fill e3 "user@example.com"
playwright-cli fill e5 "password"
playwright-cli click e7

playwright-cli video-chapter "Step 2: Navigate to settings"
playwright-cli goto /settings

playwright-cli video-chapter "Step 3: Update profile"
playwright-cli fill e10 "New Display Name"
playwright-cli click e15

playwright-cli video-stop
```

### Chapter options

```bash
playwright-cli video-chapter "Title" \
  --description="Detailed description" \
  --duration=2000  # show chapter card for 2 seconds
```

### Video size

```bash
playwright-cli video-start --size=800x600
```

## Use cases

| Scenario | Approach |
|----------|----------|
| Bug reproduction | Record steps, attach to issue |
| Test documentation | Record with chapter markers |
| Agent monitoring | Record agent sessions for review |
| Demo creation | Record polished walkthrough |

## Automatic recording

Record all sessions automatically via the [config file](../configuration.mdx):

```json
{
  "saveVideo": { "width": 800, "height": 600 }
}
```

Or via environment variable:

```bash
PLAYWRIGHT_MCP_SAVE_VIDEO=800x600 playwright-cli open https://example.com
```

<!-- END OFFICIAL PAGE 14: commands/video-recording.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 15: configuration.mdx -->

## Source page: `configuration.mdx`

---
title: "Configuration"
---

# Configuration

## Headed and headless mode

The CLI runs **headless** by default. To see the browser:

```bash
playwright-cli open https://playwright.dev --headed
```

## Browser selection

```bash
playwright-cli open --browser=chrome     # Google Chrome (default)
playwright-cli open --browser=firefox    # Mozilla Firefox
playwright-cli open --browser=webkit     # WebKit (Safari engine)
playwright-cli open --browser=msedge     # Microsoft Edge
```

## Profile modes

### In-memory (default)

Cookies and storage persist between commands but are lost when the browser closes:

```bash
playwright-cli open https://example.com
```

### Persistent

Profile saved to disk, survives browser restarts:

```bash
playwright-cli open https://example.com --persistent
```

### Custom profile directory

```bash
playwright-cli open https://example.com --profile=./my-profile
```

### Isolated

Explicit in-memory mode — equivalent to the default but can be set in the config file:

```json
{
  "browser": { "isolated": true }
}
```

## Configuration file

For advanced settings, use a JSON config file:

```bash
playwright-cli --config path/to/config.json open example.com
```

The CLI automatically loads `.playwright/cli.config.json` if present.

### Full config schema

```typescript
{
  browser?: {
    browserName?: 'chromium' | 'firefox' | 'webkit';
    isolated?: boolean;
    userDataDir?: string;
    launchOptions?: {
      channel?: string;           // 'chrome', 'msedge'
      headless?: boolean;
      executablePath?: string;
      args?: string[];
      proxy?: {
        server: string;           // e.g., "http://myproxy:3128"
        bypass?: string;          // e.g., ".com,chromium.org"
        username?: string;
        password?: string;
      };
    };
    contextOptions?: {
      viewport?: { width: number; height: number };
      locale?: string;
      userAgent?: string;
      storageState?: string;
      permissions?: string[];     // e.g., ['geolocation', 'clipboard-read']
      serviceWorkers?: 'allow' | 'block';
    };
    cdpEndpoint?: string;
    cdpHeaders?: Record<string, string>;
    cdpTimeout?: number;
    remoteEndpoint?: string;
    initPage?: string[];          // TypeScript files for page setup
    initScript?: string[];        // JavaScript files for page init
  };
  extension?: boolean;
  saveVideo?: { width: number; height: number };
  saveSession?: boolean;
  sharedBrowserContext?: boolean;
  snapshot?: { mode?: 'full' | 'none' };
  imageResponses?: 'allow' | 'omit';
  outputDir?: string;
  outputMode?: 'file' | 'stdout';
  console?: { level?: 'error' | 'warning' | 'info' | 'debug' };
  network?: {
    allowedOrigins?: string[];    // e.g., ["https://api.example.com"]
    blockedOrigins?: string[];    // e.g., ["https://analytics.example.com"]
  };
  secrets?: Record<string, string>;
  testIdAttribute?: string;       // default: "data-testid"
  timeouts?: {
    action?: number;              // default: 5000ms
    navigation?: number;          // default: 60000ms
    expect?: number;              // default: 5000ms
  };
  allowUnrestrictedFileAccess?: boolean;
  codegen?: 'typescript' | 'none';
}
```

### Example configs

**Local development:**
```json
{
  "browser": {
    "launchOptions": { "headless": false }
  }
}
```

**CI environment:**
```json
{
  "browser": {
    "launchOptions": { "headless": true },
    "contextOptions": { "viewport": { "width": 1280, "height": 720 } }
  },
  "outputDir": "./test-output"
}
```

**Behind a proxy:**
```json
{
  "browser": {
    "launchOptions": {
      "proxy": {
        "server": "http://proxy.corp.example.com:8080",
        "bypass": "localhost,*.internal.com"
      }
    }
  }
}
```

**Device emulation:**
```json
{
  "browser": {
    "contextOptions": {
      "viewport": { "width": 375, "height": 812 },
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)..."
    }
  }
}
```

**Init scripts:**
```json
{
  "browser": {
    "initScript": ["./setup.js"],
    "initPage": ["./setup-page.ts"]
  }
}
```

## Print resolved config

See the final config after merging CLI options, environment variables, and config file:

```bash
playwright-cli config-print
```

## Browser extension

Connect to your existing browser tabs instead of launching a new browser:

```bash
playwright-cli attach --extension
```

See [Attach](./commands/attach.mdx) for details.

## Environment variables

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_CLI_SESSION` | Default session name |
| `PLAYWRIGHT_MCP_BROWSER` | Browser to use (chrome, firefox, webkit, msedge) |
| `PLAYWRIGHT_MCP_HEADLESS` | Run headless |
| `PLAYWRIGHT_MCP_CAPS` | Enable capabilities (comma-separated) |
| `PLAYWRIGHT_MCP_CONFIG` | Config file path |
| `PLAYWRIGHT_MCP_ISOLATED` | In-memory profile |
| `PLAYWRIGHT_MCP_EXTENSION` | Connect via browser extension |
| `PLAYWRIGHT_MCP_USER_DATA_DIR` | Profile directory |
| `PLAYWRIGHT_MCP_STORAGE_STATE` | Storage state file |
| `PLAYWRIGHT_MCP_DEVICE` | Device to emulate |
| `PLAYWRIGHT_MCP_EXECUTABLE_PATH` | Custom browser executable |
| `PLAYWRIGHT_MCP_VIEWPORT_SIZE` | Viewport size (e.g., "1280x720") |
| `PLAYWRIGHT_MCP_PROXY_SERVER` | Proxy server URL |
| `PLAYWRIGHT_MCP_PROXY_BYPASS` | Domains to bypass proxy |
| `PLAYWRIGHT_MCP_USER_AGENT` | Custom user agent |
| `PLAYWRIGHT_MCP_IGNORE_HTTPS_ERRORS` | Ignore HTTPS errors |
| `PLAYWRIGHT_MCP_TIMEOUT_ACTION` | Action timeout (ms) |
| `PLAYWRIGHT_MCP_TIMEOUT_NAVIGATION` | Navigation timeout (ms) |
| `PLAYWRIGHT_MCP_CONSOLE_LEVEL` | Console message level |
| `PLAYWRIGHT_MCP_TEST_ID_ATTRIBUTE` | Test ID attribute |
| `PLAYWRIGHT_MCP_CDP_ENDPOINT` | CDP endpoint |
| `PLAYWRIGHT_MCP_OUTPUT_DIR` | Output directory |
| `PLAYWRIGHT_MCP_CODEGEN` | Code generation language |
| `PLAYWRIGHT_MCP_INIT_PAGE` | Page init TypeScript |
| `PLAYWRIGHT_MCP_INIT_SCRIPT` | Page init JavaScript |
| `PLAYWRIGHT_MCP_BLOCKED_ORIGINS` | Block origins |
| `PLAYWRIGHT_MCP_ALLOWED_ORIGINS` | Allow origins |
| `PLAYWRIGHT_MCP_GRANT_PERMISSIONS` | Browser permissions |
| `PLAYWRIGHT_MCP_BLOCK_SERVICE_WORKERS` | Block service workers |
| `PLAYWRIGHT_MCP_NO_SANDBOX` | Disable sandbox |
| `PLAYWRIGHT_MCP_SAVE_SESSION` | Save session data |
| `PLAYWRIGHT_MCP_SAVE_VIDEO` | Auto-record video (e.g., "800x600") |
| `PLAYWRIGHT_MCP_SECRETS_FILE` | Secrets file (dotenv) |

## All open parameters

```bash
playwright-cli open [url]                          # open browser
playwright-cli open --headed                       # show browser window
playwright-cli open --browser=firefox              # specific browser
playwright-cli open --persistent                   # persist profile to disk
playwright-cli open --profile=<path>               # custom profile directory
playwright-cli open --config=file.json             # use config file
playwright-cli attach --extension                  # connect via extension
playwright-cli attach --cdp <url>                  # connect via CDP
playwright-cli attach --endpoint <url>             # connect to Playwright server
```

<!-- END OFFICIAL PAGE 15: configuration.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 16: installation.mdx -->

## Source page: `installation.mdx`

---
title: "Installation"
---

# Installation

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- A coding agent: Claude Code, GitHub Copilot, or similar

## Global installation

```bash
npm install -g @playwright/cli@latest
playwright-cli --help
```

## Local installation (npx)

```bash
npx playwright-cli --help
```

## Installing browsers

The CLI downloads a browser automatically on first use. To install explicitly:

```bash
playwright-cli install-browser               # install default (chromium)
playwright-cli install-browser firefox       # install specific browser
playwright-cli install-browser --with-deps   # install with system dependencies
```

### Install options

| Flag | Description |
|------|-------------|
| `--with-deps` | Install system dependencies (Linux) |
| `--dry-run` | Preview what would be installed |
| `--list` | List available browsers from all installations |
| `--force` | Force reinstall even if already present |
| `--only-shell` | Only install Chromium headless shell |
| `--no-shell` | Skip Chromium headless shell |

## Installing skills

Coding agents like Claude Code and GitHub Copilot can use locally installed skills for richer context about available commands:

```bash
playwright-cli install --skills
```

## Skills-less operation

You can also point your agent at the CLI directly and let it discover commands on its own:

```txt
Test the "add todo" flow on https://demo.playwright.dev/todomvc using playwright-cli.
Check playwright-cli --help for available commands.
```

## Environment setup

Configure your coding agent to use a specific session:

```bash
PLAYWRIGHT_CLI_SESSION=todo-app claude .
```

## Next steps

- [Quick Start](./quick-start.mdx) — try the CLI hands-on
- [Snapshots](./snapshots.mdx) — how element refs work
- [Capabilities](./capabilities.mdx) — network mocking, storage, testing, and more
- [Configuration](./configuration.mdx) — headless mode, browser selection, profiles

<!-- END OFFICIAL PAGE 16: installation.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 17: introduction.mdx -->

## Source page: `introduction.mdx`

---
title: "Introduction"
---

# Playwright CLI

A command-line interface for browser automation designed for coding agents. Token-efficient commands and installable skills let agents balance browser automation with large codebases and reasoning within limited context windows.

## Example

```bash
$ playwright-cli open https://demo.playwright.dev/todomvc --headed
$ playwright-cli type "Buy groceries"
$ playwright-cli press Enter
$ playwright-cli type "Water flowers"
$ playwright-cli press Enter
$ playwright-cli check e21
$ playwright-cli screenshot
```

After each command, the CLI outputs the current page state:

```txt
### Page
- Page URL: https://demo.playwright.dev/todomvc/#/
- Page Title: React - TodoMVC
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

The snapshot file contains the accessibility tree with element refs for the next command.

## Key Features

- **Token-efficient** — concise CLI output avoids loading large tool schemas into the model context
- **Skill-based** — agents discover capabilities through installable skills rather than verbose help text
- **Daemon architecture** — persistent browser process means no startup cost per command
- **Ref-based** — accessibility snapshots with element refs for deterministic interaction
- **Cross-browser** — Chrome, Firefox, WebKit, and Edge support
- **Sessions** — multiple isolated browser instances with separate state

## Playwright CLI vs MCP

| | **Playwright CLI** | **[MCP](/mcp/introduction)** |
|---|---------------|------|
| **Best for** | Coding agents (Claude Code, Copilot) working with large codebases | Specialized agentic loops, exploratory automation |
| **How it works** | Agent runs shell commands | LLM calls MCP tools with structured parameters |
| **Token cost** | Lower — concise CLI output, skills loaded on demand | Higher — tool schemas + snapshots in context |
| **Default mode** | Headless | Headed |
| **Setup** | `npm install -g @playwright/cli` | JSON config in MCP client |

## All Commands

### Core
```bash
open [url]                  goto <url>                  close
click <ref>                 dblclick <ref>              fill <ref> <text>
type <text>                 select <ref> <val>          check <ref>
uncheck <ref>               hover <ref>                 drag <start> <end>
upload <file>               snapshot                    screenshot [ref]
pdf                         eval <func> [ref]           resize <w> <h>
dialog-accept [prompt]      dialog-dismiss
```

### Navigation
```bash
go-back                     go-forward                  reload
```

### Keyboard & Mouse
```bash
press <key>                 keydown <key>               keyup <key>
mousemove <x> <y>           mousedown [btn]             mouseup [btn]
mousewheel <dx> <dy>
```

### Tabs
```bash
tab-list                    tab-new [url]               tab-select <idx>
tab-close [idx]
```

### Storage
```bash
state-save [file]           state-load <file>
cookie-list [--domain]      cookie-get <name>           cookie-set <name> <val>
cookie-delete <name>        cookie-clear
localstorage-list           localstorage-get <key>      localstorage-set <k> <v>
localstorage-delete <key>   localstorage-clear
sessionstorage-list         sessionstorage-get <key>    sessionstorage-set <k> <v>
sessionstorage-delete <k>   sessionstorage-clear
```

### Network
```bash
network                     route <pattern> [opts]      route-list
unroute [pattern]
```

### DevTools
```bash
console [min-level]         run-code <code>             tracing-start
tracing-stop                video-start [file]          video-chapter <title>
video-stop                  show
```

### Sessions
```bash
-s=<name> <cmd>             list                        close-all
kill-all                    delete-data
```

### Config
```bash
open --headed               open --browser=firefox      open --persistent
open --profile=<path>       open --config=file.json     attach --extension
install --skills            config-print
```

<!-- END OFFICIAL PAGE 17: introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 18: quick-start.mdx -->

## Source page: `quick-start.mdx`

---
title: "Quick Start"
---

# Quick Start

## Interactive demo

Try asking your coding agent:

```txt
Use playwright skills to test https://demo.playwright.dev/todomvc/.
Take screenshots for all successful and failing scenarios.
```

## Manual walkthrough

Run commands manually to see how the CLI works:

```bash
playwright-cli open https://demo.playwright.dev/todomvc/ --headed
playwright-cli type "Buy groceries"
playwright-cli press Enter
playwright-cli type "Water flowers"
playwright-cli press Enter
playwright-cli check e21
playwright-cli screenshot
```

## Understanding the output

After each command, the CLI outputs a snapshot of the current page state:

```txt
### Page
- Page URL: https://demo.playwright.dev/todomvc/#/
- Page Title: React - TodoMVC
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

The snapshot file contains the accessibility tree with element refs that can be used for subsequent commands.

## Core workflow

Every interaction follows this pattern:

1. **Open** — `playwright-cli open <url>` opens a URL
2. **Snapshot** — each command returns the accessibility tree with element refs
3. **Interact** — use refs to click, type, or fill
4. **Re-snapshot** — each action returns updated state with new refs

## What's next

- See all [Commands](./commands/navigation.mdx)
- Learn about [Snapshots](./snapshots.mdx) in detail
- Set up [Sessions](./sessions.mdx) for isolated browser instances

<!-- END OFFICIAL PAGE 18: quick-start.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 19: sessions.mdx -->

## Source page: `sessions.mdx`

---
title: "Sessions & Dashboard"
---

# Sessions & Dashboard

The CLI keeps the browser profile in memory by default — cookies and storage state are preserved between CLI calls within a session but lost when the browser closes.

## Named sessions

Run multiple isolated browser instances:

```bash
playwright-cli open https://playwright.dev
playwright-cli -s=example open https://example.com --persistent
playwright-cli list
# Active sessions:
# -> default (https://playwright.dev)
#    example (https://example.com) [persistent]
```

Each session has its own browser instance, cookies, localStorage, navigation history, and console log.

## Environment variable

```bash
PLAYWRIGHT_CLI_SESSION=todo-app claude .
```

All `playwright-cli` commands in that agent session use the `todo-app` browser instance.

## Profile persistence

### In-memory (default)

Cookies and storage persist between commands within a session but are lost when the browser closes:

```bash
playwright-cli open https://example.com
```

### Persistent to disk

Profile is saved to disk and survives browser restarts. This is equivalent to the default persistent mode in [Playwright MCP](/mcp/configuration/user-profile).

```bash
playwright-cli open https://example.com --persistent
```

Default persistent profile locations:

| Platform | Default location |
|----------|-----------------|
| macOS | `~/Library/Caches/ms-playwright/mcp-{channel}-profile` |
| Linux | `~/.cache/ms-playwright/mcp-{channel}-profile` |
| Windows | `%LOCALAPPDATA%\ms-playwright\mcp-{channel}-profile` |

### Custom directory

```bash
playwright-cli open https://example.com --profile=./my-profile
```

## Session management

```bash
playwright-cli list                     # list all sessions
playwright-cli -s=name close            # close a specific session
playwright-cli close-all                # close all browsers
playwright-cli kill-all                 # force kill (for unresponsive browsers)
playwright-cli -s=name delete-data      # delete stored profile data
```

## Dashboard

Open a visual dashboard to observe and control all running sessions:

```bash
playwright-cli show
```

The dashboard provides:

| View | Description |
|------|-------------|
| **Session grid** | All active sessions with live screencast, name, URL, and title. Click to zoom in. |
| **Session detail** | Live viewport with tab bar, navigation controls, and full remote mouse/keyboard input. Press Escape to release. |

Use cases:
- Watch coding agents automate browsers in the background
- Take over when an agent gets stuck on a CAPTCHA or 2FA
- Close stale sessions or delete data from the UI

## Saving and restoring state

Save authenticated state for reuse across sessions:

```bash
# Login, then save state
playwright-cli state-save auth-state.json

# Later: restore state in a new session
playwright-cli state-load auth-state.json
```

## Workflow: isolated testing

```bash
# Admin session
playwright-cli -s=admin open https://app.example.com --persistent
playwright-cli -s=admin state-load admin-auth.json
playwright-cli -s=admin goto /admin/settings

# User session
playwright-cli -s=user open https://app.example.com --persistent
playwright-cli -s=user state-load user-auth.json
playwright-cli -s=user goto /dashboard

# Monitor both
playwright-cli show
```

<!-- END OFFICIAL PAGE 19: sessions.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 20: skills.mdx -->

## Source page: `skills.mdx`

---
title: "Skills"
---

# Skills

Skills teach coding agents how to use `playwright-cli` effectively, providing structured reference documentation that agents can discover and use.

## Installing skills

```bash
playwright-cli install --skills
```

This installs skill files locally so your coding agent can reference them for context about available commands and workflows.

## What skills provide

The installed skill includes detailed reference guides for common tasks:

- **Running and Debugging Playwright tests** — run, debug and manage Playwright test suites
- **Request mocking** — intercept and mock network requests
- **Running Playwright code** — execute arbitrary Playwright scripts
- **Browser session management** — manage multiple browser sessions
- **Storage state (cookies, localStorage)** — persist and restore browser state
- **Test generation** — generate Playwright tests from interactions
- **Tracing** — record and inspect execution traces
- **Video recording** — capture browser session videos
- **Inspecting element attributes** — get element attributes not visible in snapshots

## Skills-less operation

You can use `playwright-cli` without installing skills. Point your agent at the CLI and let it discover commands:

```txt
Test the "add todo" flow on https://demo.playwright.dev/todomvc using playwright-cli.
Check playwright-cli --help for available commands.
```

## Supported agents

Skills work with:
- Claude Code
- GitHub Copilot
- Cursor
- Any coding agent that supports locally installed skills

<!-- END OFFICIAL PAGE 20: skills.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 21: snapshots.mdx -->

## Source page: `snapshots.mdx`

---
title: "Snapshots"
---

# Snapshots

After each command, `playwright-cli` outputs a snapshot of the current browser state — an accessibility tree with element refs for interaction.

## Automatic snapshots

Every command returns page info and a link to the snapshot file:

```txt
### Page
- Page URL: https://demo.playwright.dev/todomvc/#/
- Page Title: React - TodoMVC
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

The snapshot file contains the accessibility tree:

```yaml
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

## Element refs

Each interactive element gets a unique ref (e.g., `e5`, `e10`). Refs are **stable within a single snapshot** but invalidated when the page changes — always re-snapshot after navigation.

| Property | Detail |
|----------|--------|
| Format | `e` followed by a number (e.g., `e1`, `e15`, `e203`) |
| Scope | Unique within a single snapshot |
| Lifetime | Valid until the next page change |
| Assignment | Only interactive elements get refs (buttons, links, inputs, etc.) |

## On-demand snapshots

```bash
playwright-cli snapshot                    # full page, timestamped filename
playwright-cli snapshot --filename=after.yaml  # custom filename
playwright-cli snapshot "#main"            # scope to CSS selector
playwright-cli snapshot e34                # scope to element ref
playwright-cli snapshot --depth=4          # limit tree depth
```

## Using refs

```bash
playwright-cli click e10                   # check the checkbox
playwright-cli fill e5 "Walk the dog"      # type into textbox
playwright-cli hover e20                   # hover over "All" link
```

## Using selectors

CSS selectors and Playwright locators work as alternatives to refs:

```bash
# CSS selectors
playwright-cli click "#main > button.submit"
playwright-cli click "[data-testid='submit']"

# Playwright locators
playwright-cli click "getByRole('button', { name: 'Submit' })"
playwright-cli click "getByTestId('submit-button')"
playwright-cli click "getByText('Login')"
```

## Raw output

Use `--raw` to strip page info and return only command output:

```bash
playwright-cli snapshot --raw | grep "button"
```

## Best practices

1. **Use refs, not selectors** — refs from snapshots are more reliable than CSS selectors because they point to the exact element the agent just saw
2. **Re-snapshot after navigation** — refs are invalidated when the page changes
3. **Limit depth** — use `--depth` on complex pages to reduce output size
4. **Scope to elements** — snapshot a specific section instead of the whole page
5. **Name snapshot files** — use `--filename` when the snapshot is part of a workflow result
6. **Check for dialogs** — if a command reports a dialog is open, handle it before proceeding with other actions

<!-- END OFFICIAL PAGE 21: snapshots.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 22: vision-mode.mdx -->

## Source page: `vision-mode.mdx`

---
title: "Vision Mode"
---

# Vision Mode

By default, you interact with page elements using refs from accessibility snapshots. For elements not exposed in the accessibility tree — canvas apps, maps, custom widgets — use coordinate-based mouse commands with screenshots as your visual reference.

## Commands

| Command | Description |
|---------|-------------|
| `mousemove <x> <y>` | Move mouse to pixel coordinates |
| `mousedown [button]` | Press mouse button (left, right, middle) |
| `mouseup [button]` | Release mouse button |
| `mousewheel <dx> <dy>` | Scroll (dx=horizontal, dy=vertical) |
| `screenshot` | Capture viewport for coordinate reference |

## Workflow: interacting with a canvas app

```bash
# Take a screenshot to see the canvas
playwright-cli screenshot --filename=canvas.png

# Agent identifies coordinates from the screenshot
# Click at position (150, 300)
playwright-cli mousemove 150 300
playwright-cli mousedown
playwright-cli mouseup

# Drag from (100, 200) to (400, 200)
playwright-cli mousemove 100 200
playwright-cli mousedown
playwright-cli mousemove 400 200
playwright-cli mouseup

# Verify the result
playwright-cli screenshot --filename=after-drag.png
```

## Workflow: clicking an icon without accessible name

```bash
# Snapshot doesn't show the gear icon
playwright-cli snapshot
# (no gear icon in output)

# Take a screenshot — agent sees gear icon at approximately (850, 45)
playwright-cli screenshot

# Click it
playwright-cli mousemove 850 45
playwright-cli mousedown
playwright-cli mouseup

# Settings panel opens with proper accessibility
playwright-cli snapshot
# - heading "Settings" [level=2]
# - textbox "Display name" [ref=e12]

# Now use refs for the rest
playwright-cli fill e12 "New Name"
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

<!-- END OFFICIAL PAGE 22: vision-mode.mdx -->

---

