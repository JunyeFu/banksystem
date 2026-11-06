'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const test = require('node:test')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { workbenchOperations, workbenchContract } = require('../../dist/harness/src/workbench-contract.js')
const { productRoot, ns, temporary, remove, options, store } = require('./workbench-test-fixture.cjs')
const release = 'a'.repeat(64)
test('S5 execution snapshot is complete beyond 200 runs, scoped and read-only', () => {
  const Database = require('better-sqlite3'), db = new Database(':memory:')
  const { WorkbenchRepository } = require('../../dist/harness/src/workbench-repository.js')
  try {
    db.exec(`CREATE TABLE i10_interaction_journeys(namespace,journey_id);
      CREATE TABLE runs(namespace,journey_id,run_id,task_id);
      CREATE TABLE tasks(namespace,task_id,attempt_count);
      CREATE TABLE audit_events(namespace,run_id,task_id,action);
      CREATE TABLE workbench_turns(namespace,journey_id,turn_id,run_id,task_id,checkpoint_session_id,model_binding_json);`)
    const journey = `journey_${randomUUID()}`, other = `journey_${randomUUID()}`
    db.prepare('INSERT INTO i10_interaction_journeys VALUES(?,?)').run(ns, journey)
    const insert = db.prepare('INSERT INTO runs VALUES(?,?,?,?)')
    for (let i = 0; i < 201; i++) insert.run(ns, other, `background-${i}`, `task-${i}`)
    insert.run(ns, journey, 'original-run', 'original-task')
    db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(ns, 'original-task', 1)
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?)').run(ns, 'original-run', 'original-task', 'run.claim')
    const repo = new WorkbenchRepository({ read: operation => operation(db) }), before = repo.executionSnapshot(ns, journey)
    assert.equal(before.runs.length, 1); assert.equal(before.runs[0].claimCount, 1); assert.equal(before.runs[0].attemptCount, 1)
    insert.run(ns, other, 'unrelated-new', 'unrelated-task'); assert.deepEqual(repo.executionSnapshot(ns, journey), before)
    insert.run(ns, journey, 'unexpected-run', 'unexpected-task'); assert.equal(repo.executionSnapshot(ns, journey).runs.length, 2)
    assert.throws(() => repo.executionSnapshot('another-namespace', journey), error => error.errorCode === 'AGENT_METADATA_NOT_FOUND')
    assert.equal(db.prepare('SELECT count(*) n FROM runs').get().n, 204)
  } finally { db.close() }
})
const call = (f, name, input = {}, namespace = ns) => f.repo.execute(`workbench_${name}`, namespace, input)
async function setup(t) {
  const f = await store(t), conversationId = randomUUID(), modelId = randomUUID()
  const model = { modelId, expectedVersion: 0, displayName: '隔离测试模型', model: 'test-process-model', baseUrl: 'https://model.invalid/v1', keyRef: `modelkey_${randomUUID()}` }
  await call(f, 'conversation_create', { conversationId, title: '新对话' })
  await call(f, 'model_save', model)
  const input = { conversationId, submissionId: randomUUID(), input: '只读核对客户账户，不转账。', modelProfileId: modelId, modelProfileVersion: 1, releaseIdentityHash: release }
  return { ...f, fixture: f, model, input, conversationId, modelId, get repo() { return f.repo } }
}
function update(turn, status, extra = {}) {
  return { turnId: turn.id, expectedVersion: turn.version, status, event: { type: status === 'RUNNING' ? 'TOOL_FINISHED' : status, summary: '隔离测试状态回执。' },
    humanInterventionRequired: !['RUNNING', 'COMPLETED'].includes(status), ...extra }
}

test('frozen metadata contract is exactly the generated strict producer contract', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(productRoot, 'contracts/mcp/workbench-metadata-v1.json'), 'utf8'))
  assert.deepEqual(contract, workbenchContract())
  assert.equal(contract.tools.length, 11)
  assert.equal(contract.additionalToolsAllowed, false)
  for (const tool of contract.tools) {
    assert.equal(tool.inputSchema.additionalProperties, false)
    assert.equal(tool.outputSchema.additionalProperties, false)
    assert.equal('namespace' in tool.inputSchema.properties, false)
    assert.ok(tool.maxOutputBytes <= 128 * 1024)
  }
})

