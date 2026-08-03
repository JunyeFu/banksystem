---
id: DOC-FE-HENGZHUN-PLATFORM
title: 衡准自动化回归测试平台前端设计
document_type: reference
domain: frontend
status: accepted
authority: normative
version: 1.1
effective_date: 2026-07-20
owner: project-owner
related_code: [apps/quality-case-portal]
---

# 衡准自动化回归测试平台前端设计

## 设计输入与边界

**状态：暂缓，不构成当前实现授权。** 衡准没有包含在 PV-0001—PV-0201 银行页面预览包中，不占用银行 PV 编号，也不以错误标注的银行截图推导平台页面。恢复实施时以 Flowise/SQLite/HiAgent 当前架构、只读观测契约和本设计为准；不得把既有前端、浏览器夹具或旧 B0—B7 方案当作有效需求。

衡准不是 Coze Agent 的配置、知识、案例、脚本、基线、调度、恢复或审批入口。所有用户写入与任务控制都在 Coze 中完成，再由 Harness 受控执行；衡准只读取 Harness 观测投影。

## 信息架构

| 路由 | 页面 | 状态 | 可展示内容 |
|---|---|---|---|
| `/quality/dashboard` | 平台总览 | 暂缓 | 环境健康、通过率、证据完整率、发布质量门 |
| `/quality/cases`、`/quality/cases/:caseId` | 案例观测 | 暂缓 | 已执行案例的标识、版本和关联证据；不得创建、编辑或审批 |
| `/quality/baselines` | 基线观测 | 暂缓 | 已验证基线的版本、Hash 和差异摘要；不得审批 |
| `/quality/runs` | 回归运行 | 暂缓 | 运行状态、稳定性、耗时和断言摘要；不得启动、暂停或重试 |
| `/quality/schedules` | 定时计划 | 暂缓 | Schedule 状态、最近/下次运行；不得启停或修改 |
| `/quality/incidents` | 失败与恢复 | 暂缓 | 失败分类、证据和已验证修复候选；不得选择恢复或激活 |
| `/quality/knowledge` | 模型与工具观测 | 暂缓 | 仅显示脱敏后的知识版本引用、模型/工具耗时；不管理 Coze 知识或 Workflow |
| `/quality/releases` | 交付中心 | 暂缓 | 发布质量门、证据包和恢复演练结果 |

## 交互与视觉验收

- 使用 React、TypeScript、Vite、Ant Design 和共享品牌 Token；不得引入第二套组件体系。
- 红、白、黑为主，蓝色只表达运行中；页面以数据、状态、时间、哈希和审计关系为中心。
- 所有页面只实现 loading、ready、empty、error 和只读详情；不得出现提交、审批、启停、重试、恢复或激活控件。
- 所有按钮、链接、筛选和表格行具有语义标签、键盘访问和稳定 `data-testid`。
- 视觉基线使用 `HZ-0001` 起的独立编号；因无衡准预览图，多模态验收以本设计和设计系统为对照，不能声明像素复刻。
