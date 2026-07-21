#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const target = path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/Retriever/Retriever.js')
const structuredOutputTarget = path.join(root, 'flowise/app/node_modules/flowise-components/dist/src/utils.js')
const customMcpTarget = path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/tools/MCP/CustomMCP/CustomMCP.js')
const agentflowToolTarget = path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/Tool/Tool.js')
const frozenUpstreamHash = '6164ee560a979738fd1827e802a2e91d8697ca019fadbe9a29a20dbf53c4c3f1'
const frozenStructuredOutputHash = '7a33b1205cd0fa9d661e0a93aa5632aae0e511ea7a3494fcd23e2da6246499c1'
const frozenCustomMcpHash = '28a617e861c21d1b9b468602c7dcf2b10ea791c66a72facf709f58804ea17347'
const frozenAgentflowToolHash = 'b60dd350a0855cfa5f7a18f3b8f9b04d5470228d4076bbecdf8cdc7faadb62fe'
const marker = 'I9_PLATFORM_KNOWLEDGE_SQLITE_FALLBACK'
const structuredOutputMarker = 'I9_MIMO_JSON_MODE_STRUCTURED_OUTPUT'
const customMcpMarker = 'I9_RUNTIME_MCP_TOKEN_OVERLAY'
const localMcpAuthorizationMarker = 'I9_LOOPBACK_MCP_AUTHORIZATION_OVERLAY'
const legacyMcpFailClosedMarker = 'I9_MCP_TOOL_ERROR_FAIL_CLOSED'
const previousMcpFailClosedMarker = 'I9_MCP_TOOL_ERROR_FAIL_CLOSED_V2'
const mcpFailClosedMarker = 'I9_MCP_TOOL_ERROR_FAIL_CLOSED_V3'

const before = `                const [storeId, _] = knowledgeBase.documentStore.split(':');
                const docStoreVectorInstanceFilePath = options.componentNodes['documentStoreVS'].filePath;
                const docStoreVectorModule = await Promise.resolve(\`${'${docStoreVectorInstanceFilePath}'}\`).then(s => __importStar(require(s)));
                const newDocStoreVectorInstance = new docStoreVectorModule.nodeClass();
                const docStoreVectorInstance = (await newDocStoreVectorInstance.init({
                    ...nodeData,
                    inputs: {
                        ...nodeData.inputs,
                        selectedStore: storeId
                    },
                    outputs: {
                        output: 'retriever'
                    }
                }, '', options));
                docs = await docStoreVectorInstance.invoke(retrieverQuery || input, { signal: abortController?.signal });`

const after = `                const [storeId, _] = knowledgeBase.documentStore.split(':');
                const storeEntity = await options.appDataSource
                    .getRepository(options.databaseEntities['DocumentStore'])
                    .findOneBy({ id: storeId });
                if (storeEntity?.embeddingConfig && storeEntity?.vectorStoreConfig) {
                    const docStoreVectorInstanceFilePath = options.componentNodes['documentStoreVS'].filePath;
                    const docStoreVectorModule = await Promise.resolve(\`${'${docStoreVectorInstanceFilePath}'}\`).then(s => __importStar(require(s)));
                    const newDocStoreVectorInstance = new docStoreVectorModule.nodeClass();
                    const docStoreVectorInstance = (await newDocStoreVectorInstance.init({
                        ...nodeData,
                        inputs: {
                            ...nodeData.inputs,
                            selectedStore: storeId
                        },
                        outputs: {
                            output: 'retriever'
                        }
                    }, '', options));
                    docs = await docStoreVectorInstance.invoke(retrieverQuery || input, { signal: abortController?.signal });
                }
                else {
                    // I9_PLATFORM_KNOWLEDGE_SQLITE_FALLBACK: Flowise platform knowledge remains
                    // inside Flowise SQLite when no portable embedding/index runtime is configured.
                    // HiAgent migration maps this Retriever semantic to native Knowledge Retrieval.
                    const chunks = await options.appDataSource
                        .getRepository(options.databaseEntities['DocumentStoreFileChunk'])
                        .find({ where: { storeId } });
                    docs = chunks
                        .sort((left, right) => left.chunkNo - right.chunkNo)
                        .map(chunk => ({
                            pageContent: chunk.pageContent,
                            metadata: JSON.parse(chunk.metadata || '{}')
                        }));
                }`

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }

function applyStructuredOutputOverlay() {
  assert.ok(fs.existsSync(structuredOutputTarget), 'I9_FLOWISE_STRUCTURED_OUTPUT_RUNTIME_MISSING')
  const current = fs.readFileSync(structuredOutputTarget, 'utf8')
  if (current.includes(structuredOutputMarker)) return false
  assert.equal(sha256(current), frozenStructuredOutputHash, 'I9_FLOWISE_STRUCTURED_OUTPUT_UPSTREAM_HASH_DRIFT')
  const patchPoint = 'return llmNodeInstance.withStructuredOutput(structuredOutputSchema);'
  assert.ok(current.includes(patchPoint), 'I9_FLOWISE_STRUCTURED_OUTPUT_PATCH_POINT_MISSING')
  fs.writeFileSync(structuredOutputTarget, current.replace(
    patchPoint,
    `// ${structuredOutputMarker}: Qwen3.5-compatible ceiling uses non-thinking OpenAI JSON mode; MCP remains outside the model.\n        return llmNodeInstance.withStructuredOutput(structuredOutputSchema, { method: 'jsonMode' });`
  ))
  return true
}

function applyCustomMcpOverlay() {
  assert.ok(fs.existsSync(customMcpTarget), 'I9_FLOWISE_CUSTOM_MCP_RUNTIME_MISSING')
  let current = fs.readFileSync(customMcpTarget, 'utf8')
  let changed = false
  if (!current.includes(customMcpMarker)) {
    assert.equal(sha256(current), frozenCustomMcpHash, 'I9_FLOWISE_CUSTOM_MCP_UPSTREAM_HASH_DRIFT')
    const patchPoint = "sandbox['$vars'] = (0, utils_1.prepareSandboxVars)(variables);"
    assert.ok(current.includes(patchPoint), 'I9_FLOWISE_CUSTOM_MCP_PATCH_POINT_MISSING')
    current = current.replace(
      patchPoint,
      `${patchPoint}\n            // ${customMcpMarker}: inject only the process-scoped MCP secret; never persist it in Flowise SQLite.\n            if (process.env.HENGZHUN_MCP_TOKEN) sandbox['$vars'].HENGZHUN_MCP_TOKEN = process.env.HENGZHUN_MCP_TOKEN;`
    )
    changed = true
  }
  if (!current.includes(localMcpAuthorizationMarker)) {
    const authorizationPatchPoint = "            if (process.env.CUSTOM_MCP_SECURITY_CHECK !== 'false') {"
    assert.ok(current.includes(authorizationPatchPoint), 'I9_FLOWISE_CUSTOM_MCP_AUTHORIZATION_PATCH_POINT_MISSING')
    current = current.replace(
      authorizationPatchPoint,
      `            // ${localMcpAuthorizationMarker}: authorize only the bundled loopback Harness MCP at execution time.\n            if (serverParams?.url === 'http://127.0.0.1:18789/mcp' && process.env.HENGZHUN_MCP_TOKEN) {\n                serverParams.headers = { ...(serverParams.headers || {}), Authorization: \`Bearer \${process.env.HENGZHUN_MCP_TOKEN}\` };\n            }\n${authorizationPatchPoint}`
    )
    changed = true
  }
  if (changed) fs.writeFileSync(customMcpTarget, current)
  return changed
}

