# I10 浏览器与 OCR 双路径全链路验收执行计划

## 1. 目标与边界

本计划验证复兴银行本机演示系统与衡准 Flowise、Harness、Worker 的真实闭环，不以单元测试、历史证书或单一脚本通过替代平台验收。每一个业务案例都必须完成两条独立链路：

1. **A：无截图链路**：自然语言案例描述 -> Flowise 理解与结构化 -> 本机安全凭据引用 -> 案例确认 -> Midscene 定位 -> Playwright 源码生成 -> 纯 Playwright 验证 -> I10 2x2 稳定性验证 -> 用户激活选择 -> 正式执行与结果回传。
2. **B：有截图/OCR链路**：同一自然语言案例描述 + 浏览器实际截图 -> Flowise 受控附件上传 -> OCR -> 主控模型筛选和合并事实 -> 用户确认 -> 后续步骤与 A 完全相同。

浏览器基线操作只用于证明被测页面及截图事实；不得替代 Flowise、Harness、Worker 的正式链路。凭据只通过本机 DPAPI 凭据页面录入，截图、对话、脚本、日志和账本不得记录明文账号、密码、验证码、PIN、令牌或 API Key。

## 2. 案例集

| ID | 难度 | 简短自然语言案例 | 关键业务覆盖 |
|---|---|---|---|
| L1 | 轻度 | 打开复兴银行门户，使用已保存的安全凭据登录，进入个人资料页面，确认主页与个人资料页的姓名和头像一致。 | 登录、身份信息 |
| L2 | 轻度 | 登录复兴银行门户，打开账户页面，确认账户卡片、余额和账户状态正常显示。 | 账户概览 |
| L3 | 轻度 | 登录复兴银行门户，打开消息页面，确认消息列表、未读标识和消息摘要正常显示。 | 消息查看 |
| M1 | 中度 | 登录复兴银行门户，进入账户明细，筛选近期交易，确认交易日期、金额和状态可读。 | 明细筛选 |
| M2 | 中度 | 登录复兴银行门户，进入收款人页面，查询并筛选收款人，确认姓名、账户掩码和状态展示正确。 | 收款人查询 |
| M3 | 中度 | 登录复兴银行门户，进入文档页面，查询一份文档并确认标题、日期和查看入口正确。 | 文档查询 |
| H1 | 重度 | 登录复兴银行门户，创建一笔演示转账并完成首次确认，确认系统进入预期的验证或单号查询流程。 | 转账创建 |
| H2 | 重度 | 登录复兴银行门户，创建一笔演示转账；若进入网页 U 盾验证页则完成验证，若直接进入单号查询页则确认已自动跳过验证。 | 条件验证 |
| H3 | 重度 | 登录复兴银行门户，完成一笔演示转账后按单号查询记录，确认收款信息、金额和状态一致。 | 转账查询 |

## 3. 截图与 OCR 规则

- 每个案例至少保留一张关键页面截图，存放于 `.data/acceptance/browser-ocr-dual-path/<case-id>/`，并记录脱敏检查结论。
- 有截图链路通过 Flowise 受控附件入口上传，不允许用任意本地路径绕过附件控制。
- OCR 应识别页面标题、中文/英文按钮、金额、日期、账号掩码和关键状态；原始 OCR 细节以制品交付，聊天仅展示人类可读摘要。
- OCR 可补充页面事实，但不得改变用户业务意图；低置信度内容必须进入确认或缺口，不能臆造。
- 完成事实确认后，按 I10 策略删除受控原图；账本仅保存文件 Hash、路径和删除结果。

## 4. 18 条执行记录

