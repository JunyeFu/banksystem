'use strict'

const path = require('node:path')
const { startHarness } = require('../../dist/harness/src/server.js')

async function main() {
  const productRoot = path.resolve(__dirname, '..', '..')
  const started = await startHarness({
    productRoot,
    databasePath: process.env.RF041_DATABASE_PATH,
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: process.env.RF041_BACKUP_ROOT,
    artifactRoot: process.env.RF041_ARTIFACT_ROOT,
    security: { serviceToken: process.env.HENGZHUN_SERVICE_TOKEN, allowedClients: ['127.0.0.1'] },
    schedulerIntervalMs: 0,
    host: '127.0.0.1',
    port: Number(process.env.PORT),
    releaseIdentityHash: process.env.HENGZHUN_RELEASE_IDENTITY_HASH,
  })
  const now = new Date().toISOString()
  started.application.database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,?,1,?,?)`)
    .run(process.env.HENGZHUN_NAMESPACE, 'ACTIVE', now, now)
  if (process.env.RF043_CREDENTIAL_REF) {
    const sessionId = 'credsession_12345678-1234-1234-1234-123456789abc'
    started.application.database.connection.prepare(`INSERT INTO i10_credential_sessions(
      session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,'READY',?,1,'2099-01-01T00:00:00.000Z',?,?)`)
      .run(sessionId, process.env.HENGZHUN_NAMESPACE, 'rf043-fixture-credential', 'RF043 test credential', '0'.repeat(64), process.env.RF043_CREDENTIAL_REF, now, now)
    started.application.database.connection.prepare(`INSERT INTO i10_credential_refs(
      credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at
    ) VALUES (?,?,?,?,?,'WINDOWS_DPAPI_CURRENT_USER',?)`)
      .run(process.env.RF043_CREDENTIAL_REF, process.env.HENGZHUN_NAMESPACE, sessionId, '.data/credentials/rf043.bin', '1'.repeat(64), now)
  }
  process.stdout.write('READY\n')
  const close = async () => {
    await new Promise((resolve) => started.server.close(resolve))
    await started.application.close()
    process.exit(0)
  }
  process.once('SIGTERM', close)
  process.once('SIGINT', close)
}

main().catch((error) => {
  process.stderr.write(`${error?.code || 'RF041_HARNESS_FIXTURE_FAILED'}\n`)
  process.exitCode = 1
})
