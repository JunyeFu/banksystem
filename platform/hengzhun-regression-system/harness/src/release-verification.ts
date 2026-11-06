import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import { validBankCaseEvidence, validPerformanceCaseEvidence } from './release-case-evidence';
import { typedBusinessInputsV2Schema } from './schemas';

const digest = (bytes: Buffer | string): string => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reportSchema = z.object({
  schemaVersion: z.literal('bank-agent-acceptance-report/v1'), suite: z.string(), runId: z.string().uuid(),
  releaseIdentityHash: hash, suiteSha256: hash, finishedAt: z.string().datetime(),
  cleanupRef: z.string(), cleanupSha256: hash, status: z.enum(['PARTIAL', 'FAILED']),
  artifacts: z.array(z.object({ path: z.string(), sha256: hash, size: z.number().int().nonnegative() })),
  cases: z.array(z.object({ id: z.string(), evidenceClass: z.string(), status: z.enum(['PASSED','FAILED']),
    assertions: z.unknown().optional() }).passthrough())
}).passthrough();
type Report = z.infer<typeof reportSchema>;
type Registered = { run_id: string; report_path: string; report_sha256: string };
const resourceSchema = z.object({ kind: z.enum(['KEYCLOAK_USER','IDENTITY_MAPPING','CUSTOMER_SCENARIO']), ref: z.string().min(1) }).strict();
const cleanupSchema = z.object({
  schemaVersion: z.literal('rf057-identity-cleanup/v2'), cleanupId: z.string().regex(/^[a-f0-9]{32}$/),
  runId: z.string().uuid(), releaseIdentityHash: hash, status: z.literal('COMPLETED'), createdAt: z.string().datetime(),
  ownedResources: z.array(resourceSchema), results: z.array(resourceSchema.extend({status:z.enum(['REMOVED','ABSENT'])})),
  failures: z.array(z.string()).length(0)
}).strict();

/** Authenticated producers register immutable report hashes; only Harness writes release decisions. */
export class ReleaseVerification {
  constructor(private readonly database: HarnessDatabase, private readonly repositoryRoot: string,
    private readonly identity: string | undefined, private readonly currentIdentity: () => string,
    private readonly verifyJourney: (caseId: string,namespace: string, journeyId: string,expectedFailure?:unknown) => Record<string, unknown>) {}

  verifyCaseEvidence(caseId:string,journeyId:string):Record<string,unknown> {
    this.requireCurrent();
    const suite=JSON.parse(fs.readFileSync(path.join(this.repositoryRoot,'scripts/test/rf057/suite.json'),'utf8'));
    const expected=suite.cases.find((c:{id:string;evidenceClass:string})=>c.id===caseId&&(c.evidenceClass==='LIVE_AGENT'||c.id==='P05'));
    if(!expected)throw new HarnessError(400,'RELEASE_AGENT_CASE_INVALID','CONTRACT','没有对应的正式Agent场景。');
    return this.verifyJourney(caseId,'hengzhun-local',journeyId,expected.expectedFailure);
  }

