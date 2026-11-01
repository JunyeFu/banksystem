---
id: RF065-TARGET-DESIGN
title: 全产品CI设计
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-09
owner: Codex
---

# 全产品CI设计

本机验证不通过系统npm.cmd推断Node来源：已观察其硬绑定邻接Node24.15.0，必须使用指定冻结Node直接启动发行包npm-cli.js。CI setup-node按声明版本提供Node/npm；本机隔离证据明确区分已提供工具与setup-node下载。原生SQLite及浏览器必须实际加载，不能仅看npm退出码。

一个公开CI入口覆盖所有产品改动，按平台划分Windows Agent和可隔离银行/前端检查。使用既有合同、编译器、测试与发行验证器，不新建发布判定。构建/测试使用锁文件和明确运行时；缺少检查能力则实现对应检查或记录阻塞，不输出伪成功。真实模型、机构服务器、原演示库不进入公开CI。

工具绑定：Harness/Worker/完整注册回归固定Node20.20.2，CLI固定Node24.19.0；因已复现Node20内置source-map报告崩溃，CI覆盖工具直接固定Node24.19.0，不实现失败后的切换或重试。原覆盖清单保留、实际Worker行为组追加，阈值50/70/60不变；报告成功但低阈值仍失败。Customer/Operations/Quality已分别加入ESLint、strict typecheck和所属认证/文档/只读API单元岗位，本机9/9/16通过；新克隆隔离检查与真实浏览器行为仍另验收，不把源码门说成页面或远端CI通过。

