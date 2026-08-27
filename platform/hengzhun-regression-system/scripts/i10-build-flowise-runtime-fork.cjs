#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const { builtinModules } = require('node:module')
const { createRequire } = require('node:module')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const defaultAppRoot = path.join(root, 'flowise', 'app')
const defaultPolicyPath = path.join(root, 'flowise', 'i10', 'flowise-runtime-fork-policy-v1.json')
const defaultAcquisitionPolicyPath = path.join(root, 'flowise', 'i10', 'flowise-acquisition-policy-v1.json')
const markerName = '.hengzhun-runtime-fork-v1.json'
const builtinPackageRoots = new Set(builtinModules.map(name => name.replace(/^node:/, '').split('/')[0]))
const posix = value => String(value).replaceAll('\\', '/')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const canonicalize = value => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
    : value
const canonicalHash = value => sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'))

function fail(code, details = '') {
  const error = new Error(details ? `${code}:${details}` : code)
  error.code = code
  throw error
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function assertInside(parent, child, code = 'I10_FLOWISE_FORK_PATH_ESCAPE') {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail(code, child)
  return child
}

function packageNameFromLockPath(entryPath) {
  const normalized = posix(entryPath)
  const index = normalized.lastIndexOf('node_modules/')
  if (index < 0) return ''
  const tail = normalized.slice(index + 'node_modules/'.length)
  const parts = tail.split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1] || ''}` : parts[0]
}

function packageRootFromSpecifier(specifier) {
  const parts = String(specifier).split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1] || ''}` : parts[0]
}

function verifyAcquisition(appRoot, policy) {
  const packageJsonPath = path.join(appRoot, 'package.json')
  const lockPath = path.join(appRoot, 'package-lock.json')
  const nodeModules = path.join(appRoot, 'node_modules')
  for (const required of [packageJsonPath, lockPath, nodeModules]) {
    if (!fs.existsSync(required)) fail('I10_FLOWISE_FORK_ACQUISITION_MISSING', required)
  }
  const declared = readJson(packageJsonPath)
  const lock = readJson(lockPath)
  for (const [name, expected] of Object.entries(policy.upstream || {})) {
    const declaration = declared.dependencies?.[name]
    const locked = lock.packages?.[`node_modules/${name}`]?.version
    const installedPath = path.join(nodeModules, ...name.split('/'), 'package.json')
    if (!fs.existsSync(installedPath)) fail('I10_FLOWISE_FORK_UPSTREAM_PACKAGE_MISSING', name)
    const installed = readJson(installedPath).version
    if (declaration !== expected || locked !== expected || installed !== expected) {
      fail('I10_FLOWISE_FORK_UPSTREAM_VERSION_DRIFT', `${name}:declared=${declaration},locked=${locked},installed=${installed},expected=${expected}`)
    }
  }
  return Object.freeze({
    appRoot,
    acquisitionLockSha256: sha256(fs.readFileSync(lockPath)),
    lock,
    nodeModules,
    componentsRoot: path.join(nodeModules, 'flowise-components')
    , flowiseRoot: path.join(nodeModules, 'flowise')
  })
}

