'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const release = require('../i10-agent-release-decision.cjs')

const root = path.resolve(__dirname, '..', '..')
const IDENTITY = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const identity = Object.freeze({ schemaVersion: 'hengzhun-i10-release-identity-v4', releaseStatus: 'FROZEN', identityHash: IDENTITY })
const ledger = Object.freeze({ releaseIdentityHash: IDENTITY, currentPassed: 18, required: 18, full18: true, checkpoints: 0 })

function passing(overrides = {}) {
  return {
    currentIdentity: () => identity,
    ledgerStatus: () => ledger,
    publicReadback: () => ({ runtime: 'CONTROLLER_V2_BOUND', releaseIdentityHash: IDENTITY }),
    verifySbom: async () => ({ status: 'CURRENT', releaseIdentityHash: IDENTITY }),
    runAudits: async () => ({ status: 'CURRENT', releaseIdentityHash: IDENTITY }),
    runDpapiDrill: async () => ({ status: 'RESTORED', cipher: 'WINDOWS_DPAPI_CURRENT_USER', releaseIdentityHash: IDENTITY }),
    ...overrides,
  }
}

test('incomplete ledger stops before public, audit or DPAPI gates', async () => {
  const calls = []
  const result = await release.evaluateReleaseEligibility({ deps: passing({
    ledgerStatus: () => ({ ...ledger, currentPassed: 17, full18: false }),
    publicReadback: () => calls.push('public'), runAudits: () => calls.push('audit'), runDpapiDrill: () => calls.push('dpapi'),
  }) })
  assert.equal(result.state, 'NOT_READY')
  assert.equal(result.failureCode, 'AGENT_RELEASE_LEDGER_INCOMPLETE')
  assert.deepEqual(calls, [])
})

test('all machine gates and final readback yield human-decision eligibility without Flowise rollback', async () => {
  const result = await release.evaluateReleaseEligibility({ deps: passing() })
  assert.equal(result.state, 'ELIGIBLE_FOR_HUMAN_DECISION')
  assert.equal(result.machineGatesReady, true)
  assert.equal(result.nextGate, 'HUMAN_DECISION')
  assert.equal(result.gates.finalPublicReadback, 'PASSED')
  assert.equal(result.gates.humanDecision, 'PENDING')
  assert.equal(Object.values(result).includes('GO'), false)
})

test('eligibility performs both initial and final public readback', async () => {
  let reads = 0
  const result = await release.evaluateReleaseEligibility({ deps: passing({
    publicReadback: () => { reads += 1; return { runtime: 'CONTROLLER_V2_BOUND', releaseIdentityHash: IDENTITY } },
  }) })
  assert.equal(result.state, 'ELIGIBLE_FOR_HUMAN_DECISION')
  assert.equal(result.gates.finalPublicReadback, 'PASSED')
  assert.equal(reads, 2)
})

test('final public readback drift fails closed', async () => {
  const drift = await release.evaluateReleaseEligibility({ deps: passing({
    finalPublicReadback: () => ({ runtime: 'CONTROLLER_V2_BOUND', releaseIdentityHash: OTHER }),
  }) })
  assert.equal(drift.state, 'NOT_READY')
  assert.equal(drift.failureCode, 'AGENT_RELEASE_FINAL_READBACK_MISMATCH')
})

for (const [name, override, code] of [
  ['stale ledger identity', { ledgerStatus: () => ({ ...ledger, releaseIdentityHash: OTHER }) }, 'AGENT_RELEASE_LEDGER_IDENTITY_MISMATCH'],
  ['public readback drift', { publicReadback: () => ({ runtime: 'CONTROLLER_V2_BOUND', releaseIdentityHash: OTHER }) }, 'AGENT_RELEASE_PUBLIC_READBACK_MISMATCH'],
  ['stale SBOM', { verifySbom: async () => ({ status: 'STALE', releaseIdentityHash: IDENTITY }) }, 'AGENT_RELEASE_SBOM_STALE'],
  ['cross-identity audit', { runAudits: async () => ({ status: 'CURRENT', releaseIdentityHash: OTHER }) }, 'AGENT_RELEASE_AUDIT_IDENTITY_MISMATCH'],
  ['cross-identity DPAPI drill', { runDpapiDrill: async () => ({ status: 'RESTORED', cipher: 'WINDOWS_DPAPI_CURRENT_USER', releaseIdentityHash: OTHER }) }, 'AGENT_RELEASE_DPAPI_IDENTITY_MISMATCH'],
]) test(`${name} fails closed`, async () => {
  const result = await release.evaluateReleaseEligibility({ deps: passing(override) })
  assert.equal(result.state, 'NOT_READY')
  assert.equal(result.failureCode, code)
  if (name !== 'stale ledger identity') assert.equal(result.executionPerformed, true)
})

