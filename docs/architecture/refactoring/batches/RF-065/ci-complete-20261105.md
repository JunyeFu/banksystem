---
id: RF065-CI-COMPLETE-20261105
title: RF065-S3 当前源码完整隔离回归
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-05
owner: Codex
---

# RF065-S3：当前源码完整隔离门

## 2026-11-06 Java当前依赖出口

### J7：默认MQ认证与独立凭据

J6证明镜像已有认证能力，但默认core Compose未启用；Bank Channel未显式转发MQ凭据且YAML引用DB密码/默认admin，不能继承J6的显式测试配方为产品完成。本片修默认源码接线：独立ACTIVEMQ_PASSWORD由prepare生成并供broker/Channel/Test Support使用；不复用DB密码、不保留admin密码回退，不连接原MQ或重载原服务。三个BYOK必填仍不变，MQ密钥不要求用户手填。

源码核实固定Fineract be6c4ac的JmsBrokerConfiguration及ExternalEventJMSConfiguration均受独立enabled属性控制，且密码保护另有开关；通知监听/发布也有条件。J7不打开作业/外部事件模式，不盲目改Fineract旧别名或插入未启用消费者。当前修复仅Bank Channel消息链路与broker连接认证，不宣称所有broker ACL/管理面已完成。

步骤：①现有拓扑合同先验证broker与两个客户端接入独立MQ密钥，PowerShell5.1真实函数测试旧env补键/不轮换/模板生成/空值失败和无秘密输出，保留红灯；②精确修改.env.example、core/channel Compose、application.yml、demo.ps1及CI准备器，不改原.env，CI和源码均消费同一变量；③定向/Java21全套、治理/docs后打包当前Jar，复用J6真实MQ但启动env来自实际Compose、客户端从Jar的YAML绑定，复验正/负认证及消息/重建。只本批数据/网络，无最终身份或银行资金操作。

除本包/S3.md/evidence-index.md及唯一顺序/backlog，白名单精确为.env.example、postgresql/docker-compose.isolated.yml、compose.channel.yaml、services/bank-channel-service/src/main/resources/application.yml、demo.ps1、scripts/deploy/prepare-ci-bank.py、scripts/test/test_ci_bank_topology.py、scripts/test/test_ci_workflow.py、新scripts/test/test-demo-credentials.ps1、.github/workflows/ci.yml，及RF065 batch/S3路径登记；必要同步根README/CHANGELOG和外部站既有data.js/test.mjs/README.md的当前事实，不改UI/后端/个人笔记。预算22文件/1新增/350行，0API/迁移/新依赖。源码默认定义调整只服务未来候选，本轮不apply到原拓扑/卷；原服务/凭据/日期保持。实际失败留原证据后最小修复，当前安全/许可/版本待选/28/远端CI门不降低。

J7实际出口：拓扑独立期望首先失败（broker environment为空），PS5.1首次受本机Restricted启动策略阻挡；沿项目已有仅子进程ExecutionPolicy Bypass运行后，实际功能红灯为旧env未生成MQ凭据，未改变用户/系统执行策略。随后独立ACTIVEMQ_PASSWORD的模板/缺键补齐、空值明确失败、不轮换与保留旧配置实现；core连接认证及Channel/Test Support同键传递、CI独立生成已接线，没有DB密码/admin回退。拓扑5/5、PS5.1四情形、workflow16/16、dependency63/63、artifact25/25通过，新增脚本已由现有source-engineering CI消费，不建新作业。

当前152银行输入同步后完整Java21 package实际36类121/121、零失败/错误/跳过，86秒；隔离PG仍14.15，该结果不冒充PG18全套业务。当前Jar另保留app-current.jar，探针从其实际application.yml绑定MQ密码，测试环境特意提供不同DB哨兵值；broker env由实际core Compose和同一生产替换函数生成。真实MQ两段及驱动均0：正确认证、错误密码拒绝、文本/三属性、rollback同ID第二投递/commit移除、重建持久消息回读均通过。只使用私有队列和本批数据，原拓扑未apply；不将此称为原环境已启用认证或全产品镜像已重建。