function applyAgentflowToolOverlay() {
  assert.ok(fs.existsSync(agentflowToolTarget), 'I9_FLOWISE_AGENTFLOW_TOOL_RUNTIME_MISSING')
  const current = fs.readFileSync(agentflowToolTarget, 'utf8')
  if (current.includes(mcpFailClosedMarker)) return false
  const governedBlock = `            // ${mcpFailClosedMarker}: fail closed only on MCP error envelopes; terminal tasks may contain a business errorCode.
            let governedMcpErrorCode;
            if (selectedTool === 'customMCP' && typeof toolOutput === 'string') {
                try {
                    const content = JSON.parse(toolOutput);
                    const innerText = Array.isArray(content) ? content.find((item) => item?.type === 'text')?.text : undefined;
                    const payload = typeof innerText === 'string' ? JSON.parse(innerText) : undefined;
                    if (payload?.errorCode && payload?.category && Number(payload?.status) >= 400) governedMcpErrorCode = String(payload.errorCode);
                }
                catch { }
                if (governedMcpErrorCode || /MCP error -\\d+/.test(toolOutput)) {
                    throw new Error(\`I9_MCP_TOOL_FAILED_CLOSED:\${governedMcpErrorCode || 'MCP_PROTOCOL_ERROR'}\`);
                }
            }`
  if (current.includes(previousMcpFailClosedMarker)) {
    const begin = current.indexOf(`            // ${previousMcpFailClosedMarker}:`)
    const end = current.indexOf('            let parsedArtifacts;', begin)
    assert.ok(begin >= 0 && end > begin, 'I9_FLOWISE_AGENTFLOW_TOOL_V2_PATCH_POINT_MISSING')
    fs.writeFileSync(agentflowToolTarget, `${current.slice(0, begin)}${governedBlock}\n${current.slice(end)}`)
    return true
  }
  if (current.includes(legacyMcpFailClosedMarker)) {
    const begin = current.indexOf(`            // ${legacyMcpFailClosedMarker}:`)
    const end = current.indexOf('            let parsedArtifacts;', begin)
    assert.ok(begin >= 0 && end > begin, 'I9_FLOWISE_AGENTFLOW_TOOL_LEGACY_PATCH_POINT_MISSING')
    fs.writeFileSync(agentflowToolTarget, `${current.slice(0, begin)}${governedBlock}\n${current.slice(end)}`)
    return true
  }
  if (sha256(current) === frozenAgentflowToolHash) {
    const patchPoint = '            let parsedArtifacts;'
    assert.ok(current.includes(patchPoint), 'I9_FLOWISE_AGENTFLOW_TOOL_PATCH_POINT_MISSING')
    fs.writeFileSync(agentflowToolTarget, current.replace(patchPoint, `${governedBlock}\n${patchPoint}`))
    return true
  }
  assert.fail('I9_FLOWISE_AGENTFLOW_TOOL_UPSTREAM_HASH_DRIFT')
}

function applyAdditionalOverlays() {
  const structured = applyStructuredOutputOverlay()
  const customMcp = applyCustomMcpOverlay()
  const agentflowTool = applyAgentflowToolOverlay()
  return structured || customMcp || agentflowTool
}

assert.ok(fs.existsSync(target), 'I9_FLOWISE_RETRIEVER_RUNTIME_MISSING')
const current = fs.readFileSync(target, 'utf8')
if (current.includes(marker)) {
  const upgraded = current
    .replace('const storeEntity = await appDataSource\n                    .getRepository(databaseEntities', "const storeEntity = await options.appDataSource\n                    .getRepository(options.databaseEntities")
    .replace('const chunks = await appDataSource\n                        .getRepository(databaseEntities', "const chunks = await options.appDataSource\n                        .getRepository(options.databaseEntities")
  if (upgraded !== current) {
    fs.writeFileSync(target, upgraded)
    applyAdditionalOverlays()
    process.stdout.write('HENGZHUN_I9_FLOWISE_OVERLAY_UPGRADED\n')
    process.exit(0)
  }
  const additionalApplied = applyAdditionalOverlays()
  process.stdout.write(additionalApplied ? 'HENGZHUN_I9_FLOWISE_ADDITIONAL_OVERLAY_APPLIED\n' : 'HENGZHUN_I9_FLOWISE_OVERLAY_ALREADY_APPLIED\n')
  process.exit(0)
}
assert.equal(sha256(current), frozenUpstreamHash, 'I9_FLOWISE_RETRIEVER_UPSTREAM_HASH_DRIFT')
assert.ok(current.includes(before), 'I9_FLOWISE_RETRIEVER_PATCH_POINT_MISSING')
const patched = current.replace(before, after)
assert.ok(patched.includes(marker), 'I9_FLOWISE_RETRIEVER_OVERLAY_FAILED')
fs.writeFileSync(target, patched)
applyAdditionalOverlays()
process.stdout.write('HENGZHUN_I9_FLOWISE_OVERLAY_APPLIED\n')
