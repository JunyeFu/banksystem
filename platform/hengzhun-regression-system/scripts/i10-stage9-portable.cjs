#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { ProgressReporter, enabledFromEnvironment } = require('./progress.cjs')
const { RecoveryStore, fingerprint } = require('./recovery.cjs')
const { verifyRuntimeFork } = require('./i10-build-flowise-runtime-fork.cjs')

const posix = value => value.split(path.sep).join('/')
const productRoot = path.resolve(__dirname, '..')
const repositoryContext = discoverRepositoryContext(productRoot)
const repoRoot = repositoryContext.repoRoot
const releaseRoot = path.join(productRoot, '.release')
const productRepoPath = repositoryContext.productRepoPath
const policyPath = path.join(productRoot, 'flowise', 'i10', 's9-portability-policy-v1.json')
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))

const sha256Buffer = value => crypto.createHash('sha256').update(value).digest('hex')
const sha256File = file => sha256Buffer(fs.readFileSync(file))

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options })
  if (result.error) throw result.error
  return result
}

function discoverRepositoryContext(targetProductRoot, options = {}) {
  const resolvedProductRoot = fs.realpathSync.native(path.resolve(targetProductRoot))
  const runCommand = options.run || run
  const result = runCommand('git.exe', ['-C', resolvedProductRoot, 'rev-parse', '--show-toplevel'])
  assert.equal(result.status, 0, String(result.stderr || result.stdout || 'I10_S9_GIT_ROOT_DISCOVERY_FAILED').trim())
  const discoveredRoot = fs.realpathSync.native(path.resolve(String(result.stdout || '').trim()))
  const relative = path.relative(discoveredRoot, resolvedProductRoot)
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `I10_S9_PRODUCT_OUTSIDE_GIT_ROOT:${resolvedProductRoot}`)
  return Object.freeze({
    repoRoot: discoveredRoot,
    productRoot: resolvedProductRoot,
    productRepoPath: posix(relative)
  })
}

function git(args, context = repositoryContext, options = {}) {
  const result = run('git.exe', ['-C', context.repoRoot, ...args])
  assert.equal(result.status, 0, String(result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim())
  const output = String(result.stdout || '')
  return options.raw === true ? output : output.trim()
}

function currentCommit() {
  const commit = git(['rev-parse', 'HEAD'])
  assert.match(commit, /^[0-9a-f]{40}$/)
  return commit
}

function sourceStatus() {
  const output = git(['status', '--porcelain=v1', '--untracked-files=all', '--', productRepoPath || '.'])
  return output ? output.split(/\r?\n/).filter(Boolean) : []
}

function assertSourceFrozen() {
  const dirty = sourceStatus()
  assert.deepEqual(dirty, [], `I10_S9_SOURCE_NOT_FROZEN:${dirty.slice(0, 20).join('|')}`)
}

function worktreeFilesFor(entries, context = repositoryContext) {
  const prefix = context.productRepoPath ? `${context.productRepoPath}/` : ''
  const repoEntries = entries.map(entry => `${prefix}${posix(entry)}`)
  const output = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...repoEntries], context, { raw: true })
  return output ? output.split('\0').filter(Boolean) : []
}

function governedWorktreeFiles() {
  const files = portableWorktreeFiles()
  const prefix = productRepoPath ? `${productRepoPath}/` : ''
  const required = policy.trackedFiles.map(item => `${prefix}${item}`)
  for (const repoFile of required) assert.ok(files.includes(repoFile), `I10_S9_SOURCE_FILE_MISSING:${repoFile}`)
  return files
}

function portableWorktreeFiles(context = repositoryContext, sourcePolicy = policy) {
  const prefixLength = context.productRepoPath ? context.productRepoPath.length + 1 : 0
  const forbiddenTopLevels = new Set(sourcePolicy.forbiddenPathSegments.map(value => String(value).toLowerCase()))
  return worktreeFilesFor(['.'], context).filter(repoFile => {
    const relative = repoFile.slice(prefixLength)
    const top = relative.toLowerCase().split('/')[0]
    if (top === '.release' || top.startsWith('.i10-stage9-staging-') || forbiddenTopLevels.has(top)) return false
    return !sourcePolicy.forbiddenFilePatterns.some(pattern => matchesGlobName(path.basename(relative), pattern))
  })
}

function contentSnapshot(baseRoot, relativeFiles) {
  const files = [...relativeFiles].map(posix).sort((left, right) => left.localeCompare(right, 'en'))
  const aggregate = crypto.createHash('sha256')
  for (const relative of files) {
    const absolute = path.resolve(baseRoot, ...relative.split('/'))
    const boundary = path.relative(baseRoot, absolute)
    assert.ok(boundary && !boundary.startsWith('..') && !path.isAbsolute(boundary), `I10_S9_SOURCE_PATH_INVALID:${relative}`)
    aggregate.update(relative, 'utf8').update('\0').update(fs.readFileSync(absolute)).update('\0')
  }
  return Object.freeze({ files: Object.freeze(files), fileCount: files.length, sha256: aggregate.digest('hex') })
}

function worktreeContentSnapshot(context = repositoryContext, sourcePolicy = policy) {
  const prefixLength = context.productRepoPath ? context.productRepoPath.length + 1 : 0
  const repoFiles = portableWorktreeFiles(context, sourcePolicy)
  const relativeFiles = repoFiles.map(repoFile => repoFile.slice(prefixLength))
  const snapshot = contentSnapshot(context.productRoot, relativeFiles)
  return Object.freeze({ ...snapshot, repoFiles: Object.freeze(repoFiles) })
}

function governedWorktreeSnapshot() {
  const files = governedWorktreeFiles()
  const prefixLength = productRepoPath ? productRepoPath.length + 1 : 0
  const relativeFiles = files.map(repoFile => repoFile.slice(prefixLength))
  return Object.freeze({ ...contentSnapshot(productRoot, relativeFiles), repoFiles: Object.freeze(files) })
}

