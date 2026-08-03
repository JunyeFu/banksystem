#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.resolve(__dirname, '..')
const matrixPath = path.join(root, 'flowise/i10/acceptance-ledger-execution-matrix-v1.json')
const evidenceRoot = path.join(root, '.data/evidence/i10/ledger-v3')
const summaryPath = path.join(evidenceRoot, 'ledger-run-summary.json')
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

function interruptionIds() {
  return Object.entries(matrix.interruptionCoverage)
    .flatMap(([interruptionId, scenarioIds]) => scenarioIds.map(baseId => `${baseId}+${interruptionId}`))
}

function allScenarioIds() {
  const ids = [...matrix.baseScenarioIds, ...interruptionIds()]
  if (ids.length !== 72 || new Set(ids).size !== 72) {
    throw new Error(`I10_LEDGER_MATRIX_CARDINALITY_INVALID:${ids.length}`)
  }
  return ids
}

function blankRecord(scenarioId) {
  return {
    scenarioId,
    implementationStatus: 'UNKNOWN',
    evidenceStatus: 'NOT_RUN',
    acceptanceStatus: 'NOT_RUN',
    attempts: [],
    updatedAt: null
  }
}

function freshSummary() {
  const scenarios = Object.fromEntries(allScenarioIds().map(id => [id, blankRecord(id)]))
  return {
    schemaVersion: 'hengzhun-i10-acceptance-ledger-run-summary-v1',
    matrixHash: sha256(fs.readFileSync(matrixPath)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenarios,
    counts: calculateCounts(scenarios)
  }
}

function calculateCounts(scenarios) {
  const counts = { total: 0, PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 0 }
  for (const record of Object.values(scenarios)) {
    counts.total += 1
    counts[record.acceptanceStatus] = (counts[record.acceptanceStatus] || 0) + 1
  }
  return counts
}

function loadSummary() {
  if (!fs.existsSync(summaryPath)) return freshSummary()
  const value = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  if (value.schemaVersion !== 'hengzhun-i10-acceptance-ledger-run-summary-v1') {
    throw new Error('I10_LEDGER_SUMMARY_SCHEMA_INVALID')
  }
  const ids = allScenarioIds()
  for (const id of ids) if (!value.scenarios[id]) value.scenarios[id] = blankRecord(id)
  for (const id of Object.keys(value.scenarios)) if (!ids.includes(id)) delete value.scenarios[id]
  for (const record of Object.values(value.scenarios)) {
    const byEvidenceHash = new Map()
    const withoutHash = []
    for (const attempt of Array.isArray(record.attempts) ? record.attempts : []) {
      if (attempt.evidenceHash) byEvidenceHash.set(attempt.evidenceHash, attempt)
      else withoutHash.push(attempt)
    }
    record.attempts = [...withoutHash, ...byEvidenceHash.values()]
  }
  value.matrixHash = sha256(fs.readFileSync(matrixPath))
  value.updatedAt = new Date().toISOString()
  value.counts = calculateCounts(value.scenarios)
  return value
}

function persist(summary) {
  summary.updatedAt = new Date().toISOString()
  summary.counts = calculateCounts(summary.scenarios)
  atomicWrite(summaryPath, summary)
}

function safeRelativeEvidence(argument) {
  const absolute = path.resolve(root, argument)
  const relative = path.relative(root, absolute).replaceAll('\\', '/')
  if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('I10_LEDGER_EVIDENCE_OUTSIDE_PRODUCT')
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error('I10_LEDGER_EVIDENCE_MISSING')
  return { absolute, relative, hash: sha256(fs.readFileSync(absolute)) }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function collectMatches(text, expression) {
  return unique([...text.matchAll(expression)].map(match => match[0]))
}

function stage8TranscriptMetadata(sequence, evidence) {
  const prefix = `${String(sequence).padStart(2, '0')}-`
  const directory = evidence.evidenceDirectory
    ? path.resolve(root, evidence.evidenceDirectory)
    : path.join(root, '.data/evidence/i10/stage8')
  const relativeDirectory = path.relative(root, directory)
  if (relativeDirectory.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDirectory)) {
    throw new Error('I10_LEDGER_STAGE8_TRANSCRIPT_OUTSIDE_PRODUCT')
  }
  const files = fs.readdirSync(directory)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .map(name => path.join(directory, name))
  if (!files.length) throw new Error('I10_LEDGER_STAGE8_TRANSCRIPT_MISSING')
  const text = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const toolByNode = new Map(flow.nodes.map(node => [
    node.id,
    node.data?.inputs?.toolAgentflowSelectedToolConfig?.mcpActions?.[0]
  ]).filter(([, tool]) => typeof tool === 'string' && tool))
  const executedNodeIds = []
  for (const file of files) {
    const body = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const item of Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []) {
      if (typeof item?.nodeId === 'string') executedNodeIds.push(item.nodeId)
    }
  }
  const mcpCallSequence = unique(executedNodeIds.map(nodeId => toolByNode.get(nodeId)))
  const stateTransitions = unique([...text.matchAll(/\\?"(?:stage|status)\\?"\s*:\s*\\?"([A-Z][A-Z0-9_]*)\\?"/g)]
    .map(match => match[1]))
  const references = {
    journeyIds: collectMatches(text, /journey_[0-9a-f-]{36}/g),
    candidateIds: collectMatches(text, /candidate_[0-9a-f]{40}/g),
    certificateIds: collectMatches(text, /certificate_[0-9a-f]{40}/g),
    scriptIds: collectMatches(text, /script_[0-9a-f]{40}/g),
    taskIds: collectMatches(text, /task_[0-9a-f-]{36}/g),
    runIds: collectMatches(text, /run_[0-9a-f-]{36}/g),
    scheduleIds: collectMatches(text, /schedule_[0-9a-f-]{36}/g),
    inboxIds: collectMatches(text, /inbox_[0-9a-f-]{36}/g),
    artifactIds: collectMatches(text, /art_[0-9a-f-]{36}/g)
  }
  return {
    files: files.map(file => ({
      path: path.relative(root, file).replaceAll('\\', '/'),
      sha256: sha256(fs.readFileSync(file))
    })),
    mcpCallSequence,
    references,
    stateTransitions
  }
}

