'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const productRoot = path.resolve(__dirname, '../..')

test('P9 exports one uncompressed governed folder and never creates an archive', () => {
  const source = fs.readFileSync(path.join(productRoot, 'scripts', 'i9-stage8-portable.cjs'), 'utf8')
  const wrapper = fs.readFileSync(path.join(productRoot, 'scripts', 'export-i9-folder.ps1'), 'utf8')
  const policy = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i9', 'p8-portability-policy-v1.json'), 'utf8'))
  assert.equal(policy.finalExportName, 'hengzhun-regression-system-windows-x64')
  assert.match(source, /I9_FINAL_FOLDER_EXPORTED/)
  assert.match(source, /archiveGenerated: false/)
  assert.match(source, /finalSubmissionArtifact: finalExport/)
  assert.match(wrapper, /'export'/)
  assert.doesNotMatch(source, /Compress-Archive|archiver|\.zip['"]/)
})
