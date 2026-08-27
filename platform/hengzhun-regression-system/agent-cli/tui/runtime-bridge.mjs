import { randomUUID } from 'node:crypto'

import { assertEvent, EXIT } from '../src/contracts.mjs'
import { assertSafeResult, normalizeControllerResult } from '../src/headless-app.mjs'
import { preflightAttachment } from '../src/preflight.mjs'
import { createTerminalUi } from './terminal-app.mjs'

function terminalEvent(normalized) {
  return { type: normalized.eventType, ...normalized, eventType: undefined, exitCode: undefined }
}

export async function runTerminalSession({
  command,
  service,
  signal,
  uiFactory = createTerminalUi,
} = {}) {
  let sequence = 0
  let activeSessionId = null
  let pendingAttachments = []
  let settled = false
  let queue = Promise.resolve()
  let resolveExit
  const completion = new Promise((resolve) => { resolveExit = resolve })
  const receive = (fields) => {
    const event = { schemaVersion: 'hengzhun-cli-event/v1', sequence: ++sequence, ...fields }
    for (const key of Object.keys(event)) if (event[key] === undefined) delete event[key]
    app.receive(assertEvent(event))
  }
  const finish = (code) => {
    if (settled) return
    settled = true
    app.stop()
    resolveExit(code)
  }
  const emitError = (error) => receive({
    type: 'ERROR', status: 'FAILED',
    messageCode: typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(error.code) ? error.code : 'UNEXPECTED_FAILURE',
  })
  const emitResult = (name, result) => {
    assertSafeResult(result)
    receive({ type: 'COMMAND_RESULT', command: name, status: 'COMPLETED', result })
  }
  const applyControllerResult = (result) => {
    const normalized = normalizeControllerResult(result)
    if (normalized.sessionId) activeSessionId = normalized.sessionId
    if (result.operationKind && ['COMPLETED', 'REJECTED'].includes(result.status)) activeSessionId = null
    receive(terminalEvent(normalized))
    return normalized.exitCode
  }
  const handleIntent = async (intent) => {
    if (signal?.aborted) return finish(EXIT.CANCELLED)
    if (intent.type === 'EXIT' || intent.type === 'CANCEL_AND_EXIT') return finish(intent.exitCode)
    if (intent.type === 'NEW_SESSION') {
      activeSessionId = null
      pendingAttachments = []
      emitResult('new', { session: 'NEW' })
      return
    }
    if (intent.type === 'SUBMIT_TEXT') {
      receive({ type: 'STARTED', command: activeSessionId ? 'continue' : 'run' })
      const result = activeSessionId
        ? await service.continueSession({ sessionId: activeSessionId, input: intent.text, attachmentRefs: pendingAttachments, signal })
        : await service.start({ input: intent.text, attachmentRefs: pendingAttachments, noSession: command.noSession, signal })
      pendingAttachments = []
      applyControllerResult(result)
      return
    }
    if (intent.type === 'APPROVAL_DECISION') {
      if (!activeSessionId) throw Object.assign(new Error('SESSION_ID_REQUIRED'), { code: 'SESSION_ID_REQUIRED' })
      receive({ type: 'STARTED', command: 'resume' })
      applyControllerResult(await service.resume({
        sessionId: activeSessionId, proposalId: intent.proposalId, approved: intent.approved, signal,
      }))
      return
    }
    if (intent.type === 'ATTACH_FILE') {
      if (activeSessionId) throw Object.assign(new Error('ATTACHMENT_REQUIRES_NEW_SESSION'), { code: 'ATTACHMENT_REQUIRES_NEW_SESSION' })
      const descriptor = await preflightAttachment(intent.localPath)
      const receipt = await service.importAttachment({ ...descriptor, signal })
      if (typeof receipt?.attachmentRef !== 'string' || receipt.attachmentRef.length < 8) throw Object.assign(new Error('ATTACHMENT_RECEIPT_INVALID'), { code: 'ATTACHMENT_RECEIPT_INVALID' })
      pendingAttachments.push(receipt.attachmentRef)
      receive({ type: 'ATTACHMENT_IMPORTED', attachmentRef: receipt.attachmentRef, sha256: descriptor.sha256, size: descriptor.size })
      return
    }
    if (intent.type === 'RESUME_SESSION') {
      const result = await service.sessionShow({ sessionId: intent.sessionId, signal })
      activeSessionId = result.sessionId
      emitResult('resume', result)
      return
    }
    if (intent.type === 'FORK_SESSION') {
      const result = await service.sessionFork({ sessionId: intent.sessionId, signal })
      activeSessionId = result.sessionId
      emitResult('fork', result)
      return
    }
    if (intent.type === 'SHOW_JOURNEY') return emitResult('journey', await service.journeyShow({ journeyId: intent.journeyId, signal }))
    if (intent.type === 'SHOW_EVIDENCE') return emitResult('evidence', await service.evidence({ journeyId: intent.journeyId, signal }))
    if (intent.type === 'CREDENTIAL_ENROLL') {
      receive({ type: 'STARTED', command: 'credential-enroll' })
      return applyControllerResult(await service.credentialEnroll({ requestId: `request-${randomUUID()}`, signal }))
    }
    if (intent.type === 'DOCTOR') return emitResult('doctor', await service.doctor({ signal }))
    throw Object.assign(new Error('TUI_INTENT_UNSUPPORTED'), { code: 'TUI_INTENT_UNSUPPORTED' })
  }
  const app = uiFactory({ onIntent(intent) {
    queue = queue.then(() => handleIntent(intent)).catch((error) => { emitError(error) })
  } })
  app.start()
  const abort = () => finish(EXIT.CANCELLED)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    if (command.kind === 'interactive-resume') {
      const result = await service.sessionShow({ sessionId: command.sessionId, signal })
      activeSessionId = result.sessionId
      emitResult('resume', result)
    } else if (command.kind === 'interactive-continue') {
      const listed = await service.sessionList({ signal })
      const latest = [...(listed.sessions || [])].filter((item) => item.status === 'ACTIVE')
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0]
      if (!latest) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' })
      activeSessionId = latest.sessionId
      emitResult('continue', latest)
    }
  } catch (error) { emitError(error) }
  const exitCode = await completion
  await queue
  signal?.removeEventListener('abort', abort)
  return exitCode
}
