import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createJourneyCandidateAuthor, JourneyAuthorError } from '../../controller/src/journey-author.mjs'
import { EncryptedSessionStore } from '../../controller/src/session-store.mjs'
import { connectMcpRuntime } from '../../controller/src/runtime-adapters.mjs'
import { createProductionService, modelResponseEvidenceWriter } from '../src/production-service.mjs'

test('Controller preserves explicit operations selection and never infers it from the site name',async()=>{
  let calls=0;
  const author=createJourneyCandidateAuthor({async invokeJson(){calls++;return JSON.stringify({title:'文档草稿',objective:'核验草稿',summary:'只读文档状态',
    preconditions:[],steps:[{action:'核验文档状态',expected:'草稿'}],assertions:['草稿'],confidence:1});}});
  const input={goal:'只读核验文档草稿状态',entryUrl:'http://127.0.0.1:18083/ops/login',targetSystem:'复兴银行运营控制台',
    credentialRef:'credential_12345678-1234-1234-1234-123456789abc'};
  assert.equal((await author.author({...input,adapterSelection:'fuxing-bank-operations'})).adapterSelection,'fuxing-bank-operations');
  assert.equal((await author.author(input)).adapterSelection,undefined);
  await assert.rejects(author.author({...input,adapterSelection:'unregistered'}),error=>error.code==='JOURNEY_TARGET_ADAPTER_INVALID');
  assert.equal(calls,2);
});

const RELEASE = '9'.repeat(64)
const SESSION = `session-${'a'.repeat(32)}`
const JOURNEY = `journey-${'b'.repeat(32)}`
const PROPOSAL = `proposal-${'c'.repeat(32)}`
const CONTENT_HASH = 'd'.repeat(64)
const CREDENTIAL = 'credential_12345678-1234-1234-1234-123456789abc'
const productRoot = path.resolve(import.meta.dirname, '..', '..')

function textResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }] } }

const authorInput = {
  goal: '登录客户门户，从付款账户 3 向收款人 11111111-1111-4111-8111-111111111111 转账 100.00 CNY，用途：黄金链路验证，然后核验交易结果。',
  entryUrl: 'http://127.0.0.1:18081/login', targetSystem: '复兴银行客户门户', credentialRef: CREDENTIAL,
  adapterSelection: 'fuxing-bank-demo',
}

test('author explicitly requires target navigation after authentication before read-only assertions',async()=>{
  let prompt;
  const author=createJourneyCandidateAuthor({async invokeJson(request){prompt=request.systemPrompt;return JSON.stringify({
    title:'账户只读检查',objective:'核对账户',summary:'实际进入账户列表后核对',preconditions:[],
    steps:[{action:'通过统一身份认证登录',expected:'登录成功'},{action:'打开账户列表页面',expected:'账户列表可见'},
      {action:'核对账户列表中的账户、人民币余额和账户状态',expected:'完整账户信息可见'}],assertions:['账户信息完整'],confidence:1})}})
  const draft=await author.author({...authorInput,goal:'登录后打开账户列表并核对账户、人民币余额和账户状态，不转账'})
  assert.ok(prompt.includes('explicitly navigate to the requested target page or list in a separate step'))
  assert.ok(prompt.includes('a read-only content assertion does not perform navigation'))
  const example=JSON.parse(prompt.split('EXAMPLE_JSON: ')[1]);
  assert.deepEqual(Object.keys(example).sort(),['assertions','confidence','objective','preconditions','steps','summary','title']);
  assert.equal(example.steps.every(step=>typeof step.action==='string'&&typeof step.expected==='string'),true);
  assert.ok(prompt.includes('escape double quotes, backslashes and control characters'));
  assert.equal(draft.steps[1].action,'打开账户列表页面')
  assert.equal(draft.steps[2].action,'核对账户列表中的账户、人民币余额和账户状态')
})

