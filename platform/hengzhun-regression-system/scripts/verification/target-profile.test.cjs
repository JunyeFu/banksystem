'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I10Service } = require('../../dist/harness/src/i10/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')
const { compileExecutableActionPlan, buildDslDocument, buildCandidatePackage } = require('../../dist/harness/src/i8/script-package-builder.js')
const { FUXING_BANK_DEMO_ADAPTER } = require('../../dist/harness/src/i8/target-adapter-registry.js')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-target-profile-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root, 'data.sqlite'),
    migrationsDirectory: path.resolve(__dirname, '../../harness/migrations'),
    backupDirectory: path.join(root, 'backups')
  })
  const service = new I10Service(database, root, new ArtifactStore(database, path.join(root, 'artifacts')))
  const now = new Date().toISOString()
  const namespace = 'target-profile-test'
  const credentialRef = 'credential_12345678-1234-1234-1234-123456789abc'
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace, now, now)
  database.connection.prepare(`INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at)
    VALUES ('credsession_12345678-1234-1234-1234-123456789abc',?,?,?,?,'READY',?,1,?,?,?)`)
    .run(namespace, 'target-profile-credential', '目标站点凭据', '0'.repeat(64), credentialRef, '2099-01-01T00:00:00.000Z', now, now)
  database.connection.prepare(`INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at)
    VALUES (?,?,'credsession_12345678-1234-1234-1234-123456789abc','.data/credentials/test.bin',?,'WINDOWS_DPAPI_CURRENT_USER',?)`)
    .run(credentialRef, namespace, '1'.repeat(64), now)
  return { root, database, service, namespace, credentialRef }
}

async function localTarget(t, handler = (_request, response) => response.end('ok')) {
  const server = http.createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

test('target profile freezes an arbitrary http(s) entry and binds credential reference', async t => {
  const f = await fixture()
  const targetBase = await localTarget(t)
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-prepare-001',
    displayName: '内网业务门户',
    launchUrl: `${targetBase}/app/login`,
    credentialRef: f.credentialRef,
    tlsPolicy: 'STRICT'
  })
  assert.equal(prepared.status, 'PENDING_CONFIRMATION')
  assert.deepEqual(prepared.allowedNavigationOrigins, [targetBase])
  const active = await f.service.decideTargetProfile({
    namespace: f.namespace,
    targetProfileId: prepared.targetProfileId,
    expectedVersion: prepared.version,
    decision: 'APPROVE',
    confirmationRef: 'target-profile-confirm-001'
  })
  assert.equal(active.status, 'ACTIVE')
  assert.equal(active.launchUrl, `${targetBase}/app/login`)
  assert.deepEqual(active.resolvedAddresses, { '127.0.0.1': ['127.0.0.1'] })
  const binding = f.database.connection.prepare('SELECT target_profile_id FROM i10_credential_refs WHERE credential_ref=?').get(f.credentialRef)
  assert.equal(binding.target_profile_id, active.targetProfileId)
})

test('target profile persists only a registered explicit adapter binding', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-adapter-001',
    sessionRef: 'session-target-adapter-001',
    displayName: '演示门户',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    credentialRef: f.credentialRef,
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    tlsPolicy: 'STRICT'
  })
  assert.deepEqual(prepared.adapterBinding, FUXING_BANK_DEMO_ADAPTER)
  assert.equal(prepared.executionEngine, 'TARGET_ADAPTER')
  await assert.rejects(
    () => f.service.prepareTargetProfile({
      namespace: f.namespace,
      idempotencyKey: 'target-profile-adapter-invalid',
      sessionRef: 'session-target-adapter-invalid',
      displayName: '演示门户',
      launchUrl: 'http://127.0.0.1:28884/portal/login',
      credentialRef: f.credentialRef,
      adapterBinding: { ...FUXING_BANK_DEMO_ADAPTER, manifestHash: '0'.repeat(64) },
      tlsPolicy: 'STRICT'
    }),
    error => error && error.errorCode === 'I10_TARGET_ADAPTER_BINDING_INVALID'
  )
})