test('metadata UTC timestamps require RFC3339 seconds and nullable cursors retain their meaning', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(productRoot, 'contracts/mcp/workbench-metadata-v1.json'), 'utf8'))
  const timestamp = contract.tools.find(tool => tool.name === 'workbench_conversation_create').outputSchema.properties.createdAt
  const conversation = { id: randomUUID(), title: '隔离测试', status: 'IDLE', createdAt: '2026-11-06T10:20:30Z', updatedAt: '2026-11-06T10:20:30Z', lastTurnId: null }
  for (const [value, accepted] of [
    ['2026-11-06T10:20:30Z', true], ['2026-11-06T10:20:30.123Z', true],
    ['2026-11-06T10:20Z', false], ['2026-11-06T10:20:30', false], ['2026-02-30T10:20:30Z', false],
  ]) {
    assert.equal(workbenchOperations.workbench_conversation_create.output.safeParse({ ...conversation, createdAt: value }).success, accepted, value)
    assert.equal(new RegExp(timestamp.pattern).test(value), accepted, value)
  }
  for (const [nextCursor, accepted] of [[null, true], ['cursor_next', true], [17, false]]) {
    assert.equal(workbenchOperations.workbench_conversation_list.output.safeParse({ conversations: [conversation], nextCursor }).success, accepted)
  }
})

test('044 upgrades a populated pre-044 SQLite and preserves old rows and migration checksums', async t => {
  const root = temporary(), migrationRoot = path.join(root, 'old-migrations')
  fs.mkdirSync(migrationRoot)
  for (const file of fs.readdirSync(path.join(productRoot, 'harness/migrations')).filter(name => Number(name.split('_')[0]) <= 43)) {
    fs.copyFileSync(path.join(productRoot, 'harness/migrations', file), path.join(migrationRoot, file))
  }
  let db = await HarnessDatabase.open({ ...options(root), migrationsDirectory: migrationRoot })
  t.after(async () => { await db.close(); remove(root) })
  await db.write(sql => sql.prepare("INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES ('preserved-test','ACTIVE',1,'2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z')").run())
  const before = db.read(sql => sql.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all())
  await db.close()
  db = await HarnessDatabase.open(options(root))
  assert.equal(db.migrationStatus().appliedVersion, 45)
  assert.deepEqual(db.read(sql => sql.prepare('SELECT version,name,checksum FROM schema_migrations WHERE version<=43 ORDER BY version').all()), before)
  assert.equal(db.read(sql => sql.prepare("SELECT count(*) n FROM namespaces WHERE namespace='preserved-test'").get()).n, 1)
  assert.equal(fs.readdirSync(path.join(root, 'backups')).some(name => name.includes('pre-migration-44')), true)
  assert.deepEqual(db.integrityCheck(), ['ok'])
})

test('duplicate requests have exactly one dispatch claim; changed payload is 409 with no second message', async t => {
  const f = await setup(t)
  const results = await Promise.all(Array.from({ length: 10 }, () => call(f, 'turn_submit', f.input)))
  assert.equal(results.filter(value => value.created).length, 1)
  assert.equal(new Set(results.map(value => value.turn.id)).size, 1)
  await assert.rejects(call(f, 'turn_submit', { ...f.input, input: 'different target' }), error => error.status === 409 && error.errorCode === 'AGENT_SUBMISSION_CONFLICT')
  const history = await call(f, 'conversation_get', { conversationId: f.conversationId })
  assert.equal(history.messages.length, 1)
  assert.equal(history.conversation.title, f.input.input)
  assert.equal(history.turns[0].events.length, 0)
  assert.equal(history.turns[0].hasMoreEvents, true)
})

test('two independent connections cannot both claim a running conversation', async t => {
  const f = await setup(t)
  const other = await HarnessDatabase.open(options(f.root))
  const { WorkbenchRepository } = require('../../dist/harness/src/workbench-repository.js')
  const second = new WorkbenchRepository(other)
  try {
    const results = await Promise.allSettled([
      call(f, 'turn_submit', f.input), second.execute('workbench_turn_submit', ns, { ...f.input, submissionId: randomUUID() })
    ])
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1)
    assert.equal(results.find(value => value.status === 'rejected').reason.errorCode, 'AGENT_CONVERSATION_BUSY')
  } finally { await other.close() }
})

test('versioned model metadata retains old key references and a running turn binding across default changes', async t => {
  const f = await setup(t)
  const original = (await call(f, 'turn_submit', f.input)).turn
  const newer = await call(f, 'model_save', { ...f.model, expectedVersion: 1, model: 'new-test-model', keyRef: `modelkey_${randomUUID()}` })
  assert.equal(newer.version, 2)
  await call(f, 'model_default', { modelId: f.modelId, expectedVersion: 2 })
  assert.equal((await call(f, 'model_get', { modelId: f.modelId, version: 1 })).keyRef, f.model.keyRef)
  assert.equal((await call(f, 'model_get', { modelId: f.modelId, version: 1 })).isDefault, false)
  assert.deepEqual((await call(f, 'turn_get', { turnId: original.id })).modelBinding, original.modelBinding)
  assert.equal((await call(f, 'turn_submit', f.input)).created, false)
  await assert.rejects(call(f, 'model_default', { modelId: f.modelId, expectedVersion: 1 }), error => error.status === 409)
  assert.equal('keyRef' in (await call(f, 'model_list')).models[0], false)
})

