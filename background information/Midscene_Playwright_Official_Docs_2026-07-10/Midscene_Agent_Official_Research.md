# Midscene 官方 Agent 调研

> 调研基线：Midscene 官方仓库 `web-infra-dev/midscene`，提交 `d4b1a3092b358c3178760466960ab21fcce6e504`；文档下载日期：2026-07-10。

## 1. 结论

Midscene 并不是“读取自然语言后生成一个新的 Agent 程序”，而是提供一组已经实现好的 **运行时 Agent 类**。开发者把 Agent 绑定到一个浏览器 `Page`、移动设备、桌面设备或自定义界面后，Agent 调用多模态模型完成规划与视觉定位，再通过对应平台的动作空间执行点击、输入、滚动和键盘操作。

针对本次银行内网网页自动化实习，主 Agent 应当是：

```ts
import { PlaywrightAgent } from '@midscene/web/playwright';

const agent = new PlaywrightAgent(page, {
  replanningCycleLimit: 9,
});
```

`PlaywrightAgent` 与 Playwright 的 `Page` 绑定。Playwright 继续负责浏览器生命周期、登录态、网络等待、稳定 DOM Locator 和断言；Midscene 负责无法稳定通过 DOM 处理的视觉定位与自然语言操作。

## 2. Midscene 官方提供的 Agent

| 场景 | Agent / 创建函数 | 官方导入或创建方式 | 作用 |
|---|---|---|---|
| Playwright 网页 | `PlaywrightAgent` | `@midscene/web/playwright` | 在 Playwright 页面中加入 AI 规划、视觉定位、动作、查询和断言能力 |
| Puppeteer 网页 | `PuppeteerAgent` | `@midscene/web/puppeteer` | 在 Puppeteer 页面中运行 Midscene |
| 已打开的桌面 Chrome | `AgentOverChromeBridge` | `@midscene/web/bridge-mode` | 通过扩展桥接当前 Chrome 标签页，而不是启动专用浏览器 |
| Android | `AndroidAgent` | `@midscene/android` | 将 AI 规划器绑定到 `AndroidDevice` |
| iOS | `IOSAgent` | `@midscene/ios` | 通过 WebDriverAgent 将 AI 规划器绑定到 `IOSDevice` |
| HarmonyOS | `HarmonyAgent` | `@midscene/harmony` | 将 AI 规划能力绑定到 `HarmonyDevice` |
| 本地桌面 | `ComputerAgent` | `agentForComputer()` | 控制 Windows、macOS 或 Linux 本地桌面 |
| 远程 Windows 桌面 | `ComputerAgent<RDPDevice>` | `agentForRDPComputer()` | 通过 RDP 驱动远程 Windows 桌面 |
| 自定义界面 | 通用 `Agent` + 自定义设备类 | 实现 `AbstractInterface` | 对内部客户端、车机、IoT、特殊终端等自定义动作空间 |

官方来源页：

- `01_Midscene/pages/en/api.md`
- `01_Midscene/pages/en/web-api-reference.md`
- `01_Midscene/pages/en/android-api-reference.md`
- `01_Midscene/pages/en/ios-api-reference.md`
- `01_Midscene/pages/en/harmony-api-reference.md`
- `01_Midscene/pages/en/computer-api-reference.md`
- `01_Midscene/pages/en/integrate-with-any-interface.md`

## 3. 一个 Midscene Agent 实际包含什么

从官方 API 和平台文档可以归纳出以下运行链路：

```text
自然语言任务
  ↓
Agent 获取截图与当前界面上下文
  ↓
多模态模型规划步骤或定位目标控件
  ↓
从平台 Action Space 中选择 Tap / Input / Scroll / Keyboard 等动作
  ↓
Playwright、ADB、WebDriverAgent、HDC、桌面输入或自定义接口执行动作
  ↓
重新获取界面状态并判断是否完成
  ↓
必要时重规划，最终输出结果、报告与缓存信息
```

这是一种“模型负责理解与定位、平台适配层负责真实执行”的结构。不同 Agent 共享主要交互方法，但动作空间随平台变化。

## 4. 两种操作模式

### 4.1 自动规划

```ts
await agent.aiAct('输入客户号，点击查询，并打开第一条结果的详情');
// 简写
await agent.ai('输入客户号，点击查询，并打开第一条结果的详情');
```

`aiAct()` 会把自然语言拆成多个步骤并顺序执行。适合探索或局部复杂任务，但更依赖模型质量，也更难严格控制银行业务中的风险边界。

### 4.2 即时动作

