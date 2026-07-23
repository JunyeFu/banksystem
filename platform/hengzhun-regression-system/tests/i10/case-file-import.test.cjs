'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { parseCaseFile } = require('../../dist/harness/src/i10/case-file-parser.js')
const { encodeFlowiseAttachmentReference } = require('../../dist/harness/src/i10/flowise-attachment-ref.js')
const { startHarness } = require('../../dist/harness/src/server.js')

const productRoot = path.resolve(__dirname, '../..')
const serviceToken = 'synthetic-i10-import-service-token-00001'
const workerToken = 'synthetic-i10-import-worker-token-000002'
const credentialRef = 'credential_00000000-0000-4000-8000-000000000010'
const options = { flowiseFileRef: 'flowise-file-0001', credentialRef, targetSystemHint: '复兴银行门户', entryUrlHint: 'http://127.0.0.1:18082/portal/login' }
const record = {
  '案例名称': '门户登录资料一致性', '测试目标': '验证当前账户资料', '描述': '登录后核对页眉与个人资料',
  '前置条件': '门户可访问', '执行步骤': '输入账号密码并登录；打开个人资料', '预期结果': '进入门户；姓名头像一致', '断言': '姓名一致；头像一致'
}

async function makeDocx(target) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  const lines = Object.entries(record).map(([key, value]) => `<w:p><w:r><w:t>${key}：${value}</w:t></w:r></w:p>`).join('')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines}</w:body></w:document>`)
  fs.writeFileSync(target, await zip.generateAsync({ type: 'nodebuffer' }))
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { response, body: await response.json() }
}

async function apiFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-import-api-'))
  const running = await startHarness({ productRoot: root, databasePath: path.join(root, '.data/sqlite/platform.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, '.data/backups'), artifactRoot: path.join(root, '.data/artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] }, workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0 })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  const attachmentRoot = path.join(root, '.data/flowise-attachments')
  fs.mkdirSync(attachmentRoot, { recursive: true })
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, running, baseUrl, attachmentRoot }
}

async function createCredential(baseUrl, namespace) {
  const created = await post(baseUrl, '/v1/i10/credentials:sessions-create', { namespace, idempotencyKey: `credential-session-${namespace}`, label: '案例导入测试凭据' })
  const captureUrl = new URL(created.body.captureUrl)
  const stored = await fetch(`${baseUrl}${captureUrl.pathname.replace(/\/form$/, ':store')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captureToken: captureUrl.hash.slice('#token='.length), username: 'fixture-user', password: 'fixture-password' }) })
  assert.equal(stored.status, 200)
  return (await stored.json()).credentialRef
}

function controlledPath(attachmentRoot, ref, filename) {
  const directory = path.join(attachmentRoot, ref)
  fs.mkdirSync(directory, { recursive: true })
  return path.join(directory, filename)
}

async function writeCaseFixture(target, extension) {
  if (extension === 'csv') fs.writeFileSync(target, `${Object.keys(record).join(',')}\n${Object.values(record).map(value => `"${value}"`).join(',')}\n`, 'utf8')
  else if (extension === 'json') fs.writeFileSync(target, JSON.stringify(record), 'utf8')
  else if (extension === 'xlsx') { const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('案例'); sheet.addRow(Object.keys(record)); sheet.addRow(Object.values(record)); await workbook.xlsx.writeFile(target) }
  else await makeDocx(target)
}

test('CSV JSON XLSX and DOCX converge on the same governed CaseDraft', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-import-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'case.csv'), `${Object.keys(record).join(',')}\n${Object.values(record).map(value => `"${value}"`).join(',')}\n`, 'utf8')
  fs.writeFileSync(path.join(root, 'case.json'), JSON.stringify(record), 'utf8')
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('案例'); sheet.addRow(Object.keys(record)); sheet.addRow(Object.values(record)); await workbook.xlsx.writeFile(path.join(root, 'case.xlsx'))
  await makeDocx(path.join(root, 'case.docx'))
  for (const extension of ['csv', 'json', 'xlsx', 'docx']) {
    const parsed = await parseCaseFile(path.join(root, `case.${extension}`), options)
    assert.equal(parsed.drafts.length, 1, extension)
    const draft = parsed.drafts[0]
    assert.equal(draft.schemaVersion, 'hengzhun-i10-case-draft-v1')
    assert.equal(draft.source.inputType, 'CASE_FILE')
    assert.equal(draft.credentialRef, credentialRef)
    assert.deepEqual(draft.missingFields, [])
    assert.equal(draft.authoringStrategy, 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY')
  }
})

