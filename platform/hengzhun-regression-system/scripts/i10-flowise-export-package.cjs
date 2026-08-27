#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { configuration: platformAdminConfiguration } = require('./platform-admin.cjs')

const root = path.resolve(__dirname, '..')
const publicationPath = path.join(root, 'flowise', 'i10', 'publication-manifest-v1.json')
const runtimePath = path.join(root, 'config', 'i10.runtime.example.json')
const requiredCollections = [
  'AgentFlow', 'AgentFlowV2', 'AssistantCustom', 'AssistantFlow', 'AssistantOpenAI',
  'AssistantAzure', 'ChatFlow', 'ChatMessage', 'ChatMessageFeedback', 'CustomTemplate',
  'Execution', 'Tool', 'DocumentStore', 'DocumentStoreFileChunk', 'Variable'
]
const secretPatterns = [
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /Bearer\s+[A-Za-z0-9._~+/-]{24,}/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /"(?:apiKey|accessToken|refreshToken|password|secret|authorization)"\s*:\s*"(?!\s*")[^"\r\n]{8,}"/i
]
const absolutePathPatterns = [/(?:^|[\s"'=(:,])(?:[A-Za-z]:\\|\\\\[A-Za-z0-9._-]+\\)[^"\r\n]*/i, /(?:^|["'])\/(?:home|Users|root|var|opt|tmp)\//]
const allowedNonEmptyCollections = new Set(['AgentFlowV2'])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))

function stringValues(value, result = []) {
  if (typeof value === 'string') result.push(value)
  else if (Array.isArray(value)) value.forEach(item => stringValues(item, result))
  else if (value && typeof value === 'object') Object.values(value).forEach(item => stringValues(item, result))
  return result
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

function canonicalHash(value) {
  return sha256(JSON.stringify(canonicalize(value)))
}

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function ensure(condition, code) {
  if (!condition) fail(code)
}

function parseObject(value, code) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {}
  }
  fail(code)
}

function minimalExportPackage(packageValue, publication) {
  ensure(packageValue && typeof packageValue === 'object' && !Array.isArray(packageValue), 'I10_EXPORT_PACKAGE_ROOT_INVALID')
  for (const collection of requiredCollections) ensure(Array.isArray(packageValue[collection]), `I10_EXPORT_PACKAGE_COLLECTION_INVALID:${collection}`)
  const flowId = String(publication.flowId || '')
  const matches = packageValue.AgentFlowV2.filter(item => item && item.id === flowId)
  ensure(matches.length === 1, `I10_EXPORT_PACKAGE_FLOW_MATCH_COUNT:${matches.length}`)
  return Object.fromEntries(requiredCollections.map(collection => [
    collection,
    collection === 'AgentFlowV2' ? [matches[0]] : []
  ]))
}

function validateExportPackage(packageValue, options = {}) {
  const publication = options.publication || readJson(publicationPath)
  ensure(packageValue && typeof packageValue === 'object' && !Array.isArray(packageValue), 'I10_EXPORT_PACKAGE_ROOT_INVALID')
  ensure(Object.keys(packageValue).length === requiredCollections.length
    && Object.keys(packageValue).every(key => requiredCollections.includes(key)), 'I10_EXPORT_PACKAGE_COLLECTION_SET_INVALID')
  for (const collection of requiredCollections) ensure(Array.isArray(packageValue[collection]), `I10_EXPORT_PACKAGE_COLLECTION_INVALID:${collection}`)
  for (const collection of requiredCollections) {
    if (!allowedNonEmptyCollections.has(collection)) ensure(packageValue[collection].length === 0, `I10_EXPORT_PACKAGE_UNRELATED_COLLECTION_NOT_EMPTY:${collection}`)
  }
  ensure(packageValue.AgentFlowV2.length === 1, 'I10_EXPORT_PACKAGE_AGENTFLOW_COUNT_INVALID')

  const flowId = String(publication.flowId || '')
  const flowName = String(publication.name || '')
  ensure(flowId && flowName, 'I10_EXPORT_PACKAGE_PUBLICATION_MANIFEST_INCOMPLETE')
  const matches = packageValue.AgentFlowV2.filter(item => item && item.id === flowId)
  ensure(matches.length === 1, `I10_EXPORT_PACKAGE_FLOW_MATCH_COUNT:${matches.length}`)

  const item = matches[0]
  ensure(item.name === flowName, 'I10_EXPORT_PACKAGE_FLOW_NAME_MISMATCH')
  ensure(item.type === 'AGENTFLOW', 'I10_EXPORT_PACKAGE_FLOW_TYPE_INVALID')
  ensure(item.deployed === true && publication.deployed === true, 'I10_EXPORT_PACKAGE_DEPLOYED_FLAG_INVALID')
  ensure(item.isPublic === false && publication.isPublic === false, 'I10_EXPORT_PACKAGE_PUBLIC_FLAG_INVALID')

  const flowData = parseObject(item.flowData, 'I10_EXPORT_PACKAGE_FLOW_DATA_INVALID')
  const chatbotConfig = parseObject(item.chatbotConfig, 'I10_EXPORT_PACKAGE_CHATBOT_CONFIG_INVALID')
  const flowHash = canonicalHash(flowData)
  const chatbotConfigHash = canonicalHash(chatbotConfig)
  ensure(/^[0-9a-f]{64}$/i.test(String(publication.deployedFlowDataSha256 || '')), 'I10_EXPORT_PACKAGE_DEPLOYED_HASH_MISSING')
  ensure(flowHash === publication.deployedFlowDataSha256, 'I10_EXPORT_PACKAGE_DEPLOYED_HASH_MISMATCH')
  if (publication.chatbotConfigSha256) ensure(chatbotConfigHash === publication.chatbotConfigSha256, 'I10_EXPORT_PACKAGE_CHATBOT_CONFIG_HASH_MISMATCH')

  const serialized = JSON.stringify(packageValue)
  ensure(!secretPatterns.some(pattern => pattern.test(serialized)), 'I10_EXPORT_PACKAGE_SECRET_CONTENT')
  const textValues = stringValues(packageValue)
  ensure(!absolutePathPatterns.some(pattern => textValues.some(value => pattern.test(value))), 'I10_EXPORT_PACKAGE_ABSOLUTE_PATH_CONTENT')

  return {
    status: 'I10_FLOWISE_EXPORT_PACKAGE_PREFLIGHT_READY',
    transport: 'FLOWISE_EXPORT_IMPORT_JSON',
    flowId,
    flowName,
    flowVersion: Number(publication.primaryFlowVersion),
    flowDataHash: flowHash,
    chatbotConfigHash,
    collectionCounts: Object.fromEntries(requiredCollections.map(collection => [collection, packageValue[collection].length])),
    deployed: item.deployed,
    isPublic: item.isPublic,
    reimportPerformed: false
  }
}

function cookieHeader(headers) {
  const combined = headers.get('set-cookie')
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []
  return values.map(value => String(value).split(';', 1)[0]).join('; ')
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(90_000) })
  const text = await response.text()
  let body = text
  try { body = text ? JSON.parse(text) : null } catch {}
  return { response, body }
}