test('NEEDS_INPUT creates one bound continuation retaining Journey and old model version, not a new task identity', async t => {
  const f = await setup(t)
  const original = (await call(f, 'turn_submit', f.input)).turn
  await call(f, 'turn_update', update(original, 'NEEDS_INPUT', { answer: '请补充账户引用。', journeyId: 'journey_bound_test' }))
  await call(f, 'model_save', { ...f.model, expectedVersion: 1, model: 'new-test-model' })
  const followup = { ...f.input, submissionId: randomUUID(), input: '仅查询账户3。' }
  await assert.rejects(call(f, 'turn_submit', { ...followup, modelProfileVersion: 2 }), error => error.status === 409)
  await assert.rejects(call(f, 'turn_submit', { ...followup, releaseIdentityHash: 'b'.repeat(64) }), error => error.errorCode === 'AGENT_CONTINUATION_BINDING_CONFLICT')
  const child = (await call(f, 'turn_submit', followup)).turn
  assert.notEqual(child.id, original.id)
  assert.deepEqual(child.modelBinding, original.modelBinding)
  assert.equal(child.journeyId, 'journey_bound_test')
  assert.equal((await call(f, 'turn_get', { turnId: original.id })).status, 'NEEDS_INPUT')
})

test('optimistic event updates have one winner, immutable references and no contradictory completion', async t => {
  const f = await setup(t)
  const original = (await call(f, 'turn_submit', f.input)).turn
  const changes = await Promise.allSettled([
    call(f, 'turn_update', update(original, 'RUNNING', { journeyId: 'journey_first_test' })),
    call(f, 'turn_update', update(original, 'RUNNING', { journeyId: 'journey_other_test' }))
  ])
  assert.equal(changes.filter(value => value.status === 'fulfilled').length, 1)
  const winner = changes.find(value => value.status === 'fulfilled').value
  await assert.rejects(call(f, 'turn_update', update(winner, 'RUNNING', { journeyId: 'journey_changed_test' })), error => error.errorCode === 'AGENT_EXECUTION_REFERENCE_CONFLICT')
  const done = await call(f, 'turn_update', update(winner, 'COMPLETED', { answer: '仅信息回复完成，未宣称银行测试通过。' }))
  assert.equal('verdict' in done, false)
  await assert.rejects(call(f, 'turn_update', update(done, 'RUNNING')), error => error.errorCode === 'AGENT_TURN_TERMINAL')
  assert.deepEqual(done.events.map(event => event.sequence), [1, 2, 3])
})

test('stop/unknown result remains explicit and is never converted to rollback or restarted work', async t => {
  const f = await setup(t)
  const original = (await call(f, 'turn_submit', f.input)).turn
  const stopped = await call(f, 'turn_update', update(original, 'STOP_REQUESTED', { runId: 'run_existing_test', taskId: 'task_existing_test' }))
  assert.equal(stopped.status, 'STOP_REQUESTED')
  await assert.rejects(call(f, 'turn_update', update(stopped, 'RUNNING')), error => error.errorCode === 'AGENT_TURN_TRANSITION_INVALID')
  const interrupted = await call(f, 'turn_update', update(stopped, 'INTERRUPTED', { failureCode: 'AGENT_RESULT_UNKNOWN' }))
  await f.fixture.reopen()
  const read = await call(f, 'turn_get', { turnId: interrupted.id })
  assert.equal(read.status, 'INTERRUPTED')
  assert.equal(read.runId, 'run_existing_test')
  assert.equal(read.humanInterventionRequired, true)
  assert.equal((await call(f, 'turn_submit', f.input)).created, false)
})