test('a symbolic adapter selection resolves only to the registered controlled binding', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-adapter-selection-001',
    sessionRef: 'session-target-adapter-selection-001',
    displayName: '演示门户',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    credentialRef: f.credentialRef,
    adapterSelection: 'fuxing-bank-demo',
    tlsPolicy: 'STRICT'
  })
  assert.deepEqual(prepared.adapterBinding, FUXING_BANK_DEMO_ADAPTER)
  assert.equal(prepared.executionEngine, 'TARGET_ADAPTER')
  await assert.rejects(
    () => f.service.prepareTargetProfile({
      namespace: f.namespace,
      idempotencyKey: 'target-profile-adapter-selection-ambiguous',
      sessionRef: 'session-target-adapter-selection-ambiguous',
      displayName: '演示门户',
      launchUrl: 'http://127.0.0.1:28884/portal/login',
      credentialRef: f.credentialRef,
      adapterSelection: 'fuxing-bank-demo',
      adapterBinding: FUXING_BANK_DEMO_ADAPTER,
      tlsPolicy: 'STRICT'
    }),
    error => error && error.errorCode === 'I10_TARGET_ADAPTER_SELECTION_AMBIGUOUS'
  )
})

test('application modules and capabilities are target-owned and activated with their profile', async t => {
  const f = await fixture()
  const targetBase = await localTarget(t)
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-application-001',
    sessionRef: 'session-target-application-001',
    displayName: '内网业务系统',
    launchUrl: `${targetBase}/app/login`,
    credentialRef: f.credentialRef,
    tlsPolicy: 'STRICT',
    applicationProfile: {
      displayName: '内网业务系统已声明模块',
      modules: [
        { moduleId: 'identity', displayName: '统一登录', capabilities: ['AUTHENTICATION', 'NAVIGATION', 'ASSERTION'] },
        { moduleId: 'account-query', displayName: '账户查询', capabilities: ['READ_ONLY_QUERY', 'TABLE_INTERACTION', 'EVIDENCE_CAPTURE'] }
      ]
    }
  })
  assert.equal(prepared.applicationProfile.status, 'PENDING_CONFIRMATION')
  assert.equal(prepared.applicationProfile.modules.length, 2)
  const active = await f.service.decideTargetProfile({
    namespace: f.namespace, targetProfileId: prepared.targetProfileId,
    expectedVersion: prepared.version, decision: 'APPROVE', confirmationRef: 'target-profile-application-confirm-001'
  })
  assert.equal(active.applicationProfile.status, 'ACTIVE')
  const count = f.database.connection.prepare('SELECT COUNT(*) AS count FROM i10_module_capabilities').get()
  assert.equal(count.count, 6)
})

