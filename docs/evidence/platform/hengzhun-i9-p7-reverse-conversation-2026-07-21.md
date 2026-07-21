---
id: EVIDENCE-HENGZHUN-I9-P7-20260721
title: 衡准I9 P7真实反向Flowise对话证据
document_type: evidence
domain: platform
status: verified
authority: informative
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 P7真实反向Flowise对话证据

## 结果

隔离门户把`LOGIN_USERNAME`从已验证`TEST_ID`改为批准目录中的`LABEL`候选，原脚本正式运行确定性失败。Flowise随后只经MCP读取`CTX-L1 StepFailureEnvelope`，选择Harness返回的批准定位器，生成新脚本版本并完成桌面/窄屏各3次纯Playwright复验。

真实终态：`REVERSE_FLOW_VERIFIED`，共执行37个节点；修复候选6/6，通过独立人工激活与独立复跑确认后正式运行成功。最后的修复版调度问题被用户拒绝，结果为`REJECTED_NO_MIGRATION`，旧调度没有静默迁移。

## 运行中修复的缺口

1. Flowise旧补丁把成功任务终态中的业务`errorCode`误判为MCP错误；V3只对含`errorCode + category + HTTP 4xx/5xx`的错误包失败关闭。
2. Playwright定位器超时原被归类为环境阻断；现在只有受控目录中可识别的定位器映射为具体`*_LOCATOR_NOT_FOUND + TEST_FAILURE`，环境故障仍不可补丁。
3. MiMo把提案引用输出成嵌套对象；Qwen3.5兼容JSON提示增加四个顶层字段的精确示例，未使用提供方专有报文。
4. Windows CIM偶发失败会误报刚启动PID退出；存活检查改为Node原生PID探测，停止前命令行归属核验仍保留。

## 边界

- 原始多轮响应和运行数据仅在忽略目录`.data/evidence/i9/p7-*`中，未入库。
- 未修改项目业务源码、未弱化断言、未自动激活、未自动迁移调度。
- 本证据证明本机Flowise闭环，不证明HiAgent目标环境。
