---
id: DOC-FE-COMPONENTS
title: 前端组件目录
document_type: reference
domain: frontend
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 前端组件目录

| 组件 | 责任 | 禁止承担 |
|---|---|---|
| `AppShell` | 应用壳层和内容布局 | 业务数据加载 |
| `SideNav` / `TopNav` | 路由导航和权限可见性 | 后端授权判断 |
| `PageHeader` | 标题、面包屑和页面操作位 | 执行业务操作 |
| `FilterBar` | 筛选输入与查询状态 | 保存业务实体 |
| `DataTable` | 分页、排序、空/错/加载呈现 | 拼接未声明接口 |
| `StatusTag` | 状态到文本和颜色映射 | 发明新状态 |
| `MetricCard` | 紧凑指标显示 | 伪造统计数据 |
| `EmptyState` / `ErrorState` | 空态和可恢复错误 | 吞掉错误码 |
| `ApprovalDialog` | 审批理由、确认和提交状态 | 绕过 Maker-Checker |
| `ReasonDrawer` | 风险、失败和人工理由 | 保存敏感凭据 |
| `EvidenceTimeline` | 证据、事件和哈希链展示 | 修改证据 |
| `RunStatusPanel` | 回归运行和验证状态 | 直接控制 Worker |

所有组件必须提供 Storybook 状态、键盘交互、稳定测试标识和错误边界。跨页面共享状态必须有单一所有者。
