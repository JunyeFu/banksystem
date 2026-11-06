---
id: RF064-READONLY-CAPACITY-20261106
title: 补充只读容量驱动源码闭环
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# RF064-S4：补充只读容量驱动

## 来源与业务目标

已确认N09要求100次固定只读回归/并发2/≤60分钟/至少99次符合预期、Agent并发1/2/4各10次且执行p95≤180秒、2小时平台观察。现有P05只实现一次1/2/4、共7次，未实现这些补充容量。该差距来自正式28项最小场景与扩展非功能目标混为一谈；不能用P05通过关闭全部容量要求。

本片只完成驱动、错误证据和CI离线门；真实模型/银行/2小时实测仍在最终统一构建与身份门之后，不越过RF065安全待选项。保留P05原7任务合同及正式28项数量，不创建第二个发布验证器。

## 三个小任务

1. 从现有P05提取实际只读批次复用；逐个样本仍由公开CLI新会话、同一冻结脚本repeat执行，并调用现有认证/v1/releases:verify的P05单旅程核验取得真实排队/执行时间。100次固定批次并发2；1/2/4三个级别各10个独立任务（共30），不足完整批次的尾部保留实际并发数，不填虚假样本。跨全部130次绑定不得复用，源Journey/Run不重复计数；同一候选/脚本保持。
2. 增加2小时只读托管状态观察，每60秒取实际健康/所有权事实，首尾覆盖完整窗口，记录真实采样时间与环境。没有模型探测、业务动作、服务重启或自动恢复。失败保留已准入任务/原因、排空当前批次并停止后续准入；队列/执行分别计量，缺时间不填0，失败不从样本删除。100次窗口含排队/证据写入，不含初次作者化和随后2小时观察。
3. 接入现有rf057-bank.ps1的ReadOnlyCapacity profile及rf057-agent.mjs，只执行A01取得真实已验证源与补充容量，不执行A02/资金或A07文档写入。容量JSON作为既有报告工件封存，无额外正式case/GO路径；原身份授权、source漂移与清理回执继续适用。新合同由现有registered入口执行，不增加运行时Mock或新依赖。

## 白名单与约束

scripts/test/rf057/{agent-capacity.mjs,agent-capacity.test.mjs,readonly-capacity.mjs,readonly-capacity.test.mjs}、scripts/test/{rf057-bank.ps1,rf057-agent.mjs}；平台scripts/verification/rf064-readonly-capacity.test.cjs及test-manifest.json；RF064 batch/slices/S4.yaml/tasks/S4.md/evidence-index.md、本包、唯一顺序/backlog，必要时仅同步外部站点现有assessmentNote或README。预算16文件/4新增/700行，0公开API/迁移，打开模块限测试驱动与治理。原银行/Agent不重载，不安装依赖；新驱动与注册清单均属于身份输入，最终需统一冻结/完整回归。

## 验证与完成门

先源码确认后按TDD技能做已观测缺口的红→绿：100次/并发边界、30次真实标记、分位数/超180秒、失败排空/不准入、跨批重复绑定、时间窗、2小时钟/失败采样、既有P05保持。时间与CLI/Harness仅在CI测试进程替换；生产入口固定真实依赖。补PS解析与profile隔离合同、registered发现/实际包装、RF064/RF065治理/docs。验收导向复审后仅移交REVIEW，S4真实容量/候选复现/UAT仍待，不把合同或合成输入当实测性能。

## 实施回执与复审

源码已实现并接入powershell -File scripts/test/rf057-bank.ps1 -Profile ReadOnlyCapacity。该profile先核现有身份授权，沿Agent只读临时身份准备与清理，不走银行黄金转账或五组资金样本准备；真实A01取得同身份已验证源，然后130次新会话/新Journey/Run/Task复用同一冻结脚本。100次为50个并发2批次；后续1/2/4级别各10任务，4级别尾批实际2任务。真实CPU/OS/内存环境、队列/执行p95及各原始样本分别保存，不能宣称4个浏览器同时执行。2小时只读观察复用managedStatus的所有权/loopback健康探针，每60秒采样，未增加doctor/模型探测、恢复或服务停止。

新容量JSON沿既有工件封存和清理回执绑定，publicationDecision固定NOT_EVALUATED；正式报告仍只有A01，不新增P05通过或扩28项。P05原7任务输出/同身份账本核验保持。确定性失败仍排空本批并停止后续准入；既定99/100是健康比例目标，不允许未完成100次就用比例分母缩小冒充通过。失败、未知时间和实际终止原因保留。

合同先因缺readonly-capacity模块失败；实现后通过。验收导向复审补了一项实质时间错误：第三次状态读取抛错时原实现保留60000ms旧健康时刻，反例要求实际120000ms；现记录失败采样的真实时刻/错误后传播，不吞异常或重试。启动会话失败也明确封存0准入/原依赖错误，不伪造Run。固定时窗包含批次/证据写入，跨批重复绑定立即停止，不累计成130次独立任务。

当前直接相关矩阵34/34（其中P05+补充容量14项）无失败/跳过；Windows PowerShell5.1实际解析通过，Node24父驱动语法通过。新registered包装1/1真实调用同一矩阵，TAP在agent/runs/rf064-readonly-capacity-20261106/registered-wrapper.tap；首次清单插入位置报TEST_MANIFEST_NOT_SORTED，移至正确排序后发现112注册/108当前CI/2治理运行时/2历史，无排除新增合同。原Harness发布/报告/资金/性能回归33/33也通过（39.156s），包含真实隔离HTTP与临时SQLite，不是原服务或银行LIVE。治理RF064/RF065、docs、diff通过。

复审确认只读与正式资金/文档分支分开，原验收报告只按cases计算；补充JSON不能自行发布GO。新脚本目录及test-manifest均受既有ReleaseIdentity输入覆盖，因此最终源码/依赖/镜像收口后仍须完整回归、统一冻结再跑真实清单与本profile。本轮只用测试进程的合成CLI/Harness事实及快进时钟，不代表130次真实运行或2小时实测已通过。

原15银行容器ID/运行状态与既有基线保持，原Agent三个PID及外部站点PID55848存活；没有安装依赖、读取原账务/笔记、启动原服务或运行银行/模型/压力命令。本片移交REVIEW，S4整体仍IMPLEMENTING；真实容量、隔离候选、UAT及RF065风险/统一身份/正式28项/远端CI仍待，整体NO_GO。
