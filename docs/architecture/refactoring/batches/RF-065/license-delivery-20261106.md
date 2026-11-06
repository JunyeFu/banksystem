---
id: RF065-LICENSE-DELIVERY-20261106
title: RF065-S3 实际许可与分发材料
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# RF065-S3：实际许可与分发材料

## 业务目标

让开源源码候选的接收者拿到实际随包软件/字体的许可原件、归属和可核验材料；发布验证消费真实证据，而不是永久硬编码未验证或人工改状态。维持既有源码交付边界，不因材料通过放行镜像风险。

## 输入与输出

输入：main@e67fd4c保留脏树、当前受控源清单、现有sourceDelivery政策和12镜像候选生产器。Agent完整隔离registered839/839与覆盖门已通过；当前源未最终冻结。输出复用RF065输出根下license-delivery-20261106-01，不读取凭据/原数据、不启动或替换服务。

## 实现

1. L1：把实际随源交付的NotoSansSC-Regular.ttf及既有OFL.txt纳入现有source_license_materials。字体字节SHA256为450625c8d46ab3df97b7904ded955ec2746d17ec76740cb1e91d1ba63a0f89af，OFL原件为1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9；2026-11-06实时回读Google Fonts相应OFL，规范化换行后与本地完全一致。补根第三方声明及实际归档正反例，不改字体/前端样式或新增字体依赖。
2. L2：现有validate_images无条件写licenseDistributionStatus=NOT_VERIFIED，image_engineering_gate又要求VERIFIED，材料门没有完成路径。按既有不分发镜像/Node/浏览器/FFmpeg二进制的源码交付范围补证据生产与验证，不把工具许可证套上游数据；实际公有交付与本机完整扫描证据分开，原始报告保留。公开源码材料仅包含已核许可文件及本项目事实摘要/来源链接；未核权利的上游完整记录和未核二进制不得被导出。具体格式由这一实际消费者需要决定，不建通用许可平台。
3. L3：源/归档及材料回读必须实际执行，错字节、缺原件、未知字体/二进制、手填状态或夹带本机报告均非零。当前镜像公告、安全候选、ReleaseIdentity、正式28项及远端CI仍由各自门核验，不改成GO或豁免。

白名单：本包/既有RF065控制与证据、唯一顺序/backlog，THIRD-PARTY-NOTICES.md、scripts/test/ci-dependency-dispositions.json、scripts/deploy/verify-ci-artifacts.py、scripts/deploy/scan-ci-dependencies.py、scripts/test/test_ci_artifacts.py；若现有生产器需要单独导出命令，先补精确路径。字体与OFL仅只读复用。预算14改动文件/3新增/1500行，0数据库迁移/0产品HTTP合同。

## 项目易错点

### L2技术细化：固定源码交付，不分发本机原始报告

在既有verify-ci-artifacts.py内增加--export-source <已验证候选> --output <新同级目录>与--verify-delivery <交付目录> --source-candidate <原候选>，两者仍要求--repository。源候选/原报告只读，不覆盖或修改；导出目标不在仓库/原候选内。固定五文件：controlled-source.zip、source.sbom.cdx.json、evidence-summary.json、delivery-manifest.json、checksums.sha256。SBOM仅软件组件名称/版本/purl/许可标识；摘要只投影本项目扫描事实、原生退出与风险计数，禁止复制上游描述、私有位置和完整记录。

分发验证先复用既有verify核原候选/当前源，再重算公开SBOM/摘要、源ZIP字节、实际目录成员、许可材料及校验清单，拒绝手工改状态、改后重哈希或夹带原报告。镜像工程门只计算实际安全风险，独立distributionMaterialGate在未导出时为NOT_EXPORTED；导出后只有真实分发材料可给VERIFIED，已知风险仍退出5。所有产物继续UNFROZEN/NO_GO/productReady=false，不生成发布GO；这是本机文件生产，不是外部发布。现有无条件NOT_VERIFIED改为符合实际源码范围的NOT_DISTRIBUTED_IN_SOURCE_PROFILE，不对未来镜像二进制分发作许可结论。

