'use strict'

const fs = require('node:fs')
const path = require('node:path')

class ProbeDocumentStoreVector {
  async init(_nodeData, _input, options) {
    const appPath = process.env.FLOWISE_PROBE_APP_PATH
    const knowledgePath = process.env.FLOWISE_PROBE_KNOWLEDGE_PATH
    if (!appPath || !knowledgePath) {
      throw new Error('FLOWISE_PROBE_APP_PATH and FLOWISE_PROBE_KNOWLEDGE_PATH are required')
    }

    const runtimeRequire = require('node:module').createRequire(path.join(appPath, 'package.json'))
    const { FakeEmbeddings } = runtimeRequire('@langchain/core/utils/testing')
    const { Document } = runtimeRequire('@langchain/core/documents')
    const { MemoryVectorStore } = runtimeRequire('langchain/vectorstores/memory')
    const text = fs.readFileSync(knowledgePath, 'utf8')
    const documents = [new Document({ pageContent: text, metadata: { source: path.basename(knowledgePath) } })]
    const store = await MemoryVectorStore.fromDocuments(documents, new FakeEmbeddings())
    return store.asRetriever({ k: 1 })
  }
}

module.exports = { nodeClass: ProbeDocumentStoreVector }