function stabilityReferences(candidateId) {
  const databasePath = path.join(root, '.data/sqlite/regression_platform.sqlite')
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const certificate = database.prepare(`
      SELECT certificate_id, batch_id, script_sha256, validation_run_ids_json, status
      FROM i8_stability_certificates
      WHERE candidate_id=?
      ORDER BY issued_at DESC
      LIMIT 1
    `).get(candidateId)
    if (!certificate || !['ISSUED', 'PASSED'].includes(certificate.status)) {
      throw new Error('I10_LEDGER_STABILITY_CERTIFICATE_MISSING')
    }
    const validationRunIds = JSON.parse(certificate.validation_run_ids_json)
    if (!Array.isArray(validationRunIds) || validationRunIds.length !== 4 || new Set(validationRunIds).size !== 4) {
      throw new Error('I10_LEDGER_STABILITY_RUN_CARDINALITY_INVALID')
    }
    const passed = database.prepare(`
      SELECT validation_run_id, viewport_id, sequence_no, status
      FROM i8_stability_validation_runs
      WHERE batch_id=?
      ORDER BY viewport_id, sequence_no
    `).all(certificate.batch_id)
    if (passed.length !== 4 || passed.some(row => row.status !== 'PASSED')) {
      throw new Error('I10_LEDGER_STABILITY_RUN_NOT_PASSED')
    }
    return {
      certificateId: certificate.certificate_id,
      batchId: certificate.batch_id,
      scriptSha256: certificate.script_sha256,
      validationRunIds,
      validationRuns: passed
    }
  } finally {
    database.close()
  }
}

function failedStabilityReferences(candidateId) {
  const database = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'), {
    readonly: true,
    fileMustExist: true
  })
  try {
    const batch = database.prepare(`
      SELECT batch_id, status, error_code
      FROM i8_stability_batches
      WHERE candidate_id=?
    `).get(candidateId)
    const runs = batch ? database.prepare(`
      SELECT validation_run_id, viewport_id, sequence_no, status, error_code
      FROM i8_stability_validation_runs
      WHERE batch_id=?
      ORDER BY viewport_id, sequence_no
    `).all(batch.batch_id) : []
    const certificate = database.prepare(`
      SELECT certificate_id FROM i8_stability_certificates WHERE candidate_id=?
    `).get(candidateId)
    if (!batch || batch.status !== 'FAILED' || runs.length !== 4 ||
        runs.filter(run => run.status === 'FAILED').length !== 1 ||
        runs.find(run => run.status === 'FAILED')?.error_code !== 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED' ||
        certificate) {
      throw new Error('I10_LEDGER_FAILED_STABILITY_EVIDENCE_INVALID')
    }
    return {
      batchId: batch.batch_id,
      status: batch.status,
      errorCode: batch.error_code,
      validationRuns: runs,
      certificateIssued: false
    }
  } finally {
    database.close()
  }
}

function authoritativeScenarioReferences(candidateId, journeyId, terminal, stability) {
  const database = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'), {
    readonly: true,
    fileMustExist: true
  })
  try {
    const candidate = database.prepare(`
      SELECT candidate_id, script_id, script_sha256, status
      FROM i8_script_candidates
      WHERE candidate_id=?
    `).get(candidateId)
    const task = database.prepare(`
      SELECT task_id, run_id, status, result_artifact_id
      FROM tasks
      WHERE task_id=?
    `).get(terminal.taskId)
    const inbox = database.prepare(`
      SELECT inbox_id, task_id, run_id, script_id, outcome, result_artifact_id
      FROM result_inbox_items
      WHERE inbox_id=?
    `).get(terminal.inboxId)
    const events = database.prepare(`
      SELECT event_type, from_stage, to_stage
      FROM i10_interaction_events
      WHERE journey_id=?
      ORDER BY sequence
    `).all(journeyId)
    if (!candidate || !task || !inbox ||
        task.status !== 'SUCCEEDED' || inbox.outcome !== 'PASSED' ||
        task.run_id !== terminal.runId || inbox.run_id !== terminal.runId ||
        inbox.task_id !== terminal.taskId ||
        task.result_artifact_id !== terminal.artifactId ||
        inbox.result_artifact_id !== terminal.artifactId ||
        candidate.script_id !== inbox.script_id ||
        candidate.script_sha256 !== stability.scriptSha256) {
      throw new Error('I10_LEDGER_AUTHORITATIVE_REFERENCE_CONFLICT')
    }
    return {
      references: {
        journeyId,
        candidateId: candidate.candidate_id,
        certificateId: stability.certificateId,
        scriptId: candidate.script_id,
        taskId: task.task_id,
        runId: task.run_id,
        inboxId: inbox.inbox_id,
        artifactId: inbox.result_artifact_id
      },
      stateTransitions: events.map(event => `${event.event_type}:${event.from_stage || 'NONE'}->${event.to_stage || 'NONE'}`)
    }
  } finally {
    database.close()
  }
}

