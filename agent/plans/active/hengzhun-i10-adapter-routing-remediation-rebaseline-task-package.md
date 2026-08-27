# 衡准I10适配器路由修复与LIVE_E2E重基线任务包

状态：`AWAITING_USER_APPROVAL`

## 1. 触发原因

P3在M3 `TEXT_WITH_IMAGE`链路发现确定性编译缺陷：`fuxing-bank-demo`适配器绑定会把非登录案例错误选择为`LOGIN_PROFILE`。源码修复已构建并通过57项聚焦测试，但当前受管服务仍运行旧ReleaseIdentity，旧账本不能证明修复生效。

## 2. 授权边界

本任务在获得单独批准前不得执行运行态重载或LIVE_E2E。批准后只允许：

1. 分类并保护现有脏工作区，不覆盖无关改动。
2. 运行Builder、TargetProfile、Stage8和18链合同测试。
3. 以受管命令重载当前已验证代码，应用既有迁移，不修改密钥和凭据。
4. 通过Flowise公共API回读当前流程版本、部署状态和规范化Hash。
5. 冻结新的ReleaseIdentity；旧身份记录自动成为历史事实，不迁移为新身份通过项。
6. 在新身份下依次执行P0、P1、P2、P3，任一链首次失败立即停止。
7. 仅当新身份下12条业务语义正确的LIVE_E2E均通过时，才允许申请P4授权。

## 3. 必须验证的回归点

- L1仍选择`LOGIN_PROFILE`。
- L2、L3、M1、M2、M3均不得因适配器绑定而选择登录模板。
- M3执行计划必须包含文档查询与结果核验，不得包含`HEADER_DISPLAY_NAME`、`HEADER_AVATAR`或个人资料一致性比较。
- 作者化失败必须直接报告`I10_STAGE8_AUTHORING_FAILED_NO_IMPLICIT_RETRY`和诊断制品，不得误报调度终态缺失。
- 每条新记录必须具有作者化、确定性Builder、纯Playwright、I10_2X2_V1、激活、正式执行、结果收件箱与Artifact证据。

## 4. 完成谓词

```text
managedRuntimeLoaded = true
flowisePublicReadbackFresh = true
newReleaseIdentityFrozen = true
trustedCurrentPassed = 12/18
L1-L3-M1-M2-M3 text/image pairs = SEMANTIC_MATCH
P4 = NOT_STARTED
```

下一阶段：用户批准本任务后，先执行受管重载和新ReleaseIdentity薄基线；薄基线通过后再逐条重验P0-P3。
