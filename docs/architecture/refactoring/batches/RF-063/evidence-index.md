---
id: RF063-EVIDENCE-INDEX-MD
title: RF063 evidence-index.md
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-02
owner: Codex
---

# 证据索引

## 2026-10-09 发布真实性增量

A04/A07 专属证据规则及失败工件路径已修复，CLI 缺输入 validate 误报已通过红绿回归修复。详见 [RF057 当前增量](../RF-057/evidence-index.md)。发布/账本/client 28/28、新增单场景证明及真实浏览器失败证据相关21/21、author/validate9/9，TypeScript、清单、治理和文档校验通过。测试使用临时SQLite及隔离浏览器；A04新驱动只作语法验证。S4仍 IMPLEMENTING；剩余驱动、当前身份28项LIVE、性能及候选交付未完成，整体仍NO_GO。

当前：IMPLEMENTING / NO_GO。用户已授权自主细化、执行和复审。源码修复与实际镜像、集成测试与真实业务分别记录，不将历史或离线结果记作当前 Agent LIVE。

## 已完成验证（2026-10-02）

| 层级 | 命令及结果 | 边界 |
|---|---|---|
| INTEGRATION | Java21 `mvnw.cmd test -q`，最终99 tests / 0 failures / 0 errors / 0 skipped | 含480期、年率、还款方式、对账持久化回滚、日终日期冲突、未知作业禁止重放、核心写屏障、模块规则及贷款金额校验 |
| CONTRACT | bundled Node `--test agent-cli/test/journey-author-validate.test.mjs`，8/8 | 测试专用模型；不属于真实 BYOK LIVE |
| CONTRACT | bundled Node20 `--test scripts/verification/quality-read-model.test.cjs`，3/3 | SQLite投影、当前身份失败阻塞、历史失败隔离、公共只读API拒绝写入 |
| STATIC | Customer Portal build、Quality Portal build、产品根目录 build，均退出0 | 不等于浏览器验收；Quality尚未激活当前运行身份 |
| STATIC | `python scripts/architecture/validate_refactoring.py --batch RF-063`；`python scripts/docs/validate_docs.py`，PASS | 最终文档回灌后再校验 |
| ENVIRONMENT | Docker Desktop恢复；定向替换Channel、Test Support、Customer Portal并健康 | 不关闭其他服务、不删卷、不重置、不推进业务日期 |
| LIVE_BANK | 黄金链输出COMPLETED，100.00 CNY，Fineract交易65，关联号 `bank-transfer-golden-036e8cd7d52f4c429cbac5f8603a6458` | 来自更新后的Channel镜像；最后新增LoanCore金额校验尚未入该镜像 |
| LIVE_BANK | RF057 Business run `1a760fa7-c882-42c3-b461-27ec81909dcc`：B04/B03/B10/B05/B06/B08/B07/B09/B12通过；B13失败后停止 | 9通过、1失败；报告不完整，不能获得GO；临时身份清理COMPLETED |
| READ_ONLY_DIAGNOSTIC | `pwsh -File scripts/demo/read-reconciliation-summary.ps1`：最新CORE_TO_GENERAL_LEDGER为DIFFERENCE/1；核心journal总数0、储蓄产品accountingRule1 | 只读银行回读，临时运营身份创建后清理；未修改产品、历史账务或日期 |

最后一轮金额校验已通过全套测试并构建Channel镜像：manifest `sha256:040007826ac5c9eee4d6b7b6003db65b01327bc24600c0d4426072944a074814`。真实业务验收在B13失败后不继续；不将镜像构建或替换追记成新的业务通过。

最终定向替换Channel与Test Support退出0，两项健康；Gateway动态解析配置已生效，其余服务保留运行。`powershell -File demo.ps1 verify`实测退出5，输出当前清单28项、NO_GO、verificationPerformed=false。治理及文档回灌校验均PASS。