function assertSourceSnapshotCurrent(sourceCommit, expectedSnapshot) {
  assertSourceFrozen()
  assert.equal(currentCommit(), sourceCommit, 'I10_S9_HEAD_CHANGED_DURING_PACKAGE')
  const currentSnapshot = governedWorktreeSnapshot()
  assert.deepEqual(currentSnapshot.files, expectedSnapshot.files, 'I10_S9_SOURCE_FILE_SET_CHANGED_DURING_PACKAGE')
  assert.equal(currentSnapshot.sha256, expectedSnapshot.sha256, 'I10_S9_SOURCE_CONTENT_CHANGED_DURING_PACKAGE')
}

function copyWorktree(candidateRoot, snapshot = governedWorktreeSnapshot()) {
  for (const relative of snapshot.files) {
    const source = path.join(productRoot, ...relative.split('/'))
    const destination = path.join(candidateRoot, ...relative.split('/'))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
  const copiedSnapshot = contentSnapshot(candidateRoot, snapshot.files)
  assert.equal(copiedSnapshot.sha256, snapshot.sha256, 'I10_S9_SOURCE_CHANGED_DURING_COPY')
  return snapshot
}

function copyRuntimeTree(relative, candidateRoot) {
  const source = path.join(productRoot, ...relative.split('/'))
  const destination = path.join(candidateRoot, ...relative.split('/'))
  assert.ok(fs.existsSync(source), `I10_S9_RUNTIME_TREE_MISSING:${relative}`)
  fs.mkdirSync(destination, { recursive: true })
  const result = run('robocopy.exe', [source, destination, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:1', '/W:1', '/XJ', '/MT:16', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XF', '.env', '.env.*', '*.log', '*.pid'])
  assert.ok(result.status >= 0 && result.status <= 7, `I10_S9_RUNTIME_COPY_FAILED:${relative}:${result.status}`)
}

function listFiles(root, options = {}) {
  const files = []
  // Source-control/editor metadata belongs to the local development checkout,
  // not to the portable payload. It must not influence package verification.
  // These directories are development or execution by-products.  They are
  // neither portable payload nor governed source: `.data` holds mutable
  // state, and `midscene_run` is created by the visual runtime for local
  // reports/logs.  Treat both consistently so a completed browser run cannot
  // make VERIFY reject the package itself.
  const ignoredDirectoryNames = new Set(['.git', '.idea', '.data', 'midscene_run'])
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolute = path.join(directory, entry.name)
      const relative = posix(path.relative(root, absolute))
      if (entry.isSymbolicLink()) throw new Error(`I10_S9_UNSUPPORTED_LINK:${posix(path.relative(root, absolute))}`)
      if (entry.isDirectory()) {
        if (ignoredDirectoryNames.has(entry.name.toLowerCase())) continue
        if (typeof options.skipDirectory === 'function' && options.skipDirectory(relative)) continue
        visit(absolute)
      }
      else if (entry.isFile()) files.push(absolute)
      else throw new Error(`I10_S9_UNSUPPORTED_FILESYSTEM_ENTRY:${posix(path.relative(root, absolute))}`)
    }
  }
  visit(root)
  return files
}

function under(relative, prefix) {
  return relative === prefix || relative.startsWith(`${prefix}/`)
}

function isMutable(relative) {
  return policy.mutableFilePrefixes.some(prefix => relative.startsWith(prefix))
}

function isRuntimeAsset(relative) {
  return policy.runtimeTrees.some(prefix => under(relative, prefix))
}

function matchesGlobName(name, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}

function forbiddenCoreFindings(candidateRoot, onProgress = null, filesOverride = null) {
  const findings = []
  const secretRegexes = policy.secretContentPatterns.map(pattern => new RegExp(pattern, 'i'))
  const absoluteRegexes = policy.absolutePathPatterns.map(pattern => new RegExp(pattern, 'i'))
  const textExtensions = new Set(['.cjs', '.cmd', '.js', '.json', '.md', '.ps1', '.ts', '.txt', '.yaml', '.yml'])
  const files = filesOverride || listFiles(candidateRoot)
  let completed = 0
  for (const absolute of files) {
    const relative = posix(path.relative(candidateRoot, absolute))
    if (isMutable(relative)) continue
    const top = relative.toLowerCase().split('/')[0]
    if (policy.forbiddenPathSegments.map(value => value.toLowerCase()).includes(top)) findings.push(`FORBIDDEN_TOP_LEVEL:${relative}`)
    const basename = path.basename(relative)
    // Locked runtime trees legitimately contain dependency source files such as
    // useLocalStorageState.js and Playwright's storage-state.md documentation.
    // Runtime trees are copied from pinned assets and verified by aggregate
    // hashes; mutable/user-created state remains forbidden everywhere else.
    if (!isRuntimeAsset(relative) && policy.forbiddenFilePatterns.some(pattern => matchesGlobName(basename, pattern))) findings.push(`FORBIDDEN_FILE:${relative}`)
    if (!isRuntimeAsset(relative) && textExtensions.has(path.extname(relative).toLowerCase()) && fs.statSync(absolute).size <= 4 * 1024 * 1024) {
      const content = fs.readFileSync(absolute, 'utf8')
      if (secretRegexes.some(pattern => pattern.test(content))) findings.push(`SECRET_CONTENT:${relative}`)
      if (absoluteRegexes.some(pattern => pattern.test(content))) findings.push(`ABSOLUTE_PATH:${relative}`)
    }
    completed += 1
    if (onProgress) onProgress(completed, files.length, relative)
  }
  return [...new Set(findings)].sort()
}

