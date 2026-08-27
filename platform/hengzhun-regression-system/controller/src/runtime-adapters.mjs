import { createHash } from 'node:crypto'

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadToolPolicy } = require('./tool-policy.cjs')

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

export class ControllerAdapterError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'ControllerAdapterError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}

function validateTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30_000) {
    throw new ControllerAdapterError('AGENT_ADAPTER_TIMEOUT_CONFIG_INVALID')
  }
}

async function withDeadline(operation, { timeoutMs, signal, timeoutCode }) {
  validateTimeout(timeoutMs)
  if (signal?.aborted) throw new ControllerAdapterError('AGENT_ADAPTER_CANCELLED')
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  let timer
  try {
    const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => {
      reject(new ControllerAdapterError(signal?.aborted ? 'AGENT_ADAPTER_CANCELLED' : timeoutCode))
    }, { once: true }))
    return await Promise.race([
      operation(controller.signal),
      aborted,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error(timeoutCode))
          reject(new ControllerAdapterError(timeoutCode))
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function validateMcpLoopbackUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new ControllerAdapterError('AGENT_ADAPTER_MCP_URL_INVALID') }
  if (
    url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/mcp' ||
    url.username || url.password || url.search || url.hash || !url.port
  ) throw new ControllerAdapterError('AGENT_ADAPTER_MCP_URL_FORBIDDEN')
  return url
}

export function createOpenAIJsonInvoker({
  apiKey,
  baseURL,
  model,
  timeoutMs = 15_000,
  modelFactory = (config) => new ChatOpenAI(config),
} = {}) {
  if (
    typeof apiKey !== 'string' || apiKey.length < 8 || typeof baseURL !== 'string' ||
    typeof model !== 'string' || model.trim() === ''
  ) throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_CONFIG_INVALID')
  validateTimeout(timeoutMs)
  const chat = modelFactory({
    apiKey,
    model,
    temperature: 0,
    streaming: false,
    maxRetries: 0,
    timeout: timeoutMs,
    configuration: { baseURL },
  })
  if (!chat?.withConfig) throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_INVALID')
  const jsonChat = chat.withConfig({ response_format: { type: 'json_object' }, tools: [] })
  return async function invokeJson({ systemPrompt, input, signal }) {
    if (typeof systemPrompt !== 'string' || typeof input !== 'string') {
      throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_INPUT_INVALID')
    }
    try {
      const response = await withDeadline(
        (deadlineSignal) => jsonChat.invoke(
          [new SystemMessage(systemPrompt), new HumanMessage(input)],
          { signal: deadlineSignal },
        ),
        { timeoutMs, signal, timeoutCode: 'AGENT_ADAPTER_MODEL_TIMEOUT' },
      )
      if (typeof response?.content !== 'string' || response.content.trim() === '') {
        throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_RESPONSE_INVALID')
      }
      return response.content
    } catch (error) {
      if (error instanceof ControllerAdapterError) throw error
      if (signal?.aborted) throw new ControllerAdapterError('AGENT_ADAPTER_CANCELLED')
      throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_TRANSPORT_FAILED')
    }
  }
}