function resolveRelativeModule(fromFile, specifier, componentsRoot) {
  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.json`, path.join(base, 'index.js'), path.join(base, 'index.cjs'), path.join(base, 'index.json')]
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue
    assertInside(componentsRoot, candidate, 'I10_FLOWISE_FORK_RELATIVE_IMPORT_ESCAPE')
    return candidate
  }
  fail('I10_FLOWISE_FORK_RELATIVE_IMPORT_UNRESOLVED', `${posix(path.relative(componentsRoot, fromFile))}:${specifier}`)
}

function staticPackageClosure(packageRoot, seeds) {
  const pending = seeds.map(relative => assertInside(packageRoot, path.join(packageRoot, ...posix(relative).split('/'))))
  const files = new Set()
  const externalPackages = new Set()
  const literalRequire = /(?:require|import)\s*\(\s*(['"])([^'"]+)\1\s*\)/g
  while (pending.length) {
    const absolute = pending.pop()
    if (files.has(absolute)) continue
    if (!fs.existsSync(absolute)) fail('I10_FLOWISE_FORK_ENTRY_MISSING', posix(path.relative(packageRoot, absolute)))
    files.add(absolute)
    const source = fs.readFileSync(absolute, 'utf8')
    for (let match = literalRequire.exec(source); match; match = literalRequire.exec(source)) {
      const specifier = match[2]
      if (specifier.startsWith('.')) pending.push(resolveRelativeModule(absolute, specifier, packageRoot))
      else if (!specifier.startsWith('node:') && !builtinPackageRoots.has(packageRootFromSpecifier(specifier))) externalPackages.add(packageRootFromSpecifier(specifier))
    }
  }
  const relativeFiles = [...files].map(file => posix(path.relative(packageRoot, file))).sort((a, b) => a.localeCompare(b, 'en'))
  return Object.freeze({
    files: Object.freeze(relativeFiles),
    externalPackages: Object.freeze([...externalPackages].sort((a, b) => a.localeCompare(b, 'en')))
  })
}

function componentClosure(componentsRoot, policy) {
  return staticPackageClosure(componentsRoot, [policy.componentRootEntry, ...(policy.allowedNodeEntries || []), ...(policy.allowedCredentialEntries || [])])
}

function assertOverlayMarkers(componentsRoot, policy) {
  for (const requirement of policy.requiredOverlayMarkers || []) {
    const target = assertInside(componentsRoot, path.join(componentsRoot, ...posix(requirement.file).split('/')))
    if (!fs.existsSync(target) || !fs.readFileSync(target, 'utf8').includes(requirement.marker)) {
      fail('I10_FLOWISE_FORK_REQUIRED_OVERLAY_MISSING', `${requirement.file}:${requirement.marker}`)
    }
  }
}

function patchControlledSource(source, patch) {
  if (patch.type === 'disableLlamaEvaluation') {
    const requireLine = 'const EvaluationRunTracerLlama_1 = require("../evaluation/EvaluationRunTracerLlama");'
    const branch = `                    if (options.llamaIndex) {
                        new EvaluationRunTracerLlama_1.EvaluationRunTracerLlama(options.evaluationRunId);
                    }
                    else {
                        const evaluationHandler = new EvaluationRunTracer_1.EvaluationRunTracer(options.evaluationRunId);
                        callbacks.push(evaluationHandler);
                    }`
    if (!source.includes(requireLine) || !source.includes(branch)) fail('I10_FLOWISE_FORK_LLAMA_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: LlamaIndex is outside the I10 runtime closure.`)
      .replace(branch, `                    if (options.llamaIndex)
                        throw new Error('I10_FLOWISE_LLAMA_EVALUATION_DISABLED');
                    const evaluationHandler = new EvaluationRunTracer_1.EvaluationRunTracer(options.evaluationRunId);
                    callbacks.push(evaluationHandler);`)
  }
  if (patch.type === 'disablePowerpointLoader') {
    const requireLine = 'const PowerpointLoader_1 = require("../MicrosoftPowerpoint/PowerpointLoader");'
    const ppt = `            ppt: (blob) => new PowerpointLoader_1.PowerpointLoader(blob),
            pptx: (blob) => new PowerpointLoader_1.PowerpointLoader(blob),`
    if (!source.includes(requireLine) || !source.includes(ppt)) fail('I10_FLOWISE_FORK_POWERPOINT_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: officeparser/decompress are excluded from the I10 runtime.`)
      .replace(ppt, `            ppt: () => { throw new Error('I10_FLOWISE_POWERPOINT_DISABLED'); },
            pptx: () => { throw new Error('I10_FLOWISE_POWERPOINT_DISABLED'); },`)
  }
  if (patch.type === 'disableArizeInstrumentation') {
    const requireLine = 'const openinference_instrumentation_langchain_1 = require("@arizeai/openinference-instrumentation-langchain");'
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_ARIZE_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: Arize instrumentation is outside the governed I10 runtime.
const openinference_instrumentation_langchain_1 = { LangChainInstrumentation: class { constructor() { throw new Error('I10_FLOWISE_ARIZE_INSTRUMENTATION_DISABLED'); } } };`)
  }
  if (patch.type === 'disableGoogleFollowUpProvider') {
    const requireLine = 'const google_genai_1 = require("@langchain/google-genai");'
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_GOOGLE_FOLLOWUP_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: Google follow-up generation is outside the governed I10 runtime.
const google_genai_1 = { ChatGoogleGenerativeAI: class { constructor() { throw new Error('I10_FLOWISE_GOOGLE_FOLLOWUP_DISABLED'); } } };`)
  }
  if (patch.type === 'disableCommunityLunary') {
    const requireLine = 'const lunary_2 = require("@langchain/community/callbacks/handlers/lunary");'
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_COMMUNITY_LUNARY_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: community Lunary callbacks are outside the governed I10 runtime.
const lunary_2 = { LunaryHandler: class { constructor() { throw new Error('I10_FLOWISE_COMMUNITY_LUNARY_DISABLED'); } } };`)
  }
  if (patch.type === 'disableFullDocumentUpload') {
    const fileLoaderSpecifier = patch.file === 'dist/src/utils.js'
      ? '../nodes/documentloaders/File/File'
      : '../../nodes/documentloaders/File/File'
    const requireLine = `                        const fileLoaderNodeModule = await Promise.resolve().then(() => __importStar(require('${fileLoaderSpecifier}')));`
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_DOCUMENT_UPLOAD_PATCH_POINT_MISSING')
    return source.replace(requireLine, `                        // ${patch.marker}: full document ingestion is outside the governed I10 runtime.
                        const fileLoaderNodeModule = (() => { throw new Error('I10_FLOWISE_FULL_DOCUMENT_UPLOAD_DISABLED'); })();`)
  }
  if (patch.type === 'localOnlyStorageFactory') {
    const cloudRequires = `const S3StorageProvider_1 = require("./S3StorageProvider");
const GCSStorageProvider_1 = require("./GCSStorageProvider");
const AzureBlobStorageProvider_1 = require("./AzureBlobStorageProvider");`
    if (!source.includes(cloudRequires)) fail('I10_FLOWISE_FORK_STORAGE_FACTORY_PATCH_POINT_MISSING')
    return source.replace(cloudRequires, `// ${patch.marker}: only local storage is permitted in the governed I10 runtime.
const disabledStorageProvider = (name) => class { constructor() { throw new Error(\`I10_FLOWISE_STORAGE_PROVIDER_DISABLED:\${name}\`); } };
const S3StorageProvider_1 = { S3StorageProvider: disabledStorageProvider('s3') };
const GCSStorageProvider_1 = { GCSStorageProvider: disabledStorageProvider('gcs') };
const AzureBlobStorageProvider_1 = { AzureBlobStorageProvider: disabledStorageProvider('azure') };`)
  }
  if (patch.type === 'localOnlyStorageExports') {
    const cloudExports = `var S3StorageProvider_1 = require("./S3StorageProvider");
Object.defineProperty(exports, "S3StorageProvider", { enumerable: true, get: function () { return S3StorageProvider_1.S3StorageProvider; } });
var GCSStorageProvider_1 = require("./GCSStorageProvider");
Object.defineProperty(exports, "GCSStorageProvider", { enumerable: true, get: function () { return GCSStorageProvider_1.GCSStorageProvider; } });
var AzureBlobStorageProvider_1 = require("./AzureBlobStorageProvider");
Object.defineProperty(exports, "AzureBlobStorageProvider", { enumerable: true, get: function () { return AzureBlobStorageProvider_1.AzureBlobStorageProvider; } });`
    if (!source.includes(cloudExports)) fail('I10_FLOWISE_FORK_STORAGE_EXPORT_PATCH_POINT_MISSING')
    return source.replace(cloudExports, `// ${patch.marker}: cloud storage exports fail closed in the governed I10 runtime.
const disabledStorageProvider = (name) => class { constructor() { throw new Error(\`I10_FLOWISE_STORAGE_PROVIDER_DISABLED:\${name}\`); } };
const S3StorageProvider_1 = { S3StorageProvider: disabledStorageProvider('s3') };
Object.defineProperty(exports, "S3StorageProvider", { enumerable: true, get: function () { return S3StorageProvider_1.S3StorageProvider; } });
const GCSStorageProvider_1 = { GCSStorageProvider: disabledStorageProvider('gcs') };
Object.defineProperty(exports, "GCSStorageProvider", { enumerable: true, get: function () { return GCSStorageProvider_1.GCSStorageProvider; } });
const AzureBlobStorageProvider_1 = { AzureBlobStorageProvider: disabledStorageProvider('azure') };
Object.defineProperty(exports, "AzureBlobStorageProvider", { enumerable: true, get: function () { return AzureBlobStorageProvider_1.AzureBlobStorageProvider; } });`)
  }
  if (patch.type === 'disableExternalAnalytics') {
    const langsmithLine = 'const langsmith_1 = require("langsmith");'
    const langfuseLangchainLine = 'const langfuse_langchain_1 = __importDefault(require("langfuse-langchain"));'
    const langsmithSecondLine = 'const langsmith_2 = require("langsmith");'
    const langfuseLine = 'const langfuse_1 = require("langfuse");'
    const sdkTraceNodeLine = 'const sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");'
    const langwatchLine = 'const langwatch_1 = require("langwatch");'
    for (const point of [langsmithLine, langfuseLangchainLine, langsmithSecondLine, langfuseLine, sdkTraceNodeLine, langwatchLine]) {
      if (!source.includes(point)) fail('I10_FLOWISE_FORK_EXTERNAL_ANALYTICS_PATCH_POINT_MISSING', point)
    }
    return source
      .replace(langsmithLine, `// ${patch.marker}: networked analytics providers are outside the governed I10 runtime.
const disabledAnalyticsProvider = (name) => class { constructor() { throw new Error(\`I10_FLOWISE_ANALYTICS_PROVIDER_DISABLED:\${name}\`); } };
const langsmith_1 = { Client: disabledAnalyticsProvider('langsmith') };`)
      .replace(langfuseLangchainLine, "const langfuse_langchain_1 = { default: disabledAnalyticsProvider('langfuse-langchain') };")
      .replace(langsmithSecondLine, "const langsmith_2 = { Client: disabledAnalyticsProvider('langsmith'), RunTree: disabledAnalyticsProvider('langsmith') };")
      .replace(langfuseLine, "const langfuse_1 = { Langfuse: disabledAnalyticsProvider('langfuse') };")
      .replace(sdkTraceNodeLine, "const sdk_trace_node_1 = { NodeTracerProvider: disabledAnalyticsProvider('opentelemetry') };")
      .replace(langwatchLine, "const langwatch_1 = { LangWatch: disabledAnalyticsProvider('langwatch'), autoconvertTypedValues: () => { throw new Error('I10_FLOWISE_ANALYTICS_PROVIDER_DISABLED:langwatch'); } };")
  }
  fail('I10_FLOWISE_FORK_CONTROLLED_PATCH_TYPE_INVALID', patch.type)
}

function patchServerSource(source, patch) {
  if (patch.type === 'disableLegacyAgentGraph') {
    const requireLine = 'const buildAgentGraph_1 = require("./buildAgentGraph");'
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_LEGACY_AGENT_GRAPH_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: legacy MULTIAGENT execution is outside the governed AGENTFLOW V2 runtime.
const buildAgentGraph_1 = { buildAgentGraph: async () => { throw new Error('I10_FLOWISE_LEGACY_AGENT_GRAPH_DISABLED'); } };`)
  }
  if (patch.type === 'disableGeoIpTelemetry') {
    const requireLine = 'const geoip_lite_1 = __importDefault(require("geoip-lite"));'
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_GEOIP_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: GeoIP telemetry is outside the governed I10 runtime.
const geoip_lite_1 = { default: { lookup: () => null } };`)
  }
  if (patch.type === 'disableSmtp') {
    const requireLine = 'const nodemailer_1 = __importDefault(require("nodemailer"));'
    if (!source.includes(requireLine)) fail('I10_FLOWISE_FORK_SMTP_PATCH_POINT_MISSING')
    return source.replace(requireLine, `// ${patch.marker}: SMTP is outside the governed local I10 runtime.
const nodemailer_1 = { default: { createTransport: () => ({ sendMail: async () => { throw new Error('I10_FLOWISE_SMTP_DISABLED'); } }) } };`)
  }
  if (patch.type !== 'guardNodeFileLoad') fail('I10_FLOWISE_FORK_SERVER_PATCH_TYPE_INVALID', patch.type)
  const policyPoint = `        const disabled_nodes = process.env.DISABLED_NODES ? process.env.DISABLED_NODES.split(',') : [];
        const nodes = {};`
  const loadPoint = `            if (file.endsWith('.js')) {
                try {`
  if (!source.includes(policyPoint) || !source.includes(loadPoint)) fail('I10_FLOWISE_FORK_NODE_GUARD_PATCH_POINT_MISSING')
  return source.replace(policyPoint, `        // ${patch.marker}: filter governed file paths before require() executes module top-level code.
        const allowed_node_files = process.env.HENGZHUN_FLOWISE_ALLOWED_NODE_FILES
            ? process.env.HENGZHUN_FLOWISE_ALLOWED_NODE_FILES.split(';').map((value) => value.replace(/\\\\/g, '/'))
            : [];
        if (allowed_node_files.length === 0)
            throw new Error('I10_FLOWISE_ALLOWED_NODE_FILES_MISSING');
        const disabled_nodes = process.env.DISABLED_NODES ? process.env.DISABLED_NODES.split(',') : [];
        const nodes = {};`)
    .replace(loadPoint, `            if (file.endsWith('.js')) {
                const normalized = file.replace(/\\\\/g, '/');
                const marker = '/dist/nodes/';
                const markerIndex = normalized.lastIndexOf(marker);
                const relative = markerIndex >= 0 ? 'dist/nodes/' + normalized.slice(markerIndex + marker.length) : '';
                if (!allowed_node_files.includes(relative))
                    return;
                try {`)
}