function hashTree(root, onProgress = null) {
  const aggregate = crypto.createHash('sha256')
  let totalBytes = 0
  const files = listFiles(root)
  let completed = 0
  for (const absolute of files) {
    const relative = posix(path.relative(root, absolute))
    const size = fs.statSync(absolute).size
    aggregate.update(`${relative}\0${size}\0${sha256File(absolute)}\n`, 'utf8')
    totalBytes += size
    completed += 1
    if (onProgress) onProgress(completed, files.length, relative)
  }
  return { algorithm: 'sha256(sorted-posix-relative-path\\0byte-length\\0file-sha256\\n)', sha256: aggregate.digest('hex'), fileCount: files.length, totalBytes }
}

function fileMetadata(absolute, relative) {
  const stat = fs.statSync(absolute)
  return { relative, size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) }
}

function fileListFingerprint(root, files, onProgress = null, throwIfCancelled = null) {
  const aggregate = crypto.createHash('sha256')
  for (let index = 0; index < files.length; index += 1) {
    if (throwIfCancelled) throwIfCancelled()
    const absolute = files[index]
    const relative = posix(path.relative(root, absolute))
    const metadata = fileMetadata(absolute, relative)
    aggregate.update(`${metadata.relative}\0${metadata.size}\0${metadata.mtimeMs}\n`, 'utf8')
    if (onProgress && ((index + 1) % 5000 === 0 || index + 1 === files.length)) onProgress(index + 1, files.length, relative)
  }
  return aggregate.digest('hex')
}

function readHashJournal(journalPath) {
  if (!fs.existsSync(journalPath)) return []
  const records = []
  for (const line of fs.readFileSync(journalPath, 'utf8').split(/\r?\n/)) {
    if (!line) continue
    try {
      const value = JSON.parse(line)
      if (typeof value.relative !== 'string' || !Number.isFinite(value.size) ||
          !Number.isFinite(value.mtimeMs) || !/^[a-f0-9]{64}$/.test(value.sha256)) break
      records.push(value)
    } catch { break }
  }
  return records
}

function hashTreeResumable(root, journalPath, onProgress = null, throwIfCancelled = null) {
  const aggregate = crypto.createHash('sha256')
  let totalBytes = 0
  const files = listFiles(root)
  const cached = readHashJournal(journalPath)
  const valid = []
  let cacheValid = true
  for (let index = 0; index < files.length; index += 1) {
    if (throwIfCancelled) throwIfCancelled()
    const absolute = files[index]
    const relative = posix(path.relative(root, absolute))
    const metadata = fileMetadata(absolute, relative)
    const previous = cacheValid ? cached[index] : null
    let digest
    if (previous && previous.relative === relative && previous.size === metadata.size && previous.mtimeMs === metadata.mtimeMs) {
      digest = previous.sha256
      valid.push(previous)
    } else {
      cacheValid = false
      digest = sha256File(absolute)
      valid.push({ ...metadata, sha256: digest })
    }
    aggregate.update(`${relative}\0${metadata.size}\0${digest}\n`, 'utf8')
    totalBytes += metadata.size
    if (onProgress) onProgress(index + 1, files.length, relative)
  }
  fs.mkdirSync(path.dirname(journalPath), { recursive: true })
  const temporary = `${journalPath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, valid.map(value => JSON.stringify(value)).join('\n') + (valid.length ? '\n' : ''), 'utf8')
  fs.renameSync(temporary, journalPath)
  return {
    result: { algorithm: 'sha256(sorted-posix-relative-path\\0byte-length\\0file-sha256\\n)', sha256: aggregate.digest('hex'), fileCount: files.length, totalBytes },
    resumedFileCount: Math.min(cached.length, valid.length)
  }
}

function lockComponents(lockFile, scope) {
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
  const components = []
  for (const [entryPath, metadata] of Object.entries(lock.packages || {})) {
    if (!entryPath || !entryPath.includes('node_modules/') || !metadata?.version) continue
    const name = entryPath.slice(entryPath.lastIndexOf('node_modules/') + 13).split('/node_modules/').pop()
    const purl = `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`
    components.push({ type: 'library', 'bom-ref': purl, name, version: metadata.version, scope, license: metadata.license || 'NOASSERTION', purl })
  }
  return components
}

function effectiveFlowiseComponents(candidateRoot) {
  const manifestPath = path.join(candidateRoot, 'flowise', 'app', 'node_modules', '.hengzhun-runtime-fork-v1.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const packages = [
    ...Object.entries(manifest.upstream || {}).map(([name, version]) => ({ name, version })),
    ...(manifest.packages || [])
  ]
  return [...new Map(packages.map(item => [`${item.name}@${item.version}`, item])).values()].map(item => {
    const purl = `pkg:npm/${encodeURIComponent(item.name)}@${item.version}`
    return { type: 'library', 'bom-ref': purl, name: item.name, version: item.version, scope: 'required', license: item.license || 'NOASSERTION', purl }
  })
}

function writeComplianceFiles(candidateRoot, sourceCommit) {
  const components = [
    ...lockComponents(path.join(candidateRoot, 'package-lock.json'), 'required'),
    ...effectiveFlowiseComponents(candidateRoot)
  ]
  const unique = [...new Map(components.map(component => [component['bom-ref'], component])).values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'], 'en'))
  const sbomComponents = unique.map(({ license, ...component }) => ({ ...component, licenses: license === 'NOASSERTION' ? undefined : [{ expression: license }] }))
  const serialSeed = sha256Buffer(Buffer.from(`${sourceCommit}:${policy.candidateName}`, 'utf8')).slice(0, 32)
  const serial = `${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-4${serialSeed.slice(13, 16)}-a${serialSeed.slice(17, 20)}-${serialSeed.slice(20, 32)}`
  writeJson(path.join(candidateRoot, 'manifest', 'cyclonedx-sbom.json'), {
    bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${serial}`, version: 1,
    metadata: { component: { type: 'application', name: 'hengzhun-regression-system', version: '0.1.0', properties: [
      { name: 'hengzhun:sourceCommit', value: sourceCommit },
      { name: 'hengzhun:flowiseAcquisitionLockSha256', value: sha256File(path.join(candidateRoot, 'flowise', 'runtime-package-lock.json')) },
      { name: 'hengzhun:flowiseRuntimeForkManifest', value: 'flowise/app/node_modules/.hengzhun-runtime-fork-v1.json' }
    ] } },
    components: sbomComponents
  })
  writeJson(path.join(candidateRoot, 'manifest', 'licenses.json'), {
    schemaVersion: 'hengzhun-i10-license-inventory-v1', sourceCommit,
    components: unique.map(({ type, scope, ...component }) => component)
  })
  const lines = ['# Third-party license inventory', '', 'This inventory is generated from the locked dependency metadata bundled with this release.', 'Components marked NOASSERTION require review before external redistribution.', '']
  for (const component of unique) lines.push(`- ${component.name}@${component.version}: ${component.license}`)
  fs.writeFileSync(path.join(candidateRoot, 'THIRD-PARTY-NOTICES.md'), `${lines.join('\n')}\n`, 'utf8')
}

