import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { agentWorkbenchOpenApi } from '../src/workbench-contract.mjs'

const { stringify } = createRequire(new URL('../../package.json', import.meta.url))('yaml')
const target = new URL('../../../../contracts/openapi/agent-workbench-api.yaml', import.meta.url)
const expected = stringify(agentWorkbenchOpenApi(), { lineWidth: 140, aliasDuplicateObjects: true })
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== expected) throw new Error('AGENT_OPENAPI_GENERATED_ARTIFACT_STALE')
  console.log('AGENT_OPENAPI=PASS')
} else {
  await writeFile(target, expected)
  console.log('AGENT_OPENAPI=GENERATED')
}
