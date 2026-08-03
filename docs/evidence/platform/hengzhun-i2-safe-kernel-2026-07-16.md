---
id: EVIDENCE-HENGZHUN-I2-20260716
title: 衡准 I2 Harness 最小安全内核落地证据
document_type: evidence
domain: regression-platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-16
owner: 傅钧烨
---

# 衡准 I2 Harness 最小安全内核落地证据

## 1. 结论

I2 的 Harness 侧退出条件已经关闭：TypeScript/Node 服务、唯一 SQLite 产品库、七工具 OpenAPI、服务令牌、内部客户端 allowlist、请求 Schema、幂等、任务/运行标识、不可变审计、Artifact/Evidence 元数据、输出预算和完整性/备份能力均已实现并通过自动测试。

`PLAT-V004` 仅完成 I2 要求的无副作用可导入契约验证。Coze Studio 0.5.1 的资源库可显示插件资源类型，源码也存在插件创建表单，但当前公开运行界面的“资源”菜单无法展开到创建表单；因此真实导入、发布和七工具调用继续作为 I3 的强制门禁，不在本证据中宣称通过。

## 2. 实现边界

- 产品根：`platform/hengzhun-regression-system/`。
- 唯一持久化数据库：`.data/sqlite/regression_platform.sqlite`。
- 数据库内容：案例、版本、计划、任务、运行、决策、Artifact、Evidence、幂等记录、安全事件和审计事件。
- 文件边界：Artifact 原始字节只写入 `.data/artifacts/`；数据库保存元数据、SHA-256 和受管相对路径。
- 对外边界：Harness 只在 `hengzhun-control` 内部网络监听 `18788/tcp`，没有宿主机端口映射。
- 不在 I2 内：Playwright Worker、真实银行页面执行、Coze 插件发布、真实七工具调用、Midscene 和自动修复。

## 3. 数据与安全约束

- SQLite 启用 WAL、外键、`busy_timeout`、事务迁移和单写入队列。
- 启动和健康检查执行 SQLite `quick_check`；测试覆盖备份 API、恢复、重启和完整性检查。
- `namespace + runId` 贯穿任务、运行、Artifact、Evidence 和审计事件；读取按 namespace 隔离。
- 服务令牌只从机器本地运行环境注入；验证与证据不记录值。
- 缺失、错误和已轮换令牌稳定拒绝；错误响应不包含凭据或本机路径。
- 请求由 Zod Schema fail-closed；同一幂等键同一载荷重放、不同载荷冲突。
- 审计表通过触发器禁止更新和删除。
- L0/L1/L2/L3 输出预算分别为 8/16/64/128 KiB，绝对上限 128 KiB，按压缩前 UTF-8 JSON 字节计算。

## 4. 自动验证

在产品根执行 `npm run verify:i2`，结果：

- TypeScript 编译通过。
- OpenAPI 3.0.3 校验通过，精确包含 7 个唯一 `operationId`。
- Node 测试 12/12 通过、0 失败。
- 覆盖 SQLite 配置/迁移/并发单写、外键/回滚、不可变审计、备份恢复、鉴权负测、七工具 HTTP 契约、幂等、namespace 隔离、Artifact 路径隐藏、Schema fail-closed、L0-L3 字节预算和分页。
- `npm audit --omit=dev`：0 个生产依赖漏洞。

固定制品 Hash：

- OpenAPI：`25db3a642526bb621fca45260330ad6c43c794b56a813661aedd104df99984f7`。
- 首版迁移：`7b0314002b2cbbb481466fff54efba74b5253f0f3c44c07fd8f3a5f68420d22b`。
- 本次 Harness 源码与 I2 测试聚合 Hash：`9446e2192766f04b370f41f2f34db64d010acf53596b21c1270a4a3fa6d0ac05`。

## 5. 运行态验证

2026-07-16 本机运行态检查：

- `hengzhun-harness` 为 `healthy`。
- Coze 服务容器通过内部 DNS `hengzhun-harness:18788` 获取健康结果，数据库引擎为 SQLite，`quick_check` 返回 `ok`。
- `docker port hengzhun-harness` 无输出，证明没有发布宿主机端口。
- 有效机器令牌访问不存在案例得到业务级 `404`；缺失令牌得到鉴权级 `401`，响应不含令牌值。
- `.data/sqlite/regression_platform.sqlite` 已由容器在受管目录创建；`.data/`、`dist/` 和 `node_modules/` 均由 Git 排除。
- Docker Desktop 重启后，Coze、衡准服务及原有 `mifos-channel`/`mifos-isolated` 项目服务均已恢复；未删除容器或数据卷。

## 6. 平台门禁状态

| 门禁 | I2 结论 | 说明 |
|---|---|---|
| `PLAT-V004` | `PARTIALLY_VERIFIED` | 七工具契约和无副作用静态导入校验通过；真实 Coze 导入/发布/调用留到 I3 |
| `PLAT-V005` | `HARNESS_VERIFIED` | Harness 鉴权正负测、轮换负测和运行态缺失令牌负测通过；Coze 公开配置注入仍随 I3 Plugin 联调复验 |
| `PLAT-V008` | `HARNESS_VERIFIED` | Harness L0-L3、UTF-8、多页和绝对上限测试通过；Coze 节点实测上限留到 I3 |

## 7. 下一步

进入 I3 第一个纵向闭环：从 Coze 自然语言入口，通过公开 Plugin 调用 Harness，再由 Playwright Worker 执行“客户登录与个人资料一致性”案例。I3 必须真实关闭 `PLAT-V004`，并完成 `PLAT-V011` 会话恢复和 `PLAT-V012` 首版知识检索审计链。
