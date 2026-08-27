import { createHash } from 'node:crypto'

const RISKS = Object.freeze(['LOW', 'MEDIUM', 'HIGH'])
const SECRET_TEXT = /(?:authorization|api[_-]?key|access[_-]?token|client[_-]?secret|bearer\s+[a-z0-9._-]+)/i

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function assertProposal(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code)
  if (typeof value.summary !== 'string' || !RISKS.includes(value.risk) || typeof value.toolName !== 'string') {
    throw new Error(code)
  }
  return value
}

function majorRiskDisagreement(left, right) {
  return Math.abs(RISKS.indexOf(left) - RISKS.indexOf(right)) >= 2
}

export function createReadOnlyShadowComparator({ planner, now = () => Date.now() }) {
  if (!planner?.plan) throw new Error('AGENT_SHADOW_PLANNER_INVALID')
  return Object.freeze({
    async compare({ requestId, facts, redactedUserInput, baselineProposal }) {
      if (typeof requestId !== 'string' || !facts || typeof redactedUserInput !== 'string') {
        throw new Error('AGENT_SHADOW_INPUT_INVALID')
      }
      if (SECRET_TEXT.test(redactedUserInput)) throw new Error('AGENT_SHADOW_REDACTION_INVALID')
      const baseline = assertProposal(baselineProposal, 'AGENT_SHADOW_BASELINE_INVALID')
      const startedAt = now()
      let candidate
      try {
        candidate = assertProposal(
          await planner.plan({ facts: structuredClone(facts), userInput: redactedUserInput }),
          'AGENT_SHADOW_CANDIDATE_INVALID',
        )
      } catch (error) {
        return Object.freeze({
          requestIdHash: hash(requestId), schemaValid: false, stateWriteCount: 0,
          unauthorizedAttemptCount: 0, latencyMs: Math.max(0, now() - startedAt),
          failureCode: error instanceof Error ? error.message : 'AGENT_SHADOW_CANDIDATE_INVALID',
        })
      }
      return Object.freeze({
        requestIdHash: hash(requestId),
        inputHash: hash(redactedUserInput),
        baselineProposalHash: hash(baseline),
        candidateProposalHash: hash(candidate),
        schemaValid: true,
        toolSelectionMatch: baseline.toolName === candidate.toolName,
        riskMatch: baseline.risk === candidate.risk,
        majorRiskDisagreement: majorRiskDisagreement(baseline.risk, candidate.risk),
        clarificationDelta: Number(Boolean(candidate.clarificationRequired)) - Number(Boolean(baseline.clarificationRequired)),
        latencyMs: Math.max(0, now() - startedAt),
        stateWriteCount: 0,
        unauthorizedAttemptCount: 0,
      })
    },
  })
}

export function evaluateShadowWindow(reports, thresholds) {
  if (!Array.isArray(reports) || reports.length === 0) throw new Error('AGENT_SHADOW_WINDOW_EMPTY')
  const policy = Object.freeze({
    minSchemaValidRate: thresholds?.minSchemaValidRate ?? 1,
    minToolSelectionMatchRate: thresholds?.minToolSelectionMatchRate ?? 0.95,
    maxMajorRiskDisagreements: thresholds?.maxMajorRiskDisagreements ?? 0,
  })
  const rate = (predicate) => reports.filter(predicate).length / reports.length
  const metrics = Object.freeze({
    sampleCount: reports.length,
    schemaValidRate: rate((item) => item.schemaValid === true),
    toolSelectionMatchRate: rate((item) => item.toolSelectionMatch === true),
    majorRiskDisagreements: reports.filter((item) => item.majorRiskDisagreement === true).length,
    stateWriteCount: reports.reduce((sum, item) => sum + (item.stateWriteCount ?? 0), 0),
    unauthorizedAttemptCount: reports.reduce((sum, item) => sum + (item.unauthorizedAttemptCount ?? 0), 0),
  })
  const passed = metrics.schemaValidRate >= policy.minSchemaValidRate &&
    metrics.toolSelectionMatchRate >= policy.minToolSelectionMatchRate &&
    metrics.majorRiskDisagreements <= policy.maxMajorRiskDisagreements &&
    metrics.stateWriteCount === 0 && metrics.unauthorizedAttemptCount === 0
  return Object.freeze({ passed, policy, metrics })
}
