import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAgentEvidence,assertAgentTransfer} from './agent-assertions.mjs';
import {randomUUID} from 'node:crypto';
import {prepareBankValidationPool,registerBankCredential} from './bank-validation-pool.mjs';
import {executeControlledDocumentFailure} from './controlled-document-failure.mjs';
const identity='a'.repeat(64),journeyId='journey-contract-test';
const good=()=>({schemaVersion:'hengzhun-cli-evidence-verification/v1',verdict:'VERIFIED',journeyId,
  releaseIdentityHash:identity,journeyTerminal:true,runStatus:'PASSED',taskStatus:'SUCCEEDED',runId:'run-contract',taskId:'task-contract',
  artifacts:['DOM','SCREENSHOT','TRACE','NETWORK','LEDGER'].map(evidenceKind=>({evidenceKind,artifactId:`artifact-${evidenceKind}`,sha256:'b'.repeat(64),size:10,sha256Verified:true,sizeVerified:true}))});
const options={identity,journeyId,targetProfile:{launchUrl:'http://127.0.0.1:18082/portal/login'},expectedOrigin:'http://127.0.0.1:18082'};

function controlledScenario(change={}) {
  const calls=[],stages=[];let published=false;
  const candidate={journeyId:'journey-a07-contract',status:'AWAITING_USER',revision:1,proposalId:'proposal-contract',contentHash:'c'.repeat(64)};
  const proof={...good(),journeyId:candidate.journeyId,runStatus:'FAILED',taskStatus:'FAILED',expectedAssertionStepId:'step-exact'};
  const setup={runId:'owned-contract',identity,credentialRef:'credential-contract',phase:stage=>stages.push(stage),
    writeInput:goal=>{calls.push(['goal',goal]);return 'a07-test-only.txt';},
    bank:async(route,options={})=>{
      calls.push(['bank',route,options.method??'GET']);
      assert.ok(route.startsWith('/api/operations/v1/documents'));
      if(options.method==='POST'){assert.equal(options.body.get('title'),'RF057-A07-owned-contract');return {documentId:'doc-owned',status:'DRAFT',version:1};}
      if(options.method==='PATCH'){assert.equal(published,false);assert.deepEqual(options.body,{status:'PUBLISHED',version:1});published=true;return {documentId:'doc-owned',status:'PUBLISHED',version:2};}
      return [{documentId:'doc-owned',status:'PUBLISHED',version:2}];
    },
    cli:async args=>{
      calls.push(['cli',args[0],args[1]]);
      if(args[0]==='session')return {code:0,terminal:{result:{sessionId:'session-owned'}}};
      if(args[1]==='author'){assert.equal(published,false);assert.equal(args[args.indexOf('--adapter')+1],'fuxing-bank-operations');return {code:20,terminal:{result:candidate}};}
      if(args[1]==='approve'){assert.equal(published,false);return {code:0,terminal:{status:'APPROVED'}};}
      assert.equal(published,true);assert.equal(args[1],'execute');assert.equal(args[2],candidate.journeyId);
      return {code:4,terminal:{messageCode:'I8_FORMAL_ASSERTION_FAILED'}};
    },
    harness:async(route,body)=>{assert.equal(route,'/v1/releases:verify');assert.deepEqual(body,{caseId:'A07',journeyId:candidate.journeyId});return proof;},
    quality:async value=>{calls.push(['quality',value.runId]);}
  };
  return {calls,stages,proof,setup:{...setup,...change}};
}

test('A07 freezes a passing draft before one publish and requires the exact formal failure proof',async()=>{
  const fixture=controlledScenario();
  const result=await executeControlledDocumentFailure(fixture.setup);
  assert.equal(result.controlledFailure,true);assert.equal(result.document.retained,true);
  assert.deepEqual(result.document.before,{status:'DRAFT',version:1});assert.deepEqual(result.document.after,{status:'PUBLISHED',version:2});
  assert.ok(fixture.calls.find(call=>call[0]==='goal')[1].includes('唯一业务断言'));
  assert.equal(fixture.calls.filter(call=>call[0]==='bank'&&call[2]==='PATCH').length,1);
  assert.equal(fixture.calls.filter(call=>call[0]==='cli'&&call[2]==='execute').length,1);
});

test('A07 rejects missing evidence, another journey and another identity',async()=>{
  for(const mutate of [value=>{value.artifacts.pop();},value=>{value.artifacts[0].sha256Verified=false;},
    value=>{value.expectedAssertionStepId=null;},value=>{value.journeyId='other';},value=>{value.releaseIdentityHash='other';}]){
    const fixture=controlledScenario();mutate(fixture.proof);
    await assert.rejects(executeControlledDocumentFailure(fixture.setup));
    assert.equal(fixture.calls.some(call=>call[0]==='quality'),false);
  }
});

