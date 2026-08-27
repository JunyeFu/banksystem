export const EVENT_SCHEMA_VERSION = 'hengzhun-cli-event/v1'

export const EXIT = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
  INPUT_INVALID: 3,
  RUNTIME_UNAVAILABLE: 10,
  APPROVAL_REQUIRED: 20,
  REJECTED: 21,
  CANCELLED: 130,
})

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/
const OPTIONS_WITH_VALUE = new Set(['--input-file', '--attach', '--proposal'])
const FLAGS = new Set(['--jsonl', '--no-session', '--approve', '--reject'])

export class CliError extends Error {
  constructor(code, exitCode = EXIT.USAGE) {
    super(code)
    this.name = 'CliError'
    this.code = code
    this.exitCode = exitCode
  }
}

function requireId(value, code) {
  if (!ID.test(String(value || ''))) throw new CliError(code)
  return value
}

function parseOptions(args, allowed) {
  const options = { attachments: [] }
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--yes') throw new CliError('AUTO_APPROVAL_FORBIDDEN')
    if (!allowed.has(token) || (!FLAGS.has(token) && !OPTIONS_WITH_VALUE.has(token))) throw new CliError('UNKNOWN_OPTION')
    if (FLAGS.has(token)) {
      if (options[token] === true) throw new CliError('DUPLICATE_OPTION')
      options[token] = true
      continue
    }
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new CliError('OPTION_VALUE_REQUIRED')
    if (token === '--attach') options.attachments.push(value)
    else {
      if (options[token] !== undefined) throw new CliError('DUPLICATE_OPTION')
      options[token] = value
    }
  }
  return options
}

export function parseCommand(argv) {
  const args = [...argv]
  if (args.includes('--yes')) throw new CliError('AUTO_APPROVAL_FORBIDDEN')
  if (args.length === 0) return Object.freeze({ kind: 'interactive', noSession: false })
  if (args[0] === '--continue' && args.length === 1) return Object.freeze({ kind: 'interactive-continue' })
  if (args[0] === '--resume' && args.length === 2) return Object.freeze({ kind: 'interactive-resume', sessionId: requireId(args[1], 'SESSION_ID_INVALID') })
  if (args[0] === '--no-session' && args.length === 1) return Object.freeze({ kind: 'interactive', noSession: true })

  const [noun, action, identifier, ...rest] = args
  if (noun === 'run') {
    const options = parseOptions(args.slice(1), new Set(['--input-file', '--attach', '--jsonl']))
    if (!options['--jsonl']) throw new CliError('JSONL_REQUIRED')
    if (!options['--input-file']) throw new CliError('INPUT_FILE_REQUIRED')
    if (options.attachments.length > 8) throw new CliError('ATTACHMENT_COUNT_EXCEEDED', EXIT.INPUT_INVALID)
    return Object.freeze({
      kind: 'run', inputFile: options['--input-file'], attachments: Object.freeze(options.attachments),
      noSession: false, jsonl: true,
    })
  }
  if (noun === 'resume') {
    const sessionId = requireId(action, 'SESSION_ID_INVALID')
    const options = parseOptions(args.slice(2), new Set(['--approve', '--reject', '--proposal', '--jsonl']))
    if (Boolean(options['--approve']) === Boolean(options['--reject'])) throw new CliError('ONE_DECISION_REQUIRED')
    const proposalId = requireId(options['--proposal'], 'PROPOSAL_ID_INVALID')
    return Object.freeze({ kind: 'resume', sessionId, proposalId, approved: Boolean(options['--approve']), jsonl: true })
  }
  if (noun === 'session') {
    if (action === 'list' && args.length === 2) return Object.freeze({ kind: 'session-list', jsonl: true })
    if (['show', 'fork', 'archive'].includes(action) && args.length === 3) {
      return Object.freeze({ kind: `session-${action}`, sessionId: requireId(identifier, 'SESSION_ID_INVALID'), jsonl: true })
    }
    throw new CliError('SESSION_COMMAND_INVALID')
  }
  if (noun === 'journey' && action === 'show' && args.length === 3) {
    return Object.freeze({ kind: 'journey-show', journeyId: requireId(identifier, 'JOURNEY_ID_INVALID'), jsonl: true })
  }
  if (noun === 'evidence' && args.length === 2) {
    return Object.freeze({ kind: 'evidence', journeyId: requireId(action, 'JOURNEY_ID_INVALID'), jsonl: true })
  }
  if (noun === 'credential' && action === 'enroll' && args.length === 2) return Object.freeze({ kind: 'credential-enroll', jsonl: true })
  if (['doctor', 'service', 'version'].includes(noun) && args.length === 1) return Object.freeze({ kind: noun, jsonl: true })
  throw new CliError('COMMAND_INVALID')
}

const EVENT_TYPES = new Set(['STARTED', 'ATTACHMENT_IMPORTED', 'RESPONSE', 'CLARIFICATION_REQUIRED', 'APPROVAL_REQUIRED', 'COMMAND_RESULT', 'ERROR', 'CANCELLED'])
const EVENT_KEYS = new Set(['schemaVersion', 'sequence', 'type', 'command', 'status', 'sessionId', 'journeyId', 'attachmentRef', 'sha256', 'size', 'proposal', 'text', 'messageCode', 'result'])

export function assertEvent(event) {
  if (!event || event.schemaVersion !== EVENT_SCHEMA_VERSION || !Number.isInteger(event.sequence) || event.sequence < 1 || !EVENT_TYPES.has(event.type)) {
    throw new CliError('EVENT_SCHEMA_INVALID', EXIT.FAILURE)
  }
  for (const key of Object.keys(event)) if (!EVENT_KEYS.has(key)) throw new CliError('EVENT_SCHEMA_INVALID', EXIT.FAILURE)
  if (event.type === 'ERROR' && !/^[A-Z][A-Z0-9_]{0,95}$/.test(String(event.messageCode || ''))) throw new CliError('EVENT_SCHEMA_INVALID', EXIT.FAILURE)
  if (event.type === 'APPROVAL_REQUIRED') {
    const proposal = event.proposal
    if (!proposal || !ID.test(String(proposal.proposalId || '')) || !/^[0-9a-f]{64}$/.test(String(proposal.contentHash || '')) || !['LOW', 'MEDIUM', 'HIGH'].includes(proposal.risk)) {
      throw new CliError('EVENT_SCHEMA_INVALID', EXIT.FAILURE)
    }
  }
  return Object.freeze(event)
}
