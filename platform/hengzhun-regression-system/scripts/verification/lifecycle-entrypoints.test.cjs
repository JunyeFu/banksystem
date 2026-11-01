'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const lifecycle = require('../i10-agent-lifecycle.cjs')

test('declared lifecycle entrypoints expose only the current CLI lifecycle', () => {
  assert.match(pkg.scripts['start:agent'], /i10-agent-lifecycle\.cjs start/)
  assert.match(pkg.scripts['status:agent'], /i10-agent-current-status\.cjs/)
  assert.match(pkg.scripts['stop:agent'], /i10-agent-lifecycle\.cjs stop/)
  assert.equal(pkg.scripts['start:i9'], undefined)
  assert.equal(pkg.scripts['status:i9'], undefined)
  assert.equal(pkg.scripts['stop:i9'], undefined)
})

test('managed lifecycle owns exactly Harness MCP Worker and rejects Flowise as a current service', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'managed-process-spec-v1.json'), 'utf8'))
  assert.deepEqual(spec.services.map((service) => service.name), ['harness', 'mcp', 'worker'])
  assert.equal(spec.services.some((service) => /flowise/i.test(JSON.stringify(service))), false)
  assert.equal(lifecycle.validateManagedProcessSpec(spec), spec)
})

test('bank customer provisioner normalizes its container shell program to LF before docker exec', () => {
  const source = fs.readFileSync(path.resolve(root, 'scripts', 'i10-provision-fuxing-demo-customer.ps1'), 'utf8')
  const normalization = '$containerCommand = $containerCommand.Replace("`r`n", "`n")'
  const normalizationIndex = source.indexOf(normalization)
  const dockerExecIndex = source.indexOf('| docker exec -e "HZ_USERNAME=$username" -i $keycloakContainer sh -lc $containerCommand')
  assert.ok(normalizationIndex >= 0)
  assert.ok(dockerExecIndex > normalizationIndex)
})
