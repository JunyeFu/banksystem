'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),crypto=require('node:crypto');
const {cleanupDigest}=require('./evidence.cjs');
test('final report binds the actual parent cleanup bytes, including failed cleanup',()=>{
  const cleanupId='a'.repeat(32),runId=crypto.randomUUID(),releaseIdentityHash='b'.repeat(64);
  const report={runId,releaseIdentityHash,cleanupRef:`agent/runs/rf057-cleanup/${cleanupId}.json`};
  for(const status of ['COMPLETED','FAILED']) {
    const receipt={schemaVersion:'rf057-identity-cleanup/v2',cleanupId,runId,releaseIdentityHash,status};
    const bytes=Buffer.from(JSON.stringify(receipt));
    assert.equal(cleanupDigest(report,bytes),crypto.createHash('sha256').update(bytes).digest('hex'));
    for(const changed of [{runId:crypto.randomUUID()},{releaseIdentityHash:'c'.repeat(64)},{cleanupId:'d'.repeat(32)}])
      assert.throws(()=>cleanupDigest(report,Buffer.from(JSON.stringify({...receipt,...changed}))),/BINDING_MISMATCH/);
  }
});
