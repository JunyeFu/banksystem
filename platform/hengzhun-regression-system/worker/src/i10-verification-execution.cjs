'use strict';

// Shared execution bridge for every browser runner.  Midscene observes a
// webpage control; Playwright performs the click and all deterministic checks.
// Keeping this bridge separate prevents the authoring runner from becoming an
// accidental, more capable execution path than formal or stability execution.
const { sha256 } = require('./i10-worker-utils.cjs');
const { resolveVerificationAfterAction } = require('./i10-verification-policy.cjs');
const { observeUkeyVerificationControl, executePlaywrightClick } = require('./i10-midscene-candidate-authoring.cjs');

function verificationModes(manifest) {
  const values = Array.isArray(manifest?.verificationPolicyModes) ? manifest.verificationPolicyModes : [];
  return [...new Set(values.filter(value => ['NONE', 'AUTO_PERSISTED_UKEY', 'EXTERNAL_CONFIRM_REQUIRED'].includes(value)))].sort();
}

function requiresVisibleVerification(manifest, allowExternalFallback) {
  return allowExternalFallback === true && verificationModes(manifest)
    .some(value => value === 'AUTO_PERSISTED_UKEY' || value === 'EXTERNAL_CONFIRM_REQUIRED');
}

async function pageFingerprint(page) {
  try {
    const url = new URL(page.url());
    const title = await page.title().catch(() => '');
    return sha256(`${url.origin}${url.pathname}:${title}`);
  } catch {
    return sha256('unavailable-page');
  }
}

async function runVerificationPolicy(page, policy, options = {}) {
  return resolveVerificationAfterAction(page, policy, {
    observeControl: async () => observeUkeyVerificationControl(page),
    executeControl: async observation => executePlaywrightClick(page, observation?.locator),
    pageFingerprint: async () => pageFingerprint(page),
    recordAttempt: async attempt => {
      if (typeof options.onVerificationAttempt !== 'function') return undefined;
      const path = (() => { try { return new URL(page.url()).pathname; } catch { return undefined; } })();
      return options.onVerificationAttempt({
        namespace: options.namespace,
        taskRef: options.taskRef,
        actionOrdinal: options.actionOrdinal,
        pageFingerprint: attempt.fingerprint || await pageFingerprint(page),
        policyVersion: 'VerificationPolicyV2',
        verificationType: 'UKEY',
        attemptOrdinal: attempt.attempt,
        automationAssessment: attempt.status === 'WEB_CONTROL_CLICKED' ? 'WEB_CONTROL_CLICKED' : 'FAILED',
        assessmentReason: attempt.errorCode || attempt.status,
        ...(path ? { routePath: path } : {})
      });
    },
    assertSuccessEvidence: async targetRef => {
      if (typeof options.assertSuccessEvidence !== 'function') {
        throw Object.assign(new Error('I10_VERIFICATION_SUCCESS_EVIDENCE_HANDLER_REQUIRED'), { code: 'I10_VERIFICATION_SUCCESS_EVIDENCE_HANDLER_REQUIRED' });
      }
      return options.assertSuccessEvidence(targetRef);
    },
    allowExternalFallback: options.allowExternalFallback === true,
    onExternalChallenge: options.onExternalChallenge
  });
}

module.exports = { pageFingerprint, requiresVisibleVerification, runVerificationPolicy, verificationModes };