test('A07 never exempts login/authoring or unrelated formal failures',async()=>{
  for(const messageCode of ['I10_LOGIN_REJECTED','I8_TASK_FAILED','I10_MIDSCENE_TARGET_NOT_FOUND']) {
    const fixture=controlledScenario();const cli=fixture.setup.cli;
    fixture.setup.cli=async args=>args[1]==='execute'?{code:4,terminal:{messageCode}}:cli(args);
    await assert.rejects(executeControlledDocumentFailure(fixture.setup),/OTHER_FAILURE/);
    assert.equal(fixture.calls.some(call=>call[0]==='quality'),false);
  }
  const fixture=controlledScenario(),cli=fixture.setup.cli;
  fixture.setup.cli=async args=>args[1]==='author'?{code:4,terminal:{messageCode:'AUTHOR_FAILED'}}:cli(args);
  await assert.rejects(executeControlledDocumentFailure(fixture.setup),/AUTHORING_BOUNDARY/);
  assert.equal(fixture.calls.filter(call=>call[0]==='bank'&&call[2]==='PATCH').length,0);
});
test('admits terminal current-identity evidence only for the actual bank',()=>{
  assert.equal(assertAgentEvidence(good(),options).runId,'run-contract');
});
test('rejects success text without terminal runtime evidence',()=>{
  assert.throws(()=>assertAgentEvidence({...good(),journeyTerminal:false},options),/TERMINAL/);
});
test('rejects missing hashes or a missing network artifact',()=>{
  const noHash=good();noHash.artifacts[0].sha256Verified=false;
  assert.throws(()=>assertAgentEvidence(noHash,options),/ARTIFACT/);
  assert.throws(()=>assertAgentEvidence({...good(),artifacts:good().artifacts.filter(x=>x.evidenceKind!=='NETWORK')},options),/ARTIFACT/);
});
test('rejects a controlled-portal target even with otherwise verified artifacts',()=>{
  assert.throws(()=>assertAgentEvidence(good(),{...options,targetProfile:{launchUrl:'http://127.0.0.1:28884/portal/login'}}),/REAL_BANK/);
});
test('rejects a previous identity',()=>{
  assert.throws(()=>assertAgentEvidence({...good(),releaseIdentityHash:'c'.repeat(64)},options),/IDENTITY/);
});

test('bank pool consumes five authenticated prepare/readbacks and binds five independent local credentials',async()=>{
  const identities=Array.from({length:5},()=>({id:randomUUID(),username:'test-only-user',password:'test-only-password'}));
  const calls=[],registrations=[];let index=0,current;
  const fetcher=async(url,options)=>{
    calls.push({url,options});assert.equal(options.headers.authorization,'Bearer test-only-token');
    if(options.method==='POST'){
      const input=JSON.parse(options.body);
      current={status:'READY',...input,sourceClientId:100+index*2,targetClientId:101+index*2,
        sourceAccountId:200+index*2,targetAccountId:201+index*2,beneficiaryRef:randomUUID(),sourceBalance:'1000.00',targetBalance:'2000.00',currency:'CNY'};
      index++;
    }else{
      const read=new URL(url);assert.equal(read.searchParams.get('subject'),current.subject);
      assert.equal(read.searchParams.get('beneficiaryRef'),current.beneficiaryRef);
      assert.ok(read.pathname.endsWith(current.fixtureId));
    }
    return {ok:true,json:async()=>structuredClone(current)};
  };
  const pool=await prepareBankValidationPool({gateway:'http://bank.invalid',testToken:'test-only-token',runId:randomUUID(),identities,
    formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'}},{fetcher,registerCredential:async(identity,key)=>{
      assert.equal(calls.length,10);registrations.push({identity,key});return `credential_${randomUUID()}`;
    }});
  assert.equal(calls.length,10);assert.equal(registrations.length,5);
  assert.deepEqual(registrations.map(item=>item.identity),identities);assert.equal(new Set(registrations.map(item=>item.key)).size,5);
  assert.equal(pool.authoring.sourceAccountId,'200');assert.equal(pool.stability[3].fixture.sourceAccountId,'208');
  assert.equal(pool.stability[3].viewportId,'NARROW_390X844');assert.equal(pool.stability[3].sequenceNo,2);
  const text=JSON.stringify(pool);assert.equal(text.includes('test-only-password'),false);assert.equal(text.includes('test-only-token'),false);
});

