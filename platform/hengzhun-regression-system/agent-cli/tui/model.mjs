import { assertEvent, EXIT } from '../src/contracts.mjs'

const SLASH = new Set(['/new', '/resume', '/fork', '/attach', '/journey', '/evidence', '/approve', '/reject', '/credential', '/doctor', '/compact', '/exit'])
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/

export function createTuiState() {
  return Object.freeze({
    eventCount: 0,
    stage: 'IDLE',
    sessionId: null,
    journeyId: null,
    transcript: Object.freeze([]),
    modal: null,
    footerCode: 'READY',
  })
}

function append(state, role, text) {
  const transcript = [...state.transcript, Object.freeze({ role, text: String(text).slice(0, 20_000) })].slice(-200)
  return { ...state, transcript: Object.freeze(transcript) }
}

export function reduceTuiEvent(state, event) {
  assertEvent(event)
  let next = { ...state, eventCount: state.eventCount + 1 }
  if (event.sessionId) next.sessionId = event.sessionId
  if (event.journeyId) next.journeyId = event.journeyId
  switch (event.type) {
    case 'STARTED': return Object.freeze({ ...next, stage: 'RUNNING', footerCode: 'WORKING' })
    case 'ATTACHMENT_IMPORTED':
      return Object.freeze(append({ ...next, footerCode: 'ATTACHMENT_READY' }, 'system', `Attachment ready: ${event.attachmentRef}`))
    case 'RESPONSE':
      return Object.freeze(append({ ...next, stage: 'COMPLETED', modal: null, footerCode: 'READY' }, 'assistant', event.text || 'COMPLETED'))
    case 'CLARIFICATION_REQUIRED':
      return Object.freeze(append({ ...next, stage: 'NEEDS_INPUT', modal: null, footerCode: 'INPUT_REQUIRED' }, 'assistant', event.text || 'INPUT_REQUIRED'))
    case 'APPROVAL_REQUIRED':
      return Object.freeze(append({ ...next, stage: 'AWAITING_APPROVAL', modal: Object.freeze({ ...event.proposal }), footerCode: 'APPROVAL_REQUIRED' }, 'proposal', event.proposal.summary))
    case 'COMMAND_RESULT':
      return Object.freeze(append(
        { ...next, stage: event.status || 'COMPLETED', modal: null, footerCode: 'READY' },
        'system',
        event.result === undefined
          ? `${event.command || 'command'}: ${event.status || 'COMPLETED'}`
          : `${event.command || 'command'}: ${JSON.stringify(event.result)}`,
      ))
    case 'ERROR':
      return Object.freeze(append({ ...next, stage: 'FAILED', modal: null, footerCode: event.messageCode }, 'error', event.messageCode))
    case 'CANCELLED':
      return Object.freeze(append({ ...next, stage: 'CANCELLED', modal: null, footerCode: 'CANCELLED' }, 'system', 'Operation cancelled'))
    default: return Object.freeze(next)
  }
}

function requireArgument(value, code) {
  if (!value) return { error: code }
  return null
}

export function interpretInput(state, rawInput) {
  const input = String(rawInput || '').trim()
  if (!input) return { error: 'INPUT_EMPTY' }
  if (!input.startsWith('/')) return { intent: Object.freeze({ type: 'SUBMIT_TEXT', text: input }) }
  const [command, ...parts] = input.split(/\s+/)
  if (!SLASH.has(command)) return { error: 'SLASH_COMMAND_UNKNOWN' }
  const argument = parts.join(' ')
  if (['/new', '/credential', '/doctor', '/compact', '/exit', '/reject'].includes(command) && argument) return { error: 'SLASH_ARGUMENT_FORBIDDEN' }
  if (command === '/compact') {
    const kept = state.transcript.slice(-20)
    return { state: Object.freeze({ ...state, transcript: Object.freeze([{ role: 'system', text: 'Earlier transcript compacted.' }, ...kept]), footerCode: 'COMPACTED' }) }
  }
  if (command === '/exit') return { intent: Object.freeze({ type: 'EXIT', exitCode: EXIT.SUCCESS }) }
  if (command === '/new') return { intent: Object.freeze({ type: 'NEW_SESSION' }) }
  if (command === '/credential') return { intent: Object.freeze({ type: 'CREDENTIAL_ENROLL' }) }
  if (command === '/doctor') return { intent: Object.freeze({ type: 'DOCTOR' }) }
  if (command === '/resume') {
    const missing = requireArgument(argument, 'SESSION_ID_REQUIRED'); if (missing) return missing
    if (!ID.test(argument)) return { error: 'SESSION_ID_INVALID' }
    return { intent: Object.freeze({ type: 'RESUME_SESSION', sessionId: argument }) }
  }
  if (command === '/fork') {
    const sessionId = argument || state.sessionId
    if (!ID.test(String(sessionId || ''))) return { error: 'SESSION_ID_INVALID' }
    return { intent: Object.freeze({ type: 'FORK_SESSION', sessionId }) }
  }
  if (command === '/journey' || command === '/evidence') {
    const journeyId = argument || state.journeyId
    if (!ID.test(String(journeyId || ''))) return { error: 'JOURNEY_ID_INVALID' }
    return { intent: Object.freeze({ type: command === '/journey' ? 'SHOW_JOURNEY' : 'SHOW_EVIDENCE', journeyId }) }
  }
  if (command === '/attach') {
    const missing = requireArgument(argument, 'ATTACHMENT_PATH_REQUIRED'); if (missing) return missing
    return { intent: Object.freeze({ type: 'ATTACH_FILE', localPath: argument }) }
  }
  if (!state.modal) return { error: 'NO_PENDING_PROPOSAL' }
  if (command === '/reject') return { intent: Object.freeze({
    type: 'APPROVAL_DECISION', approved: false, proposalId: state.modal.proposalId, contentHash: state.modal.contentHash,
  }) }
  const requiredSuffix = state.modal.proposalId.slice(-8)
  if (state.modal.risk === 'HIGH' && argument !== requiredSuffix) return { error: 'HIGH_APPROVAL_SUFFIX_MISMATCH' }
  if (state.modal.risk !== 'HIGH' && argument && argument !== requiredSuffix) return { error: 'APPROVAL_SUFFIX_MISMATCH' }
  return { intent: Object.freeze({
    type: 'APPROVAL_DECISION', approved: true, proposalId: state.modal.proposalId, contentHash: state.modal.contentHash,
  }) }
}

export class TuiController {
  constructor({ onIntent = () => undefined, onChange = () => undefined } = {}) {
    this.state = createTuiState()
    this.onIntent = onIntent
    this.onChange = onChange
  }

  receive(event) {
    this.state = reduceTuiEvent(this.state, event)
    this.onChange(this.state)
    return this.state
  }

  submit(input) {
    const interpreted = interpretInput(this.state, input)
    if (interpreted.state) this.state = interpreted.state
    if (interpreted.error) this.state = Object.freeze({ ...this.state, footerCode: interpreted.error })
    this.onChange(this.state)
    if (interpreted.intent) this.onIntent(interpreted.intent)
    return interpreted
  }

  cancel() {
    const intent = Object.freeze({ type: 'CANCEL_AND_EXIT', exitCode: EXIT.CANCELLED })
    this.onIntent(intent)
    return intent
  }
}