  private requireCurrent(): string {
    if (!this.identity || this.currentIdentity() !== this.identity)
      throw new HarnessError(409, 'RELEASE_SOURCE_STALE', 'CONTRACT', '运行身份与当前源码不一致。');
    return this.identity;
  }
  private file(relative: string, pattern: RegExp): Buffer {
    if (!pattern.test(relative)) throw new HarnessError(400, 'RELEASE_PATH_INVALID', 'CONTRACT', '证据路径不在允许目录内。');
    const base = fs.realpathSync(this.repositoryRoot);
    const absolute = fs.realpathSync(path.join(base, relative));
    if (!absolute.startsWith(base + path.sep)) throw new HarnessError(400, 'RELEASE_PATH_INVALID', 'CONTRACT', '证据路径越界。');
    return fs.readFileSync(absolute);
  }
  private readReport(relative: string): { report: Report; sha256: string } {
    const bytes = this.file(relative, /^agent\/runs\/(rf057|rf057-agent)\/[a-f0-9-]{36}\/report\.json$/);
    const report = reportSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (!relative.endsWith(`/${report.runId}/report.json`)) throw new Error('RELEASE_RUN_PATH_MISMATCH');
    const suiteBytes = fs.readFileSync(path.join(this.repositoryRoot, 'scripts/test/rf057/suite.json'));
    const suite = JSON.parse(suiteBytes.toString('utf8')) as {suite: string; cases: Array<{id: string; evidenceClass: string}>};
    if (report.releaseIdentityHash !== this.identity || report.suiteSha256 !== digest(suiteBytes) || report.suite !== suite.suite)
      throw new HarnessError(409, 'RELEASE_REPORT_IDENTITY_MISMATCH', 'CONTRACT', '报告不属于当前身份和清单。');
    const ids = new Set<string>();
    for (const item of report.cases) {
      if (ids.has(item.id) || !suite.cases.some(c => c.id === item.id && c.evidenceClass === item.evidenceClass))
        throw new Error('RELEASE_CASE_CONTRACT_MISMATCH');
      ids.add(item.id);
    }
    const cleanupBytes = this.file(report.cleanupRef, /^agent\/runs\/rf057-cleanup\/[a-f0-9]{32}\.json$/);
    const cleanup = JSON.parse(cleanupBytes.toString('utf8'));
    if (cleanup.status !== 'COMPLETED') throw new HarnessError(409, 'RELEASE_CLEANUP_INCOMPLETE', 'CONTRACT', '测试清理未完成。');
    const parsedCleanup = cleanupSchema.safeParse(cleanup);
    if (!parsedCleanup.success) throw new HarnessError(409,'RELEASE_CLEANUP_INVALID','CONTRACT','清理回执合同不成立。');
    const receipt = parsedCleanup.data;
    const keys = (resources: Array<{kind:string;ref:string}>): string[] => resources.map(r=>JSON.stringify([r.kind,r.ref])).sort();
    const owned = keys(receipt.ownedResources), removed = keys(receipt.results);
    if (receipt.runId !== report.runId || receipt.releaseIdentityHash !== report.releaseIdentityHash ||
      report.cleanupRef !== `agent/runs/rf057-cleanup/${receipt.cleanupId}.json` ||
      new Set(owned).size !== owned.length || new Set(removed).size !== removed.length ||
      JSON.stringify(owned) !== JSON.stringify(removed) || digest(cleanupBytes) !== report.cleanupSha256)
      throw new HarnessError(409,'RELEASE_CLEANUP_BINDING_MISMATCH','CONTRACT','清理回执归属、资源或摘要不匹配。');
    const reportDirectory = relative.slice(0, relative.lastIndexOf('/') + 1);
    for (const artifact of report.artifacts) {
      if (!artifact.path.startsWith(reportDirectory) || artifact.path.split('/').some(p => p === '..') || artifact.path === relative)
        throw new Error('RELEASE_ARTIFACT_PATH_INVALID');
      const content = this.file(artifact.path, /^agent\/runs\/(rf057|rf057-agent)\/[a-f0-9-]{36}\/.+$/);
      if (content.length !== artifact.size || digest(content) !== artifact.sha256)
        throw new HarnessError(409, 'RELEASE_ARTIFACT_CHANGED', 'CONTRACT', '证据文件摘要不匹配。');
    }
    return { report, sha256: digest(bytes) };
  }
  async register(reportPath: string): Promise<Record<string, unknown>> {
    const identity = this.requireCurrent();
    const { report, sha256 } = this.readReport(reportPath);
    await this.database.write(db => {
      const previous = db.prepare('SELECT report_sha256 FROM acceptance_reports WHERE run_id=?').get(report.runId) as {report_sha256: string} | undefined;
      if (previous && previous.report_sha256 !== sha256)
        throw new HarnessError(409, 'RELEASE_REPORT_IMMUTABLE', 'CONTRACT', '已登记报告不可替换。');
      db.prepare('INSERT INTO acceptance_reports(run_id,release_identity_hash,report_path,report_sha256,registered_at) VALUES (?,?,?,?,?) ON CONFLICT(run_id) DO NOTHING')
        .run(report.runId, identity, reportPath, sha256, new Date().toISOString());
    });
    return { runId: report.runId, sha256, status: 'REGISTERED' };
  }