test('production author binds local financial samples through MCP without sending them to the model',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'hz-local-bank-pool-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const store=await new EncryptedSessionStore({root,sessionIdFactory:()=>SESSION}).initialize()
  await store.create({namespace:'offline-tenant',threadId:'thread-bank-pool',journeyId:JOURNEY,releaseIdentityHash:RELEASE,events:[{type:'SESSION_STARTED'}]})
  const sample=index=>({fixtureId:randomUUID(),subject:randomUUID(),credentialRef:`credential_${randomUUID()}`,
    sourceClientId:String(100+index*2),targetClientId:String(101+index*2),sourceAccountId:String(200+index*2),targetAccountId:String(201+index*2),
    beneficiaryRef:randomUUID(),sourceBalance:'1000.00',targetBalance:'2000.00',currency:'CNY'})
  const pool={schemaVersion:'hengzhun-bank-validation-fixtures-v1',formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'},authoring:sample(0),
    stability:['DESKTOP_1440X900','NARROW_390X844'].flatMap((viewportId,i)=>[1,2].map(sequenceNo=>({viewportId,sequenceNo,fixture:sample(1+i*2+sequenceNo-1)})))}
  const modelCalls=[],mcpCalls=[],responseReceipts=[];let financial=true
  const options={sessionStore:store,releaseIdentityHash:RELEASE,namespace:'offline-tenant',
    modelConfig:{apiKey:'test-only',baseURL:'http://model.invalid/v1',model:'test-model'},
    recordModelResponse:value=>responseReceipts.push(value),
    modelFactory(){return {withConfig(){return {async invoke(messages){modelCalls.push(messages);return {content:JSON.stringify({
      title:'转账',objective:'核验资金',summary:'转账测试',preconditions:[],steps:[{action:'提交转账',expected:'余额正确'}],assertions:['余额正确'],confidence:1,
      ...(financial?{businessInputs:{transfer:{payerAccountId:'3',payeeRef:'11111111-1111-4111-8111-111111111111',amount:'100.00',currency:'CNY',purpose:'黄金链路验证'}}}:{})})}}}}}},
    mcpClient:{async callTool(request){mcpCalls.push(structuredClone(request));return textResult({journeyId:JOURNEY,version:2,status:'AWAITING_USER',stage:'READY_FOR_CASE_APPROVAL',
      proposalId:PROPOSAL,proposalPayloadHash:CONTENT_HASH,caseDraft:request.arguments.draftJson})}},writeGate:async()=>undefined}
  const service=createProductionService(options)
  await assert.rejects(service.journeyAuthor({sessionId:SESSION,...authorInput,bankValidationFixtures:{...pool,password:'must-not-be-accepted'}}),error=>error.code==='BANK_VALIDATION_POOL_INVALID')
  assert.equal(modelCalls.length,0);assert.equal(mcpCalls.length,0)
  await assert.rejects(service.journeyAuthor({sessionId:SESSION,...authorInput,bankValidationFixtures:{...pool,formalAccountIds:{sourceAccountId:'9',targetAccountId:'4'}}}),error=>error.code==='BANK_VALIDATION_FORMAL_BINDING_INVALID')
  assert.equal(modelCalls.length,1);assert.equal(mcpCalls.length,0)
  await assert.rejects(service.journeyAuthor({sessionId:SESSION,...authorInput,bankValidationFixtures:{...pool,authoring:{...pool.authoring,credentialRef:CREDENTIAL}}}),error=>error.code==='BANK_VALIDATION_FORMAL_BINDING_INVALID')
  financial=false
  await assert.rejects(service.journeyAuthor({sessionId:SESSION,...authorInput,goal:'只读查询账户，不发起转账',bankValidationFixtures:pool}),error=>error.code==='BANK_VALIDATION_FORMAL_BINDING_INVALID')
  financial=true
  await service.journeyAuthor({sessionId:SESSION,...authorInput,bankValidationFixtures:pool})
  assert.equal(responseReceipts.at(-1).sessionId,SESSION)
  assert.equal(responseReceipts.at(-1).releaseIdentityHash,RELEASE)
  assert.equal(responseReceipts.at(-1).evidence.jsonValid,true)
  assert.equal(mcpCalls.length,1);assert.deepEqual(mcpCalls[0].arguments.draftJson.bankValidationFixtures,pool)
  const context=JSON.stringify(modelCalls)
  for(const fixture of [pool.authoring,...pool.stability.map(item=>item.fixture)]) {
    assert.equal(context.includes(fixture.subject),false);assert.equal(context.includes(fixture.credentialRef),false);assert.equal(context.includes(fixture.fixtureId),false)
  }
  assert.equal(context.includes(CREDENTIAL),false)
  const directCalls=[]
  const direct=createProductionService({...options,directExecution:true,sessionIdFactory:()=>`session-${randomUUID().replaceAll('-','')}`,
    mcpClient:{async callTool(request){directCalls.push(structuredClone(request));throw new Error('test stops at MCP bootstrap boundary')}}})
  const input=`目标系统：复兴银行客户门户。访问 ${authorInput.entryUrl}，使用 ${CREDENTIAL} 安全凭据，明确选择适配器 fuxing-bank-demo。${authorInput.goal}`
  const before=modelCalls.length
  await assert.rejects(direct.start({input,bankValidationFixtures:{...pool,password:'rejected'}}),error=>error.code==='BANK_VALIDATION_POOL_INVALID')
  assert.equal(modelCalls.length,before);assert.equal(directCalls.length,0)
  await assert.rejects(direct.start({input,bankValidationFixtures:pool}),error=>error.code==='AGENT_BOOTSTRAP_FAILED')
  assert.equal(directCalls.length,1);assert.deepEqual(directCalls[0].arguments.draftJson.bankValidationFixtures,pool)
  assert.match(responseReceipts.at(-1).sessionId,/^session-[a-f0-9]{32}$/)
  assert.equal(JSON.stringify(modelCalls.at(-1)).includes(pool.authoring.credentialRef),false)
  assert.equal(JSON.stringify(modelCalls.at(-1)).includes(CREDENTIAL),false)
  const resolved=createProductionService({...options,directExecution:true,journeyResolver:async()=>JOURNEY})
  await assert.rejects(resolved.start({input,bankValidationFixtures:pool}),error=>error.code==='BANK_VALIDATION_POOL_REQUIRES_NEW_JOURNEY')
  await assert.rejects(service.start({input,bankValidationFixtures:pool}),error=>error.code==='BANK_VALIDATION_POOL_REQUIRES_DIRECT_EXECUTION')
})

