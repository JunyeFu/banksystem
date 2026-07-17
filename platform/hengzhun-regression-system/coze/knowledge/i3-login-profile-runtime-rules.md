# I3 门户登录回归运行规则

## 用途

本知识条目支撑“门户账号密码登录后，页眉姓名、头像与个人资料一致”的第一条纵向回归案例。发布到 Coze Knowledge Base 后，它才是运行时知识；仓库文件只是可审查的导入源。

## 运行边界

- 用户入口和主控 Agent：Coze。
- 安全、任务、状态、证据和审计：衡准 Harness。
- 正式浏览器执行与断言：Playwright Worker。
- 被测系统：复兴银行门户。
- 正式回归不调用 LLM 或 Midscene。
- 凭据只使用 `customer-synthetic-01` 形式的别名，禁止传递账号密码原文。

## 七工具顺序

`case_create_draft -> case_get -> plan_compile -> run_submit -> task_get -> artifact_get_metadata -> decision_submit`

`task_get` 必须使用首次 `run_submit` 返回的同一 `taskId + namespace`。对话中断后继续查询，不得用新的幂等键重复创建案例、计划或运行。

## 案例断言

1. 门户账号密码登录成功。
2. 页眉显示非空的当前账户姓名。
3. 个人资料显示非空姓名。
4. 页眉姓名与个人资料姓名相等。
5. 头像字符与当前姓名首字符一致。

## 证据与结果

通过至少需要：脱敏 JSON 报告、遮罩截图、脱敏步骤日志。Harness 返回 Artifact 元数据和 SHA-256，不向 Agent 暴露本机路径或可下载文件。

- 断言失败：`TEST_FAILURE`。
- 环境、服务、固定运行时或凭据别名不可用：`ENVIRONMENT`。
- 证据少于规定集合：`EVIDENCE_INCOMPLETE`，不得标记通过。

引用标识：`kb:i3-login-profile:v1#identity-consistency`。
