import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEnvironmentWorkbench } from '../src/workbench-production.mjs'
import { startWorkbenchServer } from '../src/workbench-server.mjs'

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
let application
try {
  application = await createEnvironmentWorkbench({ productRoot: root })
  const service = await startWorkbenchServer({ workbench: application,
    staticRoot: path.resolve(root, '../../apps/quality-case-portal/dist-agent'), port: 18790,
    onListening: receipt => process.stdout.write(`${JSON.stringify({ status: 'LISTENING', ...receipt })}\n`) })
  let stopping = false
  const stop = async () => { if (stopping) return; stopping = true; await service.close() }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
} catch (error) {
  await application?.close()
  process.stderr.write(`${/^AGENT_[A-Z0-9_]{1,90}$/.test(error?.code) ? error.code : 'AGENT_WEB_START_FAILED'}\n`)
  process.exitCode = 3
}
