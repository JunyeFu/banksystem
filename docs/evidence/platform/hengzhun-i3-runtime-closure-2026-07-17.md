# 衡准 I3 纵向运行时与公开平台门禁证据

日期：2026-07-17
范围：`platform/hengzhun-regression-system/` 与复兴银行门户首条被测链路
结论：I3 运行时闭环通过；Coze 公开平台退出门禁未全部关闭，不能标记 I3 完整完成。

## 已通过的真实链路

`scripts/verify-i3-live.ps1` 使用忽略目录中的合成凭据别名提交七工具请求，由固定 Node/Playwright/Chromium Worker 新建独立 BrowserContext，在门户页面完成账号密码登录并验证页眉姓名、头像和个人资料姓名一致。最新运行结果为 `PASSED`，终态为 `SUCCEEDED`，`runVersion=3`，会话恢复为 `PASSED`，报告 Artifact SHA-256 为：

`dba536f7fdfe81d4008550cbebc4485a996f7104e8c4e2d7ca3e1190be96036b`

本证据不保存 run/task 标识、账号密码、Token、Cookie、真实个人信息、日志、截图或本机 Artifact 路径。

## 自动验证范围

- 七个公开工具按顺序真实请求 Harness；成功响应统一 HTTP 200 以匹配 Coze 0.5.1 导入边界。
- `case_create_draft` 记录 Coze Knowledge Base 来源、检索问题 Hash、结果 Hash 和引用标识，不保存检索正文。
- `case_get` 复核案例版本与凭据别名，幂等和 namespace 隔离保持生效。
- `plan_compile` 只将稳定首条案例路由到 Playwright。
- `run_submit` 生成唯一 runId、taskId 和 Fixture 命名空间，队列状态只存在 SQLite。
- Worker 使用独立 Bearer 通道、租约与重领机制；公开服务令牌不能领取任务。
- 通过结果必须同时包含报告、遮罩截图和脱敏日志；证据不完整被 fail-closed 拒绝。
- `task_get` 允许新会话用同一 `namespace + taskId` 恢复查询，不重复创建运行。
- `artifact_get_metadata` 返回 Hash 和脱敏元数据，不返回文件路径或文件字节。
- `decision_submit` 使用最新 `runVersion`，版本冲突保持 fail-closed。

验证入口：

- `npm run verify:i3`
- `scripts/verify-i3-live.ps1`
- `verify.cmd`

## Coze 公开界面结果

已完成：

1. 创建“衡准-I3-回归主控”Agent，并写入 I3 主控 Prompt。
2. 创建“衡准-I3-门户登录回归知识库”，导入 929 Bytes 内容并完成 2 个自动分段，随后绑定 Agent。
3. 创建 `hengzhun_i3_first_vertical` Workflow 草稿；当前只有开始/结束节点。
4. 通过公开 UI 导入“衡准回归 Harness”插件，并配置 Service/Header/Bearer 认证。
5. 从 Coze Server 容器访问 `http://hengzhun-harness:18788/health` 成功，SQLite quick check 为 `ok`。

导入中发现并已修复的契约兼容缺口：

- Coze 0.5.1 每个操作只接受文档化的 `200` 响应。
- 该版本在转换 OpenAPI Schema 时不能接受 `additionalProperties`。

当前硬阻塞：插件导入后能在资源库看到，但点击插件进入公开编辑页显示“无法查看智能体”。因此无法通过公开界面调试、发布或把插件附加到 Agent；Agent 插件选择框也检索不到这个未发布草稿。未调用私有管理 API、未修改 Coze 数据库、未挂载代码绕过发布流程。

## I3 退出标准判断

| 条件 | 结论 |
|---|---|
| SQLite 唯一运行时事实源 | 通过 |
| 真实门户登录和资料一致性 | 通过 |
| Playwright 断言与三类脱敏证据 | 通过 |
| 幂等、隔离、鉴权、租约和四类结果 | 通过 |
| 会话恢复 `PLAT-V011` | 运行时通过 |
| 知识审计 `PLAT-V012` | 运行时通过；平台知识已处理并绑定 |
| 三个 Skill 可打包且小于 10 MiB | 通过 |
| 三个 Skill 公开上传、调试、发布 | 阻塞：Coze 0.5.1 无对应公开入口 |
| Plugin 公开 OpenAPI 导入 | 通过 |
| Plugin 调试、发布、绑定 Agent | 阻塞：公开编辑页不可用 |
| Coze Agent 七工具真实调用 `PLAT-V004` | 未通过 |
| Coze 唯一入口的最终对话返回 | 未通过 |

下一动作不是扩展银行业务或进入 I4，而是修复/升级 Coze 公开插件编辑发布能力，或在同版本公开界面获得可用编辑入口；随后绑定插件、补齐 Workflow 七节点、发布 Agent，并从 Coze 对话重新执行七工具、会话恢复与知识引用验收。
