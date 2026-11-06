---
id: DOC-AGENT-INTERVIEW-REPAIR-EVIDENCE-20261105
title: 面试审计修复、会话切换与真实只读验收
document_type: reference
domain: platform
status: active
authority: evidence
version: 1.0
effective_date: 2026-11-05
owner: project-owner
---

# 面试审计修复回执

## 范围

用户“按顺序完成”授权执行[逐项修复方案](../../architecture/refactoring/agent-interview-repair-plan-2026-11-05.md)。基线 `main@e67fd4c`，保留原脏工作区，不提交或推送。实施顺序沿唯一顺序文件，任务状态只查 backlog 的 `BANKSYSTEM-INTERVIEW-AUDIT-REPAIR-001`。

## 修复与直接证据

| 问题 | 实际变化 | 验证 |
| --- | --- | --- |
| F03 凭据入口 | CLI start/author/continue 在会话与模型之前复用 Harness 敏感文本合同 | 明确秘密被拒绝；模型/MCP 调用为零，正常凭据引用保留 |
| F01 资金参数 | 按字段提取用户明确输入，金额用整数分比较；缺失/冲突不给可执行转账值 | 余额不能冒充转账金额；错误付款账户/收款人被拒绝；等值金额通过 |
| F09 发布清理 | 父子共享 runId；v2 回执记录拥有资源、真实清理结果与失败；报告封存 cleanupSha256 | 合法报告通过；错 run/身份、资源缺失、矛盾、篡改均拒绝；正式28项缺项为NO_GO |
| F04 共享会话 | Harness SQLite 045 单行保存密文与 revision；专用非模型 MCP；条件写和一次性迁入 | 两个真实Node进程竞争只有一个成功，另一方明确冲突；重复创建、分页与隔离迁入通过 |
| F02 模型错误 | 实际SDK区分401/403/429/5xx、传输、超时与取消；安全码传播到会话 | 本地HTTP每场景调用一次；网页保留类型码，不输出供应商正文 |
| F05 输出预算 | 唯一JSON模型适配器明确8192上限 | 实际SDK HTTP包有正整数上限8192，非只检查配置对象 |
| F06 图像来源 | 空、未知或混合无效引用明确失败，不补第一张图来源 | 单/多图合法引用保留，非法引用给 I10_IMAGE_FACT_PROVENANCE_INVALID |
| F07 图像重试 | 移除空facts后的隐式第二次模型调用 | 空结果只调用一次，保留真实usage并走原失败路径 |
| F08 下载取消 | HTTP提前断连→应用→元数据/证据MCP→下载许可→fetch/响应体 | 许可、响应头、响应体三个真实HTTP挂起阶段都可终止；正常下载及origin固定不变 |
| E01 媒体环境 | 按冻结摘要安装FFmpeg 9.0.2；二进制不提交 | 固定版本/摘要/许可证核对通过，实际解码及图像回归不再被环境遮挡 |

会话密文原101份最大25613字节，未扩大既有全局请求预算。专用合同封套120KiB/回包128KiB；大封套明确失败，不截断、不双写、不回退。Controller 仍做 CurrentUser DPAPI，Harness 不解密。OperationStore、ModelKeyStore 未被迁移。

## 验证记录

证据目录 `agent/runs/interview-repair-20261105/`。以下集合有重叠，不相加宣称唯一测试总数。

| 证据 | 结果及级别 |
| --- | --- |
| cli-controller-final.tap | 86/86；CLI/Controller、真实SDK本地HTTP、DPAPI与隔离双进程MCP |
| audit-r2.tap | 12/12；第二轮反例与现有MCP/下载目的地边界 |
| download-native.tap | 42/42；真实HTTP断连、正常下载及相关既有适配器 |
| image-full.tap | 12/12；真实FFmpeg/ONNX及图像合同 |
| release-final.tap | 34/34；清理摘要生产者与唯一验证器，包括真实28项缺项拒绝 |
| cleanup-producer/ | 原PowerShell清理函数在测试进程的成功/失败两例；无网络、无真实凭据 |
| cas-repository.tap | 22/22；SQLite CAS/分页/归属及生产接线、错误传播 |
| workbench-contract.log | 19+12通过；HTTP/客户端及既有验收合同 |
| workbench-integration-v2.log | 41+2通过；隔离Harness/MCP/Controller与托管运行边界 |
| release-identity.tap | 20/20；含源规则、编译规则的虚拟字节变化均改变身份，未修改原制品 |
| readonly-plan-v2.tap | 94/94；真实LIVE反例及既有动作编译/浏览器回归 |
| observation-context-final.tap | 97/97；导航上下文、真实浏览器Skeleton等待、字段缺失/错误币种反例 |
| observation-navigation.tap | 98/98；缺少账户页导航时的编译展开、已有导航不重复及适配器边界 |
| acceptance-diagnostics.tap | 5/5；安全异常类型、传输原因与既有验收断言 |

Java/银行前端未改动，未为本批重跑无关Java全仓测试。TypeScript编译、RF057/066/067治理及文档校验通过。复审为同一执行者另轮按反例与接缝复读，不称独立第二人审查或人工验收。

