'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { HarnessDatabase } = require('../../dist/harness/src/database.js');

const productRoot = path.resolve(__dirname, '../..');

async function openTemporaryDatabase(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i2-db-'));
  const options = {
    databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, 'backups')
  };
  const database = await HarnessDatabase.open(options);
  t.after(async () => {
    if (database.connection.open) await database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { database, options, root };
}

test('SQLite applies I2 migration and mandatory pragmas', async t => {
  const { database } = await openTemporaryDatabase(t);
  assert.equal(database.connection.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(database.connection.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(database.connection.pragma('busy_timeout', { simple: true }), 5000);
  assert.deepEqual(database.integrityCheck(), ['ok']);
  const tables = database.connection.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const expected of [
    'schema_migrations', 'namespaces', 'cases', 'case_versions', 'plans', 'scripts',
    'script_versions', 'tasks', 'runs', 'decisions', 'artifacts', 'audit_events',
    'security_events', 'idempotency_keys'
  ]) assert.ok(tables.includes(expected), `missing table ${expected}`);
});

test('single writer queue serializes concurrent writes without loss', async t => {
  const { database } = await openTemporaryDatabase(t);
  const timestamp = new Date().toISOString();
  await Promise.all(Array.from({ length: 100 }, (_, index) => database.write(db => {
    db.prepare(`
      INSERT INTO security_events(event_id, outcome, reason_code, remote_address, request_id, created_at)
      VALUES (?, 'ACCEPTED', 'CONCURRENCY_TEST', '127.0.0.1', ?, ?)
    `).run(`sec-${index}`, `req-${index}`, timestamp);
  })));
  const count = database.connection.prepare("SELECT count(*) AS count FROM security_events WHERE reason_code='CONCURRENCY_TEST'").get().count;
  assert.equal(count, 100);
  assert.deepEqual(database.quickCheck(), ['ok']);
});

test('foreign keys reject orphan state and failed writes roll back', async t => {
  const { database } = await openTemporaryDatabase(t);
  await assert.rejects(
    database.write(db => db.prepare(`
      INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
      VALUES ('case-orphan', 'missing', 1, 'DRAFT', 'x', 'x', 'LOW', 'now', 'now')
    `).run()),
    /FOREIGN KEY constraint failed/
  );
  assert.equal(database.connection.prepare("SELECT count(*) AS count FROM cases WHERE case_id='case-orphan'").get().count, 0);
});

test('audit chain is append-only', async t => {
  const { database } = await openTemporaryDatabase(t);
  const timestamp = new Date().toISOString();
  await database.write(db => {
    db.prepare("INSERT INTO namespaces(namespace, status, version, created_at, updated_at) VALUES ('audit-test', 'ACTIVE', 1, ?, ?)").run(timestamp, timestamp);
    db.prepare(`
      INSERT INTO audit_events(event_id, namespace, actor_type, action, object_type, object_id, outcome, correlation_id, details_json, created_at)
      VALUES ('evt-1', 'audit-test', 'SYSTEM', 'test', 'TEST', '1', 'SUCCEEDED', 'req-1', '{}', ?)
    `).run(timestamp);
  });
  await assert.rejects(database.write(db => db.prepare("UPDATE audit_events SET outcome='FAILED' WHERE event_id='evt-1'").run()), /AUDIT_IMMUTABLE/);
  await assert.rejects(database.write(db => db.prepare("DELETE FROM audit_events WHERE event_id='evt-1'").run()), /AUDIT_IMMUTABLE/);
  assert.equal(database.connection.prepare("SELECT outcome FROM audit_events WHERE event_id='evt-1'").get().outcome, 'SUCCEEDED');
});

test('backup uses SQLite backup API and survives restore/restart', async t => {
  const { database, options, root } = await openTemporaryDatabase(t);
  const timestamp = new Date().toISOString();
  await database.write(db => {
    db.prepare("INSERT INTO namespaces(namespace, status, version, created_at, updated_at) VALUES ('restore-test', 'ACTIVE', 1, ?, ?)").run(timestamp, timestamp);
  });
  const backupPath = await database.createBackup('acceptance');
  const backup = new Database(backupPath, { readonly: true });
  assert.equal(backup.prepare("SELECT status FROM namespaces WHERE namespace='restore-test'").get().status, 'ACTIVE');
  assert.deepEqual(backup.pragma('integrity_check').map(row => row.integrity_check), ['ok']);
  backup.close();

  await database.close();
  const restoredPath = path.join(root, 'restored', 'regression_platform.sqlite');
  fs.mkdirSync(path.dirname(restoredPath), { recursive: true });
  fs.copyFileSync(backupPath, restoredPath);
  const restored = await HarnessDatabase.open({ ...options, databasePath: restoredPath });
  assert.equal(restored.connection.prepare("SELECT status FROM namespaces WHERE namespace='restore-test'").get().status, 'ACTIVE');
  assert.deepEqual(restored.integrityCheck(), ['ok']);
  await restored.close();
});
