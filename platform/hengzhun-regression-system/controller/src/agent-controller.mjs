import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { Command, END, MemorySaver, START, StateGraph, Annotation, interrupt } from '@langchain/langgraph'
import { createAgent, tool } from 'langchain'
import { z } from 'zod'
import { createControllerSecurity } from './state-security.mjs'

const require = createRequire(import.meta.url)
const { assertResumeInput, assertStartInput } = require('./controller-port.cjs')
const { loadToolPolicy } = require('./tool-policy.cjs')
const CONTROLLER_SYSTEM_PROMPT = readFileSync(new URL('../prompt-v1.txt', import.meta.url), 'utf8').trim()

const State = Annotation.Root({
  threadId: Annotation(),
  namespace: Annotation(),
  journeyId: Annotation(),
  releaseIdentityHash: Annotation(),
  expectedVersion: Annotation(),
  lastHarnessReadHash: Annotation(),
  plan: Annotation(),
  frozenProposal: Annotation(),
  decision: Annotation(),
  mutationCount: Annotation({ reducer: (_left, right) => right, default: () => 0 }),
  mutationResult: Annotation(),
  failureCode: Annotation(),
})

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function harnessProjection(facts) {
  return {
    journeyId: facts.journeyId,
    version: facts.version,
    status: facts.status,
    preparationId: facts.preparationId ?? null,
  }
}

function harnessHash(facts) {
  return hash(harnessProjection(facts))
}

function proposalPayload(state, expiresAt) {
  return {
    journeyId: state.journeyId,
    expectedVersion: state.expectedVersion,
    releaseIdentityHash: state.releaseIdentityHash,
    summary: state.plan.summary,
    risk: state.plan.risk,
    toolName: state.plan.toolName,
    argumentsHash: state.plan.argumentsHash,
    expiresAt,
  }
}