export async function connectMcpRuntime({ url, token, timeoutMs = 5_000, fetch } = {}) {
  const endpoint = validateMcpLoopbackUrl(url)
  if (typeof token !== 'string' || token.length < 24) {
    throw new ControllerAdapterError('AGENT_ADAPTER_MCP_TOKEN_INVALID')
  }
  validateTimeout(timeoutMs)
  const client = new Client({ name: 'hengzhun-controller-v2', version: '2.0.0-inactive' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    ...(fetch ? { fetch } : {}),
    reconnectionOptions: {
      maxReconnectionDelay: 1,
      initialReconnectionDelay: 1,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  })
  try {
    await withDeadline(
      (signal) => client.connect(transport, { signal, timeout: timeoutMs }),
      { timeoutMs, timeoutCode: 'AGENT_ADAPTER_MCP_CONNECT_TIMEOUT' },
    )
  } catch (error) {
    await transport.close().catch(() => undefined)
    if (error instanceof ControllerAdapterError) throw error
    throw new ControllerAdapterError('AGENT_ADAPTER_MCP_CONNECT_FAILED')
  }
  return Object.freeze({
    callTool: (request, options) => client.callTool(request, undefined, options),
    close: () => client.close(),
  })
}

function parsedToolResult(result, toolName) {
  let payload
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    payload = result.structuredContent
  } else {
    const textBlocks = Array.isArray(result?.content)
      ? result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string')
      : []
    if (textBlocks.length !== 1) throw new ControllerAdapterError('AGENT_ADAPTER_MCP_RESULT_INVALID', { toolName })
    try { payload = JSON.parse(textBlocks[0].text) } catch {
      throw new ControllerAdapterError('AGENT_ADAPTER_MCP_RESULT_INVALID', { toolName })
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ControllerAdapterError('AGENT_ADAPTER_MCP_RESULT_INVALID', { toolName })
  }
  if (result?.isError || typeof payload.errorCode === 'string') {
    const businessCode = typeof payload.errorCode === 'string' ? payload.errorCode : 'MCP_TOOL_FAILED'
    const code = /(?:STALE|VERSION|CONFLICT)/.test(businessCode)
      ? 'AGENT_ADAPTER_AUTHORITY_CONFLICT'
      : 'AGENT_ADAPTER_MCP_BUSINESS_FAILED'
    throw new ControllerAdapterError(code, { toolName, businessCode })
  }
  return payload
}

export function createMcpControllerAdapters({ client, timeoutMs = 5_000, toolPolicy = loadToolPolicy() } = {}) {
  if (typeof client?.callTool !== 'function') throw new ControllerAdapterError('AGENT_ADAPTER_MCP_CLIENT_INVALID')
  validateTimeout(timeoutMs)
  const consumedIdempotencyKeys = new Set()

  async function call(toolName, args, { signal, mutation = false } = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new ControllerAdapterError('AGENT_ADAPTER_ARGUMENTS_INVALID', { toolName })
    }
    try {
      const result = await withDeadline(
        (deadlineSignal) => client.callTool(
          { name: toolName, arguments: structuredClone(args) },
          { signal: deadlineSignal, timeout: timeoutMs },
        ),
        { timeoutMs, signal, timeoutCode: mutation ? 'AGENT_ADAPTER_MUTATION_TIMEOUT' : 'AGENT_ADAPTER_READ_TIMEOUT' },
      )
      return parsedToolResult(result, toolName)
    } catch (error) {
      if (error instanceof ControllerAdapterError) throw error
      if (signal?.aborted) throw new ControllerAdapterError('AGENT_ADAPTER_CANCELLED', { toolName })
      throw new ControllerAdapterError('AGENT_ADAPTER_MCP_DISCONNECTED', { toolName })
    }
  }

  async function read(toolName, args, options) {
    try {
      if (toolPolicy.classify(toolName) !== 'READ_ONLY') throw new Error('denied')
    } catch { throw new ControllerAdapterError('AGENT_ADAPTER_READ_TOOL_DENIED', { toolName }) }
    return call(toolName, args, options)
  }

  return Object.freeze({
    async readJourney(journeyId, options = {}) {
      if (typeof journeyId !== 'string' || journeyId.length === 0) {
        throw new ControllerAdapterError('AGENT_ADAPTER_JOURNEY_REQUIRED')
      }
      return read('journey_get', { journeyId, waitSeconds: 0 }, options)
    },
    async prefetch({ namespace, journeyId, expectedVersion, signal }) {
      const journey = await read('journey_get', { journeyId, waitSeconds: 0 }, { signal })
      if (journey.version !== expectedVersion) {
        throw new ControllerAdapterError('AGENT_ADAPTER_AUTHORITY_CONFLICT', { toolName: 'journey_get' })
      }
      return canonicalize({
        schemaVersion: 'hengzhun-deterministic-prefetch/v1',
        namespace,
        journeyId,
        expectedVersion,
        journey: {
          status: journey.status ?? null,
          nextAction: journey.nextAction ?? null,
          targetProfileRef: journey.targetProfileRef ?? null,
          preparationId: journey.preparationId ?? null,
          missingFields: Array.isArray(journey.missingFields) ? journey.missingFields : [],
        },
      })
    },
    async invoke(command, options = {}) {
      if (!command || typeof command !== 'object') throw new ControllerAdapterError('AGENT_ADAPTER_MUTATION_COMMAND_INVALID')
      try {
        if (toolPolicy.classify(command.toolName) !== 'MUTATING') throw new Error('denied')
      } catch { throw new ControllerAdapterError('AGENT_ADAPTER_MUTATION_TOOL_DENIED', { toolName: command.toolName }) }
      if (stableHash(command.arguments) !== command.argumentsHash) {
        throw new ControllerAdapterError('AGENT_ADAPTER_ARGUMENT_HASH_MISMATCH', { toolName: command.toolName })
      }
      const versionFields = ['expectedVersion', 'expectedJourneyVersion', 'expectedPreparationVersion']
      for (const field of versionFields) {
        if (command.arguments[field] !== undefined && command.arguments[field] !== command.expectedVersion) {
          throw new ControllerAdapterError('AGENT_ADAPTER_VERSION_FENCE_MISMATCH', { toolName: command.toolName, field })
        }
      }
      if (typeof command.idempotencyKey !== 'string' || command.idempotencyKey.length < 8) {
        throw new ControllerAdapterError('AGENT_ADAPTER_IDEMPOTENCY_INVALID', { toolName: command.toolName })
      }
      if (consumedIdempotencyKeys.has(command.idempotencyKey)) {
        throw new ControllerAdapterError('AGENT_ADAPTER_DUPLICATE_MUTATION', { toolName: command.toolName })
      }
      consumedIdempotencyKeys.add(command.idempotencyKey)
      const argumentsForMcp = { ...structuredClone(command.arguments) }
      if (argumentsForMcp.idempotencyKey !== undefined && argumentsForMcp.idempotencyKey !== command.idempotencyKey) {
        throw new ControllerAdapterError('AGENT_ADAPTER_IDEMPOTENCY_FENCE_MISMATCH', { toolName: command.toolName })
      }
      const result = await call(command.toolName, argumentsForMcp, { ...options, mutation: true })
      const harnessVersion = result.harnessVersion ?? result.version
      if (!Number.isInteger(harnessVersion) || typeof result.status !== 'string') {
        throw new ControllerAdapterError('AGENT_ADAPTER_MUTATION_RESULT_INVALID', { toolName: command.toolName })
      }
      return { ...result, harnessVersion }
    },
  })
}

export { stableHash }
