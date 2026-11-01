'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { workbenchContract } = require('../../dist/harness/src/workbench-contract.js')
const target = path.resolve(__dirname, '../../contracts/mcp/workbench-metadata-v1.json')
const expected = `${JSON.stringify(workbenchContract(), null, 2)}\n`
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== expected) throw new Error('WORKBENCH_METADATA_CONTRACT_STALE')
  console.log('WORKBENCH_METADATA_CONTRACT=PASS')
} else {
  fs.writeFileSync(target, expected)
  console.log('WORKBENCH_METADATA_CONTRACT=GENERATED')
}
