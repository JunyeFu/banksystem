import { createHash, randomUUID } from 'node:crypto'
import { bootstrapInputFacts } from './production-service.mjs'
import { WorkbenchError } from './workbench-http.mjs'

const terminal = new Set(['NEEDS_INPUT', 'COMPLETED', 'FAILED', 'INTERRUPTED'])
const sha256 = value => createHash('sha256').update(value).digest('hex')
const fail = (code, status = 409) => { throw new WorkbenchError(code, status) }
const safeCode = error => /^[A-Z][A-Z0-9_]{2,100}$/.test(error?.code) ? error.code : 'AGENT_EXECUTION_FAILED'
const dependencyCode = code => /^(?:AGENT|MODEL|HARNESS|MCP|WORKER|BROWSER|BANK|I10_VISION|I10_MIDSCENE)_[A-Z0-9_]{1,90}$/.test(code) ? code : 'AGENT_DEPENDENCY_NOT_READY'
const verified = (proof, turn) => proof?.verdict === 'VERIFIED' && proof.journeyId === turn.journeyId &&
  proof.releaseIdentityHash === turn.modelBinding.releaseIdentityHash && proof.runId && proof.taskId &&
  (!turn.runId || turn.runId === proof.runId) && (!turn.taskId || turn.taskId === proof.taskId)