```ts
await agent.aiInput('客户号输入框', { value: testData.customerId });
await agent.aiTap('客户号输入框右侧的“查询”按钮');
await agent.aiWaitFor('查询结果表格已经显示');
await agent.aiAssert('第一行客户状态显示为正常');
```

即时动作由程序明确指定动作种类，模型主要负责定位目标。官方文档认为这种方式在动作已知时更快、更可靠。因此，本次实习应当以即时动作为主，把 `aiAct()` 限制在无法提前拆解的局部步骤内。

## 5. 常用能力

| 能力类别 | 主要 API |
|---|---|
| 自动规划执行 | `aiAct()` / `ai()` |
| 视觉点击与输入 | `aiTap()`、`aiInput()`、`aiClearInput()`、`aiDoubleClick()`、`aiRightClick()` |
| 鼠标键盘与滚动 | `aiHover()`、`aiKeyboardPress()`、`aiScroll()`、`aiDragAndDrop()` |
| 定位 | `aiLocate()` |
| 数据提取 | `aiQuery()`、`aiString()`、`aiNumber()`、`aiBoolean()` |
| 等待与验证 | `aiWaitFor()`、`aiAssert()` |
| 工作流 | YAML、Gherkin 场景、缓存、报告、Skills |

详细定义见 `01_Midscene/pages/en/api.md`。

## 6. “少于 10 次”的正确实现

Midscene 官方选项 `replanningCycleLimit` 控制一次 `aiAct()` 内允许的最大重规划循环；默认值为 20，UI-TARS 模型默认值为 40。为了满足“尝试需小于 10 次”，应设置为 9：

```ts
const agent = new PlaywrightAgent(page, {
  replanningCycleLimit: 9,
});
```

但该参数只限制 **一次 Midscene 自动规划任务内部的重规划次数**。系统外层还应单独维护业务流程尝试计数：

```text
单次 aiAct 内部重规划：最多 9 次
完整业务流程重新运行：最多 9 轮
任一达到上限：转 HUMAN_REVIEW_REQUIRED
```

为避免 9×9 的隐性放大，正式执行时应优先使用单步即时动作；一次失败只允许修复当前步骤，不重新自由探索整个业务流程。

## 7. 与 Playwright 官方 Test Agents 的区别

Playwright 官网还提供三种 **Playwright Test Agents**：

- `planner`：探索应用并生成 Markdown 测试计划；
- `generator`：把 Markdown 计划转换为 Playwright Test 文件；
- `healer`：运行测试并自动修复失败测试。

它们属于面向编码助手的测试生成工作流，不是 Midscene 的视觉运行时 Agent。两者可以组合：

```text
DeepSeek 业务规划器
  ↓
Midscene PlaywrightAgent 复刻并采集页面操作
  ↓
生成结构化测试计划
  ↓
Playwright generator/自研生成器生成稳定脚本
  ↓
Playwright healer/自研修复器处理回归失败
```

对应官方页：`02_Playwright/pages/nodejs/versioned_docs/version-stable/test-agents.md`。

## 8. 对本次实习方案的最终建议

### 推荐职责边界

```text
DeepSeek：业务自然语言 → 结构化步骤、风险规则、修复决策
Qwen3.6-Plus：截图理解与 UI 视觉定位
Midscene PlaywrightAgent：视觉动作、查询、等待、断言
Playwright：浏览器控制、DOM Locator、网络等待、Trace、最终回归脚本
```

### 不建议

- 不让 DeepSeek 直接输出屏幕坐标；
- 不把完整交易流程一次性交给 `aiAct()` 自由规划；
- 不把 Midscene 视觉坐标直接固化为最终脚本的首选定位方式；
- 不混淆 Midscene 运行时 Agent 与 Playwright planner/generator/healer；
- 不允许模型在未知弹窗或高风险按钮前继续猜测。

### 推荐执行模式

```text
稳定控件：Playwright Locator
不稳定/Canvas/图片控件：Midscene 即时动作
局部复杂视觉子任务：Midscene aiAct，重规划上限 9
最终脚本生成：DeepSeek + Playwright 模板
稳定性修复：规则引擎或 Playwright healer
```

## 9. Qwen3.6-Plus 配置依据

Midscene 官方模型配置文档明确给出了 Qwen3.6 Plus 的模型名：

```env
MIDSCENE_MODEL_NAME="qwen3.6-plus"
MIDSCENE_MODEL_FAMILY="qwen3"
```

详见 `01_Midscene/pages/en/model-common-config.md`。
