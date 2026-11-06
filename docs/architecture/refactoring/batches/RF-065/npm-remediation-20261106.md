---
id: RF065-NPM-REMEDIATION-20261106
title: RF065-S3 当前 npm 公告修复
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# RF065-S3：真实九锁扫描修复

## 业务目标与输入输出

许可包L3首次真实扫描：秘密0命中，九锁覆盖完整，36处受影响包记录/36条不同公告，扫描退出1。原始证据保留在D:/Agent/.codex-temp/banksystem-rf065/license-delivery-20261106-01的source-01与dependencies-01，不覆盖或把报告改绿。依赖门阻断候选生产，不影响原银行服务。

输出是最小源码/锁文件修补、隔离安装与消费者验证、同一正式扫描的实际复测；无新增豁免或运行时兼容壳，不提前冻结身份。原运行依赖不安装、不替换。

## 实现

1. N1前端：五个树的Vite 7.3.7/Vitest 4.1.12，Storybook两项10.6.2；对实际10.x minimatch/13.x glob使用上游已修11.0.1/14.0.2，以具体消费父包声明override，避免npm10安装后按旧版本范围重读时报告invalid。官方包声明均支持Node20，保持既有Node基线。客户表单用Zod4.6.6和支持v4的resolver5.2.2；现有react-hook-form7.81.0满足其peer。运营只有无消费者的zodResolver.ts持有Zod，删除该孤立文件及依赖，不迁移不存在的功能。先核依赖/引擎/脚本，锁更新禁脚本，安装只在既有隔离源码副本。验证五树单测、三门户lint/typecheck/build、Agent前端构建和Storybook实际构建；表单行为不变。
2. N2 Agent：SDK两入口同时1.32.0、两个直接Zod同时4.6.6；原生SQLite/DPAPI版本和Node20 ABI不变。按当前实际传递版本定向固定@hono/node-server2.x到2.1.3、body-parser2.x到2.4.0、fast-uri3.x到3.1.9、qs6.x到6.16.1。浏览器树只修body-parser1.x到1.20.9、follow-redirects1.x到1.16.2、undici6.x/7.x分别6.29.1/7.30.1和已有qs；这些上游包的引擎都满足20.20.2且无安装脚本。原目录只更新声明/锁，隔离副本更新实际安装并验证SDK解析、MCP、Controller、Harness边界及浏览器合同。Midscene和chromium-bidi要求Zod3，后者实际读取error.errors，直接v4替换不是兼容补丁；2026-11-06核最新Midscene1.17.6依然依赖v3，不做无效大升级。Zod3精确本地补丁专项等待用户选择，其余修复继续。ZIP两条原精确补丁处置保留，不扩展例外。
3. N3：真实九锁重扫、受影响合同/集成与独立复核通过，才恢复许可包L3。源码、构建和正式清单稳定后才进入原最终身份门；不以npm安装或离线测试替代银行/Agent LIVE。

## 白名单与预算

N1仅packages/bank-api-client及bank-ui-kit的package.json/package-lock.json，三门户的package.json/package-lock.json，apps/operations-console/src/pages/zodResolver.ts，apps/customer-portal/src/pages/form-validation.test.ts（仅在新resolver需要行为回归时）；N2仅platform/hengzhun-regression-system的package.json/package-lock.json及controller、runtime两子树的同名文件，agent-cli/offline-sbom.cdx.json由既有i10-agent-offline-sbom.cjs生成器随锁更新，既有scripts/verification消费者测试只读复用；本任务包、RF065证据/控制、唯一顺序及backlog。复用现有隔离输出，不复制原.data或凭据。Zod3专项未确认前不新增vendor/例外或改Midscene。每片最多两类模块，预算27文件/2新增/4500锁与测试行，0公开合同/0迁移。

## 项目易错点与完成门

声明/锁/安装包三者不能互相替代；不在原运行目录npm ci。主版本override必须经过真实消费者测试；开发服务公告不是运行银行已遭攻击。先前839/839仍是先前源码证据，不自动覆盖本次依赖。当前许可父包等待本包通过，不相互依赖。

