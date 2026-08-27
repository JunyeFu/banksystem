#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputPath = path.join(root, 'agent-cli', 'offline-sbom.cdx.json')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

function componentsFromLock(relativeLock, scope) {
  const bytes = fs.readFileSync(path.join(root, relativeLock))
  const lock = JSON.parse(bytes)
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error(`AGENT_SBOM_LOCK_INVALID:${relativeLock}`)
  const components = []
  for (const [entry, metadata] of Object.entries(lock.packages)) {
    if (!entry.includes('node_modules/') || typeof metadata?.version !== 'string') continue
    const name = entry.slice(entry.lastIndexOf('node_modules/') + 13)
    const purl = `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`
    components.push({ type: 'library', 'bom-ref': purl, name, version: metadata.version, scope, purl,
      ...(metadata.license ? { licenses: [{ expression: metadata.license }] } : {}) })
  }
  return { relativeLock, sha256: sha256(bytes), components }
}

function generate() {
  const locks = [componentsFromLock('agent-cli/package-lock.json', 'required'), componentsFromLock('controller/package-lock.json', 'required')]
  const components = [...new Map(locks.flatMap(item => item.components).map(item => [item['bom-ref'], item])).values()]
    .sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref'], 'en'))
  return {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { component: { type: 'application', name: 'hengzhun-agent-cli-offline-candidate', version: '0.2.0' },
      properties: locks.map(item => ({ name: `hengzhun:lockSha256:${item.relativeLock}`, value: item.sha256 })) },
    components,
  }
}

function serialized() { return `${JSON.stringify(generate(), null, 2)}\n` }

if (require.main === module) {
  const command = process.argv[2]
  if (command === 'write') {
    fs.writeFileSync(outputPath, serialized(), 'utf8')
    process.stdout.write(`${JSON.stringify({ status: 'AGENT_SBOM_WRITTEN', output: 'agent-cli/offline-sbom.cdx.json', componentCount: generate().components.length })}\n`)
  } else if (command === 'check') {
    if (fs.readFileSync(outputPath, 'utf8') !== serialized()) throw new Error('AGENT_SBOM_STALE')
    process.stdout.write(`${JSON.stringify({ status: 'AGENT_SBOM_CURRENT', componentCount: generate().components.length })}\n`)
  } else throw new Error('USAGE: i10-agent-offline-sbom.cjs write|check')
}

module.exports = { generate, serialized }

