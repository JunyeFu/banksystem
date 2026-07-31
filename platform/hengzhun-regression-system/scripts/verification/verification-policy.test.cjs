'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { policyForAction, resolveVerificationAfterAction } = require('../../worker/src/i10-verification-policy.cjs');
const fs = require('node:fs');
const path = require('node:path');

function pageAt(pathname) {
  let current = pathname;
  return {
    url: () => `http://127.0.0.1:18082${current}`,
    waitForURL: async predicate => { assert.equal(typeof predicate, 'function'); },
    moveTo: value => { current = value; }
  };
}

const fuxingBinding = Object.freeze({ adapterId: 'fuxing-bank-demo', adapterVersion: '1.0.0' });

test('login actions never infer verification from static page wording', async () => {
  const policy = policyForAction({ semanticTargetRef: 'LOGIN_SUBMIT' }, 'LOGIN_PROFILE', fuxingBinding);
  assert.equal(policy.mode, 'NONE');
  const result = await resolveVerificationAfterAction(pageAt('/portal/login'), policy);
  assert.equal(result.status, 'SKIPPED');
});

test('persisted UKey skips when first confirmation already reaches order query', async () => {
  const page = pageAt('/portal/orders/query');
  const policy = policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding);
  let evidence = 0;
  const result = await resolveVerificationAfterAction(page, policy, { assertSuccessEvidence: async ref => { evidence += 1; assert.equal(ref, 'ORDER_NUMBER'); } });
  assert.equal(result.status, 'AUTO_PASSED');
  assert.equal(evidence, 1);
});

test('verification route observes a control then delegates the only click to the Playwright executor', async () => {
  const page = pageAt('/portal/verification');
  const policy = policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding);
  let observations = 0;
  let clicks = 0;
  const result = await resolveVerificationAfterAction(page, policy, {
    observeControl: async () => { observations += 1; return { locator: { kind: 'ROLE', value: 'button|确认验证' } }; },
    executeControl: async observation => { clicks += 1; page.moveTo('/portal/orders/query'); return observation.locator; },
    assertSuccessEvidence: async () => undefined
  });
  assert.equal(result.status, 'WEB_CONTROL_CLICKED');
  assert.equal(observations, 1);
  assert.equal(clicks, 1);
});

test('verification route fails closed without a verified web control', async () => {
  await assert.rejects(
    resolveVerificationAfterAction(pageAt('/portal/verification'), policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding)),
    error => error.code === 'I10_UKEY_WEB_CONTROL_NOT_FOUND'
  );
});

test('persisted UKey uses three independent observations before it asks for handoff', async () => {
  const page = pageAt('/portal/verification');
  let observations = 0;
  const attempts = [];
  await assert.rejects(
    resolveVerificationAfterAction(page, policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding), {
      observeControl: async () => { observations += 1; throw Object.assign(new Error('not found'), { code: 'I10_UKEY_WEB_CONTROL_NOT_FOUND' }); },
      executeControl: async () => { throw new Error('must not execute without an observation'); },
      pageFingerprint: async () => `fingerprint-${observations}`,
      recordAttempt: async attempt => attempts.push(attempt)
    }),
    error => error.code === 'I10_UKEY_AUTOMATION_ATTEMPTS_EXHAUSTED'
  );
  assert.equal(observations, 3);
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts.map(item => item.attempt), [1, 2, 3]);
});

test('workers do not scan whole-page static text after every action', () => {
  const root = path.resolve(__dirname, '..', '..');
  const authoring = fs.readFileSync(path.join(root, 'worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  const formal = fs.readFileSync(path.join(root, 'worker/src/i8-formal-runner.cjs'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'harness/src/i8/script-package-builder.ts'), 'utf8');
  assert.doesNotMatch(authoring, /classifyVerificationChallenge\(await page\.locator\('body'\)\.innerText/);
  assert.doesNotMatch(formal, /classifyVerificationChallenge/);
  assert.doesNotMatch(builder, /验证码\|U盾\|OTP\|PIN\|human verification\).*humanVerification/);
});

test('generic targets never inherit the Fuxing U-key policy without a frozen adapter binding', () => {
  const policy = policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY');
  assert.equal(policy.mode, 'NONE');
});

test('formal and stability workers normalize a target launch page to its origin root', () => {
  const root = path.resolve(__dirname, '..', '..');
  const { formalBaseUrl, runtimeAllowedOrigins } = require(path.join(root, 'worker/src/i8-formal-runner.cjs'));
  const { stabilityAllowedOrigins } = require(path.join(root, 'worker/src/i8-stability-runner.cjs'));
  const task = { execution: { targetProfile: {
    launchUrl: 'http://127.0.0.1:18082/portal/login',
    status: 'ACTIVE',
    adapterBinding: { adapterId: 'fuxing-bank-demo', adapterVersion: '1.0.0' }
  } } };
  const baseUrl = formalBaseUrl(task, {}, {});
  assert.equal(baseUrl, 'http://127.0.0.1:18082/');
  assert.ok(runtimeAllowedOrigins(task, baseUrl).has('http://127.0.0.1:19000'));
  assert.ok(stabilityAllowedOrigins(task.execution.targetProfile, baseUrl).includes('http://127.0.0.1:19000'));
});

test('Midscene remains a locator observer and never invokes a browser action API', () => {
  const root = path.resolve(__dirname, '..', '..');
  const authoring = fs.readFileSync(path.join(root, 'worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  const legacyPolicy = fs.readFileSync(path.join(root, 'worker/src/i10-verification-policy.cjs'), 'utf8');
  const policy = fs.readFileSync(path.join(root, 'worker/src/adapters/fuxing-bank-demo/verification-policy.cjs'), 'utf8');
  assert.match(authoring, /async function observeTargetWithMidscene/);
  assert.match(authoring, /withMidsceneLocateTimeout\(\(\) => agent\.aiLocate\(prompt\)\)/);
  assert.doesNotMatch(authoring, /\.ai(?:Action|Tap|Click|Input|Hover|Scroll)\s*\(/);
  assert.match(authoring, /async function executePlaywrightClick/);
  assert.match(legacyPolicy, /isFuxingDemoBinding/);
  assert.match(legacyPolicy, /adapterId === 'fuxing-bank-demo'/);
  assert.match(policy, /const observation = await observeControl/);
  assert.match(policy, /const locator = await executeControl\(observation\)/);
});

test('transfer template delegates persisted U-key navigation to the verification policy exactly once', () => {
  const root = path.resolve(__dirname, '..', '..');
  const adapter = fs.readFileSync(path.join(root, 'harness/src/i8/adapters/fuxing-bank-demo.ts'), 'utf8');
  const transferTemplate = adapter.slice(adapter.indexOf('export const FUXING_BANK_DEMO_TRANSFER_TEMPLATE'), adapter.indexOf('export function fuxingBankDemoPageSignature'));
  assert.match(transferTemplate, /TRANSFER_FIRST_CONFIRM/);
  assert.match(transferTemplate, /PORTAL_ORDER_QUERY/);
  assert.doesNotMatch(transferTemplate, /routePatternRef: 'PORTAL_VERIFICATION'/);
  assert.doesNotMatch(transferTemplate, /target: 'UKEY_VERIFY'/);
});
