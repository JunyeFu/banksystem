# Midscene Official Documentation — English

<!--
Source repository: web-infra-dev/midscene
Commit: d4b1a3092b358c3178760466960ab21fcce6e504
Generated: 2026-07-10
License: MIT
Format: All official Markdown/MDX pages concatenated in deterministic path order.
The original page content is retained; MDX/JSX directives may remain for fidelity.
-->

## Document index

1. `advanced/bdd-style-scripts-with-gherkin.mdx`
2. `android-api-reference.mdx`
3. `android-getting-started.mdx`
4. `android-introduction.mdx`
5. `android-world-benchmark-report.mdx`
6. `api.mdx`
7. `automate-with-scripts-in-yaml.mdx`
8. `awesome-midscene.md`
9. `blog-introducing-instant-actions-and-deep-think.md`
10. `bridge-mode.mdx`
11. `caching.mdx`
12. `changelog.mdx`
13. `common/get-cdp-url.mdx`
14. `common/prepare-android.mdx`
15. `common/prepare-ios.mdx`
16. `common/quick-model-config.mdx`
17. `common/setup-env.mdx`
18. `common/start-experience.mdx`
19. `common/troubleshooting-llm-connectivity.mdx`
20. `computer-api-reference.mdx`
21. `computer-getting-started.mdx`
22. `computer-introduction.mdx`
23. `consume-report-file.md`
24. `data-privacy.md`
25. `faq.md`
26. `harmony-api-reference.mdx`
27. `harmony-getting-started.mdx`
28. `harmony-introduction.mdx`
29. `index.mdx`
30. `integrate-with-any-interface.mdx`
31. `integrate-with-playwright.mdx`
32. `integrate-with-puppeteer.mdx`
33. `introduction.mdx`
34. `ios-api-reference.mdx`
35. `ios-getting-started.mdx`
36. `ios-introduction.mdx`
37. `llm-txt.mdx`
38. `mcp.mdx`
39. `model-common-config.mdx`
40. `model-config.mdx`
41. `model-strategy.mdx`
42. `quick-experience.mdx`
43. `quick-start.mdx`
44. `showcases-android.mdx`
45. `showcases-computer.mdx`
46. `showcases-harmony.mdx`
47. `showcases-ios.mdx`
48. `showcases-web.mdx`
49. `showcases.mdx`
50. `skills.mdx`
51. `use-javascript-to-optimize-ai-automation-code.md`
52. `web-api-reference.mdx`
53. `yaml-script-runner.mdx`

---

<!-- BEGIN OFFICIAL PAGE 1: advanced/bdd-style-scripts-with-gherkin.mdx -->

## Source page: `advanced/bdd-style-scripts-with-gherkin.mdx`

# BDD-style scripts with Gherkin

> This feature is available starting in Midscene 1.10.
>
> BDD-related capabilities are still in Beta. The API may change in future releases.

Gherkin is a plain-text syntax for describing behavior examples. It is commonly used in BDD (Behavior-Driven Development) workflows. A BDD scenario usually contains three kinds of steps: `Given` describes the precondition, `When` describes the user action, and `Then` describes the expected result.

For example, when you need to test adding a todo item, you can write the case as the following Gherkin script.

```gherkin
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
```

Longer GUI cases can also be written in one `Scenario`. You can organize the steps by business phase, and each phase can use a group of `Given`, `When`, and `Then`.

```gherkin
Scenario: Place an order with a saved address
  Given the shopping cart contains "Midscene Mug"
  When I open the cart page
  Then the cart should show "Midscene Mug"
  And the subtotal should be visible

  Given the checkout page is open
  When I choose the saved shipping address
  Then the shipping address section should show the selected address

  Given the payment section is visible
  When I choose the saved credit card and submit the order
  Then the order confirmation page should be displayed
  And the confirmation page should show an order number
```

This style is useful when one business scenario naturally contains several UI phases, such as cart review, shipping selection, payment, and final confirmation.

In AI-driven GUI automation, Gherkin is a natural fit for describing operation cases. It keeps the readability of natural language while providing a stable step structure. This structure also helps models generate more consistent cases.

See the official [Cucumber Gherkin reference](https://cucumber.io/docs/gherkin/reference) for the full Gherkin syntax.

## Supported rules

Midscene supports only a subset of Gherkin. This subset is designed around a single `Scenario`, and is suitable for describing a complete GUI operation flow.

### Step mapping

- `Given`: calls `aiAct`, and prepares the precondition.
- `When`: calls `aiAct`, and performs the user action.
- `Then`: calls `aiAssert`, and verifies the page result.
- `And`, `But`: reuse the previous primary keyword. For example, an `And` after `Then` also calls `aiAssert`.

Keyword matching is case-insensitive. Therefore, `AND`, `and`, and `And` are all recognized.

### Scenario limits

Only one `Scenario:` is supported each time. If the input contains multiple `Scenario:` blocks, Midscene throws an error.

You can also omit `Scenario:` and write the steps directly.

```gherkin
Given the todo page is open
When I add a todo item named "Buy milk"
Then the todo list should contain "Buy milk"
```

### Notes

Midscene splits each Gherkin step into an independent `aiAct` or `aiAssert` call. Each step should be complete, and should clearly describe the target, the action, and the expected result.

Do not depend on omitted information or vague references from previous steps. For example, do not write only "click it" or "check the result". Instead, write the target to click and the result to check.

The following example cannot run correctly. The steps are isolated from each other, so later steps do not know what "it" and "the result" refer to.

```gherkin
Given the todo page is open
When I add a todo item named "Buy milk"
And click it
Then check the result
```

Write it this way instead.

```gherkin
Given the todo page is open
When I add a todo item named "Buy milk"
And I click the "Buy milk" todo item
Then the "Buy milk" todo item should be marked as completed
```

### Not supported

The following Gherkin features are not supported:

- `Feature`
- `Background`
- `Scenario Outline` or `Scenario Template`
- `Examples`
- `Rule`
- data tables
- doc strings
- variable replacement, placeholder expansion, or template syntax
- multiple `Scenario:` blocks in the same input

Midscene does not extend Gherkin into a scripting language. It only reads `Scenario` and step keywords, then passes each step to the Agent.

Loops, conditions, variable replacement, and batch generation should happen before calling Midscene. If you need reusable templates, implement a Gherkin generator in your project. The generator should output the final plain-text `Scenario`, then pass it to `runGherkinScenario`.

## Use in JavaScript

In JavaScript or TypeScript scripts, call `agent.runGherkinScenario()` directly. It receives a Gherkin text string and executes the steps in order.

The following example uses the Playwright fixture to get an Agent.

```ts
import { test } from '@midscene/web/playwright';

test('add a todo item', async ({ page, agentForPage }) => {
  await page.goto('http://localhost:3000/todos');

  const agent = await agentForPage(page);
  await agent.runGherkinScenario(`
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
  And the todo count should be 1
`);
});
```

The second argument accepts runtime options. For example, you can provide temporary context for this run.

```ts
await agent.runGherkinScenario(
  `
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
`,
  {
    context:
      'This is a todo demo app. Use the input box and the add button on the page.',
  },
);
```

## Use in YAML

Use the `runGherkinScenario` step in a YAML flow. The value should be a block string containing one scenario.

```yaml
web:
  url: http://localhost:3000/todos

tasks:
  - name: Add a todo item
    flow:
      - runGherkinScenario: |
          Scenario: Add a todo item
            Given the todo page is open
            When I add a todo item named "Buy milk"
            Then the todo list should contain "Buy milk"
            And the todo count should be 1
```

During YAML execution, Midscene runs the scenario step by step. `Given` and `When` steps call `aiAct`, while `Then` and the following `And` step call `aiAssert`.

## Remarks

`runGherkinScenario` disables cache inside the scenario. This means that after `Given` and `When` are mapped to `aiAct`, they do not use the `aiAct` planning cache.

This makes each Gherkin step interpreted from the current page state, and avoids incorrect behavior caused by reusing stale steps.

<!-- END OFFICIAL PAGE 1: advanced/bdd-style-scripts-with-gherkin.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 2: android-api-reference.mdx -->

## Source page: `android-api-reference.mdx`

# API reference (Android)

Use this doc when you need to customize Midscene's Android automation or review Android-only constructor options. For shared parameters (reporting, hooks, caching, etc.), see the platform-agnostic [API reference (Common)](./api).

## Action Space

`AndroidDevice` uses the following action space; the Midscene Agent can use these actions while planning tasks:

- `Tap` &mdash; Tap an element.
- `DoubleClick` &mdash; Double-tap an element.
- `Input` &mdash; Enter text with `replace`/`typeOnly`/`clear` modes (`append` is a deprecated alias for `typeOnly`). Supports optional `autoDismissKeyboard` and `keyboardTypeDelay` parameters.
- `Scroll` &mdash; Scroll from an element or screen center in any direction, with helpers to reach the top, bottom, left, or right.
- `DragAndDrop` &mdash; Drag from one element to another.
- `KeyboardPress` &mdash; Press a specified key.
- `LongPress` &mdash; Long-press a target element with optional duration.
- `PullGesture` &mdash; Pull up or down (e.g., to refresh) with optional distance and duration.
- `Pinch` &mdash; Two-finger pinch gesture. Use `scale > 1` to zoom in, `scale < 1` to zoom out.
- `ClearInput` &mdash; Clear the contents of an input field.
- `Launch` &mdash; Open a web URL or `package/.Activity` string.
- `Terminate` &mdash; Force-stop an app by package name.
- `RunAdbShell` &mdash; Execute raw `adb shell` commands.
- `AndroidBackButton` &mdash; Trigger the system back action.
- `AndroidHomeButton` &mdash; Return to the home screen.
- `AndroidRecentAppsButton` &mdash; Open the multitasking/recent apps view.

## AndroidDevice {#androiddevice}

Create a connection to an adb-managed device that an AndroidAgent can drive.

### Import

```ts
import { AndroidDevice, getConnectedDevices } from '@midscene/android';
```

### Constructor

```ts
const device = new AndroidDevice(deviceId, {
  // device options...
});
```

### Device options

- `deviceId: string` &mdash; Value returned by `adb devices` or `getConnectedDevices()`.
- `autoDismissKeyboard?: boolean` &mdash; Automatically hide the keyboard after input. Default `true`.
- `keyboardDismissStrategy?: 'esc-first' | 'back-first'` &mdash; Order for dismissing keyboards. Default `'esc-first'`.
- `keyboardTypeDelay?: number` &mdash; Delay in milliseconds between keystrokes when typing text. When set, text is typed one character at a time with this delay between each character, instead of sending the whole string at once. Useful on devices or input fields that drop characters when input arrives too fast. Only applies to the `input text` path; ignored when yadb is used.
- `androidAdbPath?: string` &mdash; Custom path to the adb executable.
- `remoteAdbHost?: string` / `remoteAdbPort?: number` &mdash; Point to a remote adb server.
- `imeStrategy?: 'always-yadb' | 'yadb-for-non-ascii'` &mdash; Choose when to invoke [yadb](https://github.com/ysbing/YADB) for text input. Default `'yadb-for-non-ascii'`.
  - `'yadb-for-non-ascii'` (default) &mdash; Uses yadb for Unicode characters (including Latin Unicode like ö, é, ñ), Chinese, Japanese, and format specifiers (like %s, %d). Pure ASCII text uses the faster native `adb input text`.
  - `'always-yadb'` &mdash; Always uses yadb for all text input, providing maximum compatibility but slightly slower for pure ASCII text.
- `displayId?: number` &mdash; Target a specific virtual display if the device mirrors multiple displays.
- `screenshotResizeScale?: number` &mdash; **Deprecated.** This option has been removed and no longer has any effect. Use `screenshotShrinkFactor` in `AgentOpt` instead to control screenshot size sent to the AI model.
- `minScreenshotBufferSize?: number` &mdash; Screenshot buffer size validation threshold in bytes. Buffers below this value are treated as failed or corrupted captures. Default `1024` (1KB). Set to `0` to skip only this size check; Midscene still rejects empty buffers and invalid image formats.
- `alwaysRefreshScreenInfo?: boolean` &mdash; Re-query rotation and screen size every step. Default `false`.
- `scrcpyConfig?: object` &mdash; Scrcpy high-performance screenshot configuration, disabled by default. See [Scrcpy Screenshot Mode](#scrcpy) below.

### Scrcpy Screenshot Mode {#scrcpy}

By default, Midscene captures screenshots via `adb shell screencap`, which takes ~500–2000ms per call. Enabling Scrcpy mode streams H.264 video from the device and captures frames in real time, reducing screenshot latency to approximately **100–200ms**.

**How to enable:**

```ts
const device = new AndroidDevice(deviceId, {
  scrcpyConfig: {
    enabled: true,
  },
});
```

**Optional parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable Scrcpy screenshots |
| `maxSize` | `number` | `0` | Max video dimension (width or height). `0` = no scaling |
| `videoBitRate` | `number` | `2000000` | H.264 encoding bitrate (bps) |
| `idleTimeoutMs` | `number` | `30000` | Auto-disconnect after idle (ms). Set to `0` to disable |

:::tip
Scrcpy mode automatically falls back to ADB screenshots if the connection fails. No extra error handling is needed.
:::

### Usage notes

- Discover devices with `getConnectedDevices()`; the `udid` matches `adb devices`.
- Supports remote adb via `remoteAdbHost/remoteAdbPort`; set `androidAdbPath` if adb is not on PATH.
- Use `screenshotShrinkFactor` in `AgentOpt` to cut latency on high-DPI devices.

### Examples

#### Quick start

```ts
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';

const [first] = await getConnectedDevices();
const device = new AndroidDevice(first.udid);
await device.connect();

const agent = new AndroidAgent(device, {
  aiActionContext: 'If a permissions dialog appears, accept it.',
});

await agent.launch('https://www.ebay.com');
await agent.aiAct('search "Headphones" and wait for results');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], find item in list and corresponding price',
);
console.log(items);
```

#### Launch native packages

```ts
await agent.launch('com.android.settings/.Settings');
await agent.back();
await agent.home();
```

## AndroidAgent {#androidagent}

Wire Midscene's AI planner to an AndroidDevice for UI automation.

### Import

```ts
import { AndroidAgent } from '@midscene/android';
```

### Constructor

```ts
const agent = new AndroidAgent(device, {
  // common agent options...
});
```

### Android-specific options

- `customActions?: DeviceAction[]` &mdash; Extend planning with actions defined via `defineAction`.
- `appNameMapping?: Record<string, string>` &mdash; Map friendly app names to package names. When you pass an app name to `launch(target)`, the agent will look up the package name in this mapping. If no mapping is found, it will attempt to launch `target` as-is. User-provided mappings take precedence over default mappings.
- All other fields match [API constructors](./api#common-parameters): `generateReport`, `reportFileName`, `aiActionContext`, `modelConfig`, `cacheId`, `createOpenAIClient`, `onTaskStartTip`, and more.

### Usage notes

:::info

- Use one agent per device connection.
- Android-only helpers such as `launch`, `terminate`, and `runAdbShell` are also exposed in YAML scripts. See [Android platform-specific actions](./automate-with-scripts-in-yaml#the-android-part).
- For shared interaction methods, see [API reference (Common)](./api#interaction-methods).

:::

### Android-specific methods

#### `agent.launch()`

Launch a web URL or native Android activity/package.

```ts
function launch(target: string): Promise<void>;
```

- `target: string` &mdash; Can be a web URL, a string in `package/.Activity` format (e.g., `com.android.settings/.Settings`), an app package name, or an app name. If you pass an app name and it exists in `appNameMapping`, it will be automatically resolved to the mapped package name; otherwise, `target` will be launched as-is.

#### `agent.runAdbShell()`

Run a raw `adb shell` command through the connected device. Pass only the shell command itself, without the `adb shell` prefix.

```ts
function runAdbShell(command: string, opt?: { timeout?: number }): Promise<string>;
```

- `command: string` &mdash; Command passed verbatim to `adb shell`. For example, use `input tap 100 200`, not `adb shell input tap 100 200`.
- `opt.timeout?: number` &mdash; Optional command execution timeout in milliseconds.

```ts
const result = await agent.runAdbShell('dumpsys battery', { timeout: 60 * 1000 });
console.log(result);

await agent.runAdbShell('input tap 100 200');
```

#### `agent.terminate()`

Terminate (force-stop) a running Android app.

```ts
function terminate(uri: string): Promise<void>;
```

- `uri: string` &mdash; Package name, app name in `appNameMapping`, or `package/.Activity` (only the package part is used).

```ts
await agent.terminate('com.android.settings');
```

#### Navigation helpers

- `agent.back(): Promise<void>` &mdash; Trigger the Android system Back action.
- `agent.home(): Promise<void>` &mdash; Return to the launcher.
- `agent.recentApps(): Promise<void>` &mdash; Open the Recents/Overview screen.

### Helper utilities

#### `agentFromAdbDevice()`

Create an `AndroidAgent` from any connected adb device.

```ts
function agentFromAdbDevice(
  deviceId?: string,
  opts?: PageAgentOpt & AndroidDeviceOpt,
): Promise<AndroidAgent>;
```

- `deviceId?: string` &mdash; Connect to a specific device; omitted means “first available”.
- `opts?: PageAgentOpt & AndroidDeviceOpt` &mdash; Combine agent options with [AndroidDevice](#androiddevice) settings.

#### `getConnectedDevices()`

Enumerate adb devices Midscene can drive.

```ts
function getConnectedDevices(): Promise<Array<{
  udid: string;
  state: string;
  port?: number;
}>>;
```

### See also

- [Android getting started](./android-getting-started) for setup and scripting steps.

<!-- END OFFICIAL PAGE 2: android-api-reference.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 3: android-getting-started.mdx -->

## Source page: `android-getting-started.mdx`

import StartExperience from './common/start-experience.mdx';
import SetupEnv from './common/setup-env.mdx';

import { PackageManagerTabs } from '@theme';

# Android Getting Started

This guide walks you through everything required to automate an Android device with Midscene: connect a real phone over adb, configure model credentials, try the no-code Playground, and run your first JavaScript script.

:::info Demo Projects

Control Android devices with JavaScript: [https://github.com/web-infra-dev/midscene-example/blob/main/android/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/android/javascript-sdk-demo)

Integrate Vitest for testing: [https://github.com/web-infra-dev/midscene-example/tree/main/android/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/android/vitest-demo)

:::

<SetupEnv />

## Prepare your Android device

Before scripting, confirm adb can talk to your device and the device trusts your machine.

### Install adb and set `ANDROID_HOME`

- Install via [Android Studio](https://developer.android.com/studio) or the [command-line tools](https://developer.android.com/studio#command-line-tools-only)
- Verify installation:

```bash
adb --version
```

Example output indicates success:

```log
Android Debug Bridge version 1.0.41
Version 34.0.4-10411341
Installed as /usr/local/bin//adb
Running on Darwin 24.3.0 (arm64)
```

- Set `ANDROID_HOME` as documented in [Android environment variables](https://developer.android.com/tools/variables), then confirm:

```bash
echo $ANDROID_HOME
```

Any non-empty output means it is configured:

```log
/Users/your_username/Library/Android/sdk
```

### Enable USB debugging and verify the device

In the system settings developer options, enable **USB debugging** (and **USB debugging (Security settings)** if present), then connect the device via USB.

<p align="center">
  <img src="/android-usb-debug-en.png" alt="android usb debug" width="400"/>
</p>

Verify the connection:

```bash
adb devices -l
```

Example success output:

```log
List of devices attached
s4ey59	device usb:34603008X product:cezanne model:M2006J device:cezan transport_id:3
```

## Try Playground (no code)

Playground is the fastest way to validate the connection and observe AI-driven steps without writing code. It shares the same core as `@midscene/android`, so anything that works here will behave the same once scripted.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/booking2.mp4" controls/>

1. Launch the Playground CLI:

```bash
npx --yes @midscene/android-playground
```

2. Click the gear icon in the Playground window, then paste your API key configuration. Refer back to [Model configuration](./model-config) if you still need credentials.

![](/android-set-env.png)

## Start experiencing

<StartExperience />

## Integration with Midscene Agent

Once Playground works, move to a repeatable script with the JavaScript SDK.

### Step 1. Install dependencies

<PackageManagerTabs command="install @midscene/android dotenv --save-dev" />

### Step 2. Write scripts

Save the following code as `./demo.ts`. It opens the browser on the device, searches eBay, and asserts the result list.

```typescript title="./demo.ts"
import 'dotenv/config'; // load Midscene environment variables from .env if present
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    const devices = await getConnectedDevices();
    const device = new AndroidDevice(devices[0].udid);

    const agent = new AndroidAgent(device, {
      aiActionContext:
        'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
    });
    await device.connect();

    await agent.aiAct('open browser and navigate to ebay.com');
    await sleep(5000);
    await agent.aiAct('type "Headphones" in search box, hit Enter');
    await agent.aiWaitFor('There is at least one headphone product');

    const items = await agent.aiQuery(
      '{itemTitle: string, price: Number}[], find item in list and corresponding price',
    );
    console.log('headphones in stock', items);

    await agent.aiAssert('There is a category filter on the left');
  })(),
);
```

### Step 3. Run

```bash
npx tsx demo.ts
```

### Step 4: View the report

Successful runs print `Midscene - report file updated: /path/to/report/some_id.html`. Open the generated HTML file in a browser to replay every interaction, query, and assertion.

## Advanced

Use this section when you need to customize device behavior, wire Midscene into your framework, or troubleshoot adb issues. For detailed constructor parameters, jump to the [API reference(Android)](./android-api-reference).

### Extend Midscene on Android

Use `defineAction()` for custom gestures and pass them through `customActions`. Midscene will append them to the planner so AI can call your domain-specific action names.

```typescript
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z.number().int().positive().describe('How many times to click'),
  }),
  async call(param) {
    const { locate, count } = param;
    console.log('click target center', locate.center);
    console.log('click count', count);
  },
});

const devices = await getConnectedDevices();
const device = new AndroidDevice(devices[0].udid);
await device.connect();

const agent = new AndroidAgent(device, {
  customActions: [ContinuousClick],
});

await agent.aiAct('click the red button five times');
```

See [Integrate with any interface](./integrate-with-any-interface#define-a-custom-action) for a deeper explanation of custom actions and action schemas.

## More

- For every Agent method, check the [API reference (Common)](./api#interaction-methods).
- For the Android API reference, see [Android Agent API](./android-api-reference).
- Demo projects
  - Android JavaScript SDK demo: [https://github.com/web-infra-dev/midscene-example/blob/main/android/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/android/javascript-sdk-demo)
  - Android + Vitest demo: [https://github.com/web-infra-dev/midscene-example/tree/main/android/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/android/vitest-demo)

### Complete example (Vitest + AndroidAgent)

```typescript
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';
import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';
import { sleep } from '@midscene/core/utils';
import type ADB from 'appium-adb';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';

describe('Android Settings Test', () => {
  let page: AndroidDevice;
  let adb: ADB;
  let agent: AndroidAgent;
  let startTime: number;
  let itTestStatus: TestStatus = 'passed';
  const reportMergingTool = new ReportMergingTool();

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    page = new AndroidDevice(devices[0].udid);
    adb = await page.getAdb();
  });

  beforeEach((ctx) => {
    startTime = performance.now();
    agent = new AndroidAgent(page, {
      groupName: ctx.task.name,
    });
  });

  afterEach((ctx) => {
    if (ctx.task.result?.state === 'pass') {
      itTestStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      itTestStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0].message.includes('timed out')) {
      itTestStatus = 'timedOut';
    } else {
      itTestStatus = 'failed';
    }
    reportMergingTool.append({
      reportFilePath: agent.reportFile as string,
      reportAttributes: {
        testId: `${ctx.task.name}`,
        testTitle: `${ctx.task.name}`,
        testDescription: 'description',
        testDuration: (Date.now() - ctx.task.result?.startTime!) | 0,
        testStatus: itTestStatus,
      },
    });
  });

  afterAll(() => {
    reportMergingTool.mergeReports('my-android-setting-test-report');
  });

  it('toggle wlan', async () => {
    await adb.shell('input keyevent KEYCODE_HOME');
    await sleep(1000);
    await adb.shell('am start -n com.android.settings/.Settings');
    await sleep(1000);
    await agent.aiAct('find and enter WLAN setting');
    await agent.aiAct(
      'toggle WLAN status *once*, if WLAN is off pls turn it on, otherwise turn it off.',
    );
  });

  it('toggle bluetooth', async () => {
    await adb.shell('input keyevent KEYCODE_HOME');
    await sleep(1000);
    await adb.shell('am start -n com.android.settings/.Settings');
    await sleep(1000);
    await agent.aiAct('find and enter bluetooth setting');
    await agent.aiAct(
      'toggle bluetooth status *once*, if bluetooth is off pls turn it on, otherwise turn it off.',
    );
  });
});
```

:::tip

Merged reports are stored inside `midscene_run/report` by default. Override the directory with `MIDSCENE_RUN_DIR` when running in CI.

:::

## FAQ

### Why can't I control the device even though I've connected it?

A common error is:

```
Error:
Exception occurred while executing 'tap':
java.lang.SecurityException: Injecting input events requires the caller (or the source of the instrumentation, if any) to have the INJECT_EVENTS permission.
```

Make sure USB debugging is enabled and the device is unlocked in developer options.

<p align="center">
  <img src="/android-usb-debug-en.png" alt="android usb debug" width="400" />
</p>

### Text input is cleared or lost after typing

After entering text, Midscene automatically dismisses the keyboard. The default behavior sends an **ESC key event**. However, some input fields (especially those inside WebView) listen for the ESC key event, which can cause side effects such as:

- Clearing the text just entered
- Closing the popup/modal containing the input field
- Navigating away from the current page

You can try the following solutions in order of priority:

**Option 1: Use the BACK key (Android back button) to dismiss the keyboard**

Set `keyboardDismissStrategy` to `'back-first'` to use the Android BACK key instead of ESC to dismiss the keyboard:

```typescript
const device = new AndroidDevice('device-id', {
  keyboardDismissStrategy: 'back-first',
});
```

**Option 2: Disable auto keyboard dismiss**

If your input field also listens for the BACK key, you can disable auto keyboard dismiss entirely and let the AI Agent or subsequent actions manage the keyboard state:

```typescript
const device = new AndroidDevice('device-id', {
  autoDismissKeyboard: false,
});
```

With auto dismiss disabled, the keyboard will remain visible and may cover a large portion of the screen. You can work around this by:

- Using `aiAct` to manually dismiss the keyboard, e.g. `await agent.aiAct('tap the collapse button on the keyboard')`
- Installing and switching to [ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard) — a minimal virtual keyboard that takes up very little screen space, so it barely affects screen interactions even when visible

### English text is rewritten by the Android keyboard

If the report shows the correct input parameter, but the app receives different text, missing text, or Chinese/pinyin candidates, the active Android input method may be rewriting the text. This can happen when pure ASCII text goes through the native `adb input text` path while a Chinese keyboard or autocorrect keyboard is active.

Use the existing `imeStrategy` option and force all text input through yadb:

```typescript
const device = new AndroidDevice('device-id', {
  imeStrategy: 'always-yadb',
});
```

For YAML scripts:

```yaml
android:
  imeStrategy: always-yadb
```

Or set the environment variable:

```bash
export MIDSCENE_ANDROID_IME_STRATEGY=always-yadb
```

This is different from text being cleared after typing. If the text is entered correctly and then disappears, check `keyboardDismissStrategy` or `autoDismissKeyboard` instead.

### How do I use a custom adb path or remote adb server?

Set the environment variables first:

```bash
export MIDSCENE_ADB_PATH=/path/to/adb
export MIDSCENE_ADB_REMOTE_HOST=192.168.1.100
export MIDSCENE_ADB_REMOTE_PORT=5037
```

You can also provide the same information via the constructor:

```typescript
const device = new AndroidDevice('s4ey59', {
  androidAdbPath: '/path/to/adb',
  remoteAdbHost: '192.168.1.100',
  remoteAdbPort: 5037,
});
```

<!-- END OFFICIAL PAGE 3: android-getting-started.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 4: android-introduction.mdx -->

## Source page: `android-introduction.mdx`

import StartExperience from './common/start-experience.mdx';
import ShowcaseAndroid from './showcases-android.mdx';

# Android Automation Support

Midscene can drive adb tools to support Android automation.

By adapting a visual model solution, the automation process works with any app tech stack—whether built with Native, Flutter, React Native, or Lynx. Developers only need to focus on the final experience when debugging UI automation scripts.

The Android UI automation solution comes with all the features of Midscene:

- Supports zero-code trial using Playground.
- Supports JavaScript SDK.
- Supports automation scripts in YAML format and command-line tools.
- Supports HTML reports to replay all operation paths.

## Showcases

<ShowcaseAndroid />

See more showcases: [showcases](./showcases.mdx)

## Try Midscene Playground on Android

With Midscene.js playground, you can experience Android automation capabilities without writing any code.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/booking2.mp4" controls/>

See [Getting Started](./android-getting-started#try-playground-no-code) to learn how to launch the Playground.

## Next Steps

* [Getting Started](./android-getting-started)
* [Use JavaScript SDK](./android-getting-started)
* [Use YAML format automation scripts](./automate-with-scripts-in-yaml) and [command-line tools](./automate-with-scripts-in-yaml)

<!-- END OFFICIAL PAGE 4: android-introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 5: android-world-benchmark-report.mdx -->

## Source page: `android-world-benchmark-report.mdx`

# Midscene AndroidWorld Benchmark Report

import { BenchmarkReportPreview } from '@theme';

<style>{`
.benchmark-status {
  display: inline-flex;
  min-width: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.benchmark-status-pass {
  color: #15803d;
  background: rgb(220 252 231 / 70%);
  border: 1px solid rgb(187 247 208 / 80%);
}

.benchmark-status-fail {
  color: #b91c1c;
  background: rgb(254 226 226 / 75%);
  border: 1px solid rgb(254 202 202 / 85%);
}

.dark .benchmark-status-pass {
  color: #86efac;
  background: rgb(22 101 52 / 35%);
  border-color: rgb(34 197 94 / 35%);
}

.dark .benchmark-status-fail {
  color: #fca5a5;
  background: rgb(127 29 29 / 35%);
  border-color: rgb(248 113 113 / 35%);
}

.benchmark-round table {
  width: 100%;
  table-layout: fixed;
}

.benchmark-round th,
.benchmark-round td {
  vertical-align: middle;
}

.benchmark-round th:nth-child(1),
.benchmark-round td:nth-child(1) {
  width: 56px;
  text-align: center;
}

.benchmark-round th:nth-child(2),
.benchmark-round td:nth-child(2) {
  width: auto;
  word-break: break-word;
}

.benchmark-round th:nth-child(3),
.benchmark-round td:nth-child(3) {
  width: 104px;
  text-align: center;
}

.benchmark-round th:nth-child(4),
.benchmark-round td:nth-child(4) {
  width: 112px;
}

.benchmark-report-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.benchmark-report-link::after {
  content: "↗";
  font-size: 0.9em;
  line-height: 1;
  transform: translateY(-1px);
}
`}</style>

<BenchmarkReportPreview />

This is Midscene's test report for the AndroidWorld benchmark. In this run, Midscene achieved **Pass@1 93.10%**, **Pass@2 95.69%**, and **Pass@3 97.41%**.

:::info About Android World

[AndroidWorld](https://github.com/google-research/android_world) is an Android agent benchmark from Google Research. It runs on a live Android emulator and evaluates agents on 116 programmatic tasks across 20 real-world Android apps, with task initialization and validation handled by the benchmark.

:::

## Run Configuration

| Field | Value |
| --- | --- |
| Model Name | `Gemini-3.5-Flash` |
| Midscene version | `1.9.5` |
| DeepThink | on |
| `MIDSCENE_REPLANNING_CYCLE_LIMIT` | 120 |
| AndroidWorld setup | Stability fixes were applied to the AndroidWorld project to reduce flaky benchmark runs. See examples below. |
| Validation notes | A small number of AndroidWorld validators were aligned with the task intent. The affected cases are listed below. |

## Stability Improvements

The following changes did not change the task intent. They made benchmark execution more stable by reducing browser rendering races, stale accessibility reads, and setup timing issues.

| Change | Affected cases |
| --- | --- |
| Force canvas pixels to flush after drawing, then use thicker rounded strokes so target colors remain stable in the final canvas pixels. | `BrowserDraw` |
| Retry reading the `Success!` text from the accessibility tree after browser tasks finish. | `BrowserMaze`<br />`BrowserMultiply`<br />`BrowserDraw` |
| Before SMS tasks start, prepare the required incoming messages and contacts; now verify those messages are visible in the inbox and those contacts are visible in Contacts before the agent runs. | `SimpleSmsReplyMostRecent`<br />`SimpleSmsSendReceivedAddress` |
| Wait for Pro Expense to create its database tables before validators write test data. | `ExpenseAddMultiple`<br />`ExpenseAddMultipleFromGallery`<br />`ExpenseAddMultipleFromMarkor`<br />`ExpenseAddSingle`<br />`ExpenseDeleteDuplicates`<br />`ExpenseDeleteDuplicates2`<br />`ExpenseDeleteMultiple`<br />`ExpenseDeleteMultiple2`<br />`ExpenseDeleteSingle` |
| Preload OsmAnd offline map files into the app data directory and wait for OsmAnd to extract its built-in basemap before map tasks run. | `OsmAndFavorite`<br />`OsmAndMarker`<br />`OsmAndTrack` |

## Validation Condition Updates

The following AndroidWorld validation checks were changed on the `main` branch used for this benchmark:

| Change | Affected cases |
| --- | --- |
| Calendar "after start time" now validates against an event one minute after the boundary, avoiding ambiguity across models about whether `after` includes the boundary time. | `SimpleCalendarFirstEventAfterStartTime` |
| Expense notes imported from Markor accept the extra `Reimbursable.` suffix that Markor can include; note comparison ignores that suffix and terminal period differences. | `ExpenseAddMultipleFromMarkor` |
| Markor merged notes accept either single-newline or blank-line separation, and also accept Markor's default `.md` extension when it is auto-added. | `MarkorMergeNotes` |
| Recipe quantity fields allow omitted units while still rejecting wrong amounts or incompatible units. | `RecipeAddSingleRecipe`<br />`RecipeAddMultipleRecipes`<br />`RecipeAddMultipleRecipesFromMarkor`<br />`RecipeAddMultipleRecipesFromMarkor2`<br />`RecipeAddMultipleRecipesFromImage`<br />`NotesRecipeIngredientCount` |
| Minimum brightness is validated against Android's actual minimum setting value, `0`, instead of `1`. | `SystemBrightnessMin`<br />`SystemBrightnessMinVerify` |

## Report Files

Detailed reports are listed below for reference.

<details open className="benchmark-round">
<summary>Round 1 (115 reports · 108 PASS · 7 FAIL)</summary>

| # | Task | Status | Report |
| --- | --- | --- | --- |
| 1 | AudioRecorderRecordAudio | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-1-AudioRecorderRecordAudio__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 2 | AudioRecorderRecordAudioWithFileName | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-2-AudioRecorderRecordAudioWithFileName__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 3 | BrowserDraw | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-3-BrowserDraw__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 4 | BrowserMaze | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-4-BrowserMaze__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 5 | BrowserMultiply | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-5-BrowserMultiply__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 6 | CameraTakePhoto | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-6-CameraTakePhoto__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 7 | CameraTakeVideo | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-7-CameraTakeVideo__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 8 | ClockStopWatchPausedVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-8-ClockStopWatchPausedVerify__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 9 | ClockStopWatchRunning | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-9-ClockStopWatchRunning__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 10 | ClockTimerEntry | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-10-ClockTimerEntry__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 11 | ContactsAddContact | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-11-ContactsAddContact__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 12 | ContactsNewContactDraft | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-12-ContactsNewContactDraft__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 13 | ExpenseAddMultiple | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-13-ExpenseAddMultiple__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 14 | ExpenseAddMultipleFromGallery | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-14-ExpenseAddMultipleFromGallery__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 15 | ExpenseAddMultipleFromMarkor | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-15-ExpenseAddMultipleFromMarkor__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 16 | ExpenseAddSingle | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-16-ExpenseAddSingle__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 17 | ExpenseDeleteDuplicates | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-17-ExpenseDeleteDuplicates__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 18 | ExpenseDeleteDuplicates2 | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-18-ExpenseDeleteDuplicates2__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 19 | ExpenseDeleteMultiple | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-19-ExpenseDeleteMultiple__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 20 | ExpenseDeleteMultiple2 | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-20-ExpenseDeleteMultiple2__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 21 | ExpenseDeleteSingle | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-21-ExpenseDeleteSingle__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 22 | FilesDeleteFile | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-22-FilesDeleteFile__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 23 | FilesMoveFile | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-23-FilesMoveFile__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 24 | MarkorAddNoteHeader | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-24-MarkorAddNoteHeader__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 25 | MarkorChangeNoteContent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-25-MarkorChangeNoteContent__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 26 | MarkorCreateFolder | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-26-MarkorCreateFolder__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 27 | MarkorCreateNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-27-MarkorCreateNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 28 | MarkorCreateNoteAndSms | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-28-MarkorCreateNoteAndSms__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 29 | MarkorCreateNoteFromClipboard | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-29-MarkorCreateNoteFromClipboard__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 30 | MarkorDeleteAllNotes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-30-MarkorDeleteAllNotes__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 31 | MarkorDeleteNewestNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-31-MarkorDeleteNewestNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 32 | MarkorDeleteNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-32-MarkorDeleteNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 33 | MarkorEditNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-33-MarkorEditNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 34 | MarkorMergeNotes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-34-MarkorMergeNotes__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 35 | MarkorMoveNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-35-MarkorMoveNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 36 | MarkorTranscribeReceipt | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-36-MarkorTranscribeReceipt__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 37 | MarkorTranscribeVideo | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-37-MarkorTranscribeVideo__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 38 | OpenAppTaskEval | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-38-OpenAppTaskEval__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 39 | OsmAndFavorite | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-39-OsmAndFavorite__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 40 | OsmAndMarker | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-40-OsmAndMarker__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 42 | RecipeAddMultipleRecipes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-42-RecipeAddMultipleRecipes__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 43 | RecipeAddMultipleRecipesFromImage | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-43-RecipeAddMultipleRecipesFromImage__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 44 | RecipeAddMultipleRecipesFromMarkor | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-44-RecipeAddMultipleRecipesFromMarkor__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 45 | RecipeAddMultipleRecipesFromMarkor2 | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-45-RecipeAddMultipleRecipesFromMarkor2__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 46 | RecipeAddSingleRecipe | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-46-RecipeAddSingleRecipe__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 47 | RecipeDeleteDuplicateRecipes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-47-RecipeDeleteDuplicateRecipes__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 48 | RecipeDeleteDuplicateRecipes2 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-48-RecipeDeleteDuplicateRecipes2__group-4-e26952de-4051-468d-b545-16865f0487da-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 49 | RecipeDeleteDuplicateRecipes3 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-49-RecipeDeleteDuplicateRecipes3__group-4-e26952de-4051-468d-b545-16865f0487da-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 50 | RecipeDeleteMultipleRecipes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-50-RecipeDeleteMultipleRecipes__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 51 | RecipeDeleteMultipleRecipesWithConstraint | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-51-RecipeDeleteMultipleRecipesWithConstraint__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 52 | RecipeDeleteMultipleRecipesWithNoise | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-52-RecipeDeleteMultipleRecipesWithNoise__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 53 | RecipeDeleteSingleRecipe | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-53-RecipeDeleteSingleRecipe__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 54 | RecipeDeleteSingleWithRecipeWithNoise | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-54-RecipeDeleteSingleWithRecipeWithNoise__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 55 | RetroCreatePlaylist | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-55-RetroCreatePlaylist__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 56 | RetroPlayingQueue | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-56-RetroPlayingQueue__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 57 | RetroPlaylistDuration | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-57-RetroPlaylistDuration__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 58 | RetroSavePlaylist | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-58-RetroSavePlaylist__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 59 | SaveCopyOfReceiptTaskEval | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-59-SaveCopyOfReceiptTaskEval__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 60 | SimpleCalendarAddOneEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-60-SimpleCalendarAddOneEvent__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 61 | SimpleCalendarAddOneEventInTwoWeeks | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-61-SimpleCalendarAddOneEventInTwoWeeks__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 62 | SimpleCalendarAddOneEventRelativeDay | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-62-SimpleCalendarAddOneEventRelativeDay__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 63 | SimpleCalendarAddOneEventTomorrow | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-63-SimpleCalendarAddOneEventTomorrow__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 64 | SimpleCalendarAddRepeatingEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-64-SimpleCalendarAddRepeatingEvent__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 65 | SimpleCalendarDeleteEvents | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-65-SimpleCalendarDeleteEvents__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 66 | SimpleCalendarDeleteEventsOnRelativeDay | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-66-SimpleCalendarDeleteEventsOnRelativeDay__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 67 | SimpleCalendarDeleteOneEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-67-SimpleCalendarDeleteOneEvent__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 68 | SimpleDrawProCreateDrawing | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-68-SimpleDrawProCreateDrawing__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 69 | SimpleSmsReply | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-69-SimpleSmsReply__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 70 | SimpleSmsReplyMostRecent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-70-SimpleSmsReplyMostRecent__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 71 | SimpleSmsResend | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-71-SimpleSmsResend__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 72 | SimpleSmsSend | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-72-SimpleSmsSend__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 73 | SimpleSmsSendClipboardContent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-73-SimpleSmsSendClipboardContent__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 74 | SimpleSmsSendReceivedAddress | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-74-SimpleSmsSendReceivedAddress__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 75 | SystemBluetoothTurnOff | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-75-SystemBluetoothTurnOff__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 76 | SystemBluetoothTurnOffVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-76-SystemBluetoothTurnOffVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 77 | SystemBluetoothTurnOn | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-77-SystemBluetoothTurnOn__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 78 | SystemBluetoothTurnOnVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-78-SystemBluetoothTurnOnVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 79 | SystemBrightnessMax | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-79-SystemBrightnessMax__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 80 | SystemBrightnessMaxVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-80-SystemBrightnessMaxVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 81 | SystemBrightnessMin | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-81-SystemBrightnessMin__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 82 | SystemBrightnessMinVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-82-SystemBrightnessMinVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 83 | SystemCopyToClipboard | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-83-SystemCopyToClipboard__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 84 | SystemWifiTurnOff | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-84-SystemWifiTurnOff__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 85 | SystemWifiTurnOffVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-85-SystemWifiTurnOffVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 86 | SystemWifiTurnOn | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-86-SystemWifiTurnOn__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 87 | SystemWifiTurnOnVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-87-SystemWifiTurnOnVerify__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 88 | TurnOffWifiAndTurnOnBluetooth | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-88-TurnOffWifiAndTurnOnBluetooth__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 89 | TurnOnWifiAndOpenApp | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-89-TurnOnWifiAndOpenApp__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 90 | VlcCreatePlaylist | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-90-VlcCreatePlaylist__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 91 | VlcCreateTwoPlaylists | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-91-VlcCreateTwoPlaylists__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 92 | NotesIsTodo | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-92-NotesIsTodo__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 93 | NotesMeetingAttendeeCount | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-93-NotesMeetingAttendeeCount__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 94 | NotesRecipeIngredientCount | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-94-NotesRecipeIngredientCount__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 95 | NotesTodoItemCount | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-95-NotesTodoItemCount__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 96 | SimpleCalendarAnyEventsOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-96-SimpleCalendarAnyEventsOnDate__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 97 | SimpleCalendarEventOnDateAtTime | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-97-SimpleCalendarEventOnDateAtTime__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 98 | SimpleCalendarEventsInNextWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-98-SimpleCalendarEventsInNextWeek__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 99 | SimpleCalendarEventsInTimeRange | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-99-SimpleCalendarEventsInTimeRange__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 100 | SimpleCalendarEventsOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-100-SimpleCalendarEventsOnDate__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 101 | SimpleCalendarFirstEventAfterStartTime | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-101-SimpleCalendarFirstEventAfterStartTime__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 102 | SimpleCalendarLocationOfEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-102-SimpleCalendarLocationOfEvent__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 103 | SimpleCalendarNextEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-103-SimpleCalendarNextEvent__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 104 | SimpleCalendarNextMeetingWithPerson | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-104-SimpleCalendarNextMeetingWithPerson__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 105 | SportsTrackerActivitiesCountForWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-105-SportsTrackerActivitiesCountForWeek__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 106 | SportsTrackerActivitiesOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-106-SportsTrackerActivitiesOnDate__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 107 | SportsTrackerActivityDuration | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-107-SportsTrackerActivityDuration__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 108 | SportsTrackerLongestDistanceActivity | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-108-SportsTrackerLongestDistanceActivity__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 109 | SportsTrackerTotalDistanceForCategoryOverInterval | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-109-SportsTrackerTotalDistanceForCategoryOverInterval__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 110 | SportsTrackerTotalDurationForCategoryThisWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-110-SportsTrackerTotalDurationForCategoryThisWeek__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 111 | TasksCompletedTasksForDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-111-TasksCompletedTasksForDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 112 | TasksDueNextWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-112-TasksDueNextWeek__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 113 | TasksDueOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-113-TasksDueOnDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 114 | TasksHighPriorityTasks | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-114-TasksHighPriorityTasks__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 115 | TasksHighPriorityTasksDueOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-115-TasksHighPriorityTasksDueOnDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 116 | TasksIncompleteTasksOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-116-TasksIncompleteTasksOnDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |

</details>

<details open className="benchmark-round">
<summary>Round 2 (7 reports · 3 PASS · 4 FAIL)</summary>

| # | Task | Status | Report |
| --- | --- | --- | --- |
| 37 | MarkorTranscribeVideo | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-37-MarkorTranscribeVideo__group-1-64f79cdf-48e8-4f61-8957-25c700986d73-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 40 | OsmAndMarker | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-40-OsmAndMarker__group-2-6bd15c82-4ed2-4f96-abf7-c88572389853-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 41 | OsmAndTrack | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-41-OsmAndTrack__group-3-f4ea5170-8b8e-4f9a-b824-a63f2891b5ce-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 43 | RecipeAddMultipleRecipesFromImage | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-43-RecipeAddMultipleRecipesFromImage__group-4-484dd8b1-5c38-4437-bc2a-dc27c0ae3030-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 48 | RecipeDeleteDuplicateRecipes2 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-48-RecipeDeleteDuplicateRecipes2__group-5-63973ecd-498e-49c3-bd78-9b4753b09c3b-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 49 | RecipeDeleteDuplicateRecipes3 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-49-RecipeDeleteDuplicateRecipes3__group-6-aeb4ae0d-5009-4e65-99ba-8b68dec80292-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 83 | SystemCopyToClipboard | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-83-SystemCopyToClipboard__group-7-be57c739-1f22-4619-8d7d-5ed83ce40c5b-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |

</details>

<details open className="benchmark-round">
<summary>Round 3 (5 reports · 2 PASS · 3 FAIL)</summary>

| # | Task | Status | Report |
| --- | --- | --- | --- |
| 15 | ExpenseAddMultipleFromMarkor | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-15-ExpenseAddMultipleFromMarkor__group-0-369e3fc9-fc5c-4e8b-b772-79ed60e80f08-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 37 | MarkorTranscribeVideo | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-37-MarkorTranscribeVideo__group-1-903c0656-7826-4f41-9690-e91aa30e458c-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 40 | OsmAndMarker | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/android-world-benchmark-report.html?file=Task-40-OsmAndMarker__group-2-9cce7b88-8441-48c5-aed1-a03b6bda31c9-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 48 | RecipeDeleteDuplicateRecipes2 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-48-RecipeDeleteDuplicateRecipes2__group-3-ee73848e-6d46-468f-8d76-ead83c182098-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |
| 49 | RecipeDeleteDuplicateRecipes3 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/android-world-benchmark-report.html?file=Task-49-RecipeDeleteDuplicateRecipes3__group-4-74e82f14-18f6-467c-a6a9-3b85852aba30-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="Open report in a new page">report</a> |

</details>

<!-- END OFFICIAL PAGE 5: android-world-benchmark-report.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 6: api.mdx -->

## Source page: `api.mdx`

# API reference (Common)

## Constructors

Midscene ships multiple agents tuned for specific automation environments. Every constructor takes the target page/device plus a shared options bag (reporting, caching, AI configuration, hooks), and then layers on platform-only switches such as navigation guards in browsers or ADB wiring on Android. Use the sections below to review the import path and platform-specific parameters for each agent:

- In Puppeteer, use [PuppeteerAgent](./web-api-reference#puppeteer-agent)
- In Playwright, use [PlaywrightAgent](./web-api-reference#playwright-agent)
- In Bridge Mode, use [AgentOverChromeBridge](./web-api-reference#chrome-bridge-agent)
- On Android, use [Android API reference](./android-api-reference)
- On iOS, use [iOS API reference](./ios-api-reference)
- For GUI agents integrating with your own interface, refer to [Custom Interface Agent](./integrate-with-any-interface)

### Parameters

All agents share these base options:

- `generateReport: boolean`: If true, a report file will be generated. (Default: true)
- `persistExecutionDump: boolean`: If true, Midscene also writes per-execution JSON dump files alongside the report. (Default: false) This option requires `generateReport` to remain `true`.
- `reportFileName: string`: The report output name. (Default: generated by midscene) Its exact meaning depends on `outputFormat`:
  - `single-html` (default): treated as a file name. Midscene writes `<reportFileName>.html` under `midscene_run/report/` (keeps `.html` if already provided).
  - `html-and-external-assets`: treated as a directory name. Midscene writes `index.html` and related assets under `midscene_run/report/<reportFileName>/`.
- `autoPrintReportMsg: boolean`: If true, report messages will be printed. (Default: true)
- `cache?: false | { id: string; strategy?: 'read-only' | 'read-write' | 'write-only'; dir?: string }`:
  - `false`: disable cache completely.
  - `id`: required cache ID.
  - `strategy`: optional cache strategy. Default is `'read-write'`.
  - `dir`: optional cache directory path. When set, cache files are written to this directory instead of `<MIDSCENE_RUN_DIR>/cache`. Relative paths are resolved from the current working directory, not from `MIDSCENE_RUN_DIR`. This lets you split cache and logs/report directories.
- `cacheId: string | undefined` (deprecated): legacy cache ID for backward compatibility. Prefer `cache.id`.
- `aiActContext: string`: Some background knowledge that should be sent to the AI model when calling `agent.aiAct()`, like 'close the cookie consent dialog first if it exists' (Default: undefined). Previously exposed as `aiActionContext`; the legacy name is still accepted for backward compatibility.
- `replanningCycleLimit: number`: The maximum number of `aiAct` replanning cycles. Default is 20 (40 for UI-TARS models). Prefer setting this via the agent option; reading `MIDSCENE_REPLANNING_CYCLE_LIMIT` is only for backward compatibility.
- `waitAfterAction: number`: Wait time in milliseconds after each action execution. This allows the UI to settle and stabilize before the next action. Default is 300ms.
- `onTaskStartTip: (tip: string) => void | Promise<void>`: Optional hook that fires before each execution task begins with a human-readable summary of the task (Default: undefined)
- `outputFormat: 'single-html' | 'html-and-external-assets'`: Controls how the report is generated. `'single-html'` (default) embeds all screenshots as base64 in a single HTML file and uses `reportFileName` as the HTML file name. `'html-and-external-assets'` saves screenshots as separate PNG files in a subdirectory and uses `reportFileName` as that directory name. **Note**: When using `'html-and-external-assets'`, the report must be accessed via an HTTP server or CDN URL - it cannot be opened directly using the `file://` protocol. This is because browser CORS (Cross-Origin Resource Sharing) restrictions prevent loading local images from relative paths when using the file protocol. For local testing, start a simple HTTP server in the report directory. Navigate to the report directory and run one of these commands:
  - Using Node.js: `npx serve`
  - Using Python: `python -m http.server` or `python3 -m http.server`
  Then access the report via `http://localhost:3000` (or the port shown in the terminal).
- `screenshotShrinkFactor: number`: Controls the scaling ratio of screenshots to reduce the image size sent to the AI model, thereby reducing token consumption. The default value is 1 (no scaling). If set to 2, the width and height of the screenshot will be halved, and the area will be reduced to a quarter of the original. You can adjust this value based on your actual situation to find the best balance between image clarity and token consumption.
  - For mobile devices, setting `screenshotShrinkFactor` to 2 can reduce token consumption while maintaining clarity, but it is not recommended to set it higher than 3, as this may cause the image to be too blurry and affect the AI model's understanding.
  - For web pages, if the content is complex or contains a lot of details, avoid setting `screenshotShrinkFactor` too high to prevent overly blurry screenshots. You can usually control screenshot size earlier in the pipeline through Puppeteer or Playwright's `deviceScaleFactor`.

:::info

**Difference between `screenshotShrinkFactor` and `deviceScaleFactor`:**

- `screenshotShrinkFactor` is a Midscene-specific option. It controls whether Midscene compresses a screenshot after capturing it from devices such as browsers and phones. Its purpose is to reduce token consumption and speed up model responses, but excessive compression can blur the image and hurt the model's understanding.

- `deviceScaleFactor` is a Puppeteer and Playwright option for configuring high-DPI display adaptation. It defines how many physical pixels should be used to render one CSS logical pixel. This is why a mismatch between `deviceScaleFactor` and the actual device scale can cause page flickering in non-headless mode. The same scaling logic also determines the screenshot size generated by Puppeteer/Playwright, based on physical pixels. Compared with `screenshotShrinkFactor`, it controls screenshot size further upstream at the production stage.

**Can they be used together?**

- Web scenarios: using both usually has limited value. Prefer `deviceScaleFactor` to control screenshot size directly at the production stage.
  - One exception: when you configure `deviceScaleFactor` to avoid browser flickering, but still do not want to send an oversized screenshot to the model. In that case, you can also use `screenshotShrinkFactor` to compress the image before model consumption.
- Mobile and other non-Web scenarios: `deviceScaleFactor` is not available, so use `screenshotShrinkFactor` to control the screenshot size consumed by the model.

:::

The device CLIs expose these same Agent behavior options per call. Convert the camelCase API option to a bare kebab-case flag, such as `waitAfterAction` -> `--wait-after-action`. See [Skills](./skills) for the platform CLI entry points.

### Custom model configuration

Use `modelConfig: Record<string, string | number>` to configure models directly in code instead of environment variables.

> If `modelConfig` is provided at agent initialization, **all system environment variables for model config are ignored**. Only the values in this object are used.
> The keys/values you can set here are the same ones listed in [Model configuration](./model-config). You can also see explanation in [Model strategy](./model-strategy).

**Basic Example (single model for all intents):**
```typescript
const agent = new PuppeteerAgent(page, {
  modelConfig: {
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    MIDSCENE_MODEL_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    MIDSCENE_MODEL_API_KEY: 'sk-...',
    MIDSCENE_MODEL_FAMILY: 'qwen3'
  }
});
```

**Configure different models for different task types (via intent-specific keys):**
```typescript
const agent = new PuppeteerAgent(page, {
  modelConfig: {
    // default
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    MIDSCENE_MODEL_API_KEY: 'sk-default-key',
    MIDSCENE_MODEL_BASE_URL: '.....',
    MIDSCENE_MODEL_FAMILY: 'qwen3',

    // planning intent
    MIDSCENE_PLANNING_MODEL_NAME: 'gpt-5.1',
    MIDSCENE_PLANNING_MODEL_API_KEY: 'sk-planning-key',
    MIDSCENE_PLANNING_MODEL_BASE_URL: '...',
    MIDSCENE_PLANNING_MODEL_FAMILY: 'gpt-5',
    
    // insight intent
    MIDSCENE_INSIGHT_MODEL_NAME: 'qwen-vl-plus',
    MIDSCENE_INSIGHT_MODEL_API_KEY: 'sk-insight-key',
    MIDSCENE_INSIGHT_MODEL_FAMILY: 'qwen2.5-vl'
  }
});
```

### Custom OpenAI client

`createOpenAIClient: (openai, options) => Promise<OpenAI | undefined>` lets you wrap the OpenAI client instance for integrating observability tools (such as LangSmith, LangFuse) or applying custom middleware.

**Parameter Description:**
- `openai: OpenAI` - The base OpenAI client instance created by Midscene with all necessary configurations (API key, base URL, proxy, etc.)
- `options: Record<string, unknown>` - OpenAI initialization options, including:
  - `baseURL?: string` - API endpoint URL
  - `apiKey?: string` - API key
  - `dangerouslyAllowBrowser: boolean` - Always true in Midscene
  - Other OpenAI configuration options

**Return Value:**
- Return the wrapped OpenAI client instance, or `undefined` to use the original instance

**Example (LangSmith Integration):**
```typescript
import { wrapOpenAI } from 'langsmith/wrappers';

const agent = new PuppeteerAgent(page, {
  createOpenAIClient: async (openai, options) => {
    // Wrap with LangSmith for planning tasks
    if (options.baseURL?.includes('planning')) {
      return wrapOpenAI(openai, {
        metadata: { task: 'planning' }
      });
    }

    // Return the original client for other tasks
    return openai;
  }
});
```

**Note:** For LangSmith and Langfuse integration, we recommend using the environment-variable approach documented in [Model configuration](./model-config#using-langsmith), which requires no `createOpenAIClient` code. If you provide a custom client wrapper function, it will override the auto-integration behavior from environment variables.

## Interaction methods

Below are the main APIs available for the various Agents in Midscene.

:::info Auto Planning v.s. Instant Action

In Midscene, you can choose to use either auto planning or instant action.

- `agent.ai()` is for Auto Planning: Midscene will automatically plan the steps and execute them. It's more smart and looks like more fashionable style for AI agents. But it may be slower and heavily rely on the quality of the AI model.
- `agent.aiTap()`, `agent.aiHover()`, `agent.aiInput()`, `agent.aiClearInput()`, `agent.aiKeyboardPress()`, `agent.aiScroll()`, `agent.aiPinch()`, `agent.aiLongPress()`, `agent.aiDoubleClick()`, `agent.aiRightClick()` are for Instant Action: Midscene will directly perform the specified action, while the AI model is responsible for basic tasks such as locating elements. It's faster and more reliable if you are certain about the action you want to perform.

:::

### `agent.aiAct()` or `agent.ai()`

This method allows you to perform a series of UI actions described in natural language. Midscene automatically plans the steps and executes them.

:::info Backward Compatibility

This method was previously named `aiAction()` in earlier versions. The current version supports both names for backward compatibility. We recommend using the new `aiAct()` method for code consistency.

:::

- Type

```typescript
function aiAct(
  prompt: string,
  options?: {
    cacheable?: boolean;
    deepThink?: 'unset' | true | false;
    deepLocate?: boolean;
    fileChooserAccept?: string | string[];
    abortSignal?: AbortSignal;
  },
): Promise<string | undefined>;
function ai(prompt: string): Promise<string | undefined>; // shorthand form
```

- Parameters:

  - `prompt: string` - A natural language description of the UI steps.
  - `options?: Object` - Optional, a configuration object containing:
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.
    - `deepThink?: 'unset' | true | false` - Controls the planning implementation used by Midscene when `aiAct` performs planning. When enabled, `aiAct` focuses more on task decomposition and separates task planning from UI element locating into different model calls. For compatibility, `'unset'` is accepted and treated the same as `false`. [Learn more about deepThink](./model-strategy#about-the-deepthink-option-in-aiact).
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). False by default.
    - `fileChooserAccept?: string | string[]` - When a file chooser pops up, specify the file path(s) to accept. Can be a single file path or an array of paths. Only available in web pages (Playwright, Puppeteer, or Chrome extension Bridge mode).
      - **Note**: If the file input does not support multiple files (no `multiple` attribute) but multiple files are provided, an error will be thrown.
      - **Note**: If a file chooser is triggered but no `fileChooserAccept` parameter is provided, the file chooser will be ignored and the page can continue to operate normally.
      - **Note**: Chrome extension Bridge mode does not support directory upload inputs (`webkitdirectory` / `directory`). Use Playwright for directory uploads.
    - `abortSignal?: AbortSignal` - An optional [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) that allows you to abort the `aiAct` execution. When the signal is triggered, Midscene will stop the current planning loop and throw an error. This is useful for implementing timeouts or user-initiated cancellations.

- Return Value:

  - Returns a Promise that resolves to void when all steps are completed; if execution fails, an error is thrown.

- Examples:

```typescript
// Basic usage
await agent.aiAct(
  'Type "JavaScript" into the search box, then click the search button',
);

// Using the shorthand .ai form
await agent.ai(
  'Click the login button at the top of the page, then enter "test@example.com" in the username field',
);


// Using abortSignal to set a timeout
const controller = new AbortController();
setTimeout(() => controller.abort('timeout'), 30000); // 30s timeout
await agent.aiAct('Fill in the form and submit', {
  abortSignal: controller.signal,
});

// For complex tasks, you can enable the deepThink parameter
await agent.aiAct('Complete the GitHub account registration form. The region must be set to "Canada". Make sure no fields on the form are missed and all form fields pass validation. Just fill in the form fields without actually submitting the registration. Finally, return the actual content filled in the form fields', { deepThink: true });
```

:::tip

Under the hood, Midscene uses AI model to split the instruction into a series of steps (a.k.a. "Planning"). It then executes these steps sequentially. If Midscene determines that the actions cannot be performed, an error will be thrown.

For optimal results, please provide clear and detailed instructions for `agent.aiAct()`.

Related Documentation:

- [Model strategy](./model-strategy)

:::

### `agent.aiTap()`

Tap something.

- Type

```typescript
function aiTap(locate: string | Object, options?: Object): Promise<void>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the element to tap, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.
    - `fileChooserAccept?: string | string[]` - When a file chooser pops up, specify the file path(s) to accept. Can be a single file path or an array of paths. Only available in web pages (Playwright, Puppeteer, or Chrome extension Bridge mode).
      - **Note**: If the file input does not support multiple files (no `multiple` attribute) but multiple files are provided, an error will be thrown.
      - **Note**: If a file chooser is triggered but no `fileChooserAccept` parameter is provided, the file chooser will be ignored and the page can continue to operate normally.
      - **Note**: Chrome extension Bridge mode does not support directory upload inputs (`webkitdirectory` / `directory`). Use Playwright for directory uploads.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
await agent.aiTap('The login button at the top of the page');

// Use deepLocate feature to precisely locate the element
await agent.aiTap('The login button at the top of the page', {
  deepLocate: true,
});

// File upload: tap the upload button and select files
await agent.aiTap('Choose file button', { fileChooserAccept: ['./document.pdf'] });
await agent.aiTap('Upload images', { fileChooserAccept: ['./image1.jpg', './image2.png'] });
```

### `agent.aiHover()`

> Available in web pages and PC desktop (`@midscene/computer`), not available on mobile devices (Android / iOS).

Move mouse over something.

- Type

```typescript
function aiHover(locate: string | Object, options?: Object): Promise<void>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the element to hover over, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
await agent.aiHover('The version number of the current page');
```

### `agent.aiInput()`

Input text into something.

- Type

```typescript
// Recommended: locate first, then options with value
function aiInput(
  locate: string | Object,
  opt: {
    value: string | number;
    deepLocate?: boolean;
    xpath?: string;
    cacheable?: boolean;
    autoDismissKeyboard?: boolean;
    keyboardTypeDelay?: number;
    mode?: 'replace' | 'clear' | 'typeOnly';
  },
): Promise<void>;

// Backward compatible (legacy)
function aiInput(
  value: string | number,
  locate: string | Object,
  options?: Object,
): Promise<void>;
```

- Parameters:

  **Recommended usage:**
  - `locate: string | Object` - A natural language description of the element to input text into, or [prompting with images](#prompting-with-images).
  - `opt: Object` - Configuration object containing:
    - `value: string | number` - **Required**. The text content to input.
      - When `mode` is `'replace'`: The text will replace all existing content in the input field.
      - When `mode` is `'typeOnly'`: The text will be typed directly without clearing the field first.
      - When `mode` is `'clear'`: The text is ignored and the input field will be cleared.
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.
    - `autoDismissKeyboard?: boolean` - If true, the keyboard will be dismissed after input text, only available in Android/iOS/HarmonyOS. (Default: true)
    - `keyboardTypeDelay?: number` - Delay in milliseconds between keystrokes when typing text. When set, text is typed one character at a time with this delay between each character. Useful when input fields drop characters under fast typing.
    - `mode?: 'replace' | 'clear' | 'typeOnly'` - Input mode. (Default: 'replace')
      - `'replace'`: Clear the input field first, then input the text.
      - `'typeOnly'`: Type the value directly without clearing the field first.
      - `'clear'`: Clear the input field without entering new text.

  **Backward compatible usage (deprecated but still supported):**
  - `value: string | number` - The text content to input.
  - `locate: string | Object` - A natural language description of the element, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional configuration object. The type is the same as the `opt` type in the recommended usage.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
// Recommended
await agent.aiInput('The search input box', { value: 'Hello World' });

// Backward compatible (not recommended)
await agent.aiInput('Hello World', 'The search input box');
```

:::note Signature Update

We recently updated the `aiInput` API signature to put the locate prompt as the first parameter, making the parameter order more intuitive. The legacy signature `aiInput(value, locate, options)` is still fully compatible, but new code should use the recommended signature.

:::

### `agent.aiClearInput()`

Clear the content of an input field. Useful as a standalone step before typing, or when you need to remove existing text without immediately inputting a new value.

- Type

```typescript
function aiClearInput(
  locate: string | Object,
  opt?: {
    deepLocate?: boolean;
    xpath?: string;
    cacheable?: boolean;
  },
): Promise<void>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the input field to clear, or [prompting with images](#prompting-with-images).
  - `opt?: Object` - Optional, a configuration object containing:
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). False by default.
    - `xpath?: string` - The xpath of the element to operate. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
// Clear the search box
await agent.aiClearInput('the search input field');

// Clear and then type a new value
await agent.aiClearInput('the email input');
await agent.aiInput('the email input', { value: 'user@example.com' });
```

:::tip When to use `aiClearInput` vs `aiInput`

`aiInput(locate, { value: '...' })` already clears the field by default (via `mode: 'replace'`). Reach for `aiClearInput` when you need clearing as an independent step — for example, to test empty-state validation, or when you want to control clearing and typing as separate actions.

:::

### `agent.aiKeyboardPress()`

Press a keyboard key.

- Type

```typescript
// Recommended: locate first, then options with keyName
function aiKeyboardPress(
  locate: string | Object,
  opt: {
    keyName: string;
    deepLocate?: boolean;
    xpath?: string;
    cacheable?: boolean;
  },
): Promise<void>;

// Backward compatible (legacy)
function aiKeyboardPress(
  key: string,
  locate?: string | Object,
  options?: Object,
): Promise<void>;
```

- Parameters:

  **Recommended usage:**
  - `locate: string | Object` - A natural language description of the element to press the key on, or [prompting with images](#prompting-with-images).
  - `opt: Object` - Configuration object containing:
    - `keyName: string` - **Required**. The web key to press, e.g. 'Enter', 'Tab', 'Escape', etc. Key Combination is not supported. Refer to the [complete list of supported key names in our source code](https://github.com/web-infra-dev/midscene/blob/main/packages/shared/src/us-keyboard-layout.ts) for available values.
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

  **Backward compatible usage (deprecated but still supported):**
  - `key: string` - The web key to press, e.g. 'Enter', 'Tab', 'Escape', etc. Key Combination is not supported.
  - `locate?: string | Object` - Optional, a natural language description of the element, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional configuration object. The type is the same as the `opt` type in the recommended usage.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
// Recommended
await agent.aiKeyboardPress('The search input box', { keyName: 'Enter' });

// Backward compatible (not recommended)
await agent.aiKeyboardPress('Enter', 'The search input box');
```

:::note Signature Update

We recently updated the `aiKeyboardPress` API signature to put the locate prompt as the first parameter, making the parameter order more intuitive. The legacy signature `aiKeyboardPress(key, locate, options)` is still fully compatible, but new code should use the recommended signature.

:::

### `agent.aiScroll()`

Scroll a page or an element.

- Type

```typescript
// Recommended: locate first, then options with scroll parameters
function aiScroll(
  locate: string | Object | undefined,
  opt: {
    scrollType?: 'singleAction' | 'scrollToBottom' | 'scrollToTop' | 'scrollToRight' | 'scrollToLeft';
    direction?: 'down' | 'up' | 'left' | 'right';
    distance?: number | null;
    deepLocate?: boolean;
    xpath?: string;
    cacheable?: boolean;
  },
): Promise<void>;

// Backward compatible (legacy)
function aiScroll(
  scrollParam: PlanningActionParamScroll,
  locate?: string | Object,
  options?: Object,
): Promise<void>;
```

- Parameters:

  **Recommended usage:**
  - `locate: string | Object | undefined` - A natural language description of the element to scroll on, or [prompting with images](#prompting-with-images). If not provided or undefined, Midscene will perform scroll on the current mouse position.
  - `opt: Object` - Configuration object containing:
    - `scrollType?: 'singleAction' | 'scrollToBottom' | 'scrollToTop' | 'scrollToRight' | 'scrollToLeft'` - The scroll behavior. Defaults to `singleAction`.
    - `direction?: 'down' | 'up' | 'right' | 'left'` - The direction to scroll. Defaults to `down`. Only effective when `scrollType` is `singleAction`. Whether it is Android or Web, the scrolling direction here all refers to which direction of the page's content will appear on the screen. For example, when the scrolling direction is `down`, the hidden content at the bottom of the page will gradually reveal itself from the bottom of the screen upwards.
    - `distance?: number | null` - Optional, the distance to scroll in px. Use `null` to allow Midscene to decide automatically.
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

  **Backward compatible usage (deprecated but still supported):**
  - `scrollParam: PlanningActionParamScroll` - The scroll parameter (contains scrollType, direction, distance).
  - `locate?: string | Object` - Optional, a natural language description of the element, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional configuration object. The type is the same as the `opt` type in the recommended usage.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
// Recommended
await agent.aiScroll('The form panel', {
  scrollType: 'singleAction',
  direction: 'up',
  distance: 100,
});

// Backward compatible (not recommended)
await agent.aiScroll(
  { scrollType: 'singleAction', direction: 'up', distance: 100 },
  'The form panel',
);
```

:::note Signature Update

We recently updated the `aiScroll` API signature to put the locate prompt as the first parameter, making the parameter order more intuitive. The legacy signature `aiScroll(scrollParam, locate, options)` is still fully compatible, but new code should use the recommended signature.

:::

### `agent.aiPinch()`

Perform a two-finger pinch gesture to zoom in or zoom out. Supported on Android, iOS, and Web (Chromium-based browsers).

- Type

```typescript
function aiPinch(
  locate: string | Object | undefined,
  opt: {
    direction: 'in' | 'out';
    distance?: number;
    duration?: number;
    deepLocate?: boolean;
    xpath?: string;
    cacheable?: boolean;
  },
): Promise<void>;
```

- Parameters:

  - `locate: string | Object | undefined` - A natural language description of the element to pinch on, or [prompting with images](#prompting-with-images). If not provided, pinch will be performed at the center of the screen.
  - `opt: Object` - Configuration object containing:
    - `direction: 'in' | 'out'` - **Required.** `"in"` = pinch fingers together (zoom out), `"out"` = spread fingers apart (zoom in).
    - `distance?: number` - How far each finger moves in pixels. Defaults to a quarter of the shorter screen dimension.
    - `duration?: number` - Duration of the pinch gesture in milliseconds. Defaults to `500`.
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). False by default.
    - `xpath?: string` - The xpath of the element to operate. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
// Zoom in on the map (spread fingers apart)
await agent.aiPinch('the map area', { direction: 'out', distance: 200 });

// Zoom out at screen center (pinch fingers together)
await agent.aiPinch(undefined, { direction: 'in' });

// Zoom in with custom duration
await agent.aiPinch('the image', { direction: 'out', distance: 300, duration: 1000 });
```

:::info Platform Support

- **Android** &mdash; Implemented via [YADB](https://github.com/ysbing/YADB) `-pinch` command.
- **iOS** &mdash; Implemented via W3C Actions API with dual touch pointers.
- **Web** &mdash; Implemented via CDP touch events. For Puppeteer/Playwright, requires `enableTouchEventsInActionSpace: true`. Playwright only supports Chromium-based browsers.
- **HarmonyOS** &mdash; Not supported. The `uitest` framework does not provide multi-touch APIs.

:::

### `agent.aiLongPress()`

Long-press (or click-and-hold) an element. Useful for opening context menus, selecting items, or triggering long-press gestures.

- Type

```typescript
function aiLongPress(
  locate: string | Object,
  opt?: {
    duration?: number;
    deepLocate?: boolean;
    xpath?: string;
    cacheable?: boolean;
  },
): Promise<void>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the element to long-press on, or [prompting with images](#prompting-with-images).
  - `opt?: Object` - Optional, a configuration object containing:
    - `duration?: number` - How long the press is held, in milliseconds. When omitted, each platform applies its own default (Android `2000`, iOS `1000`, Web `500`).
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). False by default.
    - `xpath?: string` - The xpath of the element to operate. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
// Long-press an article to open the context menu
await agent.aiLongPress('the first article on the homepage');

// Long-press with a custom duration
await agent.aiLongPress('the message bubble', { duration: 2000 });
```

:::info Platform Support

- **Android**, **iOS**, **HarmonyOS**, **Web** (Chromium-based browsers via touch events). On HarmonyOS the `duration` option is ignored because the underlying `uitest` API does not expose a custom hold time.

:::

### `agent.aiDoubleClick()`

Double-click on an element.

- Type

```typescript
function aiDoubleClick(locate: string | Object, options?: Object): Promise<void>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the element to double-click on, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
await agent.aiDoubleClick('The file name at the top of the page');

// Use deepLocate feature to precisely locate the element
await agent.aiDoubleClick('The file name at the top of the page', {
  deepLocate: true,
});
```

### `agent.aiRightClick()`

> Only available in web pages, not available in Android.

Right-click on an element. Please note that Midscene cannot interact with the native context menu in browser after right-clicking. This interface is usually used for the element that listens to the right-click event by itself.

- Type

```typescript
function aiRightClick(locate: string, options?: Object): Promise<void>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the element to right-click on, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
await agent.aiRightClick('The file name at the top of the page');

// Use deepLocate feature to precisely locate the element
await agent.aiRightClick('The file name at the top of the page', {
  deepLocate: true,
});
```

## Data extraction

### `agent.aiAsk()`

Ask the AI model any question about the current page. It returns the answer in string from the AI model.

`aiAsk()` is fully equivalent to `aiString()`.

- Type

```typescript
function aiAsk(prompt: string | Object, options?: Object): Promise<string>;
```

- Parameters:

  - `prompt: string | Object` - A natural language description of the question, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `domIncluded?: boolean | 'visible-only'` - Whether to send simplified DOM information to the model, usually used for extracting invisible attributes like image links. If set to `'visible-only'`, only the visible elements will be sent. False by default.
    - `screenshotIncluded?: boolean` - Whether to send screenshot to the model. True by default.

- Return Value:

  - Return a Promise. Return the answer from the AI model.

- Examples:

```typescript
const result = await agent.aiAsk('What should I do to test this page?');
console.log(result); // Output the answer from the AI model
```

Besides `aiAsk`, you can also use `aiQuery` to extract structured data from the UI.

### `agent.aiQuery()`

This method allows you to extract structured data from current page. Simply define the expected format (e.g., string, number, JSON, or an array) in the `dataDemand`, and Midscene will return a result that matches the format.

- Type

```typescript
function aiQuery<T>(dataDemand: string | Object, options?: Object): Promise<T>;
```

- Parameters:

  - `dataDemand: T`: A description of the expected data and its return format.
  - `options?: Object` - Optional, a configuration object containing:
    - `domIncluded?: boolean | 'visible-only'` - Whether to send simplified DOM information to the model, usually used for extracting invisible attributes like image links. If set to `'visible-only'`, only the visible elements will be sent. False by default.
    - `screenshotIncluded?: boolean` - Whether to send screenshot to the model. True by default.

- Return Value:

  - Returns any valid basic type, such as string, number, JSON, array, etc.
  - Just describe the format in `dataDemand`, and Midscene will return a matching result.

- Examples:

```typescript
const dataA = await agent.aiQuery({
  time: 'The date and time displayed in the top-left corner as a string',
  userInfo: 'User information in the format {name: string}',
  tableFields: 'An array of table field names, string[]',
  tableDataRecord:
    'Table records in the format {id: string, [fieldName]: string}[]',
});

// You can also describe the expected return format using a string:

// dataB will be an array of strings
const dataB = await agent.aiQuery('string[], list of task names');

// dataC will be an array of objects
const dataC = await agent.aiQuery(
  '{name: string, age: string}[], table data records',
);

// Use domIncluded feature to extract invisible attributes
const dataD = await agent.aiQuery(
  '{name: string, age: string, avatarUrl: string}[], table data records',
  { domIncluded: true },
);
```

### `agent.aiBoolean()`

Extract a boolean value from the UI.

- Type

```typescript
function aiBoolean(prompt: string | Object, options?: Object): Promise<boolean>;
```

- Parameters:
  - `prompt: string | Object` - A natural language description of the expected value, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `domIncluded?: boolean | 'visible-only'` - Whether to send simplified DOM information to the model, usually used for extracting invisible attributes like image links. If set to `'visible-only'`, only the visible elements will be sent. False by default.
    - `screenshotIncluded?: boolean` - Whether to send screenshot to the model. True by default.
- Return Value:

  - Returns a `Promise<boolean>` when AI returns a boolean value.

- Examples:

```typescript
const boolA = await agent.aiBoolean('Whether there is a login dialog');

// Use domIncluded feature to extract invisible attributes
const boolB = await agent.aiBoolean('Whether the login button has a link', {
  domIncluded: true,
});
```

### `agent.aiNumber()`

Extract a number value from the UI.

- Type

```typescript
function aiNumber(prompt: string | Object, options?: Object): Promise<number>;
```

- Parameters:
  - `prompt: string | Object` - A natural language description of the expected value, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `domIncluded?: boolean | 'visible-only'` - Whether to send simplified DOM information to the model, usually used for extracting invisible attributes like image links. If set to `'visible-only'`, only the visible elements will be sent. False by default.
    - `screenshotIncluded?: boolean` - Whether to send screenshot to the model. True by default.
- Return Value:

  - Returns a `Promise<number>` when AI returns a number value.

- Examples:

```typescript
const numberA = await agent.aiNumber('The remaining points of the account');

// Use domIncluded feature to extract invisible attributes
const numberB = await agent.aiNumber(
  'The value of the remaining points element',
  { domIncluded: true },
);
```

### `agent.aiString()`

Extract a string value from the UI.

`aiString()` is fully equivalent to `aiAsk()`.

- Type

```typescript
function aiString(prompt: string | Object, options?: Object): Promise<string>;
```

- Parameters:
  - `prompt: string | Object` - A natural language description of the expected value, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `domIncluded?: boolean | 'visible-only'` - Whether to send simplified DOM information to the model, usually used for extracting invisible attributes like image links. If set to `'visible-only'`, only the visible elements will be sent. False by default.
    - `screenshotIncluded?: boolean` - Whether to send screenshot to the model. True by default.
- Return Value:

  - Returns a `Promise<string>` when AI returns a string value.

- Examples:

```typescript
const stringA = await agent.aiString('The first item in the list');

// Use domIncluded feature to extract invisible attributes
const stringB = await agent.aiString('The link of the first item in the list', {
  domIncluded: true,
});
```

## More APIs

### `agent.aiAssert()`

Specify an assertion in natural language, and the AI determines whether the condition is true. If the assertion fails, the SDK throws an error that includes both the optional `errorMsg` and a detailed reason generated by the AI.

- Type

```typescript
function aiAssert(
  assertion: string | Object, 
  errorMsg?: string, 
  options?: Object
): Promise<void>;
```

- Parameters:

  - `assertion: string | Object` - The assertion described in natural language, or [prompting with images](#prompting-with-images).
  - `errorMsg?: string` - An optional error message to append if the assertion fails.
  - `options?: Object` - Optional, a configuration object containing:
    - `domIncluded?: boolean | 'visible-only'` - Whether to send simplified DOM information to the model, usually used for extracting invisible attributes like image links. If set to `'visible-only'`, only the visible elements will be sent. False by default.
    - `screenshotIncluded?: boolean` - Whether to send screenshot to the model. True by default.

- Return Value:

  - Returns a Promise that resolves to void if the assertion passes; if it fails, an error is thrown with `errorMsg` and additional AI-provided information.

- Example:

```typescript
await agent.aiAssert('The price of "Sauce Labs Onesie" is 7.99');
```

:::tip

Assertions are critical in test scripts. To reduce the risk of errors due to AI hallucination (e.g., missing an error), you can also combine `.aiQuery` with standard JavaScript assertions instead of using `.aiAssert`.

For example, you might replace the above code with:

```typescript
const items = await agent.aiQuery(
  '{name: string, price: number}[], return product names and prices',
);
const onesieItem = items.find((item) => item.name === 'Sauce Labs Onesie');
expect(onesieItem).toBeTruthy();
expect(onesieItem.price).toBe(7.99);
```

:::

### `agent.startObserving()`

Observe the screen over an explicit time window so a later assertion can judge everything that happened while other agent calls ran — including transient UI (toasts, banners, screen transitions) that a single screenshot would miss.

```typescript
function startObserving(options?: {
  intervalMs?: number;  // sampling interval, default 1000ms, min 200ms (5fps)
  maxFrames?: number;   // frame-buffer cap, default 30 (self-thinning when full)
  watchdogMs?: number;  // auto-stop after this many ms if stop() is never called. Default 300000 (5 min). Set 0 to disable.
}): Promise<UIObserver>;
```

The returned `UIObserver` provides:

- `observer.stop(): Promise<void>` - Stop sampling and capture the final representative screenshot. Must be called before asserting.
- `observer.aiAssert(assertion: string, msg?: string, opt?: Object): Promise<void>` - Assert against the observed window. All buffered frames (plus the representative) are sent to the model, and the assertion text determines whether the model should look for something that appeared at any point, the final state, or an ordered change.
- `observer.aiBoolean(prompt: string, opt?: Object): Promise<boolean>` - Boolean query over the observed window.
- `observer.frameCount: number` - Number of frames currently buffered.

```typescript
const observer = await agent.startObserving();
await agent.aiAct('submit the form');
await observer.stop();
await observer.aiAssert('a success toast appeared during the process');
```

How it works and what it costs:

- Frames come from the device's continuous frame source when available — scrcpy on Android (`scrcpyConfig.enabled`), WDA MJPEG on iOS (`wdaMjpegFrameSource.enabled`), CDP screencast on web (always available) — and fall back to plain screenshots per tick otherwise (much lower effective frame rate on mobile).
- Sampling grabs cheap frame handles; any decode cost is paid once at assert time, only for the frames actually sent to the model.
- All buffered frames (up to `maxFrames`, plus the final representative screenshot) are sent to the model so transient UI in long windows is not missed. To bound token cost, increase `intervalMs` (lower frame density) or decrease `maxFrames` (smaller buffer). The observed frames are shown in the report timeline with an `Observed` tag.
- On iOS the observed frames come from the MJPEG stream (scaled, lower quality) while the final representative frame is a full-quality screenshot.

### `agent.aiLocate()`

Locate an element using natural language.

- Type

```typescript
function aiLocate(
  locate: string | Object,
  options?: Object,
): Promise<{
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  center: [number, number];
  dpr: number; // device pixel ratio
}>;
```

- Parameters:

  - `locate: string | Object` - A natural language description of the element to locate, or [prompting with images](#prompting-with-images).
  - `options?: Object` - Optional, a configuration object containing:
    - `deepLocate?: boolean` - Whether to enable [Deep Locate](#deep-locate-deeplocate). Previously named `deepThink`, now renamed to `deepLocate`. False by default.
    - `xpath?: string` - The xpath of the element to operate. If provided, Midscene will first use this xpath to locate the element before using the cache and the AI model. Empty by default.
    - `cacheable?: boolean` - Whether cacheable when enabling [caching feature](./caching.mdx). True by default.

- Return Value:

  - Returns a `Promise` when the element is located parsed as an locate info object.
  - `rect` usually represents the matched element boundary.
  - Some models only support point grounding rather than boundary grounding. In those cases, such as AutoGLM, `rect` will be a small `8x8` box containing the element center instead of the true element boundary.
  - Because `rect` can vary significantly depending on model capability, it is not recommended to rely too heavily on this field for strict boundary semantics.
  - If you need a stable click target, prefer the `center` field.

- Examples:

```typescript
const locateInfo = await agent.aiLocate(
  'The login button at the top of the page',
);
console.log(locateInfo);
```

### `agent.aiWaitFor()`

Wait until a specified condition, described in natural language, becomes true. Considering the cost of AI calls, the check interval will not exceed the specified `checkIntervalMs`.

- Type

```typescript
function aiWaitFor(
  assertion: string,
  options?: {
    timeoutMs?: number;
    checkIntervalMs?: number;
  },
): Promise<void>;
```

- Parameters:

  - `assertion: string` - The condition described in natural language.
  - `options?: object` - An optional configuration object containing:
    - `timeoutMs?: number` - Maximum window in milliseconds for starting a new check (default: 15000). If the previous evaluation began before this window closes, Midscene keeps checking; otherwise it stops with a timeout.
    - `checkIntervalMs?: number` - Interval for checking in milliseconds (default: 3000).

- Return Value:

  - Returns a Promise that resolves to void if the condition is met; if not, an error is thrown when the timeout is reached.

- Examples:

```typescript
// Basic usage
await agent.aiWaitFor(
  'There is at least one headphone information displayed on the interface',
);

// Using custom options
await agent.aiWaitFor('The shopping cart icon shows a quantity of 2', {
  timeoutMs: 30000, // Wait for 30 seconds
  checkIntervalMs: 5000, // Check every 5 seconds
});
```

:::tip

Given the time consumption of AI services, `.aiWaitFor` might not be the most efficient method. Sometimes, using a simple sleep function may be a better alternative.

:::

### `agent.runYaml()`

Execute an automation script written in YAML. Only the `tasks` part of the script is parsed and executed, and it returns the results of all `.aiQuery` calls within the script.

- Type

```typescript
function runYaml(yamlScriptContent: string): Promise<{ result: any }>;
```

- Parameters:

  - `yamlScriptContent: string` - The YAML-formatted script content.

- Return Value:

  - Returns an object with a `result` property that includes the results of all `.aiQuery` calls.

- Example:

```typescript
const { result } = await agent.runYaml(`
tasks:
  - name: search weather
    flow:
      - ai: input 'weather today' in input box, click search button
      - sleep: 3000

  - name: query weather
    flow:
      - aiQuery: "the result shows the weather info, {description: string}"
`);
console.log(result);
```

:::tip

For more information about YAML scripts, please refer to [Automate with Scripts in YAML](./automate-with-scripts-in-yaml).

:::

### `agent.runGherkinScenario()`

Run one Gherkin Scenario and map its steps to Midscene Agent calls.

:::caution Beta

This API is available starting in Midscene 1.10 and is still in Beta. The API may change in future releases.

:::

- Type

```typescript
function runGherkinScenario(
  scenarioText: string,
  options?: {
    context?: string;
    abortSignal?: AbortSignal;
    deepThink?: 'unset' | true | false;
    deepLocate?: boolean;
  },
): Promise<void>;
```

- Parameters:

  - `scenarioText: string` - One Gherkin scenario, or a list of Gherkin steps without the `Scenario:` header.
  - `options?: Object` - Optional runtime options.
    - `context?: string` - Temporary context for this run.
    - `abortSignal?: AbortSignal` - An optional signal for aborting the run.
    - `deepThink?: 'unset' | true | false` - Passed to `aiAct` for `Given` and `When` steps.
    - `deepLocate?: boolean` - Passed to `aiAct` for `Given` and `When` steps.

- Returns:

  - `Promise<void>` - Resolves after all steps finish. If a step fails, the error message includes the Gherkin line, the original step, and the Midscene semantic action being executed.

- Example:

```typescript
await agent.runGherkinScenario(`
Scenario: Add a todo item
  Given the todo page is open
  When I add a todo item named "Buy milk"
  Then the todo list should contain "Buy milk"
`);
```

For supported rules, limitations, cache behavior, and YAML usage, see [BDD-style scripts with Gherkin](./advanced/bdd-style-scripts-with-gherkin).

### `agent.setAIActContext()`

Set the background knowledge that should be sent to the AI model when calling `agent.aiAct()` or `agent.ai()`. This will override the previous setting.

For instant action type APIs, like `aiTap()`, this setting will not take effect.

- Type

```typescript
function setAIActContext(aiActContext: string): void;
```

- Parameters:

  - `aiActContext: string` - The background knowledge that should be sent to the AI model. The deprecated `aiActionContext` name is still accepted.

- Example:

```typescript
await agent.setAIActContext('Close the cookie consent dialog first if it exists');
```

:::note

`agent.setAIActionContext()` is deprecated. Please use `agent.setAIActContext()` instead. The deprecated method remains as an alias for compatibility.

:::

### `agent.evaluateJavaScript()`

> Only available in web pages, not available in Android.

Evaluate a JavaScript expression in the web page context.

- Type

```typescript
function evaluateJavaScript(script: string): Promise<any>;
```

- Parameters:

  - `script: string` - The JavaScript expression to evaluate.

- Return Value:

  - Returns the result of the JavaScript expression.

- Example:

```typescript
const result = await agent.evaluateJavaScript('document.title');
console.log(result);
```

### `agent.recordToReport()`

Log the current screenshot with a description in the report file by default, or
record screenshots provided by the caller.

- Type

```typescript
interface RecordToReportOptions {
  content?: string;
  /** @deprecated Use screenshots instead. */
  screenshotBase64?: string;
  screenshots?: {
    /**
     * PNG/JPEG data URI, or raw PNG base64 body.
     */
    base64: string;
    description?: string;
  }[];
}

function recordToReport(
  title?: string,
  options?: RecordToReportOptions,
): Promise<void>;
```

- Parameters:

  - `title?: string` - Optional, the title of the screenshot, if not provided, the title will be 'untitled'.
  - `options?: RecordToReportOptions` - Optional, a configuration object containing:
    - `content?: string` - The description of the screenshot.
    - `screenshots?: Array<{ base64: string; description?: string }>` - Record one or more provided screenshots under one report entry. When this option is set, Midscene will not capture another screenshot automatically. `base64` should be a PNG/JPEG data URI such as `data:image/png;base64,...`; a raw base64 body is also accepted and treated as PNG.

- Compatibility:

  `screenshotBase64?: string` is still accepted as a backward-compatible
  single-screenshot override. Prefer `screenshots: [{ base64 }]` for new code.
  Provide only one of `screenshots` or `screenshotBase64`.

- Return Value:

  - Returns a `Promise<void>`

- Examples:

```typescript
await agent.recordToReport('Login page', {
  content: 'User A',
});

const before = await page.screenshot({ encoding: 'base64' });
const after = await page.screenshot({ encoding: 'base64' });
await agent.recordToReport('Checkout comparison', {
  content: 'Compare the state before and after submit.',
  screenshots: [
    {
      base64: `data:image/png;base64,${before}`,
      description: 'Before submit',
    },
    {
      base64: `data:image/png;base64,${after}`,
      description: 'After submit',
    },
  ],
});
```

### `agent.freezePageContext()`

Freeze the current page context, allowing all subsequent operations to reuse the same page snapshot without retrieving the page state repeatedly. This significantly improves performance when executing a large number of concurrent operations. 

Some notes:
* Usually, you do not need to use this method, unless you are certain that "context retrieval" is the bottleneck of your test script.
* You need to call `agent.unfreezePageContext()` in time to restore the real-time page state.
* Do not call this method in interaction operations, it will make the AI model unable to perceive the latest page state, causing confusing errors.

- Type

```typescript
function freezePageContext(): Promise<void>;
```

- Return Value:

  - `Promise<void>`

- Examples:

```typescript
// Freeze the page context
await agent.freezePageContext();

// Some queries...
const results = await Promise.all([
  await agent.aiQuery('Username input box value'),
  await agent.aiQuery('Password input box value'),
  await agent.aiLocate('Login button'),
]);
console.log(results);

// Unfreeze the page context, subsequent operations will use real-time page state
await agent.unfreezePageContext();
```

:::tip

In the report, operations using frozen context will display a 🧊 icon in the Insight tab.

:::

### `agent.unfreezePageContext()`

Unfreezes the page context, restoring the use of real-time page state.

- Type

```typescript
function unfreezePageContext(): Promise<void>;
```

- Return Value:

  - `Promise<void>`

### `agent._unstableLogContent()`

Retrieve the log content from the report file. The structure of the log object may change in future versions.

- Type

```typescript
function _unstableLogContent(): Object;
```

- Return Value:

  - Returns an object that contains the log content.

- Examples:

```typescript
const logContent = agent._unstableLogContent();
console.log(logContent);
```

## LLM usage metrics

Midscene records the token usage of every LLM call. You can read the aggregated
totals from the agent at runtime, which is useful for cost observability with
tools like Langfuse.

### `agent.metrics`

A getter that returns a snapshot of the LLM usage accumulated by the agent since
it was created.

- Type

```typescript
interface UsageBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

interface MidsceneUsageMetrics {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCachedInput: number;
  totalTimeCostMs: number;
  calls: number;
  // Breakdown by call intent: `planning`, `insight`, `default`.
  byIntent: Record<string, UsageBucket>;
  // Breakdown by model name.
  byModel: Record<string, UsageBucket>;
}
```

- Example

```typescript
await agent.aiAct('search for headphones');
const usage = agent.metrics;
console.log(usage.totalTokens, usage.byIntent, usage.byModel);
```

### `onLLMUsage` option

For real-time tracking, pass an `onLLMUsage` callback when constructing the
agent. It is invoked once per LLM call as soon as the usage is available, with
the raw usage info (token counts, model name, intent, request id, etc.).

```typescript
const agent = new PuppeteerAgent(page, {
  onLLMUsage: (usage) => {
    langfuse.event({ name: usage.intent, value: usage.total_tokens });
  },
});
```

## Deep Locate (deepLocate)

`deepLocate` is an optional parameter available on all APIs that require element location (`aiAct`, `aiTap`, `aiHover`, `aiInput`, `aiKeyboardPress`, `aiScroll`, `aiDoubleClick`, `aiRightClick`, `aiLocate`, etc.).

When enabled, Midscene will call the AI model twice to precisely locate the element, which can improve accuracy. This is especially useful when the target element is small or hard to distinguish from its surroundings. For newer models (e.g. Qwen3.x / Doubao 2.0 / Gemini 3.5), the gain is less noticeable in most cases, so enable it only when needed.

- **Default**: `false`

```typescript
// Enable deepLocate to precisely locate hard-to-identify elements
await agent.aiTap('Shopping cart icon in the top right', { deepLocate: true });
```

:::note

Historically, the name `deepThink` has carried two different meanings across APIs:

- In `aiAct()`, `deepThink` has always meant **planning mode**, guiding task decomposition and planning-focused reasoning. See [aiAct deepThink documentation](./model-strategy#about-the-deepthink-option-in-aiact) for details.
- In single-step action methods such as `aiTap` and `aiHover`, the old `deepThink` meant **enhanced element location**, equivalent to today's `deepLocate`.

To separate these two meanings, `deepThink` has been reserved for planning mode since v1.5.1, while enhanced element location is consistently named `deepLocate`.

- For `aiAct()`, you can use both `deepThink` and `deepLocate`: `deepThink` controls planning mode, while `deepLocate` controls the Deep Locate behavior described in this section.
- For single-step action methods such as `aiTap` and `aiHover`, use the clearer `deepLocate` parameter when you need to improve location precision. The old `deepThink` parameter remains compatible and is equivalent to `deepLocate`.

:::

## Prompting with images

You can use images as supplements in the prompt to describe things that cannot be expressed in natural language.

When prompting with images, the format of the prompt parameters is as follows:

```javascript
{
  // Prompt text, in which images can be referred
  prompt: string,
  // The images referred in the prompt text
  images?: {
    // Image name, corresponding to the names referred in the prompt text
    name: string,
    // Image url, can be a local image path, Base64 string, or http link
    url: string
  }[]
  // When convertHttpImage2Base64 is true, the image links in the http format will be converted into Base64 encoding and sent to the LLM.
  // Which is applicable when the image links are not publicly accessible.
  convertHttpImage2Base64?: boolean
}
```

- Example 1: use images to inspect the tap position.

```javascript
await agent.aiTap({
  prompt: 'The specific logo',
  images: [
    {
      name: 'The specific logo',
      url: 'https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png',
    },
  ],
});
```

- Example 2: use images to assert the page content.

```javascript
await agent.aiAssert({
  prompt: 'Whether there is a specific logo on the page.',
  images: [
    {
      name: 'The specific logo',
      url: 'https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png',
    },
  ],
});
```

**Notes on Image Size**

When prompting with images, it is necessary to pay attention to the requirements of the AI model provider regarding the size and dimensions of the images. Images that are too large (such as exceeding 10M) or too small (such as being less than 10 pixels) may cause errors when the model is invoked. The specific restrictions should be based on the documentation provided by the AI model provider you are using.

## Properties

### `.reportFile`

The path to the report file.


## Report Merging Tool

When running multiple automation workflows, each agent generates its own report file. The `ReportMergingTool` can merge multiple automation reports into a single report for unified viewing and management.

### Use cases

- Running multiple workflows in a suite and need one consolidated report
- Cross-platform automation (for example, Web and Android) that needs a unified result
- CI/CD pipelines that require a summarized automation report

### `new ReportMergingTool()`

Create a report merging tool instance.

- Example:

```typescript
import { ReportMergingTool } from '@midscene/core/report';

const reportMergingTool = new ReportMergingTool();
```

### `.append()`

Add an automation report to the list to be merged, typically right after each workflow finishes.

- Type

```typescript
function append(reportInfo: ReportFileWithAttributes): void;
```

- Parameters:

  - `reportInfo: ReportFileWithAttributes` - Report information object containing:
    - `reportFilePath: string` - Path to the report file, usually `agent.reportFile`
    - `reportAttributes: object` - Report attributes
      - `testId: string` - Unique identifier for the automation workflow
      - `testTitle: string` - Automation workflow title
      - `testDescription: string` - Automation workflow description
      - `testDuration: number` - Automation execution duration (in milliseconds)
      - `testStatus: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'` - Automation status

- Return Value:

  - `void`

- Example:

```typescript
// Add a report in your test hooks
afterEach((ctx) => {
  let workflowStatus = 'passed';
  if (ctx.task.result?.state === 'fail') {
    workflowStatus = 'failed';
  }

  reportMergingTool.append({
    reportFilePath: agent.reportFile as string,
    reportAttributes: {
      testId: ctx.task.name,
      testTitle: ctx.task.name,
      testDescription: 'Automation workflow description',
      testDuration: Date.now() - startTime,
      testStatus: workflowStatus,
    },
  });
});
```

### `.mergeReports()`

Merge all added reports into a single HTML file.

- Type

```typescript
function mergeReports(
  reportFileName?: 'AUTO' | string,
  opts?: {
    rmOriginalReports?: boolean;
    overwrite?: boolean;
  },
): string | null;
```

- Parameters:

  - `reportFileName?: 'AUTO' | string` - Name of the merged report file
    - Defaults to `'AUTO'`, which will generate a file name automatically
    - You can also provide a custom name (no `.html` suffix needed)
  - `opts?: object` - Optional configuration object
    - `rmOriginalReports?: boolean` - Whether to delete the original report files after merging (default: `false`)
    - `overwrite?: boolean` - Whether to overwrite when the target file already exists (default: `false`)

- Return Value:

  - Returns the merged report file path when successful
  - Returns `null` if no reports have been added

- Examples:

```typescript
// Basic usage with an auto-generated file name
afterAll(() => {
  reportMergingTool.mergeReports();
});

// Specify a custom file name
afterAll(() => {
  reportMergingTool.mergeReports('my-automation-report');
});

// Merge and delete the original reports
afterAll(() => {
  reportMergingTool.mergeReports('my-automation-report', {
    rmOriginalReports: true,
  });
});

// Overwrite an existing report file
afterAll(() => {
  reportMergingTool.mergeReports('my-automation-report', {
    overwrite: true,
  });
});
```

### `.clear()`

Clear the list of reports to be merged. Use this if you need to reuse the same instance for multiple merge operations.

- Type

```typescript
function clear(): void;
```

- Return Value:

  - `void`

- Example:

```typescript
reportMergingTool.mergeReports('first-batch');
reportMergingTool.clear(); // Clear the list
// Continue adding new reports...
```

### Full example

Below is a complete example of using `ReportMergingTool` in a Vitest suite:

```typescript
import { describe, it, beforeEach, afterEach, afterAll } from 'vitest';
import { AndroidAgent, AndroidDevice } from '@midscene/android';
import { ReportMergingTool } from '@midscene/core/report';

describe('Android settings automation', () => {
  let device: AndroidDevice;
  let agent: AndroidAgent;
  let startTime: number;
  const reportMergingTool = new ReportMergingTool();

  beforeEach((ctx) => {
    startTime = performance.now();
    agent = new AndroidAgent(device, {
      groupName: ctx.task.name,
    });
  });

  afterEach((ctx) => {
    let workflowStatus = 'passed';
    if (ctx.task.result?.state === 'pass') {
      workflowStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      workflowStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0]?.message.includes('timed out')) {
      workflowStatus = 'timedOut';
    } else {
      workflowStatus = 'failed';
    }

    // Add the report to the merge list
    reportMergingTool.append({
      reportFilePath: agent.reportFile as string,
      reportAttributes: {
        testId: ctx.task.name,
        testTitle: ctx.task.name,
        testDescription: 'Automation workflow description',
        testDuration: (Date.now() - ctx.task.result?.startTime!) | 0,
        testStatus: workflowStatus,
      },
    });
  });

  afterAll(() => {
    // Merge all automation reports
    reportMergingTool.mergeReports('android-settings-automation-report');
  });

  it('toggle WLAN', async () => {
    await agent.aiAct('Find and open WLAN settings');
    await agent.aiAct('Toggle WLAN once');
  });

  it('toggle Bluetooth', async () => {
    await agent.aiAct('Find and open Bluetooth settings');
    await agent.aiAct('Toggle Bluetooth once');
  });
});
```

:::tip

The merged report is saved under the `midscene_run/report` directory. Open the generated HTML file in your browser to review the workflows.

:::

<!-- END OFFICIAL PAGE 6: api.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 7: automate-with-scripts-in-yaml.mdx -->

## Source page: `automate-with-scripts-in-yaml.mdx`

import SetupEnv from './common/setup-env.mdx';

# Automate with scripts in YAML

In most cases, developers write automation scripts just to perform some smoke tests, like checking for the appearance of certain content or verifying that a key user path is accessible. In such situations, maintaining a large test project is unnecessary.

Midscene offers a way to perform automation using `.yaml` files, which helps you focus on the script itself rather than the testing framework. This allows any team member to write automation scripts without needing to learn any API.

Here is an example. By reading its content, you should be able to understand how it works.

```yaml
web:
  url: https://www.bing.com

tasks:
  - name: Search for weather
    flow:
      - ai: Search for "today's weather"
      - sleep: 3000

  - name: Check results
    flow:
      - aiAssert: The results show weather information
```

:::info Sample Project

You can find a sample project that uses YAML scripts for automation here:

- [Web](https://github.com/web-infra-dev/midscene-example/tree/main/yaml-scripts-demo)
- [Android](https://github.com/web-infra-dev/midscene-example/tree/main/android/yaml-scripts-demo)
- [Computer (Mac/Windows/Linux)](https://github.com/web-infra-dev/midscene-example/tree/main/computer/yaml-scripts-demo)

:::

<SetupEnv />

To execute YAML workflows from the command line, install the Midscene CLI. See [YAML script runner](./yaml-script-runner) for installation guidance, `.env` usage, and details on the `midscene` runner.

## Script file structure

Script files use YAML format to describe automation tasks. It defines the target to be manipulated (like a webpage or an Android app) and the series of steps to perform.

A standard `.yaml` script file includes a `web`, `android`, `ios`, `harmony`, or `computer` section to configure the environment, an optional `agent` section to configure AI agent behavior, and a `tasks` section to define the automation tasks.

```yaml
web:
  url: https://www.bing.com

# The tasks section defines the series of steps to be executed
tasks:
  - name: Search for weather
    flow:
      - ai: Search for "today's weather"
      - sleep: 3000
      - aiAssert: The results show weather information
```


### The `agent` part

The `agent` section configures AI agent behavior and test report options. All fields are optional.

```yaml
# AI agent configuration
agent:
  # Test identifier, used for reporting and cache identification, optional
  testId: <string>

  # Report group name, optional
  groupName: <string>

  # Report group description, optional
  groupDescription: <string>

  # Whether to generate test reports, optional, defaults to true
  generateReport: <boolean>

  # Whether to automatically print report messages, optional, defaults to true
  autoPrintReportMsg: <boolean>

  # Custom report file name, optional
  reportFileName: <string>

  # Maximum AI replanning cycle limit, optional, defaults to 20 (40 for UI-TARS model)
  replanningCycleLimit: <number>

  # Background knowledge to send to the AI model when calling aiAct, optional
  aiActContext: <string>
  # Legacy alias (aiActionContext) remains for backward compatibility, but avoid using it in new scripts

  # Cache configuration, optional
  cache:
    # Cache strategy, optional, values: 'read-only' | 'read-write' | 'write-only'
    strategy: <string>
    # Cache ID, required
    id: <string>
```

:::tip Agent Configuration Notes

- **Applicable environments**: Web, iOS, and Android environments all support `agent` configuration
- **testId priority**: CLI parameter > YAML agent.testId > filename
- **aiActContext**: Provides background knowledge to the AI model, like how to handle popups, business introduction, etc. A legacy alias remains for backward compatibility (see inline comment) but should not be used in new scripts.
- **Cache configuration**: For detailed usage, refer to the [Caching documentation](./caching.mdx)

:::

#### Usage example

```yaml
# agent configuration, applies to all environments
agent:
  testId: "checkout-test"
  groupName: "E2E Test Suite"
  groupDescription: "Complete checkout flow testing"
  generateReport: true
  autoPrintReportMsg: false
  reportFileName: "checkout-report"
  replanningCycleLimit: 30
  aiActContext: "If any popup appears, click agree. If login page appears, skip it."
  cache:
    id: "checkout-cache"
    strategy: "read-write"

# iOS environment configuration
ios:
  launch: https://www.bing.com
  wdaPort: 8100

# Or Android environment configuration
android:
  deviceId: s4ey59
  launch: https://www.bing.com

tasks:
  - name: Search for weather
    flow:
      - ai: Search for "today's weather"
      - aiAssert: The results show weather information
```


### The `web` part

```yaml
web:
  # The URL to visit, required. If `serve` is provided, provide the relative path.
  url: <url>

  # Serve a local path as a static server, optional.
  serve: <root-directory>

  # The browser user agent, optional.
  userAgent: <ua>

  # The browser viewport width, optional, defaults to 1440.
  viewportWidth: <width>

  # The browser viewport height, optional, defaults to 800.
  viewportHeight: <height>

  # The browser's device pixel ratio, optional, defaults to the system's value.
  deviceScaleFactor: <scale>

  # Path to a JSON format browser cookie file, optional.
  cookie: <path-to-cookie-file>

  # Chrome download directory (Puppeteer only), optional.
  # Relative paths are resolved from the current working directory.
  # Not supported in bridge mode.
  downloadPath: <path-to-download-directory>

  # Extra HTTP headers sent with every request (Puppeteer only), optional.
  # Useful when the server validates custom request headers.
  # Values must be strings; quote values YAML would treat as a boolean or number, e.g. "true".
  extraHTTPHeaders:
    X-Custom-Token: my-token
    Accept-Language: en-US

  # The strategy for waiting for network idle in Puppeteer mode, optional.
  # `timeout` applies to the initial opening of `web.url` defined in YAML and to later actions such as `aiTap` and `aiInput`.
  # `continueOnNetworkIdleError` only applies to the initial opening of `web.url` defined in YAML.
  waitForNetworkIdle:
    # The timeout in milliseconds for each network idle wait, optional, defaults to 2000ms.
    timeout: <ms>
    # Whether to continue if the initial opening of `web.url` defined in YAML times out while waiting for network idle, optional, defaults to true.
    # Later action-time waits always continue even if they time out.
    continueOnNetworkIdleError: <boolean>

  # The path to the JSON file for outputting aiQuery/aiAssert results, optional.
  output: <path-to-output-file>

  # Whether to save log content to a JSON file, optional, defaults to `false`. If true, saves to `unstableLogContent.json`. If a string, saves to the specified path. The log content structure may change in the future.
  unstableLogContent: <boolean | path-to-unstable-log-file>

  # Whether to restrict page navigation to the current tab, optional, defaults to true.
  forceSameTabNavigation: <boolean>

  # CDP endpoint, optional. Connects to an existing browser instance via CDP instead of launching a new one.
  # Mutually exclusive with bridgeMode.
  cdpEndpoint: ws://localhost:9222/devtools/browser

  # The bridge mode, optional, defaults to false. Can be 'newTabWithUrl' or 'currentTab'. See below for more details.
  bridgeMode: false | 'newTabWithUrl' | 'currentTab'

  # Whether to close newly created tabs when the bridge disconnects, optional, defaults to false.
  closeNewTabsAfterDisconnect: <boolean>

  # Whether to ignore HTTPS certificate errors, optional, defaults to false.
  acceptInsecureCerts: <boolean>

  # Custom Chrome launch arguments (Puppeteer only, not supported in bridge mode), optional.
  # Use this to customize Chrome browser behavior, such as disabling third-party cookie blocking.
  # ⚠️ Security Warning: Some arguments (e.g., --no-sandbox, --disable-web-security) may reduce browser security.
  # Use only in controlled testing environments.
  chromeArgs:
    - '--disable-features=ThirdPartyCookiePhaseout'
    - '--disable-features=SameSiteByDefaultCookies'
    - '--window-size=1920,1080'
```

### The `android` part

```yaml
android:
  # The device ID, optional, defaults to the first connected device.
  deviceId: <device-id>

  # The launch URL, optional, defaults to the device's current page.
  launch: <url>

  # The path to the JSON file for outputting aiQuery/aiAssert results, optional.
  output: <path-to-output-file>

  # All other options supported by the AndroidDevice constructor
  # For example: androidAdbPath, remoteAdbHost, remoteAdbPort,
  # imeStrategy, displayId, autoDismissKeyboard, keyboardDismissStrategy,
  # keyboardTypeDelay, minScreenshotBufferSize, alwaysRefreshScreenInfo, etc.
  # See the AndroidDevice constructor documentation for the complete list
```

:::tip View Complete Android Configuration Options

YAML scripts now support all configuration options from the `AndroidDevice` constructor. For the complete list of options, please refer to [AndroidDevice Constructor in Android Integration Documentation](./android-getting-started#androiddevice-constructor).

:::

#### Android Platform-Specific Actions

**`runAdbShell` - Execute ADB Shell Commands**

Execute ADB shell commands on Android devices. Pass only the shell command itself, without the `adb shell` prefix. To set a command timeout, keep `timeout` as a shallow sibling of `runAdbShell`.

```yaml
android:
  deviceId: 'test-device'

tasks:
  - name: Clear app data
    flow:
      - runAdbShell: 'pm clear com.example.app'

  - name: Get battery info
    flow:
      - runAdbShell: 'dumpsys battery'

  - name: Tap screen coordinates
    flow:
      - runAdbShell: 'input tap 100 200'

  - name: Run command with timeout
    flow:
      - runAdbShell: 'dumpsys activity services'
        timeout: 60000
```

**Common ADB Shell Commands:**
- `pm clear <package>` - Clear app data
- `dumpsys battery` - Get battery information
- `dumpsys window` - Get window information
- `settings get secure android_id` - Get device ID
- `input tap <x> <y>` - Tap screen coordinates
- `input keyevent <keycode>` - Send key events

**`launch` - Launch App or URL**

Launch Android apps or open URLs.

```yaml
android:
  deviceId: 'test-device'

tasks:
  - name: Launch Settings app
    flow:
      - launch: com.android.settings

  - name: Open webpage
    flow:
      - launch: https://www.example.com
```

**`terminate` - Terminate App**

Terminate (force-stop) a running Android app by package name.

```yaml
android:
  deviceId: 'test-device'

tasks:
  - name: Terminate Settings app
    flow:
      - terminate: com.android.settings
```

### The `ios` part

```yaml
ios:
  # WebDriverAgent port, optional, defaults to 8100.
  wdaPort: <port>

  # WebDriverAgent host address, optional, defaults to localhost.
  wdaHost: <host>

  # Whether to auto dismiss keyboard, optional, defaults to false.
  autoDismissKeyboard: <boolean>

  # Launch URL or app bundle ID, optional, defaults to the device's current page.
  launch: <url-or-bundle-id>

  # The path to the JSON file for outputting aiQuery/aiAssert results, optional.
  output: <path-to-output-file>

  # Whether to save log content to a JSON file, optional, defaults to `false`. If true, saves to `unstableLogContent.json`. If a string, saves to the specified path. The log content structure may change in the future.
  unstableLogContent: <boolean | path-to-unstable-log-file>

  # All other options supported by the IOSDevice constructor
  # See the IOSDevice constructor documentation for the complete list
```

:::tip View Complete iOS Configuration Options

YAML scripts now support all configuration options from the `IOSDevice` constructor. For the complete list of options, please refer to [IOSDevice constructor in the iOS API reference](./ios-api-reference#iosdevice-constructor).

:::

#### iOS Platform-Specific Actions

**`runWdaRequest` - Execute WebDriverAgent API Requests**

Execute WebDriverAgent API requests directly on iOS devices.

```yaml
ios:
  launch: 'com.apple.mobilesafari'

tasks:
  - name: Press home button via WDA
    flow:
      - runWdaRequest:
          method: POST
          endpoint: /session/test/wda/pressButton
          data:
            name: home

  - name: Get device information
    flow:
      - runWdaRequest:
          method: GET
          endpoint: /wda/device/info
```

**Parameters:**
- `method` (string, required): HTTP method (GET, POST, DELETE, etc.)
- `endpoint` (string, required): WebDriverAgent API endpoint
- `data` (any, optional): Request body data

**Common WebDriverAgent Endpoints:**
- `/wda/screen` - Get screen information
- `/wda/device/info` - Get device information
- `/session/{sessionId}/wda/pressButton` - Press hardware buttons
- `/session/{sessionId}/wda/apps/launch` - Launch apps
- `/session/{sessionId}/wda/apps/terminate` - Terminate apps
- `/session/{sessionId}/wda/apps/activate` - Activate apps

**`launch` - Launch App or URL**

Launch iOS apps or open URLs.

```yaml
ios:
  wdaPort: 8100

tasks:
  - name: Launch Settings app
    flow:
      - launch: com.apple.Preferences

  - name: Open webpage
    flow:
      - launch: https://www.example.com
```

**`terminate` - Terminate App**

Terminate (close) a running iOS app by its bundle ID.

```yaml
ios:
  wdaPort: 8100

tasks:
  - name: Terminate Settings app
    flow:
      - terminate: com.apple.Preferences
```

### The `harmony` part

The `harmony` section is used for HarmonyOS device automation via HDC. The device is connected with `hdc`, so make sure `hdc list targets` reports your device before running.

```yaml
harmony:
  # The HarmonyOS device ID to connect to, optional, defaults to the first connected device.
  deviceId: <device-id>

  # The app to launch, optional, defaults to the device's current screen.
  launch: <bundle-name>

  # The path to the HDC executable, optional.
  hdcPath: <path-to-hdc>

  # Whether to auto dismiss keyboard after input, optional, defaults to false.
  autoDismissKeyboard: <boolean>

  # Custom mapping of app names to bundle names, optional. User-provided mappings take precedence over defaults.
  appNameMapping:
    <app-name>: <bundle-name>

  # The path to the JSON file for outputting aiQuery/aiAssert results, optional.
  output: <path-to-output-file>

  # All other options supported by the HarmonyDevice constructor
```

#### HarmonyOS Platform-Specific Actions

**`launch` - Launch App**

Launch a HarmonyOS app by its bundle name.

```yaml
harmony:
  deviceId: 'test-device'

tasks:
  - name: Launch app
    flow:
      - launch: com.example.app
```

**`terminate` - Terminate App**

Terminate (force-stop) a running HarmonyOS app by bundle name or mapped app name.

```yaml
harmony:
  deviceId: 'test-device'

tasks:
  - name: Terminate app
    flow:
      - terminate: com.example.app
```

**`runHdcShell` - Execute HDC Shell Command**

Execute an HDC shell command on the HarmonyOS device.

```yaml
harmony:
  deviceId: 'test-device'

tasks:
  - name: Dump window info
    flow:
      - runHdcShell:
          command: 'hidumper -s WindowManagerService -a'
```

### The `computer` part

The `computer` section is used for PC desktop automation. It allows you to control the desktop environment, including mouse movements, keyboard inputs, and screen queries.

```yaml
computer:
  # The display ID to use, optional, defaults to the primary display.
  displayId: <display-id>

  # The path to the JSON file for outputting aiQuery/aiAssert results, optional.
  output: <path-to-output-file>
```

#### Usage example

```yaml
computer: {}

tasks:
  - name: Open browser and search
    flow:
      - aiAct: press Cmd+Space
      - sleep: 500
      - aiAct: type "Safari" and press Enter
      - sleep: 2000
      - aiAct: press Cmd+L to focus address bar
      - aiAct: type "https://www.bing.com"
      - aiAct: press Enter
      - sleep: 3000
      - aiAct: type "weather today" in the search box and press Enter
      - aiAssert: The results show weather information
```

:::tip Platform Notes

The demo scripts above use macOS commands. For Windows, modify the scripts to use:
- `press Windows key` instead of `press Cmd+Space`
- `type "Chrome"` instead of `type "Safari"`
- `press Ctrl+L` instead of `press Cmd+L`

:::

### The `tasks` part

The `tasks` part is an array that defines the steps of the script. Remember to add a `-` before each step to indicate it's an array item.

The interfaces in the `flow` section are almost identical to the [API](./api.html), with some differences in parameter nesting levels.

```yaml
tasks:
  - name: <name>
    continueOnError: <boolean> # Optional, whether to continue to the next task on error, defaults to false.
    flow:
      # Auto Planning (.ai)
      # ----------------

      # Perform an interaction. `ai` is a shorthand for `aiAct`.
      - ai: <prompt>
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.
        deepThink: <boolean> # Optional, guide aiAct to focus on task decomposition and separate planning from UI element locating. Defaults to false.
        deepLocate: <boolean> # Optional, enable Deep Locate for UI element locating during aiAct execution. Defaults to false.

      # This usage is the same as `ai`.
      # Note: In earlier versions, this was also written as `aiAction`. The current version supports both names.
      - aiAct: <prompt>
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.
        deepThink: <boolean> # Optional, guide aiAct to focus on task decomposition and separate planning from UI element locating. Defaults to false.
        deepLocate: <boolean> # Optional, enable Deep Locate for UI element locating during aiAct execution. Defaults to false.

      # Instant Action (.aiTap, .aiHover, .aiInput, .aiKeyboardPress, .aiScroll)
      # ----------------

      # Tap an element described by a prompt.
      - aiTap: <prompt>
        deepLocate: <boolean> # Optional, whether to enable Deep Locate for this element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.
        fileChooserAccept: <path> | [<path1>, <path2>] # Optional, file path(s) to upload when the tap triggers a file chooser; only available on web

      # Hover over an element described by a prompt.
      - aiHover: <prompt>
        deepLocate: <boolean> # Optional, whether to enable Deep Locate for this element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Input text into an element described by a prompt.
      - aiInput: <prompt> # The element to input text into.
        value: <final text content of the input>
        deepLocate: <boolean> # Optional, whether to enable Deep Locate for this element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Press a key (e.g., Enter, Tab, Escape) on an element described by a prompt.
      - aiKeyboardPress: <prompt> # The element to press the key on.
        keyName: <key>
        deepLocate: <boolean> # Optional, whether to enable Deep Locate for this element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Scroll globally or on an element described by a prompt.
      - aiScroll: <prompt> # Optional, the element to scroll on.
        scrollType: 'singleAction' # or 'scrollToBottom' | 'scrollToTop' | 'scrollToRight' | 'scrollToLeft'. Defaults to 'singleAction'.
        direction: 'down' # or 'up' | 'left' | 'right'. Defaults to 'down'. Only effective when scrollType is singleAction.
        distance: <number> # Optional, the scroll distance in pixels. Use null to let Midscene decide automatically.
        deepLocate: <boolean> # Optional, whether to enable Deep Locate for this element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Log the current screenshot with a description in the report file.
      - recordToReport: <title> # Optional, the title of the screenshot. If not provided, the title will be 'untitled'.
        content: <content> # Optional, the description of the screenshot.

      # Data Extraction
      # ----------------

      # Perform a query that returns a JSON object.
      - aiQuery: <prompt> # Remember to describe the format of the result in the prompt.
        name: <name> # The key for the query result in the JSON output.

      # More APIs
      # ----------------

      # Wait for a condition to be met, with a timeout (in ms, optional, defaults to 30000).
      - aiWaitFor: <prompt>
        timeout: <ms>

      # Perform an assertion.
      - aiAssert: <prompt>
        errorMessage: <error-message> # Optional, the error message to print if the assertion fails.
        name: <name> # Optional, give the assertion a name, which will be used as a key in the JSON output.

      - aiBoolean: <prompt>
        name: <name> # Optional, give the boolean result a name for JSON output.

      # Run one Gherkin Scenario. This is a Beta feature available starting in Midscene 1.10.
      - runGherkinScenario: |
          Scenario: Add a todo item
            Given the todo page is open
            When I add a todo item named "Buy milk"
            Then the todo list should contain "Buy milk"

      # Wait for a specified amount of time.
      - sleep: <ms>

      # Execute a piece of JavaScript code in the web page context.
      - javascript: <javascript>
        name: <name> # Optional, assign a name to the return value, which will be used as a key in the JSON output.

  - name: <name>
    flow:
      # ...
```

`runGherkinScenario` is a Beta feature available starting in Midscene 1.10. For supported rules and limitations, see [BDD-style scripts with Gherkin](./advanced/bdd-style-scripts-with-gherkin).

#### Step Result Names

Steps that write a result with `name` save that value into the YAML run result and the JSON output. Use `name` to label values that should appear in the run output.

```yaml
tasks:
  - name: Save extracted data
    flow:
      - aiString: Get the product id shown on the page
        name: product_id

      - aiQuery: Get the search result after submitting the product id
        name: search_result
```

#### Upload Files With `aiTap`

When clicking a button opens a file chooser, you can set `fileChooserAccept` directly on the `aiTap` step. It accepts either a single path or an array of paths.

```yaml
tasks:
  - name: upload single file
    flow:
      - aiTap: Choose file button
        fileChooserAccept: ./fixtures/document.pdf

  - name: upload multiple files
    flow:
      - aiTap: Upload images button
        fileChooserAccept:
          - ./fixtures/image1.jpg
          - ./fixtures/image2.png
```

If you are already using a `locate` object for `prompt`, `images`, or other locate options, keep `fileChooserAccept` at the same level as `locate`. Do not nest it inside `locate` or inside the `aiTap` object:

```yaml
tasks:
  - name: upload file with locate
    flow:
      - aiTap:
        locate:
          prompt: Click the upload button
        fileChooserAccept: ./fixtures/document.pdf
```

Notes:

- `fileChooserAccept` is only available for web pages (Playwright, Puppeteer, or Chrome extension Bridge mode).
- Relative paths are resolved from the current command working directory, not from the YAML file directory.
- If a file does not exist, the script throws before the tap is executed.
- Chrome extension Bridge mode does not support directory upload inputs (`webkitdirectory` / `directory`). Use Playwright for directory uploads.

#### Prompting with images

For steps whose prompt accepts images, you can attach images to the prompt by setting the `images` field to an array of objects, each containing a `name` and a `url`. (see the [API reference](./api#prompting-with-images)), replace the string value with an object that contains:

- `prompt`: The text prompt.
- `images`: (Optional) The reference images used in the prompt. Each image needs a `name` and a `url`.
- `convertHttpImage2Base64`: (Optional) Converts HTTP image links to Base64 before sending them to the model, which is useful when the link is not publicly accessible.

Image URLs can be local paths, Base64 strings, or remote links. When using image links that cannot be accessed for the model, set `convertHttpImage2Base64: true` so Midscene will download the image and send the base64 string to the model.

For interactions like `aiTap`, `aiHover`, `aiDoubleClick`, `aiRightClick`, put the text and images in the `locate` field as a sibling of the action key.

```yaml
tasks:
  - name: Verify branding
    flow:
      - aiHover:
        locate:
          prompt: Move the cursor to the region containing the GitHub logo.
          images:
            - name: GitHub logo
              url: https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png
          convertHttpImage2Base64: true

      - aiTap:
        locate:
          prompt: Tap the region containing the GitHub logo.
          images:
            - name: GitHub logo
              url: https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png
          convertHttpImage2Base64: true
```

> The legacy nested format (where `locate` is indented under the action key, e.g. `aiTap: \n    locate: ...`) is still supported but not recommended.

For insight steps like `aiAsk`, `aiQuery`, `aiBoolean`, `aiNumber`, `aiString`, and `aiAssert`, you can set the `prompt` and `images` fields directly.

```yaml
tasks:
  - name: Verify branding
    flow:
      - aiAssert:
          prompt: Check whether the image appears on the page.
          images:
            - name: target logo
              url: https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png
          convertHttpImage2Base64: true
```

## Notes

### `agent.runYaml` only parses the `tasks` field

When using the `agent.runYaml()` API, only the `tasks` field in the YAML file is parsed and executed.

At that point the agent has already been initialized in the JS script, so it cannot be reinitialized based on the `agent` configuration in the YAML file.

<!-- END OFFICIAL PAGE 7: automate-with-scripts-in-yaml.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 8: awesome-midscene.md -->

## Source page: `awesome-midscene.md`

# Awesome Midscene

A curated list of community projects that extend Midscene.js capabilities across different platforms and programming languages.

## Community projects

### iOS automation
- **[midscene-ios](https://github.com/lhuanyu/midscene-ios)** - iOS Mirror automation support for Midscene
  - Enables automated testing and interaction with iOS applications
  - Extends Midscene's cross-platform capabilities to Apple's mobile ecosystem

### PC automation
- **[midscene-pc](https://github.com/Mofangbao/midscene-pc)** - PC operation device for Windows, macOS, and Linux
  - Enables automated testing and interaction with desktop applications across all major platforms
  - Supports both local and remote operation capabilities
- **[midscene-pc-docker](https://github.com/Mofangbao/midscene-pc-docker)** - Docker container image with Midscene-PC server pre-installed
  - Based on Ubuntu 20 with GNOME desktop for maximum application compatibility
  - Includes built-in VNC service for browser-based desktop monitoring
  - Deploy automation client directly on standard servers with a single command

### Python SDK
- **[Midscene-Python](https://github.com/Python51888/Midscene-Python)** - Python SDK for Midscene automation
  - Brings Midscene's AI-powered automation capabilities to Python developers
  - Allows integration with existing Python testing and automation workflows

### Java SDK
- **[midscene-java](https://github.com/Master-Frank/midscene-java)** by @Master-Frank - Java SDK for Midscene automation
  - Offers a JVM-friendly way to script Midscene experiences similar to the Python SDK
  - Fits easily into existing Java automation or testing pipelines
- **[midscene-java](https://github.com/alstafeev/midscene-java)** by @alstafeev - Java SDK for Midscene automation
  - Provides a JVM-native interface for scripting Midscene
  - Integrates seamlessly into established Java testing frameworks and automation workflows

## Contributing

Have you created a project that extends Midscene.js? We'd love to feature it here!

To add your project to this list, please submit an issue to the [Midscene repository](https://github.com/web-infra-dev/midscene), and tell us your awesome midscene project.

## Criteria for inclusion

Projects featured in Awesome Midscene should:
- Extend or integrate with Midscene.js functionality
- Be actively maintained
- Have clear documentation and usage examples
- Provide value to the Midscene community

---

*Don't see your favorite platform or language supported yet? Consider creating a community project or contributing to existing ones!*

<!-- END OFFICIAL PAGE 8: awesome-midscene.md -->

---

<!-- BEGIN OFFICIAL PAGE 9: blog-introducing-instant-actions-and-deep-think.md -->

## Source page: `blog-introducing-instant-actions-and-deep-think.md`

# Introducing Instant Actions and Deep Think

From Midscene v0.14.0, we have introduced two new features: Instant Actions and Deep Think.

## Instant Actions - a more predictable way to perform actions

You may have already been familiar with our `.ai` interface. It's an auto-planning interface to interact with web pages. For example, when performing a search, you can do this:

```typescript
await agent.ai('type "Headphones" in search box, hit Enter');
```

Behind the scene, Midscene will call the LLM to plan the steps and execute them. You can see the report file to see the process. It's a very common way for AI agents to these kinds of tasks.

![](/blog/report-planning.png)

In the meantime, there are many testing engineers who want a faster way to perform actions. When using AI models with complex prompts, some of the LLM models may find it hard to plan the proper steps, or the coordinates of the elements may not be accurate. It could be frustrating for debugging the unpredictable process.

To solve this problem, we have introduced the `aiTap()`, `aiHover()`, `aiInput()`, `aiKeyboardPress()`, `aiScroll()` interfaces. They are call the **"instant actions"**. These interfaces will directly perform the specified action as the interface name suggests, while the AI model is responsible for the easier tasks such as locating elements. The whole process can be obviously faster and more reliable after using them.

For example, the search action above can be rewritten as:

```typescript
await agent.aiInput('Headphones', 'search-box');
await agent.aiKeyboardPress('Enter');
```

The typical workflow in the report file is like this, as you can see there is no planning process in the report file:

![](/blog/report-instant-action.png)

The scripts with instant actions seems a little bit redundant (or not 'ai-style'), but we believe these structured interfaces are a good way to save time debugging when the action is already clear.

## Deep Think - a more accurate way to locate elements

When using Midscene with some complex widgets, the LLM may find it hard to locate the target element. We have introduced a new option named `deepThink` to the instant actions.

The signature of the instant actions with `deepThink` is like this:

```typescript
await agent.aiTap('target', { deepThink: true });
```

`deepThink` is a strategy of locating elements. It will first find an area that contains the target element, then "focus" on this area to search the element again. By this way, the coordinates of the target element will be more accurate. 

Let's take the workflow editor page of Coze.com as an example. There are many customized icons on the sidebar. This is usually hard for LLMs to distinguish the target element from its surroundings.

![](/blog/coze-sidebar.png)

After using `deepThink` in instant actions, the yaml scripts will be like this (of course, you can also use the javascript interface):

```yaml
tasks:
  - name: edit input panel
    flow:
      - aiTap: the triangle icon on the left side of the text "Input"
        deepThink: true
      - aiTap: the first checkbox in the Input form
        deepThink: true
      - aiTap: the expand button on the second row of the Input form (on the right of the checkbox)
        deepThink: true
      - aiTap: the delete button on the second last row of the Input form
        deepThink: true
      - aiTap: the add button on the last row of the Input form （second button from the right）
        deepThink: true
```

By viewing the report file, you can see Midscene has found every target element in the area.

![](/blog/report-coze-deep-think.png)

Just like the example above, the highly-detailed prompt for `deepThink` is the key to keeping results stable.

`deepThink` is only available with the models that support visual grounding like qwen2.5-vl. If you are using LLM models like gpt-4o, it won't work.

<!-- END OFFICIAL PAGE 9: blog-introducing-instant-actions-and-deep-think.md -->

---

<!-- BEGIN OFFICIAL PAGE 10: bridge-mode.mdx -->

## Source page: `bridge-mode.mdx`

import SetupEnv from './common/setup-env.mdx';

# Bridge mode by Chrome extension

import { PackageManagerTabs } from '@theme';

The bridge mode in the Midscene Chrome extension is a tool that allows you to use local scripts to control the desktop version of Chrome. Your scripts can connect to either a new tab or the currently active tab.

Using the desktop version of Chrome allows you to reuse all cookies, plugins, page status, and everything else you want. You can work with automation scripts to complete your tasks. This mode is commonly referred to as 'man-in-the-loop' in the context of automation.

![bridge mode](/midscene-bridge-mode.png)

:::info Demo Project

check the demo project of bridge mode: [https://github.com/web-infra-dev/midscene-example/blob/main/bridge-mode-demo](https://github.com/web-infra-dev/midscene-example/blob/main/bridge-mode-demo)

:::

<SetupEnv />

> In bridge mode, the AI models configs should be set in the Node.js side instead of the browser side.

## Get started

### Step 1. Install Midscene extension from Chrome web store

Install [Midscene extension from Chrome web store](https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief)

### Step 2. Install dependencies

<PackageManagerTabs command="install @midscene/web tsx --save-dev" />

### Step 3. Write scripts

Write and save the following code as `./demo-new-tab.ts`.

```typescript
import { AgentOverChromeBridge } from "@midscene/web/bridge-mode";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    const agent = new AgentOverChromeBridge();

    // This will connect to a new tab on your desktop Chrome
    await agent.connectNewTabWithUrl("https://www.bing.com");

    // these are the same as normal Midscene agent
    await agent.ai('type "AI 101" and hit Enter');
    await sleep(3000);

    await agent.aiAssert("there are some search results");
    await agent.destroy();
  })()
);
```

### Step 4. Run the script

Run your scripts

```bash
tsx demo-new-tab.ts
```

After running the script, the Chrome extension will pop up a confirmation dialog asking whether to allow the connection. Click "Allow" to allow the current connection, or click "Always Allow" to automatically allow all future connection requests (can be reset in the Bridge Mode panel). You should then see a new tab opened in your desktop Chrome, controlled by your scripts.

<p align="center">
  <img src="/bridge_in_extension.png" alt="bridge in extension" width="400"/>
</p>

:::tip

The extension listens for connection requests in the background by default, no manual action is needed. The extension icon will display a status badge: yellow dot for listening, green dot for connected.

:::

## Use bridge mode in YAML script

[Yaml scripts](./automate-with-scripts-in-yaml) is a way for developers to write automation scripts in yaml format, which is easy to read and write comparing to javascript.

To use bridge mode in yaml script, set the `bridgeMode` property in the `web` section. If you want to use the current tab, set it to `currentTab`, otherwise set it to `newTabWithUrl`.

Set `closeNewTabsAfterDisconnect` to true if you want to close the newly created tabs when the bridge is destroyed. This is optional and the default value is false.

For example, the following script will open a new tab by Chrome extension bridge: 

```diff
web:
  url: https://www.bing.com
+ bridgeMode: newTabWithUrl
+ closeNewTabsAfterDisconnect: true
tasks:
```

Run the script:

```bash
midscene ./bing.yaml
```

After the script starts, click "Allow" in the confirmation dialog to proceed.

### Unsupported options

In bridge mode, these options will be ignored (they will follow your desktop browser's settings):
- userAgent
- viewportWidth
- viewportHeight
- deviceScaleFactor
- waitForNetworkIdle
- cookie
- extraHTTPHeaders
- downloadPath
- chromeArgs

## Remote Access Configuration

By default, the Bridge Server only listens on `127.0.0.1`, allowing only local Chrome extension connections. If you need cross-machine communication (e.g., server on machine A, browser on machine B), you can enable remote access:

**Server Side (Node.js Script):**

```typescript
// Enable remote access (recommended)
const agent = new AgentOverChromeBridge({
  allowRemoteAccess: true  // Listen on 0.0.0.0:3766
});

// Or specify a specific network interface
const agent = new AgentOverChromeBridge({
  host: '192.168.1.100',  // Listen on specific IP
  port: 3766
});
```

**Client Side (Chrome Extension):**

1. Open the Chrome extension's Bridge Mode page
2. Fill in the server address in the "Bridge Server URL" input field
   - Local mode: `ws://localhost:3766` (default)
   - Remote mode: `ws://192.168.1.100:3766` (replace with your server IP)
3. Run your script and click "Allow" in the confirmation dialog

<p align="center">
  <img src="/bridge_remote_config.png" alt="bridge remote config" width="400"/>
</p>

:::warning Security Notice

When remote access is enabled, the Bridge Server will be exposed on the network. Please ensure:
- Only use in trusted network environments
- Use firewall to restrict access
- Do not use in public network environments to avoid security risks

:::

## FAQ

* Where should I config the model parameters (like `MIDSCENE_MODEL_API_KEY`), in the browser or in the terminal?

When using bridge mode, you should config the model parameters in the terminal. For more configuration details, please refer to [Model strategy](./model-strategy).

## More

- For every Agent method, check the [API reference](./api#interaction-methods).
- For the full Chrome Bridge API surface, see [API reference (Web)](./web-api-reference#chrome-bridge-agent).
- Demo project
  - Bridge mode demo: [https://github.com/web-infra-dev/midscene-example/blob/main/bridge-mode-demo](https://github.com/web-infra-dev/midscene-example/blob/main/bridge-mode-demo)

<!-- END OFFICIAL PAGE 10: bridge-mode.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 11: caching.mdx -->

## Source page: `caching.mdx`

# Caching AI Planning and DOM Localization

Midscene supports caching two kinds of data: AI Planning steps and matched element localization information. The former can be used across automation workflows to reduce AI model calls and improve execution efficiency; for web automation, the DOM localization part (XPath) in the latter can significantly reduce repeated locating overhead, but it is currently web-only and has [certain limitations](#limitations-of-xpath-in-caching-element-location).

**Effect**

With caching hit, time cost is significantly reduced. For example, in the following case, execution time was reduced from 51 seconds to 28 seconds.

* **before**

![](/cache/no-cache-time.png)

* **after**

![](/cache/use-cache-time.png)

## Cache files and storage

Midscene's caching mechanism is based on input stability and output reusability. When the same task instructions are repeatedly executed in similar page environments, Midscene will prioritize using cached results to avoid repeated AI model calls, significantly improving execution efficiency.

The core caching mechanisms include:
- **Task instruction caching**: For planning operations (such as `ai`, `aiAct`), Midscene uses the prompt instruction as the cache key to store the execution plan returned by AI
- **Element location caching (web only)**: For location operations (such as `aiLocate`, `aiTap`), the system uses the location prompt as the cache key to store element XPath information, and verifies whether the XPath is still valid on the next execution
- **Invalidation mechanism**: When cache becomes invalid, the system automatically falls back to AI model for re-analysis
- **Plan cache fallback**: If a cached `aiAct` plan fails at runtime, for example because an optional popup no longer appears, Midscene falls back to normal AI planning for the current run and clears the stale cache record's flow
- **Never cache query results**: The query results like `aiBoolean`, `aiQuery`, `aiAssert` will never be cached.

When this fallback path is used, Midscene does not write the fallback-generated flow back to the original prompt's plan cache, even if the current run succeeds. The cached steps may have already changed the page state before failing, so the fallback plan may only describe the remaining work and may not be valid from the initial page state. On the next run with the same prompt, the empty flow is treated as an unavailable cache entry and Midscene regenerates a complete plan cache from the initial state.

Cache contents will be saved in the `./midscene_run/cache` directory with the `.cache.yaml` as the extension name.

## Cache strategies

By configuring the `cache` option, you can enable caching for your agent.

### Disable cache

Configuration: `cache: false` or not configuring the `cache` option

Completely disable cache functionality, always call AI model for every operation. Suitable when you need real-time results or for debugging. By default, if you don't configure the `cache` option, caching is disabled.

```javascript
// Direct Agent creation
const agent = new PuppeteerAgent(page, {
  cache: false,
});
```

```yaml
# YAML configuration
agent:
  cache: false
```

### Read-write mode

Configuration: `cache: { id: "my-cache-id" }` or `cache: { strategy: "read-write", id: "my-cache-id" }`

Automatically read existing cache and update cache files during execution. The default value of `strategy` is `read-write`.

```javascript
// Direct Agent creation - explicit cache ID
const agent = new PuppeteerAgent(page, {
  cache: { id: "my-cache-id" },
});

// Explicitly specify strategy
const agent = new PuppeteerAgent(page, {
  cache: { strategy: "read-write", id: "my-cache-id" },
});
```

```yaml
# YAML configuration - explicit cache ID
agent:
  cache:
    id: "my-cache-test"

# Explicitly specify strategy
agent:
  cache:
    id: "my-cache-test"
    strategy: "read-write"
```

YAML mode also supports `cache: true` to automatically use the file name as the cache ID.

### Read-only, manual write

Configuration: `cache: { strategy: "read-only", id: "my-cache-id" }`

Only read cache, no automatic writing to cache files. Requires manual `agent.flushCache()` call to write cache files. Suitable for production environments to ensure cache consistency.

```javascript
// Direct Agent creation
const agent = new PuppeteerAgent(page, {
  cache: { strategy: "read-only", id: "my-cache-id" },
});

// Manual cache write required
await agent.flushCache();
```

```yaml
# YAML configuration
agent:
  cache:
    id: "my-cache-test"
    strategy: "read-only"
```

### Write-only mode

Configuration: `cache: { strategy: "write-only", id: "my-cache-id" }`

Only write to cache, do not read existing cache contents. Always call AI model for each execution and write results to cache file. Suitable for initially building cache or updating cache.

```javascript
// Direct Agent creation
const agent = new PuppeteerAgent(page, {
  cache: { strategy: "write-only", id: "my-cache-id" },
});
```

```yaml
# YAML configuration
agent:
  cache:
    id: "my-cache-test"
    strategy: "write-only"
```

### Compatibility mode (not recommended)

Configuration via `MIDSCENE_CACHE=1` environment variable with cacheId, equivalent to read-write mode.

```javascript
// Old way, requires MIDSCENE_CACHE=1 environment variable and cacheId
const agent = new PuppeteerAgent(originPage, {
  cacheId: 'puppeteer-swag-sab'
});
```

```bash
MIDSCENE_CACHE=1 tsx demo.ts
```

## Using Playwright AI Fixture from `@midscene/web/playwright`

When using `PlaywrightAiFixture` from `@midscene/web/playwright`, pass the same `cache` options to control caching behaviour.

### Disable cache

```typescript
// fixture.ts in sample code
export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    cache: false,
  }),
);
```

### Read-write mode

```typescript
// fixture.ts in sample code
// Auto-generate cache ID from test metadata
export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    cache: true,
  }),
);

// fixture.ts in sample code
// Explicitly provide cache ID
export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    cache: { id: "my-fixture-cache" },
  }),
);
```

### Read-only, manual write

```typescript
// fixture.ts in sample code
export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    cache: { strategy: "read-only", id: "readonly-cache" },
  }),
);
```

When you run the fixture in read-only mode you need to manually persist the cache after your test steps. Use the `agentForPage` helper provided by the fixture to fetch the underlying agent, then call `agent.flushCache()` at the point where you want to write the cache file:

```typescript
test.afterEach(async ({ page, agentForPage }, testInfo) => {
  // Only flush cache if the test passed
  if (testInfo.status === 'passed') {
    console.log('Test passed, flushing Midscene cache...');
    const agent = await agentForPage(page);
    await agent.flushCache();
  } else {
    console.log(`Test ${testInfo.status}, skipping Midscene cache flush.`);
  }
});

test('manual cache flush', async ({ agentForPage, page, aiTap, aiWaitFor }) => {
  const agent = await agentForPage(page);

  await aiTap('first highlighted link in the hero section');
  await aiWaitFor('the detail page loads completely');

  await agent.flushCache();
});
```

### Write-only mode

```typescript
// fixture.ts in sample code
export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    cache: { strategy: "write-only", id: "write-only-cache" },
  }),
);
```

In write-only mode, each test will call the AI model and automatically write results to cache file without reading existing cache.

## Cache Cleaning

Midscene supports cleaning unused cache records when flushing cache to file, ensuring cache files stay lean and maintainable. This feature is **completely manual** and requires explicit call to `agent.flushCache({ cleanUnused: true })`.

### Manual Cleaning Mechanism

When calling `agent.flushCache({ cleanUnused: true })`, the system will:

1. **Keep used caches**: Cache records that were matched and used in the current run will be retained
2. **Keep new caches**: Cache records newly generated in the current run will be retained
3. **Remove unused caches**: Old cache records that were not accessed will be automatically deleted
4. **Write to file**: The cleaned cache will be written to file

### Usage

**Call in test afterEach:**

```javascript
describe('test suite', () => {
  let resetFn: () => Promise<void>;
  let agent: PuppeteerAgent;

  afterEach(async () => {
    // Clean cache and write to file
    if (agent) {
      await agent.flushCache({ cleanUnused: true });
    }

    // Then close the page
    if (resetFn) {
      await resetFn();
    }
  });

  it('test case', async () => {
    const { originPage, reset } = await launchPage('https://example.com/');
    resetFn = reset;
    agent = new PuppeteerAgent(originPage, {
      cache: { id: 'my-cache-id' },
    });

    // ... test logic
  });
});
```

**For Playwright AI Fixture users:**

```typescript
test.afterEach(async ({ page, agentForPage }) => {
  const agent = await agentForPage(page);
  await agent.flushCache({ cleanUnused: true });
});
```

### Cleanup Behavior by Mode

- **read-write mode**: Calling `flushCache({ cleanUnused: true })` will clean and write to file
- **read-only mode**: Calling `flushCache({ cleanUnused: true })` will also clean and write to file (manual flush overrides read-only restriction)
- **write-only mode**: No cleanup (does not read cache)

**Note**: If you don't pass `cleanUnused: true` parameter, `flushCache()` will only write to file without cleaning unused caches.

## FAQ

### No cache file is generated

Please ensure you have correctly configured caching:

1. **Direct Agent creation**: Set `cache: { id: "your-cache-id" }` in the constructor
2. **Playwright AI Fixture mode**: Set `cache: true` or `cache: { id: "your-cache-id" }` in fixture configuration
3. **YAML script mode**: Set `agent.cache.id` in the YAML file
4. **Read-only mode**: Ensure you called the `agent.flushCache()` method
5. **Legacy approach**: Set `cacheId` and enable `MIDSCENE_CACHE=1` environment variable

### How to check if the cache is hit?

You can view the report file. If the cache is hit, you will see the `cache` tip and the time cost is obviously reduced.

### Why the cache is missed on CI?

You need to commit the cache files to the repository in CI and recheck the cache hit conditions.

### Does it mean that AI services are no longer needed after using cache?

No. Caching is the way to accelerate the execution, but it's not a tool for ensuring long-term script stability. We have noticed many scenarios where the cache may miss when the DOM structure changes. AI services are still needed to reevaluate the task when the cache miss occurs.

### How to manually remove the cache?

You can remove the cache file in the `./midscene_run/cache` directory, or edit the contents in the cache file.

### How to disable the cache for a single API?

You can use the `cacheable` option to disable the cache for a single API.

Please refer to the documentation of the corresponding [API](./api.mdx) for details.

### Limitations of XPath in caching element location

Midscene uses [XPath](https://developer.mozilla.org/en-US/docs/Web/XML/XPath) to cache the element location. ⁠We are using a relatively strict strategy to prevent false matches. In these situations, the cache will not be accessed:

1. The text content of the new element at the same XPath is different from the cached element.
2. The DOM structure of the page is changed from the cached one.

Additionally, since element location caching relies on DOM structure, caching is not available in the following scenarios:

1. **Canvas elements**: Graphics content inside Canvas does not have DOM nodes and cannot be located via XPath.
2. **Cross-origin iframes**: Browser security policies restrict access to the internal DOM of cross-origin iframes.
3. **Shadow DOM (closed mode)**: Closed Shadow DOM cannot be accessed from outside.
4. **WebGL / Dynamic SVG content**: Dynamically generated graphics may not have a stable DOM structure.

When the cache is not hit or not available, the process will fall back to using AI services to find the element.

### Get more debug logs for caching

You can set the `DEBUG=midscene:cache:*` environment variable to get more debug logs for caching.

<!-- END OFFICIAL PAGE 11: caching.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 12: changelog.mdx -->

## Source page: `changelog.mdx`

# Changelog

## v1.10 - BDD-Style Scripts, Doubao-Seed-2.1, and MCP Retirement

v1.10 adds BDD-style Gherkin script execution, upgrades the recommended Doubao model to Doubao-Seed-2.1, and formally retires MCP server packages. Going forward, use Skills and the platform CLIs when AI agents need to drive Midscene.

### BDD-Style Scripts with Gherkin

- Added `agent.runGherkinScenario()` for running Gherkin scenarios directly from JavaScript / TypeScript.
- Added the `runGherkinScenario` step for YAML flows, so natural-language scenarios can be written as `Given` / `When` / `Then` steps and executed in order.
- `Given` / `When` map to `aiAct`, while `Then` and following `And` / `But` steps map to `aiAssert`. This keeps test cases readable in natural language while giving them a stable step structure.
- Midscene currently supports a single-`Scenario` subset of Gherkin. BDD-related capabilities are still in Beta. See: [BDD-Style Scripts with Gherkin](./advanced/bdd-style-scripts-with-gherkin)

### New Model Support

- Recommended and supported `Doubao-Seed-2.1-turbo`, which has very fast localization speed and strong localization quality in our current private evaluation set.
- The Doubao Seed family now uses `MIDSCENE_MODEL_FAMILY="doubao-seed"`, while the legacy `doubao-vision` family remains compatible. See: [Common Model Configuration](./model-common-config#doubao-seed-model), [Model Strategy](./model-strategy)

### MCP Retirement

- Midscene no longer ships MCP server packages, including `@midscene/web-bridge-mcp`, `@midscene/android-mcp`, `@midscene/ios-mcp`, `@midscene/harmony-mcp`, `@midscene/computer-mcp`, and `@midscene/mcp`.
- Use [Skills](./skills) and the platform CLIs when AI coding agents need to operate browsers, mobile devices, or desktop apps.
- If you still depend on MCP servers, pin Midscene to `1.9.8`. This is the final version that includes MCP support. See: [MCP Integration Has Been Retired](./mcp)

## v1.9 - New Model Support, YAML Automation, and AndroidWorld Benchmark

v1.9 expands model support, improves YAML automation, and makes reports, Android automation, Web input, and desktop automation more reliable.

### AndroidWorld Benchmark

Midscene now includes an AndroidWorld benchmark report. With v1.9.5, Midscene achieved **Pass@1 93.10%**, **Pass@2 95.69%**, and **Pass@3 97.41%** in this benchmark. See: [AndroidWorld Benchmark Report](./android-world-benchmark-report)

### New Model Support

- Added Kimi and Xiaomi MiMo model support. See: [Common Model Configuration](./model-common-config)

### Model and Planning Updates

- `aiAct` now supports image prompts.
- `MIDSCENE_MODEL_REASONING_ENABLED` now supports `default`, so Midscene can follow each model family's default thinking behavior.
- Gemini thinking content and GPT-5 reasoning configuration are now handled more completely.
- `aiAct` falls back to model planning when a cached plan becomes invalid, and clears the corresponding cache entry.
- AI request errors now include retry-attempt details, parse failures preserve raw model responses, and parsed locate results are validated before use.
- Model dumps now expose more model response metadata, including raw choice messages and response model names in usage data.
- The `deepLocate` search area is now displayed in reports.

### Chrome Extension

- Chrome extension Bridge mode now supports file upload.
- Bridge-mode file uploads now honor file chooser accept filters and WSL file paths.

### YAML, CLI, and MCP

- `1.9.8` is the final Midscene version that includes MCP support. Later versions retire MCP server packages in favor of Skills and the platform CLIs.
- Platform CLIs now accept agent behavior init args.
- YAML scripts now support the HarmonyOS target in the CLI, so HarmonyOS automation can be driven through the same script runner workflow as Web, Android, iOS, and Computer. See: [Automate with Scripts in YAML](./automate-with-scripts-in-yaml), [HarmonyOS API](./harmony-api-reference)
- YAML Web config supports custom HTTP headers for browser automation.
- YAML Web config supports `downloadPath` for browser downloads.
- YAML runs now surface real execution errors instead of ending as a silent "not executed" case.
- YAML batch runs can retry failed cases.
- Successful YAML runs now print the report path.
- Explicit YAML report file names are now honored.
- CLI / MCP / Skill flows can expose `deepLocate` / `deepThink` controls through shared flags.
- Assert CLI / MCP tooling forwards custom failure messages to make assertion failures clearer.
- The CLI resolves `@rstest/core` from the CLI package itself and lazy-loads Rstest core, making framework runs more stable from external launch paths.

### Reports

- `recordToReport` now supports custom screenshots.
- Report exports keep image paths aligned with exported screenshots.
- Reports include a JSON tree view for inspecting structured task and model data.
- Report screenshots, labels, playground server origin handling, and context spacing were refined.

### Studio and Recorder

- Studio recorder descriptions and preview input coalescing were stabilized.
- Studio now handles invalid model environment configuration more safely.
- Recorder workflows can generate Markdown replay output.

### Android Automation

- Android action controls and planning guidance were improved for native mobile automation flows.

### Computer Automation

- Computer desktop automation now ships Intel packaging.
- Libnut scrolling now emits one full wheel delta per scroll tick.

### Bug Fixes

- Fixed `longPress` duration in Web integration being capped at 600ms.
- Fixed dropped characters when Web input fields re-render during typing.
- Fixed HarmonyOS MCP startup failures caused by `photon` / `sharp` WASM initialization in some environments.
- Fixed blank first-frame screenshots in Computer RDP sessions.
- Self-healed missing execute permission on the Computer phased-scroll helper.
- Added a warning for elevated Windows app input drops.
- Added IPv6 RDP host support for Computer automation.

### Documentation Updates

- Documented Azure OpenAI-compatible endpoint setup.

## v1.8 - Midscene Studio Desktop App & Multi-Platform Enhancements

v1.8 introduces **Midscene Studio**, a brand-new desktop application, alongside new interaction APIs (long press / clear input), refined model planning behavior, and broad upgrades across device integrations, the report system, and the MCP toolset.

### Midscene Studio — A New Desktop Application (Beta)

Midscene Studio is an Electron-based desktop app that brings every Midscene playground into a single native shell. It is currently in **Beta** — download the current Studio build from the [latest release page](https://github.com/web-infra-dev/midscene/releases/latest) by choosing a `midscene-studio-beta-*` asset, try it out, and let us know what works (and what doesn't):

- **Multi-platform playground**: Switch seamlessly between Web, Android, iOS, HarmonyOS, and Computer playgrounds inside the same Studio app
- **Interactive device preview**: Manually drive Android / iOS / HarmonyOS device previews with mouse and touch input; Web preview supports live streaming

#### Coming next: record-to-replay Midscene scripts inside Studio

We're building a full record → script → replay loop into Studio: drive a real device inside Studio, automatically capture the interaction as a structured Midscene script, then replay, debug, and export it without leaving the app. The capability will roll out across upcoming releases — stay tuned.

### YAML Workflow Enhancements

- **Android `runAdbShell` timeout**: A `timeout` option is now accepted in both the JavaScript API and YAML scripts. See: [Android API](./android-api-reference), [Automate with Scripts in YAML](./automate-with-scripts-in-yaml)

### New Interaction APIs

- **`agent.aiLongPress()`**: Long-press a target element to trigger long-press menus and similar gestures. See: [API Reference](./api.mdx#agentailongpress)
- **`agent.aiClearInput()`**: Clear the contents of an input field, ideal when clearing needs to be its own step. See: [API Reference](./api.mdx#agentaiclearinput)

### Device and Platform Integrations

- **iOS external WDA sessions**: iOS now supports connecting to existing WebDriverAgent sessions, making it easier to reuse an external WDA setup
- **Pluggable iOS device implementation**: The iOSDevice implementation can be overridden, enabling deeper extension or customization
- **Computer remote desktop**: RDP connection options are now exposed through Computer MCP / CLI connection tools, letting you take over a remote Windows desktop directly
- **`agentForComputer` rename**: `agentForComputer` is introduced as the primary API; the original `agentFromComputer` is kept as a deprecated alias
- **Puppeteer CLI viewport options**: The Puppeteer CLI now accepts viewport configuration, so you can size the browser at launch from the command line

### Model and Planning Behavior

- **Usage intent decoupled from config slot**: Model usage intent is now tracked separately from resolved config slots, making multi-model planning, locating, and report display clearer
- **Native thinking off by default**: For supported model families, Midscene now disables model-native thinking by default to improve execution speed and stability. See: [Model-Native Thinking Mode](./model-strategy#model-native-thinking-mode)
- **Doubao fast tier**: Doubao fast tier configuration is now supported through `MIDSCENE_MODEL_EXTRA_BODY_JSON={"service_tier":"fast"}`. See: [Common Model Configuration](./model-common-config)
- **GLM-5V-Turbo support**: Added support for Zhipu GLM-5V-Turbo. See: [Common Model Configuration](./model-common-config)
- **Better scrollable select planning**: Planning for scrollable selects (dropdowns, scroll wheels) is more reliable in complex scenarios

### MCP and Platform CLIs

- **New `assert` MCP tool**: The MCP server now exposes an assertion tool backed by `aiAssert`, so AI assistants can run assertions directly. See: [MCP](./mcp)
- **Image prompts in assert**: The assert CLI / MCP tool now accepts images as prompt input, so you can assert against a reference image
- **Bare init args in platform CLIs**: Platform CLIs simplify argument passing and now accept platform Agent constructor options directly
- **Playwright fixture passes Agent options through**: `PlaywrightAiFixture` now forwards `PlaywrightAgent` constructor options, so you can customize the Agent while keeping the fixture

### Report System

- **CLI report merging**: A new `report-tool merge` subcommand lets you combine multiple report files into one for centralized review
- **Screenshot tool calls recorded in reports**: `take_screenshot` invocations now appear in reports, easing diagnosis of screenshot-related issues

### Chrome Extension

- **Automated Chrome Web Store publishing**: The Chrome Web Store extension release pipeline is now fully automated, shortening release cycles

### Bug Fixes

- Fixed `aiAct` completion being emitted before actions actually run
- Fixed insight prompts prioritizing reference images over the current screenshot in some cases
- Fixed Bridge attachment after new-tab navigation
- Fixed Playground tap projection on iOS / HarmonyOS / Computer
- Fixed HarmonyOS per-call `autoDismissKeyboard`
- Fixed excessive Android Playground video streaming memory usage
- Fixed Computer scroll default distance not matching Web
- Fixed out-of-range bbox handling for models that return normalized `[0,1000]` coordinates
- Fixed `aiAct` options not being inherited in Bridge mode
- Fixed Action API return values diverging from the documented shape
- Fixed `maxTokens` not aligning with intent model config
- Fixed server port probing on a non-`0.0.0.0` host that did not match the actual listen host
- Fixed `deepThink` dump flag being lost in reports
- Fixed sporadic dropped characters when typing on iOS
- Fixed unwanted HarmonyOS system action delay overrides

## v1.7 - Flexible Report File Consumption, with Qwen 3.6 Support

### Flexible Report File Consumption

Starting in v1.7.0, you can extract raw screenshots and JSON data from report files, or convert reports into Markdown so other tools can continue consuming that content.

## Example

You can parse a report file into a Markdown file like this:

```md
# Act - Search for and play videos related to Midscene

- Execution start: 2026-04-08T02:13:04.795Z
- Task count: 21

## 1. Plan - Click the top search box to activate input
- Status: finished
- Start: 2026-04-08T02:13:04.845Z
- End: 2026-04-08T02:13:15.296Z
- Cost(ms): 10451
- Screen size: 2880 x 1536

![task-1](./screenshots/execution-1-task-1-f9fc3bf9-bdf6-48dd-abea-f8f29874d8c1.jpeg)

.....
```

You can then use the [Remotion Skill](https://www.remotion.dev/docs/ai/skills?utm_source=midscenejs) to parse that Markdown file and generate a customized replay video.

The generated video looks like this:

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/midscene-replay.mp4" height="300" controls></video>

Midscene supports parsing report files through either the CLI or the JavaScript SDK. See: [Consume Report Files](./consume-report-file)

### Qwen 3.6 Model Support

Added support for the Qwen 3.6 model, so you can use the latest Qwen model in Midscene. See: [Model Config](./model-config)

### Chrome Extension Recording Language Setting

A new YAML output language option is available in the Chrome extension's recording settings, supporting English, Chinese, Japanese, and more. You can also set it to Auto to follow the system language.

### Android / HarmonyOS Improvements

- Added `terminate` action on Android and HarmonyOS to force-stop apps, useful for resetting app state during testing. See: [Android API](./android-api-reference), [HarmonyOS API](./harmony-api-reference)
- Fixed placeholder text unexpectedly retained when typing on X/Twitter on Android
- Fixed Android Playground LAN access issues

### Debugging Improvements

- Execution logs can now be saved to disk for post-hoc troubleshooting
- Playground config page now supports running a connectivity test when saving model config, catching configuration errors early
- Skill CLI `run` command now supports passing images as prompts via the `--image` flag

### Bug Fixes

- Fixed unclear error messages when file chooser encounters missing files
- Fixed incomplete error collection in CLI batch runner summary
- Fixed `aiScroll` indentation formatting errors in YAML scripts
- Fixed inaccurate `aiLocate` element bounding box
- Fixed missing fallback when screenshot capture fails
- Fixed incorrect handling of empty model responses in some cases
- Fixed tab reuse issues in CDP connection mode
- Fixed `aiQuery` result missing under certain data structures
- Fixed AutoGLM app launch parameter format issue
- Fixed dropdown display issues in Playground
- Fixed custom request header aliases not working in model config

## v1.6 - CDP Connection, Pinch/Zoom & Multi-Model Enhancements

v1.6 adds CDP browser connection mode, cross-platform pinch/zoom gestures, GPT-5/GPT-5.4 model support, along with improvements to element locating, report system, Chrome extension, and more.

### CDP Browser Connection Mode

You can now connect to an existing browser instance via CDP (Chrome DevTools Protocol) for automation, without having Midscene launch a new browser. This is useful when you need to reuse an existing browser session. See: [Skills - Browser Automation](./skills), [YAML Script Runner - CDP Mode](./yaml-script-runner#use-cdp-connection-mode)

### Cross-Platform Pinch/Zoom Gestures

Pinch/zoom gestures are now supported on Android, iOS, and HarmonyOS, enabling use cases like map zooming and image preview. See: [API Reference - aiPinch](./api.mdx#agentaipinch)

### GPT-5 / GPT-5.4 & Codex App-Server Provider Support

Added support for GPT-5, GPT-5.4 models and Codex app-server provider. You can now use the latest OpenAI models for visual understanding and automation. See: [Model Config](./model-config), [Model Strategy](./model-strategy)

### Custom extraBody for Model Requests

A new `extraBody` configuration allows you to pass additional custom parameters in model API requests, useful for specific model deployments or environments. See the [`MIDSCENE_MODEL_EXTRA_BODY_JSON` environment variable](./model-config#advanced-settings-optional) in Advanced Settings.

### `deepThink` Renamed to `deepLocate`

The `deepThink` parameter in element-locating APIs has been renamed to `deepLocate` to better describe its "deep locate" purpose. The original `deepThink` parameter still works but we recommend migrating. See: [API Reference](./api.mdx)

### Skill CLI & Platform Tool Enhancements

- **Skill CLI Custom Interfaces**: Skill CLI now supports custom interfaces for more flexible Skill extensibility. See: [Skills](./skills)
- **Unified MCP Tool Export**: All platform packages (Web, Android, iOS, etc.) now export MidsceneTools uniformly, making MCP integration simpler. See: [MCP](./mcp)
- **iOS App Termination by bundleId**: You can now terminate iOS apps by bundleId, making it easier to reset app state during testing. See: [iOS API Reference](./ios-api-reference)
- **CLI Version Display**: CLI now shows version info in health checks, helping you troubleshoot environment issues

### Task Cancellation Support

`aiAct` now supports `AbortSignal`, allowing you to cancel operations mid-execution instead of waiting for them to complete. See: [API Reference - aiAct](./api.mdx#agentaiact)

### Element Locating Optimization

The `deepLocate` flow has been optimized for better efficiency and accuracy when locating elements in complex interfaces.

### Report & Playback Improvements

- **Faster Large Report Loading**: Screenshots in reports are now lazy-loaded, significantly speeding up reports with many steps
- **Mobile Reports with Device Shells**: Report playback now shows device shells, giving you a more realistic view of mobile automation
- **More Precise Timing**: AI call and action execution timing in reports is now more precise, helping you identify performance bottlenecks

### Stability Improvements

- AI planning now automatically retries once on intermittent parse failures, reducing test interruptions from network issues
- Device health check now includes monitor detection, helping diagnose display issues in headless environments

### Chrome Extension Improvements

- Fixed crash when generating scripts after stopping recording
- Fixed lag during long recording sessions caused by message serialization performance
- Bridge mode now has start/stop control buttons, and fixed connection drops during confirmation

### Bug Fixes

- Fixed MCP server becoming a zombie process with 100% CPU usage in some cases
- Fixed screenshots not retrying when page navigation is in progress
- Fixed text input loss on Android in certain scenarios
- Fixed `aiNumber` returning incorrect results for some formats
- Fixed `aiScroll` throwing errors when called without arguments
- Fixed AutoGLM back/home actions not working correctly across different platforms
- Fixed report display issues when model names contain `/`
- Fixed report player not resetting properly after playback completes
- Fixed Deep Think toggle not reading environment variable configuration in Playground
- Fixed cursor size displaying incorrectly in high-resolution device screenshots
- Fixed Chrome launch path resolution failing on Linux
- Fixed inaccurate element locating on pages with iframes
- Fixed HarmonyOS screen info parsing errors at certain render resolutions
- Fixed device orientation displaying incorrectly after canceling tasks in Playground

## v1.5 - HarmonyOS Support

v1.5 adds HarmonyOS automation support, Qwen3.5 and doubao-seed 2.0 model support, along with multiple improvements to desktop automation, report system, Chrome extension, and more.

### HarmonyOS Automation Support

New `@midscene/harmony` package officially supports HarmonyOS platform automation. Midscene's automation capabilities now extend from Web, Android, iOS, and Desktop to the HarmonyOS ecosystem.

### Qwen3.5 & doubao-seed 2.0 Model Support

Added support for Qwen3.5 and doubao-seed 2.0 models, allowing developers to leverage newer models for better visual understanding.

### Generic Model Reasoning Configuration

New `MIDSCENE_MODEL_REASONING_EFFORT` environment variable provides a generic model reasoning effort configuration, enabling developers to uniformly control reasoning behavior across different models.

### Desktop Automation Improvements

- **Xvfb virtual display support**: Support Xvfb virtual display for headless Linux environments, enabling desktop automation on CI/CD servers without GUI
- **Connection health check**: Added health check during desktop automation connection for improved reliability
- **macOS input optimization**: All text input on macOS now uses clipboard to avoid IME issues
- **Mouse control failure detection**: Automatically detects mouse control failure and warns about admin privilege requirements
- **Stop execution optimization**: Checks destroyed state to abort screenshot operations promptly when stopping execution

### Screenshot & Display Optimization

- **Custom screenshot shrink**: Support custom screenshot shrink ratio to optimize performance while maintaining recognition accuracy
- **Android scalingRatio decoupling**: Decoupled scalingRatio from size() method for improved flexibility

### Report System Improvements

- **More detailed timing**: Finer-grained timing information in reports helps developers analyze performance bottlenecks more precisely
- **Directory mode support for mergeReports**: `mergeReports` now supports directory mode report files

### Chrome Extension Improvements

- **Always decline option**: Chrome extension adds "always decline" option with confirm race condition fix
- **Close Bridge server after CLI**: Bridge server automatically closes after CLI command completes, preventing lingering processes

### Bug Fixes

- Fixed `z.preprocess` handling in input mode schema for correct form rendering
- Fixed Android swipe parameter passing
- Fixed web size calculation
- Fixed `BASE_URL_FIX_SCRIPT` closing tag not recognized by HTML parser
- Fixed undefined page guard in PlaywrightAgent/PuppeteerAgent constructors

## v1.4 - Skills: Let AI Assistants Control Your Devices

v1.4 introduces Midscene Skills — a set of installable skill packs for AI assistants like Claude Code and OpenClaw, enabling them to directly control browsers, desktops, Android, and iOS devices. This release also includes a standalone desktop MCP service, independent CLI entry points for each platform package, enhanced AI planning, and more.

### Midscene Skills — Device Control Skills for AI Assistants

Midscene Skills is a set of skill packs that can be installed into AI assistants like Claude Code and OpenClaw. Once installed, AI assistants can control browsers, desktops, Android, and iOS devices using natural language.

Each platform package (`@midscene/android`, `@midscene/ios`, `@midscene/web`, etc.) now exposes an independent CLI entry point, which is the foundation that Skills is built upon.

**Supported Platforms:**
- Browser (Puppeteer headless mode)
- Chrome Bridge (user's own desktop Chrome)
- Desktop (macOS, Windows, Linux)
- Android (via ADB)
- iOS (via WebDriverAgent)

See: [Midscene Skills](https://github.com/web-infra-dev/midscene-skills)

### Standalone Desktop Automation MCP Package

New `@midscene/computer-mcp` package provides PC desktop automation as a standalone MCP service. Developers can use desktop automation capabilities directly in MCP-compatible tools like Cursor and Trae without additional integration.

See docs: [PC Desktop Automation](./computer-introduction)

### Chrome Extension MCP Background Connection

The Chrome extension now supports background Bridge mode MCP connection, exposing the desktop browser as an MCP tool to AI assistants, further expanding the MCP ecosystem.

### AI Planning Enhancements

- **New `deepLocate` option for `aiAct`**: Enable deep locating during action execution, improving element locating accuracy in complex interfaces
- **Swipe vs DragAndDrop semantic distinction**: The model can now more precisely distinguish between swipe and drag-and-drop operations, reducing gesture planning errors
- **LLM planning page navigation restrictions**: Prevents the model from generating unreasonable page navigation during planning, improving task execution stability
- **AppleScript keyboard input on macOS**: Improved keyboard input stability and compatibility in desktop automation
- **Cursor move action**: New cursor move action support

### YAML Scripts & File Upload Enhancements

- **YAML `aiTap` supports `fileChooserAccept`**: Handle file upload dialogs directly in YAML scripts
- **Directory upload support**: Web supports `webkitdirectory` type folder selection upload

### Chrome Extension Bridge Mode Caching

Bridge mode now supports caching, reusing existing AI planning results to reduce repeated calls and improve debugging efficiency.

### Android Improvements

- Optimized text input logic for improved input stability

### iOS Improvements

- **Playground live screen stream**: iOS Playground now features live screen preview for real-time device monitoring during debugging.

## v1.3 - PC Desktop Automation Support

v1.3 introduces brand new PC desktop automation capabilities, significantly improves Android screenshot performance, and brings multiple enhancements to report system and stability.

### New PC Desktop Automation Support

Midscene now supports PC desktop automation on Windows, macOS, and Linux, driving native keyboard and mouse controls. Whether it's Electron, Qt, WPF, or native desktop applications, they can all be automated through the visual model approach.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/pc-twitter2.mp4" controls/>

**Core Capabilities:**
- **Mouse Operations**: click, double-click, right-click, mouse move, drag and drop
- **Keyboard Input**: text input, key combinations (Cmd/Ctrl/Alt/Shift)
- **Screenshots**: capture screenshots from any monitor
- **Multi-monitor Support**: operate across multiple displays simultaneously

**Usage Methods:**
- Zero-code trial via Computer Playground
- JavaScript SDK for scripting
- YAML automation scripts and CLI tools
- HTML report playback for all operation paths

See documentation: [PC Desktop Automation](./computer-introduction)

### Major Android Screenshot Performance Improvement

With Scrcpy screenshot mode enabled, screenshot time drops from 500–2000ms to **100–200ms**, significantly improving Android automation response speed. This is particularly useful for remote device debugging and high frame rate scenarios.

See documentation: [Scrcpy Screenshot Mode](./android-api-reference#scrcpy)

### Deep Thinking Mode Enhancement

The `aiAct` deep thinking (deepThink) mode now not only helps with element location but also optimizes overall task planning, achieving better execution results in complex forms and multi-step workflows.

### Report Experience Optimization

- **Timeline Collapse**: New collapse toggle button for easier viewing of long task flows
- **Time Unit Changed to Seconds**: More readable
- **Step Sync Highlighting**: Sidebar step highlighting syncs in real-time with player playback
- **Reduced Memory Usage**: Optimized report generation mechanism to effectively reduce runtime memory usage

### Mobile Platform Improvements

#### Android
- More stable special character and Unicode input
- More relaxed app package name matching for Launch action (ignores case and spaces)
- Auto-retry when screenshot anomalies occur on certain devices

#### iOS
- More relaxed Bundle ID matching (ignores case and spaces)

### Web Automation Improvements

- Fixed issue where Puppeteer could hang when taking screenshots of inactive tabs
- Fixed inaccurate window size in headed mode
- `shareBrowserContext` mode now supports preserving localStorage and sessionStorage
- Playwright multi-project configuration automatically distinguishes test cases by browser in reports
- Fixed `typeOnly` mode not working in YAML script input actions

### Other Improvements

- Image processing performance improved
- SVG icon cache issue fixed
- Playground now displays specific reasons for model configuration errors

## v1.2 - Zhipu AI Open-Source Model Support and File Upload Support

v1.2 introduces support for Zhipu AI open-source models, adds file upload functionality, and fixes several issues affecting user experience, making automated testing more reliable.

### New Zhipu AI Open-Source Model Support

#### Zhipu GLM-V Vision Model
- Zhipu GLM-V series models are open-source vision models launched by Zhipu AI, available in multiple parameter versions, supporting both cloud deployment and local deployment.
- See: [GLM-V Model Configuration](./model-common-config.mdx#glm-v)

#### Zhipu AutoGLM Mobile Automation Model
- Zhipu AutoGLM is an open-source mobile automation model launched by Zhipu AI. It can understand mobile screen content based on natural language instructions, and combined with intelligent planning capabilities, generate operation processes to complete user needs.
- See: [AutoGLM Model Configuration](./model-common-config.mdx#auto-glm)

### File upload feature

File upload is a common requirement in Web automation scenarios. v1.2 adds file upload capability for the web, supporting natural language operations for file input boxes, making form automation more complete.

See: [aiTap file upload](./api.mdx#agentaitap)

### Cache mechanism optimization

Fixed the issue where cache wasn't updated after DOM changes. When page DOM changes cause cache validation to fail, the system now automatically updates the cache, avoiding operation failures due to stale cache and improving automation script stability.

### Report and Playground improvements

#### Deep thinking tag optimization
- Fixed the issue where deepThink tags weren't displayed correctly in reports when using `.aiAct()` method with deep thinking. Now you can clearly see which operations used deep thinking capability in reports
- Improved the style of summary rows in reports for better readability

#### Playground stability improvements
- Fixed the issue where Playground didn't properly create agent instances in `getActionSpace` when using agentFactory mode, ensuring normal operation across various usage modes
- Optimized Playground output display to prevent overly long reportHTML content from affecting the interface

### Model configuration updates

Updated configuration parameters for Qwen model's deep thinking functionality to ensure compatibility with the latest model version.

## v1.1 - `aiAct` deep thinking and extensible MCP SDK

v1.1 optimizes model planning capabilities and MCP extensibility, making automation more stable in complex scenarios while providing more flexible solutions for enterprise MCP service deployments.

### `aiAct` can enable deep thinking (deepThink)

When deep thinking is enabled in `aiAct`, the model will interpret intent more thoroughly and optimize its planning results. This is suited for complex forms, multi-step flows, and similar scenarios. It improves accuracy but increases planning latency.

Currently supported: Qwen3-vl on Alibaba Cloud and Doubao-vision on Volcano Engine. See [Model strategy](./model-strategy) for details.

Example usage:

```typescript
await agent.aiAct('If the UI shows an "Add shipping address" button, expand the existing "Shipping address" list and select the last item', { deepThink: true });
```

### MCP extension and SDK exposure

Developers can use the MCP SDK exposed by Midscene to flexibly deploy a public MCP service. This capability applies to Agent instances on any platform.

Typical application scenarios:
- Run MCP in enterprise intranet to control private device pools
- Package Midscene capabilities as internal microservices for multiple teams
- Extend custom automation toolchains

See documentation: [MCP Services](./mcp)

### Chrome extension improvements
- Fixed potential event loss during recording, improving recording stability
- Optimized coordinate passing in `describeElement` for better element description accuracy

### CLI and configuration enhancements
- **File parameter support**: Fixed CLI issue where `--files` parameter wasn't properly handled when `--config` was specified; now they can be flexibly combined
- **Dynamic configuration**: Fixed Playground not reading the `MIDSCENE_REPLANNING_CYCLE_LIMIT` environment variable properly

### iOS Agent compatibility improvements
- Optimized `getWindowSize` method to automatically fall back to legacy endpoint when newer API is unavailable, improving compatibility with WebDriverAgent versions

### Report and Playground improvements
- Fixed issue where report wasn't properly initialized before accessing screen properties
- Fixed abnormal behavior of stop function in Playground
- Improved error handling during video export to avoid crashes caused by frame cancel

Thanks to contributors: @FriedRiceNoodles

## v1.0 - Midscene v1.0 is here!

Midscene v1.0 is here! Try it out today and see how it can help you automate your workflows.

### See our new [Showcases](./showcases) page for real-world examples

Register the GitHub form autonomously in a web browser and pass all field validations:

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github2.mp4" height="300" controls />

Plus these real-world showcases:
* [iOS Automation - Meituan coffee order](./showcases#ios)
* [iOS Automation - Auto-like the first @midscene_ai tweet](./showcases#ios)
* [Android Automation - DCar: Xiaomi SU7 specs](./showcases#android)
* [Android Automation - Booking a hotel for Christmas](./showcases#android)
* [MCP Integration - Midscene MCP UI prepatch release](./showcases#mcp)

Some community developers have successfully built on Midscene's capability to [integrate with any interface](./integrate-with-any-interface), extending it with a robotic arm plus vision and voice models for in-vehicle large-screen testing scenarios. See the video below.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/AI_Vision_Powered_Robotic_Arm.mp4" height="300" controls />

### 🚀 Pure vision path

Starting in v1.0, Midscene fully adopts a visual-understanding approach to deliver more stable UI automation. Visual models provide:

- **Stable results**: Leading vision models (Doubao Seed 1.6, Qwen3-VL, etc.) are reliable enough for most production needs
- **UI workflow planning**: Vision models generally excel at planning UI flows and can handle many complex task sequences
- **Works everywhere**: Automation no longer depends on the rendering stack—Android, iOS, desktop apps, or a browser `<canvas>`: if you can capture a screenshot, Midscene can interact with it
- **Developer-friendly**: Dropping selectors and DOM keeps prompts simpler; teammates unfamiliar with rendering tech can become productive quickly
- **Far fewer tokens**: Removing DOM extraction cuts token usage by about 80%, lowering cost and speeding up local runs
- **Open-source options**: Open-source vision models like Qwen3-VL 8B/30B perform well, enabling self-hosted deployments

See our updated [Model strategy](./model-strategy) for details.

### 🚀 Better results by multiple model combinations

Beyond the default interaction intent, Midscene defines Planning and Insight intents, and developers can enable dedicated models for each. For example, you can use a GPT model for planning while using the default Qwen3-VL model for element localization.

Multi-model combinations let you scale up handling of complex requirements as needed.

### 🚀 Runtime architecture optimization

* Reuse portions of context to reduce device-info calls and improve runtime performance
* Optimize Action Space combinations for Web and mobile environments to provide models with a more useful toolset

### 🚀 Report improvements

* Parameter view: mark interaction parameter locations, merge screenshot context, and identify model planning results faster
* Style updates: dark mode report rendering for better readability
* Token usage display: summarize token consumption by model to analyze cost across scenarios

### 🚀 MCP architecture redesign

We redefined Midscene MCP services around vision-driven UI operations. Each Action in the iOS / Android / Web Action Space is exposed as an MCP tool, providing atomic operations so developers can focus on higher-level Agents without worrying about UI operation details, while keeping success rates high. See [MCP architecture](./mcp).

### 🚀 Mobile automation

#### iOS improvements
- Added compatibility across WebDriverAgent 5.x–7.x
- Added WebDriver Clear API support to solve dynamic input field issues
- Improved device compatibility

#### Android improvements
- Added screenshot polling fallback to improve remote device stability
- Added automatic screen-orientation adaptation (displayId screenshots)
- Added YAML script support for `runAdbShell`

#### Cross-platform
- Expose system operation helpers on the Agent instance, including Home, Back, RecentApp, and more

### 🚧 API changes

Method renames (backward compatible)
- Renamed `aiAction()` → `aiAct()` (old method kept with deprecation warning)
- Renamed `logScreenshot()` → `recordToReport()` (old method kept with deprecation warning)

Environment variable renames (backward compatible)
- Renamed `OPENAI_API_KEY` → `MIDSCENE_MODEL_API_KEY` (new variable preferred, old variable as fallback)
- Renamed `OPENAI_BASE_URL` → `MIDSCENE_MODEL_BASE_URL` (new variable preferred, old variable as fallback)

### ⬆️ Upgrade to the latest version

Upgrade only the packages you use. For example:

`npm install @midscene/web@latest`
`npm install @midscene/android@latest`
`npm install @midscene/ios@latest`

If you use the CLI installed globally:

`npm i -g @midscene/cli`

## v0.30 - Cache management upgrade and mobile experience optimization

### More flexible cache strategy

v0.30 improves the cache system, allowing you to control cache behavior based on actual needs:

- **Multiple cache modes available**: Supports read-only, write-only, and read-write strategies. For example, use read-only mode in CI environments to reuse cache, and use write-only mode in local development to update cache
- **Automatic cleanup of unused cache**: Agent can automatically clean up unused cache records when destroyed, preventing cache files from accumulating
- **Simplified unified configuration**: Cache configuration parameters for CLI and Agent are now unified, no need to remember different configurations

### Report management convenience

- **Support for merging multiple reports**: In addition to playwright scenarios, all scenarios now support merging multiple automation execution reports into a single file for centralized viewing and sharing of test results

### Mobile automation optimization

#### iOS platform improvements
- **Real device support improvement**: Removed simctl check restriction, making iOS real device automation smoother
- **Auto-adapt device display**: Implemented automatic device pixel ratio detection, ensuring accurate element positioning on different iOS devices

#### Android platform enhancements
- **Flexible screenshot optimization**: Added `screenshotResizeRatio` option, allowing you to customize screenshot size while ensuring visual recognition accuracy, reducing network transmission and storage overhead
- **Screen info cache control**: Use `alwaysRefreshScreenInfo` option to control whether to fetch screen information each time, allowing cache reuse in stable environments to improve performance
- **Direct ADB command execution**: AndroidAgent added `runAdbCommand` method for convenient execution of custom device control commands

#### Cross-platform consistency
- **ClearInput support on all platforms**: Solves the problem of AI being unable to accurately plan clear input operations across platforms

### Feature enhancements

- **Failure classification**: CLI execution results can now distinguish between "skipped failures" and "actual failures", helping locate issue causes
- **aiInput append mode**: Added `append` option to append input while preserving existing content, suitable for editing scenarios
- **Chrome extension improvements**:
  - Popup mode preference saved to localStorage, remembering your choice on next open
  - Bridge mode supports auto-connect, reducing manual operations
  - Support for GPT-4o and non-visual language models

### Type safety improvements

- **Zod schema validation**: Introduced type checking for action parameters, detecting parameter errors during development to avoid runtime issues
- **Number type support**: Fixed `aiInput` support for number type values, making type handling more robust

### Bug fixes

- Fixed potential issues caused by Playwright circular dependencies
- Fixed issue where `aiWaitFor` as the first statement could not generate reports
- Improved video recorder delay logic to ensure the last frame is captured
- Optimized report display logic to view both error information and element positioning information simultaneously
- Fixed issue where `cacheable` option in `aiAction` subtasks was not properly passed

### Community

- Awesome Midscene section added [midscene-java](./awesome-midscene.md) community project

## v0.29 - iOS platform support added

### iOS platform support added
The biggest highlight of v0.29 is the official introduction of iOS platform support! Now you can connect and automate iOS devices through WebDriver, extending Midscene's powerful AI automation capabilities to the Apple ecosystem, details: [Support iOS automation](./ios-introduction).

### Qwen3-VL model adaptation

We've adapted the latest Qwen `Qwen3-VL` model, giving developers faster and more accurate visual understanding capabilities. See [Model strategy](./model-strategy).

### AI core capability enhancement

- **UI-TARS Model Performance Optimization**: Optimized aiAct planning, improved dialogue history management, and provided better context awareness capabilities
- **AI Assertion and Action Optimization**: We updated the prompt for `aiAssert` and optimized the internal implementation of `aiAct`, making AI-driven assertions and action execution more precise and reliable

### Reporting and debugging experience optimization
- **URL Parameter Playback Control**: To improve debugging experience, you can now directly control the default behavior of report playback through URL parameters

### Documentation
- Updated documentation deployment cache strategy to ensure users can access the latest documentation content in time

## v0.28 - Build your own GUI automation agent by integrating with your own interface (preview feature)

### Support for integration with any interface (preview feature)

v0.28 introduces the capability to integrate with your own interface. Define an interface controller class that conforms to the `AbstractInterface` definition, and you can get a fully-featured Midscene Agent.

The typical use case for this feature is to build a GUI automation Agent for your own interface, such as IoT devices, in-house applications, car displays, etc.!

Combined with the universal Playground architecture and SDK enhancement features, developers can conveniently debug custom devices.

For more information, please refer to [Integrate with Any Interface (Preview Feature)](./integrate-with-any-interface.mdx)

### Android platform optimization
- **Planning Cache Support**: Added planning cache functionality for Android platform, improving execution efficiency
- **Input Strategy Enhancement**: Optimized input clearing strategy based on IME settings, improving Android platform input experience
- **Scroll Calculation Improvement**: Optimized scroll endpoint calculation algorithm for Android platform

### Gesture operation extension
- **Double-Click Operation Support**: Added support for double-click actions
- **Long Press and Swipe Gestures**: Added support for long press and swipe gestures

### Core function enhancement
- **Agent Configuration Isolation**: Implemented model configuration isolation between different agents, avoiding configuration conflicts
- **Execution Option Extension**: Added useCache and replanningCycleLimit configuration options for Agent, providing more fine-grained control
- **YAML Script Support**: Support for running universal custom devices through YAML scripts, enhancing automation capabilities

### Bug fixes
- Fixed Qwen model search region size issues
- Optimized deepThink parameter handling and rectangle size calculation
- Resolved issues related to Playwright double-click operations
- Improved TEXT action type processing logic

### Documentation and community
- Added custom interface documentation to help developers better extend functionality
- Added [Awesome Midscene](./awesome-midscene.md) section in README to showcase community projects

## v0.27 - Core module refactoring, assertions and reports functionally enhanced

### Core module refactoring

Based on the introduction of [Rslib](https://github.com/web-infra-dev/rslib) in v0.26 to improve development experience and reduce contribution thresholds, v0.27 takes it a step further by refactoring the core modules on a large scale. This makes it extremely easy to extend new devices and add new AI operations, and we sincerely welcome community developers to contribute!

**Due to the wide scope of this refactoring, please feel free to report any issues you encounter after upgrading, and we will address them promptly.**

### API enhancement

- **`aiAssert` Functionally Enhanced**
  - New `name` field allows naming different assertion tasks, making it easier to identify and parse in JSON output results
  - New `domIncluded` and `screenshotIncluded` options allow flexible control over whether to send DOM snapshots and page screenshots to AI

### Chrome extension playground upgrade

- All Agent APIs can be directly debugged and run in the Playground! Interactive, extraction, and verification cover three major categories of methods, with visual operations and verification that boost your automation development efficiency! Come experience the truly versatile AI automation platform! 🚀

### Report function optimization
- **New Marking Layer Switch**: The report player has added a switch to hide the marking layer, allowing users to view the original page view without obstruction when playing back.

### Bug fixes
- Fixed the problem that `aiWaitFor` sometimes caused the report to not be generated
- Reduced memory consumption of Playwright plugin


## v0.26 - Toolchain fully integrated [Rslib](https://github.com/web-infra-dev/rslib), greatly improving development experience and reducing contribution threshold

### Web integration optimization
- Support freezing page context([freezePageContext](./api.mdx#agentfreezepagecontext)/[unfreezePageContext](./api.mdx#agentunfreezepagecontext)), so that all subsequent operations reuse the same page snapshot, avoiding repeated page status acquisition
- Add all agent APIs to Playwright fixture, simplify test script writing, and solve the problem of not generating reports when using agentForPage

### Android automation enhancement
- New keyboard hiding strategy([keyboardDismissStrategy](./android-getting-started#androiddevice-constructor)), allowing you to specify the way to automatically hide the keyboard

### Report function optimization
- Report content lazy parsing, solving the problem of report crash when the report is large
- Report player adds automatic zoom switch, making it easier to view the global perspective playback
- Support aiAssert / aiQuery tasks in report playback, to fully show the entire page change process
- Fix the problem that the sidebar status is not displayed as a failure icon when the assertion fails
- Fix the problem that the drop-down filter in the report cannot be switched

### Build and engineering
- Build tool migration to [Rslib](https://github.com/web-infra-dev/rslib) library development tool, improving build efficiency and development experience
- Full repository source code jump, making it easier for developers to view source code
- MCP npm package product volume optimization, from 56M to 30M, greatly improving loading speed

### Bug fixes
- CLI automatically opens headed mode when keepWindow is true
- Fix the implementation problem of getGlobalConfig, solve the problem of abnormal environment variable initialization
- Ensure that the mime-type in base64 encoding is correct
- Fix the return value type of aiAssert task

## v0.25 - Support using images as AI prompt input

### Core function enhancement
- New worker runtime support, support running in worker environment
- Support using images as AI prompt input, see [Prompting with images](./api.mdx#prompting-with-images)
- Image processing upgrade, using Photon & Sharp for efficient image cropping

### Web integration optimization
- Get XPath by coordinates, improve cache reproducibility
- Cache file moves plan module to the front, improving readability
- Chrome Recorder supports exporting all events to markdown documents
- agent supports specifying HTML report name, see [reportFileName](./api.mdx)

### Android automation enhancement
- Long press gesture support
- Pull-to-refresh support

### Bug fixes
- Use global config to handle environment variables, avoid issues caused by multiple packaging
- Manually construct error information when error object serialization fails
- Fix playwright report type dependency declaration order issue
- Fix MCP packaging issue

### Documentation AI-friendly
- [LLMs.txt](./llm-txt.mdx) is now available in both Chinese and English, making it easier for AI to understand
- Each document now has a copy-to-markdown button, making it easier to feed to AI

### Other function enhancement
- Chrome Recorder supports aiScroll function
- Refactor aiAssert to be consistent with aiBoolean

## v0.24 - MCP for Android automation

### MCP for Android automation
- You can now use Midscene MCP to automate Android apps, just like you use it for web apps. Read more: [MCP for Android Automation](./mcp#android-device-management)

### Optimization
- For Mac platform Puppeteer, a double input clearing mechanism has been added to ensure that the input box is cleared before input

### Development experience
- Simplify the way to build `htmlElement.js` to avoid report template build issues caused by circular dependencies
- Optimize development workflow, just use `npm run dev` to enter midscene project development


## v0.23 - New report style and YAML script ability enhancement

### Report system upgrade
#### New report style
- New report style design, providing clearer and more beautiful test result display
- Optimize report layout and visual effects, improve user reading experience
- Enhance report readability and information hierarchy structure

![](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/new%20report.png)

### YAML script ability enhancement

#### Support multiple YAML files batch execution
- New config mode support, support configure Yaml file running order, browser reuse strategy, parallelism
- Support getting JSON format running results

![](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/Tuji_20250722_161353.338.png)

### Test coverage enhancement

#### Android test enhancement
- New Android platform related test cases, improve code quality and stability
- Improve test coverage, ensure the reliability of Android features

## v0.22- Chrome extension recording function released

### Web integration enhancement

#### New recording function
- Chrome extension adds recording function, which can record user operations on the page and generate automation scripts
- Support recording click, input, scroll and other common operations, greatly reducing the threshold for writing automation scripts
- The recorded operations can be directly played back and debugged in the Playground

#### Upgrade to IndexedDB for storage
- Chrome extension's Playground and Bridge now use IndexedDB for data storage
- Compared to the previous storage scheme, it provides larger storage capacity and better performance
- Support storing more complex data structures, laying the foundation for future feature extensions

#### Customize replanning cycle limit
- Set the `MIDSCENE_REPLANNING_CYCLE_LIMIT` environment variable to customize the maximum number of re-planning cycles allowed when executing operations (aiAct).
- The default value is 10. When the AI needs to re-plan more than this limit, an error will be thrown and suggest splitting the task.
- Provide more flexible task execution control, adapting to different automation scenarios

```bash
export MIDSCENE_REPLANNING_CYCLE_LIMIT=10 # default value is 10
```

### Android interaction optimization

#### New screenshot path generation
- Generate a unique file path for each screenshot to avoid file overwrite issues
- Improve stability in concurrent test scenarios

## v0.21 - Chrome extension UI upgrade

### Web integration enhancement

#### New chat-style user interface

- New chat-style user interface design for better user experience

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/recording_2025-07-07_08-16-16.mp4" controls/>

#### Flexible timeout configuration

- Supports overriding timeout settings from test fixture, providing more flexible timeout control
- Applicable scenarios: Different test cases require different timeout settings

#### Unified Puppeteer and Playwright configuration

- New `waitForNavigationTimeout` and `waitForNetworkIdleTimeout` parameters for Playwright
- Unified timeout options configuration for Puppeteer and Playwright, providing consistent API experience, reducing learning costs

#### New data export callback mechanism

- New `agent.onDumpUpdate` callback function, can get real-time notification when data is exported
- Refactored the post-task processing flow to ensure the correct execution of asynchronous operations
- Applicable scenarios: Monitoring or processing exported data

### Android interaction optimization

#### Input experience improvement

- Changed click input to slide operation, improving interaction response and stability
- Reduced operation failures caused by inaccurate clicks

## v0.20 - Support for assigning XPath to locate elements

### Web integration enhancement

#### New `aiAsk` method

- Allows direct questioning of the AI model to obtain string-formatted answers for the current page.
- Applicable scenarios: Tasks requiring AI reasoning such as Q&A on page content and information extraction.
- Example:

```typescript
await agent.aiAsk('any question')
```

#### Support for passing XPath to locate elements

- Location priority: Specified XPath > Cache > AI model location.
- Applicable scenarios: When the XPath of an element is known and the AI model location needs to be skipped.
- Example:

```typescript
await agent.aiTap('submit button', { xpath: '//button[@id="submit"]' })
```

### Android improvement

#### Playground tasks can be cancelled

- Supports interrupting ongoing automation tasks to improve debugging efficiency.

#### Enhanced `aiLocate` API

- Returns the Device Pixel Ratio, which is commonly used to calculate the real coordinates of elements.

### Report generation optimization

Improve report generation mechanism, from batch storage to single append, effectively reducing memory usage and avoiding memory overflow when the number of test cases is large.


## v0.19 - Support for getting complete execution process data

### New API for getting Midscene execution process data

Add the `_unstableLogContent` API to the agent. Get the execution process data of Midscene, including the time of each step, the AI tokens consumed, and the screenshot.

The report is generated based on this data, which means you can customize your own report using this data.

Read more: [API documentation](./api.mdx#agent_unstablelogcontent)

### CLI support for adjusting Midscene env variable priority

By default, `dotenv` does not override the global environment variables in the `.env` file. If you want to override, you can use the `--dotenv-override` option.

Read more: [Use YAML-based Automation Scripts](./automate-with-scripts-in-yaml.mdx#use-env-file-to-override-global-environment-variables)

### Reduce report file size

Reduce the size of the generated report by trimming redundant data, significantly reducing the report file size for complex pages. The typical report file size for complex pages has been reduced from 47.6M to 15.6M!

## v0.18 - Enhanced reporting features

🚀 Midscene has another update! It makes your testing and automation processes even more powerful:

### Custom node in report

* Add the `recordToReport` API to the agent. Take a screenshot of the current page as a report node, and support setting the node title and description to make the automated testing process more intuitive. Applicable for capturing screenshots of key steps, error status capture, UI validation, etc.

![](/blog/recordToReport-api.png)

* Example:

```javascript
test('login github', async ({ ai, aiAssert, aiInput, recordToReport }) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }
  await ai('Click the "Sign in" button');
  await aiInput('quanru', 'username');
  await aiInput('123456', 'password');

  // log by your own
  await recordToReport('Login page', {
    content: 'Username is quanru, password is 123456',
  });

  await ai('Click the "Sign in" button');
  await aiAssert('Login success');
});
```

### Support for downloading reports as videos

* Support direct video download from the report player, just by clicking the download button on the player interface.

![](/blog/export-video.png)

* Applicable scenarios: Share test results, archive reproduction steps, and demonstrate problem reproduction.

### More Android configurations exposed

* Optimize input interactions in Android apps and allow connecting to remote Android devices

  * `autoDismissKeyboard?: boolean` - Optional parameter. Whether to automatically dismiss the keyboard after entering text. The default value is true.

  * `androidAdbPath?: string` - Optional parameter. Used to specify the path of the adb executable file.

  * `remoteAdbHost?: string` - Optional parameter. Used to specify the remote adb host.

  * `remoteAdbPort?: number` - Optional parameter. Used to specify the remote adb port.

* Examples:

```typescript
await agent.aiInput('Search Box', 'Test Content', { autoDismissKeyboard: true })
```

```typescript
const agent = await agentFromAdbDevice('s4ey59', {
    autoDismissKeyboard: false, // Optional parameter. Whether to automatically dismiss the keyboard after entering text. The default value is true.
    androidAdbPath: '/usr/bin/adb', // Optional parameter. Used to specify the path of the adb executable file.
    remoteAdbHost: '192.168.10.1', // Optional parameter. Used to specify the remote adb host.
    remoteAdbPort: '5037' // Optional parameter. Used to specify the remote adb port.
})
```

Upgrade now to experience these powerful new features!

* [Custom Report Node API documentation](/en/api.mdx#log-screenshot)

* [API documentation for more Android configuration items](/en/android-getting-started.mdx#androiddevice-constructor)


## v0.17 - Let AI see the DOM of the page

### Data query API enhanced

To meet more automation and data extraction scenarios, the following APIs have been enhanced with the `options` parameter, supporting more flexible DOM information and screenshots:

- `agent.aiQuery(dataDemand, options)`
- `agent.aiBoolean(prompt, options)`
- `agent.aiNumber(prompt, options)`
- `agent.aiString(prompt, options)`

#### New `options` parameter

- `domIncluded`: Whether to pass the simplified DOM information to AI model, default is off. This is useful for extracting attributes that are not visible on the page, like image links.
- `screenshotIncluded`: Whether to pass the screenshot to AI model, default is on.

#### Code example

```typescript
// Extract all contact information (including hidden avatarUrl attributes)
const contactsData = await agent.aiQuery(
  "{name: string, id: number, company: string, department: string, avatarUrl: string}[], extract all contact information including hidden avatarUrl attributes",
  { domIncluded: true }
);

// Check if the id attribute of the first contact is 1
const isId1 = await agent.aiBoolean(
  "Is the first contact's id is 1?",
  { domIncluded: true }
);

// Get the ID of the first contact (hidden attribute)
const firstContactId = await agent.aiNumber("First contact's id?", { domIncluded: true });

// Get the avatar URL of the first contact (invisible attribute on the page)
const avatarUrl = await agent.aiString(
  "What is the Avatar URL of the first contact?",
  { domIncluded: true }
);
```

### New right-click ability

Have you ever encountered a scenario where you need to automate a right-click operation? Now, Midscene supports a new `agent.aiRightClick()` method!

#### Function

Perform a right-click operation on the specified element, suitable for scenarios where right-click events are customized on web pages. Please note that Midscene cannot interact with the browser's native context menu after right-click.

#### Parameter description

- `locate`: Describe the element you want to operate in natural language
- `options`: Optional, supports `deepThink` (AI fine-grained positioning) and `cacheable` (result caching)

#### Example

```typescript
// Right-click on a contact in the contacts application, triggering a custom context menu
await agent.aiRightClick("Alice Johnson");

// Then you can click on the options in the menu
await agent.aiTap("Copy Info"); // Copy contact information to the clipboard
```

### A complete example

In this report file, we show a complete example of using the new `aiRightClick` API and new query parameters to extract contact data including hidden attributes.

Report file: [puppeteer-2025-06-04_20-34-48-zyh4ry4e.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/puppeteer-2025-06-04_20-34-48-zyh4ry4e.html)

The corresponding code can be found in our example repository: [puppeteer-demo/extract-data.ts](https://github.com/web-infra-dev/midscene-example/blob/main/puppeteer-demo/extract-data.ts)


### Refactor cache

Use xpath cache instead of coordinates, improve cache hit rate.

Refactor cache file format from json to yaml, improve readability.

## v0.16 - Support MCP

### Midscene MCP

🤖 Use Cursor / Trae to help write test cases.
🕹️ Quickly implement browser operations akin to the Manus platform.
🔧 Integrate Midscene capabilities swiftly into your platforms and tools.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/ozpmyhn_lm_hymuPild/ljhwZthlaukjlkulzlp/midscene/en-midscene-mcp-Sauce-Demo.mp4" controls/>

Read more: [MCP](./mcp#choosing-your-environment)

### Support structured API for agent

APIs: `aiBoolean`, `aiNumber`, `aiString`, `aiLocate`

Read more: [Use JavaScript to Optimize the AI Automation Code](./use-javascript-to-optimize-ai-automation-code.md)

## v0.15 - Android automation unlocked!

### Android automation unlocked!

🤖 AI Playground: natural‑language debugging
📱 Supports native, Lynx & WebView apps
🔁 Replayable runs
🛠️ YAML or JS SDK
⚡ Auto‑planning & Instant Actions APIs

Read more: [Android automation](./android-introduction)

### More features

* Allow custom midscene_run dir
* Enhance report filename generation with unique identifiers and support split mode
* Enhance timeout configurations and logging for network idle and navigation
* Adapt for gemini-2.5-pro

## v0.14 - Instant actions

"Instant Actions" introduces new atomic APIs, enhancing the accuracy of AI operations.

Read more: [Instant Actions](./blog-introducing-instant-actions-and-deep-think.md)

## v0.13 - DeepThink mode

### Atomic AI interaction methods

* Supports aiTap, aiInput, aiHover, aiScroll, and aiKeyboardPress for precise AI actions.

### DeepThink mode

* Enhances click accuracy with deeper contextual understanding.

![](/blog/0.13.jpeg)

## v0.12 - Integrate Qwen 2.5 VL

### Integrate Qwen 2.5 VL's native capabilities

* Keeps output accuracy.
* Supports more element interactions.
* Cuts operating cost by over 80%.

## v0.11.0 - UI-TARS model caching

### UI-TARS model support caching

* Enable caching by document 👉 : [Enable Caching](./caching.mdx)

* Enable effect

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/antd-form-cache.mp4" controls/>

![](/blog/0.11.0.png)

### Optimize DOM tree extraction strategy

* Optimize the information ability of the dom tree, accelerate the inference process of models like GPT 4o

![](/blog/0.11.0-2.png)


## v0.10.0 - UI-TARS model released

UI-TARS is a Native GUI agent model released by the **Seed** team. It is named after the [TARS robot](https://interstellarfilm.fandom.com/wiki/TARS) in the movie [Star Trek](https://en.wikipedia.org/wiki/Star_Trek), which has high intelligence and autonomous thinking capabilities. UI-TARS **takes images and human instructions as input information**, can correctly perceive the next action, and gradually approach the goal of human instructions, leading to the best performance in various benchmark tests of GUI automation tasks compared to open-source and closed-source commercial models.

![](/blog/0.10.0.png)

UI-TARS: Pioneering Automated GUI Interaction with Native Agents - Figure 1

![](/blog/0.10.0-2.png)

UI-TARS: Pioneering Automated GUI Interaction with Native - Figure 4

### Model advantage

UI-TARS has the following advantages in GUI tasks:

* **Target-driven**

* **Fast inference speed**

* **Native GUI agent model**

* **Private deployment without data security issues**


## v0.9.0 - Bridge mode released

With the Midscene browser extension, you can now use scripts to link with the desktop browser for automated operations!

We call it "Bridge Mode".

Compared to previous CI environment debugging, the advantages are:

1. You can reuse the desktop browser, especially Cookie, login state, and front-end interface state, and start automation without worrying about environment setup.

2. Support manual and script cooperation to improve the flexibility of automation tools.

3. Simple business regression, just run it locally with Bridge Mode.

![](/blog/0.9.0.png)

Documentation: [Use Chrome Extension to Experience Midscene](./bridge-mode.mdx)


## v0.8.0 - Chrome extension

### New Chrome extension, run Midscene anywhere

Through the Midscene browser extension, you can run Midscene on any page, without writing any code.

Experience it now 👉: [Use Chrome Extension to Experience Midscene](./quick-experience.mdx)

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/Midscene_extension.mov" controls/>



## v0.7.0 - Playground ability

### Playground ability, debug anytime

Now you don't have to keep re-running scripts to debug prompts!

On the new test report page, you can debug the AI execution results at any time, including page operations, page information extraction, and page assertions.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-playground.mov" controls/>


## v0.6.0 - Doubao model support

### Doubao model support

* Support for calling Doubao models, reference the environment variables below to experience.

```bash
MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"https://xxx.net/api/v3","apiKey":"xxx"}'
MIDSCENE_MODEL_NAME='ep-20240925111815-mpfz8'
MIDSCENE_MODEL_TEXT_ONLY='true'
```

Summarize the availability of Doubao models:

* Currently, Doubao only has pure text models, which means "seeing" is not available. In scenarios where pure text is used for reasoning, it performs well.

* If the use case requires combining UI analysis, it is completely unusable


Example:

✅ The price of a multi-meat grape (can be guessed from the order of the text on the interface)

✅ The language switch text button (can be guessed from the text content on the interface: Chinese, English text)

❌ The left-bottom play button (requires image understanding, failed)

### Support for GPT-4o structured output, cost reduction

By using the gpt-4o-2024-08-06 model, Midscene now supports structured output (structured-output) features, ensuring enhanced stability and reduced costs by 40%+.

Midscene now supports hitting GPT-4o prompt caching features, and the cost of AI calls will continue to decrease as the company's GPT platform is deployed.

### Test report: support animation playback

Now you can view the animation playback of each step in the test report, quickly debug your running script

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-play-all.mp4" controls/>

### Speed up: merge plan and locate operations, response speed increased by 30%

In the new version, we have merged the Plan and Locate operations in the prompt execution to a certain extent, which increases the response speed of AI by 30%.

> Before

![](/blog/0.6.0.png)

> after

![](/blog/0.6.0-2.png)

### Test report: the accuracy of different models

* GPT 4o series models, 100% correct rate

* doubao-pro-4k pure text model, approaching usable state

![](/blog/0.6.0-3.png)

![](/blog/0.6.0-4.png)

### Problem fix

* Optimize the page information extraction to avoid collecting obscured elements, improving success rate, speed, and AI call cost 🚀

> before

![](/blog/0.6.0-5.png)

> after

![](/blog/0.6.0-6.png)


## v0.5.0 - Support GPT-4o structured output

### New features

* Support for gpt-4o-2024-08-06 model to provide 100% JSON format limit, reducing Midscene task planning hallucination behavior

![](/blog/0.5.0.png)

* Support for Playwright AI behavior real-time visualization, improve the efficiency of troubleshooting

![](/blog/0.5.0-2.png)

* Cache generalization, cache capabilities are no longer limited to playwright, pagepass, puppeteer can also use cache

```diff
- playwright test --config=playwright.config.ts
# Enable cache
+ MIDSCENE_CACHE=true playwright test --config=playwright.config.ts
```

* Support for azure openAI

* Support for AI to add, delete, and modify the existing input

### Problem fix

* Optimize the page information extraction to avoid collecting obscured elements, improving success rate, speed, and AI call cost 🚀

* During the AI interaction process, unnecessary attribute fields were trimmed, reducing token consumption.

* Optimize the AI interaction process to reduce the likelihood of hallucination in KeyboardPress and Input events

* For pagepass, provide an optimization solution for the flickering behavior that occurs during the execution of Midscene

```javascript
// Currently, pagepass relies on a too low version of puppeteer, which may cause the interface to flicker and the cursor to be lost. The following solution can be used to solve this problem
const originScreenshot = puppeteerPage.screenshot;
puppeteerPage.screenshot = async (options) => {
  return await originScreenshot.call(puppeteerPage, {
    ...options,
    captureBeyondViewport: false
  });
};
```

## v0.4.0 - Support CLI usage

### New features

* Support for Cli usage, reducing the usage threshold of Midscene

```bash
# Headed mode (visible browser) access baidu.com and search "weather"
npx @midscene/cli --headed --url https://www.baidu.com --action "input 'weather', press enter" --sleep 3000

# Visit GitHub status page and save the status to ./status.json
npx @midscene/cli --url https://www.githubstatus.com/ \
  --query-output status.json \
  --query '{serviceName: string, status: string}[], github page status, return service name'
```

* Support for AI to wait for a certain time to continue the subsequent task execution

* Playwright AI task report shows the overall time and aggregates AI tasks by test group

### Problem fix

* Optimize the AI interaction process to reduce the likelihood of hallucination in KeyboardPress and Input events


## v0.3.0 - Support AI report HTML

### New features

* Generate html format AI report, aggregate AI tasks by test group, facilitate test report distribution

### Problem fix

* Fix the problem of AI report scrolling preview

## v0.2.0 - Control Puppeteer by natural language

### New features

* Support for using natural language to control puppeteer to implement page automation 🗣️💻

* Provide AI cache capabilities for playwright framework, improve stability and execution efficiency

* AI report visualization, aggregate AI tasks by test group, facilitate test report distribution

* Support for AI to assert the page, let AI judge whether the page meets certain conditions

## v0.1.0 - Control Playwright by natural language

### New features

* Support for using natural language to control puppeteer to implement page automation 🗣️💻

* Support for using natural language to extract page information 🔍🗂️

* AI report visualization, AI behavior, AI thinking visualization 🛠️👀

* Direct use of GPT-4o model, no training required 🤖🔧

<!-- END OFFICIAL PAGE 12: changelog.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 13: common/get-cdp-url.mdx -->

## Source page: `common/get-cdp-url.mdx`

#### Getting a CDP WebSocket URL

You can get a CDP WebSocket URL from various sources, for example:

- **BrowserBase**: Sign up at https://browserbase.com and get your CDP URL
- **Browserless**: Use https://browserless.io or run your own instance
- **Local Chrome**: Run Chrome with `--remote-debugging-port=9222` and use `ws://localhost:9222/devtools/browser/...`
- **Docker**: Run Chrome in a Docker container with debugging port exposed

<!-- END OFFICIAL PAGE 13: common/get-cdp-url.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 14: common/prepare-android.mdx -->

## Source page: `common/prepare-android.mdx`

## Preparation

### Install Node.js

Install [Node.js 18 or higher](https://nodejs.org/en/download/).

### Prepare API Key

Prepare an API Key for a Vision Language (VL) model.

You can check the models and configurations supported by Midscene.js in the [Model Strategy](../model-strategy) documentation.

### Install adb

`adb` is a command-line tool that allows you to communicate with Android devices. There are two ways to install `adb`:

- Method 1: Install using [Android Studio](https://developer.android.com/studio)
- Method 2: Install using [Android Command Line Tools](https://developer.android.com/studio#command-line-tools-only)

Verify that `adb` is installed successfully:

```bash
adb --version
```

When you see the following output, it means `adb` is installed successfully:

```log
Android Debug Bridge version 1.0.41
Version 34.0.4-10411341
Installed as /usr/local/bin//adb
Running on Darwin 24.3.0 (arm64) 
```

### Set the `ANDROID_HOME` environment variable

Refer to [Android Environment Variables](https://developer.android.com/tools/variables) to set the `ANDROID_HOME` environment variable.

Verify that the `ANDROID_HOME` variable is set successfully:

```bash
echo $ANDROID_HOME
```

When the above command has output, it means the `ANDROID_HOME` variable is set successfully:

```log
/Users/your_username/Library/Android/sdk
```

### Connect Android Device

In the developer options of your Android device, enable 'USB debugging'. If 'USB debugging (Security settings)' exists, enable it as well. Then connect your Android device using a USB cable.

<p align="center">
  <img src="/android-usb-debug-en.png" alt="android usb debug" width="400"/>
</p>

Verify the connection:

```bash
adb devices -l
```

When you see the following output, it means the connection is successful:

```log
List of devices attached
s4ey59	device usb:34603008X product:cezanne model:M2006J device:cezan transport_id:3
```

<!-- END OFFICIAL PAGE 14: common/prepare-android.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 15: common/prepare-ios.mdx -->

## Source page: `common/prepare-ios.mdx`

## Preparation

### Install Node.js

Install [Node.js 18 or higher](https://nodejs.org/en/download/).

### Prepare API Key

Prepare an API Key for a visual language (VL) model.

You can find supported models and configurations for Midscene.js in the [Model strategy](../model-strategy) documentation.

### Prepare WebDriver Server

Before getting started, you need to set up the iOS development environment:

- macOS (required for iOS development)
- Xcode and Xcode command line tools
- iOS Simulator or real device

#### Environment Configuration

Before using Midscene iOS, you need to prepare the WebDriverAgent service.

:::note Version Requirement

WebDriverAgent version must be **>= 7.0.0**

:::

Please refer to the official documentation for setup:

- **Simulator Configuration**: [Run Prebuilt WDA](https://appium.github.io/appium-xcuitest-driver/latest/guides/run-prebuilt-wda/)
- **Real Device Configuration**: [Real Device Configuration](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/device-setup/)

#### Verify Environment Configuration

After completing the configuration, you can verify whether the service is working properly by accessing WebDriverAgent's status endpoint:

**Access URL**: `http://localhost:8100/status`

**Correct Response Example**:
```json
{
  "value": {
    "build": {
      "version": "10.1.1",
      "time": "Sep 24 2025 18:56:41",
      "productBundleIdentifier": "com.facebook.WebDriverAgentRunner"
    },
    "os": {
      "testmanagerdVersion": 65535,
      "name": "iOS",
      "sdkVersion": "26.0",
      "version": "26.0"
    },
    "device": "iphone",
    "ios": {
      "ip": "10.91.115.63"
    },
    "message": "WebDriverAgent is ready to accept commands",
    "state": "success",
    "ready": true
  },
  "sessionId": "BCAD9603-F714-447C-A9E6-07D58267966B"
}
```

If you can successfully access this endpoint and receive a similar JSON response as shown above, it indicates that WebDriverAgent is properly configured and running.

<!-- END OFFICIAL PAGE 15: common/prepare-ios.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 16: common/quick-model-config.mdx -->

## Source page: `common/quick-model-config.mdx`

Midscene drives the UI with a multimodal model. Set these environment variables to get started. The example below uses **Qwen3.x** via OpenRouter — it is easy to obtain and a solid default:

```bash
export MIDSCENE_MODEL_BASE_URL="https://openrouter.ai/api/v1"
export MIDSCENE_MODEL_API_KEY="your-openrouter-api-key"
export MIDSCENE_MODEL_NAME="qwen/qwen3.7-plus"
export MIDSCENE_MODEL_FAMILY="qwen3"
```

<!-- END OFFICIAL PAGE 16: common/quick-model-config.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 17: common/setup-env.mdx -->

## Source page: `common/setup-env.mdx`

## Set up API keys for model

Set your model configs into the environment variables. You may refer to [Model strategy](../model-strategy) for more details.

```bash
export MIDSCENE_MODEL_BASE_URL="https://replace-with-your-model-service-url/v1"
export MIDSCENE_MODEL_API_KEY="replace-with-your-api-key"
export MIDSCENE_MODEL_NAME="replace-with-your-model-name"
export MIDSCENE_MODEL_FAMILY="replace-with-your-model-family"
```

For more configuration details, please refer to [Model strategy](../model-strategy) and [Model configuration](../model-config).

<!-- END OFFICIAL PAGE 17: common/setup-env.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 18: common/start-experience.mdx -->

## Source page: `common/start-experience.mdx`

After configuration, you can start using Midscene right away. It provides several key operation tabs:

- **Act**: interact with the page. This is Auto Planning, corresponding to `aiAct`. For example:
```
Type “Midscene” in the search box, run the search, and open the first result
```

```
Fill out the registration form and make sure every field passes validation
```

- **Query**: extract JSON data from the interface, corresponding to `aiQuery`.

Similar methods include `aiBoolean()`, `aiNumber()`, and `aiString()` for directly extracting booleans, numbers, and strings.

```
Extract the user ID from the page and return JSON data in the { id: string } structure
```

- **Assert**: understand the page and assert; if the condition is not met, throw an error, corresponding to `aiAssert`.

```
There is a login button on the page, with a user agreement link below it
```

- **Tap**: click on an element. This is Instant Action, corresponding to `aiTap`.
```
Click the login button
```

> For the difference between Auto Planning and Instant Action, see the [API](../api.mdx) document.

<!-- END OFFICIAL PAGE 18: common/start-experience.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 19: common/troubleshooting-llm-connectivity.mdx -->

## Source page: `common/troubleshooting-llm-connectivity.mdx`

## Troubleshooting model service connectivity issues

Midscene includes a built-in model verify command for troubleshooting model service connectivity issues and basic compatibility issues.

Put your model configuration in a `.env` file, then run the following model verify command to verify whether the current model configuration can support Midscene:

```bash
# If the current project has @midscene/cli installed, use the local midscene command
npx midscene model verify

# If the current project does not have @midscene/cli installed, or you want to use the latest version
npx @midscene/cli@latest model verify
```

The command reads the `.env` file in the current working directory. Dotenv debug logging is enabled by default, and values from `.env` override existing shell environment variables.

To isolate basic model service connectivity issues, you can also run the following minimal `curl` request.

```bash
MIDSCENE_MODEL_BASE_URL='replace with your baseUrl'
MIDSCENE_MODEL_API_KEY='replace with your API key'
MIDSCENE_MODEL_NAME='replace with your model name'

curl -X POST "${MIDSCENE_MODEL_BASE_URL%/}/chat/completions" \
  -H "Authorization: Bearer ${MIDSCENE_MODEL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "'"${MIDSCENE_MODEL_NAME}"'",
  "messages": [
    {
      "role": "user",
      "content": "What is 1+1?"
    }
  ]
}'
```

<!-- END OFFICIAL PAGE 19: common/troubleshooting-llm-connectivity.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 20: computer-api-reference.mdx -->

## Source page: `computer-api-reference.mdx`

# API Reference (PC Desktop)

This page documents the PC desktop-specific APIs provided by `@midscene/computer`.

For common APIs that work across all platforms, see [Common API Reference](./api).

## Agent Creation

`agentForComputer(opts?): Promise<ComputerAgent>`

Create an agent for local desktop automation.

> Backward compatibility: `agentFromComputer` is still available as an alias.

`agentForRDPComputer(opts): Promise<ComputerAgent<RDPDevice>>`

Create an agent for remote Windows desktop automation over RDP.

**Parameters:**

```typescript
interface BaseComputerAgentOpt {
  // Agent options (inherited from AgentOpt)
  aiActionContext?: string;
  cache?: boolean;
  // ... other AgentOpt properties

  customActions?: DeviceAction<any>[];
}

interface LocalComputerAgentOpt extends BaseComputerAgentOpt {

  // Local desktop options
  displayId?: string;
  headless?: boolean;
  xvfbResolution?: string;
}

interface RDPComputerAgentOpt extends BaseComputerAgentOpt {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  domain?: string;
  adminSession?: boolean;
  ignoreCertificate?: boolean;
  securityProtocol?: 'auto' | 'tls' | 'nla' | 'rdp';
  desktopWidth?: number;
  desktopHeight?: number;
}
```

### Local Desktop Options

- `displayId` (optional): Specify which display to control. Get available displays with `ComputerDevice.listDisplays()`.
- `customActions` (optional): Add custom actions to the device.
- `headless` (optional, Linux only): Set to `true` to start a virtual display via [Xvfb](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml), enabling desktop automation on headless Linux servers and CI environments without a physical display. Can also be set via the `MIDSCENE_COMPUTER_HEADLESS_LINUX=true` environment variable.
- `xvfbResolution` (optional): Resolution for the Xvfb virtual display. Defaults to `'1920x1080x24'`.

### RDP Options

- `host`: Remote Windows host or IP.
- `port`: RDP port. Defaults to `3389`.
- `username` / `password`: Credentials for the remote session.
- `domain`: Optional Windows domain.
- `adminSession`: Request the remote admin session when the server allows it.
- `ignoreCertificate`: Skip certificate validation for self-signed setups.
- `securityProtocol`: Choose `'auto'`, `'tls'`, `'nla'`, or `'rdp'`.
- `desktopWidth` / `desktopHeight`: Request a specific remote desktop resolution.

:::tip Example: Testing Electron Apps on Headless Linux CI
A complete demo of testing [Obsidian](https://obsidian.md/) (an Electron app) on headless Linux CI with `@midscene/computer`: [https://github.com/web-infra-dev/midscene-example/tree/main/computer/electron-demo](https://github.com/web-infra-dev/midscene-example/tree/main/computer/electron-demo)
:::

**Example:**

```typescript
import { agentForComputer } from '@midscene/computer';

// Connect to primary display
const agent = await agentForComputer({
  aiActionContext: 'You are automating a desktop application.',
});

// Connect to specific display
const displays = await ComputerDevice.listDisplays();
const agent2 = await agentForComputer({
  displayId: displays[1].id,
});
```

**Example: connect to a remote Windows desktop over RDP**

```typescript
import { agentForRDPComputer } from '@midscene/computer';

const agent = await agentForRDPComputer({
  aiActionContext:
    'You are controlling a remote Windows desktop over the RDP protocol.',
  host: '10.75.166.249',
  port: 3389,
  username: 'Admin',
  password: 'replace-with-your-password',
  // Optional: bind the TCP connection to this local source IP.
  localAddress: '10.75.166.10',
  ignoreCertificate: true,
});

await agent.aiWaitFor('The remote Windows desktop is visible');
await agent.aiAct('Click the Windows Start button');
await agent.aiAct('Open Settings');
```

:::tip Example: Remote Windows desktop over RDP
A runnable demo that connects to a remote Windows machine over RDP, opens Settings, navigates into Windows Update, and emits a structured report: [https://github.com/web-infra-dev/midscene-example/tree/main/computer/rdp-demo](https://github.com/web-infra-dev/midscene-example/tree/main/computer/rdp-demo)
:::

Use `localAddress` only when the machine running Midscene has multiple outbound
routes and the RDP server must be reached from a specific local source IP. Pass
an IP address, not a network interface name.

## Device Management

`ComputerDevice.listDisplays(): Promise<DisplayInfo[]>`

List all available displays.

**Returns:**

```typescript
interface DisplayInfo {
  id: string;
  name: string;
  primary?: boolean;
}
```

**Example:**

```typescript
import { ComputerDevice } from '@midscene/computer';

const displays = await ComputerDevice.listDisplays();
console.log('Available displays:', displays);
// [
//   { id: '0', name: 'Built-in Display', primary: true },
//   { id: '1', name: 'External Display', primary: false }
// ]
```

`checkComputerEnvironment(): Promise<EnvironmentCheck>`

Check if the computer environment is properly configured.

**Returns:**

```typescript
interface EnvironmentCheck {
  available: boolean;
  error?: string;
  platform: string;
  displays: number;
}
```

**Example:**

```typescript
import { checkComputerEnvironment } from '@midscene/computer';

const env = await checkComputerEnvironment();
console.log('Environment check:', env);

if (!env.available) {
  console.error('Environment error:', env.error);
}
```

## ComputerAgent

The `ComputerAgent` class extends `PageAgent<ComputerDevice>` and inherits all common agent methods:

- `aiAct(action: string)`: Perform an action with AI
- `aiQuery(query: string)`: Extract information with AI
- `aiAssert(assertion: string)`: Assert a condition with AI
- `aiWaitFor(condition: string)`: Wait for a condition
- `aiLocate(description: string)`: Locate an element
- And more...

Instant actions are also available for direct, deterministic control once an element is located:

- `aiTap()`, `aiDoubleClick()`, `aiRightClick()`, `aiHover()`: Mouse actions
- `aiInput()`, `aiClearInput()`, `aiKeyboardPress()`: Keyboard actions
- `aiScroll()`: Scroll action

See [Common API Reference](./api) for details.

## Available Actions

The `ComputerDevice` supports the following actions:

### Mouse Actions

#### Tap (Click)

Single click at the target location.

```typescript
await agent.aiAct('click on the File menu');
await agent.aiAct('click at center of screen');
```

#### DoubleClick

Double-click at the target location.

```typescript
await agent.aiAct('double-click on the desktop icon');
```

#### RightClick

Right-click to open context menu.

```typescript
await agent.aiAct('right-click on the desktop');
await agent.aiAct('right-click on the file');
```

#### MouseMove (Hover)

Move the mouse to an element — also known as hovering — for example to reveal a hover menu or tooltip.

```typescript
// Natural-language form (move mouse / hover)
await agent.aiAct('move mouse to the menu item');

// Instant action: locate and hover in one call
await agent.aiHover('the menu item "Products"');
```

#### DragAndDrop

Drag from one location and drop at another.

```typescript
await agent.aiAct('drag the file to the folder');
```

### Keyboard Actions

#### KeyboardPress

Press keyboard keys with optional modifiers.

**Supported keys:**
- Regular keys: `a-z`, `0-9`, `Enter`, `Escape`, `Space`, `Tab`, etc.
- Arrow keys: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
- Function keys: `F1`-`F12`
- Modifiers: `Command`/`Cmd` (macOS), `Control`/`Ctrl`, `Alt`, `Shift`, `Win` (Windows)
- Media keys: `VolumeUp`, `VolumeDown`, `Mute`, etc.

**Examples:**

```typescript
// Simple key press
await agent.aiAct('press Enter');
await agent.aiAct('press Escape');

// Key combinations (platform-specific)
if (process.platform === 'darwin') {
  // macOS
  await agent.aiAct('press Cmd+Space');  // Open Spotlight
  await agent.aiAct('press Cmd+Tab');    // App switcher
  await agent.aiAct('press Cmd+C');      // Copy
  await agent.aiAct('press Cmd+V');      // Paste
} else {
  // Windows/Linux
  await agent.aiAct('press Windows key'); // Start menu
  await agent.aiAct('press Alt+Tab');     // App switcher
  await agent.aiAct('press Ctrl+C');      // Copy
  await agent.aiAct('press Ctrl+V');      // Paste
}

// Arrow keys
await agent.aiAct('press ArrowDown');
await agent.aiAct('press ArrowUp');

// Function keys
await agent.aiAct('press F5');  // Refresh
```

#### Input

Type text into an input field.

```typescript
await agent.aiAct('type "Hello World" in the search box');
await agent.aiAct('type "my-document.txt"');
```

#### ClearInput

Clear the content of an input field.

```typescript
await agent.aiAct('clear the text field');
```

### Scroll Actions

Scroll the screen or a specific area.

```typescript
// Scroll directions
await agent.aiAct('scroll down');
await agent.aiAct('scroll up');
await agent.aiAct('scroll left');
await agent.aiAct('scroll right');

// Scroll to positions
await agent.aiAct('scroll to top');
await agent.aiAct('scroll to bottom');
```

### Display Actions

#### ListDisplays

Get information about all connected displays.

```typescript
const displays = await ComputerDevice.listDisplays();
```

When you use RDP, `ListDisplays` returns the current remote session as a single display.

## Examples

### Open Application and Navigate

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer();

// Open application
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+Space');
  await agent.aiAct('type "TextEdit" and press Enter');
} else {
  await agent.aiAct('press Windows key');
  await agent.aiAct('type "Notepad" and press Enter');
}

await agent.aiWaitFor('text editor window is visible');

// Type content
await agent.aiAct('type "Hello, Midscene!"');

// Save file
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+S');
} else {
  await agent.aiAct('press Ctrl+S');
}
```

### Multi-Display Workflow

```typescript
import { ComputerDevice, agentForComputer } from '@midscene/computer';

// List displays
const displays = await ComputerDevice.listDisplays();
console.log(`Found ${displays.length} displays`);

// Control primary display
const agent1 = await agentForComputer({
  displayId: displays[0].id,
});
await agent1.aiAct('move mouse to center of screen');

// Control secondary display
if (displays.length > 1) {
  const agent2 = await agentForComputer({
    displayId: displays[1].id,
  });
  await agent2.aiAct('move mouse to center of screen');
}
```

### Web Browser Automation

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer();

// Open browser
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+Space');
  await agent.aiAct('type "Safari" and press Enter');
} else {
  await agent.aiAct('press Windows key');
  await agent.aiAct('type "Chrome" and press Enter');
}

await agent.aiWaitFor('browser window is open');

// Navigate
await agent.aiAct('click on address bar');
await agent.aiAct('type "example.com" and press Enter');
await agent.aiWaitFor('page has loaded');

// Extract information
const title = await agent.aiQuery('string, get the page title');
console.log('Page title:', title);
```

## TypeScript Types

```typescript
import type {
  ComputerAgent,
  ComputerAgentOpt,
  ComputerDevice,
  ComputerDeviceOpt,
  DisplayInfo,
  EnvironmentCheck,
} from '@midscene/computer';
```

## See Also

- [Common API Reference](./api) - APIs that work across all platforms
- [Model Configuration](./model-config) - Configure AI models
- [Caching](./caching) - Improve performance with caching

<!-- END OFFICIAL PAGE 20: computer-api-reference.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 21: computer-getting-started.mdx -->

## Source page: `computer-getting-started.mdx`

import StartExperience from './common/start-experience.mdx';
import SetupEnv from './common/setup-env.mdx';

import { PackageManagerTabs } from '@theme';

# PC Desktop Getting Started

This guide walks you through everything required to automate PC desktop applications with Midscene: install dependencies, configure model credentials, and run your first JavaScript script.

:::info Demo Projects

Control PC desktop with JavaScript: [https://github.com/web-infra-dev/midscene-example/tree/main/computer/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/tree/main/computer/javascript-sdk-demo)

Integrate Vitest for testing: [https://github.com/web-infra-dev/midscene-example/tree/main/computer/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/computer/vitest-demo)

Control a remote Windows desktop over RDP: [https://github.com/web-infra-dev/midscene-example/tree/main/computer/rdp-demo](https://github.com/web-infra-dev/midscene-example/tree/main/computer/rdp-demo)

Test [Obsidian](https://obsidian.md/) (an Electron app) on headless Linux CI with `@midscene/computer`: [https://github.com/web-infra-dev/midscene-example/tree/main/computer/electron-demo](https://github.com/web-infra-dev/midscene-example/tree/main/computer/electron-demo)

:::

<SetupEnv />

## System Requirements

### Node.js

Node.js 18.19.0 or higher is required.

### Platform-Specific Dependencies

**macOS**: Accessibility permissions are required for keyboard and mouse control. When you run the script for the first time, macOS will prompt you to grant access. Go to **System Settings > Privacy & Security > Accessibility** and enable permissions for the application running your script (e.g., Terminal, iTerm2, VS Code, WebStorm, or other IDEs). For more details, see [nut.js macOS setup](https://github.com/nut-tree/nut.js#macos).

**Windows**: No extra setup is needed for ordinary apps. However, Windows isolates input across privilege levels (UIPI): a non-elevated process **cannot** send mouse or keyboard input to a window that runs **as Administrator** (elevated). The input is silently dropped — the cursor still moves to the right spot, but clicks and keystrokes have no effect. Prefer running the target application without Administrator privileges. If the target application must stay elevated, run the terminal or Node.js that launches Midscene **as Administrator** too, so both processes share the same privilege level. See [Windows: clicks have no effect on some apps](#windows-clicks-have-no-effect-on-some-apps).

**Linux**: [ImageMagick](https://imagemagick.org/script/download.php) is required for screenshot functionality.

**Headless Linux (CI)**: To run desktop automation on a headless Linux server (e.g. GitHub Actions), install Xvfb and its dependencies, then enable headless mode:

```bash
# Install dependencies
sudo apt-get install -y xvfb x11-xserver-utils imagemagick
```

```typescript
// Option 1: Pass headless option
const agent = await agentForComputer({ headless: true });

// Option 2: Set environment variable
// MIDSCENE_COMPUTER_HEADLESS_LINUX=true npx tsx example.ts
```

Xvfb creates a virtual display so that mouse, keyboard, and screenshot operations work without a physical monitor. See [API Reference](./computer-api-reference) for details.

## Try Playground (no code)

Playground is the fastest way to validate the connection and observe AI-driven steps without writing code. It shares the same core as `@midscene/computer`, so anything that works here will behave the same once scripted.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/pc-twitter2.mp4" controls/>

1. Launch the Playground CLI:

```bash
npx --yes @midscene/computer-playground
```

2. Click the gear icon in the Playground window, then paste your API key configuration. Refer back to [Model configuration](./model-config) if you still need credentials.

## Start experiencing

<StartExperience />

## Integration with Midscene Agent

Once Playground works, move to a repeatable script with the JavaScript SDK.

### Step 1. Install dependencies

<PackageManagerTabs command="install @midscene/computer" />

### Step 2. Write your first script

Create `example.ts`:

```typescript
import { agentForComputer } from '@midscene/computer';

(async () => {
  // Create an agent
  const agent = await agentForComputer({
    aiActionContext: 'You are controlling a desktop computer.',
  });

  // Take a screenshot and query information
  const screenInfo = await agent.aiQuery(
    '{width: number, height: number}, get screen resolution'
  );
  console.log('Screen resolution:', screenInfo);

  // Move mouse to center
  await agent.aiAct('move mouse to center of screen');

  // Assert screen has content
  await agent.aiAssert('The screen has visible content');

  console.log('Desktop automation completed!');
})();
```

### Step 3. Run the script

```bash
npx tsx example.ts
```

## Connect to a Remote Windows Desktop via RDP

`@midscene/computer` can also drive a remote Windows desktop directly over the RDP protocol through the dedicated `agentForRDPComputer()` factory.

### Prerequisites

1. A reachable Windows machine with RDP enabled.
2. [FreeRDP](https://www.freerdp.com/) installed on the machine running your script.

### Example

```typescript
import { agentForRDPComputer } from '@midscene/computer';

const agent = await agentForRDPComputer({
  aiActionContext:
    'You are controlling a remote Windows desktop over the RDP protocol.',
  host: '10.75.166.249',
  port: 3389,
  username: 'Admin',
  password: 'replace-with-your-password',
  ignoreCertificate: true,
});

await agent.aiWaitFor('The remote Windows desktop is visible');
await agent.aiAct('Click the Windows Start button');
await agent.aiAct('Open Settings');
await agent.aiAssert('The Windows Settings window is visible');
```

### Common RDP Options

- `host`: Remote Windows host or IP.
- `port`: RDP port. Defaults to `3389`.
- `username` / `password`: Account credentials for the remote session.
- `domain`: Optional Windows domain.
- `ignoreCertificate`: Skip certificate validation for self-signed setups.
- `desktopWidth` / `desktopHeight`: Request a specific remote desktop resolution.
- `adminSession`: Request the remote admin session when the server allows it.

RDP sessions are exposed to Midscene as a single remote display. You can still use the same `aiAct`, `aiQuery`, `aiAssert`, and report features as local desktop automation.

## Multi-Display Support

If you have multiple displays, you can control a specific one:

```typescript
import { ComputerDevice, agentForComputer } from '@midscene/computer';

// List all displays
const displays = await ComputerDevice.listDisplays();
console.log('Available displays:', displays);

// Connect to a specific display
const agent = await agentForComputer({
  displayId: displays[0].id,
});
```

## Example Usage

### Basic Mouse Operations

```typescript
// Click at center of screen
await agent.aiAct('click mouse at center of screen');

// Move mouse to a specific location
await agent.aiAct('move mouse to top-left corner');

// Double-click
await agent.aiAct('double-click on the desktop icon');

// Right-click
await agent.aiAct('right-click to open context menu');
```

### Keyboard Operations

```typescript
// Type text
await agent.aiAct('type "Hello World"');

// Press keyboard shortcuts
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+Space to open Spotlight');
  await agent.aiAct('type "Calculator" and press Enter');
} else {
  await agent.aiAct('press Windows key');
  await agent.aiAct('type "Calculator" and press Enter');
}

// Press function keys
await agent.aiAct('press Escape');
await agent.aiAct('press Enter');
```

### Query Information

```typescript
// Extract screen information
const info = await agent.aiQuery(
  '{hasDesktop: boolean, visibleApps: string[]}, check if desktop is visible and list visible apps'
);

// Locate elements
const position = await agent.aiLocate('the File menu');
console.log('File menu position:', position);
```

### Complex Workflows

```typescript
// Open an application and interact with it
await agent.aiAct('open Finder');
await agent.aiWaitFor('Finder window is visible');

await agent.aiAct('click on Documents folder');
await agent.aiAct('press Cmd+N to create new folder');
await agent.aiAct('type "My Project"');
await agent.aiAct('press Enter');

await agent.aiAssert('A folder named "My Project" exists');
```

## Environment Check

You can check if your system is properly configured:

```typescript
import { checkComputerEnvironment } from '@midscene/computer';

const env = await checkComputerEnvironment();
console.log('Platform:', env.platform);
console.log('Available:', env.available);
console.log('Displays:', env.displays);

if (!env.available) {
  console.error('Environment not available:', env.error);
}
```

## FAQ

### macOS: Script cannot control mouse or keyboard

macOS requires Accessibility permissions for keyboard and mouse control. Go to **System Settings > Privacy & Security > Accessibility** and enable the toggle for the application running your script (e.g., Terminal, iTerm2, VS Code, or WebStorm).

If you have already granted permission but it still doesn't work, try removing the app from the Accessibility list and re-adding it — macOS sometimes caches stale permissions.

### Windows: clicks have no effect on some apps

If the cursor moves to the correct position but clicks or key presses do nothing on a particular application — while other apps work fine — check whether the target app is running **as Administrator** (elevated). Windows UIPI blocks input injected from a lower-privilege process into an elevated window and drops it silently, with no error.

Prefer lowering the target application's privilege level first, for example by launching it without "Run as Administrator" or disabling any setting that always starts it elevated. If the target app must stay elevated, run the terminal or Node.js that launches Midscene **as Administrator** so it matches the target app's privilege level, then try again. System-level shortcuts such as `Win+Tab` are handled by the shell and keep working even when this happens, which is why keyboard shortcuts may appear to work while in-app clicks do not.

> The health check logged at connection time prints this troubleshooting link when Midscene is not running as Administrator on Windows.

### Linux: Screenshots or interactions fail on a headless server

A headless Linux environment (e.g. CI) has no physical display. You need to install Xvfb and ImageMagick, and enable headless mode:

```bash
sudo apt-get install -y xvfb x11-xserver-utils imagemagick
```

```typescript
const agent = await agentForComputer({ headless: true });
```

Or set the environment variable:

```bash
MIDSCENE_COMPUTER_HEADLESS_LINUX=true npx tsx example.ts
```

## Next Steps

- [API Reference](./computer-api-reference)
- [Use YAML format automation scripts](./automate-with-scripts-in-yaml)
- [YAML script runner](./yaml-script-runner)
- [Caching for efficiency](./caching)

<!-- END OFFICIAL PAGE 21: computer-getting-started.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 22: computer-introduction.mdx -->

## Source page: `computer-introduction.mdx`

import ShowcaseComputer from './showcases-computer.mdx';

# PC Desktop Automation Support

Midscene can drive native keyboard and mouse controls to support PC desktop automation on Windows, macOS, and Linux.

By leveraging a visual model solution, the automation process works with any desktop application—whether built with Electron, Qt, WPF, or native technologies. Developers only need to focus on the final user experience when debugging UI automation scripts.

The PC desktop automation solution comes with all the features of Midscene:

- Supports zero-code trial using Playground
- Supports JavaScript SDK for scripting
- Supports automation scripts in YAML format and command-line tools
- Supports HTML reports to replay all operation paths
- Works across Windows, macOS, and Linux platforms
- Headless mode for Linux CI via Xvfb (no physical display required)
- Multi-display support for complex setups

## Showcases

<ShowcaseComputer />

See more showcases: [showcases](./showcases.mdx)

## Try with Playground

With Midscene.js playground, you can experience PC desktop automation capabilities without writing any code.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/pc-twitter2.mp4" controls/>

See [Getting Started](./computer-getting-started#try-playground-no-code) to learn how to launch the Playground.

## Key Features

### Cross-platform Desktop Control

- **Mouse Operations**: Click, double-click, right-click, mouse move, drag-and-drop
- **Keyboard Input**: Type text, press keys with modifiers (Cmd/Ctrl/Alt/Shift)
- **Screen Capture**: Take screenshots of any display
- **Multi-display**: Work with multiple monitors simultaneously

### AI-Powered Automation

Using Midscene's AI capabilities, you can automate desktop applications with natural language:

```typescript
await agent.aiAct('open the File menu');
await agent.aiAct('click on Save As');
await agent.aiAct('type "my-document" in the filename field');
await agent.aiAct('press Enter');
```

## Use Cases

- **Desktop Application Testing**: Automate testing for Electron, Qt, or native apps
- **Workflow Automation**: Automate repetitive tasks across desktop applications
- **Cross-app Integration**: Control multiple applications in sequence
- **UI Testing**: Test desktop applications with natural language descriptions

## Next Steps

* [Getting Started](./computer-getting-started)
* [API Reference](./computer-api-reference)
* [Use YAML format automation scripts](./automate-with-scripts-in-yaml) and [YAML script runner](./yaml-script-runner)

<!-- END OFFICIAL PAGE 22: computer-introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 23: consume-report-file.md -->

## Source page: `consume-report-file.md`

# Consume Report Files

Midscene HTML report files capture the full execution history of a single Agent, making them useful for replay and debugging.

Starting in v1.7.0, you can extract raw screenshots and JSON data from a report file, or convert the report into Markdown so other tools can consume it.

## Example

You can parse a report file into a Markdown file like this:

```md
# Act - Search for and play videos related to Midscene

- Execution start: 2026-04-08T02:13:04.795Z
- Task count: 21

## 1. Plan - Click the top search box to activate input
- Status: finished
- Start: 2026-04-08T02:13:04.845Z
- End: 2026-04-08T02:13:15.296Z
- Cost(ms): 10451
- Screen size: 2880 x 1536

![task-1](./screenshots/execution-1-task-1-f9fc3bf9-bdf6-48dd-abea-f8f29874d8c1.jpeg)

### Recorder
- #1 type=screenshot, ts=2026-04-08T02:13:15.296Z, timing=after-calling

![task-1](./screenshots/execution-1-task-1-c521b130-5037-4ed2-b70f-705e181d981a.jpeg)

## 2. Locate - The search input with the placeholder text "Li Weigang's Daily Life" at the top
- Status: finished
- Start: 2026-04-08T02:13:15.305Z
- End: 2026-04-08T02:13:15.306Z
- Cost(ms): 1
- Screen size: 2880 x 1536
- Locate center: (1489, 71)

.....
```

You can then combine it with the [Remotion Skill](https://www.remotion.dev/docs/ai/skills?utm_source=midscenejs) to parse the Markdown file and generate a customized replay video.

The generated video looks like this:

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/midscene-replay.mp4" height="300" controls></video>

## Parse With The CLI

The report parsing tool is included in each platform CLI package, such as `@midscene/web` and `@midscene/android`. The subcommand is `report-tool`.

Extract report contents as JSON and export the related screenshots into the `output-data` directory:

```shell
npx @midscene/web report-tool --action split --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-data
```

Convert the report file into Markdown and write the result into the `output-markdown` directory:

```shell
npx @midscene/web report-tool --action to-markdown --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-markdown
```

Merge multiple report files into a single combined report:

```shell
npx @midscene/web report-tool --action merge-html \
  --htmlReport ./midscene_run/report/case-a/index.html \
  --htmlReport ./midscene_run/report/case-b.html \
  --outputDir ./merged --outputName all-cases
```

Repeat `--htmlReport` once per source report. `--outputDir` and `--outputName` are optional; when omitted, the merged file is written to the default Midscene report directory with an auto-generated name. Pass `--overwrite` to replace an existing merged file.

## Parse With The JavaScript SDK

If you prefer to control report parsing in code, use `splitReportFile`, `reportFileToMarkdown`, and `mergeReportFiles` from `@midscene/core`.

```ts
import {
  mergeReportFiles,
  reportFileToMarkdown,
  splitReportFile,
} from '@midscene/core';

const splitResult = splitReportFile({
  htmlPath: './midscene_run/report/puppeteer-2026/index.html',
  outputDir: './output-data',
});
console.log(splitResult.executionJsonFiles);

const markdownResult = await reportFileToMarkdown({
  htmlPath: './midscene_run/report/puppeteer-2026/index.html',
  outputDir: './output-markdown',
});
console.log(markdownResult.markdownFiles);

const mergedResult = mergeReportFiles({
  htmlPaths: [
    './midscene_run/report/case-a/index.html',
    './midscene_run/report/case-b.html',
  ],
  outputDir: './merged',
  outputName: 'all-cases',
});
console.log(mergedResult.mergedReportPath);
```

`splitReportFile`, `reportFileToMarkdown`, and `mergeReportFiles` serve different outputs:

- `splitReportFile` generates JSON files for the original structured objects (one `*.execution.json` per execution). The JSON keeps the raw `ReportActionDump`-style data and exports screenshots alongside it. The returned `executionJsonFiles` and `screenshotFiles` are lists of generated file paths.
- `reportFileToMarkdown` converts the same report into human-readable Markdown and exports the screenshots referenced by that Markdown. The returned `markdownFiles` contains the generated Markdown file paths.
- `mergeReportFiles` combines several report files into one merged HTML report. It is a thin wrapper over [`ReportMergingTool`](./api#new-reportmergingtool) that derives `testTitle`/`testDescription` from each source report's `groupName` automatically. Use it when you run multiple CLI actions or tests and want to consolidate their reports.


## About Fields In JSON And Markdown

The parsed JSON and Markdown structures may change as Midscene evolves. Use the actual conversion result as the source of truth.

<!-- END OFFICIAL PAGE 23: consume-report-file.md -->

---

<!-- BEGIN OFFICIAL PAGE 24: data-privacy.md -->

## Source page: `data-privacy.md`

# Data privacy

⁠Midscene.js is an open-source project (GitHub: [Midscene](https://github.com/web-infra-dev/midscene/)) under the MIT license. You can see all the codes in the public repository.

When using Midscene.js, your page data (including the screenshot) is sent directly to the AI model provider you choose. No third-party platform will have access to this data. All you need to be concerned about is the data privacy policy of the model provider.

If you prefer building Midscene.js and its Chrome Extension in your own environment instead of using the published versions, you can refer to the [Contributing Guide](https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md) to find building instructions.

<!-- END OFFICIAL PAGE 24: data-privacy.md -->

---

<!-- BEGIN OFFICIAL PAGE 25: faq.md -->

## Source page: `faq.md`

# FAQ

## Platform-Specific FAQ

The following platform-specific FAQs are maintained in their respective documentation:

- [Web Browser - Playwright](./integrate-with-playwright#faq)
- [Web Browser - Puppeteer](./integrate-with-puppeteer#faq)
- [Web Browser - Chrome Extension](./quick-experience#faq)
- [Web Browser - Bridge Mode](./bridge-mode#faq)
- [Android](./android-getting-started#faq)
- [iOS](./ios-getting-started#faq)
- [HarmonyOS](./harmony-getting-started#faq)
- [PC Desktop](./computer-getting-started#faq)

## What data is sent to AI model?

The screenshot will be sent to the AI model. In some cases, like setting the `domIncluded` option to `true` when calling `aiAsk` or `aiQuery`, the DOM information will also be sent.

⁠If you are worried about data privacy issues, please refer to [Data Privacy](./data-privacy)

## My model provider requires adding specific headers to requests

You can use `defaultHeaders` in the `MIDSCENE_MODEL_INIT_CONFIG_JSON` environment variable to specify headers to include in the request. For example:

```bash
# Add a header with key "foo" and value "bar" to the request
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"foo":"bar"}}'
```

If your provider documentation calls this field `extra_headers` or `extraHeaders`, Midscene also accepts those aliases and normalizes them to `defaultHeaders`. When multiple aliases are present, the priority is: `defaultHeaders` > `extra_headers` > `extraHeaders`.

You can generate the JSON string with JSON serialization to avoid mistakes when writing it by hand:

```javascript
JSON.stringify({ defaultHeaders: { foo: 'bar' } })
```

## How do I use Azure OpenAI Service?

When using Azure OpenAI Service, first choose the model and fill in the regular model configuration from [Model configuration](./model-common-config). Azure only requires changing the model service URL and API Key to the Azure form:

```bash
MIDSCENE_MODEL_BASE_URL="https://<your-resource>.services.ai.azure.com/openai/v1" # Or https://<your-resource>.openai.azure.com/openai/v1
MIDSCENE_MODEL_API_KEY="<your-azure-api-key>"
```

In other words, other settings such as `MIDSCENE_MODEL_NAME` and `MIDSCENE_MODEL_FAMILY` should still follow the corresponding model section in [Model configuration](./model-common-config). Azure is only a model provider with different authentication, not a special model.

This uses the normal OpenAI-compatible path and sends `POST /openai/v1/chat/completions` with `Authorization: Bearer ...`. Do not append `/chat/completions` to `MIDSCENE_MODEL_BASE_URL`. For most `/openai/v1` endpoints you do not need `api-version`.

If your resource still rejects the request with `400 Missing required query parameter: api-version`, the `/openai/v1` surface on that specific resource has not GA'd yet. Inject the query parameter through `defaultQuery`:

```bash
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"}}'
```

Use the `api-version` value your resource expects (`preview`, or a dated version like `2025-01-01-preview` shown in the Azure portal). This turns every request into `.../openai/v1/chat/completions?api-version=preview`.

If an Azure-compatible gateway only accepts the `api-key` header, use this fallback:

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

In this fallback, `MIDSCENE_MODEL_API_KEY="placeholder"` only satisfies the OpenAI SDK constructor check. The real key is sent through `defaultHeaders.api-key`.

These two fallbacks can be combined when a resource needs both `api-version` and the `api-key` header:

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"},"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

Azure AD / keyless auth (`DefaultAzureCredential`) is not supported. Use an API key.

## Clicks are offset when using Azure OpenAI

With a GPT-5 family model, you may find that the same script clicks the correct spot on the official OpenAI API but a consistently offset spot on Azure OpenAI. The offset scales with resolution: it appears at large screenshots (e.g. `1920x1080`) and disappears at small ones (e.g. `1280x600`).

The cause is image handling on the Azure side. GPT-5 returns absolute coordinates based on the screenshot it actually sees, and Midscene sends the screenshot with `"detail": "original"` so the model sees the full-resolution image (see the [GPT-5 notes](./model-common-config#gpt-5-4)). Azure does not honor `"detail": "original"`, so it downscales large images server-side (the short side is capped at 768). The model then answers in the downscaled coordinate space while Midscene maps coordinates against the original resolution, producing a proportional offset. You can confirm `original` is not taking effect by checking token usage: when `original` works, image token consumption is noticeably higher.

There are two ways to work around it:

1. Use the official OpenAI GPT-5, or configure a separate model dedicated to grounding (localization) and keep the Azure GPT-5 only as the planning model.
2. Pre-shrink the screenshot with the `screenshotShrinkFactor` agent option so the image stays under Azure's downscale threshold and no server-side resizing happens. See [`screenshotShrinkFactor`](./api).

## How to improve the running time?

There are several ways to improve the running time:
1. Use instant action interface like `agent.aiTap('Login Button')` instead of `agent.ai('Click Login Button')`.
2. Use a lower resolution if possible, this will reduce the input token cost.
3. Change to a faster model service
4. Use caching to accelerate the debug process. Read more about it in [Caching](./caching).

## How do I configure the midscene_run directory?

Midscene saves runtime artifacts (reports, logs, cache, etc.) in the `midscene_run` directory. By default, this directory is created in the current working directory.

You can customize the directory location using the `MIDSCENE_RUN_DIR` environment variable, which accepts both relative and absolute paths:

```bash
# Using a relative path
export MIDSCENE_RUN_DIR="./my_custom_dir"

# Using an absolute path
export MIDSCENE_RUN_DIR="/tmp/midscene_output"
```

The directory contains the following subdirectories:

- `report/` - Test report files (HTML format)
- `log/` - Debug log files
- `cache/` - Cache files (see [Caching](./caching))

For more configuration options, see [Model configuration](./model-config).

## How do I control the report player's default replay style via a link?

You can override the default values of the **Focus on cursor** and **Show element markers** toggles by adding query parameters to the report URL, which determines whether the report highlights the cursor position and element markers. Use `focusOnCursor` and `showElementMarkers` with values such as `true`, `false`, `1`, or `0`. For example: `...?focusOnCursor=false&showElementMarkers=true`.

## How do I embed the report as a bare player?

When embedding the report in another page (for example, in an `iframe`), add the `player-only=1` query parameter to strip all the surrounding chrome (top bar, sidebar, timeline, and detail side) and keep only the replay player. Two more flags tune the player:

- `play-control=1` — in player-only mode, show the bottom playback control bar (hidden by default). Opt-in; enabled only by `=1`.
- `auto-play` — whether playback starts automatically on load. This is independent of `player-only` and applies to every report player. It is **on by default**; add `auto-play=0` to disable it.

A typical embed looks like `...?player-only=1&play-control=1`. It also composes with the `#task-<id>` hash anchor, so you can deep-link to a specific step and show only its player: `...?player-only=1#task-0-5`. To open any report (embedded or not) without autoplay, use `...?auto-play=0`.
 
## Inaccurate Element Positioning

If you encounter inaccurate element positioning when using Midscene, follow these steps to troubleshoot and resolve the issue:

### 1. Upgrade to the Latest Version

Make sure you are using the latest version of Midscene, as new versions typically include optimizations and improvements for positioning accuracy.

```bash
# Web automation
npm install @midscene/web@latest
# iOS automation
npm install @midscene/ios@latest
# CLI tool
npm install @midscene/cli@latest
# Or other packages corresponding to your platform
```

### 2. Use Better Vision Models

Midscene's element positioning capability relies on the AI model's visual understanding ability, so be sure to choose models that support visual capabilities.

Generally, newer versions and models with larger parameters perform better than older versions and smaller models. For example, Qwen3-VL performs better than Qwen2.5-VL, and its plus version performs better than the flash version.

For more model selection suggestions, please refer to [Model Strategy](./model-strategy).

### 3. Check Model Family Configuration

Verify that the `MIDSCENE_MODEL_FAMILY` parameter is set correctly in your model configuration. Incorrect `MIDSCENE_MODEL_FAMILY` configuration will affect Midscene's adaptation logic for the model. See [Model Configuration](./model-config) for details.

### 4. Optimize prompts with visual features and position information

If the positioning result randomly lands on unrelated elements and varies significantly between runs, the model usually cannot understand the semantics behind the icon button.

For example, `aiTap('profile center')` is a functional description, and the model may not know the specific appearance of a profile icon. In contrast, `aiTap('person avatar icon')` is a visual description, so the model can locate the element based on its visual characteristics.

Solution: optimize prompts by combining visual features and position information to describe the element.

```typescript
// ❌ Using only a functional description
await agent.aiTap('profile center');

// ✅ Using a visual description
await agent.aiTap('person avatar icon');

// ✅ Combining visual features and position information
await agent.aiTap('person avatar icon in the top right corner of the page');
```

### 5. Enable `deepLocate`

If the positioning result lands near the target element but is still off by a few pixels, the model has probably identified the right target but still has some positioning deviation.

Solution: enabling `deepLocate` can significantly improve positioning accuracy.

```typescript
await agent.aiTap('Login button', {
  deepLocate: true
});
```

For more information about `deepLocate`, please refer to the [API documentation](/api).

### 6. Increase the browser DPR to 2 on web

If you are running Midscene in a web browser, you can try increasing the DPR to `2`. In CI environments, the default DPR is often `1`. Raising it to `2` makes the page clearer, which usually improves positioning for small elements.

Keep in mind that this will consume more tokens.

## Does the Doubao phone use Midscene under the hood?

No.

<!-- END OFFICIAL PAGE 25: faq.md -->

---

<!-- BEGIN OFFICIAL PAGE 26: harmony-api-reference.mdx -->

## Source page: `harmony-api-reference.mdx`

# API Reference (HarmonyOS)

When you need to customize device behavior, integrate Midscene into a framework, or troubleshoot HDC issues, refer to this section. For common constructor parameters (reports, hooks, caching, etc.), see the platform-agnostic [API Reference](./api).

## Action Space

`HarmonyDevice` uses the following action space. The Midscene Agent can use these operations when planning tasks:

- `Tap` — Tap on an element.
- `DoubleClick` — Double-tap on an element.
- `Input` — Input text, supporting `replace`/`typeOnly`/`clear` modes.
- `Scroll` — Scroll from an element or screen center in any direction, supporting scroll-to-top/bottom/left/right.
- `DragAndDrop` — Drag from one element to another.
- `KeyboardPress` — Press a specific key.
- `LongPress` — Long-press a target element with optional custom duration.
- `ClearInput` — Clear input field contents.
- ~~`Pinch`~~ — Not supported. The HarmonyOS `uitest` framework does not provide multi-touch input APIs.
- `Launch` — Open a HarmonyOS app (bundle name).
- `Terminate` — Force-stop a HarmonyOS app by bundle name.
- `RunHdcShell` — Execute a raw `hdc shell` command.
- `HarmonyBackButton` — Trigger system back.
- `HarmonyHomeButton` — Return to home screen.
- `HarmonyRecentAppsButton` — Open recent apps / multitasking.

## HarmonyDevice {#harmonydevice}

Creates an HDC device instance that can be driven by HarmonyAgent.

### Import

```ts
import { HarmonyDevice, getConnectedDevices } from '@midscene/harmony';
```

### Constructor

```ts
const device = new HarmonyDevice(deviceId, {
  // device options...
});
```

### Device Options

- `deviceId: string` — Value from `hdc list targets` or `getConnectedDevices()`.
- `hdcPath?: string` — Custom path to the HDC executable. If not set, it searches `HDC_HOME` environment variable and common installation paths.
- `autoDismissKeyboard?: boolean` — Automatically hide keyboard after input, default `true`.
- `keyboardDismissStrategy?: 'esc-first' | 'back-first'` — Key preference for automatically hiding the keyboard, default `'esc-first'`. HarmonyOS sends the first key from the strategy only: `'esc-first'` sends ESC, while `'back-first'` sends Back.
- `keyboardTypeDelay?: number` — Per-character delay (ms) when typing text. When set, text is typed one character at a time with this delay between each character via `uitest uiInput inputText`. Useful when input fields drop characters under fast typing.
- `screenshotResizeScale?: number` — **Deprecated.** This option has been removed and no longer has any effect. Use `screenshotShrinkFactor` in `AgentOpt` instead to control screenshot size sent to the AI model.
- `customActions?: DeviceAction[]` — Extend the planner's available actions via `defineAction`.

### Usage Notes

- Use `getConnectedDevices()` to discover devices. The returned `deviceId` matches `hdc list targets` output.
- If HDC is not in your system PATH, specify it via the `HDC_HOME` environment variable or the `hdcPath` option.

### Examples

#### Quick Start

```ts
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '@midscene/harmony';

const [first] = await getConnectedDevices();
const device = new HarmonyDevice(first.deviceId, {});
await device.connect();

const agent = new HarmonyAgent(device, {
  aiActionContext: 'This is a HarmonyOS device. If any popup appears, agree to it.',
});

await agent.launch('com.huawei.hmos.settings');
await agent.aiAct('scroll down one screen');
const items = await agent.aiQuery(
  'string[], list all visible setting item names',
);
console.log(items);
```

#### Launch Apps

```ts
await agent.launch('com.huawei.hmos.settings'); // Open Settings
await agent.launch('com.huawei.hmos.camera');    // Open Camera
await agent.back();
await agent.home();
```

## HarmonyAgent {#harmonyagent}

Binds Midscene's AI planning capabilities to a HarmonyDevice for UI automation.

### Import

```ts
import { HarmonyAgent } from '@midscene/harmony';
```

### Constructor

```ts
const agent = new HarmonyAgent(device, {
  // common Agent options...
});
```

### HarmonyOS-Specific Options

- `customActions?: DeviceAction[]` — Extend the planner's available actions via `defineAction`.
- `appNameMapping?: Record<string, string>` — Map friendly app names to bundle names. When you pass an app name to `launch(target)`, the Agent looks up the corresponding bundle name in this mapping; if no mapping is found, it tries to launch `target` as-is.
- Other fields are the same as [API constructors](./api#common-parameters): `generateReport`, `reportFileName`, `aiActionContext`, `modelConfig`, `cacheId`, `createOpenAIClient`, `onTaskStartTip`, etc.

### Usage Notes

:::info

- One device connection corresponds to one Agent.
- HarmonyOS-specific helpers like `launch`, `terminate`, and `runHdcShell` can also be used in YAML scripts. See [HarmonyOS platform-specific actions](./automate-with-scripts-in-yaml#the-harmony-part).
- For common interaction methods, see [API Reference (Common)](./api#interaction-methods).

:::

### HarmonyOS-Specific Methods

#### `agent.launch()`

Launch a HarmonyOS app.

```ts
function launch(uri: string): Promise<void>;
```

- `uri: string` — Can be an app bundle name (e.g., `com.huawei.hmos.settings`), or an app name registered in `appNameMapping`. If a URL starting with `http://` or `https://` is passed, it opens via the browser.

```ts
await agent.launch('com.huawei.hmos.settings'); // Open Settings
await agent.launch('com.huawei.hmos.camera');    // Open Camera
```

#### `agent.runHdcShell()`

Run a raw `hdc shell` command on the connected device.

```ts
function runHdcShell(command: string): Promise<string>;
```

- `command: string` — The command passed directly to `hdc shell`.

```ts
const result = await agent.runHdcShell('hidumper -s RenderService -a screen');
console.log(result);
```

#### `agent.terminate()`

Terminate (force-stop) a running HarmonyOS app.

```ts
function terminate(uri: string): Promise<void>;
```

- `uri: string` — Bundle name, app name in `appNameMapping`, or `bundle/Ability` (only the bundle part is used).

```ts
await agent.terminate('com.huawei.hmos.settings');
```

#### Navigation Helpers

- `agent.back(): Promise<void>` — Trigger HarmonyOS system back.
- `agent.home(): Promise<void>` — Return to home screen.
- `agent.recentApps(): Promise<void>` — Open recent apps / multitasking.

### Utilities

#### `agentFromHdcDevice()`

Create a `HarmonyAgent` from any connected HDC device.

```ts
function agentFromHdcDevice(
  deviceId?: string,
  opts?: HarmonyAgentOpt & HarmonyDeviceOpt,
): Promise<HarmonyAgent>;
```

- `deviceId?: string` — Connect to a specific device; leave empty for "first available device".
- `opts?: HarmonyAgentOpt & HarmonyDeviceOpt` — Merge Agent options and [`HarmonyDevice`](#harmonydevice) settings in a single object.

```ts
import { agentFromHdcDevice } from '@midscene/harmony';

const agent = await agentFromHdcDevice('0123456789ABCDEF'); // specific device
const agent = await agentFromHdcDevice(); // first available device
```

#### `getConnectedDevices()`

List HDC devices that Midscene can drive.

```ts
function getConnectedDevices(
  hdcPath?: string,
): Promise<Array<{ deviceId: string }>>;
```

```ts
import { getConnectedDevices } from '@midscene/harmony';

const devices = await getConnectedDevices();
console.log(devices); // [{ deviceId: '0123456789ABCDEF' }]
```

### Related Reading

- [HarmonyOS Getting Started](./harmony-getting-started) for setup and script examples.

<!-- END OFFICIAL PAGE 26: harmony-api-reference.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 27: harmony-getting-started.mdx -->

## Source page: `harmony-getting-started.mdx`

import StartExperience from './common/start-experience.mdx';
import SetupEnv from './common/setup-env.mdx';

import { PackageManagerTabs } from '@theme';

# HarmonyOS Getting Started

This guide walks you through everything needed to automate HarmonyOS devices with Midscene: connecting a real device via HDC, configuring model API keys, trying the zero-code Playground, and running your first JavaScript script.

:::info Demo Projects

Control HarmonyOS devices with JavaScript: [https://github.com/web-infra-dev/midscene-example/blob/main/harmony/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/harmony/javascript-sdk-demo)

Integrate Vitest for testing: [https://github.com/web-infra-dev/midscene-example/tree/main/harmony/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/harmony/vitest-demo)

:::

<SetupEnv />

## Prerequisites

Before writing scripts, verify that HDC can connect to your device and the device trusts the current computer.

### Install HDC

HDC (HarmonyOS Device Connector) is a command-line tool provided by HarmonyOS for communicating with devices. Installation options:

- Via [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/) (recommended)
- Via [HarmonyOS command-line tools](https://developer.huawei.com/consumer/en/download/) standalone installation

Verify HDC is installed:

```bash
hdc version
```

A version number in the output confirms successful installation.

:::tip Configuring HDC Path

If `hdc` is not in your system PATH, set the `HDC_HOME` environment variable to the directory containing HDC:

```bash
export HDC_HOME=/path/to/hdc/directory
```

:::

### Enable Developer Mode and Verify Device

In your HarmonyOS device settings, go to **Developer Options** and enable **USB Debugging**, then connect via USB cable.

Verify the connection:

```bash
hdc list targets
```

A device ID in the output confirms a successful connection:

```log
0123456789ABCDEF
```

## Try Playground (Zero Code)

Playground is the fastest way to verify your connection and observe the AI Agent, without writing any code. It shares the same code implementation as `@midscene/harmony`, so flows validated in Playground will work identically when run via scripts.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/harmony.mp4" controls/>

1. Launch the Playground CLI:

```bash
npx --yes @midscene/harmony-playground
```

2. Click the gear button in the Playground window and paste your API Key configuration. If you don't have an API Key yet, go back to [Model Configuration](./model-config) to get one.

## Start Your Experience

<StartExperience />

## Integrate Midscene Agent

Once Playground runs successfully, you can switch to reusable JavaScript scripts.

### Step 1: Install Dependencies

<PackageManagerTabs command="install @midscene/harmony dotenv --save-dev" />

### Step 2: Write a Script

The following example opens the Settings app on the device and performs scrolling operations.

```typescript title="./demo.ts"
import 'dotenv/config'; // load Midscene environment variables from .env if present
import {
  HarmonyAgent,
  HarmonyDevice,
  getConnectedDevices,
} from '@midscene/harmony';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    const devices = await getConnectedDevices();
    const device = new HarmonyDevice(devices[0].deviceId, {});

    const agent = new HarmonyAgent(device, {
      aiActionContext:
        'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
    });
    await device.connect();

    // Open Settings app
    await agent.launch('com.huawei.hmos.settings');
    await sleep(2000);

    // Scroll down
    await agent.aiAct('scroll down one screen');

    // Query page content
    const items = await agent.aiQuery(
      'string[], list all visible setting item names',
    );
    console.log('Settings items', items);

    // Assert
    await agent.aiAssert('There is a settings item list on the page');
  })(),
);
```

### Step 3: Run the Example

```bash
npx tsx demo.ts
```

### Step 4: View the Report

After a successful run, the console outputs `Midscene - report file updated: /path/to/report/some_id.html`. Open this HTML file in a browser to replay each interaction, query, and assertion.

## Advanced

When you need to customize device behavior, integrate Midscene into a standalone framework, or troubleshoot HDC issues, refer to this section. See [API Reference (HarmonyOS)](./harmony-api-reference) for more constructor parameters.

### Extending Midscene on HarmonyOS

Use `defineAction()` to define custom gestures and pass them via `customActions`. Midscene appends custom actions to the planner, allowing AI to invoke your domain-specific action names.

```typescript
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '@midscene/harmony';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z.number().int().positive().describe('How many times to click'),
  }),
  async call(param) {
    const { locate, count } = param;
    console.log('click target center', locate.center);
    console.log('click count', count);
  },
});

const devices = await getConnectedDevices();
const device = new HarmonyDevice(devices[0].deviceId, {});
await device.connect();

const agent = new HarmonyAgent(device, {
  customActions: [ContinuousClick],
});

await agent.aiAct('click the red button five times');
```

For more details on custom actions and action schemas, see [Integrate with Any Interface](./integrate-with-any-interface#define-a-custom-action).

## More

- View all Agent methods: [API Reference (Common)](./api#interaction-methods)
- HarmonyOS-specific parameters and interfaces: [HarmonyOS Agent API](./harmony-api-reference)
- Demo projects
  - HarmonyOS JavaScript SDK demo: [https://github.com/web-infra-dev/midscene-example/blob/main/harmony/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/harmony/javascript-sdk-demo)
  - HarmonyOS + Vitest demo: [https://github.com/web-infra-dev/midscene-example/tree/main/harmony/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/harmony/vitest-demo)

### Complete example (Vitest + HarmonyAgent)

```typescript
import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';
import { sleep } from '@midscene/core/utils';
import {
  HarmonyAgent,
  HarmonyDevice,
  getConnectedDevices,
} from '@midscene/harmony';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';

describe('HarmonyOS Settings Test', () => {
  let device: HarmonyDevice;
  let agent: HarmonyAgent;
  let itTestStatus: TestStatus = 'passed';
  const reportMergingTool = new ReportMergingTool();

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    device = new HarmonyDevice(devices[0].deviceId);
    await device.connect();
  });

  beforeEach((ctx) => {
    agent = new HarmonyAgent(device, {
      groupName: ctx.task.name,
    });
  });

  afterEach((ctx) => {
    if (ctx.task.result?.state === 'pass') {
      itTestStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      itTestStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0].message.includes('timed out')) {
      itTestStatus = 'timedOut';
    } else {
      itTestStatus = 'failed';
    }
    reportMergingTool.append({
      reportFilePath: agent.reportFile as string,
      reportAttributes: {
        testId: `${ctx.task.name}`,
        testTitle: `${ctx.task.name}`,
        testDescription: 'description',
        testDuration: (Date.now() - ctx.task.result?.startTime!) | 0,
        testStatus: itTestStatus,
      },
    });
  });

  afterAll(() => {
    reportMergingTool.mergeReports('my-harmony-setting-test-report');
  });

  it('toggle WLAN', async () => {
    await device.home();
    await sleep(1000);
    await device.launch('com.huawei.hmos.settings');
    await sleep(1000);
    await agent.aiAct('find and enter WLAN setting');
    await agent.aiAct(
      'toggle WLAN status *once*, if WLAN is off please turn it on, otherwise turn it off.',
    );
  });

  it('toggle Bluetooth', async () => {
    await device.home();
    await sleep(1000);
    await device.launch('com.huawei.hmos.settings');
    await sleep(1000);
    await agent.aiAct('find and enter Bluetooth setting');
    await agent.aiAct(
      'toggle Bluetooth status *once*, if Bluetooth is off please turn it on, otherwise turn it off.',
    );
  });
});
```

:::tip

Merged reports are stored inside `midscene_run/report` by default. Override the directory with `MIDSCENE_RUN_DIR` when running in CI.

:::

## FAQ

### Keyboard is not dismissed or the page goes back after typing

Midscene automatically dismisses the keyboard after entering text. By default, HarmonyOS uses the ESC key so the current page is less likely to navigate back. If ESC does not close the keyboard in your app, switch to Back first:

```typescript
const device = new HarmonyDevice('device-id', {
  keyboardDismissStrategy: 'back-first',
});
```

If your input field listens for Back and clears or closes in response, disable auto keyboard dismiss:

```typescript
const device = new HarmonyDevice('device-id', {
  autoDismissKeyboard: false,
});
```

With auto dismiss disabled, the keyboard will remain visible. You can use `aiAct` to manually dismiss it, e.g. `await agent.aiAct('dismiss the keyboard')`.

### How to use a custom HDC path?

Set the `HDC_HOME` environment variable to point to the HDC directory:

```bash
export HDC_HOME=/path/to/hdc/directory
```

Or pass it via the constructor:

```typescript
const device = new HarmonyDevice('0123456789ABCDEF', {
  hdcPath: '/path/to/hdc',
});
```

<!-- END OFFICIAL PAGE 27: harmony-getting-started.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 28: harmony-introduction.mdx -->

## Source page: `harmony-introduction.mdx`

import ShowcaseHarmony from './showcases-harmony.mdx';

# HarmonyOS Automation Support

Midscene can drive the HDC (HarmonyOS Device Connector) tool to automate HarmonyOS NEXT devices.

Thanks to its visual model approach, the entire automation process works with any HarmonyOS app technology stack — whether ArkTS native or other frameworks. Developers only need to debug UI automation scripts against the final rendered interface.

The HarmonyOS UI automation solution includes all Midscene features:

- Zero-code trial via Playground.
- JavaScript SDK support.
- YAML-based automation scripts and CLI tools.
- HTML report generation for replaying all action paths.

## Showcases

<ShowcaseHarmony />

See more showcases: [showcases](./showcases.mdx)

## Try Midscene Playground on HarmonyOS

With Midscene.js Playground, you can experience HarmonyOS automation without writing any code.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/harmony.mp4" controls/>

See [Getting Started](./harmony-getting-started#try-playground-zero-code) to learn how to launch Playground.

## Next Steps

* [Getting Started](./harmony-getting-started)
* [Using JavaScript SDK](./harmony-getting-started)
* [Using YAML automation scripts](./automate-with-scripts-in-yaml) and [CLI tools](./automate-with-scripts-in-yaml)

<!-- END OFFICIAL PAGE 28: harmony-introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 29: index.mdx -->

## Source page: `index.mdx`

---
pageType: home
---

<!-- END OFFICIAL PAGE 29: index.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 30: integrate-with-any-interface.mdx -->

## Source page: `integrate-with-any-interface.mdx`

import SetupEnv from './common/setup-env.mdx';

# Integrate with any interface

You can use Midscene Agent to control any interface—such as IoT devices, in-house apps, and in-vehicle displays—by implementing a UI operation class that conforms to `AbstractInterface`.

After implementing the UI operation class, you get the full capabilities of Midscene Agent:

- the TypeScript GUI Automation Agent SDK, supporting integration with any interface
- the playground for debugging
- controlling the interface with YAML scripts
- Skills support through CLI commands


## Demo and community project

We have prepared a demo project for you to learn how to define your own interface class. It's highly recommended to check it out.

* [Demo Project](https://github.com/web-infra-dev/midscene-example/tree/main/custom-interface) - A simple demo project that shows how to define your own interface class

* [Android (adb) Agent](https://github.com/web-infra-dev/midscene/blob/main/packages/android/src/device.ts) - This is the Android (adb) Agent for Midscene that implements this feature

* [iOS (WebDriverAgent) Agent](https://github.com/web-infra-dev/midscene/blob/main/packages/ios/src/device.ts) - This is the iOS (WebDriverAgent) Agent for Midscene that implements this feature

There are also some community projects that use this feature:

* [midscene-ios](https://github.com/lhuanyu/midscene-ios) - A project driving the OSX "iPhone Mirroring" app with Midscene

<SetupEnv />

## Implement your own interface class

### Key concepts

* The `AbstractInterface` class: a predefined abstract class that can connect to the Midscene Agent
* The **action space**: a set of actions that describe the actions that can be performed on the interface. This will affect how the AI model plans the actions and executes them

### Step 1. Clone and setup from the demo project

We provide a demo project that runs all the features of this document below. It's the fastest way to get started.

```bash
# prepare the environment
git clone https://github.com/web-infra-dev/midscene-example.git
cd midscene-example/custom-interface
npm install
npm run build

# run the demo
npm run demo
```

### Step 2. Implement your interface class

Define a class that extends the `AbstractInterface` class, and implement the required methods.

You can get the sample implementation from the [`./src/sample-device.ts`](https://github.com/web-infra-dev/midscene-example/blob/main/custom-interface/src/sample-device.ts) file. Let's take a glance at it.

```typescript
import type { DeviceAction, Size } from '@midscene/core';
import { getMidsceneLocationSchema, z } from '@midscene/core';
import {
  type AbstractInterface,
  defineAction,
  defineActionTap,
  defineActionInput,
  // ... other action imports
} from '@midscene/core/device';

export interface SampleDeviceConfig {
  deviceName?: string;
  width?: number;
  height?: number;
}

/**
 * SampleDevice - A template implementation of AbstractInterface
 */
export class SampleDevice implements AbstractInterface {
  interfaceType = 'sample-device';
  private config: Required<SampleDeviceConfig>;

  constructor(config: SampleDeviceConfig = {}) {
    this.config = {
      deviceName: config.deviceName || 'Sample Device',
      width: config.width || 1920,
      height: config.height || 1080,
    };
  }

  /**
   * Required: Take a screenshot and return base64 string
   */
  async screenshotBase64(): Promise<string> {
    // TODO: Implement actual screenshot capture
    console.log('📸 Taking screenshot...');
    return 'data:image/png;base64,...'; // Your screenshot implementation
  }

  /**
   * Required: Get interface dimensions
   * The width and height here refer to the logical size of the interface, not considering the device pixel ratio (dpr). The coordinates obtained from actions like defineActionTap are also based on this logical coordinate system. You can convert logical coordinates to physical coordinates in your action implementations if needed.
   */
  async size(): Promise<Size> {
    return {
      width: this.config.width,
      height: this.config.height,
    };
  }

  /**
   * Required: Define available actions for AI model
   */
  actionSpace(): DeviceAction[] {
    return [
      // Basic tap action
      defineActionTap(async (param) => {
        // TODO: Implement tap at param.locate.center coordinates
        await this.performTap(param.locate.center[0], param.locate.center[1]);
      }),

      // Text input action  
      defineActionInput(async (param) => {
        // TODO: Implement text input
        await this.performInput(param.locate.center[0], param.locate.center[1], param.value);
      }),

      // Custom action example
      defineAction({
        name: 'CustomAction',
        description: 'Your custom device-specific action',
        paramSchema: z.object({
          locate: getMidsceneLocationSchema(),
          // ... custom parameters
        }),
        call: async (param) => {
          // TODO: Implement custom action
        },
      }),
    ];
  }

  async destroy(): Promise<void> {
    // TODO: Cleanup resources
  }

  // Private implementation methods
  private async performTap(x: number, y: number): Promise<void> {
    // TODO: Your actual tap implementation
  }

  private async performInput(x: number, y: number, text: string): Promise<void> {
    // TODO: Your actual input implementation  
  }
}
```

The key methods that you need to implement are:
- `screenshotBase64()`, `size()`: help the AI model to get the context of the interface
- `actionSpace()`: an array of `DeviceAction` objects defining the actions that can be performed on the interface. AI model will use these actions to perform the actions. Midscene has provided a set of predefined action spaces for the most common interfaces and devices. And there is also a method to define any custom action.

Use these commands to run the agent:

- `npm run build` to rebuild the agent
- `npm run demo` to run the agent with javascript
- `npm run demo:yaml` to run the agent with yaml script


### Step 3. Test the agent with the playground

Attach a playground server to the agent, and you can test the agent in the web browser.

```ts 
import 'dotenv/config'; // read Midscene environment variables from .env file
import { playgroundForAgent } from '@midscene/playground';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// instantiate device and agent
const device = new SampleDevice();
await device.launch();
const agent = new Agent(device);

// launch playground
const server = await playgroundForAgent(agent).launch();

// close playground
await sleep(10 * 60 * 1000);
await server.close();
console.log('Playground closed!');
```

### Step 4. Add Skill support (optional)

[Agent Skills](https://github.com/anthropics/skills) let AI coding assistants (Claude Code, Cline, etc.) drive your custom interface through CLI commands. Learn more in the [Skills documentation](./skills).

Add a CLI entry file to your npm package (e.g., `./src/cli.ts`):

```ts
#!/usr/bin/env node
import { runSkillCLI } from '@midscene/core/skill';
import { SampleDevice } from './sample-device';

runSkillCLI({
  DeviceClass: SampleDevice,
  scriptName: 'my-device',
});
```

Then add a `bin` field to your `package.json`:

```json
{
  "bin": {
    "my-device": "./dist/cli.js"
  }
}
```

Once published, AI coding assistants can control your custom interface via `npx my-device`.

For Skill authoring guidelines and more examples, see the [midscene-skills](https://github.com/web-infra-dev/midscene-skills) repository.

### Step 5. Release the npm package, and let your users use it

The agent and interface class have been exported in `./index.ts` file. Now you can publish it to npm.

Fill the `name` and `version` in the `package.json` file, and then run the following command:

```bash
npm publish
```

A typical usage of your npm package is like this:

```typescript
import 'dotenv/config'; // read Midscene environment variables from .env file
import { playgroundForAgent } from '@midscene/playground';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// instantiate device and agent
const device = new SampleDevice();
await device.launch();
const agent = new Agent(device);

await agent.aiAct('click the button');
```

### Step 6. Invoke your class in Midscene CLI and YAML script

Write a yaml script with the `interface` section to invoke your class.

```yaml
interface:
  module: 'my-pkg-name'
  # export: 'MyDeviceClass' # use this if this is a named export

config: 
  output: './data.json'
```

This config works same as this:
```typescript
import MyDeviceClass from 'my-pkg-name';
const device = new MyDeviceClass();
const agent = new Agent(device, {
  output: './data.json',
});
```

Other fields in the yaml script are the same as the [yaml script](./automate-with-scripts-in-yaml.html).

## API reference

### Agent constructor

```typescript
import { Agent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core';
```

Create an agent by pairing your custom `AbstractInterface` implementation with the standard constructor:

```typescript
const device = new SampleDevice({
  deviceName: 'Demo Panel',
  width: 1920,
  height: 1080,
});

const agent = new Agent(device, {
  actionContext: 'Dismiss pop-ups before every task.',
  generateReport: true,
  customActions: [], // optional extra DeviceAction list
});
```

- `device: AbstractInterface` (required): Any class that fulfills `screenshotBase64`, `size`, and `actionSpace`. This is where you translate Midscene actions into real I/O calls for your hardware or desktop app.
- `options?: PageAgentOpt`: Shares the same option bag as the browser and mobile agents described in the [API constructors](./api#common-parameters). Commonly used fields include `generateReport`, `reportFileName`, `actionContext`/`aiActionContext`, `cacheId`, `modelConfig`, `createOpenAIClient`, `customActions`, and `onTaskStartTip`.
- The resulting agent instantly unlocks the regular automation surfaces: `aiAct`/`aiTap` APIs, YAML runner (`interface` block), [playground](#playgroundforagent-function), Skills CLI support, and reporting pipeline.

### `AbstractInterface` class

```typescript
import { AbstractInterface } from '@midscene/core';
```

`AbstractInterface` is the key class for the agent to control the interface. 

These are the required methods that you need to implement:

- `interfaceType: string`: define a name for the interface, this will not be provided to the AI model
- `screenshotBase64(): Promise<string>`: take a screenshot of the interface and return the base64 string with the `'data:image/` prefix
- `size(): Promise<Size>`: the size of the interface, which is an object with the `width` and `height` properties
- `actionSpace(): DeviceAction[] | Promise<DeviceAction[]>`: the action space of the interface, which is an array of `DeviceAction` objects. Use predefined actions or define any custom action.

Type signatures:

```ts
import type { DeviceAction, Size, UIContext } from '@midscene/core';
import type { ElementNode } from '@midscene/shared/extractor';

abstract class AbstractInterface {
  // Required
  abstract interfaceType: string;
  abstract screenshotBase64(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[] | Promise<DeviceAction[]>;

  // Optional lifecycle/hooks
  abstract destroy?(): Promise<void>;
  abstract describe?(): string;
  abstract beforeInvokeAction?(actionName: string, param: any): Promise<void>;
  abstract afterInvokeAction?(actionName: string, param: any): Promise<void>;
}
```

These are the optional methods that you can implement:

- `destroy?(): Promise<void>`: destroy the interface
- `describe?(): string`: describe the interface, this may be used for the report and the playground. But it will not be provided to the AI model.
- `beforeInvokeAction?(actionName: string, param: any): Promise<void>`: a hook function before invoking an action in action space
- `afterInvokeAction?(actionName: string, param: any): Promise<void>`: a hook function after invoking an action

### The action space

Action space is the set of actions that can be performed on the interface. AI model will use these actions to perform the actions. All the descriptions and parameter schemas of the actions will be provided to the AI model.

To help you easily define the action space, Midscene has provided a set of predefined action spaces for the most common interfaces and devices. And there is also a method to define any custom action.

This is how you can import the utils to define the action space:

```typescript
import {
	type ActionTapParam,
	defineAction,
	defineActionTap,
} from "@midscene/core/device";
```

#### The predefined actions

These are the predefined action spaces for the most common interfaces and devices. You can expose them to the customized interface by implementing the call method of the action.

You can find the parameters of the actions in the type definition of these functions.

* `defineActionTap()`: define the tap action. This is also the function to invoke for the `aiTap` method.
* `defineActionDoubleClick()`: define the double click action
* `defineActionInput()`: define the input action. This is also the function to invoke for the `aiInput` method. This is also the function to invoke for the `aiInput` method.
* `defineActionKeyboardPress()`: define the keyboard press action. This is also the function to invoke for the `aiKeyboardPress` method.
* `defineActionScroll()`: define the scroll action. This is also the function to invoke for the `aiScroll` method.
* `defineActionDragAndDrop()`: define the drag and drop action
* `defineActionLongPress()`: define the long press action
* `defineActionSwipe()`: define the swipe action

#### Define a custom action

You can define your own action by using the `defineAction()` function. You can also use this method to define more actions for the [PuppeteerAgent](./integrate-with-puppeteer), [AgentOverChromeBridge](./bridge-mode#constructor), and [AndroidAgent](./android-getting-started).

API Signature:

```typescript
import type { ExecutorContext } from "@midscene/core";
import { defineAction } from "@midscene/core/device";

defineAction(
  {
    name: string,
    description: string,
    paramSchema: z.ZodType<T>;
    call: (
      param: z.infer<z.ZodType<T>>,
      context?: ExecutorContext,
    ) => Promise<void>;
  }
)
```

* `name`: the name of the action, AI model will use this name to invoke the action
* `description`: the description of the action, AI model will use this description to understand what the action is doing. For complex actions, you can provide a more detailed example here.
* `paramSchema`: the [Zod](https://www.npmjs.com/package/zod) schema of the parameters of the action, AI model will help to fill the parameters according to this schema
* `call`: the function to invoke the action, you can get the parameters from the `param` parameter which conforms to the `paramSchema`
* `context`: optional execution context. The action's return value populates `task.output` (for your API callers and the report) and is **not** sent to the planner. To pass a concise, planner-facing summary to the next planning round, set `context.task.planningFeedback`; the core planning layer truncates it to keep it within the model context.


Example:

```typescript
defineAction({
  name: 'MyAction',
  description: 'My action',
  paramSchema: z.object({
    name: z.string(),
  }),
  call: async (param) => {
    console.log(param.name);
  },
});
```

If you want to get a param about the location of some element, you can use the `getMidsceneLocationSchema()` function to get the specific zod schema.

A more complex example about defining a custom action:

```typescript
import { getMidsceneLocationSchema } from "@midscene/core/device";

defineAction({
  name: 'LaunchApp',
  description: 'A an app on screen',
  paramSchema: z.object({
    name: z.string().describe('The name of the app to launch'),
    locate: getMidsceneLocationSchema().describe('The app icon to be launched'),
  }),
  call: async (param) => {
    console.log(`launching app: ${param.name}, ui located at: ${JSON.stringify(param.locate.center)}`);
  },
});
```

### `playgroundForAgent` function

```typescript
import { playgroundForAgent } from '@midscene/playground';
```

The `playgroundForAgent` function creates a playground launcher for a specific Agent, allowing you to test and debug your custom interface Agent in a web browser.

#### Function signature

```typescript
function playgroundForAgent(agent: Agent): {
  launch(options?: LaunchPlaygroundOptions): Promise<LaunchPlaygroundResult>
}
```

#### Parameters

- `agent: Agent`: The Agent instance to launch the playground for

#### Return value

Returns an object containing a `launch` method.

#### `launch` method options

```typescript
interface LaunchPlaygroundOptions {
  /**
   * Port to start the playground server on
   * @default 5800
   */
  port?: number;

  /**
   * Whether to automatically open the playground in browser
   * @default true
   */
  openBrowser?: boolean;

  /**
   * Custom browser command to open playground
   * @default 'open' on macOS, 'start' on Windows, 'xdg-open' on Linux
   */
  browserCommand?: string;

  /**
   * Whether to show server logs
   * @default true
   */
  verbose?: boolean;

  /**
   * Unique identifier for the playground server instance
   * Same ID shares playground chat history
   * @default undefined (generates random UUID)
   */
  id?: string;
}
```

#### `launch` method return value

```typescript
interface LaunchPlaygroundResult {
  /**
   * The playground server instance
   */
  server: PlaygroundServer;

  /**
   * The server port
   */
  port: number;

  /**
   * The server host
   */
  host: string;

  /**
   * Function to close the playground
   */
  close: () => Promise<void>;
}
```

#### Usage example

```typescript
import 'dotenv/config';
import { playgroundForAgent } from '@midscene/playground';
import { SampleDevice } from './sample-device';
import { Agent } from '@midscene/core/agent';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Create device and agent instances
const device = new SampleDevice();
const agent = new Agent(device);

// Launch playground
const result = await playgroundForAgent(agent).launch({
  port: 5800,
  openBrowser: true,
  verbose: true
});

console.log(`Playground started: http://${result.host}:${result.port}`);

// Close playground when needed
await sleep(10 * 60 * 1000); // Wait 10 minutes
await result.close();
console.log('Playground closed!');
```

## FAQ

**My interface-controller is general-purpose; can it be included in this document?**

Yes, we are happy to gather creative projects and list them in this document.

[Raise an issue](https://github.com/web-infra-dev/midscene/issues) to us when it's ready.

<!-- END OFFICIAL PAGE 30: integrate-with-any-interface.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 31: integrate-with-playwright.mdx -->

## Source page: `integrate-with-playwright.mdx`

import SetupEnv from './common/setup-env.mdx';
import GetCdpUrl from './common/get-cdp-url.mdx';
import { PackageManagerTabs } from '@theme';

# Integrate with Playwright

[Playwright.js](https://playwright.com/) is an open-source automation library developed by Microsoft, mainly used for end-to-end testing and web scraping of web applications.

There are two ways to integrate with Playwright:

- Directly integrate and call the Midscene Agent via script, suitable for quick prototyping, data scraping, and automation scripts.
- Integrate Midscene into Playwright test cases, suitable for UI testing scenarios.

<SetupEnv />

## Direct integration with Midscene agent

:::info Example Project

You can find an example project of direct Playwright integration here: [https://github.com/web-infra-dev/midscene-example/blob/main/playwright-demo](https://github.com/web-infra-dev/midscene-example/blob/main/playwright-demo)

:::

### Step 1: Install dependencies

<PackageManagerTabs command="install @midscene/web playwright @playwright/test tsx --save-dev" />

### Step 2: Write the script

Save the following code as `./demo.ts`:

```typescript
import { chromium } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';
import 'dotenv/config'; // read environment variables from .env file

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

Promise.resolve(
  (async () => {
    const browser = await chromium.launch({
      headless: true, // 'true' means we can't see the browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewportSize({
      width: 1280,
      height: 768,
    });
    await page.goto('https://www.ebay.com');
    await sleep(5000); // 👀 init Midscene agent
    const agent = new PlaywrightAgent(page);

    // 👀 type keywords, perform a search
    await agent.aiAct('type "Headphones" in search box, hit Enter');

    // 👀 wait for the loading
    await agent.aiWaitFor('there is at least one headphone item on page');
    // or you may use a plain sleep:
    // await sleep(5000);

    // 👀 understand the page content, find the items
    const items = await agent.aiQuery(
      '{itemTitle: string, price: Number}[], find item in list and corresponding price',
    );
    console.log('headphones in stock', items);

    const isMoreThan1000 = await agent.aiBoolean(
      'Is the price of the headphones more than 1000?',
    );
    console.log('isMoreThan1000', isMoreThan1000);

    const price = await agent.aiNumber(
      'What is the price of the first headphone?',
    );
    console.log('price', price);

    const name = await agent.aiString(
      'What is the name of the first headphone?',
    );
    console.log('name', name);

    const location = await agent.aiLocate(
      'What is the location of the first headphone?',
    );
    console.log('location', location);

    // 👀 assert by AI
    await agent.aiAssert('There is a category filter on the left');

    // 👀 click on the first item
    await agent.aiTap('the first item in the list');

    await browser.close();
  })(),
);
```

For more Agent API details, please refer to [API Reference](./api#interaction-methods).

### Step 3: Run the script

Use `tsx` to run, and you will see the product information printed in the terminal:

```bash
# run
npx tsx demo.ts

# The terminal should output something like:
#  [
#   {
#     itemTitle: 'JBL Tour Pro 2 - True wireless Noise Cancelling earbuds with Smart Charging Case',
#     price: 551.21
#   },
#   {
#     itemTitle: 'Soundcore Space One Wireless Headphones 40H ANC Playtime 2XStronger Voice',
#     price: 543.94
#   }
# ]
```

### Step 4: View the run report

After the above command executes successfully, it will output: `Midscene - report file updated: /path/to/report/some_id.html`. Open this file in your browser to view the report.

## Integration in Playwright test cases

Here we assume you already have a repository with Playwright integration.

:::info Example Project

You can find an example project of Playwright test integration here: [https://github.com/web-infra-dev/midscene-example/blob/main/playwright-testing-demo](https://github.com/web-infra-dev/midscene-example/blob/main/playwright-testing-demo)

:::

### Step 1: Add dependencies and update configuration

Add dependencies

<PackageManagerTabs command="install @midscene/web --save-dev" />

Update playwright.config.ts

```diff
export default defineConfig({
  testDir: './e2e',
+ timeout: 90 * 1000,
+ reporter: [["list"], ["@midscene/web/playwright-reporter", { type: "merged" }]], // type optional, default is "merged", means multiple test cases generate one report, optional value is "separate", means one report for each test case
});
```

Reporter configuration options:
- `type`: Report mode, can be `merged` (default) or `separate`. `merged` means multiple test cases generate one merged report, `separate` means each test case generates its own report.
- `outputFormat`: Controls how the report is generated. `'single-html'` (default) embeds all screenshots as base64 in a single HTML file. `'html-and-external-assets'` saves screenshots as separate PNG files in a subdirectory, useful when report files are too large. **Note**: When using `'html-and-external-assets'`, reports must be served via HTTP server and cannot be opened directly using `file://` protocol (because browser CORS restrictions block loading local images via relative paths from the file protocol). Navigate to the report directory and run one of the following commands:
  - Using Node.js: `npx serve`
  - Using Python: `python -m http.server` or `python3 -m http.server`

  Then access the report via `http://localhost:3000` (or the port shown in the terminal).

### Step 2: Extend the `test` instance

Save the following code as `./e2e/fixture.ts`:

```typescript
import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    waitForNetworkIdleTimeout: 2000, // optional, the timeout for waiting for network idle between each action, default is 2000ms
    replanningCycleLimit: 30, // optional, override the default aiAct replanning cycle limit
  }),
);
```

`PlaywrightAiFixture()` accepts all shared `PlaywrightAgent` options, so you can configure agent behavior like `replanningCycleLimit`, `waitAfterAction`, and `modelConfig` directly at fixture creation time. Fixture-managed metadata like `testId`, `reportFileName`, `groupName`, and `groupDescription` is still generated automatically.

### Step 3: Write test cases

Review the full catalog of action, query, and utility methods in the [Agent API reference](./api#interaction-methods). When you need lower-level control, you can use `agentForPage` to obtain the underlying `PageAgent` instance and call any API directly:

```typescript
test('case demo', async ({ agentForPage, page }) => {
  const agent = await agentForPage(page);

  await agent.recordToReport();
  const logContent = agent._unstableLogContent();
  console.log(logContent);
});
```

#### Example code

```typescript title="./e2e/ebay-search.spec.ts"
import { expect } from '@playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://www.ebay.com');
  await page.waitForLoadState('networkidle');
});

test('search headphone on ebay', async ({
  ai,
  aiQuery,
  aiAssert,
  aiInput,
  aiTap,
  aiScroll,
  aiWaitFor,
  aiRightClick,
  recordToReport,
}) => {
  // Use aiInput to enter search keyword
  await aiInput('Headphones', 'search box');

  // Use aiTap to click search button
  await aiTap('search button');

  // Wait for search results to load
  await aiWaitFor('search results list loaded', { timeoutMs: 5000 });

  // Use aiScroll to scroll to bottom
  await aiScroll(
    {
      scrollType: 'untilBottom',
    },
    'search results list',
  );

  // Use aiQuery to get product information
  const items = await aiQuery<Array<{ title: string; price: number }>>(
    'get product titles and prices from search results',
  );

  console.log('headphones in stock', items);
  expect(items?.length).toBeGreaterThan(0);

  // Use aiAssert to verify filter functionality
  await aiAssert('category filter exists on the left side');

  // Use recordToReport to capture the current state
  await recordToReport('Search Results', {
    content: 'Final search results for headphones',
  });
});
```

For more Agent API details, please refer to [API Reference](./api#interaction-methods).

### Step 4. Run test cases

```bash
npx playwright test ./e2e/ebay-search.spec.ts
```

### Step 5. View test report

After the command executes successfully, it will output: `Midscene - report file updated: ./current_cwd/midscene_run/report/some_id.html`. Open this file in your browser to view the report.

## Advanced

### About opening in a new tab

Each Agent instance is bound to a single page. To make debugging easier, Midscene intercepts new tabs by default (for example, links with `target="_blank"`) and opens them in the current page.

If you want to restore opening in a new tab, set `forceSameTabNavigation` to `false`—but you’ll need to create a new Agent instance for each new tab.

```typescript
const mid = new PlaywrightAgent(page, {
  forceSameTabNavigation: false,
});
```

### Browser support

Some Midscene web automation features rely on Chrome DevTools Protocol (CDP), which is provided by Chromium-based browsers. These include browser-level events, touch gestures, and CDP fallback paths used by specific interactions.

When using Playwright, Chromium is the recommended browser engine. Firefox and WebKit may work for basic Playwright-native operations, but Midscene features that depend on CDP may report errors on those engines.

### Connect Midscene Agent to a Remote Playwright Browser

:::info Example Project

You can find an example project of remote Playwright integration here: [https://github.com/web-infra-dev/midscene-example/tree/main/remote-playwright-demo](https://github.com/web-infra-dev/midscene-example/tree/main/remote-playwright-demo)

:::

Connect to a remote Playwright browser when you already run browsers in your own infra or vendor grid. This keeps the browser close to the target environment, avoids repeated launches, and still lets Midscene drive it with the same AI APIs.

#### Prerequisites

<PackageManagerTabs command="install playwright @playwright/test @midscene/web --save-dev" />

<GetCdpUrl />

#### Code example

```typescript
import { chromium } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';

// CDP WebSocket URL from your remote browser service
const cdpWsUrl = 'ws://your-remote-browser.com/devtools/browser/your-session-id';

// Connect and pick a page
const browser = await chromium.connectOverCDP(cdpWsUrl);
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();

// Create Midscene agent (usage matches any Playwright agent)
const agent = new PlaywrightAgent(page);

// Use AI methods as usual
await agent.aiAct('navigate to https://example.com');
await agent.aiAct('click the login button');
const result = await agent.aiQuery('get page title: {title: string}');

// Cleanup
await agent.destroy();
await browser.close();
```

Once connected, keep using `PlaywrightAgent` the same way you would with a locally launched browser.

### Provide custom actions

Use the `customActions` option to extend the agent's action space with your own actions defined via `defineAction`. When provided, these actions will be appended to the built-in ones so the agent can call them during planning.

```typescript
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z
      .number()
      .int()
      .positive()
      .describe('How many times to click'),
  }),
  async call(param) {
    const { locate, count } = param;
    console.log('click target center', locate.center);
    console.log('click count', count);
    // carry out your clicking logic using locate + count
  },
});

const agent = new PlaywrightAgent(page, {
  customActions: [ContinuousClick],
});

await agent.aiAct('click the red button five times');
```

Check [Integrate with any interface](./integrate-with-any-interface#define-a-custom-action) for more details about defining custom actions.

## FAQ

### Playwright browser download takes too long

Playwright does not download browser binaries during `npm install` by default. You need to run `npx playwright install` separately, and that step can be slow on limited networks.

You can speed it up in two ways:

1. Use a mirror, for example `npmmirror.com`

```bash
PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright" npx playwright install
```

2. Download only the commonly used `chromium`

```bash
npx playwright install --with-deps chromium
```

### Cannot click the dropdown

This usually happens when the page uses a native `select` element for the dropdown. In that case, the browser asks the operating system to render the expanded option list with a native control, so the dropdown is not actually rendered inside the webpage and cannot be captured by Playwright screenshots.

First, check the screenshot in the report. If the dropdown options do not appear in the report screenshot after the click, this is very likely the cause.

Midscene enables `forceChromeSelectRendering` by default, which forces Chrome to render the `select` dropdown so it appears in screenshots and can be recognized by Playwright. The dropdown style will look noticeably different from the operating system's default style. If you need the native rendering back, set `forceChromeSelectRendering: false`.

### The webpage continues to flash when running in headed mode

In the local visualization interface, continuous flashing is usually caused by a mismatch between the viewport's `deviceScaleFactor` and the system/browser's pixel ratio (common on high-resolution or Retina screens).

This flashing does not affect Midscene's screenshots or automation execution, but it does affect the local preview experience. To resolve this, set `deviceScaleFactor` to match your browser's `window.devicePixelRatio`, or use Puppeteer's auto-adaptation feature.

```typescript
// Playwright: Playwright does not support using 0 for auto-adaptation like Puppeteer
const page = await browser.newPage({
  deviceScaleFactor: 2, // Replace the number 2 with your window.devicePixelRatio
})
```

If you are unsure of your browser's pixel ratio, you can press F12 on any page to open the console and type `window.devicePixelRatio` to check; or paste the following into the Chrome address bar and press Enter to see the value in a popup:

```plain
data:text/html,<script>alert(`deviceScaleFactor of your browser: ${devicePixelRatio}`)</script>
```

### Customize the network timeout

When doing interaction or navigation on web page, Midscene automatically waits for the network to be idle. It's a strategy to ensure the stability of the automation. Nothing would happen if the waiting process is timeout.

The default timeout is configured as follows:

1. If it's a page navigation, the default wait timeout is 5000ms (the `waitForNavigationTimeout`)
2. If it's a click, input, etc., the default wait timeout is 2000ms (the `waitForNetworkIdleTimeout`)

You can also customize or disable the timeout by options:

- Use `waitForNetworkIdleTimeout` and `waitForNavigationTimeout` parameters in [Agent](/api#constructors).
- Use `waitForNetworkIdle` parameter in [Yaml](/automate-with-scripts-in-yaml#the-web-part) or [PlaywrightAiFixture](/integrate-with-playwright#step-2-extend-the-test-instance).

### `waiting for fonts to load` or `page.screenshot: Timeout ... exceeded` when taking screenshots

If you see an error like this in a Playwright-based environment:

```plain
page.screenshot: Timeout 10000ms exceeded.
Call log:
- taking page screenshot
- waiting for fonts to load...
```

This is usually not caused by Midscene itself. Playwright waits for fonts to finish loading before taking a screenshot. In some CI, container, or restricted network environments, font resources may load very slowly or never finish, which can eventually cause the screenshot to time out.

You can work around it by setting this environment variable:

```bash
export PW_TEST_SCREENSHOT_NO_FONTS_READY=1
```

If you want to set it only for a single command, you can also write:

```bash
PW_TEST_SCREENSHOT_NO_FONTS_READY=1 <your-command>
```

For more background, see the Playwright issue: [[BUG] Page.screenshot method hangs indefinitely](https://github.com/microsoft/playwright/issues/28995).

## More

- For all the methods on the Agent, please refer to [API Reference](./api#interaction-methods).
- For the Playwright API reference, see [Playwright Agent API](./web-api-reference#playwright-agent).
- Demo projects
  - Direct integration: [https://github.com/web-infra-dev/midscene-example/blob/main/playwright-demo](https://github.com/web-infra-dev/midscene-example/blob/main/playwright-demo)
  - Playwright test integration: [https://github.com/web-infra-dev/midscene-example/blob/main/playwright-testing-demo](https://github.com/web-infra-dev/midscene-example/blob/main/playwright-testing-demo)
  - Remote Playwright integration: [https://github.com/web-infra-dev/midscene-example/tree/main/remote-playwright-demo](https://github.com/web-infra-dev/midscene-example/tree/main/remote-playwright-demo)

<!-- END OFFICIAL PAGE 31: integrate-with-playwright.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 32: integrate-with-puppeteer.mdx -->

## Source page: `integrate-with-puppeteer.mdx`

import SetupEnv from './common/setup-env.mdx';
import GetCdpUrl from './common/get-cdp-url.mdx';

# Integrate with Puppeteer

import { PackageManagerTabs } from '@theme';

[Puppeteer](https://pptr.dev/) is a Node.js library which provides a high-level API to control Chrome or Firefox over the DevTools Protocol or WebDriver BiDi. Puppeteer runs in the headless (no visible UI) by default but can be configured to run in a visible ("headful") browser.

:::info Demo Projects

you can check the demo project of Puppeteer here: [https://github.com/web-infra-dev/midscene-example/blob/main/puppeteer-demo](https://github.com/web-infra-dev/midscene-example/blob/main/puppeteer-demo)

There is also a demo of Playwright with Vitest: [https://github.com/web-infra-dev/midscene-example/tree/main/playwright-with-vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/playwright-with-vitest-demo)

:::

<SetupEnv />

## Integration with Midscene Agent

### Step 1. Install dependencies

<PackageManagerTabs command="install @midscene/web puppeteer tsx dotenv --save-dev" />

### Step 2. Write scripts

Write and save the following code as `./demo.ts`.

```typescript title="./demo.ts"
import 'dotenv/config'; // load Midscene environment variables from .env if present
import puppeteer from "puppeteer";
import { PuppeteerAgent } from "@midscene/web/puppeteer";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    const browser = await puppeteer.launch({
      headless: false, // here we use headed mode to help debug
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    await page.goto("https://www.ebay.com");
    await sleep(5000);

    // 👀 init Midscene agent
    const agent = new PuppeteerAgent(page);

    // 👀 type keywords, perform a search
    await agent.aiAct('type "Headphones" in search box, hit Enter');
    await sleep(5000);

    // 👀 understand the page content, find the items
    const items = await agent.aiQuery(
      "{itemTitle: string, price: Number}[], find item in list and corresponding price"
    );
    console.log("headphones in stock", items);

    // 👀 assert by AI
    await agent.aiAssert("There is a category filter on the left");

    await browser.close();
  })()
);
```


### Step 3. Run

Using `tsx` to run, you will get the data of Headphones on eBay:

```bash
# run
npx tsx demo.ts

# it should print 
#  [
#   {
#     itemTitle: 'Beats by Dr. Dre Studio Buds Totally Wireless Noise Cancelling In Ear + OPEN BOX',
#     price: 505.15
#   },
#   {
#     itemTitle: 'Skullcandy Indy Truly Wireless Earbuds-Headphones Green Mint',
#     price: 186.69
#   }
# ]
```

For the complete catalog of agent methods, see the [API reference](./api#interaction-methods).

### Step 4: View the report

After the above command executes successfully, the console will output: `Midscene - report file updated: /path/to/report/some_id.html`. You can open this file in a browser to view the report.

<a id="puppeteeragent"></a>

## Advanced

### About opening in a new tab

Each Agent instance is bound to a single page. For easier debugging, Midscene intercepts new tabs by default (for example, links with `target="_blank"`) and opens them in the current page.

If you want to allow new tabs again, set `forceSameTabNavigation` to `false`—but you must create a new Agent instance for each new tab.

```typescript
const mid = new PuppeteerAgent(page, {
  forceSameTabNavigation: false,
});
```

### Browser support

Some Midscene web automation features rely on Chrome DevTools Protocol (CDP), which is provided by Chromium-based browsers. These include browser-level events, touch gestures, and CDP fallback paths used by specific interactions.

When using Puppeteer, Chrome, Chromium, or another Chromium-based browser is recommended. Browsers that do not provide compatible CDP support may report errors when Midscene uses CDP-backed features.

### Connect Midscene Agent to a Remote Puppeteer Browser

:::info Example Project

You can find an example project of remote Puppeteer integration here: [https://github.com/web-infra-dev/midscene-example/tree/main/remote-puppeteer-demo](https://github.com/web-infra-dev/midscene-example/tree/main/remote-puppeteer-demo)

:::

Use this approach when you want to reuse a browser that already runs inside your own infrastructure—such as a persistent cloud worker, a third-party browser grid, or an on-prem desktop. Wiring Midscene into that remote Puppeteer instance keeps the browser close to the target environment, cuts repeated startup costs, and lets you centralize management while keeping the same AI automation APIs.

In practice you manually:
1. Obtain a CDP WebSocket URL from the remote browser service
2. Use Puppeteer to connect to the remote browser
3. Create a Midscene agent for AI-driven automation

#### Prerequisites

<PackageManagerTabs command="install puppeteer @midscene/web --save-dev" />

<GetCdpUrl />

#### Basic Example

```typescript
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// Assuming you already have a CDP WebSocket URL
const cdpWsUrl = 'ws://your-remote-browser.com/devtools/browser/your-session-id';

// Connect to remote browser
const browser = await puppeteer.connect({
  browserWSEndpoint: cdpWsUrl
});

// Get or create page
const pages = await browser.pages();
const page = pages[0] || await browser.newPage();

// Create Midscene agent
const agent = new PuppeteerAgent(page);

// Use AI methods
await agent.aiAct('navigate to https://example.com');
await agent.aiAct('click the login button');
const result = await agent.aiQuery('get page title: {title: string}');

// Cleanup
await agent.destroy();
await browser.disconnect();
```

### Provide custom actions

Use the `customActions` option to extend the agent's action space with your own actions defined via `defineAction`. When provided, these actions will be appended to the built-in ones so the agent can call them during planning.

```typescript
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z
      .number()
      .int()
      .positive()
      .describe('How many times to click'),
  }),
  async call(param) {
    const { locate, count } = param;
    console.log('click target center', locate.center);
    console.log('click count', count);
    // carry out your clicking logic using locate + count
  },
});

const agent = new PuppeteerAgent(page, {
  customActions: [ContinuousClick],
});

await agent.aiAct('click the red button five times');
```

Check [Integrate with any interface](./integrate-with-any-interface#define-a-custom-action) for more details about defining custom actions.

## FAQ

### Puppeteer installation is slow or gets stuck

Puppeteer downloads a browser binary during `postinstall`. If that download is slow or blocked, installation can appear to hang.

```bash
# Skip browser download first so dependency installation can finish
PUPPETEER_SKIP_DOWNLOAD=true npm install

# Then download Chrome from a mirror
# This example uses https://registry.npmmirror.com
# Different mirror providers may use different base-url rules
npx puppeteer browsers install chrome --base-url="https://registry.npmmirror.com/-/binary/chrome-for-testing"
```

### Cannot click the dropdown

If the dropdown options do not appear in the report screenshot after you click the field, the page is usually using a native `select` element. In that case, the expanded dropdown is rendered by the operating system instead of inside the webpage.

Midscene enables `forceChromeSelectRendering` by default to force Chrome to render the dropdown; set it to `false` to opt out. For the detailed explanation and how to confirm the issue, see [Playwright FAQ — Cannot click the dropdown](./integrate-with-playwright#cannot-click-the-dropdown).

### The webpage continues to flash when running in headed mode

This is caused by a mismatch between the viewport's `deviceScaleFactor` and the system pixel ratio. Set `deviceScaleFactor` to `0` to automatically use the device pixel ratio:

```typescript
await page.setViewport({
  deviceScaleFactor: 0,
});
```

For more details, see [Playwright FAQ — The webpage continues to flash](./integrate-with-playwright#the-webpage-continues-to-flash-when-running-in-headed-mode).

### Customize the network timeout

Midscene automatically waits for the network to be idle after interactions. You can customize or disable the timeout — see [Playwright FAQ — Customize the network timeout](./integrate-with-playwright#customize-the-network-timeout) for details.

## More

- For every Agent method, check the [API Reference](./api#interaction-methods).
- For the Puppeteer API reference, see [Puppeteer Agent API](./web-api-reference#puppeteer-agent).
- Demo projects
  - Puppeteer demo: [https://github.com/web-infra-dev/midscene-example/blob/main/puppeteer-demo](https://github.com/web-infra-dev/midscene-example/blob/main/puppeteer-demo)
  - Playwright + Vitest demo: [https://github.com/web-infra-dev/midscene-example/tree/main/playwright-with-vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/playwright-with-vitest-demo)

<!-- END OFFICIAL PAGE 32: integrate-with-puppeteer.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 33: introduction.mdx -->

## Source page: `introduction.mdx`

# Midscene.js - Vision-Driven UI Testing & Automation

Midscene is an open-source SDK for vision-driven UI testing and automation. You describe each step in natural language, and Midscene drives a multimodal model to plan and operate the interface for you — across web, mobile, desktop, and even `<canvas>` surfaces.

:::tip Ready to build?
Head to the [Quick start](./quick-start) to run your first automation in a few minutes, or try it with no code via the [Chrome extension](./quick-experience).
:::

## Why Midscene

Most UI automation — including AI tools that read the DOM or the accessibility tree — depends on page structure. That structure is fragile and incomplete: selectors break on every refactor; elements without semantic markup (icon-only buttons, custom-rendered controls, `<canvas>`) are invisible to it; native apps and cross-origin iframes are out of reach; and it cannot tell whether something actually *looks* right.

Midscene takes a different route: it **works from the screenshot alone**, using a multimodal model, and you describe each step in natural language — the way a human tester would. That changes what UI testing feels like:

- **Tests stop breaking on every refactor.** There are no selectors to chase when markup or styles change, so the maintenance cost of your suite drops sharply.
- **Reach every element and every surface.** If a human can see it, Midscene can target it — even elements with no semantic annotations, `<canvas>`, native apps, and cross-origin iframes that structure-based tools cannot reach.
- **Assert on what users actually see.** Verify visual results — colors, highlights, layout, rendered state — not just whether a node exists in the DOM.
- **Two ways to test.** Add Midscene to your existing [Playwright](./integrate-with-playwright) or Vitest suite, or let an AI agent test your app autonomously through [Skills](./skills).
- **Failures you can read.** Every run produces a visual report you can replay step by step.

> Midscene is built for UI testing first, but the same vision-driven engine handles any UI automation task — use it however fits your work.

## What you can automate

Midscene works anywhere you can take a screenshot — web browsers, Android, iOS, HarmonyOS, desktop apps, and [any custom interface](./integrate-with-any-interface) — all through one API. Each platform has its own getting-started guide in the sidebar.

Write your automation with the JavaScript SDK or in YAML, and look up every method — `aiAct`, `aiQuery`, `aiAssert`, and more — in the [API reference](./api).

## Two styles of automation

### Auto planning

AI autonomously plans and executes the flow to complete the task.

```javascript
await aiAct('click all the records one by one. If one record contains the text "completed", skip it');
```

### Workflow style

Split complex logic into multiple steps to improve the stability of the automation code.

```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record}" contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

> For more on the workflow style, see [Use JavaScript to optimize the AI automation code](./use-javascript-to-optimize-ai-automation-code).

## Driven by Multimodal Models

Midscene supports many popular multimodal models with strong UI localization, so you can pick whichever is easiest to access — including open-source options you can self-host: `Qwen3.x`, `Doubao-Seed-2.1`, `GLM-4.6V`, `gemini-3.5-flash`, and `UI-TARS`.

See [Model strategy](./model-strategy) to choose one.

## Showcases

Register the GitHub form autonomously in a web browser and pass all field validations:

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github2.mp4" height="300" controls />

See more real-world examples across iOS, Android, desktop, and custom interfaces in [Showcases](./showcases).

## Resources & community

- Sample projects: [midscene-example](https://github.com/web-infra-dev/midscene-example)
- GitHub: [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)
- [Discord](https://discord.gg/2JyBHxszE4) · [X](https://x.com/midscene_ai) · [Lark group (飞书交流群)](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba)

## Credits

Midscene builds on many excellent open-source projects — including UI-TARS, Qwen, Playwright, Puppeteer, scrcpy, appium, WebDriverAgent, YADB, and libnut-core. See the [README](https://github.com/web-infra-dev/midscene) for the full list.

## License

Midscene.js is [MIT licensed](https://github.com/web-infra-dev/midscene/blob/main/LICENSE).

<!-- END OFFICIAL PAGE 33: introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 34: ios-api-reference.mdx -->

## Source page: `ios-api-reference.mdx`

# API reference (iOS)

Use this doc when you need to customize iOS device behavior, wire Midscene into WebDriverAgent-driven workflows, or troubleshoot WDA requests. For shared constructor options (reporting, hooks, caching, etc.), see the platform-agnostic [API reference (Common)](./api).

## Action Space

`IOSDevice` uses the following action space; the Midscene Agent can use these actions while planning tasks:

- `Tap` &mdash; Tap an element.
- `DoubleClick` &mdash; Double-tap an element.
- `Input` &mdash; Enter text with `replace`/`typeOnly`/`clear` modes (`append` is a deprecated alias for `typeOnly`). Supports optional `autoDismissKeyboard` and `keyboardTypeDelay` parameters.
- `Scroll` &mdash; Scroll from an element or screen center in any direction, including scroll-to-top/bottom/left/right helpers.
- `DragAndDrop` &mdash; Drag from one element to another.
- `KeyboardPress` &mdash; Press a specified key.
- `LongPress` &mdash; Long-press a target element with optional duration.
- `Pinch` &mdash; Two-finger pinch gesture. Use `scale > 1` to zoom in, `scale < 1` to zoom out.
- `ClearInput` &mdash; Clear the contents of an input field.
- `Launch` &mdash; Open a URL, bundle identifier, or URL scheme.
- `Terminate` &mdash; Close a running iOS app by its bundle identifier.
- `RunWdaRequest` &mdash; Call WebDriverAgent REST endpoints directly.
- `IOSHomeButton` &mdash; Trigger the iOS system Home action.
- `IOSAppSwitcher` &mdash; Open the iOS multitasking view.

## IOSDevice {#iosdevice}

Create a WebDriverAgent-backed instance that an IOSAgent can drive.

### Import

```ts
import { IOSDevice } from '@midscene/ios';
```

### Constructor

```ts
const device = new IOSDevice({
  // device options...
});
```

### Device options

- `wdaPort?: number` &mdash; WebDriverAgent port. Default `8100`.
- `wdaHost?: string` &mdash; WebDriverAgent host. Default `'localhost'`.
- `iOSDeviceClassOverride?: string` &mdash; Optional npm module path that replaces the default `IOSDevice` when using `agentFromWebDriverAgent()` or iOS Playground. The module must export an `IOSDevice` class or a default class.
- `autoDismissKeyboard?: boolean` &mdash; Hide the keyboard after text input. Default `true`.
- `keyboardTypeDelay?: number` &mdash; Per-character delay (ms) when typing text. When set, text is typed one character at a time with this delay between each character via WDA's `/wda/keys` endpoint. Useful when input fields drop characters under fast typing.
- `customActions?: DeviceAction<any>[]` &mdash; Additional device actions exposed to the agent.

### Usage notes

- Ensure Developer Mode is enabled and WDA can reach the device; use `iproxy` when forwarding ports from a real device.
- Use `wdaHost`/`wdaPort` to target remote devices or custom WDA deployments.
- For shared interaction methods, see [API reference (Common)](./api#interaction-methods).

### Examples

#### Quick start

```ts
import { IOSAgent, IOSDevice } from '@midscene/ios';

const device = new IOSDevice({ wdaHost: 'localhost', wdaPort: 8100 });
await device.connect();

const agent = new IOSAgent(device, {
  aiActionContext: 'If any permission dialog appears, accept it.',
});

await agent.launch('https://ebay.com');
await agent.aiAct('Search for "Headphones"');
const items = await agent.aiQuery(
  '{itemTitle: string, price: Number}[], list headphone products',
);
console.log(items);
```

#### Custom host and port

```ts
const device = new IOSDevice({
  wdaHost: '192.168.1.100',
  wdaPort: 8300,
});
await device.connect();
```

## IOSAgent {#iosagent}

Wire Midscene's AI planner to an IOSDevice for UI automation over WebDriverAgent.

### Import

```ts
import { IOSAgent } from '@midscene/ios';
```

### Constructor

```ts
const agent = new IOSAgent(device, {
  // common agent options...
});
```

### iOS-specific options

- `customActions?: DeviceAction<any>[]` &mdash; Extend planning with actions defined via `defineAction`.
- `appNameMapping?: Record<string, string>` &mdash; Map friendly app names to bundle identifiers. When you pass an app name to `launch(target)` or `terminate(bundleId)`, the agent will look up the bundle ID in this mapping. If no mapping is found, it will attempt to use `target` as-is. User-provided mappings take precedence over default mappings.
- All other fields match [API constructors](./api#common-parameters): `generateReport`, `reportFileName`, `aiActionContext`, `modelConfig`, `cacheId`, `createOpenAIClient`, `onTaskStartTip`, and more.

### Usage notes

:::info

- Use one agent per device connection.
- iOS-only helpers such as `launch`, `terminate`, and `runWdaRequest` are also exposed in YAML scripts. See [iOS platform-specific actions](./automate-with-scripts-in-yaml#the-ios-part).
- For shared interaction methods, see [API reference (Common)](./api#interaction-methods).

:::

### iOS-specific methods

#### `agent.launch()`

Launch a web URL, native application bundle, or custom scheme.

```ts
function launch(target: string): Promise<void>;
```

- `target: string` &mdash; Target address (web URL, Bundle Identifier, URL scheme, tel/mailto, etc.) or app name. If you pass an app name and it exists in `appNameMapping`, it will be automatically resolved to the mapped Bundle ID; otherwise, `target` will be launched as-is.

```ts
await agent.launch('https://www.apple.com');
await agent.launch('com.apple.Preferences');
await agent.launch('myapp://profile/user/123');
await agent.launch('tel:+1234567890');
```

#### `agent.terminate()`

Terminate (close) a running iOS app by its bundle ID.

```ts
function terminate(bundleId: string): Promise<void>;
```

- `bundleId: string` &mdash; The bundle identifier of the app to terminate (e.g. `com.apple.Preferences`). If you pass an app name and it exists in `appNameMapping`, it will be automatically resolved to the mapped Bundle ID.

```ts
await agent.terminate('com.apple.Preferences');
await agent.terminate('com.apple.mobilesafari');
```

#### `agent.runWdaRequest()`

Execute raw WebDriverAgent REST calls when you need low-level control.

```ts
function runWdaRequest(
  method: string,
  endpoint: string,
  data?: Record<string, any>,
): Promise<any>;
```

- `method: string` &mdash; HTTP verb (`GET`, `POST`, `DELETE`, etc.).
- `endpoint: string` &mdash; WebDriverAgent endpoint path.
- `data?: Record<string, any>` &mdash; Optional JSON body.

```ts
const screen = await agent.runWdaRequest('GET', '/wda/screen');
await agent.runWdaRequest('POST', '/session/test/wda/pressButton', { name: 'home' });
```

#### Navigation helpers

- `agent.home(): Promise<void>` &mdash; Return to the Home screen.
- `agent.appSwitcher(): Promise<void>` &mdash; Reveal the multitasking view.

### Helper utilities

#### `agentFromWebDriverAgent()` {#agentfromwebdriveragent}

Connect to WebDriverAgent and return a ready-to-use IOSAgent.

```ts
function agentFromWebDriverAgent(
  opts?: PageAgentOpt & IOSDeviceOpt,
): Promise<IOSAgent>;
```

- `opts?: PageAgentOpt & IOSDeviceOpt` &mdash; Combine common agent options with [`IOSDevice`](#iosdevice) settings.
- Set `MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE` to apply the same device class override through the environment. An explicit option takes precedence over the environment variable.

```ts
import { agentFromWebDriverAgent } from '@midscene/ios';

const agent = await agentFromWebDriverAgent({
  wdaHost: 'localhost',
  wdaPort: 8100,
  iOSDeviceClassOverride: '@your-scope/ios-device',
  aiActionContext: 'Accept permission dialogs automatically.',
});
```

### Extending custom interaction actions

Extend the Agent's action space by supplying `customActions` with handlers created via `defineAction`. These actions appear after the built-in ones and can be called during planning.

```ts
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { agentFromWebDriverAgent } from '@midscene/ios';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z.number().int().positive().describe('How many times to click'),
  }),
  async call({ locate, count }) {
    console.log('click target center', locate.center);
    console.log('click count', count);
  },
});

const agent = await agentFromWebDriverAgent({
  customActions: [ContinuousClick],
});

await agent.aiAct('Click the red button five times');
```

### See also

- [iOS getting started](./ios-getting-started) for setup and scripting steps.
- [Integrate with any interface](./integrate-with-any-interface#define-a-custom-action) for custom actions and schemas.

<!-- END OFFICIAL PAGE 34: ios-api-reference.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 35: ios-getting-started.mdx -->

## Source page: `ios-getting-started.mdx`

import StartExperience from './common/start-experience.mdx';
import SetupEnv from './common/setup-env.mdx';
import PrepareIOS from './common/prepare-ios.mdx';

import { PackageManagerTabs } from '@theme';

# iOS getting started

This guide walks you through everything required to automate an iOS device with Midscene: connect a real phone through WebDriverAgent, configure model credentials, try the no-code Playground, and run your first JavaScript script.

:::info Demo Projects

Control iOS devices with JavaScript: [https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo)

Integrate Vitest for testing: [https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo)

:::

<SetupEnv />

<PrepareIOS />

## Try Playground (no code)

Playground is the fastest way to validate the connection and observe AI-driven steps without writing code. It shares the same core as `@midscene/ios`, so anything that works here will behave the same once scripted.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/x2.mp4" controls/>

1. Launch the Playground CLI:

```bash
npx --yes @midscene/ios-playground
```

2. Click the gear button to enter the configuration page and paste your API key config. Refer back to [Model configuration](./model-config) if you still need credentials.

![](/ios-set-env.png)

## Start experiencing

<StartExperience />

## Integration with Midscene Agent

Once Playground works, move to a repeatable script with the JavaScript SDK.

### Step 1. Install dependencies

<PackageManagerTabs command="install @midscene/ios dotenv --save-dev" />

### Step 2. Write scripts

Save the following code as `./demo.ts`. It opens Safari on the device, searches eBay, and asserts the result list.

```typescript title="./demo.ts"
import 'dotenv/config'; // load Midscene environment variables from .env if present
import {
  IOSAgent,
  IOSDevice,
  agentFromWebDriverAgent,
} from '@midscene/ios';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    // Method 1: Create device and agent directly
    const page = new IOSDevice({
      wdaPort: 8100,
      wdaHost: 'localhost',
    });

    // 👀 Initialize Midscene agent
    const agent = new IOSAgent(page, {
      aiActionContext:
        'If any location, permission, user agreement, etc. popup appears, click agree. If login page appears, close it.',
    });
    await page.connect();

    // Method 2: Or use convenience function (recommended)
    // const agent = await agentFromWebDriverAgent({
    //   wdaPort: 8100,
    //   wdaHost: 'localhost',
    //   aiActionContext: 'If any location, permission, user agreement, etc. popup appears, click agree. If login page appears, close it.',
    // });

    // 👀 Directly open ebay.com webpage (recommended approach)
    await page.launch('https://ebay.com');
    await sleep(3000);

    // 👀 Enter keywords and perform search
    await agent.aiAct('Search for "Headphones"');

    // 👀 Wait for loading to complete
    await agent.aiWaitFor('At least one headphone product is displayed on the page');
    // Or you can use a simple sleep:
    // await sleep(5000);

    // 👀 Understand page content and extract data
    const items = await agent.aiQuery(
      '{itemTitle: string, price: Number}[], find product titles and prices in the list',
    );
    console.log('Headphone product information', items);

    // 👀 Use AI assertion
    await agent.aiAssert('Multiple headphone products are displayed on the interface');

    await page.destroy();
  })(),
);
```

### Step 3. Run

```bash
npx tsx demo.ts
```

### Step 4: View the report

Successful runs print `Midscene - report file updated: /path/to/report/some_id.html`. Open the generated HTML file in a browser to replay every interaction, query, and assertion.

## API reference and more resources

Looking for constructors, helper methods, and platform-only device APIs? See the dedicated [iOS API reference](./ios-api-reference) for detailed parameter lists plus advanced topics like custom actions. For API surfaces shared across platforms, head to the [common API reference](./api).

## FAQ

### Why can't I control my device through WebDriverAgent even though it's connected?

Please check the following:

1. **Developer Mode**: Ensure it's enabled in Settings > Privacy & Security > Developer Mode
2. **UI Automation**: Ensure it's enabled in Settings > Developer > UI Automation
3. **Device Trust**: Ensure the device trusts the current Mac

### What are the differences between simulators and real devices?

| Feature | Real Device | Simulator |
|---------|-------------|-----------|
| Port Forwarding | Requires iproxy | Not required |
| Developer Mode | Must enable | Auto-enabled |
| UI Automation Settings | Must enable manually | Auto-enabled |
| Performance | Real device performance | Depends on Mac performance |
| Sensors | Real hardware | Simulated data |

### How to use custom WebDriverAgent port and host?

You can specify WebDriverAgent port and host through the `IOSDevice` constructor or `agentFromWebDriverAgent`:

```typescript
// Method 1: Using IOSDevice
const device = new IOSDevice({
  wdaPort: 8100,        // Custom port
  wdaHost: '192.168.1.100', // Custom host
});

// Method 2: Using convenience function (recommended)
const agent = await agentFromWebDriverAgent({
  wdaPort: 8100,        // Custom port
  wdaHost: '192.168.1.100', // Custom host
});
```

For remote devices, you also need to set up port forwarding accordingly:

```bash
iproxy 8100 8100 YOUR_DEVICE_ID
```

### How to get smoother live screen preview in Playground?

Playground's screen preview supports two modes:

- **Polling mode** (default): Captures screenshots one by one via the WDA screenshot API, achieving ~5-10fps.
- **Native MJPEG stream** (recommended): Proxies WDA's built-in MJPEG Server directly for higher frame rate and lower latency.

To enable the native MJPEG stream, forward the WDA MJPEG Server port (default 9100) to localhost:

```bash
# Required for real devices only (simulators don't need this)
iproxy 9100 9100 YOUR_DEVICE_ID
```

Playground automatically probes port 9100 on startup. If available, the log will show `MJPEG: streaming via native WDA MJPEG server`; otherwise it falls back to polling mode automatically.

## More

- For every Agent method, check the [API reference (Common)](./api#interaction-methods).
- For the iOS API reference, see [iOS Agent API](./ios-api-reference).
- Demo projects
  - iOS JavaScript SDK demo: [https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo)
  - iOS + Vitest demo: [https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo)

<!-- END OFFICIAL PAGE 35: ios-getting-started.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 36: ios-introduction.mdx -->

## Source page: `ios-introduction.mdx`

import ShowcaseIOS from './showcases-ios.mdx';

# iOS Automation Support

Midscene can drive WebDriver tools to support iOS automation.

By adapting a visual model solution, the automation process works with any app tech stack—whether built with Native, Flutter, React Native, or Lynx. Developers only need to focus on the final experience when debugging UI automation scripts.

The iOS UI automation solution comes with all the features of Midscene:

- Supports zero-code trial using Playground.
- Supports JavaScript SDK.
- Supports automation scripts in YAML format and command-line tools.
- Supports HTML reports to replay all operation paths.

## Showcases

<ShowcaseIOS />

See more showcases: [showcases](./showcases.mdx)

## Try with Playground

With Playground, you can experience Midscene's capabilities without writing any code.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/x2.mp4" controls/>

See [Getting Started](./ios-getting-started#try-playground-no-code) to learn how to launch the Playground.


## Understand WebDriverAgent

WebDriver is a standard protocol established by W3C for browser automation, providing a unified API to control different browsers and applications. The WebDriver protocol defines the communication method between client and server, enabling automation tools to control various user interfaces across platforms.

Through the efforts of the Appium team and other open source communities, the industry now has many excellent libraries that convert desktop and mobile device automation operations into WebDriver protocol. These tools include:
- **Appium** - Cross-platform mobile automation framework
- **WebDriverAgent** - Service dedicated to iOS device automation
- **Selenium** - Web browser automation tool
- **WinAppDriver** - Windows application automation tool

**Midscene adapts to the WebDriver protocol**, which means developers can use AI models to perform intelligent automated operations on any device that supports WebDriver. Through this design, Midscene can not only control traditional operations like clicking and typing, but also:
- Understand interface content and context
- Execute complex multi-step operations
- Perform intelligent assertions and validations
- Extract and analyze interface data

On iOS platform, Midscene connects to iOS devices through WebDriverAgent, allowing you to control iOS apps and system using natural language descriptions.


## Next Steps

* [Use JavaScript SDK](/en/ios-getting-started)
* [Use YAML format automation scripts](/en/automate-with-scripts-in-yaml) and [command-line tools](/en/automate-with-scripts-in-yaml)

<!-- END OFFICIAL PAGE 36: ios-introduction.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 37: llm-txt.mdx -->

## Source page: `llm-txt.mdx`

# LLMs.txt documentation

How to get tools like Cursor, Windstatic, GitHub Copilot, ChatGPT, and Claude to understand Midscene.js.

We support LLMs.txt files for making the Midscene.js documentation available to large language models.

## Directory overview

The following files are available.

- [llms.txt](https://midscenejs.com/llms.txt): The main LLMs.txt file
- [llms-full.txt](https://midscenejs.com/llms-full.txt): The complete documentation for Midscene.js


## Usage

### Cursor

Use `@Docs` feature in Cursor to include the LLMs.txt files in your project.

[Read more](https://docs.cursor.com/context/@-symbols/@-docs)

### Windstatic

Reference the LLMs.txt files using `@` or in your `.windsurfrules` files.

[Read more](https://docs.windsurf.com/windsurf/getting-started#memories-and-rules)


<!-- END OFFICIAL PAGE 37: llm-txt.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 38: mcp.mdx -->

## Source page: `mcp.mdx`

# MCP integration has been retired

Midscene no longer ships MCP servers. Use [Skills](./skills) to let AI coding agents drive Midscene through the platform CLIs.

If you still need the MCP server packages, pin Midscene to `1.9.8`. This is the final version that includes MCP support.

Remove any agent configuration that references the retired MCP packages:

- `@midscene/web-bridge-mcp`
- `@midscene/android-mcp`
- `@midscene/ios-mcp`
- `@midscene/harmony-mcp`
- `@midscene/computer-mcp`
- `@midscene/mcp`

If your previous MCP configuration set `MIDSCENE_MCP_CHROME_PATH`, move that value to `MIDSCENE_CHROME_PATH` for Skills and CLI usage. The old variable is still accepted as a temporary migration alias.

For code-level automation, use the JavaScript SDK, YAML runner, or the platform CLIs listed in [Skills](./skills).

<!-- END OFFICIAL PAGE 38: mcp.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 39: model-common-config.mdx -->

## Source page: `model-common-config.mdx`

import TroubleshootingLLMConnectivity from './common/troubleshooting-llm-connectivity.mdx';
import QuickModelConfig from './common/quick-model-config.mdx';

# Configure Your Model

## A quick default

If you just want something that works, use the configuration below. For all supported providers and the different ways to set environment variables, read on.

<QuickModelConfig />

## Ways to set environment variables

Midscene reads all model configuration from environment variables. Below are common approaches, but feel free to adopt any method used in your project.

### Method 1: Set variables in the system

> The Midscene Chrome extension also accepts this `export KEY="value"` format.

```bash
# Replace with your own API key
export MIDSCENE_MODEL_BASE_URL="https://.../compatible-mode/v1"
export MIDSCENE_MODEL_API_KEY="sk-abcde..."
export MIDSCENE_MODEL_NAME="qwen3.7-plus"
export MIDSCENE_MODEL_FAMILY="qwen3"
```

### Method 2: Create a `.env` file (for CLI tools)

Create a `.env` file in the directory where you run the project. Midscene CLI tools load this file automatically.

```bash
MIDSCENE_MODEL_BASE_URL="https://.../compatible-mode/v1"
MIDSCENE_MODEL_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
MIDSCENE_MODEL_NAME="qwen3.7-plus"
MIDSCENE_MODEL_FAMILY="qwen3"
```

Keep in mind:
1. You do **not** need to prefix each line with `export`.
2. Only the Midscene CLI automatically reads this file. For the JavaScript SDK, load it manually as shown below.

### Method 3: Load variables via dotenv

[Dotenv](https://www.npmjs.com/package/dotenv) is a zero-dependency npm package that loads variables from `.env` into Node.js `process.env`.

Our [demo project](https://github.com/web-infra-dev/midscene-example) uses this method.

```bash
# install dotenv
npm install dotenv --save
```

Create a `.env` file in the project root and add (no `export` prefix):

```bash
MIDSCENE_MODEL_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Import dotenv in your script; it will read `.env` automatically:

```typescript
import 'dotenv/config';
```

## Common model configurations

This section lists common model configurations. For details on model differences and selection strategies, see [Recommended multimodal models](./model-strategy#recommended-vision-models).

### Doubao Seed Model {#doubao-seed-model}

Doubao-Seed-2.1-turbo is the recommended model. In our current evaluation, it has the fastest localization speed while still delivering strong localization results. Doubao-Seed-2.0-Lite, Doubao-Seed-1.6-Vision, and Doubao-Seed-1.8 are also supported.

Obtain an API key from [Volcano Engine](https://volcengine.com) and set:

```bash
MIDSCENE_MODEL_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
MIDSCENE_MODEL_API_KEY="...."
MIDSCENE_MODEL_NAME="ep-..." # Inference endpoint ID or model name from Volcano Engine
MIDSCENE_MODEL_FAMILY="doubao-seed" # "doubao-vision" is also supported
```

If your Volcano Engine account has fast tier quota enabled, add the extra request body below to use it. This usually improves model response speed by about 30%-50%.

```bash
MIDSCENE_MODEL_EXTRA_BODY_JSON={"service_tier":"fast"}
```

### Qwen3.x Series {#qwen3x}

Qwen3.5, Qwen3.6, and Qwen3.7 are currently supported in the Qwen3.x series. Recommended order: Qwen3.7 > Qwen3.5 > Qwen3.6.

Using Alibaba Cloud's `qwen3.7-plus` as an example:

```bash
MIDSCENE_MODEL_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="qwen3.7-plus" # For Qwen3.5 and Qwen3.6, use "qwen3.5-plus" and "qwen3.6-plus"
MIDSCENE_MODEL_FAMILY="qwen3" # For Qwen3.5 and Qwen3.6, the previous families `qwen3.5` and `qwen3.6` remain compatible.
```

### Moonshot Kimi Model {#kimi}

Midscene currently supports Moonshot AI's `kimi-k2.5` and `kimi-k2.6` models.

After obtaining an API key from the [Moonshot AI platform](https://platform.moonshot.cn/), configure:

```bash
MIDSCENE_MODEL_BASE_URL="https://api.moonshot.cn/v1"
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="kimi-k2.6" # Or "kimi-k2.5"
MIDSCENE_MODEL_FAMILY="kimi"
```

### Xiaomi MiMo Model {#xiaomi-mimo}

Midscene currently supports Xiaomi's `mimo-v2.5` model.

After obtaining an API key from the [Xiaomi MiMo API Open Platform](https://platform.xiaomimimo.com/), configure:

```bash
MIDSCENE_MODEL_BASE_URL="https://api.xiaomimimo.com/v1"
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="mimo-v2.5"
MIDSCENE_MODEL_FAMILY="xiaomi-mimo"
```

Note: Midscene's visual automation relies on multimodal image understanding. In Xiaomi MiMo, only the Omni series currently supports multimodal input; the Pro series is a text model and cannot be used for Midscene visual tasks.

### Zhipu GLM-V Series {#glm-v}

Zhipu GLM-V is a vision understanding model from Zhipu AI. The latest versions include `GLM-4.6V` (open-source) and `GLM-5V-Turbo`.

Using `GLM-4.6V` as an example:

Obtain an API key from [Z.AI (Global)](https://z.ai/manage-apikey/apikey-list) or [BigModel (CN)](https://bigmodel.cn/usercenter/proj-mgmt/apikeys), and set:

```bash
MIDSCENE_MODEL_BASE_URL="https://open.bigmodel.cn/api/paas/v4" # Or https://api.z.ai/api/paas/v4
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="glm-4.6v" # For GLM-5V-Turbo, use "glm-5v-turbo"
MIDSCENE_MODEL_FAMILY="glm-v"
```

**Learn more about the open-source Zhipu GLM-V model**

- Github: [https://github.com/zai-org/GLM-V](https://github.com/zai-org/GLM-V)
- Hugging Face: [https://huggingface.co/zai-org/GLM-4.6V](https://huggingface.co/zai-org/GLM-4.6V)

### Zhipu AutoGLM {#auto-glm}

Zhipu AutoGLM is an open-source mobile UI automation model (9B parameters) from Zhipu AI.

After obtaining an API key from [Z.AI (Global)](https://z.ai/manage-apikey/apikey-list) or [BigModel (CN)](https://bigmodel.cn/usercenter/proj-mgmt/apikeys), configure:

```bash
MIDSCENE_MODEL_BASE_URL="https://api.z.ai/api/paas/v4" # Or https://open.bigmodel.cn/api/paas/v4
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="autoglm-phone"
MIDSCENE_MODEL_FAMILY="auto-glm" # Or "auto-glm-multilingual"
```

**About `MIDSCENE_MODEL_FAMILY` Configuration**

AutoGLM provides two model versions, distinguished by `MIDSCENE_MODEL_FAMILY`:

- `auto-glm` - Corresponds to AutoGLM-Phone-9B, optimized for **Chinese mobile applications**
- `auto-glm-multilingual` - Corresponds to AutoGLM-Phone-9B-Multilingual, supports **English and other languages**

Choose the appropriate version based on your application language.

:::note
AutoGLM is best suited for mobile interactions and operations. If you need to use `aiAssert`, `aiQuery`, or other APIs requiring page understanding/assertions, you should configure separate `MIDSCENE_INSIGHT_MODEL_...` environment variables to let an independent Insight model handle page comprehension. See [Model Strategy](./model-strategy) for more information about multi-model configuration.
:::

**Learn more about Zhipu AutoGLM**

- Github: [https://github.com/zai-org/Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM)
- Hugging Face: [https://huggingface.co/zai-org/AutoGLM-Phone-9B](https://huggingface.co/zai-org/AutoGLM-Phone-9B)

### Gemini 3.x Series {#gemini-3x}

Among Gemini 3.x models, `gemini-3.5-flash` currently has the best localization performance in our private evaluation set. After requesting an API key from [Google Gemini](https://gemini.google.com/), use this configuration.

Set `MIDSCENE_MODEL_NAME` to the specific Gemini 3.x model name you use:

```bash
MIDSCENE_MODEL_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="gemini-3.5-flash" # Or a specific Gemini 3.x model name
MIDSCENE_MODEL_FAMILY="gemini"
```

### GPT-5 Series {#gpt-5-4}

When using GPT-5 series models on OpenAI or an OpenAI-compatible provider, use this configuration:

```bash
MIDSCENE_MODEL_BASE_URL="https://api.openai.com/v1" # Or your compatible endpoint
MIDSCENE_MODEL_API_KEY="sk-..."
MIDSCENE_MODEL_NAME="gpt-5.5" # Recommended: gpt-5.5 or gpt-5.4
MIDSCENE_MODEL_FAMILY="gpt-5"
```

:::warning GPT-5 notes

- For UI localization with GPT, Midscene currently supports `gpt-5.4` and `gpt-5.5`. To get the best localization quality, image requests need `"detail": "original"`. According to OpenAI, this option is available on `gpt-5.4` and future models, while smaller GPT-5 variants such as `gpt-5.4-mini` and `gpt-5.4-nano`, as well as older models, do not support `original` and will fail if you send it. See the [Images and Vision guide](https://developers.openai.com/api/docs/guides/images-vision) and the [Computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use).
- According to OpenAI, GPT-5 may still struggle with non-Latin text and with text that is too small in the image. See the [Images and Vision guide](https://developers.openai.com/api/docs/guides/images-vision).
- In the computer use guide, OpenAI says they observe good performance around `1440x900` and `1600x900`. We recommend adjusting screenshot sizes accordingly. In Midscene, you can control screenshot compression with `screenshotShrinkFactor` in the agent options. For browser automation, you can also control the page size and scale through the browser `viewport`.
- If you use an older GPT-5 model, we recommend using it only as the planning model and pairing it with another multimodal model for localization. See the [multi-model example](#gpt54-planning-insight-qwen35).

:::

:::note Model-native thinking
Midscene disables model-native thinking by default for the best execution speed and stability. To turn it on for any of the models above, set `MIDSCENE_MODEL_REASONING_ENABLED="true"`. Some families accept extra controls such as `MIDSCENE_MODEL_REASONING_BUDGET` and `MIDSCENE_MODEL_REASONING_EFFORT`. See [Model-Native Thinking Mode](./model-strategy#model-native-thinking-mode).
:::

## Other Models

### Qwen3-VL {#qwen3-vl}

Using Alibaba Cloud's `qwen3-vl-plus` as an example:

```bash
MIDSCENE_MODEL_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="qwen3-vl-plus"
MIDSCENE_MODEL_FAMILY="qwen3-vl"
```

You can also use Qwen3-VL from [OpenRouter](https://openrouter.ai/qwen).

### Qwen2.5-VL (Not recommended) {#qwen25-vl}

- We recommend the newer Qwen3-series models instead. In general, newer models are usually better than older ones in both speed and quality.
- Using Alibaba Cloud's `qwen-vl-max-latest` as an example, the environment variable configuration is as follows.

```bash
MIDSCENE_MODEL_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
MIDSCENE_MODEL_API_KEY="......"
MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
MIDSCENE_MODEL_FAMILY="qwen2.5-vl"
```

### UI-TARS {#ui-tars}

Use the deployed `doubao-1.5-ui-tars` on [Volcano Engine](https://volcengine.com):

```bash
MIDSCENE_MODEL_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
MIDSCENE_MODEL_API_KEY="...."
MIDSCENE_MODEL_NAME="ep-2025..." # Inference endpoint ID or model name from Volcano Engine
MIDSCENE_MODEL_FAMILY="vlm-ui-tars-doubao-1.5"
```

**About `MIDSCENE_MODEL_FAMILY`**

This variable selects the UI-TARS version. Supported values:
- `vlm-ui-tars` – for the 1.0 release
- `vlm-ui-tars-doubao` – for the 1.5 release deployed on Volcano Engine (equivalent to `vlm-ui-tars-doubao-1.5`)
- `vlm-ui-tars-doubao-1.5` – for the 1.5 release deployed on Volcano Engine

:::tip

The legacy configurations `MIDSCENE_USE_VLM_UI_TARS=DOUBAO` or `MIDSCENE_USE_VLM_UI_TARS=1.5` are still supported but deprecated. Please migrate to `MIDSCENE_MODEL_FAMILY`.

Migration mapping:
- `MIDSCENE_USE_VLM_UI_TARS=1.0` → `MIDSCENE_MODEL_FAMILY="vlm-ui-tars"`
- `MIDSCENE_USE_VLM_UI_TARS=1.5` → `MIDSCENE_MODEL_FAMILY="vlm-ui-tars-doubao-1.5"`
- `MIDSCENE_USE_VLM_UI_TARS=DOUBAO` → `MIDSCENE_MODEL_FAMILY="vlm-ui-tars-doubao"`

:::

### ~~GPT-4o~~

Starting with version 1.0, Midscene no longer supports GPT-4o as the planning model for UI operations. See [Model strategy](./model-strategy) for details.

## Multi-model example: GPT-5.4 for planning/insight + Qwen 3.5 for visual grounding {#gpt54-planning-insight-qwen35}

For more information on combining multiple models, see [Advanced: Combining Multiple Models](./model-strategy#advanced-combining-multiple-models).

Below is an example using GPT-5.4 for Planning/Insight and Qwen 3.5 for vision. Use GPT-5.4 for Planning and/or Insight to handle heavy reasoning, while Qwen 3.5 focuses on visual grounding. You can enable either role or both—toggle them based on your workload.

```bash
# Default multimodal model: Qwen 3.5
export MIDSCENE_MODEL_BASE_URL="https://..."       # Qwen 3.5 endpoint
export MIDSCENE_MODEL_API_KEY="..."                # Your Qwen 3.5 API key
export MIDSCENE_MODEL_NAME="qwen3.5-plus"
export MIDSCENE_MODEL_FAMILY="qwen3.5"

# Planning model: GPT-5.4
export MIDSCENE_PLANNING_MODEL_API_KEY="sk-..."    # Your GPT-5.4 API key
export MIDSCENE_PLANNING_MODEL_BASE_URL="https://..." 
export MIDSCENE_PLANNING_MODEL_NAME="gpt-5.4"
export MIDSCENE_PLANNING_MODEL_FAMILY="gpt-5"

# Insight model: GPT-5.4
export MIDSCENE_INSIGHT_MODEL_API_KEY="sk-..."     # Your GPT-5.4 API key
export MIDSCENE_INSIGHT_MODEL_BASE_URL="https://..."
export MIDSCENE_INSIGHT_MODEL_NAME="gpt-5.4"
export MIDSCENE_INSIGHT_MODEL_FAMILY="gpt-5"
```

## More

For additional, advanced model settings, see [All configuration options](./model-config).


<TroubleshootingLLMConnectivity />

<!-- END OFFICIAL PAGE 39: model-common-config.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 40: model-config.mdx -->

## Source page: `model-config.mdx`

# All configuration options

Midscene reads all model configuration from operating-system environment variables.

Midscene integrates the OpenAI SDK by default for AI calls. The SDK defines the parameter shape, and most model providers (or deployment tools) offer compatible endpoints.

This doc focuses on Midscene model configuration. For how we choose models, see [Model strategy](./model-strategy). For quick recipes for popular models, see [Configure your model](./model-common-config).


## Required settings

You need to set a default model for Midscene; see [Model strategy](./model-strategy) for details.


| Name | Description |
|------|-------------|
| `MIDSCENE_MODEL_API_KEY` | Model API key for OpenAI-compatible HTTP providers, e.g., `"sk-abcd..."`. Not required when `MIDSCENE_MODEL_BASE_URL="codex://app-server"` |
| `MIDSCENE_MODEL_BASE_URL` | API endpoint URL, usually ending with a version (e.g., `/v1`); do not append `/chat/completion` here since the underlying sdk will add it automatically |
| `MIDSCENE_MODEL_NAME` | Model name |
| `MIDSCENE_MODEL_FAMILY` | Model family, determine the way of dealing with the coordinates |

### Use Codex App Server (OAuth, no API Key)

If you already signed in with Codex CLI (`codex login`) and want Midscene to use that OAuth session directly, set:

```bash
export MIDSCENE_MODEL_BASE_URL="codex://app-server"
export MIDSCENE_MODEL_NAME="gpt-5.4" # or another model shown by Codex model/list
export MIDSCENE_MODEL_FAMILY="gpt-5"
```

Notes:
- `MIDSCENE_MODEL_API_KEY` is not required in this mode.
- Midscene will call `codex app-server` through stdio.
- Make sure `codex` is available in your PATH and verify auth with `codex login status`.
- In this mode, Midscene cannot set `"detail": "original"` when sending images, so it cannot achieve the best localization quality. See the [Images and Vision guide](https://developers.openai.com/api/docs/guides/images-vision) and the [Computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use).

## Advanced settings (optional)

If you configure a dedicated Insight or Planning model, model-related `MIDSCENE_MODEL_*` settings in this section only take effect for the Insight or Planning intent when you configure the corresponding `MIDSCENE_INSIGHT_MODEL_*` or `MIDSCENE_PLANNING_MODEL_*` setting.

| Name | Description |
|------|-------------|
| `MIDSCENE_MODEL_TIMEOUT` | Hard timeout for AI API calls in milliseconds (default intent). Defaults to `180000` (180s). Set to `0` to disable the hard timeout and let the request run indefinitely (only a caller-provided `AbortSignal` will cancel it). Note: Midscene controls the full request lifetime, not just the time until the first response header arrives, so stalled body reads can still be terminated cleanly |
| `MIDSCENE_MODEL_TEMPERATURE` | Sampling temperature for model responses |
| `MIDSCENE_MODEL_RETRY_COUNT` | Number of retries when AI call fails, default 1 (i.e., retry once after failure) |
| `MIDSCENE_MODEL_RETRY_INTERVAL` | Interval between retries in milliseconds, default 2000 |
| `MIDSCENE_MODEL_REASONING_ENABLED` | Controls whether model-native thinking is enabled. Midscene disables it by default. See [Model-Native Thinking Mode](./model-strategy#model-native-thinking-mode) |
| `MIDSCENE_MODEL_REASONING_EFFORT` | Controls model-native thinking effort, supported by some models. Common values: `low`, `medium`, `high`. See [Model-Native Thinking Mode](./model-strategy#model-native-thinking-mode) |
| `MIDSCENE_MODEL_REASONING_BUDGET` | Thinking token budget (number), supported by some models. See [Model-Native Thinking Mode](./model-strategy#model-native-thinking-mode) |
| `MIDSCENE_MODEL_HTTP_PROXY` | HTTP/HTTPS proxy, e.g., `http://127.0.0.1:8080` or `https://proxy.example.com:8080`. Takes precedence over `MIDSCENE_MODEL_SOCKS_PROXY` |
| `MIDSCENE_MODEL_SOCKS_PROXY` | SOCKS proxy, e.g., `socks5://127.0.0.1:1080` |
| `MIDSCENE_MODEL_INIT_CONFIG_JSON` | JSON blob that overrides the OpenAI SDK initialization config. Use `defaultHeaders` for custom auth headers; `extra_headers` and `extraHeaders` are accepted as aliases |
| `MIDSCENE_MODEL_EXTRA_BODY_JSON` | JSON blob merged into each chat completion request body. Unlike `MIDSCENE_MODEL_INIT_CONFIG_JSON` (which configures the SDK client), this is spread into every `completion.create()` call sent to the model, e.g. enabling thinking mode in vLLM: `'{"chat_template_kwargs":{"enable_thinking":true}}'` |
| `MIDSCENE_RUN_DIR` | Run artifact directory, like report and logs. Defaults to `midscene_run` in the current working directory; accepts absolute or relative paths |
| `MIDSCENE_PREFERRED_LANGUAGE` | Optional. Preferred response language. Defaults to `Chinese` if timezone is GMT+8, otherwise `English` |
| `MIDSCENE_PLAYGROUND_HOST` | Playground server listen host. Defaults to `0.0.0.0` so local device runtimes can reach it. Set to `127.0.0.1` for local-only access |

> Note: Control replanning behavior with the agent option `replanningCycleLimit` (defaults to 20, or 40 for `vlm-ui-tars`), not with environment variables.

### Configure a dedicated Insight model

Set the following if the Insight intent needs a different model:

| Name | Description |
|------|-------------|
| `MIDSCENE_INSIGHT_MODEL_API_KEY` | API key |
| `MIDSCENE_INSIGHT_MODEL_BASE_URL` | API endpoint URL (omit the trailing `/chat/completion`) |
| `MIDSCENE_INSIGHT_MODEL_NAME` | Model name |
| `MIDSCENE_INSIGHT_MODEL_FAMILY` | Model family |
| `MIDSCENE_INSIGHT_MODEL_TIMEOUT` | Optional; timeout for Insight intent AI API calls in milliseconds |
| `MIDSCENE_INSIGHT_MODEL_TEMPERATURE` | Optional; sampling temperature for Insight intent responses |
| `MIDSCENE_INSIGHT_MODEL_RETRY_COUNT` | Optional; same effect as `MIDSCENE_MODEL_RETRY_COUNT` |
| `MIDSCENE_INSIGHT_MODEL_RETRY_INTERVAL` | Optional; same effect as `MIDSCENE_MODEL_RETRY_INTERVAL` |
| `MIDSCENE_INSIGHT_MODEL_HTTP_PROXY` | Optional; same effect as `MIDSCENE_MODEL_HTTP_PROXY` |
| `MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY` | Optional; same effect as `MIDSCENE_MODEL_SOCKS_PROXY` |
| `MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON` | Optional; same effect as `MIDSCENE_MODEL_INIT_CONFIG_JSON` |
| `MIDSCENE_INSIGHT_MODEL_EXTRA_BODY_JSON` | Optional; same effect as `MIDSCENE_MODEL_EXTRA_BODY_JSON` |

### Configure a dedicated Planning model

Set the following if the Planning intent needs a different model:

| Name | Description |
|------|-------------|
| `MIDSCENE_PLANNING_MODEL_API_KEY` | API key |
| `MIDSCENE_PLANNING_MODEL_BASE_URL` | API endpoint URL (omit the trailing `/chat/completion`) |
| `MIDSCENE_PLANNING_MODEL_NAME` | Model name |
| `MIDSCENE_PLANNING_MODEL_FAMILY` | Model family |
| `MIDSCENE_PLANNING_MODEL_TIMEOUT` | Optional; timeout for Planning intent AI API calls in milliseconds |
| `MIDSCENE_PLANNING_MODEL_TEMPERATURE` | Optional; sampling temperature for Planning intent responses |
| `MIDSCENE_PLANNING_MODEL_RETRY_COUNT` | Optional; same effect as `MIDSCENE_MODEL_RETRY_COUNT` |
| `MIDSCENE_PLANNING_MODEL_RETRY_INTERVAL` | Optional; same effect as `MIDSCENE_MODEL_RETRY_INTERVAL` |
| `MIDSCENE_PLANNING_MODEL_HTTP_PROXY` | Optional; same effect as `MIDSCENE_MODEL_HTTP_PROXY` |
| `MIDSCENE_PLANNING_MODEL_SOCKS_PROXY` | Optional; same effect as `MIDSCENE_MODEL_SOCKS_PROXY` |
| `MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON` | Optional; same effect as `MIDSCENE_MODEL_INIT_CONFIG_JSON` |
| `MIDSCENE_PLANNING_MODEL_EXTRA_BODY_JSON` | Optional; same effect as `MIDSCENE_MODEL_EXTRA_BODY_JSON` |

### Debug logging switches

Enable the following variables to print richer debug logs. Regardless of the switches, logs are also saved under `./midscene_run/log`.

| Name | Description |
|------|-------------|
| `DEBUG=midscene:ai:profile:stats` | Prints model latency, token usage, etc., comma-separated for easier analysis |
| `DEBUG=midscene:ai:profile:detail` | Prints detailed token-usage logs |
| `DEBUG=midscene:ai:call` | Prints AI response details |
| `DEBUG=midscene:android:adb` | Prints Android adb command details |
| `DEBUG=midscene:*` | Prints every debug log |

## Still-compatible configs (not recommended)

The following environment variables are deprecated but still compatible. We recommend migrating to the new configuration approach.

### Planning model configuration

| Name | Description | New approach |
|------|-------------|--------------|
| `MIDSCENE_USE_DOUBAO_VISION` | Deprecated. Enables Doubao vision model | Use `MIDSCENE_MODEL_FAMILY="doubao-vision"` |
| `MIDSCENE_USE_QWEN3_VL` | Deprecated. Enables Qwen3-VL model | Use `MIDSCENE_MODEL_FAMILY="qwen3-vl"` |
| `MIDSCENE_USE_QWEN_VL` | Deprecated. Enables Qwen2.5-VL model | Use `MIDSCENE_MODEL_FAMILY="qwen2.5-vl"` |
| `MIDSCENE_USE_GEMINI` | Deprecated. Enables Gemini model | Use `MIDSCENE_MODEL_FAMILY="gemini"` |
| `MIDSCENE_USE_VLM_UI_TARS` | Deprecated. Enables UI-TARS model | Use `MIDSCENE_MODEL_FAMILY="vlm-ui-tars"` |

### General configuration

| Name | Description | New approach |
|------|-------------|--------------|
| `OPENAI_API_KEY` | Deprecated but supported | Prefer `MIDSCENE_MODEL_API_KEY` |
| `OPENAI_BASE_URL` | Deprecated but supported | Prefer `MIDSCENE_MODEL_BASE_URL` |
| `MIDSCENE_OPENAI_INIT_CONFIG_JSON` | Deprecated but supported | Prefer `MIDSCENE_MODEL_INIT_CONFIG_JSON` |
| `MIDSCENE_OPENAI_HTTP_PROXY` | Deprecated but supported | Prefer `MIDSCENE_MODEL_HTTP_PROXY` |
| `MIDSCENE_OPENAI_SOCKS_PROXY` | Deprecated but supported | Prefer `MIDSCENE_MODEL_SOCKS_PROXY` |

## Configure settings via JavaScript

You can configure models for each agent in JavaScript. See the [API reference](./api) for details.

```typescript
const agent = new Agent(page, {
  // Configure via modelConfig
  modelConfig: {
    MIDSCENE_MODEL_TIMEOUT: '60000', // 60 seconds
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    // ... other configurations
  }
});
```

## FAQ

### How can I monitor token usage?

Set `DEBUG=midscene:ai:profile:stats` to print usage and latency.

You can also find usage statistics inside the generated report files.


### Using LangSmith

LangSmith is a platform for debugging large language models. Midscene provides auto-integration support - just install the dependency and set environment variables.

**Step 1: Install dependency**

```bash
npm install langsmith
```

**Step 2: Set environment variables**

```bash
# Enable Midscene's LangSmith auto-integration
export MIDSCENE_LANGSMITH_DEBUG=1

# LangSmith configuration
export LANGCHAIN_API_KEY="your-langchain-api-key-here"
export LANGCHAIN_TRACING=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
# export LANGCHAIN_ENDPOINT="https://eu.api.smith.langchain.com" # If signed up in the EU region
```

After starting Midscene, you should see logs similar to:

```log
DEBUGGING MODE: langsmith wrapper enabled
```

Notes:
- LangSmith and Langfuse can be enabled simultaneously.
- Node.js only; browser environments will throw errors.
- If you use [`createOpenAIClient`](./api#custom-openai-client), it overrides the env-based auto-integration.

For finer-grained control (e.g., enabling LangSmith only for specific tasks), use [`createOpenAIClient`](./api#custom-openai-client) to wrap the client manually.

### Using Langfuse

[Langfuse](https://langfuse.com) is another popular LLM observability platform. Midscene has integrated Langfuse's `observeOpenAI` wrapper to automatically trace all OpenAI API calls.

Since Langfuse tracing is built on top of OpenTelemetry, you need to initialize the OpenTelemetry SDK at application startup.

**Step 1: Install dependencies**

```bash
npm install @langfuse/openai @langfuse/otel @opentelemetry/sdk-node
```

**Step 2: Initialize OpenTelemetry (Required)**

Add the following code at the **very top** of your application entry file:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});
sdk.start();
```

**Step 3: Set environment variables**

```bash
# Enable Midscene's Langfuse auto-integration
export MIDSCENE_LANGFUSE_DEBUG=1

# Langfuse configuration
export LANGFUSE_PUBLIC_KEY="your-langfuse-public-key-here"
export LANGFUSE_SECRET_KEY="your-langfuse-secret-key-here"
export LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region
# export LANGFUSE_BASE_URL="https://us.cloud.langfuse.com" # 🇺🇸 US region
```

After starting Midscene, you should see logs similar to:

```log
OpenTelemetry SDK initialized for Langfuse tracing
DEBUGGING MODE: langfuse wrapper enabled
```

**Learn More**: Check out the [Langfuse OpenAI Integration documentation](https://langfuse.com/integrations/model-providers/openai-js) for additional configuration options and best practices.

Notes:
- LangSmith and Langfuse can be enabled simultaneously.
- Node.js only; browser environments will throw errors.
- If you use [`createOpenAIClient`](./api#custom-openai-client), it overrides the env-based auto-integration.

<!-- END OFFICIAL PAGE 40: model-config.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 41: model-strategy.mdx -->

## Source page: `model-strategy.mdx`

import TroubleshootingLLMConnectivity from './common/troubleshooting-llm-connectivity.mdx';

# Model Strategy

:::tip
Just want to get running? Jump to [Configure your model](./model-common-config) for ready-to-use setups.
:::

This guide focuses on how we choose models in Midscene. If you need configuration instructions, head to [Configure your model](./model-common-config).

## Background - UI automation approaches

Driving UI automation with AI hinges on two challenges: planning a reasonable set of actions and precisely locating the elements that require interaction. The strength of element localization directly determines how successful an automation task will be.

To solve element localization, UI automation frameworks traditionally follow one of two approaches:

* **DOM + annotated screenshots**: Extract the DOM tree beforehand, annotate screenshots with DOM metadata, and ask the model to “pick” the right nodes.
* **Pure vision**: Perform all analysis on screenshots alone by using the visual grounding capabilities of the model. The model only receives the image—no DOM, no annotations.

## Pure vision for element localization

Earlier Midscene releases supported both **DOM localization** and **pure vision** so developers could compare them. After dozens of versions and hundreds of project tests, we have some new findings.

The DOM approach has been less stable than expected. It often misfires with canvas elements, controls rendered via CSS `background-image`, content inside cross-origin iframes, or elements without strong accessibility annotations. These intermittent failures can send teams into long debugging sessions or even a frustrating prompt-tuning loop.

Meanwhile, the pure-vision route has started to show clear advantages:

- **Stable results**: These models pair strong UI planning with element targeting and interface understanding, helping developers get productive quickly.
- **Works everywhere**: Automation no longer depends on how the UI is rendered. Android, iOS, desktop apps, or a browser `<canvas>`—if you can capture a screenshot, Midscene can interact with it.
- **Validates what users see**: Because it reasons over the rendered screen, vision can assert on visual results—colors, highlighted states, layout—that DOM-based checks miss entirely.
- **Developer-friendly**: Removing selectors and DOM fuss makes the model “handshake” easier. Even teammates unfamiliar with rendering tech can become productive quickly.
- **Far fewer tokens**: Compared to the DOM approach, pure vision can cut token usage by up to ~80%, reducing cost and speeding up local runs.
- **Open-source options**: Open-source vision models keep improving. Teams can self-host options such as Qwen3-VL 8B/30B with solid results.

Given these advantages, **Midscene 1.0 and later only support the pure-vision approach**—the DOM-extraction compatibility mode has been removed. This applies to UI actions and element localization; for data extraction or page understanding you can still opt in to include DOM when needed.

## Recommended multimodal models {#recommended-vision-models}

Based on extensive real-world usage, we recommend these defaults for Midscene: Doubao Seed, Qwen3.x, Zhipu GLM-V, Zhipu AutoGLM, and the Gemini 3.x series.

They offer strong element-localization skills and solid performance in planning and screen understanding.

If you are unsure where to start, pick whichever model is easiest to access today, then run side-by-side comparisons later.

| Model family | Deployment | Midscene notes |
| --- | --- | --- |
| Doubao Seed Model<br />[Quick setup](./model-common-config#doubao-seed-model) | Volcano Engine:<br />[Doubao-Seed-2.1-turbo](https://www.volcengine.com/docs/82379/1799865) | ⭐⭐⭐⭐⭐<br />Strong localization quality<br />Fastest localization speed in our current private evaluation set |
| Qwen3.x<br />[Quick setup](./model-common-config#qwen3x) | [Alibaba Cloud](https://help.aliyun.com/zh/model-studio/vision)<br/>[OpenRouter](https://openrouter.ai/qwen) | ⭐⭐⭐⭐<br />Stronger than Qwen3-VL and Qwen2.5-VL |
| Zhipu GLM-4.6V<br />[Quick setup](./model-common-config#glm-v) | [Z.AI (Global)](https://docs.z.ai/guides/vlm/glm-4.6v)<br/>[BigModel (CN)](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v) | Newly integrated, welcome to try it out<br />Weights open-sourced on [HuggingFace](https://huggingface.co/zai-org/GLM-4.6V) |
| Zhipu AutoGLM<br />[Quick setup](./model-common-config#auto-glm) | [Z.AI (Global)](https://z.ai/model-api/AutoGLM/AutoGLM-Phone-9B)<br/>[BigModel (CN)](https://docs.bigmodel.cn/cn/guide/models/autoglm) | Designed for mobile app operations<br />For `aiAssert`, `aiQuery`, and other page-understanding tasks, pair it with a separate Insight model |
| Gemini 3.x Series<br />[Quick setup](./model-common-config#gemini-3x) | [Google Cloud](https://ai.google.dev/gemini-api/docs/models/gemini) | ⭐⭐⭐⭐⭐<br />`gemini-3.5-flash` has the best localization performance in our private evaluation set<br />Price is higher than Doubao and Qwen |

Midscene is also compatible with the following model configurations, but we do not recommend them as default choices: [UI-TARS](./model-common-config#ui-tars).

:::info Why not use multimodal models like gpt-5 as the default?

Midscene requires strong UI localization (visual grounding). Models like gpt-5 perform poorly here, so they cannot serve as the default. You can still use them as dedicated “planning models,” which we cover below.

:::

## Advanced: combining multiple models

The default model strategy covers most projects at kick-off. As prompts grow more complex and you need stronger generalization, the default models’ planning ability may fall short. Consider this GitHub sign-up prompt:

```text
Fill out the GitHub sign-up form. Ensure no fields are missing and pick “United States” as the region.

Make sure every field passes validation.

Only fill the form; do not submit a real registration request.

Return the actual field values you filled.
```

This sounds simple, but the model must understand per-field rules, identify each control, operate a multi-step region selector, paginate and trigger validation, and still locate every element. Default models often cannot satisfy all of these at once, so success rates drop.

In these situations, configure separate models for *Planning* and *Insight*, while **keeping the default model** as your baseline. This is not “only Planning and Insight”—it is **default model + (optional) Planning/Insight**. Multi-model setups are the most practical and effective way to lift UI automation success, at a small cost in latency and tokens.

### Model responsibility overview

By default, the system follows these rules (unset intents fall back to the default model):

- **Default model**: handles **element localization** (Locate), plus anything not explicitly assigned to Planning/Insight.
- **Planning model (optional)**: handles **task planning** (Planning in `aiAct` / `ai`).
- **Insight model (optional)**: handles **data extraction, assertions, and UI understanding** (`aiQuery` / `aiAsk` / `aiAssert`).

In short: **Planning goes to the Planning model, localization stays on the default model, and extraction/assertion goes to Insight** when configured.

For a ready-to-use environment snippet, including an Insight model, see the [multi-model example](./model-common-config#gpt54-planning-insight-qwen35).

### *Planning* intent

For `aiAct` or `ai` planning tasks, add settings with the `MIDSCENE_PLANNING_MODEL_` prefix to use a dedicated model for the Planning intent.

We recommend `gpt-5.4` or other multimodal models that understand UI workflows.

### *Insight* intent

Midscene provides page-understanding APIs such as AI assertions (`aiAssert`) and data extraction (`aiQuery`, `aiAsk`). We group these workloads under the *Insight* intent, which depends on visual question answering (VQA) skills.

Add settings with the `MIDSCENE_INSIGHT_MODEL_` prefix to use a dedicated model for Insight workloads.

We recommend `gpt-5.4` or other models with strong VQA capability.

## How do I tune execution results?

If you see success rates below your target, try these steps.

0. Review Midscene's replay report to confirm the task timeline is correct and the flow didn't veer into the wrong page or branch.
1. Use the best, newest, and larger model versions to materially improve success rates. For example, Qwen3-VL outperforms Qwen2.5-VL, and a 72B build is more accurate than a 30B build.
2. Ensure the `MIDSCENE_MODEL_FAMILY` environment variable is set correctly; otherwise element localization can drift significantly.
3. Tweak the `planningStrategy` option in `aiAct` to increase planning depth.
4. Try different models, or combine multiple models to compensate for weaker understanding.

## More

### Limitations of the pure-vision approach

Vision models are a highly general approach: they do not depend on a specific UI rendering stack and can analyze screenshots directly, letting developers ramp up and tune quickly across any app surface.

The flip side is higher demands on the model itself.

For example, on mobile UI automation, if you have a component tree plus full a11y annotations, you can lean on a small text-only model and reason over structure, potentially pushing performance further. Pure vision skips those annotations and is more universal, saving UI labeling effort but consuming more model resources at runtime.

### About the `deepThink` option in `aiAct`

The `deepThink` option controls the planning implementation used by Midscene during `aiAct`.

- By default, `aiAct` asks the model to plan the next step and locate the target element in the same planning request.
- When `deepThink` is enabled, `aiAct` focuses more on decomposing the task. It separates task planning and UI element locating into different model calls, which gives more stable results for complex tasks.

In earlier versions, `deepThink` also controlled whether model-native deep reasoning was enabled during planning. This is now controlled by [Model-Native Thinking Mode](#model-native-thinking-mode).

`deepThink` accepts `'unset' | true | false`. For compatibility, `'unset'` is still accepted and is treated the same as `false`.

Note: The implementation behind `deepThink` may change in the future as Midscene evolves.

### Model-Native Thinking Mode

Midscene disables model-native thinking by default to get better execution speed and stability. If the model itself does not support disabling native thinking, Midscene reduces model-native thinking as much as possible by controlling thinking granularity or limiting the thinking budget.

You can control model-native thinking with the following reasoning settings. These are unified Midscene-level abstractions, and the parameters actually sent to the model are mapped by model family.

- `MIDSCENE_MODEL_REASONING_ENABLED`: Explicitly controls whether model-native thinking is enabled.
  - `false`: Force-disable model-native thinking (Midscene's default behavior).
  - `true`: Force-enable model-native thinking.
  - `default`: Follow the model's default behavior. Midscene will not send any setting that enables or disables thinking. In this case, explicitly configured `MIDSCENE_MODEL_REASONING_BUDGET` and `MIDSCENE_MODEL_REASONING_EFFORT` will also be ignored.
  - The following models currently support this setting:
    - Qwen: corresponds to `enable_thinking` in the Qwen docs.
    - Doubao: corresponds to `thinking.type` in the Doubao docs.
    - Zhipu GLM: corresponds to `thinking.type` in the Zhipu docs.
    - GPT-5: corresponds to `reasoning_effort` in the OpenAI docs. Midscene uses `medium` when enabled and `none` when disabled.
    - Gemini: corresponds to `thinking_config.thinking_level` in the Gemini docs. Midscene uses `medium` when enabled and `minimal` when disabled.
    - Kimi: corresponds to `thinking.type` in the Kimi docs.
    - Xiaomi Mimo: corresponds to `thinking.type` in the Xiaomi Mimo docs.
- `MIDSCENE_MODEL_REASONING_BUDGET`: Controls the model's thinking budget. The following models currently support this setting:
  - Qwen: corresponds to `thinking_budget` in the Qwen docs.
- `MIDSCENE_MODEL_REASONING_EFFORT`: Controls the model's thinking effort. The following models currently support this setting:
  - Doubao: corresponds to `reasoning_effort` in the Doubao docs.
  - Gemini: corresponds to `thinking_config.thinking_level` in the Gemini docs.
  - GPT-5: corresponds to `reasoning_effort` in the OpenAI docs.

Note:

- Different model providers use different parameters to control model-native thinking. For specific values and supported model versions, see the official docs from each model provider. If an explicit reasoning setting is not supported by the current model, Midscene ignores that setting instead of guessing provider-specific private parameters.

### "MIDSCENE_MODEL_FAMILY is not set to a multimodal model" error

If you see "MIDSCENE_MODEL_FAMILY is not set to a multimodal model with UI localization," make sure the `MIDSCENE_MODEL_FAMILY` environment variable for your multimodal model is set correctly.

Starting with version 1.0, Midscene recommends using `MIDSCENE_MODEL_FAMILY` to specify the multimodal model type. Legacy `MIDSCENE_USE_...` configs remain compatible but are deprecated.

See [Configure your model](./model-common-config) for setup details.

### Can each Agent instance use its own model?

Yes. You can configure per-agent models via the `modelConfig` parameter. See the [API reference](./api) for details.

### Want to send browser DOM info to the model?

By default, Midscene does not send browser DOM data to models. If you need to include it for UI understanding (for example, to pass details not visible in a screenshot), set `domIncluded` to `true` in the options for interfaces like `aiAsk` or `aiQuery`. See the [API reference](./api) for details.

<TroubleshootingLLMConnectivity />

<!-- END OFFICIAL PAGE 41: model-strategy.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 42: quick-experience.mdx -->

## Source page: `quick-experience.mdx`

import SetupEnv from './common/setup-env.mdx';
import StartExperience from './common/start-experience.mdx';
import ShowcaseWeb from './showcases-web.mdx';

# Quick experience by Chrome extension

Midscene.js provides a Chrome extension. By using it, you can quickly experience the main features of Midscene on any webpage, without needing to set up a code project.

⁠The extension shares the same code as the npm `@midscene/web` packages, so you can think of it as a playground or a way to debug with Midscene.

<ShowcaseWeb />

## Install Chrome extension

<a href="https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief" target="_blank"><img src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/chrome_extension_store_btn.png" width="200" /></a>

Install Midscene extension from chrome web store: [Midscene](https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief)

Start the extension (may be folded by Chrome extension icon), you should see the sidebar named "Midscene" in the right side of the browser.


<SetupEnv />

See more showcases: [showcases](./showcases.mdx)

## Start experiencing

<StartExperience />

## FAQ

### Can I install the extension manually?

If you cannot access the Chrome Web Store, you can download the installation package from the [Releases page](https://github.com/web-infra-dev/midscene/releases) on GitHub and install it manually. However, this is not recommended as automatic updates will not be available.

### Extension fails to run and shows 'Cannot access a chrome-extension:// URL of different extension'

It's mainly due to conflicts with other extensions injecting `<iframe />` or `<script />` into the page. Try disabling the suspicious plugins and refresh.

To find the suspicious plugins:

1. Open the Devtools of the page, find the `<script>` or `<iframe>` with a url like `chrome-extension://{ID-of-the-suspicious-plugin}/...`.
2. Copy the ID from the url, open `chrome://extensions/` , use cmd+f to find the plugin with the same ID, disable it.
3. Refresh the page, try again.

### Getting a 403 error when using Ollama model in Chrome extension

You need to set the environment variable `OLLAMA_ORIGINS="*"` to allow the Chrome extension to access the Ollama model.

<!-- END OFFICIAL PAGE 42: quick-experience.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 43: quick-start.mdx -->

## Source page: `quick-start.mdx`

import { PackageManagerTabs } from '@theme';
import QuickModelConfig from './common/quick-model-config.mdx';

# Quick Start

Get a feel for Midscene in a few minutes. There are two ways to start, and you can do either one first:

- **No code** — install the Chrome extension and try Midscene on any web page, without setting up a project.
- **Write a script** — use the JavaScript SDK to build a repeatable automation.

Both need a multimodal model configured, so let's set that up first.

## Configure a model

<QuickModelConfig />

> Using a different model (Doubao, GLM, Gemini, GPT-5…)? See [Configure your model](./model-common-config) for every supported provider.

You'll reuse these values in whichever path you pick below — paste them into the extension's settings, or set them as environment variables for the SDK.

## Try it with no code (Chrome extension)

Think of the extension as a **playground for Midscene** — much like an API Playground, it's an interactive sandbox where you can try natural-language prompts, preview the results immediately, and debug, all without writing or running any code. Because it shares the same core as the `@midscene/web` SDK, anything you validate here behaves the same once you script it.

1. Install Midscene from the Chrome Web Store:

   <a href="https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief" target="_blank"><img src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/chrome_extension_store_btn.png" width="200" /></a>

2. Open the **Midscene** panel (it may be folded under the Chrome extensions icon) — a sidebar appears on the right side of the browser.
3. Click the settings (gear) icon and paste your model configuration. The extension accepts the same `export KEY="value"` format shown in [Configure a model](#configure-a-model) above.
4. Open any web page, type an instruction — an action, a data query, or an assertion — and watch Midscene operate the page for you.

For the full walkthrough and troubleshooting, see [Quick experience by Chrome extension](./quick-experience).

## Write your first script (SDK)

Prefer code? Build a repeatable automation with the JavaScript SDK. This example uses the browser (Playwright).

### Step 1. Install dependencies

<PackageManagerTabs command="install @midscene/web playwright tsx --save-dev" />

### Step 2. Set the model environment variables

Set the values from [Configure a model](#configure-a-model) as environment variables, or put them in a `.env` file and load it with [dotenv](https://www.npmjs.com/package/dotenv).

### Step 3. Write the script

Save the following as `./demo.ts`. It opens eBay, searches for headphones, reads the result list, and asserts the page state — all described in natural language:

```typescript title="./demo.ts"
import { chromium } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';
import 'dotenv/config'; // load environment variables from .env if present

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

Promise.resolve(
  (async () => {
    const browser = await chromium.launch({ headless: false }); // 👀 watch it run
    const page = await browser.newPage();
    await page.goto('https://www.ebay.com');
    await sleep(3000);

    // 👀 init the Midscene agent
    const agent = new PlaywrightAgent(page);

    // 👀 act with natural language
    await agent.aiAct('type "Headphones" in the search box, then hit Enter');
    await agent.aiWaitFor('there is at least one headphone product in the list');

    // 👀 extract structured data
    const items = await agent.aiQuery(
      '{ title: string, price: number }[], the headphone products in the list',
    );
    console.log('headphones in stock:', items);

    // 👀 assert with natural language
    await agent.aiAssert('There is a category filter on the left side');

    await browser.close();
  })(),
);
```

### Step 4. Run it

```bash
npx tsx demo.ts
```

### Step 5. View the report

After a successful run, Midscene prints something like:

```log
Midscene - report file updated: ./midscene_run/report/some_id.html
```

Open that HTML file in your browser to replay every action, query, and assertion step by step. The report is the tool most developers rely on to understand and debug what the AI did.

## Next steps

- **Use it in your tests**: [Integrate with Playwright](./integrate-with-playwright) to add Midscene to your existing suite.
- **Other platforms**: get started on [Android](./android-getting-started), [iOS](./ios-getting-started), [HarmonyOS](./harmony-getting-started), or [desktop](./computer-getting-started).
- **Go further**: improve results with [Model strategy](./model-strategy), or look up every method in the [API reference](./api).

<!-- END OFFICIAL PAGE 43: quick-start.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 44: showcases-android.mdx -->

## Source page: `showcases-android.mdx`

**Prompt** : Open the Booking App, search for a hotel in Tokyo for four adults on Christmas, with a score of 8 or above.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/booking2.mp4" poster="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/booking.png" height="300" controls />

View the full report of this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/booking.html)

<!-- END OFFICIAL PAGE 44: showcases-android.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 45: showcases-computer.mdx -->

## Source page: `showcases-computer.mdx`

**Prompt** (**macOS**): Help me post a tweet promoting Midscene's support for AutoGLM through safari, with the following requirements:
1. Text content: Midscene now supports AutoGLM!
2. Media content: Use the AutoGLM video from the download folder!

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/pc-twitter2.mp4" height="300" controls />

View the full report for this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/pc-twitter2-midscene_report.html)

**Prompt** (**Windows**): Open Sauce Demo e-commerce site, login and add items to cart

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/windows.mov" height="300" controls />

View the full report for this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/shop-computer-2026-01-14_11-57-36-f8411b8f.html)

**Prompt** (**macOS**): Open Google and query San Jose tomorrow weather temperature

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/mac.mov" height="300" controls />

View the full report for this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/weather-computer-2026-01-14_11-26-38-9592ecf5.html)

**Prompt** (**Linux**): Open TodoMVC, add multiple tasks and filter them

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/linux.mov" height="300" controls />

View the full report for this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/todo-computer-2026-01-13_15-40-37-6f45fb0f.html)

<!-- END OFFICIAL PAGE 45: showcases-computer.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 46: showcases-harmony.mdx -->

## Source page: `showcases-harmony.mdx`

**Prompt** : Open Settings, scroll to find "About phone", view device information.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/harmony.mp4" poster="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/harmony.png" height="300" controls />

View the full report of this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/harmony.html)

<!-- END OFFICIAL PAGE 46: showcases-harmony.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 47: showcases-ios.mdx -->

## Source page: `showcases-ios.mdx`

**Prompt** : Open Twitter and auto-like the first tweet by @midscene_ai

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/x2.mp4" poster="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/x.png" height="300" controls />

View the full report of this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/x.html)

<!-- END OFFICIAL PAGE 47: showcases-ios.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 48: showcases-web.mdx -->

## Source page: `showcases-web.mdx`

**Prompt** : Sign up for Github, you need to pass the form validation, but don't actually click. 

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github2.mp4" poster="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github.png" height="300" controls />

View the full report of this task: [report.html](https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github.html)

<!-- END OFFICIAL PAGE 48: showcases-web.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 49: showcases.mdx -->

## Source page: `showcases.mdx`

# Showcases

import ShowcaseWeb from './showcases-web.mdx';
import ShowcaseIOS from './showcases-ios.mdx';
import ShowcaseAndroid from './showcases-android.mdx';
import ShowcaseHarmony from './showcases-harmony.mdx';
import ShowcaseComputer from './showcases-computer.mdx';


## Web

<ShowcaseWeb />

## iOS

<ShowcaseIOS />

## Android

<ShowcaseAndroid />

## HarmonyOS

<ShowcaseHarmony />

## Computer

<ShowcaseComputer />

## Community showcases

Some community developers have successfully built on Midscene's capability to [integrate with any interface](./integrate-with-any-interface), extending it with a robotic arm plus vision and voice models for in-vehicle large-screen testing scenarios.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/AI_Vision_Powered_Robotic_Arm.mp4" height="300" controls />

<!-- END OFFICIAL PAGE 49: showcases.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 50: skills.mdx -->

## Source page: `skills.mdx`

# Control any platform with Skills

[Agent Skills](https://github.com/anthropics/skills) are a format for extending AI coding agents with specialized capabilities. Midscene provides Agent Skills that let AI coding tools (like Claude Code, Cline, etc.) drive UI automation through CLI commands.

Skills work by running CLI commands directly in the terminal. The AI agent acts as the brain: it takes screenshots, analyzes the UI, and decides which actions to perform next.

## Supported platforms

| Skill | Package | CLI command | Description |
|-------|---------|-------------|-------------|
| Browser Automation | `@midscene/web` | `npx @midscene/web` | Browser automation with three modes: default Puppeteer headless, `--bridge` to use your own Chrome, `--cdp <ws-endpoint>` to connect via CDP |
| Desktop Computer Automation | `@midscene/computer` | `npx @midscene/computer` | macOS, Windows, Linux desktop control |
| Android Device Automation | `@midscene/android` | `npx @midscene/android` | Android device control via ADB |
| iOS Device Automation | `@midscene/ios` | `npx @midscene/ios` | iOS device control via WebDriverAgent |
| HarmonyOS Device Automation | `@midscene/harmony` | `npx @midscene/harmony` | HarmonyOS device control via HDC |

In default Puppeteer mode, you can override the default `1440x800` viewport with `--viewport-width <width>` and `--viewport-height <height>`. These flags are only supported in default Puppeteer mode, not in `--bridge` or `--cdp` mode.

If Chrome is installed in a non-standard location, set `MIDSCENE_CHROME_PATH` to the Chrome executable path. `MIDSCENE_MCP_CHROME_PATH` is still accepted as a temporary migration alias.

## Installation

Make sure [Node.js](https://nodejs.org) is installed, then run:

```bash
# General installation
npx skills add web-infra-dev/midscene-skills

# Claude Code
npx skills add web-infra-dev/midscene-skills -a claude-code

# OpenClaw
npx skills add web-infra-dev/midscene-skills -a openclaw
```

Skills repository: [github.com/web-infra-dev/midscene-skills](https://github.com/web-infra-dev/midscene-skills)

## Model configuration

Midscene skills require a multimodal model with strong UI localization. Configure the following environment variables — either as system environment variables or in a `.env` file in the current working directory (Midscene loads `.env` automatically):

```bash
MIDSCENE_MODEL_API_KEY="your-api-key"
MIDSCENE_MODEL_NAME="model-name"
MIDSCENE_MODEL_BASE_URL="https://..."
MIDSCENE_MODEL_FAMILY="family-identifier"
```

For supported models and configuration details, see [Model strategy](./model-strategy) and [Common model configuration](./model-common-config).

## Use skills

Once installed, just describe the task in natural language to your AI coding agent. It picks the right Skill, runs the CLI, reads the screenshots, and decides what to do next — for example:

> Open the photo app and tell me the first photo in the album.

## Example: Coding Agent self-verifies after writing code

In this example, we ask Claude Code to develop an Electron Todo app, and after writing the code, it uses the `desktop-computer-automation` Skill to launch the app, interact with the UI, and take screenshots to verify the feature works as expected — no manual intervention or test scripts needed.

**Prompt:**

```
Build an Electron Todo app with add, toggle, and delete functionality.
After development, launch the app and verify with desktop automation: add 3 todos, check one off, delete one, and take a screenshot to confirm the final state is correct.
```

The coding agent autonomously completes the entire workflow: write the Todo component → launch the Electron app → connect to the desktop → take screenshots to understand the UI → interact via natural language → take screenshots to verify results. The developer only describes the intent, and Skills give the agent the ability to "see the screen and move the mouse", letting it verify its own code just like a human would.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/computer-skill.mp4" height="300" controls />

## More use cases

Skills go beyond local desktop testing. By combining different Skills, you can cover a wide range of automation scenarios:

- **Desktop app testing** — Verify functionality of Electron, Qt, WPF and other desktop applications
- **Remote computer control** — Operate applications on remote machines via remote desktop connections for remote ops and debugging
- **Mobile app testing** — Use `@midscene/android` and `@midscene/ios` Skills to test mobile apps on real devices or simulators
- **Cross-app workflows** — Chain operations across multiple apps, e.g. fetch data from browser → paste into Excel → take screenshot and send to Slack
- **CI/CD integration** — Run desktop automation in headless mode on Linux CI via Xvfb, no physical display needed
- **Daily task automation** — Batch form filling, scheduled screenshot monitoring, automatic file organization, etc.

## More

Please refer to the [Skills Repository](https://github.com/web-infra-dev/midscene-skills) for more details.

<!-- END OFFICIAL PAGE 50: skills.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 51: use-javascript-to-optimize-ai-automation-code.md -->

## Source page: `use-javascript-to-optimize-ai-automation-code.md`

# Use JavaScript to optimize the AI automation code

Many developers love using `aiAct` or `ai` to accomplish automation tasks, even packing long, complex logic into a single natural-language instruction. It feels “smart,” but in practice you may run into unstable reproducibility and slower performance.

This article shares an approach for writing automation scripts with JavaScript and structured APIs.

## Write automation scripts with JavaScript and structured APIs

Midscene provides structured API methods like `aiBoolean`, `aiString`, and `aiNumber` to extract state from the UI. Combined with instant action methods like `aiTap`, `aiInput`, `aiScroll`, and `aiHover`, you can break complex logic into steps to make automation more stable.

### A simple example

Take this prompt as an example:

```txt
click all the records one by one. If one record contains the text "completed", skip it
```

By composing the structured APIs, you can convert the prompt into more reliable, maintainable code:
```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record}" contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

After changing the coding style, the process becomes more reliable and easier to maintain, and you can use traditional debugging to control the execution flow.

### A complex example

Here is another example, shown before rewriting:

```javascript
aiAct(`
1. click the first unfollowed user, enter the user's homepage
2. click the follow button
3. go back to the previous page
4. if all users are followed, scroll down one screen
5. repeat the above steps until all users are followed
`)
```

Using structured APIs, you can lock this flow into code:

```javascript
let user = await agent.aiQuery('string[], the unfollowed user names in the list')
let currentUserIndex = 0

while (user.length > 0) {
  console.log('current user is', user[currentUserIndex])
  await agent.aiTap(user[currentUserIndex])
  try {
    await agent.aiTap('follow button')
  } catch (e) {
    // ignore if error
  }
  // Go back to the previous page
  await agent.aiTap('back button')
  
  currentUserIndex++
  
  // Check if we've gone through all users in the current list
  if (currentUserIndex >= user.length) {
    // Scroll down to load more users
    await agent.aiScroll({
      direction: 'down',
      scrollType: 'once',
    })
    
    // Get the updated user list
    user = await agent.aiQuery('string[], the unfollowed user names in the list')
    currentUserIndex = 0
  }
}
```

## Commonly-used structured API methods

Here are some commonly-used structured API methods:

### `aiBoolean` - conditional decision

* Use Case: Condition Judgment, State Detection
* Advantage: Convert fuzzy descriptions into clear boolean values

Example:
```javascript
const hasAlreadyChat = await agent.aiBoolean('check if I have already sent a message to him/her')
if (hasAlreadyChat) {
  // ...
}
```

### `aiString` - text extraction

* Use Case: Text Content Retrieval
* Advantage: Avoid Ambiguity in Natural Language Descriptions

Example:
```javascript
const username = await agent.aiString('the nickname of the first user in the list')
console.log('username is', username)
```

### `aiNumber` - numerical extraction

* Use Case: Counting, Numerical Comparison, Loop Control
* Advantage: Ensure Return Standard Numeric Types

Example:
```javascript
const unreadCount = await agent.aiNumber('the number of unread messages on the message icon')
for (let i = 0; i < unreadCount; i++) {
  // ...
}
```

### `aiQuery` - general data extraction

* Use Case: Extract any data type
* Advantage: Flexible Data Type Handling

Example:
```javascript
const userList = await agent.aiQuery('string[], the user list')
```

### Instant action methods

Midscene provides some instant action methods, like `aiTap`, `aiInput`, `aiScroll`, `aiHover`, etc., They are also commonly used in the automation code. You can check them in the [API](./api.mdx) page.

## Which approach is best: `aiAct` or structured code?

There is no standard answer. It depends on the model's ability, the complexity of the actual business.

Generally, if you encounter the following situations, you should consider abandoning the `aiAct` method:

- The success rate of `aiAct` does not meet the requirements after multiple retries
- You have already felt tired and spent too much time repeatedly tuning the `aiAct` prompt
- You need to debug the script step by step

## Want to write structured code easily?

If you think the JavaScript code above is hard to write, now is the time to use an AI IDE.

Use your AI IDE to index our docs:

- https://midscenejs.com/use-javascript-to-optimize-ai-automation-code.md
- https://midscenejs.com/api.md

To learn how to add Midscene docs to your AI IDE, see [this article](./llm-txt.mdx#usage).

<!-- END OFFICIAL PAGE 51: use-javascript-to-optimize-ai-automation-code.md -->

---

<!-- BEGIN OFFICIAL PAGE 52: web-api-reference.mdx -->

## Source page: `web-api-reference.mdx`

# API reference (Web)

Use this doc when you need to customize Midscene's browser automation agents or review browser-only constructor options. For shared parameters (reporting, hooks, caching, etc.), see the platform-agnostic [API reference (Common)](./api).

## Action Space

PuppeteerAgent, PlaywrightAgent, and Chrome Bridge share one action space; the Midscene Agent can use these actions while planning tasks:

- `Tap` &mdash; Left-click an element.
- `RightClick` &mdash; Right-click an element.
- `DoubleClick` &mdash; Double-click an element.
- `Hover` &mdash; Hover over an element.
- `Input` &mdash; Enter text with `replace`/`typeOnly`/`clear` modes (`append` is a deprecated alias for `typeOnly`).
- `KeyboardPress` &mdash; Press a specified key (optionally focusing a target element first).
- `Scroll` &mdash; Scroll from an element or screen center; supports scroll-to-top/bottom/left/right helpers.
- `DragAndDrop` &mdash; Drag from one element to another.
- `LongPress` &mdash; Long-press a target element with optional duration.
- `Swipe` &mdash; Touch-style swipe gesture (available when `enableTouchEventsInActionSpace` is `true`).
- `Pinch` &mdash; Two-finger pinch gesture for zoom in/out (available when `enableTouchEventsInActionSpace` is `true`; Chromium-based browsers only for Playwright).
- `ClearInput` &mdash; Clear the contents of an input field.
- `Navigate` &mdash; Open a URL in the current tab.
- `Reload` &mdash; Reload the page.
- `GoBack` &mdash; Navigate back in history.

## PuppeteerAgent {#puppeteer-agent}

Use Midscene against a Puppeteer-controlled browser when you need AI actions in your own Puppeteer workflows.

### Import

```ts
import { PuppeteerAgent } from '@midscene/web/puppeteer';
```

### Constructor

```ts
const agent = new PuppeteerAgent(page, {
  // browser-specific options...
});
```

### Browser-specific options

In addition to the base agent options, Puppeteer exposes:

- `forceSameTabNavigation: boolean` &mdash; Restrict navigation to the current tab. Default `true`.
- `waitForNavigationTimeout: number` &mdash; Maximum wait when a step causes navigation. Default `5000` (set `0` to skip waiting).
- `waitForNetworkIdleTimeout: number` &mdash; Wait for network idle between actions to reduce flakiness. Default `2000` (set `0` to skip waiting).
- `enableTouchEventsInActionSpace: boolean` &mdash; Add touch gestures (like swipe) to the action space so the agent can handle touch-only interactions. Default `false`.
- `keyboardTypeDelay: number` &mdash; Per-character delay (ms) forwarded to Puppeteer's `page.keyboard.type`. Default `undefined`, which leaves the option unset and uses Puppeteer's own default. You usually do not need to configure it; raise it (e.g. `80`) only when a controlled input drops characters under fast typing.
- `forceChromeSelectRendering: boolean` &mdash; Force `select` elements to render with Chrome's base-select styling so they're visible in screenshots/element extraction; requires Puppeteer > `24.6.0`. Defaults to `true`; set to `false` to opt out (e.g. on older Chrome/Puppeteer versions).
- `customActions: DeviceAction[]` &mdash; Register bespoke actions defined via `defineAction` so planning can call domain-specific steps.

### Usage notes

:::info

- One agent per page: by default (`forceSameTabNavigation: true`), Midscene opens new links in the current tab for easier debugging. Set it to `false` if you want new tabs, and create a new agent per tab.
- For the full list of interaction methods, see [API reference (Common)](./api#interaction-methods).

:::

### Examples

#### Quick start

```ts
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
await page.goto('https://www.ebay.com');

const agent = new PuppeteerAgent(page, {
  actionContext: 'When a cookie dialog appears, accept it.',
});

await agent.aiAct('search "Noise cancelling headphones" and open first result');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], list two products with price',
);
console.log(items);

await agent.aiAssert('there is a category filter on the left sidebar');
await browser.close();
```

#### Connect to a remote Puppeteer browser

```ts
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const browser = await puppeteer.connect({
  browserWSEndpoint: process.env.REMOTE_CDP_URL!,
});

const [page = await browser.newPage()] = await browser.pages();
const agent = new PuppeteerAgent(page, {
  waitForNetworkIdleTimeout: 0,
});

await agent.aiAct('open https://example.com and click the login button');
await agent.destroy();
await browser.disconnect();
```

### See also

- [Integrate with Puppeteer](./integrate-with-puppeteer) for installation, fixtures, and remote-CDP guidance.

## PlaywrightAgent {#playwright-agent}

Use Midscene inside a Playwright browser for AI-driven testing or automation alongside your Playwright flows.

### Import

```ts
import { PlaywrightAgent } from '@midscene/web/playwright';
```

### Constructor

```ts
const agent = new PlaywrightAgent(page, {
  // browser-specific options...
});
```

### Browser-specific options

- `forceSameTabNavigation: boolean` &mdash; Keep automation inside the active tab. Default `true`.
- `waitForNavigationTimeout: number` &mdash; Wait time for navigation completion. Default `5000` (set `0` to disable).
- `waitForNetworkIdleTimeout: number` &mdash; Wait between actions for network idle. Default `2000` (set `0` to disable).
- `enableTouchEventsInActionSpace: boolean` &mdash; Add touch gestures (like swipe) to the action space so the agent can handle touch-only interactions. Default `false`.
- `keyboardTypeDelay: number` &mdash; Per-character delay (ms) forwarded to Playwright's `page.keyboard.type`. Default `undefined`, which leaves the option unset and uses Playwright's own default. You usually do not need to configure it; raise it (e.g. `80`) only when a controlled input drops characters under fast typing.
- `forceChromeSelectRendering: boolean` &mdash; Force `select` elements to render with Chrome's base-select styling so they're visible in screenshots/element extraction; requires Playwright ≥ `1.52.0`. Defaults to `true`; set to `false` to opt out (e.g. on older Chrome/Playwright versions).
- `customActions: DeviceAction[]` &mdash; Extend planning with project-specific actions.

### Usage notes

:::info

- One agent per page: with `forceSameTabNavigation` (default `true`), Midscene intercepts new tabs for stability. Set it to `false` to allow new tabs and create a separate agent for each.
- For the full list of interaction methods, see [API reference (Common)](./api#interaction-methods).

:::

### Examples

#### Quick start

```ts
import { chromium } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.ebay.com');

const agent = new PlaywrightAgent(page);
await agent.aiAct('search "Noise cancelling headphones" and wait for results');
await agent.aiWaitFor('the results grid becomes visible');

const price = await agent.aiNumber('price of the first headphone');
console.log('first price', price);

await agent.aiTap('click the first result card');
await browser.close();
```

#### Extend Playwright tests with Midscene fixtures

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [['list'], ['@midscene/web/playwright-reporter']],
});

// e2e/fixture.ts
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend(
  PlaywrightAiFixture({ waitForNetworkIdleTimeout: 1000 }),
);

// e2e/examples.spec.ts
test('search flow', async ({ agentForPage, page }) => {
  await page.goto('https://www.ebay.com');
  const agent = await agentForPage(page);
  await agent.aiAct('search "keyboard" and open first listing');
  await agent.aiAssert('a product detail page is opened');
});
```

The fixture accepts all `PlaywrightAgent` options, so you can configure shared agent behavior once at fixture creation time. Per-test metadata such as `testId`, `reportFileName`, `groupName`, and `groupDescription` remain fixture-managed.

### See also

- [Integrate with Playwright](./integrate-with-playwright) for setup, fixtures, and advanced configuration.

## Chrome Bridge Agent {#chrome-bridge-agent}

Bridge Mode lets Midscene operate your currently active desktop Chrome tab through the extension instead of launching a dedicated automation browser.

### Import

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
```

### Constructor

```ts
const agent = new AgentOverChromeBridge({
  allowRemoteAccess: false,
  // other bridge options...
});
```

### Bridge options

- `closeNewTabsAfterDisconnect?: boolean` &mdash; Close any bridge-created tabs when the agent is destroyed. Default `false`.
- `allowRemoteAccess?: boolean` &mdash; Allow remote machines to attach. Defaults to `false` (binds to `127.0.0.1`).
- `host?: string` &mdash; Override the interface for the bridge server. Takes precedence over `allowRemoteAccess`.
- `port?: number` &mdash; TCP port for the bridge server. Default `3766`.

See [Bridge Mode by Chrome extension](./bridge-mode#constructor) for full installation and capability details.

### Usage notes

:::info

Call `connectCurrentTab` or `connectNewTabWithUrl` before issuing other actions. Each `AgentOverChromeBridge` instance can only attach to one tab; create a new instance after `destroy`.

:::

### Bridge methods

#### `connectCurrentTab()`

```ts
function connectCurrentTab(options?: {
  forceSameTabNavigation?: boolean;
}): Promise<void>;
```

- `options.forceSameTabNavigation` (default `true`) intercepts new tabs and opens them in the current tab to simplify debugging; set to `false` if you want normal new-tab behavior (create a separate agent per tab).
- Resolves on a successful handshake with the active tab; rejects if the extension is not allowed to connect.

#### `connectNewTabWithUrl()`

```ts
function connectNewTabWithUrl(
  url: string,
  options?: { forceSameTabNavigation?: boolean },
): Promise<void>;
```

- `url` &mdash; Address to open in a new desktop tab before attaching.
- `options` &mdash; Same as `connectCurrentTab`.
- Resolves when the new tab is opened and the bridge is connected.

#### `destroy()`

```ts
function destroy(closeNewTabsAfterDisconnect?: boolean): Promise<void>;
```

- `closeNewTabsAfterDisconnect` &mdash; Optional runtime override for the constructor setting; `true` closes bridge-created tabs on teardown.
- Resolves after the bridge connection and local server are fully cleaned up.

### Examples

#### Open a new desktop tab

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

const agent = new AgentOverChromeBridge();
await agent.connectNewTabWithUrl('https://www.bing.com');

await agent.ai('search "AI automation" and summarise first result');
await agent.aiAssert('some search results show up');
await agent.destroy();
```

#### Attach to current tab

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

const agent = new AgentOverChromeBridge({
  allowRemoteAccess: false,
  closeNewTabsAfterDisconnect: true,
});

await agent.connectCurrentTab({ forceSameTabNavigation: true });
await agent.aiAct('open Gmail and report how many unread emails are visible');
await agent.destroy();
```

### See also

- [API reference (Common)](./api#interaction-methods) for shared agent methods.
- [Bridge mode](./bridge-mode) for extension setup, command sequence, and YAML usage.

<!-- END OFFICIAL PAGE 52: web-api-reference.mdx -->

---

<!-- BEGIN OFFICIAL PAGE 53: yaml-script-runner.mdx -->

## Source page: `yaml-script-runner.mdx`

import SetupEnv from './common/setup-env.mdx';

# YAML script runner

Midscene defines a YAML-based scripting format so you can quickly author automation scripts, then run them from the command line without extra setup. For more details on YAML scripts, see [Automate with scripts in YAML](./automate-with-scripts-in-yaml).

For example, you can write a YAML script like this:

```yaml
web:
  url: https://www.bing.com

tasks:
  - name: Search for weather
    flow:
      - ai: Search for "today's weather"
      - sleep: 3000
      - aiAssert: The results show weather information
```

Run it with one command:

```bash
midscene ./bing-search.yaml
```

The CLI prints execution progress and generates a visual report when it finishes, while keeping setup simple.

## Configure environment variables with `.env`

The Midscene CLI uses [dotenv](https://www.npmjs.com/package/dotenv) to load a `.env` file from the directory where you run the tool. Create a `.env` file and add:

```ini filename=.env
MIDSCENE_MODEL_BASE_URL="replace with your model service URL/v1"
MIDSCENE_MODEL_API_KEY="replace with your API Key"
MIDSCENE_MODEL_NAME="replace with your model name"
MIDSCENE_MODEL_FAMILY="replace with your model family"
```

For more configuration details, see the [Model strategy](./model-strategy) guide.

Notes:

- The file is optional; you can also set global environment variables instead.
- Do not add an `export` prefix—this is how dotenv expects values.
- Place `.env` in the directory where you run the tool, not necessarily next to the YAML file.
- These values do **not** override existing global environment variables unless you enable `--dotenv-override` (see below).
- Use `--dotenv-debug` if you need to debug how environment variables load.

## Get started

### Install the CLI

Before installing the CLI, make sure the terminal that runs `midscene` uses Node.js `20.19+`, `22.12+`, or `24+`. Some CLI execution paths use the Rstest/Rspack toolchain, which rejects older Node 20 patch versions such as `20.17.0`. If you see an `Unsupported Node.js version` message from Rspack, upgrade Node.js and reinstall the global CLI or project dependencies.

Install `@midscene/cli` globally (recommended for first-time users):

```bash
npm i -g @midscene/cli
```

Or install it per project:

```bash
npm i @midscene/cli --save-dev
```

### Write your first script

Create `bing-search.yaml` to drive a web browser:

```yaml
web:
  url: https://www.bing.com

tasks:
  - name: Search for weather
    flow:
      - ai: Search for "today's weather"
      - sleep: 3000
      - aiAssert: The results show weather information
```

Drive an Android device connected over adb:

```yaml
android:
  deviceId: s4ey59 # find the device id with `adb devices`

tasks:
  - name: Maps Navigation
    flow:
      - ai: Open the Maps app
      - ai: Input 'West Lake, Hangzhou' in the search bar, and click the search button
      - ai: Click the first search result, enter the details page
      - ai: Click "Directions" button, enter the route planning page
      - ai: Click "Start" button to start navigation
```

Or drive an iOS device with WebDriverAgent configured:

```yaml
ios:
  wdaPort: 8100

tasks:
  - name: Change System Settings
    flow:
      - ai: Open the Settings app
      - ai: Tap "Display & Brightness"
      - ai: Turn on "Dark Mode"
      - aiAssert: Dark Mode is enabled
```

### Run the script

```bash
midscene ./bing-search.yaml
# If Midscene is installed in your project
npx midscene ./bing-search.yaml
```

The CLI prints execution progress and generates a visual report when it finishes.

## Advanced usage of the command-line tool

### Use environment variables in `.yaml`

Reference environment variables in your scripts with `${variable-name}`. Environment-variable interpolation is applied before YAML task execution, including task strings.

```ini filename=.env
topic=weather today
```

```yaml
# ...
- ai: type ${topic} in input box
# ...
```

### Run multiple scripts

`@midscene/cli` supports glob patterns to batch-execute scripts, which is a shorthand for the `--files` argument.

```bash
# Run a single script
midscene ./bing-search.yaml

# Use a glob pattern to run all matching scripts
midscene './scripts/**/*.yaml'
```

### Analyze command-line output

After execution, the output directory contains:

- A JSON summary specified by `--summary` (defaults to `index.json`) with execution status and statistics for all scripts.
- Individual execution results for each YAML file (JSON).
- Visual reports for each script (HTML).

### Run in headed mode

> `web` scenarios only

Headed mode opens the browser window. By default, scripts run headless.

```bash
# Run in headed mode
midscene /path/to/yaml --headed

# Run in headed mode and keep the window after finishing
midscene /path/to/yaml --keep-window
```

### Use CDP connection mode

> `web` scenarios only

CDP mode lets YAML scripts connect to an existing browser instance via Chrome DevTools Protocol, without launching a new browser. This is useful for reusing an existing browser session, connecting to remote browsers, or cloud browser services.

Set `cdpEndpoint` in the `web` section:

```diff
web:
  url: https://www.bing.com
+ cdpEndpoint: ws://localhost:9222/devtools/browser
```

:::tip

CDP mode and bridge mode are mutually exclusive. In CDP mode, Midscene will only disconnect from the browser, not close it.

:::

### Use bridge mode

> `web` scenarios only

Bridge mode lets YAML scripts drive your existing desktop browser so you can reuse cookies, extensions, or state. Install the Chrome extension, then add:

```diff
web:
  url: https://www.bing.com
+ bridgeMode: newTabWithUrl
```

See [Bridge Mode via Chrome Extension](./bridge-mode) for details.

### Run YAML scripts with JavaScript

Call the Agent's [`runYaml`](./api#runyaml) method to execute YAML from JavaScript. This runs only the `tasks` section of the script.

## Command-line options

The CLI provides parameters to control how scripts run:

- `--files <file1> <file2> ...`: List of script files. Executes in order, sequentially by default (`--concurrent` is `1`), or concurrently when `--concurrent` is set. Supports [glob](https://www.npmjs.com/package/glob) patterns; when a glob pattern or directory matches multiple files, matched files are added to the execution list in lexicographic path order.
- `--setup <file>`: A setup script that runs before the main `--files`. It runs inside the same shared browser context, so prerequisite state such as a login established here is visible to every main script. A setup failure aborts the whole batch and the main scripts are reported as not executed. Requires `--share-browser-context`.
- `--concurrent <number>`: Number of concurrent executions. Default `1`.
- `--continue-on-error`: Continue running remaining scripts even if one fails. Default off.
- `--retry <number>`: Number of times to retry a failed script. Only the scripts that failed in the previous attempt are retried, which helps with unstable networks or unstable model output. Default `0`. (Not effective together with `--share-browser-context`, where the whole batch shares a single run.)
- `--share-browser-context`: Share browser context (cookies, `localStorage`, etc.) across scripts. Default off.
- `--summary <filename>`: Path for the JSON summary report.
- `--headed`: Run in a headed browser instead of headless.
- `--keep-window`: Keep the browser window after execution; enables `--headed` automatically.
- `--config <filename>`: Config file whose values become defaults for CLI arguments.
- `--web.userAgent <ua>`: Override `web.userAgent` for all scripts.
- `--web.viewportWidth <width>`: Override `web.viewportWidth` for all scripts.
- `--web.viewportHeight <height>`: Override `web.viewportHeight` for all scripts.
- `--android.deviceId <device-id>`: Override `android.deviceId` for all scripts.
- `--ios.wdaPort <port>`: Override `ios.wdaPort` for all scripts.
- `--ios.wdaHost <host>`: Override `ios.wdaHost` for all scripts.
- `--dotenv-debug`: Enable dotenv debug logs. Default off.
- `--dotenv-override`: Allow dotenv to override global environment variables. Default off.

Examples:

Use `--files` to specify execution order:

```bash
midscene --files ./login.yaml ./buy/*.yaml ./checkout.yaml
```

Run multiple independent search scripts with a concurrency of 4 and continue when errors occur:

```bash
midscene --files './scripts/search-*.yaml' --concurrent 4 --continue-on-error
```

### Write command-line arguments in a file

You can place arguments in a YAML config file and reference it with `--config`. Command-line arguments take priority over the config file.

```yaml
files:
  - './scripts/search-iphone.yaml'
  - './scripts/search-laptop.yaml'
  - './scripts/search-headphones.yaml'
  - './scripts/search-camera.yaml'

concurrent: 4
continueOnError: true
retry: 2
```

Run with:

```bash
midscene --config ./config.yaml
```

#### Run a setup before parallel scripts

When several independent scripts all depend on the same prerequisite (for example a login), put the prerequisite under `setup`. The setup script runs before the main `files`; once it succeeds, the main scripts run with the configured concurrency. Setup and main scripts share one browser context, so the login state is carried over. `setup` requires `shareBrowserContext: true`.

```yaml
setup: ./scripts/login.yaml

files:
  - ./scripts/search.yaml
  - ./scripts/report.yaml
  - ./scripts/settings.yaml

shareBrowserContext: true
concurrent: 3
```

If the setup script fails, the batch is aborted and the main scripts are reported as not executed.

## FAQ

**How can I export cookies from Chrome as JSON?**

Use this [Chrome extension](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) to export cookies.

**How can I view dotenv debug logs?**

Use the `--dotenv-debug` flag:

```bash
midscene /path/to/yaml --dotenv-debug=true
```

<!-- END OFFICIAL PAGE 53: yaml-script-runner.mdx -->

---

