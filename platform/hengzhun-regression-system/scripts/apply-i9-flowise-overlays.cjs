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
const customMcpCoreTarget = path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/tools/MCP/core.js')
const agentflowToolTarget = path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/Tool/Tool.js')
const agentflowLlmTarget = path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/LLM/LLM.js')
const agentflowRuntimeTarget = path.join(root, 'flowise/app/node_modules/flowise/dist/utils/buildAgentflow.js')
const flowiseUiBuildRoot = path.join(root, 'flowise/app/node_modules/flowise-ui/build')
const attachmentBridgeSource = path.join(root, 'flowise/i10/hengzhun-attachment-bridge-v1.js')
const attachmentBridgeTarget = path.join(flowiseUiBuildRoot, 'hengzhun-attachment-bridge.js')
const flowiseUiIndexTarget = path.join(flowiseUiBuildRoot, 'index.html')
const frozenUpstreamHash = '6164ee560a979738fd1827e802a2e91d8697ca019fadbe9a29a20dbf53c4c3f1'
const frozenStructuredOutputHash = '7a33b1205cd0fa9d661e0a93aa5632aae0e511ea7a3494fcd23e2da6246499c1'
const frozenCustomMcpHash = '28a617e861c21d1b9b468602c7dcf2b10ea791c66a72facf709f58804ea17347'
const frozenCustomMcpCoreHash = 'e0800ff304b6ba9331848eb504021483ba5227ccb0d145a4763d1456f4d797cc'
const frozenAgentflowToolHash = 'b60dd350a0855cfa5f7a18f3b8f9b04d5470228d4076bbecdf8cdc7faadb62fe'
const frozenAgentflowLlmHash = 'c31d348cb71e095c1c925f85686414699ea2c487831d9ba814ae613504a1c42c'
const frozenAgentflowRuntimeHash = '0585270c9401de3466e79a7137e528281130720df9a2df95718b4c669773b9ca'
const marker = 'I9_PLATFORM_KNOWLEDGE_SQLITE_FALLBACK'
const structuredOutputMarker = 'I9_MIMO_JSON_MODE_STRUCTURED_OUTPUT'
const customMcpMarker = 'I9_RUNTIME_MCP_TOKEN_OVERLAY'
const localMcpAuthorizationMarker = 'I9_LOOPBACK_MCP_AUTHORIZATION_OVERLAY'
const legacyMcpFailClosedMarker = 'I9_MCP_TOOL_ERROR_FAIL_CLOSED'
const previousMcpFailClosedMarker = 'I9_MCP_TOOL_ERROR_FAIL_CLOSED_V2'
const mcpFailClosedMarker = 'I9_MCP_TOOL_ERROR_FAIL_CLOSED_V3'
const i10ToolArgumentCoercionMarker = 'I10_FLOWISE_SCHEMA_AWARE_TOOL_ARGUMENT_COERCION_V1'
const i10ToolInputSchemaDiagnosticsMarker = 'I10_FLOWISE_TOOL_INPUT_SCHEMA_DIAGNOSTICS_V1'
const i10ToolInputSchemaDiagnosticsV2Marker = 'I10_FLOWISE_TOOL_INPUT_SCHEMA_DIAGNOSTICS_V2'
const i10McpStatePayloadMarker = 'I10_FLOWISE_MCP_STATE_PAYLOAD_UNWRAP_V1'
const i10McpArgumentDiagnosticsMarker = 'I10_FLOWISE_MCP_ARGUMENT_TYPE_DIAGNOSTICS_V1'
const i10McpArgumentChecksMarker = 'I10_FLOWISE_MCP_ARGUMENT_CONSTRAINT_CHECKS_V1'
const i10McpTypedSchemaMarker = 'I10_FLOWISE_MCP_TYPED_SCHEMA_V1'
const previousI10UploadMetadataMarker = 'I10_FLOWISE_CONTROLLED_ATTACHMENT_METADATA_V1'
const i10UploadMetadataMarker = 'I10_FLOWISE_CONTROLLED_ATTACHMENT_METADATA_V2'
const previousI10AttachmentOnlyInputMarkers = ['I10_FLOWISE_ATTACHMENT_ONLY_INPUT_V1', 'I10_FLOWISE_ATTACHMENT_ONLY_INPUT_V2']
const i10AttachmentOnlyInputMarker = 'I10_FLOWISE_CONTROLLED_ATTACHMENT_ENVELOPE_V3'
const i10AttachmentBridgeMarker = 'I10_FLOWISE_ATTACHMENT_BRIDGE_V2'
const previousI10ConditionalMergeMarkers = ['I10_FLOWISE_OUTERMOST_CONDITION_MERGE_V1', 'I10_FLOWISE_OUTERMOST_CONDITION_MERGE_V2']
const i10ConditionalMergeMarker = 'I10_FLOWISE_OUTERMOST_CONDITION_MERGE_V3'

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