test('generic plan and DSL retain the frozen target profile and dynamic verified locator', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 2,
    status: 'ACTIVE',
    profileHash: 'a'.repeat(64),
    launchUrl: 'https://example.test/sign-in',
    allowedNavigationOrigins: ['https://example.test'],
    allowedInteractionOrigins: ['https://example.test'],
    credentialOrigins: ['https://example.test']
  }
  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 2,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '输入用户名', expected: '用户名已输入', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-003', action: '点击登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['主页可见']
  }
  const plan = compileExecutableActionPlan(intentPlan, 'b'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.equal(plan.targetProfileHash, targetProfileSnapshot.profileHash)
  const records = plan.actions.map(action => ({
    schemaVersion: 'hengzhun-verified-action-record-v2',
    executablePlanId: plan.executablePlanId,
    actionId: action.actionId,
    ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED',
    ...(action.semanticTargetRef ? { locator: { kind: 'CSS', value: `#target-${action.ordinal}` } } : {}),
    pageSignatureHash: require('node:crypto').createHash('sha256').update(JSON.stringify(action.pageSignature, Object.keys(action.pageSignature).sort())).digest('hex'),
    factsHash: 'c'.repeat(64),
    verification: { dom: true, url: true, request: true, business: true },
    verifiedAt: new Date().toISOString()
  }))
  // Use the same canonicalizer as production for page signature hashes.
  const { canonicalJson, sha256 } = require('../../dist/harness/src/utils.js')
  for (let index = 0; index < records.length; index += 1) records[index].pageSignatureHash = sha256(canonicalJson(plan.actions[index].pageSignature))
  const built = buildDslDocument(plan, records)
  assert.equal(built.dsl.schemaVersion, 'HENGZHUN_DSL_V2')
  assert.equal(built.routes.LAUNCH_URL, targetProfileSnapshot.launchUrl)
  assert.equal(built.locators.DYNAMIC_002.kind, 'CSS')
  const candidate = buildCandidatePackage(plan, records, new Date().toISOString())
  assert.equal(candidate.manifest.dslVersion, 'HENGZHUN_DSL_V2')
  assert.equal(candidate.manifest.targetProfileHash, targetProfileSnapshot.profileHash)
  assert.match(candidate.scriptSource, /const \{ page, baseUrl, fixtures, capture, afterStep, humanVerification, onStep \} = context/)
  assert.match(candidate.scriptSource, /await onStep\(\{ phase: 'STARTED'/)
  assert.match(candidate.scriptSource, /await onStep\(\{ phase: 'PASSED'/)
  assert.doesNotThrow(() => new Function('module', 'exports', candidate.scriptSource))
})

test('generic credential login is expanded into executable Playwright steps without banking selectors', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'f'.repeat(64),
    displayName: '内网账户服务',
    launchUrl: 'https://intranet.example.local/login',
    allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'],
    credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录系统', expected: '成功登录系统', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-account', action: '进入账户概览', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['账户概览页面可见']
  }, '1'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.deepEqual(plan.actions.slice(0, 5).map(action => action.operation), ['goto', 'fill', 'fill', 'click', 'waitForURL'])
  assert.deepEqual(plan.actions.slice(1, 3).map(action => action.fixtureRefs[0]), ['CREDENTIAL.USERNAME', 'CREDENTIAL.PASSWORD'])
  assert.equal(plan.actions[4].semanticTargetRef, undefined)
  assert.equal(plan.actions[4].routePatternRef, 'ALLOWED_NAVIGATION')
  assert.equal(plan.actions[5].instruction, '进入账户概览')
  assert.equal(plan.actions[5].semanticTargetRef, 'DYNAMIC_006')
  assert.equal(/复兴银行|PORTAL_LOGIN/.test(JSON.stringify(plan)), false)

  const records = plan.actions.map(action => ({
    schemaVersion: 'hengzhun-verified-action-record-v2',
    executablePlanId: plan.executablePlanId,
    actionId: action.actionId,
    ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED',
    locator: action.semanticTargetRef
      ? { kind: 'CSS', value: `[data-test-id="${action.semanticTargetRef.toLowerCase()}"]` }
      : undefined,
    pageSignatureHash: require('../../dist/harness/src/utils.js').sha256(
      require('../../dist/harness/src/utils.js').canonicalJson(action.pageSignature)
    ),
    factsHash: 'e'.repeat(64),
    verification: { dom: true, url: true, request: true, business: true },
    verifiedAt: new Date().toISOString()
  }))
  const built = buildDslDocument(plan, records)
  assert.deepEqual(JSON.parse(built.routes.ALLOWED_NAVIGATION), targetProfileSnapshot.allowedNavigationOrigins)
  const candidate = buildCandidatePackage(plan, records, new Date().toISOString())
  assert.match(candidate.scriptSource, /page\.waitForURL\(\(url\) => allowedOrigins\.includes\(url\.origin\) && url\.toString\(\) !== launchUrl/)
  assert.doesNotMatch(candidate.scriptSource, /step\.operation === 'waitForURL'\) await page\.waitForLoadState/)
})

test('generic compound assertions share one read-only visual region and navigation remains an executor click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: '2'.repeat(64), launchUrl: 'https://intranet.example.local/login',
    allowedNavigationOrigins: ['https://intranet.example.local'], allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '进入账户概览', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '验证账户状态及余额', expected: '账户状态显示正常，可用余额已显示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['账户状态与余额已显示']
  }, '3'.repeat(64))
  assert.equal(plan.actions[1].operation, 'click')
  const verification = plan.actions.filter(action => /账户状态|余额/.test(action.instruction))
  assert.equal(verification.length, 1)
  assert.deepEqual(verification.map(action => action.operation), ['expectVisible'])
  assert.match(verification[0].instruction, /账户状态/)
  assert.match(verification[0].instruction, /余额/)
})

