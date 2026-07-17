# Worker

本模块将承载验证过的 Playwright 正式执行和受控的 Midscene 作者化。正式定时回归只允许运行 `SCRIPT_VALIDATED` Playwright 脚本。

I3 已提供独立的正式 Playwright Worker。Worker 只通过 Harness 内部租约接口领取任务，按凭据别名从运行态环境解析合成账号，并为每个 `runId` 创建独立 BrowserContext。正式脚本不调用 LLM 或 Midscene；Midscene 作者化仍留在 I4。
