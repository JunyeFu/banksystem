---
id: EVIDENCE-HENGZHUN-I4-20260717
title: 衡准 I4 三案例与 Midscene 作者化验收证据
document_type: evidence
domain: platform
status: verified
version: 1.2
effective_date: 2026-07-17
owner: 傅钧烨
---

# 衡准 I4 三案例与 Midscene 作者化验收证据

## 1. 验收结论

I4 的 Harness、唯一 SQLite、Worker、三条确定性 Playwright 案例、三动作窗口、Midscene 能力门禁、人工脚本激活门禁和 Coze 唯一入口已真实落地。Coze Studio 0.5.1 仅通过公开界面完成七工具插件、知识库和 Agent 的注册、绑定与发布；`LOGIN_PROFILE` 自然语言回归完成真实执行、会话恢复、终态查询和脱敏取证。I4 退出门禁关闭。

## 2. 三条确定性案例

| 执行 Profile | 结果 | 关键断言 |
|---|---|---|
| `LOGIN_PROFILE` | `SUCCEEDED` | 门户账号密码登录，页眉姓名、头像与个人资料一致 |
| `ACCOUNT_OWNERSHIP` | `SUCCEEDED` | 自有账户列表/详情一致，越权账户标识安全拒绝 |
| `AUTH_REJECTION_RECOVERY` | `SUCCEEDED` | 错误凭据拒绝、正确凭据恢复、会话丢失后再次恢复 |

三条案例均使用独立 BrowserContext、Fixture 命名空间和脱敏证据。运行证据 SHA-256：`76e391ed180f84e1ca82db9a03fa4f147b8ae84faa774a6b62a0013dc0f278d7`。

## 3. 作者化与激活门禁

真实作者化任务保存完整行动计划，Worker 每次只获得 previous/current/next 三动作窗口。三步完成后任务进入 `WAITING_USER`，`userActionRequired=true`，未自动激活候选脚本，且证据不含凭据。作者化证据 SHA-256：`d1220dca13827578ba347f5562e8085be57a7d5121b7680ebe596c9e7b313b24`。

本轮复验发现 MiMo 单次视觉定位可能超过原 60 秒上限；模型超时调至 120 秒后，同时把动作租约从 180 秒调至 360 秒，并使 Worker 单 Claim 异常进入租约回收而不退出。一个旧任务从遗留 `RUNNING/10%` 被真实回收后到达 `WAITING_USER/100%`，随后全新作者化验收以 3 个动作、`userActionRequired=true`、`automaticScriptActivation=false` 通过。验证脚本轮询预算已同步覆盖三动作最坏路径。

## 4. PLAT-V014 实测

| 原子动作 | 视口 | 尝试 | 通过 | 失败 | 错误自报成功 | 结论 |
|---|---:|---:|---:|---:|---:|---|
| `LOCATE` | 5 | 10 | 8 | 2 | 1 | `DEGRADED`，禁止 Midscene 执行，退化为 `PLAYWRIGHT_ONLY` |
| `INPUT` | 5 | 10 | 10 | 0 | 0 | `VERIFIED` |
| `TAP` | 5 | 10 | 10 | 0 | 0 | `VERIFIED` |
| `SCROLL` | 5 | 10 | 10 | 0 | 0 | `VERIFIED` |

模型实测证据 SHA-256：`8886da935c39a0a925d8c9d7264a192162e035e7575ac9d43e41f62ad721156b`。Harness 只允许 `VERIFIED` 动作进入 LOW/MEDIUM 作者化路线，并要求 Playwright 独立验证 DOM、URL、请求和业务状态；失败、歧义或错误自报成功不会推进游标。高风险动作在 LOCATE 降级期间全部使用纯 Playwright。

调整为 120 秒后再次启动完整 40 次 PLAT-V014，外层 15 分钟到期时仍未生成新的完整矩阵，因此本次运行不覆盖上述既有实测证据，也不提升任何动作权限。该结果作为 MiMo 性能/稳定性风险保留；正式定时回归仍只执行 `SCRIPT_VALIDATED` Playwright 脚本。

## 5. Coze 公开平台闭环

2026-07-17 仅通过 Coze Studio 0.5.1 公开界面完成：

- “衡准回归 Harness”插件导入、七工具逐一调试并发布，实际使用插件 ID `7663393319640104960`；
- “衡准-I4-三案例与作者化门禁知识库”创建、运行门禁锚点替换并绑定，知识库 ID `7663399245482819584`；
- “衡准-I4-回归主控”绑定全部七工具与知识库，收紧 `environment=local` 后发布到 API 和 Chat SDK，Agent ID `7663383450732199936`；
- 未调用私有管理 API、未写平台数据库、未挂载代码、未输出令牌、凭据、Cookie、个人信息或本机证据路径。

自然语言命名空间 `coze-i4-agent-e2e-final5` 真实命中知识库并完成案例、计划和运行提交。MiMo 在 `run_submit` 返回后的下一规划轮出现一次 provider 504；Harness 运行继续完成且没有重复提交，恢复对话使用同一任务 `task_28ce6829-8f90-4d94-8a0f-9230aa9ca055` 调用 `task_get` 和 `artifact_get_metadata`，最终状态 `SUCCEEDED`，断言为“门户账号密码登录成功，右上角姓名、头像与个人资料一致”。报告 Artifact 为 `art_00938dfa-4391-4548-8486-1ab5c6d907b1`，类型 `REPORT`、媒体类型 `application/json`、大小 2267 字节、`redactionStatus=REDACTED`，元数据不含路径或内容字段。

Agent 的非业务“用户问题建议”已关闭，避免正式回归结论生成后额外触发 MiMo。Agent 最终配置已成功提交发布，API 与 Chat SDK 均显示成功。

## 6. 验证边界

- TypeScript 构建、I2/I3/I4 自动测试、OpenAPI 与结构校验必须全部通过。
- 本轮结果：I2 `12/12`、I3 `7/7`、I4 `3/3` 通过；三条真实门户案例全部 `SUCCEEDED`；全新作者化任务通过；I4 结果聚合、七工具 OpenAPI 与目录结构校验通过。
- 银行通道服务以 Docker Java 21 构建验证；宿主 Maven 受本机 JDK 版本限制，不作为代码失败。
- 原始日志、截图、SQLite、运行态任务和模型响应只保存在忽略的 `.data/`，仓库仅提交结论与 Hash。
- MiMo 单轮规划延迟和偶发 provider 504 不改写为成功；Harness 异步任务、幂等和 `taskId` 恢复是正式容错边界。