test('generic filtering instruction is compiled as a deterministic select with its requested option', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '5'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '筛选近期交易', expected: '成功筛选出近期交易', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['近期交易可见']
  }, '5'.repeat(64))
  const filter = plan.actions.find(action => action.instruction === '筛选近期交易')
  assert.equal(filter.operation, 'select')
  assert.equal(plan.fixtureValues[filter.optionRef], '近期交易')
})

test('generic read-only list inspection is an assertion instead of a synthetic click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '6'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '查看收款人列表', expected: '姓名、账户掩码和状态展示正确', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['收款人列表可见']
  }, '6'.repeat(64))
  const inspection = plan.actions.find(action => action.instruction === '查看收款人列表')
  assert.equal(inspection.operation, 'expectVisible')
  assert.equal(inspection.retryPolicy.sideEffectFree, true)
})

test('generic document inspection does not invent a query button or download a file while checking its entry', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '7'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '查询一份文档', expected: '查询到文档', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '确认文档标题、日期和下载入口正确', expected: '文档信息正确展示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['文档列表可见']
  }, '7'.repeat(64))
  const inspections = plan.actions.filter(action => action.operation === 'expectVisible')
  assert.ok(inspections.some(action => /查询一份文档/.test(action.instruction)))
  assert.ok(inspections.some(action => /下载入口/.test(action.instruction)))
  assert.equal(plan.actions.some(action => action.operation === 'download'), false)
})

test('generic credential expansion removes only a redundant entry-url pseudo-action', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '4'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-entry', action: '打开入口URL', expected: '页面加载成功', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-login', action: '登录', expected: '登录成功', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-next', action: '进入账户概览', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['账户概览页面可见']
  }, '5'.repeat(64))
  assert.equal(plan.actions.some(action => action.instruction === '打开入口URL'), false)
  assert.equal(plan.actions.at(-2)?.instruction, '进入账户概览')
})

test('only an explicit controlled adapter binding uses the deterministic login template', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'd'.repeat(64),
    displayName: '复兴银行门户网站',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开复兴银行门户并登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'NONE' },
      // The controller may classify the semantic verification as MEDIUM even
      // though the deterministic executable template contains only LOW-risk,
      // allow-listed Playwright operations.
      { intentStepId: 'intent-002', action: '检查头像和姓名后进入个人资料', expected: '头像姓名一致', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['主页和个人资料的头像姓名一致']
  }, 'e'.repeat(64))
  assert.equal(plan.fixtureProfile, 'LOGIN_PROFILE')
  assert.ok(plan.actions.length > 6)
  assert.equal(plan.actions[0].routeRef, 'PORTAL_LOGIN')
})

test('generic operation classification never turns an expected clickable result into a download action', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '8'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '确认下载入口正确', expected: '下载入口存在且可点击', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['下载入口存在']
  }, '8'.repeat(64))
  const inspection = plan.actions.find(action => /确认下载入口/.test(action.instruction))
  assert.equal(inspection.operation, 'expectVisible')

  const corroborationPlan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002b', action: '核对文档标题、日期和下载入口', expected: '文档信息正确展示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['下载入口存在']
  }, '8'.repeat(64))
  assert.equal(corroborationPlan.actions.find(action => /核对文档标题/.test(action.instruction)).operation, 'expectVisible')
  const transactionInspectionPlan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002c', action: '校验交易日期、金额和状态可读', expected: '交易信息清晰可读', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['交易信息可读']
  }, '8'.repeat(64))
  assert.equal(transactionInspectionPlan.actions.find(action => /校验交易日期/.test(action.instruction)).operation, 'expectVisible')
  assert.equal(plan.actions.some(action => action.operation === 'download'), false)
})

test('a controlled adapter binding does not turn a document case into the login profile template', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'f'.repeat(64),
    displayName: '复兴银行门户网站',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'],
    allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884'],
    adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: '使用安全凭据登录', expected: '进入门户主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-002', action: '进入文档页面', expected: '文档页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '查询一份文档', expected: '查询到账户文档', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-004', action: '确认文档标题、日期和下载入口正确', expected: '文档信息正确展示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['文档标题、日期和下载入口正确']
  }, 'f'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.ok(plan.actions.some(action => /查询一份文档/.test(action.instruction)))
  assert.equal(plan.actions.some(action => action.semanticTargetRef === 'HEADER_DISPLAY_NAME'), false)
})