真实CI prepare亦在同一受控副本生成十服务拓扑，未启动；MQ与三类DB密码不同、两个客户端与broker一致，细节只存私有生成配置，公开回执不含值。ci-preparation-check-r2修正首份PowerShell属性集合计数的展示错误，原件保留。输出mq-auth-wiring-01含八既有文件前像、原红/绿、Java/Surefire、CI生成与当前Jar、attempt-01真实协议及保全回执；收尾59文件75980119字节，主要42MB Jar和本批KahaDB，删除/隔离0。

验收导向复审核对生成/传递/消费三边同键，无默默轮换/回退或启用Fineract新模式；当前源码默认接线已修，但原部署尚未切换。原15容器ID/运行和原网络集合、四原PID保持，原凭据/数据/日期/笔记未操作。J7移交REVIEW；MQ57及其它安全/许可、功能版本待选、最终统一候选/身份、28项/容量/远端CI与整体NO_GO仍未关闭。J5/J6保留原日期/输入摘要，不冒充此次新Jar或最终候选证据。

### J6：已批准MQ候选真实协议

当前Java121项的JMS发送使用测试替身，MQ6.2.10候选尚缺与当前客户端6.2.4的真实协议证据。沿既有S3基础服务协议步骤，仅启动已批准1b06f7…ce12f候选和当前Jar探针，独占internal网络/合成私有rf065.protocol队列及本批新数据目录；不连接原MQ、银行队列/卷/模型，不发布宿主端口。复用已核空闲10.251.65.0/28，每次重新核Docker/宿主路由无冲突；不改默认地址池。

先核OutboxPublisher实际String JSON及eventId/eventType/aggregateId消息属性，使用当前Jar内JmsTemplate/ActiveMQ客户端发送；验证文本/持久标志/合成关联号和属性回读、显式事务rollback后同ID重投、commit后无重复。再留一条持久消息，停止并重建本批自有broker，复用的仅本批空数据目录，核真实重启后同消息仍可读。只读当前镜像/源制品和实际broker版本，不下载新版本/依赖，不把这些合成消息当银行转账或性能成绩。

默认Compose没有设置ACTIVEMQ_CONNECTION_USER/PASSWORD，候选发行XML的JAAS插件为注释；客户端填密码不证明服务端校验。J6仅用镜像已有启动特性和动态生成的独立测试凭据验证认证启用方式：--env-file/只读本地配置传入，不出现在CLI参数、日志或模型；正向连通后必须拒绝错误凭据。该候选启动配方不代表默认产品认证已接线，不在此静默修改原Compose/凭据或宣称安全门通过；必要产品修复须在已观察根因后精确细化。

只开放本包、S3.md/evidence-index.md及唯一顺序/backlog，预算5既有文件/0新增/100行，运行源不改。探针/日志放java-current-20261106-01/mq-protocol-01；首次失败保留输入及原日志后收拢自有容器/网络，修复后新回执重跑，不覆盖失败。成功还须核原15容器/原网络及四原PID、仅本批测试数据留存；J6为真实隔离协议，不代替默认拓扑/安全许可/身份或正式28项。

J6实际回执：当前Jar42106749字节、152受控输入相等；实际Spring JMS6.2.19/ActiveMQ客户端6.2.4/Jakarta JMS3.1.0，对固定1b06…候选（启动日志6.2.10）执行真实OpenWire。使用其已有Connection Security启动方式、动态本批凭据及独占rf065.protocol队列，原Compose未改。第一段原生退出0：TextMessage/JSON关联号及三属性/持久标志相符，rollback后同JMS ID且第二次投递，commit后无消息，错误密码被JMSSecurityException拒绝；另留一条持久消息。重建broker只复用本批新数据目录，第二段退出0，正确事件/关联号回读并排空；整驱动退出0。

原默认健康命令在新候选两次均真实通过，curl/bash已实探存在，没有为健康虚构兼容处理。恢复日志出现KahaDB free-list重建提示，但事后退出事件窗口没有获得可用记录；本证据只证明stop→重建后的回读，不宣称优雅停机、断电恢复或通用exactly-once。默认Compose未启用连接认证、Bank Channel密码仍引用FINERACT_DB_PASS的来源接缝另行保留，不因该测试启动配方签产品安全通过；MQ既有57项风险继续阻断。

