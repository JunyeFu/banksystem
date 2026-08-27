import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt } from '@langchain/langgraph'
import { z } from 'zod'
import { createControllerSecurity } from './state-security.mjs'
import { createInMemoryProposalVault } from './session-store.mjs'

const require = createRequire(import.meta.url)
const { assertResumeInput, assertStartInput } = require('./controller-port.cjs')
const { loadRiskPolicy } = require('./risk-policy.cjs')
const { loadToolPolicy } = require('./tool-policy.cjs')

const CONTROLLER_KIND = 'langgraph-json-v2'
const CONTROLLER_PROFILE = 'DETERMINISTIC_PREFETCH_JSON'
const CONTROLLER_PROMPT = readFileSync(new URL('../prompt-v2.txt', import.meta.url), 'utf8').trim()

const State = Annotation.Root({
  threadId: Annotation(),
  namespace: Annotation(),
  journeyId: Annotation(),
  releaseIdentityHash: Annotation(),
  expectedVersion: Annotation(),
  authorityHash: Annotation(),
  prefetchHash: Annotation(),
  outcomeType: Annotation(),
  outcome: Annotation(),
  frozenProposal: Annotation(),
  decision: Annotation(),
  mutationCount: Annotation({ reducer: (_left, right) => right, default: () => 0 }),
  mutationResult: Annotation(),
  failureCode: Annotation(),
})

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function authorityProjection(facts) {
  if (!facts || typeof facts !== 'object' || !Number.isInteger(facts.version) || facts.version < 0) {
    throw new Error('AGENT_CONTROLLER_AUTHORITY_INVALID')
  }
  return {
    journeyId: facts.journeyId ?? null,
    version: facts.version,
    status: facts.status ?? null,
    preparationId: facts.preparationId ?? null,
    targetProfileRef: facts.targetProfileRef ?? null,
  }
}

function normalizeModelOutput(output) {
  if (typeof output === 'string') return JSON.parse(output)
  if (output && typeof output === 'object' && typeof output.content === 'string') {
    return JSON.parse(output.content)
  }
  return output
}

export function createDeterministicJsonPlanner({ invokeJson, toolPolicy = loadToolPolicy() }) {
  if (typeof invokeJson !== 'function') throw new Error('AGENT_CONTROLLER_JSON_MODEL_INVALID')
  const mutationNames = [...toolPolicy.mutatingTools]
  const schema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('ANSWER'), answer: z.string().min(1).max(4000) }).strict(),
    z.object({
      type: z.literal('CLARIFY'),
      question: z.string().min(1).max(2000),
      missingFields: z.array(z.string().min(1).max(100)).max(20),
    }).strict(),
    z.object({
      type: z.literal('PROPOSE'),
      summary: z.string().min(1).max(1000),
      toolName: z.enum(mutationNames),
      arguments: z.record(z.string(), z.unknown()),
    }).strict(),
  ])
  return Object.freeze({
    profile: CONTROLLER_PROFILE,
    visibleTools: Object.freeze([]),
    async plan({ userInput, prefetchJson }) {
      const output = await invokeJson({
        systemPrompt: CONTROLLER_PROMPT,
        responseSchema: 'ANSWER|CLARIFY|PROPOSE',
        input: JSON.stringify({ userInput, deterministicPrefetch: JSON.parse(prefetchJson) }),
      })
      return schema.parse(normalizeModelOutput(output))
    },
  })
}

