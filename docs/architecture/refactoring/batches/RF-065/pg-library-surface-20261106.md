---
id: RF065-PG-LIBRARY-SURFACE-20261106
title: PG候选库与独立工具实际入口复核
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.4
effective_date: 2026-11-06
owner: Codex
---

# RF065-S3：PG基础库实际入口

## 2026-11-06 bzip2recover与TPM工具增量（执行前细化）

当前固定25612490…98a8de原生132项、12已审/120阻断。先核[Debian42250](https://security-tracker.debian.org/tracker/CVE-2026-42250)和[24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)，分别只涉及bzip2recover恢复工具的越界和tpm2daemon的PKDECRYPT栈溢出；Debian的[包文件清单](https://packages.debian.org/trixie/amd64/tpm2daemon/filelist)明确后者为独立组件，不等于GnuPG核心或libbz2全部安全。当前镜像断网/只读实查/usr/bin与/bin的bzip2recover、/usr/lib/gnupg与/usr/lib/gnupg2的tpm2daemon均缺失；未启动数据库、未访问原服务。

1. 在既有独立合同期望中补两个精确CVE、三种实际包映射（gnupg2含+b5）及四个缺失路径；验证旧实现失败后，仅扩现有固定探针/精确policy，不改通用判定或原生严重性。
2. 覆盖工具存在、事实缺失、版本/生态漂移、其它GnuPG问题仍阻断。此处是已安装制品的范围处置，不改变包版本、混装sid、删库或安装新依赖；数据格式/接口/迁移0变化。
3. 重探固定实际镜像，以同一原生/BOM字节生成新review并经既有候选消费者回读，必须132/14/118、缺预期0；旧12政策/手填零阻断/伪造可选工具三类实际回读拒绝。相关合同、治理/docs、外部事实投影通过后才交REVIEW，不开始正式28、冻结或推送。

白名单沿本包14既有文件：inspect-ci-foundations.py、ci-foundation-policy.json、test_ci_dependency_scan.py、test_ci_artifacts.py、本包、RF065任务/证据、唯一顺序/backlog、根README/CHANGELOG及外部站data.js/test.mjs/README.md；0新增产品文件/0API/迁移，预算350行。输出复用pg-apt304…下optional-tools-20261106-01，不重复扫描/下载镜像/工具、不改原报告。原132/12/120为历史回执保留，SQLite13和zlib3等其它真实风险不继承这两项处置。

### 可选工具实际回执

先分析官方范围及实际只读四路径，再扩独立期望；旧实现实际69项中1失败/9错误，red.log保留。仅固定探针多四路径，policy增加bzip2 1.0.8-6及GnuPG两个已观察版本映射，通用判定器未改。dependency69/69、artifact25/25、workflow16/16通过；新增反例证明其它四项OpenPGP/归档/CMS缺陷仍阻断，两个新目标的版本/生态漂移不能继承结论，四工具任一出现或缺事实均拒绝。

同一2561…制品重新断网只读/tmpfs实探，16路径均缺失、原两个passwd提供者正确；当前consumer实际14已审/118阻断/缺预期0，原生退出1保留。原生132与BOM完整字节、旧util-linux证据均未修改；新增已审集合严格只有42250/24882。旧12政策回执、手填REVIEWED/零阻断、伪造TPM工具存在三类实际回读均ARTIFACT_POSTGRES_REVIEW_DRIFT，真实进程退出5/BLOCKED/NO_GO。此处是两个缺失工具的精确处置，不能把libbz2/GnuPG源包称为已修或不受影响。

证据optional-tools-20261106-01：四源前像、red.log、review-01/foundation-inventory.json、policy-used、candidate-readback、negative-readbacks、readback-native-exit。没有重复扫描、安装、构建或连接数据库，没有读取账户/口令文件；Java/业务API未变，不重跑无关银行或模型验收。其余SQLite13、zlib3、登录/挂载/共享库风险保持；最终候选、许可、身份/28、远端CI继续独立阻断。

收口复核：治理1批/27模块、文档787元数据/399链接/6104检查、范围diff空白检查及站点12/静态构建通过。原15容器ID/运行与四个Agent/站点PID及启动时间保持，输出15文件/1,943,188字节，无删除/隔离/回收。本片交REVIEW，不把两项不适用范围处置称为运行层漏洞修复或整体GO。

## 2026-11-06 util-linux构建提供者增量

当前固定25612490…98a8de原生132项，11项精确已审/121阻断。Debian对CVE-2022-0563明确：易受影响的是util-linux带Readline的chfn/chsh，而Debian禁用这两项构建、改由shadow源码的passwd包提供。实机两个/usr/bin程序均由passwd拥有，ldd无Readline；但login实际存在，其3184与其它挂载/nsenter风险仍不得豁免。

步骤：先在既有两个合同加入独立provider事实、三个实际util-linux映射版本和其它风险反例，保留红灯；然后仅扩现有固定只读探针的两个dpkg-query所有者字段，必须精确为passwd，任何缺失/错提供者均失败。policy只对三个已观察包版本登记同一0563，不改通用IMAGE判定或原生严重性；最后同一原生/BOM实际重探、当前及旧/伪造回读并复审。不读取/etc/passwd、/etc/shadow或执行chfn/chsh/login，不安装、构建、启动PG/模型或连接原银行。

白名单沿现有inspect-ci-foundations.py、ci-foundation-policy.json、test_ci_dependency_scan.py、test_ci_artifacts.py及本包、RF065任务/证据、唯一顺序/backlog；仅当前事实计数必要同步既有根README/CHANGELOG与外部站现有data/test说明。预算14既有文件/0新增/350行、0API/迁移。输出复用pg-apt304…下util-linux-scope-20261106-01，原生/BOM及旧11项回执不覆盖。完成须证明132不变、只有0563增加为已审，旧/错provider/变版本/变镜像不穿透；SQLite13、zlib3及其它真风险仍阻断，不宣称整包修复或GO。

依据：[Debian0563构建说明](https://security-tracker.debian.org/tracker/CVE-2022-0563)、[Debian3184](https://security-tracker.debian.org/tracker/CVE-2026-3184)。SQLite当前[119371](https://security-tracker.debian.org/tracker/CVE-2026-119371)、[50812](https://security-tracker.debian.org/tracker/CVE-2026-50812)、[119591](https://security-tracker.debian.org/tracker/CVE-2026-119591)仍列trixie受影响且当前同分支无修复，不能按Minor/no-dsa或高版本API名称直接豁免。

### util-linux实际出口与复审

先官方范围/实际镜像元数据分析，再加入独立期望：定向十项初次1失败/8错误（旧探针无provider字段、旧判定不接受），red.log保留。仅增两个dpkg-query所有者探针，命令失败直接传播；policy对实际三种util-linux版本映射登记同一0563，无新通用配置/异常吞没。新定向10+3通过，完整dependency63/63、artifact25/25、workflow15/15通过；错/缺提供者、变版本/生态/镜像/平台及其它五个util-linux风险反例均未放过。

同一2561…候选重新断网只读/tmpfs实探：十二原路径缺失、chfnProvider/chshProvider均passwd。原生132/BOM完整字节不变，已审12/阻断120/缺预期0，实际image_security回读退出5且BLOCKED/NO_GO；唯一新增已审集合为DEBIAN-CVE-2022-0563。旧十一项policy、手填REVIEWED/零阻断和伪造util-linux提供者三类实际负例均ARTIFACT_POSTGRES_REVIEW_DRIFT。五个login/mount/nsenter风险、十三SQLite和三zlib仍阻断，没有把低风险、无同分支修复或不默认运行当豁免。

输出复用pg-apt304…/util-linux-scope-20261106-01，保留四源前像、红灯、完整合同、review-01、policy-used及正/负回读；没有重复扫描、镜像下载/构建、工具安装或银行调用。根README/CHANGELOG及外部事实卡同步132/12/120，并补当前Java121/121隔离PG14.15边界；外部12项及静态构建通过，固定浏览器1440×1000和390×844实际文本/无横溢/无页面错检查通过，GET笔记合成隔离、POST0、原笔记元数据不变，无新截图。原15银行容器ID/运行与四原进程保持；本片移交REVIEW，安全/许可、最终候选/身份、28项、容量、远端CI及整体GO仍未关闭。

## 2026-11-06 SQLite范围增量

当前固定25612490…98a8de原生132项、9项精确处置/123阻断。官方Debian逐项核实后新增两项范围证据：CVE-2026-39113只存在于2026年3月开发快照的SQLAR int64变更，从未进入Debian发布版；CVE-2025-70873属于zipfile扩展，Debian明确其二进制包未构建该扩展。不能按“unimportant”、上游争议或PG未直接依赖SQLite豁免其它库问题。当前trixie仍未发布修复其它SQLite/zlib项的同分支更新，不能混装sid求扫描归零。

微观步骤：①先核官方范围/代码差异、Debian libsqlite3-0文件清单及精确镜像中已安装版本/模块缺失；②既有独立期望加入两项和两个标准扩展路径，实际暴露旧9项/探针不足，再只扩现有policy/固定探针，不改通用判定器；③合同及实际断网/只读/tmpfs重探、旧/篡改回执拒绝、原状态核验后移交REVIEW。原生/BOM复用原字节、不宣称重新扫描；公开元数据和回执放同pg-apt304目录下sqlite-scope-20261106-01。

白名单仍为inspect-ci-foundations.py、ci-foundation-policy.json、test_ci_dependency_scan.py、test_ci_artifacts.py、本包及RF065任务/证据、唯一顺序/backlog；必要同步根README/CHANGELOG与外部站data.js/test.mjs/README.md中的当前计数，不改UI/后台/笔记。预算14文件/0新增/350行，0产品API/迁移。完成须证明132原生不变、仅新增两项、11已审/121仍阻断，精确版本/镜像/扩展存在或证据缺失拒绝；不得关闭安全总门、正式28项或GO。不新增依赖/工具/镜像、银行/模型/数据库调用，原数据/卷/日期保持。

一手依据：[Debian39113](https://security-tracker.debian.org/tracker/CVE-2026-39113)、[上游引入差异](https://github.com/sqlite/sqlite/commit/169f68ed88b34cb68f720191c64c058f2ccec508)、[随后修复](https://github.com/sqlite/sqlite/commit/34e139d3a306fcc0eeaf29de69783a311d48356b)、[Debian70873构建范围](https://security-tracker.debian.org/tracker/CVE-2025-70873)、[libsqlite3-0文件清单](https://packages.debian.org/trixie/amd64/libsqlite3-0/filelist)。39113不需要移植新代码，70873不等于版本已修复；外部挂载/自建扩展不在该不可变镜像处置范围。

## 2026-11-06 独立工具增量

APT修补后的固定候选25612490…98a8de原生132条、七项已审、125项阻断。本增量只处理DEBIAN-CVE-2011-3374与DEBIAN-CVE-2026-15059：前者为apt-key net-update的密钥验证，后者为systemd-oomd独立守护进程IPC；官方条目/缺陷记录分别确认范围，实机/usr/bin和/usr/sbin的apt-key、/usr/lib/systemd与/usr/bin的systemd-oomd均缺失。APT源码包仍被数据库标vulnerable，不伪称版本已修补；此为精确制品不适用，不是风险接受或改写原生报告。

微观步骤：先在既有PostgresExactReachabilityTest与工件消费者加入两条独立期望和存在/缺证据反例，实测旧实现不能处理；再扩现有固定探针及policy的两条具名处置，绑定当前包版本/镜像/平台；最后复用同镜像原生/BOM并重新实机探测与候选回读，留存篡改拒绝。只读/tmpfs、无数据库/银行/模型调用；不重复联网扫描未变字节，不新增工具或镜像。

新增白名单仍限inspect-ci-foundations.py、ci-foundation-policy.json、test_ci_dependency_scan.py、test_ci_artifacts.py、本包及RF065任务/证据、唯一顺序/backlog。预算9文件/0新增/350行、0合同/迁移。旧七项与原候选回执不覆盖；原生数量不减少，不能称修复两条漏洞。三条FSS日志告警涉及共享库消费，仅缺journalctl不足以排除，CVE-2013-4392亦未完成精确代码入口核验，均保持阻断。

依据：[Debian apt-key条目](https://security-tracker.debian.org/tracker/CVE-2011-3374)、[原始缺陷](https://bugs.debian.org/642480)、[当前APT文件清单](https://packages.debian.org/trixie/amd64/apt/filelist)、[oomd条目](https://security-tracker.debian.org/tracker/CVE-2026-15059)、[systemd上游公告](https://github.com/systemd/systemd/security/advisories/GHSA-652q-wxr6-h5j6)。上述证据只支持两项条件，不把未安装工具推广为其源包/共享库全部安全。

## 目标与已观测来源

以下为同日先前9984…候选的SQLite/zlib首轮记录，保留原身份与133项计数；上方独立工具增量属于后续2561…候选，不相互覆盖。

固定候选99846582573a8064ac24304d2b212622e3e0fbc699835410ad375831faf2a771原生133条，已有六条精确处置。继续核SQLite与zlib，不用“PG未直接使用”或版本描述的一句话排除风险。只读实机发现：PG主程序加载zlib；其bin/lib动态依赖未显示SQLite，但gpg、liblastlog2确实加载libsqlite3，故不能排除SQLite库漏洞或卸载该库。

SQLite DEBIAN-CVE-2026-119586要求命令行shell的.recover输出被管道再次输入sqlite3；固定镜像/usr/bin/sqlite3与/usr/local/bin/sqlite3不存在，command -v sqlite3亦为空。此项与libsqlite3 API漏洞不同，可增加一项缺CLI的精确处置。保留其它15条SQLite、全部三条zlib及其它基础风险。zlib CVE-2026-85091描述范围与Debian受影响标记不一致，官方讨论仍指出旧版本复现争议，不能按1.3.1低于1.3.1.2直接豁免。

## 实现与路径白名单

1. 现有PostgresExactReachabilityTest加入SQLite shell已缺失的输入和其它SQLite/zlib仍阻断的反例，确认现有六项规则不能接受新增精确判定。
2. 仅在inspect-ci-foundations.py既有静态只读探针增加上述两个CLI路径；ci-foundation-policy.json增加固定sqlite3源码包3.46.1-7+deb13u2/Debian:13/唯一公告处置。复用现有镜像ID/平台/真实探针/原生发现匹配，不加通用ELF解析器、重试、全局例外或移除镜像软件。
3. 工件消费者补真实探针若发现SQLite CLI即拒绝旧缺失证明的反例；复用当前133条原生报告及BOM产生新的review/候选回读，旧policy/报告不覆盖。合同、治理和docs后进行验收导向复审。

白名单：scripts/deploy/inspect-ci-foundations.py、scripts/test/{ci-foundation-policy.json,test_ci_dependency_scan.py,test_ci_artifacts.py}、本包、RF065 tasks/S3.md/evidence-index.md、唯一顺序/backlog；必要时仅同步外部站点现有assessmentNote。预算10文件/1新增/300行，0 API/0迁移。只使用已有Docker/Python工具；不安装依赖或下载镜像，不启动PG或模型，不冻结身份；原服务/数据/卷/日期不动。

## 验证与完成门

合同：已证七项与未审SQLite/zlib分开计数、原生严重性保留，CLI存在/缺探针/变版本/变镜像均不能复用处置。集成：固定候选再次只读断网探针，原生/BOM/层/ID不变；候选仍退出5而不是GO。python scripts/test/test_ci_dependency_scan.py、test_ci_artifacts.py、test_ci_workflow.py以及RF065治理/docs通过后移交REVIEW；不标安全总门、正式28项或发布完成。

## 一手依据

- https://security-tracker.debian.org/tracker/CVE-2026-119586
- https://security-tracker.debian.org/tracker/CVE-2026-85091
- https://github.com/madler/zlib/issues/1310
- https://bugs.debian.org/1146895
- https://github.com/madler/zlib/issues/1292

2026-11-06回读；官方描述与现场事实支持有限范围推断，不是Debian已接受修订或包已修补。其余SQLite入口、zlib旧路径和其它未审公告继续阻断。

## 实施回执与复审

先完成来源和实际依赖核对，再为七项输入/未审库反例改合同：旧实现报FEATURE_PROOF_DRIFT及6≠7，原失败已观测。新增两个固定缺CLI路径和一条精确sqlite3公告后，合同55/55、工件25/25、workflow15/15通过；无通用解析器、工具安装、包卸载或新镜像构建。原四工具与两个sqlite3路径均ABSENT。

证据位于D:/Agent/.codex-temp/banksystem-rf065/foundation-20261017-01/pg-library-surface-20261106-01。复用同一9984…2a771的原生133条与BOM，重新核镜像层/BOM标识并实机生成review-01；未伪称重新联网扫描。新policy-used.json保留本轮精确政策，candidate-readback.json由image_security实际重探得到7项已审、126项阻断、缺预期0，仍BLOCKED/NO_GO。Python回读子进程按现有合同退出5；外层随后只读进程检查返回0，不将外层状态误记为安全通过。synthetic-forged-review.json明确为合成篡改，tamper-readback.json记录实际探针回读拒绝ARTIFACT_POSTGRES_REVIEW_DRIFT。

验收导向复审核对：.recover属于shell，不是libsqlite3通用API；liblastlog2与gpg确实依赖库，其余15条SQLite仍阻断。zlib三项未增加任何处置，特别是85091不能根据描述范围跳过Debian旧路径争议。缺任一探针、CLI存在、变包版本/镜像/架构均不能复用缺CLI结论。官方网页用于解释触发前提，不把普通讨论者的AI生成补丁或结论当厂商认可。

原15个银行容器ID/运行状态与已有基线完全一致，Agent三个原PID仍存活；无银行、模型、数据库日期或原数据读取。新增产物约1.05MB，均为本轮公开元数据/现有原生报告的证据投影，没有下载或复制镜像归档。本片移交REVIEW；RF065-S3及安全/许可/当前身份28项/远端CI总门不变，整体NO_GO。

## 独立工具增量回执与复审

源码/官方范围分析先于测试：apt-key net-update与systemd-oomd IPC属于独立工具，APT包文件清单及固定镜像路径均确认缺失。未因Debian标unimportant、上游争议或不启动某功能就批量排除共享库。CVE-2013-4392及三条FSS日志问题仍阻断，不把初步缺systemd/journalctl观察当成完整代码不可达证明。

针对两项新条件的独立输入先实际报FEATURE_PROOF_DRIFT，探针命令亦漏新路径；red.log保留6项运行的1失败/4错误。扩现有探针四个固定路径和两条精确policy后，9项定向合同通过；完整dependency59/59、artifact25/25、workflow15/15通过。反例覆盖十个路径任一存在、缺探针、错镜像/平台、变包版本及未审systemd/SQLite/zlib；工件消费同时核新工具和原SQLite两路径存在即拒绝旧缺失证明。

实际复用25612490…98a8de的原生/BOM，不重建、不复制归档或宣称重新联网扫描。十路径重新在断网只读/tmpfs容器实探均ABSENT；新review为原生132、9项已审、123项阻断、缺预期0。candidate-readback.json由现有image_security重探给出BLOCKED/退出5和NO_GO，PG18.6厂商门仍通过；原生严重性与数量不改写。

真实负例回读分别拒绝旧七项policy回执、合成REVIEWED/零剩余、合成apt-key虚假特征，均为ARTIFACT_POSTGRES_REVIEW_DRIFT。negative-readbacks.json核原生/BOM摘要与先前正确回执一致，原报告未改；此为安全证据边界，不是最终候选或银行验收。输出为原pg-apt304-20261106-01下absent-tools-20261106-01，包含本轮policy、review、失败、候选和负例回执；没有新工具/模型/银行调用。

复审核对只新增两项、其余风险不推广、旧回执失效和新事实重探，原15银行容器名称/ID与运行集合一致、0 unhealthy，三个Agent进程保持。任务移交REVIEW，RF065总门、许可/最终候选/统一身份/正式28项与容量/远端CI仍未关闭，整体NO_GO。当前制品的条件已审不同于修补，不能将此增量写成“修复两条漏洞”。

## SQLite范围增量实施回执与复审

先核官方Debian两条范围和上游实际diff，再对固定镜像只读查询：libsqlite3-0:amd64确为3.46.1-7+deb13u2，其完整文件清单仅核心共享库和文档，/usr/lib无zipfile文件，两个标准扩展路径均不存在。未依据“unimportant”、争议或不直接调用SQLite排除整库；39113的上游开发快照引入代码与3.46.1不混同，70873只针对Debian未构建扩展。

既有独立测试先实际出现FEATURE_PROOF_DRIFT及遗漏zipfile路径，8项中1失败/6错误保存在red.log。只扩固定探针两路径与policy两条具名决策，通用reviewer不变。定向8+3通过，完整dependency61/61、artifact25/25、workflow15/15通过；新反例核另外版本/生态不能复用，库API和争议zlib仍保留原严重性并阻断，扩展存在/缺证据/身份平台漂移拒绝。

复用原2561…镜像和原生/BOM字节，新review-01实际12路径重探；原生132项、11项已审、121项阻断、缺预期0。PG18.6厂商门通过，但image_security实际回读仍BLOCKED/FAILED、releaseDecision=NO_GO/fullCandidateProduced=false。首次外壳将非零归一为1；再次显式读取并退出LASTEXITCODE，已观察PG_SQLITE_READBACK_NATIVE_EXIT=5，不把外壳检查0写成安全通过。旧九项政策回执、合成REVIEWED/零阻断和虚假扩展存在三类实际负例均ARTIFACT_POSTGRES_REVIEW_DRIFT；原生/BOM/正确回执摘要前后不变。

原生中其余13条SQLite、三条zlib和其它未审风险继续阻断；没有换到sid或删软件，不构建新镜像/安装依赖/重复联网扫描。当前公开README/CHANGELOG及外部摘要/卡片同步132/11/121，历史9/123回执和截图不覆盖。外部静态与12项测试通过，原24181真实浏览器在1440×1000、390×844显示新数字/NO_GO、无横溢或页面错误；GET笔记用合成记录拦截、POST0、原记录元数据不变，无新截图重复积累。

当前输出为pg-apt304-20261106-01/sqlite-scope-20261106-01，包括原始红灯、合同、安装包清单、policy-used、实际review/candidate/negative回读及站点数据核验。验收导向复审确认只新增两项范围决策、不改原生记录、不推广整库、不降低最终门；原15银行容器名称/ID与基线机器比较一致，Harness/MCP/Worker和站点原PID存活。无银行/模型/日期/卷操作或Git提交/推送。本片移交REVIEW，安全总门、许可/统一候选、正式28项与容量/远端CI及整体GO未关闭。
