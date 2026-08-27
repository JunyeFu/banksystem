---
id: HENGZHUN-I10-AGCLI-TP04-DPAPI-SESSIONS-001
title: DPAPI session persistence
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP04：DPAPI 会话持久化

目标：为单 Windows 用户实现可恢复、可审计、默认 30 天的加密会话。业务规则：事件/checkpoint/批准密文保存；明文仅安全元数据；批准 TTL 5 分钟；fork 不继承 pending approval。易错点：原始路径/输入进入索引或日志、DPAPI 解密失败后静默新建、跨 identity resume。

实现模板：versioned envelope → CurrentUser DPAPI adapter → atomic write → safe index → hydrate validation → retention/archive → restore drill。允许新 session 模块及 controller glue/tests/RF；禁止凭据导出、机器级密钥、`.data` 正式库。Done：重启恢复、断电原子性、跨用户/篡改/过期/版本漂移负测通过，秘密扫描无明文。

执行批次：`RF-019/S1`。TP03 离线验收已通过；本批仅在测试临时目录实现 CurrentUser DPAPI 会话、加密 checkpoint/proposal vault 和恢复演练，禁止写正式 `.data`、启动运行态或导出凭据。

完成事实（2026-08-26）：RF-019 已关闭；Node 20/24 会话矩阵各 10/10、Controller 75/75、完整注册套件 521/521、生产依赖审计 0 漏洞。重启精确批准、原子失败保护、篡改/身份/过期/版本漂移、归档和 fork 清门均通过。证据仅为临时目录离线集成，不构成正式数据启用、LIVE、身份冻结或发布。
