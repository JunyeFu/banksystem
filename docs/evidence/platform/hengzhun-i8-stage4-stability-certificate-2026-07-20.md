---
document_type: evidence
id: DOC-EVIDENCE-HENGZHUN-I8-STAGE4-20260720
title: 衡准 I8 阶段4稳定性证书实施证据
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-20
owner: 傅钧烨
---

# 衡准 I8 阶段4稳定性证书实施证据

## 验收结论

I8 阶段4已完成。本机固定Node、Playwright与Chromium运行时对阶段3生成的确定性候选执行固定六样本稳定性门禁：1440×900和390×844两个视口各连续3次，六次全部通过后签发不可变`StabilityCertificate`。

同一门禁分别通过合成门户自动测试和真实复兴银行门户实机验证。真实门户结果为6次通过、0次失败、2个固定视口、证书已签发。

## 已验证控制

- migration 012持久化稳定性批次、六个固定样本和不可变证书；
- 每次验证使用全新BrowserContext、空初始storage state和独立Fixture；
- Worker验证候选脚本Hash、manifest Hash和固定运行时指纹；
- 每个样本产生脱敏JSON报告、有效PNG截图和步骤日志，Harness复核相对路径、字节长度与SHA-256；
- 只有6/6且候选、运行时、断言集和证据形状一致时签证；
- 任一样本失败即整批失败，不以重试或替代样本覆盖失败，不生成证书；
- 常驻Worker已接入阶段4Claim/Completion，不依赖专项验收脚本才能运行；
- 真实门户异步资料加载使用受冻结超时约束的可见性等待，避免同步合成页面掩盖竞态。

## 验证命令与结果

- `npm.cmd run verify:i8:stage4`：通过，覆盖阶段1—4、内部Worker OpenAPI和阶段4真实Chromium成功/失败分支；
- `npm.cmd run verify:i8:stage4:live`：通过，输出`HENGZHUN_I8_STAGE4_REAL_PORTAL_VERIFIED`，6/6并签发证书；
- 客户门户生产构建：通过；
- 完整项目验证、文档校验和Git差异检查：见本次提交验证记录。

## 证据边界

运行态SQLite、日志、截图和机器可读实机摘要均位于忽略的`.data/`，不提交凭据、个人数据、绝对路径或未脱敏截图。本文只证明本机阶段4代码、集成与真实门户浏览器门禁，不证明运行中Flowise Agentflow、真实MiMo主控对话或HiAgent目标环境已验收。

## 下一阶段

阶段5实现已签证候选的鉴权、分页、脱敏、Hash复核、审计完备的脚本预览/下载，以及用户明确的`SAVE_ONLY / ACTIVATE`选择；阶段4不提前激活或调度脚本。
