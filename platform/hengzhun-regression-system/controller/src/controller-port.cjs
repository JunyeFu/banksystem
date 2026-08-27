'use strict'

const CONTROLLER_KINDS = Object.freeze(['flowise-v7', 'langgraph-deepagents-v1', 'langgraph-json-v2'])
const RESULT_STATUSES = Object.freeze(['COMPLETED', 'AWAITING_USER', 'FAILED_CLOSED'])

class ControllerContractError extends Error {
  constructor(code, details) {
    super(code)
    this.name = 'ControllerContractError'
    this.code = code
    this.details = details
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ControllerContractError('AGENT_CONTROLLER_INPUT_INVALID', field)
  }
}

function assertStartInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ControllerContractError('AGENT_CONTROLLER_INPUT_INVALID', 'input')
  }
  requiredString(input.requestId, 'requestId')
  requiredString(input.namespace, 'namespace')
  requiredString(input.userInput, 'userInput')
  return input
}

function assertResumeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ControllerContractError('AGENT_CONTROLLER_INPUT_INVALID', 'input')
  }
  requiredString(input.requestId, 'requestId')
  requiredString(input.namespace, 'namespace')
  requiredString(input.threadId, 'threadId')
  requiredString(input.journeyId, 'journeyId')
  if (!input.decision || typeof input.decision !== 'object' || Array.isArray(input.decision)) {
    throw new ControllerContractError('AGENT_CONTROLLER_INPUT_INVALID', 'decision')
  }
  return input
}

function assertControllerResult(result, expectedKind) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ControllerContractError('AGENT_CONTROLLER_RESULT_INVALID', 'result')
  }
  if (!CONTROLLER_KINDS.includes(result.controllerKind) || result.controllerKind !== expectedKind) {
    throw new ControllerContractError('AGENT_CONTROLLER_KIND_MISMATCH', result.controllerKind)
  }
  if (!RESULT_STATUSES.includes(result.status)) {
    throw new ControllerContractError('AGENT_CONTROLLER_RESULT_INVALID', 'status')
  }
  for (const field of ['threadId', 'journeyId', 'message']) requiredString(result[field], field)
  if (!Number.isInteger(result.harnessVersion) || result.harnessVersion < 0) {
    throw new ControllerContractError('AGENT_CONTROLLER_RESULT_INVALID', 'harnessVersion')
  }
  return result
}

class FlowiseAdapter {
  controllerKind = 'flowise-v7'

  constructor({ start, resume }) {
    if (typeof start !== 'function' || typeof resume !== 'function') {
      throw new ControllerContractError('AGENT_CONTROLLER_ADAPTER_INVALID')
    }
    this.startDelegate = start
    this.resumeDelegate = resume
  }

  async start(input) {
    assertStartInput(input)
    return assertControllerResult(await this.startDelegate(input), this.controllerKind)
  }

  async resume(input) {
    assertResumeInput(input)
    return assertControllerResult(await this.resumeDelegate(input), this.controllerKind)
  }
}

module.exports = {
  CONTROLLER_KINDS,
  RESULT_STATUSES,
  ControllerContractError,
  FlowiseAdapter,
  assertControllerResult,
  assertResumeInput,
  assertStartInput,
}