test('model format evidence is an immutable local diagnostic receipt',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'hz-model-format-'));t.after(()=>rm(root,{recursive:true,force:true}))
  modelResponseEvidenceWriter(root)({releaseIdentityHash:RELEASE,namespace:'test-only',sessionId:SESSION,
    evidence:{schemaVersion:'model-response-format/v1',jsonValid:false,finishReason:'length'}})
  const directory=path.join(root,'.data/evidence/model-response-formats')
  const files=await readdir(directory)
  assert.equal(files.length,1)
  const receipt=JSON.parse(await readFile(path.join(directory,files[0]),'utf8'))
  assert.equal(receipt.evidenceClass,'MODEL_PROTOCOL_DIAGNOSTIC')
  assert.equal(receipt.evidence.finishReason,'length')
  assert.equal(receipt.releaseIdentityHash,RELEASE)
})

test('real bank inputs freeze the explicitly labelled payer and UUID beneficiary as v2', async () => {
  const payeeRef = '11111111-1111-4111-8111-111111111111'
  const goal = `付款账户 3，收款人 ${payeeRef}，转账 100.00 CNY，用途：黄金链路验证；记录第 1 次运行。`
  for (const payerAccountId of ['3', '1']) {
    const author = createJourneyCandidateAuthor({ async invokeJson() { return JSON.stringify({
      title:'转账',objective:'核验资金',summary:'转账测试',preconditions:[],
      steps:[{action:'提交转账',expected:'转账成功'}],assertions:['余额正确'],confidence:1,
      businessInputs:{transfer:{payerAccountId,payeeRef,amount:'100.00',currency:'CNY',purpose:'黄金链路验证'}}
    }) } })
    if (payerAccountId === '1') {
      await assert.rejects(author.author({...authorInput,goal}), error => error.code === 'JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT')
    } else {
      const draft = await author.author({...authorInput,goal})
      assert.equal(draft.businessInputs.schemaVersion,'hengzhun-i10-typed-business-inputs-v2')
      assert.equal(draft.businessInputs.values.payerAccountId,'3')
      assert.equal(draft.businessInputs.values.payeeRef,payeeRef)
    }
  }
})

