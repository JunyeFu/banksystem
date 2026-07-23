#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const runtimeRequire = createRequire(path.join(root, 'flowise/app/package.json'))
const { ChatOpenAI } = runtimeRequire('@langchain/openai')
const { z } = runtimeRequire('zod')

async function main() {
  if (!process.env.MIMO_API_KEY) throw new Error('I9_P6_MIMO_CREDENTIAL_REQUIRED')
  const model = new ChatOpenAI({
    apiKey: process.env.MIMO_API_KEY,
    model: 'mimo-v2.5',
    temperature: 0,
    maxTokens: 256,
    timeout: 60_000,
    configuration: { baseURL: 'https://api.xiaomimimo.com/v1' }
  }).withStructuredOutput(z.object({ route: z.string(), riskLevel: z.string() }), { method: 'jsonMode' })
  const result = await model.invoke([
    { role: 'system', content: '只返回严格JSON。' },
    { role: 'user', content: '返回 {"route":"AUTHORING","riskLevel":"LOW"}' }
  ])
  if (result.route !== 'AUTHORING' || result.riskLevel !== 'LOW') throw new Error('I9_P6_MIMO_JSONMODE_DRIFT')
  process.stdout.write('HENGZHUN_I9_P6_MIMO_JSONMODE_VERIFIED\n')
}

main().catch(error => {
  process.stderr.write(`${String(error.message || error).replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]')}\n`)
  process.exitCode = 2
})
