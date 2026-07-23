'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const appPath = process.env.FLOWISE_PROBE_APP_PATH
  const adapterPath = path.join(__dirname, 'test-document-store-vector.cjs')
  assert.ok(appPath, 'FLOWISE_PROBE_APP_PATH is required')
  assert.ok(process.env.FLOWISE_PROBE_KNOWLEDGE_PATH, 'FLOWISE_PROBE_KNOWLEDGE_PATH is required')

  const runtimeRequire = require('node:module').createRequire(path.join(appPath, 'package.json'))
  const { nodeClass: Retriever } = runtimeRequire('flowise-components/dist/nodes/agentflow/Retriever/Retriever.js')
  const node = new Retriever()
  const result = await node.run({
    id: 'retrieverAgentflow_probe',
    inputs: {
      retrieverKnowledgeDocumentStores: [{ documentStore: 'probe-store:门户登录一致性知识' }],
      retrieverQuery: '门户登录后姓名和头像需要满足什么规则？',
      outputFormat: 'textWithMetadata'
    }
  }, '', {
    componentNodes: { documentStoreVS: { filePath: adapterPath } },
    agentflowRuntime: { state: {} },
    isLastNode: true
  })

  assert.match(result.output.content, /右上角显示的用户姓名与个人资料页中的客户姓名一致/)
  assert.match(result.output.content, /portal-login-consistency\.md/)
  process.stdout.write(JSON.stringify({ status: 'passed', node: node.name, store: 'memory-vector-store', source: 'portal-login-consistency.md' }) + '\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
