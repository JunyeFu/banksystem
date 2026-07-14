# 背景知识与项目现状缺口

更新时间：2026-07-14。结论基于当前工作树、项目规范/契约/阶段报告，以及官方资料包的来源矩阵；官方正文尚未下载，涉及版本细节的判断仍需在补齐正文后复核。

## 已对齐

- 银行核心边界：项目规范明确 Fineract 是唯一核心事实源，浏览器不能直连 Fineract。
- 资金安全：项目已有幂等、状态机、outbox、审计哈希链、对账和回放等契约/测试资产。
- 运行栈：Java/Spring、React/TypeScript/Vite、PostgreSQL、Keycloak、ActiveMQ、Docker 与 Fineract/Mifos X 均有项目文件或配置。
- 测试治理：`contracts/`、`scripts/test/`、`agent/reports/` 和阶段门禁形成了可追溯的测试资产基础。

## 当前高优先级缺口

0. **状态文档存在漂移**：实施规范中的部分验收表把能力写成 `DONE`，而 `AGENTS.md` 明确 S7 尚未通过且存在 P0/P1 阻塞；后续应以当前审查报告、实际测试和运行态为准，不能把旧表格当作当前完成证明。

1. **AI 测试链路尚未形成可执行闭环**：资料包把 DeepSeek、MiMo、Coze、Midscene、Playwright 列为必需，但当前代码树未发现对应 Agent/Workflow/Bridge/Worker 的实现与契约；需要补齐入口、规划、事实采集、候选脚本、Clean Replay 和证据回传的端到端链路。
2. **官方正文未进入知识库**：目前只有来源矩阵、README、快捷方式和下载器，不能据此声称已掌握各组件当前 API。应先按 Core 下载并校验，再按项目实际用到的章节补充正文快照。
3. **AI 与银行域的边界契约不足**：需要明确 AI 只能生成计划/调用受控工具，资金写操作仍必须经过现有 Bank Channel Service/FineractAdapter 和全部资金安全门禁。
4. **结构化 Harness 缺少 AI 相关契约**：现有契约主要覆盖银行 API 与回归用例；需增加 Goal/Subgoal、观察事实、动作、轨迹、证据、审批/拒绝原因和回放结果的 JSON Schema，并用 Ajv/严格模式验证。
5. **可观测性需要覆盖 AI 链路**：已有基础观测配置，但还需确认模型请求、工具调用、浏览器 trace、任务/关联 ID、成本/限流、脱敏和失败补偿是否贯穿同一条链路。

## 将来必须补齐的知识主题

- Coze Agent、Workflow、Plugin、Knowledge Base、认证、文件上传、流式响应。
- Midscene 的 Playwright 集成、模型策略、`aiAct/aiLocate/aiAssert`、报告、缓存、Bridge/MCP。
- Playwright 的 locator/actionability、隔离上下文、认证、网络、trace、API testing、CI、MCP。
- JSON Schema 2020-12、Ajv strict/formats/security、OpenAPI/AsyncAPI 事件契约。
- DeepSeek/MiMo 的 JSON 输出、工具调用、多模态输入、限流、错误处理和兼容接口。
- Node/TypeScript 子进程、文件系统、Worker、AST 安全检查与候选脚本沙箱。
- Fineract/Mifos 的客户、储蓄、贷款、账务、COB、幂等与事件；以及本项目既有资金写入门禁。

## 使用规则

后续每项实现或审查先检索 `rag/index/chunks.jsonl`，再回到当前源文件验证；若检索命中只有 `official-source-index`，只能作为“待核验官方来源”，不能替代正文或本项目契约。