## 10月8日收尾增量（不追记LIVE完成）

- 唯一顺序与backlog的A07/A08完成依赖已切换RF-057新28项，历史Full18记录保留。源码门与运行裁决分开，避免RF-063与RF-057相互等待；S2/S4/S5已补小任务、反例及命令门。
- Maven首次运行受JAVA_HOME的Java17影响，未执行测试；本次进程明确绑定已安装Java21.0.12.101，未改全局环境。
- 复审发现LoanWorkflowService.submitToCore未接CoreWriteRepository。修复前隔离PG反例失败：预期日终锁期间409，却未抛异常。修复复用现有共享lease，不新建锁或跨网络事务。
- 修复后Java21全套`mvnw.cmd test -q`退出0；Surefire汇总108 tests / 0 failures / 0 errors / 0 skipped。LoanWorkflow五项含日终阻断零领取零POST、网络阶段保持屏障、异常释放且未知不重提；LoanOperation三项、EOD四项及总账/事务/屏障回归通过。
- 10月8日只读`docker ps`失败：dockerDesktopLinuxEngine管道不存在。Desktop/backend进程存在，com.docker.service=Stopped；未主动停止服务、恢复出厂、删除socket/卷或推进业务日期。当前无法进行镜像及真实运行验收，最新贷款屏障修复仅为源码/隔离INTEGRATION。
- 治理和文档校验在控制修改后已PASS；本增量回灌后再次验证。RF-063总体仍IMPLEMENTING/NO_GO，28项正式证据未闭合。
- S4/S5继续实现：两个Quality反例分别复现“后续失败仍READY”与“源码漂移仍PASS”；共享当前事实检查修复overview/releases，服务显式传入当前身份计算函数。Quality五项合同测试通过，公共GET仍只读、无状态写入。
- rf057-report及demo verify已改用Harness同一内部验证器；客户端两项测试验证认证登记后的调用顺序、服务失败不伪造验证、无报告参数时核验既有登记。实测demo verify返回RELEASE_HARNESS_UNAVAILABLE、NO_GO、verificationPerformed=false，退出5；不是实际发布验证通过。
- 银行/Agent失败出口补调用证据封存，源码漂移仍保存FAILED报告再报错；仅做语法验证，未把未执行驱动记LIVE。报告内容核验、A04/A07严格证明、完整发布验证器合同测试及A02—A07/P05仍待完成，S4/S5保持IMPLEMENTING。
- Customer Portal构建、产品TypeScript构建通过；测试登记102项/100项CI可执行/2项受控运行时，修正RF057条目排序后check:tests通过。最终Quality、分页与发布客户端联合合同测试9/9，银行/Agent驱动及证据封存脚本语法检查退出0；不代表完整注册回归或全仓CI已通过。

## 独立复审结论

## 2026-10-08 规范化发布门源码增量

发现并先以失败测试复现两个错误放行：B07 声称 PASSED 但发生资金变化仍为 GO；P07 只有一项自报 p95、无测量样本也为 GO。现在银行场景按 B01—B14 合同校验，B05—B08 根据整数分余额重算资金变化；性能场景按原始样本重算指标并核对资金与并发结果。P05 未具备账本驱动，不允许报告占位放行。

TypeScript 构建通过；真实临时 SQLite 的发布测试及客户端测试合计19/19，包含篡改报告/工件、旧源码身份、未清理、缺场景和失败报告反例；负载工具4/4。测试已登记103项清单。此为 CONTRACT/本地SQLite验证，不是 LIVE。A04/A07 专属证据语义及其他产品闭环仍未完成，不将此增量标作 RF063 完成。

## 10月8日 Docker恢复后的运行增量

