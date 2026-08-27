'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const productRoot = path.resolve(__dirname, '..', '..')
const release = require('../../scripts/i10-release-identity.cjs')
const controllerManifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'controller', 'controller-release-manifest-v1.json'), 'utf8'))

test('ReleaseIdentity v3 contains the complete non-secret controller component', () => {
  const identity = release.currentReleaseIdentity({ requireDeployed: false })
  assert.equal(identity.schemaVersion, 'hengzhun-i10-release-identity-v3')
  assert.equal(identity.controller.kind, 'langgraph-deepagents-v1')
  assert.equal(identity.controller.checkpointSchemaVersion, '1')
  assert.equal(identity.controller.controllerCodeSetFileCount, controllerManifest.releaseFiles.length)
  assert.equal(identity.controller.modelConfigIdentity.bindingStatus, 'UNBOUND_INACTIVE')
  assert.doesNotMatch(JSON.stringify(identity.controller), /(?:password|secret|token|api.?key|endpoint|base.?url)/i)
})

test('every governed controller file changes the controller identity on byte drift', () => {
  const baseline = release.currentControllerIdentity()
  for (const changedPath of baseline.files) {
    const changed = release.currentControllerIdentity({
      readFile(relative) {
        const bytes = fs.readFileSync(path.join(productRoot, ...relative.split('/')))
        return relative === changedPath ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes
      },
    })
    assert.notEqual(changed.controllerCodeSetHash, baseline.controllerCodeSetHash, changedPath)
  }
})

test('controller manifest rejects secret-like identity fields', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rf013-controller-identity-'))
  try {
    const sourceManifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'controller', 'controller-release-manifest-v1.json'), 'utf8'))
    for (const relative of sourceManifest.releaseFiles) {
      const target = path.join(temporaryRoot, ...relative.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(productRoot, ...relative.split('/')), target)
    }
    const manifestPath = path.join(temporaryRoot, 'controller', 'controller-release-manifest-v1.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.modelConfigIdentity.apiKey = 'forbidden'
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.throws(() => release.currentControllerIdentity({ productRoot: temporaryRoot }), /I10_CONTROLLER_IDENTITY_SECRET_FIELD/)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('v2 and v3 with the same hash never compare equal', () => {
  const identityHash = 'a'.repeat(64)
  assert.equal(release.sameReleaseIdentity(
    { schemaVersion: 'hengzhun-i10-release-identity-v2', identityHash },
    { schemaVersion: 'hengzhun-i10-release-identity-v3', identityHash },
  ), false)
})
