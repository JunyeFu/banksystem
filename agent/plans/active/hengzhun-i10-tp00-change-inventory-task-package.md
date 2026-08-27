# Hengzhun I10 TP-00：变更盘点、分批审查与源码冻结准备

- 状态：`COMPLETE`（2026-08-24 独立复核）

## 任务边界

- 只盘点、分组和校验当前工作树，不修改业务行为。
- 不启动 Harness、Worker、MCP 或 Flowise，不执行 LIVE_E2E。
- 不暂存、不提交、不推送、不发布，不删除任何用户文件或运行产物。
- 本包完成不表示 ReleaseIdentity 对齐、18 链验收通过或具备上线资格。

## 业务常识

银行自动化平台的发布必须能把每个运行行为追溯到源码、迁移、生成器、合同和测试。Harness、Worker、MCP、Flowise 图或迁移任一项单独冻结，都会产生“代码已更新但证据仍属于旧实现”的错误结论。运行截图和浏览器报告可能含页面数据，它们只能隔离保留，不能混入源码批次。

## 当前基线

- 分支：`main`
- TP-00 开始时 HEAD：`9d79b7c1e6cfedd995093cc7a378dc8e9218fa98`
- TP-00 开始时文件级脏树：177 项
- 已知完整性问题：`stage8-terminal-evidence.test.cjs` 一处行尾空白；本包仅清除此机械缺陷。

## 落地批次

| 批次 | 所有权 | 评审重点 | 独立回滚边界 |
|---|---|---|---|
| B00 | 治理与 CI | 权威顺序、测试登记、历史/当前证据分离 | 计划、CI、验证工具 |
| B01 | Flowise 供应链 | 声明/锁定/安装/审计一致 | Flowise package 与审计门 |
| B02 | Agentflow 发布物 | builder 与生成物可重现、测试只读 | builder、图、布局、manifest |
| B03 | Harness/Journey 合同 | 精确业务绑定、迁移、ONE_TIME、SSRF | Harness、MCP、合同、037-039 |
| B04 | Worker 执行安全 | fencing/heartbeat、原子制品、截图隔离 | Worker 与 worker identity 集合 |
| B05 | 验收证据 | 18 链计数、重试语义、LIVE 分层 | acceptance/Stage8/OCR 工具 |
| B06 | 发布与质量工具链 | ReleaseIdentity、Stage9、只读测试、密钥扫描 | 发布/生命周期/质量脚本 |
| X01 | 运行产物隔离 | 不读取内容、不提交、不删除 | `midscene_run/` 原样保留 |
| X02 | 用户复核 | 未确认个人工具不进入产品提交 | `.pi/` 原样保留 |

机器可读规则和每个批次的业务常识、易错点、复核命令及回滚边界见 `hengzhun-i10-tp00-change-inventory-v1.json`。路由采用 exclusive-match：每个路径必须且只能命中一个规则。新增路径没有归属或同时命中多个批次时，校验器立即失败。

## 实现与复核模板

后续每个批次都按以下模板进入 REVIEW，不允许直接宣称 DONE：

```yaml
batch: Bxx
business_invariant: <本批必须保持的业务事实>
authoritative_sources: [<源码/合同>]
generated_or_migrations: [<生成物/迁移>]
tests: [<行为测试与静态门>]
forbidden_paths: [midscene_run, .env, runtime databases, logs]
preconditions: [git status snapshot, dependency/runtime state]
verification:
  static: <命令与结果>
  behavior: <命令与结果>
  runtime: <未运行或对应身份的 LIVE 证据>
rollback: <可恢复到批前状态的明确边界>
residual_risk: <未关闭风险>
review_state: REVIEW
```

## TP-00 验收命令

```powershell
node scripts/architecture/validate_hengzhun_i10_tp00_inventory.cjs
git diff --check
python scripts/docs/validate_docs.py
```

完成条件：所有当前脏路径恰有一个排他归属、未知和重复归属均为 0、每个批次生成内容指纹、运行产物和个人工具保持隔离且不读取内容、`git diff --check` 为 0，且文档验证通过。任何新路径都会使清单门重新评估。

## 独立完成复核

- 当前清单覆盖 206 个文件级路径，202 个变更路径与 4 个隔离路径恰有一个归属，unknown/overlap 均为 0；路径集合摘要为 `9bf82718c04067b99f0ae1b5540023e1847009a122a45a9b0097de35f8aaf942`。
- `validate_hengzhun_i10_tp00_inventory.cjs`、文档验证、架构验证、时序验证和 `git diff --check` 均退出 0。
- 两个 runtime report 与两个用户 helper 仍保持排除；未读取其内容、未删除、未暂存、未提交。
- 本状态只关闭变更治理包，不建立源码冻结、运行态对齐或 LIVE_E2E 证据。