下一步默认认证接线先核核心消费者：固定Apache Fineract be6c4ac公开application.properties实际声明FINERACT_REMOTE_JOB_MESSAGE_HANDLER_JMS_BROKER_URL/USERNAME/PASSWORD及JMS_ENABLED，而Compose当前使用FINERACT_MESSAGING_ACTIVEMQ_BROKER_URL。仅核属性文件不证明所有代码均不读取旧键；后续须核具体配置类/启用方式再接线，不能擅自开启分布式作业或把两套名称当兼容别名。该只读来源核对不读取原运行Env或密码，不在J6更改核心配置。

输出mq-protocol-01含JmsProbe.java/run.py、attempt-01的当前输入/两阶段运行身份/脱敏client及broker原日志/native-exit/result/protocol-result/closeout。22文件33644918字节（主要本批KahaDB），保留当前复核输入，不删除/隔离，不复制原数据或新镜像。自有容器/网络已按名收拢，原15容器ID/运行及原网络集合、Harness/MCP/Worker/站点四原PID保持，未读原凭据/数据/日期/笔记。J6移交REVIEW；默认认证接线与安全/许可、统一候选/身份、正式28/容量/远端CI仍未完成，整体NO_GO。

### J5：真实PG18.6空库完整迁移

现有121项回归使用嵌入PG14.15，不能替代产品PG18.6的完整master应用证据。本增量在同一S3执行已批准18主版本候选的数据库协议检查，不等最终功能版本决定，也不提前开启正式28项。仅当前打包Jar/现有Liquibase、固定PG25612490…98a8de及已有Java21执行镜像，独占内部Docker网络、tmpfs空数据、无宿主端口/原卷/银行配置或模型。全局端口表已注明内部5432不属宿主占用；不启动Fineract或银行应用服务。

步骤：核当前152输入、现有工具与新输出名，打包已通过121项的当前源码（不重复单测）；用同版Liquibase元数据API执行master validate/update，核59个登记及V9与当前解析一致、receipt最终UUID/唯一/FK级联和三证据列、业务表仍空；再同库执行第二次update，证明无待执行/重跑变更。首次实际失败留原日志并停止后续断言，只收拢自有测试容器/网络；原服务保持。凭据由自有可信驱动动态生成到忽略目录，不进入命令参数、日志或模型；不读取原凭据/用户数据。实际成功前不预填结果，源缺陷出现才精确开放修复路径。

白名单只本包、RF065 tasks/S3.md/evidence-index.md及唯一顺序/backlog，预算5既有文件/0新增/100行；探针/日志位于现有java-current-20261106-01下pg18-migration-01，不新增产品抽象或测试框架。现有候选自身120条风险仍阻断，复用Java镜像只作执行器，不声称当前Channel镜像已构建或安全通过。入口属于真实隔离迁移/数据库集成，非银行黄金链/LIVE/当前身份验收；完成后独立核原服务/输入和实际记录，再移交REVIEW。

首次准备在建网阶段退出1，未启动PG或执行迁移；补捕获后实际复现Docker all predefined address pools have been fully subnetted，原网络不存在、原15容器保持。只为新内部网络指定10.251.65.0/28，已核全部Docker子网及14条非默认宿主路由无重叠；驱动启动前再次核验，任一重叠立即失败。第二次输出独立attempt-02，原失败/凭据不覆盖；不prune旧网络或更改daemon地址池。此前按名固定Java基础tag未缓存，改复用已有074146…Java21执行器，显式挂当前Jar而不运行其旧应用；无新增镜像下载。

J5实际复审：attempt-02在无地址池的host/none网络IPAM.Config=null处触发探针解析TypeError，尚未建网；按实测外部JSON语义修正，非银行源码问题。attempt-03真实PG18.6已执行59项，但旧探针在无数据库Scope时计算V9，V8的dbms:postgresql SQL被排除，导致比较误判。已核当前Liquibase4.31.1 ChangeSet.generateCheckSum字节码确按Scope.database筛选DbmsTargetedChange；只修探针期望在同一PostgreSQL Scope计算，保留该次原Java/class/驱动及失败日志，未改迁移/登记或调用clear-checksums。

attempt-04从新的tmpfs空库重新执行：当前152输入相等、Jar内22个changelog源字节相同；Jar42106749字节，实际package成功（此前121项已通过，本次package跳过重复单测）。PG实际18.6 (Debian18.6-1.pgdg13+2)，首次Run59/Previously0，第二次Run0/Previously59；59条V9逐项匹配、无待执行，第二次登记的V9/顺序/执行类型/时间完全不变。receipt UUID非空/唯一/关联transfer_order级联删除及subject/payload/sha256三列通过；26张业务表均0行。迁移进程与整段驱动均实际退出0，无校验错误。

