'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

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
  assert.match(source, /querySelectorAll\('a,button,select,input\[type="button"\]/)
  assert.match(source, /element instanceof HTMLInputElement \|\| element instanceof HTMLSelectElement/)
  assert.match(source, /replace\(\/\\b\\d\{4,\}\\b\/g, '\*\*\*'\)/)
  assert.match(source, /仅用于视觉消歧；不得将其当作DOM定位器或跳过截图观察/)
  assert.match(source, /async function accessibleLandmarkHint/)
  assert.match(source, /当前页面可见标题摘要/)
  assert.match(source, /function genericLocateInstruction/)
  // Keep this structural check tolerant of additional read-only leading verbs
  // (for example 查询).  The safety property is that generic visual hints
  // remove an action verb before matching the visible business noun; it must
  // not freeze one historical spelling of that allowlist.
  assert.match(source, /\.replace\(\/\^\(\?:确认\|验证\|检查\|查看\|确保\|查询\|打开\|进入\|导航\(\?:至\|到\)\?\)\\s\*\[:：\]\?\\s\*\/, ''\)/)
  assert.match(source, /当前动作是只读视觉定位：请在当前截图中优先定位与/)
  assert.match(source, /generated Playwright assertion keeps the full fact set in scope/)
  assert.match(source, /async function genericLocatorMatchesAction/)
  assert.match(source, /I10_MIDSCENE_TARGET_VALIDATION_FAILED/)
  assert.match(source, /stage: 'ACTION_EXECUTED'/)
  assert.match(source, /operation: action\.operation/)
  assert.match(source, /return action\.operation === 'expectVisible' \? terms\.slice\(0, 1\) : terms/)
  assert.match(source, /if \(action\.operation === 'click' && !evidence\.clickable\) return false/)
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
  assert.doesNotMatch(compiler, /targetSystem|entryUrl|\/portal\/login/)
})

test('controlled demo routes and locators live in the explicit adapter rather than generic builder code', () => {
  const builder = read('harness/src/i8/script-package-builder.ts')
  const adapter = read('harness/src/i8/adapters/fuxing-bank-demo.ts')
  for (const marker of ['/portal/login', 'login-username', 'transfer-first-confirm']) {
    assert.doesNotMatch(builder, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(adapter, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(builder, /isFuxingBankDemoAdapter/)
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
  const worker = read('worker/src/index.cjs')
  assert.match(adapter, /const suppliedCredential = options\?\.credential/)
  assert.match(adapter, /suppliedCredential\?\.username && suppliedCredential\?\.password/)
  assert.match(adapter, /: resolveCredential\(alias, environment\)/)
  assert.match(worker, /if \(task\.execution\?\.credentialRef\)/)
  assert.match(worker, /credentials:resolve/)
  assert.match(worker, /credential: i10Credential/)
})

test('target profile preparation derives only case-scoped generic capabilities', () => {
  const flow = JSON.parse(read('flowise/i10/agentflow-v6.json'))
  const derive = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v5_application_profile_derive')
  const prepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_prepare')
  assert.ok(derive)
  assert.ok(prepare)
  const implementation = derive.data.inputs.customFunctionJavascriptFunction
  assert.match(implementation, /moduleId: 'case-scope'/)
  assert.match(implementation, /本次案例范围/)
  assert.match(implementation, /explicitAdapterSelection/)
  assert.match(implementation, /fuxing-bank-demo/)
  assert.match(implementation, /明确选择|使用|采用/)
  assert.doesNotMatch(implementation, /targetSystem.*fuxing-bank-demo|entryUrl.*fuxing-bank-demo/)
  assert.ok(prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'applicationProfile' && arg.inputArgValue === '{{$flow.state.applicationProfileJson}}'))
  assert.ok(prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'adapterSelection' && arg.inputArgValue === '{{$flow.state.targetAdapterSelection}}'))
  assert.ok(flow.edges.some(edge => edge.source === derive.id && edge.target === prepare.id))
})