test('unbound source cannot consult the ledger', async () => {
  let ledgerCalled = false
  const result = await release.evaluateReleaseEligibility({ deps: passing({
    currentIdentity: () => ({ ...identity, releaseStatus: 'SOURCE_FROZEN_UNBOUND' }),
    ledgerStatus: () => { ledgerCalled = true; return ledger },
  }) })
  assert.equal(result.failureCode, 'AGENT_RELEASE_SOURCE_UNBOUND')
  assert.equal(ledgerCalled, false)
})

test('default DPAPI drill performs real CurrentUser restart under bundled Node 24', () => {
  const executable = path.join(root, 'runtime', 'node-v24.19.0-win-x64', 'node.exe')
  const source = `require('./scripts/i10-agent-release-decision.cjs').runDpapiRestoreDrill({releaseIdentityHash:'${IDENTITY}'}).then(v=>{if(v.status!=='RESTORED'||v.releaseIdentityHash!=='${IDENTITY}')process.exit(2)}).catch(e=>{console.error(e.code||e.message);process.exit(1)})`
  const result = childProcess.spawnSync(executable, ['-e', source], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
})

test('release decision source has no Flowise route, auto approval or human GO writer', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'i10-agent-release-decision.cjs'), 'utf8')
  assert.doesNotMatch(source, /i10-18-chain-acceptance-live|--yes|\/i10\/|port\s*[:=]\s*3006/)
  assert.doesNotMatch(source, /state:\s*['"]GO['"]|state:\s*['"]NO_GO['"]/)
})

test('explicit project-owner authorization writes one immutable GO decision with evidence pointers', async (t) => {
  const decisionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-human-release-test-'))
  t.after(() => fs.rmSync(decisionRoot, { recursive: true, force: true }))
  const eligible = {
    schemaVersion: release.ELIGIBILITY_SCHEMA, state: 'ELIGIBLE_FOR_HUMAN_DECISION', releaseIdentityHash: IDENTITY,
    currentPassed: 18, required: 18, machineGatesReady: true, nextGate: 'HUMAN_DECISION',
    gates: { ledger: 'PASSED', finalPublicReadback: 'PASSED', humanDecision: 'PENDING' }, executionPerformed: true,
  }
  const args = {
    root: decisionRoot, decision: 'GO', expectedReleaseIdentity: IDENTITY, authorizationValue: `GO:${IDENTITY}`,
    deps: { evaluateEligibility: async () => eligible }, now: () => new Date('2026-08-26T13:00:00.000Z'),
  }
  const first = await release.recordHumanDecision(args)
  assert.equal(first.decision, 'GO')
  assert.equal(first.actor, 'project-owner')
  assert.deepEqual(first.evidenceRefs, [
    '.data/evidence/agent-v4/acceptance/ledger.json',
    `.data/evidence/agent-v4/release-eligibility/${IDENTITY}.json`,
  ])
  assert.deepEqual(await release.recordHumanDecision({ ...args, now: () => new Date('2026-08-26T14:00:00.000Z') }), first)
  await assert.rejects(
    release.recordHumanDecision({ ...args, decision: 'NO_GO', authorizationValue: `NO_GO:${IDENTITY}` }),
    (error) => error.code === 'AGENT_RELEASE_HUMAN_DECISION_IMMUTABLE',
  )
})

test('missing human authorization or machine eligibility writes nothing', async (t) => {
  const decisionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-human-release-blocked-'))
  t.after(() => fs.rmSync(decisionRoot, { recursive: true, force: true }))
  let evaluated = false
  await assert.rejects(release.recordHumanDecision({
    root: decisionRoot, decision: 'GO', expectedReleaseIdentity: IDENTITY,
    deps: { evaluateEligibility: async () => { evaluated = true } },
  }), (error) => error.code === 'AGENT_RELEASE_HUMAN_DECISION_NOT_AUTHORIZED')
  assert.equal(evaluated, false)
  await assert.rejects(release.recordHumanDecision({
    root: decisionRoot, decision: 'GO', expectedReleaseIdentity: IDENTITY, authorizationValue: `GO:${IDENTITY}`,
    deps: { evaluateEligibility: async () => ({ state: 'NOT_READY', releaseIdentityHash: IDENTITY }) },
  }), (error) => error.code === 'AGENT_RELEASE_NOT_ELIGIBLE_FOR_HUMAN_DECISION')
  assert.equal(fs.existsSync(path.join(decisionRoot, '.data')), false)
})
