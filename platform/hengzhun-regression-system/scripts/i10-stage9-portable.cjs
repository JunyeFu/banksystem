#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(productRoot, '..', '..')
const releaseRoot = path.join(productRoot, '.release')
const productRepoPath = path.relative(repoRoot, productRoot).split(path.sep).join('/')
const policyPath = path.join(productRoot, 'flowise', 'i10', 's9-portability-policy-v1.json')
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))

const posix = value => value.split(path.sep).join('/')
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

function git(args) {
  const result = run('git.exe', ['-C', repoRoot, ...args])
  assert.equal(result.status, 0, String(result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim())
  return String(result.stdout || '').trim()
}

function currentCommit() {
  const commit = git(['rev-parse', 'HEAD'])
  assert.match(commit, /^[0-9a-f]{40}$/)
  return commit
}

function sourceStatus() {
  const output = git(['status', '--porcelain=v1', '--untracked-files=all', '--', productRepoPath])
  return output ? output.split(/\r?\n/).filter(Boolean) : []
}

function assertSourceFrozen() {
  const dirty = sourceStatus()
  assert.deepEqual(dirty, [], `I10_S9_SOURCE_NOT_FROZEN:${dirty.slice(0, 20).join('|')}`)
}

function trackedFilesFor(entries) {
  const repoEntries = entries.map(entry => `${productRepoPath}/${entry}`)
  const output = git(['ls-files', '--', ...repoEntries])
  return output ? output.split(/\r?\n/).filter(Boolean) : []
}

function governedTrackedFiles() {
  const requested = [...policy.trackedPrefixes, ...policy.trackedFiles]
  const files = trackedFilesFor(requested)
  const required = policy.trackedFiles.map(item => `${productRepoPath}/${item}`)
  for (const repoFile of required) assert.ok(files.includes(repoFile), `I10_S9_TRACKED_FILE_MISSING:${repoFile}`)
  return files
}

function copyTracked(candidateRoot) {
  for (const repoFile of governedTrackedFiles()) {
    const relative = repoFile.slice(productRepoPath.length + 1)
    const source = path.join(repoRoot, ...repoFile.split('/'))
    const destination = path.join(candidateRoot, ...relative.split('/'))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function copyRuntimeTree(relative, candidateRoot) {
  const source = path.join(productRoot, ...relative.split('/'))
  const destination = path.join(candidateRoot, ...relative.split('/'))
  assert.ok(fs.existsSync(source), `I10_S9_RUNTIME_TREE_MISSING:${relative}`)
  fs.mkdirSync(destination, { recursive: true })
  const result = run('robocopy.exe', [source, destination, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:1', '/W:1', '/XJ', '/MT:16', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XF', '.env', '.env.*', '*.log', '*.pid'])
  assert.ok(result.status >= 0 && result.status <= 7, `I10_S9_RUNTIME_COPY_FAILED:${relative}:${result.status}`)
}

function listFiles(root) {
  const files = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolute = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`I10_S9_UNSUPPORTED_LINK:${posix(path.relative(root, absolute))}`)
      if (entry.isDirectory()) visit(absolute)
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

function forbiddenCoreFindings(candidateRoot) {
  const findings = []
  const secretRegexes = policy.secretContentPatterns.map(pattern => new RegExp(pattern, 'i'))
  const absoluteRegexes = policy.absolutePathPatterns.map(pattern => new RegExp(pattern, 'i'))
  const textExtensions = new Set(['.cjs', '.cmd', '.js', '.json', '.md', '.ps1', '.ts', '.txt', '.yaml', '.yml'])
  for (const absolute of listFiles(candidateRoot)) {
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
  }
  return [...new Set(findings)].sort()
}

function hashTree(root) {
  const aggregate = crypto.createHash('sha256')
  let totalBytes = 0
  const files = listFiles(root)
  for (const absolute of files) {
    const relative = posix(path.relative(root, absolute))
    const size = fs.statSync(absolute).size
    aggregate.update(`${relative}\0${size}\0${sha256File(absolute)}\n`, 'utf8')
    totalBytes += size
  }
  return { algorithm: 'sha256(sorted-posix-relative-path\\0byte-length\\0file-sha256\\n)', sha256: aggregate.digest('hex'), fileCount: files.length, totalBytes }
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

function writeComplianceFiles(candidateRoot, sourceCommit) {
  const components = [
    ...lockComponents(path.join(candidateRoot, 'package-lock.json'), 'required'),
    ...lockComponents(path.join(candidateRoot, 'flowise', 'runtime-package-lock.json'), 'required')
  ]
  const unique = [...new Map(components.map(component => [component['bom-ref'], component])).values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'], 'en'))
  const sbomComponents = unique.map(({ license, ...component }) => ({ ...component, licenses: license === 'NOASSERTION' ? undefined : [{ expression: license }] }))
  const serialSeed = sha256Buffer(Buffer.from(`${sourceCommit}:${policy.candidateName}`, 'utf8')).slice(0, 32)
  const serial = `${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-4${serialSeed.slice(13, 16)}-a${serialSeed.slice(17, 20)}-${serialSeed.slice(20, 32)}`
  writeJson(path.join(candidateRoot, 'manifest', 'cyclonedx-sbom.json'), {
    bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${serial}`, version: 1,
    metadata: { component: { type: 'application', name: 'hengzhun-regression-system', version: '0.1.0', properties: [{ name: 'hengzhun:sourceCommit', value: sourceCommit }] } },
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
    'PREPARE.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\prepare-i10.ps1"\r\n',
    'START.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\start-i10.ps1"\r\n',
    'STATUS.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\status-i10.ps1"\r\n',
    'STOP.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\stop-i10.ps1"\r\n',
    'VERIFY.cmd': '@echo off\r\n"%~dp0runtime\\node-v20.20.2-win-x64\\node.exe" "%~dp0scripts\\i10-stage9-portable.cjs" verify --candidate "%~dp0"\r\n'
  }
  for (const [name, content] of Object.entries(wrappers)) fs.writeFileSync(path.join(candidateRoot, name), content, 'utf8')
  fs.writeFileSync(path.join(candidateRoot, 'README.md'), `# 衡准自动化回归测试系统 I10 Windows x64 正式版\n\n本目录自带Node.js、Flowise、Chromium、FFmpeg、OCR、Harness、Worker和SQLite迁移，不要求WSL、Docker或全局Node。\n\n1. 在目标目录运行 \`VERIFY.cmd\`。\n2. 运行 \`PREPARE.cmd\`，只在本机 \`.data/\` 生成运行配置和内部服务凭据。\n3. 使用 \`START.cmd\`、\`STATUS.cmd\` 和 \`STOP.cmd\` 管理服务。\n4. 模型配置只使用 \`CONTROL_*\` 与 \`VISION_*\` 通用变量；两组模型的API Key与API Base以及银行账号不在发布包内。Flowise本地界面使用包内固定演示管理员身份。\n\n目录可放在Windows 10/11 x64可写磁盘的含空格或中文路径中。平台使用相对路径，不建立机器专属验收流程。\n\n冻结源提交：\`${sourceCommit}\`。\n`, 'utf8')
  writeJson(path.join(candidateRoot, 'manifest', 'candidate.json'), {
    schemaVersion: 'hengzhun-i10-windows-x64-release-v1', stage: 'I10_S9_PORTABLE_RELEASE', candidateName: policy.candidateName,
    sourceCommit, sourceFrozen: true, platform: policy.platform, portabilityContract: policy.portabilityContract,
    supportedOperatingSystems: policy.supportedOperatingSystems, requiredPathScenarios: policy.requiredPathScenarios,
    bundled: { node: '20.20.2', flowise: '3.0.12', chromium: '1217', ffmpeg: true, ocr: ['chi_sim', 'eng'] },
    runtimeDataRoot: '.data', modelApiKeysAndBasesBundled: false, fixedLocalPlatformLoginBundled: true, machineSpecificAcceptanceRequired: false
  })
  writeComplianceFiles(candidateRoot, sourceCommit)
}

function buildManifest(candidateRoot, sourceCommit) {
  const assets = {}
  for (const relative of policy.runtimeTrees) assets[relative] = hashTree(path.join(candidateRoot, ...relative.split('/')))
  const coreFiles = {}
  for (const absolute of listFiles(candidateRoot)) {
    const relative = posix(path.relative(candidateRoot, absolute))
    if (relative === 'manifest/files.sha256.json' || isMutable(relative) || isRuntimeAsset(relative)) continue
    coreFiles[relative] = { sha256: sha256File(absolute), byteLength: fs.statSync(absolute).size }
  }
  return { schemaVersion: 'hengzhun-i10-file-manifest-v1', sourceCommit, algorithm: 'sha256', assets, coreFiles }
}

function verifyCandidate(candidateRoot) {
  const resolved = path.resolve(candidateRoot)
  const manifestPath = path.join(resolved, 'manifest', 'files.sha256.json')
  assert.ok(fs.existsSync(manifestPath), 'I10_S9_HASH_MANIFEST_MISSING')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 'hengzhun-i10-file-manifest-v1')
  for (const [relative, expected] of Object.entries(manifest.assets || {})) assert.deepEqual(hashTree(path.join(resolved, ...relative.split('/'))), expected, `I10_S9_ASSET_HASH_MISMATCH:${relative}`)
  const actualCore = {}
  for (const absolute of listFiles(resolved)) {
    const relative = posix(path.relative(resolved, absolute))
    if (relative === 'manifest/files.sha256.json' || isMutable(relative) || isRuntimeAsset(relative)) continue
    actualCore[relative] = { sha256: sha256File(absolute), byteLength: fs.statSync(absolute).size }
  }
  assert.deepEqual(actualCore, manifest.coreFiles, 'I10_S9_CORE_FILE_MANIFEST_MISMATCH')
  const findings = forbiddenCoreFindings(resolved)
  assert.deepEqual(findings, [], `I10_S9_FORBIDDEN_CONTENT:${findings.slice(0, 10).join(',')}`)
  return { status: 'I10_PORTABLE_FOLDER_VERIFIED', sourceCommit: manifest.sourceCommit, manifestSha256: sha256File(manifestPath), assetCount: Object.keys(manifest.assets).length, coreFileCount: Object.keys(manifest.coreFiles).length, forbiddenFindingCount: 0 }
}

function validateArchiveListing(archivePath) {
  const result = run('tar.exe', ['-tf', archivePath])
  assert.equal(result.status, 0, `I10_S9_ARCHIVE_LIST_FAILED:${String(result.stderr || '').trim()}`)
  const entries = String(result.stdout || '').split(/\r?\n/).filter(Boolean).map(value => value.replace(/\\/g, '/'))
  assert.ok(entries.length > 0, 'I10_S9_ARCHIVE_EMPTY')
  for (const entry of entries) {
    assert.ok(entry === policy.candidateName || entry.startsWith(`${policy.candidateName}/`), `I10_S9_ARCHIVE_ENTRY_OUTSIDE_ROOT:${entry}`)
    assert.ok(!entry.split('/').includes('..'), `I10_S9_ARCHIVE_TRAVERSAL:${entry}`)
    assert.ok(!/^[A-Za-z]:/.test(entry) && !entry.startsWith('/'), `I10_S9_ARCHIVE_ABSOLUTE_ENTRY:${entry}`)
  }
  return entries.length
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

function packageRelease() {
  assert.equal(process.platform, 'win32', 'I10_S9_WINDOWS_REQUIRED')
  assert.equal(process.arch, 'x64', 'I10_S9_X64_REQUIRED')
  assertSourceFrozen()
  const sourceCommit = currentCommit()
  const candidateRoot = safeReleasePath(path.join(releaseRoot, policy.candidateName))
  const archivePath = safeReleasePath(path.join(releaseRoot, policy.archiveName))
  const checksumPath = safeReleasePath(`${archivePath}.sha256`)
  for (const target of [candidateRoot, archivePath, checksumPath]) if (fs.existsSync(target)) fs.rmSync(target, { recursive: fs.statSync(target).isDirectory(), force: true })
  fs.mkdirSync(candidateRoot, { recursive: true })
  copyTracked(candidateRoot)
  for (const relative of policy.runtimeTrees) copyRuntimeTree(relative, candidateRoot)
  for (const relative of policy.emptyRuntimeDirectories) fs.mkdirSync(path.join(candidateRoot, ...relative.split('/')), { recursive: true })
  writeGeneratedFiles(candidateRoot, sourceCommit)
  const findings = forbiddenCoreFindings(candidateRoot)
  assert.deepEqual(findings, [], `I10_S9_FORBIDDEN_CONTENT:${findings.slice(0, 10).join(',')}`)
  writeJson(path.join(candidateRoot, 'manifest', 'files.sha256.json'), buildManifest(candidateRoot, sourceCommit))
  verifyCandidate(candidateRoot)
  const archiveResult = run('tar.exe', ['-a', '-c', '-f', archivePath, '-C', releaseRoot, policy.candidateName])
  assert.equal(archiveResult.status, 0, `I10_S9_ARCHIVE_FAILED:${String(archiveResult.stderr || '').trim()}`)
  const archiveSha256 = sha256File(archivePath)
  fs.writeFileSync(checksumPath, `${archiveSha256}  ${path.basename(archivePath)}\r\n`, 'utf8')
  const result = verifyRelease(candidateRoot, archivePath, checksumPath)
  process.stdout.write(`${JSON.stringify({ ...result, outputFolder: candidateRoot, archivePath, checksumPath }, null, 2)}\n`)
  return result
}

function preflight() {
  const missingRuntimeTrees = policy.runtimeTrees.filter(relative => !fs.existsSync(path.join(productRoot, ...relative.split('/'))))
  const missingSourceFiles = policy.trackedFiles.filter(relative => !fs.existsSync(path.join(productRoot, ...relative.split('/'))))
  const missingHostTools = ['git.exe', 'powershell.exe', 'robocopy.exe', 'tar.exe'].filter(command => run('where.exe', [command]).status !== 0)
  const dirtyEntries = sourceStatus()
  const result = {
    status: missingRuntimeTrees.length || missingSourceFiles.length || missingHostTools.length ? 'I10_S9_PREFLIGHT_FAILED' : dirtyEntries.length ? 'I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN' : 'I10_S9_PREFLIGHT_READY',
    platform: `${process.platform}-${process.arch}`, portabilityContract: policy.portabilityContract,
    machineSpecificAcceptanceRequired: policy.machineSpecificAcceptanceRequired,
    missingRuntimeTrees, missingSourceFiles, missingHostTools, dirtyEntryCount: dirtyEntries.length,
    exportCreated: false, archiveCreated: false
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (require.main === module) {
  try {
    const command = process.argv[2]
    if (command === 'preflight') {
      const result = preflight()
      if (!process.argv.includes('--report-only') && result.status !== 'I10_S9_PREFLIGHT_READY') process.exitCode = 3
    } else if (command === 'package') packageRelease()
    else if (command === 'verify') {
      const result = verifyCandidate(argument('--candidate') || productRoot)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else if (command === 'verify-release') {
      const result = verifyRelease(argument('--candidate'), argument('--archive'), argument('--checksum'))
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else throw new Error('USAGE: i10-stage9-portable.cjs preflight [--report-only] | package | verify --candidate path | verify-release --candidate path --archive path --checksum path')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  }
}

module.exports = { forbiddenCoreFindings, hashTree, preflight, verifyCandidate, verifyRelease }
