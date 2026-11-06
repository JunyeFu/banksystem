---
id: RF065-CI-REGRESSION-20261105
title: RF065-S3 CI回归接线增量
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-05
owner: Codex
---

# RF065-S3：接通本轮修复的CI回归

## 2026-11-06 远端CI合同接缝修复

业务目标：新克隆在不取得开发者私有配置的条件下运行治理和真实秘密检测。基线为main@bc22df6，远端运行42156679230；其余已通过job不冒称整体CI通过。

已证根因：governance在RF065校验时因`includePaths: missing path mariadb/.env`退出1；source-engineering在原生Gitleaks自测时因`clean-report/source-manifest.json`缺失退出1。前者是主动源码范围混入机器配置，后者是合成输入生产者未同步扫描器已有清单合同，不是银行代码或模型错误。

实现分三步：①从batch及S3切片的主动范围删除这一私有路径，补源码范围回归，保留本地文件和普通缺路径拒绝；②合成输入写完后按既有file_hashes/source_digest生成扫描所需清单，保留clean、generic-positive、inline-positive三个真实扫描场景；③执行同一CI本地入口、秘密扫描及复审后，仅向codex/rf065-ci-20261106提交/推送并记录远端结果。尚在运行的原agent job继续沿原句柄观测，不重启或取消。

路径白名单：scripts/test/check_ci_gitleaks.py、scripts/test/test_refactoring_source_scope.py，以及本批batch/slices/S3/tasks/S3/evidence-index、本任务包、唯一顺序和backlog。无生产依赖、接口、迁移、镜像或运行身份变化。不读取/新增/删除私有配置，不弱化扫描器，不调用银行或模型。

验收：源码范围回归须先红后绿；test_ci_scan、test_ci_workflow与source-scope合同，真实Gitleaks三场景，RF064/RF065治理和docs通过。候选源码0秘密发现才允许显式提交，远端CI状态按实际记录；未运行的依赖安全门或最终28项仍不通过，整体NO_GO。失败只修已证接缝，不全局忽略或替换业务证据。

同一远端agent job127692379162随后结束：838通过/1失败/1取消/0跳过，coverage未执行。context-envelope:147的普通断言反例使用600ms自动变成功的DOM，忙碌CI可能在断言前已改值；改为静态错误反例，保留延迟成功与错误结果拒绝。Journey文件已逐项通过直到resume测试，却在整个文件180000ms截止时被取消；更正注册器文件预算为300000ms，保留串行、单次、完整断言和总工作流限制，不改生产超时。对应增补白名单为P/scripts/verification/context-envelope.test.cjs、P/scripts/run-registered-tests.cjs、P/scripts/verification/test-toolchain.test.cjs；P同上。本机定向真实Chromium/Journey与工具链通过后才推候选，远端全套结果仍另记，不以本机旧841宣称本次远端通过。

### 候选CI继续暴露的扫描夹具随机性

候选9b718bd的CI42159223066中治理已通过，原清单缺失不再发生；原生扫描继续至generic-positive却仅检出9/10。原夹具用token_hex(24)，但固定Gitleaks8.30.1官方generic-api-key规则要求熵至少3.5，随机hex不能保证达到此值。该轮未归档漏检合成输入，不能声称取得其具体值；已确认夹具的无下界随机性与已观测漏检，改用48字符、每个hex字符恰三次的合成值（熵4）。不降低扫描阈值/断言，不增allow；失败摘要仅补缺失/意外文件名，不输出输入值。官方规则来源：https://github.com/gitleaks/gitleaks/blob/v8.30.1/config/gitleaks.toml 。当前只修同一候选分支，原CI继续沿原句柄，不取消或伪装已绿；再经真实三场景、相关合同/治理/docs和秘密扫描后追加候选提交。

已用9b718bd原生产者在内存中仅替换合成值，实际固定扫描器重现低熵3.1616的positive输入退出0（本应退出1），未打印值；该受控复现不声称取得远端丢失值。改为熵4的平衡输入后，真实clean/generic/inline三场景分别0/10/10发现、退出0/1/1。红/绿输出保留为policy-contract-low-entropy-red和policy-contract-balanced-01，不改扫描策略或生产业务。

