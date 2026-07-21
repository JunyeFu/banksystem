#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(productRoot, '..', '..')
const productRepoPath = path.relative(repoRoot, productRoot).split(path.sep).join('/')
const policyPath = path.join(productRoot, 'flowise', 'i9', 'p8-portability-policy-v1.json')
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))

const posix = value => value.split(path.sep).join('/')
const sha256Buffer = value => crypto.createHash('sha256').update(value).digest('hex')
const sha256File = file => sha256Buffer(fs.readFileSync(file))
const writeJson = (file, value) => {
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

function assertTrackedProductClean() {
  const result = run('git.exe', ['-C', repoRoot, 'diff', '--quiet', 'HEAD', '--', productRepoPath])
  assert.equal(result.status, 0, 'I9_P8_TRACKED_PRODUCT_TREE_NOT_CLEAN')
}

function trackedFilesFor(entries) {
  const repoEntries = entries.map(entry => `${productRepoPath}/${entry}`)
  const output = git(['ls-files', '--', ...repoEntries])
  return output ? output.split(/\r?\n/).filter(Boolean) : []
}

function copyTracked(candidateRoot) {
  const requested = [...policy.trackedPrefixes, ...policy.trackedFiles]
  const files = trackedFilesFor(requested)
  const wantedFiles = new Set(policy.trackedFiles.map(item => `${productRepoPath}/${item}`))
  for (const required of wantedFiles) assert.ok(files.includes(required), `I9_P8_TRACKED_FILE_MISSING:${required}`)
  for (const repoFile of files) {
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
  assert.ok(fs.existsSync(source), `I9_P8_RUNTIME_TREE_MISSING:${relative}`)
  fs.mkdirSync(destination, { recursive: true })
  const result = run('robocopy.exe', [source, destination, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:1', '/W:1', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XF', '.env', '.env.*', '*.log', '*.pid'])
  assert.ok(result.status >= 0 && result.status <= 7, `I9_P8_RUNTIME_COPY_FAILED:${relative}:${result.status}`)
}

function listFiles(root) {
  const files = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push(absolute)
      else throw new Error(`I9_P8_UNSUPPORTED_FILESYSTEM_ENTRY:${posix(path.relative(root, absolute))}`)
    }
  }
  visit(root)
  return files
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

function under(relative, prefix) {
  return relative === prefix || relative.startsWith(`${prefix}/`)
}

function isMutable(relative) {
  return policy.mutableFilePrefixes.some(prefix => relative.startsWith(prefix))
}

function isRuntimeAsset(relative) {
  return policy.runtimeTrees.some(prefix => under(relative, prefix))
}

function forbiddenCoreFindings(candidateRoot) {
  const findings = []
  const secretRegexes = policy.secretContentPatterns.map(pattern => new RegExp(pattern, 'i'))
  const absoluteRegexes = policy.absolutePathPatterns.map(pattern => new RegExp(pattern, 'i'))
  const textExtensions = new Set(['.cjs', '.cmd', '.js', '.json', '.md', '.ps1', '.ts', '.txt', '.yaml', '.yml'])
  for (const absolute of listFiles(candidateRoot)) {
    const relative = posix(path.relative(candidateRoot, absolute))
    if (isMutable(relative)) continue
    const top = relative.split('/')[0].toLowerCase()
    if (policy.forbiddenPathSegments.map(value => value.toLowerCase()).includes(top)) findings.push(`FORBIDDEN_TOP_LEVEL:${relative}`)
    const basename = path.basename(relative).toLowerCase()
    if (basename === '.env' || basename.startsWith('.env.')) findings.push(`ENV_FILE:${relative}`)
    if (!isRuntimeAsset(relative)) {
      if (/\.sqlite(?:-(?:wal|shm))?$/i.test(basename) || /\.(?:log|pid|har)$/i.test(basename) || /storage-?state/i.test(basename)) findings.push(`RUNTIME_FILE:${relative}`)
      if (textExtensions.has(path.extname(relative).toLowerCase()) && fs.statSync(absolute).size <= 4 * 1024 * 1024) {
        const content = fs.readFileSync(absolute, 'utf8')
        if (secretRegexes.some(pattern => pattern.test(content))) findings.push(`SECRET_CONTENT:${relative}`)
        if (absoluteRegexes.some(pattern => pattern.test(content))) findings.push(`ABSOLUTE_PATH:${relative}`)
      }
    }
  }
  return findings
}

function lockComponents(lockFile, scope) {
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
  const components = []
  for (const [entryPath, metadata] of Object.entries(lock.packages || {})) {
    if (!entryPath || !entryPath.includes('node_modules/') || !metadata?.version) continue
    const name = entryPath.slice(entryPath.lastIndexOf('node_modules/') + 13).split('/node_modules/').pop()
    components.push({ type: 'library', 'bom-ref': `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`, name, version: metadata.version, scope, licenses: metadata.license ? [{ license: { id: metadata.license } }] : undefined, purl: `pkg:npm/${encodeURIComponent(name)}@${metadata.version}` })
  }
  return components
}

function writeGeneratedFiles(candidateRoot, sourceCommit) {
  const wrappers = {
    'PREPARE.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\prepare-i9.ps1"\r\n',
    'START.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\start-i9.ps1"\r\n',
    'STATUS.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\status-i9.ps1"\r\n',
    'STOP.cmd': '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\stop-i9.ps1"\r\n',
    'VERIFY-PORTABLE.cmd': '@echo off\r\n"%~dp0runtime\\node-v20.20.2-win-x64\\node.exe" "%~dp0scripts\\i9-stage8-portable.cjs" verify --candidate "%~dp0"\r\n'
  }
  for (const [name, content] of Object.entries(wrappers)) fs.writeFileSync(path.join(candidateRoot, name), content, 'utf8')
  const readme = `# 衡准自动化回归测试系统 P8 便携候选\n\n本目录是跨电脑验收候选，不是最终提交文件夹。无需安装 Node、WSL 或 Docker。\n\n1. 运行 \`VERIFY-PORTABLE.cmd\` 校验文件完整性。\n2. 运行 \`PREPARE.cmd\` 生成仅保存在 \`.data/\` 的本机随机服务凭据。\n3. 运行 \`START.cmd\`，使用 \`STATUS.cmd\` 查看四服务，使用 \`STOP.cmd\` 安全停止。\n4. 第二台电脑使用候选内置 Node 执行：\n   \`runtime\\node-v20.20.2-win-x64\\node.exe scripts\\i9-stage8-machine-acceptance.cjs --role second-computer\`\n\n平台模型密钥和银行账号不在候选中；真实业务连接必须在目标电脑运行态单独配置。两套 SQLite 只在首次准备/启动后生成，备份与恢复使用 \`scripts\\backup-i9.ps1\` 和 \`scripts\\restore-i9.ps1\`。\n\n冻结源提交：\`${sourceCommit}\`。\n`
  fs.writeFileSync(path.join(candidateRoot, 'README.md'), readme, 'utf8')

  const components = [...lockComponents(path.join(candidateRoot, 'package-lock.json'), 'required'), ...lockComponents(path.join(candidateRoot, 'flowise', 'runtime-package-lock.json'), 'required')]
  const unique = [...new Map(components.map(component => [component['bom-ref'], component])).values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'], 'en'))
  const serialSeed = sha256Buffer(Buffer.from(`${sourceCommit}:${policy.candidateName}`, 'utf8')).slice(0, 32)
  const serial = `${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-4${serialSeed.slice(13, 16)}-a${serialSeed.slice(17, 20)}-${serialSeed.slice(20, 32)}`
  writeJson(path.join(candidateRoot, 'manifest', 'cyclonedx-sbom.json'), { bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${serial}`, version: 1, metadata: { component: { type: 'application', name: 'hengzhun-regression-system', version: '0.1.0', properties: [{ name: 'hengzhun:sourceCommit', value: sourceCommit }] } }, components: unique })
  writeJson(path.join(candidateRoot, 'manifest', 'candidate.json'), { schemaVersion: 'hengzhun-i9-p8-candidate-v1', stage: 'P8_PORTABILITY_CANDIDATE', candidateName: policy.candidateName, sourceCommit, sourceTrackedProductClean: true, platform: policy.platform, bundled: { node: '20.20.2', flowise: '3.0.12', chromium: '1217' }, runtimeDataRoot: '.data', finalSubmissionArtifact: false })
  writeJson(path.join(candidateRoot, 'acceptance', 'machine-record.template.json'), { schemaVersion: 'hengzhun-i9-p8-machine-record-v1', candidateManifestSha256: '<generated by verifier>', sourceCommit, machineRole: 'second-computer', machineIdSha256: '<redacted hash>', checks: [], overallStatus: 'NOT_RUN' })
}

function buildManifest(candidateRoot) {
  const assets = {}
  for (const relative of policy.runtimeTrees) assets[relative] = hashTree(path.join(candidateRoot, ...relative.split('/')))
  const coreFiles = {}
  for (const absolute of listFiles(candidateRoot)) {
    const relative = posix(path.relative(candidateRoot, absolute))
    if (relative === 'manifest/files.sha256.json' || isMutable(relative) || isRuntimeAsset(relative)) continue
    coreFiles[relative] = { sha256: sha256File(absolute), byteLength: fs.statSync(absolute).size }
  }
  return { schemaVersion: 'hengzhun-i9-p8-hash-manifest-v1', sourceCommit: currentCommit(), algorithm: 'sha256', assets, coreFiles }
}

function verifyCandidate(candidateRoot) {
  const resolved = path.resolve(candidateRoot)
  const manifestPath = path.join(resolved, 'manifest', 'files.sha256.json')
  assert.ok(fs.existsSync(manifestPath), 'I9_P8_HASH_MANIFEST_MISSING')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 'hengzhun-i9-p8-hash-manifest-v1')
  for (const [relative, expected] of Object.entries(manifest.assets || {})) assert.deepEqual(hashTree(path.join(resolved, ...relative.split('/'))), expected, `I9_P8_ASSET_HASH_MISMATCH:${relative}`)
  const actualCore = {}
  for (const absolute of listFiles(resolved)) {
    const relative = posix(path.relative(resolved, absolute))
    if (relative === 'manifest/files.sha256.json' || isMutable(relative) || isRuntimeAsset(relative)) continue
    actualCore[relative] = { sha256: sha256File(absolute), byteLength: fs.statSync(absolute).size }
  }
  assert.deepEqual(actualCore, manifest.coreFiles, 'I9_P8_CORE_FILE_MANIFEST_MISMATCH')
  const findings = forbiddenCoreFindings(resolved)
  assert.deepEqual(findings, [], `I9_P8_FORBIDDEN_CONTENT:${findings.slice(0, 10).join(',')}`)
  const result = { status: 'PORTABLE_CANDIDATE_VERIFIED', sourceCommit: manifest.sourceCommit, candidateManifestSha256: sha256File(manifestPath), assetCount: Object.keys(manifest.assets).length, coreFileCount: Object.keys(manifest.coreFiles).length, forbiddenFindingCount: findings.length }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

function packageCandidate(destinationArgument) {
  assert.equal(process.platform, 'win32', 'I9_P8_WINDOWS_REQUIRED')
  assert.equal(process.arch, 'x64', 'I9_P8_X64_REQUIRED')
  assertTrackedProductClean()
  const sourceCommit = currentCommit()
  const defaultParent = path.join(path.dirname(repoRoot), '.hengzhun-portable', sourceCommit.slice(0, 12))
  const candidateRoot = path.resolve(destinationArgument || path.join(defaultParent, policy.candidateName))
  assert.notEqual(candidateRoot, productRoot, 'I9_P8_DESTINATION_MUST_DIFFER_FROM_SOURCE')
  if (fs.existsSync(candidateRoot)) fs.rmSync(candidateRoot, { recursive: true, force: true })
  fs.mkdirSync(candidateRoot, { recursive: true })
  copyTracked(candidateRoot)
  for (const relative of policy.runtimeTrees) copyRuntimeTree(relative, candidateRoot)
  for (const relative of policy.emptyRuntimeDirectories) fs.mkdirSync(path.join(candidateRoot, ...relative.split('/')), { recursive: true })
  writeGeneratedFiles(candidateRoot, sourceCommit)
  const findings = forbiddenCoreFindings(candidateRoot)
  assert.deepEqual(findings, [], `I9_P8_FORBIDDEN_CONTENT:${findings.slice(0, 10).join(',')}`)
  writeJson(path.join(candidateRoot, 'manifest', 'files.sha256.json'), buildManifest(candidateRoot))
  const result = verifyCandidate(candidateRoot)
  process.stdout.write(`${JSON.stringify({ status: 'P8_CANDIDATE_CREATED', candidateName: policy.candidateName, sourceCommit, manifestSha256: result.candidateManifestSha256 }, null, 2)}\n`)
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (require.main === module) {
  try {
    const command = process.argv[2]
    if (command === 'package') packageCandidate(argument('--destination'))
    else if (command === 'verify') verifyCandidate(argument('--candidate') || productRoot)
    else throw new Error('USAGE: i9-stage8-portable.cjs package [--destination path] | verify --candidate path')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  }
}

module.exports = { forbiddenCoreFindings, hashTree, verifyCandidate }
