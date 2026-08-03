#!/usr/bin/env node
'use strict'

// Source-only manifest refresh.  Runtime trees are immutable bundled assets;
// their locked aggregate hashes remain in the manifest and are recomputed by
// VERIFY.  Re-hashing hundreds of thousands of dependency files here would
// make a small source update look hung without increasing release assurance.
const path = require('node:path')
const { refreshManifest } = require('./i10-stage9-portable.cjs')

const root = path.resolve(__dirname, '..')
const result = refreshManifest(root)
process.stdout.write(`${result.status}:${Object.keys(require(path.join(root, 'manifest/files.sha256.json')).coreFiles).length}\n`)