function writeGeneratedFiles(candidateRoot, sourceCommit) {
  const wrappers = {
    'PREPARE.cmd': '@echo off\r\ncall "%~dp0scripts\\cmd-entry.cmd" PREPARE %*\r\nexit /b %ERRORLEVEL%\r\n',
    'START.cmd': '@echo off\r\ncall "%~dp0scripts\\cmd-entry.cmd" START %*\r\nexit /b %ERRORLEVEL%\r\n',
    'STATUS.cmd': '@echo off\r\ncall "%~dp0scripts\\cmd-entry.cmd" STATUS %*\r\nexit /b %ERRORLEVEL%\r\n',
    'STOP.cmd': '@echo off\r\ncall "%~dp0scripts\\cmd-entry.cmd" STOP %*\r\nexit /b %ERRORLEVEL%\r\n',
    'VERIFY.cmd': '@echo off\r\ncall "%~dp0scripts\\cmd-entry.cmd" VERIFY %*\r\nexit /b %ERRORLEVEL%\r\n'
  }
  for (const [name, content] of Object.entries(wrappers)) fs.writeFileSync(path.join(candidateRoot, name), content, 'utf8')
  const readmeSource = path.join(root, 'README.md')
  assert.ok(fs.existsSync(readmeSource), 'I10_PORTABLE_README_SOURCE_MISSING')
  const readme = fs.readFileSync(readmeSource, 'utf8')
    .replace(/冻结源提交：`[^`]+`。?\s*$/u, `冻结源提交：\`${sourceCommit}\`。\n`)
  fs.writeFileSync(path.join(candidateRoot, 'README.md'), readme, 'utf8')
  writeJson(path.join(candidateRoot, 'manifest', 'candidate.json'), {
    schemaVersion: 'hengzhun-i10-windows-x64-release-v1', stage: 'I10_S9_PORTABLE_RELEASE', candidateName: policy.candidateName,
    sourceCommit, sourceFrozen: true, platform: policy.platform, portabilityContract: policy.portabilityContract,
    supportedOperatingSystems: policy.supportedOperatingSystems, requiredPathScenarios: policy.requiredPathScenarios,
    bundled: {
      node: '20.20.2',
      flowise: '3.1.4',
      chromium: '1217',
      ffmpeg: true,
      ocr: ['PP-OCRv5-mobile-ONNX-zh-en'],
      legacyVideoOcr: ['chi_sim', 'eng']
    },
    runtimeDataRoot: '.data', modelApiKeysAndBasesBundled: false, fixedLocalPlatformLoginBundled: true, machineSpecificAcceptanceRequired: false
  })
  writeComplianceFiles(candidateRoot, sourceCommit)
}

function buildManifest(candidateRoot, sourceCommit, options = {}) {
  const assets = options.assetsOverride || {}
  if (!options.assetsOverride) {
    for (const relative of policy.runtimeTrees) assets[relative] = hashTree(path.join(candidateRoot, ...relative.split('/')))
  }
  const coreFiles = {}
  const coreCandidates = listFiles(candidateRoot, {
    // Runtime trees are verified independently above. Do not materialize their
    // entire file list only to discard it from the core-file manifest.
    skipDirectory: relative => isMutable(`${relative}/`) || policy.runtimeTrees.some(prefix => under(relative, prefix))
  })
  for (const absolute of coreCandidates) {
    const relative = posix(path.relative(candidateRoot, absolute))
    if (relative === 'manifest/files.sha256.json' || isMutable(relative) || isRuntimeAsset(relative)) continue
    coreFiles[relative] = { sha256: sha256File(absolute), byteLength: fs.statSync(absolute).size }
  }
  // This folder is deliberately usable after a plain copy. Its upstream
  // sourceCommit is frozen at export time; the copied package does not claim
  // a current Git revision or worktree status, because a parent checkout may
  // contain multi-gigabyte bundled assets unrelated to this package.
  const currentPackageRevision = null
  const currentPackageWorktreeState = 'PORTABLE_FOLDER_NOT_A_GIT_AUTHORITY'
  return {
    schemaVersion: 'hengzhun-i10-file-manifest-v1',
    sourceCommit,
    sourceProvenance: {
      frozenUpstreamSourceCommit: sourceCommit,
      currentPackageRevision,
      currentPackageWorktreeState
    },
    algorithm: 'sha256',
    assetHashRefreshMode: options.assetsOverride ? 'PRESERVED_LOCKED_ASSET_BASELINE' : 'FULL_REHASH',
    assets, coreFiles
  }
}

