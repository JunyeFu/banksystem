'use strict';

// Explicit Fuxing demonstration adapter policy.  It is reachable only from a
// plan bound to fuxing-bank-demo@2.0.0; generic tasks must never import this
// module to infer a verification page from ordinary page text.
const POLICY = Object.freeze({ NONE: 'NONE', AUTO_PERSISTED_UKEY: 'AUTO_PERSISTED_UKEY', EXTERNAL_CONFIRM_REQUIRED: 'EXTERNAL_CONFIRM_REQUIRED' });

function policyForAction(action, fixtureProfile) {
  if (action && Object.values(POLICY).includes(action.verificationPolicy?.mode)) return action.verificationPolicy;
  if (fixtureProfile === 'TRANSFER_UKEY_ORDER_QUERY' && action?.semanticTargetRef === 'TRANSFER_FIRST_CONFIRM') {
    return { mode: POLICY.AUTO_PERSISTED_UKEY, triggerAfterTargetRef: 'TRANSFER_FIRST_CONFIRM', expectedRoutes: ['/portal/verification', '/portal/transfers/'], successRoute: '/portal/transfers/', successEvidenceTargetRef: 'TRANSFER_SETTLED' };
  }
  return { mode: POLICY.NONE };
}

function fail(code) { throw Object.assign(new Error(code), { code, category: 'ENVIRONMENT' }); }

function matchesRoute(pathname,route){
  return route==='/portal/transfers/' ? /^\/portal\/transfers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname) : pathname===route;
}
async function assertSuccess(policy,handlers){
  if(!policy.successEvidenceTargetRef)return;
  if(typeof handlers.assertSuccessEvidence!=='function')fail('I10_SETTLEMENT_EVIDENCE_REQUIRED');
  await handlers.assertSuccessEvidence(policy.successEvidenceTargetRef);
}

async function resolveVerificationAfterAction(page, policy, handlers = {}) {
  if (!policy || policy.mode === POLICY.NONE) return { status: 'SKIPPED' };
  const expected = policy.expectedRoutes ?? ['/portal/verification',policy.successRoute];
  await page.waitForURL(url => expected.some(route=>matchesRoute(url.pathname,route)), { timeout: 5_000 }).catch(() => undefined);
  const current = new URL(page.url());
  if (matchesRoute(current.pathname,policy.successRoute)) {
    await assertSuccess(policy,handlers);
    return { status: 'AUTO_PASSED', pagePath: current.pathname };
  }
  if (current.pathname !== '/portal/verification') fail('I10_VERIFICATION_ROUTE_NOT_REACHED');
  if (policy.mode === POLICY.AUTO_PERSISTED_UKEY) {
    const observeControl = handlers.observeControl || handlers.resolveControl;
    const executeControl = handlers.executeControl;
    if (typeof observeControl !== 'function' || typeof executeControl !== 'function') fail('I10_UKEY_WEB_CONTROL_NOT_FOUND');
    const attempts = [];
    {
      const attempt = 1;
      const fingerprint = typeof handlers.pageFingerprint === 'function'
        ? await handlers.pageFingerprint().catch(() => undefined) : undefined;
      try {
        const observation = await observeControl({ attempt, fingerprint });
        const locator = await executeControl(observation);
        await page.waitForURL(url => matchesRoute(url.pathname,policy.successRoute), { timeout: 30_000 }).catch(() => undefined);
        const currentPath = new URL(page.url()).pathname;
        const passed = matchesRoute(currentPath,policy.successRoute);
        const record = { attempt, fingerprint, status: passed ? 'WEB_CONTROL_CLICKED' : 'FAILED' };
        attempts.push(record);
        if (typeof handlers.recordAttempt === 'function') await handlers.recordAttempt(record);
        if (passed) {
          await assertSuccess(policy,handlers);
          return { status: 'WEB_CONTROL_CLICKED', pagePath: currentPath, locator, attempts };
        }
      } catch (error) {
        const record = { attempt, fingerprint, status: 'FAILED', errorCode: error?.code || 'I10_UKEY_WEB_CONTROL_NOT_FOUND' };
        attempts.push(record);
        if (typeof handlers.recordAttempt === 'function') await handlers.recordAttempt(record);
      }
    }
    const final = Object.assign(new Error('I10_UKEY_AUTOMATION_ATTEMPTS_EXHAUSTED'), { code: 'I10_UKEY_AUTOMATION_ATTEMPTS_EXHAUSTED', attempts });
    // A persisted UKey normally completes through its web control.  When the
    // control cannot be automated, only a caller that deliberately started a
    // visible, recoverable browser session may offer human handoff.  Scheduled
    // and stability runs do not set this flag, so they remain fail-closed.
    if (handlers.allowExternalFallback === true && typeof handlers.onExternalChallenge === 'function') {
      const decision = await handlers.onExternalChallenge({ attempts });
      if (decision?.status !== 'VERIFICATION_CONFIRMED') fail('I10_VERIFICATION_NOT_CONFIRMED');
      await page.waitForURL(url => matchesRoute(url.pathname,policy.successRoute), { timeout: 30_000 }).catch(() => undefined);
      if (!matchesRoute(new URL(page.url()).pathname,policy.successRoute)) fail('I10_VERIFICATION_NOT_RESOLVED');
      await assertSuccess(policy,handlers);
      return { status: 'EXTERNAL_CONFIRMED_AFTER_AUTO_ATTEMPTS', pagePath: new URL(page.url()).pathname, attempts };
    }
    throw final;
  }
  if (policy.mode === POLICY.EXTERNAL_CONFIRM_REQUIRED) {
    if (typeof handlers.onExternalChallenge !== 'function') fail('I10_VISIBLE_BROWSER_HANDOFF_UNAVAILABLE');
    const decision = await handlers.onExternalChallenge();
    if (decision?.status !== 'VERIFICATION_CONFIRMED') fail('I10_VERIFICATION_NOT_CONFIRMED');
    await page.waitForURL(url => matchesRoute(url.pathname,policy.successRoute), { timeout: 30_000 }).catch(() => undefined);
    if (!matchesRoute(new URL(page.url()).pathname,policy.successRoute)) fail('I10_VERIFICATION_NOT_RESOLVED');
    await assertSuccess(policy,handlers);
    return { status: 'EXTERNAL_CONFIRMED', pagePath: new URL(page.url()).pathname };
  }
  fail('I10_VERIFICATION_POLICY_INVALID');
}

module.exports = { POLICY, policyForAction, resolveVerificationAfterAction };
