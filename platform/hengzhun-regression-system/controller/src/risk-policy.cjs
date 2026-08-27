'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { loadToolPolicy } = require('./tool-policy.cjs')

const ALLOWED_RISKS = new Set(['LOW', 'MEDIUM', 'HIGH'])

function loadRiskPolicy(policyPath = path.resolve(__dirname, '..', 'risk-policy-v2.json')) {
  const source = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  const toolPolicy = loadToolPolicy()
  if (source.schemaVersion !== 'hengzhun-controller-risk-policy/v2') {
    throw new Error('AGENT_CONTROLLER_RISK_POLICY_SCHEMA_INVALID')
  }
  if (source.profile !== 'DETERMINISTIC_PREFETCH_JSON') {
    throw new Error('AGENT_CONTROLLER_PROFILE_INVALID')
  }
  if (!Number.isInteger(source.proposalTtlMs) || source.proposalTtlMs < 1000) {
    throw new Error('AGENT_CONTROLLER_PROPOSAL_TTL_INVALID')
  }
  const entries = Object.entries(source.toolRisk ?? {})
  const expected = [...toolPolicy.mutatingTools].sort()
  const actual = entries.map(([name]) => name).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('AGENT_CONTROLLER_RISK_POLICY_COVERAGE_INVALID')
  }
  for (const [, risk] of entries) {
    if (!ALLOWED_RISKS.has(risk)) throw new Error('AGENT_CONTROLLER_RISK_POLICY_VALUE_INVALID')
  }
  const toolRisk = Object.freeze({ ...source.toolRisk })
  return Object.freeze({
    schemaVersion: source.schemaVersion,
    profile: source.profile,
    proposalTtlMs: source.proposalTtlMs,
    toolRisk,
    riskFor(toolName) {
      const risk = toolRisk[toolName]
      if (!risk) throw new Error('AGENT_CONTROLLER_RISK_POLICY_TOOL_UNKNOWN')
      return risk
    },
  })
}

module.exports = { loadRiskPolicy }