function refreshManifest(candidateRoot, { rehashAssets = false } = {}) {
  const resolved = path.resolve(candidateRoot)
  const manifestPath = path.join(resolved, 'manifest', 'files.sha256.json')
  const candidatePath = path.join(resolved, 'manifest', 'candidate.json')
  let sourceCommit = 'LOCAL_DESKTOP_RELEASE'
  let lockedAssets = null
  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (typeof existing.sourceCommit === 'string' && existing.sourceCommit.trim()) sourceCommit = existing.sourceCommit.trim()
    if (existing.assets && typeof existing.assets === 'object') lockedAssets = existing.assets
  } else if (fs.existsSync(candidatePath)) {
    const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'))
    if (typeof candidate.sourceCommit === 'string' && candidate.sourceCommit.trim()) sourceCommit = candidate.sourceCommit.trim()
  }
  const temporaryPath = `${manifestPath}.tmp`
  // Source-only refreshes preserve the immutable runtime baseline.  A
  // deliberate runtime rebuild (for example TypeScript dist) must opt into a
  // fresh asset digest so VERIFY never relies on a stale locked baseline.
  writeJson(temporaryPath, buildManifest(resolved, sourceCommit, { assetsOverride: rehashAssets ? undefined : lockedAssets || undefined }))
  fs.renameSync(temporaryPath, manifestPath)
  return { status: 'I10_HASH_MANIFEST_REFRESHED', candidate: resolved, sourceCommit }
}

function verifyCandidate(candidateRoot, reporter = null) {
  const resolved = path.resolve(candidateRoot)
  const manifestPath = path.join(resolved, 'manifest', 'files.sha256.json')
  const recovery = new RecoveryStore(resolved, 'VERIFY', 'i10-verify-recovery-v1')
  try {
    reporter?.startStage(1, 5, '加载并校验Hash清单', { heartbeat: false })
    assert.ok(fs.existsSync(manifestPath), 'I10_S9_HASH_MANIFEST_MISSING')
    const manifestDigest = sha256File(manifestPath)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.schemaVersion, 'hengzhun-i10-file-manifest-v1')
    const recoveryStart = recovery.begin(fingerprint({ manifestDigest, resolved, algorithm: manifest.algorithm }))
    reporter?.activity(`${recoveryStart.resumed ? '发现有效断点并自动恢复；' : ''}已加载：核心文件${Object.keys(manifest.coreFiles || {}).length}，运行时资产${Object.keys(manifest.assets || {}).length}`)

    const allFiles = listFiles(resolved)
    const fingerprintFiles = allFiles.filter(absolute => !isMutable(posix(path.relative(resolved, absolute))))
    const listDigest = fileListFingerprint(resolved, fingerprintFiles, (completed, total) => {
      reporter?.activity(`正在建立恢复文件集合指纹：${completed}/${total}`, false)
    }, () => reporter?.throwIfCancelled())
    const coreFiles = allFiles.filter(absolute => {
      const relative = posix(path.relative(resolved, absolute))
      return relative !== 'manifest/files.sha256.json' && !isMutable(relative) && !isRuntimeAsset(relative)
    })
    const previousCore = recovery.state.coreCache || {}
    const actualCore = {}
    reporter?.startStage(2, 5, '核心文件Hash', { completed: 0, total: Object.keys(manifest.coreFiles || {}).length, maxWaitHint: '受磁盘速度影响，可能需要数分钟' })
    let coreCompleted = 0
    for (const absolute of coreFiles) {
      reporter?.throwIfCancelled()
      const relative = posix(path.relative(resolved, absolute))
      const metadata = fileMetadata(absolute, relative)
      const cached = previousCore[relative]
      actualCore[relative] = cached && cached.size === metadata.size && cached.mtimeMs === metadata.mtimeMs
        ? { sha256: cached.sha256, byteLength: metadata.size }
        : { sha256: sha256File(absolute), byteLength: metadata.size }
      coreCompleted += 1
      reporter?.update(coreCompleted, Object.keys(manifest.coreFiles || {}).length, relative)
      if (coreCompleted % 10 === 0 || coreCompleted === coreFiles.length) {
        const coreCache = Object.fromEntries(Object.entries(actualCore).map(([key, value]) => {
          const absolutePath = path.join(resolved, ...key.split('/'))
          const metadataValue = fileMetadata(absolutePath, key)
          return [key, { sha256: value.sha256, size: metadataValue.size, mtimeMs: metadataValue.mtimeMs }]
        }))
        recovery.checkpoint(2, '核心文件Hash', Object.keys(actualCore), { coreCache, listDigest })
      }
    }

    const assetEntries = Object.entries(manifest.assets || {})
    const completedAssets = new Set(recovery.state.completedAssets || [])
    reporter?.startStage(3, 5, '运行时资产Hash', { completed: 0, total: assetEntries.length, maxWaitHint: '受磁盘速度影响，可能需要数分钟' })
    let assetCompleted = 0
    for (const [relative, expected] of assetEntries) {
      reporter?.throwIfCancelled()
      const journalName = `verify-${crypto.createHash('sha256').update(relative).digest('hex').slice(0, 16)}.jsonl`
      const journalPath = path.join(resolved, '.data', 'recovery', journalName)
      const { result: actual, resumedFileCount } = hashTreeResumable(path.join(resolved, ...relative.split('/')), journalPath, (completed, total, file) => {
        reporter?.throwIfCancelled()
        reporter?.activity(`资产${assetCompleted + 1}/${assetEntries.length}：${relative}，内部文件${completed}/${total}，当前${file}`, false)
      }, () => reporter?.throwIfCancelled())
      assert.deepEqual(actual, expected, `I10_S9_ASSET_HASH_MISMATCH:${relative}`)
      completedAssets.add(relative)
      assetCompleted += 1
      recovery.checkpoint(3, '运行时资产Hash', [...completedAssets], { coreCache: recovery.state.coreCache, completedAssets: [...completedAssets], listDigest })
      reporter?.update(assetCompleted, assetEntries.length, `已完成${relative}${resumedFileCount ? `，复用${resumedFileCount}个安全缓存` : ''}`, true)
    }

    reporter?.startStage(4, 5, '敏感内容与绝对路径扫描', { completed: 0, total: allFiles.length, maxWaitHint: '持续扫描并按真实文件数计数' })
    const previousScan = recovery.state.scanCache?.listDigest === listDigest ? recovery.state.scanCache : { index: 0, findings: [] }
    const secretRegexes = policy.secretContentPatterns.map(pattern => new RegExp(pattern, 'i'))
    const absoluteRegexes = policy.absolutePathPatterns.map(pattern => new RegExp(pattern, 'i'))
    const textExtensions = new Set(['.cjs', '.cmd', '.js', '.json', '.md', '.ps1', '.ts', '.txt', '.yaml', '.yml'])
    const findings = [...(previousScan.findings || [])]
    let scanIndex = Number(previousScan.index || 0)
    for (; scanIndex < allFiles.length; scanIndex += 1) {
      reporter?.throwIfCancelled()
      const absolute = allFiles[scanIndex]
      const relative = posix(path.relative(resolved, absolute))
      if (!isMutable(relative)) {
        const top = relative.toLowerCase().split('/')[0]
        if (policy.forbiddenPathSegments.map(value => value.toLowerCase()).includes(top)) findings.push(`FORBIDDEN_TOP_LEVEL:${relative}`)
        const basename = path.basename(relative)
        if (!isRuntimeAsset(relative) && policy.forbiddenFilePatterns.some(pattern => matchesGlobName(basename, pattern))) findings.push(`FORBIDDEN_FILE:${relative}`)
        if (!isRuntimeAsset(relative) && textExtensions.has(path.extname(relative).toLowerCase()) && fs.statSync(absolute).size <= 4 * 1024 * 1024) {
          const content = fs.readFileSync(absolute, 'utf8')
          if (secretRegexes.some(pattern => pattern.test(content))) findings.push(`SECRET_CONTENT:${relative}`)
          if (absoluteRegexes.some(pattern => pattern.test(content))) findings.push(`ABSOLUTE_PATH:${relative}`)
        }
      }
      const completed = scanIndex + 1
      reporter?.update(completed, allFiles.length, relative)
      if (completed % 1000 === 0 || completed === allFiles.length) {
        recovery.checkpoint(4, '敏感内容与绝对路径扫描', completedAssets.size ? [...completedAssets] : [], {
          coreCache: recovery.state.coreCache,
          completedAssets: [...completedAssets],
          listDigest,
          scanCache: { index: completed, findings: [...new Set(findings)], listDigest }
        })
      }
    }

    reporter?.startStage(5, 5, '核对文件集合并生成最终结果', { heartbeat: false })
    assert.equal(sha256File(manifestPath), manifestDigest, 'I10_S9_MANIFEST_CHANGED_DURING_VERIFY')
    const finalFiles = listFiles(resolved)
    const finalFingerprintFiles = finalFiles.filter(absolute => !isMutable(posix(path.relative(resolved, absolute))))
    const finalDigest = fileListFingerprint(resolved, finalFingerprintFiles, (completed, total) => {
      reporter?.activity(`正在复核恢复文件集合指纹：${completed}/${total}`, false)
    }, () => reporter?.throwIfCancelled())
    assert.equal(finalDigest, listDigest, 'I10_S9_FILE_SET_CHANGED_DURING_VERIFY')
    assert.deepEqual(actualCore, manifest.coreFiles, 'I10_S9_CORE_FILE_MANIFEST_MISMATCH')
    const uniqueFindings = [...new Set(findings)].sort()
    assert.deepEqual(uniqueFindings, [], `I10_S9_FORBIDDEN_CONTENT:${uniqueFindings.slice(0, 10).join(',')}`)
    reporter?.activity('核心集合、运行时资产和违规项全部一致')
    const result = { status: 'I10_PORTABLE_FOLDER_VERIFIED', sourceCommit: manifest.sourceCommit, manifestSha256: manifestDigest, assetCount: Object.keys(manifest.assets).length, coreFileCount: Object.keys(manifest.coreFiles).length, forbiddenFindingCount: 0 }
    recovery.complete({ status: result.status, manifestSha256: manifestDigest })
    reporter?.finish('完成', `${result.coreFileCount}个核心文件，${result.assetCount}个运行时资产`)
    return result
  } catch (error) {
    recovery.fail(error, !['RECOVERY_STATE_INVALID', 'I10_S9_HASH_MANIFEST_MISSING'].includes(error.code), error.code === 'USER_CANCELLED')
    throw error
  } finally {
    recovery.release()
  }
}

