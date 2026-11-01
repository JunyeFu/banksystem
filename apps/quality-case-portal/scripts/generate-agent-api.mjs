import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import { parse } from 'yaml';

const source = new URL('../../../contracts/openapi/agent-workbench-api.yaml', import.meta.url);
const target = new URL('../src/generated/agent-api.ts', import.meta.url);
const document = parse(await readFile(source, 'utf8'));
const routes = Object.fromEntries(Object.entries(document.paths).flatMap(([path, methods]) =>
  Object.entries(methods).filter(([, operation]) => operation.operationId).map(([method, operation]) => [operation.operationId, {
    method: method.toUpperCase(), path: `${document.servers[0].url}${path}`,
  }])));
const expected = '// Generated from contracts/openapi/agent-workbench-api.yaml. Do not edit.\n'
  + astToString(await openapiTS(document))
  + `\nexport const agentOperations = ${JSON.stringify(routes, null, 2)} as const;\n`;
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== expected) throw new Error('AGENT_API_GENERATED_ARTIFACT_STALE');
  console.log('AGENT_API=PASS');
} else {
  await writeFile(target, expected);
  console.log('AGENT_API=GENERATED');
}