## 原状态保护与运行切换

原银行15个容器保持运行，不执行down/reset、不删卷、不推进Fineract业务日期。仅重载自有Harness/MCP/Worker与网页。原有101份.hzs与index保留；原库44的备份为 `.data/sqlite/offline-backups/rf068-s5-8dd43e9a-1a05-44a9-b8d7-bbbe296cda0a.sqlite`，其SHA256为 `86a1713f195351fce2f7b06982c23f9eeed3d1a918a4c41a2057619603c0aff0`。

045切入后导入101份旧密文，原文件前后合并摘要一致：`30a1035657e30ed0885be7ab87d895b76cd7d5f7c3c07ee19d10f8c9e7a4b866`。实际导入回执 `agent/runs/interview-repair-20261105/session-import.json`；新运行只读写SQLite会话，不从原文件回退。

## LIVE发现与后续修复

1. `f093860c…27598f` / `df116025-7686-4146-a508-50a3a7936256` 在银行基线失败，后续验收停止。旧脚本仅保留通用错误码，原异常根因无法确证；独立真实SSO/账户读取/余额一致性复现正常。补充不含正文/凭据的异常类型、网络类别及失败操作，未扩大超时或隐藏重试。
2. `f94ce35e…c6de01` / `96c86923-0bf2-4d0b-8cda-afdeada3d264` 全只读S5通过。复审发现新共享规则的编译副本未纳入身份，补齐摘要覆盖后，该中间身份不作最终证据。
3. `ba8c86cc…102e08e` / `ac6c3d2d-6b88-48b3-a07e-e15d6e3f3148` 在作者化act_10失败。现场指令“保持当前账户列表页面，不进行转账、不提交业务申请、不修改资料或日期”被误编成click。原诊断定位到DYNAMIC_010；这是编译器约束/停留语法漏识别，不放宽Worker视觉匹配。完整反例转绿；禁止条款进入invariants，停留变为expectVisible，显式点击不变。
4. `58c90802…5c3e82a` / `d8cc2ce0-dd21-44be-8d22-294e4aafa26b` 的脚本执行通过，但独立目标证据断言以RF068_ACCOUNT_ROW_NOT_PROVEN拒绝。命名运行的DOM只有52个节点、0个tr；网络200只代表响应头，不能证明表格已渲染。动作“只读核对账户、人民币余额和账户状态”缺少前一导航的“账户列表”上下文，未绑定已有bank-account-fields，只核对到了标题。修复编译器的当前导航上下文及Worker字段观察前就绪等待；现有字段断言、完整行摘要验证都保留。97项回归含真实Skeleton→数据渲染验证通过，不改银行页面。
5. `fac45c7a…3b11dad` / `edad4296-edff-4e3c-9f68-cc68f66759c5` 的新就绪门以BANK_ACCOUNT_VIEW_NOT_READY正确拒绝。该候选登录后直接观察账户列表，没有导航；诊断最后路径为/portal/dashboard。这不是增加等待就能解决的问题。编译器仅对冻结银行适配器的明确字段观察，沿用登录展开方式生成一次受控账户列表导航；已有导航不重复，未绑定适配器不套用，仍由Midscene定位、Playwright执行，不按失败触发修复。
6. 最终身份 `1c76996e8bbc8ab8da2b13ad6e055603fd616122ef1b3a62deb482b7dca3e94d`，冻结回执 `.data/rf068-s5/f9da87fe-2505-4505-be57-8925f951c3f0/`，`node-v24.19.0-win-x64/node.exe scripts/test/rf068-workbench-live.mjs`退出0。报告 `agent/runs/rf068-s5/c0030e10-85f6-4d91-85a0-7c4944e8038c/report.json` 为LIVE_E2E/PASSED，前后身份一致，十个阶段全部通过，9张截图，浏览器无错误/警告。

终态 Journey 为 `journey_5c8cd314-c881-4ac9-aa2e-41c0aef62941`，Run 为 `run_58cf3411-86fb-4c59-9f13-9b71e83268d3`，Task 为 `task_c16dfd67-ee3b-4b90-9c98-98b055c48c67`。真实模型与浏览器执行已完成，DOM/网络/账本证明2条完整账户行、CNY、ACTIVE及余额；银行前后账户/流水快照摘要一致，未请求银行业务写入。刷新四次、网页托管重启、历史恢复、模型菜单/配置、窄屏全部通过，原Run仅一次领取、未重派。

末次只读核对：自有Harness/MCP/Worker健康且身份一致，SQLite45/45，无活跃任务或调度；网页运行，原银行15容器持续运行。SQLite有106条会话（含导入的101条），原.hzs与index合并摘要仍等于导入前值，无运行时文件双写。

原失败与中间成功不改写；不拼接不同身份的证据。正式28项、RF065镜像/许可/远端CI及整体GO仍按各自原门验收，本回执不将它们标为完成。

## 本地空间

收口检查仅覆盖本批指定输出、固定媒体、六个实机目录与六份被冻结回执引用的恢复备份，共117个文件、843505453字节，约844MB，无单项超过1GiB。均有验证、失败证据或恢复用途，未永久删除、隔离或清理缓存，释放空间为0。