证据为pg18-migration-01下package.log、MigrationProbe.java/run.py、两次准备失败、attempt-03原失败及attempt-04的current-inputs/subnet-preflight/owned-runtime/native-exit/migration-result/closeout与原始日志；公开元数据回读不触及config内动态测试凭据。32个小型输出123923字节，当前Jar约42.1MB保留，未复制全仓或新增依赖/镜像；无永久删除/隔离。仅自有tmpfs测试容器/网络按名收拢，原15容器ID/运行、原网络ID集合与四原PID保持，原数据/日期/笔记无读取写入。J5移交REVIEW；该证据不是全套Java在PG18的测试、Fineract账务/黄金链或正式28项，安全/许可/最终候选/远端CI与整体NO_GO保持。

当前银行POM是Spring Boot3.5.16、Tomcat10.1.61、Jackson2.21.7、ActiveMQ6.2.4、PG驱动42.7.12等已修补组合；RF063的108项历史结果早于这些依赖，不自动作当前源码/依赖门。此增量只运行现有CI的bank-java入口，不重复已稳定的Agent841项或新增测试体系。

微观步骤：J1逐字节比较当前service受控文件及CI Maven settings与已有8e15…/source-snapshot，若不同先保留/同步已确认源码；不共享原业务配置或复制新全仓。J2核已有Java21与固定wrapper/空settings、测试实际使用EmbeddedPostgres临时库，候选进程清除银行/模型配置，再跑mvnw.cmd --batch-mode --settings ../../scripts/test/ci-maven-settings.xml test；目标目录与临时产物只归隔离候选，不连接原银行/模型或修改日期/卷。J3保留完整命令/失败及Surefire结果，按真实结果复审；有确定失败才开放具体最小源码修复，任何未执行项不标通过。

J4（首轮已观察问题）：119/119虽通过，生产master解析实际报告type/constraints重复键。根因在v1-transfer-receipt：旧SnakeYAML用后值char(64)/非空覆盖先写的UUID/唯一/外键；V8另行修复。本片只开放v1-initial-schema.yaml与TransferReceiptSchemaContractTest.java：先留原件与实际全master V9校验和，新增严格重复键回归证实红灯，再仅删被覆盖的死定义，保留历史生效含义及V8/V10；前后全部changeset校验和必须相同，禁止clearCheckSums或连接原数据库。聚焦和全套Java复验后再复审。

白名单为本包、RF065 batch/slices/S3、tasks/S3.md/evidence-index.md与唯一顺序/backlog，以及上述两个精确Java迁移/测试路径。增量预算9既有文件/0新增/180行，不增加changeset、表或接口。原15银行/三个Agent及站点保持；没有新身份/受管重载/正式28项/压力测试或Git提交推送。当前嵌入式PostgreSQL14.15测试不等于产品PG18.6、银行黄金链或LIVE，所有安全版本/补丁/渲染待选边界不变。

### Java实际结果与复审

已有Java21 Temurin21.0.12.1、Maven wrapper3.9.9及仓库空CI settings；152个受控输入执行前逐字节相等。首轮完整36类119/119通过，但生产master确有两重复键警告。新增严格解析用例后实际5项/1失败（DuplicateKeyException定位V1 transfer_id），旧V9断言通过，非臆测失败；日志及旧原件留存。

最小修改仅删除V1被覆盖的六行，加一行历史语义说明；有效char(64)/非空、V8 UUID/唯一/FK修复及V10证据列不变。实际Liquibase元数据探针前后59个master changeset V9校验和逐项相同，旧receipt为9:27e26966dc713618283f1f333221987d；不连接数据库、不新增validCheckSum或清除校验和。严格解析覆盖master及21个include，已应用历史不被重定义。

随后同一完整CI Maven入口实际36类121/121、失败/错误/跳过均0，83秒，receipt五项全部通过且重复键警告0。Surefire XML独立汇总与修复后152输入比较均通过。嵌入库是PostgreSQL14.15；JMS/Fineract用受控测试替身，故仅属当前单元/合同/隔离集成，不是PG18.6或真实银行验收。日志中的预期业务冲突、Mockito未来JDK提示未掩盖或为清零扩大修复。

