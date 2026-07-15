---
id: DOC-FE-DESIGN-SYSTEM
title: 前端设计系统
document_type: reference
domain: frontend
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
related_code: [apps/customer-portal, apps/operations-console, packages/bank-ui-kit]
---

# 前端设计系统

## 技术边界

- React、TypeScript、Vite、Ant Design 是既有门户的唯一基础组件体系。
- 不同时引入 shadcn/ui 或 Tailwind 作为第二套基础组件体系；新平台如需变更必须新增 ADR。
- 页面只消费项目 Token，不依赖本机参考资料库路径。
- 所有交互元素必须具有语义标签、键盘访问、可见焦点和稳定 `data-testid`。

## 品牌与视觉

- 银行产品：“复兴”智能数字银行。
- 测试产品：“衡准”自动化回归测试平台。
- 风格：红、白、黑，严肃、克制、数据优先、可审计。
- 禁止：玻璃拟态、糖果色、蓝紫渐变、夸张圆角、营销 Banner、霓虹发光和无业务含义装饰。

| Token | 值 | 用途 |
|---|---:|---|
| `color.primary` | `#A6192E` | 主操作、当前导航、关键焦点 |
| `color.primaryHover` | `#7F1022` | 主操作悬停 |
| `color.ink` | `#151515` | 顶栏、侧栏、主标题 |
| `color.surface` | `#FFFFFF` | 卡片、表格、抽屉 |
| `color.canvas` | `#F7F7F5` | 页面背景 |
| `color.border` | `#D9D9D6` | 分隔线和控件边框 |
| `color.success` | `#287A4B` | 已完成、已匹配、已批准 |
| `color.running` | `#315A73` | 运行中、处理中 |
| `color.warning` | `#A96D00` | 待审批、风险复核 |
| `color.failure` | `#B42318` | 失败、拒绝、错误 |

## 尺寸

- 顶部导航 64px；运营侧栏展开 240px、收起 72px。
- 客户内容最大宽度 1200px；页面边距 32px；卡片间距 16px；卡片内边距 24px。
- 表格行高 52px；按钮和输入框高 40px。
- 卡片圆角 8px、控件 6px、状态标签 4px；普通卡片不使用悬浮大阴影。

## 字体

- 中文：`PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif`。
- 英文与数字：`Inter, Arial, sans-serif`。
- 金额、ID、时间、哈希启用等宽数字或等宽字体。