// The maps hold only owned in-flight JS work, never durable conversation/execution state.
export function createWorkbenchApplication({ metadata, keyStore, namespace, identityFor, readiness, serviceFor,
  probeModel, importAttachment, downloadArtifact }) {
  const active = new Map(), updates = new Map()
  let runtimeFault
  const call = (name, input = {}) => metadata.call(name, input)
  const profileFor = (id, version) => call('model_get', { modelId: id, ...(version ? { version } : {}) })
  const loadTurn = turnId => call('turn_get', { turnId })
  const context = (conversationId, identifier) => call('submission_get', { conversationId, ...identifier })

  // Serialize this process's event/cancel writes. Harness still arbitrates optimistic versions.
  function update(turnId, change) {
    const previous = updates.get(turnId) ?? Promise.resolve()
    const next = previous.then(async () => {
      const current = await loadTurn(turnId)
      if (terminal.has(current.status)) return current
      const value = typeof change === 'function' ? change(current) : change
      if (!value) return current
      return call('turn_update', { turnId, expectedVersion: current.version, ...value,
        humanInterventionRequired: !['RUNNING', 'COMPLETED'].includes(value.status) })
    })
    updates.set(turnId, next)
    next.finally(() => { if (updates.get(turnId) === next) updates.delete(turnId) }).catch(() => undefined)
    return next
  }
  async function configuration(turn) {
    const profile = await profileFor(turn.modelBinding.profileId, turn.modelBinding.profileVersion)
    const apiKey = await keyStore.get(namespace, profile.keyRef)
    return { profile, modelConfig: { model: profile.model, baseURL: profile.baseUrl, apiKey }, releaseIdentityHash: turn.modelBinding.releaseIdentityHash }
  }
  async function project(turn) {
    let result = { kind: turn.journeyId ? 'TEST' : 'REPLY', verdict: turn.journeyId ? 'UNKNOWN' : 'NOT_RUN' }
    if (turn.status === 'NEEDS_INPUT') result = { kind: 'REPLY', verdict: 'NOT_RUN' }
    if (turn.status === 'COMPLETED' && turn.journeyId) {
      try {
        const service = await serviceFor(await configuration(turn))
        const proof = await service.evidenceVerify({ journeyId: turn.journeyId })
        if (verified(proof, turn)) result = { kind: 'TEST', verdict: 'PASSED' }
      } catch { /* A missing/invalid proof is UNKNOWN, never a successful test. */ }
    }
    return { ...turn, result }
  }
  async function orphan(turn) {
    if (!['RUNNING', 'STOP_REQUESTED'].includes(turn.status) || active.has(turn.id)) return turn
    // Read existing authority only; never dispatch or resume a task from a page read.
    if (turn.journeyId) {
      try {
        const proof = await (await serviceFor(await configuration(turn))).evidenceVerify({ journeyId: turn.journeyId })
        if (verified(proof, turn)) {
          return update(turn.id, { status: 'COMPLETED', runId: proof.runId, taskId: proof.taskId,
            answer: '已从原任务证据核验完成；没有重新执行测试。', event: { type: 'COMPLETED', summary: '回读原执行证据完成。' } })
        }
      } catch { /* Authority did not prove completion; preserve unknown outcome below. */ }
    }
    return update(turn.id, { status: 'INTERRUPTED', failureCode: 'AGENT_PROCESS_INTERRUPTED', event: {
      type: 'INTERRUPTED', summary: 'Controller 已中断，结果未获完整核验；请人工介入，不自动重派任务。' } })
  }
  async function taskInput(turn, request) {
    const fragments = [request.input]
    let attachmentRefs = request.attachmentRefs, attachmentMetadata = request.attachmentMetadata
    let parent = turn.continuationOfTurnId, checkpointSessionId
    while (parent) {
      const prior = await context(turn.conversationId, { turnId: parent })
      if (!prior.turn || !prior.request || prior.turn.status !== 'NEEDS_INPUT') fail('AGENT_CONTINUATION_INVALID')
      fragments.unshift(prior.request.input)
      if (prior.request.attachmentRefs.length) { attachmentRefs = prior.request.attachmentRefs; attachmentMetadata = prior.request.attachmentMetadata }
      checkpointSessionId ??= prior.turn.checkpointSessionId
      parent = prior.turn.continuationOfTurnId
    }
    const input = fragments.join('\n补充：')
    if (input.length > 8000) fail('AGENT_TASK_INPUT_TOO_LARGE', 400)
    return { input, checkpointSessionId, attachmentRefs, attachmentMetadata }
  }
  async function execute(turn, request, control) {
    let externalCallPending = false
    try {
      const task = await taskInput(turn, request)
      const facts = bootstrapInputFacts(task.input)
      const missing = ['entryUrl', 'targetSystem', 'credentialRef'].filter(name => !facts[name])
      if (missing.length) {
        await update(turn.id, { status: 'NEEDS_INPUT', answer: `请补充${missing.map(name => ({ entryUrl: '目标页面地址', targetSystem: '目标系统名称（目标系统：…）', credentialRef: '已登记的 credentialRef（不要输入账号密码）' })[name]).join('、')}。`,
          event: { type: 'NEEDS_INPUT', summary: '启动信息尚不完整，没有执行银行操作。' } })
        return
      }
      const config = await configuration(turn)
      if (identityFor(config.profile) !== turn.modelBinding.releaseIdentityHash) fail('AGENT_STALE_SOURCE')
      if (control.signal.aborted) fail('AGENT_READINESS_CANCELLED')
      const ready = await readiness({ ...config, signal: control.signal })
      if (control.signal.aborted) fail('AGENT_READINESS_CANCELLED')
      if (ready.status !== 'READY') fail(dependencyCode(ready.code), 503)
      await update(turn.id, { status: 'RUNNING', ...(task.checkpointSessionId ? { checkpointSessionId: task.checkpointSessionId } : {}), event: { type: 'PLANNING', summary: 'Controller 正在理解本任务目标；不发送其他会话历史。' } })
      const observe = async ({ phase, name, result }) => {
        externalCallPending = phase === 'STARTED'
        if (phase === 'REJECTED') return
        await update(turn.id, current => {
          if (current.status === 'STOP_REQUESTED') return null
          const references = {}
          if (phase === 'FINISHED') {
            if (result?.journeyId) references.journeyId = result.journeyId
            if (result?.runId && result?.taskId) Object.assign(references, { runId: result.runId, taskId: result.taskId })
          }
          return { status: 'RUNNING', ...references, event: { type: phase === 'STARTED' ? 'TOOL_STARTED' : 'TOOL_FINISHED',
            toolName: name, summary: phase === 'STARTED' ? `正在调用 ${name}。` : `${name} 已返回回执。` } }
        })
      }
      const service = await serviceFor({ ...config, observe,
        onCheckpoint: ({ sessionId }) => update(turn.id, { status: 'RUNNING', checkpointSessionId: sessionId, event: { type: 'PLANNING', summary: '已建立加密执行检查点。' } }) })
      if (control.signal.aborted) fail('AGENT_READINESS_CANCELLED')
      const result = turn.journeyId
        ? await service.continueDirectJourney({ sessionId: task.checkpointSessionId, journeyId: turn.journeyId, input: task.input, signal: control.signal })
        : await service.start({ input: task.input, attachmentRefs: task.attachmentRefs,
          attachmentMetadata: task.attachmentMetadata ?? [], signal: control.signal })
      if (control.signal.aborted) throw new WorkbenchError('AGENT_STOP_REQUESTED', 409)
      const refs = { ...(result.sessionId ? { checkpointSessionId: result.sessionId } : {}), ...(result.journeyId ? { journeyId: result.journeyId } : {}) }
      await update(turn.id, { status: 'RUNNING', ...refs, event: { type: 'PLANNING', summary: '已收到 Controller 任务引用，尚未声明测试通过。' } })
      if (result.status === 'NEEDS_INPUT') {
        await update(turn.id, { status: 'NEEDS_INPUT', ...refs, answer: result.question,
          event: { type: 'NEEDS_INPUT', summary: '原任务需要补充输入，没有跳过缺失信息。' } })
      } else {
        if (result.status !== 'COMPLETED' || !result.journeyId) fail('AGENT_CONTROLLER_RESULT_INVALID', 503)
        const proof = await service.evidenceVerify({ journeyId: result.journeyId, signal: control.signal })
        if (!verified(proof, { ...turn, journeyId: result.journeyId })) fail('AGENT_EVIDENCE_NOT_VERIFIED', 503)
        await update(turn.id, { status: 'COMPLETED', ...refs, runId: proof.runId, taskId: proof.taskId,
          answer: '目标已执行，原运行及业务证据已核验。', event: { type: 'COMPLETED', summary: '既有证据验证器已核验本次目标。' } })
      }
    } catch (error) {
      const unknown = control.signal.aborted || externalCallPending || /JOURNEY_EXECUTION_WAIT_TIMEOUT/.test(error?.code)
      await update(turn.id, { status: unknown ? 'INTERRUPTED' : 'FAILED', failureCode: control.signal.aborted ? 'AGENT_STOP_OUTCOME_UNKNOWN' : safeCode(error),
        event: { type: unknown ? 'INTERRUPTED' : 'FAILED', summary: unknown ? 'Controller 等待中断；已派发任务未证明取消或回滚，请人工核对。' : '任务未完成，保留失败原因与原执行引用，请人工介入。' } })
    }
  }
  const app = {
    async getAgentBootstrap() {
      const models = (await call('model_list')).models, selected = models.find(profile => profile.isDefault)
      if (!selected) return { status: 'NOT_READY', environment: 'LOCAL', releaseIdentityHash: null, blockingReasons: ['AGENT_MODEL_CONFIGURATION_REQUIRED'] }
      const releaseIdentityHash = identityFor(selected)
      if (runtimeFault) return { status: 'NOT_READY', environment: 'LOCAL', releaseIdentityHash, blockingReasons: [runtimeFault] }
      const profile = await profileFor(selected.id, selected.version)
      const apiKey = await keyStore.get(namespace, profile.keyRef)
      const ready = await readiness({ profile, modelConfig: { model: profile.model, baseURL: profile.baseUrl, apiKey }, releaseIdentityHash })
      return { status: ready.status, environment: 'LOCAL', releaseIdentityHash,
        blockingReasons: ready.status === 'READY' ? [] : [dependencyCode(ready.code)] }
    },
    listAgentConversations: input => call('conversation_list', input),
    createAgentConversation: ({ title }) => call('conversation_create', { conversationId: randomUUID(), title }),
    async getAgentConversation(input) {
      const detail = await call('conversation_get', input)
      detail.turns = await Promise.all(detail.turns.map(async turn => project(await orphan(turn))))
      const current = detail.conversation.lastTurnId && await loadTurn(detail.conversation.lastTurnId)
      if (current) detail.conversation.status = current.status
      return detail
    },
    async submitAgentMessage(input) {
      if (runtimeFault) fail(runtimeFault, 503)
      const previous = await context(input.conversationId, { submissionId: input.submissionId })
      if (previous.turn) {
        const { releaseIdentityHash: _release, ...original } = previous.request
        if (JSON.stringify(original) !== JSON.stringify(input)) {
          // Compare field values, not insertion order from different transports.
          if (['conversationId', 'submissionId', 'input', 'modelProfileId', 'modelProfileVersion'].some(key => original[key] !== input[key]) ||
              JSON.stringify(original.attachmentRefs) !== JSON.stringify(input.attachmentRefs) ||
              JSON.stringify(original.attachmentMetadata) !== JSON.stringify(input.attachmentMetadata)) fail('AGENT_SUBMISSION_CONFLICT')
        }
        return project(await orphan(previous.turn))
      }
      if (input.attachmentRefs.length > 1) fail('AGENT_SINGLE_IMAGE_ONLY', 400)
      if (input.attachmentRefs.length && (input.attachmentMetadata?.length !== 1 || input.attachmentMetadata[0].attachmentRef !== input.attachmentRefs[0])) fail('AGENT_ATTACHMENT_METADATA_REQUIRED', 400)
      const detail = await call('conversation_get', { conversationId: input.conversationId, limit: 1 })
      const parent = detail.conversation.lastTurnId ? await loadTurn(detail.conversation.lastTurnId) : undefined
      if (parent?.status === 'NEEDS_INPUT' && (input.modelProfileId !== parent.modelBinding.profileId || input.modelProfileVersion !== parent.modelBinding.profileVersion)) fail('AGENT_CONTINUATION_BINDING_CONFLICT')
      if (parent?.status === 'NEEDS_INPUT' && input.attachmentRefs.length) fail('AGENT_CONTINUATION_ATTACHMENT_NOT_SUPPORTED', 400)
      const profile = await profileFor(input.modelProfileId, input.modelProfileVersion)
      const releaseIdentityHash = parent?.status === 'NEEDS_INPUT' ? parent.modelBinding.releaseIdentityHash : identityFor(profile)
      const submitted = await call('turn_submit', { ...input, releaseIdentityHash })
      if (submitted.created) {
        const control = new AbortController(), owned = { control, promise: null }
        active.set(submitted.turn.id, owned)
        owned.promise = execute(submitted.turn, input, control).catch(() => { runtimeFault = 'AGENT_STATE_PERSISTENCE_FAILED' })
          .finally(() => active.delete(submitted.turn.id))
      }
      return project(submitted.turn)
    },
    async getAgentTurn({ turnId, after = 0, limit = 50 }) {
      await orphan(await loadTurn(turnId))
      return project(await call('turn_get', { turnId, after, limit }))
    },
    async cancelAgentTurn({ turnId }) {
      const result = await update(turnId, { status: 'STOP_REQUESTED', event: { type: 'STOP_REQUESTED', summary: '请求停止 Controller；并非撤销业务或 Worker 取消回执。' } })
      active.get(turnId)?.control.abort()
      return project(result)
    },
    listAgentModels: () => call('model_list'),
    async createAgentModel(input) {
      if (!input.apiKey) fail('AGENT_MODEL_KEY_REQUIRED', 400)
      const keyRef = await keyStore.put(namespace, input.apiKey)
      const { apiKey: _key, ...safe } = input
      return call('model_save', { ...safe, modelId: randomUUID(), expectedVersion: 0, keyRef })
    },
    async updateAgentModel({ modelId, version, apiKey, ...safe }) {
      const current = await profileFor(modelId)
      if (current.version !== version) fail('AGENT_MODEL_VERSION_CONFLICT')
      const keyRef = apiKey ? await keyStore.put(namespace, apiKey) : current.keyRef
      return call('model_save', { ...safe, modelId, expectedVersion: version, keyRef })
    },
    async checkAgentModel({ profileId, profileVersion, apiKey, model, baseUrl }) {
      if (!apiKey && profileId && profileVersion) apiKey = await keyStore.get(namespace, (await profileFor(profileId, profileVersion)).keyRef)
      if (!apiKey) fail('AGENT_MODEL_KEY_REQUIRED', 400)
      const result = await probeModel({ model, baseURL: baseUrl, apiKey })
      return { status: result.status === 'READY' ? 'READY' : 'FAILED', code: result.status === 'READY' ? 'AGENT_MODEL_READY' : result.code }
    },
    setDefaultAgentModel: ({ modelId, version }) => call('model_default', { modelId, expectedVersion: version }),
    async importAgentAttachment({ bytes, filename, mediaType, signal }) {
      const receipt = await importAttachment({ bytes, nameBase64Url: Buffer.from(filename).toString('base64url'), sha256: sha256(bytes), signal })
      return { ...receipt, originalFilename: filename, mediaType }
    },
    async getAgentTurnEvidence({ turnId }) {
      const turn = await loadTurn(turnId)
      if (!turn.journeyId) fail('AGENT_EVIDENCE_NOT_FOUND', 404)
      return (await serviceFor(await configuration(turn))).evidence({ journeyId: turn.journeyId })
    },
    async downloadAgentArtifact({ turnId, artifactId }) {
      const evidence = await app.getAgentTurnEvidence({ turnId })
      if (!evidence.artifactCards.some(card => card.artifactId === artifactId)) fail('AGENT_ARTIFACT_NOT_FOUND', 404)
      return downloadArtifact({ artifactId })
    },
    async close() {
      for (const entry of active.values()) entry.control.abort()
      await Promise.all([...active.values()].map(entry => entry.promise))
      await metadata.close?.()
    },
    async waitForIdle() { await Promise.all([...active.values()].map(entry => entry.promise)); if (runtimeFault) fail(runtimeFault, 503) },
  }
  return app
}

