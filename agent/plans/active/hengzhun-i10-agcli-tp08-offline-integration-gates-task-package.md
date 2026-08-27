---
id: HENGZHUN-I10-AGCLI-TP08-OFFLINE-INTEGRATION-GATES-001
title: Offline integration and release gates
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP08：离线集成与上线门

目标：形成同一 v4 候选身份的合同、集成、安全、供应链、恢复与打包证据。业务规则：测试证据按等级分离；临时 DB/目录；不读取正式凭据或提升历史 LIVE。易错点：mock 代替真实 native/DPAPI、只跑聚焦测试、dirty tree 夹带、缓存 audit 冒充实时。

实现模板：contract matrix → synthetic integration → DPAPI restore → supply-chain closure → portable package → install/doctor smoke → evidence index。Done：聚焦与完整注册套件、秘密扫描、SBOM/lock、恢复演练、Stage9 全绿；账本仍 `0/18`。

执行批次：`RF-023/S1`。TP07 已关闭；本批只使用临时目录、真实 CurrentUser DPAPI 与注入式模型/MCP，不启动服务、不读取正式凭据、不写正式 `.data`，不执行 LIVE 或发布。

完成事实（2026-08-26）：RF-023 已关闭本地离线工程。CLI 已接入 Controller v2 生产组合端口；Flowise 缺席是所有本地/远程写之前的硬门；真实 DPAPI 重启恢复与精确批准只执行一次注入式 MCP 写，已结算提案的重放在 Controller 重建前被拒绝。CLI 38 项、Controller 52 项、完整注册套件 525/525、供应链与秘密扫描均通过；CycloneDX SBOM 覆盖 141 个组件。当前 v4 源码候选 `45f1b937...3ed60b` 覆盖 118 文件但仍为 `SOURCE_FROZEN_UNBOUND`。Stage9 因共享 dirty tree 返回 `I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN` 且未创建产物；账本仍 `0/18`，不得作为 LIVE 或发布证据。

离线闭环补充（RF-024-S1B/S1C，2026-08-26）：production TUI、同 Journey 续聊分叉、待决审批门与只读 evidence 已进入集成矩阵；`evidence` 仅调用 `journey_get` 并对白名单工件字段投影，不返回 href/download grant。`credential enroll` 与 `/credential` 已绑定独立的 DPAPI 加密 `CREDENTIAL_ENROLLMENT` 操作，不伪造 Journey：首次命令零 MCP，HIGH 精确批准后 `credential_session_create` 最多一次，经过严格校验的 loopback capture URL 仅瞬时交给本机浏览器启动器，永不写入状态或 JSONL。离线 integration 15/15、headless 13/13、TUI 14/14、加密状态存储 15/15、完整注册套件 532/532 均通过。S1C 完成时源码候选为 `0c864c0b...2fc903a`（122 个受治理文件），状态 `SOURCE_FROZEN_UNBOUND`；后续 RF-025 已产生新的源码候选，此处仅保留切片完成快照。尚无真实本机表单、浏览器、凭据捕获、模型、服务或 LIVE 证据。
