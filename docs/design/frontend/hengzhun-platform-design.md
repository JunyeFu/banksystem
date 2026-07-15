---
id: DOC-FE-HENGZHUN-PLATFORM
title: 衡准自动化回归测试平台前端设计
document_type: reference
domain: frontend
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
related_code: [apps/quality-case-portal]
---

# 衡准自动化回归测试平台前端设计

## 设计输入与边界

衡准没有包含在 PV-0001—PV-0201 银行页面预览包中，不占用银行 PV 编号，也不以错误标注的银行截图推导平台页面。其权威输入为 B0—B7 实施批次、前后端契约矩阵和本设计。生产页面只消费 `/api/quality/v1`，接口不可用时显示错误与重试，不用演示数据冒充真实运行结果。

## 信息架构

| 路由 | 页面 | 批次 | 核心状态与操作 |
|---|---|---|---|
| `/quality/dashboard` | 平台总览 | B0—B7 | 服务健康、用例、运行、验证、事件、发布门禁 |
| `/quality/cases` | 质量用例 | B1 | 搜索、状态筛选、创建、版本、提交审核 |
| `/quality/cases/:caseId` | 用例详情 | B1—B3 | 输入、步骤、基线、证据、版本时间线 |
| `/quality/baselines` | 基线中心 | B1—B3 | 待审核、批准、驳回、哈希与差异 |
| `/quality/runs` | 回归运行 | B3—B4 | 排队、运行、暂停、完成、失败、验证结果 |
| `/quality/schedules` | 定时计划 | B4 | Cron、环境锁、启停、最近/下次运行 |
| `/quality/incidents` | 失败与恢复 | B4、B7 | 事件分级、根因、恢复路径、重新验证 |
| `/quality/knowledge` | 知识与作者化 | B5—B6 | 知识版本、脱敏、Plan、脚本验证、模型边界 |
| `/quality/releases` | 交付中心 | B7 | Benchmark、证据包、备份恢复、发布门禁 |

## 交互与视觉验收

- 使用 React、TypeScript、Vite、Ant Design 和共享品牌 Token；不得引入第二套组件体系。
- 红、白、黑为主，蓝色只表达运行中；页面以数据、状态、时间、哈希和审计关系为中心。
- 所有页面实现 loading、ready、empty、error；写操作还实现 submitting 和服务端冲突提示。
- 所有按钮、链接、筛选和表格行具有语义标签、键盘访问和稳定 `data-testid`。
- 视觉基线使用 `HZ-0001` 起的独立编号；因无衡准预览图，多模态验收以本设计和设计系统为对照，不能声明像素复刻。
