'use strict'

const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..', '..')
const defaultContractPath = path.join(productRoot, 'contracts', 'mcp', 'hengzhun-i8.json')
const defaultPolicyPath = path.join(productRoot, 'controller', 'tool-policy-v1.json')

class ControllerToolPolicyError extends Error {
  constructor(code, details) {
    super(code)
    this.name = 'ControllerToolPolicyError'
    this.code = code
    this.details = details
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POLICY_INVALID', label)
  }
  const unique = new Set(values)
  if (unique.size !== values.length) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POLICY_DUPLICATE', label)
  }
  return unique
}

function validateToolPolicy(contract, policy) {
  if (policy?.schemaVersion !== 'hengzhun-controller-tool-policy/v1') {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POLICY_VERSION_INVALID')
  }
  if (!Array.isArray(contract?.tools)) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_MCP_CONTRACT_INVALID')
  }

  const activeNames = contract.tools
    .filter((candidate) => candidate?.status === 'ACTIVE')
    .map((candidate) => candidate.name)
  const active = uniqueStrings(activeNames, 'contract.activeTools')
  if (active.size !== policy.expectedActiveToolCount) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POPULATION_MISMATCH', {
      expected: policy.expectedActiveToolCount,
      actual: active.size,
    })
  }

  const readOnly = uniqueStrings(policy.readOnlyTools, 'policy.readOnlyTools')
  const mutating = uniqueStrings(policy.mutatingTools, 'policy.mutatingTools')
  const overlap = [...readOnly].filter((name) => mutating.has(name))
  if (overlap.length > 0) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POLICY_OVERLAP', overlap.sort())
  }

  const classified = new Set([...readOnly, ...mutating])
  const missing = [...active].filter((name) => !classified.has(name)).sort()
  const unknown = [...classified].filter((name) => !active.has(name)).sort()
  if (missing.length > 0) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POLICY_MISSING', missing)
  }
  if (unknown.length > 0) {
    throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_POLICY_UNKNOWN', unknown)
  }

  const conditional = uniqueStrings(
    policy.conditionalSideEffectTools,
    'policy.conditionalSideEffectTools',
  )
  const conditionalNotMutating = [...conditional].filter((name) => !mutating.has(name)).sort()
  if (conditionalNotMutating.length > 0) {
    throw new ControllerToolPolicyError(
      'AGENT_CONTROLLER_CONDITIONAL_SIDE_EFFECT_NOT_MUTATING',
      conditionalNotMutating,
    )
  }

  const classification = new Map([
    ...[...readOnly].map((name) => [name, 'READ_ONLY']),
    ...[...mutating].map((name) => [name, 'MUTATING']),
  ])
  const classify = (name) => {
    const value = classification.get(name)
    if (!value) throw new ControllerToolPolicyError('AGENT_CONTROLLER_TOOL_DENIED', name)
    return value
  }

  return Object.freeze({
    activeToolCount: active.size,
    readOnlyTools: Object.freeze([...readOnly]),
    mutatingTools: Object.freeze([...mutating]),
    conditionalSideEffectTools: Object.freeze([...conditional]),
    forbiddenCapabilities: Object.freeze([...uniqueStrings(policy.forbiddenCapabilities, 'policy.forbiddenCapabilities')]),
    plannerTools: Object.freeze([...readOnly]),
    classify,
  })
}

function loadToolPolicy({ contractPath = defaultContractPath, policyPath = defaultPolicyPath } = {}) {
  return validateToolPolicy(readJson(contractPath), readJson(policyPath))
}

module.exports = {
  ControllerToolPolicyError,
  defaultContractPath,
  defaultPolicyPath,
  loadToolPolicy,
  validateToolPolicy,
}
