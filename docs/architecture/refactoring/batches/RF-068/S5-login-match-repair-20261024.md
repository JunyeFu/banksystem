---
id: RF068-S5-LOGIN-MATCH-REPAIR-20261024
title: RF068-S5 登录语义匹配修复与重验
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-24
owner: Codex
---

# 登录语义误拒修复与重验

依据[上轮根因](S5-live-root-cause-20261024-02.md)及用户明确授权，沿原RF066-S2源码、RF068-S5统一冻结验收执行；原银行服务/数据不动，无提交或推送。

## 实现与反例

仅修改产品`worker/src/i10-midscene-candidate-authoring.cjs`和`scripts/verification/generic-worker-routing.test.cjs`。明确的单一统一身份认证入口意图单独规范化为真实按钮标签“统一身份认证登录”；匹配仍要求准确标签、可点击性及视觉选中的真实DOM。包括转账等第二个动作的复合指令不使用此等价规则。普通点击、资金动作、首错停止、凭据、导航域和定位核验边界保持。

先新增两项反例测试并在旧源码复现2项失败，再修源码。正例包括原故障动作、打开入口带句号、点击登录按钮、带引号目标；负例包括注册账号、普通登录、确认转账、帮助、取消、认证后转账复合标签及复合指令。真实隔离Chromium中另验证：正确按钮通过，旁边注册/转账/帮助、相同静态标题及复合按钮均失败；给定视觉选中点依原缩图比例派生同一TEST_ID，再经实际匹配函数通过。未通过猜测选择器或扩大文字包含关系执行点击。

另轮源码复审确认：规则在既有宽泛“登录”分支前限定明确SSO意图；点击仍不使用周边卡片标题作为证据；复合SSO意图不落入普通登录分支。未改前端、模型配置、MCP、Harness合同、数据库迁移、验收驱动或银行页面。

## 验证

| 层级 | 实际结果 |
| --- | --- |
| Worker专项 | generic-worker-routing＋midscene-diagnostics共61/61，包含2项新正反例与实际隔离Chromium |
| CONTRACT | verify-agent-workbench.ps1 -Scope Contract：19/19＋11/11，生成API检查通过 |
| INTEGRATION | 同入口-Scope Integration：41/41＋runtime1/1，生成元数据与tsc通过 |
| CLI/身份 | release-lifecycle、headless-cli、journey-author-validate、journey-execute、journey-evidence-verify：76/76，46.53秒，含v4逐文件漂移 |

CJS由Worker直接加载；本轮没有前端/Java/镜像变化，不重复无关构建或全模态回归。上述检查不代替银行LIVE。实际冻结、重载、LIVE及首次失败根因在下方追加；未完成前S5不能DONE，正式28项及整体GO不提升。

## 新身份冻结及自有Agent重载

- 所有源码修改、回归与另轮复审收口后冻结H=`7a722b08a5fe79012a2d7fc4e1652fb9f1013a6362f499984d9de54a3c525239`。Controller/视觉模型绑定保持原deepseek-v4-flash及mimo-v2.6-flash，无新增端点或密钥变更。
- 重载前六种活跃聚合全0；先做原SQLite一致性备份`.data/sqlite/offline-backups/rf068-s5-prereload-097b142b-ebab-4389-bc96-786a50b92777.sqlite`，integrity_check=ok，SHA256=`60883afdfaba8dd201c60e20e55290bddc77d46b8bcac6bff9cde8d458865737`。
- 原agent-workbench.ps1和lifecycle stop仅停止登记且经归属核验的Agent web/Harness/MCP/Worker，未停止银行容器。原runtime start以精确H启动，回执`.data/rf068-s5/53d4089c-6595-4e13-a4c8-0aed12d39c29`；另有启动备份`.data/sqlite/offline-backups/rf068-s5-594409e3-65a2-47a5-ae5a-d8a148d4bf4d.sqlite`，摘要与前述一致。
- 新Harness PID110740、MCP99392、Worker72148为owned/current/healthy；网页PID111624已启动，迁移44/44，初始任务/活动调度0。原银行仍持续运行，Gateway健康GET200。没有通过删除检查绕过旧进程保护。

## 首次LIVE结果与停止

报告0d72ea26-3748-4bde-ae45-22ca91838f10在11:33–11:34运行；H未漂移，前置/缺输入通过，BYOK阶段首次失败I10_MIDSCENE_TARGET_NOT_FOUND，之后立即STOPPED。已确认本次plan没有展开Keycloak认证步骤，goto后直接查账户导航，视觉报告登录页无此目标是正确的。尚未执行本次修复的SSO点击，不能宣称其银行实机通过。具体draft/plan、编译源码根因及后续合同修复方向见[本轮LIVE根因](S5-live-root-cause-20261024-03.md)。没有在失败后修改源码或重跑，服务保持运行，S5仍BLOCKED。