全部证据复用D:/Agent/.codex-temp/banksystem-rf065/8e15a6cd7f124d60b26b2db4a0297361/java-current-20261106-01：maven-r1.log、before-j4/、maven-j4-red.log与receipt-j4-red.xml、checksums-before.log/checksums-after-complete.log、maven-j4-green-full.log、surefire-summary-j4.json/suite-totals-j4.json/source-comparison-j4.json。首个after预览截断未作为完整比较证据，原日志保留。复审核对的是实际输入/解析及XML，而非本文119/121数字；本片进入REVIEW，最终发布门仍NO_GO。

收尾仅盘点此输出目录：1451文件/90342923字节（包含嵌入PG既有本机工具缓存），单文件均小于1GiB；保留必要前像、红/绿及解析证据，删除/隔离0，不新增备份或清理实验。原15银行容器ID/运行集合与基线相等，Harness56748/MCP50704/Worker38832及站点55848仍为原PID，无原库/日期动作。

## 业务目标

在面试修复已接通CI入口后，以当前源码实际运行完整registered及原coverage门，发现并修复剩余消费者接缝。此包是最终候选前的源码集成证据，不是远端CI或正式28项。

## 2026-11-06：依赖及容量增量后的整套复验

旧839/839是依赖升级前证据；当前根/Controller SDK1.32.0、Zod4及HTTP修补只验证过88个消费者，RF064又增加补充容量驱动和第112个注册文件，需要收齐当前状态整套门。沿同一任务包和既有source-snapshot复用独立依赖/工具，不另克隆或重装原运行库。实际状态由backlog的BANKSYSTEM-RF065-POST-DEPS-REGRESSION-20261106记录，旧任务REVIEW与失败日志不改写。

微观步骤：①用现有prepare-ci-scan.py将当前受控源复制到既有banksystem-rf065/8e15…下新current-source-20261106目录并实际Gitleaks；核九组manifest/lock、已安装SDK及ZIP字节，未匹配先停，不把旧安装当当前候选。②按生成清单只同步变动/新增公开源到同一source-snapshot，不共享可写node_modules；若有已证实删除的旧干净副本，先核原路径和字节归属再同卷可恢复隔离，不移未知改动。③在候选进程清除BYOK及原平台环境，执行build/typecheck/lint/check:tests/test:registered/test:coverage；完整日志写verification-postdeps-20261106.log，不覆盖旧r2。④从失败证据确定具体来源后才扩最小修复白名单；最后复审、核原环境与当前源覆盖边界，未满足门不标完成。

白名单仍为本包、RF065 tasks/S3.md/evidence-index.md、唯一顺序/backlog；生产源码只有实际失败后才追加。隔离同步和测试日志是自有验证产物，不创建运行时Mock、新模型、原银行操作或最终身份。安全版本选择和依赖门仍保留；即使整套源码门通过也不证明候选镜像、正式28项、真实容量或远端CI通过。

### 2026-11-06复验与验收导向复审回执

完整首轮两处陈旧合同失败保留后，新增独立RFC3339反例实际以仅到分钟的值复现红灯（c8-red-20261106.log）。用既有生成器在当前隔离依赖生成：OpenAPI仅19个时间模式及一处等价nullable表示（21个叶差异），metadata仅22个时间模式及一处等价nullable表示（24个叶差异）；无路由、权限、操作ID、业务字段或生产校验变化。既有生成器--check均通过，实际浏览器客户端生成类型检查AGENT_API=PASS，定向两个注册入口19/19通过（c8-focused-20261106.log），不把包装器内部测试重复累计。

随后verification-postdeps-r2-20261106.log从build开始实际重跑六步，终态退出0/POSTDEPS_R2_SOURCE_GATE=PASS。当前112文件登记/108个CI文件/2个既有受控运行时文件/2个历史文件口径不变；registered841/841，失败/取消/跳过0，325.588秒。覆盖进程138项中137通过、1项既有Stage9外部CLI排除，70.489秒；该集成已在完整registered执行，无新增排除。覆盖率lines59.80/branches74.37/functions62.53，达到原50/70/60。未用先前839或首轮838通过替代当前结果。