async function authorization(flowiseBase) {
  if (process.env.FLOWISE_API_KEY) return { Authorization: `Bearer ${process.env.FLOWISE_API_KEY}` }
  const localAdmin = platformAdminConfiguration()
  const login = await request(`${flowiseBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: localAdmin.email, password: localAdmin.password })
  })
  ensure(login.response.ok, `I10_FLOWISE_LOGIN_FAILED:${login.response.status}`)
  const cookie = cookieHeader(login.response.headers)
  ensure(cookie, 'I10_FLOWISE_LOGIN_COOKIE_MISSING')
  return { Cookie: cookie, 'x-request-from': 'internal' }
}

async function capture(outputPath) {
  ensure(typeof outputPath === 'string' && outputPath.trim(), 'I10_EXPORT_PACKAGE_OUTPUT_REQUIRED')
  const runtime = readJson(runtimePath)
  const publication = readJson(publicationPath)
  const flowiseBase = process.env.FLOWISE_URL || `http://${runtime.network.host}:${runtime.network.flowisePort}`
  const auth = await authorization(flowiseBase)
  const exported = await request(`${flowiseBase}${publication.exportPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ agentflowv2: true })
  })
  ensure(exported.response.ok, `I10_FLOWISE_EXPORT_FAILED:${exported.response.status}`)
  const minimalPackage = minimalExportPackage(exported.body, publication)
  const validation = validateExportPackage(minimalPackage, { publication })
  const resolved = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  const temporary = `${resolved}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(minimalPackage, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  fs.renameSync(temporary, resolved)
  return { ...validation, outputPath: resolved, source: 'LIVE_FLOWISE_EXPORT_API' }
}

function preflight(packagePath) {
  ensure(typeof packagePath === 'string' && packagePath.trim(), 'I10_EXPORT_PACKAGE_PATH_REQUIRED')
  const resolved = path.resolve(packagePath)
  ensure(path.extname(resolved).toLowerCase() === '.json', 'I10_EXPORT_PACKAGE_JSON_REQUIRED')
  ensure(fs.existsSync(resolved) && fs.statSync(resolved).isFile(), 'I10_EXPORT_PACKAGE_FILE_MISSING')
  ensure(fs.statSync(resolved).size <= 32 * 1024 * 1024, 'I10_EXPORT_PACKAGE_FILE_TOO_LARGE')
  let packageValue
  try { packageValue = readJson(resolved) } catch { fail('I10_EXPORT_PACKAGE_JSON_INVALID') }
  return { ...validateExportPackage(packageValue), packagePath: resolved }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  try {
    const command = process.argv[2]
    if (command === 'preflight') process.stdout.write(`${JSON.stringify(preflight(argument('--package')), null, 2)}\n`)
    else if (command === 'capture') process.stdout.write(`${JSON.stringify(await capture(argument('--output')), null, 2)}\n`)
    else throw new Error('USAGE: i10-flowise-export-package.cjs preflight --package <flowise-export.json> | capture --output <path>')
  } catch (error) {
    process.stderr.write(`${error.code || error.message}\n`)
    process.exitCode = 2
  }
}

if (require.main === module) main()

module.exports = { canonicalHash, capture, minimalExportPackage, preflight, requiredCollections, validateExportPackage }
