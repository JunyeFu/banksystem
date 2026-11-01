import process from 'node:process'

import { assertEvent, CliError, EVENT_SCHEMA_VERSION, EXIT, parseCommand } from './contracts.mjs'
import { preflightAttachment, readInput } from './preflight.mjs'

function unavailable() { throw new CliError('RUNTIME_COMPOSITION_NOT_INSTALLED', EXIT.RUNTIME_UNAVAILABLE) }

export function createUnavailableService() {
  return Object.freeze(new Proxy({
    version: async () => ({ version: '0.1.0-inactive', runtime: 'UNBOUND' }),
    doctor: async () => ({ status: 'INACTIVE', code: 'RUNTIME_COMPOSITION_NOT_INSTALLED' }),
    serviceStatus: async () => ({ status: 'INACTIVE' }),
  }, { get(target, key) { return key in target ? target[key] : unavailable } }))
}

function safeId(value, code) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < 8 || value.length > 256) throw new CliError(code, EXIT.FAILURE)
  return value
}

export function normalizeControllerResult(result) {
  if (!result || typeof result.status !== 'string') throw new CliError('CONTROLLER_RESULT_INVALID', EXIT.FAILURE)
  const common = {
    status: result.status,
    ...(safeId(result.sessionId, 'SESSION_RESULT_INVALID') ? { sessionId: result.sessionId } : {}),
    ...(safeId(result.journeyId, 'JOURNEY_RESULT_INVALID') ? { journeyId: result.journeyId } : {}),
  }
  if (result.status === 'AWAITING_USER') {
    const approval = result.approval
    if (!approval) throw new CliError('APPROVAL_RESULT_INVALID', EXIT.FAILURE)
    return { ...common, eventType: 'APPROVAL_REQUIRED', exitCode: EXIT.APPROVAL_REQUIRED, proposal: {
      proposalId: approval.proposalId,
      contentHash: approval.contentHash,
      risk: approval.risk,
      expiresAt: approval.expiresAt,
      summary: approval.summary,
    } }
  }
  if (result.status === 'COMPLETED') return { ...common, eventType: 'RESPONSE', exitCode: EXIT.SUCCESS, text: String(result.answer || result.summary || 'COMPLETED') }
  if (result.status === 'NEEDS_INPUT') return { ...common, eventType: 'CLARIFICATION_REQUIRED', exitCode: EXIT.SUCCESS, text: String(result.question || 'INPUT_REQUIRED') }
  if (result.status === 'REJECTED') return { ...common, eventType: 'COMMAND_RESULT', exitCode: EXIT.REJECTED, result: { decision: 'REJECTED' } }
  throw new CliError('CONTROLLER_OPERATION_FAILED', EXIT.FAILURE)
}

function methodFor(kind) {
  return ({
    'session-start': 'sessionStart', 'session-resume': 'sessionResume', 'session-status': 'sessionStatus',
    'journey-show': 'journeyShow', 'journey-validate': 'journeyValidate', evidence: 'evidence',
    'credential-enroll': 'credentialEnroll', doctor: 'doctor', 'service-status': 'serviceStatus', version: 'version',
    'schedule-create':'scheduleCreate','schedule-status':'scheduleStatus','schedule-disable':'scheduleDisable','failure-show':'failureShow',
    'verification-status':'verificationStatus','verification-decide':'verificationDecide',
    'feedback-record':'feedbackRecord','feedback-verify':'feedbackVerify','feedback-show':'feedbackShow',
  })[kind]
}

export function assertSafeResult(value, depth = 0) {
  if (depth > 8) throw new CliError('COMMAND_RESULT_UNSAFE', EXIT.FAILURE)
  if (typeof value === 'string') {
    if (value.length > 20_000 || /(?:[A-Za-z]:\\|\\\\[^\\]+\\)/.test(value)) throw new CliError('COMMAND_RESULT_UNSAFE', EXIT.FAILURE)
    return
  }
  if (value === null || ['number', 'boolean', 'undefined'].includes(typeof value)) return
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new CliError('COMMAND_RESULT_UNSAFE', EXIT.FAILURE)
    for (const item of value) assertSafeResult(item, depth + 1)
    return
  }
  if (typeof value !== 'object') throw new CliError('COMMAND_RESULT_UNSAFE', EXIT.FAILURE)
  for (const [key, item] of Object.entries(value)) {
    if (/(?:password|secret|token|api.?key|credentialvalue|raw|path|bytes|arguments|input)/i.test(key)) throw new CliError('COMMAND_RESULT_UNSAFE', EXIT.FAILURE)
    assertSafeResult(item, depth + 1)
  }
}