test('credential references embedded by natural-language bootstrap are removed only from external model context',async()=>{
  let context
  const author=createJourneyCandidateAuthor({async invokeJson(value){context=value;return JSON.stringify({
    title:'账户查询',objective:'核验账户',summary:'只读测试',preconditions:[],steps:[{action:'登录并查询账户',expected:'余额可见'}],assertions:['余额可见'],confidence:1})}})
  const goal=`登录并查询账户，不发起转账。使用 ${CREDENTIAL} 安全凭据。`
  const draft=await author.author({...authorInput,goal})
  assert.equal(JSON.stringify(context).includes(CREDENTIAL),false)
  assert.equal(draft.credentialRef,CREDENTIAL)
  assert.equal(JSON.parse(context.input).goal.includes('已登记安全凭据'),true)
})

test('model-authored fields become one deterministic strict Harness CaseDraft', async () => {
  const calls = []
  const author = createJourneyCandidateAuthor({ async invokeJson(value) {
    calls.push(value)
    return JSON.stringify({
      title: '客户转账黄金链路', objective: '验证客户转账及结果回读。', summary: '登录、转账并核验结果。',
      preconditions: ['演示客户与收款人已播种'], steps: [{ action: '登录客户门户并提交转账', expected: '页面显示转账完成' }],
      assertions: ['转账结果状态为 COMPLETED'], confidence: 0.98,
      businessInputs: { transfer: { payerAccountId:'3', payeeRef: '11111111-1111-4111-8111-111111111111', amount: '100.00', currency: 'CNY', purpose: '黄金链路验证' } },
    })
  } })
  const draft = await author.author(authorInput)
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].input), { goal: authorInput.goal, targetSystem: authorInput.targetSystem })
  assert.match(calls[0].systemPrompt, /preconditions and assertions are arrays of strings/)
  assert.match(calls[0].systemPrompt, /confidence is a JSON number from 0 to 1/)
  assert.match(calls[0].systemPrompt, /steps is an array of 1 to 6 objects/)
  assert.match(calls[0].systemPrompt, /same language as the supplied goal/)
  assert.match(calls[0].systemPrompt, /exactly one authentication step/)
  assert.equal(calls[0].input.includes(CREDENTIAL), false)
  assert.equal(draft.entryUrl, authorInput.entryUrl)
  assert.equal(draft.credentialRef, CREDENTIAL)
  assert.equal(draft.adapterSelection, 'fuxing-bank-demo')
  assert.equal(draft.businessInputs.values.amount, '100.00')
  assert.match(draft.source.sourceHash, /^[0-9a-f]{64}$/)
  assert.equal(draft.confirmationStatus, 'DRAFT')
})

