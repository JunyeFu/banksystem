'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const source = fs.readFileSync(path.join(root, 'scripts/i10-acquire-flowise-runtime.ps1'), 'utf8')
const policy = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/flowise-acquisition-policy-v1.json'), 'utf8'))
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'flowise/app/package.json'), 'utf8'))

test('isolated acquisition installs without scripts and rebuilds only the exact native allowlist', () => {
  assert.match(source, /'ci', '--ignore-scripts', '--no-audit', '--no-fund'/)
  assert.match(source, /nativeScriptAllowlist/)
  assert.match(source, /'rebuild'\) \+ \$nativeNames/)
  assert.doesNotMatch(source, /npm\s+install\b/i)
  const policyAllowlist = policy.install.nativeScriptAllowlist.map(item => `${item.name}@${item.version}`).sort()
  const packageAllowlist = Object.entries(packageJson.allowScripts).filter(([, allowed]) => allowed).map(([name]) => name).sort()
  assert.deepEqual(policyAllowlist, packageAllowlist)
})

test('disabled vulnerable acquisition packages are fail-closed local stubs copied into staging', async () => {
  for (const [name, code] of [['xlsx', 'I10_FLOWISE_XLSX_DISABLED'], ['extract-zip', 'I10_FLOWISE_EXTRACT_ZIP_DISABLED']]) {
    assert.equal(packageJson.dependencies[name], `file:../stubs/${name}`)
    assert.equal(packageJson.overrides[name], `$${name}`)
    const stubRoot = path.join(root, 'flowise/stubs', name)
    const stubPackage = JSON.parse(fs.readFileSync(path.join(stubRoot, 'package.json'), 'utf8'))
    assert.equal(stubPackage.name, name)
    assert.equal(stubPackage.private, true)
    const disabled = require(path.join(stubRoot, 'index.js'))
    await assert.rejects(async () => name === 'extract-zip' ? disabled() : disabled.readFile(), error => error?.code === code)
  }
  assert.match(source, /Copy-Item -LiteralPath \$sourceStubsPath -Destination \$stagingStubs -Recurse/)
})

test('promotion is same-volume rename with an exact rollback backup', () => {
  assert.match(source, /\.hengzhun-node-modules-backup-/)
  assert.match(source, /Move-Item -LiteralPath \$targetNodeModules -Destination \$backupNodeModules/)
  assert.match(source, /Move-Item -LiteralPath \$stagedNodeModules -Destination \$targetNodeModules/)
  assert.match(source, /Move-Item -LiteralPath \$backupNodeModules -Destination \$targetNodeModules/)
  assert.match(source, /Assert-OwnedChild/)
})

test('staging must pass overlays, fork, Node24 probe and disposition before promotion', () => {
  const overlay = source.indexOf('apply-i9-flowise-overlays.cjs')
  const fork = source.indexOf("'apply', '--app-root', $stagingApp")
  const probe = source.indexOf("i10-flowise-runtime-probe.cjs'), '--app-root', $stagingApp")
  const disposition = source.indexOf("i10-flowise-advisory-disposition.cjs'), '--app-root', $stagingApp")
  const promotion = source.indexOf('Move-Item -LiteralPath $targetNodeModules -Destination $backupNodeModules')
  assert.ok(overlay >= 0 && overlay < fork && fork < probe && probe < disposition && disposition < promotion)
  assert.match(source, /'--acquisition-policy', \$acquisitionPolicyPath/)
})

test('risk acceptance remains unsigned and verify-only performs no acquisition mutation', () => {
  assert.equal(policy.riskAcceptance, null)
  const verifyBranch = source.slice(source.indexOf('if ($VerifyOnly)'), source.indexOf('$runId ='))
  assert.match(verifyBranch, /Invoke-CurrentGates/)
  assert.doesNotMatch(verifyBranch, /New-Item|Move-Item|Remove-Item/)
})