function applyI10TypedMcpSchemaOverlay() {
  assert.ok(fs.existsSync(customMcpCoreTarget), 'I10_FLOWISE_CUSTOM_MCP_CORE_MISSING')
  const current = fs.readFileSync(customMcpCoreTarget, 'utf8')
  if (current.includes(i10McpTypedSchemaMarker)) return false
  assert.equal(sha256(current), frozenCustomMcpCoreHash, 'I10_FLOWISE_CUSTOM_MCP_CORE_UPSTREAM_HASH_DRIFT')
  const before = `function createSchemaModel(inputSchema) {
    if (inputSchema.type !== 'object' || !inputSchema.properties) {
        throw new Error('Invalid schema type or missing properties');
    }
    const schemaProperties = Object.entries(inputSchema.properties).reduce((acc, [key, _]) => {
        acc[key] = zod_1.z.any();
        return acc;
    }, {});
    return zod_1.z.object(schemaProperties);
}`
  assert.ok(current.includes(before), 'I10_FLOWISE_CUSTOM_MCP_SCHEMA_PATCH_POINT_MISSING')
  const after = `// ${i10McpTypedSchemaMarker}: preserve MCP JSON Schema primitive and collection types.
// Harness remains the final validator; this adapter prevents Flow State interpolation from erasing types.
function jsonSchemaToZod(schema) {
    if (Array.isArray(schema?.enum) && schema.enum.length > 0 && schema.enum.every((value) => typeof value === 'string')) {
        return zod_1.z.enum(schema.enum);
    }
    switch (schema?.type) {
        case 'string': return zod_1.z.string();
        case 'integer': return zod_1.z.number().int();
        case 'number': return zod_1.z.number();
        case 'boolean': return zod_1.z.boolean();
        case 'array': return zod_1.z.array(jsonSchemaToZod(schema.items || {}));
        case 'object': {
            const required = new Set(schema.required || []);
            const shape = Object.fromEntries(Object.entries(schema.properties || {}).map(([key, property]) => {
                const field = jsonSchemaToZod(property);
                return [key, required.has(key) ? field : field.optional()];
            }));
            return zod_1.z.object(shape);
        }
        default: return zod_1.z.any();
    }
}
function createSchemaModel(inputSchema) {
    if (inputSchema.type !== 'object' || !inputSchema.properties) {
        throw new Error('Invalid schema type or missing properties');
    }
    return jsonSchemaToZod(inputSchema);
}`
  fs.writeFileSync(customMcpCoreTarget, current.replace(before, after))
  return true
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
                    if (!governedMcpErrorCode && /MCP error -32602: Input validation error/.test(String(innerText || ''))) governedMcpErrorCode = 'MCP_INPUT_VALIDATION_ERROR';
                }
                catch { }
                if (governedMcpErrorCode || /MCP error -\\d+/.test(toolOutput)) {
                    // ${i10McpArgumentDiagnosticsMarker}: values remain secret; only names and runtime types are reported.
                    const safeArgumentTypes = Object.fromEntries(Object.entries(toolCallArgs).map(([key, value]) => [key, Array.isArray(value) ? \`array(\${value.length})\` : value === null ? 'null' : typeof value]));
                    // ${i10McpArgumentChecksMarker}: booleans and lengths only; never log argument values.
                    const safeReferencePattern = /^[A-Za-z0-9._:-]+$/;
                    const safeArgumentChecks = {
                        references: Object.fromEntries(['preparationId', 'confirmationRef', 'caseId', 'sessionRef'].map((key) => [key, typeof toolCallArgs[key] === 'string' && toolCallArgs[key].length >= 3 && toolCallArgs[key].length <= 160 && safeReferencePattern.test(toolCallArgs[key])])),
                        stringLengths: Object.fromEntries(Object.entries(toolCallArgs).filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, value.length])),
                        imageShape: Array.isArray(toolCallArgs.images) ? toolCallArgs.images.map((item) => ({
                            keys: item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort() : [],
                            fieldTypes: item && typeof item === 'object' && !Array.isArray(item)
                                ? Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value]))
                                : {},
                            fieldLengths: item && typeof item === 'object' && !Array.isArray(item)
                                ? Object.fromEntries(Object.entries(item).filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, value.length]))
                                : {}
                        })) : [],
                        versions: Object.fromEntries(['expectedVersion', 'caseVersion'].map((key) => [key, Number.isInteger(toolCallArgs[key]) && toolCallArgs[key] > 0])),
                        routeLength: typeof toolCallArgs.route === 'string' ? toolCallArgs.route.length : -1,
                        arrays: Object.fromEntries(['intentStepIds', 'actions', 'expectedOutcomes', 'riskLevels', 'assertions'].map((key) => [key, Array.isArray(toolCallArgs[key]) && toolCallArgs[key].every((item) => typeof item === 'string' && item.length > 0 && item.length <= 500)])),
                        riskLevelsAllowed: Array.isArray(toolCallArgs.riskLevels) && toolCallArgs.riskLevels.every((item) => ['LOW', 'MEDIUM', 'HIGH'].includes(item))
                    };
                    throw new Error(\`I9_MCP_TOOL_FAILED_CLOSED:\${governedMcpErrorCode || 'MCP_PROTOCOL_ERROR'}:ARG_TYPES=\${JSON.stringify(safeArgumentTypes)}:ARG_CHECKS=\${JSON.stringify(safeArgumentChecks)}\`);
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

function applyI10McpArgumentChecksOverlay() {
  assert.ok(fs.existsSync(agentflowToolTarget), 'I10_FLOWISE_AGENTFLOW_TOOL_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowToolTarget, 'utf8')
  if (current.includes(i10McpArgumentChecksMarker)) return false
  const throwPatchPoint = '                    throw new Error(`I9_MCP_TOOL_FAILED_CLOSED:${governedMcpErrorCode || \'MCP_PROTOCOL_ERROR\'}:ARG_TYPES=${JSON.stringify(safeArgumentTypes)}`);'
  assert.ok(current.includes(throwPatchPoint), 'I10_FLOWISE_MCP_ARGUMENT_CHECKS_PATCH_POINT_MISSING')
  current = current.replace(throwPatchPoint, `                    // ${i10McpArgumentChecksMarker}: booleans and lengths only; never log argument values.
                    const safeReferencePattern = /^[A-Za-z0-9._:-]+$/;
                    const safeArgumentChecks = {
                        references: Object.fromEntries(['preparationId', 'confirmationRef', 'caseId', 'sessionRef'].map((key) => [key, typeof toolCallArgs[key] === 'string' && toolCallArgs[key].length >= 3 && toolCallArgs[key].length <= 160 && safeReferencePattern.test(toolCallArgs[key])])),
                        versions: Object.fromEntries(['expectedVersion', 'caseVersion'].map((key) => [key, Number.isInteger(toolCallArgs[key]) && toolCallArgs[key] > 0])),
                        routeLength: typeof toolCallArgs.route === 'string' ? toolCallArgs.route.length : -1,
                        arrays: Object.fromEntries(['intentStepIds', 'actions', 'expectedOutcomes', 'riskLevels', 'assertions'].map((key) => [key, Array.isArray(toolCallArgs[key]) && toolCallArgs[key].every((item) => typeof item === 'string' && item.length > 0 && item.length <= 500)])),
                        riskLevelsAllowed: Array.isArray(toolCallArgs.riskLevels) && toolCallArgs.riskLevels.every((item) => ['LOW', 'MEDIUM', 'HIGH'].includes(item))
                    };
                    throw new Error(\`I9_MCP_TOOL_FAILED_CLOSED:\${governedMcpErrorCode || 'MCP_PROTOCOL_ERROR'}:ARG_TYPES=\${JSON.stringify(safeArgumentTypes)}:ARG_CHECKS=\${JSON.stringify(safeArgumentChecks)}\`);`)
  fs.writeFileSync(agentflowToolTarget, current)
  return true
}

function applyI10McpArgumentDiagnosticsOverlay() {
  assert.ok(fs.existsSync(agentflowToolTarget), 'I10_FLOWISE_AGENTFLOW_TOOL_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowToolTarget, 'utf8')
  if (current.includes(i10McpArgumentDiagnosticsMarker)) return false
  const throwPatchPoint = "                    throw new Error(`I9_MCP_TOOL_FAILED_CLOSED:${governedMcpErrorCode || 'MCP_PROTOCOL_ERROR'}`);"
  assert.ok(current.includes(throwPatchPoint), 'I10_FLOWISE_MCP_DIAGNOSTIC_PATCH_POINT_MISSING')
  current = current.replace(throwPatchPoint, `                    // ${i10McpArgumentDiagnosticsMarker}: values remain secret; only names and runtime types are reported.
                    const safeArgumentTypes = Object.fromEntries(Object.entries(toolCallArgs).map(([key, value]) => [key, Array.isArray(value) ? \`array(\${value.length})\` : value === null ? 'null' : typeof value]));
                    throw new Error(\`I9_MCP_TOOL_FAILED_CLOSED:\${governedMcpErrorCode || 'MCP_PROTOCOL_ERROR'}:ARG_TYPES=\${JSON.stringify(safeArgumentTypes)}\`);`)
  fs.writeFileSync(agentflowToolTarget, current)
  return true
}

function applyI10ToolArgumentCoercionOverlay() {
  assert.ok(fs.existsSync(agentflowToolTarget), 'I10_FLOWISE_AGENTFLOW_TOOL_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowToolTarget, 'utf8')
  if (current.includes(i10ToolArgumentCoercionMarker)) return false

  const instancePatchPoint = `        const toolInstance = (await newToolNodeInstance.init(newNodeData, '', options));
        let toolCallArgs = {};`
  assert.ok(current.includes(instancePatchPoint), 'I10_FLOWISE_TOOL_SCHEMA_PATCH_POINT_MISSING')
  current = current.replace(instancePatchPoint, `        const toolInstance = (await newToolNodeInstance.init(newNodeData, '', options));
        // ${i10ToolArgumentCoercionMarker}: Flow State interpolation yields strings.
        // Coerce JSON primitives only when the selected tool schema requires them.
        const toolArgumentProperties = (Array.isArray(toolInstance) ? toolInstance : [toolInstance]).reduce((properties, tool) => {
            if (!tool?.schema)
                return properties;
            const schema = (0, zod_to_json_schema_1.default)(tool.schema);
            return { ...properties, ...(schema.properties || {}) };
        }, {});
        let toolCallArgs = {};`)

  current = current.replace(
    '        const parseInputValue = (value) => {',
    '        const parseInputValue = (value, expectedSchema) => {'
  )
  const primitivePatchPoint = `            return cleanedValue;
        };
        if (newToolNodeInstance.transformNodeInputsToToolArgs) {`
  assert.ok(current.includes(primitivePatchPoint), 'I10_FLOWISE_TOOL_PRIMITIVE_PATCH_POINT_MISSING')
  current = current.replace(primitivePatchPoint, `            const expectedTypes = Array.isArray(expectedSchema?.type)
                ? expectedSchema.type
                : expectedSchema?.type ? [expectedSchema.type] : [];
            if (expectedTypes.some((type) => type === 'integer' || type === 'number') && /^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$/.test(cleanedValue))
                return Number(cleanedValue);
            if (expectedTypes.includes('boolean') && /^(?:true|false)$/.test(cleanedValue))
                return cleanedValue === 'true';
            if (expectedTypes.includes('null') && cleanedValue === 'null')
                return null;
            return cleanedValue;
        };
        if (newToolNodeInstance.transformNodeInputsToToolArgs) {`)

  const callPatchPoint = '            toolCallArgs[variableName] = parseInputValue(variableValue);'
  assert.ok(current.includes(callPatchPoint), 'I10_FLOWISE_TOOL_COERCION_CALL_PATCH_POINT_MISSING')
  current = current.replace(
    callPatchPoint,
    '            toolCallArgs[variableName] = parseInputValue(variableValue, toolArgumentProperties[variableName]);'
  )
  fs.writeFileSync(agentflowToolTarget, current)
  return true
}

function applyI10ToolInputSchemaDiagnosticsOverlay() {
  assert.ok(fs.existsSync(agentflowToolTarget), 'I10_FLOWISE_AGENTFLOW_TOOL_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowToolTarget, 'utf8')
  if (current.includes(i10ToolInputSchemaDiagnosticsV2Marker)) return false
  if (!current.includes(i10ToolInputSchemaDiagnosticsMarker)) {
    const tryPatchPoint = `        try {
            let toolOutput;`
    assert.ok(current.includes(tryPatchPoint), 'I10_FLOWISE_TOOL_INPUT_SCHEMA_TRY_PATCH_POINT_MISSING')
    current = current.replace(tryPatchPoint, `        // ${i10ToolInputSchemaDiagnosticsMarker}: schema failures expose
        // only field names, types, lengths, and object keys. Argument values
        // remain unavailable to logs and user-visible errors.
        const safeToolInputDiagnostics = () => {
            const actual = Object.fromEntries(Object.entries(toolCallArgs).map(([key, value]) => [key, {
                    type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
                    length: Array.isArray(value) || typeof value === 'string' ? value.length : undefined,
                    itemTypes: Array.isArray(value) ? [...new Set(value.map((item) => item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item))] : undefined,
                    itemKeys: Array.isArray(value) ? [...new Set(value.flatMap((item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item) : []))].sort() : undefined
                }]));
            const expected = Object.fromEntries(Object.entries(toolArgumentProperties).map(([key, schema]) => [key, {
                    type: schema?.type,
                    required: Array.isArray(schema?.required) ? schema.required : undefined,
                    itemRequired: Array.isArray(schema?.items?.required) ? schema.items.required : undefined,
                    itemKeys: schema?.items?.properties ? Object.keys(schema.items.properties).sort() : undefined
                }]));
            return { actual, expected };
        };
        try {
            let toolOutput;`)
  }
  const catchPatchPoint = current.includes(i10ToolInputSchemaDiagnosticsMarker)
    ? `        catch (e) {
            const safeMessage = e instanceof Error ? e.message : String(e);
            if (/Received tool input did not match expected schema|ToolInputParsingException/i.test(safeMessage)) {
                throw new Error(\`I10_MCP_TOOL_INPUT_SCHEMA_FAILED:\${JSON.stringify(safeToolInputDiagnostics())}\`);
            }
            throw new Error(e);
        }`
    : `        catch (e) {
            throw new Error(e);
        }`
  assert.ok(current.includes(catchPatchPoint), 'I10_FLOWISE_TOOL_INPUT_SCHEMA_CATCH_PATCH_POINT_MISSING')
  current = current.replace(catchPatchPoint, `        catch (e) {
            const safeMessage = e instanceof Error ? e.message : String(e);
            if (/Received tool input did not match expected schema|ToolInputParsingException/i.test(safeMessage)) {
                // ${i10ToolInputSchemaDiagnosticsV2Marker}: schema paths/types
                // only; values, credentials and free-form input stay redacted.
                const schemaError = safeMessage
                    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
                    .replace(/Bearer\\s+[^\\s"']+/gi, 'Bearer [REDACTED]')
                    .slice(0, 1200);
                throw new Error(\`I10_MCP_TOOL_INPUT_SCHEMA_FAILED:\${JSON.stringify({ ...safeToolInputDiagnostics(), schemaError })}\`);
            }
            throw new Error(e);
        }`)
  fs.writeFileSync(agentflowToolTarget, current)
  return true
}

function applyI10McpStatePayloadOverlay() {
  assert.ok(fs.existsSync(agentflowToolTarget), 'I10_FLOWISE_AGENTFLOW_TOOL_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowToolTarget, 'utf8')
  if (current.includes(i10McpStatePayloadMarker)) return false
  const parsePatchPoint = '            let parsedArtifacts;'
  assert.ok(current.includes(parsePatchPoint), 'I10_FLOWISE_MCP_STATE_PARSE_PATCH_POINT_MISSING')
  current = current.replace(parsePatchPoint, `            // ${i10McpStatePayloadMarker}: custom MCP returns a content[] envelope.
            // Flow State updates may reference only the parsed text JSON payload, never transport metadata.
            let governedMcpStateOutput = toolOutput;
            if (selectedTool === 'customMCP' && typeof toolOutput === 'string') {
                try {
                    const transportContent = JSON.parse(toolOutput);
                    const transportText = Array.isArray(transportContent)
                        ? transportContent.find((item) => item?.type === 'text')?.text
                        : undefined;
                    const businessPayload = typeof transportText === 'string' ? JSON.parse(transportText) : undefined;
                    if (businessPayload && typeof businessPayload === 'object') governedMcpStateOutput = JSON.stringify(businessPayload);
                }
                catch { }
            }
            let parsedArtifacts;`)
  const statePatchPoint = '            newState = (0, utils_2.processTemplateVariables)(newState, toolOutput);'
  assert.ok(current.includes(statePatchPoint), 'I10_FLOWISE_MCP_STATE_UPDATE_PATCH_POINT_MISSING')
  current = current.replace(statePatchPoint, '            newState = (0, utils_2.processTemplateVariables)(newState, governedMcpStateOutput);')
  fs.writeFileSync(agentflowToolTarget, current)
  return true
}

function applyI10UploadMetadataOverlay() {
  assert.ok(fs.existsSync(agentflowLlmTarget), 'I10_FLOWISE_LLM_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowLlmTarget, 'utf8')
  if (current.includes(i10UploadMetadataMarker)) return false
  if (current.includes(previousI10UploadMetadataMarker)) {
    const legacyStart = current.indexOf(`            else if (!runtimeChatHistory.length) {
                // ${previousI10UploadMetadataMarker}`)
    const legacyEnd = current.indexOf('                /*', legacyStart)
    assert.ok(legacyStart >= 0 && legacyEnd > legacyStart, 'I10_FLOWISE_UPLOAD_METADATA_V1_BLOCK_INVALID')
    current = `${current.slice(0, legacyStart)}            else if (!runtimeChatHistory.length) {
${current.slice(legacyEnd)}`
  } else {
    assert.equal(sha256(current), frozenAgentflowLlmHash, 'I10_FLOWISE_LLM_UPSTREAM_HASH_DRIFT')
  }
  const patchPoint = `            if (enableMemory) {`
  assert.ok(current.includes(patchPoint), 'I10_FLOWISE_UPLOAD_METADATA_PATCH_POINT_MISSING')
  const governedMetadata = `            // ${i10UploadMetadataMarker}: expose the current user turn's
            // platform-governed upload metadata to the I10 classifier even
            // when chat history already exists. File bytes and machine paths
            // never enter controller context.
            if (['llmAgentflow_i10_input', 'llmAgentflow_i10_v3_classify'].includes(nodeData.id) && Array.isArray(options.uploads) && options.uploads.length > 0) {
                if (options.uploads.length > 16) throw new Error('I10_FLOWISE_UPLOAD_COUNT_INVALID');
                const controlledAttachments = [...new Map(options.uploads
                    .filter((upload) => upload && (upload.type === 'stored-file' || upload.type === 'stored-file:full'))
                    .map((upload) => {
                    const filename = String(upload.name || '').replace(/^FILE-STORAGE::/, '');
                    if (!filename || filename.length > 260 || /[\\/\\\\\\u0000-\\u001f]/.test(filename)) {
                        throw new Error('I10_FLOWISE_UPLOAD_FILENAME_INVALID');
                    }
                    const descriptor = {
                        version: 1,
                        orgId: String(options.orgId || ''),
                        chatflowId: String(options.chatflowid || ''),
                        chatId: String(options.chatId || ''),
                        filename
                    };
                    for (const key of ['orgId', 'chatflowId', 'chatId']) {
                        if (!/^[A-Za-z0-9_-]{8,100}$/.test(descriptor[key])) throw new Error('I10_FLOWISE_UPLOAD_SCOPE_INVALID');
                    }
                    const flowiseFileRef = 'flowise-v1.' + Buffer.from(JSON.stringify(descriptor), 'utf8').toString('base64url');
                    return [flowiseFileRef, {
                        flowiseFileRef,
                        originalFilename: filename,
                        mime: String(upload.mime || upload.mimeType || ''),
                        source: 'FLOWISE_MANAGED_UPLOAD'
                    }];
                })).values()];
                if (controlledAttachments.length > 0) {
                    messages.push({ role: 'user', content: 'FLOWISE_CONTROLLED_ATTACHMENTS=' + JSON.stringify(controlledAttachments) });
                }
            }
${patchPoint}`
  fs.writeFileSync(agentflowLlmTarget, current.replace(patchPoint, governedMetadata))
  return true
}

function applyI10ConditionalMergeOverlay() {
  assert.ok(fs.existsSync(agentflowRuntimeTarget), 'I10_FLOWISE_AGENTFLOW_RUNTIME_MISSING')
  const current = fs.readFileSync(agentflowRuntimeTarget, 'utf8')
  if (current.includes(i10ConditionalMergeMarker)) return false
  if (!previousI10ConditionalMergeMarkers.some(marker => current.includes(marker))) assert.equal(sha256(current), frozenAgentflowRuntimeHash, 'I10_FLOWISE_AGENTFLOW_RUNTIME_UPSTREAM_HASH_DRIFT')
  const begin = current.indexOf('function findConditionParent(nodeId, edges, nodes) {')
  const end = current.indexOf('/**\n * Checks if a node has received all required inputs', begin)
  assert.ok(begin >= 0 && end > begin, 'I10_FLOWISE_CONDITIONAL_MERGE_PATCH_POINT_MISSING')
  const governed = `function findConditionParent(nodeId, edges, nodes) {\n    const currentNode = nodes.find((n) => n.id === nodeId);\n    if (!currentNode) return null;\n    // ${i10ConditionalMergeMarker}: direct condition sources and nested human-input branches\n    // resolve to the same outermost condition group before a governed merge.\n    let currentId = nodeId;\n    const visited = new Set();\n    let nearestHumanParent = currentNode.data.name === 'humanInputAgentflow' ? currentNode.id : null;\n    let outermostConditionParent = currentNode.data.name === 'conditionAgentflow' || currentNode.data.name === 'conditionAgentAgentflow' ? currentNode.id : null;\n    while (!visited.has(currentId)) {\n        visited.add(currentId);\n        const parentEdge = edges.find((edge) => edge.target === currentId);\n        if (!parentEdge) break;\n        const parentNode = nodes.find((n) => n.id === parentEdge.source);\n        if (!parentNode) break;\n        if (parentNode.data.name === 'conditionAgentflow' || parentNode.data.name === 'conditionAgentAgentflow') outermostConditionParent = parentNode.id;\n        else if (parentNode.data.name === 'humanInputAgentflow') nearestHumanParent ??= parentNode.id;\n        currentId = parentNode.id;\n    }\n    return outermostConditionParent || nearestHumanParent;\n}\n`
  const patched = `${current.slice(0, begin)}${governed}${current.slice(end)}`
  assert.ok(patched.includes(i10ConditionalMergeMarker) && patched.includes('return outermostConditionParent || nearestHumanParent;'), 'I10_FLOWISE_CONDITIONAL_MERGE_OVERLAY_FAILED')
  fs.writeFileSync(agentflowRuntimeTarget, patched)
  return true
}

function applyI10AttachmentOnlyInputOverlay() {
  assert.ok(fs.existsSync(agentflowRuntimeTarget), 'I10_FLOWISE_AGENTFLOW_RUNTIME_MISSING')
  let current = fs.readFileSync(agentflowRuntimeTarget, 'utf8')
  if (current.includes(i10AttachmentOnlyInputMarker)) return false
  for (const legacyMarker of previousI10AttachmentOnlyInputMarkers) {
    const legacyStart = current.indexOf(`        // ${legacyMarker}:`)
    if (legacyStart < 0) continue
    const resolvePoint = current.indexOf('        const reactFlowNodeData = await (0, exports.resolveVariables)', legacyStart)
    if (resolvePoint < 0) continue
    current = `${current.slice(0, legacyStart)}${current.slice(resolvePoint)}`
  }
  const patchPoint = `        const reactFlowNodeData = await (0, exports.resolveVariables)(flowNodeData, incomingInput.question ?? '', incomingInput.form ?? agentflowRuntime.form ?? {}, flowConfig, availableVariables, variableOverrides, uploadedFilesContent, chatHistory, componentNodes, agentFlowExecutedData, iterationContext, loopCounts);`
  assert.ok(current.includes(patchPoint), 'I10_FLOWISE_ATTACHMENT_ONLY_INPUT_PATCH_POINT_MISSING')
  const replacement = `        // ${i10AttachmentOnlyInputMarker}: represent only the current turn's
        // Flowise-managed uploads as signed, opaque references. This envelope
        // contains no file bytes, machine path, or user secret and is available
        // to initial and resumed Human Input paths.
        const i10ControlledAttachments = (() => {
            if (!Array.isArray(fileUploads) || fileUploads.length === 0)
                return [];
            if (fileUploads.length > 16)
                throw new Error('I10_FLOWISE_UPLOAD_COUNT_INVALID');
            const governed = new Map();
            for (const upload of fileUploads) {
                if (!upload || (upload.type !== 'stored-file' && upload.type !== 'stored-file:full'))
                    continue;
                const filename = String(upload.name || '').replace(/^FILE-STORAGE::/, '');
                if (!filename || filename.length > 260 || /[\\/\\\\\\u0000-\\u001f]/.test(filename))
                    throw new Error('I10_FLOWISE_UPLOAD_FILENAME_INVALID');
                const descriptor = {
                    version: 1,
                    orgId: String(orgId || ''),
                    chatflowId: String(chatflow.id || ''),
                    chatId: String(chatId || ''),
                    filename
                };
                for (const key of ['orgId', 'chatflowId', 'chatId']) {
                    if (!/^[A-Za-z0-9_-]{8,100}$/.test(descriptor[key]))
                        throw new Error('I10_FLOWISE_UPLOAD_SCOPE_INVALID');
                }
                const flowiseFileRef = 'flowise-v1.' + Buffer.from(JSON.stringify(descriptor), 'utf8').toString('base64url');
                governed.set(flowiseFileRef, {
                    flowiseFileRef,
                    originalFilename: filename,
                    mime: String(upload.mime || upload.mimeType || ''),
                    source: 'FLOWISE_MANAGED_UPLOAD'
                });
            }
            return [...governed.values()];
        })();
        const i10AttachmentEnvelope = i10ControlledAttachments.length > 0
            ? 'FLOWISE_CONTROLLED_ATTACHMENTS=' + JSON.stringify(i10ControlledAttachments)
            : '';
        if (!String(incomingInput.question || '').trim() && i10AttachmentEnvelope) {
            incomingInput.question = '[I10_ATTACHMENT_ONLY_INPUT]';
        }
        if (i10AttachmentEnvelope && !String(incomingInput.question || '').includes('FLOWISE_CONTROLLED_ATTACHMENTS=')) {
            incomingInput.question = String(incomingInput.question || '').trim() + '\\n' + i10AttachmentEnvelope;
        }
        if (humanInput && nodeId === humanInput.startNodeId && i10AttachmentEnvelope &&
            !String(humanInput.feedback || '').includes('FLOWISE_CONTROLLED_ATTACHMENTS=')) {
            humanInput.feedback = String(humanInput.feedback || '').trim() +
                (String(humanInput.feedback || '').trim() ? '\\n' : '') +
                i10AttachmentEnvelope;
        }
${patchPoint}`
  fs.writeFileSync(agentflowRuntimeTarget, current.replace(patchPoint, replacement))
  return true
}

function applyI10AttachmentBridgeOverlay() {
  for (const required of [flowiseUiBuildRoot, attachmentBridgeSource, flowiseUiIndexTarget]) {
    assert.ok(fs.existsSync(required), 'I10_FLOWISE_ATTACHMENT_BRIDGE_INPUT_MISSING')
  }
  const source = fs.readFileSync(attachmentBridgeSource, 'utf8')
  assert.ok(source.includes(i10AttachmentBridgeMarker), 'I10_FLOWISE_ATTACHMENT_BRIDGE_MARKER_MISSING')
  const previousBridge = fs.existsSync(attachmentBridgeTarget) ? fs.readFileSync(attachmentBridgeTarget, 'utf8') : ''
  if (previousBridge !== source) fs.writeFileSync(attachmentBridgeTarget, source)

  let index = fs.readFileSync(flowiseUiIndexTarget, 'utf8')
  const scriptTag = '        <script src="/hengzhun-attachment-bridge.js"></script>'
  let indexChanged = false
  if (!index.includes('/hengzhun-attachment-bridge.js')) {
    const patchPoint = '    </body>'
    assert.ok(index.includes(patchPoint), 'I10_FLOWISE_ATTACHMENT_BRIDGE_INDEX_PATCH_POINT_MISSING')
    index = index.replace(patchPoint, `${scriptTag}\n${patchPoint}`)
    fs.writeFileSync(flowiseUiIndexTarget, index)
    indexChanged = true
  }
  return previousBridge !== source || indexChanged
}

function applyAdditionalOverlays() {
  const structured = applyStructuredOutputOverlay()
  const customMcp = applyCustomMcpOverlay()
  const typedMcpSchema = applyI10TypedMcpSchemaOverlay()
  const agentflowTool = applyAgentflowToolOverlay()
  const mcpArgumentDiagnostics = applyI10McpArgumentDiagnosticsOverlay()
  const mcpArgumentChecks = applyI10McpArgumentChecksOverlay()
  const toolArgumentCoercion = applyI10ToolArgumentCoercionOverlay()
  const toolInputSchemaDiagnostics = applyI10ToolInputSchemaDiagnosticsOverlay()
  const mcpStatePayload = applyI10McpStatePayloadOverlay()
  const uploadMetadata = applyI10UploadMetadataOverlay()
  const conditionalMerge = applyI10ConditionalMergeOverlay()
  const attachmentOnlyInput = applyI10AttachmentOnlyInputOverlay()
  const attachmentBridge = applyI10AttachmentBridgeOverlay()
  return structured || customMcp || typedMcpSchema || agentflowTool || mcpArgumentDiagnostics || mcpArgumentChecks || toolArgumentCoercion || toolInputSchemaDiagnostics || mcpStatePayload || uploadMetadata || conditionalMerge || attachmentOnlyInput || attachmentBridge
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