function validateArchiveListing(archivePath) {
  const listingPath = path.join(path.dirname(archivePath), `.${path.basename(archivePath)}.${process.pid}.listing.tmp`)
  let entryCount = 0
  const validateEntry = raw => {
    const entry = raw.replace(/\\/g, '/')
    if (!entry) return
    entryCount += 1
    assert.ok(entry === policy.candidateName || entry.startsWith(`${policy.candidateName}/`), `I10_S9_ARCHIVE_ENTRY_OUTSIDE_ROOT:${entry}`)
    assert.ok(!entry.split('/').includes('..'), `I10_S9_ARCHIVE_TRAVERSAL:${entry}`)
    assert.ok(!/^[A-Za-z]:/.test(entry) && !entry.startsWith('/'), `I10_S9_ARCHIVE_ABSOLUTE_ENTRY:${entry}`)
  }
  try {
    const output = fs.openSync(listingPath, 'w')
    try {
      const result = run('tar.exe', ['-tf', archivePath], { stdio: ['ignore', output, 'pipe'] })
      assert.equal(result.status, 0, `I10_S9_ARCHIVE_LIST_FAILED:${String(result.stderr || '').trim()}`)
    } finally { fs.closeSync(output) }
    const input = fs.openSync(listingPath, 'r')
    try {
      const buffer = Buffer.allocUnsafe(64 * 1024)
      let carry = ''
      while (true) {
        const bytes = fs.readSync(input, buffer, 0, buffer.length, null)
        if (bytes === 0) break
        const lines = `${carry}${buffer.toString('utf8', 0, bytes)}`.split(/\r?\n/)
        carry = lines.pop() || ''
        for (const line of lines) validateEntry(line)
      }
      validateEntry(carry)
    } finally { fs.closeSync(input) }
  } finally { fs.rmSync(listingPath, { force: true }) }
  assert.ok(entryCount > 0, 'I10_S9_ARCHIVE_EMPTY')
  return entryCount
}