function applyPatchSet(packageRoot, patches, patcher) {
  const backups = []
  for (const patch of patches || []) {
    const target = assertInside(packageRoot, path.join(packageRoot, ...posix(patch.file).split('/')))
    if (!fs.existsSync(target)) fail('I10_FLOWISE_FORK_CONTROLLED_PATCH_FILE_MISSING', patch.file)
    const source = fs.readFileSync(target, 'utf8')
    if (source.includes(patch.marker)) continue
    if (sha256(Buffer.from(source, 'utf8')) !== patch.upstreamSha256) fail('I10_FLOWISE_FORK_CONTROLLED_PATCH_UPSTREAM_DRIFT', patch.file)
    const patched = patcher(source, patch)
    if (!patched.includes(patch.marker)) fail('I10_FLOWISE_FORK_CONTROLLED_PATCH_MARKER_MISSING', patch.file)
    backups.push({ target, source })
    fs.writeFileSync(target, patched, 'utf8')
  }
  return backups
}

function applyControlledSourcePatches(componentsRoot, policy) {
  return applyPatchSet(componentsRoot, policy.controlledSourcePatches, patchControlledSource)
}

function assertControlledSourcePatches(componentsRoot, policy) {
  for (const patch of policy.controlledSourcePatches || []) {
    const target = assertInside(componentsRoot, path.join(componentsRoot, ...posix(patch.file).split('/')))
    if (!fs.existsSync(target) || !fs.readFileSync(target, 'utf8').includes(patch.marker)) fail('I10_FLOWISE_FORK_CONTROLLED_PATCH_MISSING', patch.file)
  }
}

