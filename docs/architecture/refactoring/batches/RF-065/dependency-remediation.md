---
id: RF065-DEPENDENCY-REMEDIATION
title: 实际依赖扫描发现与局部修复参数
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-12
owner: Codex
---

# 实际依赖扫描发现与局部修复参数

本文件补充RF065-S3的发现、归属和修复参数，不是第二份实施顺序或任务状态源。

### 2026-10-17 用户确认的管理页边界

Mifos原生管理页改为admin-tools可选管理员工具，正式默认拓扑14服务/12镜像，银行smoke仍10项。只修改web-app profile和默认就绪/受控重启集合；保留镜像引用、既有实例与扫描材料。可选盘点明确列出管理页与Mock Clearing，不把它们偷偷删出所有证据。91合同与真实Compose config默认3/显式4通过；最新受控源码/默认候选、运行保留回执见同批evidence-index的admin-profile-01。此定位不解除未处置风险、许可、Keycloak功能版本或正式28项门；原运行15服务不因源码改动停止。下述15/13及“管理页定位待答”为当时记录，当前选择已确认。

## 2026-10-17 基础服务根因与修法进度

源码与构建启动器许可材料已实际核验：新根第三方说明保留MPL/BSD/Apache差异，唯一Wrapper3.3.2 JAR与同版官方发行物字节一致，嵌入及外置LICENSE/NOTICE一致，旧I10库存明确历史而不重写列表。*.env漏入候选的问题按文件名在两个复制入口修复，原env/索引不读不改；实际源扫描2455/0、九锁仍两条已批ZIP告警及4项回归通过。89合同与新候选source-license-review证明仅源码/启动器材料，不证明完整分发通过；非GitHub运行报告数据及实际二进制分发材料仍待。完整15/13、45工件候选仍BLOCKED/5/NO_GO，未因此豁免7类风险或进入正式门。

全默认镜像汇总现已有真实生产/回读证据：15服务/13镜像覆盖完整，但工程门正确BLOCKED/退出5。MQ57、PG116、Keycloak136和四观测151/355/144/217仍为未处置风险；未修基线纳入不等于新候选已修复。Channel、三默认NGINX、Fineract及管理页仅在各自已审范围通过，13镜像二进制分发许可均未认证，当前源码/证据包不分发镜像二进制。完整范围CI、剩余风险、许可交付/正式28/远端CI继续待办，不关闭S3。

最终复审补齐镜像角色约束：NGINX改精确角色映射，所有13角色只接受当前注册ID；客户/运营互换、干净管理页替代观测镜像均拒绝，不因ID已审或原生0接受串位。当前最终合同86/86，四个role-review与candidate-final-02保留修后证据；原84项记录仅是前一轮结果。

同时修复实际构建输入漏绑：原NGINX摘要未覆盖index.html、构建配置、公用领域类型/quality合同等。改为完整实际COPY输入与干净受控快照；122输入与旧真实构建快照一致后才恢复固定镜像绑定，新四review均1已审/0阻断，保留原生1。错误拿原工作区生成缓存作比较的首次失败保留，不删除缓存或放宽规则。Fineract同一8debc42e…候选重新在线扫描仍3条，新review实际通过；不称旧报告为当前扫描。84源码合同及治理/docs通过，最新路径/边界见证据索引，整体NO_GO。

源码材料生产者现已落地且真实回读通过，仍不关闭完整S3-3：受控源码2453文件实际秘密扫描0发现，九锁真实OSV保留FAILED/1和两条已批准ZIP公告，4项补丁回归及925组件许可元数据补录通过。生产者重算报告并绑定源码/回归字节，CI明确source-only生产/回读/白名单上传；78项源码合同通过，不生成ReleaseIdentity或GO。首包回读发现历史HiAgent外部手册被归档，已仅从交付ZIP排除精确89份资料，保留完整扫描及原文件；新2364文件包约33MB，明列archiveExclusions，旧包禁止上传。全镜像汇总、二进制分发许可与正式28/远端CI仍待；最新回执在证据索引，不以源码材料通过代替这些门。

