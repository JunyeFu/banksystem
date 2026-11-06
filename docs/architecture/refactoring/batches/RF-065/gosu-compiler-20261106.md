---
id: RF065-GOSU-COMPILER-20261106
title: gosu同支线Go安全编译补丁
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# RF065-S3：gosu同支线安全编译补丁

## 目标与根因

当前PG固定候选原生133条中新增GO-2026-6809/CVE-2026-111943。官方指向crypto/x509.Certificate.Verify并提供Go1.26.10修复。旧gosu用1.26.9且已strip符号；既有extract没有pkgSymbols，适用Linux的新项不能从“0 finding”推成未调用。采用同支线编译器最小安全补丁，不新增豁免，也不为符号分析扩大重构。

## 实现、输入与输出

1. 官方go.dev下载元数据已实时核对唯一go1.26.10.windows-amd64.zip，75004774字节，SHA256为7ecd2d7260e82c59bcbd7f1077a07cee2dea607295b858df67195a1e4e09629b。只下载/解压到自有gosu-go12610-20261106-01，不安装全局工具、不改PATH配置、不执行安装脚本。预计新增不足1GiB，旧工具/候选/报告保持。
2. 复用prepare-gosu-dependency-patch.py：编译器固定1.26.10，本地版本标1.19-rf065-moby041-go12610，保留固定6456aaa源码、Moby0.4.1/x/sys0.1.0和main.go/setup-user.go字节，CGO0/linux/amd64/v1及受控缓存。只更新真实编译需求，不升级PG、Go主分支或其它包，不移除strip或放宽符号证据。
3. 同一个postgres18.6-trixie固定基础，只替gosu及许可/补丁材料。新独立镜像tag为local/rf065foundation20261106-postgres:18.6-gosu-go12610-01；比对基础层前缀与PG/入口字节，重扫当前OSV/Syft后才把ci-foundation-policy中的PG候选身份和六项条件绑定到真实新ID。原六项回执作为旧制品历史不改写。

## 白名单与命令

scripts/deploy/prepare-gosu-dependency-patch.py、scripts/deploy/postgres-gosu-patch.Dockerfile、scripts/test/ci-foundation-policy.json、scripts/test/test_ci_dependency_scan.py、既有RF065任务/证据、本包、唯一顺序/backlog及外部站点assessmentNote。必要的实际新二进制精确profile在取得字节后才细化，不放宽旧profile。预算11文件/1新增/400行，0合同/迁移/原服务操作。

prepare-gosu-dependency-patch.py --archive <原固定公开源码归档> --go <已核本地Go1.26.10/go/bin/go.exe> --output <新build目录>；docker build --progress=plain -t <上述新tag> <build/context>。先源码分析与编译器版本反例，再实际构建；版本/PG元数据只在断网只读自有容器中核验，绝不执行用户切换、上游test.sh或读取账户文件。新原生报告/镜像风险回读继续用当前既有工具与PG精确验证路径，不重建银行/模型/身份。

## 验证与完成门

源码/模块保留、官方工具摘要/实际版本、新编译产物及新镜像基础/PG/入口保持；当前原生扫描不再包含GO-2026-6809，Windows专属x/sys仍按原条件核验。新ID下六项复核与余项阻断、篡改拒绝通过，原15服务/数据/日期不动。相关合同及治理/docs通过后移交REVIEW；其它PG风险、Zod3/Keycloak选择、完整候选/身份/28项/远端CI不因本补丁关闭。

来源：[Go官方公告](https://pkg.go.dev/vuln/GO-2026-6809)、[Go官方发布记录](https://go.dev/doc/devel/release#go1.26)、[官方下载元数据](https://go.dev/dl/?mode=json)。

## 实施、测试与复审回执

官方归档实际SHA256与登记一致，Go1.26.10 Windows便携版本核验通过；没有全局安装或PATH设置。旧1.26.9预检反例先真实落到archive读取（错误接受旧编译器），改为1.26.10后在读取源归档前拒绝1.26.8/1.26.9，不创建输出。仍保留strip，未为未来符号分析加入代码或放宽旧身份。

输出根：D:/Agent/.codex-temp/banksystem-rf065/foundation-20261017-01/gosu-go12610-20261106-01。新gosu SHA256为659327a56817bc638fdf26d65afcaf509af1e5df0f52ecedf3a9ba32558c5fa7；新镜像99846582573a8064ac24304d2b212622e3e0fbc699835410ad375831faf2a771。preservation.json证明原基础层前缀、PG可执行文件、入口、main.go/setup-user.go、go.mod/go.sum均保持，真实Go构建信息为1.26.10；只变已声明的本地版本元数据与编译器。没有执行gosu、用户切换或数据库，仅在自有断网只读容器对三个公开文件核字节。

当前Syft/OSV全包复扫完成，原生退出1。advisory-delta.json显示GO-2026-6809已不再报告；同轮新披露DEBIAN-CVE-2026-76844（未变版本的zlib），所以总数仍133而非132，不能声称总风险清零或净减少。该新项继续阻断，不扩展豁免。单条版本告警移除不表示曾证明旧gosu可被实际利用。

旧PG133项回执及其policy-used.json原件保留；登记真实新ID后，六项已有条件在新镜像重新核验，缺预期0、其余127条仍阻断。candidate-readback.json实际退出5、NO_GO/fullCandidateProduced=false；真实新镜像上的伪造REVIEWED/0副本由tamper-readback.json证明被ARTIFACT_POSTGRES_REVIEW_DRIFT拒绝，不改原native或正确review。

合同54/24/15通过，源码保留与部署身份、实际编译版本及上游修复区间分开复核，未把旧无符号的0命中当新项证据。原15银行容器ID集合不变，未运行模型或业务命令、未改原卷和业务日期。新增编译器/候选/证据约0.498GiB，均为活跃输入；旧工具/原失败和候选保留，不做清理。后续仍须PG剩余风险与其它镜像、许可L3、最终源码/身份及正式28项；本片移交REVIEW，整体NO_GO。
