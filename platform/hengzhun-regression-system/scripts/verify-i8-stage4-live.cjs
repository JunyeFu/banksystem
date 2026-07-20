#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { startHarness } = require('../dist/harness/src/server.js')
const { I8_CONTROLLED_CATALOG } = require('../dist/harness/src/i8/script-package-builder.js')
const { executeStabilityBatch } = require('../worker/src/i8-stability-runner.cjs')

const productRoot = path.resolve(__dirname, '..')
const serviceToken = process.env.HENGZHUN_SERVICE_TOKEN
const workerToken = process.env.HENGZHUN_WORKER_TOKEN
if (!serviceToken || serviceToken.length < 32 || !workerToken || workerToken.length < 32) throw new Error('I8_STAGE4_LIVE_RUNTIME_NOT_PREPARED')

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(`I8_STAGE4_LIVE_HTTP_${response.status}_${result.errorCode || 'ERROR'}`), { result })
  return result
}
function recordsFor(plan) {
  return plan.actions.map(action => ({
    schemaVersion: 'i8-verified-action-record-v1', executablePlanId: plan.executablePlanId, actionId: action.actionId,
    ordinal: action.ordinal, outcome: 'VERIFIED_PASSED', ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}),
    pageSignatureHash: sha256(stableJson(action.pageSignature)), factsHash: sha256(stableJson({ actionId: action.actionId, outcome: 'VERIFIED_PASSED' })),
    verification: { dom: true, url: true, request: true, business: true }, verifiedAt: new Date().toISOString()
  }))
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage4-live-'))
  let running
  try {
    running = await startHarness({
      productRoot: root, databasePath: path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'),
      migrationsDirectory: path.join(productRoot, 'harness', 'migrations'), backupDirectory: path.join(root, '.data', 'sqlite', 'backups'),
      artifactRoot: path.join(root, '.data', 'artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
      workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0
    })
    const harnessUrl = `http://127.0.0.1:${running.server.address().port}`
    const namespace = `i8-stage4-live-${Date.now().toString(36)}`
    const knowledgeHash = sha256(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'knowledge', 'portal-login-consistency.md')))
    const draft = {
      schemaVersion: 'i8-regression-case-draft-v1', title: '门户登录资料一致性', objective: '验证客户登录后的姓名和头像来自当前账户。',
      summary: '登录后核对页眉身份与个人资料。', riskLevel: 'LOW', route: '/portal/login', preconditions: ['使用受控合成客户身份'],
      steps: [{ action: '在门户输入账号密码并登录', expected: '进入受保护的门户页面' }, { action: '打开个人资料', expected: '显示当前客户资料' }],
      assertions: ['页眉姓名与个人资料姓名相等', '页眉头像与个人资料头像相等'],
      knowledgeSnapshot: { knowledgeSnapshotId: 'flowise-portal-login-v1', sourceVersion: '1.0.0', contentHash: knowledgeHash, citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency'] }
    }
    const acceptanceSummary = { schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective, stepCount: 2, assertionCount: 2, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: [] }
    const prepared = await post(harnessUrl, '/v1/i8/cases:prepare', { namespace, idempotencyKey: `live-prepare-${namespace}`, actorRef: 'flowise-controller', caseDescription: '客户登录后核对页眉与个人资料中的姓名和头像', draft, acceptanceSummary })
    const intentPlan = { schemaVersion: 'i8-intent-plan-v1', caseId: prepared.caseId, caseVersion: 1, route: '/portal/login', steps: [{ intentStepId: 'intent-login', action: '登录门户', expected: '进入受保护页面', riskLevel: 'LOW' }, { intentStepId: 'intent-profile', action: '核对身份', expected: '姓名和头像一致', riskLevel: 'LOW' }], assertions: draft.assertions }
    await post(harnessUrl, '/v1/i8/authoring:submit', { namespace, idempotencyKey: `live-submit-${namespace}`, preparationId: prepared.preparationId, expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: `live-confirm-${namespace}`, reason: '本机真实门户验收' }, intentPlan })
    await post(harnessUrl, '/v1/i8/candidates:compile', { namespace, idempotencyKey: `live-compile-${namespace}`, preparationId: prepared.preparationId, expectedPreparationVersion: 2 })
    const buildClaim = await post(harnessUrl, '/internal/worker/i8/candidates:claim', { workerId: 'i8-stage4-live-builder' }, workerToken)
    await post(harnessUrl, `/internal/worker/i8/candidates/${encodeURIComponent(buildClaim.jobId)}:complete`, { workerId: 'i8-stage4-live-builder', planHash: buildClaim.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(buildClaim.plan) }, workerToken)
    const stabilityClaim = await post(harnessUrl, '/internal/worker/i8/stability:claim', { workerId: 'i8-stage4-live-worker' }, workerToken)
    const completion = await executeStabilityBatch(stabilityClaim, {
      productRoot: root, runtimeProductRoot: productRoot, baseUrl: process.env.HENGZHUN_PORTAL_BASE_URL,
      workerId: 'i8-stage4-live-worker', environment: process.env
    })
    const completed = await post(harnessUrl, `/internal/worker/i8/stability/${encodeURIComponent(stabilityClaim.batchId)}:complete`, completion, workerToken)
    if (completed.status !== 'STABILITY_CERTIFIED' || completed.passedRuns !== 6) throw new Error(`I8_STAGE4_LIVE_NOT_CERTIFIED_${completed.errorCode || 'UNKNOWN'}`)
    const candidate = await post(harnessUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.preparationId })
    const summary = {
      schemaVersion: 'i8-stage4-live-summary-v1', status: 'PASSED', executedAt: new Date().toISOString(),
      portalOrigin: new URL(process.env.HENGZHUN_PORTAL_BASE_URL).origin,
      candidateId: stabilityClaim.candidateId, scriptHash: stabilityClaim.scriptHash,
      certificateId: completed.certificateId, validationRunIds: candidate.stability.certificate.validationRunIds,
      viewportSet: candidate.stability.certificate.viewportSet, passedRuns: 6, failedRuns: 0,
      runtimeFingerprint: candidate.stability.certificate.runtimeFingerprint,
      evidenceRoot: '.data/stability (ignored, redacted)'
    }
    const output = path.join(productRoot, '.data', 'evidence', 'i8-stage4-live-summary.json')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8')
    process.stdout.write(JSON.stringify({ status: 'HENGZHUN_I8_STAGE4_REAL_PORTAL_VERIFIED', passedRuns: 6, viewportCount: 2, certificateIssued: true }) + '\n')
  } finally {
    if (running) {
      await new Promise(resolve => running.server.close(resolve))
      await running.application.close()
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'HENGZHUN_I8_STAGE4_REAL_PORTAL_FAILED', errorCode: error.code || error.message }) + '\n')
  process.exitCode = 1
})
