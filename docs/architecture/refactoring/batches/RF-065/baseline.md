---
id: RF065-BASELINE
title: 基线
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-09
owner: Codex
---

# 基线

2026-10-12 F2/F3收尾基线：HEAD未变，当前13处/40公告/1 Critical取自上一轮真实九锁报告。六个包/锁、旧规划器/测试、媒体两runner、freeze、demo及两个隔离准备脚本的原字节定向备份到remaining-f3-20261012-01/before；离线CLI SBOM旧字节另保留。原脏树、唯一暂存mariadb/.env删除项、原服务/卷及私有运行状态保持，不宽泛暂存。所有实际安装与模型无关验证均在本次或此前测试自有目录，不替换原node_modules。新源码尚未冻结或登记正式ReleaseIdentity。

2026-10-12 F2基线：HEAD仍552b3b8，根package.json已有未提交修改；根/Controller四元数据原字节保留于harness-f2-20261012-01/before。首轮注册回归为747/752、5失败，覆盖未执行；独立98590c9ef5ef4c7c889106bff8a1a1fe快照和日志原位保留。随后增补原runtime二输入及MCP现有测试备份；FFmpeg缺失已确认为F3a裁剪的真实消费者遗漏，补回直接依赖但不恢复CLI。修正后完整回归使用另一个干净611e161877ae4859a20f55d42824a473快照，不复用首轮SQLite、历史运行或验收记录。

2026-10-12 S3-F1修复基线：十个前端公开package/lock复制到`D:/Agent/.codex-temp/banksystem-rf065/frontend-f1-20261012-01/before`。三个门户元数据及共享源码已有修改，全部保留；本批只改登记的依赖元数据，生成器产物需与当前脏树一致。初始实际扫描F1五锁50条受影响包版本记录，其余四锁另属F2/F3。先前S2隔离银行rf065ci719ddb02b34c容器现场为Exited，浏览器复验只使用此测试项目；原演示服务和卷不在本批运行操作范围。

HEAD为552b3b8ac517bd5991bff446e72d9f4e87ea9543，保留大量既有脏文件，不暂存或清理。当前ci.yml仅监听Harness目录，调用不存在的audit:critical；新克隆安装npm依赖后，产品脚本仍要求未准备的固定Node20/24与Chromium路径。前端目前只有build，不能伪称已有lint/unit。RF064完整102文件回归首跑已有旧身份数量断言失败，已定向修正，整轮未终结。当前NO_GO，未冻结身份。

2026-10-12 S3-F3a修复前定向基线：HEAD未变；demo.ps1、runtime/package.json/lock、verify-agent-browser-runtime.ps1已是未跟踪的既有工作，身份清单已有迁移修改。六个公开输入原字节已复制到`D:/Agent/.codex-temp/banksystem-rf065/runtime-cut-20261012-01/before`，不复制原node_modules、运行状态或凭据。demo SHA256 aa399f900356990110f9b101ebb79dc9f8afa3b8b49241704101d8e7d1af5e2c；runtime锁a030e98b8609902546214a9aa41b23be55a9b987c491e6d8bcd6d8debf445a68；冻结配置028fea162c11142e7a66e7ee1ea450309a8c51e570ca89db26ce664a04fc1a62；身份清单aa040b539b11814853f990b9811c659fbd611f817bad06c8c2470fd8b874dbd2。该点只供本次最小修复回退，不等同新的ReleaseIdentity或候选通过。

