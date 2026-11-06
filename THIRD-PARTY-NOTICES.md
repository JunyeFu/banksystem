# 第三方材料与候选交付范围

本文件随源码候选包交付，不把第三方软件或数据重新许可为 MPL-2.0，也不代表当前候选已获发布 GO。

## 项目源码与上游

本项目自有源码采用根目录 [MPL-2.0](LICENSE)。保留源文件中已有的版权、许可与归属声明。
项目的 Docker 部署脚手架源自 [openMF/mifosx-platform](https://github.com/openMF/mifosx-platform)，其[上游许可证也是 MPL-2.0](https://github.com/openMF/mifosx-platform/blob/main/LICENSE)。上游软件与商标不因此成为本项目原创成果。

## 实际随源码包交付的软件

| 材料 | 版本／范围 | 许可证与保留材料 |
| --- | --- | --- |
| extract-zip 源码 | 2.0.1，项目精确本地补丁 | BSD-2-Clause；[原始版权、条件与免责声明](platform/hengzhun-regression-system/vendor/extract-zip/LICENSE)随源码保留，不替换为 MPL。 |
| Noto Sans SC 字体 | Agent 页面随源交付的固定 TTF 字节，摘要见源码交付政策 | OFL-1.1；[原始 Adobe 版权、Reserved Font Name 与完整许可](apps/quality-case-portal/src/agent/assets/OFL.txt)随字体保留。字体不重新许可为 MPL；[Google Fonts 同系列许可原文](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt)已核对一致。 |
| Maven Wrapper 启动 JAR | 3.3.2，原发行物字节未改 | Apache-2.0；JAR 内 `META-INF/LICENSE`、`META-INF/NOTICE`及[外置 LICENSE](scripts/test/third-party-licenses/maven-wrapper-3.3.2.LICENSE)、[外置 NOTICE](scripts/test/third-party-licenses/maven-wrapper-3.3.2.NOTICE)一并保留。 |
| Maven Wrapper 脚本 | `services/bank-channel-service/mvnw`、`mvnw.cmd` | Apache-2.0；已有 ASF 许可头保留，使用上述 Apache LICENSE 与 NOTICE。 |

Maven Wrapper Jar

Copyright 2013-2024 The Apache Software Foundation

This product includes software developed at The Apache Software Foundation (http://www.apache.org/).

启动 JAR 位于 `services/bank-channel-service/.mvn/wrapper/maven-wrapper.jar`，SHA-256 为 `3d8f20ce6103913be8b52aef6d994e0c54705fb527324ceb9b835b338739c7a8`。
其官方发行物为 [Maven Central 3.3.2](https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar)；它是构建启动器，不是预构建银行应用 JAR。

extract-zip 的修改仅用于拒绝归档符号链接及已有目标／父目录链接；原版本、上游标识和许可保留。补丁与两条原生公告的精确处置见 `scripts/test/ci-dependency-dispositions.json`，不是上游已修复声明。

## 元数据与安全报告

`scripts/test/third-party-licenses/` 中的 duck、union、xmlhttprequest-ssl 与 buffers 原件用于精确许可归属核对；这不表示相应库实现随源码 ZIP 交付。当前九锁声明依赖以候选包 `reports/source.reviewed.cdx.json` 为准，声明许可证齐全不等于全部二进制分发义务完成。

GitHub Advisory Database 数据采用 [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)。归属来源：[GitHub Advisory Database](https://github.com/advisories)，并保留报告内各条记录的原始链接。候选的用途清单、范围评审与补丁标注是本项目添加的整理，不改变原数据的许可；参见 [GitHub 的数据许可条款](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#advisory-database)。

OSV 是聚合服务，不将其工具 Apache 许可证套用到所有上游数据库。Ubuntu、Debian、Alpine、Go 等完整镜像报告数据的来源许可仍须逐源核对；本文件不为未核部分授予分发许可。

固定源码交付目录由 `verify-ci-artifacts.py --export-source` 生成：包含源码 ZIP、声明依赖的软件组件／许可标识 SBOM、本项目事实摘要、分发清单和校验和。它不复制原始漏洞描述、扫描原文或本机路径；完整上游报告仍留在本机候选的 `reports/`、`images/` 内，不属于公开交付目录。不要把内部候选目录整体当作发行包。材料核验通过不会改变事实摘要中的 `NO_GO`，也不会豁免未解决的镜像风险。

## 包外运行依赖与历史资料

源码候选包不含 Docker 镜像归档、银行构建 JAR、node_modules、Node／浏览器／FFmpeg 可执行文件、数据库、凭据或 `*.env` 文件。准备脚本从固定来源取得运行依赖；它们保持各自的上游许可证，不因本文件变为 MPL。

若后续实际分发这些二进制，须以相应制品的精确版本、许可原件、NOTICE 和所需源码材料单独验收；当前镜像许可元数据关联不能代替该门。浏览器收到的已构建页面也需按其实际分发内容处理，不把“服务端运行”作为客户端代码豁免。

Coze／Flowise／HiAgent 资料仅为历史研究记录，不属于当前运行链。`platform/hengzhun-regression-system/THIRD-PARTY-NOTICES.md` 及旧 `manifest/` 清单是历史便携包记录，不是当前产品依赖清单。未核分发许可的 HiAgent 外部手册只保留在本地原目录，不进入候选 ZIP。

## 依据

- [MPL-2.0 正文，3.1—3.4 及 Exhibit A](https://www.mozilla.org/en-US/MPL/2.0/)
- [Apache-2.0 正文，第 4 条](https://www.apache.org/licenses/LICENSE-2.0)
- [Apache Maven Wrapper 的 JAR 启动方式](https://maven.apache.org/tools/wrapper/)

当前材料核对结果由候选 `reports/source-license-review.json` 记录；完整分发、运行验证和正式发布结论仍由各自的门决定。
