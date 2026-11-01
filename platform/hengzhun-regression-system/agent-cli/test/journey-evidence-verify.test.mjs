import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import test from 'node:test'

import { EXIT, parseCommand } from '../src/contracts.mjs'
import { runCli } from '../src/headless-app.mjs'

const JOURNEY = `journey_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`

function capture() {
  let value = ''
  return {
    stream: new Writable({ write(chunk, _encoding, callback) { value += chunk.toString(); callback() } }),
    text: () => value,
  }
}

async function invoke(service) {
  const stdout = capture()
  const stderr = capture()
  const exitCode = await runCli(['evidence', 'verify', JOURNEY, '--jsonl'], { service, stdout: stdout.stream, stderr: stderr.stream })
  return { exitCode, stdout: stdout.text(), stderr: stderr.text(), events: stdout.text().trim().split(/\r?\n/).map(JSON.parse) }
}

test('evidence verify command has one exact Journey and requires JSONL', () => {
  assert.deepEqual(parseCommand(['evidence', 'verify', JOURNEY, '--jsonl']), {
    kind: 'evidence-verify', journeyId: JOURNEY, jsonl: true,
  })
  assert.throws(() => parseCommand(['evidence', 'verify', JOURNEY]), error => error.code === 'JSONL_REQUIRED')
  assert.throws(() => parseCommand(['evidence', 'verify', 'bad', '--jsonl']), error => error.code === 'JOURNEY_ID_INVALID')
})

test('verified evidence emits one bounded result and exits zero', async () => {
  const result = await invoke({ async evidenceVerify({ journeyId }) {
    return {
      schemaVersion: 'hengzhun-cli-evidence-verification/v1', verdict: 'VERIFIED', journeyId,
      runId: 'run_12345678', taskId: 'task_12345678', releaseIdentityHash: 'a'.repeat(64),
      journeyTerminal: true, runStatus: 'PASSED', taskStatus: 'SUCCEEDED',
      requiredKinds: ['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER'],
      artifacts: [{ artifactId: 'art_12345678', evidenceKind: 'DOM', artifactType: 'JSON', sha256: 'b'.repeat(64), size: 42, sha256Verified: true, sizeVerified: true }],
    }
  } })
  assert.equal(result.exitCode, EXIT.SUCCESS)
  assert.equal(result.stderr, '')
  assert.equal(result.events.at(-1).result.verdict, 'VERIFIED')
  assert.doesNotMatch(result.stdout, /(?:path|href|token|credential|header|body|cookie)/i)
})

test('non-verified evidence exits the evidence gate without success disguise', async () => {
  const result = await invoke({ async evidenceVerify() {
    return { schemaVersion: 'hengzhun-cli-evidence-verification/v1', verdict: 'FAILED', errorCode: 'I10_EVIDENCE_KIND_MISSING' }
  } })
  assert.equal(result.exitCode, EXIT.EVIDENCE_GATE_FAILED)
  assert.equal(result.events.at(-1).type, 'ERROR')
  assert.equal(result.events.at(-1).messageCode, 'I10_EVIDENCE_KIND_MISSING')
})