function exactDecisionFailure(state, now) {
  const decision = state.decision
  const proposal = state.frozenProposal
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

export function createBoundedPlanner({
  model,
  modelProfileKey,
  invokeReadTool,
  toolPolicy = loadToolPolicy(),
}) {
  if (!model || typeof modelProfileKey !== 'string' || typeof invokeReadTool !== 'function') {
    throw new Error('AGENT_CONTROLLER_PLANNER_CONFIG_INVALID')
  }
  const readNames = [...toolPolicy.plannerTools]
  const mutationNames = [...toolPolicy.mutatingTools]
  const planSchema = z.object({
    summary: z.string().min(1).max(1000),
    risk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    toolName: z.enum(mutationNames),
    arguments: z.record(z.string(), z.unknown()),
  })
  const governedRead = tool(async ({ toolName, arguments: args }) => {
    if (toolPolicy.classify(toolName) !== 'READ_ONLY') throw new Error('AGENT_CONTROLLER_TOOL_DENIED')
    return invokeReadTool(toolName, args)
  }, {
    name: 'governed_read',
    description: 'Read one governed Harness projection. No mutation is available.',
    schema: z.object({
      toolName: z.enum(readNames),
      arguments: z.record(z.string(), z.unknown()).default({}),
    }),
  })
  const agent = createAgent({
    model,
    tools: [governedRead],
    responseFormat: planSchema,
    systemPrompt: CONTROLLER_SYSTEM_PROMPT,
  })

  return Object.freeze({
    visibleReadTools: Object.freeze(readNames),
    async plan({ facts, userInput }) {
      const output = await agent.invoke({
        messages: [{
          role: 'user',
          content: JSON.stringify({
            userInput,
            authoritativeFacts: harnessProjection(facts),
            instruction: 'Produce one candidate proposal only; do not execute it.',
          }),
        }],
      })
      const candidate = output.structuredResponse ?? JSON.parse(String(output.messages?.at(-1)?.content ?? '{}'))
      return planSchema.parse(candidate)
    },
  })
}

export function createAgentController({
  planner,
  harness,
  mutationInvoker,
  releaseIdentityHash,
  checkpointer = new MemorySaver(),
  security,
  now = () => Date.now(),
  threadIdFactory = () => randomUUID(),
}) {
  if (!planner?.plan || !harness?.readJourney || !mutationInvoker?.invoke) {
    throw new Error('AGENT_CONTROLLER_CONFIG_INVALID')
  }
  if (typeof releaseIdentityHash !== 'string' || releaseIdentityHash.length < 16) {
    throw new Error('AGENT_CONTROLLER_RELEASE_IDENTITY_INVALID')
  }
  const toolPolicy = loadToolPolicy()
  const effectiveSecurity = security ?? createControllerSecurity({ checkpointer, now })
  const ephemeralInputs = new Map()
  const ephemeralPlans = new Map()
  const proposalArguments = new Map()
  const graph = new StateGraph(State)
    .addNode('hydrate_from_harness', async (state) => {
      const facts = await harness.readJourney(state.journeyId)
      return {
        expectedVersion: facts.version,
        lastHarnessReadHash: harnessHash(facts),
        failureCode: undefined,
      }
    })
    .addNode('classify_and_plan_read_only', async (state) => {
      const facts = await harness.readJourney(state.journeyId)
      try {
        const candidate = await planner.plan({ facts, userInput: ephemeralInputs.get(state.threadId) })
        ephemeralPlans.set(state.threadId, candidate)
        return { plan: {
          summary: candidate.summary,
          risk: candidate.risk,
          toolName: candidate.toolName,
          argumentsHash: hash(candidate.arguments),
        } }
      } catch {
        return { failureCode: 'AGENT_CONTROLLER_PLAN_INVALID' }
      } finally {
        ephemeralInputs.delete(state.threadId)
      }
    })
    .addNode('validate_structured_proposal', async (state) => {
      if (state.failureCode) return {}
      try {
        if (toolPolicy.classify(state.plan.toolName) !== 'MUTATING') {
          return { failureCode: 'AGENT_CONTROLLER_PROPOSAL_TOOL_INVALID' }
        }
        return {}
      } catch {
        return { failureCode: 'AGENT_CONTROLLER_PROPOSAL_TOOL_INVALID' }
      }
    })
    .addNode('freeze_proposal', async (state) => {
      if (state.failureCode) return {}
      const candidate = ephemeralPlans.get(state.threadId)
      ephemeralPlans.delete(state.threadId)
      if (!candidate || hash(candidate.arguments) !== state.plan.argumentsHash) {
        return { failureCode: 'AGENT_CONTROLLER_PLAN_STATE_INVALID' }
      }
      const expiresAt = new Date(now() + 5 * 60 * 1000).toISOString()
      const payload = proposalPayload(state, expiresAt)
      const contentHash = hash(payload)
      const proposalId = `proposal-${contentHash.slice(0, 16)}`
      proposalArguments.set(proposalId, structuredClone(candidate.arguments))
      return {
        frozenProposal: Object.freeze({
          proposalId,
          contentHash,
          ...payload,
        }),
      }
    })
    .addNode('interrupt_for_exact_decision', async (state) => {
      if (state.failureCode) return {}
      return { decision: interrupt({
        proposalId: state.frozenProposal.proposalId,
        contentHash: state.frozenProposal.contentHash,
        expectedVersion: state.frozenProposal.expectedVersion,
        summary: state.frozenProposal.summary,
        risk: state.frozenProposal.risk,
        toolName: state.frozenProposal.toolName,
        expiresAt: state.frozenProposal.expiresAt,
      }) }
    })
    .addNode('rehydrate_after_resume', async (state) => {
      if (state.failureCode) return {}
      const facts = await harness.readJourney(state.journeyId)
      if (facts.version !== state.expectedVersion || harnessHash(facts) !== state.lastHarnessReadHash) {
        return { failureCode: 'AGENT_CONTROLLER_AUTHORITY_CONFLICT' }
      }
      return {}
    })
    .addNode('execute_one_mutation', async (state) => {
      if (state.failureCode) return {}
      const failureCode = exactDecisionFailure(state, now)
      if (failureCode) return { failureCode }
      if (state.mutationCount !== 0) return { failureCode: 'AGENT_CONTROLLER_MUTATION_LIMIT' }
      try {
        const args = proposalArguments.get(state.frozenProposal.proposalId)
        if (!args || hash(args) !== state.frozenProposal.argumentsHash) {
          return { failureCode: 'AGENT_CONTROLLER_PROPOSAL_ARGUMENTS_UNAVAILABLE' }
        }
        const mutationResult = await mutationInvoker.invoke({
          toolName: state.frozenProposal.toolName,
          arguments: args,
          proposalId: state.frozenProposal.proposalId,
          contentHash: state.frozenProposal.contentHash,
          expectedVersion: state.frozenProposal.expectedVersion,
          idempotencyKey: state.decision.idempotencyKey,
        })
        return { mutationResult, mutationCount: 1 }
      } catch (error) {
        return { failureCode: error instanceof Error ? error.message : 'AGENT_CONTROLLER_MUTATION_FAILED' }
      } finally {
        proposalArguments.delete(state.frozenProposal.proposalId)
      }
    })
    .addNode('reconcile_from_harness', async (state) => {
      if (state.failureCode) return {}
      const facts = await harness.readJourney(state.journeyId)
      if (
        facts.version !== state.mutationResult.harnessVersion ||
        facts.status !== state.mutationResult.status
      ) {
        return { failureCode: 'AGENT_CONTROLLER_RECONCILIATION_FAILED' }
      }
      return { expectedVersion: facts.version, lastHarnessReadHash: harnessHash(facts) }
    })
    .addEdge(START, 'hydrate_from_harness')
    .addEdge('hydrate_from_harness', 'classify_and_plan_read_only')
    .addEdge('classify_and_plan_read_only', 'validate_structured_proposal')
    .addEdge('validate_structured_proposal', 'freeze_proposal')
    .addEdge('freeze_proposal', 'interrupt_for_exact_decision')
    .addEdge('interrupt_for_exact_decision', 'rehydrate_after_resume')
    .addEdge('rehydrate_after_resume', 'execute_one_mutation')
    .addEdge('execute_one_mutation', 'reconcile_from_harness')
    .addEdge('reconcile_from_harness', END)
    .compile({ checkpointer })

  function resultFromState(state, threadId, journeyId) {
    effectiveSecurity.assertCheckpointSafe(state)
    const approval = state.__interrupt__?.[0]?.value
    if (approval) {
      return {
        controllerKind: 'langgraph-deepagents-v1', threadId, journeyId,
        status: 'AWAITING_USER', message: 'Confirm the exact frozen proposal.',
        proposalRef: approval.proposalId, approval, harnessVersion: approval.expectedVersion,
      }
    }
    if (state.failureCode) {
      if (state.frozenProposal?.proposalId) proposalArguments.delete(state.frozenProposal.proposalId)
      effectiveSecurity.complete(threadId)
      return {
        controllerKind: 'langgraph-deepagents-v1', threadId, journeyId,
        status: 'FAILED_CLOSED', message: state.failureCode,
        harnessVersion: Number.isInteger(state.expectedVersion) ? state.expectedVersion : 0,
      }
    }
    effectiveSecurity.complete(threadId)
    return {
      controllerKind: 'langgraph-deepagents-v1', threadId, journeyId,
      status: 'COMPLETED', message: 'Mutation reconciled with Harness authority.',
      harnessVersion: state.mutationResult.harnessVersion,
    }
  }

  return Object.freeze({
    controllerKind: 'langgraph-deepagents-v1',
    async start(input) {
      assertStartInput(input)
      if (typeof input.journeyId !== 'string' || input.journeyId.length === 0) {
        throw new Error('AGENT_CONTROLLER_JOURNEY_REQUIRED')
      }
      const threadId = input.threadId ?? threadIdFactory()
      effectiveSecurity.bindThread({
        namespace: input.namespace, threadId, journeyId: input.journeyId, releaseIdentityHash,
      })
      const initialState = {
        threadId, namespace: input.namespace, journeyId: input.journeyId,
        releaseIdentityHash,
      }
      effectiveSecurity.assertCheckpointSafe(initialState)
      ephemeralInputs.set(threadId, input.userInput)
      const state = await graph.invoke(initialState, {
        configurable: { thread_id: threadId, checkpoint_ns: input.namespace },
      })
      const result = resultFromState(state, threadId, input.journeyId)
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
          controllerKind: 'langgraph-deepagents-v1', threadId: input.threadId,
          journeyId: input.journeyId, status: 'FAILED_CLOSED', message, harnessVersion: 0,
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
      const result = resultFromState(state, input.threadId, input.journeyId)
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
