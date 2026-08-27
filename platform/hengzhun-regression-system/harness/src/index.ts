import path from 'node:path';
import fs from 'node:fs';
import { startHarness } from './server';

export function resolveHarnessHost(value: string | undefined): string {
  const host = (value ?? '127.0.0.1').trim().toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw Object.assign(new Error('Harness listener host must be an explicit loopback address.'), {
      code: 'HENGZHUN_HOST_NOT_LOOPBACK'
    });
  }
  return host;
}

async function main(): Promise<void> {
  const productRoot = path.resolve(process.env.HENGZHUN_PRODUCT_ROOT ?? process.cwd());
  const { server, application } = await startHarness({
    productRoot,
    databasePath: process.env.HENGZHUN_DATABASE_PATH,
    backupDirectory: process.env.HENGZHUN_DATABASE_BACKUP_PATH,
    artifactRoot: process.env.HENGZHUN_ARTIFACT_ROOT,
    host: resolveHarnessHost(process.env.HOST),
    port: Number(process.env.PORT ?? 18788)
  });
  const address = server.address();
  process.stdout.write(JSON.stringify({ event: 'listening', service: 'hengzhun-harness', address }) + '\n');

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    await application.close();
    process.exit(0);
  };
  const stopFile = process.env.HENGZHUN_STOP_FILE;
  const stopPoller = stopFile ? setInterval(() => {
    if (fs.existsSync(stopFile)) void shutdown();
  }, 250) : undefined;
  stopPoller?.unref();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  void main().catch(error => {
    const errorCode = typeof (error as {code?: unknown})?.code === 'string'
      ? String((error as {code: string}).code)
      : 'HARNESS_STARTUP_FAILED';
    process.stderr.write(JSON.stringify({ event: 'startup_failed', errorCode, message: error instanceof Error ? error.message : 'unknown' }) + '\n');
    process.exitCode = 1;
  });
}
