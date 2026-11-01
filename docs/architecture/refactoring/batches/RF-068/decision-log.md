---
id: RF068-DECISION-LOG
title: RF-068 Decisions
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Decisions

2026-10-19: split visual frontend from backend modules. User approved the design, then chose waiting for Figma connection restoration. Do not implement against a screenshot-only substitute or ask for design approval again.

2026-10-19 用户要求进一步规划前端接入。仅文档细化：原S1全界面、S2全验收尚未实施，因此拆为入口/历史/对话/模型/实机五切片，旧S2编号现在代表历史，原验收职责移至S5；历史证据保留，未回写产品完成状态。三个批次的顺序仍只有唯一实施顺序文件定义，backlog新增五个粒度明确的工作项。

RF068预算从24/18/3500调整为36个变更文件/30个新文件/6500行，覆盖五份任务/切片、生成客户端、独立入口、约八个职责组件、单元与浏览器验收文件；不增加合同/迁移额度、不放宽两模块上限，实际实现仅打开现有前端模块。RF066/S067沿用各自预算。不是增加新UI框架、Agent引擎或并行路线图。

代码核对发现附件上传/证据代理、就绪原因和结果语义的接口缺口，明确归RF066-S2加法合同；持久化、去重和分页归RF067。前端不裸连Harness、不解释私有推理、不凭COMPLETED猜测试通过。单图是当前真实生产路径，不能把数组支持误称多文件能力。

## S1 implementation decisions 2026-10-21

S2入口预算调整：S1精确字体/许可和Figma图标已经占用基础资产预算，S2还需Sidebar、消息页、实际消费的合并/分组辅助与测试、独立浏览器文件及三枚历史状态图标。累计文件上限由36/30调整为48变更/34新增，行数6500不变；仅既有前端模块，无合同/迁移增额，不增加运行时依赖或并行路线图。

S2职责：Sidebar拥有列表的查询/游标，History拥有正文的游标/阅读位置，App拥有URL、创建请求的忙碌/错误状态与导航裁决。创建状态放在稳定父层，避免响应式切换卸载Sidebar后解锁第二次提交；迟到创建回执不覆盖新选择。客户端仅将CSRF保存在页内，用请求代次阻止并行403或旧bootstrap恢复过期绑定。主入口将服务裸origin正规化为/agent/，不新增跨源代理或旧控制面。

- Figma Full账户原生2:60/61/65上下文与截图已重新读取；沿用已确认设计，不以新生图或本地猜测代替。品牌复用原有favicon SVG，九枚功能图标为Figma原始资产，不重画。
- 缺少精确字体，增加本地Noto Sans SC Regular及原OFL文本，构建同时携带许可证。仅增加构建工具yaml@2.9.0，npm在应用目录以ignore-scripts同步锁文件；未安装系统字体、第二组件体系或全局运行时。
- S1只开放草稿填入、侧栏开合、设置/重连及Quality真实只读地址；历史、发送、附件、模型选择按S2–S4实现，不能用Figma样例制造已连接/已执行。缺少模型时显示真实NOT_READY与后台原因，配置/凭据未查询时不显示“已登记”。
- 样式按Agent根及弹层/抽屉根隔离；沿用Ant Design Drawer处理移动侧栏焦点和Escape，不手写第二套模态交互。14px/400/22px覆盖可见正文和控件；没有放大/加粗特殊节点。
- JSON客户端只接受生成合同中JSON操作，二进制上传/下载留S3专用传输；不把二进制错误当JSON成功。CSRF仅页面内存，403失效且无POST重放/自动重连；无token持久化。
- /agent/资源与agent.html的静态接缝修复归RF066-S2 BE-C06，未在前端改base、开跨源代理或改执行语义。浏览器测试归前端tests/foundation.browser.cjs并由共享Browser/Foundation选择器执行，不混进仅安装Harness依赖的通用Node单测清单。