test('I10 controlled transfer compiles only frozen typed business inputs', () => {
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: 'http://127.0.0.1:18082/portal/login',
    executionProfile: 'TRANSFER_UKEY_ORDER_QUERY',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    inputContractVersion: 'TypedBusinessInputsV1',
    typedBusinessInputs: {
      schemaVersion: 'hengzhun-i10-typed-business-inputs-v1',
      values: { payeeRef: 'payee_demo_0001', amount: '1.00', currency: 'CNY', purpose: '自动化回归测试' },
      source: 'USER_CONFIRMED'
    },
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '选择已登记收款人，填写金额 1.00，用途为自动化回归测试', expected: '转账摘要显示金额和用途', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['转账受理成功并显示单号']
  }, 'a'.repeat(64))
  assert.equal(plan.fixtureProfile, 'TRANSFER_UKEY_ORDER_QUERY')
  assert.equal(plan.fixtureValues['TRANSFER.AMOUNT'], '1.00')
  assert.equal(plan.fixtureValues['TRANSFER.PURPOSE'], '自动化回归测试')
  assert.equal(plan.fixtureValues['TRANSFER.PAYEE_REF'], 'payee_demo_0001')
  assert.equal(plan.fixtureValues['TRANSFER.CURRENCY'], 'CNY')
})

test('approved Fuxing adapter plus typed transfer inputs overrides a controller generic profile', () => {
  const targetProfileSnapshot = {
    schemaVersion: 'hengzhun-target-profile-v1',
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: '9'.repeat(64), launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'], allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884'], adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: targetProfileSnapshot.launchUrl, executionProfile: 'GENERIC_WEB', adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    targetProfileId: targetProfileSnapshot.targetProfileId, targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash, targetProfileSnapshot,
    inputContractVersion: 'TypedBusinessInputsV1',
    typedBusinessInputs: {
      schemaVersion: 'hengzhun-i10-typed-business-inputs-v1',
      values: { payeeRef: 'payee_demo_0001', amount: '1.00', currency: 'CNY', purpose: '自动化回归测试' },
      source: 'USER_CONFIRMED'
    },
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '提交转账并完成首次确认', expected: '进入网页验证或单号查询流程', riskLevel: 'HIGH', inputValueSource: 'NONE' }
    ],
    assertions: ['转账首次确认完成并进入单号查询']
  }, '9'.repeat(64))
  assert.equal(plan.fixtureProfile, 'TRANSFER_UKEY_ORDER_QUERY')
  assert.ok(plan.actions.some(action => action.semanticTargetRef === 'TRANSFER_FIRST_CONFIRM'))
  assert.ok(plan.actions.some(action => action.semanticTargetRef === 'ORDER_NUMBER'))
})

test('I10 controlled transfer rejects prose-only business inputs', () => {
  assert.throws(() => compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: 'http://127.0.0.1:18082/portal/login',
    executionProfile: 'TRANSFER_UKEY_ORDER_QUERY',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    inputContractVersion: 'TypedBusinessInputsV1',
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '选择收款人并填写金额 1.00，用途为自动化回归测试', expected: '转账摘要显示', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['转账受理成功并显示单号']
  }, 'typed'.repeat(16)), /转账计划缺少payeeRef/)
})

test('controlled transfer still fails closed when a labelled amount or purpose is absent', () => {
  assert.throws(() => compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: 'http://127.0.0.1:18082/portal/login',
    executionProfile: 'TRANSFER_UKEY_ORDER_QUERY',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '填写转账信息', expected: '转账摘要显示', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['转账受理成功并显示单号']
  }, 'b'.repeat(64)), /I10_TRANSFER_INPUT_VALUE_REQUIRED:TRANSFER\.AMOUNT/)
})

test('a Fuxing-looking name and portal route without an adapter binding stays generic', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: '6'.repeat(64), displayName: '复兴银行门户网站', launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'], allowedInteractionOrigins: ['http://127.0.0.1:28884'], credentialOrigins: ['http://127.0.0.1:28884'],
    adapterBinding: null
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [{ intentStepId: 'intent-001', action: '打开门户并登录', expected: '登录成功', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' }],
    assertions: ['主页可见']
  }, '7'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.equal(plan.actions[0].routeRef, 'LAUNCH_URL')
})
