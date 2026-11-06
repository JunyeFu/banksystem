---
id: RF065-MQ-LIBRARY-SECURITY-20261106
title: 固定MQ候选Noble基础库安全补丁
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.6
effective_date: 2026-11-06
owner: Codex
---

# 固定MQ候选Noble基础库安全补丁

## W组：剩余原生消费者与SQLite边界

1. W1 给同一MQ cf0293…42c6b18剩余58项建立“公告条件→实际原生消费者→默认产品入口→证据/下一动作”映射。读取已绑定T原生及U回执，去重源包/公告而不删除二进制包命中；一手来源与同分支发布状态核实后再判断，不逐条重建镜像或复制全仓。
2. W2 单独验证SQLite命令行.recover与十项库路径：实际默认Broker持久化适配、启动/健康/Console、公开Jar及JNI服务提供者、JRE原生依赖与可能动态加载。只把进程maps作为补充，不能仅凭未加载、默认不用SQL或未找到文本给整个库放行。Expat的字体配置等间接路径、已有subuid/gpgtar反证必须保留。
3. W3 仅对达到证明标准的精确公告/版本追加原政策及feature检查，消费者复核同一镜像/源码配置/载荷；先补正反合同，再真实只读镜像及消费者核验，缺事实、反向功能、状态漂移和漏公告均拒绝。对其余项给明确待证或同支线修法，不用计数下降冒充新补丁。
4. W4 治理/docs及外部站投影、原15容器/网络/四PID与定向diff收口后交REVIEW；源码/合同/实际镜像工具证据分级，当前最终身份/28项/性能/远端CI仍不启动。白名单与唯一状态见backlog的MQ-NATIVE-CONSUMERS，未取得充分证据的风险继续阻断。

输出mq-native-consumers-20261106-01只留本组消费者映射、必要原件比较/公共二进制检查、合同和实际消费者回执，复用T/U原生与既有Apache包；不下载另一发行版/源码全库、不安装宿主工具、不复制整镜像或操作原银行/数据/业务日期。预计小于20MiB；若需受控Broker仅用新合成数据、内部网络、无宿主端口和原卷，不改变原拓扑。

### W组实读后的最小修法

实际镜像577个上游文件与T原件相同，137归档含内嵌包中SQLite类/驱动SPI/原生调用标记0、FFI类引用0、原生载荷0，默认KahaDB，JRE原生依赖没有SQLite；但这仍不足以豁免库：gpg与keyboxd确实依赖libsqlite3-0。另有fc-cache/fc-match→fontconfig→Expat实际链，故不把字体/XML库当未用。全部58公告按源包版本/条件/真实原生消费者映射输出，未证项仍阻断。

依赖图明确APT需要gpgv，不需要gpg或SQLite；SQLite仅由gpg/keyboxd依赖，gnupg元包同时依赖它们。当前启动/入口/健康链与137归档未提供GPG业务，产品不承诺独立GPG/TOFU/密钥管理工具。只在新的MQ运行镜像层用断网dpkg --remove移除gnupg、gpg、keyboxd、libsqlite3-0四个确切包，既有Java112文件、上游577文件、gpgv、gnupg-utils/gpgtar和字体链保留。不用force、purge、autoremove、通配符或直接删动态库；包管理器必须通过依赖检查与audit，否则失败，不添加补回路径。

先审四包prerm/postrm及保留许可：只有keyboxd.postrm含仅purge才执行的systemd-user清理，remove不进入该分支；gpgv/gnupg-utils/gpgconf/dirmngr版权原件均独立普通文件，不依赖被删包。将实际卸载名单写准备清单、精确正反合同约束Dockerfile；白名单补原MQ准备器及Dockerfile。预期产物改为新镜像、原生/BOM与绑定、全包差异和保留应用/JRE/许可、真实客户端/Console/持久重建和实际消费者。不在原镜像/宿主卸载，也不把不再打包的SQLite冒作被修复的版本或NOT_AFFECTED豁免。初始20MiB估算仅源审，新增候选/合成KahaDB与必要证据预计小于0.3GiB，收口按实际检查。

### W组实际修复与独立消费者复核

78项依赖合同先红（1失败/1错误），随后仅准备清单声明四个excludedRuntimePackages、Dockerfile在断网安装原四补丁后用dpkg --remove移除上述四包并audit，78/78绿。新镜像`sha256:a21890d4f7de7586f68b504b23b594d440ad4d97ebb32d69af49200e16237b4f`（tag local/rf065foundation20261106-activemq:6.3.3-java21-no-sqlite-04）构建0，实际安装包仅少gnupg/gpg/keyboxd/libsqlite3-0，新增包0、保留版本变化0。gpgv真实运行成功，gnupg-utils/gpgtar、APT、fontconfig/Expat保留；不以卸载记录条目的存在冒称仍安装或已清除全部GnuPG风险。

实际577个上游文件、全部厂商JRE文件与T字节相同，OS120/Java118个DER集合保持，目标撤销根仍缺失；六份保留版权/Apache LICENSE/NOTICE原件与前像一致。公开Jar分析零SQLite类/驱动SPI/原生载荷/FFI/GPG命令引用，不能否认原有gpg/keyboxd/SQLite实际链；这是源审后去除未消费组件，不是给存在的库签豁免。字体间接路径仍明确保留，不能借本组放行Expat。

新固定Syft/OSV实际扫描native1，SBOM没有SQLite组件，原生60→49，恰移除11个SQLite公告、新增0；旧原生/镜像/U回执不改写。当前政策只重绑实际新ID与报告stem，保留原两项平台/缺失功能处置，没有新增SQLite NOT_AFFECTED。实际既有producer/consumer已审2/阻断47/缺项0，消费者退出5；旧T BOM、旧U回执及手改成功数量被拒绝，shadow与gpgtar仍阻断。共享政策当前PG仍14已审/118阻断，Channel独立当前回执仍62已审/0阻断。

实际新Broker用当前6.2.10客户端及实际配置连接/密钥接线完成Console401/401/200、错凭据拒绝、文本/属性、回滚同ID二投、提交移除、容器重建后的持久回读/排空；均退出0。只用自有内部网络/随机合成凭据/新data，无宿主端口、原卷或银行动作，关闭自有资源后原15容器与网络保持。最终78依赖/29工件/16workflow合同通过；未改Java源码，不冒领重跑T的121项Java或PG18迁移，更不替代正式银行/Agent28项。

输出mq-native-consumers-20261106-01保留全部58项修前消费者映射、实际包依赖和JRE/原生工具链、归档/源码比对、准备/新镜像/原生/SBOM、全包/双信任库/许可、真实协议及实际消费者/反例回执。RF065治理1批/27模块、docs787元数据/425链接/6104检查、站点12项和静态构建、15路径定向diff通过。原15容器ID/运行/启动时刻、网络集合和四PID/启动时刻保持，12项已配置健康检查正常、3项未配置不冒称healthy。收口回执前新增655文件/108118241字节，最大33554432字节为合成KahaDB；必要输入/候选与正反证据原地保留，宿主没有删除/隔离、回收0，新镜像四包去除不涉及原服务或原卷。后续继续当前47项真实触发面与其余镜像/版本/许可门，不自动扩大OS清理或移动原状态；本包交REVIEW，整体NO_GO。