export async function executeHeadless(command, { service, stdin, signal, emit }) {
  if (signal?.aborted) throw Object.assign(new Error('ABORTED'), { name: 'AbortError' })
  if (command.kind.startsWith('interactive')) throw new CliError('TUI_NOT_INSTALLED', EXIT.RUNTIME_UNAVAILABLE)
  emit({ type: 'STARTED', command: command.kind })
  let bankValidationFixtures
  if(command.bankValidationFixturesFile) {
    const text=await readInput(command.bankValidationFixturesFile,stdin)
    try {bankValidationFixtures=JSON.parse(text)} catch {throw new CliError('BANK_VALIDATION_JSON_INVALID',EXIT.INPUT_INVALID)}
  }
  if (command.kind === 'run') {
    const input = await readInput(command.inputFile, stdin)
    const attachmentRefs = []
    const attachmentMetadata = []
    for (const attachmentPath of command.attachments) {
      const descriptor = await preflightAttachment(attachmentPath)
      const receipt = await service.importAttachment({ ...descriptor, signal })
      const attachmentRef = safeId(receipt?.attachmentRef, 'ATTACHMENT_RECEIPT_INVALID')
      attachmentRefs.push(attachmentRef)
      attachmentMetadata.push({ attachmentRef, originalFilename: descriptor.originalFilename })
      emit({ type: 'ATTACHMENT_IMPORTED', attachmentRef, sha256: descriptor.sha256, size: descriptor.size })
    }
    const normalized = normalizeControllerResult(await service.start({ input, attachmentRefs, attachmentMetadata, noSession: command.noSession, signal,
      ...(bankValidationFixtures===undefined?{}:{bankValidationFixtures}),
    }))
    emit({ type: normalized.eventType, ...normalized, eventType: undefined, exitCode: undefined })
    return normalized.exitCode
  }
  if (command.kind === 'resume') {
    const normalized = normalizeControllerResult(await service.resume({
      sessionId: command.sessionId, proposalId: command.proposalId, approved: command.approved, signal,
    }))
    emit({ type: normalized.eventType, ...normalized, eventType: undefined, exitCode: undefined })
    return normalized.exitCode
  }
  if (command.kind === 'credential-enroll') {
    const normalized = normalizeControllerResult(await service.credentialEnroll({ signal }))
    emit({ type: normalized.eventType, ...normalized, eventType: undefined, exitCode: undefined })
    return normalized.exitCode
  }
  if (command.kind === 'journey-author') {
    const goal = await readInput(command.inputFile, stdin)
    const result = await service.journeyAuthor({
      sessionId: command.sessionId, goal, entryUrl: command.entryUrl, targetSystem: command.targetSystem,
      credentialRef: command.credentialRef, adapterSelection: command.adapterSelection, signal,
      ...(bankValidationFixtures===undefined?{}:{bankValidationFixtures}),
    })
    assertSafeResult(result)
    emit({ type: 'COMMAND_RESULT', status: result.status, sessionId: result.sessionId, journeyId: result.journeyId, result })
    return EXIT.APPROVAL_REQUIRED
  }
  if (['journey-approve', 'journey-reject'].includes(command.kind)) {
    const result = await service.journeyDecision({
      sessionId: command.sessionId, journeyId: command.journeyId, revision: command.revision,
      proposalId: command.proposalId, contentHash: command.contentHash,
      approved: command.kind === 'journey-approve', signal,
    })
    assertSafeResult(result)
    emit({ type: 'COMMAND_RESULT', status: result.status, sessionId: result.sessionId, journeyId: result.journeyId, result })
    return EXIT.SUCCESS
  }
  if (command.kind === 'journey-execute') {
    const result = await service.journeyExecute({
      sessionId: command.sessionId, journeyId: command.journeyId, signal,
      ...(command.repeat ? {repeat:true} : {}),
    })
    assertSafeResult(result)
    emit({ type: 'COMMAND_RESULT', status: result.status, sessionId: result.sessionId, journeyId: result.journeyId, result })
    return EXIT.SUCCESS
  }
  if (command.kind === 'evidence-verify') {
    const result = await service.evidenceVerify({ journeyId: command.journeyId, signal })
    if (result?.verdict !== 'VERIFIED') throw new CliError(result?.errorCode || 'I10_EVIDENCE_VERIFICATION_FAILED', EXIT.EVIDENCE_GATE_FAILED)
    assertSafeResult(result)
    emit({ type: 'COMMAND_RESULT', status: 'VERIFIED', journeyId: command.journeyId, result })
    return EXIT.SUCCESS
  }
  const method = methodFor(command.kind)
  let correction
  if(command.kind==='feedback-record'){
    try {correction=JSON.parse(await readInput(command.inputFile,stdin))}catch(error){if(error instanceof CliError)throw error;throw new CliError('FEEDBACK_CORRECTION_JSON_INVALID',EXIT.INPUT_INVALID)}
  }
  if (!method || typeof service[method] !== 'function') throw new CliError('COMMAND_NOT_AVAILABLE', EXIT.RUNTIME_UNAVAILABLE)
  const result = await service[method]({ sessionId: command.sessionId, journeyId: command.journeyId, signal,
    ...(['feedback-record','feedback-verify','feedback-show'].includes(command.kind)?{
      incidentId:command.incidentId,feedbackId:command.feedbackId,verificationJourneyId:command.verificationJourneyId,correction}:{}),
    ...(['verification-status','verification-decide'].includes(command.kind)?{
      challengeId:command.challengeId,revision:command.revision,decision:command.decision}:{}),
    ...(['schedule-create','schedule-status','schedule-disable','failure-show'].includes(command.kind)?{
      scheduleId:command.scheduleId,incidentId:command.incidentId,cronExpression:command.cronExpression,
      runAt:command.runAt,timezone:command.timezone,reason:command.reason}:{}),
  })
  assertSafeResult(result)
  emit({ type: 'COMMAND_RESULT', status: 'COMPLETED', result })
  if (command.kind === 'doctor' && result?.status !== 'READY') return EXIT.RUNTIME_UNAVAILABLE
  if (command.kind === 'service-status' && !['READY', 'HEALTHY'].includes(result?.status)) return EXIT.RUNTIME_UNAVAILABLE
  return EXIT.SUCCESS
}

