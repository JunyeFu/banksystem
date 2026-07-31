#!/usr/bin/env node
'use strict'

// Live, local-only GZ-04 acceptance.  It proves that the controlled Fuxing
// demonstration implementation can run through both its explicit adapter
// module and the retained historical compatibility alias.  Credentials are
// loaded from the local runtime environment and never written to evidence.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const explicit = require('../worker/src/adapters/fuxing-bank-demo/login-profile.cjs')
const legacy = require('../worker/src/login-profile.cjs')
const evidencePath = path.join(root, '.data', 'evidence', 'i10', 'gz04-adapter-replay', 'result.json')

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function loadRuntimeEnvironment() {
  const source = path.join(root, '.data', 'runtime.env')
  if (!fs.existsSync(source)) fail('I10_GZ04_RUNTIME_ENV_MISSING')
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

async function resolveCurrentCredential() {
  const scenarioPath = path.join(root, '.data', 'tests', 'i10-stage8-live', 'scenario.json')
  if (!fs.existsSync(scenarioPath)) fail('I10_GZ04_SCENARIO_MISSING')
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
  const credentialRef = String(scenario.credentialRef || '')
  if (!/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) fail('I10_GZ04_CREDENTIAL_REF_MISSING')
  const baseUrl = String(process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/internal/worker/i10/credentials:resolve`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.HENGZHUN_WORKER_TOKEN || ''}`,
      'content-type': 'application/json'
    },
    // The local secure-credential form creates references in the product
    // namespace, independently of the acceptance fixture directory name.
    body: JSON.stringify({ namespace: 'hengzhun-local', credentialRef }),
    signal: AbortSignal.timeout(30_000)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.username || !body?.password) fail('I10_GZ04_CREDENTIAL_RESOLVE_FAILED')
  const credential = { username: body.username, password: body.password }
  const identityBaseUrl = String(process.env.HENGZHUN_IDENTITY_BASE_URL || 'http://127.0.0.1:19000').replace(/\/$/, '')
  const tokenBody = new URLSearchParams({
    grant_type: 'password', client_id: 'customer-portal', username: credential.username, password: credential.password, scope: 'openid profile'
  })
  const tokenResponse = await fetch(`${identityBaseUrl}/realms/bank-customer/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenBody, signal: AbortSignal.timeout(30_000)
  })
  body.username = ''
  body.password = ''
  if (!tokenResponse.ok) {
    credential.username = ''
    credential.password = ''
    fail('I10_GZ04_CREDENTIAL_REJECTED')
  }
  return credential
}

function safeReceipt(label, result) {
  const evidence = Array.isArray(result?.evidence) ? result.evidence : []
  return {
    label,
    outcome: String(result?.outcome || ''),
    evidenceCount: evidence.length,
    evidenceTypes: evidence.map(item => String(item?.artifactType || '')).sort(),
    evidenceSha256: crypto.createHash('sha256').update(JSON.stringify(evidence.map(item => ({
      artifactType: item?.artifactType,
      mediaType: item?.mediaType,
      metadata: item?.metadata
    })))).digest('hex')
  }
}

async function execute(label, implementation, credential) {
  const result = await implementation.executeLoginProfile({
    namespace: 'i10-gz04-adapter-replay',
    caseId: `gz04-${label}`,
    caseVersion: 1,
    runId: `run-gz04-${label}-${crypto.randomUUID()}`,
    taskId: `task-gz04-${label}-${crypto.randomUUID()}`,
    execution: {
      credentialAlias: 'i3-customer',
      fixtureNamespace: `gz04-${label}`
    }
  }, process.env, { credential })
  if (result?.outcome !== 'PASSED') fail(`I10_GZ04_${label.toUpperCase()}_REPLAY_FAILED`)
  return safeReceipt(label, result)
}

async function main() {
  loadRuntimeEnvironment()
  const credential = await resolveCurrentCredential()
  const explicitReceipt = await execute('explicit-adapter', explicit, credential)
  const legacyReceipt = await execute('legacy-compatibility-alias', legacy, credential)
  credential.username = ''
  credential.password = ''
  const receipt = {
    schemaVersion: 'hengzhun-i10-gz04-adapter-replay-evidence-v1',
    mock: false,
    degraded: false,
    status: 'PASSED',
    adapterId: 'fuxing-bank-demo',
    adapterVersion: '1.0.0',
    explicitReceipt,
    legacyReceipt,
    completedAt: new Date().toISOString()
  }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

main().catch(error => {
  const diagnostics = (Array.isArray(error?.evidence) ? error.evidence : [])
    .filter(item => item?.artifactType === 'DIAGNOSTIC' && item?.mediaType === 'application/json')
    .map(item => {
      try {
        const value = JSON.parse(Buffer.from(String(item.base64Content || ''), 'base64').toString('utf8'))
        return {
          errorCode: String(value?.errorCode || ''),
          errorCategory: String(value?.errorCategory || ''),
          pagePath: String(value?.pagePath || ''),
          loginRejected: Boolean(value?.loginError),
          completedSteps: Array.isArray(value?.completedSteps)
            ? value.completedSteps.map(step => ({ step: String(step?.step || ''), passed: step?.passed === true }))
            : []
        }
      } catch { return { errorCode: 'I10_GZ04_DIAGNOSTIC_UNREADABLE' } }
    })
  const failure = {
    schemaVersion: 'hengzhun-i10-gz04-adapter-replay-evidence-v1',
    mock: false,
    degraded: false,
    status: 'FAILED',
    errorCode: String(error?.code || 'I10_GZ04_ADAPTER_REPLAY_FAILED').replace(/[^A-Z0-9_]/g, '_').slice(0, 160),
    ...(diagnostics.length ? { diagnostics } : {}),
    completedAt: new Date().toISOString()
  }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8')
  process.stderr.write(`${JSON.stringify(failure)}\n`)
  process.exitCode = 2
})
