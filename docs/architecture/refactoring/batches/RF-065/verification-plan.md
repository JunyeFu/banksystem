---
id: RF065-VERIFICATION-PLAN
title: 验证方法
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-09
owner: Codex
---

# 验证方法

S1-C2当前源码隔离最终752/752、失败/取消/skip0，覆盖128通过/1既有口径skip、58.31/75.12/61.04达到原阈值，串联退出0。历史Flowise有效安装9项已显式归历史组、清单新增1项反例，总发现104完整，非条件skip。银行空库/真实模型/远端CI仍未验收，三门户隔离生成/build另收终态。

S1-C1最终7ba397e33deb4a81849fc3f6e98b147d全新空cache四组npm ci通过，真实SQLite ABI、Controller/CLI导入、冻结Chromium下载与headless页面内容均通过，脚本退出0。此前系统npm错配及官方包下载EIDLETIMEOUT失败回执独立保留；完整GET恢复后才手动新目录复验，不实现隐藏重试。此门只证明依赖和浏览器准备，完整源码隔离构建/回归属于下一微任务，不提升为银行或模型验收。

S1-C1实际发现系统npm.cmd忽略PATH并使用Node24.15.0；三门户旧“冻结Node20”描述作废。已按明确Node20.exe+发行包npm-cli.js重跑，9/9/16和lint/typecheck/build均通过。隔离安装使用独立空cache和同样显式工具，必须真实ABI/浏览器通过才算运行时准备完成，不能用npm退出0替代。

S1-B3质量门户最终lint/typecheck/16项只读API单元/build通过；初次未使用导入失败与修正、生成类型相对HEAD差异导致diff非零均保留在证据索引。当前工作树重复生成幂等通过，不等于已提交合同或新克隆验收。三门户源码质量门均已实现，下一门隔离运行时准备。

S1-B2运营门户实际完成lint零告警、strict typecheck、9/9 OIDC与文档API单元及build（14.91s）；工作流合同8/8。单元只证明生产函数合同，不证明真实Keycloak登录或页面冲突提示。完整结果在本批证据索引；质量门户与隔离运行仍待。

S1验证工作流触发/语法、实际命令可达性、Java21、三个前端build与所属合同测试、CLI/Harness/MCP/Worker注册回归。新克隆运行时准备须用隔离目录证明，不只检查YAML。S2在独立项目名/空卷执行银行播种、黄金链和浏览器验证，保留原卷；EOD不推进原环境日期。S3核验实际扫描、SBOM与构建工件摘要；远端未触发则明确未执行。