复审核对时间仅为输出、Harness由既有nowIso统一生成完整UTC秒；null/字符串游标仍被接受，数字仍拒绝，完整秒/小数秒正例和缺秒/时区缺失/非法日期反例覆盖冻结材料与实际生产schema。冻结一致性断言、版本、命名空间和字节预算均保留。全套后逐个比较原2637个执行源，只有上述4个明确C8文件不同，0无法解释的源变化；历史发布派生字节仍由两个原门确认不变。旧四文件前像在before-c8-20261106保留，原工作区安装库未替换。

protected-postdeps-after-20261106.json证明原15银行容器名称/ID集合相同、全运行、0 unhealthy；Harness/MCP/Worker仍56748/50704/38832，H1c76996e…ca3e94d不变，六表仍1151/1205/58/106/0/0。未运行模型、业务写入、银行重启、身份冻结、提交或推送。本增量仅移交REVIEW，安全待选/许可L3、最终候选与统一身份、正式28项及补充真实容量、远端CI和本人UAT仍未闭合，整体NO_GO。治理/docs与最终当前受控源码秘密扫描结果由同一证据索引登记，不增加路线或豁免。

## 输入与输出

输入为main@e67fd4c保留脏树、111项登记清单、Node20.20.2/24.19.0、现有隔离源码验证脚本。输出放D:/Agent/.codex-temp/banksystem-rf065/8e15a6cd7f124d60b26b2db4a0297361及本包回执，源源码与原环境不动。原运行身份为1c76996e…ca3e94d，当前清单源码身份为95e955fb…cd28dc7；不为本包重冻或重载。

## 实现

1. 核对当前依赖/锁及目标归属，复制现有四组依赖和固定Node/浏览器/媒体到自有独立目录，不共享可写依赖，不宣称验证了冷下载。使用既有verify-ci-source-snapshot.ps1复制公开当前源码；不复制原.data、凭据或生成证据。
2. 在该快照执行build→typecheck→lint→check:tests→test:registered→test:coverage；测试进程移除模型配置，只有本地合成模型和自有临时数据库。失败保留原回执，先定源再补具体路径与修复，不加忽略/重试、不降低50/70/60覆盖率门。
3. 复审当前改动、原服务/执行状态和新增输出；更新本包、RF065索引与backlog，不提前关闭RF065或改变GO。

白名单为本包及既有RF065控制/证据、唯一顺序/backlog、已有scripts/deploy/verify-ci-source-snapshot.ps1；生产源码如实测失败需修复，先在本包追加精确路径。当前预算15改动文件/1新文档/900行、0合同/0迁移。隔离运行文件为验证产物，不计源码预算。

### 已观测失败C1：DPAPI能力探针仍依赖旧文件会话

首轮完整测试的agent-release-decision.test.cjs真实报AGENT_RELEASE_DPAPI_RESTORE_FAILED。源码确认：F04后EncryptedSessionStore必须注入Harness持久化，而旧runDpapiRestoreDrill仍用root构造并读取.hzs文件，错误来自会话存储合同迁移遗漏，不是DPAPI或原银行故障。精确增加P/scripts/i10-agent-release-decision.cjs与P/scripts/verification/agent-release-decision.test.cjs（P为平台目录）。

修法只保留该函数既有DPAPI能力检查职责：调用现有defaultDpapi加密纯合成随机探针，临时密文由新的同用户Node进程解密并比较摘要；不创建会话、不新增文件状态源，不把此能力检查冒充Harness会话恢复或当前28项发布门。保留原退出失败，真实子进程反例/回归通过后再同步隔离副本并重跑完整门，不新增CI排除。

### 已观测失败C2：模型边界包装器固定20项

首轮controller-runtime-adapters包装器子进程退出0，仍因旧pass20文本断言失败。精确追加P/scripts/verification/controller-runtime-adapters.test.cjs，使用上一包已验证的assertTapSuccess和显式TAP；保留子进程非零拒绝，要求实际有效测试全部通过，禁止改成新的固定数量或跳过此文件。

### 已观测失败C3：旧数据迁移反例固定最终版本44

首轮journey-evidence-verifier的真实旧库升级保留测试在45!==44失败。043的DSL迁移、外键与不可变保护断言均保留；精确追加P/scripts/verification/journey-evidence-verifier.test.cjs，仅将终态版本改为独立读取当前迁移文件集合并核对SQLite登记的完整版本列表与最大值，不删除045或用宽泛大于等于通过。

### 已观测失败C4：仓库归属比较混用Windows短/长路径

