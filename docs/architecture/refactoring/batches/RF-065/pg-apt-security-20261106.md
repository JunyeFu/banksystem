---
id: RF065-PG-APT-SECURITY-20261106
title: 固定PG候选APT同支线安全更新
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# 固定PG候选APT同支线安全更新

## 根因与范围

固定候选99846582…2a771的公开dpkg查询确证apt和libapt-pkg7.0为3.0.3；当前原生133条包含DEBIAN-CVE-2026-109518。Debian DSA-6607-1于11月4日发布，trixie-security的同分支3.0.4修复下载验证绕过及相关边界问题。不是银行代码错误，也不等于证明当前PG服务曾可被该漏洞利用。

上游SQLite/zlib在当前稳定分支仍有未修项，不以版本描述或关闭APT命令来豁免。本片只做已有授权的最小依赖修补，新镜像不挂原卷、不启动数据库、不替换银行服务、不推进业务日期；PG18.6、既有gosu及业务入口保持。Zod3、Keycloak、Prometheus和文书渲染待选项不被代答。

## 三个小任务

1. P1 核官方APT3.0.4与libapt-pkg7.0的amd64安装包、大小、SHA256和依赖/维护脚本。下载仅security.debian.org的HTTPS官方字节到自有pg-apt304-20261106-01；不使用有已知问题的旧APT联网安装，不装宿主工具，不关闭签名验证。
2. P2 在既有scripts/deploy增加固定两包的准备入口和独立Dockerfile；复用已核gosu上下文，原固定PG18.6-trixie基础不变。离线dpkg安装两包，不apt upgrade、不引入新源/其它包、服务或回退。原候选和失败报告保持；新镜像只在自有断网只读/tmpfs元数据容器核验。
3. P3 比较新旧包清单、PG/入口/gosu字节、基础层与公开维护材料。复用现有Syft/OSV重扫新制品、精确风险回读及篡改拒绝；目标公告移除且其它风险仍准确阻断。通过相关合同/治理/docs及验收导向复审后本片移交REVIEW，不将镜像总门或28项标为完成。

## 白名单与完成门

scripts/deploy/prepare-postgres-apt-patch.py、scripts/deploy/postgres-apt-patch.Dockerfile、scripts/test/ci-foundation-policy.json、scripts/test/test_ci_dependency_scan.py、既有RF065任务/证据、本包、唯一顺序/backlog；必要的已实现消费者只读复用。预算10文件/3新增/500行，0合同/0迁移。镜像/安装包/日志是本片自有产物，预计新增不足0.5GiB；不复制原运行库或新的全仓快照。

完成须有真实新镜像、固定包与字节保留、新原生扫描、准确余项和候选回读；仅网页版本、Docker构建或合同成功不能替代。新风险/缺包/摘要不符或安装需要额外依赖时先停止此构建并定位，不扩大升级范围。

## 官方输入