test('model may not invent or change the user business inputs', async () => {
  for(const amount of ['1000.00','10.00']) {
    const author=createJourneyCandidateAuthor({async invokeJson(){return JSON.stringify({
      title:'t',objective:'o',summary:'s',preconditions:[],steps:[{action:'a',expected:'e'}],assertions:['a'],confidence:1,
      businessInputs:{transfer:{payerAccountId:'3',payeeRef:'11111111-1111-4111-8111-111111111111',amount,currency:'CNY',purpose:'黄金链路验证'}}
    })}})
    await assert.rejects(author.author(authorInput),error=>error.code==='JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT')
  }
})

test('a transfer goal without payee or amount produces an explicit input gap instead of an executable draft',async()=>{
  const author=createJourneyCandidateAuthor({async invokeJson(){return JSON.stringify({
    title:'转账',objective:'完成转账',summary:'转账测试',preconditions:[],
    steps:[{action:'发起转账',expected:'转账完成'}],assertions:['转账完成'],confidence:1,
  })}})
  const draft=await author.author({...authorInput,goal:'发起转账，核验最终成功。'})
  assert.ok(draft.missingFields.includes('businessInputs.payeeRef'))
  assert.ok(draft.missingFields.includes('businessInputs.payerAccountId'))
  assert.ok(draft.missingFields.includes('businessInputs.amount'))
  assert.equal(draft.businessInputs,undefined)
})

test('model validation exposes only the schema-owned reason and never raw response or unknown keys',async()=>{
  const base={title:'t',objective:'o',summary:'s',preconditions:[],steps:[{action:'a',expected:'e'}],assertions:['a'],confidence:1};
  for(const [content,suffix] of [
    ['private-response-not-json','JSON_SYNTAX'],
    [JSON.stringify({...base,confidence:'private-response'}),'CONFIDENCE_INVALID_TYPE'],
    [JSON.stringify({...base,steps:Array(7).fill(base.steps[0])}),'STEPS_TOO_BIG'],
    [JSON.stringify({...base,'private-unknown-key':'private-response'}),'ROOT_UNRECOGNIZED_KEYS'],
    [null,'NON_STRING']
  ]) {
    let calls=0;const author=createJourneyCandidateAuthor({async invokeJson(){calls++;return content;}});
    await assert.rejects(author.author(authorInput),error=>{assert.equal(error.code,'JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_'+suffix);assert.equal(error.message.includes('private-'),false);return true;});
    assert.equal(calls,1);
  }
});

test('unknown model fields and partial transfer inputs fail before a Harness write', async () => {
  for (const output of [
    { title: 't', objective: 'o', summary: 's', preconditions: [], steps: [{ action: 'a', expected: 'e' }], assertions: ['a'], confidence: 1, status: 'APPROVED' },
    { title: 't', objective: 'o', summary: 's', preconditions: [], steps: [{ action: 'a', expected: 'e' }], assertions: ['a'], confidence: 1, businessInputs: { transfer: { amount: '10.00' } } },
  ]) {
    const author = createJourneyCandidateAuthor({ async invokeJson() { return JSON.stringify(output) } })
    await assert.rejects(author.author(authorInput), (error) => error instanceof JourneyAuthorError && error.code.startsWith('JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_'))
  }
})

test('read-only goals mentioning prohibited transfers do not request money inputs',async()=>{
  const author=createJourneyCandidateAuthor({async invokeJson(){return JSON.stringify({title:'只读账户',objective:'查询账户',summary:'查询',
    preconditions:[],steps:[{action:'查询账户',expected:'余额显示'}],assertions:['余额显示'],confidence:1})}})
  for(const goal of ['查询账户，只读测试，不发起转账。','查询账户，只读，不转账。','Read accounts; do not transfer.']){
    const draft=await author.author({...authorInput,goal})
    assert.deepEqual(draft.missingFields,[])
  }
  const write=await author.author({...authorInput,goal:'发起转账，然后核验转账结果。'})
  assert.ok(write.missingFields.includes('businessInputs.amount'))
})

