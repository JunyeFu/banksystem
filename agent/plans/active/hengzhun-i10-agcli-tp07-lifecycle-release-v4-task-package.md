---
id: HENGZHUN-I10-AGCLI-TP07-LIFECYCLE-RELEASE-V4-001
title: CLI lifecycle and ReleaseIdentity v4
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP07：生命周期与 ReleaseIdentity v4

目标：正常生命周期以 CLI/Controller/MCP/Harness/Worker 为唯一链，并冻结 v4 身份。业务规则：正常 START 不启动 Flowise；检测到意外 Flowise 时禁止写；Node24.19、锁、schema/policy/prompt/lifecycle 均入身份，秘密/用户数据不入身份。易错点：旧服务残留、身份漏文件、生成物非确定、冷回滚与正常启动共用开关。

实现模板：managed process spec → health/ownership → Flowise absence gate → release code sets → identity v4 comparator → package manifest → cold rollback descriptor。Done：受控输入单点漂移必变身份，旧证据 stale，Stage9/doctor/ownership 离线门通过；不得在本包启动或发布。

执行批次：`RF-022/S1`。TP06 离线验收已通过；本批建立无 Flowise 正常生命周期、冷回滚隔离描述与 ReleaseIdentity v4，仅执行静态/隔离门，不启动、停止或发布服务。

完成事实（2026-08-26）：RF-022 已关闭；生命周期/v4 12/12、CLI 合计 34/34、完整注册套件 524/524。正常计划仅含 CLI、Harness、MCP、Worker；真实只读 doctor 证明 Flowise 进程/端口均缺席。v4 源码冻结候选为 `b709dfa998672354004547df5e43b739404e4650a6146bcb7966b2321ff5766e`（115 文件），状态明确 `SOURCE_FROZEN_UNBOUND`，不是可发布/LIVE 身份；配置模型绑定后必须重算并冻结新身份。