### 本次修复的本机回执与复审

源码范围回归实际先红，移除batch与slice的唯一私有配置要求后5/5通过，普通缺源/证据及越界仍拒绝。扫描器9/9、workflow16/16合同通过；原生Gitleaks三场景分别0/10/10发现，退出0/1/1，内联allow仍不能绕过；当前2680份受控源码的脱敏扫描退出0、无泄露。扫描器生产逻辑/策略没有改动，夹具仅补其已有必需输入。

隔离既有source-snapshot只同步三个测试/注册器文件，移除测试进程模型环境变量后，用Node20执行真实Chromium/context-envelope、Journey状态机及test-toolchain，48/48通过、失败/取消/跳过/todo均0，87.305秒。错误反例不再自动变成功；成功延迟DOM、错误目标和Worker拒绝断言保留。文件预算300秒仅供测试进程，仍串行单次，未放宽覆盖率或改生产代码；远端实际耗时与结果待候选CI，不拿本机48冒充全套或旧841。

RF064/RF065 SOURCE_ONLY治理与完整docs通过。原main的CI最终为失败：六job成功，治理、source-engineering、agent三job失败，coverage跳过。实际远端结果不因本机修复而覆盖；本包仍待候选提交/CI回读，不自动合并main、冻结身份或执行正式28项。

保存输出位于既有scratch的ci-remote-20261106-01：policy-contract-green-01、candidate-scan-01和agent-targeted-green.tap。复核原15银行容器仍为同ID且运行，12个有健康检查的容器健康；Harness/MCP/Worker三个进程ID与启动时间不变。旧面试站PID55848已不存在，保留检查脚本因此失败；未停止或重启该站，不据此声称四个原进程均保持，也不启动未知替代进程。所有银行数据/卷/日期均未操作。

## 业务目标

开发者走现有GitHub agent job与本机registered入口时，真正运行本轮新增的凭据/金额、CAS、错误分类、来源、取消与清理反例。成功不是增大通过数量，而是新增测试不漏跑、失败不被包装器掩盖。

## 输入与输出

输入：main@e67fd4c的保留脏树、已通过真实S5的H1c76996e…ca3e94d、现有ci.yml和test-manifest.json。已观测registry报TEST_MANIFEST_DISCOVERY_MISMATCH，漏controller-sessions.test.cjs；session包装器固定pass15、release包装器固定tests/pass19已过期。

输出：既有registered清单及包装器接线、定向真实进程测试回执，保留原银行/Agent服务和数据。用agent/runs/rf065-ci-regression-20261105存本批日志。只读快照核对原运行绑定、执行表行数与容器ID；不把本机结果称作远端CI。清单在v4身份组内，修改后源码身份应改变，运行绑定仍保留原H；显式记录待最终冻结/复验，不删除旧S5、不声称旧证据属于新清单。

## 实现

1. 清单登记controller-sessions与新的interview-regressions包装器，维持排序、既有coverage门和排除项不变。
2. session/lifecycle包装器用实际测试计数一致、失败/取消/skip/todo为零判定，允许增加有效测试；Node20原生SQLite与Node24 CLI不混用。
3. 浏览器合同包装器接入原生下载取消；新增包装器按ABI调用两轮审计、明确输入、清理摘要、S5安全诊断及PowerShell合成清理生产者。子测试环境不携BYOK变量，不装依赖、不访问银行或真实模型。
4. 先运行新增/变更的registered包装器和workflow合同，再检查受影响门；保持失败日志，不调整业务断言、覆盖率阈值或用排除项过关。

白名单：本批控制/证据、唯一顺序/backlog，P/scripts/run-registered-tests.cjs、P/scripts/verification/test-manifest.json、controller-session-store.test.cjs、agent-release-lifecycle-v4.test.cjs、agent-workbench-contract.test.cjs、interview-regressions.test.cjs、test-toolchain.test.cjs，scripts/test/test_ci_workflow.py。P为platform/hengzhun-regression-system。预算：13改动文件、3新增、600行，无新合同/迁移/运行模块；小型运行回执不计源码文件预算。

