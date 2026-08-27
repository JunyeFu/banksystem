# Hengzhun I10 TP-04：独立 Node 24 Flowise Runtime 与便携打包

## 状态与边界

- 状态：`COMPLETE`（2026-08-24 独立复核）
- 前置：TP-03 已安全降险但因 Node engine、上游 peer-invalid 和无修复 Critical 保持 `BLOCKED`；源码计算身份 `d9f40cc201370e77338ed0ee3948ce954378825c44a0523a2eecfac1f956c4eb`。
- 允许面：Node runtime 固定清单与供应脚本、Flowise 私有 native dependency lock、I9 生命周期、PREPARE、Stage9 portability policy、ReleaseIdentity 投影、对应行为测试和任务控制文件。
- 禁止面：正式服务启动、Flowise 发布、`.data`、审计风险接受、Agentflow 重建、验收账本和 LIVE_E2E。

## 业务常识与不变量

1. Harness/MCP/Worker 的 native modules 继续由 Node 20.20.2 运行；Flowise 3.1.4 单独使用满足 `^24` 的 Node 24，不能全局替换导致 ABI 回归。
2. Runtime 是生成型发布资产，但其来源、版本、URL、归档 SHA-256、目录名和目标平台必须进入源码身份。
3. 下载必须先进入临时目录，校验官方 SHA-256、解压根和 `node --version` 后才能原子提升；失败不得覆盖现有 runtime。
4. 生命周期的进程所有权必须按服务核对 executable、entrypoint 和产品根；Node20 Flowise 旧进程不能被误认成 Node24 current。
5. Stage9 必须把 Node20 和 Node24 都作为锁定 runtime tree 哈希；缺任一目录时 preflight fail closed。
6. portable package 不得依赖 system Node、Codex runtime、PATH、WSL 或 Docker。
7. Node runtime 变化必须改变 Flowise/runtime 或 release-tooling 身份；旧验收证据不得继续计 current。

## 项目易错点

- 直接把全局 `nodeExecutable` 改成 Node24，导致 `better-sqlite3` ABI 失配。
- 只在本机复制 Codex 的 Node24，不留下可重建来源和校验和。
- 生命周期 spawn 用 Node24，但 `isOwned` 仍只接受 Node20，导致无法安全停止。
- Stage9 忘记 Node24 runtime tree，开发机绿、便携包启动失败。
- 只检查目录存在，不检查归档哈希和 `node --version`。
- 下载失败后删除或覆盖用户已有 runtime。

## 完成谓词

```text
before:
  identityHash=d9f40cc201370e77338ed0ee3948ce954378825c44a0523a2eecfac1f956c4eb
  generalNode=v20.20.2
  flowiseNode=MISSING_IN_PRODUCT_RUNTIME
  flowiseEngine=^24

commands:
  powershell -File scripts/i10-provision-node-runtimes.ps1 -VerifyOnly
  <node20> --test scripts/verification/lifecycle-entrypoints.test.cjs scripts/verification/release-toolchain-integrity.test.cjs scripts/verification/flowise-runtime-policy.test.cjs
  <node20> scripts/i10-stage9-portable.cjs preflight --report-only

pass:
  Node20 remains the default Harness/MCP/Worker executable;
  Flowise alone resolves to runtime/node-v24.19.0-win-x64/node.exe;
  both executables match the pinned manifest and report exact versions;
  process ownership validates the service-specific executable;
  Stage9 runtimeTrees contains and hashes both runtimes;
  ReleaseIdentity changes and old evidence is not reused;
  no service, publication, Agentflow builder or LIVE_E2E is run.
```

证据等级：runtime 供应、选择、所有权和 Stage9 合同为 `STATIC/CONTRACT`；未启动服务，因此不建立运行态或 `LIVE_E2E` 证据。

## 具体实现模板

```json
{
  "flowise": {
    "version": "v24.19.0",
    "archive": "node-v24.19.0-win-x64.zip",
    "sha256": "<official-SHASUMS256-entry>",
    "targetDirectory": "runtime/node-v24.19.0-win-x64"
  }
}
```

```js
function executableFor(service) {
  return service === 'flowise' ? flowiseNodeExecutable : nodeExecutable
}
const child = spawn(executableFor(name), args, options)
```

```powershell
$archive = Join-Path $temporaryRoot $spec.archive
Invoke-WebRequest -Uri $spec.url -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $spec.sha256) { throw 'HASH_MISMATCH' }
Expand-Archive $archive $temporaryRoot
# verify exact node --version, then Move-Item the complete directory atomically
```

## 回滚

- 配置、供应清单、生命周期、Stage9 policy 和测试必须作为一个批次回滚。
- 回滚只移除本包新建且尚未被运行态引用的 Node24 生成目录；不得清理 Node20、浏览器、模型、`.data` 或用户证据。
- 本包解除 TP-03 的 Node engine 阻塞，但不自动解除 `decompress` 风险和 upstream peer-invalid 阻塞。

## 进入 REVIEW 的证据

- 官方 Node.js `v24.19.0` Windows x64 归档按 `SHASUMS256.txt` 固定为 `57f71ab...`；供应脚本完成临时下载、哈希/版本校验和同 runtime 根提升，双 runtime `VerifyOnly` 返回 `VERIFIED`。
- 生命周期选择：Harness/MCP/Worker=`v20.20.2`，Flowise=`v24.19.0`；进程所有权按服务 executable 校验，旧 Node20 Flowise 不会被判 current。
- Flowise 私有 `better-sqlite3` 从 9.6.0 升至 12.11.1；Node24 探针真实执行 `better-sqlite3` 与 `sqlite3` 的内存 SQL，返回 `READY`，未创建产品数据库。
- Stage9 preflight：`missingRuntimeTrees=[]`、`missingSourceFiles=[]`、`missingHostTools=[]`；仅因当前受保护脏工作树返回 `I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN`，未生成 export/ZIP。
- 供应、runtime policy、生命周期、身份与 Stage9 聚焦矩阵 `16/16`；build/typecheck/lint/test-manifest 均通过。
- ReleaseIdentity 从 `d9f40cc2...` 变为 `901d2022ec660aa38797f3053a9d5edde95db39df6c29868d3a6edd3e841d724`；release code set 为 149 文件。
- 本包没有启动服务、发布 Flowise、运行 Agentflow builder、写验收账本或执行 LIVE_E2E。

## 独立完成复核

- runtime provisioning `-VerifyOnly` 再次返回 `VERIFIED`：core=`v20.20.2`、Flowise=`v24.19.0`，两者 executable 与固定 SHA-256 一致。
- Node24 实际探针返回精确九节点、`openAIApi` credential、`better-sqlite3` 与 `sqlite3` READY。
- Stage9 报告 runtime/source/host tool 缺失均为 0，仅因受保护脏树返回 `I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN`，且 `exportCreated=false/archiveCreated=false`。
- TP-04 的运行时资产与生命周期合同已经完成；这不替代 TP-03 的 source acquisition 风险决定。