test('active-content and unsupported formats fail closed', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-reject-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const name of ['case.xls', 'case.xlsm', 'case.docm', 'case.txt']) fs.writeFileSync(path.join(root, name), 'not trusted')
  await assert.rejects(parseCaseFile(path.join(root, 'case.xls'), options), /I10_CASE_FILE_ACTIVE_CONTENT_REJECTED/)
  await assert.rejects(parseCaseFile(path.join(root, 'case.xlsm'), options), /I10_CASE_FILE_ACTIVE_CONTENT_REJECTED/)
  await assert.rejects(parseCaseFile(path.join(root, 'case.docm'), options), /I10_CASE_FILE_ACTIVE_CONTENT_REJECTED/)
  await assert.rejects(parseCaseFile(path.join(root, 'case.txt'), options), /I10_CASE_FILE_FORMAT_UNSUPPORTED/)
})

test('four governed file formats complete the API submit/get/confirm path with strict idempotency', { timeout: 120000 }, async t => {
  const { baseUrl, attachmentRoot } = await apiFixture(t)
  const namespace = 'i10-api-import'
  const storedCredentialRef = await createCredential(baseUrl, namespace)
  for (const extension of ['csv', 'json', 'xlsx', 'docx']) {
    const flowiseFileRef = `flowise-api-${extension}-0001`
    const originalFilename = `case.${extension}`
    await writeCaseFixture(controlledPath(attachmentRoot, flowiseFileRef, originalFilename), extension)
    const request = { namespace, idempotencyKey: `submit-${extension}-00000001`, inputType: 'CASE_FILE', flowiseFileRef, originalFilename, credentialRef: storedCredentialRef, targetSystemHint: '复兴银行门户', entryUrlHint: 'http://127.0.0.1:18082/portal/login' }
    const submitted = await post(baseUrl, '/v1/i10/ingest:submit', request)
    assert.equal(submitted.response.status, 202, JSON.stringify(submitted.body))
    assert.equal(submitted.body.status, 'WAITING_USER')
    assert.equal(submitted.body.draftCount, 1)
    const replay = await post(baseUrl, '/v1/i10/ingest:submit', request)
    assert.deepEqual(replay.body, submitted.body)
    const conflict = await post(baseUrl, '/v1/i10/ingest:submit', { ...request, originalFilename: `different.${extension}` })
    assert.equal(conflict.response.status, 409)
    assert.equal(conflict.body.errorCode, 'IDEMPOTENCY_CONFLICT')
    const fetched = await post(baseUrl, '/v1/i10/ingest:get', { namespace, ingestJobId: submitted.body.ingestJobId })
    assert.equal(fetched.body.items[0].draft.source.inputType, 'CASE_FILE')
    const decision = { namespace, idempotencyKey: `confirm-${extension}-0000001`, ingestJobId: submitted.body.ingestJobId, expectedVersion: 1, choice: 'CONFIRM', corrections: [], reason: '用户确认导入内容', confirmationRef: `confirm-ref-${extension}-0001` }
    const confirmed = await post(baseUrl, '/v1/i10/ingest:decide', decision)
    assert.equal(confirmed.body.status, 'CONFIRMED', JSON.stringify(confirmed.body))
    assert.match(confirmed.body.cases[0].preparationId, /^prep_/)
    const decisionReplay = await post(baseUrl, '/v1/i10/ingest:decide', decision)
    assert.deepEqual(decisionReplay.body, confirmed.body)
    const decisionConflict = await post(baseUrl, '/v1/i10/ingest:decide', { ...decision, reason: '不同请求内容' })
    assert.equal(decisionConflict.response.status, 409)
    assert.equal(decisionConflict.body.errorCode, 'IDEMPOTENCY_CONFLICT')
  }
})