- [Debian DSA-6607-1](https://lists.debian.org/debian-security-announce/2026/msg00526.html)与[精确CVE状态](https://security-tracker.debian.org/tracker/CVE-2026-109518)。
- [apt amd64](https://packages.debian.org/trixie/amd64/apt/download)：1453228字节，SHA256 15c2030e0fb46580af4f1b4cc303f4bd26da781b004e99763bc9eff7cf8e19b8。
- [libapt-pkg7.0 amd64](https://packages.debian.org/trixie/amd64/libapt-pkg7.0/download)：1113872字节，SHA256 577eb8f489de419290102364892dbd13ca256297b61f96d61b114fd4ac18be41。
- [同分支变更记录](https://metadata.ftp-master.debian.org/changelogs/main/a/apt/apt_3.0.4_changelog)。

原PG SHA256为4944085d…7b1469、入口9c440299…d4b20a5、gosu659327a5…8c5fa7；本片不修改源账务状态。旧PG133/7/126继续作为9984…制品的历史回执，不改写为新镜像结果。

## 实施与复审回执

官方两份.deb实际字节/大小与发布页一致；只读解包审阅control及pre/post维护脚本后安装。APT依赖新libapt7.0，其余依赖均由原基础满足；维护脚本仅作用新构建层，/run/systemd/system缺失守卫保证不启动timer服务，不执行purge。许可与变更记录随原上游包保留，没有关闭包签名检查、调用旧APT联网下载、apt upgrade或安装宿主软件。

新prepare入口按固定SHA/大小和原gosu字节核输入，生成独立上下文；原Go准备器和旧镜像不改。新增反例先因缺生产者实际失败，再实现至通过；当前58项依赖/镜像合同、25项工件合同、15项workflow合同通过。变大小/同大小变字节/非自有目录拒绝，真实两包输入配合被改gosu也在创建输出前拒绝；未使用运行时Mock。

实际新镜像为sha256:2561249078bdee6cdfe58001e68e5ca9afe3f0a5a8ccb626c96ed4726098a8de，tag local/rf065foundation20261106-postgres:18.6-gosu-go12610-apt304-01。离线Docker构建退出0；preservation.json证明原候选完整层前缀保持、包清单只有apt/libapt-pkg7.0两项3.0.3→3.0.4、其余版本不变、PG/入口/gosu三文件摘要完全一致，dpkg audit为空。未启动数据库、未挂原卷或替换原服务。

扫描工具前置曾明确拒绝“Syft字节漂移”：核实旧toolset的sha256实际记录ZIP摘要而非EXE。官方不可变GitHub发布API再次确认ZIP8b56e828…e8e19f，原ZIP内EXE与已安装文件同为b7e78564…addbc6，版本1.54.1；OSV2.6.0实际EXE与既有e0ed7644…453d6一致。没有覆盖旧工具记录或二进制，新tool-and-preparation-review.json分别保存归档/二进制身份，不把未知文件直接接受。

首份Syft用未标记归档源，BOM组件版本为归档身份而非Docker制品；现有真实消费者以FOUNDATION_BOM_IMAGE_MISMATCH:postgres拒绝。保留该BOM与initial-bom-source-rejection.json后，使用与旧回执一致的固定docker:imageId源重新生成BOM，未手改字段。新BOM/原生层/实际镜像三者绑定核验通过，工具日志和首次失败均留存。

全新联网OSV退出1：原生133→132，唯一移除项为DEBIAN-CVE-2026-109518，新增0；全部观察到的apt源版本均3.0.4。原七项精确处置在新ID上重新断网/只读/tmpfs实探，7已审/125仍阻断/缺预期0；PG18.6厂商最低补丁门通过。候选image_security实际回读退出5、NO_GO/fullCandidateProduced=false；合成篡改REVIEWED/0的副本被ARTIFACT_POSTGRES_REVIEW_DRIFT拒绝，原报告不改写。没有增加新豁免或把少一条公告写成安全总门完成。

输出在D:/Agent/.codex-temp/banksystem-rf065/foundation-20261017-01/pg-apt304-20261106-01：官方输入、上下文、preservation、advisory-delta、原生/BOM/review、候选/篡改回读及工具校验。此轮新文件60个/180901380字节，另有新Docker层，共享基础未复制为新的完整克隆；均有当前候选或首错证据消费者，保留且不清理，实际回收0。原15银行容器名称/ID集合和运行态一致、0 unhealthy，三个Agent进程仍存活，未运行银行/模型/日期命令。

验收导向复审核对同支线官方安全修复、完整包差异、许可/维护脚本、源选择错误拒绝、真实剩余风险和原环境保持。本片只移交REVIEW；PG125条余项及其它镜像、安全待选/许可、统一构建与身份、正式28项和补充容量、远端CI及最终交付仍未闭合，整体NO_GO。文书渲染工具缺项亦保持，不借本片推进未获准的功能版本。
