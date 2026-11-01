export const EVENT_SCHEMA_VERSION = 'hengzhun-cli-event/v1'

export const EXIT = Object.freeze({
  SUCCESS: 0,
  USAGE: 2,
  INPUT_INVALID: 2,
  RUNTIME_UNAVAILABLE: 3,
  EXECUTION_FAILED: 4,
  EVIDENCE_GATE_FAILED: 5,
  FAILURE: 4,
  APPROVAL_REQUIRED: 20,
  REJECTED: 21,
  CANCELLED: 130,
})

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/
const OPTIONS_WITH_VALUE = new Set(['--input-file', '--attach', '--proposal', '--entry-url', '--target-system', '--credential-ref', '--adapter', '--session', '--revision', '--content-hash', '--bank-validation-fixtures', '--cron', '--at', '--timezone', '--reason', '--journey'])
const FLAGS = new Set(['--jsonl', '--no-session', '--approve', '--reject', '--repeat'])

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

function requireHash(value, code) {
  if (!/^[0-9a-f]{64}$/.test(String(value || ''))) throw new CliError(code)
  return value
}

function requireRevision(value) {
  if (!/^[1-9][0-9]*$/.test(String(value || ''))) throw new CliError('JOURNEY_REVISION_INVALID')
  return Number(value)
}

function requireJourneyProposal(value) {
  if (!/^proposal_[0-9a-f]{32}$/.test(String(value || ''))) throw new CliError('PROPOSAL_ID_INVALID')
  return value
}