function assertPatchSet(packageRoot, patches) {
  for (const patch of patches || []) {
    const target = assertInside(packageRoot, path.join(packageRoot, ...posix(patch.file).split('/')))
    if (!fs.existsSync(target) || !fs.readFileSync(target, 'utf8').includes(patch.marker)) fail('I10_FLOWISE_FORK_CONTROLLED_PATCH_MISSING', patch.file)
  }
}

function executableFiles(directory, predicate) {
  const output = []
  if (!fs.existsSync(directory)) return output
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && predicate(entry.name)) output.push(absolute)
    }
  }
  visit(directory)
  return output
}

function packageOccurrences(acquisition, packageNames) {
  const wanted = new Set(packageNames)
  const output = []
  for (const entryPath of Object.keys(acquisition.lock.packages || {})) {
    const packageName = packageNameFromLockPath(entryPath)
    if (!wanted.has(packageName)) continue
    const absolute = path.join(acquisition.appRoot, ...posix(entryPath).split('/'))
    if (fs.existsSync(absolute)) output.push(path.resolve(absolute))
  }
  return [...new Set(output)].sort((a, b) => a.length - b.length).filter((candidate, index, all) => !all.slice(0, index).some(parent => {
    const relative = path.relative(parent, candidate)
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
  }))
}

