---
id: EVIDENCE-HENGZHUN-I7-20260718
title: 衡准 I7 实习交付冻结与可复现验收证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-18
owner: 傅钧烨
---

# 衡准 I7 实习交付冻结与可复现验收证据

## 1. 公正结论

I7 已完成实习交付范围冻结、一键 I1—I7 验收、脱敏机器记录、完整三镜像离线包和全新目录恢复演练。衡准自动化回归测试系统已具备从干净源提交生成可校验交付物并恢复本机运行数据基础的能力。

本结论只覆盖本机 Coze 演示与衡准单目录交付。`PLAT-V007` 目标租户容量、`PLAT-V010` 目标 HiAgent 网络和云端生产就绪仍未验证。

## 2. 冻结范围

- 交付包含 Coze 唯一入口、Harness/SQLite、Playwright/Midscene 风险路由、确定性调度、脱敏 Artifact/Evidence 和离线迁移。
- 不扩建复兴银行业务，不实现或启用衡准 UI，不把仓库 `docs/`/`rag/` 作为运行时知识源。
- 平台新增持久状态继续只使用 `regression_platform.sqlite`；既有银行核心数据库不进入衡准交付包。
- `.env`、凭据、Cookie、Storage State、日志、运行目录和缓存不进入受跟踪产品内容或正式离线清单。

## 3. 自动验收结果

`npm run verify` 已覆盖 I1—I7 并返回 `HENGZHUN_I1_I2_I3_I4_I5_I6_I7_INTERNSHIP_DELIVERY_BASELINE_VERIFIED`：

- I2 共 13 项测试通过；首次全量运行观察到一次 Windows 本机 HTTP keep-alive 复用竞态，测试连接改为显式关闭后连续 5 次重复运行和后续两次全量运行均通过。
- I3 共 7 项、I4 共 3 项、I5 共 2 项、I6 共 5 项、I7 共 1 项测试通过。
- I7 校验 5 份既有 verified 证据、14 个 OpenAPI operation、Coze 插件 v0.0.10、平台出口 `CLOSED` 和产品目录受跟踪路径安全边界。
- 机器验收记录仅包含提交、版本、计数、状态和外部待验证声明；敏感值模式检查为 0。记录位于包外的 `.data/delivery-runs/`，正式包目录只保留 Manifest 管辖文件。

## 4. 正式离线包与恢复

正式命令：

```powershell
npm.cmd run package:i7:delivery -- -Version internship-20260718-i7-9fd30bf
```

验收事实：

- 源提交：`9fd30bfb5d537dd596d624b51b06e22bf72d495c`，生成时受跟踪工作区干净；
- 包版本：`internship-20260718-i7-9fd30bf`；
- Manifest：`hengzhun-offline-manifest-v1`，数据库引擎 `sqlite`，`secretMaterialIncluded=false`；
- 三张固定镜像齐全：Harness、Model Gateway、Conformance；
- 清单包含 8 个文件，总字节数 `1078602394`，覆盖产品归档、镜像归档、SQLite 备份、Artifact/Evidence 归档、SBOM、镜像元数据和恢复脚本；
- 全部 Hash 通过，三张镜像在恢复流程中成功加载；
- 全新目录中的 SQLite `integrity_check` 通过，schema version 为 8。

生成包、恢复目录和机器验收记录均位于 Git 忽略的 `.data/`，不作为源码提交。

## 5. 剩余边界

- 目标 HiAgent 的 DNS、TLS、路由、鉴权与租户容量必须在实际公司环境验证。
- 现场凭据按部署环境单独注入；本次包不携带凭据，因此不把恢复后的真实上游登录宣称为已验证。
- 当前系统 npm 12 对固定 Node 20 显示兼容性警告；项目命令实际使用产品内 Node v20.20.2，I1—I7 验收均通过。后续应冻结与 Node 20 相容的 npm CLI，避免系统 npm 警告干扰演示。
