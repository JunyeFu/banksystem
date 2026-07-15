---
id: DOC-FE-VISUAL-ACCEPTANCE
title: 前端视觉验收标准
document_type: how-to
domain: frontend
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 前端视觉验收标准

## 分层验证

1. Token 和组件静态检查。
2. Storybook 覆盖可独立渲染的共享基础组件之正常、加载、空、错、禁用、无权限和提交状态；依赖路由、查询缓存或业务 Provider 的组合组件使用确定性页面 Fixture 覆盖同等状态，不能用脱离真实依赖的静态 Story 冒充。
3. 前端单元测试验证状态映射、权限可见性和格式化逻辑。
4. 契约测试验证 Mock 与 OpenAPI 一致。
5. Playwright 验证登录、转账、审批、回归执行和证据查看等真实流程。
6. 固定 Windows、浏览器版本、视口、字体和测试数据生成视觉基线。
7. 人工对照 PV 设计参考，审查信息层级、金融语义、可访问性和高风险操作。

当前共享状态组件位于 `packages/bank-ui-kit/src/state-components.tsx`，Storybook 状态位于 `packages/bank-ui-kit/src/BankPageState.stories.tsx`。路由组合状态由 `tests/e2e/frontend-*` 覆盖；1180×800 窄桌面基线分别保存在客户核心、运营总览和衡准平台套件中。

## 通过条件

- 无水平溢出、遮挡、重叠、乱码和不可见焦点。
- 1440×900 主基线和至少一个窄桌面视口通过。
- 动态时间、随机 ID、光标和动画在截图前固定或遮罩。
- 差异不能仅以像素阈值自动批准；金额、状态、审批和错误信息必须人工复核。
- 每个失败保留 actual、expected、diff、Trace 和对应用例编号。
