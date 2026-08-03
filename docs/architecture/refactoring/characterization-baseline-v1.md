---
id: DOC-ARCH-REFACTOR-BASELINE-V1
title: 重构行为保护层最低基线
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 重构行为保护层最低基线

每条基线必须包含案例ID、行为分类、环境与ReleaseIdentity、输入摘要、命令、起止时间、退出码、API/页面结果、数据库副作用、外部副作用、Artifact Hash和证据路径。

## 复兴银行最低保护集

| 能力 | 必须保护 |
|---|---|
| 登录与会话 | 成功、失败、登出、角色拒绝、会话续期 |
| 客户与资料 | 当前用户姓名、头像和资料一致性 |
| 账户与交易 | 账户列表、余额口径、交易明细和空结果 |
| 收款人 | 创建、查询、重复和无权访问 |
| 转账 | 填写、摘要、首次确认、幂等、失败补偿 |
| 验证 | 无验证、持久化U盾网页验证、不可接管失败 |
| 单号查询 | 成功单号、状态、金额及重复查询 |

## 衡准最低保护集

| 能力 | 必须保护 |
|---|---|
| 输入 | 自然语言、XLSX/CSV/DOCX/JSON、MP4、补充图片 |
| 图片 | 受控上传、纯OCR、事实筛选、确认、原图删除 |
| Journey | 缺口、凭据引用、目标站点、冻结提案、版本冲突 |
| 作者化 | Midscene定位证据、动作窗口和失败诊断 |
| 脚本 | Builder生成、纯Playwright验证、源码Hash |
| 证书 | 两视口各两次、四个唯一运行、失败关闭 |
| 执行 | 激活/不激活、即时、单次、周期、结果收件箱 |
| 修复 | 分类、候选、重新验证、确认、激活和复跑 |

行为分类仅允许 `EXPECTED_CONTRACT`、`LEGACY_COMPATIBILITY`、`CONFIRMED_DEFECT`、`UNKNOWN_BEHAVIOR` 或 `INTENTIONAL_CHANGE`。`UNKNOWN_BEHAVIOR`不得作为影子比较的通过依据。

