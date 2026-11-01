---
id: RF068-VERIFICATION-PLAN
title: RF-068 Verification
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.1
effective_date: 2026-10-23
owner: Codex
---

# RF-068 Verification

Run frontend lint/typecheck/unit/build:agent and the Browser/LiveReadOnly scopes listed in [shared verification](../RF-066/verification-plan.md). Record Figma-versus-browser fidelity at native size and mobile. LiveReadOnly remains subject to current identity and readiness; no formal-28 or release GO claim.

## 任务包验收矩阵

| 任务包 | 独立选择器 | 核心反例 | 必留证据 |
| --- | --- | --- | --- |
| S1入口 | Browser/Case Foundation | 无模型、服务未就绪、403、Quality不被替换 | 两构建、客户端漂移检查、主屏/窄屏截图 |
| S2历史 | Browser/Case History | 空/错/无结果、同名分页、快速切换、刷新 | Harness分页对应、切换/刷新增加0次执行 |
| S3对话 | Browser/Case Conversation | 重复/丢响应、缺输入、停止竞态、断连、坏附件/无权工件 | submission/turn/Journey/Run关联、真实事件与失败截图 |
| S4模型 | Browser/Case Models | 空密钥保持、错误端点、409、保存与默认部分失败、运行中更换 | 安全元数据、版本绑定、菜单/配置实图 |
| S5实机 | Browser/Case All + LiveReadOnly | 进程重启、旧身份、结果未知、确定性失败即停 | 实机只读BYOK、独立复审、原服务保留与视觉对照 |

所有包运行前端lint/typecheck/unit、原Quality build、新build:agent与生成客户端检查；全局控制只运行适用治理/docs。规划时选择器尚未实现；截至2026-10-22，Contract、Integration、Browser/Case Foundation、History、Conversation、Models、All及LiveReadOnly均已有入口，generate:agent-api/check:agent-api/build:agent可执行。LiveReadOnly首次实机运行失败，不再标为NOT_IMPLEMENTED，也不因入口存在或隔离通过就视为LIVE完成。

视觉验收使用1440×1000及390×844，比较字体/几何/颜色/图标/布局至少五项，并覆盖键盘、焦点、滚动和移动侧栏。用真实截图与已确认Figma并排审阅；功能测试通过不替代视觉一致性。异常态可在隔离测试中产生，运行产品不得加载fixture/mock分支。

真实密钥不进入截图、trace、请求导出或测试报告；真实模型使用已有环境绑定，表单密钥反例仅在测试进程用合成值。LIVE必须核对当前身份授权和依赖就绪；S5已获新身份冻结、托管启动和只读BYOK授权，最终冻结须在全部源码/构建修改后执行，不转账/改日期，不把历史14/30项或本批浏览器通过算作正式28项通过。

2026-10-23当前复审和新增反例见[成组修复方案](S5-repair-plan-20261023.md)及[evidence-index](evidence-index.md)。修复后追加8个缺陷/验收缺口的正反测试，并保留停止期间dispatch=0的已通过反例；所有通过谓词使用turn的PASSED与独立proof的VERIFIED各自定义。重启不重放读取原Journey的完整执行引用，不能比较最多200条的Quality列表长度。S5专用账户目标断言必须读取Agent自身工件，不用驱动自己的银行快照代替。

## 2026-10-23 修复后实际验证

按[执行回执](S5-repair-execution-20261023.md)，合同19/19及新增专项9/9、集成39/39及runtime1/1、前端44/44、CLI75/75、Browser5/5、lint/类型/生成API/双构建通过。另有真实AccountList渲染配原Worker DOM采集的仓外隔离契合检查通过，不作LIVE。三批治理与docs通过。

源码收口后冻结H=`0d9a22b1d5c40a61cf414e094c34d75303709ee080bdca8845d4f1b8e54ba196`并备份、托管启动；原银行数据不动。Docker/银行环境前置门未就绪，真实验收NOT_RUN，S5 BLOCKED。恢复后同入口LiveReadOnly从起点执行，首次确定性失败停止并记录实际根因；旧失败报告保留。前端主JS654.33kB/gzip211.83kB提示保留。