- 用户启动Docker后，`docker ps`确认15个原产品容器运行；核心、Channel、认证与门户健康。仅对Bank Channel与Test Support执行定向build及`up --no-deps --no-build --wait`，未执行down/reset、删卷或Docker AI变更。
- 两个容器实际运行镜像均为`sha256:c10289e81c397e5a9f6d05ddacba9480c8392371a8ec5d852ab8217249bd92c5`，健康；本次贷款提交共享屏障修复已进入镜像。镜像构建不重复计作Java测试。
- 更新镜像后的黄金链退出0：100.00 CNY，核心交易73，关联号`bank-transfer-golden-d52521799fe348b99bfa4be1abfd6496`，付款/收款账户3/4，客户与运营SETTLED回读、核心余额增减及守恒、两条本地会计投影均通过；临时身份在脚本finally清理。
- Journey author/validate合同测试8/8（测试专用模型，不是真实BYOK）。开发态RF057 Business运行`995ead0d-388c-496c-9deb-0dc2c8a25dad`退出0、银行14/14通过，报告状态PARTIAL；含真实贷款提交/还款/重复与异体冲突、三类对账、文档20路并发、两门户PKCE刷新，以及B14受控重启后的余额和历史连续性。临时身份清理COMPLETED，回执`agent/runs/rf057-cleanup/78d1d346938a43a98e4ecddd57ea8d22.json`；不作冻结身份的正式28项验收。
- `demo.ps1 status`证明Docker和bank.ready=true，但Agent为STALE_SOURCE/NOT_RUNNING；历史状态接口仍显示18项旧账本，不作为RF057当前发布门。总体仍IMPLEMENTING/NO_GO，后续发布验证、真实BYOK、性能及候选隔离验收未闭合。

## 继续实施增量（2026-10-07，未完成发布验收）

- 已采用用户继续授权的新现金会计演示基线：新账户3/4、产品现金会计规则2，旧账户1/2及历史保留。九项储蓄会计映射及财务活动200的负债转账映射由核心API创建；未直接写核心数据库。误建但未被产品引用的资产科目BSG1002保留，未擅自删除。
- 新基线黄金链通过：核心交易68，关联号 `bank-transfer-golden-b7f11e46fc7a4dd3ae098297abd1723d`，100 CNY；RF057业务运行 `c6bff081-55d3-4e60-ae9c-9e58f6d6246e` 14/14，含B13与受控重启，清理完成。它证明当时GL修复镜像，不覆盖随后新增贷款操作及EOD回读代码。
- 实际核心回读：16条journal；最近对账MATCHED，现金会计范围3笔，明确排除35笔旧非会计历史。journal关联使用储蓄实体类型、账户ID、流水ID及币种，防止不同业务流水ID碰撞。
- 贷款操作新增v16、日终作业版本新增v17。当前已定向替换Channel与Test Support，镜像manifest `sha256:f403f24651e3be2f6ffc0e5600cb882a28d08ea851efa8a39e7d46242f08ce02`，健康；新B11补入真实合成贷款放款准备、客户还款、重复请求、异体冲突及未偿清关闭拒绝，运行中。
- 2026-10-07 Docker启动再次因 `sailor-ingest.sock` 遗留端点失败。退出崩溃进程后将两个精确临时目录改名留存为 `run.rf063-retained-20261007-133915` 和 `docker-secrets-engine.rf063-retained-20261007-133915`，重启引擎29.8.0及15个原服务恢复；没有删除目录、卷或重置业务数据。
- Java全套及新增重点测试曾退出0；最终源码全套正在重新执行。正式当前身份、真实BYOK、压力性能、发布验证生产者仍未闭合，保持IMPLEMENTING/NO_GO。

重新沿控制器→应用服务→Repository→Fineract以及CLI→MCP→Harness调用链检查后，整体为 **NO_GO**。具体修复状态见 [根因与剩余修复](root-cause-and-review.md)。批次及backlog不得标记DONE。

Agent仍为STALE_SOURCE，当前身份无新的真实BYOK验收；压力/性能未继续执行。Bank服务健康与黄金转账通过不能代替这两项。

