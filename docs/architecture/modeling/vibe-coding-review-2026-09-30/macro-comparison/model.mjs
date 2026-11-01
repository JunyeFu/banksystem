// Macro business views. Desired capability is not a LIVE completion claim.
export const capabilities = [
  {group:'客户核心业务 / Customer Banking', items:[
    ['客户身份与会话','PKCE / 归属映射','会话刷新一致','PKCE / 映射已实现','按当前身份验收','implemented'],
    ['账户与流水','核心余额 / 明细','只读权威事实','五端口读取核心','渠道不伪造余额','implemented'],
    ['支付与收款人','受理 / 风险 / 入账','幂等与未知结果','主转账链已形成','入口职责仍混合','partial'],
    ['贷款与还款','申请 / 审批 / 核心','条件与单位一致','方式 / 年率有偏差','还款控制不完整','gap']
  ]},
  {group:'运营与治理 / Operations', items:[
    ['风险与复核','决策 / 双人复核','版本约束','行锁 / maker-checker','与支付类型双向依赖','partial'],
    ['运营文档','上传 / 下载 / 状态','版本冲突 409','文档状态机已形成','审计同事务','implemented'],
    ['账务对账','渠道 / 核心 / 总账','独立事实源','总账比较来源不足','手工事务有缺口','gap'],
    ['日终编排','固定日期 / 检查点','未知结果可收敛','有协调与数据库锁','日期 / 恢复窗口','partial']
  ]},
  {group:'共享支持业务 / Supporting Capabilities', items:[
    ['审计与监控','业务变化可追溯','审计链 / 查询','审计模块与投影','不替代主业务正确性','implemented'],
    ['通知与对账单','客户结果可回读','客户归属隔离','通知 / 回执 / 账单','依赖客户查询模块','implemented']
  ]},
  {group:'CLI 测试 Agent 产品 / Test Automation', items:[
    ['测试规划','目标转为受控候选','输入意图保持','真实 BYOK 规划','推导值标用户确认','gap'],
    ['任务与浏览器执行','MCP / Harness / Worker','观察 → 动作 → 核验','真实浏览器链存在','显式银行 adapter','implemented'],
    ['证据与发布','同身份验证与判定','统一 verify 入口','证据链已有实现','demo verify 未实现','gap'],
    ['只读质量门户','真实运行 / 失败 / 发布','无第二控制面','大部分 SQLite 投影','发布页仍为空','partial']
  ]}
];

export const modules = [
  ['payments','支付','bank.payments'], ['risk','风险','bank.risk'],
  ['operations','运营/EOD','bank.operations'], ['audit','审计','bank.audit'],
  ['reconciliation','对账','bank.reconciliation'], ['customerprofile','贷款','bank.customer-profile'],
  ['documents','文档','bank.documents'], ['notifications','通知/账单','bank.notifications'],
  ['identity','身份/查询','bank.identity'], ['beneficiaries','收款人','bank.beneficiaries'],
  ['accounts','账户','bank.accounts']
];