function governedPruneTargets(acquisition, acquisitionPolicy) {
  const output = []
  for (const entry of acquisitionPolicy.prunedGovernedPackagePaths || []) {
    const absolute = assertInside(acquisition.nodeModules, path.join(acquisition.nodeModules, ...posix(entry.path).split('/')))
    if (!fs.existsSync(absolute)) continue
    const packageJson = path.join(absolute, 'package.json')
    if (!fs.existsSync(packageJson)) fail('I10_FLOWISE_GOVERNED_PRUNE_METADATA_MISSING', entry.path)
    const metadata = readJson(packageJson)
    if (metadata.name !== entry.name || metadata.version !== entry.version || sha256(fs.readFileSync(packageJson)) !== entry.packageJsonSha256) {
      fail('I10_FLOWISE_GOVERNED_PRUNE_IDENTITY_DRIFT', entry.path)
    }
    output.push(absolute)
  }
  return output
}

function runtimeMutationTargets(acquisition, closure, policy, acquisitionPolicy) {
  const retained = new Set(closure.files)
  const nodesRoot = path.join(acquisition.componentsRoot, 'dist', 'nodes')
  const credentialsRoot = path.join(acquisition.componentsRoot, 'dist', 'credentials')
  const targets = [
    ...executableFiles(nodesRoot, name => /\.(?:js|cjs|mjs)$/i.test(name))
      .filter(file => !retained.has(posix(path.relative(acquisition.componentsRoot, file)))),
    ...executableFiles(credentialsRoot, name => /\.credential\.(?:js|cjs|mjs)$/i.test(name))
      .filter(file => !retained.has(posix(path.relative(acquisition.componentsRoot, file)))),
    ...packageOccurrences(acquisition, policy.removedPackages || []),
    ...governedPruneTargets(acquisition, acquisitionPolicy)
  ]
  return [...new Set(targets.map(target => path.resolve(target)))].sort((a, b) => b.length - a.length)
}