test('corrections are versioned and incomplete or stale decisions fail closed', { timeout: 60000 }, async t => {
  const { baseUrl, attachmentRoot } = await apiFixture(t)
  const namespace = 'i10-api-correction'
  const storedCredentialRef = await createCredential(baseUrl, namespace)
  const flowiseFileRef = 'flowise-correction-0001'
  const originalFilename = 'incomplete.csv'
  fs.writeFileSync(controlledPath(attachmentRoot, flowiseFileRef, originalFilename), '案例名称,测试步骤,预期结果\n待修正案例,打开门户,门户可见\n', 'utf8')
  const submitted = await post(baseUrl, '/v1/i10/ingest:submit', { namespace, idempotencyKey: 'submit-correction-0001', inputType: 'CASE_FILE', flowiseFileRef, originalFilename, credentialRef: storedCredentialRef })
  assert.deepEqual(submitted.body.missingFields.sort(), ['entryUrl', 'targetSystem'])
  const premature = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'premature-confirm-0001', ingestJobId: submitted.body.ingestJobId, expectedVersion: 1, choice: 'CONFIRM', corrections: [], reason: '错误地提前确认', confirmationRef: 'premature-ref-0001' })
  assert.equal(premature.response.status, 409)
  assert.equal(premature.body.errorCode, 'I10_INGEST_INFORMATION_INCOMPLETE')
  const correctedDraft = { ...submitted.body.items[0].draft, targetSystem: '复兴银行门户', entryUrl: 'http://127.0.0.1:18082/portal/login', missingFields: [] }
  const corrected = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'correct-decision-0001', ingestJobId: submitted.body.ingestJobId, expectedVersion: 1, choice: 'CORRECT', corrections: [{ ordinal: 1, draft: correctedDraft }], reason: '补齐目标系统与入口', confirmationRef: 'correction-ref-0001' })
  assert.equal(corrected.body.version, 2)
  const stale = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'stale-decision-000001', ingestJobId: submitted.body.ingestJobId, expectedVersion: 1, choice: 'CONFIRM', corrections: [], reason: '使用旧版本确认', confirmationRef: 'stale-ref-0000001' })
  assert.equal(stale.response.status, 409)
  assert.equal(stale.body.errorCode, 'I10_INGEST_VERSION_CONFLICT')
  const confirmed = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'correct-confirm-000001', ingestJobId: submitted.body.ingestJobId, expectedVersion: 2, choice: 'CONFIRM', corrections: [], reason: '确认修正后的案例', confirmationRef: 'correct-confirm-ref-01' })
  assert.equal(confirmed.body.status, 'CONFIRMED')
})

