'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.resolve(__dirname, '..')
const databases = [
  ['harness', path.join(root, '.data', 'sqlite', 'regression_platform.sqlite')],
  ['flowise', path.join(root, '.data', 'flowise', 'database.sqlite')]
]

const results = []
for (const [name, file] of databases) {
  assert.ok(fs.existsSync(file), `${name} SQLite database is missing`)
  const database = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const quickCheck = database.pragma('quick_check', { simple: true })
    assert.equal(quickCheck, 'ok', `${name} SQLite quick_check failed`)
    results.push({ name, quickCheck, byteLength: fs.statSync(file).size })
  } finally { database.close() }
}

process.stdout.write(`${JSON.stringify({ status: 'PASS', databases: results }, null, 2)}\n`)
