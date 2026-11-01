---
id: RF068-TARGET-DESIGN
title: RF-068 Target boundary
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Target boundary

Own the separate Agent entry inside quality-case-portal and browser acceptance. Preserve /quality/ and its GET-only APIs. Consume RF066 generated contracts; do not change Controller/Harness behavior in the UI batch. All 14px Regular/22px typography, icons, palette, history/composer/menu/configuration surfaces follow approved Figma v2.

## 界面入口与能力归属

| 用户区域 | 保留的核心操作 | 数据/接口来源 | 不能由前端代做 |
| --- | --- | --- | --- |
| 左侧栏 | 新对话、搜索、历史分页、选择对话；底部设置 | create/list/getAgentConversation | 不能用CLI检查点列表充当聊天记录 |
| 中央会话 | 用户目标、Agent摘要、真实事件、缺输入、失败、结果 | submitAgentMessage/getAgentTurn，Harness权威结果 | 不实现工具调度、私有推理展示、测试判定或新执行账本 |
| 底部输入区 | 单图、输入/发送、停止、下一任务模型选择 | 附件安全回执、submit/cancel、模型安全元数据 | 不提交磁盘路径，不刷新重跑，不把停止当账务撤销 |
| 模型页 | 显示名、model ID、Base URL、密钥输入、检查、保存/默认 | list/create/update/check/setDefaultAgentModel | 不保存明文到浏览器持久层，不临时换备用模型 |
| 证据抽屉 | 当前任务工件与只读下载；Quality入口 | RF066-S2待冻结的turn证据合同与受控代理 | 不直连数据库/Harness内部接口，不暴露token/本地路径 |
| 设置弹层 | 服务就绪/阻断原因、当前身份、模型配置与Quality | bootstrap及只读元数据 | 不堆叠用例、调度、发布CRUD入口 |

用例设计、执行编排、调度与结果核验继续由已有Agent能力调用；本批不新增管理后台。未实现的意图明确提示不支持，不用页面假卡片承诺已完成。

## 接入状态与UI语义

| API事实 | 用户可见行为 | 禁止误报 |
| --- | --- | --- |
| NOT_READY / 403 | 保留可读历史，显示安全阻断原因、配置/重连入口；不重放写入 | 不宣称已选模型即可运行 |
| IDLE / 无消息 | 空会话提示目标输入 | 不填充Figma样例对话 |
| RUNNING | 真实事件、当前任务绑定、停止入口 | 不用计时动画模拟步骤成功 |
| NEEDS_INPUT | 明确缺失项，下条输入续接原任务 | 不换Journey、不换原模型、不补猜金额 |
| STOP_REQUESTED | 仅表示已请求停止，继续读回 | 不等同CANCELLED、转账回滚或Worker已停止 |
| INTERRUPTED / 未知 | 原执行引用、人工介入原因、只读查询 | 不隐藏异常或自动重跑 |
| COMPLETED | 按后台受限result区分“回复完成/测试通过/未执行” | Controller回答完不能制造PASSED或GO |
| FAILED | 原因、实际证据、人工介入要求 | 不自动修复后续写旧任务为成功 |

## 视觉与模块边界

页面只有一个Agent根，React/TS/Vite/Ant Design不变；单独agent.html与dist-agent，原Quality入口与dist保留。计划组件：AgentApp、ConversationSidebar、ConversationView、Composer、TurnProgress、EvidenceDrawer、ModelPicker、ModelConfiguration；实际共享仅提取已出现的共同逻辑，不建组件插件体系。

统一Noto Sans SC Regular 14px/22px，不放大/加粗特殊节点。桌面侧栏248px、内容及输入列832px；背景#171B21、侧栏#12161C、表面#20262F、选中#262E39、边线#343D49、正文#EFF1F5、辅助#B7BECA/#929BAA、品牌#A6192E。手机侧栏折叠为可关闭抽屉，输入区和模型选择不挤出视口；错误、焦点与滚动仍可操作。

Figma节点映射：主屏2:60、空屏2:61、运行2:62、失败2:63、完成2:64、设置2:65、证据6:885、配置11:1017、菜单12:1201。实施相应视图前须读取原生完整上下文与截图，复用精确资产；已取主屏/配置不代表其余节点已读取。模型/人物/业务数值为示例，生产只显示真实数据。

