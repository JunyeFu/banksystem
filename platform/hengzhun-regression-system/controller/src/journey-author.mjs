import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

import { z } from 'zod'
import { explicitTransferInput, transferInputMatches } from './explicit-transfer-input.mjs'

const rule = createRequire(import.meta.url)('../../contracts/security/sensitive-text-v1.json')
const sensitiveText = new RegExp(rule.pattern, rule.flags)
export function assertSafeAgentText(...values) {
  if (values.some(value => typeof value === 'string' && sensitiveText.test(value))) {
    throw new JourneyAuthorError('AGENT_SECRET_FORBIDDEN')
  }
}

const boundedText = (maximum) => z.string().trim().min(1).max(maximum)

const transferValuesSchema = z.object({
  payerAccountId: z.string().trim().regex(/^[1-9][0-9]{0,18}$/),
  payeeRef: z.uuid(),
  amount: z.string().trim().regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  purpose: boundedText(200),
}).strict().refine((value) => /[1-9]/.test(value.amount))

const modelCandidateSchema = z.object({
  title: boundedText(160),
  objective: boundedText(2000),
  summary: boundedText(1000),
  preconditions: z.array(boundedText(500)).max(50),
  steps: z.array(z.object({ action: boundedText(500), expected: boundedText(500) }).strict()).min(1).max(6),
  assertions: z.array(boundedText(500)).min(1).max(8),
  confidence: z.number().min(0).max(1),
  businessInputs: z.object({
    dateRange: boundedText(80).optional(),
    filter: boundedText(500).optional(),
    transfer: transferValuesSchema.optional(),
  }).strict().optional(),
}).strict()

export class JourneyAuthorError extends Error {
  constructor(code) {
    super(code)
    this.name = 'JourneyAuthorError'
    this.code = code
  }
}

function requireAuthorInput({ goal, entryUrl, targetSystem, credentialRef, adapterSelection }) {
  assertSafeAgentText(goal, targetSystem)
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 8000) throw new JourneyAuthorError('JOURNEY_GOAL_INVALID')
  if (typeof targetSystem !== 'string' || !targetSystem.trim() || targetSystem.length > 160) throw new JourneyAuthorError('JOURNEY_TARGET_SYSTEM_INVALID')
  if (!/^credential_[0-9a-f-]{36}$/.test(String(credentialRef || ''))) throw new JourneyAuthorError('JOURNEY_CREDENTIAL_REF_INVALID')
  let url
  try { url = new URL(entryUrl) } catch { throw new JourneyAuthorError('JOURNEY_ENTRY_URL_INVALID') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) {
    throw new JourneyAuthorError('JOURNEY_ENTRY_URL_INVALID')
  }
  assertSafeAgentText(entryUrl)
  if (adapterSelection !== undefined && !['fuxing-bank-demo','fuxing-bank-operations'].includes(adapterSelection)) {
    throw new JourneyAuthorError('JOURNEY_TARGET_ADAPTER_INVALID')
  }
  return { goal: goal.trim(), entryUrl: url.href, targetSystem: targetSystem.trim(), credentialRef, adapterSelection }
}

function parseModelCandidate(value) {
  let parsed
  try { parsed = JSON.parse(value) } catch { throw new JourneyAuthorError('JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_JSON_SYNTAX') }
  const result = modelCandidateSchema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0];
    const fields = ['title','objective','summary','preconditions','steps','assertions','confidence','businessInputs'];
    const field = fields.includes(issue.path[0]) ? String(issue.path[0]).toUpperCase() : 'ROOT';
    // Schema-owned codes only: never include model content, unknown key names,
    // parser messages or user-supplied values in a persistent failure reason.
    throw new JourneyAuthorError(`JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_${field}_${issue.code.toUpperCase()}`);
  }
  return result.data
}

