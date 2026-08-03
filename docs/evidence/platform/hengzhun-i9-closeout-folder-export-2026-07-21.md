---
id: EVIDENCE-HENGZHUN-I9-CLOSEOUT-20260721
title: 衡准I9全量验收与最终目录导出证据
document_type: evidence
domain: platform
status: verified
authority: informative
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9全量验收与最终目录导出证据

## 结果

I9 P1—P8八组自动化测试全部通过。最终产品从冻结提交`3884b6d843a47f48ab4880d68589d411bde99969`导出为忽略目录中的唯一文件夹`platform/hengzhun-regression-system/.release/hengzhun-regression-system-windows-x64/`，没有生成ZIP、7z、tar或其他归档。

导出清单SHA-256为`3b088ec9f42d127c3b19f6f9ab97174a8476413164d83e960b75e043f8a0e7ae`。清单覆盖6个运行时资产树和99个核心文件；秘密、运行态、绝对用户路径与禁止目录发现数为0。元数据明确记录`finalSubmissionArtifact=true`与`archiveGenerated=false`。

## 当前电脑机器验收

最终导出目录使用内置Node 20.20.2、Flowise 3.0.12、Playwright和Chromium 1217完成以下5项硬门禁：

1. 空运行态准备：`P8_PREPARE_READY`；
2. Flowise、Harness、MCP、Worker四服务回环健康：`P8_FOUR_SERVICES_HEALTHY`；
3. 登录后姓名、头像与个人资料一致性核心E2E：`P8_LOGIN_PROFILE_CONSISTENT`；
4. Flowise SQLite与Harness SQLite备份、恢复及`quick_check`：`P8_DUAL_SQLITE_QUICK_CHECK_OK`；
5. 恢复后四服务重启：`P8_RESTART_HEALTHY`。

机器记录终态为`PASSED`，验收过程未使用外部模型凭据，服务只监听回环地址，机器标识只保存脱敏Hash。

## 验收中发现并修复的缺口

首次候选机器验收在最终四服务健康汇总失败。日志证明四项服务均已启动，根因是Windows CIM逐进程归属查询耗时，使Worker的10秒心跳在汇总完成前过期。

修复后生命周期一次批量读取所需进程快照，健康检查复用已验证归属结果，并把Worker心跳新鲜度容忍窗口调整为30秒。内置Node路径、PID、命令行标记、端口占用和未知进程拒绝策略均未放宽；阶段2和阶段8测试随后通过，最终目录机器验收5/5通过。

## 证据边界

- 本证据关闭本机Flowise I9，不证明第二台电脑已经恢复；该证据由办公电脑阶段另行产生。
- 本证据不证明HiAgent已安装、可访问或通过迁移验收。
- `.release/`中的运行数据库、日志、随机凭据和机器记录属于忽略运行态，不进入Git。
- `main`冻结、`coze`保留和`hiagent`分支创建仍需显式Git操作，本次未自动merge、push或移动分支。
