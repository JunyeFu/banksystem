import path from 'node:path';
import {createRequire} from 'node:module';
import {verifyRegisteredReports} from './rf057/release-client.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const product = path.join(root, 'platform/hengzhun-regression-system');
const require = createRequire(import.meta.url);
try {
  const lifecycle = require(path.join(product, 'scripts/i10-agent-lifecycle.cjs'));
  const environment = lifecycle.environmentWithRuntimeFile({root:product});
  if (!environment.HENGZHUN_SERVICE_TOKEN) {
    throw Object.assign(new Error('RELEASE_SERVICE_TOKEN_REQUIRED'), {code:'RELEASE_SERVICE_TOKEN_REQUIRED'});
  }
  const reports = process.argv.slice(2).map(value => path.relative(root, path.resolve(value)).replaceAll('\\', '/'));
  const result = await verifyRegisteredReports(reports, async (route, body) => {
    let response;
    try {
      response = await fetch(`http://127.0.0.1:18788${route}`, {method:'POST',
        headers:{authorization:`Bearer ${environment.HENGZHUN_SERVICE_TOKEN}`, 'content-type':'application/json'},
        body:JSON.stringify(body)});
    } catch {
      throw Object.assign(new Error('RELEASE_HARNESS_UNAVAILABLE'), {code:'RELEASE_HARNESS_UNAVAILABLE'});
    }
    const value = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error('RELEASE_VERIFICATION_REJECTED'), {code:value.errorCode ?? 'RELEASE_VERIFICATION_REJECTED'});
    }
    return value;
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.decision === 'GO' ? 0 : 5;
} catch (error) {
  console.log(JSON.stringify({decision:'NO_GO', verificationPerformed:false,
    errorCode:error.code ?? 'RELEASE_VERIFICATION_COMMAND_FAILED'}));
  process.exitCode = 5;
}
