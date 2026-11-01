import { randomBytes, timingSafeEqual } from 'node:crypto'
import { workbenchOperations, workbenchPathParameters, workbenchPrefix } from './workbench-contract.mjs'

export class WorkbenchError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}

const MAX_BODY_BYTES = 65536
const headers = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
}
const json = (body, status, problem = false) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'content-type': problem ? 'application/problem+json' : 'application/json' },
})
const problem = (code, status) => json({ type: 'about:blank', title: code, status, code }, status, true)

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new WorkbenchError('AGENT_JSON_REQUIRED', 415)
  }
  const chunks = []
  let length = 0
  for await (const chunk of request.body ?? []) {
    length += chunk.byteLength
    if (length > MAX_BODY_BYTES) throw new WorkbenchError('AGENT_REQUEST_TOO_LARGE', 413)
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new WorkbenchError('AGENT_REQUEST_INVALID', 400) }
}

async function readImage(request) {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!['image/png', 'image/jpeg'].includes(mediaType)) throw new WorkbenchError('AGENT_IMAGE_REQUIRED', 415)
  const encoded = request.headers.get('x-hengzhun-filename') ?? ''
  const filename = Buffer.from(encoded, 'base64url').toString('utf8')
  if (!/^[A-Za-z0-9_-]{1,1040}$/.test(encoded) || Buffer.from(filename).toString('base64url') !== encoded ||
    !filename || filename.length > 260 || /[\\/:\x00-\x1f]/.test(filename)) throw new WorkbenchError('AGENT_FILENAME_INVALID', 400)
  const chunks = []; let length = 0
  for await (const chunk of request.body ?? []) {
    length += chunk.byteLength
    if (length > 16 * 1024 * 1024) throw new WorkbenchError('AGENT_REQUEST_TOO_LARGE', 413)
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (!(mediaType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) throw new WorkbenchError('AGENT_IMAGE_INVALID', 400)
  return { bytes, filename, mediaType, signal: request.signal }
}

// Binding/listening and production-service composition are separate: this router owns no execution state.
export function createAgentWorkbenchHandler({ workbench, origin }) {
  const base = new URL(origin)
  if (base.origin !== origin || base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new WorkbenchError('AGENT_LOOPBACK_ORIGIN_REQUIRED', 400)
  }
  const csrfToken = randomBytes(32).toString('hex')
  const routes = workbenchOperations.map((operation) => ({
    ...operation,
    pattern: new RegExp(`^${workbenchPrefix}${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`),
    params: [...operation.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => name),
  }))
  return async function handle(request) {
    try {
      const url = new URL(request.url)
      if (url.origin !== origin || request.headers.get('host') !== base.host || request.headers.get('sec-fetch-site') === 'cross-site') {
        throw new WorkbenchError('AGENT_HOST_FORBIDDEN', 403)
      }
      const match = routes.find((route) => route.method === request.method && route.pattern.test(url.pathname))
      if (!match) return problem('AGENT_ROUTE_NOT_FOUND', 404)
      const mutates = request.method !== 'GET'
      if (mutates) {
        const token = request.headers.get('x-hengzhun-csrf') ?? ''
        if (request.headers.get('origin') !== origin || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(csrfToken))) {
          throw new WorkbenchError('AGENT_ORIGIN_OR_CSRF_FORBIDDEN', 403)
        }
      }
      const captures = url.pathname.match(match.pattern).slice(1)
      const params = workbenchPathParameters.safeParse(Object.fromEntries(match.params.map((name, index) => [name, captures[index]])))
      if (!params.success) throw new WorkbenchError('AGENT_PATH_INVALID', 400)
      const raw = mutates ? (match.binaryInput ? await readImage(request) : await readBody(request)) : Object.fromEntries(url.searchParams)
      if (url.searchParams.size !== new Set(url.searchParams.keys()).size || (mutates && url.searchParams.size)) {
        throw new WorkbenchError('AGENT_QUERY_INVALID', 400)
      }
      const input = match.input?.safeParse(raw)
      if (input && !input.success) throw new WorkbenchError('AGENT_REQUEST_INVALID', 400)
      if (!match.input && url.searchParams.size) throw new WorkbenchError('AGENT_QUERY_INVALID', 400)
      const value = await workbench[match.operationId]({ ...params.data, ...(match.binaryInput ? raw : input?.data ?? {}) })
      if (match.binaryOutput) {
        if (!Buffer.isBuffer(value?.bytes) || typeof value.filename !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new WorkbenchError('AGENT_RESPONSE_INVALID', 500)
        return new Response(value.bytes, { status: 200, headers: { ...headers, 'content-type': 'application/octet-stream',
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(value.filename)}`, 'x-content-sha256': value.sha256 } })
      }
      const output = match.output.safeParse(match.operationId === 'getAgentBootstrap' ? { ...value, csrfToken } : value)
      if (!output.success) throw new WorkbenchError('AGENT_RESPONSE_INVALID', 500)
      return json(output.data, match.status)
    } catch (error) {
      if (error instanceof WorkbenchError && [400, 403, 404, 409, 413, 415, 500, 503].includes(error.status) && /^(?:AGENT|MODEL|HARNESS|MCP|WORKER|BROWSER|BANK|I10_VISION|I10_MIDSCENE)_[A-Z0-9_]{1,90}$/.test(error.code)) {
        return problem(error.code, error.status)
      }
      // Dependency messages can contain URLs/keys. Never serialize error.message, stack or details.
      return problem('AGENT_INTERNAL_ERROR', 500)
    }
  }
}
