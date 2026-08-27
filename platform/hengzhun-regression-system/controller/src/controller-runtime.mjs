import { createAgentControllerV2, createDeterministicJsonPlanner } from './agent-controller-v2.mjs'
import { createMcpControllerAdapters, createOpenAIJsonInvoker } from './runtime-adapters.mjs'
import { createControllerSecurity } from './state-security.mjs'
import { EncryptedSessionCheckpointer } from './session-checkpointer.mjs'
import { createSessionProposalVault, SessionStoreError } from './session-store.mjs'

export function createControllerRuntimeV2({
  modelConfig,
  mcpClient,
  releaseIdentityHash,
  timeoutMs = 5_000,
  modelFactory,
  checkpointer,
  security,
  now,
  threadIdFactory,
  proposalVault,
} = {}) {
  const invokeJson = createOpenAIJsonInvoker({ ...modelConfig, modelFactory })
  const planner = createDeterministicJsonPlanner({ invokeJson })
  const adapters = createMcpControllerAdapters({ client: mcpClient, timeoutMs })
  return createAgentControllerV2({
    planner,
    prefetcher: adapters,
    harness: adapters,
    mutationInvoker: adapters,
    releaseIdentityHash,
    ...(proposalVault ? { proposalVault } : {}),
    ...(checkpointer ? { checkpointer } : {}),
    ...(security ? { security } : {}),
    ...(now ? { now } : {}),
    ...(threadIdFactory ? { threadIdFactory } : {}),
  })
}

export async function createPersistentControllerRuntimeV2({
  sessionStore,
  sessionId,
  modelConfig,
  mcpClient,
  releaseIdentityHash,
  timeoutMs = 5_000,
  modelFactory,
  now = () => Date.now(),
} = {}) {
  const payload = await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
  if (payload.status !== 'ACTIVE') throw new SessionStoreError('SESSION_NOT_ACTIVE')
  const checkpointer = await EncryptedSessionCheckpointer.create({
    store: sessionStore, sessionId, releaseIdentityHash,
  })
  const security = createControllerSecurity({ checkpointer, now })
  security.bindThread({
    namespace: payload.namespace,
    threadId: payload.threadId,
    journeyId: payload.journeyId,
    releaseIdentityHash,
  })
  const proposalVault = createSessionProposalVault({ store: sessionStore, sessionId, releaseIdentityHash })
  return createControllerRuntimeV2({
    modelConfig,
    mcpClient,
    releaseIdentityHash,
    timeoutMs,
    modelFactory,
    checkpointer,
    security,
    now,
    threadIdFactory: () => payload.threadId,
    proposalVault,
  })
}
