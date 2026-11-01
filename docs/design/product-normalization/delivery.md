---
id: NORM-DELIVERY
title: 候选交付与操作规范
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-08
owner: Codex
---

# 候选交付与操作规范

## 候选环境
默认沿用Windows 11 + Docker Desktop、仓库固定Java/Node/浏览器版本。仅配置唯一BYOK三变量，凭据在本地受控文件中供既有脚本消费，不写入文书。机构Linux/内网尚未确认，不宣称适配。

## 入口
根demo.ps1提供prepare/up/status/run-golden-path/verify/down；CLI现有doctor/session/journey/evidence/release/service入口以实现为准。安装与UAT时记录失败，不用手工改数据库产生成功。生产者登记与demo verify共用Harness验证器，NO_GO/缺证据退出5。报告和Quality只读呈现同一结论。

## 构建、部署与调度

2026-10-12当前工程门：S1/S2已收齐本地隔离源码及双平台空库/真实浏览器证据，远端CI仍未执行。S3四个遗漏依赖/冻结输入已进入ReleaseIdentity，Midscene CLI裁剪及准备/冻结同步完成；身份19/19、隔离Worker27/27和实际新runtime/Chromium通过。两轮空cache下载TLS失败保留，缓存复验不能证明本轮冷下载。受控源码秘密扫描已通过；九锁在线依赖仍失败（80处包版本记录、82条不同公告），声明BOM919组件/22个library许可缺项。source-engineering作业已接真实扫描/失败传播及公开报告白名单，未执行远端。具体发现与修复结果见[依赖修复记录](../../architecture/refactoring/batches/RF-065/dependency-remediation.md)。剩余门通过之前，不生成候选通过摘要或进入正式28项。
目标CI覆盖合同迁移、Java、三门户、CLI/Harness/MCP/Worker及隔离smoke。2026-10-09 RF065 S1-A已实现全产品触发、Java21、三门户构建、共享包测试与固定Agent运行时岗位；配置合同和本地构建通过，不是远端CI或新克隆证明。专属前端lint/unit、隔离smoke、扫描及SBOM仍待对应切片，详见[证据索引](../../architecture/refactoring/batches/RF-065/evidence-index.md)。这些门实际通过后形成版本化产物、SBOM、许可证、配置模板与证据摘要。调度复用经过验证的脚本版本，保持失败接管与不重叠策略；不为演示自动创建真实日程或发送外部消息。

## 数据和恢复

当前隔离源码质量证据：Agent752/752无失败/skip，覆盖58.31/75.12/61.04达到原阈值；共享及门户55项单元、lint/typecheck、三门户build通过，三份生成类型前后不变。所有依赖来自本轮独立空cache，未安装Flowise或读取原状态。银行Java岗位隔离执行、S2空库/业务浏览器和S3扫描仍待，不能标全产品CI/发布GO。

RF065 S1-C1已在独立空cache目录完成四组锁文件安装、SQLite原生ABI、Controller/CLI导入、冻结Chromium官网下载及实际headless内容核验，退出0。工具错配与网络超时失败仍保留；这是依赖准备证据，不是完整源码新克隆或业务页面验收。下一步当前源码隔离构建/回归，之后空库银行与浏览器smoke。

固定工具证据纠正：系统npm.cmd实际硬绑定Node24.15.0，旧前端“Node20”描述无效。已用冻结Node20.20.2直接调用其npm10.8.2 CLI重跑三门户全部质量门，客户9/运营9/质量16及build重新通过。隔离空cache安装独立验证原生ABI与Chromium，不使用原数据环境。

2026-10-09 RF065 S1-B3质量门户lint/typecheck/16项只读API单元/build通过，三门户专属质量入口已齐。生成类型与HEAD存在未提交合同迁移差异，diff门未通过；当前工作树生成幂等通过。下一项隔离新克隆准备，原运行环境不用于冒充复现证据。

2026-10-09追加RF065 S1-B2：运营门户lint/typecheck/9项身份与文档并发API单元/build通过，CI已登记实际命令；质量门户专属检查和隔离新克隆仍未完成。页面与真实服务未作本次运行验收。

当前本地质量证据：2026-10-09 RF065已通过固定Node24覆盖门（原50/70/60阈值，128通过/1既有口径跳过）和客户门户专属lint/typecheck/9项单元/build。其余两门户专属检查及新克隆仍待；没有远端CI回执。详细失败修正过程与命令在同一RF065任务/证据中，不以构建或覆盖率数值代替运行验收。

日常保持现有容器、卷与Docker AI。只定向替换有改动的服务；冷启动与破坏性故障在隔离环境。应用回滚不等于资金回滚，未知操作保留原关联查询；数据库迁移按具体反向能力处理，不默认可逆。操作人员通过Run和业务编号定位证据。

## 交付范围
先本地候选，不自动提交推送、公开Release或投递。README/贡献/安全/行为准则/变更/已知限制与操作说明进入A08；尚未生成的候选包明确待验收。

