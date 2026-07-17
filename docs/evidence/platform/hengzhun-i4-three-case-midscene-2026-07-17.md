---
id: EVIDENCE-HENGZHUN-I4-20260717
title: 衡准 I4 三案例与 Midscene 作者化验收证据
document_type: evidence
domain: platform
status: verified-with-platform-blocker
version: 1.0
effective_date: 2026-07-17
owner: 傅钧烨
---

# 衡准 I4 三案例与 Midscene 作者化验收证据

## 1. 验收结论

I4 的 Harness、SQLite、Worker、三条确定性 Playwright 案例、三动作窗口、Midscene 能力门禁和人工脚本激活门禁已真实落地。本机运行面通过，Coze 公开平台面未关闭：当前 Coze Studio 0.5.1 资源库未显示 Harness 插件，公开创建入口也未提供插件类型，因此不能把 I4 Agent 标记为已绑定、已发布或可作为唯一运行入口。

## 2. 三条确定性案例

| 执行 Profile | 结果 | 关键断言 |
|---|---|---|
| `LOGIN_PROFILE` | `SUCCEEDED` | 门户账号密码登录，页眉姓名、头像与个人资料一致 |
| `ACCOUNT_OWNERSHIP` | `SUCCEEDED` | 自有账户列表/详情一致，越权账户标识安全拒绝 |
| `AUTH_REJECTION_RECOVERY` | `SUCCEEDED` | 错误凭据拒绝、正确凭据恢复、会话丢失后再次恢复 |

三条案例均使用独立 BrowserContext、Fixture 命名空间和脱敏证据。运行证据 SHA-256：`76e391ed180f84e1ca82db9a03fa4f147b8ae84faa774a6b62a0013dc0f278d7`。

## 3. 作者化与激活门禁

真实作者化任务保存完整行动计划，Worker 每次只获得 previous/current/next 三动作窗口。三步完成后任务进入 `WAITING_USER`，`userActionRequired=true`，未自动激活候选脚本，且证据不含凭据。作者化证据 SHA-256：`d1220dca13827578ba347f5562e8085be57a7d5121b7680ebe596c9e7b313b24`。

## 4. PLAT-V014 实测

| 原子动作 | 视口 | 尝试 | 通过 | 失败 | 错误自报成功 | 结论 |
|---|---:|---:|---:|---:|---:|---|
| `LOCATE` | 5 | 10 | 8 | 2 | 1 | `DEGRADED`，禁止 Midscene 执行，退化为 `PLAYWRIGHT_ONLY` |
| `INPUT` | 5 | 10 | 10 | 0 | 0 | `VERIFIED` |
| `TAP` | 5 | 10 | 10 | 0 | 0 | `VERIFIED` |
| `SCROLL` | 5 | 10 | 10 | 0 | 0 | `VERIFIED` |

模型实测证据 SHA-256：`8886da935c39a0a925d8c9d7264a192162e035e7575ac9d43e41f62ad721156b`。Harness 只允许 `VERIFIED` 动作进入 LOW/MEDIUM 作者化路线，并要求 Playwright 独立验证 DOM、URL、请求和业务状态；失败、歧义或错误自报成功不会推进游标。高风险动作在 LOCATE 降级期间全部使用纯 Playwright。

## 5. 平台公开界面复核

2026-07-17 通过 Coze Studio 0.5.1 公开界面复核：资源库存在 I3 知识库和 I1 工作流/知识库，但插件筛选为空；Agent 添加插件弹窗搜索“衡准”返回“没有找到内容”；全局公开创建入口只显示智能体和应用。未调用私有管理 API、未写平台数据库、未挂载代码、未读取或输出令牌。

Coze Studio 官方功能清单声明资源库支持创建和管理插件，官方插件配置说明也把自定义插件定义为当前工作空间内创建和配置的资源。因此当前缺失被分类为部署配置或公开界面异常，而不是把自定义插件从目标架构删除。依据：[`coze-dev/coze-studio` 功能清单](https://github.com/coze-dev/coze-studio#feature-list)、[官方 Plugin Configuration](https://github.com/coze-dev/coze-studio/wiki/4.-Plugin-Configuration)。

因此：历史 I3 运行证据仍保留为当时的验收记录，但当前平台状态已发生漂移；在重新通过公开界面导入并绑定七工具插件前，I4 的 `platformConfigurationPublished` 必须保持 `false`，I5 不得启动。

## 6. 验证边界

- TypeScript 构建、I2/I3/I4 自动测试、OpenAPI 与结构校验必须全部通过。
- 银行通道服务以 Docker Java 21 构建验证；宿主 Maven 受本机 JDK 版本限制，不作为代码失败。
- 原始日志、截图、SQLite、运行态任务和模型响应只保存在忽略的 `.data/`，仓库仅提交结论与 Hash。
