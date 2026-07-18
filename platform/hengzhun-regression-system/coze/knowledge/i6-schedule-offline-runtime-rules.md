# 衡准 I6 调度与离线交付运行规则

运行门禁锚点：`kb:i6-schedule-offline:v1#runtime-gates`

- Harness SQLite 是 Schedule、执行、失败暂停与恢复决策的唯一运行态权威。
- 五字段 Cron 必须同时声明 IANA 时区；首版环境只能是 `local`。
- 正式调度只执行 `SCRIPT_VALIDATED` 的 Playwright 脚本；不得调用 LLM、Midscene 或视觉模型。
- 同一环境与夹具作用域最多一个 `QUEUED` 或 `RUNNING` 运行。冲突必须记录为互斥跳过，不得并发执行。
- `SKIP` 对超过宽限期的触发只记跳过；`RUN_ONCE` 将停机期间的旧触发合并为一次补跑。
- 仅瞬态基础设施故障可按配置重试；业务断言、基线、定位器或最终失败必须暂停 Schedule 并创建 FailureIncident。
- Schedule 恢复必须由用户在 Coze 明确批准，使用当前版本提交 `SCHEDULE_RECOVERY` 决策并回查状态。
- 离线包由本机脚本生成与恢复，不通过 Coze 工具传输。包必须包含版本、Hash 清单、SBOM、SQLite 备份、Artifact/Evidence 备份和镜像 tar；不得包含 `.env`、Token 或凭据。