function resolveInstalledPackageJson(appRoot, componentsRoot, name) {
  let current = componentsRoot
  while (true) {
    const candidate = path.join(current, 'node_modules', ...name.split('/'), 'package.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current || !path.resolve(parent).startsWith(path.resolve(appRoot))) break
    current = parent
  }
  fail('I10_FLOWISE_FORK_EXTERNAL_PACKAGE_UNRESOLVED', name)
}

function physicalPackageInventory(nodeModules) {
  const packages = []
  const visit = directory => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const absolute = path.join(directory, entry.name)
      if (entry.name.startsWith('@')) {
        visit(absolute)
        continue
      }
      const packageJson = path.join(absolute, 'package.json')
      if (!fs.existsSync(packageJson)) continue
      const metadata = readJson(packageJson)
      if (metadata.name && metadata.version) packages.push({
        path: posix(path.relative(nodeModules, absolute)),
        name: metadata.name,
        version: metadata.version,
        license: typeof metadata.license === 'string' ? metadata.license : 'NOASSERTION',
        packageJsonSha256: sha256(fs.readFileSync(packageJson))
      })
      visit(path.join(absolute, 'node_modules'))
    }
  }
  visit(nodeModules)
  return packages.sort((left, right) => left.path.localeCompare(right.path, 'en'))
}

