'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const targets = [
  'scripts/apply-i9-flowise-overlays.cjs',
  'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/LLM/LLM.js'
]

test('controlled upload metadata reaches both legacy and active I10 classifiers', () => {
  for (const relative of targets) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    assert.match(source, /llmAgentflow_i10_input/, `${relative}缺少旧分类器兼容`)
    assert.match(source, /llmAgentflow_i10_v3_classify/, `${relative}缺少当前v4分类器`)
    assert.match(source, /FLOWISE_CONTROLLED_ATTACHMENTS/, `${relative}缺少受控附件提示`)
    assert.match(source, /stored-file/, `${relative}未限制为Flowise托管附件`)
    assert.match(source, /I10_FLOWISE_CONTROLLED_ATTACHMENT_METADATA_V2/, `${relative}未启用多轮附件覆盖`)
    assert.match(source, /options\.uploads\.length > 16/, `${relative}未限制单轮附件数量`)
  }
})

test('controlled upload metadata is not limited to an empty chat history', () => {
  for (const relative of targets) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    if (relative.endsWith('apply-i9-flowise-overlays.cjs')) {
      const begin = source.indexOf('function applyI10UploadMetadataOverlay')
      const end = source.indexOf('function applyI10ConditionalMergeOverlay', begin)
      const implementation = source.slice(begin, end)
      assert.match(implementation, /const patchPoint = `\s+if \(enableMemory\) \{`/)
      assert.match(implementation, /\$\{patchPoint\}`/)
      assert.doesNotMatch(implementation, /const governedMetadata = `\s+else if \(!runtimeChatHistory\.length\)/)
      continue
    }
    const marker = source.indexOf('I10_FLOWISE_CONTROLLED_ATTACHMENT_METADATA_V2')
    const memoryBranch = source.indexOf('if (enableMemory)', marker)
    assert.ok(marker >= 0, `${relative}缺少多轮附件标记`)
    assert.ok(memoryBranch > marker, `${relative}附件提取仍位于历史分支之后`)
    const governedBlock = source.slice(marker, memoryBranch)
    assert.doesNotMatch(governedBlock, /!runtimeChatHistory\.length/, `${relative}仍把附件限制在首轮`)
  }
})
