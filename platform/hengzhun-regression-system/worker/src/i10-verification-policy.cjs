'use strict';

// Generic policy dispatch. Controlled verification behavior stays in the
// explicit adapter and may never be selected from fixture names, page text or
// natural-language labels.
const fuxingDemo = require('./adapters/fuxing-bank-demo/verification-policy.cjs');
const NONE = Object.freeze({ mode: 'NONE' });

function isFuxingDemoBinding(binding) {
  return binding?.adapterId === 'fuxing-bank-demo' && binding?.adapterVersion === '1.0.0';
}

function policyForAction(action, fixtureProfile, adapterBinding) {
  if (action?.verificationPolicy?.mode) return action.verificationPolicy;
  return isFuxingDemoBinding(adapterBinding)
    ? fuxingDemo.policyForAction(action, fixtureProfile)
    : NONE;
}

module.exports = {
  POLICY: fuxingDemo.POLICY,
  isFuxingDemoBinding,
  policyForAction,
  resolveVerificationAfterAction: fuxingDemo.resolveVerificationAfterAction
};