## 项目易错点

注册器只发现scripts/tests中的CJS，不会自动发现Controller/CLI的MJS；必须通过实际包装器接入，不能仅列文件名。固定通过数量会使新增正确测试反而失败；退出0也不能掩盖整组skip。所有集成Fixture必须使用临时SQLite与自有进程；不能把旧平台发布测试当当前产品LIVE入口。

## 验证与完成门

STATIC：Node20 scripts/run-registered-tests.cjs check、python -m unittest discover -s scripts/test -p test_ci_workflow.py、RF065治理和docs校验。

CONTRACT/INTEGRATION：Node20 --test运行controller-session-store、agent-release-lifecycle-v4、agent-workbench-contract、interview-regressions、test-toolchain与controller-sessions六个入口；子进程真正运行Node24/Node20及PowerShell测试，失败/取消不变绿。新包装器接入既有CI的npm run test:registered，不新增第二套发布判定。

完成需本批定向CI入口实际通过、原运行绑定与业务执行状态不变，清单变化对应新的源码身份。源码/CI接线结果不代替全套registered/coverage、远端CI、安全候选或正式28项；后续仍按RF065现有门推进。不运行原环境的完整VERIFY/prepare/down/reset，不为本包重冻或重跑S5。

## 实施与复审回执（2026-11-05）

登记前真实失败为controller-sessions未注册；修复后清单111项完整，其中107项CI-runnable、2项governed-runtime、2项historical-only，未新增排除。两个旧包装器不再锁死15/19通过数，实际退出0、有效测试数大于0且全部通过才放行；空、skip、fail、cancelled、todo与不完整摘要反例均拒绝。下载取消、两轮面试审计、清理验证器和PowerShell生产者已接入现有Windows agent job消费的registered入口，Node20/24按ABI分别执行。

定向真实命令在P目录执行：

```powershell
.\runtime\node-v20.20.2-win-x64\node.exe --test --test-reporter=tap --test-reporter-destination=D:/Agent/banksystem/agent/runs/rf065-ci-regression-20261105/registered-wrappers.tap scripts/verification/test-toolchain.test.cjs scripts/verification/controller-sessions.test.cjs scripts/verification/controller-session-store.test.cjs scripts/verification/agent-release-lifecycle-v4.test.cjs scripts/verification/agent-workbench-contract.test.cjs scripts/verification/interview-regressions.test.cjs
```

该轮15/15通过、0失败/取消/跳过/todo，耗时128.667秒。workflow合同首次暴露旧lint期望未含vite.agent.config.ts，已改为同时要求两份Vite配置；实际15/15通过，不删lint对象。RF065治理与文档校验通过。日志为agent/runs/rf065-ci-regression-20261105/registered-wrappers.tap；本机测试不标远端CI绿色。

复审按调用链检查了ci.yml→test:registered→manifest→真实子进程，未降低覆盖率门、添加失败豁免或运行时替身。新增包装器子进程移除模型环境变量，合成端点与临时SQLite不访问原银行；没有调用完整金融验收脚本。原15银行容器名称/ID与批次前相同，全部运行且0 unhealthy；Harness六表计数分别为runs1151、tasks1205、workbench_turns58、controller_sessions106、acceptance_reports0、release_verifications0，与前置快照一致；活动任务/计划为0，迁移45/45。原Harness/MCP/Worker进程仍存活，进程登记文件写入时间早于本批快照。

本包结果为CI回归接线完成，不是RF065整体完成。当前源码身份95e955fb6b37760b7d34e9f6ed965520a301d40d0d57103b10869e001cd28dc7；原运行绑定保留1c76996e8bbc8ab8da2b13ad6e055603fd616122ef1b3a62deb482b7dca3e94d。此清单变更应显示STALE_SOURCE，未冻结/重载，也未挪用旧S5证据。剩余门仍为全套registered/coverage、未闭合安全候选及正式28项/远端CI，整体NO_GO。