test('credential-bearing and non-http entry URLs are rejected before model invocation', async () => {
  let calls = 0
  const author = createJourneyCandidateAuthor({ async invokeJson() { calls += 1; return '{}' } })
  for (const entryUrl of ['file:///private', 'https://user:pass@example.test/']) {
    await assert.rejects(author.author({ ...authorInput, entryUrl }), (error) => error.code === 'JOURNEY_ENTRY_URL_INVALID')
  }
  assert.equal(calls, 0)
})

test('unregistered explicit target adapter is rejected before model invocation', async () => {
  let calls = 0
  const author = createJourneyCandidateAuthor({ async invokeJson() { calls += 1; return '{}' } })
  await assert.rejects(author.author({ ...authorInput, adapterSelection: 'unregistered-adapter' }),
    (error) => error.code === 'JOURNEY_TARGET_ADAPTER_INVALID')
  assert.equal(calls, 0)
})

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('PROCESS_EXITED_BEFORE_READY')
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('PROCESS_HEALTH_TIMEOUT')
}

test('fake model with real MCP and Fresh Harness freezes and validates one candidate', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-rf043-live-'))
  const harnessPort = await freePort()
  const mcpPort = await freePort()
  const node20 = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
  const namespace = 'rf043-author'
  const token = 's'.repeat(32)
  const harness = spawn(node20, ['agent-cli/test/harness-session-fixture.cjs'], {
    cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, PORT: String(harnessPort), HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_NAMESPACE: namespace,
      HENGZHUN_RELEASE_IDENTITY_HASH: RELEASE, RF043_CREDENTIAL_REF: CREDENTIAL,
      RF041_DATABASE_PATH: path.join(root, 'harness.sqlite'), RF041_BACKUP_ROOT: path.join(root, 'backups'),
      RF041_ARTIFACT_ROOT: path.join(root, 'artifacts'),
    },
  })
  const mcp = spawn(node20, ['mcp/src/server.cjs'], {
    cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, HENGZHUN_MCP_HOST: '127.0.0.1', HENGZHUN_MCP_PORT: String(mcpPort),
      HENGZHUN_MCP_TOKEN: token, HENGZHUN_SERVICE_TOKEN: token,
      HENGZHUN_HARNESS_URL: `http://127.0.0.1:${harnessPort}`, HENGZHUN_NAMESPACE: namespace,
    },
  })
  let client
  t.after(async () => {
    await client?.close().catch(() => undefined)
    if (mcp.exitCode === null) mcp.kill()
    if (harness.exitCode === null) harness.kill()
    await Promise.all([mcp.exitCode === null ? new Promise((resolve) => mcp.once('exit', resolve)) : undefined,
      harness.exitCode === null ? new Promise((resolve) => harness.once('exit', resolve)) : undefined])
    await rm(root, { recursive: true, force: true })
  })
  await waitForHealth(`http://127.0.0.1:${harnessPort}/health`, harness)
  await waitForHealth(`http://127.0.0.1:${mcpPort}/health`, mcp)
  client = await connectMcpRuntime({ url: `http://127.0.0.1:${mcpPort}/mcp`, token })
  const store = await new EncryptedSessionStore({ root: path.join(root, 'sessions') }).initialize()
  const modelCalls = []
  const service = createProductionService({
    sessionStore: store, releaseIdentityHash: RELEASE, mcpClient: client, namespace, writeGate: async () => undefined,directExecution:true,
    modelConfig: { apiKey: 'offline-not-secret', baseURL: 'http://model.invalid/v1', model: 'offline-model' },
    modelFactory: () => ({ withConfig: () => ({ async invoke(messages) {
      modelCalls.push(messages)
      return { content: JSON.stringify({
        title: '客户账户查询', objective: '验证客户登录后能够查询账户。', summary: '登录并检查账户摘要。',
        preconditions: ['演示客户已创建'], steps: [{ action: '登录并打开账户页', expected: '账户摘要可见' }],
        assertions: ['账户余额字段可见'], confidence: 0.96,
      }) }
    } }) }),
  })
  const session = await service.sessionStart({})
  const authored = await service.journeyAuthor({
    sessionId: session.sessionId, goal: '登录并核验账户摘要，只读，不发起转账。', entryUrl: authorInput.entryUrl,
    targetSystem: authorInput.targetSystem, credentialRef: CREDENTIAL,
  })
  assert.equal(authored.status, 'AWAITING_USER')
  assert.equal(authored.stage, 'READY_FOR_CASE_APPROVAL')
  assert.equal(authored.stepCount, 1)
  assert.match(authored.contentHash, /^[0-9a-f]{64}$/)
  const validated = await service.journeyValidate({ journeyId: authored.journeyId })
  assert.equal(validated.status, 'VALIDATED')
  assert.equal(validated.contentHash, authored.contentHash)
  assert.equal(validated.stepCount, authored.stepCount)
  assert.equal(modelCalls.length, 1)
  const operationsSession=await service.sessionStart({});
  const operations=await service.journeyAuthor({sessionId:operationsSession.sessionId,goal:'只读核验文档草稿状态',
    entryUrl:'http://127.0.0.1:18083/ops/login',targetSystem:'复兴银行运营控制台',credentialRef:CREDENTIAL,adapterSelection:'fuxing-bank-operations'});
  assert.equal(operations.status,'AWAITING_USER');
  const read=await client.callTool({name:'journey_get',arguments:{journeyId:operations.journeyId,waitSeconds:0}});
  assert.notEqual(read.isError,true);
  const operationsDraft=JSON.parse(read.content[0].text).caseDraft;
  assert.equal(operationsDraft.adapterSelection,'fuxing-bank-operations');
  assert.equal(operationsDraft.entryUrl,'http://127.0.0.1:18083/ops/login');
  assert.equal(operationsDraft.targetSystem,'复兴银行运营控制台');
  const missing=await service.start({input:`目标系统：复兴银行客户门户。访问 ${authorInput.entryUrl}，使用 ${CREDENTIAL} 安全凭据，明确选择适配器 fuxing-bank-demo。发起转账，核验成功。`})
  assert.equal(missing.status,'NEEDS_INPUT')
  const incompleteValidation=await service.journeyValidate({journeyId:missing.journeyId})
  assert.equal(incompleteValidation.status,'NEEDS_INPUT')
  assert.ok(missing.missingFields.includes('businessInputs.amount'))
  assert.ok(missing.missingFields.includes('businessInputs.payeeRef'))
  const resumed=await service.sessionResume({sessionId:missing.sessionId})
  assert.equal(resumed.journeyId,missing.journeyId)
})

