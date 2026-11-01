import assert from 'node:assert/strict';
import {cents} from './load.mjs';
export function assertAgentEvidence(value,{identity,journeyId,targetProfile,expectedOrigin}) {
  assert.equal(value.releaseIdentityHash??value.identityHash,identity,'AGENT_IDENTITY_MISMATCH');
  assert.ok(value.schemaVersion==='hengzhun-cli-evidence-verification/v1'&&value.verdict==='VERIFIED'&&
    value.journeyId===journeyId&&value.journeyTerminal===true&&value.runStatus==='PASSED'&&
    value.taskStatus==='SUCCEEDED'&&value.runId&&value.taskId,'AGENT_TERMINAL_EVIDENCE_REQUIRED');
  assert.equal(new URL(targetProfile.launchUrl).origin,expectedOrigin,'AGENT_REAL_BANK_TARGET_REQUIRED');
  assert.ok(Array.isArray(value.artifacts)&&['DOM','SCREENSHOT','TRACE','NETWORK','LEDGER'].every(kind=>
    value.artifacts.some(a=>a.evidenceKind===kind))&&value.artifacts.every(a=>a.artifactId&&
    a.sha256Verified===true&&a.sizeVerified===true&&/^[a-f0-9]{64}$/.test(a.sha256)&&
    Number.isSafeInteger(a.size)&&a.size>=0),'AGENT_ARTIFACT_VERIFICATION_REQUIRED');
  return value;
}

export function assertAgentTransfer({before,after,customer,operations,payment,projection},
  {sourceAccountId,targetAccountId,beneficiaryRef,purpose}) {
  for(const transfer of [customer,operations]){
    assert.equal(transfer.status,'SETTLED','AGENT_TRANSFER_NOT_SETTLED');
    assert.equal(transfer.sourceAccountId,sourceAccountId,'AGENT_TRANSFER_PAYER_MISMATCH');
    assert.equal(transfer.destinationAccountId,targetAccountId,'AGENT_TRANSFER_PAYEE_MISMATCH');
    assert.equal(transfer.beneficiaryId,beneficiaryRef,'AGENT_TRANSFER_BENEFICIARY_MISMATCH');
    assert.equal(transfer.currency,'CNY','AGENT_TRANSFER_CURRENCY_MISMATCH');
    assert.equal(cents(transfer.amount),100n,'AGENT_TRANSFER_AMOUNT_MISMATCH');
    assert.equal(transfer.reference,purpose,'AGENT_TRANSFER_PURPOSE_MISMATCH');
    assert.ok(transfer.transferId&&transfer.correlationId&&transfer.coreReference,'AGENT_TRANSFER_IDS_REQUIRED');
  }
  for(const field of ['transferId','correlationId','coreReference']){
    assert.equal(operations[field],customer[field],'AGENT_TRANSFER_READBACK_MISMATCH');
    assert.equal(payment.transfer[field],customer[field],'AGENT_TRANSFER_CORE_BINDING_MISMATCH');
  }
  assert.equal(payment.transfer.status,'SETTLED','AGENT_TRANSFER_CORE_NOT_SETTLED');
  assert.equal(cents(payment.transfer.amount),100n,'AGENT_TRANSFER_CORE_AMOUNT_MISMATCH');
  assert.ok(payment.coreTransactionVerified===true&&payment.coreAmountMatched===true&&payment.coreEntryCount>=2,
    'AGENT_TRANSFER_CORE_JOURNAL_REQUIRED');
  assert.ok(projection.projectionBalanced===true&&projection.projectionEntryCount===2&&
    cents(projection.projectionDebits)===100n&&cents(projection.projectionCredits)===100n,'AGENT_TRANSFER_PROJECTION_REQUIRED');
  assert.equal(BigInt(before.source.balanceCents)-BigInt(after.source.balanceCents),100n,'AGENT_TRANSFER_SOURCE_DELTA');
  assert.equal(BigInt(after.target.balanceCents)-BigInt(before.target.balanceCents),100n,'AGENT_TRANSFER_TARGET_DELTA');
  for(const side of ['source','target']){
    const old=before[side].transactionIds,next=after[side].transactionIds;
    assert.ok(old.every(id=>next.includes(id))&&next.length===old.length+1&&new Set(next).size===next.length,
      'AGENT_TRANSFER_SINGLE_CORE_POST_REQUIRED');
  }
  return {transferId:customer.transferId,correlationId:customer.correlationId,fineractTransactionId:customer.coreReference,
    balanced:true,coreTransactionVerified:true,coreAmountMatched:true,coreEntryCount:payment.coreEntryCount,
    coreObservations:{before,after},bankReadbacks:{customer,operations,payment,projection}};
}