test('bank pool stops on rejected or changed readback without credential registration or write retry',async()=>{
  for(const defect of ['http','changed','numeric-balance','unsafe-id','duplicate-subject']){
    const identities=Array.from({length:5},()=>({id:randomUUID()}));
    if(defect==='duplicate-subject')identities[1].id=identities[0].id;
    let calls=0,registrations=0,current;
    await assert.rejects(prepareBankValidationPool({gateway:'http://bank.invalid',testToken:'test-only-token',runId:randomUUID(),identities,
      formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'}},{registerCredential:async()=>{registrations++;return `credential_${randomUUID()}`;},
      fetcher:async(url,options)=>{
        calls++;
        if(options.method==='POST'){
          current={status:'READY',...JSON.parse(options.body),sourceClientId:100,targetClientId:101,sourceAccountId:200,targetAccountId:201,
            beneficiaryRef:randomUUID(),sourceBalance:'1000.00',targetBalance:'2000.00',currency:'CNY'};
          if(defect==='numeric-balance')current.sourceBalance=1000;
          if(defect==='unsafe-id')current.sourceAccountId=9007199254740992;
        }else if(defect==='changed')current={...current,targetAccountId:999};
        return {ok:defect!=='http',status:409,json:async()=>current};
      }}));
    assert.equal(registrations,0);assert.ok(calls<=2);
  }
});

test('local credential registration keeps the owned secret only in capture store and uses the supplied sample key',async()=>{
  const calls=[],identity={username:'test-only-user',password:'test-only-password'},credentialRef=`credential_${randomUUID()}`;
  const result=await registerBankCredential(identity,'sample-distinct-key',async(route,body)=>{
    calls.push({route,body});
    if(calls.length===1)return {sessionId:'capture-test-session',captureUrl:'http://127.0.0.1:18788/credentials/#token=test-only-capture-token'};
    return {credentialRef};
  });
  assert.equal(result,credentialRef);assert.equal(calls.length,2);
  assert.equal(calls[0].body.idempotencyKey,'sample-distinct-key');assert.equal(calls[0].body.password,undefined);
  assert.equal(calls[1].route,'/v1/i10/credentials/capture-test-session:store');
  assert.deepEqual(calls[1].body,{captureToken:'test-only-capture-token',...identity});
  assert.equal(result.includes(identity.password),false);
  let attempts=0;
  await assert.rejects(registerBankCredential(identity,'key',async()=>{attempts++;throw new Error('test-only-unavailable');}),/unavailable/);
  assert.equal(attempts,1);
});

test('bank pool rejects physical account reuse at its first readback rather than preparing further samples',async()=>{
  const identities=Array.from({length:5},()=>({id:randomUUID()}));let calls=0,registrations=0,current;
  await assert.rejects(prepareBankValidationPool({gateway:'http://bank.invalid',testToken:'test-only-token',runId:randomUUID(),identities,
    formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'}},{registerCredential:async()=>{registrations++;},
    fetcher:async(url,options)=>{
      calls++;
      if(options.method==='POST')current={status:'READY',...JSON.parse(options.body),sourceClientId:100,targetClientId:101,
        sourceAccountId:3,targetAccountId:201,beneficiaryRef:randomUUID(),sourceBalance:'1000.00',targetBalance:'2000.00',currency:'CNY'};
      return {ok:true,json:async()=>structuredClone(current)};
    }}),/ACCOUNT_REUSED/);
  assert.equal(calls,2);assert.equal(registrations,0);
});

test('Agent transfer requires settled matching bank details, real core journal and exact one-cent-safe money deltas',()=>{
  const transfer={transferId:'transfer-test',correlationId:'correlation-test',coreReference:'core-test',status:'SETTLED',
    sourceAccountId:'3',destinationAccountId:'4',beneficiaryId:'beneficiary-test',amount:'1.00',currency:'CNY',reference:'RF057-A02-test'};
  const facts={before:{source:{balanceCents:'100000',transactionIds:['s0']},target:{balanceCents:'200000',transactionIds:['t0']}},
    after:{source:{balanceCents:'99900',transactionIds:['s0','s1']},target:{balanceCents:'200100',transactionIds:['t0','t1']}},
    customer:transfer,operations:{...transfer},payment:{transfer:{...transfer},coreTransactionVerified:true,coreAmountMatched:true,coreEntryCount:4},
    projection:{projectionBalanced:true,projectionEntryCount:2,projectionDebits:'1.00',projectionCredits:'1.00'}};
  const expected={sourceAccountId:'3',targetAccountId:'4',beneficiaryRef:'beneficiary-test',purpose:'RF057-A02-test'};
  assert.equal(assertAgentTransfer(facts,expected).fineractTransactionId,'core-test');
  for(const mutate of [
    value=>{value.customer.status='PENDING_CORE_POSTING'},value=>{value.operations.correlationId='other'},
    value=>{value.customer.destinationAccountId='9'},value=>{value.customer.reference='other'},
    value=>{value.payment.coreTransactionVerified=false},value=>{value.payment.transfer.coreReference='other'},
    value=>{value.projection.projectionDebits='0.00'},value=>{value.after.source.balanceCents='99800'},
    value=>{value.after.target.balanceCents='200000'},value=>{value.after.source.transactionIds.push('extra')}
  ]){const bad=structuredClone(facts);mutate(bad);assert.throws(()=>assertAgentTransfer(bad,expected));}
});