test('author performs one model call and one MCP mutation; validate performs one pure Harness read', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-rf043-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = await new EncryptedSessionStore({ root, sessionIdFactory: () => SESSION }).initialize()
  await store.create({
    namespace: 'offline-tenant', threadId: 'thread-rf043', journeyId: JOURNEY,
    releaseIdentityHash: RELEASE, events: [{ type: 'SESSION_STARTED' }],
  })
  const modelCalls = []
  const modelConfigs = []
  const modelBindings = []
  const mcpCalls = []
  let authority = { journeyId: JOURNEY, version: 1, status: 'AWAITING_INPUT', stage: 'WAITING_FOR_INPUT' }
  const service = createProductionService({
    sessionStore: store, releaseIdentityHash: RELEASE, namespace: 'offline-tenant',
    modelConfig: { apiKey: 'offline-not-secret', baseURL: 'http://model.invalid/v1', model: 'offline-model' },
    modelFactory(config) {
      modelConfigs.push(config)
      return { withConfig(binding) {
        modelBindings.push(binding)
        return { async invoke(messages) {
          modelCalls.push(messages)
          return { content: JSON.stringify({
            title: '银行账户查询', objective: '验证客户登录后查询账户余额。', summary: '登录并读取账户摘要。',
            preconditions: ['演示客户已存在'], steps: [{ action: '登录并打开账户页', expected: '显示账户余额' }],
            assertions: ['余额字段可见'], confidence: 0.95,
          }) }
        } }
      } }
    },
    mcpClient: { async callTool(request) {
      mcpCalls.push(structuredClone(request))
      if (request.name === 'journey_prepare') {
        authority = {
          journeyId: JOURNEY, version: 2, status: 'AWAITING_USER', stage: 'READY_FOR_CASE_APPROVAL',
          proposalId: PROPOSAL, proposalPayloadHash: CONTENT_HASH,
          caseDraft: request.arguments.draftJson,
        }
        return textResult(authority)
      }
      if (request.name === 'journey_get') return textResult(authority)
      throw new Error('unexpected tool')
    } },
    writeGate: async () => undefined,
  })

  const authored = await service.journeyAuthor({
    sessionId: SESSION, goal: '登录并查询账户余额', entryUrl: 'http://127.0.0.1:18081/login',
    targetSystem: '复兴银行客户门户', credentialRef: CREDENTIAL, adapterSelection: 'fuxing-bank-demo',
  })
  assert.deepEqual(authored, {
    sessionId: SESSION, status: 'AWAITING_USER', journeyId: JOURNEY, revision: 2,
    stage: 'READY_FOR_CASE_APPROVAL', proposalId: PROPOSAL, contentHash: CONTENT_HASH,
    stepCount: 1, assertionCount: 1,
  })
  assert.equal(modelCalls.length, 1)
  assert.equal(modelConfigs[0].maxRetries, 0)
  assert.deepEqual(modelBindings[0], { response_format: { type: 'json_object' }, tools: [] })
  assert.equal(JSON.stringify(modelCalls).includes(CREDENTIAL), false)
  assert.equal(mcpCalls.filter((call) => call.name === 'journey_prepare').length, 1)
  assert.equal(mcpCalls[0].arguments.credentialRef, CREDENTIAL)
  assert.equal(mcpCalls[0].arguments.adapterSelection, 'fuxing-bank-demo')
  assert.equal(mcpCalls[0].arguments.draftJson.credentialRef, CREDENTIAL)
  assert.equal(mcpCalls[0].arguments.draftJson.adapterSelection, 'fuxing-bank-demo')

  const validated = await service.journeyValidate({ journeyId: JOURNEY })
  assert.equal(validated.status, 'VALIDATED')
  assert.equal(validated.contentHash, CONTENT_HASH)
  assert.equal(validated.stepCount, 1)
  assert.equal(modelCalls.length, 1)
  assert.deepEqual(mcpCalls.map((call) => call.name), ['journey_prepare', 'journey_get'])
})

test('invalid model JSON stops before MCP mutation', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-rf043-invalid-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = await new EncryptedSessionStore({ root, sessionIdFactory: () => SESSION }).initialize()
  await store.create({ namespace: 'offline-tenant', threadId: 'thread-rf043', journeyId: JOURNEY, releaseIdentityHash: RELEASE, events: [] })
  let mutations = 0
  const service = createProductionService({
    sessionStore: store, releaseIdentityHash: RELEASE, namespace: 'offline-tenant',
    modelConfig: { apiKey: 'offline-not-secret', baseURL: 'http://model.invalid/v1', model: 'offline-model' },
    modelFactory: () => ({ withConfig: () => ({ async invoke() { return { content: '{invalid' } } }) }),
    mcpClient: { async callTool() { mutations += 1; return textResult({}) } }, writeGate: async () => undefined,
  })
  await assert.rejects(service.journeyAuthor({
    sessionId: SESSION, goal: 'test', entryUrl: 'http://127.0.0.1:18081', targetSystem: 'bank', credentialRef: CREDENTIAL,
  }), (error) => error.code === 'JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_JSON_SYNTAX')
  assert.equal(mutations, 0)
})