  private validInterruption(report:Report | undefined,facts:Record<string,unknown>,proof:Record<string,unknown>):boolean {
    if(!report||typeof facts.interruptionEvidence!=='string'||
      !report.artifacts.some(artifact=>artifact.path===facts.interruptionEvidence))return false;
    const receiptSchema=z.object({schemaVersion:z.literal('rf057-cli-interruption/v1'),releaseIdentityHash:hash,
      journeyId:z.string(),sessionId:z.string(),runId:z.string(),taskId:z.string(),cliPid:z.number().int().positive(),
      journeyStage:z.literal('RUNNING'),taskStatus:z.enum(['QUEUED','RUNNING']),observedAt:z.string().datetime(),
      interruptedAt:z.string().datetime(),recoveredAt:z.string().datetime(),recoveredRunId:z.string(),recoveredTaskId:z.string()});
    const receipt=receiptSchema.safeParse(JSON.parse(this.file(facts.interruptionEvidence,
      /^agent\/runs\/rf057-agent\/[a-f0-9-]{36}\/a05-process-interruption\.json$/).toString('utf8')));
    if(!receipt.success)return false;
    const r=receipt.data;
    const account=z.object({balanceCents:z.string().regex(/^-?\d+$/),transactionIds:z.array(z.string())});
    const money=z.object({before:z.object({source:account,target:account}),after:z.object({source:account,target:account})})
      .safeParse(facts.coreObservations);
    return money.success&&JSON.stringify(money.data.before)===JSON.stringify(money.data.after)&&
      r.releaseIdentityHash===this.identity&&r.journeyId===facts.journeyId&&r.sessionId===facts.sessionId&&
      r.runId===proof.runId&&r.recoveredRunId===proof.runId&&r.taskId===proof.taskId&&r.recoveredTaskId===proof.taskId&&
      Date.parse(r.observedAt)<=Date.parse(r.interruptedAt)&&Date.parse(r.interruptedAt)<=Date.parse(r.recoveredAt);
  }
  private validRepeat(reports:Report[],facts:Record<string,unknown>,proof:Record<string,unknown>):boolean {
    const account=z.object({balanceCents:z.string().regex(/^-?\d+$/),transactionIds:z.array(z.string())});
    const money=z.object({before:z.object({source:account,target:account}),after:z.object({source:account,target:account})})
      .safeParse(facts.coreObservations);
    const sourceObserved=reports.some(report=>report.cases.some(item=>{
      const source=item.assertions as Record<string,unknown>|undefined;
      return item.id==='A01'&&item.status==='PASSED'&&source?.journeyId===proof.sourceJourneyId&&source?.runId===proof.sourceRunId;
    }));
    return sourceObserved&&money.success&&JSON.stringify(money.data.before)===JSON.stringify(money.data.after)&&
      proof.sameFrozenScript===true&&facts.sameFrozenScript===true&&facts.sourceJourneyId===proof.sourceJourneyId&&
      facts.sourceRunId===proof.sourceRunId&&facts.runId===proof.runId&&facts.taskId===proof.taskId&&
      facts.candidateId===proof.candidateId&&facts.scriptHash===proof.scriptHash;
  }
  private validFinancial(facts:Record<string,unknown>,proof:Record<string,unknown>):boolean {
    const transfer=z.object({transferId:z.string().uuid(),correlationId:z.string().min(1),coreReference:z.string().min(1),
      status:z.literal('SETTLED'),sourceAccountId:z.string(),destinationAccountId:z.string(),beneficiaryId:z.string().uuid(),
      amount:z.string().regex(/^1(?:\.0{1,2})?$/),currency:z.literal('CNY'),reference:z.string().min(1)});
    const account=z.object({balanceCents:z.string().regex(/^\d+$/),transactionIds:z.array(z.string().min(1))});
    const parsed=z.object({journeyId:z.string(),runId:z.string(),taskId:z.string(),transferId:z.string(),correlationId:z.string(),
      fineractTransactionId:z.string(),balanced:z.literal(true),
      coreObservations:z.object({before:z.object({source:account,target:account}),after:z.object({source:account,target:account})}),
      bankReadbacks:z.object({customer:transfer,operations:transfer,payment:z.object({transfer:z.object({
        transferId:z.string(),correlationId:z.string(),coreReference:z.string(),status:z.literal('SETTLED'),amount:z.string().regex(/^1(?:\.0{1,2})?$/)}),
        coreTransactionVerified:z.literal(true),coreAmountMatched:z.literal(true),coreEntryCount:z.number().int().min(2)}),
        projection:z.object({projectionBalanced:z.literal(true),projectionEntryCount:z.literal(2),
          projectionDebits:z.string().regex(/^1(?:\.0{1,2})?$/),projectionCredits:z.string().regex(/^1(?:\.0{1,2})?$/)})})}).safeParse(facts);
    const frozen=typedBusinessInputsV2Schema.safeParse(proof.businessInputs);
    const formal=z.object({sourceAccountId:z.string().regex(/^[1-9][0-9]{0,18}$/),targetAccountId:z.string().regex(/^[1-9][0-9]{0,18}$/)}).safeParse(proof.formalAccountIds);
    if(!parsed.success||!frozen.success||!formal.success||formal.data.sourceAccountId!==frozen.data.values.payerAccountId)return false;
    const f=parsed.data,v=frozen.data.values,{customer,operations,payment}=f.bankReadbacks;
    if(!/^1(?:\.0{1,2})?$/.test(v.amount??'')||v.currency!=='CNY'||
      f.journeyId!==proof.journeyId||f.runId!==proof.runId||f.taskId!==proof.taskId)return false;
    for(const item of [customer,operations]){
      if(item.sourceAccountId!==v.payerAccountId||item.beneficiaryId!==v.payeeRef||item.reference!==v.purpose||
        item.sourceAccountId===item.destinationAccountId||item.destinationAccountId!==formal.data.targetAccountId||
        item.transferId!==f.transferId||item.correlationId!==f.correlationId||item.coreReference!==f.fineractTransactionId)return false;
    }
    if(payment.transfer.transferId!==f.transferId||payment.transfer.correlationId!==f.correlationId||
      payment.transfer.coreReference!==f.fineractTransactionId)return false;
    const {before,after}=f.coreObservations;
    if(BigInt(before.source.balanceCents)-BigInt(after.source.balanceCents)!==100n||
      BigInt(after.target.balanceCents)-BigInt(before.target.balanceCents)!==100n)return false;
    return (['source','target'] as const).every(side=>{
      const old=before[side].transactionIds,next=after[side].transactionIds;
      return new Set(old).size===old.length&&new Set(next).size===next.length&&next.length===old.length+1&&old.every(id=>next.includes(id));
    });
  }
  async verify(): Promise<Record<string, unknown>> {
    const identity = this.requireCurrent();
    const suiteBytes = fs.readFileSync(path.join(this.repositoryRoot,'scripts/test/rf057/suite.json'));
    const suite = JSON.parse(suiteBytes.toString('utf8')) as {suite: string; cases: Array<{id: string; required: boolean; evidenceClass: string;expectedFailure?:unknown}>};
    const rows = this.database.read(db => db.prepare('SELECT run_id,report_path,report_sha256 FROM acceptance_reports WHERE release_identity_hash=? ORDER BY registered_at,run_id').all(identity) as Registered[]);
    const admitted: Report[] = [];
    for (const row of rows) {
      const value = this.readReport(row.report_path);
      if (value.sha256 !== row.report_sha256) throw new HarnessError(409,'RELEASE_REPORT_CHANGED','CONTRACT','已登记报告被修改。');
      admitted.push(value.report);
    }
    const allowedFailedRunIds:string[]=[];
    const cases = suite.cases.filter(c => c.required).map(expected => {
      const matches = admitted.flatMap(r => r.cases.filter(c => c.id === expected.id));
      let status = !matches.length ? 'NOT_RUN' : matches.some(c => c.status !== 'PASSED') ? 'FAILED' : 'PASSED';
      if(status==='PASSED'&&expected.evidenceClass==='LIVE_BANK'&&
        !matches.every(c=>validBankCaseEvidence(expected.id,c.assertions)))status='INVALID_CASE_EVIDENCE';
      if(status==='PASSED'&&expected.evidenceClass==='PERFORMANCE'&&
        !matches.every(c=>validPerformanceCaseEvidence(expected.id,c.assertions)))status='INVALID_CASE_EVIDENCE';
      if(status==='PASSED'&&expected.id==='P05'&&!matches.every(c=>{
        const facts=c.assertions as {stages:Array<{samples:Array<Record<string,unknown>>}>};
        return facts.stages.every(stage=>stage.samples.every(sample=>{
          if(typeof sample.journeyId!=='string')return false;
          const proof=this.verifyJourney('P05','hengzhun-local',sample.journeyId);
          const timing=proof.timing as Record<string,unknown>|undefined;
          return proof.verdict==='VERIFIED'&&proof.releaseIdentityHash===identity&&proof.runStatus==='PASSED'&&
            this.validRepeat(admitted,{...sample,...c.assertions as object,coreObservations:(stage as unknown as Record<string,unknown>).coreObservations,
              sameFrozenScript:true},proof)&&timing!==undefined&&
            ['createdAt','startedAt','completedAt','queueMs','executionMs'].every(key=>sample[key]===timing[key]);
        }));
      }))status='INVALID_AGENT_OBSERVATION';
      if (status === 'PASSED' && expected.evidenceClass === 'LIVE_AGENT') {
        const facts = matches.at(-1)?.assertions as Record<string, unknown> | undefined;
        if (!facts || typeof facts.journeyId !== 'string') status = 'MISSING_AGENT_LEDGER';
        else {
          const proof = this.verifyJourney(expected.id,'hengzhun-local',facts.journeyId,expected.expectedFailure);
          const expectedRun = expected.id === 'A07' ? 'FAILED' : expected.id==='A04'?'NEEDS_INPUT':'PASSED';
          if (proof.verdict !== 'VERIFIED' || proof.releaseIdentityHash !== identity || proof.runStatus !== expectedRun)
            status = 'INVALID_AGENT_LEDGER';
          else if(expected.id==='A02'&&!matches.every(item=>{
            const observation=item.assertions as Record<string,unknown>;
            if(typeof observation?.journeyId!=='string')return false;
            const binding=observation===facts?proof:this.verifyJourney('A02','hengzhun-local',observation.journeyId);
            return binding.verdict==='VERIFIED'&&binding.releaseIdentityHash===identity&&binding.runStatus==='PASSED'&&this.validFinancial(observation,binding);
          }))status='INVALID_AGENT_OBSERVATION';
          else if(expected.id==='A05'&&!this.validInterruption(admitted.find(r=>r.cases.includes(matches.at(-1)!)),facts,proof))
            status='INVALID_AGENT_OBSERVATION';
          else if(expected.id==='A06'&&!this.validRepeat(admitted,facts,proof))status='INVALID_AGENT_OBSERVATION';
          else if(expected.id==='A07'&&typeof proof.runId==='string')allowedFailedRunIds.push(proof.runId);
        }
      }
      return { id: expected.id, status };
    });
    const passed = cases.filter(c => c.status === 'PASSED').length;
    const unexpectedFailures=this.database.read(db=>(db.prepare("SELECT run_id FROM runs WHERE release_identity_hash=? AND status IN ('FAILED','BLOCKED')")
      .all(identity) as Array<{run_id:string}>).filter(row=>!allowedFailedRunIds.includes(row.run_id)).map(row=>row.run_id));
    const decision = passed === cases.length && !admitted.some(r => r.status === 'FAILED') && unexpectedFailures.length===0 ? 'GO' : 'NO_GO';
    const result = {schemaVersion:'rf057-release-verification/v1', releaseIdentityHash:identity, suite:suite.suite,
      suiteSha256:digest(suiteBytes), required:cases.length, passed, cases, decision,
      reports:rows.map(r=>({runId:r.run_id,sha256:r.report_sha256})), allowedFailedRunIds,unexpectedFailures,verificationPerformed:true};
    const evidenceSha256 = digest(JSON.stringify(result));
    await this.database.write(db => db.prepare(`INSERT INTO release_verifications
      (verification_id,release_identity_hash,decision,passed,required,evidence_sha256,result_json,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(),identity,decision,passed,cases.length,evidenceSha256,JSON.stringify(result),new Date().toISOString()));
    return {...result,evidenceSha256};
  }
}
