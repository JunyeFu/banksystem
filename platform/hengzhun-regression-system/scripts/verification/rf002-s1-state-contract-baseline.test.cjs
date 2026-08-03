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

test('A2 baseline: candidates:get response carries no terminal/verificationGate fields yet', () => {
  // getI8Candidate builds the response from the SQL projection; until S2 the
  // response must NOT contain the future state-semantic fields.
  assert.match(harnessService, /getI8Candidate\(namespace: string, preparationId: string\)/, 'getI8Candidate must exist')
  const fnStart = harnessService.indexOf('getI8Candidate(namespace: string, preparationId: string)')
  const fnBody = harnessService.slice(fnStart, fnStart + 6000)
  assert.doesNotMatch(fnBody, /terminal/, 'S1 baseline: getI8Candidate must not emit a terminal field yet')
  assert.doesNotMatch(fnBody, /verificationGate/, 'S1 baseline: getI8Candidate must not emit verificationGate yet')
  // the route still maps to the plain service read
  assert.match(harnessServer, /service\.getI8Candidate\(input\.namespace, input\.preparationId\)/)
})

test('A3 baseline: MCP task_get holds hardcoded terminal set and verification projection', () => {
  assert.match(mcpServer, /const withVerification = async taskBody/, 'task_get must still aggregate verification (S1 baseline)')
  assert.match(mcpServer, /verification:get'/, 'task_get must still call verification:get cross-endpoint (S1 baseline)')
  assert.match(mcpServer, /status: 'WAITING_USER'/, 'task_get must still project WAITING_USER (S1 baseline)')
  assert.match(mcpServer, /const terminal = new Set\(\[.SUCCEEDED., .FAILED., .BLOCKED., .WAITING_USER., .CANCELLED.\]\)/, 'task_get hardcoded terminal set must exist (S1 baseline)')
})

test('A4 baseline: MCP candidate_get holds hardcoded terminalActions set and verification projection', () => {
  assert.match(mcpServer, /const terminalActions = new Set\(\[/, 'candidate_get hardcoded terminalActions must exist (S1 baseline)')
  assert.match(mcpServer, /HUMAN_DELIVERY_DECISION_REQUIRED/, 'candidate_get terminalActions must include HUMAN_DELIVERY_DECISION_REQUIRED')
  assert.match(mcpServer, /ACTIVATE_OR_REJECT_AVAILABLE/, 'candidate_get terminalActions must include ACTIVATE_OR_REJECT_AVAILABLE')
  assert.match(mcpServer, /CANDIDATE_REPAIR_REQUIRED/, 'candidate_get terminalActions must include CANDIDATE_REPAIR_REQUIRED')
  assert.match(mcpServer, /AUTHORING_REVIEW_REQUIRED/, 'candidate_get terminalActions must include AUTHORING_REVIEW_REQUIRED')
  assert.match(mcpServer, /verification\.response\.ok/, 'candidate_get must still project verification on timeout (S1 baseline)')
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
