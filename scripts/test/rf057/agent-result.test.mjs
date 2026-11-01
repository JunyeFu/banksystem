import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCliSuccess, failureMetadata } from './agent-result.mjs';

test('preserves the CLI business failure instead of ERR_ASSERTION',()=>{
  let failure;
  try{requireCliSuccess({code:4,terminal:{messageCode:'I10_MIDSCENE_TARGET_NOT_FOUND',journeyId:'journey_27a00e99-ae9b-4906-845d-f2ab54758f49'}},'AUTHORING');}catch(e){failure=e;}
  assert.deepEqual(failureMetadata(failure),{errorCode:'I10_MIDSCENE_TARGET_NOT_FOUND',stage:'AUTHORING',exitCode:4,journeyId:'journey_27a00e99-ae9b-4906-845d-f2ab54758f49'});
});
test('does not publish arbitrary upstream messages or identifiers',()=>{
  let failure;
  try{requireCliSuccess({code:3,terminal:{messageCode:'secret upstream text',journeyId:'secret value'}},'DOCTOR');}catch(e){failure=e;}
  assert.deepEqual(failureMetadata(failure),{errorCode:'RF057_CLI_COMMAND_FAILED',stage:'DOCTOR',exitCode:3});
});
test('successful commands return their actual terminal result',()=>{
  const terminal={status:'COMPLETED'};
  assert.equal(requireCliSuccess({code:0,terminal},'EXECUTION'),terminal);
});