function manifestFor(appRoot, acquisition, closure, policy, policyPath, acquisitionPolicy, acquisitionPolicyPath) {
  const componentsRoot = acquisition.componentsRoot
  const retainedFiles = Object.fromEntries(closure.files.map(relative => {
    const absolute = path.join(componentsRoot, ...relative.split('/'))
    return [relative, { sha256: sha256(fs.readFileSync(absolute)), byteLength: fs.statSync(absolute).size }]
  }))
  const reachableWithPaths = [...new Set(closure.externalPackages)].map(name => {
    const packagePath = resolveInstalledPackageJson(appRoot, componentsRoot, name)
    const metadata = readJson(packagePath)
    return { name, version: metadata.version, packageJsonSha256: sha256(fs.readFileSync(packagePath)), packagePath, peerDependencies: metadata.peerDependencies || {}, peerDependenciesMeta: metadata.peerDependenciesMeta || {} }
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const semver = createRequire(path.join(appRoot, 'package.json'))('semver')
  const peerIssues = []
  for (const item of reachableWithPaths) {
    for (const [peerName, range] of Object.entries(item.peerDependencies)) {
      let peerPath = ''
      try { peerPath = resolveInstalledPackageJson(appRoot, path.dirname(item.packagePath), peerName) } catch (error) {
        if (item.peerDependenciesMeta?.[peerName]?.optional) continue
        peerIssues.push({ package: item.name, peer: peerName, range, actual: 'MISSING' })
        continue
      }
      const actual = readJson(peerPath).version
      if (!semver.satisfies(actual, range, { includePrerelease: true }) && !item.peerDependenciesMeta?.[peerName]?.optional) peerIssues.push({ package: item.name, peer: peerName, range, actual })
    }
  }
  const reachablePackages = reachableWithPaths.map(({ packagePath, peerDependencies, peerDependenciesMeta, ...item }) => item)
  const serverClosure = staticPackageClosure(acquisition.flowiseRoot, policy.serverEntries || [])
  const serverPackageNames = [...new Set([...serverClosure.externalPackages, ...(policy.serverRuntimePackageAllowlist || [])])].sort((a, b) => a.localeCompare(b, 'en'))
  const serverReachablePackages = serverPackageNames.map(name => {
    const packagePath = resolveInstalledPackageJson(appRoot, acquisition.flowiseRoot, name)
    const metadata = readJson(packagePath)
    return { name, version: metadata.version, packageJsonSha256: sha256(fs.readFileSync(packagePath)) }
  })
  const serverRetainedFiles = Object.fromEntries(serverClosure.files.map(relative => {
    const absolute = path.join(acquisition.flowiseRoot, ...relative.split('/'))
    return [relative, { sha256: sha256(fs.readFileSync(absolute)), byteLength: fs.statSync(absolute).size }]
  }))
  const packages = physicalPackageInventory(acquisition.nodeModules)
  const serverFiles = Object.fromEntries((policy.serverControlledSourcePatches || []).map(patch => {
    const absolute = path.join(acquisition.flowiseRoot, ...posix(patch.file).split('/'))
    return [patch.file, { sha256: sha256(fs.readFileSync(absolute)), byteLength: fs.statSync(absolute).size }]
  }))
  return {
    schemaVersion: 'hengzhun-i10-flowise-runtime-fork-manifest-v1',
    policySha256: sha256(fs.readFileSync(policyPath)),
    acquisitionPolicySha256: sha256(fs.readFileSync(acquisitionPolicyPath)),
    acquisitionLockSha256: acquisition.acquisitionLockSha256,
    upstream: policy.upstream,
    allowedNodeNames: policy.allowedNodeNames,
    allowedCredentialNames: policy.allowedCredentialNames,
    removedPackages: policy.removedPackages,
    criticalRemovedPackages: policy.criticalRemovedPackages,
    prunedGovernedPackagePaths: acquisitionPolicy.prunedGovernedPackagePaths,
    retainedFiles,
    serverFiles,
    reachablePackages,
    serverReachablePackages,
    serverRetainedFiles,
    reachablePeerIssues: peerIssues,
    packages,
    closureHash: canonicalHash({ retainedFiles, serverFiles, reachablePackages, serverReachablePackages, serverRetainedFiles, peerIssues, packages })
  }
}

function verifyRuntimeFork(options = {}) {
  const appRoot = path.resolve(options.appRoot || defaultAppRoot)
  const policyPath = path.resolve(options.policyPath || defaultPolicyPath)
  const acquisitionPolicyPath = path.resolve(options.acquisitionPolicyPath || defaultAcquisitionPolicyPath)
  const policy = readJson(policyPath)
  const acquisitionPolicy = readJson(acquisitionPolicyPath)
  const acquisition = verifyAcquisition(appRoot, policy)
  const markerPath = path.join(acquisition.nodeModules, markerName)
  if (!fs.existsSync(markerPath)) fail('I10_FLOWISE_FORK_MANIFEST_MISSING')
  const recorded = readJson(markerPath)
  assertControlledSourcePatches(acquisition.componentsRoot, policy)
  assertPatchSet(acquisition.flowiseRoot, policy.serverControlledSourcePatches)
  const closure = componentClosure(acquisition.componentsRoot, policy)
  const expected = manifestFor(appRoot, acquisition, closure, policy, policyPath, acquisitionPolicy, acquisitionPolicyPath)
  if (canonicalHash(recorded) !== canonicalHash(expected)) fail('I10_FLOWISE_FORK_MANIFEST_DRIFT')
  const allowedNodeFiles = new Set(closure.files.filter(file => file.startsWith('dist/nodes/') && /\.(?:js|cjs|mjs)$/i.test(file)))
  const actualNodeFiles = new Set(executableFiles(path.join(acquisition.componentsRoot, 'dist', 'nodes'), name => /\.(?:js|cjs|mjs)$/i.test(name)).map(file => posix(path.relative(acquisition.componentsRoot, file))))
  if (canonicalHash([...actualNodeFiles].sort()) !== canonicalHash([...allowedNodeFiles].sort())) fail('I10_FLOWISE_FORK_NODE_FILE_SET_DRIFT')
  const allowedCredentials = new Set(policy.allowedCredentialEntries)
  const actualCredentials = new Set(executableFiles(path.join(acquisition.componentsRoot, 'dist', 'credentials'), name => /\.credential\.(?:js|cjs|mjs)$/i.test(name)).map(file => posix(path.relative(acquisition.componentsRoot, file))))
  if (canonicalHash([...actualCredentials].sort()) !== canonicalHash([...allowedCredentials].sort())) fail('I10_FLOWISE_FORK_CREDENTIAL_FILE_SET_DRIFT')
  for (const name of policy.removedPackages || []) {
    if (packageOccurrences(acquisition, [name]).length) fail('I10_FLOWISE_FORK_REMOVED_PACKAGE_PRESENT', name)
    if (closure.externalPackages.includes(name)) fail('I10_FLOWISE_FORK_REMOVED_PACKAGE_REACHABLE', name)
  }
  for (const entry of acquisitionPolicy.prunedGovernedPackagePaths || []) {
    if (fs.existsSync(path.join(acquisition.nodeModules, ...posix(entry.path).split('/')))) fail('I10_FLOWISE_GOVERNED_PRUNE_PATH_PRESENT', entry.path)
  }
  return Object.freeze({ status: 'READY', appRoot, manifest: Object.freeze(recorded), nodeFileCount: actualNodeFiles.size, credentialFileCount: actualCredentials.size })
}

function applyRuntimeFork(options = {}) {
  const appRoot = path.resolve(options.appRoot || defaultAppRoot)
  const policyPath = path.resolve(options.policyPath || defaultPolicyPath)
  const acquisitionPolicyPath = path.resolve(options.acquisitionPolicyPath || defaultAcquisitionPolicyPath)
  try { return { ...verifyRuntimeFork({ appRoot, policyPath, acquisitionPolicyPath }), applied: false } } catch (error) {
    const reconcilable = new Set([
      'I10_FLOWISE_FORK_MANIFEST_MISSING',
      'I10_FLOWISE_FORK_MANIFEST_DRIFT',
      'I10_FLOWISE_FORK_CONTROLLED_PATCH_MISSING',
      'I10_FLOWISE_FORK_NODE_FILE_SET_DRIFT',
      'I10_FLOWISE_FORK_CREDENTIAL_FILE_SET_DRIFT',
      'I10_FLOWISE_FORK_REMOVED_PACKAGE_PRESENT'
      , 'I10_FLOWISE_GOVERNED_PRUNE_PATH_PRESENT'
    ])
    if (!reconcilable.has(error.code)) throw error
  }
  const policy = readJson(policyPath)
  const acquisitionPolicy = readJson(acquisitionPolicyPath)
  const acquisition = verifyAcquisition(appRoot, policy)
  assertOverlayMarkers(acquisition.componentsRoot, policy)
  const patchBackups = [
    ...applyControlledSourcePatches(acquisition.componentsRoot, policy),
    ...applyPatchSet(acquisition.flowiseRoot, policy.serverControlledSourcePatches, patchServerSource)
  ]
  let closure
  let targets
  try {
    closure = componentClosure(acquisition.componentsRoot, policy)
    const removed = new Set(policy.removedPackages || [])
    const reachableRemoved = closure.externalPackages.filter(name => removed.has(name))
    if (reachableRemoved.length) fail('I10_FLOWISE_FORK_REMOVED_PACKAGE_REACHABLE', reachableRemoved.join(','))
    targets = runtimeMutationTargets(acquisition, closure, policy, acquisitionPolicy)
  } catch (error) {
    for (const backup of patchBackups) fs.writeFileSync(backup.target, backup.source, 'utf8')
    throw error
  }
  const staging = path.join(acquisition.nodeModules, `.hengzhun-fork-staging-${process.pid}`)
  if (fs.existsSync(staging)) fail('I10_FLOWISE_FORK_STAGING_EXISTS', staging)
  fs.mkdirSync(staging)
  const moved = []
  const markerPath = path.join(acquisition.nodeModules, markerName)
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const source = targets[index]
      if (!fs.existsSync(source)) continue
      const destination = path.join(staging, String(index))
      fs.renameSync(source, destination)
      moved.push({ source, destination })
    }
    const manifest = manifestFor(appRoot, acquisition, closure, policy, policyPath, acquisitionPolicy, acquisitionPolicyPath)
    fs.writeFileSync(markerPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    const verified = verifyRuntimeFork({ appRoot, policyPath, acquisitionPolicyPath })
    fs.rmSync(staging, { recursive: true, force: true })
    return { ...verified, applied: true, removedEntryCount: moved.length }
  } catch (error) {
    if (fs.existsSync(markerPath)) fs.rmSync(markerPath, { force: true })
    for (const item of moved.reverse()) {
      fs.mkdirSync(path.dirname(item.source), { recursive: true })
      if (fs.existsSync(item.destination)) fs.renameSync(item.destination, item.source)
    }
    for (const backup of patchBackups) fs.writeFileSync(backup.target, backup.source, 'utf8')
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

module.exports = {
  applyRuntimeFork,
  componentClosure,
  verifyAcquisition,
  verifyRuntimeFork
}

if (require.main === module) {
  const command = process.argv[2] || 'check'
  const appRootIndex = process.argv.indexOf('--app-root')
  const policyIndex = process.argv.indexOf('--policy')
  const acquisitionPolicyIndex = process.argv.indexOf('--acquisition-policy')
  const options = {
    appRoot: appRootIndex >= 0 ? process.argv[appRootIndex + 1] : defaultAppRoot,
    policyPath: policyIndex >= 0 ? process.argv[policyIndex + 1] : defaultPolicyPath,
    acquisitionPolicyPath: acquisitionPolicyIndex >= 0 ? process.argv[acquisitionPolicyIndex + 1] : defaultAcquisitionPolicyPath
  }
  const result = command === 'apply' ? applyRuntimeFork(options) : command === 'check' ? verifyRuntimeFork(options) : fail('I10_FLOWISE_FORK_COMMAND_INVALID', command)
  process.stdout.write(`${JSON.stringify({
    schemaVersion: result.manifest.schemaVersion,
    status: result.status,
    applied: Boolean(result.applied),
    closureHash: result.manifest.closureHash,
    nodeFileCount: result.nodeFileCount,
    credentialFileCount: result.credentialFileCount,
    removedPackages: result.manifest.removedPackages
  }, null, 2)}\n`)
}
