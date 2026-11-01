#!/usr/bin/env node
'use strict'

const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.resolve(__dirname, '..')
const database = new Database(path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'), { readonly: true })
try {
  const row = database.prepare(`
    SELECT json_extract(cv.definition_json, '$.credentialRef') AS credential_ref
    FROM cases c JOIN case_versions cv ON cv.case_id=c.case_id AND cv.version=c.current_version
    WHERE c.title LIKE 'L1 只读浏览器测试：复兴银行客户门户姓名与头像一致性验证'
    ORDER BY c.updated_at DESC LIMIT 1
  `).get()
  if (!row?.credential_ref) throw new Error('I10_LIVE_CREDENTIAL_NOT_FOUND')
  process.stdout.write(`${row.credential_ref}\n`)
} finally {
  database.close()
}
