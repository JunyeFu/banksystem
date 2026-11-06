---
id: RF065-CHANNEL-RUNTIME-SECURITY-20261106
title: 当前Channel与Test Support候选运行层修补
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.2
effective_date: 2026-11-06
owner: Codex
---

# 当前Channel与Test Support候选运行层修补

## 根因与目标

当前Bank Channel Dockerfile仍从固定Temurin Noble基础000fd…f9408c直接复制Jar，与刚核MQ的基础相同。已观测的11包安全补丁与被撤根尚未进入此构建；旧0741…制品也不是J7当前配置的完整重建。Test Support实际复用同一镜像，不单独复制一条构建路线。

### C0：厂商安全发行核对后的必要修正

执行中进一步核厂商确认：Temurin于10月30日发布21.0.13+9，包含10月安全/CA修复；仅在21.0.12.1上补OS包或单个根不能冒充完整厂商更新。[官方发行说明](https://adoptium.net/en-GB/news/2026/10/eclipse-temurin-17021-21013-2505-2701-available)及官方发布的release-notes JSON实际SHA256 `f423998948a5c577c0cfebb1f3def375a1503e2327411691f60d886ece440235`已核。

因此C1收敛到同一Java21支线的官方固定21.0.13+9 JDK/JRE Noble，Maven继续3.9.9；仅复制其原发行目录到新JDK构建层，不复制或执行旧Maven镜像的JDK/OS。新JRE官方index digest为0eda5830…94e46f、新JDK为114cabb7…ab2d，均linux/amd64实核。新JRE实际已包含原11包中的八项修补与CA撤销，只有APT两包2.8.3和PCRE2-8的2.1仍落后，所以仅ADD/断网安装这三包，不重复安装或降级其它八包。目标根由厂商正确移除，不能要求新版基线再执行一个必然失败的重复keytool删除。

原版原生Maven预取构建保留日志；当前发现其安全基线已被替代，核实唯一客户端/起时/标签后只取消该旧客户端，不因观察超时而判其网络失败或重启原服务。C1同时把现有banksystem-channel-maven-seeded缓存挂载供预取和编译两步复用，避免已观察到的更换JDK层使同一POM全部重下；不新增宿主依赖/私有预制基座或备用源。新克隆空缓存仍按同一固定源获取，真实构建/拒绝与新制品门继续执行。

## 落地任务与实际失败修补

1. C1 保持服务目录构建context及原Maven步骤/UID10001/端口/入口。按C0固定同支线厂商JDK/JRE，使用Docker原生`ADD --checksum=sha256`获取新基线实际仍缺的APT两包及PCRE2-8三包，`RUN --network=none`离线配置，禁止联网APT/全量upgrade或宿主预置packages。只核验新版厂商公开信任库已撤销目标根，不重复删根或自行添加证书；错误摘要由实际Docker拒绝。
2. C2 使用现有自有source-snapshot同步当前152银行输入，不复制运行态或数据库；从实际源码Dockerfile构建新tag，提取真实Jar/公开许可/包元数据，全新Syft/OSV绑定实际ID与层。旧policy必须拒绝新身份；只有当前源/类/配置/原生详情/平台与特征重新证明的精确条目可保留，其余阻断，不删除未审风险或降低严重性。
3. C3 用真实新Jar/运行镜像执行既有隔离PG18双迁移及MQ协议探针，核当前配置、认证/事务/持久消息；只新tmpfs空库/私有队列/自有网络，不连原银行/模型或推业务日期。相关合同/Java21完整源门、治理/docs与验收导向复审后交REVIEW；全产品安全/许可/28和远端CI仍分别验收。

### C4：实际新扫描命中的客户端补丁

C1首个实际新镜像1aea78…969c00的原生扫描为65项，新增命中当前Jar的ActiveMQ客户端6.2.4：CVE-2026-50734与CVE-2026-53917。官方公告明确6.0.0至6.2.7之前受影响：[协商内存分配](https://activemq.apache.org/security-advisories.data/CVE-2026-50734-announcement.txt)、[属性反序列化内存分配](https://activemq.apache.org/security-advisories.data/CVE-2026-53917-announcement.txt)。客户端并非只凭“不是Broker”就安全，不能加版本豁免。

仅将既有POM的activemq.version从6.2.4改为已审同6.2支线6.2.10，与当前隔离Broker发行一致；不引入activemq-all或改变消息/资金/API/认证配置。先核官方Maven POM、运行依赖及许可证，再修单一版本和对应合同，当前源码副本同步后重新构建/扫描；保留65项及此前所有实际结果作为首轮，不套作最终制品验收。最终新Jar须重跑完整Java21、隔离PG18及两阶段真实JMS，明确比较业务类与非MQ依赖不变。C4在最终C2绑定前执行，避免为被替代的中间镜像重签政策。

## 输入与白名单

11包官方版本/大小/SHA及维护脚本沿[MQ集中修补](mq-library-security-20261106.md)N组固定输入；源码清单由实际Git受控服务路径产生，当前Jar必须从新制品取出，不能把J7保存Jar当新镜像。

白名单：services/bank-channel-service/{Dockerfile,pom.xml}、scripts/test/{test_ci_dependency_scan.py,test_ci_artifacts.py,ci-image-dispositions.json}、本包、现有RF065 S3/证据/唯一顺序/backlog与根README、CHANGELOG；外部站点只同步已有data.js/test.mjs/README.md事实。预算15文件/1新增/1000行，0API/迁移/业务代码/新主机依赖。既有S3 scripts/deploy验证器只读复用；实际消费失败才开放最小补丁。

自有输出复用foundation-20261017-01/channel-runtime-20261106-01，重用现有源码副本/依赖及固定扫描工具，不再克隆全仓或安装原runtime。预计新增不足1.5GiB，收尾核实实际大小；保留原52、中间65与所有旧风险/失败，不宽泛暂存/提交/推送，不重启原服务或挂原卷。

## 验证

- STATIC/CONTRACT：Dockerfile下载集与已审manifest逐项一致、服务context不变、安装断网且无APT下载/全量升级/其它根导入；错误摘要的实际构建反例。
- INTEGRATION：完整实际源码构建、Jar资源/类/配置与当前源门对齐，OS/JRE公开DER集合、包差异、真实层/BOM/native绑定；当前实际验证器拒绝旧身份、未审风险非零。隔离真实迁移/JMS不扩大成银行黄金链或LIVE。
- 既有Java21完整门、相关Python合同、`python scripts/architecture/validate_refactoring.py --batch RF-065`、`python scripts/docs/validate_docs.py`；保留失败输出再修，不写成功报告替代执行。

## 官方机制

[Docker ADD校验和与RUN网络](https://docs.docker.com/reference/dockerfile/)支持固定HTTPS资源的SHA256和单步断网安装。当前Buildx实际0.38.1；不需要新增插件、全局信任设置或改变原项目端口。Noble官方输入与目标根来源沿上链接，不使用第三方镜像替代未审制品。

## 实际执行与验收回执（2026-11-06）

- C1中间镜像1aea78…969c00实际构建0，原生65项；当前最终候选`sha256:6b8902e6406f6e25fac7b62f07587fae8c940bdecd8fc58a814718c8df1ad421`从同一152文件源锥实际构建0。最终JRE为21.0.13+9，Maven仍3.9.9，三份官方包实际校验/断网配置。错误摘要反例被Docker原生拒绝，未启动业务。
- C4实际Jar SHA256为`a48a87022fab1ecc9ed68aacc51ad042d756f2b6a55ca71ff0085fb5279f0f1a`；157个业务类与J7已测编译字节相同，69依赖中仅activemq-client 6.2.4→6.2.10，另68份不变。当前application.yml逐字节匹配源码。两条公告在全新原生扫描中消失，最终原生63项、退出1，原报告不修改。
- 最终reviewer实际退出0：63项精确REVIEWED、0阻断/0缺项；只限该镜像/源锥/Java PID1 UID10001/声明拓扑与DNS边界，不对其它镜像或后续公告豁免。绑定源摘要`807b2221130b5933b63a58d23115581eb010cb201bd920adf1ae8d45fe4c10ff`、Jar载荷`571983bd5fa55a27e7d36bed98d679c932fca91280bb02d7b014f672c16af2d3`及实际所有层。原0741…政策实际拒绝中间新制品`IMAGE_REVIEW_IMAGE_DRIFT`；旧52及中间65保持为历史。
- 许可30项材料关联、未解0；20份既有精确版权记录与本次实际镜像版权字节相同，路径改为本次镜像真实doc原件；客户端内LICENSE/NOTICE实核。此结果不是完整镜像分发义务已完成，`binaryRedistributionObligationsCompleted=false`保持。
- 实际新版JRE公开证书118张、OS证书120张，目标G3 DER两处都不存在；按厂商新版核验，不再声称所有其它证书不变，也没有自制导入/重复删除。实际JRE原生依赖、curl依赖/协议与UTF-8文件/JNU编码已留存。
- 最终Java21 36类121/121、0失败/错误/跳过、原生0（宿主21.0.12.1+1、嵌入PG14.15）；实际新镜像21.0.13执行PG18.6完整59迁移/第二次0、V9及回执约束/26表0行通过。最终真实JMS客户端6.2.10两段及驱动0：错误凭据拒绝、文本与属性、rollback同ID第二投递、commit移除、Broker重建持久消息恢复/排空。两协议探针不挂载替代Jar，直接使用最终镜像内的Jar，不是原环境黄金链或LIVE。
- 依赖68/工件25/workflow16合同通过。原15容器ID/运行集合、网络保持；自有PG/MQ容器与网络已收拢，只保留自有合成输出，原数据/卷/日期/模型未使用。旧断开客户端对应BuildKit最终确认Maven JNA下载Read timed out失败，不再运行；没有修改Docker网络或系统许可设置。

### 新增公告的逐组可达性依据

以下是产品范围的“不受影响”判定，不是上游修复、降级严重性或全局忽略。旧精确记录仅在当前源/业务类及运行条件重新核验后保留，已修版本或不再出现的旧条目不留作当前政策。

| 精确组件与新增记录 | 必要触发条件及当前实际边界 |
| --- | --- |
| gnupg2 118131 | [Ubuntu原文](https://ubuntu.com/security/CVE-2026-118131)为Windows ProgramData DACL。当前镜像Linux/amd64，应用无gpg执行入口，不能因为宿主是Windows就将容器当Windows版GnuPG。 |
| glibc 122054、84243 | [编码转换](https://ubuntu.com/security/CVE-2026-122054)需BIG-HKSCS原生转换；本镜像JNU/native/file UTF-8，Java无iconv/进程入口。[gettext](https://ubuntu.com/security/CVE-2026-84243)需控制LANGUAGE并放置.mo文件；声明环境没有该输入，上传入PostgreSQL不写目录。不是声称glibc不被使用。 |
| expat 113351、115506、117610、118370 | 分别为reset计数、DTD放大、外部实体分块和超大属性计数，见[官方记录](https://ubuntu.com/security/CVE-2026-113351)、[115506](https://ubuntu.com/security/CVE-2026-115506)、[117610](https://ubuntu.com/security/CVE-2026-117610)、[118370](https://ubuntu.com/security/CVE-2026-118370)。实际JRE不链接libexpat，无JNI/进程解析；Java XML与原生Expat区分，上传仅存字节。 |
| gnutls28 88648 | [官方条件](https://ubuntu.com/security/CVE-2026-88648)为证书msUPN/SRV约束。JRE无GnuTLS链接，HTTP使用JSSE；curl间接链接但只执行固定明文localhost健康查询。厂商争议/延迟修复不作为安全结论。 |
| krb5 107708、107778 | [原始CNA记录](https://cveawg.mitre.org/api/cve/CVE-2026-107708)要求KDC的S4U2Proxy/PAC；[GSS接收缺陷](https://ubuntu.com/security/CVE-2026-107778)要求原生acceptor处理转发票据。此镜像不运行KDC，认证是JWT/PKCE、PG密码与Java JMS，无GSS接收端；curl虽链接Kerberos，但固定健康请求没有SPNEGO。 |
| rtmpdump 112060、112061 | 原始CNA[AMF3记录](https://cveawg.mitre.org/api/cve/CVE-2026-112060)与[AMF0记录](https://cveawg.mitre.org/api/cve/CVE-2026-112061)要求RTMP对端数据。curl确实支持/链接RTMP，不能写“库不存在”；仅固定HTTP健康查询、无-L或用户URL，JRE无librtmp，应用无RTMP/进程入口。 |
| sqlite3 119371–119379、119586、119591 | SQL/库缺陷覆盖CTE、FTS3/4、FTS5、WAL、COLLATE、JOIN授权、R-Tree、session及VALUES；[119371](https://ubuntu.com/security/CVE-2026-119371)、[session原始记录](https://cveawg.mitre.org/api/cve/CVE-2026-119379)、[VALUES](https://ubuntu.com/security/CVE-2026-119591)与其余官方来源逐项核对。实际Java无SQLite/JNA驱动，JRE/curl依赖不链接SQLite、上传不打开数据库文件。[119586](https://ubuntu.com/security/CVE-2026-119586)另需CLI .recover管道，镜像没有sqlite3命令。Harness的SQLite不属于此镜像，不能继承该判定。 |
| systemd 40228（当前版本8.18） | [官方记录](https://ubuntu.com/security/CVE-2026-40228)仍需journald/ForwardToWall/logger；Java是PID1，无systemd启动或logger调用，8.17的旧版本绑定不直接沿用。 |

其余七个SQLite官方Description已通过HTTPS实际回读；四个Ubuntu页面超时者由原始CNA记录确认，失败不隐去。完整地址、摘要与原文在本任务自有`additional-primary-source-receipts.json`、`cna-source-receipts.json`，不是第三方摘要代替原始公告。

### 失败保留、范围与剩余门

许可提取首轮发现厂商遗留的非许可文档悬空链接；记录精确目标后只归档可解析的普通文件，tar错误不吞掉，版权原件仍由实际镜像提取。Windows helper的GBK默认读UTF-8失败已修为显式UTF-8；精确Controller计数为27（排除一个RestControllerAdvice）。Windows PowerShell的本地脚本策略拒绝不通过修改策略解决，改用已有允许本地脚本的PowerShell7执行同一脚本；未改变系统/用户安全设置。

本轮自有文件5358份/444,513,050字节，最大42,115,762字节；未产生额外镜像归档/全仓克隆，也未移动、删除或清理已有产物。实际制品、扫描、失败、完整回归及关闭回执均在`foundation-20261017-01/channel-runtime-20261106-01`；最终材料在final-image-03、final-review-03，PG/JMS在pg18-final-03、jms-final-03。

本片完成后仅交REVIEW，RF065-S3仍IMPLEMENTING、整体NO_GO。MQ候选仍69项未审且尚未跟进新厂商Java CPU，PG仍132/12/120；统一候选、分发义务、待确认版本、最终身份/正式28/远端CI及本人材料仍按唯一顺序推进。原服务不切换、不为已修镜像提前冻结身份。
