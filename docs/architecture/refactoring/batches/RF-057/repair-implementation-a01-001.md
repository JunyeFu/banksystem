---
id: DOC-ARCH-RF057-A01-REPAIR-IMPLEMENTATION-001
title: RF-057 A01 repair implementation and verification
document_type: reference
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# A01 修复落地记录

## 实现结果

用户“落盘修复”批准了 [根因文件](root-cause-and-repair-a01-001.md) 的源码修复。R1–R4 已实现并完成下列验证；R5 的非运行身份计算已完成，受控部署及真实 BYOK A01 复验仍未完成。未把旧失败 Journey 或历史证据改为成功。

| 修复 | 落地行为 |
| --- | --- |
| R1 错误报告 | 驱动保留 CLI 安全业务代码、阶段、退出码及合法 Journey/Session 标识；启动阶段失败也保存失败报告，不输出上游任意消息。 |
| R2 冻结边界 | 银行适配器 v2 明确冻结门户与 Keycloak 导航/交互源，凭据源仅 Keycloak；删除已有冻结档案的隐式源补入。公有 prepare 流程产生新版档案，不直接修改保留的 SQLite。 |
| R3 PKCE | 共享认证 JSON 供编译器、受控模板与 Worker 消费。显式银行认证编译为 goto → SSO click → 等待 Keycloak → username/password fill → submit → 等待 dashboard。非银行通用登录合同不变。作者化和正式候选执行都检查凭据源。旧银行控件迁到真实 Keycloak；错误提示使用现场 `.kc-feedback-text`，不是不存在的 `#input-error`。恢复场景明确移除隔离浏览器会话，不把刷新恢复误称 token 失效。 |
| R4 分页 | OpenAPI 3.0.0、生产端与生成客户端同步变更；cases 返回游标页，服务器搜索/筛选、稳定排序、SQL limit+1，按既有 L1 预算缩页但不丢失记录。页面下一页/上一页、筛选重置游标，错误不自动重试。不加写 API、token、数组兼容或全局预算提升。 |

Worker 传递依赖清单由 25 改为 28 项，纳入认证 helper、原始与编译后 JSON；v4 身份同时覆盖认证源和编译产物。未新增数据库迁移、模型重试、备用模型、运行时 Mock 或 Flowise 依赖。

## 验证记录

| 命令／检查 | 结果及证据级别 |
| --- | --- |
| 根目录 `node --test scripts/test/rf057/agent-result.test.mjs` | 3/3，CONTRACT；业务错误不再被断言代码遮蔽，任意消息/标识不进入报告。 |
| 产品目录 `npm.cmd run generate:dist` | 退出 0，STATIC；TypeScript 编译通过。 |
| bundled Node20 `--test`：rf057-pkce、target-profile、generic-worker-routing、verification-policy、rf057-quality-pagination、quality-read-model、test-toolchain、release-toolchain-integrity、i10-final-standardization-contracts | 111/111，CONTRACT/隔离 HTTP INTEGRATION；包括原失败机制、v2 origins、正式脚本拒绝凭据跨源、完整 350 条账本无重复/遗漏、每页 ≤16,384 bytes、查询参数 400、公共 GET/写入拒绝与 Worker 身份。未执行历史 Flowise 发布脚本。 |
| `npm.cmd run build`（Quality Portal） | 退出 0，STATIC；OpenAPI 生成、两项 TypeScript 检查及 Vite 构建通过。 |
| bundled Node20 `--test scripts/verification/rf057-quality-browser.cjs` | 1/1，BROWSER_INTEGRATION；真实 Harness 静态服务＋SQLite，不拦截/Mock API。见下方 QA。 |
| 根目录 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/rf057-bank.ps1 -Profile Authentication` | 退出 0，LIVE_BANK_AUTH：PKCE_LOGIN、REFRESH_SESSION、AUTHENTICATED_ACCOUNT_API、WRONG_PASSWORD_REJECTED、RECOVERY_WITH_CORRECT_PASSWORD、CONTROLLED_SESSION_RECOVERY。无模型调用、新 Journey 或资金动作，不能计为 LIVE_AGENT。临时身份清理回执：`agent/runs/rf057-cleanup/dc1e9fa92a6f41679a1cec6c03fae701.json`，COMPLETED。 |
| `git diff --check`（本次明确源路径） | 退出 0；保留既有脏工作区，无暂存、提交或推送。 |
| `python scripts/architecture/validate_refactoring.py --batch RF-057` | PASS，1 batch / 27 modules。 |
| `python scripts/docs/validate_docs.py` | PASS，671 metadata / 180 links。 |

初次银行认证探针登录/刷新通过后失败：测试自行裸 fetch，没有应用 bearer header，不能据此认定银行 API 缺陷；改为实际账户页面发起请求后账户 API 200、真实表格出现。第二次错误密码检查因不存在的 `#input-error` 定位停止，结构化 DOM 仅报告 `.kc-feedback-text` 存在；修正共享合同后六项通过。各失败运行都停止后续检查并清理，仅在源码修正后重跑，没有隐藏重试或续写旧通过记录。

## 前端 QA

目标：`/quality/cases` → 下一页/上一页 → 搜索原第三页的 `case_browser_044` → 第一页显示唯一真实投影结果。环境：隔离 Harness `http://127.0.0.1:58479/quality/cases`（验收后已关闭，仅关闭此测试实例），1440×1000，bundled Chromium/Playwright。Browser plugin/skill 不在可用列表，使用已安装 Playwright，不安装依赖。

页面身份、非空、无框架覆盖层、console/pageerror 健康、截图、翻页/跨页搜索、只读 GET 无 Authorization header：全部通过。截图保存在仓库外 `C:/Users/fujunye/AppData/Local/Temp/rf057-quality-pagination-desktop.png`；是隔离测试数据，不是正式 Agent 或保留生产账本的验收。未验证移动端；保留 Harness 仍为旧加载代码，新分页尚未定向部署，因此不能称生产门户已验收。沿用 React Query，查询键包含筛选和游标；筛选重置在事件处理器完成，不新增数据层或 Effect。

## 身份与下一门

非运行 v4 当前身份：`7e4cadd2db9224bd1da58ff66ca83afcbf1ead1e16dc6e9a45899285a7913214`。suite SHA256 仍为 `8a13efde39130e2842f8452f4fbb3a5208e023b5bd60bc21046c28428eb2b3de`。`node scripts/test/rf057-agent.mjs --preflight` 退出 0、`executionPerformed=false`，报告 `RUNTIME_NOT_RUNNING / LIVE_AUTHORIZATION_REQUIRED`；这是新源身份未绑定运行态的预检结果，不表示 Docker 或原 Node 进程被停止。

现场 15 个 Docker 容器均 Up，原 Harness/MCP/Worker Node PID 38872/49304/45112 仍存在。本轮未重启/停止它们；新代码指纹与旧进程绑定不符，managed status 不接受 Harness/Worker 为当前身份 owned/healthy。不能把进程存活当作新版 READY。

下一门：取得此新身份的明确受控刷新及 A01 LIVE 授权，按 public prepare 生成认证 v2 TargetProfile，再以真实 BYOK 从 A01 起重测，首次确定性失败即停。旧身份 `ec1748…a2f3d` 的授权不复用。A02–A07、S3 压力/性能、最终套件和 GO 全部仍未完成；不得据本次 6 项认证集成或 111 项回归声称其通过。
