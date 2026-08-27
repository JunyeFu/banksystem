'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const { genericActionTerms, genericEvidenceMatchesTerms, genericLocateInstruction, readOnlyDetailLocatorEvidence } = require('../../worker/src/i10-midscene-candidate-authoring.cjs')

test('generic account summary assertion anchors a visible account region, not the generated card phrase', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '确认账户卡片、余额和账户状态正常显示'
  }
  assert.deepEqual(genericActionTerms(action), ['账户列表'])
  const prompt = genericLocateInstruction(action)
  assert.match(prompt, /与“账户列表”一致/)
  assert.doesNotMatch(prompt, /账户卡片/)
})

test('generic read-only detail navigation accepts a visible view affordance without widening mutation clicks', () => {
  assert.deepEqual(genericActionTerms({ operation: 'click', instruction: '进入账户明细页面' }), ['账户'])
  assert.deepEqual(genericActionTerms({ operation: 'click', instruction: '进入收款人详情页' }), ['收款人'])
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '进入账户明细页面' }, '查看'), true)
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '创建转账并进入交易详情' }, '查看'), false)
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '进入账户明细页面' }, '删除'), false)
  assert.match(genericLocateInstruction({ operation: 'click', instruction: '进入账户明细页面' }), /不要定位只进入列表页的顶层导航链接/)
  const action = { operation: 'click', instruction: '进入账户明细页面' }
  assert.equal(readOnlyDetailLocatorEvidence(action, { tagName: 'button', clickable: true, text: '活期储蓄 正常' }), true)
  assert.equal(readOnlyDetailLocatorEvidence(action, { tagName: 'a', clickable: true, text: '账户' }), false)
  assert.equal(readOnlyDetailLocatorEvidence(action, { tagName: 'button', clickable: true, text: '删除账户' }), false)
  assert.equal(readOnlyDetailLocatorEvidence({ operation: 'click', instruction: '创建转账并进入交易详情' }, { tagName: 'button', clickable: true, text: '查看' }), null)
})

test('generic Midscene waitForURL requires a real URL change within frozen target origins rather than a portal path fallback', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /if \(generic\) \{[\s\S]{0,900}allowedNavigationOrigins\.has\(url\.origin\) && url\.href !== baseline/)
  assert.match(source, /genericNavigationBaseline = beforeClickUrl/)
  const genericBranch = source.match(/if \(generic\) \{([\s\S]{0,900})\} else \{/)
  assert.ok(genericBranch)
  assert.doesNotMatch(genericBranch[1], /portal\/(?:dashboard|profile|transfer|orders)/)
})