test('mixed batches expose field mappings and require every record error to be resolved before confirmation', { timeout: 60000 }, async t => {
  const { baseUrl, attachmentRoot } = await apiFixture(t)
  const namespace = 'i10-api-batch-report'
  const storedCredentialRef = await createCredential(baseUrl, namespace)
  const flowiseFileRef = 'flowise-batch-report-0001'
  const originalFilename = 'mixed.json'
  const invalid = { ...record, '案例名称': '超'.repeat(200) }
  fs.writeFileSync(controlledPath(attachmentRoot, flowiseFileRef, originalFilename), JSON.stringify([record, invalid]))
  const submitted = await post(baseUrl, '/v1/i10/ingest:submit', { namespace, idempotencyKey: 'submit-batch-report-0001', inputType: 'CASE_FILE', flowiseFileRef, originalFilename, credentialRef: storedCredentialRef, targetSystemHint: '复兴银行门户', entryUrlHint: 'http://127.0.0.1:18082/portal/login' })
  assert.equal(submitted.response.status, 202, JSON.stringify(submitted.body))
  assert.equal(submitted.body.draftCount, 1)
  assert.equal(submitted.body.items[0].ordinal, 1)
  assert.equal(submitted.body.errors.length, 1)
  assert.equal(submitted.body.errors[0].ordinal, 2)
  assert.equal(submitted.body.errors[0].errorCode, 'I10_CASE_FILE_RECORD_INVALID')
  assert.equal(submitted.body.errors[0].resolved, false)
  assert.equal(submitted.body.fieldMappings.some(mapping => mapping.sourceField === '案例名称' && mapping.canonicalField === 'title'), true)
  assert.equal(submitted.body.fieldMappings.some(mapping => mapping.sourceField === '执行步骤' && mapping.canonicalField === 'steps'), true)
  const blocked = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'confirm-batch-blocked-01', ingestJobId: submitted.body.ingestJobId, expectedVersion: 1, choice: 'CONFIRM', corrections: [], reason: '错误地忽略批量错误', confirmationRef: 'batch-blocked-ref-01' })
  assert.equal(blocked.response.status, 409)
  assert.equal(blocked.body.errorCode, 'I10_INGEST_BATCH_ERRORS_UNRESOLVED')
  const correctedDraft = { ...submitted.body.items[0].draft, title: '修正后的第二个案例', source: { ...submitted.body.items[0].draft.source, provenanceSummary: '用户修正受控案例文件第2项' } }
  const corrected = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'correct-batch-report-001', ingestJobId: submitted.body.ingestJobId, expectedVersion: 1, choice: 'CORRECT', corrections: [{ ordinal: 2, draft: correctedDraft }], reason: '补齐无效记录', confirmationRef: 'batch-correct-ref-001' })
  assert.equal(corrected.body.status, 'WAITING_USER')
  assert.equal(corrected.body.version, 2)
  const reviewed = await post(baseUrl, '/v1/i10/ingest:get', { namespace, ingestJobId: submitted.body.ingestJobId })
  assert.equal(reviewed.body.items.length, 2)
  assert.equal(reviewed.body.errors[0].resolved, true)
  const confirmed = await post(baseUrl, '/v1/i10/ingest:decide', { namespace, idempotencyKey: 'confirm-batch-report-01', ingestJobId: submitted.body.ingestJobId, expectedVersion: 2, choice: 'CONFIRM', corrections: [], reason: '确认全部记录及修正', confirmationRef: 'batch-confirm-ref-01' })
  assert.equal(confirmed.body.status, 'CONFIRMED', JSON.stringify(confirmed.body))
  assert.equal(confirmed.body.cases.length, 2)
})

test('Flowise managed upload metadata resolves inside the exact org, flow and chat boundary', { timeout: 60000 }, async t => {
  const { root, baseUrl } = await apiFixture(t)
  const namespace = 'i10-flowise-managed-upload'
  const storedCredentialRef = await createCredential(baseUrl, namespace)
  const descriptor = {
    version: 1,
    orgId: 'org_00000000-0000-4000-8000-000000000010',
    chatflowId: '7c14bafe-4c5b-4b4e-9d5a-000000000010',
    chatId: 'chat_00000000-0000-4000-8000-000000000010',
    filename: 'flowise-managed.csv'
  }
  const storageDirectory = path.join(root, '.data/flowise/storage', descriptor.orgId, descriptor.chatflowId, descriptor.chatId)
  fs.mkdirSync(storageDirectory, { recursive: true })
  await writeCaseFixture(path.join(storageDirectory, descriptor.filename), 'csv')
  const flowiseFileRef = encodeFlowiseAttachmentReference(descriptor)
  const submitted = await post(baseUrl, '/v1/i10/ingest:submit', {
    namespace,
    idempotencyKey: 'flowise-managed-submit-0001',
    inputType: 'CASE_FILE',
    flowiseFileRef,
    originalFilename: descriptor.filename,
    credentialRef: storedCredentialRef,
    targetSystemHint: '复兴银行门户',
    entryUrlHint: 'http://127.0.0.1:18082/portal/login'
  })
  assert.equal(submitted.response.status, 202, JSON.stringify(submitted.body))
  assert.equal(submitted.body.status, 'WAITING_USER')

  const mismatched = await post(baseUrl, '/v1/i10/ingest:submit', {
    namespace,
    idempotencyKey: 'flowise-managed-mismatch-1',
    inputType: 'CASE_FILE',
    flowiseFileRef,
    originalFilename: 'different.csv'
  })
  assert.equal(mismatched.response.status, 409)
  assert.equal(mismatched.body.errorCode, 'I10_FLOWISE_ATTACHMENT_NAME_MISMATCH')

  const malformed = await post(baseUrl, '/v1/i10/ingest:submit', {
    namespace,
    idempotencyKey: 'flowise-managed-malformed-1',
    inputType: 'CASE_FILE',
    flowiseFileRef: 'flowise-v1.invalid_base64url',
    originalFilename: descriptor.filename
  })
  assert.equal(malformed.response.status, 400)
  assert.equal(malformed.body.errorCode, 'I10_FLOWISE_FILE_REF_INVALID')
})

