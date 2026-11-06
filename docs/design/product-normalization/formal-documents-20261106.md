---
id: A08-FORMAL-DOCUMENTS-20261106
title: 七类规范文书源稿与生成验收
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# 七类规范文书源稿与生成验收

## 业务目标

让维护者和面试评审能从立项、需求、设计、测试、部署、验收和交接材料中理解同一产品、现状与未完成项。文书不改变产品合同、实施顺序、运行事实或发布判定。当前main@e67fd4c保留脏树；源码门通过不等于产品GO。

## 三个小任务

1. D1 事实对齐：核对RF057清单/驱动、RF064容量与用户验收、RF065最新回执。delivery和acceptance中的10月“当前”改为明确历史；当前源码841项、依赖/镜像阻断、未冻结最终候选和远端CI分别记录，不把旧S5作为当前28项。
2. D2 源稿收齐：沿documents/catalog.yaml保留七种类型，新增独立handover源稿，补现有设计/测试/部署/验收的可操作内容及证据入口。日期、证据级别、执行与发布语义一致；人工贡献/UAT不代填。目录DRAFT_LOCAL仅表示源稿，不表示已生成或验收。
3. D3 生成验页：现有build_bank_project_document.py经只读核实仅生成待填写模板，不能消费当前Markdown；在同目录增加export_normalization.py，直接导出明确指定的当前源稿，保留原模板功能。使用文档技能的捆绑Python/Node，不安装新库；源稿的标题/段落/列表/代码块/比较表是实际消费者范围，不新增通用文档平台。生成件只入ignored deliverables；DOCX必须经规范渲染器逐页PNG实看再交付。没有渲染能力时允许保存明确的未验页草稿和结构核对，不输出为合格交付。

## 路径与边界

白名单为本包、docs/design/product-normalization/{delivery,acceptance-and-handover,verification,system-design,README}.md、新handover.md、documents/{catalog.yaml,README.md}、scripts/documents/export_normalization.py、RF064的batch/slices/S4.yaml/tasks/S4.md及evidence-index.md、唯一顺序和backlog；外部面试站仅README.md追加资料进度，不改前端、服务或个人笔记。按已观测模板缺口细化预算18文件/3新增/1000行，0合同/0迁移。既有模板生成器只读复用，不直接扩写或用其旧模板替代七类新稿。

## 项目易错点

原delivery把2026-10-09/12多轮局部结果并列写成“当前”，原acceptance仍将P05标为未实现；它们不是当前事实。当前正式清单是28项，不是历史Full18。DOCX排版成功、源稿完成或本机服务健康都不能改变Harness发布结论；原凭据、账务数据和个人笔记不进入文书。

## 验证与完成门

STATIC：逐项核对七源/类型/链接与当前命令、RF064治理、docs及diff检查。文书涉及的事实从现有原始回执验证，不为写材料再跑银行或模型。D3需实际七份DOCX/渲染PNG、所有页视觉与内容审查；未满足不得将整包移交REVIEW或将catalog标为已渲染。最终候选资料与当前身份正式28项、真实容量、远端CI、UAT分别保留待办。

## 工具前置核对

2026-11-06用户已明确改用现有签名有效的Word独立只读导出，再用捆绑PDF工具逐页验图，覆盖下方旧渲染阻塞。仅打开本任务七份DOCX，不加入最近文档、不保存源文件或修改Office配置；确认新Word实例不属于原有进程，遇激活/安全提示停止该步骤。单主屏已检查，默认隐藏导出，无其他用户窗口移动。此为渲染方式授权，不是文书内容或产品验收的代签。

2026-11-06通过codex_app的workspace依赖入口实读26.1104.11149：捆绑Python含python-docx/pdf2image/pypdf，但native目录无LibreOffice，override目录只有native-executables.json，fallback只有pnpm。现有文档技能要求使用捆绑LibreOffice，不能替换为用户桌面Office；render_docx.py的Windows系统PATH分支不改变该上位要求。前置检查时未创建DOCX；后续仅按实施回执生成未验页草稿。未安装新软件、未修改插件/全局环境、未启动Office。D3的视觉验收等待受支持的捆绑渲染能力或用户明确改变生成方式。

## 实施与复审回执

### 2026-11-06 用户授权Word后的真实验页

最终收口：六份已验页文件不改；立项五条比较记录改为同属性小节后重导出，6页全部实看通过。最终集为测试4、部署4、交接4、立项6、设计6、需求7、验收4，共35页，7/7验页通过；标题/行/列宽/引用及内容检查完成，无裁切、重叠或缺字。最终文件入deliverables/normalization-20261106/verified-local，均与各自实际只读Word渲染源SHA相同，未通过复制旧渲染去证明变化后的正文；原稿与所有失败前像保留。final-document-review.json记录各实际源/PDF/页数，未将用户或机构签收写为完成。catalog当前verifiedDocuments=7/docxDelivered=true仅表示本地草稿交付，本任务交REVIEW；以下6/7为同日修复前历史，产品仍NO_GO。

复审核对七文件共293,789字节，Title无边线、所有保留表格有不拆行与表头标记；最终已无长四列叙述比较表。原15银行容器与四个Agent/站点进程保持，Word进程0；RF064/RF065治理、docs和站点12项/静态构建通过。仅当前规范资料与自有候选输出改变，无银行/模型调用或外部发布。