test('generic visual locating may receive a bounded redacted control-name hint but never a DOM executor', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /async function accessibleControlHint/)
  assert.match(source, /querySelectorAll\('a,button,select,input:not\(\[type="hidden"\]\),textarea,\[contenteditable="true"\]/)
  assert.match(source, /element instanceof HTMLInputElement \|\| element instanceof HTMLSelectElement/)
  assert.match(source, /inputValueIsSafeLabel/)
  assert.match(source, /不要返回字段标签文字、表单卡片、容器边框或说明文字/)
  assert.match(source, /const selectedLabel = node\.closest\('label'\)/)
  assert.match(source, /selectedLabel\?\.control/)
  assert.match(source, /document\.getElementById\(selectedLabel\.htmlFor\)/)
  assert.match(source, /for \(let current = node; current instanceof HTMLElement && current !== document\.body; current = current\.parentElement\)/)
  assert.match(source, /nearbyControls\.length === 1/)
  assert.match(source, /current !== document\.body/)
  assert.match(source, /if \(!\(interactive instanceof HTMLElement\)\) return null/)
  assert.match(source, /const explicitAccessibleName = String\(node\.getAttribute\('aria-label'\) \|\| ''\)/)
  assert.match(source, /if \(role && explicitAccessibleName && explicitAccessibleName\.length <= 160\)/)
  assert.doesNotMatch(source, /value: `\$\{role\}\|\$\{node\.textContent/)
  assert.match(source, /segments\.length < 24/)
  assert.match(source, /if \(current !== document\.body \|\| !segments\.length\) return null/)
  assert.match(source, /不要返回周围卡片、标题或说明文字/)
  assert.match(source, /replace\(\/\\b\\d\{4,\}\\b\/g, '\*\*\*'\)/)
  assert.match(source, /仅用于视觉消歧；不得将其当作DOM定位器或跳过截图观察/)
  assert.match(source, /async function accessibleLandmarkHint/)
  assert.match(source, /当前页面可见标题摘要/)
  assert.match(source, /function genericLocateInstruction/)
  // Keep this structural check tolerant of additional read-only leading verbs
  // (for example 查询).  The safety property is that generic visual hints
  // remove an action verb before matching the visible business noun; it must
  // not freeze one historical spelling of that allowlist.
  assert.match(source, /\.replace\(\/\^\(\?:确认\|验证\|检查\|校验\|核对\|查看\|确保\|查询\|打开\|进入\|导航\(\?:至\|到\)\?\)\\s\*\[:：\]\?\\s\*\/, ''\)/)
  assert.match(source, /当前动作是只读视觉定位：请在当前截图中优先定位与/)
  assert.match(source, /generated Playwright assertion keeps the full fact set in scope/)
  assert.match(source, /async function genericLocatorMatchesAction/)
  assert.match(source, /I10_MIDSCENE_TARGET_VALIDATION_FAILED/)
  assert.match(source, /stage: 'ACTION_EXECUTED'/)
  assert.match(source, /operation: action\.operation/)
  assert.match(source, /return action\.operation === 'expectVisible' \? terms\.slice\(0, 1\) : terms/)
  assert.match(source, /if \(action\.operation === 'click' && !evidence\.clickable\) return false/)
  assert.match(source, /if \(action\.operation === 'fill' && !evidence\.editable\) return false/)
  assert.match(source, /if \(action\.operation === 'select' && !evidence\.selectable\) return false/)
  assert.match(source, /if \(action\.operation === 'check' && !evidence\.checkable\) return false/)
  assert.match(source, /if \(action\.operation === 'upload' && !evidence\.uploadable\) return false/)
  assert.match(source, /if \(action\.operation === 'download' && !evidence\.clickable\) return false/)
  assert.match(source, /tagName === 'textarea' \|\| element\.isContentEditable/)
  assert.match(source, /tagName === 'button' \|\| tagName === 'a' \|\| role === 'button'/)
  assert.match(source, /async function resolveCredentialValueForLocatedInput/)
  assert.match(source, /String\(element\.type \|\| ''\)\.toLowerCase\(\) === 'password'/)
  assert.match(source, /await resolveCredentialValueForLocatedInput\(page, verifiedLocator, credential, action\)/)
  assert.match(source, /const clickable = generic \? dynamicLocator\(page, verifiedLocator\)/)
  assert.match(source, /promptHash: sha256\(basePrompt\), screenshotHash/)
  assert.match(source, /promptHash: sha256\(basePrompt\), locatorMatched: true/)
})

test('generic screenshots preserve the reached page without inventing a visual element target', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /function requiresVisualLocator\(action\)/)
  assert.match(source, /'goto', 'waitForURL', 'screenshot', 'humanVerification'/)
  assert.match(source, /action\.semanticTargetRef && \(!generic \|\| requiresVisualLocator\(action\)\)/)
  assert.match(source, /expectedTerms: genericActionTerms\(action\)/)
  assert.match(source, /regionMatch: action\.operation === 'expectVisible'/)
  assert.match(source, /its own ancestors; never search[\s\S]*the page for a matching term/)
})

test('formal and stability runners add the local identity dependency only through an explicit adapter', () => {
  for (const relative of ['worker/src/i8-formal-runner.cjs', 'worker/src/i8-stability-runner.cjs']) {
    const source = read(relative)
    assert.match(source, /adapter\?\.adapterId === 'fuxing-bank-demo'/)
    assert.doesNotMatch(source, /launchOrigin === 'http:\/\/127\.0\.0\.1:18082'/)
  }
})

test('the deterministic IntentPlan compiler selects a controlled profile only from a frozen adapter binding', () => {
  const source = read('flowise/i10/agentflow-v6.json')
  const flow = JSON.parse(source)
  const planner = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
  const compiler = planner.data.inputs.customFunctionJavascriptFunction
  assert.match(compiler, /targetProfileSnapshot\.adapterBinding/)
  assert.match(compiler, /binding\.adapterId === 'fuxing-bank-demo' && transferRequested/)
  assert.match(compiler, /TRANSFER_UKEY_ORDER_QUERY/)
  assert.doesNotMatch(compiler, /draft\.targetSystem|\/portal\/login/)
  const execute = new Function(
    '$caseDraftJson', '$route', '$targetProfileId', '$targetProfileVersion', '$targetProfileHash', '$targetProfileSnapshot',
    compiler
  )
  const genericResult = execute(JSON.stringify({
    entryUrl: 'http://127.0.0.1:18082/portal/login',
    steps: [
      { action: '发起转账', expected: '显示确认结果' }
    ]
  }), '', 'target-profile-generic', 1, 'a'.repeat(64), '{}')
  assert.equal(genericResult.valid, 'YES')
  assert.equal(genericResult.executionProfile, 'GENERIC_WEB')
})

test('run claims preserve the ACTIVE TargetProfile adapter binding for formal network policy', () => {
  const source = read('harness/src/service.ts')
  assert.match(source, /resolved_addresses_json: string; adapter_binding_json: string/)
  assert.match(source, /JSON\.parse\(targetProfile\.adapter_binding_json \|\| 'null'\)/)
  assert.match(source, /adapterBinding: parsedAdapterBinding/)
})

test('controlled demo routes and locators live in the explicit adapter rather than generic builder code', () => {
  const builder = read('harness/src/i8/script-package-builder.ts')
  const adapter = read('harness/src/i8/adapters/fuxing-bank-demo.ts')
  for (const marker of ['/portal/login', 'login-username', 'transfer-first-confirm']) {
    assert.doesNotMatch(builder, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(adapter, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(builder, /isFuxingBankDemoAdapter/)
  assert.match(builder, /PACKAGE\.routes\.LAUNCH_URL \? 'LAUNCH_URL' : 'PORTAL_LOGIN'/)
})

test('Midscene controlled selectors and U-key behavior require an explicit adapter binding', () => {
  const authoring = read('worker/src/i10-midscene-candidate-authoring.cjs')
  const workerAdapter = read('worker/src/adapters/fuxing-bank-demo/index.cjs')
  const dispatcher = read('worker/src/i10-verification-policy.cjs')
  for (const marker of ['/portal/login', 'login-username', 'transfer-first-confirm']) {
    assert.doesNotMatch(authoring, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(workerAdapter, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(authoring, /FUXING_BANK_DEMO_ROUTES/)
  assert.match(dispatcher, /isFuxingDemoBinding\(adapterBinding\)/)
  assert.match(dispatcher, /: NONE/)
})

test('new controlled task assembly loads the explicit adapter while legacy paths remain replay-only shims', () => {
  const worker = read('worker/src/index.cjs')
  const utils = read('worker/src/i10-worker-utils.cjs')
  const shim = read('worker/src/login-profile.cjs')
  assert.match(worker, /require\('\.\/adapters\/fuxing-bank-demo\/login-profile\.cjs'\)/)
  assert.match(worker, /adapters\/fuxing-bank-demo\/login-profile@1\.0\.0/)
  assert.match(worker, /worker\/src\/login-profile\.cjs/)
  assert.match(shim, /adapters\/fuxing-bank-demo\/login-profile\.cjs/)
  assert.doesNotMatch(utils, /fuxing-bank-demo|portal\/login|login-username/)
})

test('the controlled adapter accepts an in-memory DPAPI credential while preserving the legacy alias fallback', () => {
  const adapter = read('worker/src/adapters/fuxing-bank-demo/login-profile.cjs')
  const utils = read('worker/src/i10-worker-utils.cjs')
  const worker = read('worker/src/index.cjs')
  assert.match(adapter, /resolveExecutionCredential\(task, environment, options\)/)
  assert.match(utils, /const supplied = options\?\.credential/)
  assert.match(utils, /supplied\?\.username && supplied\?\.password/)
  assert.match(utils, /return resolveCredential\(task\?\.execution\?\.credentialAlias, environment\)/)
  assert.match(worker, /if \(task\.execution\?\.credentialRef\)/)
  assert.match(worker, /credentials:resolve/)
  assert.match(worker, /credential: i10Credential/)
})

test('target profile preparation derives only case-scoped generic capabilities', () => {
  const flow = JSON.parse(read('flowise/i10/agentflow-v6.json'))
  const classificationMerge = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_classification_merge')
  assert.match(classificationMerge.data.inputs.customFunctionJavascriptFunction, /scheduleRefs\.length === 1/)
  assert.match(classificationMerge.data.inputs.customFunctionJavascriptFunction, /scheduleId: explicitScheduleRef \|\|/)
  const derive = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v5_application_profile_derive')
  const prepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_prepare')
  const prerequisite = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_target_profile_prerequisite')
  assert.ok(derive)
  assert.ok(prepare)
  assert.ok(prerequisite)
  const implementation = derive.data.inputs.customFunctionJavascriptFunction
  assert.match(implementation, /moduleId: 'case-scope'/)
  assert.match(implementation, /本次案例范围/)
  assert.match(implementation, /explicitAdapterSelection/)
  assert.match(implementation, /fuxing-bank-demo/)
  assert.match(implementation, /明确选择|使用|采用/)
  assert.doesNotMatch(implementation, /targetSystem.*fuxing-bank-demo|entryUrl.*fuxing-bank-demo/)
  assert.ok(prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'applicationProfile' && arg.inputArgValue === '{{$flow.state.applicationProfileJson}}'))
  assert.ok(prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'adapterSelection' && arg.inputArgValue === '{{$flow.state.targetAdapterSelection}}'))
  assert.ok(prerequisite.data.inputs.customFunctionInputVariables.some(variable => variable.variableName === 'naturalLanguage'))
  assert.match(prerequisite.data.inputs.customFunctionJavascriptFunction, /!explicitAdapterSelection/)
  assert.ok(flow.edges.some(edge => edge.source === derive.id && edge.target === prepare.id))
  const crossProjection = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v6_cross_session_journey_projection')
  const adapterRoute = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v6_cross_session_adapter_route')
  assert.ok(crossProjection.data.inputs.customFunctionUpdateState.some(update =>
    update.key === 'targetAdapterSelection' && update.value === '{{ output.projectedAdapterSelection }}'))
  assert.ok(crossProjection.data.inputs.customFunctionUpdateState.some(update =>
    update.key === 'targetAdapterConfirmationRequired' && update.value === '{{ output.adapterConfirmationRequired }}'))
  assert.match(crossProjection.data.inputs.customFunctionJavascriptFunction,/adapterConfirmationRequired/)
  assert.match(crossProjection.data.inputs.customFunctionJavascriptFunction,/references\?\.targetProfileId/)
  assert.ok(adapterRoute)
  assert.equal(adapterRoute.data.inputs.conditions[0].value1,'{{$flow.state.targetAdapterConfirmationRequired}}')
  const crossPrepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_prepare_cross_session')
  assert.ok(crossPrepare)
  assert.equal(crossPrepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'applicationProfile'),false)
  assert.ok(crossPrepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'adapterSelection'))
  assert.ok(flow.edges.some(edge => edge.source === adapterRoute.id && edge.target === crossPrepare.id))
  assert.equal(flow.edges.filter(edge => edge.target === crossPrepare.id).length,1)
  const crossStatusRoute = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v6_cross_session_target_profile_status')
  assert.ok(crossStatusRoute)
  assert.deepEqual(crossStatusRoute.data.inputs.conditions.map(item => item.value2),['PENDING_CONFIRMATION','ACTIVE'])
  assert.ok(flow.edges.some(edge => edge.source === crossStatusRoute.id && edge.sourceHandle.endsWith('-output-0') && edge.target === 'humanInputAgentflow_i10_v4_target_profile_confirm_cross_session'))
  assert.ok(flow.edges.some(edge => edge.source === crossStatusRoute.id && edge.sourceHandle.endsWith('-output-1') && edge.target === 'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session'))
  for (const id of [
    'humanInputAgentflow_i10_v4_target_profile_confirm_cross_session',
    'toolAgentflow_i10_v4_target_profile_approve_cross_session',
    'toolAgentflow_i10_v4_target_profile_get_cross_session',
    'toolAgentflow_i10_v6_post_target_journey_prepare_cross_session',
    'customFunctionAgentflow_i10_v6_post_target_journey_projection_cross_session',
    'directReplyAgentflow_i10_v6_target_profile_transition_cross_session'
  ]) {
    assert.ok(flow.nodes.some(node => node.id === id),`missing isolated target-profile node ${id}`)
    assert.equal(flow.edges.filter(edge => edge.target === id).length,1,`${id} must not become an AND-join`)
  }
  for (const id of [
    'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session',
    'customFunctionAgentflow_i10_v6_post_target_journey_projection_already_active_cross_session',
    'directReplyAgentflow_i10_v6_target_profile_transition_already_active_cross_session'
  ]) assert.equal(flow.edges.filter(edge => edge.target === id).length,1,`${id} must remain a single-parent continuation`)
  for (const [projectionId, prepareId] of [
    ['customFunctionAgentflow_i10_v6_post_target_journey_projection_cross_session', 'toolAgentflow_i10_v6_post_target_journey_prepare_cross_session'],
    ['customFunctionAgentflow_i10_v6_post_target_journey_projection_already_active_cross_session', 'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session']
  ]) {
    const projection = flow.nodes.find(node => node.id === projectionId)
    const contentVariable = projection.data.inputs.customFunctionInputVariables
      .find(item => item.variableName === 'content')
    assert.equal(contentVariable?.variableValue, `{{ ${prepareId}.output.content }}`)
  }
  for (const nodeId of [
    'toolAgentflow_i10_v6_cross_session_authoring_submit',
    'toolAgentflow_i10_v6_cross_session_authoring_resume_submit'
  ]) {
    const node = flow.nodes.find(item => item.id === nodeId)
    assert.deepEqual(
      node.data.inputs.toolInputArgs.map(item => item.inputArgName).sort(),
      ['authoringContext', 'choice', 'confirmationRef', 'expectedVersion', 'preparationId', 'reason', 'sessionRef']
    )
  }
})