Channel当前复扫已闭合该范围：同一074146…镜像原生48→52，新增gnutls28五个证书项、89162不再报告，不称数据库变化为代码修复。111源输入审计只见Gateway镜像引用变化，其余代码/config语义不变才恢复1d68147a…5b065源绑定；共同107条原生记录内容/严重性均未改变。五新项先实际阻断，再按JRE无GnuTLS依赖、Java HTTP无JNI/进程桥、curl只固定本机明文健康检查的真实条件处置；curl间接GnuTLS依赖存在，未写成库缺失。[Ubuntu88647页面](https://ubuntu.com/security/CVE-2026-88647)仍为vulnerable/deferred并注上游争议，不视为已修。新review-current-02为52已审/0范围阻断、原生1和严重性保留，许可材料关联0未解决仍不等于完整分发许可通过。

这次源码复审补了两个验证器缺陷：实际ID未与已审ID比较，现固定身份漂移必拒绝（真实同RootFS但新增ENV反例已失败）；47项不完整报告也能REVIEWED，现必须覆盖当前policy的全部(name,version,ecosystem,id)，缺项单列并阻断。47项裁剪测试报告现因缺五项退出1，真实52及四NGINX镜像仍通过各自范围。不是新增备用判定器或依赖数量字段；46镜像合同/四组69本地合同通过，原服务/账务/模型及正式身份不变。最新回执见证据索引，整体仍NO_GO。

NGINX专项现已继续落地：[官方1.30.6说明](https://nginx.org/en/CHANGES-1.30)所列五个补丁已由固定1.30.6-alpine实际镜像取得，三个门户和Gateway源码只换同稳定分支基础引用；新三构建各原生5→1，唯一zlib1.3.2-r0/CVE-2026-85091保留原生失败。新NGINX实际链接/导入名及官方gzip模块源码核对后，仅按同生态/版本/固定配置保留该一项NOT_AFFECTED；不是删严重性或全局忽略。三门户与Gateway实际新层/BOM/源锥的当前review均1已审/0范围阻断，旧1.30.5真实ID仍拒绝。此前五项厂商BLOCKED记录是修补前状态，不再作为当前1.30.6结论；许可/分发仍未完成。

管理页使用[官方NGINX包源](https://nginx.org/packages/mainline/alpine/v3.23/main/x86_64/)的1.31.7-r1，未更换Alpine3.23。首次02镜像因APK覆盖业务index.html而明确停止；03安装后从原固定镜像恢复静态文件，427条目/入口/配置保持，仅NGINX版本元数据同步。21个包中只先前四库及NGINX变化；原生0、1.31.7厂商门通过。断网只读组件config/静态页回读通过，不是浏览器/登录/银行验收。44镜像合同、四组67本地合同通过；原服务及账务不替换，Gateway源引用变化导致旧Channel源绑定过期，不更新旧摘要绕过校验。详细ID/回执见最新证据索引。

先前四库阶段（历史）：原生管理页的34个已报公告均来自三库，依官方[libssl3](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/libssl3)、[PCRE2](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/pcre2)、[zlib](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/zlib)同发行分支，仅更新四二进制包，派生webapp镜像65678c37…f2b75原生34→0。21个APK包集中只四版本变化，427个公开文件/链接条目、NGINX主程序、配置和启动行为字节保持；离线NGINX配置/HTTP静态页复验通过，不替换原实例、不算银行/登录通过。

厂商核对发现新的实际覆盖缺口：[NGINX上游安全表](https://nginx.org/en/security_advisories.html)对webapp实际1.31.1还有11个版本适用公告，native未映射这些条目，新增同1.31分支最低1.31.7厂商门明确BLOCKED。三个自有门户的1.30.5旧厂商说明停在10月13日，现有五项新的版本适用公告尚未做功能条件处置，policy和真实reviewer已变为BLOCKED（旧native五项仍已审，不改历史）。不能把库漏洞消除/原生0当成NGINX镜像安全通过；后续仅在现有S3细化同支NGINX补丁或逐项配置证据，不因这次库补丁偷偷换NGINX。43镜像合同、四组66本地合同通过；候选清单现含MQ57/PG116/web0+vendor BLOCKED，仍整体NO_GO。

Jetty根因不再仅是某个URL 404：[官方公开下载](https://jetty.org/download.html)列11.0.26为EOL，[扩展支持说明](https://webtide.com/end-of-life/)解释后续版本可用性，Maven Central jetty-http metadata现场最后11版为11.0.26。安全表列出的11.0.29/31等不能当作已取得的社区制品。不引入未审第三方fork或付费许可、不为告警归零强换Jetty12；当前候选的HTTP解析相关风险及MQ分支支持问题仍阻断。

新PG的gosu余项已形成精确平台处置，而不是“0finding所以安全”：实际新二进制SHA351e2d1c…564e2c在extract中缺pkgSymbols，首次review KeyError停止。原因是构建使用-s -w；已核govulncheck1.9.0源码[剥离符号处理](https://github.com/golang/vuln/blob/v1.9.0/internal/buildinfo/additions_scan.go)与[二进制分析](https://github.com/golang/vuln/blob/v1.9.0/internal/vulncheck/binary.go)，工具会返回模块/平台而无符号。审查器固定旧/新两个实际SHA及模块组合，适用平台且无符号的条目必须继续UNDER_INVESTIGATION；唯一GO-2026-5024的完整imports仅Windows，实际目标linux/amd64，因此新报告只将这1项按平台NOT_AFFECTED。原生116及115个OS未审项不变，不是整镜像门通过。旧目标复验仍59已审/1阻断。38项镜像合同/四组61本地合同通过，没有为这一项重新构建或扩大依赖升级。

本轮最新发现是默认镜像范围缺口：源码默认15服务/13镜像，银行smoke的10项没有涵盖web-app与四个观测服务。五个漏项已补native/BOM：34/151/355/144/217条不同公告，均未审、原生1保留；不能因smoke不启动就豁免它们。四个观测标签只补现场同字节digest，未换版本/停止服务。范围投影与Debian details保留的36项合同通过，旧Channel/三门户报告经四image字段语义等同比对重新绑定源锥；这不是新公告补扫或整体安全PASS。

同轮源码复审修正新增PyYAML导入的CI依赖漏声明：source-engineering在合同导入前安装已有固定6.0.3，错误安装立即退出；新workflow顺序合同已覆盖。全新自有venv只装该wheel后四组本地合同59/59通过（Python3.14.7，含镜像36与workflow13）；远端使用3.12尚未执行，不混为CI已通过。

| 厂商/现场事实 | 对修法的实际影响 |
|---|---|
| [Debian glibc当前表](https://security-tracker.debian.org/tracker/source-package/glibc)仍为trixie2.41-12+deb13u4，多项标no-dsa但vulnerable | 不把no-dsa当已修，不为归零混装sid2.43；逐项证明配置/功能触发条件 |
| [CVE-2026-97399](https://security-tracker.debian.org/tracker/CVE-2026-97399)限定Power8优化；PG候选实际amd64 | 可形成精确平台处置，不推导整个glibc无风险 |
| [CVE-2026-95818](https://security-tracker.debian.org/tracker/CVE-2026-95818)及[86805](https://security-tracker.debian.org/tracker/CVE-2026-86805)要求AT_SECURE、特定$ORIGIN路径及本地条件 | 必须核对实际执行链，不用“容器里”一语排除 |
| [CVE-2026-8674](https://security-tracker.debian.org/tracker/CVE-2026-8674)由长DNS search/LOCALDOMAIN触发，可能来自VPN/DHCP | Channel既有dns_search不能替其他服务背书；新候选配置仍需单独验证 |
| 固定PG镜像静态探针缺journald/oomd/homed/nscd/xmlcatalog和Python解释器 | 与BOM/具体公告关联后才可处置；当前只是证据候选，不改原生116 |

另有产品边界冲突：demo默认还启动Mifos原生管理页，源码配置直接访问Fineract13000；正式浏览器业务链要求Gateway→Bank Channel。已向你询问该页应为可选管理员工具还是继续默认交付；未替你改变默认范围或假设它可从验收中删除。Keycloak26.8.1功能候选仍待原授权询问答复。

Moby修补阶段：Moby解析补丁已落地，不再以该条作为当前阻断。固定gosu1.19公开源码提交6456aaa…/归档SHA256 33d7537d…89c3b，Go SumDB核验只将Moby0.1.0→0.4.1、x/sys0.1.0不变；version.go标明1.19-rf065-moby041，main.go与setup-user.go字节保留。0.4.1实际ParsePasswdFilter/ParseGroupFilter改用有界Scanner（默认64KiB、组行1MiB）并返回扫描错误。用已核Go1.26.9交叉编译linux/amd64/CGO0，未执行上游构建/排除脚本或读取账户文件。四份实际许可与修改后源码/补丁清单随派生镜像保留；这不是整产品分发许可门完成。

新PG-gosu-02镜像`d0378858…db441`基础层前缀、启动命令保持；公开回读仍PG18.6，实际导出PG主程序/entrypoint的SHA与18.6补丁前一致，gosu实际SHA351e2d1c…564e2c与构建匹配，本地补丁版本明确。原生重扫175→116不同公告，Moby公告消除，原生仍退出1；新Go符号报告0 finding不能替代剩余115个OS公告及1个Windows限定Go公告的逐项门。candidate-inventory-03已绑定新层/BOM，PG厂商最低补丁通过、整体NO_GO；34/34合同通过，尚无PG协议/银行黄金链验收。

原生扫描两个直接引用入口退出127并保留；Docker inspect虽成功，OSV不能定位本地digest的内部原因尚未源码级确认。按官方文档导出候选归档后扫描成功产出原生失败报告，没有修改认证或扫描规则。旧175报告、59条旧Go精确处置及所有失败回执均保留，不覆盖或拼接旧身份。

此前MQ增量：候选02只把Jackson core/databind从2.22.1替换为官方2.22.3，逐JAR核SHA512和内部坐标，annotations2.22及其余发行物不变；新镜像`1b06f7c7…ce12f`原生64→57个不同公告，七条Jackson公告不再命中。两份原生失败与BOM各自保留，`candidate-inventory-02`绑定该MQ及补丁前PG候选，仍NO_GO。该阶段准备器与gosu分析合同31/31，不代表MQ协议或银行验收。

Jetty的条件不能借用Channel结论：6.2.10实际附Jetty11.0.26、Spring MVC/JSP控制台；默认`jetty.xml`绑定127.0.0.1、Basic认证及InetAccessHandler，声明拓扑未发布MQ宿主端口。实际检查20个ActiveMQ JAR的10102类条目，未引用SseEmitter、FragmentsRendering、XsltView、HttpURI或Digest认证类；公开XML/JSP配置也无这些直接引用，但另有20个展开类，尚未完成全量动态配置/调用核对，不据此签NOT_AFFECTED。尤其入口访问过滤位于HTTP解析之后，不足以一并排除解析器漏洞。

[Jetty分块解析公告](https://github.com/jetty/jetty.project/security/advisories/GHSA-355h-qmc2-wpwf)列11.0.29修复；[Digest公告](https://github.com/jetty/jetty.project/security/advisories/GHSA-2fvj-hgj9-j2gr)列11.0.31。当前对Maven Central精确`jetty-http/11.0.31/jetty-http-11.0.31.jar`的HEAD实际404，不能把公告中的修复版本当成已取得的公开制品，也不推断所有11.x制品均不可取得。[HttpURI公告](https://github.com/jetty/jetty.project/security/advisories/GHSA-qh8g-58pp-2wxh)则明确区分应用工具类用法与Jetty内部用法；保留逐项核对，不跨Jetty12强换JAR、不自动升级MQ功能分支。

PG gosu公开二进制摘要与上游1.19一致。[Moby解析公告](https://github.com/moby/sys/security/advisories/GHSA-mjcv-p78q-w5fw)要求攻击者能控制被解析的账户/组文件；当前未读取或验证原系统账户文件，不宣称已排除此条件。Docker分析工具下载层停滞，核对本轮唯一构建客户端及其buildx子进程后取消，原日志退出-1保留，未重启构建、daemon或服务。Windows OSV插件先缺提取器退出127，补要求提取器及递归开关后的两次仍提取0/退出128，不能用空结果通过。

补丁前符号定位：取得官方SHA256核验的便携Go1.26.9（临时目录，无全局配置变化），Go SumDB开启安装govulncheck1.9.0并真实完成binary/symbol分析。目标为原Go1.24.6/linux/amd64/CGO0，提取2962符号；188条OSV消息中有七组逐字相同重复，完整原流保留。`inspect-gosu-symbols.py`绑定该二进制摘要、实际模块、模式、非空符号及native别名；只合并相同重复，不合并内容冲突。首份54已审/6阻断的保守回执保留；修正重复识别后`gosu-review-02`为当时60个Go公告中59已审/1阻断：57条易受攻击符号不在目标中，两条仅Windows不适用Linux。Moby公告缺Go数据库覆盖，且提取到GetExecUserPath/ParseGroupFilter/ParsePasswdFilter等实际函数，构成本次实际修补目标。原175报告及严重性不改，其余OS公告未获此豁免。JSON模式退出0只代表分析完成，不是镜像安全通过；未执行上游排除脚本，分析工具不进入产品镜像。

自有未启动只读/断网元数据容器导出PG候选公开entrypoint后已移除，未挂原卷；其gosu固定切换postgres用户，声明拓扑仅PG数据卷/只读初始化脚本，无账户文件挂载。以上不足以宣称所有账户输入威胁已排除，不替代Moby补丁或其协议复验。上游gosu1.19源码提交已核为`6456aaa0f3c854d199d0f037f068eb97515b7513`；Moby0.4.1模块仍要求x/sys0.1.0，无需为该修复连升其他模块。

| 已确认来源 | 当前判断与最小修法 | 当前结果 |
|---|---|---|
| MQ固定标签与发行内容不一致 | 镜像内6.2.0，不用6.1.2标签选补丁；核[Apache6.2发行](https://activemq.apache.org/components/classic/download/classic-06-02-00)及当前同分支6.2.10原版/SHA512 | 新Noble/Java21候选02补Jackson后391→64→57公告；剩余未审，不通过 |
| 上游补丁分支已经inactive | [官方分支表](https://activemq.apache.org/components/classic/download/)显示6.2.10为最终inactive分支，不伪装持续维护；不为数字归零擅跳6.3 | 作为受限候选继续核验，支持策略未闭合 |
| 补丁发行默认配置确有差异 | 6.2.10 Jetty新增InetAccessHandler/启动依赖，不能把新源码覆盖当“配置字节不变” | 两XML差异留存；需要协议/管理面可达性复验，未记业务通过 |
| PGDG发行未映射到原生OSV内核条目 | 官方[18.6说明](https://www.postgresql.org/docs/release/18.6/)与[安全表](https://www.postgresql.org/support/security/)列有旧内核安全修复，native空项不是安全 | 加独立最低补丁门，18.3阻断，18.6接受；真实两BOM验证与反例通过 |
| PostgreSQL18.3确实不是已修内核 | 选择同主版本18.6/Debian13，不换OS或大版本。厂商说明18.X无需dump/restore；不挂旧卷或作旧配置/数据清理 | 新18.6内核/entrypoint字节保留；原生280→175→116，未作数据库协议验收 |
| gosu的Moby账户解析函数真实存在 | 本地重建gosu1.19，只补Moby0.4.1、保留x/sys0.1.0和两主程序源文件；显式补丁版本/实际许可 | Moby公告消除，Go1.26.9；剩余OS及Windows限定Go公告未完成整镜像门 |
| Keycloak平台自身而非仅依赖存在公告 | 实际26.3.3；本项目用OIDC/通配回调，不能将LDAP/SAML未配套用全部136条。官方[26.8.1](https://www.keycloak.org/2026/10/keycloak-2681-released)与[升级合同](https://www.keycloak.org/docs/latest/upgrading/index.html)需要功能版本决策，不能只替JAR并忽略Quarkus增广制品 | 已另问新候选26.8.1授权；未构建/迁移旧认证 |

所有数字为不同公告ID，不是独立可利用缺陷数量。新scan/BOM/metadata/源归档及候选清单均在foundation-20261017-01；原生退出1完整保留。报告生成退出0仅证明产物可读取/绑定，不能解锁候选发布。34个本地合同/回归证明本次最小门逻辑，未替代真实基础服务与黄金链验收；正式28、身份冻结、许可证/分发和远端CI仍未完成。

## 2026-10-13 Fineract专项实际修补与新阻断

镜像资源的声明提交已核到[Apache be6c4ac](https://github.com/apache/fineract/commit/be6c4acd229a3bab42593b801e1901e31a4718cc)，不是今日develop；无上游签名/完整可复现构建声明。选择固定镜像依赖派生，不重编银行模块或迁移，不冒充正式发行。局部准备/审查命令见S3-7；新镜像已实际构建、4558原应用文件字节保留、19合同与隔离8服务启动通过，黄金链未执行。

| 精确原消费者 | 派生目标 | 核验 |
|---|---|---|
| HTTPClient5.5.2/Core5.4三JAR | 5.6.3/5.4.3 | Maven字节与Apache原版分发包SHA512链等同 |
| Jackson2.21.4九JAR | 2.21.7 | Maven单JAR SHA512、内部坐标 |
| Jsoup1.22.1、Log4jAPI2.24.3、Logback1.5.32两JAR | 1.23.2、2.25.5、1.5.34 | Log4j分发包链，其余Maven SHA512 |
| LZ41.11.0、Netty4.1.135十JAR | 1.11.4、4.1.137.Final | Maven SHA512，全部族内同步 |
| Tomcat10.1.55三JAR | 10.1.61 | SHA512、实际OSGi Bundle元数据；保持10.1分支 |
| Zulu21.0.11、OpenSSL3.5.7、zlib1.3.2-r0 | 21.0.12.1、3.5.9-r0、1.3.2-r1 | 官方签名APK索引精确包版本，非全面upgrade |

原生52→3，不把raw exit1改绿。Commons Configuration1.10的[GHSA-pvp8](https://github.com/advisories/GHSA-pvp8-3xj6-8c6x)无1.x修复；实际仅ESAPI2.7四个policyloader引用，固定资源选择DefaultAccessController、未启用实验策略/不信任配置输入，逐项登记条件缺失并绑定镜像。Spring6.2.19两公告分别要求[SSE片段](https://spring.io/security/cve-2026-47890/)或[XSLT视图](https://spring.io/security/cve-2026-47884/)；全部实际非框架JAR/应用类无消费者，固定资源不启用，未升Spring7/Boot4。新的插件、配置或功能将使处置失效；验证器未知公告仍阻断。

真实发行来源差异：四个Maven制品未发布单JAR SHA512，首次准备明确失败并保留；[Apache校验说明](https://hc.apache.org/downloads.cgi)与[Log4j原版分发说明](https://logging.apache.org/log4j/2.x/download.html)支持核验原版档案。新清单标PUBLISHER_ARCHIVE，不生成假冒上游摘要，不降为SHA1。

基础层全产品覆盖补扫暴露新停止点：Keycloak136、ActiveMQ387、PostgreSQL基础层280不同公告均原生exit1/未审。这不是同等数量的可利用漏洞；Postgres内核包本次无发现，ActiveMQ标签6.1.2与实际扫描6.2.0需要来源调查。Keycloak发现同时含默认HTTP栈和多种可选认证功能，不能套用“不用LDAP/SAML”豁免所有条目。先请求补入S3-8来源/条件专项，不盲升整个认证/数据库版本、不修改原部署或卷，黄金链及候选等后续验收停止。

## 2026-10-13 实际镜像处置与发行来源修复

最新阻断来自第三方账务核心，不把自有镜像通过扩大到它：S2实际使用openmf/fineract:develop@sha256:666c666900eb62fc1f6c5faa971e19c34ef6ec5d7cb8224276a49e2ddba262e1，实际模块版本1.15.0-SNAPSHOT。原生扫描496包、18受影响安装记录、52不同公告/退出1；Maven包含Jackson2.21.4、Netty4.1.135、HttpComponents、日志/LZ4等。未证实全部可利用，也没有证据全部不受影响；没有借用Channel源码做豁免。镜像OCI revision/version/source标签均未提供值，已查fineract-core模块没有git/build-info属性；精确来源绑定不足，仍须查其他发行元数据和上游构建记录。

定义位于postgresql/docker-compose.isolated.yml，postgresql是当前S3明确禁止修改范围。升级/重新编译账务核心可能涉及接口、数据库迁移及账务语义，不能在没有新范围的情况下只换tag或替换jar“清零”。已向用户请求在现有S3补入专项修复的授权；此前只读扫描/元数据读取不改变容器、卷或日期。候选/冻结/正式28/远端CI停止在此门，不自动豁免52条。

门户原客户镜像68包/95公告；原NGINX1.27.5另核[官方版本级清单](https://nginx.org/en/security_advisories.html)，避免OSV缺记录冒充安全。两处共用基础改为官方stable1.30.5-alpine固定digest 0985e772...27d94，三新门户实际均71包/5不同公告/原生退出1；NGINX实际1.30.5、OpenSSL运行3.5.8。只改变基础，不改业务路由/JS源码；首个运营构建issuer误用customer，已核对参数并生成独立02/internal镜像，01不作当前验收，未部署错误构建。一次扫描参数拼接使文件路径被当image/退出127，失败留存，改为显式参数数组后实际扫描，不把127算发现。

五项分别是Expat UTF16输入、nghttpx代理、可控JIT正则、TIFF解码、特定gz写入；nginx -V/ldd、无nghttpx探针及三路由源核对后由独立verify-ci-nginx-review.py核验。只接受当前三个镜像ID、共用基础层、实际原生层绑定及源/config摘要与五项精确公告，candidateReady=false，许可分发门仍false。三回执均5/5已审/0阻断/退出0，原生1保留；版权原件、实际前端NOTICE、其他基础镜像及最终候选尚未闭合，不能标产品GO。

用户明确允许精确NOT_AFFECTED证据处置，实际可达/证据不足继续阻断，原告警及严重性不改。原aff9a41a镜像的SBOM扫描200公告不等于200漏洞；同固定OSV直接扫描镜像纠正Go版本前缀误匹配及Ubuntu ELF/安装记录覆盖差异，得到225包/85不同公告，同时发现原扫描漏掉的原生库。原报告、直接报告和59已审/26待审回执均保留；旧处置没有套到新镜像。

原Ubuntu26.04层的/usr/bin/pebble精确提交f1688182910f在官方Go代理/GitHub均不可回读，镜像内无其许可原件；[Canonical资料](https://ubuntu.com/docs/pebble/)只能证明项目通常GPL-3.0，不能证明该发行对应源码齐备。只将同Java21的基础换为官方21-jre-noble固定digest，未升级业务框架、删系统包或关闭Docker AI。新镜像0741461b...42e8af为Ubuntu24.04/Temurin21.0.12.1；/app/app.jar与前版完整SHA256相同e3adcdad...6828b、157应用类与119项已通过编译测试一致。没有部署到原服务。

Noble实际BOM826组件，直接OSV208包/42受影响安装记录/48不同公告，原生退出1。scripts/test/ci-image-dispositions.json只接受这些精确包版本/公告，绑定基础层、BOOT-INF载荷、全部main源码/资源/pom/Dockerfile及compose.channel.yaml摘要；未知公告、代码/基础/载荷漂移仍失败。Spring两项按[官方SSE条件](https://spring.io/security/cve-2026-47890/)及[XSLT条件](https://spring.io/security/cve-2026-47884/)处置，保留OSV CRITICAL与官方LOW/MEDIUM的差异。其余原生库按具体API而非“系统包都不用”核对：文件上传只存bytes，PDF是手写ASCII/Courier，不读原生XML/字体/PNG；Java正则不是PCRE2，JWT/PKCE不是PAM；固定curl健康检查没有dash的glob/escape输入，且不调用tar/gpg/wget/mount。glibc确有DNS消费路径，Channel新增dns_search=[.]，Test Support/隔离CI继承，阻断宿主/VPN长搜索域条件；amd64、非SUID Java入口及无nscd等其他条件分别核对。Expat未描述公告另读[上游PR1393](https://github.com/libexpat/libexpat/pull/1393)，不是因描述空白豁免。

原件按实际安装文件归属关联：Windows无法直接导出带冒号dpkg文件名，改为只读输出.list映射；部分嵌套Unix链接另按规范路径精确导出版权原件，未删除失败导出。Syft的19个license.name=sha256记录不是许可名称，新增拒绝规则后按完整原文细化GCC运行例外、Kerberos/GLIBC多条款目录及OpenSSL实际二进制条款，不用MPL覆盖第三方。noble-review-04为48/48精确处置、许可关联未解决0、退出0；只是实际元数据/原件门。完整copyleft对应源码、所有产品镜像NOTICE及二进制再分发仍是独立交付门，本次不公开/打包发布镜像，不能因此标许可证整门完成。

Windows默认/daemon认证TLS EOF与单次HTTP1.1探针200均保留。最终仅在构建进程使用Windows已配置代理及HTTP1.1客户端设置后成功，随后恢复进程环境；未修改全局代理、凭据、Docker配置或重启原服务。此网络复验不算业务/Agent LIVE。初次BOM用tag导致身份门拒绝，按实际不可变ID重新生成后才验证，没有放宽绑定。

## 修复前扫描基线

2026-10-12，固定OSV-Scanner2.6.0在线查询九份当前产品NPM锁：原生退出1。受控源码没有已知未解决秘密命中，不代表依赖安全。93处受影响包版本记录、52个不同包版本、126条不同公告；去重公告严重性为Critical5、High56、Moderate61、Low4。没有证明已被攻击或每条公告均可在本产品利用；仍需按具体调用与上游公告核对，未核对不能忽略。

原始失败报告：`D:/Agent/.codex-temp/banksystem-rf065/dependencies-20261012-01/vulnerabilities-locks.json`。报告生产者实跑失败：`D:/Agent/.codex-temp/banksystem-rf065/dependencies-20261012-02/dependency-result.json`，配套`vulnerability-inventory.json`逐项保留锁内位置、声明用途、公告及各分支修复版本。所有93处均映射到实际锁条目，无UNKNOWN位置。数据是声明依赖，不是已安装版本或运行可利用性证明。

| 当前产品树 | 受影响包版本记录 | runtime声明 | development声明 |
| --- | ---: | ---: | ---: |
| Customer Portal | 10 | 2 | 8 |
| Operations Console | 10 | 2 | 8 |
| Quality Portal | 12 | 2 | 10 |
| bank-api-client | 8 | 0 | 8 |
| bank-ui-kit | 10 | 0 | 10 |
| Harness根 | 12 | 12 | 0 |
| Controller | 7 | 7 | 0 |
| CLI | 0 | 0 | 0 |
| 浏览器runtime | 24 | 24 | 0 |

## 2026-10-12 F2/F3当前修复结论

用户授权“完成剩余修复”。依照codebase-design按实际消费者收敛，保留LangGraph V2、MCP/Harness、Midscene Web1.10.5、Playwright1.59.1及Chromium1217；不安装备用模型、浏览器或Flowise，不调用BYOK。原工作区和运行服务不替换。

- Controller只有旧内核测试使用DeepAgents规划器，现行runtime直接使用V2；旧规划器迁为既有LangChain createAgent，仅暴露governed_read/结构化输出，移除DeepAgents及其未使用的文件系统/braces依赖。历史V1身份标签不当作当前能力。Mammoth保留，父包argparse定向改2.0.1；CLI帮助、真实DOCX转换和主库提取通过，sprintf-js移除。
- runtime修复实际命中：engine.io6.6.11、ip-address10.7.4、js-yaml4.3.2、proxy-addr2.0.8、qs6.16.0、sharp0.35.5、undici6.29.0/7.30.0、uuid11.1.1、basic-ftp6.2.1。新Sharp真实Midscene缩放、浏览器/Agent构造及get-uri/FTP导入经过复验；安装固定Node20/npm10、官方registry/空自有配置/cache/ignore-scripts，未改原node_modules。
- Node20兼容的Puppeteer浏览器包仍依赖未发布修复版的extract-zip。维护vendor/extract-zip原2.0.1/BSD-2-Clause源码：拒绝ZIP符号链接、已有末端链接，使用适用系统的O_NOFOLLOW，并在异常拒绝前关闭归档。Windows目录链接/绝对与相对ZIP链接均真实拒绝，正常小ZIP及114,768,076字节Gyan发布包均正常解压。NPM install-links打包本地源码而不是留下不可移植的外部链接；原上游版本及两公告仍公开保留，不重命名、虚增修复版或ignore。
- 2018年FFmpeg安装器退出产品依赖，媒体读取统一冻结Gyan9.0.2路径；与Playwright录屏ffmpeg1011分开。发布ZIP SHA256为60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba，实际exe为3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec；LICENSE/README随原包保留。PS5.1首次安装/已有安装复核和错误archive拒绝均通过；demo prepare和Windows CI显式调用准备入口。
- 媒体复审真实反例：破坏MP4的mdat但保留头，实际解码退出69，旧inspectVideo仍接受。现已按解码error/status失败，返回I10_VIDEO_DECODE_FAILED；合法H264保持原返回，图片合法/损坏、脱敏及视频反例实际通过。未执行两个需要独立OCR模型的既有非CI用例，不能标作已验证OCR。
- 三个vendor文件和媒体freeze/准备脚本已加入既有ReleaseIdentity输入，不另造身份算法。原离线CLI SBOM已确认为STALE，用既有生成器重建为121组件并check通过；该SBOM范围只为CLI/Controller，九锁声明BOM另行生成。

局部媒体/ZIP4/4、旧内核与图片既有回归19/19（其ZIP部分为前三项）、真实依赖能力探针通过。最终新Git源码快照完整756/756、失败/取消/跳过均0（276.848s），原覆盖58.31/75.12/61.04通过（128通过、1原有跳过）；build/typecheck/210文件语法/103文件发现门通过。两个OCR模型前置不足的文件按原CI清单排除，不能把它们算成通过。已保留缺导出、缺预先build、ZIP异常句柄、清单排序、身份目录登记和非Git投影上下文的失败记录，不覆盖失败或调整断言掩盖。Windows/Linux runtime准备均ignore-scripts，Chromium和媒体显式安装，禁止Puppeteer postinstall隐式下载第二套Chrome；原生根/Controller准备不改变。

最新真实九锁扫描完整9/9，12个可升级/可移除包命中消除；剩1处extract-zip原版标识的2条HIGH公告、0 Critical，原生退出1继续传播。声明BOM925组件/22库许可元数据缺项，第三方二进制/镜像许可和安全门仍需验收。即使本地补丁反例通过，也不手工把扫描、S3或产品结论改为GO；S3 IMPLEMENTING、A07 IN_PROGRESS，镜像/候选/远端CI及当前身份正式28项未解锁。

证据根：D:/Agent/.codex-temp/banksystem-rf065/remaining-f3-20261012-01。before只备份公开输入，packages为实际新安装，downloads保留120秒超时的102,178,531字节原部分包及显式续传副本；capability-artifacts、media-corruption-before/after、ps51-media、media-negative及各regression日志均属本次隔离材料。原env、运行库/日志、卷、凭据、Docker AI未读取或修改。

上游依据：[LangChain Agent](https://docs.langchain.com/oss/javascript/langchain/agents)、[未发布ZIP修补](https://github.com/max-mapper/extract-zip/pull/160)、[FFmpeg官方Windows来源](https://ffmpeg.org/download.html)、[Gyan固定发布与许可](https://www.gyan.dev/ffmpeg/builds/)、[发布包摘要](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip.sha256)。本地补丁不宣称上游已发布，也不把版本锁扫描当二进制漏洞证明。

## 来源判断

1. 三门户仍声明React Router6，锁定6.30.4；共同开发链锁定Vitest3/tinypool1.1.1。部分新公告修复在后续主版本，单纯刷新旧范围不能解决全部命中。不得强行把tinypool2塞入未验证的Vitest3。
2. Harness/Controller固定MCP SDK1.30.0，runtime固定Midscene1.10.5。它们携带的HTTP、图片、压缩、代理等传递依赖不能由本项目源码测试代替上游修复；部分runtime依赖仍为2025年版本。
3. Harness已有精确override，但当前brace-expansion1.1.18/2.1.4等又落入新公告范围；旧审计通过不保证当前数据库安全。冻结版本用于复现，不是永久豁免。
4. 九个自有package.json均缺license字段，SBOM不能从根LICENSE自动推断每个包的声明许可。声明BOM含1256组件，其中1247library；27个library缺许可元数据（含重复的自有/本地file引用），另9个file组件不应误计为许可缺项。8个不同第三方包缺元数据：@midscene/webdriver、buffers、dom-walk、exif-parser、ftp-response-parser、parse-listing、union、xmlhttprequest-ssl。需查精确版本发布包LICENSE/NOTICE，不以MPL填充上游。

## 本片最小修复分组

### 代码优先复核：浏览器能力与身份输入（2026-10-12）

本次只沿当前产品启动/作者化/正式执行/身份计算源码追踪，没有先写测试或执行依赖安装、模型、浏览器或银行操作。结论按消费者和输入区分，不把锁命中直接等同可利用漏洞。

1. **CLI只有安装/检查消费者。** `runtime/package.json:10`声明`@midscene/cli`；`demo.ps1:451`和`verify-agent-browser-runtime.ps1:15,20`强制检查它与冻结版本一致。当前Worker入口`worker/src/index.cjs:14`调用`i10-midscene-candidate-authoring.cjs`，后者`:40–49`直接加载Playwright和`@midscene/web/playwright`。正式及稳定性执行分别由`i8-formal-runner.cjs`、`i8-stability-runner.cjs`加载Playwright。当前核对的Worker/Controller/MCP/CLI执行源码与脚本没有导入或启动Midscene CLI命令；它不是本项目的`hz-agent` CLI，不需要为保留`hz-agent`而保留它。
2. **安装能力过载，但不能按包名全部删除。** 原锁中Android/iOS/Harmony/Computer及完整Puppeteer的dependencies直接拥有者均为`@midscene/cli`；`@appium/support`通过Android→appium-adb引入。裁剪CLI有明确源码依据。与此同时`@midscene/web`直接拥有`@midscene/playground`和`puppeteer-core`，playground拥有Express，Puppeteer-core仍拥有浏览器工具链。锁生成进一步确认Web对完整Puppeteer声明optional peer，因此Puppeteer也仍保留；依赖归属须同时考虑peer/optional边，不能只看dependencies。共享图片处理也仍存在。因此删除CLI不等于删除所有代理、ZIP或图片库，更不等于漏洞清零；是否在运行时激活仍需具体入口分析，不以安装图代替执行图。
3. **身份清单遗漏是先于裁剪的已确认缺陷。** `agent-cli/release-identity-v4-manifest.json`没有包含`runtime/package.json`、`runtime/package-lock.json`、`config/demo-runtime-freeze.json`，也未包含Harness根`package-lock.json`。`scripts/i10-release-identity-v4.cjs:107–130`只对清单/动态源码/明确银行路径聚合，`nodeRuntimeIdentity`只读取Node运行时清单，没有全仓dirty内容摘要补足。由输入依赖即可确认：只修改上述未纳入的文件、其余输入不变时，本身份函数不会感知变化。稳定性runner另算freeze/Playwright/Chromium运行时摘要，不等于ReleaseIdentity已绑定这些输入。不能在裁剪后仅凭身份“没变”续用旧证据。

对应最小修法：先在既有ReleaseIdentity清单纳入上述四个公开依赖/冻结文件，不增加另一个身份算法；再同步移除runtime直接CLI声明、冻结CLI条目及两处准备/校验名单，以锁文件生成器裁剪失去消费者的传递树。保留`@midscene/web/playwright`、Playwright、现有Chromium和`hz-agent`入口，不增加替代浏览器、适配层或运行时Mock。Web仍拥有的传递漏洞继续按精确使用条件及上游修复分支处理。

实施前需细化现有S3的精确修改路径：`demo.ps1`、`scripts/deploy/verify-agent-browser-runtime.ps1`、`platform/hengzhun-regression-system/runtime/package.json`、`runtime/package-lock.json`、`config/demo-runtime-freeze.json`、`agent-cli/release-identity-v4-manifest.json`（最后三项相对`platform/hengzhun-regression-system`产品根）。本次尚未打开这些新增产品修改路径、升级或删除依赖；后续先审安装/锁生成来源与已有消费者合同，再做最小改动，最后执行已有身份、准备和作者化/正式执行验证。所有身份相关源码修改结束后才统一冻结和核对LIVE授权，不在本次源码复核中生成新身份。

升级执行前，先在现有S3任务/切片/批次补齐相应package.json与package-lock.json精确路径和所属模块。当前只完成扫描失败闭环，不越过此路径门写依赖或生成候选通过摘要。每组1—3天，禁止全局ignore、force audit fix、放宽性能/回归或运行时回退。

| 局部任务 | 已观察依赖范围（覆盖52个不同包版本中的所有包名） | 实施与回归 |
| --- | --- | --- |
| F1 前端运行和构建链 | react-router/react-router-dom；vitest/@vitest/mocker/tinypool；baseline-browser-mapping/browserslist；nanoid/postcss/source-map-js；brace-expansion | 官方公告核对受支持修复分支、Node20.20.2兼容和安装脚本；能同分支修复先刷新锁，必须升主版本时保持路由/API/页面合同。共享类型生成/测试、三门户lint/typecheck/unit/build、真实PKCE/刷新/导航回归。 |
| F2 Harness/Controller边界 | @modelcontextprotocol/sdk、hono、fast-uri、undici、ip-address、js-yaml、brace-expansion、braces、csv-parse、lodash、sprintf-js、adm-zip | 优先升级拥有传递依赖的直接包；已有override按已观察公告修正，不盲目跨主版本。完整CLI/MCP/Harness/Controller合同、临时SQLite状态、凭据隔离、注册全量及覆盖门；禁止BYOK参与公开CI。 |
| F3 浏览器runtime | @appium/support、@xmldom/xmldom、axios、basic-ftp、engine.io、extract-zip、file-type、form-data、glob、ip-address、js-yaml、lodash、moment、proxy-addr、qs、sharp、shell-quote、undici、uuid、yauzl、brace-expansion | 核对Midscene上游已修复版本及Node20/冻结Playwright兼容；未提供修复的extract-zip不能写成已解决，需要定位消费者，选择上游替换或已证实无消费者的最小删除。空cache安装、SQLite ABI、图片/截图/浏览器工具合同和真实隔离银行浏览器回归。若浏览器版本改变，同步冻结及身份输入，不续用旧运行证据。 |
| F4 许可与新验收 | 九个自有包及上述8种第三方缺项 | 自有代码MPL-2.0显式元数据和锁生成；第三方精确版本许可/NOTICE核对并登记义务，UNKNOWN保持未完成。新受控源码扫描→九锁/BOM在线扫描→实际镜像Java/系统依赖BOM和漏洞→候选摘要，首次非预期失败停止。 |

## 已核对的重点公告

Tinypool两项原型污染到Worker执行问题修复分别为2.1.1与2.1.2，影响条件包含上游原型污染；不能把“开发依赖”当无影响。[上游worker公告](https://github.com/tinylibs/tinypool/security/advisories/GHSA-5gmw-xhrv-c9v3)、[上游run公告](https://github.com/tinylibs/tinypool/security/advisories/GHSA-85c8-ppgw-ccpr)。

proxy-addr2.0.7的公告涉及IPv4映射IPv6信任子网配置，修复2.0.8；本项目是否配置对应信任条件尚待消费者核对，不声称已证实鉴权绕过。[上游公告](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)。form-data4.0.2和shell-quote1.8.2的命中亦保留，具体修复分支/用途以完整清单和上游公告为准，不将所有公告最大fixedVersion机械作为目标版本。

固定Syft的可选“检查最新版”请求曾EOF，但BOM生成实际退出0；已用显式工程配置关闭这项无关请求，不关闭OSV在线查询、不抑制扫描错误。[Syft配置说明](https://oss.anchore.com/docs/reference/syft/configuration/)。

## 当前完成边界

### 2026-10-13 镜像实际扫描与剩余门

已构建三个门户及Channel候选，不替换现有服务。首个Channel实际镜像308包扫描退出1，37个受影响包版本、372个不同公告ID（不是372个不同CVE）。来源分21 Maven、12 Ubuntu、4 Go；不是先前九锁NPM报告的漏报，而是新增扫描范围。只修已命中Java及同Java21基础镜像：Boot3.5.16、Tomcat10.1.61、Jackson2.21.7、ActiveMQ6.2.4、CommonsLang3.18.0、Log4j2.25.5；最终追加JDBC42.7.12，并给自有pom显式MPL-2.0。业务源、API、表结构与日期未变。

Java21最终119/119，失败/错误/跳过0；最初隔离目录未携带相对路径合同导致17个Fixture catalog错误，补齐原公开contracts后原断言全部通过，不改测试或生产默认路径。最终pom许可元数据另mvn offline validate退出0。第一次最终Docker构建在maven-dependency-plugin下载commons-text1.12.0时TLS handshake失败；宿主和新的自有Maven容器对原官方URL均HEAD200后显式重验证一次，同源/同版本构建成功。没有自动重试代码、换源、忽略TLS或修改Docker/代理设置，失败记录保留。

最终Channel镜像sha256:aff9a41a952170fb3e3ea1191b2bb95faf6e6124ff1492081ba4d744ae3e01a2。实际Syft1498组件（包含文件）；OSV扫描306包，退出1，9个受影响包版本/200公告ID：7 Ubuntu、1 Go、1 Maven。Maven剩余仅spring-webmvc6.2.19两项；JDBC新公告已消除。Go stdlib1.26.7来自基础层/usr/bin/pebble，不是银行Java代码；源码无ProcessBuilder/Runtime.exec/pebble调用。Ubuntu剩余coreutils、dash、p11-kit、rust-coreutils、tar、util-linux、wget，其中多项未列修复版本；不能把全部200公告等同银行业务bug，也不自动扩大ZIP处置名单。

[Spring SSE官方公告](https://spring.io/security/cve-2026-47890/)要求SSE发送视图片段且攻击者可控制跨用户流数据；[XsltView官方公告](https://spring.io/security/cve-2026-47884/)要求XsltView、/**视图渲染且未指定视图名。当前main Java源及配置无这些特性或视图解析器；这是源码未满足触发条件的判断，不是已登记机器级镜像VEX或运行验收。官方分别评LOW/MEDIUM，GitHub/OSV记录CRITICAL，两方原始等级均保留。6.2.20为企业支持补丁，OSS修复7.0.9；不为版本扫描归零升级Boot4或买企业版。后续需要按实际可达性形成可复核处置门，而非宽泛忽略；基础层仍须逐项审查，不能据grep为所有系统库豁免。

镜像94个library/application许可元数据缺项，同时实际BOM列135份/usr/share/doc版权/许可材料；这不代表94个组件无许可证。实际许可原件关联、Java/系统组件义务及成品NOTICE投影仍未闭合，source.reviewed.cdx.json的925 NPM组件许可核实不能代替它。候选摘要未给通过、身份未冻结、当前身份28项未运行。远端当前只有旧552b3b8提交的失败工作流（旧Flowise安装步骤），不是新七作业CI的失败证据；候选新分支提交/推送/CI已获授权，但依本地前置门仍未执行，不合并main或公开Release。

### 2026-10-13 ZIP处置与许可复审

复审实际发现父junction会在越界拒绝前创建外部new-dir。原注册用例实测4/5，外部目录多出new-dir；补丁改为创建前逐级lstat父路径，拒绝父链接及跨盘/上级路径，末端链接和归档链接拒绝保留。真实隔离5/5通过（四ZIP+既有损坏视频），不替换原runtime。补丁只适用受控浏览器归档和私有解压目录，不承诺对另一个并发本机进程替换父路径的原子隔离。

原生九锁OSV仍FAILED/1、1处extract-zip2.0.1/两条HIGH；这是保留版本的实际本地修补，不伪造上游发布。新增精确dependency-review门：两个公告、唯一runtime锁、file安装绑定、三原件规范LF摘要、实际Puppeteer解析及四ZIP反例都符合才输出LOCAL_PATCH_REVIEWED；新发现/漂移/扫描错误继续阻断，原报告原位保留。此处置经本次用户“明确告警处置、不为清零扩大重构”授权，替代本项机械等待版本告警归零，不豁免其他安全门。

九个自有包/锁只补MPL-2.0元数据，依赖版本未刷新。union0.5.0和xmlhttprequest-ssl2.1.2的MIT原文来自精确npm发行包；buffers0.1.1的npm发行缺LICENSE，上游GitHub404，采用官方Debian保存的Expat版权记录（含作者许可commit引用），并核对官方原始归档index.js与npm字节相同。三份原文与来源收在scripts/test/third-party-licenses和ci-dependency-dispositions.json，明确它不是本轮重新取得作者授权。补充BOM保留original/source.reviewed两个版本，22缺项经自有根元数据及第三方记录核实后为0；这只是声明NPM许可门，不冒充Java/镜像或成品NOTICE交付。

FFmpeg媒体与ONNX等原生依赖的声明包含GPL/LGPL义务，不能以NPM元数据完整代替实际分发核查。当前源码候选只分发源码/锁/准备脚本，FFmpeg仍由使用者直接下载固定上游包并保留LICENSE/README，不把仅有主FFmpeg源码tag称为全部静态链接对应源码。后续镜像BOM和候选必须按实际打包内容保留许可证/NOTICE；未完成前整体仍NO_GO。

### F2源码归属与修复（2026-10-12）

增量更正：首轮747/752，5失败，覆盖门未运行。先前F3a仅沿Web/Playwright消费者分析，遗漏Worker图片/视频runner对@ffmpeg-installer/win32-x64的直接路径；删除CLI时连带删除FFmpeg是真实运行依赖缺陷。现runtime显式固定原@ffmpeg-installer/ffmpeg1.1.0，新锁九条平台声明、实际安装296包，保留依赖版本不变。已有MCP测试的1.30.0字面量改为当前精确声明与实际安装一致；8个相关既有用例通过，第二轮干净快照完整752/752及原覆盖门已通过，退出0。最终BOM931组件/22许可缺项、在线13处/40公告/1Critical；FFmpeg Windows包GPLv3且二进制版本2018，后续二进制漏洞/许可证门必须核对，不能用NPM无新增发现代替。

两锁19处命中已定位。MCP是Bearer StreamableHTTP，Controller限制127.0.0.1/mcp，无authProvider；[SDK公告](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h)的OAuth条件未启用，仍同步升1.31.0。Express无trust proxy；Hono/ip-address/proxy-addr/qs由SDK引入，fast-uri由AJV引入，按现有主分支更新。CSV入口用columns:true而不启用group_columns_by_name；[CSV公告](https://github.com/adaltas/node-csv/security/advisories/GHSA-8cw4-87c7-c6xx)描述两选项共同触发，固定7.0.2并保持同步解析和字段合同。mammoth.extractRawText拥有xmldom，0.8分支修到0.8.15；旧brace-expansion覆盖修到1.1.21/2.1.7，ONNX安装器adm-zip修到0.6.1。产品只改四个元数据文件共128行，无业务源码/接口迁移。

两项未修复有明确来源：braces最新仍3.0.3，当前/最新DeepAgents均通过micromatch和fast-glob引入；上游includeGlob调用micromatch.isMatch，[公告](https://github.com/github/advisory-database/blob/main/advisories/github-reviewed/2026/09/GHSA-vfj7-8cjw-p6xm/GHSA-vfj7-8cjw-p6xm.json)为递归AST栈耗尽。当前v1 createDeepAgent仍保留，不能凭v2默认路线作声明豁免。sprintf-js由mammoth→argparse1引入；已安装源码仅bin/mammoth引用argparse，extractRawText库不调用它。最新mammoth1.13仍携该依赖，[格式字符串问题](https://github.com/alexei/sprintf.js/issues/237)尚无修复；两项继续保留真实扫描失败，不跨API强换或改包名隐藏。

实际根246包/Controller140包在独立目录安装，使用固定Node20/npm10、官方registry、自有空npmrc和测试cache副本。SQLite11.10/ONNX1.27原生文件复用此前测试安装同版本二进制；SQLite内存查询、ONNX/SDK/LangGraph导入及DPAPI CurrentUser加解密通过。首个临时DPAPI探针误用顶层protectData导致TypeError；按生产Dpapi导出修正，未改生产源码。ignore-scripts及原生复用不是冷下载/安装器全新执行或OCR推理证据。

新在线九锁覆盖9/9、退出1：F2 19→2，全产品30→13，13个不同包版本/40公告/1Critical；前端仍0。BOM922组件/22项许可缺项，Gitleaks2421/0。报告在`D:/Agent/.codex-temp/banksystem-rf065/harness-f2-20261012-01/post-fix-dependencies`；第二轮独立快照完整752/752，覆盖58.31/75.12/61.04满足原50/70/60，退出0。F2两项未修复、S3/A07及整体门继续未完成。

2026-10-12 F1最终：前端五锁50处命中已清零；Vitest4.1.11、Storybook10.6.1、Router7.18.2及同主版本构建传递依赖修复完成。初选Router7.18.0触发新增[RSC公告](https://github.com/remix-run/react-router/security/advisories/GHSA-qwww-vcr4-c8h2)，实际源码无RSC，但同分支修到7.18.2后重建/复扫。57/57现有用例、三门户检查/构建、Storybook构建、三份生成类型一致，以及真实PKCE/刷新/导航和真实空SQLite质量投影通过。借助codebase-design核对实际消费者，未新增包装层或修改页面行为。全产品九锁仍30处/66公告/1Critical，F2/F3、22项许可缺项和后续候选门仍未完成；详细回执见证据索引S3-F1。下列F3a及首次F1分析保留为历史，不覆盖最终结果。

### F1源码分析（2026-10-12）

五组前端的Vitest3引入tinypool1.1.1。公开测试消费者只用标准expect/test/vi.fn/stubGlobal/resetModules，未用旧池/自定义执行器；[Vitest4迁移说明](https://v4.vitest.dev/guide/migration.html)确认移除tinypool，4.1.11的[官方公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)修复mocker且不回移旧主版本。Node20.20.2和现有Vite7满足版本合同。Storybook9最新9.1.20仍精确依赖mocker3.2.4；官方registry的10.6.1已移除该依赖，React/Vite桥保持同版升级。原有ESM配置无需加兼容层。

三门户是createRoot+BrowserRouter声明路由，无SSR/hydration入口；不把SSR公告写成已证实本项目漏洞。但客户/运营登录回跳使用页面路径/sessionStorage，[非可信导航公告](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)仅列7.18.0修复，选择该版并保留现有basename、绝对导航和公开API。实际可利用性未作攻击验证，升级后需真实PKCE/刷新/导航回归。

OpenAPI生成器最新版7.13.0仍限制Redocly1，其固定js-yaml4.2.0，不能通过普通update解除。只对这个父包采用js-yaml4.3.2同主版本覆盖；三份生成文件一致性和客户端用例承担兼容验证。其余已命中的构建传递包在既有主版本范围内刷新锁，不机械选跨分支最大fixedVersion。共享API显式固定当前Vite7.3.6，避免Vitest宽范围意外解析Vite8。

安装隔离于新F1源码/cache，原node_modules未变。共享API首次直连下载Rollup出现ECONNRESET；失败目录保留，显式本机代理/单连接后安装77包，17/17用例通过，客户与运营生成类型字节一致。Storybook旧锁跨主版本peer解析ERESOLVE，原锁和两个失败日志保留；新锁正常解析必须通过后才进入回归，不使用force/legacy-peer-deps。

本次已完成两项源码修复：既有ReleaseIdentity纳入四个遗漏依赖/冻结输入；移除无正式执行消费者的Midscene CLI并同步准备/校验名单、冻结元数据和生成锁。锁条目655→295，裁剪360项，所有保留条目的版本不变；Web1.10.5、Playwright1.59.1、Chromium147.0.7727.15/1217保持。完整Puppeteer仍由Web optional peer保留，不强行删除。

复验：身份/生命周期19/19（四输入覆盖及既有一字节漂移）；浏览器准备合同、修改PS语法、隔离TS构建；新目录缓存安装294包，实际Web/Playwright导入、CLI不存在、冻结Chromium合成DOM通过；隔离Worker context/verification完整27/27。新2421文件受控Gitleaks0发现。独立复核聚合函数只消费清单、四输入已显式入清单；保留版本/Chromium未变，实际独立安装不含CLI，没有改目标、断言或采用运行时Mock冒充业务。

在线九锁扫描仍退出1，覆盖9/9：80处受影响包版本记录、41个不同包版本、82条不同公告（Critical3/High40/Moderate36/Low3）；runtime命中24→11。新声明BOM919组件、22个library许可元数据缺项。没有加忽略规则、改严重性门或把失败变成成功。回执位于`D:/Agent/.codex-temp/banksystem-rf065/runtime-cut-20261012-01/post-cut-dependencies/`；此前报告保留。

安装前提有单列失败：两次新空cache在线安装均TLS ECONNRESET，系统设置未改；缓存兼容复验使用此前S1测试专属内容地址缓存的副本，按当前锁离线安装，不能证明本轮冷下载通过。首个context回归因安装未接入而playwright缺失（6/7），安装接入后新报告27/27，原失败不覆盖。验证日志在同一runtime-cut目录；缓存复验不是离线漏洞扫描，OSV确实在线查询。

镜像BOM/Java系统漏洞、剩余依赖修复、完整许可证义务、候选摘要、远端CI、正式28项均未完成；后续镜像/候选验收已停止。S3仍IMPLEMENTING，A07仍IN_PROGRESS，整体NO_GO。没有调用模型、银行业务操作、服务停止/删卷、系统代理修改、提交/推送或冻结/登记正式新身份。
