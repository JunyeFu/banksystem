import path from 'node:path';
import { startHarness } from './server';

async function main(): Promise<void> {
  const productRoot = path.resolve(process.env.HENGZHUN_PRODUCT_ROOT ?? process.cwd());
  const { server, application } = await startHarness({
    productRoot,
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 18788)
  });
  const address = server.address();
  process.stdout.write(JSON.stringify({ event: 'listening', service: 'hengzhun-harness', address }) + '\n');

  const shutdown = async (): Promise<void> => {
    server.close();
    await application.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'startup_failed', errorCode: 'HARNESS_STARTUP_FAILED', message: error instanceof Error ? error.message : 'unknown' }) + '\n');
  process.exitCode = 1;
});
