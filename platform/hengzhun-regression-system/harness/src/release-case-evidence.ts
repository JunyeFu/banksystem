import { z } from 'zod';

const id = z.string().min(1);
const yes = z.literal(true);
const cents = z.string().regex(/^-?\d+$/);
const balances = z.object({source:cents,target:cents});
const money = z.object({before:balances,after:balances});
const settled = z.object({transferId:id,correlationId:id,fineractTransactionId:id,balanced:yes});
const schemas = {
  B01:z.array(z.object({who:z.enum(['customer','operator']),refreshMs:z.number().nonnegative(),audienceBound:yes,sessionRestored:yes})).length(2),
  B02:z.object({localAccessCleared:yes,protectedNavigation:z.literal('LOGIN'),anonymousApi:z.literal(401)}),
  B03:z.object({accountId:id,balanceMatches:yes,otherAccountStatus:z.literal(404)}),
  B04:z.object({journeyId:z.literal('bank-transfer-golden'),correlationId:id,sourceAccountId:id,targetAccountId:id,
    amount:z.literal('100.00'),currency:z.literal('CNY'),fineractTransactionId:id,status:z.literal('COMPLETED')}),
  B05:settled.extend({deltaCents:z.literal('100'),replaySameTransfer:yes,balances:money}),
  B06:z.object({conflict:z.literal(409),noMoneyMovement:yes,balances:money}),
  B07:z.object({status:z.literal('FAILED'),noMoneyMovement:yes,balances:money}),
  B08:z.object({sourceOwnership:z.literal(403),operationsAccess:z.literal(403),noMoneyMovement:yes,balances:money}),
  B09:z.object({notificationId:id,readPersisted:yes}),
  B10:z.object({beneficiaryId:id,unique:yes}),
  B11:z.object({applicationId:id,coreLoanId:z.union([id,z.number().int().positive()]),selfApproval:z.literal(409),
    independentApproval:yes,principalCents:z.literal('100000'),idempotent:yes,
    repaymentTransactionId:z.union([id,z.number().int().positive()]),repaymentCount:z.literal(1),changedRepayment:z.literal(409),prematureClose:z.literal(409)}),
  B12:z.object({documentId:id,winners:z.literal(1),conflicts:z.literal(19),status:z.literal('ARCHIVED'),downloadMatches:yes}),
  B13:z.array(z.object({type:z.enum(['CHANNEL_TO_CORE','CHANNEL_TO_CLEARING','CORE_TO_GENERAL_LEDGER']),runId:id})).length(3),
  B14:z.object({containers:z.literal('PRESERVED'),mounts:z.literal('PRESERVED'),history:z.literal('SETTLED'),balancesUnchanged:yes,servicesLeftRunning:yes}),
} satisfies Record<string,z.ZodTypeAny>;

/** Re-evaluate the declared case contract rather than treating PASSED as evidence. */
export function validBankCaseEvidence(caseId: string, facts: unknown): boolean {
  const schema=schemas[caseId as keyof typeof schemas];
  if(!schema)return false;
  const parsed=schema.safeParse(facts);
  if(!parsed.success)return false;
  const value=parsed.data;
  if(caseId==='B01')return new Set((value as z.infer<typeof schemas.B01>).map(x=>x.who)).size===2;
  if(caseId==='B13')return new Set((value as z.infer<typeof schemas.B13>).map(x=>x.type)).size===3;
  if(caseId==='B04'){
    const transfer=value as z.infer<typeof schemas.B04>;
    return transfer.sourceAccountId!==transfer.targetAccountId;
  }
  if(['B05','B06','B07','B08'].includes(caseId)){
    const {before,after}=(value as {balances:z.infer<typeof money>}).balances;
    const debit=BigInt(before.source)-BigInt(after.source);
    const credit=BigInt(after.target)-BigInt(before.target);
    const expected=caseId==='B05'?100n:0n;
    return debit===expected&&credit===expected;
  }
  return true;
}

const measurement=z.object({
  samples:z.array(z.object({ms:z.number().nonnegative(),ok:z.boolean(),status:z.number().int().optional(),timeout:z.boolean().optional()})).min(1),
  attempted:z.number().int(),completed:z.number().int(),failed:z.number().int(),errorRate:z.number(),
  p95Ms:z.number().nonnegative(),elapsedMs:z.number().positive(),
  statusCounts:z.record(z.string(),z.number().int().nonnegative()),
});
const load=measurement.extend({concurrency:z.number().int().positive(),offered:z.number().int(),stoppedEarly:z.literal(false)});
type Measurement=z.infer<typeof measurement>;

function measuredWithin(value:Measurement,limitMs:number,maxErrorRate:number,allowConflict=false):boolean {
  const samples=value.samples,failed=samples.filter(s=>!s.ok).length;
  const p95=samples.map(s=>s.ms).sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1];
  const counts:Record<string,number>={};
  for(const sample of samples){
    const accepted=sample.status!==undefined&&((sample.status>=200&&sample.status<300)||(allowConflict&&sample.status===409));
    if(sample.ok!==accepted||(sample.timeout&&sample.ok))return false;
    const key=String(sample.status||'TRANSPORT_ERROR');counts[key]=(counts[key]||0)+1;
  }
  return value.attempted===samples.length&&value.completed===samples.length&&value.failed===failed&&
    value.errorRate===failed/samples.length&&value.errorRate<=maxErrorRate&&value.p95Ms===p95&&p95<=limitMs&&
    Object.keys(counts).length===Object.keys(value.statusCounts).length&&Object.entries(counts).every(([key,count])=>value.statusCounts[key]===count);
}
function moved(value:z.infer<typeof money>,amount:bigint):boolean {
  return BigInt(value.before.source)-BigInt(value.after.source)===amount&&
    BigInt(value.after.target)-BigInt(value.before.target)===amount;
}