首轮Stage9只读根目录发现将TEMP的8.3短路径与git返回的长路径直接path.relative，误报PRODUCT_OUTSIDE_GIT_ROOT。精确追加P/scripts/i10-stage9-portable.cjs及P/scripts/verification/release-toolchain-integrity.test.cjs。两边先经真实文件系统规范化再比较；保留真实仓库外目录拒绝，不改打包、Flowise或运行状态，也不执行旧发布流程。

### 已观测失败C5：复制的已安装ZIP依赖与当前锁/补丁不符

首轮四个ZIP安全用例失败。当前runtime/package-lock.json明确绑定file:../vendor/extract-zip，原已安装包却仍含上游get-stream依赖及未补丁index.js：vendor SHA256为f0854384…ed33e6c，已安装包为1073ca81…89cddd78。此为实际依赖安装漂移，不能将源补丁已审等同当前运行库已修。

在自有runtime-locked-install新目录只复制当前runtime的package/lock和vendor包，固定Node20/npm10按CI的ci --install-links --ignore-scripts重新安装，registry为官方npm、cache及空用户配置限该目录。不触碰原在用node_modules；新依赖单独验证ZIP正常/恶意输入和完整回归后才进入最终候选接线。原原生告警及此次失败保持，不增加豁免或伪造上游版本；最终原Agent运行库的部署仍须与统一冻结/受管重载一起收口。

### 已观测失败C6：Worker闭包反例漏列两个既有消费文件

首轮四项Worker身份测试因35!==33及完整成员列表不符失败。实际静态导入与当前共享manifest均已包含dist/harness/src/i8/page-observation.js和worker/src/i10-vision-readiness.cjs；仅独立测试清单仍旧。精确增加P/tests/i10-release-identity-worker-set.test.cjs，把两个已存在消费文件加入路径排序的独立期望；继续验证未知文件/漏成员拒绝、逐字节哈希与健康身份，不修改生产manifest或删除闭包约束。

### 已观测失败C7：依赖扫描覆盖比较未统一真实路径

现有CI四组Python合同中，scan9项和dependencies3项通过，dependency_scan的48项里两项因ERROR!=PASSED/FAILED失败。预期锁路径调用Path.resolve而OSV返回路径只替换分隔符，当前TEMP短/长路径差异被误判缺覆盖。精确追加scripts/deploy/scan-ci-dependencies.py和scripts/test/test_ci_dependency_scan.py（已在批次scripts白名单）。先用真实同一文件的路径别名及重复扫描结果正反例复现，再统一规范化两侧路径；重复结果仍保留并报ERROR，不可由字典覆盖掩盖。原退出码、缺覆盖及未知文件拒绝不变；这是当前source-engineering合同门，不冒充真实漏洞扫描。

### 已观测失败C8：安全依赖升级后的两份冻结合同陈旧

2026-11-06复验的build/typecheck/lint/check:tests通过，完整registered为840项、838通过/2失败/0跳过（379.576秒）；verification-postdeps-20261106.log保留原始失败，coverage未启动。两项均为冻结合同与实际生产者不等：Agent OpenAPI及Harness workbench-metadata。隔离安装确认Zod4.6.6；新生成器遵循RFC3339，带Z的时间必须包含秒，而旧冻结模式允许仅到分钟。另一个差异是nullable字符串从anyOf改为等价的type数组。应用实际输出均为toISOString完整UTC时间，时间字段不属于客户端业务输入；没有发现路径、认证、操作ID或业务字段变化。

追加精确白名单：contracts/openapi/agent-workbench-api.yaml、P/contracts/mcp/workbench-metadata-v1.json、P/agent-cli/test/workbench-http.test.mjs、P/scripts/verification/workbench-persistence.test.cjs。本增量最多4文件/150行、2份生成合同/0迁移；批次合同预算从0细化为2，不改变银行公开接口或实际持久数据。用既有两个生成器在按锁安装的隔离候选生成，再机械同步权威源码；不改生产校验、不添加正则兜底、不删除冻结一致性断言。独立补充完整秒/小数秒UTC接受、缺秒/无时区/非法日期拒绝及null/字符串cursor消费，先保存旧冻结差异红灯，定向复验后从build重跑六步，失败日志不覆盖。

## 项目易错点

完整测试不能在保留环境直接启动，历史作者化测试可能写派生文件。Node20原生SQLite与Node24覆盖/CLI不得混用；覆盖报告错误不能通过切换失败后备用工具处理。测试专属副本没有BYOK或原账务状态；本包不做银行动作或新增端口服务。