test('controlled attachment boundary, archive safety, size and case-count limits fail closed', { timeout: 120000 }, async t => {
  const { root, baseUrl, attachmentRoot } = await apiFixture(t)
  const namespace = 'i10-api-rejections'
  const common = { namespace, inputType: 'CASE_FILE', targetSystemHint: '复兴银行门户', entryUrlHint: 'http://127.0.0.1:18082/portal/login' }
  const traversed = await post(baseUrl, '/v1/i10/ingest:submit', { ...common, idempotencyKey: 'reject-traversal-0001', flowiseFileRef: 'flowise-reject-0001', originalFilename: '..\\escape.csv' })
  assert.equal(traversed.response.status, 400)
  assert.equal(traversed.body.errorCode, 'I10_ATTACHMENT_FILENAME_INVALID')

  const outside = path.join(root, 'outside-controlled-root')
  fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'case.csv'), 'a,b\n1,2\n')
  const linkedRef = path.join(attachmentRoot, 'flowise-linked-0001')
  fs.symlinkSync(outside, linkedRef, 'junction')
  const escaped = await post(baseUrl, '/v1/i10/ingest:submit', { ...common, idempotencyKey: 'reject-symlink-000001', flowiseFileRef: 'flowise-linked-0001', originalFilename: 'case.csv' })
  assert.equal(escaped.response.status, 400)
  assert.equal(escaped.body.errorCode, 'I10_FLOWISE_ATTACHMENT_ESCAPE_REJECTED')

  const oversizedRef = 'flowise-oversized-0001'; fs.writeFileSync(controlledPath(attachmentRoot, oversizedRef, 'case.json'), '{}'); fs.truncateSync(controlledPath(attachmentRoot, oversizedRef, 'case.json'), 20 * 1024 * 1024 + 1)
  const oversized = await post(baseUrl, '/v1/i10/ingest:submit', { ...common, idempotencyKey: 'reject-oversized-0001', flowiseFileRef: oversizedRef, originalFilename: 'case.json' })
  assert.equal(oversized.response.status, 413)

  const malformedRef = 'flowise-malformed-0001'; fs.writeFileSync(controlledPath(attachmentRoot, malformedRef, 'case.xlsx'), 'not-an-office-archive')
  const malformed = await post(baseUrl, '/v1/i10/ingest:submit', { ...common, idempotencyKey: 'reject-malformed-0001', flowiseFileRef: malformedRef, originalFilename: 'case.xlsx' })
  assert.equal(malformed.response.status, 400)
  assert.equal(malformed.body.errorCode, 'I10_CASE_FILE_ARCHIVE_INVALID')

  const macroRef = 'flowise-macro-0000001'; const macroZip = new JSZip(); macroZip.file('xl/workbook.xml', '<workbook/>'); macroZip.file('xl/vbaProject.bin', 'macro'); fs.writeFileSync(controlledPath(attachmentRoot, macroRef, 'case.xlsx'), await macroZip.generateAsync({ type: 'nodebuffer' }))
  const macro = await post(baseUrl, '/v1/i10/ingest:submit', { ...common, idempotencyKey: 'reject-macro-00000001', flowiseFileRef: macroRef, originalFilename: 'case.xlsx' })
  assert.equal(macro.response.status, 400)
  assert.equal(macro.body.errorCode, 'I10_CASE_FILE_ACTIVE_CONTENT_REJECTED')

  const countRef = 'flowise-count-0000001'; const cases = Array.from({ length: 1001 }, (_, index) => ({ ...record, '案例名称': `案例${index + 1}` })); fs.writeFileSync(controlledPath(attachmentRoot, countRef, 'case.json'), JSON.stringify(cases))
  const tooMany = await post(baseUrl, '/v1/i10/ingest:submit', { ...common, idempotencyKey: 'reject-count-00000001', flowiseFileRef: countRef, originalFilename: 'case.json' })
  assert.equal(tooMany.response.status, 400)
  assert.equal(tooMany.body.errorCode, 'I10_CASE_FILE_CASE_COUNT_INVALID')
})
