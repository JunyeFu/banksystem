#!/usr/bin/env node
'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const root = path.resolve(process.argv[2]);
const database = new Database(path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'), { readonly: true });
try {
  const integrity = database.pragma('integrity_check').map(row => row.integrity_check);
  if (integrity.length !== 1 || integrity[0] !== 'ok') throw new Error('RESTORED_SQLITE_INTEGRITY_FAILED');
  const latest = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version;
  if (latest < 8) throw new Error('RESTORED_SCHEMA_VERSION_TOO_OLD');
  process.stdout.write(JSON.stringify({ status: 'OFFLINE_RESTORE_VERIFIED', database: 'sqlite', schemaVersion: latest }) + '\n');
} finally { database.close(); }
