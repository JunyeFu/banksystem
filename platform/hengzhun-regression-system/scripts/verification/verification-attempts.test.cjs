'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { HarnessDatabase } = require('../../dist/harness/src/database.js');
const { I10Service } = require('../../dist/harness/src/i10/service.js');

test('verification attempts are append-only and uniquely keyed by task action page and ordinal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-verification-attempt-'));
  const database = await HarnessDatabase.open({ databasePath: path.join(root, 'db.sqlite'), migrationsDirectory: path.resolve(__dirname, '../../harness/migrations'), backupDirectory: path.join(root, 'backups') });
  const service = new I10Service(database, path.join(root, 'artifacts'), path.resolve(__dirname, '../..'));
  const input = { namespace: 'verification-attempt-test', workerId: 'worker-test', taskRef: 'task_attempt_test', actionOrdinal: 4, pageFingerprint: 'a'.repeat(64), policyVersion: 'VerificationPolicyV2', verificationType: 'UKEY', attemptOrdinal: 1, automationAssessment: 'FAILED', assessmentReason: 'I10_UKEY_WEB_CONTROL_NOT_FOUND', routePath: '/portal/verification' };
  await service.recordVerificationAttempt(input);
  await service.recordVerificationAttempt(input);
  const count = database.connection.prepare('SELECT COUNT(*) AS count FROM i10_verification_attempts').get().count;
  assert.equal(count, 1);
  assert.throws(() => database.connection.prepare('UPDATE i10_verification_attempts SET assessment_reason=?').run('mutated'), /I10_VERIFICATION_ATTEMPTS_IMMUTABLE/);
  await database.close();
});