test('namespace-qualified reads and foreign history anchors cannot expose other tenants', async t => {
  const f = await setup(t)
  const original = (await call(f, 'turn_submit', f.input)).turn
  for (const [name, input] of [['conversation_get', { conversationId: f.conversationId }], ['turn_get', { turnId: original.id }], ['model_get', { modelId: f.modelId }]]) {
    await assert.rejects(call(f, name, input, 'other-tenant'), error => error.status === 404)
  }
  assert.deepEqual((await call(f, 'conversation_list', {}, 'other-tenant')).conversations, [])
  assert.deepEqual(await call(f, 'submission_get', { conversationId: f.conversationId, submissionId: f.input.submissionId }, 'other-tenant'), { turn: null, request: null })
  assert.deepEqual(await call(f, 'submission_get', { conversationId: randomUUID(), turnId: original.id }), { turn: null, request: null })
  assert.equal((await call(f, 'submission_get', { conversationId: f.conversationId, turnId: original.id })).request.input, f.input.input)
  await assert.rejects(call(f, 'conversation_get', { conversationId: f.conversationId, before: randomUUID() }), error => error.errorCode === 'AGENT_MESSAGE_CURSOR_INVALID')
  await assert.rejects(call(f, 'conversation_list', { cursor: 'not-a-valid-cursor' }), error => error.errorCode === 'AGENT_HISTORY_CURSOR_INVALID')
})

test('unknown credential fields, known secret patterns, unsafe model URLs and raw reasoning are rejected before persistence', async t => {
  const f = await setup(t)
  const before = (await call(f, 'conversation_get', { conversationId: f.conversationId })).messages.length
  for (const bad of [
    { ...f.input, apiKey: 'not-allowed' }, { ...f.input, reasoning: 'private chain' },
    { ...f.input, input: 'password=never-store-this' }, { ...f.input, input: '密钥：never-store-this' },
    { ...f.input, input: 'Bearer never-store-this' }, { ...f.input, input: 'sk-abcdefghijklmnop' },
    { ...f.input, input: 'http://user:password@site.invalid/' }
  ]) await assert.rejects(call(f, 'turn_submit', bad))
  for (const baseUrl of ['https://user:secret@model.invalid/v1', 'file:///private', 'https://model.invalid/v1?token=secret']) {
    await assert.rejects(call(f, 'model_save', { ...f.model, expectedVersion: 1, baseUrl }))
  }
  assert.equal((await call(f, 'conversation_get', { conversationId: f.conversationId })).messages.length, before)
  assert.equal(f.db.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get()).n, 0)
})

test('large Unicode messages/events paginate within byte budgets without truncation or omissions', async t => {
  const f = await setup(t), expectedMessages = []
  for (let i = 0; i < 4; i++) {
    const input = { ...f.input, submissionId: randomUUID(), input: `目标${i}：${'测'.repeat(15000)}` }
    let turn = (await call(f, 'turn_submit', input)).turn
    for (let j = 0; j < (i === 0 ? 70 : 0); j++) turn = await call(f, 'turn_update', update(turn, 'RUNNING', { event: { type: 'TOOL_FINISHED', summary: '实'.repeat(500) } }))
    const answer = `回复${i}：${'证'.repeat(15000)}`
    turn = await call(f, 'turn_update', update(turn, 'COMPLETED', { answer }))
    expectedMessages.push(input.input, answer)
    if (i === 0) {
      let after = 0, count = 0, page
      do {
        page = await call(f, 'turn_get', { turnId: turn.id, after, limit: 100 })
        assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 64 * 1024)
        assert.ok(page.events.length > 0)
        for (const event of page.events) assert.equal(event.sequence, ++count)
        after = page.events.at(-1).sequence
      } while (page.hasMoreEvents)
      assert.equal(count, 72)
    }
  }
  let before, readMessages = [], page
  do {
    page = await call(f, 'conversation_get', { conversationId: f.conversationId, ...(before ? { before } : {}), limit: 30 })
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 64 * 1024)
    assert.ok(page.messages.length > 0)
    readMessages = [...page.messages.map(message => message.text), ...readMessages]
    assert.equal(page.turns.every(turn => turn.answer === undefined && turn.events.length === 0 && turn.hasMoreEvents), true)
    before = page.nextMessageCursor
  } while (before)
  assert.deepEqual(readMessages, expectedMessages)
})

test('conversation cursor/search and restart reads neither write data nor replay submissions', async t => {
  const f = await setup(t)
  const original = (await call(f, 'turn_submit', f.input)).turn
  const complete = await call(f, 'turn_update', update(original, 'COMPLETED', { answer: '只读资料回复。' }))
  const second = randomUUID()
  await call(f, 'conversation_create', { conversationId: second, title: '另一个会话' })
  const first = await call(f, 'conversation_list', { limit: 1 })
  assert.equal(first.conversations.length, 1)
  const next = await call(f, 'conversation_list', { limit: 1, cursor: first.nextCursor })
  assert.equal(new Set([...first.conversations, ...next.conversations].map(item => item.id)).size, 2)
  assert.equal((await call(f, 'conversation_list', { q: '资料回复' })).conversations[0].id, f.conversationId)
  await f.fixture.reopen()
  const before = f.fixture.db.read(db => db.prepare('SELECT total_changes() n').get()).n
  for (let i = 0; i < 5; i++) {
    await call(f, 'conversation_get', { conversationId: f.conversationId })
    assert.deepEqual((await call(f, 'turn_get', { turnId: complete.id })).modelBinding, complete.modelBinding)
  }
  assert.equal(f.fixture.db.read(db => db.prepare('SELECT total_changes() n').get()).n, before)
  assert.equal(f.fixture.db.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get()).n, 1)
  assert.deepEqual(f.fixture.db.integrityCheck(), ['ok'])
})

