# I10 Flowise Agentflow v6 本机收口

## 权威运行链

`PREPARE.cmd` 只调用 `scripts/build-i10-agentflow-v6.cjs`；v5 仍作为回退制品，不能被 PREPARE、START 或发布脚本当作当前流发布。v6 构建完成会将发布清单切换为 `BUILT_NOT_PUBLISHED`，只有 `START.cmd` 中的公共 API 发布与导出回读一致时才会写入 `deployed=true`。

Harness 首次启动时应用 SQLite 迁移；PREPARE 只校验迁移输入，不宣称已迁移。当前 v6 需要迁移 033：`i10_verification_attempts` 为追加式审计表，禁止更新和删除。

## 图片与验证边界

图片链是纯 OCR：本地 OCR 提取文本，主控模型只筛选已提取事实，用户确认后删除原图。该链不调用视觉模型作为 OCR 兜底。

普通登录案例使用 `VerificationPolicyV2.NONE`。仅转账首次确认可进入 `AUTO_PERSISTED_UKEY`：先观察是否已到单号页；若在网页验证页，进行最多三次独立视觉定位/点击尝试，每次都记录页面指纹和结果。三次耗尽后才可能创建人工挑战。系统不输入 PIN、OTP、验证码，也不操作原生 U 盾窗口。

`EXTERNAL_CONFIRM_REQUIRED` 任务必须从一开始使用可见 Chromium 会话；无可交互桌面时失败关闭。对话中的 proceed 只表示用户已完成页面操作，Worker 必须重新验证页面状态。

## 本机验收口径

文件完整性、构建、静态合同和发布回读不等于三入口真实 E2E。只有自然语言、文件、视频及其图片组合分别生成脚本、经 Midscene/Builder/Playwright 2×2 验证、交付源码、执行调度并完成受控修复闭环后，才能写入 `I10_FLOWISE_LOCAL_ACCEPTED`。