export async function runCli(argv, {
  service = createUnavailableService(), stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
  signal, interactiveRunner,
} = {}) {
  let sequence = 0
  const emit = (fields) => {
    const event = { schemaVersion: EVENT_SCHEMA_VERSION, sequence: ++sequence, ...fields }
    for (const key of Object.keys(event)) if (event[key] === undefined) delete event[key]
    assertEvent(event)
    stdout.write(`${JSON.stringify(event)}\n`)
  }
  try {
    const command = parseCommand(argv)
    if (command.kind.startsWith('interactive')) {
      const runner = interactiveRunner || (await import('../tui/runtime-bridge.mjs')).runTerminalSession
      return await runner({ command, service, signal })
    }
    return await executeHeadless(command, { service, stdin, signal, emit })
  } catch (error) {
    if (error?.code === 'EPIPE') return EXIT.SUCCESS
    if (error?.name === 'AbortError') {
      try { emit({ type: 'CANCELLED', status: 'CANCELLED', messageCode: 'OPERATION_CANCELLED' }) } catch (writeError) { if (writeError?.code !== 'EPIPE') throw writeError }
      return EXIT.CANCELLED
    }
    const code = error instanceof CliError ? error.code : 'UNEXPECTED_FAILURE'
    const exitCode = error instanceof CliError ? error.exitCode : EXIT.FAILURE
    try { emit({ type: 'ERROR', status: 'FAILED', messageCode: code }) } catch (writeError) { if (writeError?.code === 'EPIPE') return EXIT.SUCCESS; throw writeError }
    stderr.write(`hz-agent: ${code}\n`)
    return exitCode
  }
}
