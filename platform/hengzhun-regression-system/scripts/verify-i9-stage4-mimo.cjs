#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const flowiseApp = path.join(root, 'flowise', 'app')
const profile = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/p4-controller-profile-v1.json'), 'utf8'))
const apiKey = process.env[profile.apiKeyVariable]

if (!apiKey || apiKey.length < 24) {
  process.stderr.write('I9_P4_MIMO_CREDENTIAL_REQUIRED\n')
  process.exit(3)
}
assert.equal(profile.modelName, 'mimo-v2.5')
assert.equal(profile.controllerContext.maximumInputTokens + profile.controllerContext.reservedOutputTokens, profile.controllerContext.totalTokens)
assert.equal(profile.visualContext.maximumInputTokens + profile.visualContext.reservedOutputTokens, profile.visualContext.totalTokens)

const runtimeRequire = require('node:module').createRequire(path.join(flowiseApp, 'package.json'))
const { ChatOpenAI } = runtimeRequire('@langchain/openai')

async function main() {
  const model = new ChatOpenAI({
    apiKey,
    model: profile.modelName,
    temperature: 0,
    maxTokens: 256,
    timeout: 60_000,
    configuration: { baseURL: profile.baseUrl }
  })
  const response = await model.invoke([
    ['system', '你是衡准自动化回归测试主控。只返回一行严格JSON，不使用Markdown，不调用工具。'],
    ['human', '将“客户登录后核对页眉姓名头像与个人资料一致”分类。只返回 {"route":"AUTHORING","riskLevel":"LOW"}。']
  ])
  const content = typeof response.content === 'string'
    ? response.content.trim()
    : response.content.map(item => typeof item === 'string' ? item : item.text || '').join('').trim()
  let parsed
  try { parsed = JSON.parse(content) } catch { throw new Error('I9_P4_MIMO_STRUCTURED_RESPONSE_INVALID') }
  assert.deepEqual(parsed, { route: 'AUTHORING', riskLevel: 'LOW' }, 'I9_P4_MIMO_STRUCTURED_RESPONSE_DRIFT')
  const usage = response.usage_metadata || response.response_metadata?.tokenUsage || null
  process.stdout.write(`${JSON.stringify({
    status: 'HENGZHUN_I9_P4_MIMO_FLOWISE_ADAPTER_VERIFIED',
    provider: profile.provider,
    model: profile.modelName,
    adapter: profile.adapter,
    structuredResponse: true,
    responseCharacters: content.length,
    usageStatus: usage ? 'PROVIDER_REPORTED' : 'NOT_EXPOSED',
    credentialPersisted: false
  }, null, 2)}\n`)
}

main().catch(error => {
  const allowed = new Set([
    'I9_P4_MIMO_STRUCTURED_RESPONSE_INVALID',
    'I9_P4_MIMO_STRUCTURED_RESPONSE_DRIFT'
  ])
  process.stderr.write(`${allowed.has(error.message) ? error.message : 'I9_P4_MIMO_PROVIDER_REQUEST_FAILED'}\n`)
  process.exitCode = 2
})
