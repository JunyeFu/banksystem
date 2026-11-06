---
id: RF065-OBSERVABILITY-CANDIDATE-20261106
title: RF065-S3 观测组版本与日志协议候选
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# RF065-S3：观测组候选

## 业务目标与已确认来源

在隔离候选保留现有指标、日志及Grafana查询职责，关闭旧依赖/不受支持版本及升级配置不兼容的真实缺口；不改银行业务、不增加Tempo/Alloy或第二条日志回退链。

当前Compose固定Grafana12.1.0、Loki3.5.1、OTel Collector Contrib0.130.0。既有实际原生清单分别355、144、217个公告ID（含别名，不等于可利用缺陷数），未有这三项新候选的安全/协议验收。当前PG132/12/120属于另一对象，不能替代它们。

只读核对发现：

- Grafana官方支持表明确12.1.x于2026-04-22结束支持；12.4.x支持至2027-05-24。官方release API当前同12主版本目标是v12.4.14，2026-10-27发布。只补12.1旧分支不能描述为已回到受支持状态。
- Loki原生指出Ruler路径遍历CVE-2026-21726，厂商公告/Go记录要求精确版本判断。官方3.6分支现为v3.6.19（2026-10-20），包含Go1.26.10安全回补。它是拟议的相邻minor候选，不称已取得迁移授权或风险清零。
- 本项目otel-collector-config.yml确实配置exporters.loki及logs.exporters=[loki,debug]；上游v0.131.0明确删除该组件。当前官方最新发行v0.164.0（2026-10-26），不能仅换镜像tag保留旧配置。
- 官方原生OTLP日志入口与旧Loki exporter在标签和日志体上不同；现有Grafana同时配置Prometheus和Loki datasource，需要验证可查询结果，不只检查进程存活。

## 输入与输出

输入：现有受控Compose、两个观测配置、Grafana datasource及既有native/BOM；原服务、凭据、日志卷和账务不作为测试输入。输出：固定目标digest、许可/BOM/原生及精确处置、真实隔离日志/指标回读与原环境保全回执。继续使用现有RF065输出根，不复制完整仓库或原卷。

## 三个落地切片

1. **O1来源与范围（1天）**：取得本包功能版本范围确认后，核官方发行/许可证/固定平台digest和镜像构建脚本，再下载唯一候选。目标建议Grafana12.4.14、Loki3.6.19、Collector Contrib0.164.0；版本漂移重新核实，不选weekly/RC。先审查三方升级说明与配置命令，不修改/启动原环境。
2. **O2日志协议（1天）**：只把已删除的Loki exporter改为原生OTLP/HTTP exporter，目标为Loki的/otlp基础入口，由客户端追加/v1/logs；不双发、回退或隐藏重试。保留既有OTLP接收、Prometheus指标、debug trace职责，不新增持久trace产品。用合成service.name/correlation_id/日志体验证新标签和structured metadata；有明确旧查询消费时才修改相应查询。不将新空卷测试说成原日志迁移成功。
3. **O3实际闭环（1天）**：独占Docker网络/空数据目录，不发布新主机端口，不挂原卷或读取银行配置；按已有全局端口表核其内部协议。先配置校验，再真实OTLP写入与Loki按关联号回读、Prometheus指标抓取和Grafana datasource健康/查询。生成固定工具的完整native/BOM/许可证据，所有未审/实际风险继续阻断；最后把真实ID和结果接回现有候选验证器，核原15容器ID/进程保持。测试失败先留根因再修，不在旧候选身份续写成功。

## 项目易错点与验收门

- 本包需要功能minor与协议范围确认；用户持续目标不自动回答已发出的版本选择。确认前仅资料/控制细化，不拉镜像、安装、改生产配置或运行候选。
- OTel0.131起没有loki exporter；Loki原生OTLP的标签不再自动等价于旧job/instance/exporter，不能用HTTP200或debug打印证明完整入库。
- Loki从3.5.8移除镜像shell，不能照旧依赖/bin/sh执行版本/健康探针；直接调用产品二进制或现有Docker公开元数据，不为检查安装shell。
- Grafana必须用新空数据库验证；不升级原grafana_data。Loki只用新路径，不将原索引/保留数据的可逆性当假设。
- STATIC/CONTRACT：实际配置、角色、日志/指标接口和候选消费者正反例；不新增无对应消费的通用平台。INTEGRATION：合成关联号实际入库/查询、拒绝及错误传播、数据卷隔离。LIVE_E2E：不调用真实银行或模型，不算RF057的28项/性能成绩。
- 三候选当前协议及安全/许可结果都由实际产物证明后才进入REVIEW；下载或健康不等于安全通过。后续统一构建/最终身份、正式28项、远端CI顺序不改变，不自动替换原服务或发布。

## 路径与实施边界

本次只写本包、RF065 tasks/S3.md/evidence-index.md及唯一顺序/backlog，预算6既有/新增文件、150行。运行源未开放。确认后在同一S3精确开放compose.channel.yaml、实际需要的infra/observability配置、现有inspect-ci-foundations.py/verify-ci-artifacts.py、ci-foundation-policy.json及两既有合同；必要的隔离启动/探测脚本先在本包声明，不新建并行路线。不更改A07/A08完成标准。

## 一手来源与本次核实

- [Grafana升级/支持表](https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/)及[12.4.14发行](https://github.com/grafana/grafana/releases/tag/v12.4.14)。
- [Loki3.6官方变更](https://grafana.com/docs/loki/latest/release-notes/v3-6/)、[3.6.19发行](https://github.com/grafana/loki/releases/tag/v3.6.19)、[厂商21726公告](https://grafana.com/security/security-advisories/cve-2026-21726/)。
- [Collector0.131删除记录](https://github.com/open-telemetry/opentelemetry-collector-contrib/releases/tag/v0.131.0)、[0.164发行](https://github.com/open-telemetry/opentelemetry-collector-releases/releases/tag/v0.164.0)、[支持策略](https://github.com/open-telemetry/opentelemetry-collector-releases/security)。
- [Loki原生OTLP与旧exporter差异](https://grafana.com/docs/loki/latest/send-data/otel/native_otlp_vs_loki_exporter/)、[升级注意与无shell镜像](https://grafana.com/docs/loki/latest/setup/upgrade/)。

2026-11-06只读官方文档/API与本地配置核实。GitHub网页工具部分不可用时，以未认证官方api.github.com发行元数据回读版本、日期及删除说明；没有借此执行下载/安装或更改系统网络。未新跑漏洞扫描或宣称旧清单是今日重扫。