末轮续页问题只涉及research-and-charter.md的长叙述四列比较表，补该既有源稿到本任务精确白名单。只读Word确认其表头标记与不拆行属性确已启用，补grid宽没有改变实际渲染，因此撤去该无效代码增量；将这五条同属性记录机械改为五个小节和原属性段落，来源/推断/成本事实及引用不变。此为文书已观察的排版修复，不另建研究、改变PRD或修改其它六份已验页DOCX。

签名有效的Word16.0采用每轮新实例、七源只读打开、不加最近记录、导出PDF后不保存并退出；各源DOCX前后SHA相同。PS5脚本执行策略拒绝发生在Office启动前，没有更改策略；随后使用现有PS7/STA正常执行。首轮工具错误误用不存在的Application.Hwnd，自有空Word实例经PID/启动时刻核对后关闭，没有移动或终止用户窗口。未遇激活或安全提示，未安装软件或修改Office配置。

捆绑Python/Poppler完成每页110dpi PNG。真实渲染发现Title继承蓝色段落边线、表格行断开、首列将书名挤碎、孤立表头和单独引用尾页；只改既有导出器的标题样式、行/表头联动、已知ID列与文本列宽及9.5pt次要引用排版，正文仍11pt。验收源稿同步当前PG132/14/118与MQ6.3.3的62项风险，资料验页与本人签收继续区分。中途错用源稿文件名的失败只影响自有输出，按catalog更正，未覆盖原件。

最新七份为deliverables/normalization-20261106/word-reviewed，自有证据在formal-documents-20261106-01/word-reviewed；页数依次测试4、部署4、交接4、立项7、设计6、需求7、验收4，共36，已逐页实看。六份无裁切/重叠/缺字并通过，立项报告第4页对照表续页仍未重复表头；仅此文书继续修排版，catalog verifiedDocuments=6/docxDelivered=false，本任务仍IN_PROGRESS，不交REVIEW。以下“未验页/缺渲染器”段落只保留此前过程，不覆盖本节；局部文书通过不能改变产品NO_GO。

D1/D2已完成：现有立项/PRD保持已确认需求；设计、测试、部署和验收源稿升至1.1并明确11月6日边界，另补独立handover源稿。目录七类型均映射不同的真实文件，DRAFT_LOCAL为材料状态；841项源码门、旧身份S5、安全余项及真实28项/容量/远端CI/UAT分别表达。删除的是陈旧“当前/尚未实现”汇总，不删除原RF历史失败或运行记录；没有改变正式清单、发布算法和产品代码。

D3源稿导出已实现，未关闭验页门。捆绑Node的mark_artifact_operation_started以7份DOCX执行一次且退出0；捆绑Python从七个当前源稿实际生成七份草稿，合计292882字节，位于ignored deliverables/normalization-20261106。原模板保持不变，新入口只用已捆绑python-docx及标准库，无新依赖安装；明确拒绝覆盖、非规范源目录和deliverables外输出。三项实际边界反例与七份内容/标题/比较表回读通过，不把结构检查当视觉验收。

首次内容检查发现设计稿未在正文明确NO_GO，已补源稿并重生成，原未验页设计草稿留存在本次自有scratch作为前像；其它六份不重复生成。最终所有稿保留关键目标/金额/状态、引用与未完成事实，无空模板待填写标签或Markdown围栏泄漏。独立于起草的复审按当前suite的28个标题、最新postdeps-final及RF057/RF064索引核对关键结论，没有将模型/浏览器合同写成LIVE或将资料准备写成本人贡献。

规范render_docx.py在仅含捆绑工具的子进程PATH中实测失败，FileNotFoundError明确缺soffice，page PNG为0；没有调用桌面Office或启动可见窗口。实际回执为D:/Agent/.codex-temp/banksystem-rf065/formal-documents-20261106-01/draft-checks.json、render-prerequisite.log及设计前像，原始失败保留。七份DOCX仍为未验页草稿，不作为合格文件交付，catalog的verifiedDocuments=0/docxDelivered=false。本任务因D3工具前提保持BLOCKED，RF064-S4整体不完成。

外部面试站本轮只追加README事实说明，无前端/后端更改、无读取或写入原个人笔记，不声称网页资料区已接入文书下载。原银行/Agent进程、数据/卷/日期无操作，不运行模型、正式28项、身份冻结、提交或推送。RF064治理、docs、源目录映射及diff检查作为本轮静态出口；恢复受支持捆绑渲染能力后仍须逐页实看，不能直接移交REVIEW。

同日重新通过当前mcp codex_app入口核工具包，版本仍26.1104.11149，native只有git/jxrlib/libheif/poppler/powershell，override无soffice，未发现捆绑渲染器。只读另核机器已有Microsoft Word16.0.20527.20112、签名Valid及Automation注册，也存在桌面LibreOffice；没有启动两者或改Office设置。文档技能明确禁止拿桌面Office代替其捆绑渲染流程，已询问是否由用户明确改变为现有Word独立只读导出加捆绑PDF逐页验图；未答前不执行，不重复相同缺失渲染失败、不生成重复七草稿。七份仍未验页、verifiedDocuments=0，原BLOCKED保持。
