import { createHash } from 'node:crypto'

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadToolPolicy } = require('./tool-policy.cjs')
const VERSIONLESS_MUTATION_TOOLS = new Set(['run_submit','feedback_record','feedback_verify'])

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

export function modelResponseEvidence(response) {
  const content = response?.content;
  const text = typeof content === 'string' ? content : '';
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const validJson = value => { try { JSON.parse(value); return true } catch { return false } };
  const reasons = new Set(['stop','length','tool_calls','function_call','content_filter','error']);
  const reason = response?.response_metadata?.finish_reason;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  let syntaxError = null;
  try { JSON.parse(text) } catch (error) {
    const message = String(error.message);
    const categories = [
      ['CONTROL_IN_STRING', /Bad control character/],
      ['INVALID_ESCAPE', /Bad (?:escaped character|Unicode escape)/],
      ['TRUNCATED', /Unexpected end|Unterminated string/],
      ['TRAILING_CONTENT', /Unexpected non-whitespace character after JSON/],
      ['PROPERTY_NAME', /Expected (?:double-quoted property name|property name or)/],
      ['VALUE_DELIMITER', /Expected ',' or/],
      ['COLON', /Expected ':'/],
      ['INVALID_TOKEN', /Unexpected token/],
    ];
    const position = Number(/position (\d+)/.exec(message)?.[1]);
    // Native parser messages can quote user/model values. Keep only our own
    // categories and an offset, plus a value-free structural frame.
    syntaxError = { category: categories.find(([, pattern]) => pattern.test(message))?.[0] || 'OTHER',
      position: Number.isSafeInteger(position) ? position : null };
  }
  let skeleton = '', inString = false, escaped = false;
  for (const character of text) {
    if (escaped) { skeleton += 'e'; escaped = false; continue }
    if (character === '\\' && inString) { skeleton += '\\'; escaped = true; continue }
    if (character === '"') { skeleton += '"'; inString = !inString; continue }
    if (inString) {
      if (character.charCodeAt(0) < 32) skeleton += '<CONTROL>';
      else if (!skeleton.endsWith('x')) skeleton += 'x';
    } else if ('{}[]:,'.includes(character)) skeleton += character;
    else if (/\s/u.test(character)) { if (!skeleton.endsWith(' ')) skeleton += ' ' }
    else if (!skeleton.endsWith('x')) skeleton += 'x';
    if (skeleton.length > 2048) { skeleton = skeleton.slice(0, 2048); break }
  }
  return Object.freeze({
    schemaVersion: 'model-response-format/v1',
    contentType: typeof content === 'string' ? 'STRING' : Array.isArray(content) ? 'ARRAY' : 'OTHER',
    characters: text.length, utf8Bytes: Buffer.byteLength(text, 'utf8'),
    frame: trimmed.startsWith('```') ? 'FENCE' : trimmed.startsWith('{') ? 'OBJECT' : trimmed.startsWith('[') ? 'ARRAY' : trimmed ? 'OTHER' : 'EMPTY',
    objectClosed: trimmed.endsWith('}'), arrayClosed: trimmed.endsWith(']'),
    hasBom: text.startsWith('\uFEFF'), jsonValid: validJson(text),
    syntaxError, ...(syntaxError ? { formatSkeleton: skeleton } : {}),
    exactJsonFence: Boolean(fenced), fencedJsonValid: Boolean(fenced && validJson(fenced[1])),
    withoutBomJsonValid: text.startsWith('\uFEFF') ? validJson(text.slice(1)) : null,
    finishReason: reasons.has(reason) ? reason : 'OTHER',
    inputTokens: count(response?.usage_metadata?.input_tokens),
    outputTokens: count(response?.usage_metadata?.output_tokens),
    totalTokens: count(response?.usage_metadata?.total_tokens),
  });
}

function validateTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 120_000) {
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
  timeoutMs = 90_000,
  onResponseEvidence,
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
    maxTokens: 8192,
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
      if (onResponseEvidence) {
        try { await onResponseEvidence(modelResponseEvidence(response)) }
        catch { throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_EVIDENCE_WRITE_FAILED') }
      }
      if (typeof response?.content !== 'string' || response.content.trim() === '') {
        throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_RESPONSE_INVALID')
      }
      return response.content
    } catch (error) {
      if (error instanceof ControllerAdapterError) throw error
      if (signal?.aborted) throw new ControllerAdapterError('AGENT_ADAPTER_CANCELLED')
      if (error?.name === 'APIConnectionTimeoutError') throw new ControllerAdapterError('AGENT_ADAPTER_MODEL_TIMEOUT')
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) {
        throw new ControllerAdapterError(`AGENT_ADAPTER_MODEL_HTTP_${error.status >= 500 ? '5XX' : error.status}`)
      }
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

export function createMcpControllerAdapters({ client, timeoutMs = 5_000, mutationTimeoutMs = 30_000, toolPolicy = loadToolPolicy() } = {}) {
  if (typeof client?.callTool !== 'function') throw new ControllerAdapterError('AGENT_ADAPTER_MCP_CLIENT_INVALID')
  validateTimeout(timeoutMs)
  validateTimeout(mutationTimeoutMs)
  const consumedIdempotencyKeys = new Set()

  async function call(toolName, args, { signal, mutation = false } = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new ControllerAdapterError('AGENT_ADAPTER_ARGUMENTS_INVALID', { toolName })
    }
    try {
      const callTimeoutMs = mutation ? mutationTimeoutMs : timeoutMs
      const result = await withDeadline(
        (deadlineSignal) => client.callTool(
          { name: toolName, arguments: structuredClone(args) },
          { signal: deadlineSignal, timeout: callTimeoutMs },
        ),
        { timeoutMs: callTimeoutMs, signal, timeoutCode: mutation ? 'AGENT_ADAPTER_MUTATION_TIMEOUT' : 'AGENT_ADAPTER_READ_TIMEOUT' },
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
    async readJourneyEvidence(journeyId, options = {}) {
      if (typeof journeyId !== 'string' || journeyId.length === 0) {
        throw new ControllerAdapterError('AGENT_ADAPTER_JOURNEY_REQUIRED')
      }
      return read('journey_evidence_verify', { journeyId }, options)
    },
    async readSessionJourney(sessionRef, options = {}) {
      if (typeof sessionRef !== 'string' || sessionRef.length < 8) {
        throw new ControllerAdapterError('AGENT_ADAPTER_SESSION_REQUIRED')
      }
      return read('journey_get', { sessionRef, waitSeconds: 0 }, options)
    },
    async readTask(taskId, options = {}) {
      if (typeof taskId !== 'string' || taskId.length < 8) {
        throw new ControllerAdapterError('AGENT_ADAPTER_TASK_REQUIRED')
      }
      return read('task_get', { taskId, waitForTerminal: false }, options)
    },
    async readSchedule(scheduleId, options = {}) {
      return read('schedule_get', { scheduleId }, options)
    },
    async readFailure(incidentId, options = {}) {
      return read('failure_get', { incidentId }, options)
    },
    async readVerification(challengeId, options = {}) {
      return read('verification_get', { challengeId }, options)
    },
    async readFeedback(feedbackId, options = {}) {
      return read('feedback_get', { feedbackId }, options)
    },
    async readIngest(ingestJobId, options = {}) {
      if (typeof ingestJobId !== 'string' || ingestJobId.length < 8) {
        throw new ControllerAdapterError('AGENT_ADAPTER_INGEST_REQUIRED')
      }
      return read('ingest_get', { ingestJobId }, options)
    },
    async readImageIngest(imageIngestId, options = {}) {
      if (typeof imageIngestId !== 'string' || imageIngestId.length < 8) {
        throw new ControllerAdapterError('AGENT_ADAPTER_IMAGE_INGEST_REQUIRED')
      }
      return read('image_ingest_get', { imageIngestId }, options)
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
      const harnessVersion = result.harnessVersion ?? result.version ??
        (command.toolName === 'candidate_decide' ? result.candidateVersion : undefined)
      if ((!VERSIONLESS_MUTATION_TOOLS.has(command.toolName) && !Number.isInteger(harnessVersion)) || typeof result.status !== 'string') {
        throw new ControllerAdapterError('AGENT_ADAPTER_MUTATION_RESULT_INVALID', { toolName: command.toolName })
      }
      return Number.isInteger(harnessVersion) ? { ...result, harnessVersion } : result
    },
  })
}

export { stableHash }
