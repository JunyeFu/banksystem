'use strict'

// RF-002-S1: state-contract archaeology baseline (zero code changes).
// Machine-readable registration of the CURRENT state gap that RF-002 will
// close: Harness tasks/candidates:get responses carry no terminal or
// verificationGate fields, while MCP task_get/candidate_get hold hardcoded
// terminal sets and a cross-endpoint verification projection. These
// assertions are the REVERSE anchors for S2 (Harness contract extension)
// and S3 (MCP convergence): once those slices land, the "absent" assertions
// below must flip or be removed deliberately.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const harnessServer = read('harness/src/server.ts')
const harnessService = read('harness/src/service.ts')
const harnessI10 = read('harness/src/i10/service.ts')
const mcpServer = read('mcp/src/server.cjs')

test('A2 baseline: candidates:get response now emits terminal/verificationGate (S2 landed)', () => {
  // S2 (RF-002) added the state-semantic fields; the S1 reverse anchor flips:
  // the fields MUST now be present so the convergence is regression-guarded.
  assert.match(harnessService, /getI8Candidate\(namespace: string, preparationId: string\)/, 'getI8Candidate must exist')
  const fnStart = harnessService.indexOf('getI8Candidate(namespace: string, preparationId: string)')
  const fnBody = harnessService.slice(fnStart, fnStart + 9000)
  assert.match(fnBody, /terminal: Boolean\(gate\)/, 'S2: getI8Candidate must emit a terminal field')
  assert.match(fnBody, /verificationGate: \{/, 'S2: getI8Candidate must emit verificationGate')
  assert.match(fnBody, /challenge_id/, 'S2: verificationGate must read from i10_verification_challenges')
  assert.match(fnBody, /WAITING_USER_PREPARATION/, 'S2: gate must cover WAITING_USER_PREPARATION')
  assert.match(harnessServer, /service\.getI8Candidate\(input\.namespace, input\.preparationId\)/)
})

test('A3 baseline: MCP task_get no longer holds hardcoded terminal set or verification projection (S3 landed)', () => {
  assert.doesNotMatch(mcpServer, /const withVerification = async taskBody/, 'task_get must not aggregate verification (S3) ')
  assert.doesNotMatch(mcpServer, /terminal = new Set\(\[.SUCCEEDED., .FAILED., .BLOCKED., .WAITING_USER., .CANCELLED.\]\)/, 'task_get hardcoded terminal set must be gone (S3)')
  // S3: polling is driven by the Harness-owned terminal flag and the display
  // projection is a frozen mapping from the verificationGate
  assert.match(mcpServer, /current\.body\?\.terminal !== true/, 'task_get polling must use the Harness terminal flag')
  assert.match(mcpServer, /body\?\.verificationGate/, 'task_get display projection must read the verificationGate')
  assert.match(mcpServer, /status: 'WAITING_USER'/, 'task_get display projection must keep the v7-compatible WAITING_USER label')
  assert.match(mcpServer, /verification: \{/, 'task_get display projection must build the verification object from the gate')
})

test('A4 baseline: MCP candidate_get no longer holds hardcoded terminalActions set (S3 landed)', () => {
  assert.doesNotMatch(mcpServer, /const terminalActions = new Set\(\[/, 'candidate_get hardcoded terminalActions must be gone (S3)')
  // scope the no-cross-endpoint check to the candidate_get block: the
  // verification_get tool itself legitimately calls verification:get
  const block = mcpServer.slice(mcpServer.indexOf("registerTool('candidate_get'"), mcpServer.indexOf("registerTool('candidate_preview'"))
  assert.doesNotMatch(block, /verification:get/, 'candidate_get must not call verification:get cross-endpoint (S3)')
  assert.match(block, /current\.body\?\.terminal !== true/, 'candidate_get polling must use the Harness terminal flag')
  assert.match(block, /current\.body\?\.verificationGate/, 'candidate_get display projection must read the verificationGate')
})

test('A5 baseline: verification challenge state machine and taskRef lookup exist in Harness', () => {
  assert.match(harnessI10, /WAITING_USER_PREPARATION/, 'verification challenge state machine must exist')
  assert.match(harnessI10, /WAITING_USER_ACTION/, 'verification challenge state machine must exist')
  assert.match(harnessI10, /VERIFICATION_CONFIRMED/, 'verification challenge state machine must exist')
  assert.match(harnessI10, /task_ref/, 'verification challenges must be addressable by task_ref')
  assert.match(harnessServer, /verification:get/, 'verification:get route must exist for the cross-endpoint lookup')
})

test('S1 isolation: archaeology reads only, zero runtime files modified', () => {
  // sanity: the RF-001 cutover baseline stays intact while S1 only observes
  assert.match(mcpServer, /projectCanonicalToolError\(value\)/, 'RF-001 canonical envelope must remain wired')
  assert.match(mcpServer, /HENGZHUN_RF001_LEGACY_ERROR === '1'/, 'RF-001 legacy fallback switch must remain present')
})
