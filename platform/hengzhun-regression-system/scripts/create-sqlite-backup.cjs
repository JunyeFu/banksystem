#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { HarnessDatabase } = require('../dist/harness/src/database.js');

(async () => {
  const [databasePath, migrationsDirectory, backupDirectory] = process.argv.slice(2);
  const database = await HarnessDatabase.open({ databasePath, migrationsDirectory, backupDirectory });
  try {
    const backup = await database.createBackup('i6-offline');
    process.stdout.write(path.resolve(backup) + '\n');
  } finally {
    await database.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 2; });