function exactDecisionFailure(state, now) {
  const decision = state.decision
  const proposal = state.frozenProposal
  const { proposalId: _proposalId, contentHash: _contentHash, ...payload } = proposal ?? {}
  if (!proposal || hash(payload) !== proposal.contentHash) return 'AGENT_CONTROLLER_FROZEN_PROPOSAL_TAMPERED'
  if (!decision || decision.approved !== true) return 'AGENT_CONTROLLER_APPROVAL_REQUIRED'
  if (decision.proposalId !== proposal.proposalId) return 'AGENT_CONTROLLER_PROPOSAL_MISMATCH'
  if (decision.contentHash !== proposal.contentHash) return 'AGENT_CONTROLLER_CONTENT_HASH_MISMATCH'
  if (decision.expectedVersion !== proposal.expectedVersion) return 'AGENT_CONTROLLER_APPROVAL_VERSION_MISMATCH'
  if (typeof decision.idempotencyKey !== 'string' || decision.idempotencyKey.length < 8) {
    return 'AGENT_CONTROLLER_IDEMPOTENCY_KEY_INVALID'
  }
  if (now() >= Date.parse(proposal.expiresAt)) return 'AGENT_CONTROLLER_APPROVAL_EXPIRED'
  return undefined
}

export function createAgentControllerV2({
  planner,
  prefetcher,
  harness,
  mutationInvoker,
  releaseIdentityHash,
  riskPolicy = loadRiskPolicy(),
  proposalVault = createInMemoryProposalVault(),
  checkpointer = new MemorySaver(),
  security,
  now = () => Date.now(),
  threadIdFactory = () => randomUUID(),
}) {
  if (
    planner?.profile !== CONTROLLER_PROFILE || typeof planner?.plan !== 'function' ||
    typeof prefetcher?.prefetch !== 'function' || typeof harness?.readJourney !== 'function' ||
    typeof mutationInvoker?.invoke !== 'function' || typeof proposalVault?.put !== 'function' ||
    typeof proposalVault?.get !== 'function' || typeof proposalVault?.delete !== 'function'
  ) throw new Error('AGENT_CONTROLLER_V2_CONFIG_INVALID')
  if (typeof releaseIdentityHash !== 'string' || releaseIdentityHash.length < 16) {
    throw new Error('AGENT_CONTROLLER_RELEASE_IDENTITY_INVALID')
  }
  const toolPolicy = loadToolPolicy()
  const effectiveSecurity = security ?? createControllerSecurity({ checkpointer, now })
  const ephemeralInputs = new Map()
  const ephemeralPrefetch = new Map()
  const ephemeralProposals = new Map()
  const startedThreads = new Set()

  const graph = new StateGraph(State)
    .addNode('hydrate_authority', async (state) => {
      try {
        const facts = authorityProjection(await harness.readJourney(state.journeyId))
        if (facts.journeyId !== null && facts.journeyId !== state.journeyId) {
          return { failureCode: 'AGENT_CONTROLLER_JOURNEY_CONFLICT' }
        }
        return { expectedVersion: facts.version, authorityHash: hash(facts), failureCode: undefined }
      } catch (error) {
        return { failureCode: error instanceof Error ? error.message : 'AGENT_CONTROLLER_AUTHORITY_INVALID' }
      }
    })
    .addNode('deterministic_prefetch', async (state) => {
      if (state.failureCode) return {}
      try {
        const context = canonicalize(await prefetcher.prefetch({
          namespace: state.namespace,
          journeyId: state.journeyId,
          expectedVersion: state.expectedVersion,
        }))
        const prefetchJson = JSON.stringify(context)
        ephemeralPrefetch.set(state.threadId, prefetchJson)
        return { prefetchHash: hash(context) }
      } catch (error) {
        return { failureCode: error instanceof Error ? error.message : 'AGENT_CONTROLLER_PREFETCH_FAILED' }
      }
    })
    .addNode('structured_plan', async (state) => {
      if (state.failureCode) return {}
      try {
        const prefetchJson = ephemeralPrefetch.get(state.threadId)
        if (!prefetchJson || hash(JSON.parse(prefetchJson)) !== state.prefetchHash) {
          return { failureCode: 'AGENT_CONTROLLER_PREFETCH_STATE_INVALID' }
        }
        const plan = await planner.plan({ userInput: ephemeralInputs.get(state.threadId), prefetchJson })
        if (plan.type === 'PROPOSE') {
          ephemeralProposals.set(state.threadId, structuredClone(plan.arguments))
          return { outcomeType: plan.type, outcome: {
            type: plan.type,
            summary: plan.summary,
            toolName: plan.toolName,
            argumentsHash: hash(plan.arguments),
          } }
        }
        return { outcomeType: plan.type, outcome: structuredClone(plan) }
      } catch {
        return { failureCode: 'AGENT_CONTROLLER_PLAN_INVALID' }
      } finally {
        ephemeralInputs.delete(state.threadId)
        ephemeralPrefetch.delete(state.threadId)
      }
    })
    .addNode('validate_transition', async (state) => {
      if (state.failureCode) return {}
      if (!['ANSWER', 'CLARIFY', 'PROPOSE'].includes(state.outcomeType)) {
        return { failureCode: 'AGENT_CONTROLLER_TRANSITION_INVALID' }
      }
      if (state.outcomeType !== 'PROPOSE') return {}
      try {
        if (toolPolicy.classify(state.outcome.toolName) !== 'MUTATING') {
          return { failureCode: 'AGENT_CONTROLLER_PROPOSAL_TOOL_INVALID' }
        }
        return { outcome: { ...state.outcome, risk: riskPolicy.riskFor(state.outcome.toolName) } }
      } catch {
        return { failureCode: 'AGENT_CONTROLLER_PROPOSAL_TOOL_INVALID' }
      }
    })
    .addNode('freeze_proposal', async (state) => {
      if (state.failureCode) return {}
      const args = ephemeralProposals.get(state.threadId)
      ephemeralProposals.delete(state.threadId)
      if (!args || hash(args) !== state.outcome.argumentsHash) {
        return { failureCode: 'AGENT_CONTROLLER_PLAN_STATE_INVALID' }
      }
      const payload = canonicalize({
        namespace: state.namespace,
        threadId: state.threadId,
        journeyId: state.journeyId,
        releaseIdentityHash: state.releaseIdentityHash,
        expectedVersion: state.expectedVersion,
        authorityHash: state.authorityHash,
        prefetchHash: state.prefetchHash,
        summary: state.outcome.summary,
        risk: state.outcome.risk,
        toolName: state.outcome.toolName,
        argumentsHash: state.outcome.argumentsHash,
        expiresAt: new Date(now() + riskPolicy.proposalTtlMs).toISOString(),
      })
      const contentHash = hash(payload)
      const proposalId = `proposal-${contentHash.slice(0, 24)}`
      await proposalVault.put(proposalId, args)
      return { frozenProposal: Object.freeze({ proposalId, contentHash, ...payload }) }
    })
    .addNode('interrupt_for_exact_approval', async (state) => {
      if (state.failureCode) return {}
      return { decision: interrupt({ ...state.frozenProposal }) }
    })
    .addNode('rehydrate_and_compare', async (state) => {
      if (state.failureCode) return {}
      try {
        const facts = authorityProjection(await harness.readJourney(state.journeyId))
        const context = canonicalize(await prefetcher.prefetch({
          namespace: state.namespace,
          journeyId: state.journeyId,
          expectedVersion: facts.version,
        }))
        if (
          facts.version !== state.expectedVersion || hash(facts) !== state.authorityHash ||
          hash(context) !== state.prefetchHash
        ) return { failureCode: 'AGENT_CONTROLLER_AUTHORITY_CONFLICT' }
        return {}
      } catch {
        return { failureCode: 'AGENT_CONTROLLER_AUTHORITY_CONFLICT' }
      }
    })
    .addNode('execute_one_mutation', async (state) => {
      if (state.failureCode) return {}
      const failureCode = exactDecisionFailure(state, now)
      if (failureCode) return { failureCode }
      if (state.mutationCount !== 0) return { failureCode: 'AGENT_CONTROLLER_MUTATION_LIMIT' }
      try {
        const args = await proposalVault.get(state.frozenProposal.proposalId)
        if (!args || hash(args) !== state.frozenProposal.argumentsHash) {
          return { failureCode: 'AGENT_CONTROLLER_PROPOSAL_ARGUMENTS_UNAVAILABLE' }
        }
        const mutationResult = await mutationInvoker.invoke({
          toolName: state.frozenProposal.toolName,
          arguments: structuredClone(args),
          proposalId: state.frozenProposal.proposalId,
          contentHash: state.frozenProposal.contentHash,
          argumentsHash: state.frozenProposal.argumentsHash,
          expectedVersion: state.frozenProposal.expectedVersion,
          risk: state.frozenProposal.risk,
          idempotencyKey: state.decision.idempotencyKey,
        })
        return { mutationResult, mutationCount: 1 }
      } catch (error) {
        return { failureCode: error instanceof Error ? error.message : 'AGENT_CONTROLLER_MUTATION_FAILED' }
      } finally {
        await proposalVault.delete(state.frozenProposal.proposalId)
      }
    })
    .addNode('reconcile_authority', async (state) => {
      if (state.failureCode) return {}
      try {
        const facts = authorityProjection(await harness.readJourney(state.journeyId))
        if (
          facts.version !== state.mutationResult?.harnessVersion ||
          facts.status !== state.mutationResult?.status
        ) return { failureCode: 'AGENT_CONTROLLER_RECONCILIATION_FAILED' }
        return { expectedVersion: facts.version, authorityHash: hash(facts) }
      } catch {
        return { failureCode: 'AGENT_CONTROLLER_RECONCILIATION_FAILED' }
      }
    })
    .addNode('render_result', async () => ({}))
    .addEdge(START, 'hydrate_authority')
    .addEdge('hydrate_authority', 'deterministic_prefetch')
    .addEdge('deterministic_prefetch', 'structured_plan')
    .addEdge('structured_plan', 'validate_transition')
    .addConditionalEdges('validate_transition', (state) => (
      state.failureCode || state.outcomeType !== 'PROPOSE' ? 'render_result' : 'freeze_proposal'
    ))
    .addEdge('freeze_proposal', 'interrupt_for_exact_approval')
    .addEdge('interrupt_for_exact_approval', 'rehydrate_and_compare')
    .addEdge('rehydrate_and_compare', 'execute_one_mutation')
    .addEdge('execute_one_mutation', 'reconcile_authority')
    .addEdge('reconcile_authority', 'render_result')
    .addEdge('render_result', END)
    .compile({ checkpointer })

  async function resultFromState(state, threadId, journeyId) {
    effectiveSecurity.assertCheckpointSafe(state)
    const approval = state.__interrupt__?.[0]?.value
    if (approval) return {
      controllerKind: CONTROLLER_KIND,
      profile: CONTROLLER_PROFILE,
      threadId,
      journeyId,
      status: 'AWAITING_USER',
      message: 'Confirm the exact frozen proposal.',
      outcome: { type: 'PROPOSE', summary: approval.summary, risk: approval.risk, toolName: approval.toolName },
      proposalRef: approval.proposalId,
      approval,
      harnessVersion: approval.expectedVersion,
    }
    if (state.failureCode) {
      if (state.frozenProposal?.proposalId) await proposalVault.delete(state.frozenProposal.proposalId)
      effectiveSecurity.complete(threadId)
      return {
        controllerKind: CONTROLLER_KIND, profile: CONTROLLER_PROFILE, threadId, journeyId,
        status: 'FAILED_CLOSED', message: state.failureCode,
        harnessVersion: Number.isInteger(state.expectedVersion) ? state.expectedVersion : 0,
      }
    }
    effectiveSecurity.complete(threadId)
    if (state.outcomeType === 'ANSWER') return {
      controllerKind: CONTROLLER_KIND, profile: CONTROLLER_PROFILE, threadId, journeyId,
      status: 'COMPLETED', message: state.outcome.answer, outcome: state.outcome,
      harnessVersion: state.expectedVersion,
    }
    if (state.outcomeType === 'CLARIFY') return {
      controllerKind: CONTROLLER_KIND, profile: CONTROLLER_PROFILE, threadId, journeyId,
      status: 'AWAITING_USER', message: state.outcome.question, outcome: state.outcome,
      harnessVersion: state.expectedVersion,
    }
    return {
      controllerKind: CONTROLLER_KIND, profile: CONTROLLER_PROFILE, threadId, journeyId,
      status: 'COMPLETED', message: 'Mutation reconciled with Harness authority.',
      outcome: { type: 'PROPOSE', risk: state.frozenProposal.risk, toolName: state.frozenProposal.toolName },
      harnessVersion: state.mutationResult.harnessVersion,
    }
  }

  return Object.freeze({
    controllerKind: CONTROLLER_KIND,
    profile: CONTROLLER_PROFILE,
    async start(input) {
      assertStartInput(input)
      if (typeof input.journeyId !== 'string' || input.journeyId.length === 0) {
        throw new Error('AGENT_CONTROLLER_JOURNEY_REQUIRED')
      }
      const threadId = input.threadId ?? threadIdFactory()
      if (startedThreads.has(threadId)) throw new Error('AGENT_CONTROLLER_THREAD_ALREADY_STARTED')
      effectiveSecurity.bindThread({
        namespace: input.namespace, threadId, journeyId: input.journeyId, releaseIdentityHash,
      })
      startedThreads.add(threadId)
      ephemeralInputs.set(threadId, input.userInput)
      const initialState = {
        threadId, namespace: input.namespace, journeyId: input.journeyId, releaseIdentityHash,
      }
      effectiveSecurity.assertCheckpointSafe(initialState)
      const state = await graph.invoke(initialState, {
        configurable: { thread_id: threadId, checkpoint_ns: input.namespace },
      })
      const result = await resultFromState(state, threadId, input.journeyId)
      effectiveSecurity.recordTrace({
        event: 'START', requestId: input.requestId, namespace: input.namespace, threadId,
        journeyId: input.journeyId, proposalId: result.proposalRef, status: result.status,
        failureCode: result.status === 'FAILED_CLOSED' ? result.message : undefined,
        harnessVersion: result.harnessVersion, releaseIdentityHash,
      })
      return result
    },
    async resume(input) {
      assertResumeInput(input)
      try {
        effectiveSecurity.assertActive(input)
        effectiveSecurity.assertCheckpointSafe(input.decision)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AGENT_CONTROLLER_SECURITY_REJECTED'
        const result = {
          controllerKind: CONTROLLER_KIND, profile: CONTROLLER_PROFILE,
          threadId: input.threadId, journeyId: input.journeyId,
          status: 'FAILED_CLOSED', message, harnessVersion: 0,
        }
        effectiveSecurity.recordTrace({
          event: 'RESUME', requestId: input.requestId, namespace: input.namespace,
          threadId: input.threadId, journeyId: input.journeyId, status: result.status,
          failureCode: message, harnessVersion: 0, releaseIdentityHash,
        })
        return result
      }
      const state = await graph.invoke(new Command({ resume: input.decision }), {
        configurable: { thread_id: input.threadId, checkpoint_ns: input.namespace },
      })
      const result = await resultFromState(state, input.threadId, input.journeyId)
      effectiveSecurity.recordTrace({
        event: 'RESUME', requestId: input.requestId, namespace: input.namespace,
        threadId: input.threadId, journeyId: input.journeyId,
        proposalId: state.frozenProposal?.proposalId, toolName: state.frozenProposal?.toolName,
        status: result.status, failureCode: result.status === 'FAILED_CLOSED' ? result.message : undefined,
        harnessVersion: result.harnessVersion, releaseIdentityHash,
      })
      return result
    },
    cleanupExpired: () => effectiveSecurity.cleanupExpired(),
    safeTraces: () => effectiveSecurity.traces(),
  })
}

export { CONTROLLER_KIND, CONTROLLER_PROFILE }
