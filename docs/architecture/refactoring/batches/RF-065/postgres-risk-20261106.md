---
id: RF065-POSTGRES-RISK-20261106
title: PostgreSQL固定候选风险证据接线
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# RF065-S3：PostgreSQL风险证据接线

## 目标与当前来源

候选d037885837a85f823ed46da8db216dfdb9e8e0418c22127b01c2e9002fedb441为已有PostgreSQL18.6-trixie加gosu1.19/Moby0.4.1的固定制品，原PG/入口字节保留证据已存在。旧原生扫描仍116条不同公告；Go单条符号/平台复核虽已完成，却未进入候选判定，现有image_security还直接拒绝所有foundation review。这是实际证据到发布消费者的断点。

仅处理已证实的六条触发条件：glibc CVE-2026-97399是Power8优化实现；GO-2026-5024在x/sys/windows；glibc CVE-2026-89092要求nscd；libxml2 CVE-2026-11979要求xmlcatalog shell；systemd CVE-2026-40228要求journald；CVE-2026-16742要求homed。固定候选Linux/amd64且既有公开特征记录显示四工具不存在，必须现场重新核验，而非相信手填报告。其它公告依旧阻断，不以本片关闭整镜像风险。

## 实现、输入输出与白名单

1. 复用原163MB公开镜像归档和已核OSV2.6.0/Syft1.54.1，写入新的postgres-review-20261106-01目录；不重建、不复制旧报告冒充当前扫描。上游只核官方Debian/Go条目，不访问报告里的任意示例链接。
2. 在inspect-ci-foundations.py内补具体PG特征核验及精确review，ci-foundation-policy.json登记固定image/os/arch、四条缺失路径与六条包版本/公告。只运行同一公开镜像的断网/只读shell元数据命令，tmpfs覆盖其声明的数据目录，不启动数据库、不读账户/凭据、不创建持久卷。复用现有精确review语义：新条目、变版本、缺预期、镜像/架构/工具漂移继续阻断。
3. verify-ci-artifacts.py在PG角色显式消费该review并重算原生报告/真实镜像特征与厂商版本门，不信手填PASSED或计数；仅六项可为NOT_AFFECTED，原严重性和扫描退出1不改。先在现有test_ci_dependency_scan.py和test_ci_artifacts.py复现断点/篡改反例，再核真实候选及原服务保持。

白名单仅上述四脚本/测试及ci-foundation-policy.json、本包、RF065任务/证据、唯一顺序/backlog；必要时同步外部站点现有assessmentNote。预算11文件/1新增/600行，0银行API/0迁移。原15服务、数据、卷、日期及Docker AI不动，不启动完整银行或模型验收、不冻结身份、不推进未批准Keycloak/Zod3。

## 验证与完成门

合同：已知六项接受且其余仍阻断；丢一项/新CVE/错误版本/架构/缺工具证明被拒；伪造完整review不能过候选回读。真实集成：固定镜像当前原生扫描、BOM、层与实机特征绑定，现有消费者给出准确部分审查/剩余阻断，不产生GO。依赖/工件合同、RF065治理/docs通过后本片移交REVIEW；PG全部风险、镜像候选和正式28项仍是后续门。

## 一手依据

- https://security-tracker.debian.org/tracker/CVE-2026-97399
- https://pkg.go.dev/vuln/GO-2026-5024
- https://security-tracker.debian.org/tracker/CVE-2026-89092
- https://security-tracker.debian.org/tracker/CVE-2026-11979
- https://security-tracker.debian.org/tracker/CVE-2026-40228
- https://security-tracker.debian.org/tracker/CVE-2026-16742

2026-11-06现场回读。Debian标vulnerable不能被改为“已修版本”，这里只核当前精确制品的触发前提；不引入全局忽略或新NPM处置。

## 实施回执与复审

先加入六项精确条件/其余阻断、变版本/镜像/架构/特征反例，实际因缺postgres_review失败。实现后通过；再在工件消费者复现ARTIFACT_UNSUPPORTED_FOUNDATION_REVIEW，接入明确PG分支后通过，手填已审、清零数量、伪造工具缺失、错误退出码、旧policy、重复或缺失subject均被拒。特征命令合同核只读/断网/tmpfs、无数据库启动和账户文件读取，不改已有Docker服务定义。

现有inspect CLI增加实际需要的--candidate --postgres-only入口，输出明确缺其余七类foundation主体，不宣称全范围覆盖。真实新报告在D:/Agent/.codex-temp/banksystem-rf065/foundation-20261017-01/postgres-review-20261106-01；复用原公开163MB归档，未下载工具/镜像或创建持久卷。原生OSV退出1，当前133条不同公告，比旧116多17条；六项实际复核NOT_AFFECTED，其余127继续BLOCKED，缺预期0。四个固定工具路径实机均ABSENT，镜像层/BOM/ID、Linux/amd64及PG18.6-1.pgdg13+2绑定；厂商最低补丁门通过不代表基础库通过。

candidate-readback.json由现有image_security真实Docker回读生成，PG角色仍BLOCKED，退出5、NO_GO/fullCandidateProduced=false。另生成标明forged的合成篡改副本，将riskReview手改为REVIEWED/0；tamper-readback.json证明确实重新探测同一镜像并以ARTIFACT_POSTGRES_REVIEW_DRIFT拒绝，原始报告没有改写。此为单PG角色集成，不是受NPM门阻断的完整候选包已生产或最终身份通过。

当前依赖/镜像合同54/54、工件24/24（新增六种篡改子例）、workflow15/15及治理/docs通过。独立于实现阶段的复审核对官方触发描述、包版本、真实镜像特征、部分结论传播和缺件反例；Power8/Windows及缺工具结论不扩至其它glibc/Go/XML调用。当前新Go-2026-6809和其它新公告仍未审，不拿旧gosu符号报告豁免新项。

原15银行容器ID集合完全相同，Agent三PID38832/50704/56748存活；未运行银行、模型或业务日期命令。新增报告约4.74MB，复用旧归档，不清理原产物或数据。本片移交REVIEW，PG127条剩余风险、其它镜像、Zod3/Keycloak待选、许可L3、统一构建/冻结/正式28项与远端CI继续按唯一顺序推进，整体NO_GO。
