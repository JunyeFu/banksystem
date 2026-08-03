---
id: DOC-STATE-RUNTIME-TOPOLOGY
title: 当前运行拓扑
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前运行拓扑

## 银行Compose声明

| 服务 | 本机端口 | 状态 | 来源 |
|---|---:|---|---|
| Keycloak | 19000 | CONFIRMED_CONFIG | `compose.channel.yaml` |
| 客户门户 | 18082 | CONFIRMED_CONFIG | `compose.channel.yaml` |
| 运营控制台 | 18083 | CONFIRMED_CONFIG | `compose.channel.yaml` |
| Gateway | 18443 | CONFIRMED_CONFIG | `compose.channel.yaml` |
| Grafana | 19001 | CONFIRMED_CONFIG | `compose.channel.yaml` |

Compose还声明Channel PostgreSQL、银行服务、模拟清算、Prometheus、Loki和OpenTelemetry Collector。配置存在不等于当前进程已运行；端口监听、PID、镜像摘要和健康状态必须在批次基线中重新采集。

衡准便携运行时的端口与PID属于易漂移状态，不在本文件固化；使用ReleaseIdentity和本次STATUS输出确认。