调用链复核又确认既有verify只核依赖报告的工件摘要，未复算其内容；若同时改报告和工件清单，旧PASSED可能被保留。补齐同一validate_dependencies在报告搬迁后的回读：仅将原始路径中明确的product-dependencies/<正式锁路径>绑定到已验证当前源码，从原生结果重新计算清单/处置，不读取原依赖目录、不相信手填数量。scan-ci-dependencies.inventory只增加该实际消费者所需的源码根参数，正式扫描默认路径/重复结果拒绝不变。新增篡改后重哈希反例，避免把新交付建立在弱父证据上。

字体有独立OFL，不能因项目根MPL而重新许可；文件已存在不等于归档原件/字节已核。源码包与镜像运行依赖不能混淆，原生漏洞失败不会被许可材料处理抹去。Go数据的CC-BY-4.0与Go工具源BSD不同；OSV是聚合平台，不自动授予Ubuntu/Debian等所有上游数据许可。尚未核实的材料不能人工填VERIFIED；未发二进制也不等于可以分发其完整第三方报告原文。

## 验证与完成门

STATIC/CONTRACT：当前source-engineering既有test_ci_artifacts.py及相关依赖/工作流合同，新增实际材料缺失/字节漂移/未知资产和导出边界反例；RF065治理/docs。INTEGRATION：受控当前源码实际材料生产与回读，保留首次失败及原报告，源包成员/许可原件与声明一致，材料门有真实成功及拒绝路径。无模型或银行操作，不重新跑不受影响的Agent全套。

只有L1–L3证据及复审收齐才移交REVIEW。材料通过不是法律意见、运行验收、远端绿色或整体GO；任何未核分发项仍在对应出口阻断。

## 一手来源

- [Google Fonts Noto Sans SC OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt)：实时原文比对，字体归属仍保留原Adobe声明。
- [OSV数据来源](https://google.github.io/osv.dev/data/)及[数据接入许可要求](https://google.github.io/osv.dev/data/new)：不能把OSV工具许可当作每个数据源的许可。
- [Go官方数据库许可](https://go.googlesource.com/vulndb/+/refs/heads/master/LICENSE)：代码与data许可分开。
- [GitHub Advisory Database条款](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#advisory-database)。

## L1实施回执（2026-11-06）

先加入真实字体/OFL材料测试，观察到报告缺fontMaterials，以及缺许可、改字体、未知字体三种输入均未被拒绝。随后只在既有sourceDelivery政策和source_license_materials登记固定字体字节/原件、核归档成员与字体摘要；根第三方声明新增OFL归属，保留原字体/样式和Adobe许可字节。Windows私有字体集合只读解析的字体族为Noto Sans SC；没有安装系统字体。

实际test_ci_artifacts18/18及test_ci_dependency_scan50/50、RF065治理/docs/diff校验通过。当前仓库受控成员直接调用现有材料验证函数，生成license-delivery-20261106-01/font-materials-current-source.json：明确stage=L1_CURRENT_SOURCE_MATERIALS_ONLY、archiveCreated=false，字体原件/摘要已核、fullDistributionGateCompleted=false。它是实际当前源材料核对，不是已生产完整候选ZIP或完成L2/L3；原运行态/银行未操作。父包保持IN_PROGRESS，下一步仍为候选分发材料真实生产/回读。

## L2合同回执（2026-11-06）

固定五文件导出/回读已实现，先观察到缺export_delivery，再修到成功；追加反例实际暴露sourceScan未投影会携带额外原文，以及父候选只重哈希不复算依赖回执。两项均已从权威边界修复：公开摘要按字段固定投影，父依赖通过同一生产验证函数对搬迁报告重算，原生失败不被PASSED掩盖。材料22/22、依赖50/50、工作流15/15通过；完整默认镜像风险反例中，材料VERIFIED但风险仍BLOCKED，两次CLI仍退出5，原候选清单字节未变。

L3使用自有source-01/dependencies-01新目录，复用已核固定工具，不下载或安装新工具。实际秘密扫描0命中，九锁覆盖完整，但原生依赖扫描退出1，36处受影响包记录/36条不同公告；原始报告及live-materials.log完整保留，未生产候选或交付目录。依赖已成为实际阻断，先进入同批[npm修复](npm-remediation-20261106.md)，通过后从当前源码重启材料生产，旧失败不覆盖。此时不冻结身份、不调用模型、不变更银行服务/数据或公开发布。
