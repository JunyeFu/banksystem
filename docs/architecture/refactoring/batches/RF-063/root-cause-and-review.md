---
id: RF063-ROOT-CAUSE-REVIEW
title: RF063 root causes, repairs and independent review
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-02
owner: Codex
---

# 根因、修复及独立复审

这份清单回灌RF063，不新建实施顺序或第二任务状态源。证据见 [索引](evidence-index.md)。`已修源码`不表示完整产品验收完成；总体NO_GO。

## 逐项根因与效果

| 项目 | 已确认根因 | 当前修复和复审 |
|---|---|---|
| M01 | 贷款提交硬编码amortizationType1，丢失客户选择 | 端口命令接收repaymentMethod，等额本金0/等额本息1；HTTP合同验证两种请求。已修源码 |
| M02 | 把monthly interestRatePerPeriod作为年率展示 | 优先annualInterestRate，否则按明确频率换算；缺频率失败而不猜。4.35及月率换算用例通过。已修源码 |
| M03 | 端口limit24截断允许480期的贷款 | 删除截断，480期回归通过。已修源码 |
| M04 | 键值手工拼接JSON字符串 | 使用ObjectMapper序列化Map，特殊字符不破坏审计载荷。已修源码；真实业务集验证幂等与异体请求冲突 |
| M05 | 同类调用绕过@Transactional代理 | 显式TransactionTemplate，仅本地持久化包事务；嵌入式PG第二条差异写失败时run与difference都回滚。已修源码 |
| M06 | 原总账核验只读转账及本地会计投影；演示核心产品accountingRule1且journalentries为空 | 新现金会计产品与账户3/4已通过Fineract API建立，关联储蓄实体/账户/流水/币种核借贷及控制科目，明确排除未启用会计的旧历史。10月7日新基线业务14/14证明当时镜像；当前源码最终身份仍待正式重验 |
| M07 | 同一EOD键允许另一日期执行 | 注册时拒绝日期变化，执行使用保存日期。409/不调用核心回归通过。已修源码 |
| M08 | 贷款提交领取权结果被忽略；还款直接网络命令，没有本地操作状态或未知回读闭环 | v16持久操作绑定application/key/command/amount/date/correlation，领取胜者单次POST，未知仅回读；完成、审计及outbox同一短事务。提交externalId回读核客户/产品/本金/期限/利率/方式。隔离PG验证唯一领取、异体冲突、未知不重提、审计失败回滚；当前身份真实贷款验收仍待重跑 |
| M09 | 创建转账及EOD对账将远程读取放入本地事务 | 转账所有权校验与对账事实读取在外；本地写入显式短事务。对账失败事务回归及真实黄金转账通过。已修主要路径 |
| M10 | Controller组装WHERE/ILIKE，Repository公开接受SQL片段 | TransferRepository.Filter为具体筛选条件，Repository独占SQL；Controller helper删除。已修源码 |
| M11 | 核心作业执行后、checkpoint前崩溃会再执行 | v17保存提交前核心job version，唯一新增application/success历史才允许checkpoint；缺失或歧义保持INTERRUPTED且不重提。HTTP合同与隔离PG恢复测试通过；保留环境不执行推进日期的EOD，不声称真实日终已验收 |
| M12 | LOCK_DATE步骤无真实银行写隔离 | 共用共享/独占会话锁，RUNNING/INTERRUPTED阻断资金写，并将贷款在途状态加入日终准入。10月8日反例确认贷款submitToCore漏接屏障：日终锁期间仍POST；已补共享lease覆盖领取/网络/落地，阻断零领取零POST、异常释放及未知不重提测试通过。该最新修复尚未入运行镜像 |
| M13 | 模型生成businessInputs直接标USER_CONFIRMED | Harness写入前核对所有金额/币种/收款引用等是否明确出现在用户目标，阻止凭空金额及100/1000误匹配。测试8/8；仍非自然语言歧义消解或独立意图证明，不扩大完成声明 |
| M14 | Quality releases固定空、releaseGate固定PENDING，缺正式发布结果入库生产者 | 根据SQLite runs投影身份与失败状态，当前失败BLOCKED；有通过仅DRAFT，hash缺失为null。OpenAPI/生成类型同步。正式清单验证结果入Harness及READY/RELEASED闭环仍未完成 |
| M15 | 提前还款按钮没有动作 | 禁用并明确标“暂未开放”。修复可操作性误导，不宣称提前还款业务已实现 |
| M16 | module registry偏离代码，风险↔支付及运营编排边界混用，Flowise历史被标产品必需 | EOD Controller迁operations；RiskApprovalService应用事务组合风险决定与支付转换，风险域不依赖支付；两条ArchUnit规则通过，登记实际依赖；Flowise标DEAD_CANDIDATE且保留历史。已修源码 |
| M17 | demo verify接受命令却无实现，RF057汇总INCOMPLETE仍可能退出0 | demo verify输出当前清单NO_GO/明确缺门且退出5；RF057汇总未完成始终退出5。完整当前身份/产物/清理验证器仍未实现；这是失败语义修复，不是正式发布验证完成 |

## 新观察故障：Gateway静态地址耦合

定向替换容器后黄金链SEED_FIXTURES返回404。Test Support直连路由存在，Gateway使用没有resolve的upstream；容器重建改变地址且旧地址被复用。Nginx现用1.27.5支持开源动态resolve。加入Docker DNS resolver与共享zone/resolve，nginx -t后reload；同一起点重跑黄金链完成、交易65。这条修复有运行反证闭环，不靠健康检查推断。

实现依据：[Nginx upstream resolve文档](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)。未变更公开路由、角色、凭据、端口或卷。

## 已解决的账务基线与剩余门（2026-10-08）

1. 保留已有核心账户和历史转账；不能删账、直接数据库补分录、把本地投影改名为核心总账，不能为验收推进业务日期。
2. 新演示账务基线已获授权并落地：现金会计产品、新合成账户3/4、旧历史保留并明确覆盖范围；无需重新选择基线或伪造回填。
3. M08/M11及M12补漏的源码和隔离测试已落实；Java21最终108项通过，Docker恢复后最新M12修复已进入Channel/Test Support镜像，新黄金链交易73通过。后续由当前身份RF-057回填完整运行结果，不以旧交易65/68作为最新修复的验收。
4. 完成M14/M17当前正式清单验证生产者→Harness SQLite→Quality，只在同一身份下具备全部受检产物/清理/真实性证据时准许GO。
5. 最后构建并冻结新身份，再从正式清单起点执行真实银行、真实BYOK及压力性能；首次确定性失败停止本轮验收。修复未完成前不激活身份、不续写旧成功证据。

## 整体可用性

历史B13失败已由现金会计基线修复并获得当时业务14/14；不覆盖最终身份。10月8日初始Linux引擎管道不可用，随后用户启动Docker，原服务恢复，定向替换Channel/Test Support及新黄金链通过；当前Docker阻塞解除，未清理socket或卷。Agent仍STALE_SOURCE/NOT_RUNNING，发布验证、压力性能及独立最终复审未闭合，整体NO_GO。用户授权可自主细化及实施，无需逐包再次批准；LIVE仍核对最终身份的既有授权入口。