| 记录 | 业务案例 | 输入链路 | 浏览器基线 | OCR/合并 | 脚本生成 | 纯 Playwright | 2x2 | 激活选择 | 正式执行 | 最终状态 |
|---|---|---|---|---|---|---|---|---|---|---|
| L1-A | L1 | 自然语言 | PARTIAL: 登录页基线截图已采集 | N/A | PASS: `candidate_e62268d9...` 已生成 `.cjs` | PASS | PASS: `I10_2X2_V1` | PASS: 已产生激活证据 | BLOCKED: 旧运行在 Claim 阶段报 `I10_ENTRY_URL_NOT_ALLOWED` | BLOCKED_PENDING_RERUN |
| L1-B | L1 | 自然语言+截图 | CAPTURED: `L1/L1-login-baseline.png` | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| L2-A | L2 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| L2-B | L2 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| L3-A | L3 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| L3-B | L3 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| M1-A | M1 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| M1-B | M1 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| M2-A | M2 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| M2-B | M2 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| M3-A | M3 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| M3-B | M3 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| H1-A | H1 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| H1-B | H1 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| H2-A | H2 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| H2-B | H2 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| H3-A | H3 | 自然语言 | PENDING | N/A | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| H3-B | H3 | 自然语言+截图 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

### 4.1 本轮真实执行与阻塞说明（2026-07-29）

- L1 登录页浏览器基线截图已保存为 `.data/acceptance/browser-ocr-dual-path/L1/L1-login-baseline.png`。该截图仅证明未认证登录页可达，不替代登录后头像/姓名页面验收。
- 受控 Stage8 运行已真实生成候选脚本 `candidate_e62268d9...`，并完成纯 Playwright 与 `I10_2X2_V1` 四次稳定性验证；候选制品已产生。
- 同一运行的正式执行在旧 Harness 的运行 Claim 阶段被 `I10_ENTRY_URL_NOT_ALLOWED` 阻断。根因是 CaseDefinition 未携带 TargetProfile 时，Claim 未从候选制品的 manifest 回填已确认的 TargetProfile。该代码已最小修复并通过 TypeScript 编译、TargetProfile 和验证策略回归；尚未获得修复后新的完整 Stage8 最终结果，因此不得记为正式执行通过。
- Stage8 单序列驱动在该次运行后未写出新的 `result.json`，属于验收驱动的恢复/终态写入缺陷；该缺陷与业务链路结果分开登记。它阻止把本轮结果扩大为 L1 完整通过，也阻止继续伪造其余 17 条记录。
- L2--H3 以及所有截图/OCR附件链路尚未完成真实 Flowise 受控附件上传、OCR、事实确认和完整后续闭环，保持 `PENDING/NOT_RUN`。因此当前通过记录为 **0/18**。
- 本轮 `VERIFY.cmd --no-pause` 已完成核心文件与运行时资产校验，但在敏感内容扫描阶段失败关闭：根目录遗留 `midscene_run/log/*` 运行日志不属于发布包允许内容。运行时代码已经将新 Midscene 输出定向到 `.data/midscene-runs`；遗留目录必须在下次包冻结前清理后再运行完整 VERIFY，当前不得标记 `I10_PORTABLE_FOLDER_VERIFIED`。

## 5. 判定规则

- 两条链路都通过，才可称对应业务案例具有完整平台级证据。
- A 通过、B 失败：登记为 OCR、附件或 Flowise 合并链缺陷。
- B 通过、A 失败：登记为自然语言理解或缺口判断缺陷。
- 任一路径出现受控失败、页面不可达、凭据不可用、U 盾非网页原生窗口、人工确认不具备可见接管条件，必须登记实际阻断原因；不得把 Worker 或浏览器基线的成功冒充为 Flowise 全链路通过。
- 重度案例仅允许在演示账户、可逆演示转账与既定测试环境执行；遇到真实外部资金、非演示对象或不可逆提交立即停止。

## 6. 执行顺序

1. 校验本机服务版本、健康状态、模型探针与安全凭据状态。
2. 使用 Codex 内部浏览器逐案建立实际页面基线与脱敏截图。
3. 按 A、B 依次在 Flowise 执行，独立记录每个门槛的输出、制品、Hash、证书和最终结果。
4. 遇到代码缺陷时先保留证据、最小范围修复、运行相关回归，再从安全断点继续。
5. 输出分类验收报告，严格分开“银行页面功能”“OCR”“Flowise理解”“脚本/稳定性”“正式执行”。
