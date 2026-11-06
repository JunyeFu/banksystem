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
