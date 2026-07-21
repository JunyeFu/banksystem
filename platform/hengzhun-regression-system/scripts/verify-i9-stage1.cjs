'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { hashRuntimeTree, sha256File } = require('./i9-runtime-tree.cjs')

const root = path.resolve(__dirname, '..')
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
const manifest = readJson('flowise/manifests/i9-p1-runtime-baseline.json')
const declaration = readJson('flowise/runtime-package.json')
const config = readJson('config/i9.runtime.example.json')
const schema = readJson('config/i9.runtime.schema.json')

function resolveProductPath(relative) {
  assert.equal(path.isAbsolute(relative), false, `absolute path forbidden: ${relative}`)
  const resolved = path.resolve(root, relative)
  assert.ok(resolved === root || resolved.startsWith(`${root}${path.sep}`), `path escapes product root: ${relative}`)
  return resolved
}

assert.equal(manifest.schemaVersion, 'hengzhun-i9-p1-runtime-baseline-v1')
assert.equal(manifest.i8BaselineCommit, '29c3428')
assert.equal(config.schemaVersion, 'hengzhun-i9-runtime-v1')
assert.deepEqual(config.network, { host: '127.0.0.1', flowisePort: 3006, harnessPort: 18788, mcpPort: 18789 })
assert.equal(schema.properties.network.properties.host.const, '127.0.0.1')

for (const relative of Object.values(config.paths)) resolveProductPath(relative)
for (const variable of Object.values(config.credentialVariables)) {
  assert.match(variable, /^[A-Z][A-Z0-9_]{2,63}$/)
  assert.ok(!variable.toLowerCase().includes('secret-value'))
}

const formalFiles = [
  'flowise/runtime-package.json',
  'flowise/manifests/i9-p1-runtime-baseline.json',
  'config/i9.runtime.schema.json',
  'config/i9.runtime.example.json'
]
for (const relative of formalFiles) {
  const normalized = fs.readFileSync(path.join(root, relative), 'utf8').toLowerCase()
  for (const forbidden of ['.data/probes', '.data\\probes', 'docker', 'wsl']) {
    assert.equal(normalized.includes(forbidden), false, `${relative} contains forbidden runtime dependency: ${forbidden}`)
  }
}

const nodeExecutable = resolveProductPath(manifest.formalPaths.nodeExecutable)
const flowiseApp = resolveProductPath(manifest.formalPaths.flowiseApp)
const entrypoint = resolveProductPath(manifest.formalPaths.flowiseEntrypoint)
const chromium = resolveProductPath(manifest.formalPaths.chromiumExecutable)
for (const required of [nodeExecutable, flowiseApp, entrypoint, chromium]) assert.ok(fs.existsSync(required), `missing formal dependency: ${required}`)

assert.equal(path.resolve(process.execPath).toLowerCase(), path.resolve(nodeExecutable).toLowerCase(), 'verification must run with bundled Node')
assert.equal(childProcess.execFileSync(nodeExecutable, ['--version'], { encoding: 'utf8' }).trim(), 'v20.20.2')
childProcess.execFileSync(nodeExecutable, ['--check', entrypoint], { stdio: 'pipe' })

const expectedVersions = declaration.dependencies
for (const [packageName, expected] of Object.entries(expectedVersions)) {
  const actual = readJson(`flowise/app/node_modules/${packageName}/package.json`).version
  assert.equal(actual, expected, `${packageName} version drift`)
}

assert.equal(sha256File(resolveProductPath(manifest.formalPaths.dependencyDeclaration)), manifest.hashes.dependencyDeclarationSha256)
assert.equal(sha256File(resolveProductPath(manifest.formalPaths.dependencyLock)), manifest.hashes.dependencyLockSha256)
const runtimeTree = hashRuntimeTree(flowiseApp)
assert.deepEqual(runtimeTree, manifest.hashes.runtimeTree)

const registryPath = path.resolve(root, '..', '..', '..', '全局端口注册表.md')
assert.ok(fs.existsSync(registryPath), 'global port registry missing')
const registry = fs.readFileSync(registryPath, 'utf8')
for (const [service, port] of Object.entries(manifest.ports)) {
  const prefix = `| TCP | ${port} | \`banksystem\` |`
  assert.ok(registry.split(/\r?\n/).some(line => line.startsWith(prefix) && line.toLowerCase().includes(service.toLowerCase())), `formal ${service} port is not registered`)
}

console.log(JSON.stringify({
  status: 'PASS',
  stage: 'I9-P1',
  node: manifest.versions.node,
  flowise: manifest.versions.flowise,
  runtimeTree: manifest.hashes.runtimeTree,
  ports: manifest.ports
}, null, 2))