function requireTargetAdapter(value) {
  if (!['fuxing-bank-demo','fuxing-bank-operations'].includes(value)) throw new CliError('TARGET_ADAPTER_INVALID')
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
    const options = parseOptions(args.slice(1), new Set(['--input-file', '--attach', '--jsonl', '--bank-validation-fixtures']))
    if (!options['--jsonl']) throw new CliError('JSONL_REQUIRED')
    if (!options['--input-file']) throw new CliError('INPUT_FILE_REQUIRED')
    if (options.attachments.length > 8) throw new CliError('ATTACHMENT_COUNT_EXCEEDED', EXIT.INPUT_INVALID)
    if(options['--bank-validation-fixtures']==='-')throw new CliError('BANK_VALIDATION_FILE_REQUIRED')
    return Object.freeze({
      kind: 'run', inputFile: options['--input-file'], attachments: Object.freeze(options.attachments),
      noSession: false, jsonl: true,
      ...(options['--bank-validation-fixtures']?{bankValidationFixturesFile:options['--bank-validation-fixtures']}:{}),
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
    if (action === 'start' && args.length === 2) return Object.freeze({ kind: 'session-start', jsonl: true })
    if (['resume', 'status'].includes(action) && args.length === 3) return Object.freeze({ kind: `session-${action}`, sessionId: requireId(identifier, 'SESSION_ID_INVALID'), jsonl: true })
    throw new CliError('SESSION_COMMAND_INVALID')
  }
  if (noun === 'journey') {
    if (action === 'author') {
      const sessionId = requireId(identifier, 'SESSION_ID_INVALID')
      const options = parseOptions(rest, new Set(['--input-file', '--entry-url', '--target-system', '--credential-ref', '--adapter', '--jsonl', '--bank-validation-fixtures']))
      if (!options['--jsonl']) throw new CliError('JSONL_REQUIRED')
      if (!options['--input-file']) throw new CliError('INPUT_FILE_REQUIRED')
      if (!options['--entry-url']) throw new CliError('ENTRY_URL_REQUIRED')
      if (!options['--target-system']) throw new CliError('TARGET_SYSTEM_REQUIRED')
      if (!options['--credential-ref']) throw new CliError('CREDENTIAL_REF_REQUIRED')
      if(options['--bank-validation-fixtures']==='-')throw new CliError('BANK_VALIDATION_FILE_REQUIRED')
      return Object.freeze({
        kind: 'journey-author', sessionId, inputFile: options['--input-file'], entryUrl: options['--entry-url'],
        targetSystem: options['--target-system'], credentialRef: options['--credential-ref'], jsonl: true,
        ...(options['--bank-validation-fixtures']?{bankValidationFixturesFile:options['--bank-validation-fixtures']}:{}),
        ...(options['--adapter'] ? { adapterSelection: requireTargetAdapter(options['--adapter']) } : {}),
      })
    }
    if (action === 'validate' && args.length === 3) {
      return Object.freeze({ kind: 'journey-validate', journeyId: requireId(identifier, 'JOURNEY_ID_INVALID'), jsonl: true })
    }
    if (['approve', 'reject'].includes(action)) {
      const journeyId = requireId(identifier, 'JOURNEY_ID_INVALID')
      const options = parseOptions(rest, new Set(['--session', '--revision', '--proposal', '--content-hash', '--jsonl']))
      if (!options['--jsonl']) throw new CliError('JSONL_REQUIRED')
      return Object.freeze({
        kind: `journey-${action}`, journeyId,
        sessionId: requireId(options['--session'], 'SESSION_ID_INVALID'),
        revision: requireRevision(options['--revision']),
        proposalId: requireJourneyProposal(options['--proposal']),
        contentHash: requireHash(options['--content-hash'], 'CONTENT_HASH_INVALID'), jsonl: true,
      })
    }
    if (action === 'execute') {
      const journeyId = requireId(identifier, 'JOURNEY_ID_INVALID')
      const options = parseOptions(rest, new Set(['--session', '--jsonl', '--repeat']))
      if (!options['--jsonl']) throw new CliError('JSONL_REQUIRED')
      return Object.freeze({
        kind: 'journey-execute', journeyId,
        sessionId: requireId(options['--session'], 'SESSION_ID_INVALID'), jsonl: true,
        ...(options['--repeat'] ? {repeat:true} : {}),
      })
    }
    if (action === 'show' && args.length === 3) {
      return Object.freeze({ kind: 'journey-show', journeyId: requireId(identifier, 'JOURNEY_ID_INVALID'), jsonl: true })
    }
  }
  if (noun === 'evidence' && args.length === 2) {
    return Object.freeze({ kind: 'evidence', journeyId: requireId(action, 'JOURNEY_ID_INVALID'), jsonl: true })
  }
  if (noun === 'evidence' && action === 'verify') {
    const journeyId = requireId(identifier, 'JOURNEY_ID_INVALID')
    const options = parseOptions(rest, new Set(['--jsonl']))
    if (!options['--jsonl']) throw new CliError('JSONL_REQUIRED')
    return Object.freeze({ kind: 'evidence-verify', journeyId, jsonl: true })
  }
  if (noun === 'credential' && action === 'enroll' && args.length === 2) return Object.freeze({ kind: 'credential-enroll', jsonl: true })
  if(noun==='feedback') {
    if(action==='show'&&args.length===3)return Object.freeze({kind:'feedback-show',feedbackId:requireId(identifier,'FEEDBACK_ID_INVALID'),jsonl:true})
    if(['record','verify'].includes(action)){
      const options=parseOptions(rest,new Set(['--session','--input-file','--journey','--jsonl']))
      if(!options['--jsonl'])throw new CliError('JSONL_REQUIRED')
      if(action==='record'&&(!options['--input-file']||options['--journey']))throw new CliError('FEEDBACK_CORRECTION_FILE_REQUIRED')
      if(action==='verify'&&(options['--input-file']||!options['--journey']))throw new CliError('FEEDBACK_VERIFICATION_JOURNEY_REQUIRED')
      return Object.freeze({kind:`feedback-${action}`,sessionId:requireId(options['--session'],'SESSION_ID_INVALID'),jsonl:true,
        ...(action==='record'?{incidentId:requireId(identifier,'INCIDENT_ID_INVALID'),inputFile:options['--input-file']}:
          {feedbackId:requireId(identifier,'FEEDBACK_ID_INVALID'),verificationJourneyId:requireId(options['--journey'],'JOURNEY_ID_INVALID')})})
    }
  }
  if(noun==='verification') {
    if(action==='status'&&args.length===3)return Object.freeze({kind:'verification-status',challengeId:requireId(identifier,'CHALLENGE_ID_INVALID'),jsonl:true})
    if(['ready','confirm','cancel'].includes(action)){
      const options=parseOptions(rest,new Set(['--session','--revision','--jsonl']))
      if(!options['--jsonl'])throw new CliError('JSONL_REQUIRED')
      return Object.freeze({kind:'verification-decide',challengeId:requireId(identifier,'CHALLENGE_ID_INVALID'),
        sessionId:requireId(options['--session'],'SESSION_ID_INVALID'),revision:requireRevision(options['--revision']),
        decision:({ready:'USER_READY',confirm:'USER_ACTION_COMPLETED',cancel:'CANCEL'})[action],jsonl:true})
    }
  }
  if(noun==='schedule') {
    if(action==='status'&&args.length===3)return Object.freeze({kind:'schedule-status',scheduleId:requireId(identifier,'SCHEDULE_ID_INVALID'),jsonl:true})
    if(action==='create'){
      const options=parseOptions(rest,new Set(['--session','--cron','--at','--timezone','--jsonl']))
      if(!options['--jsonl'])throw new CliError('JSONL_REQUIRED')
      if(Boolean(options['--cron'])===Boolean(options['--at']))throw new CliError('ONE_SCHEDULE_TIME_REQUIRED')
      if(!options['--timezone'])throw new CliError('TIMEZONE_REQUIRED')
      try{new Intl.DateTimeFormat('en',{timeZone:options['--timezone']})}catch{throw new CliError('TIMEZONE_INVALID')}
      if(options['--cron']&&(options['--cron'].trim().split(/\s+/).length!==5||!/^[\d*/?,\- ]+$/.test(options['--cron'])))throw new CliError('CRON_INVALID')
      if(options['--at']&&(!/(?:Z|[+-]\d{2}:\d{2})$/.test(options['--at'])||!Number.isFinite(Date.parse(options['--at']))||Date.parse(options['--at'])<=Date.now()))throw new CliError('RUN_AT_INVALID')
      return Object.freeze({kind:'schedule-create',journeyId:requireId(identifier,'JOURNEY_ID_INVALID'),
        sessionId:requireId(options['--session'],'SESSION_ID_INVALID'),timezone:options['--timezone'],jsonl:true,
        ...(options['--cron']?{cronExpression:options['--cron']}:{runAt:options['--at']})})
    }
    if(action==='disable'){
      const options=parseOptions(rest,new Set(['--session','--reason','--jsonl']))
      if(!options['--jsonl'])throw new CliError('JSONL_REQUIRED')
      if(!options['--reason']?.trim())throw new CliError('SCHEDULE_REASON_REQUIRED')
      return Object.freeze({kind:'schedule-disable',scheduleId:requireId(identifier,'SCHEDULE_ID_INVALID'),
        sessionId:requireId(options['--session'],'SESSION_ID_INVALID'),reason:options['--reason'],jsonl:true})
    }
  }
  if(noun==='failure'&&action==='show'&&args.length===3)return Object.freeze({kind:'failure-show',incidentId:requireId(identifier,'INCIDENT_ID_INVALID'),jsonl:true})
  if (noun === 'doctor' && args.length === 1) return Object.freeze({ kind: noun, jsonl: true })
  if (noun === 'service' && action === 'status' && args.length === 2) return Object.freeze({ kind: 'service-status', jsonl: true })
  if (noun === 'version' && args.length === 1) return Object.freeze({ kind: noun, jsonl: true })
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