完成门：正式九锁覆盖完整，除既有精确ZIP处置外无未处理公告；实际消费者验证通过、原服务保持，回填许可L3后复审。未完成项不标REVIEW。

## 上游依据

- [MCP SDK任务隔离公告](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-22jm-h49p-29qw)：同分支修复1.32.0。
- [Zod公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)及[实际v4补丁](https://github.com/colinhacks/zod/pull/6652)：v4修复不等于嵌套v3已经修复。
- [Minimatch公告](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)及[Storybook公告](https://github.com/storybookjs/storybook/security/advisories/GHSA-f2ph-cmg5-wxc8)。版本/引擎/完整性从官方registry.npmjs.org逐项实时核验，npm使用既有锁与官方注册表，不执行上游构建/发布脚本。

## N1/N2实际回执与复审（2026-11-06）

原工作区仅修改明确的声明/锁和孤立无消费者文件，未安装原运行依赖。既有source-snapshot内完成五前端新按锁安装及三Agent树更新（禁安装脚本，Node20.20.2/npm10）；SQLite、DPAPI、Midscene和Playwright版本不变。日志统一保留在license-delivery-20261106-01。

- frontend-verify.log：五树单测17/4/10/10/45，三门户lint/typecheck/build、Agent前端与Storybook构建全部退出0。复审抓到旧版本范围override在npm10安装后重读显示invalid，已改为实际消费父包绑定；frontend-resolution-r2.log重装通过，frontend-verify-r2.log对应四树4/10/10/45及全部相关构建再次通过，API-client未改的17项结果复用。构建原有chunk体积提示不扩为本包重构。
- agent-consumers.log：实际build/typecheck及九个选定入口88/88，0失败/取消/跳过，覆盖SDK实际解析、MCP、真实临时Harness、Controller、Journey/Worker和ZIP/FFmpeg安全消费者；这是合同/隔离集成，不是完整registered或LIVE。原全套839项不冒充本次依赖已全回归。
- 离线SBOM检查实际先以AGENT_SBOM_STALE退出1，按既有生成器同步至121组件后check通过。还核到runtime锁更新须带--install-links，否则npm会把既有ZIP实包改成link；已恢复version=2.0.1/resolved=file:../vendor/extract-zip且无link，原精确补丁政策不改。候选安装字节已在88项内核过，原运行库未部署。
- source-02/secrets.json为0命中；dependencies-02九锁真实复扫退出1，受影响记录36→2、不同公告36→3：extract-zip2.0.1的既有两条和zod3.25.76的一条。其后父包override元数据与ZIP实包锁绑定修正不冒充最终候选已重扫；N3须从最终源码重新生产原生扫描/回读。未产生候选或交付包，也未增加处置豁免。
- zod-bounded-repro.jsonl使用隔离小型合成输入：max(1)面对128个错误元素，v3生成129条issue，已修v4生成1条。不是实际攻击或OOM测试。最新Midscene仍依赖v3，chromium-bidi直接访问error.errors，故不跨主版本强换；精确v3补丁专项等待用户选择。

附加npm ls诊断未作为既定发布门：修正后独立ui-kit、Harness和Controller退出0；跨本地链接遍历会把依赖树自身override/平台optional项列为invalid/extraneous，runtime的本地ZIP也出现同类记账结果。其原日志保留，不报告八树全部干净，不删除在用或optional依赖；实际按锁安装、消费者与精确ZIP来源校验独立验证，现阶段仍不宣称可发布。

原15银行容器ID集合完全相同、均运行，三Agent PID56748/50704/38832和H1c76996e…ca3e94d绑定保持。只读SQLite六表计数仍1151/1205/58/106/0/0（dependency-protected-after.json），未运行模型、资金、业务日期或正式28项。当前包因Zod3决策未闭合，保持非完成；后续仍须N3、许可L3、当前镜像候选、统一身份/28项及远端CI。