## 验证与完成门

STATIC/CONTRACT/INTEGRATION：实际执行现有隔离源码脚本并收齐六步退出码；完整清单无失败，coverage达到既有阈值，未改变历史发布派生源。RF065治理与docs通过。记录快照位置、候选源码边界、实际通过数及耗时，不用定向15项结果替代完整门。

LIVE_E2E：本包不执行。运行绑定、原15银行容器ID/运行状态与Harness执行表计数保持；当前源码身份变化进入最终冻结待办。完整验收导向复审后只将本包转REVIEW，不手动提升整体GO。

## 实施与复审回执（2026-11-05）

首轮隔离源码2627文件，build/typecheck/lint/check:tests通过；完整registered实际838项、826通过/12失败、0跳过，671.525秒。失败分别为C1一项、C2一项、C3一项、C4一项、C5四项、C6四项。verification.log保留该原始非零结果，coverage按既有串行入口未执行。

定向结果：C1的agent-release-decision15/15（含新进程解密失败反例）；C2适配器包装器1/1；C3选定旧库迁移1/1、其余23项明确未选中；C4选定目录发现1/1、其余6项未选中；C6完整Worker身份12/12。C5固定Node20/npm10.8.2、新空cache按锁安装294包成功（20秒），实际安装index.js与vendor SHA256一致；候选runtime-dependency-security5/5（含真实FFmpeg解码）。这些是各自定向证据，不合并宣传为完整套件成功。

在确认首轮自有Node进程全部结束后，旧候选runtime依赖保留为runtime-node-modules-before-c5，新按锁依赖接入同一自有源码副本。七个被修文件的旧字节保留在source-before-c1-c6；从权威仓库同步修复后，以verification-r2.log从build开始重跑完整六步，终态退出0/RF065_R2_SOURCE_GATE=PASS。registered839/839、失败/取消/跳过0，438.535秒；覆盖率59.80/74.23/62.02达到既有50/70/60。覆盖进程138项中137通过、1项已声明跳过：progress的外部Stage9 CLI集成不进入模块覆盖分母，该项已由Node20完整registered实际执行；不是新增排除或忽略失败。隔离副本内既有发布派生文件字节检查不变。

C7新增同文件路径别名及重复结果两个红灯先被实际复现；修复后在原仓库及同步两文件的隔离副本执行现有工程四组合同，分别9/3/50/16项通过。旧字节保留source-before-c7，完整输出为source-contracts-r2.log。它们验证真实结果生产/回读边界，不代替新的Gitleaks/OSV实扫。

验收导向二次复审核对DPAPI新进程失败传播且不写会话、目录真实越界仍拒绝、迁移全版本登记及不可变保护、Worker独立成员清单、重复扫描结果保留并报ERROR。候选与当前源码v4比较另外发现58个bankProduct输入差异，全为本包未构建的dist-agent、Storybook静态输出及tsbuildinfo；其余身份组一致。本包只证明Agent源码门，不宣称全产品构建身份相同；最终须统一构建再冻结，不能复制旧生成物或删身份输入求相等。当前实测源码摘要8adebfcc…fd92e7f18，候选为00a41377…dfa3a01，均未作新LIVE身份冻结。

原在用runtime/node_modules/extract-zip仍是已识别旧安装；本批未替换或重载它。最终部署必须按当前锁安装/核验，并与新身份和受管重载一起复验，不能挪用候选的ZIP结果证明原运行库。原银行数据/日期/卷无操作；外部面试站已同步当前S5、CI接线和持续收尾目标，结构构建及5项个人记录隔离测试通过，不替本人签收。

本阶段末只读复核：原15银行容器ID/运行集合一致、0 unhealthy；原Harness/MCP/Worker分别56748/50704/38832仍存活且绑定不变，六表计数1151/1205/58/106/0/0与前置快照一致。新增输出此前检查为64891文件、2423659869字节（2.257GiB），后续仅小型源码前像/日志；均属活跃候选、首错前像及隔离安装cache，当前复验有消费者，原地保留；没有删除/隔离，实际回收0。治理/docs及diff --check通过，本包按agent目录规则移交REVIEW；RF065安全/许可、完整构建候选、正式28项、远端CI和整体GO仍未关闭。