export function createJourneyCandidateAuthor({ invokeJson } = {}) {
  if (typeof invokeJson !== 'function') throw new JourneyAuthorError('JOURNEY_AUTHOR_MODEL_REQUIRED')
  return Object.freeze({
    async author(input, { signal } = {}) {
      const fixed = requireAuthorInput(input)
      const content = await invokeJson({
        systemPrompt: [
          'Return one JSON object for a browser test candidate.',
          'Allowed keys only: title, objective, summary, preconditions, steps, assertions, confidence, businessInputs.',
          'Required types: title, objective, and summary are strings; preconditions and assertions are arrays of strings; steps is an array of 1 to 6 objects; confidence is a JSON number from 0 to 1.',
          'Use at most 50 preconditions and 8 assertions. Each step has exactly two string fields: action and expected.',
          'Write every natural-language field in the same language as the supplied goal; do not translate it.',
          'When authentication is required, describe it as exactly one authentication step using the already enrolled safe credential; do not split opening the login page and submitting credentials into separate steps.',
          'After authentication, explicitly navigate to the requested target page or list in a separate step before asserting its contents. Never assume authentication lands on that target page; a read-only content assertion does not perform navigation.',
          'businessInputs is optional and may contain only string dateRange, string filter, and transfer. transfer must contain string payerAccountId, payeeRef, amount, currency, and purpose together. payerAccountId is a positive account ID explicitly labelled 付款账户, payerAccountId or payer account in the goal; payeeRef is the literal beneficiary UUID in the goal. Do not infer either from an unrelated number or select a default account.',
          'Never emit credentials, approvals, status, control-plane identifiers, hashes, tools, or execution results. Business account IDs and beneficiary UUIDs may only be copied from explicit user input.',
          'Return strict JSON only: escape double quotes, backslashes and control characters inside strings; do not use comments, trailing commas or Markdown fences. The following example illustrates the format only, not task content to copy. EXAMPLE_JSON: ' + JSON.stringify({
            title: '只读页面检查', objective: '核对用户指定页面的信息', summary: '先导航再核验', preconditions: [],
            steps: [{ action: '打开用户指定的目标页面', expected: '目标页面已显示' }, { action: '核对用户要求的信息', expected: '所需信息完整显示' }],
            assertions: ['用户要求的信息完整显示'], confidence: 1,
          }),
        ].join(' '),
        input: JSON.stringify({ goal: fixed.goal.replace(/credential_[0-9a-f-]{36}/gi,'已登记安全凭据'), targetSystem: fixed.targetSystem }),
        signal,
      })
      if (typeof content !== 'string') throw new JourneyAuthorError('JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_NON_STRING')
      const modelCandidate = parseModelCandidate(content)
      const explicit = explicitTransferInput(fixed.goal)
      // The model may extract literal input, but it cannot supply business values on the user's behalf.
      if (modelCandidate.businessInputs) {
        const inputs=modelCandidate.businessInputs
        if (inputs.transfer) {
          if (!explicit.missingFields.length && !transferInputMatches(inputs.transfer, explicit.values))
            throw new JourneyAuthorError('JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT')
          if (explicit.missingFields.length) delete inputs.transfer
        }
        const values=[inputs.dateRange,inputs.filter].filter(value=>value!==undefined)
        for(const value of values) {
          const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
          if(!new RegExp(`(?<![A-Za-z0-9_.])${escaped}(?![A-Za-z0-9_.])`,'u').test(fixed.goal))
            throw new JourneyAuthorError('JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT')
        }
      }
      const sourceHash = createHash('sha256').update(fixed.goal).digest('hex')
      const businessValues = modelCandidate.businessInputs
        ? {
            ...(modelCandidate.businessInputs.dateRange ? { dateRange: modelCandidate.businessInputs.dateRange } : {}),
            ...(modelCandidate.businessInputs.filter ? { filter: modelCandidate.businessInputs.filter } : {}),
            ...(modelCandidate.businessInputs.transfer || {}),
          }
        : undefined
      const moneyIntent=fixed.goal
        .replace(/(?:不|不得|禁止|不要)(?:发起|执行|进行|提交)?转账/gu,'')
        .replace(/\b(?:do not|never|without|no)\s+(?:(?:initiate|execute|submit)\s+)?transfers?\b/giu,'')
        .replace(/转账(?:记录|历史|结果)|transfer\s+(?:history|status|records)/giu,'')
      const transferRequested=/转账|\btransfer\b/iu.test(moneyIntent)
      const missingFields=transferRequested&&!modelCandidate.businessInputs?.transfer
        ? (explicit.missingFields.length ? explicit.missingFields : ['payerAccountId','payeeRef','amount','currency','purpose'].map(field=>`businessInputs.${field}`)):[]
      if (!transferRequested && modelCandidate.businessInputs?.transfer) throw new JourneyAuthorError('JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT')
      return {
        schemaVersion: 'hengzhun-i10-case-draft-v1',
        title: modelCandidate.title,
        objective: modelCandidate.objective,
        summary: modelCandidate.summary,
        targetSystem: fixed.targetSystem,
        entryUrl: fixed.entryUrl,
        preconditions: modelCandidate.preconditions,
        steps: modelCandidate.steps,
        assertions: modelCandidate.assertions,
        caseFacts: [],
        actionStepsV2: [],
        verificationRequirements: [],
        ...(businessValues ? { businessInputs: {
          schemaVersion: 'hengzhun-i10-typed-business-inputs-v2', values: businessValues, source: 'USER_CONFIRMED',
        } } : {}),
        credentialRef: fixed.credentialRef,
        ...(fixed.adapterSelection ? { adapterSelection: fixed.adapterSelection } : {}),
        source: {
          inputType: 'NATURAL_LANGUAGE', sourceRef: `input-${sourceHash.slice(0, 24)}`, sourceHash,
          provenanceSummary: 'Plan generated from the CLI goal; business input values checked against literal user input.',
        },
        confidence: modelCandidate.confidence,
        missingFields,
        confirmationStatus: 'DRAFT',
        authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',
        executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY',
        evidenceStrategy: 'REDACTED_HASHED_EVIDENCE',
      }
    },
  })
}
