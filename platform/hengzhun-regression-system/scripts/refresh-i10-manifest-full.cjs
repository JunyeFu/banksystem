#!/usr/bin/env node
'use strict'

// Full integrity-baseline refresh for a deliberately updated portable folder.
// Unlike refresh-i10-manifest.cjs, this recomputes the bundled runtime assets.
const fs = require('node:fs')
const path = require('node:path')
const { buildManifest } = require('./i10-stage9-portable.cjs')

const root = path.resolve(__dirname, '..')
const existing = JSON.parse(fs.readFileSync(path.join(root, 'manifest', 'files.sha256.json'), 'utf8'))
const manifest = buildManifest(root, existing.sourceCommit)
fs.writeFileSync(path.join(root, 'manifest', 'files.sha256.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`I10_FULL_MANIFEST_ASSETS_REFRESHED:${Object.keys(manifest.coreFiles).length}:${Object.keys(manifest.assets).length}\n`)
