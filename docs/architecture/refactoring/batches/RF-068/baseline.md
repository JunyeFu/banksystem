---
id: RF068-BASELINE
title: RF-068 Baseline
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Baseline

At planning entry the baseline was the same inspected checkout and preserved runtime documented in [RF066 baseline](../RF-066/baseline.md). The following implementation receipts supersede the planning-only state, not the historical baseline.

## S1 implementation entry 2026-10-21

HEAD仍为552b3b8ac517bd5991bff446e72d9f4e87ea9543，main，入口567条脏工作区记录。未宽泛暂存、提交、推送或撤销旧改动。仅按S1白名单增加独立入口/资产/客户端/测试和控制记录；已有Quality业务源码不手工改写。

原15个银行容器已连续运行约31小时，18788/18789/18790无监听；不把“预留18790”当已部署。浏览器验收只使用OS分配的loopback测试端口和临时SQLite，结束仅关闭测试自有进程；原服务、卷、业务日期和Docker AI不变。

## S2 implementation entry 2026-10-21

入口main@552b3b8ac517bd5991bff446e72d9f4e87ea9543、575条脏工作区记录；S1已DONE、S2 READY。原15个银行容器ID与S1一致，连续Up约36小时，18788/18789/18790仍无监听。本包不安装依赖、不修改合同/迁移/Controller/Harness，不读取原库、模型密钥或运行日志；仅使用临时Harness/MCP与OS分配测试端口。其他项目新建/停止的容器不属于本包，不操作。

## S3 implementation entry 2026-10-22

S2已DONE、S3从READY进入实施；仍在main@552b3b8，保留现有脏工作区与已暂存的历史路径。原15个银行容器继续运行，Docker挂载未使用.codex-temp；没有停止或部署替换原服务。本次取消磁盘自查，不进行清理/移动/打包。S3仅在白名单接入既有Controller API及隔离测试，不冻结身份、不运行真实模型或资金动作。

