---
id: DOC-ARCH-RF048-EVIDENCE
title: RF-048 权威与死代码收口证据
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-048 权威与死代码收口证据

## 完成谓词

- 当前状态入口只以 ReleaseIdentity v4 连接运行态和 v4 acceptance ledger。
- Flowise 不存在于当前 CI、npm 产品命令、生命周期回退、发布决策或 v4 身份清单。
- 旧 `services/bank-channel`、`apps/customer-web`、`apps/operations-web` 与 `apps/operations-console/legacy` 无运行引用且源码删除。
- 模块边界把 Flowise 标为 `HISTORICAL_READ_ONLY`。

## 改动

- 新增 `scripts/i10-agent-current-status.cjs`；`demo.ps1 status` 与 `npm run status:agent` 统一调用该入口。
- 删除 Flowise cold rollback 的生命周期、发布决策、测试和清单入口；删除当前 npm/CI 中的 Flowise/I8/I9/Agentflow 命令。
- 从 ReleaseIdentity v4 移除 Flowise portability policy 与 cold rollback descriptor，并纳入当前状态聚合器。
- 删除 46 个旧银行/静态前端源码文件，保留 `bank-channel-service` 与三个现行前端为唯一实现。
- 收敛产品 README、实施顺序和模块依赖图。

## 验证

| 层级 | 命令 | 结果 |
|---|---|---|
| STATIC | `npm run check:tests` | PASS，99 registered / 97 CI-runnable / 2 governed-runtime |
| STATIC | `npm run lint` | PASS，202 JavaScript files |
| CONTRACT | `npm run typecheck` | PASS |
| CONTRACT | `npm run test:agent-cli` | PASS，69/69 |
| CONTRACT | `node --test scripts/verification/agent-release-decision.test.cjs scripts/verification/agent-current-status-v4.test.cjs` | PASS，16/16 |
| CONTRACT | `npm run test:registered` | PASS，651/651；2 个需要治理运行时资产的 OCR 测试按清单排除 |
| CONTRACT | current-path `rg` | PASS，无旧实现路径引用；当前 CI/package/identity/release-decision 无 Flowise 入口 |
| INTEGRATION-CONFIG | 两个 `docker compose ... config --quiet` | PASS |
| RUNTIME-READBACK | `demo.ps1 status` | 银行容器全开；Harness/MCP/Worker 全部 HEALTHY；源码身份 `2af87562...5712`，运行绑定仍为 `46b5ebda...e585b`，明确报告 `STALE_SOURCE` |

## 证据边界

本批达到工程实现与 STATIC/CONTRACT/配置集成完成，状态为 `REVIEW`。未停止或重启现有服务，未改写授权变量，未冻结/激活新运行身份，未执行 LIVE_E2E 或发布。源码变化产生的新身份不得继承旧身份的 LIVE 证据。
