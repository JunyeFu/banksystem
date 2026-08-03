---
id: EVIDENCE-HENGZHUN-I10-CURRENT-20260722
title: 衡准I10当前实现与本机验证证据
document_type: evidence
domain: regression-platform
status: verified-s0-s8
authority: evidence
version: 1.15
effective_date: 2026-07-23
owner: 傅钧烨
---

# 衡准 I10 当前实现与本机验证证据（2026-07-22）

## 结论边界

I10-S0—S8及补充修复R0—R7已经在当前电脑完成代码、合同和真实运行验收。Flowise是唯一对话入口，三类主输入都支持补充图片；图片经过本机中英文OCR、脱敏、主控事实筛选后与原输入融合。验证挑战可暂停Midscene、要求用户准备并在确认后恢复；无人值守任务失败关闭。I10-S9遵照用户要求尚未导出独立目录或ZIP，因此I10任务保持`IN_PROGRESS`，不得表述为正式发布包已经生成。

## 已验证事实

- 分支为`agent/i10-flowise-formal-portable`；I9目录、migration 001—016、六次证书和历史证据未被覆盖。
- I10 Agentflow含109个节点、123条边；路径感知校验确认不存在跨分支未定义引用，旧19项MCP完整保留并新增图片导入/查询、验证查询/决定4项受控工具，合计23项。
- `InputEnvelope`的`NATURAL_LANGUAGE / CASE_FILE / VIDEO`三入口均形成相同版本的`CaseDraft`和有效`preparationId`。XLSX、CSV、DOCX、JSON及MP4/H.264的正常、异常、超限、危险结构、低置信度与人工校正路径均有确定性测试。
- 凭据明文只进入本机安全表单；DPAPI CurrentUser密文位于`.data`，Flowise、模型上下文、普通业务表、ActionTrace、脚本和证据仅传递`credentialRef`。
- 双模型真实探针于2026-07-22通过：主控`deepseek-v4-flash`完成结构化案例与调度输出，视觉`mimo-v2.5`完成真实截图结构化理解；两者均为`mock=false`、`degraded=false`且首次请求成功。发布接口只使用`CONTROL_* / VISION_*`通用变量。
- 三种主输入均可带0—20张补充图片。图片只从Flowise受控附件根读取，执行魔数、大小、路径边界和Hash校验；本机中英文OCR与脱敏后，主控模型只接收脱敏文字、Hash和来源，筛选事实进入`CaseDraft / ActionStepV2 / VerificationRequirement`。
- Flowise通过公开API真实发布并回读，流程ID为`7c14bafe-4c5b-4b4e-9d5a-000000000010`，导出Hash为`2f81befe5a7539282cdd0b158e941cfd3df1d78309ba6db35659878250afc33b`。
- 门户登录候选由MiMo/Midscene真实视觉作者化；候选状态只公开脱敏的`REAL / MIDSCENE / PLAYWRIGHT_VERIFIED`、模型、上下文策略及ActionTrace/Playwright事实Hash，不公开完整提示或轨迹。
- 最终`.cjs`只由确定性Builder生成；主控和Midscene均不能直接签发源码。新候选与修复候选都先通过纯Playwright，再按`I10_2X2_V1`执行1440×900和390×844各2次；任一失败不签证。
- 完整源码通过短时一次性下载交付，下载Hash、执行Hash和证书Hash一致。
- `ON_DEMAND / ONE_TIME / RECURRING`均由自然语言草案、确定性时间解析和人工确认驱动；单次、周期结果可查询，周期任务可经独立确认停用。正式调度不调用LLM或Midscene。
- S8真实验收矩阵的9条正向场景和3条反向场景全部通过，覆盖三入口×三种执行模式，以及每种入口各一条受控失败、修复、重新四次验证、人工激活和恢复执行。完整证据：`platform/hengzhun-regression-system/.data/evidence/i10/stage8/result.json`，SHA-256为`CC6E0A813C119206ECF5AFD82335B59A4ED29F39F9853A15CF377331A8349CCD`；证据声明`mock=false`、`degraded=false`、`forwardScenarioCount=9`、`reverseScenarioCount=3`。
- R7真实补充图片/验证探针通过：1张已脱敏页面图经本机OCR与真实DeepSeek主控得到6条事实，`mock=false/degraded=false/controllerInvocation=REAL`；验证状态依次记录到`WAITING_USER_PREPARATION / WAITING_USER_ACTION / VERIFICATION_CONFIRMED / RESUMED`。完整证据：`platform/hengzhun-regression-system/.data/evidence/i10/multimodal-verification/result.json`，SHA-256为`099DC67856720FB2DE168E557B06B2CEECBD01E52707EE4102EC8BEDD7B52F21`。
- U盾能力边界已固化：Midscene只能识别页面挑战、提示用户准备并在浏览器会话中等待/恢复；PIN、私钥、物理按键和安全桌面始终由用户或授权中间件控制。当前探针明确记录`hardwareOperationVerified=false`，不构成真实U盾设备验收。

## 自动验证结果

- `npm run test:i10:core`：54/54通过；S9预检仍不创建导出物。
- `npm run verify:i10:closure`：通过。`flowise/i10/gap-closure-matrix-v1.json`逐项绑定`I10-G01...I10-G20`的实现文件、自动测试和真实运行证据；验证器同时重算S8与R7证据Hash，核对9+3场景、图片事实、验证恢复、真实双模型、私有Flowise发布和零秘密命中，并明确不包含S9发布声明。
- I2：15/15通过；I8阶段1—7分别为9/9、11/11、4/4、4/4、6/6、4/4、3/3；I9阶段1—9分别为3/3、3/3、4/4、3/3、3/3、3/3、3/3、4/4、1/1。I9仍保存旧14工具视图及六次证书历史语义。
- `npm run verify:structure`：通过。
- `npm audit --omit=dev --audit-level=high`：0项已知高风险漏洞。
- `npm run verify:i10:secrets`及闭环内嵌复验：源码/配置195个文件、运行输出2129个文件和当前受保护运行值均完成扫描，发现0项；扫描过程不输出值。

## 尚未完成与未来外部门禁

1. I10-S9尚未导出正式目录、ZIP和SHA-256；这是用户明确暂停的发布动作，不是S0—S8缺陷。
2. 当前产品树存在尚未提交的I10改动，因此S9源冻结门禁正确阻止打包；不得把脏源树标记为正式发布物。
3. 当前真实双模型证据证明DeepSeek/MiMo运行链，不证明未来任意内网Qwen3.5部署的容量。精确Qwen3.5 checkpoint、推理后端和HiAgent连接器必须依据`flowise/i10/intranet-qwen35-capability-gate-v1.json`实时验收：主控低于1,000,000/8,192或视觉低于16K/12K/4K时阻止迁移；高于最低档时记录真实能力且适配器不得静默限缩。

## 证据命令

```powershell
npm.cmd run test:i10:core
npm.cmd run verify:i10:agentflow
npm.cmd run verify:i10:models
npm.cmd run verify:i10:stage8:live
npm.cmd run verify:i10:multimodal:live
npm.cmd run verify:i10:closure
npm.cmd run verify:i10:secrets
npm.cmd run verify:structure
npm.cmd audit --omit=dev --audit-level=high
```

真实S8不因文档更新重复执行；其不可变结果文件和SHA-256是本轮运行证据。S9在用户恢复导出授权且源树冻结前只允许执行只读预检。
