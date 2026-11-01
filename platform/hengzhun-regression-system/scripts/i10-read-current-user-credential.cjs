#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { unprotectWithCurrentUserDpapi } = require('../dist/harness/src/i10/dpapi.js')

const root = path.resolve(__dirname, '..')
const credentialRef = String(process.argv[2] || '')
if (!/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) throw new Error('I10_CREDENTIAL_REF_INVALID')
const db = new Database(path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'), { readonly: true })
try {
  const row = db.prepare('SELECT encrypted_blob_path, encrypted_blob_sha256 FROM i10_credential_refs WHERE credential_ref=?').get(credentialRef)
  if (!row) throw new Error('I10_CREDENTIAL_REF_NOT_FOUND')
  const blobPath = path.join(root, row.encrypted_blob_path)
  const encrypted = fs.readFileSync(blobPath)
  const plaintext = unprotectWithCurrentUserDpapi(encrypted)
  try {
    process.stdout.write(`${plaintext.toString('utf8')}\n`)
  } finally {
    plaintext.fill(0)
  }
} finally {
  db.close()
}