function verifyRelease(candidateRoot, archivePath, checksumPath) {
  const folder = verifyCandidate(candidateRoot)
  assert.ok(fs.existsSync(archivePath), 'I10_S9_ARCHIVE_MISSING')
  assert.ok(fs.existsSync(checksumPath), 'I10_S9_ARCHIVE_CHECKSUM_MISSING')
  const checksum = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0]
  assert.match(checksum, /^[0-9a-f]{64}$/)
  assert.equal(sha256File(archivePath), checksum, 'I10_S9_ARCHIVE_HASH_MISMATCH')
  return { ...folder, status: 'I10_PORTABLE_RELEASE_VERIFIED', archiveSha256: checksum, archiveEntryCount: validateArchiveListing(archivePath) }
}

function safeReleasePath(target) {
  const resolved = path.resolve(target)
  const relative = path.relative(releaseRoot, resolved)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `I10_S9_OUTPUT_OUTSIDE_RELEASE_ROOT:${resolved}`)
  return resolved
}

function promoteReleaseArtifacts(options) {
  const stagingRoot = path.resolve(options.stagingRoot)
  const targetReleaseRoot = path.resolve(options.releaseRoot)
  const relativeToRelease = path.relative(targetReleaseRoot, stagingRoot)
  assert.ok(relativeToRelease.startsWith('..') && !path.isAbsolute(relativeToRelease), 'I10_S9_STAGING_MUST_BE_OUTSIDE_RELEASE_ROOT')
  const artifactNames = [...options.artifactNames]
  assert.ok(artifactNames.length > 0, 'I10_S9_PROMOTION_ARTIFACTS_MISSING')
  for (const name of artifactNames) {
    assert.equal(path.basename(name), name, `I10_S9_PROMOTION_NAME_INVALID:${name}`)
    assert.ok(fs.existsSync(path.join(stagingRoot, name)), `I10_S9_STAGED_ARTIFACT_MISSING:${name}`)
  }
  const renameSync = options.renameSync || fs.renameSync
  const backupRoot = path.join(stagingRoot, '.previous-release')
  fs.mkdirSync(backupRoot, { recursive: true })
  fs.mkdirSync(targetReleaseRoot, { recursive: true })
  const backedUp = []
  const promoted = []
  try {
    for (const [index, name] of artifactNames.entries()) {
      const target = path.join(targetReleaseRoot, name)
      if (!fs.existsSync(target)) continue
      const backup = path.join(backupRoot, `${String(index).padStart(3, '0')}-${name}`)
      renameSync(target, backup)
      backedUp.push({ target, backup })
    }
    for (const name of artifactNames) {
      const staged = path.join(stagingRoot, name)
      const target = path.join(targetReleaseRoot, name)
      renameSync(staged, target)
      promoted.push(target)
    }
  } catch (error) {
    const rollbackErrors = []
    for (const target of [...promoted].reverse()) {
      try { fs.rmSync(target, { recursive: true, force: true }) } catch (rollbackError) { rollbackErrors.push(rollbackError.message) }
    }
    for (const { target, backup } of [...backedUp].reverse()) {
      try { if (fs.existsSync(backup)) renameSync(backup, target) } catch (rollbackError) { rollbackErrors.push(rollbackError.message) }
    }
    if (rollbackErrors.length) error.rollbackErrors = rollbackErrors
    throw error
  }
  fs.rmSync(backupRoot, { recursive: true, force: true })
  return artifactNames.map(name => path.join(targetReleaseRoot, name))
}

function createExternalStagingRoot(targetProductRoot = productRoot) {
  const resolvedProductRoot = path.resolve(targetProductRoot)
  const stagingRoot = fs.mkdtempSync(path.join(path.dirname(resolvedProductRoot), '.hengzhun-i10-stage9-staging-'))
  const relative = path.relative(resolvedProductRoot, stagingRoot)
  assert.ok(relative.startsWith('..') && !path.isAbsolute(relative), 'I10_S9_STAGING_MUST_BE_OUTSIDE_PRODUCT_ROOT')
  return stagingRoot
}

function packageRelease() {
  assert.equal(process.platform, 'win32', 'I10_S9_WINDOWS_REQUIRED')
  assert.equal(process.arch, 'x64', 'I10_S9_X64_REQUIRED')
  const readiness = preflight({ emit: false })
  assert.equal(readiness.status, 'I10_S9_PREFLIGHT_READY', `I10_S9_PREFLIGHT_NOT_READY:${readiness.status}`)
  const sourceCommit = currentCommit()
  const sourceSnapshot = governedWorktreeSnapshot()
  assertSourceSnapshotCurrent(sourceCommit, sourceSnapshot)
  // Keep all construction outside .release and on the same volume.  Existing
  // outputs stay intact until the candidate, archive, and checksum have all
  // passed verification; promotion then uses same-volume atomic renames with
  // transaction rollback.
  const stagingRoot = createExternalStagingRoot()
  const stagedCandidateRoot = path.join(stagingRoot, policy.candidateName)
  const stagedArchivePath = path.join(stagingRoot, policy.archiveName)
  const stagedChecksumPath = `${stagedArchivePath}.sha256`
  const candidateRoot = safeReleasePath(path.join(releaseRoot, policy.candidateName))
  const archivePath = safeReleasePath(path.join(releaseRoot, policy.archiveName))
  const checksumPath = safeReleasePath(`${archivePath}.sha256`)
  try {
    fs.mkdirSync(stagedCandidateRoot, { recursive: true })
    copyWorktree(stagedCandidateRoot, sourceSnapshot)
    for (const relative of policy.runtimeTrees) copyRuntimeTree(relative, stagedCandidateRoot)
    for (const relative of policy.emptyRuntimeDirectories) fs.mkdirSync(path.join(stagedCandidateRoot, ...relative.split('/')), { recursive: true })
    writeGeneratedFiles(stagedCandidateRoot, sourceCommit)
    const findings = forbiddenCoreFindings(stagedCandidateRoot)
    assert.deepEqual(findings, [], `I10_S9_FORBIDDEN_CONTENT:${findings.slice(0, 10).join(',')}`)
    writeJson(path.join(stagedCandidateRoot, 'manifest', 'files.sha256.json'), buildManifest(stagedCandidateRoot, sourceCommit))
    verifyCandidate(stagedCandidateRoot)
    const archiveResult = run('tar.exe', ['-a', '-c', '-f', stagedArchivePath, '-C', stagingRoot, policy.candidateName])
    assert.equal(archiveResult.status, 0, `I10_S9_ARCHIVE_FAILED:${String(archiveResult.stderr || '').trim()}`)
    const archiveSha256 = sha256File(stagedArchivePath)
    fs.writeFileSync(stagedChecksumPath, `${archiveSha256}  ${path.basename(stagedArchivePath)}\r\n`, 'utf8')
    const result = verifyRelease(stagedCandidateRoot, stagedArchivePath, stagedChecksumPath)
    assertSourceSnapshotCurrent(sourceCommit, sourceSnapshot)
    promoteReleaseArtifacts({
      stagingRoot,
      releaseRoot,
      artifactNames: [policy.candidateName, policy.archiveName, `${policy.archiveName}.sha256`]
    })
    process.stdout.write(`${JSON.stringify({ ...result, outputFolder: candidateRoot, archivePath, checksumPath }, null, 2)}\n`)
    return result
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true })
  }
}

