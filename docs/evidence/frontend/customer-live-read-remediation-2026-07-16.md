---
id: DOC-EVIDENCE-CUSTOMER-LIVE-READ-REMEDIATION-20260716
title: 客户门户真实读路径根因与修复证据（2026-07-16）
document_type: report
domain: evidence
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-16
owner: project-owner
---

# 客户门户真实读路径根因与修复证据（2026-07-16）

## 结论

本轮确认了三个相互独立的问题，不能合并表述为“后端接口不存在”。

| 现象 | 根因 | 责任边界 | 修复状态 |
|---|---|---|---|
| 账户、贷款返回 404 | Keycloak 登录主体未在渠道库建立 `customer_identity` 到 Fineract 客户的映射 | 本地演示身份和核心数据准备 | 代码行为符合隔离设计；当前演示用户仍需恢复并显式关联 |
| 转账列表返回 500 | `transfer_receipt.transfer_id` 为 `char(64)`，与 `transfer_order.transfer_id uuid` 比较失败 | Liquibase 存量迁移 | V8 已转换为 UUID，并恢复唯一约束和外键 |
| Keycloak 后台用户在容器重建后消失 | Compose 未挂载 `/opt/keycloak/data` 持久卷 | 本地部署 | 已增加 `keycloak_data` 命名卷；旧手工用户需一次性恢复 |

## 文档与历史证据对齐

历史报告证明过使用临时合成用户的账户、转账和贷款路径，但相关脚本会临时建立 `customer_identity` 并在结束后清理。因此这些证据只能证明接口与隔离逻辑在特定 Fixture 下可用，不能证明后台手工创建的任意 Keycloak 用户自动拥有 Fineract 客户和账户。

现行 `FE-DEFECT-003` 规划方向正确：必须在真实认证会话中区分客户端、网关、授权、身份映射、数据库迁移和下游核心。需要修正的是能力表述和验收门禁，而不是改变“Gateway → Bank Channel Service → Fineract API”的架构。

## 确认后的修复执行方案

1. 先修复会造成接口 500 的确定性数据库缺陷，并以迁移、约束和 Java 21 测试形成门禁。
2. 再补齐 Keycloak 持久卷并执行重启存活验证，禁止把容器存活误当作身份数据存活。
3. 同步 OpenAPI、生成客户端、能力矩阵、缺陷台账和全栈工作流，明确未映射身份的 404 契约。
4. 最后恢复本地演示账号，为每个客户身份建立唯一核心客户映射，再在真实登录会话中验收账户、贷款、转账列表和错误恢复。
5. 第 4 项完成前，`FE-DEFECT-003` 保持 `IN_PROGRESS`；不以 Fixture、页面截图或旧会话替代验收。

## 已实施修复

1. 保留已经执行的 V1 Liquibase 变更集，避免校验和变化。
2. 新增 `v8-transfer-receipt-reference.yaml`：迁移前检查非法 UUID、孤儿引用和重复引用；随后转为 UUID，增加唯一约束和指向 `transfer_order` 的外键；提供回滚定义。
3. 新增 Java 契约测试，验证主变更链能解析并包含 V8，且关键约束不会被移除。
4. 客户 OpenAPI 明确账户和贷款列表在身份未关联时可返回 404；`customers/me` 只表示已认证身份资料，不再错误描述为已关联核心客户。
5. Keycloak 增加命名数据卷，避免以后重建再次丢失后台用户。
6. Docker 构建跳过测试编译；测试仍由独立 Java 21 门禁完整运行，避免生产镜像构建被本机低版本 Java 或测试依赖下载偶发失败阻塞。

## 验证

- Java 21 容器：41 项测试通过，0 失败。
- Bank Channel Service：重建后健康检查为 `healthy`。
- Liquibase：`v8-transfer-receipt-reference-type` 已记录。
- PostgreSQL：`transfer_receipt.transfer_id` 为 `uuid`，且存在 `uq_transfer_receipt_transfer_id` 和 `fk_transfer_receipt_transfer_order`。
- 转账列表使用的 `transfer_order` / `transfer_receipt` 关联查询已能在 PostgreSQL 正常执行，不再发生 `character = uuid` 类型错误。
- Keycloak：OIDC discovery 在容器重启前后均返回 HTTP 200，服务恢复为 `healthy`，确认命名卷接管运行数据。
- 文档校验：`DOC_VALIDATION=PASS`，56 个元数据文档、44 个链接和 665 项陈旧性检查通过。
- 客户端：生成代码已同步 OpenAPI，14 项测试通过；客户门户生产构建通过。
- 浏览器：旧客户会话刷新后被正确导向客户门户登录页；Keycloak 管理后台旧会话也被导向后台登录页，证明重建前会话和用户数据不能继续作为验收依据。
- 待完成：恢复本次重建前的本地 Keycloak 演示用户、建立其 Fineract 客户映射，并在不读取密码或令牌的既有登录会话中验收账户、贷款和转账三页。

## 剩余风险

- 在线开户注册仍未实现；登录身份和银行核心客户关系不能自动推断。
- 其余手工创建的客户用户在恢复后仍需逐一映射到不同的合成 Fineract 客户，不能多人共用同一核心客户。
- 在完成真实认证页验收前，`FE-DEFECT-003` 保持 `IN_PROGRESS`，不得标记完成。