function authoritativeScheduledScenarioReferences(candidateId, journeyId, scheduled, stability, expectedFinalStatus = null) {
  const database = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'), {
    readonly: true,
    fileMustExist: true
  })
  try {
    const candidate = database.prepare(`
      SELECT candidate_id, script_id, script_sha256, status
      FROM i8_script_candidates
      WHERE candidate_id=?
    `).get(candidateId)
    const schedule = database.prepare(`
      SELECT schedule_id, schedule_type, script_id, script_sha256, status, one_time_state
      FROM schedules
      WHERE schedule_id=?
    `).get(scheduled.scheduleId)
    const execution = database.prepare(`
      SELECT execution_id, schedule_id, status, run_id, task_id
      FROM schedule_executions
      WHERE schedule_id=? AND task_id=?
      ORDER BY scheduled_for DESC
      LIMIT 1
    `).get(scheduled.scheduleId, scheduled.taskId)
    const task = database.prepare(`
      SELECT task_id, run_id, status, result_artifact_id
      FROM tasks
      WHERE task_id=?
    `).get(scheduled.taskId)
    const inbox = database.prepare(`
      SELECT inbox_id, task_id, run_id, schedule_id, schedule_type, script_id, outcome, result_artifact_id
      FROM result_inbox_items
      WHERE inbox_id=?
    `).get(scheduled.inboxId)
    const events = database.prepare(`
      SELECT event_type, from_stage, to_stage
      FROM i10_interaction_events
      WHERE journey_id=?
      ORDER BY sequence
    `).all(journeyId)
    if (!candidate || !schedule || !execution || !task || !inbox ||
        schedule.schedule_type !== scheduled.scheduleType ||
        (expectedFinalStatus && schedule.status !== expectedFinalStatus) ||
        schedule.script_id !== candidate.script_id ||
        schedule.script_sha256 !== stability.scriptSha256 ||
        execution.status !== 'SUCCEEDED' ||
        execution.run_id !== scheduled.runId ||
        execution.task_id !== scheduled.taskId ||
        task.status !== 'SUCCEEDED' ||
        task.run_id !== scheduled.runId ||
        task.result_artifact_id !== scheduled.artifactId ||
        inbox.schedule_id !== scheduled.scheduleId ||
        inbox.schedule_type !== scheduled.scheduleType ||
        inbox.task_id !== scheduled.taskId ||
        inbox.run_id !== scheduled.runId ||
        inbox.result_artifact_id !== scheduled.artifactId ||
        inbox.outcome !== 'PASSED' ||
        inbox.script_id !== candidate.script_id ||
        candidate.script_sha256 !== stability.scriptSha256) {
      throw new Error('I10_LEDGER_AUTHORITATIVE_SCHEDULED_REFERENCE_CONFLICT')
    }
    return {
      references: {
        journeyId,
        candidateId: candidate.candidate_id,
        certificateId: stability.certificateId,
        scriptId: candidate.script_id,
        scheduleId: schedule.schedule_id,
        scheduleExecutionId: execution.execution_id,
        taskId: task.task_id,
        runId: task.run_id,
        inboxId: inbox.inbox_id,
        artifactId: inbox.result_artifact_id
      },
      stateTransitions: events.map(event => `${event.event_type}:${event.from_stage || 'NONE'}->${event.to_stage || 'NONE'}`)
    }
  } finally {
    database.close()
  }
}

