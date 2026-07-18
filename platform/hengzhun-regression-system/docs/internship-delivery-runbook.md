# 衡准实习交付与演示运行手册

本手册只适用于 I7 实习交付冻结。它不扩大银行业务范围，不启用衡准 UI，也不宣称目标 HiAgent 租户、网络或容量已经验证。

## 交付前置条件

- 从 `platform/hengzhun-regression-system/` 执行所有命令。
- Git 已提交且受跟踪文件工作区干净；`.data/`、`.env`、日志、运行结果和凭据不得提交。
- Docker 中存在固定的 Harness、Model Gateway、Conformance 三张 I6/I3/I1 镜像。
- 真实配置由交付现场注入，不进入离线包、验收记录或对话。

## 一键交付验收

```powershell
npm.cmd run package:i7:delivery -- -Version internship-20260718
```

该命令依次完成：

1. I1—I7 全量本机验证；
2. SQLite 在线备份、Artifact/Evidence 归档、CycloneDX SBOM 和文件 Hash；
3. 三张固定 Docker 镜像导出；
4. 交付清单与源提交一致性校验；
5. 在全新目录恢复产品、SQLite、Artifact/Evidence 并加载镜像；
6. 对恢复后的 SQLite 执行 `integrity_check` 和 schema version 检查。

结果只写入 Git 忽略的 `.data/delivery-packages/`、`.data/delivery-restores/` 和 `.data/delivery-runs/`。`delivery-acceptance.json` 只含提交、版本、计数、状态和外部待验证声明，不包含凭据或业务数据。

## 演示顺序

1. 启动复兴银行被测环境与衡准单目录运行时，确认健康状态。
2. 在 Coze 唯一入口用自然语言展示登录/个人资料案例或确定性调度案例。
3. 展示 Harness 返回的任务状态、脱敏断言、Artifact 元数据和 Hash，不展示原始凭据、Cookie 或 Storage State。
4. 展示 Schedule 只运行 `SCRIPT_VALIDATED` Playwright，正式调度不调用 LLM/Midscene。
5. 展示离线包清单、SBOM、恢复验收状态和外部待验证边界。

## 失败处理

- `DELIVERY_SOURCE_NOT_CLEAN`：先审查并提交合法变更，不自动清理或覆盖用户文件。
- `DELIVERY_IMAGE_SET_INCOMPLETE`：补齐固定镜像后重新打包，不以无镜像包作为正式交付。
- `DELIVERY_SOURCE_COMMIT_MISMATCH`：删除本次未发布的本机包目录后，从正确提交重新生成；不得修改清单伪造一致性。
- 目标内网无法连接 HiAgent：保持 `PLAT-V010` 未验证，先完成现场 DNS、TLS、路由和鉴权设计，不降级为公网穿透。
