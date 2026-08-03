'use strict'

// RF-002-S4: conditional-write retirement and contract confirmation.
//   G4: candidate_decide / schedule_disable / decision_submit keep the
//       pre-read version-binding pattern (MCP assembles, Harness validates).
//   G5: schedule_get is read-only after retirement (no DISABLE branch, no
//       schedules:disable call, no retirement error code).
//   G6: result_inbox_list keeps its CONDITIONAL_MUTATION declaration and its
//       acknowledge side effect is confined to the inbox surface.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(root, '../..')
const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const boundaryContract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json'), 'utf8'))

function toolBlock(name) {
  const start = serverSource.indexOf(`registerTool('${name}'`)
  assert.ok(start >= 0, `missing tool registration: ${name}`)
  const end = serverSource.indexOf('\n  })', start)
  return serverSource.slice(start, end)
}

test('G4: read-then-write compound tools keep the pre-read version-binding pattern', () => {
  const cases = [
    ['candidate_decide', '/v1/i8/candidates:get'],
    ['schedule_disable', '/v1/i8/schedules:get'],
    ['decision_submit', '/v1/i8/failures:get']
  ]
  for (const [tool, preReadRoute] of cases) {
    const block = toolBlock(tool)
    assert.ok(block.includes(`shadowedRequest('${tool}', '${preReadRoute}'`), `${tool} must pre-read via shadowedRequest`)
    assert.match(block, /expectedVersion|expectedCandidateVersion|expectedProposalVersion/, `${tool} must assemble the optimistic-lock version from the pre-read`)
    assert.ok(block.includes('callHarness('), `${tool} must keep the write on callHarness`)
  }
})

test('G5: schedule_get is read-only after retirement', () => {
  const block = toolBlock('schedule_get')
  assert.ok(!block.includes('action'), 'schedule_get must not carry an action parameter')
  assert.ok(!block.includes("z.enum(['READ', 'DISABLE']"), 'schedule_get must not carry the DISABLE enum')
  assert.ok(!block.includes('schedules:disable'), 'schedule_get must not call schedules:disable')
  assert.ok(!serverSource.includes('I8_SCHEDULE_DISABLE_CONFIRMATION_REQUIRED'), 'retirement error code must be gone')
  assert.ok(block.includes('return textResult(current.body)'), 'schedule_get must return the plain schedule read')
  const entry = boundaryContract.tools.find(tool => tool.name === 'schedule_get')
  assert.equal(entry.sideEffect, 'READ_ONLY', 'boundary contract must declare schedule_get READ_ONLY')
  assert.deepEqual(entry.canonicalRequest, ['scheduleId'], 'canonical request must narrow to scheduleId')
  const disable = toolBlock('schedule_disable')
  assert.ok(disable.includes("callHarness('/v1/plugin/schedules:disable'"), 'schedule_disable stays the authoritative disable path')
})

test('G6: result_inbox_list acknowledge side effect is confined to the inbox surface', () => {
  const block = toolBlock('result_inbox_list')
  assert.equal((block.match(/\/v1\/i8\/results:inbox-list/g) || []).length, 1, 'inbox-list must be the only Harness call of result_inbox_list')
  assert.ok(!/schedules:|tasks:|candidates:|failures:|repairs:/.test(block), 'acknowledge must not touch schedule/task/candidate/failure state')
  const entry = boundaryContract.tools.find(tool => tool.name === 'result_inbox_list')
  assert.equal(entry.sideEffect, 'CONDITIONAL_MUTATION', 'inbox acknowledge stays a declared conditional mutation')
  assert.ok(entry.mutationTriggers, 'conditional mutation must declare its triggers')
})

test('S4 contract consistency: tools=33 aliases=13, conditional mutations now 2', () => {
  assert.equal(boundaryContract.tools.length, 33)
  const aliasCount = boundaryContract.tools.reduce((sum, tool) => sum + (tool.acceptedAliases || []).length, 0)
  assert.equal(aliasCount, 13)
  const conditional = boundaryContract.tools.filter(tool => tool.sideEffect === 'CONDITIONAL_MUTATION').map(tool => tool.name).sort()
  assert.deepEqual(conditional, ['candidate_get', 'result_inbox_list'], 'exactly the two remaining conditional-write tools must be declared')
})