test('SQL constraints preserve immutable model/turn bindings and append-only event history', async t => {
  const f = await setup(t), turn = (await call(f, 'turn_submit', f.input)).turn
  for (const sql of [
    "UPDATE workbench_model_versions SET model='wrong'", "DELETE FROM workbench_model_versions",
    "UPDATE workbench_turns SET model_binding_json='{}'", "UPDATE workbench_events SET summary='wrong'", 'DELETE FROM workbench_events'
  ]) await assert.rejects(f.db.write(db => db.exec(sql)), /IMMUTABLE|RETAINED/)
  assert.deepEqual((await call(f, 'turn_get', { turnId: turn.id })).modelBinding, turn.modelBinding)
})

test('review counterexamples reject status/event contradictions and partial run bindings without appending data', async t => {
  const f = await setup(t), turn = (await call(f, 'turn_submit', f.input)).turn
  for (const change of [
    update(turn, 'COMPLETED'),
    update(turn, 'FAILED'),
    update(turn, 'RUNNING', { runId: 'run_without_task' }),
    update(turn, 'RUNNING', { humanInterventionRequired: true }),
    update(turn, 'COMPLETED', { answer: '回复', event: { type: 'TOOL_FINISHED', summary: '不能冒充完成' } }),
    update(turn, 'RUNNING', { event: { type: 'TOOL_STARTED', summary: 'password=never-write-this' } }),
    { ...update(turn, 'RUNNING'), modelBinding: { model: 'forged' } }
  ]) await assert.rejects(call(f, 'turn_update', change))
  const read = await call(f, 'turn_get', { turnId: turn.id })
  assert.equal(read.version, 1)
  assert.equal(read.events.length, 1)
  assert.equal((await call(f, 'conversation_get', { conversationId: f.conversationId })).messages.length, 1)
})

test('review counterexamples preserve one default and reject a stale model for a new task', async t => {
  const f = await setup(t), turn = (await call(f, 'turn_submit', f.input)).turn
  await call(f, 'turn_update', update(turn, 'COMPLETED', { answer: '资料查询完成。' }))
  const second = { ...f.model, modelId: randomUUID(), displayName: '另一个合成配置' }
  await call(f, 'model_save', second)
  await Promise.all([
    call(f, 'model_default', { modelId: f.modelId, expectedVersion: 1 }),
    call(f, 'model_default', { modelId: second.modelId, expectedVersion: 1 })
  ])
  assert.equal((await call(f, 'model_list')).models.filter(model => model.isDefault).length, 1)
  await call(f, 'model_save', { ...f.model, expectedVersion: 1 })
  await assert.rejects(call(f, 'turn_submit', { ...f.input, submissionId: randomUUID() }), error => error.errorCode === 'AGENT_MODEL_VERSION_CONFLICT')
  assert.equal(f.db.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get()).n, 1)
})

test('review contract projections satisfy the accepted browser DTOs and cannot add execution tools', async t => {
  const f = await setup(t), original = (await call(f, 'turn_submit', f.input)).turn
  const { pathToFileURL } = require('node:url')
  const { workbenchOperations: browser } = await import(pathToFileURL(path.join(productRoot, 'agent-cli/src/workbench-contract.mjs')).href)
  const output = operationId => browser.find(operation => operation.operationId === operationId).output
  // Metadata does not manufacture test verdicts. RF066's application adds this required public projection.
  const reply = turn => ({ ...turn, result: { kind: 'REPLY', verdict: 'NOT_RUN' } })
  output('submitAgentMessage').parse(reply(original))
  const history = await call(f, 'conversation_get', { conversationId: f.conversationId })
  output('getAgentConversation').parse({ ...history, turns: history.turns.map(reply) })
  output('listAgentModels').parse(await call(f, 'model_list'))
  assert.equal(Object.keys(workbenchOperations).some(name => /(?:run_submit|journey_execute|schedule_create)/.test(name)), false)
})
