'use strict';

// Generic policy dispatch. Controlled verification behavior stays in the
// explicit adapter and may never be selected from fixture names, page text or
// natural-language labels.
const fuxingDemo = require('./adapters/fuxing-bank-demo/verification-policy.cjs');
const {BANK_AUTH}=require('./adapters/fuxing-bank-demo/authentication.cjs');
const NONE = Object.freeze({ mode: 'NONE' });

function isFuxingDemoBinding(binding) {
  return binding?.adapterId === BANK_AUTH.adapterId && binding?.adapterVersion === BANK_AUTH.adapterVersion;
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