function authoritativeRetainedReferences(candidateId, journeyId, stability) {
  const database = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'), {
    readonly: true,
    fileMustExist: true
  })
  try {
    const candidate = database.prepare(`
      SELECT candidate_id, script_id, script_sha256, status
      FROM i8_script_candidates
      WHERE candidate_id=?
    `).get(candidateId)
    const delivery = database.prepare(`
      SELECT decision_id, choice, effect, activated_plan_id
      FROM i8_script_delivery_decisions
      WHERE candidate_id=?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(candidateId)
    const events = database.prepare(`
      SELECT event_type, from_stage, to_stage
      FROM i10_interaction_events
      WHERE journey_id=?
      ORDER BY sequence
    `).all(journeyId)
    if (!candidate || candidate.status !== 'STABILITY_CERTIFIED' ||
        candidate.script_sha256 !== stability.scriptSha256 ||
        delivery !== undefined) {
      throw new Error('I10_LEDGER_RETAINED_REFERENCE_CONFLICT')
    }
    return {
      references: {
        journeyId,
        candidateId: candidate.candidate_id,
        certificateId: stability.certificateId,
        scriptId: candidate.script_id
      },
      stateTransitions: events.map(event =>
        `${event.event_type}:${event.from_stage || 'NONE'}->${event.to_stage || 'NONE'}`
      )
    }
  } finally {
    database.close()
  }
}

function authoritativeActivatedNoRunReferences(candidateId, journeyId, stability) {
  const database = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'), {
    readonly: true,
    fileMustExist: true
  })
  try {
    const row = database.prepare(`
      SELECT c.candidate_id, c.script_id, c.script_sha256, c.status,
             d.decision_id, d.choice, d.effect, d.activated_plan_id
      FROM i8_script_candidates c
      JOIN i8_script_delivery_decisions d ON d.candidate_id=c.candidate_id
      WHERE c.candidate_id=?
      ORDER BY d.created_at DESC
      LIMIT 1
    `).get(candidateId)
    const events = database.prepare(`
      SELECT event_type, from_stage, to_stage
      FROM i10_interaction_events
      WHERE journey_id=?
      ORDER BY sequence
    `).all(journeyId)
    if (!row || row.status !== 'SCRIPT_VALIDATED' ||
        row.choice !== 'ACTIVATE' ||
        row.effect !== 'SCRIPT_VERSION_ACTIVATED' ||
        !row.activated_plan_id ||
        row.script_sha256 !== stability.scriptSha256) {
      throw new Error('I10_LEDGER_ACTIVATED_NO_RUN_REFERENCE_CONFLICT')
    }
    return {
      references: {
        journeyId,
        candidateId: row.candidate_id,
        certificateId: stability.certificateId,
        scriptId: row.script_id,
        decisionId: row.decision_id,
        planId: row.activated_plan_id
      },
      stateTransitions: events.map(event =>
        `${event.event_type}:${event.from_stage || 'NONE'}->${event.to_stage || 'NONE'}`
      )
    }
  } finally {
    database.close()
  }
}

function currentPublication() {
  const target = path.join(root, '.data/evidence/i10/flowise/publication.json')
  if (!fs.existsSync(target)) throw new Error('I10_LEDGER_PUBLICATION_EVIDENCE_MISSING')
  const value = JSON.parse(fs.readFileSync(target, 'utf8'))
  if (value.deployed !== true || value.mock !== false || value.degraded !== false ||
      !/^[0-9a-f]{64}$/.test(value.exportedHash || '')) {
    throw new Error('I10_LEDGER_PUBLICATION_EVIDENCE_INVALID')
  }
  return value
}

function requireScenario(summary, scenarioId) {
  const record = summary.scenarios[scenarioId]
  if (!record) throw new Error(`I10_LEDGER_SCENARIO_UNKNOWN:${scenarioId}`)
  return record
}

function importStage8(summary, scenarioId, evidenceArgument) {
  const evidenceFile = safeRelativeEvidence(evidenceArgument)
  const evidence = JSON.parse(fs.readFileSync(evidenceFile.absolute, 'utf8'))
  if (!/^hengzhun-i10-stage8-live-(?:diagnostic-)?evidence-v1$/.test(evidence.schemaVersion || '')) {
    throw new Error('I10_LEDGER_STAGE8_EVIDENCE_SCHEMA_INVALID')
  }
  if (evidence.mock !== false || evidence.degraded !== false || !Array.isArray(evidence.results) || evidence.results.length !== 1) {
    throw new Error('I10_LEDGER_STAGE8_EVIDENCE_NOT_REAL_SINGLE_SCENARIO')
  }
  const result = evidence.results[0]
  const variantBinding = matrix.ledgerVariantBindings?.[scenarioId]
  const isRetainedVariant = [
    'F003_REVISE_RETAIN',
    'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN',
    'F008_FILE_REVISE_RETAIN',
    'F012_VIDEO_IMAGE_CONFLICT_RETAIN',
    'F013_AUTHORING_FAIL_RETRY_RETAIN',
    'F015_STABILITY_FAIL_REVISE_RETAIN'
  ].includes(result.variant)
  const isActivatedNoRunVariant = result.variant === 'F002_CAPTURE_ACTIVATE_NO_RUN'
  const scheduledVariants = new Map([
    ['F004_NL_IMAGE_ONE_TIME', { scheduleType: 'ONE_TIME', finalStatus: null }],
    ['F006_IMAGE_ONLY_CLARIFY_RECURRING', { scheduleType: 'RECURRING', finalStatus: 'DISABLED' }],
    ['F007_XLSX_RECURRING', { scheduleType: 'RECURRING', finalStatus: 'DISABLED' }],
    ['F010_VIDEO_ONE_TIME', { scheduleType: 'ONE_TIME', finalStatus: null }]
  ])
  const scheduledVariant = scheduledVariants.get(result.variant)
  const isScheduledVariant = Boolean(scheduledVariant)
  const isOnDemandVariant = [
    'F009_FILE_IMAGE_ON_DEMAND',
    'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND',
    'F014_VERIFICATION_RESUME_ON_DEMAND'
  ].includes(result.variant)
  const isLedgerVariant = isRetainedVariant || isActivatedNoRunVariant || isScheduledVariant || isOnDemandVariant
  const expectedSequence = isLedgerVariant
    ? variantBinding?.sequence
    : matrix.stage8Bindings[scenarioId]
  if (!expectedSequence || (isLedgerVariant && variantBinding?.variant !== result.variant)) {
    throw new Error(`I10_LEDGER_STAGE8_BINDING_MISSING:${scenarioId}`)
  }
  const requiredRefs = result.executionEvidence || {}
  const scheduledTerminalEvidenceValid = isScheduledVariant &&
    requiredRefs.scheduleId &&
    requiredRefs.scheduledResult?.scheduleId === requiredRefs.scheduleId &&
    requiredRefs.scheduledResult?.scheduleType === scheduledVariant.scheduleType &&
    requiredRefs.scheduledResult?.taskId &&
    requiredRefs.scheduledResult?.runId &&
    requiredRefs.scheduledResult?.inboxId &&
    requiredRefs.scheduledResult?.artifactId &&
    requiredRefs.scheduledResult?.outcome === 'PASSED' &&
    (scheduledVariant.scheduleType !== 'RECURRING' ||
      (requiredRefs.scheduleDisabled?.scheduleId === requiredRefs.scheduleId &&
       requiredRefs.scheduleDisabled?.status === 'DISABLED'))
  const terminalEvidenceValid = (isRetainedVariant || isActivatedNoRunVariant)
    ? requiredRefs.outcome === variantBinding.expectedOutcome &&
      requiredRefs.activated === false &&
      requiredRefs.taskCreated === false &&
      requiredRefs.scheduleCreated === false
    : isScheduledVariant
      ? scheduledTerminalEvidenceValid
    : requiredRefs.taskId && requiredRefs.runId && requiredRefs.inboxId &&
      requiredRefs.artifactId && requiredRefs.outcome === 'PASSED'
  const adjustedTerminalEvidenceValid = isActivatedNoRunVariant
    ? requiredRefs.outcome === variantBinding.expectedOutcome &&
      requiredRefs.activated === true &&
      requiredRefs.taskCreated === false &&
      requiredRefs.scheduleCreated === false
    : terminalEvidenceValid
  if (!result.chatId || !result.transcriptHash || !adjustedTerminalEvidenceValid) {
    throw new Error('I10_LEDGER_STAGE8_EVIDENCE_INCOMPLETE')
  }
  const transcript = stage8TranscriptMetadata(expectedSequence, evidence)
  const publication = currentPublication()
  const interaction = result.interactionMetadata || {}
  if (Array.isArray(interaction.journeyIds)) transcript.references.journeyIds = unique([...transcript.references.journeyIds, ...interaction.journeyIds])
  if (Array.isArray(interaction.candidateIds)) transcript.references.candidateIds = unique([...transcript.references.candidateIds, ...interaction.candidateIds])
  if (Array.isArray(interaction.certificateIds)) transcript.references.certificateIds = unique([...transcript.references.certificateIds, ...interaction.certificateIds])
  if (Array.isArray(interaction.scriptIds)) transcript.references.scriptIds = unique([...transcript.references.scriptIds, ...interaction.scriptIds])
  if (Array.isArray(interaction.mcpCallSequence)) transcript.mcpCallSequence = unique([...transcript.mcpCallSequence, ...interaction.mcpCallSequence])
  if (Array.isArray(interaction.stateTransitions)) transcript.stateTransitions = unique([...transcript.stateTransitions, ...interaction.stateTransitions])
  const stability = transcript.references.candidateIds.length
    ? stabilityReferences(transcript.references.candidateIds.at(-1))
    : null
  if (!transcript.references.journeyIds.length || !transcript.references.candidateIds.length ||
      !transcript.references.certificateIds.length || !transcript.references.scriptIds.length ||
      !stability || !transcript.mcpCallSequence.length ||
      !transcript.stateTransitions.length) {
    throw new Error('I10_LEDGER_STAGE8_TRANSCRIPT_METADATA_INCOMPLETE')
  }
  if (isRetainedVariant && (
    transcript.mcpCallSequence.includes('run_submit') ||
    transcript.mcpCallSequence.includes('schedule_create') ||
    transcript.mcpCallSequence.includes('candidate_decide')
  )) {
    throw new Error('I10_LEDGER_RETAINED_VARIANT_MUTATION_DETECTED')
  }
  if (result.variant === 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 2 ||
    new Set(result.inputArtifactHashes).size !== 2 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    !transcript.mcpCallSequence.includes('image_ingest_submit') ||
    !transcript.mcpCallSequence.includes('image_ingest_get') ||
    !transcript.mcpCallSequence.includes('image_ingest_decision_submit')
  )) {
    throw new Error('I10_LEDGER_MULTI_IMAGE_RETAINED_SEQUENCE_INVALID')
  }
  if (result.variant === 'F006_IMAGE_ONLY_CLARIFY_RECURRING' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 1 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    !transcript.mcpCallSequence.includes('image_ingest_submit') ||
    !transcript.mcpCallSequence.includes('image_ingest_get') ||
    !transcript.mcpCallSequence.includes('image_ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    !transcript.mcpCallSequence.includes('schedule_create') ||
    !transcript.mcpCallSequence.includes('schedule_disable')
  )) {
    throw new Error('I10_LEDGER_IMAGE_ONLY_RECURRING_SEQUENCE_INVALID')
  }
  if (result.variant === 'F007_XLSX_RECURRING' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 1 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    !transcript.mcpCallSequence.includes('ingest_submit') ||
    !transcript.mcpCallSequence.includes('ingest_get') ||
    !transcript.mcpCallSequence.includes('ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    !transcript.mcpCallSequence.includes('schedule_create') ||
    !transcript.mcpCallSequence.includes('schedule_disable')
  )) {
    throw new Error('I10_LEDGER_XLSX_RECURRING_SEQUENCE_INVALID')
  }
  if (result.variant === 'F008_FILE_REVISE_RETAIN' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 1 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    !transcript.mcpCallSequence.includes('ingest_submit') ||
    !transcript.mcpCallSequence.includes('ingest_get') ||
    !transcript.mcpCallSequence.includes('ingest_decision_submit') ||
    transcript.mcpCallSequence.includes('candidate_decide') ||
    transcript.mcpCallSequence.includes('run_submit') ||
    transcript.mcpCallSequence.includes('schedule_create')
  )) {
    throw new Error('I10_LEDGER_FILE_REVISION_RETAIN_SEQUENCE_INVALID')
  }
  if (result.variant === 'F009_FILE_IMAGE_ON_DEMAND' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 2 ||
    new Set(result.inputArtifactHashes).size !== 2 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    !transcript.mcpCallSequence.includes('ingest_submit') ||
    !transcript.mcpCallSequence.includes('ingest_get') ||
    !transcript.mcpCallSequence.includes('ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('image_ingest_submit') ||
    !transcript.mcpCallSequence.includes('image_ingest_get') ||
    !transcript.mcpCallSequence.includes('image_ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    !transcript.mcpCallSequence.includes('run_submit')
  )) {
    throw new Error('I10_LEDGER_FILE_IMAGE_ON_DEMAND_SEQUENCE_INVALID')
  }
  if (result.variant === 'F010_VIDEO_ONE_TIME' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 1 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    !transcript.mcpCallSequence.includes('ingest_submit') ||
    !transcript.mcpCallSequence.includes('ingest_get') ||
    !transcript.mcpCallSequence.includes('ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    !transcript.mcpCallSequence.includes('schedule_create') ||
    !transcript.mcpCallSequence.includes('schedule_get') ||
    transcript.mcpCallSequence.includes('run_submit')
  )) {
    throw new Error('I10_LEDGER_VIDEO_ONE_TIME_SEQUENCE_INVALID')
  }
  if (result.variant === 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 1 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    interaction.lowConfidenceCorrection?.observed !== true ||
    interaction.lowConfidenceCorrection?.submitted !== true ||
    !/^[0-9a-f]{64}$/.test(String(interaction.lowConfidenceCorrection?.correctedDraftHash || '')) ||
    !transcript.mcpCallSequence.includes('ingest_submit') ||
    !transcript.mcpCallSequence.includes('ingest_get') ||
    !transcript.mcpCallSequence.includes('ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    !transcript.mcpCallSequence.includes('run_submit') ||
    transcript.mcpCallSequence.includes('schedule_create')
  )) {
    throw new Error('I10_LEDGER_VIDEO_LOW_CONFIDENCE_CORRECTION_SEQUENCE_INVALID')
  }
  if (result.variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN' && (
    !Array.isArray(result.inputArtifactHashes) ||
    result.inputArtifactHashes.length !== 2 ||
    new Set(result.inputArtifactHashes).size !== 2 ||
    result.inputArtifactHashes.some(value => !/^[0-9a-f]{64}$/.test(value)) ||
    interaction.crossSourceConflict?.observed !== true ||
    interaction.crossSourceConflict?.resolved !== true ||
    interaction.crossSourceConflict?.correctionSubmitted !== true ||
    !/^[0-9a-f]{64}$/.test(String(interaction.crossSourceConflict?.finalDraftHash || '')) ||
    !transcript.mcpCallSequence.includes('ingest_submit') ||
    !transcript.mcpCallSequence.includes('ingest_get') ||
    !transcript.mcpCallSequence.includes('ingest_decision_submit') ||
    !transcript.mcpCallSequence.includes('image_ingest_submit') ||
    !transcript.mcpCallSequence.includes('image_ingest_get') ||
    !transcript.mcpCallSequence.includes('image_ingest_decision_submit') ||
    transcript.mcpCallSequence.includes('candidate_decide') ||
    transcript.mcpCallSequence.includes('run_submit') ||
    transcript.mcpCallSequence.includes('schedule_create')
  )) {
    throw new Error('I10_LEDGER_VIDEO_IMAGE_CONFLICT_SEQUENCE_INVALID')
  }
  if (result.variant === 'F013_AUTHORING_FAIL_RETRY_RETAIN' && (
    interaction.authoringRetry?.sameCaseRecovery !== true ||
    interaction.authoringRetry?.failedTaskRetained !== true ||
    !/^buildjob_[0-9a-f-]{36}$/.test(String(interaction.authoringRetry?.failedJobId || '')) ||
    !/^buildjob_[0-9a-f-]{36}$/.test(String(interaction.authoringRetry?.retryJobId || '')) ||
    interaction.authoringRetry.failedJobId === interaction.authoringRetry.retryJobId ||
    !transcript.mcpCallSequence.includes('candidate_get') ||
    transcript.mcpCallSequence.includes('candidate_decide') ||
    transcript.mcpCallSequence.includes('run_submit') ||
    transcript.mcpCallSequence.includes('schedule_create')
  )) {
    throw new Error('I10_LEDGER_AUTHORING_RETRY_SEQUENCE_INVALID')
  }
  if (result.variant === 'F015_STABILITY_FAIL_REVISE_RETAIN') {
    const revision = interaction.stabilityRevision
    if (!revision ||
        revision.failedSamplesNotReused !== true ||
        revision.newFourRunSetRequired !== true ||
        revision.failureCode !== 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED' ||
        !/^candidate_[0-9a-f]{40}$/.test(String(revision.failedCandidateId || '')) ||
        !/^candidate_[0-9a-f]{40}$/.test(String(revision.revisedCandidateId || '')) ||
        revision.failedCandidateId === revision.revisedCandidateId ||
        revision.revisedCandidateId !== transcript.references.candidateIds.at(-1) ||
        !transcript.mcpCallSequence.includes('candidate_get') ||
        transcript.mcpCallSequence.includes('candidate_decide') ||
        transcript.mcpCallSequence.includes('run_submit') ||
        transcript.mcpCallSequence.includes('schedule_create')) {
      throw new Error('I10_LEDGER_STABILITY_REVISION_SEQUENCE_INVALID')
    }
    const failed = failedStabilityReferences(revision.failedCandidateId)
    if (failed.validationRuns.some(run => stability.validationRunIds.includes(run.validation_run_id))) {
      throw new Error('I10_LEDGER_FAILED_SAMPLES_REUSED')
    }
  }
  const authoringVerificationPhase = interaction.verificationResume?.phases?.find(item => item.phase === 'AUTHORING')
  const formalVerificationPhase = interaction.verificationResume?.phases?.find(item => item.phase === 'FORMAL_RUN')
  const authoringExecutionCounts = Object.values(interaction.verificationResume?.authoringFinalHealth?.transferConfirmCountByExecution || {})
  const formalExecutionCounts = Object.values(interaction.verificationResume?.finalPortalHealth?.transferConfirmCountByExecution || {})
  if (result.variant === 'F014_VERIFICATION_RESUME_ON_DEMAND' && (
    interaction.verificationResume?.sameTaskRecovery !== true ||
    interaction.verificationResume?.readyGateCount !== 2 ||
    interaction.verificationResume?.actionGateCount !== 2 ||
    interaction.verificationResume?.externalVerificationCompleted !== true ||
    interaction.verificationResume?.secretEnteredInFlowise !== false ||
    !/^verification_[0-9a-f-]{36}$/.test(String(interaction.verificationResume?.authoringChallengeId || '')) ||
    !/^verification_[0-9a-f-]{36}$/.test(String(interaction.verificationResume?.formalChallengeId || '')) ||
    interaction.verificationResume.authoringChallengeId === interaction.verificationResume.formalChallengeId ||
    !authoringVerificationPhase ||
    !formalVerificationPhase ||
    authoringVerificationPhase.portal?.verificationCompleted !== true ||
    formalVerificationPhase.portal?.verificationCompleted !== true ||
    interaction.verificationResume?.authoringFinalHealth?.verificationCompleted !== true ||
    authoringExecutionCounts.length < 2 ||
    authoringExecutionCounts.some(count => count !== 1) ||
    formalExecutionCounts.length !== 1 ||
    formalExecutionCounts[0] !== 1 ||
    interaction.verificationResume?.finalPortalHealth?.transferFirstConfirmCount !== 1 ||
    interaction.verificationResume?.finalPortalHealth?.verificationCompleted !== true ||
    !transcript.mcpCallSequence.includes('verification_get') ||
    !transcript.mcpCallSequence.includes('verification_decision_submit') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    !transcript.mcpCallSequence.includes('run_submit') ||
    !transcript.mcpCallSequence.includes('task_get') ||
    !transcript.mcpCallSequence.includes('result_inbox_list')
  )) {
    throw new Error('I10_LEDGER_VERIFICATION_RESUME_SEQUENCE_INVALID')
  }
  if (isActivatedNoRunVariant && (
    !transcript.mcpCallSequence.includes('credential_session_create') ||
    !transcript.mcpCallSequence.includes('credential_session_get') ||
    !transcript.mcpCallSequence.includes('candidate_decide') ||
    transcript.mcpCallSequence.includes('run_submit') ||
    transcript.mcpCallSequence.includes('schedule_create')
  )) {
    throw new Error('I10_LEDGER_ACTIVATED_NO_RUN_SEQUENCE_INVALID')
  }
  if (isScheduledVariant && (
    !transcript.mcpCallSequence.includes('schedule_create') ||
    !transcript.mcpCallSequence.includes('schedule_get') ||
    transcript.mcpCallSequence.includes('run_submit')
  )) {
    throw new Error('I10_LEDGER_SCHEDULED_SEQUENCE_INVALID')
  }
  const authoritative = isRetainedVariant
    ? authoritativeRetainedReferences(
      transcript.references.candidateIds.at(-1),
      transcript.references.journeyIds.at(-1),
      stability
    )
    : isActivatedNoRunVariant
      ? authoritativeActivatedNoRunReferences(
        transcript.references.candidateIds.at(-1),
        transcript.references.journeyIds.at(-1),
        stability
      )
      : isScheduledVariant
        ? authoritativeScheduledScenarioReferences(
          transcript.references.candidateIds.at(-1),
          transcript.references.journeyIds.at(-1),
          requiredRefs.scheduledResult,
          stability,
          scheduledVariant.finalStatus
        )
      : authoritativeScenarioReferences(
      transcript.references.candidateIds.at(-1),
      transcript.references.journeyIds.at(-1),
      requiredRefs,
      stability
    )
  const record = requireScenario(summary, scenarioId)
  const attempt = {
    attemptId: `attempt_${crypto.randomUUID()}`,
    startedAt: evidence.modelProbeCompletedAt,
    completedAt: evidence.completedAt,
    evidenceFile: evidenceFile.relative,
    evidenceHash: evidenceFile.hash,
    flowId: '7c14bafe-4c5b-4b4e-9d5a-000000000010',
    flowVersion: 4,
    flowHash: publication.exportedHash,
    chatId: result.chatId,
    journeyId: transcript.references.journeyIds.at(-1),
    inputArtifactHashes: Array.isArray(result.inputArtifactHashes) ? result.inputArtifactHashes : [],
    transcriptFiles: transcript.files,
    mcpCallSequence: transcript.mcpCallSequence,
    observedReferences: transcript.references,
    references: authoritative.references,
    stability,
    terminalReferences: isScheduledVariant
      ? {
          scheduleId: requiredRefs.scheduleId,
          scheduleType: requiredRefs.scheduledResult.scheduleType,
          taskId: requiredRefs.scheduledResult.taskId,
          runId: requiredRefs.scheduledResult.runId,
          inboxId: requiredRefs.scheduledResult.inboxId,
          artifactId: requiredRefs.scheduledResult.artifactId,
          outcome: requiredRefs.scheduledResult.outcome,
          ...(requiredRefs.scheduleDisabled
            ? { disabledStatus: requiredRefs.scheduleDisabled.status }
            : {})
        }
      : (isRetainedVariant || isActivatedNoRunVariant)
      ? {
          outcome: requiredRefs.outcome,
          activated: requiredRefs.activated,
          taskCreated: false,
          scheduleCreated: false
        }
      : {
          taskId: requiredRefs.taskId,
          runId: requiredRefs.runId,
          inboxId: requiredRefs.inboxId,
          artifactId: requiredRefs.artifactId
        },
    observedStateTransitions: transcript.stateTransitions,
    stateTransitions: authoritative.stateTransitions,
    acceptanceStatus: 'PASS',
    sourceSequence: expectedSequence
  }
  record.implementationStatus = 'IMPLEMENTED'
  record.evidenceStatus = 'REAL_EVIDENCE_COMPLETE'
  record.acceptanceStatus = 'PASS'
  const existingAttempt = record.attempts.findIndex(item => item.evidenceHash === attempt.evidenceHash)
  if (existingAttempt >= 0) record.attempts[existingAttempt] = attempt
  else record.attempts.push(attempt)
  record.updatedAt = new Date().toISOString()
  persist(summary)
  return record
}

function recordOutcome(summary, scenarioId, outcome, detailsArgument) {
  if (!matrix.allowedOutcomes.includes(outcome) || outcome === 'NOT_RUN') {
    throw new Error(`I10_LEDGER_OUTCOME_INVALID:${outcome}`)
  }
  const detailsFile = safeRelativeEvidence(detailsArgument)
  const details = JSON.parse(fs.readFileSync(detailsFile.absolute, 'utf8'))
  if (outcome === 'BLOCKED') {
    for (const key of matrix.blockedRequirements) {
      if (typeof details[key] !== 'string' || !details[key].trim()) {
        throw new Error(`I10_LEDGER_BLOCKED_DETAIL_MISSING:${key}`)
      }
    }
  }
  const record = requireScenario(summary, scenarioId)
  record.implementationStatus = details.implementationStatus || record.implementationStatus
  record.evidenceStatus = details.evidenceStatus || (outcome === 'PASS' ? 'REAL_EVIDENCE' : 'EVIDENCE_RECORDED')
  record.acceptanceStatus = outcome
  record.attempts.push({
    attemptId: `attempt_${crypto.randomUUID()}`,
    completedAt: new Date().toISOString(),
    evidenceFile: detailsFile.relative,
    evidenceHash: detailsFile.hash,
    ...details,
    acceptanceStatus: outcome
  })
  record.updatedAt = new Date().toISOString()
  persist(summary)
  return record
}

function status(summary) {
  persist(summary)
  return {
    schemaVersion: summary.schemaVersion,
    summaryPath: path.relative(root, summaryPath).replaceAll('\\', '/'),
    counts: summary.counts,
    nextNotRun: Object.values(summary.scenarios).find(item => item.acceptanceStatus === 'NOT_RUN')?.scenarioId || null
  }
}

function usage() {
  return [
    'USAGE:',
    '  node scripts/i10-ledger-runner.cjs init|status',
    '  node scripts/i10-ledger-runner.cjs import-stage8 <F-xxx> <evidence.json>',
    '  node scripts/i10-ledger-runner.cjs record <scenarioId> <PASS|FAIL|BLOCKED> <details.json>'
  ].join('\n')
}

function main(argv) {
  const [command, ...args] = argv
  const summary = loadSummary()
  let result
  if (command === 'init' || command === 'status') result = status(summary)
  else if (command === 'import-stage8' && args.length === 2) result = importStage8(summary, args[0], args[1])
  else if (command === 'record' && args.length === 3) result = recordOutcome(summary, args[0], args[1], args[2])
  else throw new Error(usage())
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (require.main === module) {
  try { main(process.argv.slice(2)) } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.message })}\n`)
    process.exitCode = 2
  }
}

module.exports = {
  allScenarioIds,
  calculateCounts,
  freshSummary,
  importStage8,
  interruptionIds,
  loadSummary,
  recordOutcome,
  authoritativeScheduledScenarioReferences
}