/** Performance admission recomputes metrics from observations; unimplemented cases cannot pass. */
export function validPerformanceCaseEvidence(caseId:string,facts:unknown):boolean {
  if(caseId==='P05'){
    const sample=z.object({journeyId:z.string().min(1),runId:z.string().min(1),taskId:z.string().min(1),sessionId:z.string().min(1),
      candidateId:z.string().min(1),scriptHash:z.string().regex(/^[a-f0-9]{64}$/),status:z.literal('PASSED'),
      createdAt:z.string().datetime(),startedAt:z.string().datetime(),completedAt:z.string().datetime(),
      queueMs:z.number().finite().nonnegative(),executionMs:z.number().finite().nonnegative(),wallMs:z.number().finite().nonnegative()});
    const account=z.object({balanceCents:z.string().regex(/^-?\d+$/),transactionIds:z.array(z.string())});
    const snapshot=z.object({source:account,target:account});
    const result=z.object({sourceJourneyId:z.string().min(1),sourceRunId:z.string().min(1),noMoneyMovement:z.literal(true),
      stages:z.array(z.object({concurrency:z.number(),offered:z.number(),completed:z.number(),elapsedMs:z.number().finite().nonnegative(),
        samples:z.array(sample),coreObservations:z.object({before:snapshot,after:snapshot})})).length(3)}).safeParse(facts);
    if(!result.success)return false;
    const f=result.data,all=f.stages.flatMap(s=>s.samples);
    return ['journeyId','runId','taskId','sessionId'].every(key=>new Set(all.map(s=>s[key as keyof typeof s])).size===7)&&
      new Set(all.map(s=>s.candidateId)).size===1&&new Set(all.map(s=>s.scriptHash)).size===1&&
      f.stages.every((s,i)=>s.concurrency===[1,2,4][i]&&s.offered===s.concurrency&&s.completed===s.concurrency&&s.samples.length===s.concurrency&&
        JSON.stringify(s.coreObservations.before)===JSON.stringify(s.coreObservations.after)&&
        Math.max(...s.samples.map(v=>Date.parse(v.createdAt)))<=Math.min(...s.samples.map(v=>Date.parse(v.completedAt)))&&
        s.samples.every(v=>v.journeyId!==f.sourceJourneyId&&v.runId!==f.sourceRunId&&
          v.queueMs===Date.parse(v.startedAt)-Date.parse(v.createdAt)&&v.executionMs===Date.parse(v.completedAt)-Date.parse(v.startedAt)));
  }
  if(caseId==='P07') {
    const result=z.object({portals:z.array(measurement.extend({who:z.enum(['customer','operator'])})).length(2)}).safeParse(facts);
    return result.success&&new Set(result.data.portals.map(p=>p.who)).size===2&&
      result.data.portals.every(p=>p.samples.length===20&&measuredWithin(p,3000,0));
  }
  if(caseId==='P01'||caseId==='P06') {
    const schema=caseId==='P01'?z.object({stages:z.array(load).length(4)}):
      z.object({windows:z.array(load).length(30),durationMinutes:z.literal(30),concurrency:z.literal(10),reconciliation:schemas.B13});
    const result=schema.safeParse(facts);
    if(!result.success)return false;
    const stages='stages' in result.data?result.data.stages:result.data.windows;
    return stages.every((stage,i)=>stage.concurrency===(caseId==='P01'?[1,5,10,20][i]:10)&&
      stage.elapsedMs>=(caseId==='P01'?120000:60000)&&stage.offered===stage.completed&&measuredWithin(stage,1000,.01))&&
      (!('reconciliation' in result.data)||new Set(result.data.reconciliation.map(r=>r.type)).size===3);
  }
  if(caseId==='P02') {
    const result=z.object({stages:z.array(load.extend({transactions:z.array(settled).length(100),balances:money})).length(3)}).safeParse(facts);
    if(!result.success)return false;
    const transactions=result.data.stages.flatMap(s=>s.transactions);
    return ['transferId','correlationId','fineractTransactionId'].every(key=>new Set(transactions.map(t=>t[key as keyof typeof t])).size===300)&&
      result.data.stages.every((s,i)=>s.concurrency===[1,5,10][i]&&s.offered===100&&s.completed===100&&
        measuredWithin(s,15000,0)&&moved(s.balances,10000n));
  }
  if(caseId==='P03') {
    const result=settled.extend({requests:z.literal(20),uniqueTransfers:z.literal(1),balances:money,
      statusCounts:z.record(z.string(),z.number().int().nonnegative())}).safeParse(facts);
    return result.success&&moved(result.data.balances,100n)&&
      Object.entries(result.data.statusCounts).every(([s])=>Number(s)>=200&&Number(s)<300)&&
      Object.values(result.data.statusCounts).reduce((sum,n)=>sum+n,0)===20;
  }
  if(caseId==='P04') {
    const result=load.extend({documentId:id,expectedConflicts:z.literal(19)}).safeParse(facts);
    return result.success&&result.data.concurrency===20&&result.data.offered===20&&result.data.completed===20&&
      result.data.statusCounts['200']===1&&result.data.statusCounts['409']===19&&measuredWithin(result.data,Infinity,0,true);
  }
  return false;
}
