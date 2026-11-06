---
id: NORM-DELIVERY
title: 候选交付与操作规范
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.1
effective_date: 2026-11-06
owner: Codex
---

# 候选交付与操作规范

## 交付结论

截至2026-11-06，产品仍为NO_GO。本机源码及隔离集成已有证据，最终候选、安全与许可、同身份正式28项、真实容量和远端CI尚未全部闭合。本文给出候选环境的操作说明，不是已批准投产的实施单；具体未完成项见[验收记录](acceptance-and-handover.md)。

## 环境与本地配置

支持边界为Windows 11和Docker Desktop。Java、Node、浏览器、基础镜像使用[版本锁](../../../infra/versions.lock.yaml)及各包锁；Agent的Node20原生SQLite与Node24 CLI/覆盖岗位不可混用。机构Linux、服务器网络与调度权限没有实际适配证据，不宣称可直接部署。

唯一BYOK配置为HENGZHUN_MODEL_NAME、HENGZHUN_MODEL_BASE_URL、HENGZHUN_MODEL_API_KEY。密钥和演示凭据仅由既有本地配置/登记入口保存，模型、源码、截图和文书不包含其值；仓库不提供通用密码。准备过程只探测配置端点，不切换模型或模拟服务。具体启动入口见[产品README](../../../README.md)和[Agent说明](../../../platform/hengzhun-regression-system/README.md)。

## 新环境操作

以下是待交付候选的操作序列，本轮资料维护未执行这些命令：

```powershell
.\demo.ps1 prepare
.\demo.ps1 up
.\demo.ps1 status
.\demo.ps1 run-golden-path
.\demo.ps1 verify
```

prepare准备锁定工具/镜像和本地配置；up启动服务；status显示健康、访问地址、身份和模型绑定。run-golden-path会在合成银行账户间真实转账并改变余额，必须使用获准样本，不能当只读健康探针。verify读取正式证据并调用Harness唯一验证器：成功退出0，缺证据或门失败退出5。服务健康不能代替verify的发布结果。

| 使用者界面 | 默认本机地址 | 职责 |
|---|---|---|
| 客户门户 | http://127.0.0.1:18082/portal/ | 登录、账户及业务操作 |
| 运营控制台 | http://127.0.0.1:18083/ops/ | 运营查询与受权操作 |
| Quality | http://127.0.0.1:18788/quality/ | Harness脱敏只读投影 |
| Agent会话工作台 | http://127.0.0.1:18790 | 对话、历史、模型配置及执行结果，需启动网页服务 |

浏览器银行链固定为Gateway→Bank Channel→Fineract；Mifos原生管理页只作为可选管理员工具，不进入默认产品链。Flowise不启动、不回退。Quality不持有服务token，也不批准测试或修改调度。

## 源码与运行候选

2026-11-06依赖升级后，独立候选实际通过build/typecheck/lint/清单发现、841项registered及原覆盖门，覆盖59.80/74.37/62.53；两份陈旧生成合同已修，见[完整源码回执](../../architecture/refactoring/batches/RF-065/ci-complete-20261105.md)。依赖声明、锁、安装字节和运行绑定分别核对：隔离副本安装通过不能证明原在用依赖已经部署。

完整CI职责包括合同/迁移、Java21、共享包和三门户、CLI/Harness/MCP/Worker、隔离银行及浏览器、秘密/依赖/镜像扫描、许可证和SBOM。配置已接入不等于远端作业绿色；旧源码752或839项通过也不自动覆盖最新候选。历史10月的工具错配、下载TLS失败、局部构建与空库证据保留在[RF065索引](../../architecture/refactoring/batches/RF-065/evidence-index.md)，不再并列标为当前结果。

源码、合同、清单、构建及模型绑定全部稳定后，才计算最终ReleaseIdentity并按既有任务授权核对LIVE范围。原运行H1c76996e…ca3e94d的只读S5成功是已发生的历史证据，不是当前源码的28项。候选提交/推送与CI仅限已获准的候选分支、当地门和秘密扫描通过后；不自动合并main、公开Release或投递资料。

## 测试与定时运行

RF057的Business、Agent、Performance、AgentPerformance、ReadOnlyCapacity等入口由既有rf057-bank.ps1统一处理身份、凭据和清理。不同profile权限和副作用不同；正式资金场景不能复用原保留账户作为压力样本，ReadOnlyCapacity只读执行仍会新增Harness运行与证据。不要直接跳过所有权包装器调用内部驱动。

周期回归只能执行已验证且固定版本的脚本。模型负责生成候选，不在正式回归中临场修改业务目标、金额或预期。失败保留Run、业务结果、截图和原因并暂停/转人工；只有匹配目标、身份及版本且独立复验的反馈能用于后续候选。调度和反馈源码测试不证明真实周期运行或自主演化效果，实际验收见[测试方案](verification.md)。

## 数据保留与故障恢复

日常保持原服务、卷和Docker AI；资料生成不会重启或替换服务。新候选只按已细化清单定向替换所属服务。down仅用于明确要求停止的环境，默认保留卷；reset不是普通重启。冷启动、恢复和EOD中断只在独立测试环境验，不为测试推进保留环境的Fineract业务日期。

页面失败时先按原业务关联号查询：核心成功则保留业务成功与测试失败；结果未知则保持未知并转人工，不换幂等键重提。应用代码回滚不能回滚已发生的资金；数据库迁移或核心版本迁移必须核对专属方案，不默认可逆。恢复操作先确认进程、容器和数据所有权，不能通过删除卷、恢复出厂或改数据库来获得通过。

## 候选材料与交接

最终本地候选应含源码、构建摘要、SBOM、许可证、配置模板、ReleaseIdentity证据摘要、安装恢复说明和已知限制。源码材料生产与回读已有实现，实际生成仍受依赖/镜像风险及分发条件阻断；未生成的包不登记为已交付。七类文书源稿与生成状态由[文书目录](../../../documents/catalog.yaml)维护；下一位维护者的具体检查见[交接说明](handover.md)。

