import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const {bankValidationFixtureSchema,bankValidationFixturesSchema}=require(path.resolve(import.meta.dirname,
  '../../../platform/hengzhun-regression-system/dist/harness/src/i10/schemas.js'));
const bankResultSchema=bankValidationFixtureSchema.omit({credentialRef:true});

export async function registerBankCredential(identity,idempotencyKey,harness){
  const receipt=await harness('/v1/i10/credentials:sessions-create',{namespace:'hengzhun-local',idempotencyKey,
    label:'RF057 synthetic bank account'});
  const captureToken=new URL(receipt.captureUrl).hash.slice(1);
  const token=new URLSearchParams(captureToken).get('token');
  assert.ok(token&&receipt.sessionId,'RF057_CREDENTIAL_SESSION_INVALID');
  const stored=await harness(`/v1/i10/credentials/${receipt.sessionId}:store`,
    {captureToken:token,username:identity.username,password:identity.password});
  assert.match(stored.credentialRef,/^credential_[0-9a-f-]{36}$/);
  return stored.credentialRef;
}

function bankFixture(result,fixtureId,subject){
  assert.equal(result.status,'READY','RF057_BANK_POOL_NOT_READY');
  assert.equal(result.fixtureId,fixtureId,'RF057_BANK_POOL_FIXTURE_CHANGED');
  assert.equal(result.subject,subject,'RF057_BANK_POOL_SUBJECT_CHANGED');
  const {status,...fields}=result;
  for(const field of ['sourceClientId','targetClientId','sourceAccountId','targetAccountId']){
    if(typeof fields[field]==='number'){
      assert.ok(Number.isSafeInteger(fields[field])&&fields[field]>0,'RF057_BANK_POOL_UNSAFE_CORE_ID');
      fields[field]=String(fields[field]);
    }
  }
  return bankResultSchema.parse(fields);
}

// This producer only prepares new owned synthetic money. It never resets it,
// retries an unknown write, invokes a model or operates a browser.
export async function prepareBankValidationPool({gateway,testToken,runId,identities,formalAccountIds},
  {registerCredential,fetcher=fetch}={}){
  assert.equal(identities.length,5,'RF057_BANK_POOL_REQUIRES_FIVE_IDENTITIES');
  assert.equal(new Set(identities.map(item=>item.id)).size,5,'RF057_BANK_POOL_IDENTITIES_NOT_DISTINCT');
  for(const identity of identities)bankResultSchema.shape.subject.parse(identity.id);
  formalAccountIds=bankValidationFixturesSchema.shape.formalAccountIds.parse(formalAccountIds);
  const accountIds=new Set(Object.values(formalAccountIds)),clientIds=new Set(),beneficiaryRefs=new Set();
  assert.equal(accountIds.size,2,'RF057_BANK_POOL_FORMAL_ACCOUNTS_NOT_DISTINCT');
  const headers={authorization:`Bearer ${testToken}`,'content-type':'application/json',
    'X-Regression-Namespace':'rf057-agent','X-Regression-Run-Id':runId};
  async function request(route,options={}){
    const response=await fetcher(gateway+route,{...options,headers});
    assert.ok(response.ok,`RF057_BANK_POOL_HTTP_${response.status}`);
    return response.json();
  }
  const verified=[];
  for(const identity of identities){
    const fixtureId=randomUUID();
    const prepared=await request('/internal/test-support/v1/transfer-fixtures:prepare',
      {method:'POST',body:JSON.stringify({fixtureId,subject:identity.id})});
    bankFixture(prepared,fixtureId,identity.id);
    const result=await request(`/internal/test-support/v1/transfer-fixtures/${fixtureId}?subject=${identity.id}&beneficiaryRef=${prepared.beneficiaryRef}`);
    assert.deepEqual(result,prepared,'RF057_BANK_POOL_READBACK_CHANGED');
    const fixture=bankFixture(result,fixtureId,identity.id);
    for(const field of ['sourceAccountId','targetAccountId']){
      assert.ok(!accountIds.has(fixture[field]),'RF057_BANK_POOL_ACCOUNT_REUSED');accountIds.add(fixture[field]);
    }
    for(const field of ['sourceClientId','targetClientId']){
      assert.ok(!clientIds.has(fixture[field]),'RF057_BANK_POOL_CLIENT_REUSED');clientIds.add(fixture[field]);
    }
    assert.ok(!beneficiaryRefs.has(fixture.beneficiaryRef),'RF057_BANK_POOL_BENEFICIARY_REUSED');beneficiaryRefs.add(fixture.beneficiaryRef);
    verified.push(fixture);
  }
  const fixtures=[],credentialRefs=new Set();
  for(const [index,fixture] of verified.entries()){
    const credentialRef=await registerCredential(identities[index],`rf057-${runId}-bank-sample-${index+1}`);
    fixtures.push(bankValidationFixtureSchema.parse({...fixture,credentialRef}));
    assert.ok(!credentialRefs.has(credentialRef),'RF057_BANK_POOL_CREDENTIAL_REUSED');credentialRefs.add(credentialRef);
  }
  return bankValidationFixturesSchema.parse({schemaVersion:'hengzhun-bank-validation-fixtures-v1',formalAccountIds,
    authoring:fixtures[0],stability:['DESKTOP_1440X900','NARROW_390X844'].flatMap((viewportId,index)=>
      [1,2].map(sequenceNo=>({viewportId,sequenceNo,fixture:fixtures[1+index*2+sequenceNo-1]})))});
}