## U组：固定MQ镜像的平台与缺失功能适用性

本组只评估T组同一cf0293…42c6b18的60项真实原生/BOM，不重建或替换镜像。已核官方来源：[GnuPG Windows DACL CVE-2026-118131](https://ubuntu.com/security/CVE-2026-118131)、[journald CVE-2026-40228](https://ubuntu.com/security/CVE-2026-40228)、[subuid CVE-2024-56433](https://ubuntu.com/security/CVE-2024-56433)。Windows限定不是对其它GnuPG问题的豁免；实际gpgtar存在，CVE-2026-105712仍待审。Ubuntu仍未给后两项同分支修复，不能写成版本已修。官方libexpat1最新仍2.6.1-2ubuntu0.6，当前已安装，不因其它发行修复版本号擅自换OS或混装。

1. U1 来源与事实：保留当前原生60项及severity/哈希，实读Linux/amd64、journald的三个实际路径和systemd安装状态；另核newuidmap实际路径、uidmap状态与公共镜像/etc/subuid是否为空。实际已有range，shadow条件未证、继续阻断。只记存在/空/缺失及状态，不读取任何运行凭据或原卷。每个例外绑定单一advisory、源包版本、生态和不可变镜像；任一前置条件缺证或矛盾仍拒绝。
2. U2 产品接线：在既有foundation检查器增加当前MQ的精确feature/review能力，复用已存在的精确公告匹配器；工件消费者必须重新获取实际feature，不相信手写PASSED或数量。原生退出1/全部60仍保留，只有已证两项可标NOT_AFFECTED，其余58项继续BLOCKED，不增加全局忽略/未来框架或对其它源包的处置。
3. U3 验收：合同覆盖Linux正例、Windows/错误镜像/版本/生态、缺失公告、每个功能由缺失变存在、缺事实/假数量/旧policy/原生/BOM篡改。实际生产者与原消费者跑固定镜像并拒绝T组旧回执，PG及Channel仍按各自原件/精确政策检查；源码与受控工具证据不提升为银行LIVE。治理/docs、外部站事实投影及定向diff通过后交REVIEW，整体NO_GO。

任务和白名单见backlog对应MQ-OS-SURFACE记录；沿现有S3，不开并行路线。自有输出mq-os-surface-20261106-01复用T组原生/BOM，只保存新事实、合同及实际消费者回执，预计小于5MiB；T组121/PG/JMS证据只作同一未变镜像的已有运行依据，不伪称本组重跑。不涉及业务源代码、原环境、宿主安装、主版本选择、最终身份或正式28项。

### U组实读纠正：shadow不得处置

首轮实际producer退出1，原因ACTIVEMQ_REVIEW_FEATURE_PROOF_DRIFT。先前只确认/etc/subuid存在便把它预设为空，真实文件为普通20字节、范围100000起65536个；四个newuidmap路径虽缺失，原“无已分配range”条件并不成立。初次actual-consumer.log/native-exit原样保留；删除未成立的shadow处置，不清空该文件、不削弱条件、不为清零构建另一个镜像。将实际观测的shadow与存在的gpgtar列入必须继续阻断的回归断言；本组仅接已证的Windows-only GnuPG与缺失journald两项，原生60项全保留，预期已审2/阻断58。上方三项流程是执行前待证假设，不是实际证明结果。

### U组实际消费者复核

复用现有精确匹配器新增MQ四个journald路径事实及Linux/amd64/不可变镜像校验；只接两条精确公告版本，未增加通用忽略、重试或包改写。工件消费者与PG共享现有结构校验但各取独立feature/review函数及政策；缺review时仍全部60阻断。检查器识别悬空符号链接为PRESENT，不把不可读/缺证当缺失。105项首次合同因缺MQ能力而红（18错误），实现后绿；实际subuid拒绝后删除未证shadow项，加入shadow/gpgtar继续阻断断言，最终77依赖/29工件/16workflow全部通过。

实际当前producer与未mock的消费者读取同一cf0293…42c6b18：原生仍60/native1，精确已审2/阻断58/缺项0，消费者实际退出5。拒绝8类旧或手改回执：提升成功数量、伪造feature、缺/重复记录、缺riskReview、篡改native退出、旧policy和实际T组旧回执；没有review仍60阻断。实际systemd及uidmap均未安装；不据此放行有range的shadow或其它gnupg2问题。共享政策更新后真实PG重新取事实仍14已审/118阻断；Channel独立原件/政策仍62已审0阻断。原MQ镜像、T原生/BOM摘要与字节全保持，不重建镜像、不重跑或冒领T组JMS/PG/Java运行证据；本次只为STATIC/CONTRACT和实际镜像证据消费者验收。

自有输出mq-os-surface-20261106-01记录原生引用及摘要、实际feature/风险判定、八类反例、首次失败与修正后的实际退出、三合同和验收导向复核。RF065治理1批/27模块、docs787元数据/423链接/6104检查、站点12项及静态构建、13路径定向diff通过。原15容器ID/运行/启动时刻及网络集合、四PID及启动时刻均保持；12项已配置健康检查正常，3项没有Health不可冒称healthy。关闭回执初次Go模板直接读缺失Health键退出1，记录后仅改为按存在字段取值，产品未改变。收口前自有28文件/1318309字节、最大590325字节，必要证据原地保留，没有删除/隔离、回收0。RF065-S3与整体继续NO_GO，剩余58项不是已接受风险，不冻结/正式28/远端CI或替换原部署；本小包交REVIEW，后续继续同S3实际MQ原生库/工具触发面与其余已登记风险。

## S组：产品不打包未启用的Shiro可选认证

当前51a440…215c52c的62项中，唯一Maven命中为shiro-core2.2.1的RememberMe期限缺陷。官方[安全报告](https://shiro.apache.org/security-reports.html)明确仅RememberMe启用时触发，修复线为3.0；本产品不承诺Shiro认证，现有声明是入口注入simpleAuthenticationPlugin与Console上游JAAS BASIC。此处不对任意自定义broker配置签不受影响，而是在已授权MQ6.3.3隔离候选范围内缩减实际产品包；不引入Shiro3主版本适配或豁免。

1. S1 核实际发行包54个conf资源、两个Web应用描述与Jar引用，确认产品已声明路径独立于Shiro；保留官方SHA512和全部原始LICENSE/NOTICE。准备器从已核原包解包时仅排除lib/optional/activemq-shiro-6.3.3.jar、shiro-core-2.2.1.jar、shiro-spring-2.2.1.jar，记录精确原件摘要；不对旧上下文执行删除、不用通配符清理或修改原服务。测试覆盖这三项排除、JAAS/其它依赖和许可不变。
2. S2 新tag/上下文断网构建并核除三项外全部上游文件相同；实际镜像Jar/内嵌归档不得残留org/apache/shiro类，生成绑定新ID的SBOM/native，旧62报告保留。若出现真实依赖失败，定位本次排除的消费关系，不添加运行回退或隐藏重试。
3. S3 用当前真实6.2.10客户端与Console重复认证/事务/持久重建，原环境及自有资源闭合检查；当前policy/消费者必须拒绝旧ID报告，剩余OS风险继续BLOCKED。依赖/工件/workflow合同、治理/docs与验收导向复核通过后本小包只交REVIEW，S3和整体NO_GO不变。

精确白名单见backlog对应任务，沿既有RF065-S3，不新增公共API/迁移/运行配置。自有输出mq633-no-shiro-20261106-01，复用已下载Apache包、旧三份Noble补丁与厂商Java21，不复制整个仓库/宿主安装，预计小于0.4GiB。V组的“580个完整上游文件保持”只描述原完整候选，不可套到本组；本组必须单列三个已排除项与保留577项。

### S组实际修复与复审回执

当前完整V候选139个外部归档的类引用只来自上述三个可选Jar，实际active XML及两个Web描述符无Shiro入口；先建立排除/JAAS保留/其它可选模块不误删的合同，69项中一项因缺excludedOptionalArtifacts字段退出1，随后准备器只在新解包时过滤三个精确成员，69/69通过。没有unlink旧产物、通配符删包或新增运行配置/兼容外壳，官方原包与LICENSE/NOTICE均保持。

新固定候选`sha256:9bcc352bfcea32cf2e5a9bdd61c430fac8b610e34995aa3836b2d6617dfdf7fc`（tag `local/rf065foundation20261106-activemq:6.3.3-java21-no-shiro-02`）断网构建0，保留577个上游文件且其实际镜像字节逐一匹配；仅三项省略，原包仍有完整580项。新137个归档含内嵌Jar遍历后Shiro可执行类/字节码引用均0，当前XML活动引用0。SBOM仍诚实保留activemq-all内org.apache.activemq:activemq-shiro6.3.3的Maven元数据和空目录；它不是shiro-core2.2.1类载荷，没有改写BOM、删元数据或添加忽略来清零。

实际当前6.2.10客户端与新Broker认证、文本/属性、rollback同ID第二投递、commit移除及重建持久回读/排空均退出0；Console无认证401/错密码401/合法凭据200通过。自有网络/data/随机合成凭据与无宿主端口保持，收拢后原15容器ID/运行与网络集合不变。仅隔离INTEGRATION，不是原服务升级或正式银行LIVE。Jetty等保留字节与V一致，没有把V的整镜像验收直接冒作本组。

新原生62→61/native1：移除Shiro GHSA-m8g6-vrr2-x7ff，同时Ubuntu上游数据把UBUNTU-CVE-2026-122054替换为USN-9001-1；所有Ubuntu包名/版本/生态元组实际相同。最初“只移除Shiro且BOM无任何Shiro名称”的诊断预设不成立，已据实际来源纠正；此为数据/元数据认识修正，不改扫描或伪造库已消失。实际无shiro-core组件，剩余61项全为Ubuntu并继续阻断；不能把CA编号变动记为第二项修复。

新policy/原生/BOM绑定实际ID，既有候选消费者实际退出5/BLOCKED并拒绝V的旧62报告；共享policy下PG仍14已审/118阻断。69依赖/25工件/16workflow合同通过，实际LICENSE/NOTICE原件回读匹配，原生/旧镜像/失败摘要保留。自有输出mq633-no-shiro-20261106-01包含red-summary、prepared排除摘要、577原件比较、payload-verification、metadata-only-shiro、原生/BOM、真实协议/Console及关闭回执、advisory-source-update、真实消费者退出5。本小包交REVIEW，未冻结/正式28/提交或推送，整体NO_GO。

收口核对：RF065治理1批/27模块、docs787元数据/419链接/6104检查、站点12项与静态构建及本片9路径定向diff退出0。原15容器ID/运行、四PID及启动时刻保持；输出638文件/108,536,899字节，最大33,554,432字节为本片合成KahaDB，原地保留活跃候选/原生/必要正反结果，没有删除或隔离，回收0。七Word文书保持V组的已验页快照，不用每次风险计数更新反复重做未改资料；最终候选交付时再统一同步。

## T组：Noble CA与JKS同支线修补

2026-11-06 T1开始执行：官方Noble包为20260816ubuntu0.24.04.2、140,064字节，packages.ubuntu.com发布SHA256为f9fbacd417b515450b831032cc39d18059e9874e67525679a43c16071dabf9a0。先仅下载至新ca-jks-20261106-01并审控制/维护脚本与原.1差异；当前两个候选的dpkg安装状态、JKS hook及独立厂商JRE路径分别核实，不能用dpkg-query存在一个状态条目就判断ca-certificates-java已安装。白名单已含Channel Dockerfile和精确审查绑定，尚未修改其源码/镜像或原环境；下方READY为细化时历史。

新报告实际命中[USN-9001-1](https://ubuntu.com/security/notices/USN-9001-1)，官方2026-11-05声明移除的系统CA未同步从JKS删除，Noble修复为ca-certificates20260816ubuntu0.24.04.2（当前为.1），另涉及ca-certificates-java。不能因为已删除emSign G3或换过Java CPU就自动豁免这一不同的集成问题；也不能把系统包版本当厂商独立JRE信任库证明。

沿现有S3细化：①先核官方固定.2包、摘要、维护脚本/依赖、JKS hook与当前MQ/Channel的实际信任库来源；②只在新上下文/镜像接同分支补丁，保留厂商Java21与未受影响的应用，OS/JRE分别回读，不在宿主或原容器更新、不导入未知证书；③新原生/绑定/许可材料及真实JMS/Console与受影响Channel检查通过后交REVIEW，任何剩余风险不放行。白名单见backlog的CA-JKS任务，当前仅READY，尚未下载/构建.2或改Channel。此为已观测安全修法，不是待选择的功能版本迁移；统一候选与最终身份门仍未打开。

### T组实际修复与验收导向复核

官方[USN-9001-1](https://ubuntu.com/security/notices/USN-9001-1)及[包校验页](https://packages.ubuntu.com/noble-updates/all/ca-certificates/download)核对后，.2实际140064字节/SHA256 f9fbacd417b515450b831032cc39d18059e9874e67525679a43c16071dabf9a0。第一次security.ubuntu.com的Windows curl因Schannel吊销服务不可用退出35，未关闭TLS验证；改用Ubuntu官方archive.ubuntu.com同一发布包成功并核摘要，两个URL分别记录为规范来源与实际取得地址，不加运行回退。

先解出并完整审维护脚本：控制区仅control/md5sums/postinst三项变，载荷仅update-ca-certificates、changelog和手册三项变，所有CRT/copyright、config/postrm/triggers原字节不变；依赖仍openssl/debconf，仅提高旧ca-certificates-java的Breaks。postinst同次通知正常hook，update脚本传--fresh并按新增/移除顺序供给hook。两个原候选均明确未安装ca-certificates-java、无JKS hook或系统JKS，不能用dpkg-query -W的元数据条目误判。实际Temurin cacerts为独立普通文件，且产品入口不调用其可选系统CA导入脚本；未新增ca-certificates-java或证书。

定向合同先红70项（2失败/1错误），再将准备器固定输入从.1换成.2，并在MQ及Channel各自离线dpkg安装中增加第四个精确包；其它十个已核输入复用。MQ新候选`sha256:cf0293483c05f78fa285db6fe44b980a7685f69ddc79c122f5133f84242c6b18`，Channel/Test Support新候选`sha256:b339ed771069dcabdcd9516dad3f20db758903505e04bcf4d4aa6d76c9333e05`，构建均0。实际两个新旧镜像的全部包差异只有CA .1→.2；所有JRE文件、CRT和两种DER集合相同（Java118/系统120），emSign G3仍不在任一集合。应用侧577个MQ原件/137归档无Shiro类引用，Channel157类/69依赖及资源、Jar字节与已核前像相同；不是用OS版本证明Java TLS已修。

初次与历史扫描对照出现glibc的UBUNTU-CVE-2026-122054消失，不能归因本补丁。保留初次报告后，对新旧同ID镜像采用相同参数重新扫描：旧Channel当前数据库63包含USN-9001-1，原历史glibc ID不再出现；匹配参数的真实新旧差异仅CA USN移除。MQ61→60、Channel63→62，新增0，原生均退出1。只退役已不在原生报告的旧glibc精确条目并重绑当前源码/镜像/layers/payload，不新增CA豁免，也不声称glibc已修。实际Channel审查62已审/0阻断/缺项0，许可材料原件20项摘要匹配、总关联未解0，完整二进制分发义务仍未完成。

使用实际新Jar/JRE与新MQ重复Console401/401/200、客户端6.2.10错密码拒绝、消息属性、事务回滚同ID二投、提交移除及持久重建/排空，均通过。实际新Channel→独立PG18.6完成59迁移、第二次0待执行，业务表保持空；Java21全套36类121/121，失败/错误/跳过0。实际未修改的产品消费者接受当前Channel证据，仍以退出5阻断MQ60及PG118（PG14已审）；分别拒绝旧MQ BOM、旧Channel镜像及旧Channel回执，缺一公告反例仍失败。70依赖/25工件/16workflow合同通过，原15容器/网络保持；本组仅隔离INTEGRATION和受控源码证据，不是正式28项或原部署升级。

输出`foundation-20261017-01/ca-jks-20261106-01`保留官方包审查/取得回执、初次与对齐扫描、全包/双信任库实际比较、完整源码构建、实际许可、协议及PG关闭回执、Java与三合同、消费者原生退出5/反例及独立复核。RF065治理1批/27模块、docs787元数据/421链接/6104检查、站点12项及静态构建通过；14个本片路径的定向diff退出0。原15容器ID/运行与网络集合保持，12个已配置健康检查均healthy，其余3个未配置不冒称healthy，四原进程PID及启动时刻保持。自有输出2889文件/272834032字节（收口回执前），最大42115762字节；当前必要输入/原生/制品及正反结果原地保留，没有删除或隔离、回收0。源码/身份未冻结，未进行银行写入/模型调用/提交推送；本小包交REVIEW，RF065-S3与整体仍NO_GO。

## V组：获授权的MQ6.3.3隔离候选

2026-11-06用户明确允许官方6.3.3候选，沿Java21验证现有客户端、认证、持久消息及Console；不替换原MQ、不挂原卷、不迁移账务。R组下方“待选择”保留为授权前历史，不再阻止本组。输入采用[Apache6.3.3发行页](https://activemq.apache.org/components/classic/download/classic-06-03-03)和[官方SHA512](https://downloads.apache.org/activemq/6.3.3/apache-activemq-6.3.3-bin.tar.gz.sha512)，发行日期按Apache发布页，GitHub标签日期另列不混用。

1. V1 下载唯一Linux发行包并匹配官方SHA512，审启动脚本、公开配置、LICENSE/NOTICE和实际Jar版本；与6.2线比较认证、Jetty12/Servlet/Spring7配置及客户端协议，不执行上游安装脚本或读取原秘密。采用完整上游发行，不独立换Jetty主版本Jar；只有实际仍受影响的依赖才追加最小补丁。
2. V2 在既有准备器/Dockerfile中固定6.3.3来源和实际版本，复用现有21.0.13厂商基座与三包离线补丁，保留可复现请求/文件清单及原6.2候选。新tag/镜像ID绑定新BOM/native/许可原件；不假定旧69项审查或Channel处置可继承。
3. V3 实际新Jar重跑有限quoted-CRLF正反例，验证Console真实启动/认证及现有6.2.10客户端认证、事务、重建持久消息。仅自有内部网络/随机合成凭据/新data，无宿主端口或原卷；实际消费者拒绝旧报告冒用新ID，未审风险仍阻断。定向合同、治理/docs和验收导向复核后只交REVIEW，不直接关闭S3或冻结28项身份。

白名单沿M/J组的既有准备器、Dockerfile、foundation policy、依赖/工件合同与RF065控制文件；当前只新增本组隔离输出`foundation-20261017-01/mq633-supported-20261106-01`（预计小于0.5GiB）。原6.2扫描/上下文保留，不重下已有基础包、不复制整个仓库或安装宿主软件。任何新版本实测差异按实际记录，不将合同成功称为银行LIVE或安全总门通过。

### V组实施与验收导向复核

实际Apache包57,068,769字节，SHA512与官方下载值一致。固定镜像`sha256:51a440b501a1a508bd0131228c953a44fe4701e44fa044f10bffc8dce215c52c`，tag `local/rf065foundation20261106-activemq:6.3.3-java21-01`，断网构建退出0；580个上游文件逐字节保持，54个conf文件及LICENSE/NOTICE保留，后两者另从实际镜像回读摘要匹配。Java仍为已固定Temurin21.0.13+9，11份旧官方包核验、三份仍需补丁的包离线安装，无重下或宿主安装。

实际发行包为Jetty12.1.12、Spring7.0.9、SLF4J2.0.20与Jackson2.22.4；删除准备器已无消费必要的Jackson2.22.1→2.22.3替换函数、命令选项和两条旧补丁测试，改测完整上游发行保留及旧线/改包拒绝，不留双版本兼容。新Jetty配置从conf/jetty.xml改为conf/jetty-spring.xml与conf/jetty/，实际XML的JAAS broker示例仍在注释中；既有入口只注入原已要求的broker认证，不盲目插入第二套插件。保留上游Console的127.0.0.1绑定和JAAS BASIC配置；测试另用随机合成Web凭据。

现有6.2.10客户端对新broker两段真实退出0：错密码拒绝、文本/事件属性、rollback同ID第二次投递、commit移除、重建后持久消息回读/排空均通过。真实Console的无认证401/错密码401/正确凭据200通过。新data与internal网络仅属于本任务，无宿主端口/原卷；关闭后原15容器ID/运行及网络集合保持，未执行银行、模型或数据库操作。此为真实隔离INTEGRATION，不是正式28或原银行已升级。

HTTP反例使用实际镜像的四个Jar并逐一核SHA，候选Java21执行。合法控制完成1次；与R组相同的非法quoted CRLF不完成请求、earlyEOF=1且状态CLOSE，acceptedIllegalQuotedCrlf=false。初轮探针遗漏Jetty12的IO依赖、沿用旧badMessage参数，随后又把拒绝错误预设为400/终态预设为CLOSED；实际API及字节码核对后改为HttpException和真实CLOSE拒绝语义，不改业务代码或绕过请求完成条件。相应工具错误只作为诊断摘要，最终原始compile/runtime日志及JSON为退出0；不将这个有限无网络CONTRACT包装为网络攻击或全面安全证明。

新原生69→62（七项移除、零新增），移除五项Jetty及两项Spring视图相关公告；Shiro RememberMe及61项Ubuntu公告仍未审，原生退出1完整保留。当前政策绑定新ID/报告，实际既有消费者退出5/BLOCKED，拒绝旧6.2镜像BOM冒用新身份；PG共享policy回读仍132原生、14已审/118阻断。69项依赖、25项工件、16项workflow合同通过，未新增豁免。完整镜像分发、其它候选、统一身份/28项及远端CI仍未闭合，V组仅REVIEW。

输出`mq633-supported-20261106-01`包括官方原包/摘要、prepared/manifest、upstream-preservation、built-image、原生/BOM及scan-native-exit、parser-result及实际Jar摘要、attempt-01的Console/JMS/closeout、advisory-delta、当前候选回读与真实退出5。原6.2失败/扫描保留；没有原环境替换、卷/日期变更、冻结、提交或推送。

## R组：当前HTTP与可选安全功能来源核验

当前MQ81f063…17afc2a仍有69未审。先只读核配置与厂商原文：Shiro56130修复要求3.0，不能猜成2.2补丁；它只影响RememberMe。Jetty当前Console为BASIC及HTTP/1.1，Digest与H2/H3缺陷不应相混，但HTTP/1.1块扩展解析问题仍须实证。Spring的条件为SSE view fragments或XsltView，不能沿用Channel“全部RestController”的理由，因为Console确有JSP/MVC。

1. 读取当前实际固定制品的HTTP/启动配置和主路径类字节，核BASIC/HTTP1.1、默认连接工厂及可选认证/视图功能；不读取users/credentials或原运行配置。保留官方公告/公开Maven版本范围，标签和缺省示例不作实际启用证据。
2. 仅从实际固定镜像复制HttpParser所需Jetty公开Jar，用已有Java21编译有限内存的无网络探针；合法块请求作为正例，CRLF落在引号块扩展中的非法请求为反例。记录解析接受/拒绝及工件SHA，不执行公告中的网络PoC、资源耗尽或原银行操作；结果只为CONTRACT，不替代实际Console攻击面或整机安全验收。
3. 对照公开修法明确下一动作；不修改当前风险policy，不升级/下载MQ功能版本。官方当前6.2.x inactive、公开Jetty11仍11.0.26，受维护6.3.3带Jetty12.1.12；6.3.3隔离候选已作为产品版本选择提问，未答前仅保留提案，不操作原MQ/卷/日期。完成来源与边界复核、治理/docs后交REVIEW。

本组产品源码/依赖/配置写入0；白名单仅本包、RF065任务/证据、唯一顺序/backlog，预算5文件/0新增/180行。自有输出mq-java-cpu-20261106-01/http-surface-01，预计不足10MiB，不复制全镜像/项目或安装宿主依赖；原69和所有历史回执保留，不将功能未启用的初步线索提前签为不受影响。

一手来源：[Shiro官方安全报告](https://shiro.apache.org/security-reports.html)、[Jetty块扩展公告](https://github.com/jetty/jetty.project/security/advisories/GHSA-355h-qmc2-wpwf)、[Digest公告](https://github.com/jetty/jetty.project/security/advisories/GHSA-2fvj-hgj9-j2gr)、[H2/H3公告](https://github.com/jetty/jetty.project/security/advisories/GHSA-7p3p-8qv8-m2vh)、[Apache发行维护表](https://activemq.apache.org/components/classic/download/)。官方Maven Central metadata已实读，Jetty11最高11.0.26、MQ6.3.3已公开；不将商业补丁版本号当作可公开取用的Jar。

### R组实际回执与下一动作

当前固定镜像实际复制Jetty HTTP/Util 11.0.26、SLF4J2.0.18及两个公开XML，所有SHA与本片CPU镜像实际文件回执相同；首次误按发行表猜SLF4J2.0.17造成提取失败，纠正为实际2.0.18后通过，失败保留。没有替换产品Jar、改变网络、下载新版本或读取users/credentials。

现有Java21编译退出0，实际候选JRE21.0.13执行探针退出0。RFC7230合法quoted chunk控制completed=1/bad=0；非法引号内CRLF反例同样completed=1/bad=0，`acceptedIllegalQuotedCrlf=true`。这是有限固定输入的无网络LIBRARY_CONTRACT，证明当前实际解析器接受了应拒绝的帧，不是原银行利用、流量压力或完整Console攻击证明。当前声明的HTTP/1.1连接工厂正使用该解析器，因此不能将HTTP/2/3未配置套作此项不适用理由；69项处置不变。

实际XML解析确认BASIC和HttpConnectionFactory；注释未计为启用的配置，未见Digest/H2/H3连接工厂。另13个公开XML与20个Console自有类均逐字节关联同一镜像，没有Shiro/RememberMe/XsltView/SseEmitter/FragmentsRendering类引用；这是STATIC入口证据，只覆盖原始声明配置，不足以单独证明任意挂载、运行属性及传递库调用安全，本轮不把它改成NOT_AFFECTED。

当前MQ6.2.10/Jetty11.0.26存在已复现的解析缺陷，公开同支线Jar没有覆盖全部修补。优先方案是上游受维护MQ6.3.3完整候选（Spring7.0.9/Jetty12.1.12、仍支持Java21），不是仅换一个Jetty12 Jar；后者更换Servlet与Handler API，现有WebAppContext/HandlerCollection配置不能假定兼容。版本方向确认后，须先核Apache来源/摘要/许可与依赖、适配候选配置和认证，再隔离验证旧客户端6.2.10、Console及持久消息，原服务/卷/日期不动；未答前不下载/构建或宣称修复。

输出http-surface-01的parser-result、native-exit、实际Jar/配置摘要、declared-http-facts、optional-feature-references及closeout。网络请求0，原15容器ID/运行保持，唯一自有未启动提取容器已移除；不启动可见窗口，无模型/银行/数据库操作。原生报告/策略不变，S3/整体NO_GO；本组来源核验完成后仅移交REVIEW，依赖修复仍待新版本方向和后续真实验证。

治理1批/27模块、文档787元数据/401链接/6104检查与范围diff空白门通过，验收导向核对后R组REVIEW。输出18文件/975,043字节，无新依赖安装或删除/隔离。唯一下一版本任务在backlog中为PROPOSED，未答复不按预选项自行开始；其它S3未审风险仍按现有授权推进。

## J组：厂商Java21安全CPU闭合（执行前细化）

Channel的C0已核官方Temurin21.0.13+9发行及其JDK/JRE固定身份，当前MQ候选95758a…b9b0a0仍为21.0.12.1。N组只删根和补OS不能替代整个厂商安全CPU；本片只延续Java21同支线，不升级MQ6.2.10、Jetty或Jackson，不改配置、默认认证或入口。

1. J1 复用已核[Channel厂商发行与实际包/根证据](channel-runtime-security-20261106.md)，固定同一21.0.13_9-jre-noble index `0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f`。旧准备器仍核11份官方输入，但运行镜像只复制/断网安装实际缺少的APT两包和PCRE2-8三包，其余八项由已核厂商基座提供；清单分别标明输入与实际安装，不再执行必然失败的重复keytool删根。
2. J2 复用原自有、已审Apache发行与Jackson上下文，仅替换声明配方/清单，使用新tag和自有输出；旧镜像/69原生及失败保持。核整个Apache目录/入口字节相同，Java变化必须来自已固定厂商版本；包/公开信任库差异按实际vendor基座记录，不套用N组“仅九包/只删一证书”的历史约束。全新native/BOM/许可绑定实际ID，不自动复制Channel的63项处置，MQ是不同进程/功能入口。
3. J3 使用最终Channel真实镜像内Jar及6.2.10客户端，沿原实际Compose/YAML解析凭据，在自有MQ/队列/data/内部网络核错密码、文本/属性、rollback/commit及重建持久回读。现有消费者拒绝旧69报告冒用新身份，PG共享policy重新实读；仍未审风险维持BLOCKED/退出5。合同/治理/docs与验收导向复核后交REVIEW，原15容器/网络/四PID不动，不执行银行/模型/正式28。

白名单沿本包M组14文件，不新增产品抽象/接口/迁移；自有输出`foundation-20261017-01/mq-java-cpu-20261106-01`，预计新增不足0.5GiB。11份原包和已有Apache/Jackson上下文复用、不重下、不复制整个项目，不安装宿主依赖。任务状态只见backlog，N/M组记录保留为历史；安全/许可证/统一候选与最终正式门不提前闭合。

### J组实际回执

新候选`sha256:81f063271d47e8cf472d5aa6be95bfae22eb2b24c0f91aa9d73d7037217afc2a`实际断网构建0。准备器实际核11份原官方包，只复制三份仍需安装的包；清单分开记录11份输入和三份运行层包，无重复下载。Apache目录及入口549个实际文件与N组字节相同；新JRE全部112文件与固定21.0.13+9厂商镜像逐字节一致。启动配置不变，镜像环境只有JAVA_VERSION变化；厂商基座另带libaudit-common/libaudit1、libsystemd0/libudev1与tzdata五个包版本变化，完整差异保留，不宣称只换一张根证书。

实际公开信任集合与已核同厂商基线完全相同：JRE118、OS120，两者目标G3均不存在，无本地导入/删除。新Syft/OSV实绑ID/层，原生69→69（移除0/新增0）、退出1；OSV数量不覆盖整个Java安全CPU，不能以数量没变否认或夸大厂商修复，也不能复制Channel的63项豁免。

现有foundation/artifact消费者实际拒绝旧N组69报告绑定新ID；新69项未审继续BLOCKED，实际进程退出5。共享policy下PG再回读仍132/12/120，此为当前政策消费既有报告，不冒充PG新一轮原生扫描。九份已装包版权原件104146字节及五份变化的厂商包版权原件保留，JRE许可随完整厂商文件一致；完整分发义务仍未完成。

当前最终Channel镜像内Jar/客户端6.2.10直接执行两阶段实际JMS及驱动0：错密码拒绝、文本/事件属性、rollback同ID第二投递、commit移除、Broker重建持久回读/排空通过。152份银行源仍与隔离副本一致，凭据由实际Compose/YAML解析；仅自有合成队列/data和内部网络，不挂替代Jar、不连原银行或模型。原15容器名称/ID/运行集合与网络保持，自有协议容器/网络已收拢。

依赖68/工件25/workflow16、站点12/静态build、治理（1批/27模块/LOCAL_EVIDENCE）与文档（787元数据/397链接/6104检查）通过，范围diff空白检查通过，验收导向复核后本片REVIEW。首轮旧证据哈希日志的空行解析失败保留；只修任务helper的空记录分隔，不吞非空坏记录或实际字节漂移，不改产品功能或测试门。输出mq-java-cpu-20261106-01包括prepared-input-comparison、preservation、trust-store-readback、advisory-delta、当前消费者/实际退出5、copyrights及attempt-01/protocol-result与closeout。收口前616文件/107,538,784字节，后续补入五份版权原件；最大33,554,432字节，无删除/隔离或回收。原15容器及四个Agent/站点PID与启动时间保持，未提交/推送/冻结、未执行正式28；S3与整体NO_GO保持。

## N组：最新扫描的同分支集中修补（执行前细化）

前一M组结论与57→95原始报告保持。N组只接续95条中有公开Noble修法的七源包：APT、ca-certificates、curl、Brotli、XZ、PCRE2、zlib；不再逐条创建全量上下文。现有镜像实际安装对应九二进制包，其余同源二进制未安装，不新增它们。

1. N1 核官方security.ubuntu.com包及packages.ubuntu.com大小/SHA256、全部control/维护脚本/依赖与许可。特别区分OS CA包和独立JRE truststore；若JRE仍信任被移除根，记录真实剩余入口，不以包版本抹平差异。
2. N2 仅扩展现有NOBLE_PACKAGES与Dockerfile离线列表，保留原FreeType/libpng两包。新增固定九包，不apt upgrade，不重构业务或添加源/服务；空上下文只复制审核包，非交互配置且无systemd运行。只读实查已确认独立JRE也信任被撤销的emSign ECC G3，因此在同一候选中用keytool只删除该精确公开别名，不导入其它证书、修改原运行JRE或替换Java版本。原构建/扫描证据不覆盖。
3. N3 新tag/固定ID绑定全新BOM/native，核完整包差异只九项；JRE文件只有cacerts例外，其余JRE/Apache/配置/入口及许可字节保持。对新旧公开信任库的DER证书集合做差，JRE只允许移除目标一张、添加0，OS bundle须不含同一SHA256。当前源码Compose/Jar重跑真实JMS认证、事务和持久回读。旧95报告不能冒充新身份，剩余风险继续阻断；合同/治理/docs与验收导向复核后移交REVIEW。

N组白名单沿M组14文件，不另建批次或开放原Compose；预算14文件/0新增/550行，0合同/迁移。输出复用同一foundation目录的新`mq-noble-bulk-20261106-01`，只保留本片上下文/必要原生及失败证据，预计不足0.5GiB，不清理原内容。

| 二进制包 | Noble修复版本 | 官方记录 |
| --- | --- | --- |
| apt、libapt-pkg6.0t64 | 2.8.4ubuntu0.1 | [USN-8996-1](https://ubuntu.com/security/notices/USN-8996-1) |
| ca-certificates | 20260816ubuntu0.24.04.1 | [USN-8944-1](https://ubuntu.com/security/notices/USN-8944-1) |
| curl、libcurl4t64 | 8.5.0-2ubuntu10.16 | [USN-8932-1](https://ubuntu.com/security/notices/USN-8932-1) |
| libbrotli1 | 1.1.0-2ubuntu0.1 | [USN-8956-1](https://ubuntu.com/security/notices/USN-8956-1) |
| liblzma5 | 5.6.1+really5.4.5-1ubuntu0.4 | [USN-8945-1](https://ubuntu.com/security/notices/USN-8945-1) |
| libpcre2-8-0 | 10.42-4ubuntu2.2 | [USN-8974-1](https://ubuntu.com/security/notices/USN-8974-1) |
| zlib1g | 1:1.3.dfsg-3.1ubuntu2.3 | [USN-8954-1](https://ubuntu.com/security/notices/USN-8954-1) |

### N组实际回执与复审

官方九包共3841868字节，HTTPS发布大小/SHA256实际匹配；`official-inputs.json`和准备器固定同一输入。完整control/维护脚本已留存并检查：APT的timer调用只在运行systemd时启用，本片构建先要求该目录不存在；CA包非交互更新公开Mozilla根及符号链接，其余包仅ldconfig触发器或无维护脚本。没有新增源、依赖包、联网APT下载、宿主安装或服务启动。

现有合同先发现缺九个输入，实现后又暴露旧`assertNotIn('curl', Dockerfile)`把离线包名误当联网命令；保留两份原失败，只将后者缩至实际RUN/链式curl命令，真实构建仍`--network=none`。66项依赖、25项工件、16项workflow合同均通过；未增加测试排除或减弱原网络边界。

新固定镜像为`sha256:95758ad5f81e8e61ab8f9d45a02d28d456e809bb970348f5ff50c726c1b9b0a0`，tag `local/rf065foundation20261106-activemq:6.2.10-noble-security-02`；实际离线构建退出0，dpkg audit为空。相对前片c180…候选，完整包名集合不变、只有上述九个版本改变，原FreeType/libpng修补保留；五个基础层及660个JRE/Apache/配置/入口文件字节相同。JRE唯一例外为公开cacerts，不更换Java/MQ/Jetty版本。

只读实查旧OS和JRE均信任被撤销的G3，目标证书SHA256为`86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b`。当前实际DER集合证明JRE118→117，只删除该一张、添加0；OS121→120按官方Mozilla包删除5/增加4，目标根在两新库均不存在。没有读取个人证书、原信任配置或将所有OS新根导入JRE；这项真实漏点不能由原生CA包计数代替。

新Syft/OSV均绑定实际镜像。OSV联网实际退出1，95→69，七源包全部26条目标记录消失、新增0，其余69仍未审并阻断；没有按可利用漏洞数解释公告数。现有foundation/artifact消费者重新消费当前MQ/PG/webapp，旧95 BOM绑定新ID被拒绝；共享policy下PG重新实探/回读仍132/12/120，消费者真实进程退出5、整体NO_GO。其它镜像缺项、安全/许可证、统一候选/身份与28项/远端CI仍未闭合。

当前Java的152个输入与既有隔离副本仍相等；复用J7保存的当前Jar与实际Compose/YAML配置，在新候选上两阶段及驱动均退出0：错密码拒绝、文本/事件属性、rollback同ID第二次投递、commit移除、重建后持久事件回读/排空通过。只用本片私有合成队列/凭据/data与内部网络，不连原MQ/银行或模型，不声称优雅关闭、指定断电模式、TLS全链或正式28项。

九个已装包的版权原件实际回读共104146字节，保留完整Files/License/例外声明和镜像路径/摘要；没有把包含构建工具/文档等多种声明的包简化成一个许可证标签，也没有改变根MPL-2.0。原件保全不等于镜像分发义务或全产品许可证门通过。

输出在同一foundation目录的`mq-noble-bulk-20261106-01`：官方输入、`image-build.log`、`built-image.json`、`preservation.json`、`trust-store-comparison.json`、原生/BOM、`advisory-delta.json`、当前三候选回读及实际退出5、版权原件/声明、`attempt-01/protocol-result.json`。原M组数据与失败不改写，本片只交REVIEW；没有冻结、LIVE、提交或推送。

收口治理通过（1批/27模块/LOCAL_EVIDENCE）、文档通过（786元数据/390链接/6097检查），范围diff空白检查通过；外部站点12项与静态build通过，仅文本事实更新，不新增浏览器验收。原15容器名称/ID/运行集合、网络及四个Agent/站点PID/启动时间保持，0 unhealthy，只收拢本片容器/内部网络。写收口回执前648文件/113931597字节，保留当前上下文/原生/本片KahaDB与原件，无文件删除/隔离、回收0。

下一相关入口有实际源码依据：当前Bank Channel/Test Support运行层Dockerfile同样使用固定Temurin Noble基础000fd…f9408c，且旧Channel镜像不是J7最终配置的当前构建。不能把本片MQ补丁或旧52项审查自动套给它；后续沿S3白名单细化当前Channel源码/同基础补丁和候选构建，再重新核原生及应用证据。此处只是发现/入口，不声明该消费者已经修补或验收，也不代答待选功能版本。

## 根因与范围

已批准MQ6.2.10候选1b06f7…ce12f的原生57条中，FreeType95512与libpng46675各有CVE和USN两个记录。Ubuntu确认当前Noble同分支包已有修复；不以“Java通常不用图片”为由豁免。其余Jetty、Spring和OS记录保持独立未审，不将商业支持的Jetty11补丁当作可公开下载制品，也不跨功能版本。

## 小任务与白名单

1. M1 核两份security.ubuntu.com官方amd64包的发布大小/SHA256、control、维护脚本及许可；只存本批自有输出，不安装宿主依赖。
2. M2 沿现有prepare-ci-foundation-patches.py增加必填noble-downloads及精确输入核验，activemq-foundation.Dockerfile只离线安装两包，不apt upgrade、不引入其它包。保留原Apache发行物/Jackson补丁和固定JRE基础，生成新上下文/tag，不覆盖旧回执。
3. M3 全新Syft/OSV绑定新镜像，比较旧57和新风险、包版本、Java/全部broker配置/入口/许可字节；当前源码Compose与Jar重新执行真实认证、rollback/commit及自有持久队列重建回读。精确消费者、合同、治理/docs通过后才交REVIEW。

白名单：scripts/deploy/{prepare-ci-foundation-patches.py,activemq-foundation.Dockerfile}、scripts/test/{ci-foundation-policy.json,test_ci_dependency_scan.py}、本任务包、既有S3/证据索引/唯一顺序/backlog与根README、CHANGELOG；外部站点仅同步既有data.js/test.mjs/README.md事实。不变更公开API/迁移/业务代码，预算14文件/1新增/450行；自有探针/安装包/上下文和扫描输出预计不足0.5GiB。保留脏树，不提交/推送，不替换原服务或挂原卷。

## 官方输入

- [FreeType公告](https://lists.ubuntu.com/archives/ubuntu-security-announce/2026-October/011349.html)、[精确包](https://packages.ubuntu.com/noble/amd64/libfreetype6/download)：2.13.2+dfsg-1ubuntu0.2，402610字节，SHA256 `8c6d3bac5a6197fa2f48b2d56f04f3ffecaa7082eeab91b0939f97a40adc88a6`。
- [libpng精确CVE](https://ubuntu.com/security/CVE-2026-46675)、[精确包](https://packages.ubuntu.com/noble/amd64/libpng16-16t64/download)：1.6.43-5ubuntu0.7，188998字节，SHA256 `863d6abb089b2820ceba98e6b18f06eaacc55f9b05827001e7b4021a9a7b246c`。
- [Jetty支持/下载](https://jetty.org/download.html)与[安全清单](https://jetty.org/security.html)：11.0.26为公开EOL版本，后续11修复有专门可用性限制。本片不下载付费制品、改成Jetty12或声称Jetty风险已清。

## 验证与完成门

CONTRACT：既有test_ci_dependency_scan.py精确两包成功/错字节/缺包/失败前不建输出，现有工件与workflow合同。

INTEGRATION：真实离线构建及dpkg audit、新BOM/原生层/实际镜像绑定；只允许两包差异，两个CVE及其USN不再报告，新增或未审项仍阻断。真实JMS使用新镜像和J7保存的当前Jar，不手工伪造产品配置；自有端口不对宿主发布、网络CIDR先核，合成队列/data不触及原MQ。

控制校验：`python scripts/architecture/validate_refactoring.py --batch RF-065`、`python scripts/docs/validate_docs.py`。任务状态只在backlog维护。该集成不等于正式银行黄金链、Agent LIVE或28项；最终身份仍未冻结，整体NO_GO。

## 实施与验收导向复审

两份官方包实际大小/SHA256均与上述发布页相符，control归档没有preinst/postinst/prerm/postrm，仅ldconfig触发器；依赖由原基础满足。准备器新增必填`--noble-downloads`，在创建输出前核两包；既有归档/Jackson核验保留。三个新增合同先因缺生产行为失败，实现后当前依赖66、工件25、workflow16均通过。测试中的合成包只用于Python测试进程，不进入镜像。

实际命令：原准备入口的`--activemq-archive`、`--activemq-entrypoint`、`--jackson-downloads`沿既有固定输入，新增`--noble-downloads <本片downloads>`、`--output <本片prepared>`；随后`docker build --network=none -t local/rf065foundation20261106-activemq:6.2.10-noble-libraries-01 <本片prepared/activemq>`。离线构建成功，dpkg audit为空；未apt upgrade、未联网安装或改宿主依赖。

Docker实查新ID为`sha256:c1808cc28c8493ab591771fb79ae8eba2276119eb2c6cedc425251140f35721c`。新旧共享五个JRE基础层，完整包名集合不变，仅FreeType与libpng两个版本变化；661个JRE/Apache发行物/配置/入口文件SHA256完全相等，原LICENSE/NOTICE仍在。新上下文只有Dockerfile改变、增加两份包，没有改Java/Broker或旧回执。

验证探针曾误把build的config digest当Docker image ID、把Channel审查的六层套用到MQ；实际inspect指出MQ是五个共享基础层，原失败和探针前像均保留，只修本片工具。OSV以裸image ID为名称时误判本地不存在并尝试拉取，失败日志保留；改用刚核对ID的本地固定tag成功扫描，未切换工具、镜像或数据源。Syft仍使用`docker:<实际ID>`，BOM/原生层/实际镜像三者匹配。

联网OSV2.6.0实际退出1：旧57→当前95，目标四记录全部消失，新增42个公告ID；新增记录的包/版本均在旧原生全包清单中，且完整包差异仅上述两项、应用字节未变。因此这是新公告覆盖暴露的既有组件风险，不能把57沿用为当前风险数，也不称95项等于95个可利用缺陷。所有95仍未处置，不增豁免。

现有foundation与artifact消费者实际回读新MQ及现有PG/webapp，原MQ BOM绑定新ID被`FOUNDATION_BOM_IMAGE_MISMATCH:activemq`拒绝。共享policy变更后PG也重新采集固定特征并回读，仍132项中12精确核验/120阻断；MQ为95阻断，原生管理页该范围0且仍为可选。真实消费者进程退出5、NO_GO，未产出完整候选；不是仅手填一个失败计数。Keycloak/观测组等缺项继续列出。

新MQ使用J7冻结保存的当前Jar及同一已编译探针，152个Java输入仍与现有隔离源码逐字节相等，实际Compose提供broker认证环境、Jar YAML解析客户端配置。两阶段与驱动实际退出0：错密码拒绝、TEXT及三个事件属性、rollback同JMSID第二次投递、commit后不重读和重建后持久事件回读/排空均通过。只使用本片合成私有队列/凭据与新KahaDB，未访问银行或模型；不宣称优雅停机、指定断电模式或完整业务回归。

输出复用`D:/Agent/.codex-temp/banksystem-rf065/foundation-20261017-01/mq-library-patch-20261106-01`：`preservation.json`、`advisory-delta.json`、新BOM/native、`foundation-inventory-current.json`、`candidate-readback.json`、`readback-native-exit.json`及`attempt-01/protocol-result.json`。新候选在policy登记，旧制品与57条报告不改写；本片REVIEW后继续其余实际风险，不关闭S3或发布门。

收口治理通过（1批/27模块/LOCAL_EVIDENCE）、文档通过（786元数据/387链接/6097检查），范围diff空白检查通过；外部站点12项及静态build通过，本次未新增浏览器验收。实际原15个容器名称/ID/运行集合、网络及四个Agent/站点原PID/启动时间保持，0 unhealthy；只收拢本片容器/内部网络。写收口回执前新增610文件/106914654字节（含必要上下文、原生报告和本片KahaDB），无文件删除/隔离、回收0。验收导向复审核对两包固定输入、失败拒绝、真实客户端和原环境保持；当前95风险及功能版本选择/许可证/统一身份/正式28/远端CI仍待，整体NO_GO。
