#!/usr/bin/env node
'use strict'

// Live local acceptance for the second browser case: a DPAPI-backed customer
// logs in, opens an owned account, then verifies a fabricated foreign account
// is rejected.  Credentials only exist in the Worker call stack.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const adapter = require('../worker/src/adapters/fuxing-bank-demo/account-ownership.cjs')

const root = path.resolve(__dirname, '..')
const scenarioPath = path.join(root, '.data', 'tests', 'i10-stage8-live', 'scenario.json')
const evidencePath = path.join(root, '.data', 'evidence', 'i10', 'gz06-account-ownership', 'result.json')
let phase = 'STARTUP'

function fail(code) { const error = new Error(code); error.code = code; throw error }
function loadRuntimeEnvironment() {
  const source = path.join(root, '.data', 'runtime.env')
  if (!fs.existsSync(source)) fail('I10_GZ06_RUNTIME_ENV_MISSING')
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
async function resolveCredential() {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
  const credentialRef = String(scenario.credentialRef || '')
  if (!/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) fail('I10_GZ06_CREDENTIAL_REF_MISSING')
  const response = await fetch(`${String(process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '')}/internal/worker/i10/credentials:resolve`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.HENGZHUN_WORKER_TOKEN || ''}`, 'content-type': 'application/json' },
    body: JSON.stringify({ namespace: 'hengzhun-local', credentialRef }), signal: AbortSignal.timeout(30_000)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result?.username || !result?.password) fail('I10_GZ06_CREDENTIAL_RESOLVE_FAILED')
  return { username: result.username, password: result.password }
}
function receipt(result) {
  const evidence = Array.isArray(result?.evidence) ? result.evidence : []
  return {
    outcome: String(result?.outcome || ''), evidenceTypes: evidence.map(item => String(item?.artifactType || '')).sort(),
    evidenceSha256: crypto.createHash('sha256').update(JSON.stringify(evidence.map(item => ({ artifactType: item?.artifactType, metadata: item?.metadata })))).digest('hex')
  }
}
async function main() {
  phase = 'LOAD_RUNTIME'
  loadRuntimeEnvironment()
  phase = 'RESOLVE_CREDENTIAL'
  const credential = await resolveCredential()
  try {
    phase = 'EXECUTE_ADAPTER'
    const result = await adapter.executeAccountOwnership({
      namespace: 'i10-gz06-account-ownership', caseId: 'gz06-account-ownership', caseVersion: 1,
      runId: `run-gz06-${crypto.randomUUID()}`, taskId: `task-gz06-${crypto.randomUUID()}`,
      execution: { credentialAlias: 'i3-customer', fixtureNamespace: 'fx-gz06-account-ownership' }
    }, process.env, { credential })
    if (result?.outcome !== 'PASSED') fail('I10_GZ06_ACCOUNT_OWNERSHIP_FAILED')
    phase = 'WRITE_EVIDENCE'
    const evidence = { schemaVersion: 'hengzhun-i10-gz06-account-ownership-evidence-v1', mock: false, degraded: false, status: 'PASSED', adapterId: 'fuxing-bank-demo', receipt: receipt(result), completedAt: new Date().toISOString() }
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } finally { credential.username = ''; credential.password = '' }
}
main().catch(error => {
  const diagnostics = (Array.isArray(error?.evidence) ? error.evidence : []).filter(item => item?.artifactType === 'DIAGNOSTIC').map(item => {
    try {
      const value = JSON.parse(Buffer.from(String(item.base64Content || ''), 'base64').toString('utf8'))
      return { errorCode: String(value?.errorCode || ''), pagePath: String(value?.pagePath || ''), completedSteps: Array.isArray(value?.completedSteps) ? value.completedSteps.map(step => ({ step: String(step?.step || ''), passed: step?.passed === true })) : [] }
    } catch { return { errorCode: 'I10_GZ06_DIAGNOSTIC_UNREADABLE' } }
  })
  const failure = { schemaVersion: 'hengzhun-i10-gz06-account-ownership-evidence-v1', mock: false, degraded: false, status: 'FAILED', errorCode: String(error?.code || 'I10_GZ06_FAILED').replace(/[^A-Z0-9_]/g, '_').slice(0, 160), failurePhase: phase, ...(diagnostics.length ? { diagnostics } : {}), completedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true }); fs.writeFileSync(evidencePath, `${JSON.stringify(failure, null, 2)}\n`); process.stderr.write(`${JSON.stringify(failure)}\n`); process.exitCode = 2
})
