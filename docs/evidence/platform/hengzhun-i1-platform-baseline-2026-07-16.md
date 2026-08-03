---
id: DOC-EVIDENCE-HENGZHUN-I1-PLATFORM-20260716
title: 衡准 I1 平台基础与公开界面验证记录
document_type: report
domain: evidence
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-16
owner: 傅钧烨
---

# 衡准 I1 平台基础与公开界面验证记录

## 验证结论

I1 的机器基础已真实实现并可重复启动：单目录产品、固定 Node/Playwright/Midscene/Chromium 运行时、固定镜像 Coze Studio 0.5.1、合成一致性服务、OpenAPI 样例、内部控制网络、最小 Agent、合成 Knowledge Base 和最小 Workflow 均已落地。

I1 平台退出门禁未全部关闭。当前 Coze Studio 公开界面没有与 HiAgent 相同结构的 Skill 包上传入口，且 Plugin 资源页未进入可用的创建或 OpenAPI 导入表单，因此不能把 Skill 直接迁移、OpenAPI 参数实调或同步超时窗口写成已通过。

## 实际实现

- 使用固定源码修订和 11 个 SHA-256 固定镜像部署 Coze Studio 0.5.1，控制台为 `http://127.0.0.1:8888/`。
- 生成的本地账号与运行配置只进入 `.data/` 忽略目录；验证过程不输出凭据内容。
- `hengzhun-control` 为内部 Docker 网络，仅允许 Coze 服务与 `hengzhun-conformance` 合成服务加入。
- 合成服务提供健康、支持状态、Bearer 保护的 query/path/header/body 回显、JSON 类型回显、1/30/60/120 秒延迟、机械对话、向量和指标端点。
- 请求上限为 64 KiB，工具响应预算为 4 KiB；机械模型只处理固定合成口令，不访问银行系统和本机文件。
- OpenAPI 3.0.3 样例覆盖 query、path、header、JSON body、string、integer、number、boolean、array、object、两级嵌套和 Bearer。
- 通过公开界面创建并发布最小 Agent；机械模型对固定合成口令返回固定结果。
- 创建并绑定合成 Knowledge Base，资料明确 Coze Knowledge Base 是运行时权威，仓库 `docs/`、`rag/`、`documents/` 只服务开发。
- 创建、连接、试运行并发布两节点 Workflow，固定合成结果无需模型推理。

## 自动验证

- 一致性服务单元测试：5/5 通过。
- 固定运行时：Node 20.20.2、Playwright 1.59.1、Midscene 1.10.5、Chromium 147.0.7727.15 与 FFmpeg 验证通过。
- Compose：所有镜像均使用 SHA-256 固定，不含 `latest`。
- 运行容器：Coze 及其依赖和合成一致性服务就绪；既有复兴银行容器未被停止、删除或改网。
- 内部网络：成员严格为 Coze 服务与合成一致性服务；健康、回显、机械对话和向量探针通过。
- 可提交结果：`platform/hengzhun-regression-system/tests/conformance/results/PLAT-V001.json` 等 6 个文件通过敏感字段与 Hash 格式校验。

## 平台一致性结果

| ID | 结果 | 结论 |
|---|---|---|
| `PLAT-V001` | `FAIL` | 公开界面无同结构 Skill 包上传、解析和发布路径 |
| `PLAT-V002` | `PARTIALLY_VERIFIED` | 无隐式本地文件/MCP 权限；Plugin 等价路径未完成 |
| `PLAT-V003` | `PARTIALLY_VERIFIED` | OpenAPI 与服务通过，平台导入/逐字段调用未完成 |
| `PLAT-V006` | `BLOCKED` | 延迟端点已就绪，真实 Coze 同步窗口因 Plugin 入口阻塞无法测量 |
| `PLAT-V009` | `RUNTIME_VERIFIED` | 本机内部网络与受控探针通过 |
| `PLAT-V013` | `PARTIALLY_VERIFIED` | Agent/模型/Knowledge Base/Workflow 通过，Skill/Plugin 交集未闭合 |

## 证据与安全边界

原始公开界面截图保存在 `.data/evidence/conformance/`，不入库。可提交 JSON 只保存制品 Hash、截图 Hash、平台版本、测试时间、结论和影响，不保存账号、密码、Cookie、Token、绝对敏感路径或平台内部标识。

本记录不证明 I2 Harness、SQLite、七工具正式契约、Worker 或首个银行纵向案例已完成。它允许继续无依赖的 I2 安全内核工作，但不允许绕过公开界面、写 Coze 内部数据库、调用私有管理接口或将失败项标记为通过。