function preflight(options = {}) {
  const missingRuntimeTrees = policy.runtimeTrees.filter(relative => !fs.existsSync(path.join(productRoot, ...relative.split('/'))))
  const missingSourceFiles = policy.trackedFiles.filter(relative => !fs.existsSync(path.join(productRoot, ...relative.split('/'))))
  const missingHostTools = ['git.exe', 'powershell.exe', 'robocopy.exe', 'tar.exe'].filter(command => run('where.exe', [command]).status !== 0)
  const dirtyEntries = sourceStatus()
  let runtimeFork = null
  let runtimeForkError = null
  try { runtimeFork = verifyRuntimeFork({ appRoot: path.join(productRoot, 'flowise', 'app') }) } catch (error) { runtimeForkError = error.code || error.message }
  const appLock = path.join(productRoot, 'flowise', 'app', 'package-lock.json')
  const runtimeLock = path.join(productRoot, 'flowise', 'runtime-package-lock.json')
  const flowiseAcquisitionLockMirrored = fs.existsSync(appLock) && fs.existsSync(runtimeLock) && sha256File(appLock) === sha256File(runtimeLock)
  const result = {
    status: missingRuntimeTrees.length || missingSourceFiles.length || missingHostTools.length || runtimeForkError || !flowiseAcquisitionLockMirrored ? 'I10_S9_PREFLIGHT_FAILED' : dirtyEntries.length ? 'I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN' : 'I10_S9_PREFLIGHT_READY',
    platform: `${process.platform}-${process.arch}`, portabilityContract: policy.portabilityContract,
    machineSpecificAcceptanceRequired: policy.machineSpecificAcceptanceRequired,
    missingRuntimeTrees, missingSourceFiles, missingHostTools, dirtyEntryCount: dirtyEntries.length,
    flowiseRuntimeFork: runtimeFork ? { status: runtimeFork.status, closureHash: runtimeFork.manifest.closureHash } : null,
    flowiseRuntimeForkError: runtimeForkError,
    flowiseAcquisitionLockMirrored,
    exportCreated: false, archiveCreated: false
  }
  if (options.emit !== false) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (require.main === module) {
  let reporter = null
  try {
    const command = process.argv[2]
    if (command === 'preflight') {
      const result = preflight()
      if (!process.argv.includes('--report-only') && result.status !== 'I10_S9_PREFLIGHT_READY') process.exitCode = 3
    } else if (command === 'package') packageRelease()
    else if (command === 'refresh-compliance') {
      const candidate = argument('--candidate') || productRoot
      const candidateMetadata = JSON.parse(fs.readFileSync(path.join(candidate, 'manifest', 'candidate.json'), 'utf8'))
      writeComplianceFiles(candidate, String(candidateMetadata.sourceCommit))
      process.stdout.write(`${JSON.stringify({ status: 'I10_COMPLIANCE_REFRESHED', candidate }, null, 2)}\n`)
    }
    else if (command === 'refresh-manifest') {
      const result = refreshManifest(argument('--candidate') || productRoot, { rehashAssets: process.argv.includes('--rehash-assets') })
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    }
    else if (command === 'verify') {
      reporter = new ProgressReporter('VERIFY', { enabled: enabledFromEnvironment() })
      reporter.installCancellation()
      const result = verifyCandidate(argument('--candidate') || productRoot, reporter)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else if (command === 'verify-release') {
      const result = verifyRelease(argument('--candidate'), argument('--archive'), argument('--checksum'))
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else throw new Error('USAGE: i10-stage9-portable.cjs preflight [--report-only] | package | refresh-compliance [--candidate path] | refresh-manifest [--candidate path] [--rehash-assets] | verify --candidate path | verify-release --candidate path --archive path --checksum path')
  } catch (error) {
    reporter?.fail(error)
    process.stderr.write(`${error.message}\n`)
    process.exitCode = error.exitCode || 2
  }
}

module.exports = {
  buildManifest,
  contentSnapshot,
  createExternalStagingRoot,
  discoverRepositoryContext,
  forbiddenCoreFindings,
  hashTree,
  packageRelease,
  portableWorktreeFiles,
  preflight,
  promoteReleaseArtifacts,
  refreshManifest,
  verifyCandidate,
  verifyRelease,
  worktreeContentSnapshot,
  worktreeFilesFor
}
