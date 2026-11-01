import fs from 'node:fs';
import path from 'node:path';
import { ArtifactStore, type StagedArtifact } from './artifact-store';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import {
  buildActionContextEnvelope,
  buildMidscenePrompt,
  estimateImageTokens,
  MODEL_CONTEXT_POLICIES,
  type ContextLevel,
  type ModelUsage
} from './context-envelope';
import type {
  CaseCreateDraftInput,
  CaseImportSubmitInput,
  DecisionSubmitInput,
  PlanCompileInput,
  RepairCandidateCreateInput,
  RunSubmitInput,
  ScheduleCreateInput,
  ScheduleDisableInput,
  I9KnowledgeSnapshotRegistrationInput
} from './schemas';
import { intentPlanSchema, typedBusinessInputsV2Schema } from './schemas';
import type { I8AuthoringSubmitInput, I8CasePrepareInput } from './i8/stage2-schemas';
import {
  executableActionPlanSchema,
  i8CandidateBuildCompletionSchema,
  type ExecutableActionPlan,
  type I8CandidateBuildCompletionInput,
  type I8CandidateCompileInput
} from './i8/stage3-schemas';
import { buildCandidatePackage, buildPatchedCandidatePackage, compileExecutableActionPlan, I8_CONTROLLED_CATALOG } from './i8/script-package-builder';
import {
  I8_STABILITY_VIEWPORTS,
  i8StabilityCompletionSchema,
  type I8StabilityCompletionInput
} from './i8/stage4-schemas';
import type {
  I8CandidateDecisionInput,
  I8CandidatePreviewInput,
  I8RunSubmitInput
} from './i8/stage5-schemas';
import type { I8ResultInboxAckInput, I8ResultInboxListInput, I8ScheduleCreateInput } from './i8/stage6-schemas';
import {
  classifyI8Failure,
  scriptPatchProposalSchema,
  type I8IncidentClassification,
  type I8RepairDecisionInput,
  type I8RepairProposeInput
} from './i8/stage7-schemas';
import { nextCronOccurrence, parseCron, validateTimeZone } from './cron';
import { canonicalJson, nowIso, opaqueId, requestHash, sha256 } from './utils';
import { I10Service } from './i10/service';
import { feedbackRecordSchema, feedbackVerifySchema, matchReviewedLocators, matchReviewedAssertions, type ReviewedAssertion, type ReviewedLocator, type ReviewedFeedbackSource, type FeedbackRecordInput, type FeedbackVerifyInput } from './feedback';
import { resolveTargetAdapterBinding } from './i8/target-adapter-registry';
import type { JourneyPrepareInput } from './i10/schemas';
import { bankValidationFixturesSchema, type BankValidationFixtures, type BankValidationFixture } from './i10/schemas';

function bankExecutionFixtureValues(fixture: BankValidationFixture): Record<string,string> {
  return {'TRANSFER.PAYER_ACCOUNT_ID':fixture.sourceAccountId,'TRANSFER.PAYEE_REF':fixture.beneficiaryRef,'TRANSFER.CURRENCY':fixture.currency};
}

function requireBankValidationFixtures(db:import('better-sqlite3').Database,namespace:string,definition:Record<string,unknown>):BankValidationFixtures {
  if(!definition.bankValidationFixtures)
    throw new HarnessError(409,'I10_BANK_VALIDATION_FIXTURES_REQUIRED','CONTRACT','资金作者化和稳定性验证需要独立的真实账户与凭据样本。',false,true);
  const parsed=bankValidationFixturesSchema.safeParse(definition.bankValidationFixtures);
  if(!parsed.success)throw new HarnessError(409,'I10_BANK_VALIDATION_FIXTURES_INVALID','CONTRACT','资金验证样本绑定不完整或不独立。',false,true);
  const pool=parsed.data,samples=[pool.authoring,...pool.stability.map(item=>item.fixture)];
  const values=(definition.businessInputs as {values?:Record<string,unknown>}|undefined)?.values;
  if(pool.formalAccountIds.sourceAccountId!==values?.payerAccountId || values?.currency!=='CNY' ||
    samples.some(item=>item.credentialRef===definition.credentialRef || item.beneficiaryRef===values?.payeeRef))
    throw new HarnessError(409,'I10_BANK_VALIDATION_FORMAL_BINDING_INVALID','CONTRACT','验证样本不得复用正式账户、收款人或凭据。',false,true);
  const credential=db.prepare(`SELECT r.credential_ref FROM i10_credential_refs r JOIN i10_credential_sessions s ON s.session_id=r.session_id
    WHERE r.namespace=? AND s.namespace=? AND r.credential_ref=? AND s.credential_ref=r.credential_ref AND s.status='READY'`);
  for(const sample of samples)if(!credential.get(namespace,namespace,sample.credentialRef))
    throw new HarnessError(409,'I10_BANK_VALIDATION_CREDENTIAL_NOT_READY','SECURITY','资金验证样本凭据未在当前命名空间登记就绪。',false,true);
  return pool;
}

function assertBankValidationPoolUnused(db:import('better-sqlite3').Database,pool:BankValidationFixtures):void {
  const samples=[pool.authoring,...pool.stability.map(item=>item.fixture)];
  const accounts=new Set(samples.flatMap(item=>[item.sourceAccountId,item.targetAccountId]));
  const identities=new Set(samples.flatMap(item=>[item.fixtureId,item.subject,item.credentialRef,item.beneficiaryRef]));
  const clients=new Set(samples.flatMap(item=>[item.sourceClientId,item.targetClientId]));
  const used=db.prepare(`SELECT DISTINCT cv.definition_json FROM i8_candidate_build_jobs j
    JOIN i8_executable_plans p ON p.executable_plan_id=j.executable_plan_id
    JOIN case_versions cv ON cv.case_id=p.case_id AND cv.version=p.case_version WHERE j.attempt_count>0`).all() as Array<{definition_json:string}>;
  for(const row of used) {
    const value=JSON.parse(row.definition_json).bankValidationFixtures;
    if(!value)continue;
    const existing=bankValidationFixturesSchema.parse(value);
    if([existing.authoring,...existing.stability.map(item=>item.fixture)].some(item=>
      accounts.has(item.sourceAccountId)||accounts.has(item.targetAccountId)||clients.has(item.sourceClientId)||clients.has(item.targetClientId)||
      identities.has(item.fixtureId)||identities.has(item.subject)||identities.has(item.credentialRef)||identities.has(item.beneficiaryRef)))
      throw new HarnessError(409,'I10_BANK_VALIDATION_FIXTURES_CONSUMED','DOMAIN','资金验证样本已领取执行权；请重新准备独立客户与账户。',false,true);
  }
}

interface RequestContext {
  requestId: string;
  credentialFingerprint?: string;
  actorType?: 'COZE' | 'SYSTEM';
}

interface IdempotentResult {
  status: number;
  response: Record<string, unknown>;
  replayed: boolean;
}

interface StoredIdempotency {
  request_hash: string;
  response_status: number;
  response_json: string;
}

type VisualTargetRef = Parameters<typeof buildActionContextEnvelope>[0]['currentAction']['targetRef'];
type VisualActionType = Parameters<typeof buildActionContextEnvelope>[0]['currentAction']['actionType'];

const I10_VISUAL_TARGETS = new Set<VisualTargetRef>([
  'LOGIN_SSO_SUBMIT', 'LOGIN_USERNAME', 'LOGIN_PASSWORD', 'LOGIN_SUBMIT', 'HEADER_DISPLAY_NAME', 'HEADER_AVATAR',
  'HEADER_PROFILE_LINK', 'PROFILE_DISPLAY_NAME', 'PROFILE_AVATAR', 'TRANSFER_ENTRY',
  'TRANSFER_NEW', 'TRANSFER_SOURCE_ACCOUNT', 'TRANSFER_BENEFICIARY', 'TRANSFER_AMOUNT',
  'TRANSFER_PURPOSE', 'TRANSFER_SUBMIT', 'TRANSFER_REVIEW', 'TRANSFER_FIRST_CONFIRM', 'UKEY_VERIFY',
  'TRANSFER_RESULT_ID', 'TRANSFER_SETTLED'
]);

const I10_VISUAL_TARGET_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  LOGIN_SSO_SUBMIT: '客户门户入口页中唯一的 Keycloak 授权码登录按钮，只定位该按钮，不读取凭据',
  LOGIN_USERNAME: '账号密码登录卡片中“用户名 / 手机号”标签下的文本输入框',
  LOGIN_PASSWORD: '账号密码登录卡片中“密码”标签下的密码输入框',
  LOGIN_SUBMIT: '账号密码登录卡片底部写有“账号密码登录”的主按钮',
  // Display names are test-data dependent. Do not hardcode a fixture identity
  // into a visual prompt; Playwright performs the deterministic equality check.
  HEADER_DISPLAY_NAME: '页面右上角用户区中、头像右侧显示的当前已登录客户姓名文本；只定位姓名文字本身，不假设具体姓名',
  HEADER_AVATAR: '页面右上角用户区中显示单个姓氏字符“张”的圆形头像，只定位头像本身',
  HEADER_PROFILE_LINK: '门户顶部主导航中显示的“个人资料”链接；只定位导航链接本身，不要定位右上角用户菜单、头像或姓名',
  PROFILE_DISPLAY_NAME: '个人资料主卡片中“客户姓名”标签对应的当前已登录客户姓名值；只定位姓名值本身，不假设具体姓名',
  PROFILE_AVATAR: '个人资料主卡片左侧显示单个姓氏字符“张”的圆形大头像，只定位头像本身',
  TRANSFER_ENTRY: '受控门户导航中用于进入转账列表的业务入口',
  TRANSFER_NEW: '转账列表页面中写有“新增转账”的按钮',
  TRANSFER_SOURCE_ACCOUNT: '转账表单中付款账户的下拉选择框，只定位选择控件',
  TRANSFER_BENEFICIARY: '转账表单中收款人的下拉选择框，只定位选择控件',
  TRANSFER_AMOUNT: '转账表单中“转账金额”标签下的文本输入框',
  TRANSFER_PURPOSE: '转账表单中“转账用途”标签下的文本输入框',
  TRANSFER_SUBMIT: '转账表单底部用于提交填写信息并进入摘要页的按钮',
  TRANSFER_REVIEW: '转账摘要页中展示收款人、金额和用途的确认区域',
  TRANSFER_FIRST_CONFIRM: '转账信息填写完成后写有“确认转账信息”的第一次业务确认按钮',
  UKEY_VERIFY: '网页验证页中用于确认已持久化U盾验证的按钮',
  TRANSFER_RESULT_ID: '实际转账详情页中的转账参考号',
  TRANSFER_SETTLED: '实际转账详情页中已经结算的状态，不是处理中或受理'
});

function visualActionType(operation: ExecutableActionPlan['actions'][number]['operation']): VisualActionType {
  if (operation === 'fill') return 'INPUT';
  if (['click', 'select', 'check', 'upload', 'download'].includes(operation)) return 'TAP';
  if (operation === 'switchPage') return 'SCROLL';
  return 'LOCATE';
}

function buildI10CandidateContexts(plan: ExecutableActionPlan, workerId: string, jobId: string, leaseExpiresAt: string, reviewedLocators = new Map<string, ReviewedLocator>(), reviewedAssertions = new Map<string, ReviewedAssertion>()) {
  const visualActions = plan.actions.filter(action => Boolean(action.semanticTargetRef));
  return visualActions.map((action, index) => {
    const targetRef = action.semanticTargetRef as VisualTargetRef;
    const generic = plan.fixtureProfile === 'GENERIC_WEB';
    if (!generic && !I10_VISUAL_TARGETS.has(targetRef)) throw new HarnessError(409, 'I10_VISUAL_TARGET_NOT_SUPPORTED', 'CONTRACT', 'I10视觉目标不在上下文白名单中。');
    const previous = visualActions[index - 1];
    const next = visualActions[index + 1];
    const actionType = visualActionType(action.operation);
    const envelope = buildActionContextEnvelope({
      contextLevel: 'CTX-L2',
      tokenizerId: 'qwen3.5-compatible',
      imageTokenEstimate: estimateImageTokens(1440, 900),
      workerId,
      slotId: `ctxslot_${sha256(`${jobId}:${action.actionId}`).slice(0, 40)}`,
      leaseExpiresAt,
      currentAction: {
        actionType,
        prompt: generic
          ? `仅定位已确认目标站点中的目标 ${targetRef}：${action.instruction ?? action.expected ?? targetRef}。用于动作 ${action.operation}；不得读取、返回或猜测凭据内容。`
          : `仅定位受控目标 ${targetRef}：${I10_VISUAL_TARGET_DESCRIPTIONS[targetRef]}。用于动作 ${action.operation}；必须排除相邻文字、链接和容器，不得读取或返回输入内容。`,
        targetRef,
        valueRef: action.operation === 'fill'
          ? action.inputValueSource === 'CREDENTIAL_REF' && /password|密码/i.test(action.instruction ?? targetRef)
            ? 'CREDENTIAL_PASSWORD'
            : action.inputValueSource === 'CREDENTIAL_REF'
              ? 'CREDENTIAL_USERNAME'
              : 'SYNTHETIC_TEXT'
          : null,
        riskLevel: action.riskLevel,
        ...(reviewedLocators.has(action.actionId) ? {reviewedLocator:reviewedLocators.get(action.actionId)} : {}),
        ...(reviewedAssertions.has(action.actionId) ? {reviewedAssertion:reviewedAssertions.get(action.actionId)} : {}),
        executionMode: 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE'
      },
      previousActionSummary: previous ? {
        ordinal: previous.ordinal,
        actionType: visualActionType(previous.operation),
        summary: `上一受控动作 ${previous.operation} 已由Playwright验证后才允许进入当前动作。`
      } : null,
      nextActionPreview: next ? {
        actionType: visualActionType(next.operation),
        prompt: `下一受控动作将定位 ${next.semanticTargetRef as string}。`
      } : null,
      recentFacts: null,
      currentPageState: null,
      minimalDependencyCone: null,
      fixtureRefs: action.fixtureRefs
    });
    return { actionId: action.actionId, ordinal: action.ordinal, contextLevel: envelope.contextLevel, envelope, envelopeHash: sha256(canonicalJson(envelope)) };
  });
}

export interface WorkerEvidenceInput {
  artifactType: 'JSON' | 'TEXT' | 'SCREENSHOT' | 'TRACE' | 'LOG' | 'REPORT' | 'DIAGNOSTIC';
  mediaType: string;
  redactionStatus: 'NOT_REQUIRED' | 'REDACTED' | 'QUARANTINED';
  extension: string;
  base64Content: string;
  metadata?: Record<string, unknown>;
}

export function requestsTransferAction(actions: string[]): boolean {
  return actions.some(action =>
    /(?:转账|汇款|付款|transfer|payment)/i.test(action)
    && !/(?:不|未|不得|禁止)[^。；，,]{0,20}(?:转账|汇款|付款)/i.test(action));
}

export interface WorkerCompletionInput {
  workerId: string;
  leaseVersion: number;
  outcome: 'PASSED' | 'FAILED' | 'BLOCKED';
  summary: string;
  errorCode?: string;
  errorCategory?: 'TEST_FAILURE' | 'ENVIRONMENT' | 'EVIDENCE';
  retryable?: boolean;
  userActionRequired?: boolean;
  failureDiagnostic?: {
    schemaVersion: 'i8-formal-diagnostic-v2';
    failureStage: string;
    stepId: string | null;
    operation: string | null;
    targetRef: string | null;
    pageLocation: string | null;
    pageFingerprint: string | null;
  };
  evidence: WorkerEvidenceInput[];
}

type RepairWorkerCompletionInput = Omit<WorkerCompletionInput, 'leaseVersion'>;

type ExecutionProfile = 'LOGIN_PROFILE' | 'ACCOUNT_OWNERSHIP' | 'AUTH_REJECTION_RECOVERY';
type AuthoringActionType = 'LOCATE' | 'INPUT' | 'TAP' | 'SCROLL';
type FailureClassification = 'ENVIRONMENT' | 'AUTHENTICATION' | 'CONTRACT' | 'LOCATOR' | 'ASSERTION' | 'MODEL' | 'TOOL';

const LOCATOR_REPAIRS: Record<string, { targetRef: string; selector: string }> = {
  LOGIN_USERNAME_LOCATOR_NOT_FOUND: { targetRef: 'LOGIN_USERNAME', selector: '[data-testid="login-username"]' },
  LOGIN_PASSWORD_LOCATOR_NOT_FOUND: { targetRef: 'LOGIN_PASSWORD', selector: '[data-testid="login-password"]' },
  LOGIN_SUBMIT_LOCATOR_NOT_FOUND: { targetRef: 'LOGIN_SUBMIT', selector: '[data-testid="login-submit"]' },
  PROFILE_NAME_LOCATOR_NOT_FOUND: { targetRef: 'PROFILE_NAME', selector: '[data-testid="customer-profile-name"]' },
  PROFILE_LINK_LOCATOR_NOT_FOUND: { targetRef: 'PROFILE_LINK', selector: 'a[href="/portal/profile"]' },
  PROFILE_DISPLAY_NAME_LOCATOR_NOT_FOUND: { targetRef: 'PROFILE_DISPLAY_NAME', selector: '[data-testid="profile-display-name"]' }
};

function classifyFailure(errorCategory?: string, errorCode?: string): FailureClassification {
  const code = String(errorCode ?? '').toUpperCase();
  if (errorCategory === 'ENVIRONMENT') return 'ENVIRONMENT';
  if (/AUTH|CREDENTIAL|LOGIN_REJECTED/.test(code)) return 'AUTHENTICATION';
  if (/CONTRACT|SCHEMA|HTTP_4\d\d/.test(code)) return 'CONTRACT';
  if (/LOCATOR|SELECTOR|ELEMENT_NOT_FOUND/.test(code)) return 'LOCATOR';
  if (/ASSERTION|MISMATCH|TEST_FAILURE/.test(code) || errorCategory === 'TEST_FAILURE') return 'ASSERTION';
  if (/MODEL|MIDSCENE|LLM/.test(code)) return 'MODEL';
  return 'TOOL';
}

function i8FailureDisposition(classification: I8IncidentClassification): 'REPORT_ONLY' | 'RETRY_ALLOWED' | 'REAUTHOR_REQUIRED' | 'PATCH_ALLOWED' {
  if (['PRODUCT_DEFECT', 'CONTRACT', 'AUTHENTICATION'].includes(classification)) return 'REPORT_ONLY';
  if (['ENVIRONMENT', 'MODEL', 'TOOL', 'FIXTURE_DATA'].includes(classification)) return 'RETRY_ALLOWED';
  // A locator failure is eligible for a narrowly allowlisted mapping patch.
  // It must not be sent back to a broad authoring retry: that loses the exact
  // failed action and can repeat the same failure indefinitely.
  if (classification === 'LOCATOR') return 'PATCH_ALLOWED';
  return 'PATCH_ALLOWED';
}

const SCRIPT_CATALOG: Record<ExecutionProfile, string> = {
  LOGIN_PROFILE: 'worker/src/login-profile.cjs',
  ACCOUNT_OWNERSHIP: 'worker/src/account-ownership.cjs',
  AUTH_REJECTION_RECOVERY: 'worker/src/auth-rejection-recovery.cjs'
};

export class HarnessService {
  readonly artifacts: ArtifactStore;
  readonly i10: I10Service;

  constructor(readonly database: HarnessDatabase, artifactRoot: string, readonly productRoot: string, readonly releaseIdentityHash?: string) {
    this.artifacts = new ArtifactStore(database, artifactRoot);
    this.i10 = new I10Service(database, productRoot, this.artifacts, releaseIdentityHash);
  }

  private validatedPlan(db: import('better-sqlite3').Database, namespace: string, planId: string, caseId: string, expectedCaseVersion: number): {
    case_id: string; case_version: number; script_id: string; script_version: number; script_sha256: string;
    script_path: string; script_configuration: string | null;
  } {
    const plan = db.prepare(`
      SELECT p.status, p.case_id, p.case_version, p.script_id, c.current_version,
             s.status AS script_status, s.current_version AS script_version,
             sv.sha256 AS script_sha256, sv.relative_path AS script_path,
             sv.configuration_json AS script_configuration
      FROM plans p
      JOIN cases c ON c.case_id = p.case_id
      LEFT JOIN scripts s ON s.script_id = p.script_id
      LEFT JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
      WHERE p.namespace = ? AND p.plan_id = ?
    `).get(namespace, planId) as Record<string, unknown> | undefined;
    if (!plan || plan.case_id !== caseId) throw new HarnessError(404, 'PLAN_NOT_FOUND', 'DOMAIN', '执行计划不存在。');
    if (Number(plan.case_version) !== expectedCaseVersion || Number(plan.current_version) !== expectedCaseVersion) {
      throw new HarnessError(409, 'CASE_VERSION_CONFLICT', 'CONCURRENCY', '案例或计划版本已变化。', false, true);
    }
    if (plan.status !== 'READY') throw new HarnessError(409, 'PLAN_NOT_RUNNABLE', 'DOMAIN', '计划当前不可执行。', false, true);
    if (!plan.script_id || plan.script_status !== 'SCRIPT_VALIDATED' || !plan.script_path) {
      throw new HarnessError(409, 'SCRIPT_NOT_VALIDATED', 'DOMAIN', '正式回归只能执行 SCRIPT_VALIDATED 脚本。', false, true);
    }
    return {
      case_id: String(plan.case_id), case_version: Number(plan.case_version), script_id: String(plan.script_id),
      script_version: Number(plan.script_version), script_sha256: String(plan.script_sha256),
      script_path: String(plan.script_path), script_configuration: plan.script_configuration ? String(plan.script_configuration) : null
    };
  }

  private validatedScheduledPlan(db: import('better-sqlite3').Database, schedule: Record<string, unknown>): {
    script_id: string; script_version: number; script_sha256: string; script_path: string; script_configuration: string | null;
  } {
    const row = db.prepare(`
      SELECT p.status AS plan_status, s.status AS script_status, sv.validation_status,
             sv.relative_path AS script_path,
             sv.configuration_json AS script_configuration, sv.sha256 AS actual_sha256
      FROM plans p
      JOIN scripts s ON s.script_id = p.script_id
      JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = ?
      WHERE p.namespace = ? AND p.plan_id = ? AND p.case_id = ? AND p.case_version = ?
        AND p.script_id = ?
    `).get(
      Number(schedule.script_version), String(schedule.namespace), String(schedule.plan_id),
      String(schedule.case_id), Number(schedule.case_version), String(schedule.script_id)
    ) as Record<string, unknown> | undefined;
    if (!row || row.plan_status !== 'READY' || row.script_status === 'RETIRED'
      || row.validation_status !== 'PASSED' || !row.script_path) {
      throw new HarnessError(409, 'SCHEDULED_SCRIPT_VERSION_UNAVAILABLE', 'DOMAIN', '调度绑定的精确脚本版本不可执行。', false, true);
    }
    if (String(row.actual_sha256) !== String(schedule.script_sha256)) {
      throw new HarnessError(409, 'SCHEDULED_SCRIPT_HASH_CONFLICT', 'EVIDENCE', '调度绑定脚本的 Hash 已变化。', false, true);
    }
    return {
      script_id: String(schedule.script_id), script_version: Number(schedule.script_version),
      script_sha256: String(schedule.script_sha256), script_path: String(row.script_path),
      script_configuration: row.script_configuration ? String(row.script_configuration) : null
    };
  }

  private enqueueRun(db: import('better-sqlite3').Database, input: {
    namespace: string; caseId: string; caseVersion: number; planId: string; environment: 'local';
    credentialAlias: string | null; fixtureScope?: string; scheduleId?: string; scheduleExecutionId?: string;
    journeyId?: string; confirmedDecisionEventId?: string; preparationId?: string; candidateId?: string;
  }, plan: { script_id: string; script_version: number; script_sha256: string; script_path: string; script_configuration: string | null }, timestamp: string): { runId: string; taskId: string } {
    const runId = opaqueId('run');
    const taskId = opaqueId('task');
    const fixtureNamespace = `fx-${sha256(`${input.namespace}:${runId}`).slice(0, 20)}`;
    const scriptConfiguration = plan.script_configuration ? JSON.parse(plan.script_configuration) as Record<string, unknown> : {};
    const i8Candidate = scriptConfiguration.mode === 'I8_CANDIDATE'
      ? {
          candidateId: String(scriptConfiguration.candidateId),
          relativeDirectory: String(scriptConfiguration.relativeDirectory),
          scriptHash: String(scriptConfiguration.scriptHash),
          manifestHash: String(scriptConfiguration.manifestHash)
        }
      : undefined;
    const payload = canonicalJson({
      executionEngine: 'PLAYWRIGHT',
      formalRegression: true,
      environment: input.environment,
      // RF-004-S3: no alias injection by default; the claim response passes the
      // authoritative credentialRef through for I10 candidates (worker resolve)
      ...(input.credentialAlias ? { credentialAlias: input.credentialAlias } : {}),
      fixtureNamespace,
      fixtureScope: input.fixtureScope ?? fixtureNamespace,
      scriptId: plan.script_id,
      scriptVersion: plan.script_version,
      scriptHash: plan.script_sha256,
      scriptPath: plan.script_path,
      ...(i8Candidate ? { candidate: i8Candidate } : { selectorOverrides: scriptConfiguration })
    });
    db.prepare(`
      INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, run_id, payload_json, version, created_at, updated_at)
      VALUES (?, ?, 'RUN_EXECUTE', 'QUEUED', 0, ?, ?, ?, 1, ?, ?)
    `).run(taskId, input.namespace, input.caseId, runId, payload, timestamp, timestamp);
    db.prepare(`
      INSERT INTO runs(
        run_id, namespace, case_id, case_version, plan_id, task_id, status,
        credential_alias, fixture_namespace, environment, fixture_scope,
        origin_schedule_id, schedule_execution_id, version, created_at,
        journey_id, confirmed_decision_event_id, preparation_id, candidate_id, release_identity_hash
      ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, input.namespace, input.caseId, input.caseVersion, input.planId, taskId,
      input.credentialAlias ?? null, fixtureNamespace, input.environment, input.fixtureScope ?? fixtureNamespace,
      input.scheduleId ?? null, input.scheduleExecutionId ?? null, timestamp,
      input.journeyId ?? null, input.confirmedDecisionEventId ?? null,
      input.preparationId ?? null, input.candidateId ?? null, this.releaseIdentityHash ?? null
    );
    return { runId, taskId };
  }

  private executionProfile(definition: Record<string, unknown>): ExecutionProfile | undefined {
    const explicit = definition.executionProfile;
    if (explicit === 'LOGIN_PROFILE' || explicit === 'ACCOUNT_OWNERSHIP' || explicit === 'AUTH_REJECTION_RECOVERY') return explicit;
    const route = String(definition.route ?? '').toLowerCase();
    if (route.includes('account')) return 'ACCOUNT_OWNERSHIP';
    if (route.includes('session') || route.includes('security') || route.includes('recovery')) return 'AUTH_REJECTION_RECOVERY';
    if (route.includes('login') || route.includes('profile')) return 'LOGIN_PROFILE';
    return undefined;
  }

  private ensureValidatedScript(
    db: import('better-sqlite3').Database,
    namespace: string,
    caseId: string,
    profile: ExecutionProfile,
    timestamp: string
  ): string {
    const existing = db.prepare(`SELECT script_id FROM scripts WHERE namespace = ? AND case_id = ? AND status = 'SCRIPT_VALIDATED'`)
      .get(namespace, caseId) as { script_id: string } | undefined;
    if (existing) return existing.script_id;
    const relativePath = SCRIPT_CATALOG[profile];
    const absolutePath = path.join(this.productRoot, ...relativePath.split('/'));
    if (!fs.existsSync(absolutePath)) {
      throw new HarnessError(409, 'VALIDATED_SCRIPT_UNAVAILABLE', 'ENVIRONMENT', '已验证脚本制品不存在。', false, true);
    }
    const scriptId = opaqueId('script');
    db.prepare(`
      INSERT INTO scripts(script_id, namespace, case_id, current_version, status, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'SCRIPT_VALIDATED', ?, ?)
    `).run(scriptId, namespace, caseId, timestamp, timestamp);
    db.prepare(`
      INSERT INTO script_versions(script_id, version, relative_path, sha256, validation_status, created_at)
      VALUES (?, 1, ?, ?, 'PASSED', ?)
    `).run(scriptId, relativePath, sha256(fs.readFileSync(absolutePath)), timestamp);
    return scriptId;
  }

  private ensureNamespace(db: import('better-sqlite3').Database, namespace: string, timestamp: string): void {
    db.prepare(`
      INSERT OR IGNORE INTO namespaces(namespace, status, version, created_at, updated_at)
      VALUES (?, 'ACTIVE', 1, ?, ?)
    `).run(namespace, timestamp, timestamp);
    const row = db.prepare('SELECT status FROM namespaces WHERE namespace = ?').get(namespace) as { status: string } | undefined;
    if (!row || row.status !== 'ACTIVE') {
      throw new HarnessError(403, 'NAMESPACE_NOT_ACTIVE', 'AUTHORIZATION', '命名空间不可用。');
    }
  }

  private verifiedI8Candidate(
    db: import('better-sqlite3').Database,
    namespace: string,
    candidateId: string
  ): Record<string, unknown> & { scriptSource: string; scriptRelativePath: string } {
    const row = db.prepare(`
      SELECT c.*, p.case_id, p.case_version, p.version AS executable_plan_version,
             p.preparation_id, prep.acceptance_summary_json,
             (SELECT t.consumer_model FROM i10_action_traces t WHERE t.namespace = c.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_model,
             (SELECT t.context_policy FROM i10_action_traces t WHERE t.namespace = c.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_context_policy,
             (SELECT t.trace_hash FROM i10_action_traces t WHERE t.namespace = c.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_trace_hash,
             (SELECT t.playwright_fact_hash FROM i10_action_traces t WHERE t.namespace = c.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_playwright_fact_hash,
             (SELECT t.status FROM i10_action_traces t WHERE t.namespace = c.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_status,
             cert.certificate_id, cert.status AS certificate_status, cert.script_sha256 AS certificate_script_sha256
      FROM i8_script_candidates c
      JOIN i8_executable_plans p ON p.executable_plan_id = c.executable_plan_id
      JOIN i8_case_preparations prep ON prep.preparation_id = p.preparation_id
      LEFT JOIN i8_stability_certificates cert ON cert.candidate_id = c.candidate_id
      WHERE c.namespace = ? AND c.candidate_id = ?
    `).get(namespace, candidateId) as Record<string, unknown> | undefined;
    if (!row) throw new HarnessError(404, 'I8_CANDIDATE_NOT_FOUND', 'DOMAIN', '候选脚本不存在。');
    if (!row.certificate_id || row.certificate_status !== 'PASSED' || row.certificate_script_sha256 !== row.script_sha256) {
      throw new HarnessError(409, 'I8_STABILITY_CERTIFICATE_REQUIRED', 'DOMAIN', '只有持有有效稳定性证书的候选才能交付。', false, true);
    }
    const candidateRoot = path.resolve(this.productRoot, '.data', 'candidates');
    const directory = path.resolve(this.productRoot, ...String(row.relative_directory).split('/'));
    if (!directory.startsWith(`${candidateRoot}${path.sep}`)) {
      throw new HarnessError(409, 'I8_CANDIDATE_DIRECTORY_INVALID', 'EVIDENCE', '候选目录越过受管边界。', false, true);
    }
    const scriptPath = path.join(directory, 'script.cjs');
    const manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(scriptPath) || !fs.existsSync(manifestPath)) {
      throw new HarnessError(409, 'I8_CANDIDATE_PACKAGE_MISSING', 'EVIDENCE', '候选脚本包不完整。', false, true);
    }
    const scriptBytes = fs.readFileSync(scriptPath);
    const manifestText = fs.readFileSync(manifestPath, 'utf8');
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(manifestText) as Record<string, unknown>;
    } catch {
      throw new HarnessError(409, 'I8_CANDIDATE_MANIFEST_INVALID', 'EVIDENCE', '候选清单无法解析。', false, true);
    }
    if (sha256(scriptBytes) !== row.script_sha256 || sha256(canonicalJson(manifest)) !== row.manifest_sha256) {
      throw new HarnessError(409, 'I8_CANDIDATE_PACKAGE_HASH_MISMATCH', 'EVIDENCE', '候选脚本包Hash不匹配。', false, true);
    }
    if (manifest.candidateId !== row.candidate_id || manifest.scriptId !== row.script_id || manifest.scriptVersion !== row.script_version) {
      throw new HarnessError(409, 'I8_CANDIDATE_PACKAGE_IDENTITY_MISMATCH', 'EVIDENCE', '候选脚本包身份不匹配。', false, true);
    }
    return {
      ...row,
      scriptSource: scriptBytes.toString('utf8'),
      scriptRelativePath: `${String(row.relative_directory)}/script.cjs`
    };
  }

  private audit(
    db: import('better-sqlite3').Database,
    context: RequestContext,
    input: {
      namespace: string;
      runId?: string;
      taskId?: string;
      action: string;
      objectType: string;
      objectId: string;
      outcome: 'ACCEPTED' | 'REJECTED' | 'SUCCEEDED' | 'FAILED';
      details?: Record<string, unknown>;
    }
  ): void {
    db.prepare(`
      INSERT INTO audit_events(
        event_id, namespace, run_id, task_id, actor_type, action, object_type,
        object_id, outcome, correlation_id, credential_fingerprint, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opaqueId('evt'), input.namespace, input.runId ?? null, input.taskId ?? null,
      context.actorType ?? 'COZE', input.action, input.objectType, input.objectId, input.outcome, context.requestId,
      context.credentialFingerprint ?? null, JSON.stringify(input.details ?? {}), nowIso()
    );
  }

  private async idempotent(
    namespace: string,
    operation: string,
    idempotencyKey: string,
    request: unknown,
    context: RequestContext,
    execute: (db: import('better-sqlite3').Database, timestamp: string) => {
      status: number;
      response: Record<string, unknown>;
      objectType: string;
      objectId: string;
      taskId?: string;
      runId?: string;
    }
  ): Promise<IdempotentResult> {
    const hash = requestHash(request);
    return this.database.write(db => {
      const timestamp = nowIso();
      this.ensureNamespace(db, namespace, timestamp);
      const stored = db.prepare(`
        SELECT request_hash, response_status, response_json
        FROM idempotency_keys
        WHERE namespace = ? AND operation = ? AND idempotency_key = ?
      `).get(namespace, operation, idempotencyKey) as StoredIdempotency | undefined;
      if (stored) {
        if (stored.request_hash !== hash) {
          this.audit(db, context, {
            namespace, action: `${operation}.replay`, objectType: 'IDEMPOTENCY_KEY', objectId: idempotencyKey,
            outcome: 'REJECTED', details: { errorCode: 'IDEMPOTENCY_CONFLICT' }
          });
          throw new HarnessError(409, 'IDEMPOTENCY_CONFLICT', 'CONTRACT', '幂等键已被不同请求使用。');
        }
        const response = JSON.parse(stored.response_json) as Record<string, unknown>;
        return { status: stored.response_status, response: { ...response, replayed: true }, replayed: true };
      }
      const result = execute(db, timestamp);
      const response = { ...result.response, replayed: false };
      db.prepare(`
        INSERT INTO idempotency_keys(
          namespace, operation, idempotency_key, request_hash, response_status,
          response_json, object_type, object_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        namespace, operation, idempotencyKey, hash, result.status,
        JSON.stringify(response), result.objectType, result.objectId, timestamp
      );
      this.audit(db, context, {
        namespace, runId: result.runId, taskId: result.taskId, action: operation,
        objectType: result.objectType, objectId: result.objectId, outcome: 'ACCEPTED'
      });
      return { status: result.status, response, replayed: false };
    });
  }

  async registerI9KnowledgeSnapshot(
    input: I9KnowledgeSnapshotRegistrationInput,
    context: RequestContext
  ): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i9_knowledge_snapshot_register', input.idempotencyKey, input, context, (db, timestamp) => {
      const existing = db.prepare(`
        SELECT snapshot_id, platform_resource_id, source_ref, source_version, content_hash, citation_ids_json
        FROM i9_knowledge_snapshot_refs
        WHERE snapshot_id = ? OR (namespace = ? AND content_hash = ?)
      `).get(input.snapshot.knowledgeSnapshotId, input.namespace, input.snapshot.contentHash) as Record<string, unknown> | undefined;
      const expectedCitationJson = canonicalJson(input.snapshot.citationIds);
      if (existing) {
        const matches = existing.snapshot_id === input.snapshot.knowledgeSnapshotId
          && existing.platform_resource_id === input.platformResourceId
          && existing.source_ref === input.sourceRef
          && existing.source_version === input.snapshot.sourceVersion
          && existing.content_hash === input.snapshot.contentHash
          && existing.citation_ids_json === expectedCitationJson;
        if (!matches) {
          throw new HarnessError(409, 'I9_KNOWLEDGE_SNAPSHOT_CONFLICT', 'CONCURRENCY', '知识快照引用与已登记版本冲突。', false, true);
        }
        return {
          status: 200,
          response: {
            snapshotId: input.snapshot.knowledgeSnapshotId,
            contentHash: input.snapshot.contentHash,
            citationIds: input.snapshot.citationIds,
            status: 'ALREADY_REGISTERED'
          },
          objectType: 'KNOWLEDGE_SNAPSHOT_REF',
          objectId: input.snapshot.knowledgeSnapshotId
        };
      }
      db.prepare(`
        INSERT INTO i9_knowledge_snapshot_refs(
          snapshot_id, namespace, platform, platform_resource_id, source_ref,
          source_version, content_hash, citation_ids_json, registered_at
        ) VALUES (?, ?, 'FLOWISE', ?, ?, ?, ?, ?, ?)
      `).run(
        input.snapshot.knowledgeSnapshotId,
        input.namespace,
        input.platformResourceId,
        input.sourceRef,
        input.snapshot.sourceVersion,
        input.snapshot.contentHash,
        expectedCitationJson,
        timestamp
      );
      return {
        status: 201,
        response: {
          snapshotId: input.snapshot.knowledgeSnapshotId,
          contentHash: input.snapshot.contentHash,
          citationIds: input.snapshot.citationIds,
          status: 'REGISTERED'
        },
        objectType: 'KNOWLEDGE_SNAPSHOT_REF',
        objectId: input.snapshot.knowledgeSnapshotId
      };
    });
  }

  async createCaseDraft(input: CaseCreateDraftInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'case_create_draft', input.idempotencyKey, input, context, (db, timestamp) => {
      const caseId = opaqueId('case');
      const version = 1;
      const definition = {
        objective: input.objective,
        route: input.route,
        executionProfile: input.executionProfile ?? null,
        steps: input.steps,
        assertions: input.assertions,
        authoringActions: input.authoringActions ?? [],
        credentialAlias: input.credentialAlias ?? null
      };
      db.prepare(`
        INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
        VALUES (?, ?, ?, 'VALIDATED', ?, ?, ?, ?, ?)
      `).run(caseId, input.namespace, version, input.title, input.summary, input.riskLevel, timestamp, timestamp);
      db.prepare(`
        INSERT INTO case_versions(case_id, version, definition_json, content_hash, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(caseId, version, canonicalJson(definition), sha256(canonicalJson(definition)), input.actorRef, timestamp);
      let retrievalId: string | undefined;
      if (input.knowledgeRetrieval) {
        retrievalId = opaqueId('retrieval');
        db.prepare(`
          INSERT INTO knowledge_retrieval_events(
            retrieval_id, namespace, case_id, source_authority, query_hash,
            result_hash, citation_refs_json, created_at
          ) VALUES (?, ?, ?, 'COZE_KNOWLEDGE_BASE', ?, ?, ?, ?)
        `).run(
          retrievalId, input.namespace, caseId, sha256(input.knowledgeRetrieval.query),
          sha256(input.knowledgeRetrieval.resultSummary),
          canonicalJson(input.knowledgeRetrieval.citationRefs), timestamp
        );
      }
      return {
        status: 200,
        objectType: 'CASE',
        objectId: caseId,
        response: {
          caseId,
          version,
          status: 'VALIDATED',
          validationIssues: [],
          summary: input.summary,
          ...(retrievalId ? { knowledgeRetrievalId: retrievalId } : {})
        }
      };
    });
  }

  async importCases(input: CaseImportSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'case_import_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const batchId = opaqueId('import');
      const sourceHash = sha256(canonicalJson({ sourceFormat: input.sourceFormat, sourceRef: input.sourceRef, cases: input.cases }));
      db.prepare(`
        INSERT INTO case_import_batches(batch_id, namespace, source_format, source_ref, source_hash, item_count, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'IMPORTED', ?)
      `).run(batchId, input.namespace, input.sourceFormat, input.sourceRef, sourceHash, input.cases.length, timestamp);
      const insertItem = db.prepare(`
        INSERT INTO case_import_items(batch_id, item_ordinal, external_case_ref, case_id, content_hash)
        VALUES (?, ?, ?, ?, ?)
      `);
      const imported = input.cases.map((item, index) => {
        const caseId = opaqueId('case');
        const definition = {
          objective: item.objective,
          route: item.route,
          executionProfile: item.executionProfile,
          steps: item.steps,
          assertions: item.assertions,
          authoringActions: [],
          credentialAlias: null,
          import: { batchId, externalCaseRef: item.externalCaseRef, sourceFormat: input.sourceFormat }
        };
        const definitionJson = canonicalJson(definition);
        const contentHash = sha256(definitionJson);
        db.prepare(`
          INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
          VALUES (?, ?, 1, 'VALIDATED', ?, ?, ?, ?, ?)
        `).run(caseId, input.namespace, item.title, item.summary, item.riskLevel, timestamp, timestamp);
        db.prepare(`
          INSERT INTO case_versions(case_id, version, definition_json, content_hash, created_by, created_at)
          VALUES (?, 1, ?, ?, ?, ?)
        `).run(caseId, definitionJson, contentHash, input.actorRef, timestamp);
        insertItem.run(batchId, index + 1, item.externalCaseRef, caseId, contentHash);
        return { externalCaseRef: item.externalCaseRef, caseId, version: 1, status: 'VALIDATED' };
      });
      return {
        status: 200,
        objectType: 'CASE_IMPORT_BATCH',
        objectId: batchId,
        response: { batchId, status: 'IMPORTED', itemCount: imported.length, sourceHash, imported }
      };
    });
  }

  getCase(namespace: string, caseId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT c.*, cv.definition_json, cv.content_hash
        FROM cases c
        JOIN case_versions cv ON cv.case_id = c.case_id AND cv.version = c.current_version
        WHERE c.namespace = ? AND c.case_id = ?
      `).get(namespace, caseId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'CASE_NOT_FOUND', 'DOMAIN', '案例不存在。');
      return {
        caseId: row.case_id,
        namespace: row.namespace,
        version: row.current_version,
        status: row.status,
        title: row.title,
        summary: row.summary,
        riskLevel: row.risk_level,
        definition: JSON.parse(String(row.definition_json)),
        contentHash: row.content_hash,
        updatedAt: row.updated_at
      };
    });
  }

  async prepareI8Case(input: I8CasePrepareInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_case_prepare', input.idempotencyKey, input, context, (db, timestamp) => {
      const caseId = opaqueId('case');
      const preparationId = opaqueId('prep');
      const version = 1;
      const definition = {
        schemaVersion: input.draft.schemaVersion,
        objective: input.draft.objective,
        route: input.draft.route,
        executionProfile: null,
        steps: input.draft.steps,
        assertions: input.draft.assertions,
        authoringActions: [],
        credentialAlias: null,
        sourceDescriptionHash: sha256(input.caseDescription),
        knowledgeSnapshot: input.draft.knowledgeSnapshot
      };
      const definitionJson = canonicalJson(definition);
      const definitionHash = sha256(definitionJson);
      db.prepare(`
        INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
        VALUES (?, ?, 1, 'VALIDATED', ?, ?, ?, ?, ?)
      `).run(caseId, input.namespace, input.draft.title, input.draft.summary, input.draft.riskLevel, timestamp, timestamp);
      db.prepare(`
        INSERT INTO case_versions(case_id, version, definition_json, content_hash, created_by, created_at)
        VALUES (?, 1, ?, ?, ?, ?)
      `).run(caseId, definitionJson, definitionHash, input.actorRef, timestamp);
      db.prepare(`
        INSERT INTO i8_case_preparations(
          preparation_id, namespace, case_id, case_version, source_description_hash,
          knowledge_snapshot_json, acceptance_summary_json, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, 'PREPARED', 1, ?, ?)
      `).run(
        preparationId,
        input.namespace,
        caseId,
        sha256(input.caseDescription),
        canonicalJson(input.draft.knowledgeSnapshot),
        canonicalJson(input.acceptanceSummary),
        timestamp,
        timestamp
      );
      return {
        status: 200,
        objectType: 'I8_CASE_PREPARATION',
        objectId: preparationId,
        response: {
          preparationId,
          version: 1,
          status: 'PREPARED',
          caseId,
          caseVersion: version,
          caseContentHash: definitionHash,
          knowledgeSnapshotId: input.draft.knowledgeSnapshot.knowledgeSnapshotId,
          knowledgeContentHash: input.draft.knowledgeSnapshot.contentHash,
          acceptanceSummary: input.acceptanceSummary,
          nextAction: 'HUMAN_CONFIRMATION_REQUIRED'
        }
      };
    });
  }

  async submitI8Authoring(input: I8AuthoringSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_authoring_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const row = db.prepare(`
        SELECT preparation_id, case_id, case_version, status, version
        FROM i8_case_preparations
        WHERE namespace = ? AND preparation_id = ?
      `).get(input.namespace, input.preparationId) as {
        preparation_id: string; case_id: string; case_version: number; status: string; version: number;
      } | undefined;
      if (!row) throw new HarnessError(404, 'I8_PREPARATION_NOT_FOUND', 'DOMAIN', 'I8 案例准备记录不存在。');
      if (row.version !== input.expectedVersion) {
        throw new HarnessError(409, 'I8_PREPARATION_VERSION_CONFLICT', 'CONCURRENCY', 'I8 案例准备版本已变化。', false, true, { currentVersion: row.version });
      }
      if (row.status !== 'PREPARED') {
        throw new HarnessError(409, 'I8_PREPARATION_NOT_CONFIRMABLE', 'DOMAIN', 'I8 案例准备记录当前不可确认。', false, true, { currentStatus: row.status });
      }
      const nextVersion = row.version + 1;
      if (input.confirmation.choice === 'REJECT') {
        db.prepare(`
          UPDATE i8_case_preparations
          SET status = 'REJECTED', confirmation_ref = ?, version = ?, updated_at = ?
          WHERE preparation_id = ? AND version = ?
        `).run(input.confirmation.confirmationRef, nextVersion, timestamp, row.preparation_id, row.version);
        return {
          status: 200,
          objectType: 'I8_CASE_PREPARATION',
          objectId: row.preparation_id,
          response: { preparationId: row.preparation_id, version: nextVersion, status: 'REJECTED', nextAction: 'NONE' }
        };
      }
      // Do not trust parallel arrays passed by an Agentflow/MCP node. Native
      // Flowise can stringify arrays and stale branches can retain old values.
      // The prepared CaseDraft is immutable at this point, so it is the sole
      // authority for actions, expected outcomes and assertions.
      const legacyPlan = input.intentPlan as I8AuthoringSubmitInput['intentPlan'];
      let authoringContext = input.authoringContext ?? (legacyPlan ? {
        route: legacyPlan.route,
        executionProfile: legacyPlan.executionProfile,
        targetProfileId: legacyPlan.targetProfileId,
        targetProfileVersion: legacyPlan.targetProfileVersion,
        targetProfileHash: legacyPlan.targetProfileHash,
        targetProfileSnapshot: legacyPlan.targetProfileSnapshot,
        adapterBinding: legacyPlan.adapterBinding
      } : undefined);
      const versionRow = db.prepare(`
        SELECT definition_json FROM case_versions WHERE case_id = ? AND version = ?
      `).get(row.case_id, row.case_version) as { definition_json: string } | undefined;
      if (!versionRow) throw new HarnessError(409, 'I8_CASE_VERSION_NOT_FOUND', 'DOMAIN', '已准备案例版本不存在。');
      const definition = JSON.parse(versionRow.definition_json) as {
        steps?: Array<{ action?: unknown; expected?: unknown }>;
        actionStepsV2?: Array<{
          ordinal?: unknown; instruction?: unknown; inputValue?: unknown; inputValueSource?: unknown;
        }>;
        assertions?: unknown[];
        credentialRef?: unknown;
        title?: unknown;
        objective?: unknown;
        summary?: unknown;
        preconditions?: unknown[];
        businessInputs?: unknown;
        adapterSelection?: unknown;
      };
      // A Flowise Human Input confirmation may lose its transient
      // authoringContext.  Recover only from the immutable CaseDraft's
      // credentialRef and the exact ACTIVE TargetProfile that was bound to
      // that credential during TargetProfile approval.  This is deliberately
      // narrower than looking up a profile by title, URL, or most-recent row.
      if (!authoringContext) {
        const credentialRef = typeof definition.credentialRef === 'string'
          ? definition.credentialRef : undefined;
        const persisted = credentialRef
          ? db.prepare(`
              SELECT p.target_profile_id,p.launch_url,p.launch_origin,
                     p.allowed_navigation_origins_json,p.allowed_interaction_origins_json,
                     p.credential_origins_json,p.redirect_rules_json,p.tls_policy,
                     p.network_mode,p.profile_hash,p.version,p.adapter_binding_json,
                     p.resolved_addresses_json
              FROM i10_credential_refs c
              JOIN i10_target_profiles p
                ON p.namespace=c.namespace AND p.target_profile_id=c.target_profile_id
              WHERE c.namespace=? AND c.credential_ref=?
                AND p.status='ACTIVE' AND p.credential_ref=?
              LIMIT 1
            `).get(input.namespace, credentialRef, credentialRef) as {
              target_profile_id: string; launch_url: string; launch_origin: string;
              allowed_navigation_origins_json: string; allowed_interaction_origins_json: string;
              credential_origins_json: string; redirect_rules_json: string; tls_policy: string;
              network_mode: string; profile_hash: string; version: number; adapter_binding_json: string;
              resolved_addresses_json: string;
            } | undefined
          : undefined;
        if (persisted) {
          const parsedAdapterBinding = JSON.parse(persisted.adapter_binding_json || 'null') as Record<string, unknown> | null;
          const adapterBinding = parsedAdapterBinding
            && typeof parsedAdapterBinding.adapterId === 'string'
            && typeof parsedAdapterBinding.adapterVersion === 'string'
            && typeof parsedAdapterBinding.manifestHash === 'string'
            ? {
                adapterId: parsedAdapterBinding.adapterId,
                adapterVersion: parsedAdapterBinding.adapterVersion,
                manifestHash: parsedAdapterBinding.manifestHash
              }
            : undefined;
          authoringContext = {
            route: persisted.launch_url,
            executionProfile: 'GENERIC_WEB',
            targetProfileId: persisted.target_profile_id,
            targetProfileVersion: persisted.version,
            targetProfileHash: persisted.profile_hash,
            targetProfileSnapshot: {
              schemaVersion: 'hengzhun-target-profile-v1',
              status: 'ACTIVE',
              targetProfileId: persisted.target_profile_id,
              launchUrl: persisted.launch_url,
              launchOrigin: persisted.launch_origin,
              allowedNavigationOrigins: JSON.parse(persisted.allowed_navigation_origins_json),
              allowedInteractionOrigins: JSON.parse(persisted.allowed_interaction_origins_json),
              credentialOrigins: JSON.parse(persisted.credential_origins_json),
              redirectRules: JSON.parse(persisted.redirect_rules_json),
              tlsPolicy: persisted.tls_policy,
              networkMode: persisted.network_mode,
              resolvedAddresses: JSON.parse(persisted.resolved_addresses_json || '{}'),
              adapterBinding,
              profileHash: persisted.profile_hash,
              version: persisted.version
            },
            ...(adapterBinding ? { adapterBinding } : {})
          };
        }
      }
      if (!authoringContext) {
        throw new HarnessError(409, 'I8_AUTHORING_CONTEXT_REQUIRED', 'CONTRACT', '案例尚未绑定可用的已确认目标站点档案。请先完成站点档案确认后重试。', false, true);
      }
      const actions = Array.isArray(definition.steps)
        ? definition.steps.map(step => String(step?.action ?? '').trim()) : [];
      const expectedOutcomes = Array.isArray(definition.steps)
        ? definition.steps.map(step => String(step?.expected ?? '').trim()) : [];
      const assertions = Array.isArray(definition.assertions)
        ? definition.assertions.map(item => String(item ?? '').trim()).filter(Boolean) : [];
      if (!actions.length || actions.length > 50 || actions.some(item => !item || item.length > 500) ||
          expectedOutcomes.length !== actions.length || expectedOutcomes.some(item => !item || item.length > 500) ||
          !assertions.length || assertions.length > 50 || assertions.some(item => item.length > 500)) {
        throw new HarnessError(409, 'I8_PERSISTED_CASE_INVALID', 'CONTRACT', '冻结案例不满足作者化所需的步骤或断言约束。', false, true);
      }
      // The route/profile data comes from an ACTIVE TargetProfile frozen before
      // authoring.  If Flowise lost the compiled context and used its scalar
      // fallback, recover the controlled transfer profile only from the
      // persisted case actions plus the already-approved adapter binding.  A
      // target name or URL alone can never select an adapter.
      const contextBinding = authoringContext.adapterBinding
        ?? (authoringContext.targetProfileSnapshot && typeof authoringContext.targetProfileSnapshot === 'object'
          ? (authoringContext.targetProfileSnapshot as Record<string, unknown>).adapterBinding
          : undefined);
      const isApprovedFuxingBinding = Boolean(contextBinding
        && typeof contextBinding === 'object'
        && (contextBinding as Record<string, unknown>).adapterId === 'fuxing-bank-demo');
      if (definition.adapterSelection === 'fuxing-bank-demo' && !isApprovedFuxingBinding) {
        throw new HarnessError(409, 'I10_TARGET_ADAPTER_CONFIRMATION_REQUIRED', 'AUTHORIZATION', '本次案例明确选择了受控适配器，但当前冻结目标档案尚未绑定该适配器。请先完成目标档案确认。', false, true);
      }
      const transferRequested = requestsTransferAction(actions);
      if (authoringContext.executionProfile === 'GENERIC_WEB' && isApprovedFuxingBinding && transferRequested) {
        authoringContext.executionProfile = 'TRANSFER_UKEY_ORDER_QUERY';
        authoringContext.adapterBinding = contextBinding as NonNullable<typeof authoringContext.adapterBinding>;
      }
      if (authoringContext.executionProfile === 'TRANSFER_UKEY_ORDER_QUERY') {
        const inputs = definition.businessInputs as { values?: Record<string, unknown> } | undefined;
        const values = inputs?.values;
        const missingTransferInputs = ['payerAccountId', 'payeeRef', 'amount', 'currency', 'purpose']
          .filter(field => typeof values?.[field] !== 'string' || !String(values?.[field]).trim());
        if (missingTransferInputs.length > 0) {
          throw new HarnessError(
            409,
            'I10_TYPED_BUSINESS_INPUT_REQUIRED',
            'CONTRACT',
            `转账案例尚缺少已确认的业务字段：${missingTransferInputs.join('、')}。`,
            false,
            true
          );
        }
      }
      const credentialPattern = /账号|用户名|密码|手机号|credential|凭据/i;
      const hasCredentialRef = typeof definition.credentialRef === 'string' && /^credential_[0-9a-f-]{36}$/i.test(definition.credentialRef);
      const declaredCaseText = [
        definition.title,
        definition.objective,
        definition.summary,
        ...(Array.isArray(definition.preconditions) ? definition.preconditions : []),
        ...actions,
        ...expectedOutcomes
      ].map(value => String(value ?? '')).join('\n');
      const credentialLoginDeclared = hasCredentialRef && /(?:登录|login|sign[ _-]?in)/i.test(declaredCaseText);
      // OCR is allowed to contribute page facts, but it must not erase the
      // user's already-confirmed credential-login intent.  Some compact
      // controller summaries reduce “use saved credentials to log in” to
      // “登录系统”; relying only on username/password words then turns that
      // step into a generic click and leaves Midscene searching for protected
      // navigation on the login page.  Promote only the first explicit login
      // action of a case that already owns a validated credential reference.
      const credentialLoginActionIndex = credentialLoginDeclared
        ? actions.findIndex(action => /(?:登录|login|sign[ _-]?in)/i.test(action))
        : -1;
      // CaseDraft.actionStepsV2 is part of the already-confirmed case version.
      // It is the only permitted origin for a non-secret business fixture.
      // Earlier code collapsed it to parallel strings, which meant values such
      // as an explicitly supplied amount were lost before the deterministic
      // builder ran.  Preserve only the matching ordinal value/source; never
      // infer a value from controller prose at this boundary.
      const actionStepsV2 = Array.isArray(definition.actionStepsV2) ? definition.actionStepsV2 : [];
      const persistedStepInput = (index: number) => {
        const candidate = actionStepsV2.find(step => Number(step?.ordinal) === index + 1) ?? actionStepsV2[index];
        const inputValue = typeof candidate?.inputValue === 'string' ? candidate.inputValue.trim() : '';
        const inputValueSource = candidate?.inputValueSource;
        return {
          inputValue: inputValue || undefined,
          inputValueSource: inputValue && ['USER_TEXT', 'RUNTIME_USER_INPUT'].includes(String(inputValueSource))
            ? String(inputValueSource) as 'USER_TEXT' | 'RUNTIME_USER_INPUT'
            : undefined
        };
      };
      const intentPlan = intentPlanSchema.parse({
        schemaVersion: 'i8-intent-plan-v1',
        caseId: row.case_id,
        caseVersion: row.case_version,
        route: authoringContext.route,
        executionProfile: authoringContext.executionProfile,
        ...(authoringContext.executionProfile === 'GENERIC_WEB' ? {
          targetProfileId: authoringContext.targetProfileId,
          targetProfileVersion: authoringContext.targetProfileVersion,
          targetProfileHash: authoringContext.targetProfileHash,
          targetProfileSnapshot: authoringContext.targetProfileSnapshot
        } : { adapterBinding: authoringContext.adapterBinding }),
        ...(authoringContext.executionProfile === 'TRANSFER_UKEY_ORDER_QUERY' ? {
          inputContractVersion: 'TypedBusinessInputsV2',
          typedBusinessInputs: definition.businessInputs
        } : {}),
        steps: actions.map((action, index) => {
          const persisted = persistedStepInput(index);
          return {
            intentStepId: `intent-${String(index + 1).padStart(3, '0')}`,
            action,
            expected: expectedOutcomes[index]!,
            riskLevel: /转账|支付|提交|确认/i.test(action) ? 'MEDIUM' : 'LOW',
            ...(persisted.inputValue ? { inputValue: persisted.inputValue } : {}),
            inputValueSource: credentialPattern.test(action) || index === credentialLoginActionIndex
              ? 'CREDENTIAL_REF'
              : persisted.inputValueSource ?? 'NONE'
          };
        }),
        assertions
      });
      const intentJson = canonicalJson(intentPlan);
      const intentHash = sha256(intentJson);
      db.prepare(`
        UPDATE i8_case_preparations
        SET intent_plan_json = ?, intent_plan_hash = ?, status = 'AWAITING_STAGE3',
            confirmation_ref = ?, version = ?, updated_at = ?
        WHERE preparation_id = ? AND version = ?
      `).run(intentJson, intentHash, input.confirmation.confirmationRef, nextVersion, timestamp, row.preparation_id, row.version);
      return {
        status: 202,
        objectType: 'I8_CASE_PREPARATION',
        objectId: row.preparation_id,
        response: {
          preparationId: row.preparation_id,
          version: nextVersion,
          status: 'AWAITING_STAGE3',
          caseId: row.case_id,
          caseVersion: row.case_version,
          intentPlanHash: intentHash,
          nextAction: 'EXECUTABLE_PLAN_COMPILER_REQUIRED'
        }
      };
    });
  }

  getI8Authoring(namespace: string, preparationId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT p.preparation_id, p.case_id, p.case_version, p.status, p.version,
               p.acceptance_summary_json, p.intent_plan_hash, p.updated_at,
               c.title, c.risk_level
        FROM i8_case_preparations p
        JOIN cases c ON c.case_id = p.case_id
        WHERE p.namespace = ? AND p.preparation_id = ?
      `).get(namespace, preparationId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I8_PREPARATION_NOT_FOUND', 'DOMAIN', 'I8 案例准备记录不存在。');
      return {
        preparationId: row.preparation_id,
        version: row.version,
        status: row.status,
        caseId: row.case_id,
        caseVersion: row.case_version,
        caseTitle: row.title,
        riskLevel: row.risk_level,
        acceptanceSummary: JSON.parse(String(row.acceptance_summary_json)),
        ...(row.intent_plan_hash ? { intentPlanHash: row.intent_plan_hash } : {}),
        nextAction: row.status === 'PREPARED'
          ? 'HUMAN_CONFIRMATION_REQUIRED'
          : row.status === 'AWAITING_STAGE3'
            ? 'EXECUTABLE_PLAN_COMPILER_REQUIRED'
            : 'NONE',
        updatedAt: row.updated_at
      };
    });
  }

  async compileI8Candidate(input: I8CandidateCompileInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_candidate_compile', input.idempotencyKey, input, context, (db, timestamp) => {
      const preparation = db.prepare(`
        SELECT preparation_id, case_id, case_version, status, version, intent_plan_json, intent_plan_hash
        FROM i8_case_preparations
        WHERE namespace = ? AND preparation_id = ?
      `).get(input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (!preparation) throw new HarnessError(404, 'I8_PREPARATION_NOT_FOUND', 'DOMAIN', 'I8 案例准备记录不存在。');
      if (Number(preparation.version) !== input.expectedPreparationVersion) {
        throw new HarnessError(409, 'I8_PREPARATION_VERSION_CONFLICT', 'CONCURRENCY', 'I8 案例准备版本已变化。', false, true, { currentVersion: preparation.version });
      }
      if (preparation.status !== 'AWAITING_STAGE3' || !preparation.intent_plan_json || !preparation.intent_plan_hash) {
        throw new HarnessError(409, 'I8_INTENT_PLAN_NOT_READY', 'DOMAIN', '只有已确认的 IntentPlan 才能进入阶段3。', false, true);
      }
      const intent=JSON.parse(String(preparation.intent_plan_json));
      const financial=intent.executionProfile==='TRANSFER_UKEY_ORDER_QUERY' ||
        (intent.adapterBinding?.adapterId==='fuxing-bank-demo' && intent.typedBusinessInputs?.values?.payerAccountId);
      const caseDefinition=financial ? db.prepare('SELECT definition_json FROM case_versions WHERE case_id=? AND version=?')
        .get(preparation.case_id,preparation.case_version) as {definition_json:string} : undefined;
      const bankPool=financial ? requireBankValidationFixtures(db,input.namespace,JSON.parse(caseDefinition!.definition_json)) : undefined;
      if(bankPool && input.stabilityPolicyVersion!=='I10_2X2_V1')
        throw new HarnessError(409,'I10_BANK_VALIDATION_POLICY_REQUIRED','CONTRACT','资金验证样本只允许当前两个视口各两次策略。',false,true);
      const existing = db.prepare(`
        SELECT p.executable_plan_id, p.plan_json, p.plan_hash, p.status, p.version,
               j.job_id, j.status AS job_status, c.candidate_id, c.status AS candidate_status,
               b.status AS stability_status
        FROM i8_executable_plans p
        JOIN i8_candidate_build_jobs j ON j.executable_plan_id = p.executable_plan_id
        LEFT JOIN i8_script_candidates c ON c.executable_plan_id = p.executable_plan_id
        LEFT JOIN i8_stability_batches b ON b.candidate_id = c.candidate_id
        WHERE p.namespace = ? AND p.preparation_id = ?
        ORDER BY j.created_at DESC LIMIT 1
      `).get(input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (existing) {
        if(bankPool && input.retryFailed===true)
          throw new HarnessError(409,'I10_BANK_VALIDATION_FRESH_POOL_REQUIRED','DOMAIN','资金候选失败后必须用新案例及新样本池，不能复用旧资金操作。',false,true);
        if (input.retryFailed === true && existing.stability_status === 'FAILED') {
          if (!input.revisionReason) {
            throw new HarnessError(409, 'I10_CANDIDATE_REVISION_REASON_REQUIRED', 'CONTRACT',
              '稳定性失败后的新候选必须提供限域修订说明。', false, true);
          }
          const previousPlan = executableActionPlanSchema.parse(JSON.parse(String(existing.plan_json)));
          const revisionSeed = canonicalJson({
            previousPlanId: existing.executable_plan_id,
            previousCandidateId: existing.candidate_id,
            revisionReason: input.revisionReason
          });
          const revisedPlan = {
            ...previousPlan,
            executablePlanId: `plan_i10_revision_${sha256(revisionSeed).slice(0, 40)}`
          };
          const revisedPlanJson = canonicalJson(revisedPlan);
          const revisedPlanHash = sha256(revisedPlanJson);
          const retryJobId = opaqueId('buildjob');
          db.prepare(`
            INSERT INTO i8_executable_plans(
              executable_plan_id, namespace, preparation_id, case_id, case_version,
              intent_plan_hash, plan_json, plan_hash, status, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTABLE_PLAN_READY', 1, ?, ?)
          `).run(
            revisedPlan.executablePlanId, input.namespace, input.preparationId,
            preparation.case_id, preparation.case_version, preparation.intent_plan_hash,
            revisedPlanJson, revisedPlanHash, timestamp, timestamp
          );
          db.prepare(`
            INSERT INTO i8_candidate_build_jobs(
              job_id, namespace, executable_plan_id, status, stability_policy_version,
              version, created_at, updated_at
            ) VALUES (?, ?, ?, 'QUEUED', ?, 1, ?, ?)
          `).run(retryJobId, input.namespace, revisedPlan.executablePlanId,
            input.stabilityPolicyVersion, timestamp, timestamp);
          this.audit(db, context, {
            namespace: input.namespace,
            action: 'i10_candidate_revision_submit',
            objectType: 'I8_EXECUTABLE_PLAN',
            objectId: revisedPlan.executablePlanId,
            outcome: 'SUCCEEDED',
            details: {
              previousPlanId: existing.executable_plan_id,
              previousCandidateId: existing.candidate_id,
              previousStabilityStatus: existing.stability_status,
              revisionReasonHash: sha256(input.revisionReason)
            }
          });
          return {
            status: 202,
            objectType: 'I8_EXECUTABLE_PLAN',
            objectId: revisedPlan.executablePlanId,
            response: {
              preparationId: input.preparationId,
              executablePlanId: revisedPlan.executablePlanId,
              planHash: revisedPlanHash,
              status: 'EXECUTABLE_PLAN_READY',
              version: 1,
              jobId: retryJobId,
              jobStatus: 'QUEUED',
              retriedFromJobId: existing.job_id,
              revisedFromCandidateId: existing.candidate_id,
              nextAction: 'AUTHORING_WORKER_REQUIRED'
            }
          };
        }
        if (input.retryFailed === true && existing.job_status === 'FAILED') {
          const retryJobId = opaqueId('buildjob');
          db.prepare(`
            INSERT INTO i8_candidate_build_jobs(job_id, namespace, executable_plan_id, status, stability_policy_version, version, created_at, updated_at)
            VALUES (?, ?, ?, 'QUEUED', ?, 1, ?, ?)
          `).run(retryJobId, input.namespace, existing.executable_plan_id, input.stabilityPolicyVersion, timestamp, timestamp);
          db.prepare(`UPDATE i8_executable_plans
            SET status='EXECUTABLE_PLAN_READY',version=version+1,updated_at=?
            WHERE executable_plan_id=?`).run(timestamp, existing.executable_plan_id);
          return {
            status: 202,
            objectType: 'I8_EXECUTABLE_PLAN',
            objectId: String(existing.executable_plan_id),
            response: {
              preparationId: input.preparationId,
              executablePlanId: existing.executable_plan_id,
              planHash: existing.plan_hash,
              status: 'EXECUTABLE_PLAN_READY',
              version: Number(existing.version) + 1,
              jobId: retryJobId,
              jobStatus: 'QUEUED',
              retriedFromJobId: existing.job_id,
              nextAction: 'AUTHORING_WORKER_REQUIRED'
            }
          };
        }
        return {
          status: 200,
          objectType: 'I8_EXECUTABLE_PLAN',
          objectId: String(existing.executable_plan_id),
          response: {
            preparationId: input.preparationId,
            executablePlanId: existing.executable_plan_id,
            planHash: existing.plan_hash,
            status: existing.status,
            version: existing.version,
            jobId: existing.job_id,
            jobStatus: existing.job_status,
            nextAction: existing.status === 'CANDIDATE_GENERATED' ? 'CANDIDATE_AVAILABLE' : 'AUTHORING_WORKER_REQUIRED'
          }
        };
      }
      if(bankPool)assertBankValidationPoolUnused(db,bankPool);
      let plan;
      try {
        plan = compileExecutableActionPlan(JSON.parse(String(preparation.intent_plan_json)), String(preparation.intent_plan_hash));
      } catch (error) {
        throw new HarnessError(409, error instanceof Error ? error.message : 'I8_EXECUTABLE_PLAN_REJECTED', 'CONTRACT', 'IntentPlan 无法编译为受控可执行计划。', false, true);
      }
      const planJson = canonicalJson(plan);
      const planHash = sha256(planJson);
      const jobId = opaqueId('buildjob');
      db.prepare(`
        INSERT INTO i8_executable_plans(
          executable_plan_id, namespace, preparation_id, case_id, case_version,
          intent_plan_hash, plan_json, plan_hash, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTABLE_PLAN_READY', 1, ?, ?)
      `).run(
        plan.executablePlanId, input.namespace, input.preparationId, preparation.case_id,
        preparation.case_version, preparation.intent_plan_hash, planJson, planHash, timestamp, timestamp
      );
      db.prepare(`
        INSERT INTO i8_candidate_build_jobs(job_id, namespace, executable_plan_id, status, stability_policy_version, version, created_at, updated_at)
        VALUES (?, ?, ?, 'QUEUED', ?, 1, ?, ?)
      `).run(jobId, input.namespace, plan.executablePlanId, input.stabilityPolicyVersion, timestamp, timestamp);
      return {
        status: 202,
        objectType: 'I8_EXECUTABLE_PLAN',
        objectId: plan.executablePlanId,
        response: {
          preparationId: input.preparationId,
          executablePlanId: plan.executablePlanId,
          planHash,
          status: 'EXECUTABLE_PLAN_READY',
          version: 1,
          jobId,
          jobStatus: 'QUEUED',
          nextAction: 'AUTHORING_WORKER_REQUIRED'
        }
      };
    });
  }

  getI8Candidate(namespace: string, preparationId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT p.executable_plan_id, p.plan_hash, p.status AS plan_status, p.version AS plan_version,
               j.job_id, j.status AS job_status, j.error_code,
               c.candidate_id, c.script_id, c.script_version, c.dsl_hash, c.generator_version,
               c.script_sha256, c.manifest_sha256, c.source_chain_hash, c.status AS candidate_status, c.version AS candidate_version,
               b.batch_id AS stability_batch_id, b.status AS stability_status, b.error_code AS stability_error_code,
               cert.certificate_id, cert.runtime_fingerprint, cert.viewport_set_json, cert.validation_run_ids_json,
               cert.assertion_set_hash, cert.evidence_set_hash, cert.issued_at,
               COALESCE(policy.policy_version, 'I8_2X3_V1') AS stability_policy_version,
               COALESCE(policy.required_runs, 6) AS stability_required_runs,
               (SELECT t.consumer_model FROM i10_action_traces t WHERE t.namespace = p.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_model,
               (SELECT t.context_policy FROM i10_action_traces t WHERE t.namespace = p.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_context_policy,
               (SELECT t.trace_hash FROM i10_action_traces t WHERE t.namespace = p.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_trace_hash,
               (SELECT t.playwright_fact_hash FROM i10_action_traces t WHERE t.namespace = p.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_playwright_fact_hash,
               (SELECT t.status FROM i10_action_traces t WHERE t.namespace = p.namespace AND t.preparation_id = p.preparation_id ORDER BY t.updated_at DESC LIMIT 1) AS authoring_status,
               (SELECT d.choice FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS delivery_choice,
               (SELECT d.effect FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS delivery_effect,
               (SELECT d.activated_plan_id FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS activated_plan_id,
               (SELECT d.created_at FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS delivery_created_at,
               (SELECT COUNT(*) FROM i8_stability_validation_runs r WHERE r.batch_id = b.batch_id AND r.status = 'PASSED') AS stability_passed_runs,
               (SELECT COUNT(*) FROM i8_stability_validation_runs r WHERE r.batch_id = b.batch_id AND r.status = 'FAILED') AS stability_failed_runs
        FROM i8_executable_plans p
        JOIN i8_candidate_build_jobs j ON j.executable_plan_id = p.executable_plan_id
        LEFT JOIN i8_script_candidates c ON c.executable_plan_id = p.executable_plan_id
        LEFT JOIN i8_stability_batches b ON b.candidate_id = c.candidate_id
        LEFT JOIN i8_stability_certificates cert ON cert.candidate_id = c.candidate_id
        LEFT JOIN i10_stability_policy_bindings policy ON policy.object_type='CANDIDATE_BATCH' AND policy.object_id=b.batch_id
        WHERE p.namespace = ? AND p.preparation_id = ?
        ORDER BY j.created_at DESC LIMIT 1
      `).get(namespace, preparationId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I8_EXECUTABLE_PLAN_NOT_FOUND', 'DOMAIN', '阶段3可执行计划不存在。');
      // RF-002-S2 (G2): active verification challenge gate keyed by the build job id
      const gate = row.job_id
        ? db.prepare(`
            SELECT challenge_id, status, verification_type, version, user_preparation
            FROM i10_verification_challenges
            WHERE namespace = ? AND task_ref = ? AND status IN ('WAITING_USER_PREPARATION','WAITING_USER_ACTION')
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY created_at DESC LIMIT 1
          `).get(namespace, String(row.job_id), nowIso()) as { challenge_id: string; status: string; verification_type: string; version: number; user_preparation: string } | undefined
        : undefined;
      const gatePresent = Boolean(gate);
      // RF-002-S2 (G2): Harness-owned nextAction (semantics identical to the
      // frozen MCP terminalActions set; S3 convergence is behavior-neutral)
      const nextAction = row.candidate_status === 'SCRIPT_VALIDATED'
        ? 'ON_DEMAND_RUN_AVAILABLE'
        : row.candidate_status === 'SAVED'
          ? 'ACTIVATE_OR_REJECT_AVAILABLE'
          : row.candidate_status === 'REJECTED'
            ? 'NONE'
            : row.certificate_id
              ? 'HUMAN_DELIVERY_DECISION_REQUIRED'
              : row.stability_status === 'FAILED'
                ? 'CANDIDATE_REPAIR_REQUIRED'
                : row.candidate_id
                  ? 'STABILITY_WORKER_REQUIRED'
                  : row.job_status === 'FAILED' ? 'AUTHORING_REVIEW_REQUIRED' : 'AUTHORING_WORKER_REQUIRED';
      return {
        preparationId,
        executablePlanId: row.executable_plan_id,
        planHash: row.plan_hash,
        status: row.plan_status,
        version: row.plan_version,
        job: { jobId: row.job_id, status: row.job_status, ...(row.error_code ? { errorCode: row.error_code } : {}) },
        ...(row.candidate_id ? {
          ...(row.authoring_trace_hash ? {
            authoringEvidence: {
              invocation: 'REAL',
              provider: 'MIDSCENE',
              model: row.authoring_model,
              contextPolicy: row.authoring_context_policy,
              actionTraceHash: row.authoring_trace_hash,
              playwrightFactHash: row.authoring_playwright_fact_hash,
              status: row.authoring_status
            }
          } : {}),
          candidate: {
            candidateId: row.candidate_id,
            scriptId: row.script_id,
            scriptVersion: row.script_version,
            dslHash: row.dsl_hash,
            generatorVersion: row.generator_version,
            scriptHash: row.script_sha256,
            manifestHash: row.manifest_sha256,
            sourceChainHash: row.source_chain_hash,
            status: row.candidate_status,
            version: row.candidate_version
          },
          stability: {
            batchId: row.stability_batch_id,
            status: row.stability_status,
            passedRuns: Number(row.stability_passed_runs ?? 0),
            failedRuns: Number(row.stability_failed_runs ?? 0),
            requiredRuns: Number(row.stability_required_runs ?? 6),
            policyVersion: row.stability_policy_version,
            viewportSet: ['1440x900', '390x844'],
            ...(row.stability_error_code ? { errorCode: row.stability_error_code } : {}),
            ...(row.certificate_id ? {
              certificate: {
                certificateId: row.certificate_id,
                runtimeFingerprint: row.runtime_fingerprint,
                viewportSet: JSON.parse(String(row.viewport_set_json)),
                validationRunIds: JSON.parse(String(row.validation_run_ids_json)),
                assertionSetHash: row.assertion_set_hash,
                evidenceSetHash: row.evidence_set_hash,
                status: 'PASSED',
                issuedAt: row.issued_at
              }
            } : {})
          },
          ...(row.delivery_choice ? {
            delivery: {
              choice: row.delivery_choice,
              effect: row.delivery_effect,
              ...(row.activated_plan_id ? { planId: row.activated_plan_id } : {}),
              decidedAt: row.delivery_created_at
            }
          } : {})
        } : {}),
        nextAction,
        ...(gate
          ? { verificationGate: {
              challengeId: gate.challenge_id,
              status: gate.status,
              kind: gate.verification_type,
              version: Number(gate.version),
              verificationType: gate.verification_type,
              userPreparation: gate.user_preparation,
              resumeAllowed: gate.status === 'WAITING_USER_ACTION'
            } }
          : {}),
        // RF-002-S2 (G2): Harness-owned terminal flag, consistent with the
        // frozen MCP terminalActions semantics
        terminal: Boolean(gate) || ['HUMAN_DELIVERY_DECISION_REQUIRED','ACTIVATE_OR_REJECT_AVAILABLE','ON_DEMAND_RUN_AVAILABLE','CANDIDATE_REPAIR_REQUIRED','AUTHORING_REVIEW_REQUIRED','NONE'].includes(nextAction)
      };
    });
  }

  async claimNextI8CandidateBuild(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const expired=db.prepare(`SELECT j.job_id,j.executable_plan_id,j.stability_policy_version,p.plan_json FROM i8_candidate_build_jobs j
        JOIN i8_executable_plans p ON p.executable_plan_id=j.executable_plan_id
        WHERE j.status='RUNNING' AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at<=?`).all(timestamp) as Array<{job_id:string;executable_plan_id:string;stability_policy_version:string;plan_json:string}>;
      for(const job of expired) {
        if(JSON.parse(job.plan_json).fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY') {
          db.prepare(`UPDATE i8_candidate_build_jobs SET status='FAILED',error_code='I10_BANK_AUTHORING_RESULT_UNKNOWN',lease_owner=NULL,
            lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=? WHERE job_id=?`).run(timestamp,timestamp,job.job_id);
          db.prepare("UPDATE i8_executable_plans SET status='FAILED',version=version+1,updated_at=? WHERE executable_plan_id=?").run(timestamp,job.executable_plan_id);
        } else if(job.stability_policy_version==='I10_2X2_V1') {
          db.prepare(`UPDATE i8_candidate_build_jobs SET status='FAILED',error_code='I10_AUTHORING_LEASE_EXPIRED',lease_owner=NULL,
            lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=? WHERE job_id=?`).run(timestamp,timestamp,job.job_id);
          db.prepare("UPDATE i8_executable_plans SET status='FAILED',version=version+1,updated_at=? WHERE executable_plan_id=?").run(timestamp,job.executable_plan_id);
        } else db.prepare(`UPDATE i8_candidate_build_jobs SET status='QUEUED',lease_owner=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE job_id=?`).run(timestamp,job.job_id);
      }
      const row = db.prepare(`
        SELECT j.job_id, j.namespace, j.executable_plan_id, j.stability_policy_version,
               p.plan_json, p.plan_hash, p.case_id, p.preparation_id, cv.definition_json
        FROM i8_candidate_build_jobs j
        JOIN i8_executable_plans p ON p.executable_plan_id = j.executable_plan_id
        JOIN case_versions cv ON cv.case_id = p.case_id AND cv.version = p.case_version
        WHERE j.status = 'QUEUED'
        ORDER BY j.created_at LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const definition = JSON.parse(String(row.definition_json)) as Record<string, unknown>;
      const plan = JSON.parse(String(row.plan_json)) as ExecutableActionPlan;
      let bankPool:BankValidationFixtures|undefined;
      if(plan.fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY') {
        try {bankPool=requireBankValidationFixtures(db,String(row.namespace),definition);assertBankValidationPoolUnused(db,bankPool);}
        catch(error) {
          if(!(error instanceof HarnessError))throw error;
          db.prepare(`UPDATE i8_candidate_build_jobs SET status='FAILED',error_code=?,version=version+1,completed_at=?,updated_at=? WHERE job_id=?`).run(error.errorCode,timestamp,timestamp,row.job_id);
          db.prepare("UPDATE i8_executable_plans SET status='FAILED',version=version+1,updated_at=? WHERE executable_plan_id=?").run(timestamp,row.executable_plan_id);
          return {status:'BLOCKED',jobId:row.job_id,errorCode:error.errorCode};
        }
      }
      // A visual action can make three independent real-model attempts, each
      // bounded at 90 seconds.  The candidate lease must outlive that bounded
      // transport recovery window plus browser/Builder work; otherwise a
      // healthy Worker can lose ownership while still following the declared
      // retry policy.  Five minutes retains failed-worker recovery while
      // covering one full visual retry sequence.
      const leaseExpiresAt = new Date(Date.now() + 300_000).toISOString();
      db.prepare(`
        UPDATE i8_candidate_build_jobs
        SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?, attempt_count = attempt_count + 1,
            version = version + 1, updated_at = ?
        WHERE job_id = ? AND status = 'QUEUED'
      `).run(workerId, leaseExpiresAt, timestamp, row.job_id);
      db.prepare(`UPDATE i8_executable_plans SET status = 'AUTHORING', version = version + 1, updated_at = ? WHERE executable_plan_id = ?`)
        .run(timestamp, row.executable_plan_id);
      const feedbackSources = String(row.stability_policy_version) === 'I10_2X2_V1'
        ? db.prepare(`SELECT f.*,ep.plan_json,c.dsl_json FROM reviewed_feedback f
              JOIN runs r ON r.run_id=f.source_run_id AND r.namespace=f.namespace
              JOIN i8_script_candidates c ON c.candidate_id=r.candidate_id AND c.namespace=f.namespace
              JOIN i8_executable_plans ep ON ep.executable_plan_id=c.executable_plan_id AND ep.namespace=f.namespace
              WHERE f.namespace=? AND f.status='VERIFIED' AND f.release_identity_hash=? ORDER BY f.created_at,f.feedback_id`)
              .all(row.namespace,this.releaseIdentityHash ?? null) as Array<ReviewedFeedbackSource & {verification_journey_id:string}>
        : [];
      const reviewedLocators=matchReviewedLocators(plan,String(row.namespace),this.releaseIdentityHash,feedbackSources);
      const reviewedAssertions=matchReviewedAssertions(plan,String(row.namespace),this.releaseIdentityHash,feedbackSources);
      for(const feedbackId of new Set([...reviewedLocators.values(),...reviewedAssertions.values()].map(item=>item.feedbackId))) {
        const source=feedbackSources.find(item=>item.feedback_id===feedbackId)!;
        this.verifyJourneyEvidence(String(row.namespace),source.verification_journey_id);
      }
      const authoringContexts = String(row.stability_policy_version) === 'I10_2X2_V1'
        ? buildI10CandidateContexts(plan, workerId, String(row.job_id), leaseExpiresAt,reviewedLocators,reviewedAssertions)
        : [];
      const insertContext = db.prepare(`INSERT OR IGNORE INTO i10_authoring_contexts(context_id,job_id,action_id,ordinal,context_level,envelope_json,envelope_hash,created_at) VALUES (?,?,?,?,?,?,?,?)`);
      for (const item of authoringContexts) {
        insertContext.run(opaqueId('context'),row.job_id,item.actionId,item.ordinal,item.contextLevel,canonicalJson(item.envelope),item.envelopeHash,timestamp);
      }
      return {
        status: 'CLAIMED',
        jobId: row.job_id,
        namespace: row.namespace,
        executablePlanId: row.executable_plan_id,
        planHash: row.plan_hash,
        plan,
        preparationId: row.preparation_id,
        stabilityPolicyVersion: row.stability_policy_version,
        ...(authoringContexts.length > 0 ? { authoringContexts } : {}),
        ...(bankPool ? {credentialRef:bankPool.authoring.credentialRef,validationFixture:bankPool.authoring,
          executionFixtureValues:bankExecutionFixtureValues(bankPool.authoring)} :
          typeof definition.credentialRef==='string' ? {credentialRef:definition.credentialRef}:{}),
        ...(typeof definition.entryUrl === 'string' ? { entryUrl: definition.entryUrl } : {}),
        leaseExpiresAt
      };
    });
  }

  async completeI8CandidateBuild(jobId: string, inputValue: I8CandidateBuildCompletionInput): Promise<Record<string, unknown>> {
    const input = i8CandidateBuildCompletionSchema.parse(inputValue);
    const job = this.database.read(db => db.prepare(`
      SELECT j.*, p.plan_json, p.plan_hash, p.case_id, p.case_version, p.executable_plan_id, p.preparation_id
      FROM i8_candidate_build_jobs j
      JOIN i8_executable_plans p ON p.executable_plan_id = j.executable_plan_id
      WHERE j.job_id = ?
    `).get(jobId) as Record<string, unknown> | undefined);
    if (!job) throw new HarnessError(404, 'I8_CANDIDATE_JOB_NOT_FOUND', 'DOMAIN', '阶段3候选构建作业不存在。');
    if (job.status === 'COMPLETED') return this.getI8Candidate(String(job.namespace), this.database.read(db => String((db.prepare('SELECT preparation_id FROM i8_executable_plans WHERE executable_plan_id = ?').get(job.executable_plan_id) as { preparation_id: string }).preparation_id)));
    if (job.status !== 'RUNNING' || job.lease_owner !== input.workerId || !job.lease_expires_at || String(job.lease_expires_at)<=nowIso()) throw new HarnessError(409, 'I8_CANDIDATE_JOB_LEASE_INVALID', 'CONCURRENCY', '候选构建作业租约无效。', false, true);
    if (job.plan_hash !== input.planHash) throw new HarnessError(409, 'I8_EXECUTABLE_PLAN_HASH_MISMATCH', 'CONCURRENCY', 'Worker 返回的计划 Hash 不匹配。', false, true);
    if (input.outcome === 'FAILED') {
      await this.database.write(db => {
        const timestamp = nowIso();
        db.prepare(`UPDATE i8_candidate_build_jobs SET status = 'FAILED', error_code = ?, lease_owner = NULL, lease_expires_at = NULL, version = version + 1, completed_at = ?, updated_at = ? WHERE job_id = ?`)
          .run(input.errorCode, timestamp, timestamp, jobId);
        if (input.diagnostic) {
          db.prepare(`INSERT INTO i10_execution_diagnostics(diagnostic_id,job_id,stage,action_ordinal,semantic_target_ref,verification_policy,page_fingerprint,route_path,safe_error_code,model_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
            .run(opaqueId('diagnostic'), jobId, input.diagnostic.stage, input.diagnostic.actionOrdinal ?? null, input.diagnostic.semanticTargetRef ?? null, input.diagnostic.verificationPolicy ?? null, input.diagnostic.pageFingerprint ?? null, input.diagnostic.routePath ?? null, input.diagnostic.safeErrorCode, input.diagnostic.modelStatus, timestamp);
        }
        db.prepare(`UPDATE i8_executable_plans SET status = 'FAILED', version = version + 1, updated_at = ? WHERE executable_plan_id = ?`)
          .run(timestamp, job.executable_plan_id);
      });
      return { jobId, status: 'FAILED', errorCode: input.errorCode, nextAction: 'AUTHORING_REVIEW_REQUIRED' };
    }
    const plan = JSON.parse(String(job.plan_json)) as ExecutableActionPlan;
    let i10Contexts: Array<{action_id:string;ordinal:number;context_level:string;envelope_json:string;envelope_hash:string}> = [];
    if (String(job.stability_policy_version) === 'I10_2X2_V1') {
      i10Contexts = this.database.read(db => db.prepare(`SELECT action_id,ordinal,context_level,envelope_json,envelope_hash FROM i10_authoring_contexts WHERE job_id=? ORDER BY ordinal`).all(jobId) as Array<{action_id:string;ordinal:number;context_level:string;envelope_json:string;envelope_hash:string}>);
      const visualActions = plan.actions.filter(action => Boolean(action.semanticTargetRef));
      if (i10Contexts.length !== visualActions.length) throw new HarnessError(409, 'I10_AUTHORING_CONTEXT_SET_INCOMPLETE', 'EVIDENCE', 'I10视觉上下文发放集合不完整。', false, true);
      const records = new Map(input.verifiedActionRecords.map(record => [record.actionId, record]));
      for (const action of visualActions) {
        const context = i10Contexts.find(item => item.action_id === action.actionId);
        const record = records.get(action.actionId);
        const contextEnvelope = context ? JSON.parse(context.envelope_json) : undefined;
        const contextHashValid = context ? sha256(canonicalJson(contextEnvelope)) === context.envelope_hash : false;
        const expectedPromptHash = contextEnvelope && contextHashValid ? sha256(buildMidscenePrompt(contextEnvelope)) : undefined;
        if (!context || !record || record.schemaVersion !== 'hengzhun-verified-action-record-v3'
          || record.contextEnvelopeHash !== context.envelope_hash || record.contextLevel !== context.context_level
          || !contextHashValid || record.visualEvidence?.invocation !== 'REAL' || record.visualEvidence.provider !== 'MIDSCENE'
          || record.visualEvidence.role !== 'LOCATOR_PROPOSAL' || record.visualEvidence.promptHash !== expectedPromptHash
          || !record.visualEvidence.screenshotHash || !record.visualEvidence.proposalHash
          || !record.visualEvidence.playwrightLocatorHash || record.visualEvidence.locatorMatched !== true
          || !record.locator || record.visualEvidence.playwrightLocatorHash !== sha256(canonicalJson(record.locator))
          || record.playwrightEvidence?.role !== 'EXECUTOR' || record.playwrightEvidence.locatorHash !== record.visualEvidence.playwrightLocatorHash
          || record.playwrightEvidence.operation !== action.operation) {
          throw new HarnessError(409, 'I10_LOCATE_EXECUTE_EVIDENCE_REQUIRED', 'EVIDENCE', 'I10候选必须同时具备Midscene定位建议和Playwright执行事实。', false, true, { actionId: action.actionId });
        }
        if(record.assertionImplementation!==contextEnvelope.currentAction.reviewedAssertion?.implementation)
          throw new HarnessError(409,'I10_ASSERTION_EXPERIENCE_EVIDENCE_REQUIRED','EVIDENCE','断言实现必须匹配已冻结经验并实际执行。',false,true);
      }
    }
    let candidate;
    try {
      const reviewedAssertions=new Map<string,ReviewedAssertion>();
      for(const item of i10Contexts) {
        const review=JSON.parse(item.envelope_json).currentAction.reviewedAssertion;
        if(review)reviewedAssertions.set(item.action_id,review);
      }
      candidate = buildCandidatePackage(plan, input.verifiedActionRecords, String(job.created_at),reviewedAssertions);
    } catch (error) {
      throw new HarnessError(409, error instanceof Error ? error.message : 'I8_CANDIDATE_BUILD_REJECTED', 'CONTRACT', 'Playwright 验证事实无法生成受控候选脚本。', false, true);
    }
    const relativeDirectory = `.data/candidates/${String(job.namespace)}/${candidate.candidateId}`;
    const directory = path.join(this.productRoot, ...relativeDirectory.split('/'));
    const candidateRoot = path.resolve(this.productRoot, '.data', 'candidates');
    const resolvedDirectory = path.resolve(directory);
    if (!resolvedDirectory.startsWith(`${candidateRoot}${path.sep}`)) throw new HarnessError(500, 'I8_CANDIDATE_DIRECTORY_INVALID', 'ENVIRONMENT', '候选目录越过受管根目录。');
    fs.mkdirSync(resolvedDirectory, { recursive: true });
    const scriptPath = path.join(resolvedDirectory, 'script.cjs');
    const manifestPath = path.join(resolvedDirectory, 'manifest.json');
    const manifestJson = canonicalJson(candidate.manifest);
    for (const [target, content] of [[scriptPath, candidate.scriptSource], [manifestPath, manifestJson]] as const) {
      if (fs.existsSync(target)) {
        if (fs.readFileSync(target, 'utf8') !== content) throw new HarnessError(409, 'I8_CANDIDATE_FILE_CONFLICT', 'CONCURRENCY', '候选文件已存在但内容不同。', false, true);
      } else {
        const temporary = `${target}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporary, target);
      }
    }
    await this.database.write(db => {
      const timestamp = nowIso();
      const current = db.prepare('SELECT status, lease_owner,lease_expires_at FROM i8_candidate_build_jobs WHERE job_id = ?').get(jobId) as { status: string; lease_owner: string | null;lease_expires_at:string|null };
      if (current.status !== 'RUNNING' || current.lease_owner !== input.workerId || !current.lease_expires_at || current.lease_expires_at<=timestamp) throw new HarnessError(409, 'I8_CANDIDATE_JOB_LEASE_INVALID', 'CONCURRENCY', '写入候选前作业租约已变化。', false, true);
      const insertRecord = db.prepare(`
        INSERT INTO i8_verified_action_records(record_id, namespace, executable_plan_id, action_id, ordinal, record_json, record_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const record of input.verifiedActionRecords) {
        const recordJson = canonicalJson(record);
        insertRecord.run(opaqueId('fact'), job.namespace, job.executable_plan_id, record.actionId, record.ordinal, recordJson, sha256(recordJson), timestamp);
      }
      if (String(job.stability_policy_version) === 'I10_2X2_V1') {
        const visualModels = [...new Set(input.verifiedActionRecords.map(record => record.visualEvidence?.model).filter((value): value is string => Boolean(value)))];
        if (visualModels.length !== 1) throw new HarnessError(409, 'I10_VISUAL_MODEL_IDENTITY_INCONSISTENT', 'EVIDENCE', 'I10视觉证据模型身份不一致。', false, true);
        const traceJson = canonicalJson({
          schemaVersion: 'hengzhun-i10-action-trace-v1',
          executablePlanId: job.executable_plan_id,
          authoringContexts: i10Contexts.map(item => ({ actionId:item.action_id, ordinal:item.ordinal, contextLevel:item.context_level, envelopeHash:item.envelope_hash, envelope:JSON.parse(item.envelope_json) })),
          records: input.verifiedActionRecords
        });
        const traceHash = sha256(traceJson);
        db.prepare(`INSERT INTO i10_action_traces(trace_id,namespace,case_id,preparation_id,consumer_model,context_policy,trace_json,trace_hash,playwright_fact_hash,status,created_at,updated_at)
          VALUES (?,?,?,?,?,'CTX-L2',?,?,?,'PLAYWRIGHT_VERIFIED',?,?)`)
          .run(opaqueId('trace'), job.namespace, job.case_id, job.preparation_id, visualModels[0], traceJson, traceHash,
            sha256(canonicalJson(input.verifiedActionRecords.map(record => record.verification))), timestamp, timestamp);
      }
      db.prepare(`
        INSERT INTO i8_script_candidates(
          candidate_id, namespace, executable_plan_id, script_id, script_version, dsl_version, dsl_json, dsl_hash,
          generator_version, relative_directory, script_sha256, manifest_json, manifest_sha256, source_chain_hash,
          status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED', 1, ?, ?)
      `).run(
        candidate.candidateId, job.namespace, job.executable_plan_id, candidate.scriptId, candidate.scriptVersion, candidate.dsl.schemaVersion,
        canonicalJson(candidate.dsl), candidate.dslHash, 'hengzhun-script-package-builder-1.0.0', relativeDirectory,
        candidate.scriptHash, manifestJson, candidate.manifestHash, candidate.sourceChainHash, timestamp, timestamp
      );
      db.prepare(`UPDATE i8_candidate_build_jobs SET status = 'COMPLETED', lease_owner = NULL, lease_expires_at = NULL, version = version + 1, completed_at = ?, updated_at = ? WHERE job_id = ?`)
        .run(timestamp, timestamp, jobId);
      db.prepare(`UPDATE i8_executable_plans SET status = 'CANDIDATE_GENERATED', version = version + 1, updated_at = ? WHERE executable_plan_id = ?`)
        .run(timestamp, job.executable_plan_id);
      const candidateSuffix = candidate.candidateId.slice('candidate_'.length);
      const batchId = `stability_${candidateSuffix}`;
      db.prepare(`
        INSERT INTO i8_stability_batches(batch_id, namespace, candidate_id, status, version, created_at, updated_at)
        VALUES (?, ?, ?, 'QUEUED', 1, ?, ?)
      `).run(batchId, job.namespace, candidate.candidateId, timestamp, timestamp);
      const insertStabilityRun = db.prepare(`
        INSERT INTO i8_stability_validation_runs(
          validation_run_id, batch_id, candidate_id, viewport_id, viewport_width, viewport_height,
          sequence_no, fixture_ref, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?)
      `);
      const policyVersion = String(job.stability_policy_version ?? 'I8_2X3_V1');
      const bankDefinition=plan.fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY'
        ? db.prepare('SELECT definition_json FROM case_versions WHERE case_id=? AND version=?').get(job.case_id,job.case_version) as {definition_json:string}:undefined;
      const bankPool=bankDefinition ? requireBankValidationFixtures(db,String(job.namespace),JSON.parse(bankDefinition.definition_json)):undefined;
      const requiredRuns = policyVersion === 'I10_2X2_V1' ? 4 : 6;
      const sequencesPerViewport = requiredRuns / I8_STABILITY_VIEWPORTS.length;
      db.prepare(`INSERT INTO i10_stability_policy_bindings(object_type,object_id,policy_version,required_runs,created_at) VALUES ('CANDIDATE_BATCH',?,?,?,?)`)
        .run(batchId, policyVersion, requiredRuns, timestamp);
      for (const viewport of I8_STABILITY_VIEWPORTS) {
        for (let sequence = 1; sequence <= sequencesPerViewport; sequence += 1) {
          insertStabilityRun.run(
            `validation_${candidateSuffix}_${viewport.suffix}_${sequence}`,
            batchId,
            candidate.candidateId,
            viewport.viewportId,
            viewport.width,
            viewport.height,
            sequence,
            bankPool ? bankPool.stability.find(item=>item.viewportId===viewport.viewportId && item.sequenceNo===sequence)!.fixture.fixtureId
              : `fixture_${candidateSuffix}_${viewport.suffix}_${sequence}`,
            timestamp
          );
        }
      }
      this.audit(db, { requestId: `worker:${jobId}`, actorType: 'SYSTEM' }, {
        namespace: String(job.namespace), action: 'i8_candidate_build', objectType: 'I8_SCRIPT_CANDIDATE',
        objectId: candidate.candidateId, outcome: 'SUCCEEDED', details: { jobId, scriptHash: candidate.scriptHash, manifestHash: candidate.manifestHash }
      });
    });
    return {
      jobId,
      status: 'CANDIDATE_GENERATED',
      candidateId: candidate.candidateId,
      scriptId: candidate.scriptId,
      scriptVersion: candidate.scriptVersion,
      scriptHash: candidate.scriptHash,
      manifestHash: candidate.manifestHash,
      sourceChainHash: candidate.sourceChainHash,
      nextAction: 'I8_STAGE4_STABILITY_REQUIRED'
    };
  }

  async claimNextI8Stability(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const expired = db.prepare(`SELECT batch_id, candidate_id FROM i8_stability_batches WHERE status = 'RUNNING' AND lease_expires_at < ?`).all(timestamp) as Array<{batch_id: string; candidate_id: string}>;
      for (const item of expired) {
        db.prepare(`UPDATE i8_stability_validation_runs SET status = 'FAILED', error_code = 'STABILITY_WORKER_LEASE_EXPIRED', completed_at = ? WHERE batch_id = ? AND status IN ('QUEUED', 'RUNNING')`)
          .run(timestamp, item.batch_id);
        db.prepare(`UPDATE i8_stability_batches SET status = 'FAILED', error_code = 'STABILITY_WORKER_LEASE_EXPIRED', lease_owner = NULL, lease_expires_at = NULL, version = version + 1, completed_at = ?, updated_at = ? WHERE batch_id = ?`)
          .run(timestamp, timestamp, item.batch_id);
        db.prepare(`UPDATE i8_script_candidates SET status = 'VALIDATION_FAILED', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
          .run(timestamp, item.candidate_id);
      }
      const row = db.prepare(`
        SELECT b.batch_id, b.namespace, b.candidate_id, c.relative_directory, c.script_sha256, c.manifest_sha256,
               c.script_version, p.case_version, p.version AS executable_plan_version, p.plan_json, cv.definition_json,
               COALESCE(policy.policy_version, 'I8_2X3_V1') AS stability_policy_version,
               COALESCE(policy.required_runs, 6) AS required_runs
        FROM i8_stability_batches b
        JOIN i8_script_candidates c ON c.candidate_id = b.candidate_id
        JOIN i8_executable_plans p ON p.executable_plan_id = c.executable_plan_id
        JOIN case_versions cv ON cv.case_id = p.case_id AND cv.version = p.case_version
        LEFT JOIN i10_stability_policy_bindings policy ON policy.object_type='CANDIDATE_BATCH' AND policy.object_id=b.batch_id
        WHERE b.status = 'QUEUED'
        ORDER BY b.created_at, b.batch_id LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const leaseExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      db.prepare(`UPDATE i8_stability_batches SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?, version = version + 1, updated_at = ? WHERE batch_id = ? AND status = 'QUEUED'`)
        .run(workerId, leaseExpiresAt, timestamp, row.batch_id);
      db.prepare(`UPDATE i8_stability_validation_runs SET status = 'RUNNING' WHERE batch_id = ? AND status = 'QUEUED'`).run(row.batch_id);
      db.prepare(`UPDATE i8_script_candidates SET status = 'VALIDATING', version = version + 1, updated_at = ? WHERE candidate_id = ? AND status = 'GENERATED'`)
        .run(timestamp, row.candidate_id);
      const runs = db.prepare(`
        SELECT validation_run_id, viewport_id, viewport_width, viewport_height, sequence_no, fixture_ref
        FROM i8_stability_validation_runs WHERE batch_id = ?
        ORDER BY CASE viewport_id WHEN 'DESKTOP_1440X900' THEN 1 ELSE 2 END, sequence_no
      `).all(row.batch_id) as Array<Record<string, unknown>>;
      if (runs.length !== Number(row.required_runs)) throw new HarnessError(500, 'I8_STABILITY_RUN_SET_CORRUPT', 'EVIDENCE', '稳定性样本集合不完整。');
      const definition = JSON.parse(String(row.definition_json)) as Record<string, unknown>;
      const bankPool=JSON.parse(String(row.plan_json)).fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY'
        ? requireBankValidationFixtures(db,String(row.namespace),definition):undefined;
      if(bankPool && (String(row.stability_policy_version)!=='I10_2X2_V1' || runs.some(run=>
        bankPool.stability.find(item=>item.viewportId===run.viewport_id && item.sequenceNo===run.sequence_no)?.fixture.fixtureId!==run.fixture_ref)))
        throw new HarnessError(409,'I10_BANK_VALIDATION_RUN_BINDING_INVALID','EVIDENCE','稳定性样本必须绑定最初冻结的实际资金Fixture。',false,true);
      return {
        status: 'CLAIMED',
        batchId: row.batch_id,
        namespace: row.namespace,
        candidateId: row.candidate_id,
        scriptVersion: row.script_version,
        caseVersion: row.case_version,
        executablePlanVersion: row.executable_plan_version,
        relativeDirectory: row.relative_directory,
        scriptHash: row.script_sha256,
        manifestHash: row.manifest_sha256,
        credentialAlias: 'i3-customer',
        leaseOwner: workerId,
        leaseExpiresAt,
        stabilityPolicyVersion: row.stability_policy_version,
        requiredRuns: row.required_runs,
        ...(bankPool ? {bankValidationFixtures:bankPool}:String(row.stability_policy_version) === 'I10_2X2_V1' && typeof definition.credentialRef === 'string' ? { credentialRef: definition.credentialRef } : {}),
        ...(String(row.stability_policy_version) === 'I10_2X2_V1' && typeof definition.entryUrl === 'string' ? { entryUrl: definition.entryUrl } : {}),
        runs: runs.map(run => ({
          validationRunId: run.validation_run_id,
          viewportId: run.viewport_id,
          viewportWidth: run.viewport_width,
          viewportHeight: run.viewport_height,
          sequenceNo: run.sequence_no,
          fixtureRef: run.fixture_ref,
          ...(bankPool ? (()=>{const fixture=bankPool.stability.find(item=>item.viewportId===run.viewport_id && item.sequenceNo===run.sequence_no)!.fixture;
            return {credentialRef:fixture.credentialRef,validationFixture:fixture,executionFixtureValues:bankExecutionFixtureValues(fixture)};})():{})
        }))
      };
    });
  }

  async completeI8Stability(batchId: string, inputValue: I8StabilityCompletionInput): Promise<Record<string, unknown>> {
    const input = i8StabilityCompletionSchema.parse(inputValue);
    const snapshot = this.database.read(db => db.prepare(`
      SELECT b.*, c.script_sha256, c.namespace, p.case_version, p.version AS executable_plan_version, p.plan_json,
             COALESCE(policy.policy_version, 'I8_2X3_V1') AS stability_policy_version,
             COALESCE(policy.required_runs, 6) AS required_runs
      FROM i8_stability_batches b
      JOIN i8_script_candidates c ON c.candidate_id = b.candidate_id
      JOIN i8_executable_plans p ON p.executable_plan_id = c.executable_plan_id
      LEFT JOIN i10_stability_policy_bindings policy ON policy.object_type='CANDIDATE_BATCH' AND policy.object_id=b.batch_id
      WHERE b.batch_id = ?
    `).get(batchId) as Record<string, unknown> | undefined);
    if (!snapshot) throw new HarnessError(404, 'I8_STABILITY_BATCH_NOT_FOUND', 'DOMAIN', '稳定性验证批次不存在。');
    if (snapshot.status === 'PASSED' || snapshot.status === 'FAILED') {
      return { batchId, candidateId: snapshot.candidate_id, status: snapshot.status, replayed: true };
    }
    if (snapshot.status !== 'RUNNING' || snapshot.lease_owner !== input.workerId) throw new HarnessError(409, 'I8_STABILITY_LEASE_INVALID', 'CONCURRENCY', '稳定性验证租约无效。', false, true);
    if (snapshot.candidate_id !== input.candidateId || snapshot.script_sha256 !== input.scriptHash) throw new HarnessError(409, 'I8_STABILITY_CANDIDATE_MISMATCH', 'CONCURRENCY', '稳定性结果与候选脚本不匹配。', false, true);
    if(input.stoppedAfterFailure && (snapshot.stability_policy_version!=='I10_2X2_V1' || JSON.parse(String(snapshot.plan_json)).fixtureProfile!=='TRANSFER_UKEY_ORDER_QUERY'))
      throw new HarnessError(409,'I10_BANK_FAILURE_PREFIX_NOT_ALLOWED','CONTRACT','只有当前资金样本可以提交首次失败停止回执。');
    const expectedRuns = this.database.read(db => db.prepare(`SELECT * FROM i8_stability_validation_runs WHERE batch_id = ?`).all(batchId) as Array<Record<string, unknown>>);
    const expectedById = new Map(expectedRuns.map(run => [String(run.validation_run_id), run]));
    if (expectedById.size !== Number(snapshot.required_runs) || (!input.stoppedAfterFailure && input.runs.length !== Number(snapshot.required_runs))) throw new HarnessError(500, 'I8_STABILITY_RUN_SET_CORRUPT', 'EVIDENCE', '稳定性样本集合不完整。');
    if(input.executionFailure) {
      const orderedRuns=[...expectedRuns].sort((a,b)=>String(a.viewport_id).localeCompare(String(b.viewport_id)) || Number(a.sequence_no)-Number(b.sequence_no));
      if(orderedRuns[input.runs.length]?.validation_run_id!==input.executionFailure.validationRunId)
        throw new HarnessError(409,'I10_BANK_FAILURE_PREFIX_NOT_ALLOWED','CONTRACT','证据未完整采集的失败必须属于已完成前缀的下一样本。');
    }
    const stabilityRoot = path.resolve(this.productRoot, '.data', 'stability');
    for (const result of input.runs) {
      const expected = expectedById.get(result.validationRunId);
      if (!expected || expected.viewport_id !== result.viewportId || Number(expected.viewport_width) !== result.viewportWidth || Number(expected.viewport_height) !== result.viewportHeight || Number(expected.sequence_no) !== result.sequenceNo || expected.fixture_ref !== result.fixtureRef) {
        throw new HarnessError(409, 'I8_STABILITY_RUN_IDENTITY_MISMATCH', 'CONTRACT', 'Worker返回的稳定性样本身份不匹配。', false, true);
      }
      for (const artifact of result.evidence) {
        const resolved = path.resolve(this.productRoot, ...artifact.relativePath.split('/'));
        if (!resolved.startsWith(`${stabilityRoot}${path.sep}`) || !fs.existsSync(resolved)) throw new HarnessError(409, 'I8_STABILITY_EVIDENCE_MISSING', 'EVIDENCE', '稳定性证据文件缺失或越界。', false, true);
        if(JSON.parse(String(snapshot.plan_json)).fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY') {
          const sampleRoot=path.resolve(stabilityRoot,String(snapshot.namespace),input.candidateId,result.validationRunId);
          if(!resolved.startsWith(`${sampleRoot}${path.sep}`))throw new HarnessError(409,'I8_STABILITY_EVIDENCE_MISSING','EVIDENCE','资金样本不得复用其他样本的工件。',false,true);
        }
        const bytes = fs.readFileSync(resolved);
        if (bytes.byteLength !== artifact.byteLength || sha256(bytes) !== artifact.sha256) throw new HarnessError(409, 'I8_STABILITY_EVIDENCE_HASH_MISMATCH', 'EVIDENCE', '稳定性证据Hash不匹配。', false, true);
      }
    }
    const allPassed = !input.executionFailure && input.runs.every(run => run.outcome === 'PASSED');
    const assertionHashes = new Set(input.runs.map(run => run.assertionSetHash));
    const evidenceHashes = new Set(input.runs.map(run => run.evidenceSetHash));
    const consistent = assertionHashes.size === 1 && evidenceHashes.size === 1;
    const passed = allPassed && consistent;
    const errorCode = input.executionFailure?.errorCode ?? (passed ? undefined : !allPassed
      ? input.runs.find(run => run.outcome === 'FAILED')?.errorCode ?? 'STABILITY_SAMPLE_FAILED'
      : assertionHashes.size !== 1 ? 'STABILITY_ASSERTION_SET_DRIFT' : 'STABILITY_EVIDENCE_SET_DRIFT');
    return this.database.write(db => {
      const timestamp = nowIso();
      const current = db.prepare('SELECT status, lease_owner FROM i8_stability_batches WHERE batch_id = ?').get(batchId) as {status: string; lease_owner: string | null};
      if (current.status !== 'RUNNING' || current.lease_owner !== input.workerId) throw new HarnessError(409, 'I8_STABILITY_LEASE_INVALID', 'CONCURRENCY', '写入稳定性结果前租约已变化。', false, true);
      const updateRun = db.prepare(`UPDATE i8_stability_validation_runs SET status = ?, duration_ms = ?, assertion_set_hash = ?, evidence_set_hash = ?, evidence_json = ?, error_code = ?, completed_at = ? WHERE validation_run_id = ? AND batch_id = ? AND status = 'RUNNING'`);
      for (const run of input.runs) {
        updateRun.run(run.outcome, run.durationMs, run.assertionSetHash, run.evidenceSetHash, canonicalJson(run.evidence), run.errorCode ?? null, timestamp, run.validationRunId, batchId);
      }
      if(input.executionFailure)
        db.prepare(`UPDATE i8_stability_validation_runs SET status='FAILED',error_code=?,completed_at=?
          WHERE validation_run_id=? AND batch_id=? AND status='RUNNING'`).run(input.executionFailure.errorCode,timestamp,input.executionFailure.validationRunId,batchId);
      if(input.stoppedAfterFailure)
        db.prepare(`UPDATE i8_stability_validation_runs SET status='FAILED',error_code='BANK_VALIDATION_NOT_EXECUTED_AFTER_FAILURE',completed_at=?
          WHERE batch_id=? AND status='RUNNING'`).run(timestamp,batchId);
      let certificateId: string | undefined;
      if (passed) {
        certificateId = `certificate_${sha256(canonicalJson({ candidateId: input.candidateId, scriptHash: input.scriptHash, runtimeFingerprint: input.runtimeFingerprint })).slice(0, 40)}`;
        const runIds = input.runs.map(run => run.validationRunId);
        db.prepare(`
          INSERT INTO i8_stability_certificates(
            certificate_id, namespace, candidate_id, batch_id, script_sha256, case_version,
            executable_plan_version, runtime_fingerprint, viewport_set_json, validation_run_ids_json,
            assertion_set_hash, evidence_set_hash, status, issued_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?)
        `).run(
          certificateId, snapshot.namespace, input.candidateId, batchId, input.scriptHash,
          snapshot.case_version, snapshot.executable_plan_version, input.runtimeFingerprint,
          canonicalJson(I8_STABILITY_VIEWPORTS.map(viewport => ({ viewportId: viewport.viewportId, width: viewport.width, height: viewport.height, consecutivePasses: Number(snapshot.required_runs) / I8_STABILITY_VIEWPORTS.length }))),
          canonicalJson(runIds), [...assertionHashes][0], [...evidenceHashes][0], timestamp
        );
        db.prepare(`INSERT INTO i10_stability_policy_bindings(object_type,object_id,policy_version,required_runs,created_at) VALUES ('CANDIDATE_CERTIFICATE',?,?,?,?)`)
          .run(certificateId, snapshot.stability_policy_version, snapshot.required_runs, timestamp);
      }
      db.prepare(`UPDATE i8_stability_batches SET status = ?, lease_owner = NULL, lease_expires_at = NULL, runtime_fingerprint = ?, assertion_set_hash = ?, evidence_set_hash = ?, error_code = ?, version = version + 1, completed_at = ?, updated_at = ? WHERE batch_id = ?`)
        .run(passed ? 'PASSED' : 'FAILED', input.runtimeFingerprint ?? null, assertionHashes.size === 1 ? [...assertionHashes][0] : null, evidenceHashes.size === 1 ? [...evidenceHashes][0] : null, errorCode ?? null, timestamp, timestamp, batchId);
      db.prepare(`UPDATE i8_script_candidates SET status = ?, version = version + 1, updated_at = ? WHERE candidate_id = ?`)
        .run(passed ? 'STABILITY_CERTIFIED' : 'VALIDATION_FAILED', timestamp, input.candidateId);
      this.audit(db, { requestId: `worker:${batchId}`, actorType: 'SYSTEM' }, {
        namespace: String(snapshot.namespace), action: 'i8_stability_complete', objectType: 'I8_STABILITY_BATCH', objectId: batchId,
        outcome: passed ? 'SUCCEEDED' : 'REJECTED', details: { candidateId: input.candidateId, runCount: input.runs.length, policyVersion: snapshot.stability_policy_version, certificateId: certificateId ?? null, errorCode: errorCode ?? null }
      });
      return {
        batchId,
        candidateId: input.candidateId,
        status: passed ? 'STABILITY_CERTIFIED' : 'VALIDATION_FAILED',
        passedRuns: input.runs.filter(run => run.outcome === 'PASSED').length,
        failedRuns: input.runs.filter(run => run.outcome === 'FAILED').length+(input.executionFailure?1:0),
        ...(input.stoppedAfterFailure?{notExecutedRuns:Number(snapshot.required_runs)-input.runs.length-(input.executionFailure?1:0)}:{}),
        ...(input.executionFailure?{incompleteEvidenceRuns:1}:{}),
        requiredRuns: Number(snapshot.required_runs),
        stabilityPolicyVersion: snapshot.stability_policy_version,
        ...(certificateId ? { certificateId, nextAction: 'I8_STAGE5_DELIVERY_REQUIRED' } : { errorCode, nextAction: JSON.parse(String(snapshot.plan_json)).fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY'?'HUMAN_INTERVENTION_REQUIRED':'CANDIDATE_REPAIR_REQUIRED' })
      };
    });
  }

  async previewI8Candidate(input: I8CandidatePreviewInput, context: RequestContext): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      this.ensureNamespace(db, input.namespace, timestamp);
      const candidate = this.verifiedI8Candidate(db, input.namespace, input.candidateId);
      const lines = candidate.scriptSource.replace(/\r\n/g, '\n').split('\n');
      const startIndex = input.cursor ? Number(input.cursor.slice('line:'.length)) : 0;
      if (!Number.isSafeInteger(startIndex) || startIndex < 0 || startIndex > lines.length) {
        throw new HarnessError(400, 'I8_PREVIEW_CURSOR_INVALID', 'CONTRACT', '脚本预览游标无效。');
      }
      const selected: string[] = [];
      for (let index = startIndex; index < lines.length && selected.length < input.limit; index += 1) {
        const trial = [...selected, lines[index] as string];
        const trialBody = {
          candidateId: candidate.candidate_id,
          scriptHash: candidate.script_sha256,
          startLine: startIndex + 1,
          endLine: startIndex + trial.length,
          lines: trial,
          nextCursor: startIndex + trial.length < lines.length ? `line:${startIndex + trial.length}` : null
        };
        if (Buffer.byteLength(JSON.stringify(trialBody), 'utf8') > 15 * 1024) {
          if (selected.length === 0) throw new HarnessError(413, 'OUTPUT_BUDGET_EXCEEDED', 'CONTRACT', '单行脚本超过安全预览预算。');
          break;
        }
        selected.push(lines[index] as string);
      }
      let download: Record<string, unknown> | undefined;
      if (input.includeDownload) {
        const token = opaqueId('download');
        const grantId = opaqueId('grant');
        const expiresAt = new Date(Date.parse(timestamp) + 5 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO i8_script_download_grants(
            grant_id, namespace, candidate_id, certificate_id, token_sha256,
            script_sha256, status, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `).run(
          grantId, input.namespace, candidate.candidate_id, candidate.certificate_id,
          sha256(token), candidate.script_sha256, expiresAt, timestamp
        );
        download = {
          grantId,
          href: `/v1/i8/downloads/${token}`,
          filename: `hengzhun-${candidate.script_id}-v${candidate.script_version}.cjs`,
          mediaType: 'text/javascript; charset=utf-8',
          sha256: candidate.script_sha256,
          expiresAt,
          oneTime: true
        };
      }
      this.audit(db, context, {
        namespace: input.namespace,
        action: input.includeDownload ? 'i8_candidate_preview_and_download_grant' : 'i8_candidate_preview',
        objectType: 'I8_SCRIPT_CANDIDATE',
        objectId: input.candidateId,
        outcome: 'ACCEPTED',
        details: { startLine: startIndex + 1, lineCount: selected.length, downloadGranted: input.includeDownload }
      });
      const endIndex = startIndex + selected.length;
      return {
        candidateId: candidate.candidate_id,
        caseId: candidate.case_id,
        caseVersion: candidate.case_version,
        executablePlanId: candidate.executable_plan_id,
        executablePlanVersion: candidate.executable_plan_version,
        scriptId: candidate.script_id,
        scriptVersion: candidate.script_version,
        scriptHash: candidate.script_sha256,
        generatorVersion: candidate.generator_version,
        certificate: {
          certificateId: candidate.certificate_id,
          status: 'PASSED',
          assertionSummary: JSON.parse(String(candidate.acceptance_summary_json)),
          evidenceHash: candidate.manifest_sha256
        },
        ...(candidate.authoring_trace_hash ? {
          authoringEvidence: {
            invocation: 'REAL',
            provider: 'MIDSCENE',
            model: candidate.authoring_model,
            contextPolicy: candidate.authoring_context_policy,
            actionTraceHash: candidate.authoring_trace_hash,
            playwrightFactHash: candidate.authoring_playwright_fact_hash,
            status: candidate.authoring_status
          }
        } : {}),
        startLine: selected.length > 0 ? startIndex + 1 : 0,
        endLine: selected.length > 0 ? endIndex : 0,
        lines: selected,
        nextCursor: endIndex < lines.length ? `line:${endIndex}` : null,
        ...(download ? { download } : {})
      };
    });
  }

  async consumeI8Download(token: string): Promise<{ filename: string; mediaType: string; sha256: string; content: Buffer }> {
    const result = await this.database.write(db => {
      const timestamp = nowIso();
      const tokenHash = sha256(token);
      const grant = db.prepare(`
        SELECT * FROM i8_script_download_grants WHERE token_sha256 = ?
      `).get(tokenHash) as Record<string, unknown> | undefined;
      if (!grant || grant.status !== 'ACTIVE') return { state: 'UNAVAILABLE' as const };
      if (String(grant.expires_at) <= timestamp) {
        db.prepare(`UPDATE i8_script_download_grants SET status = 'EXPIRED' WHERE grant_id = ? AND status = 'ACTIVE'`).run(grant.grant_id);
        return { state: 'EXPIRED' as const };
      }
      const candidate = this.verifiedI8Candidate(db, String(grant.namespace), String(grant.candidate_id));
      if (candidate.script_sha256 !== grant.script_sha256 || candidate.certificate_id !== grant.certificate_id) {
        throw new HarnessError(409, 'I8_DOWNLOAD_BINDING_MISMATCH', 'EVIDENCE', '下载授权绑定已失效。', false, true);
      }
      db.prepare(`UPDATE i8_script_download_grants SET status = 'USED', used_at = ? WHERE grant_id = ? AND status = 'ACTIVE'`)
        .run(timestamp, grant.grant_id);
      this.audit(db, { requestId: `download:${grant.grant_id}`, actorType: 'SYSTEM' }, {
        namespace: String(grant.namespace),
        action: 'i8_candidate_download',
        objectType: 'I8_SCRIPT_CANDIDATE',
        objectId: String(grant.candidate_id),
        outcome: 'ACCEPTED',
        details: { grantId: grant.grant_id, scriptHash: grant.script_sha256 }
      });
      return {
        state: 'READY' as const,
        filename: `hengzhun-${candidate.script_id}-v${candidate.script_version}.cjs`,
        mediaType: 'text/javascript; charset=utf-8',
        sha256: String(candidate.script_sha256),
        content: Buffer.from(candidate.scriptSource, 'utf8')
      };
    });
    if (result.state === 'EXPIRED') throw new HarnessError(410, 'I8_DOWNLOAD_GRANT_EXPIRED', 'AUTHORIZATION', '下载授权已过期。');
    if (result.state === 'UNAVAILABLE') throw new HarnessError(404, 'I8_DOWNLOAD_GRANT_UNAVAILABLE', 'AUTHORIZATION', '下载授权不存在或已使用。');
    return result;
  }

  async decideI8Candidate(input: I8CandidateDecisionInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_candidate_decide', input.idempotencyKey, input, context, (db, timestamp) => {
      const candidate = this.verifiedI8Candidate(db, input.namespace, input.candidateId);
      if (Number(candidate.version) !== input.expectedCandidateVersion) {
        throw new HarnessError(409, 'I8_CANDIDATE_VERSION_CONFLICT', 'CONCURRENCY', '候选版本已变化。', false, true, { currentVersion: candidate.version });
      }
      if (!['STABILITY_CERTIFIED', 'SAVED'].includes(String(candidate.status))) {
        throw new HarnessError(409, 'I8_CANDIDATE_DECISION_NOT_ALLOWED', 'DOMAIN', '候选当前状态不接受交付决定。', false, true);
      }
      if (candidate.status === 'SAVED' && input.choice === 'SAVE_ONLY') {
        throw new HarnessError(409, 'I8_CANDIDATE_ALREADY_SAVED', 'DOMAIN', '候选已经保存。', false, true);
      }
      let effect: 'CANDIDATE_SAVED' | 'SCRIPT_VERSION_ACTIVATED' | 'CANDIDATE_REJECTED';
      let nextStatus: 'SAVED' | 'SCRIPT_VALIDATED' | 'REJECTED';
      let activatedPlanId: string | undefined;
      if (input.choice === 'SAVE_ONLY') {
        effect = 'CANDIDATE_SAVED';
        nextStatus = 'SAVED';
      } else if (input.choice === 'REJECT') {
        effect = 'CANDIDATE_REJECTED';
        nextStatus = 'REJECTED';
      } else {
        effect = 'SCRIPT_VERSION_ACTIVATED';
        nextStatus = 'SCRIPT_VALIDATED';
        const existingScript = db.prepare('SELECT namespace, case_id FROM scripts WHERE script_id = ?')
          .get(candidate.script_id) as { namespace: string; case_id: string } | undefined;
        if (existingScript && (existingScript.namespace !== input.namespace || existingScript.case_id !== candidate.case_id)) {
          throw new HarnessError(409, 'I8_SCRIPT_ID_CONFLICT', 'CONCURRENCY', '脚本标识已绑定其他案例。', false, true);
        }
        if (!existingScript) {
          db.prepare(`
            INSERT INTO scripts(script_id, namespace, case_id, current_version, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'SCRIPT_VALIDATED', ?, ?)
          `).run(candidate.script_id, input.namespace, candidate.case_id, candidate.script_version, timestamp, timestamp);
        }
        const configuration = canonicalJson({
          mode: 'I8_CANDIDATE',
          candidateId: candidate.candidate_id,
          relativeDirectory: candidate.relative_directory,
          scriptHash: candidate.script_sha256,
          manifestHash: candidate.manifest_sha256
        });
        const existingVersion = db.prepare('SELECT sha256, relative_path FROM script_versions WHERE script_id = ? AND version = ?')
          .get(candidate.script_id, candidate.script_version) as { sha256: string; relative_path: string } | undefined;
        if (existingVersion && (existingVersion.sha256 !== candidate.script_sha256 || existingVersion.relative_path !== candidate.scriptRelativePath)) {
          throw new HarnessError(409, 'I8_SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '脚本版本已绑定不同内容。', false, true);
        }
        if (!existingVersion) {
          db.prepare(`
            INSERT INTO script_versions(
              script_id, version, relative_path, sha256, validation_status,
              configuration_json, source_sha256, created_at
            ) VALUES (?, ?, ?, ?, 'PASSED', ?, ?, ?)
          `).run(
            candidate.script_id, candidate.script_version, candidate.scriptRelativePath,
            candidate.script_sha256, configuration, candidate.script_sha256, timestamp
          );
        }
        db.prepare(`UPDATE scripts SET current_version = ?, status = 'SCRIPT_VALIDATED', updated_at = ? WHERE script_id = ?`)
          .run(candidate.script_version, timestamp, candidate.script_id);
        activatedPlanId = `plan_i8_${sha256(String(candidate.executable_plan_id)).slice(0, 40)}`;
        const summary = canonicalJson({
          source: 'I8_DETERMINISTIC_BUILDER',
          candidateId: candidate.candidate_id,
          certificateId: candidate.certificate_id,
          scriptHash: candidate.script_sha256,
          formalRegression: true
        });
        const existingPlan = db.prepare('SELECT content_hash, script_id FROM plans WHERE plan_id = ?')
          .get(activatedPlanId) as { content_hash: string; script_id: string } | undefined;
        const contentHash = sha256(summary);
        if (existingPlan && (existingPlan.content_hash !== contentHash || existingPlan.script_id !== candidate.script_id)) {
          throw new HarnessError(409, 'I8_ACTIVATED_PLAN_CONFLICT', 'CONCURRENCY', '正式计划已绑定不同脚本。', false, true);
        }
        if (!existingPlan) {
          db.prepare(`
            INSERT INTO plans(
              plan_id, namespace, case_id, case_version, version, status, summary_json,
              content_hash, created_at, script_id, full_action_plan_json
            ) VALUES (?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, NULL)
          `).run(
            activatedPlanId, input.namespace, candidate.case_id, candidate.case_version,
            candidate.executable_plan_version, summary, contentHash, timestamp, candidate.script_id
          );
        }
      }
      const decisionId = opaqueId('delivery');
      db.prepare(`
        INSERT INTO i8_script_delivery_decisions(
          decision_id, namespace, candidate_id, certificate_id, expected_candidate_version,
          choice, reason, confirmation_ref, effect, case_version, executable_plan_id,
          executable_plan_version, activated_plan_id, script_id, script_version, script_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        decisionId, input.namespace, candidate.candidate_id, candidate.certificate_id,
        input.expectedCandidateVersion, input.choice, input.reason, input.confirmationRef,
        effect, candidate.case_version, candidate.executable_plan_id, candidate.executable_plan_version,
        activatedPlanId ?? null, candidate.script_id, candidate.script_version, candidate.script_sha256, timestamp
      );
      db.prepare(`UPDATE i8_script_candidates SET status = ?, version = version + 1, updated_at = ? WHERE candidate_id = ?`)
        .run(nextStatus, timestamp, candidate.candidate_id);
      return {
        status: 200,
        objectType: 'I8_SCRIPT_DELIVERY_DECISION',
        objectId: decisionId,
        response: {
          decisionId,
          candidateId: candidate.candidate_id,
          choice: input.choice,
          effect,
          status: nextStatus,
          candidateVersion: input.expectedCandidateVersion + 1,
          scriptId: candidate.script_id,
          scriptVersion: candidate.script_version,
          scriptHash: candidate.script_sha256,
          ...(activatedPlanId ? { planId: activatedPlanId, nextAction: 'ON_DEMAND_RUN_AVAILABLE' } : { nextAction: nextStatus === 'SAVED' ? 'ACTIVATE_OR_REJECT_AVAILABLE' : 'NONE' })
        }
      };
    });
  }

  private caseCredentialRef(db: import('better-sqlite3').Database, caseId: string, caseVersion: number): string {
    const row = db.prepare('SELECT definition_json FROM case_versions WHERE case_id = ? AND version = ?').get(caseId, caseVersion) as { definition_json: string } | undefined;
    if (!row) return '';
    const definition = JSON.parse(row.definition_json) as Record<string, unknown>;
    return typeof definition.credentialRef === 'string' ? definition.credentialRef : '';
  }

  private validatedJourneyExecutionBinding(
    db: import('better-sqlite3').Database,
    input: {
      namespace: string;
      journeyId: string;
      confirmedDecisionEventId: string;
      preparationId: string;
    },
    resolved: { caseId: string; planId: string; candidateId: string },
    expectedDecision: 'RUN_ON_DEMAND' | 'CREATE_ONE_TIME_SCHEDULE' | 'CREATE_RECURRING_SCHEDULE',
    scheduleInput?: I8ScheduleCreateInput
  ): void {
    const row = db.prepare(`
      SELECT journey.namespace,journey.references_json,journey.next_action_json,
             event.event_type,event.decision,event.safe_payload_json
      FROM i10_interaction_journeys journey
      JOIN i10_interaction_events event ON event.journey_id=journey.journey_id
      WHERE journey.journey_id=? AND event.event_id=?
    `).get(input.journeyId,input.confirmedDecisionEventId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new HarnessError(409,'I10_JOURNEY_EXECUTION_BINDING_NOT_FOUND','EVIDENCE','运行或调度缺少已确认的权威旅程事件。',false,true);
    }
    const references = JSON.parse(String(row.references_json)) as Record<string, unknown>;
    const eventPayload = JSON.parse(String(row.safe_payload_json)) as Record<string, unknown>;
    const binding = eventPayload.executionBinding && typeof eventPayload.executionBinding === 'object' && !Array.isArray(eventPayload.executionBinding)
      ? eventPayload.executionBinding as Record<string, unknown>
      : undefined;
    const expected = {
      namespace: input.namespace,
      journeyId: input.journeyId,
      preparationId: input.preparationId,
      caseId: resolved.caseId,
      planId: resolved.planId,
      candidateId: resolved.candidateId
    };
    const nextAction = JSON.parse(String(row.next_action_json)) as Record<string, unknown>;
    const expectedAction = expectedDecision === 'RUN_ON_DEMAND' ? 'CALL_RUN_SUBMIT' : 'CALL_SCHEDULE_CREATE';
    const exactBinding = binding && Object.entries(expected).every(([key,value]) => binding[key] === value);
    const exactReferences = references.confirmedDecisionEventId === input.confirmedDecisionEventId &&
      references.preparationId === input.preparationId && references.caseId === resolved.caseId &&
      references.planId === resolved.planId && references.candidateId === resolved.candidateId;
    const frozenExecutionPlan = references.executionPlan && typeof references.executionPlan === 'object' &&
      !Array.isArray(references.executionPlan)
      ? references.executionPlan as Record<string, unknown>
      : undefined;
    const submittedExecutionPlan = scheduleInput
      ? scheduleInput.scheduleType === 'ONE_TIME'
        ? {
            mode:'ONE_TIME',runAt:scheduleInput.runAt,timezone:scheduleInput.timezone,
            misfirePolicy:scheduleInput.misfirePolicy,misfireGraceSeconds:scheduleInput.misfireGraceSeconds,
            maxRetries:scheduleInput.maxRetries
          }
        : {
            mode:'RECURRING',cronExpression:scheduleInput.cronExpression,timezone:scheduleInput.timezone,
            misfirePolicy:scheduleInput.misfirePolicy,misfireGraceSeconds:scheduleInput.misfireGraceSeconds,
            maxRetries:scheduleInput.maxRetries
          }
      : undefined;
    const exactExecutionPlan = !scheduleInput || Boolean(frozenExecutionPlan &&
      canonicalJson(frozenExecutionPlan) === canonicalJson(submittedExecutionPlan));
    const bindingFailure = row.namespace !== input.namespace ? 'NAMESPACE'
      : row.event_type !== 'DECISION' || row.decision !== expectedDecision ? 'EVENT'
      : nextAction.type !== expectedAction ? 'NEXT_ACTION'
      : !exactBinding ? 'EVENT_TUPLE'
      : !exactReferences ? 'JOURNEY_REFERENCES'
      : !exactExecutionPlan ? 'EXECUTION_PLAN'
      : '';
    if (bindingFailure) {
      throw new HarnessError(409,`I10_JOURNEY_EXECUTION_BINDING_${bindingFailure}`,'CONCURRENCY','运行或调度对象与已确认的旅程、准备、案例、计划或候选不一致。',false,true);
    }
    if (expectedDecision === 'RUN_ON_DEMAND') {
      const existing = db.prepare(`SELECT run_id FROM runs
        WHERE confirmed_decision_event_id=? AND origin_schedule_id IS NULL LIMIT 1`)
        .get(input.confirmedDecisionEventId) as { run_id: string } | undefined;
      if (existing) throw new HarnessError(409,'I10_JOURNEY_DECISION_ALREADY_CONSUMED','CONCURRENCY','该旅程决定已经创建过按需运行。',false,true,{runId:existing.run_id});
    } else {
      const existing = db.prepare(`SELECT schedule_id FROM schedules WHERE confirmed_decision_event_id=? LIMIT 1`)
        .get(input.confirmedDecisionEventId) as { schedule_id: string } | undefined;
      if (existing) throw new HarnessError(409,'I10_JOURNEY_DECISION_ALREADY_CONSUMED','CONCURRENCY','该旅程决定已经创建过调度。',false,true,{scheduleId:existing.schedule_id});
    }
  }

  private deriveRepairRerunDecision(
    db: import('better-sqlite3').Database,
    input: I8RunSubmitInput,
    resolved: { caseId: string; planId: string; candidateId: string }
  ): string {
    const lineage = db.prepare(`
      SELECT event.safe_payload_json,run.run_id,incident.incident_id,proposal.proposal_id
      FROM i10_interaction_events event
      JOIN runs run ON run.journey_id=event.journey_id
        AND run.confirmed_decision_event_id=event.event_id AND run.status='FAILED'
      JOIN failure_incidents incident ON incident.run_id=run.run_id AND incident.namespace=run.namespace
      JOIN i8_script_patch_proposals proposal ON proposal.incident_id=incident.incident_id
        AND proposal.namespace=run.namespace AND proposal.base_candidate_id=run.candidate_id
        AND proposal.repair_candidate_id=? AND proposal.status='ACTIVATED'
      JOIN i8_repair_decisions decision ON decision.proposal_id=proposal.proposal_id
        AND decision.namespace=run.namespace AND decision.choice='ACTIVATE' AND decision.activated_plan_id=?
      WHERE event.journey_id=? AND event.event_id=? AND event.decision='RUN_ON_DEMAND'
        AND run.namespace=? AND run.preparation_id=? AND run.case_id=?
      LIMIT 1
    `).get(
      resolved.candidateId,resolved.planId,input.journeyId,input.confirmedDecisionEventId,
      input.namespace,input.preparationId,resolved.caseId
    ) as {safe_payload_json:string;run_id:string;incident_id:string;proposal_id:string}|undefined;
    if (!lineage) return input.confirmedDecisionEventId;
    const originalPayload = JSON.parse(lineage.safe_payload_json) as Record<string,unknown>;
    const originalBinding = originalPayload.executionBinding as Record<string,unknown>|undefined;
    if (!originalBinding || originalBinding.candidateId === resolved.candidateId) return input.confirmedDecisionEventId;
    const replay = db.prepare(`SELECT event_id FROM i10_interaction_events
      WHERE journey_id=? AND decision='RUN_ON_DEMAND'
        AND json_extract(safe_payload_json,'$.repairRerunOfEventId')=?
        AND json_extract(safe_payload_json,'$.executionBinding.candidateId')=? LIMIT 1`)
      .get(input.journeyId,input.confirmedDecisionEventId,resolved.candidateId) as {event_id:string}|undefined;
    if (replay) return replay.event_id;
    const eventId = opaqueId('journeyevent');
    const now = nowIso();
    const binding = {
      namespace:input.namespace,journeyId:input.journeyId,preparationId:input.preparationId,
      caseId:resolved.caseId,planId:resolved.planId,candidateId:resolved.candidateId
    };
    const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`)
      .get(input.journeyId) as {value:number}).value)+1;
    db.prepare(`INSERT INTO i10_interaction_events(event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at)
      VALUES (?,?,?,'DECISION','FAILED_ACTIONABLE','RUNNING','RUN_ON_DEMAND',?,?,?)`)
      .run(eventId,input.journeyId,sequence,canonicalJson({
        decision:'RERUN_REPAIR',executionBinding:binding,repairRerunOfEventId:input.confirmedDecisionEventId,
        failedRunId:lineage.run_id,incidentId:lineage.incident_id,proposalId:lineage.proposal_id
      }),`repair:${lineage.proposal_id}`,now);
    const journey = db.prepare(`SELECT references_json FROM i10_interaction_journeys WHERE journey_id=? AND namespace=?`)
      .get(input.journeyId,input.namespace) as {references_json:string}|undefined;
    if (!journey) throw new HarnessError(409,'I10_JOURNEY_EXECUTION_BINDING_NOT_FOUND','EVIDENCE','修复复跑缺少权威旅程。',false,true);
    const references = JSON.parse(journey.references_json) as Record<string,unknown>;
    references.confirmedDecisionEventId=eventId;
    references.candidateId=resolved.candidateId;
    references.planId=resolved.planId;
    db.prepare(`UPDATE i10_interaction_journeys SET stage='RUNNING',status='PROCESSING',references_json=?,next_action_json=?,version=version+1,updated_at=? WHERE journey_id=?`)
      .run(canonicalJson(references),canonicalJson({type:'CALL_RUN_SUBMIT',description:'持证修复候选已批准，正在复跑。'}),now,input.journeyId);
    return eventId;
  }

  async submitI8Run(input: I8RunSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_run_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const row = db.prepare(`
        WITH activated_scripts AS (
          SELECT p.preparation_id, p.case_id, p.case_version, c.candidate_id,
                 c.status AS candidate_status, c.script_id, c.script_version,
                 c.script_sha256, d.activated_plan_id, d.created_at, 1 AS priority
          FROM i8_executable_plans p
          JOIN i8_script_candidates c ON c.executable_plan_id = p.executable_plan_id
          JOIN i8_script_delivery_decisions d ON d.candidate_id = c.candidate_id AND d.choice = 'ACTIVATE'
          WHERE p.namespace = ? AND p.preparation_id = ?
          UNION ALL
          SELECT ep.preparation_id, ep.case_id, ep.case_version, rp.repair_candidate_id,
                 'SCRIPT_VALIDATED', rp.script_id, rp.script_version,
                 rp.script_sha256, rd.activated_plan_id, rd.created_at, 2 AS priority
          FROM i8_script_patch_proposals rp
          JOIN i8_repair_decisions rd ON rd.proposal_id = rp.proposal_id AND rd.choice = 'ACTIVATE'
          JOIN i8_script_candidates base ON base.candidate_id = rp.base_candidate_id
          JOIN i8_executable_plans ep ON ep.executable_plan_id = base.executable_plan_id
          WHERE rp.namespace = ? AND ep.preparation_id = ? AND rp.status = 'ACTIVATED'
        )
        SELECT * FROM activated_scripts ORDER BY priority DESC, created_at DESC LIMIT 1
      `).get(input.namespace, input.preparationId, input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (!row || row.candidate_status !== 'SCRIPT_VALIDATED' || !row.activated_plan_id) {
        throw new HarnessError(409, 'I8_SCRIPT_NOT_ACTIVATED', 'DOMAIN', '按需运行只接受已明确激活的持证脚本。', false, true);
      }
      const plan = this.validatedPlan(db, input.namespace, String(row.activated_plan_id), String(row.case_id), Number(row.case_version));
      // RF-004-S3 (DP-S4-2=A): no injected alias means the case must carry the
      // authoritative credentialRef; otherwise fail closed. The claim response
      // passes the credentialRef through for I10 candidates (worker resolve).
      if (!input.credentialAlias && !this.caseCredentialRef(db, String(row.case_id), Number(row.case_version))) {
        throw new HarnessError(409, 'I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED', 'DOMAIN', '案例未绑定权威执行凭据，且未启用兼容凭据注入。', false, true);
      }
      const resolved = {caseId:String(row.case_id),planId:String(row.activated_plan_id),candidateId:String(row.candidate_id)};
      const effectiveDecisionEventId = Number(row.priority) === 2
        ? this.deriveRepairRerunDecision(db,input,resolved)
        : input.confirmedDecisionEventId;
      const boundInput = {...input,confirmedDecisionEventId:effectiveDecisionEventId};
      this.validatedJourneyExecutionBinding(db,boundInput,resolved,'RUN_ON_DEMAND');
      const { runId, taskId } = this.enqueueRun(db, {
        namespace: input.namespace,
        caseId: String(row.case_id),
        caseVersion: Number(row.case_version),
        planId: String(row.activated_plan_id),
        environment: 'local',
        credentialAlias: input.credentialAlias ?? null,
        journeyId: input.journeyId,
        confirmedDecisionEventId: effectiveDecisionEventId,
        preparationId: input.preparationId,
        candidateId: String(row.candidate_id)
      }, plan, timestamp);
      return {
        status: 202,
        objectType: 'RUN',
        objectId: runId,
        runId,
        taskId,
        response: {
          taskId,
          runId,
          status: 'QUEUED',
          candidateId: row.candidate_id,
          caseId: row.case_id,
          caseVersion: row.case_version,
          planId: row.activated_plan_id,
           scriptId: row.script_id,
           scriptVersion: row.script_version,
          scriptHash: row.script_sha256,
          journeyId: input.journeyId,
          confirmedDecisionEventId: effectiveDecisionEventId
        }
      };
    });
  }

  async compilePlan(caseId: string, input: PlanCompileInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'plan_compile', input.idempotencyKey, { caseId, ...input }, context, (db, timestamp) => {
      const caseRow = db.prepare(`
        SELECT current_version, status FROM cases WHERE namespace = ? AND case_id = ?
      `).get(input.namespace, caseId) as { current_version: number; status: string } | undefined;
      if (!caseRow) throw new HarnessError(404, 'CASE_NOT_FOUND', 'DOMAIN', '案例不存在。');
      if (caseRow.current_version !== input.expectedCaseVersion) {
        throw new HarnessError(409, 'CASE_VERSION_CONFLICT', 'CONCURRENCY', '案例版本已变化。', false, true, { currentVersion: caseRow.current_version });
      }
      if (caseRow.status !== 'VALIDATED') {
        throw new HarnessError(409, 'CASE_NOT_VALIDATED', 'DOMAIN', '案例尚未通过结构校验。', false, true);
      }
      const versionRow = db.prepare('SELECT definition_json FROM case_versions WHERE case_id = ? AND version = ?')
        .get(caseId, input.expectedCaseVersion) as { definition_json: string };
      const definition = JSON.parse(versionRow.definition_json) as Record<string, unknown> & {
        steps: unknown[];
        assertions: unknown[];
        authoringActions?: Array<{
          actionType: AuthoringActionType;
          prompt: string;
          targetRef: 'PAGE' | 'LOGIN_USERNAME' | 'LOGIN_SSO_TAB' | 'LOGIN_SUBMIT';
          valueRef?: string;
          riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        }>;
      };
      const planId = opaqueId('plan');
      const taskId = opaqueId('task');
      const profile = this.executionProfile(definition);
      if (!profile) {
        throw new HarnessError(409, 'EXECUTION_PROFILE_UNSUPPORTED', 'DOMAIN', '案例未映射到受支持的执行配置。', false, true);
      }
      const isDeterministic = input.executionRoute === 'PLAYWRIGHT' && profile !== undefined;
      const planStatus = isDeterministic ? 'READY' : 'AUTHORING_REQUIRED';
      const authoringActions = definition.authoringActions ?? [];
      if (planStatus === 'AUTHORING_REQUIRED' && authoringActions.length === 0) {
        throw new HarnessError(409, 'AUTHORING_ACTIONS_REQUIRED', 'DOMAIN', '作者化计划必须包含结构化原子动作。', false, true);
      }
      const scriptId = isDeterministic
        ? this.ensureValidatedScript(db, input.namespace, caseId, profile as ExecutionProfile, timestamp)
        : opaqueId('script');
      if (!isDeterministic) {
        const relativePath = SCRIPT_CATALOG[profile];
        const absolutePath = path.join(this.productRoot, ...relativePath.split('/'));
        if (!fs.existsSync(absolutePath)) {
          throw new HarnessError(409, 'CANDIDATE_SCRIPT_UNAVAILABLE', 'ENVIRONMENT', '候选脚本制品不存在。', false, true);
        }
        db.prepare(`
          INSERT INTO scripts(script_id, namespace, case_id, current_version, status, created_at, updated_at)
          VALUES (?, ?, ?, 1, 'VALIDATING', ?, ?)
        `).run(scriptId, input.namespace, caseId, timestamp, timestamp);
        db.prepare(`
          INSERT INTO script_versions(script_id, version, relative_path, sha256, validation_status, created_at)
          VALUES (?, 1, ?, ?, 'VALIDATING', ?)
        `).run(scriptId, relativePath, sha256(fs.readFileSync(absolutePath)), timestamp);
      }
      const summary = {
        executionRoute: input.executionRoute,
        executionProfile: profile ?? null,
        stepCount: definition.steps.length,
        assertionCount: definition.assertions.length,
        workerRequired: true,
        scriptStatus: isDeterministic ? 'SCRIPT_VALIDATED' : 'VALIDATING'
      };
      const fullActionPlan = planStatus === 'AUTHORING_REQUIRED'
        ? { schemaVersion: 'i4-action-plan-v1', caseId, caseVersion: input.expectedCaseVersion, actions: authoringActions }
        : null;
      const planVersionRow = db.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM plans
        WHERE namespace = ? AND case_id = ? AND case_version = ?
      `).get(input.namespace, caseId, input.expectedCaseVersion) as { next_version: number };
      const planVersion = planVersionRow.next_version;
      db.prepare(`
        INSERT INTO plans(
          plan_id, namespace, case_id, case_version, version, status, summary_json,
          content_hash, created_at, script_id, full_action_plan_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planId, input.namespace, caseId, input.expectedCaseVersion, planVersion, planStatus,
        canonicalJson(summary), sha256(canonicalJson({ summary, fullActionPlan })), timestamp,
        scriptId, fullActionPlan ? canonicalJson(fullActionPlan) : null
      );
      if (planStatus === 'READY') {
        db.prepare(`
          INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, result_summary, version, created_at, updated_at, completed_at)
          VALUES (?, ?, 'PLAN_COMPILE', 'SUCCEEDED', 100, ?, ?, 1, ?, ?, ?)
        `).run(taskId, input.namespace, caseId, `计划 ${planId} 已绑定已验证脚本。`, timestamp, timestamp, timestamp);
      } else {
        db.prepare(`
          INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, payload_json, result_summary, version, created_at, updated_at)
          VALUES (?, ?, 'SCRIPT_VALIDATE', 'QUEUED', 0, ?, ?, ?, 1, ?, ?)
        `).run(taskId, input.namespace, caseId, canonicalJson({ planId, scriptId, mode: 'MIDSCENE_AUTHORING' }), '等待 Midscene 原子动作作者化。', timestamp, timestamp);
        db.prepare(`
          INSERT INTO action_plans(plan_id, task_id, script_id, cursor_ordinal, status, version, created_at, updated_at)
          VALUES (?, ?, ?, 1, 'QUEUED', 1, ?, ?)
        `).run(planId, taskId, scriptId, timestamp, timestamp);
        const insertAction = db.prepare(`
          INSERT INTO action_plan_items(
            action_id, plan_id, ordinal, action_type, prompt, target_ref, value_ref, risk_level, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `);
        authoringActions.forEach((action, index) => insertAction.run(
          opaqueId('action'), planId, index + 1, action.actionType, action.prompt, action.targetRef,
          action.valueRef ?? null, action.riskLevel, timestamp, timestamp
        ));
      }
      return {
        status: 200,
        objectType: 'PLAN',
        objectId: planId,
        taskId,
        response: {
          taskId,
          planId,
          scriptId,
          status: planStatus === 'READY' ? 'SUCCEEDED' : 'QUEUED',
          planStatus,
          caseId,
          caseVersion: input.expectedCaseVersion,
          planVersion
        }
      };
    });
  }

  async submitRun(input: RunSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'run_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const plan = this.validatedPlan(db, input.namespace, input.planId, input.caseId, input.expectedCaseVersion);
      const { runId, taskId } = this.enqueueRun(db, {
        namespace: input.namespace, caseId: input.caseId, caseVersion: input.expectedCaseVersion,
        planId: input.planId, environment: input.environment, credentialAlias: input.credentialAlias
      }, plan, timestamp);
      return {
        status: 200,
        objectType: 'RUN',
        objectId: runId,
        runId,
        taskId,
        response: { taskId, runId, status: 'QUEUED', namespace: input.namespace, caseId: input.caseId }
      };
    });
  }

  async createI8Schedule(input: I8ScheduleCreateInput, context: RequestContext): Promise<IdempotentResult> {
    try {
      validateTimeZone(input.timezone);
      if (input.scheduleType === 'RECURRING') parseCron(String(input.cronExpression));
    } catch (error) {
      throw new HarnessError(400, String((error as Error).message), 'CONTRACT', '规范化调度时间或 IANA 时区无效。');
    }
    return this.idempotent(input.namespace, 'i8_schedule_create', input.idempotencyKey, input, context, (db, timestamp) => {
      if (input.scheduleType === 'ONE_TIME' && new Date(String(input.runAt)).getTime() <= new Date(timestamp).getTime()) {
        throw new HarnessError(409, 'ONE_TIME_RUN_AT_NOT_FUTURE', 'DOMAIN', '一次性运行时间必须晚于当前时间。', false, true);
      }
      const confirmed = db.prepare('SELECT schedule_id FROM schedules WHERE namespace = ? AND confirmation_ref = ?')
        .get(input.namespace, input.confirmationRef) as { schedule_id: string } | undefined;
      if (confirmed) {
        throw new HarnessError(409, 'I8_SCHEDULE_CONFIRMATION_ALREADY_USED', 'CONCURRENCY', '该人工确认已创建过调度。', false, true, { scheduleId: confirmed.schedule_id });
      }
      const row = db.prepare(`
        WITH activated_scripts AS (
          SELECT p.preparation_id, p.case_id, p.case_version, c.candidate_id,
                 c.status AS candidate_status, c.script_id, c.script_version,
                 c.script_sha256, d.activated_plan_id, d.created_at, 1 AS priority
          FROM i8_executable_plans p
          JOIN i8_script_candidates c ON c.executable_plan_id = p.executable_plan_id
          JOIN i8_script_delivery_decisions d ON d.candidate_id = c.candidate_id AND d.choice = 'ACTIVATE'
          WHERE p.namespace = ? AND p.preparation_id = ?
          UNION ALL
          SELECT ep.preparation_id, ep.case_id, ep.case_version, rp.repair_candidate_id,
                 'SCRIPT_VALIDATED', rp.script_id, rp.script_version,
                 rp.script_sha256, rd.activated_plan_id, rd.created_at, 2 AS priority
          FROM i8_script_patch_proposals rp
          JOIN i8_repair_decisions rd ON rd.proposal_id = rp.proposal_id AND rd.choice = 'ACTIVATE'
          JOIN i8_script_candidates base ON base.candidate_id = rp.base_candidate_id
          JOIN i8_executable_plans ep ON ep.executable_plan_id = base.executable_plan_id
          WHERE rp.namespace = ? AND ep.preparation_id = ? AND rp.status = 'ACTIVATED'
        )
        SELECT * FROM activated_scripts ORDER BY priority DESC, created_at DESC LIMIT 1
      `).get(input.namespace, input.preparationId, input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (!row || row.candidate_status !== 'SCRIPT_VALIDATED' || !row.activated_plan_id) {
        throw new HarnessError(409, 'I8_SCRIPT_NOT_ACTIVATED', 'DOMAIN', '调度只接受已明确激活的持证脚本。', false, true);
      }
      const plan = this.validatedPlan(db, input.namespace, String(row.activated_plan_id), String(row.case_id), Number(row.case_version));
      if (plan.script_id !== row.script_id || plan.script_version !== Number(row.script_version) || plan.script_sha256 !== row.script_sha256) {
        throw new HarnessError(409, 'I8_ACTIVATED_SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '当前正式计划与已确认脚本版本不一致。', false, true);
      }
      // RF-004-S3 (DP-S4-2=A): no injected alias -> the case must carry the
      // authoritative credentialRef; the NOT NULL schedules column receives a
      // traceable hash placeholder (never the credential itself). Actual
      // execution credentials flow via the claim credentialRef pass-through.
      const scheduleCredentialAlias = input.credentialAlias
        ?? (this.caseCredentialRef(db, String(row.case_id), Number(row.case_version))
          ? `credref:${sha256(this.caseCredentialRef(db, String(row.case_id), Number(row.case_version))).slice(0, 12)}`
          : (() => { throw new HarnessError(409, 'I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED', 'DOMAIN', '案例未绑定权威执行凭据，且未启用兼容凭据注入。', false, true) })());
      this.validatedJourneyExecutionBinding(db,input,{
        caseId:String(row.case_id),planId:String(row.activated_plan_id),candidateId:String(row.candidate_id)
      },input.scheduleType === 'ONE_TIME' ? 'CREATE_ONE_TIME_SCHEDULE' : 'CREATE_RECURRING_SCHEDULE',input);
      const scheduleId = opaqueId('schedule');
      const nextFireAt = input.scheduleType === 'RECURRING'
        ? nextCronOccurrence(String(input.cronExpression), input.timezone, new Date(timestamp)).toISOString()
        : new Date(String(input.runAt)).toISOString();
      const fixtureScope = `i8:${input.preparationId}`;
      db.prepare(`
        INSERT INTO schedules(
          schedule_id, namespace, case_id, case_version, plan_id, credential_alias,
          cron_expression, timezone, environment, fixture_scope, misfire_policy,
          misfire_grace_seconds, max_retries, status, next_fire_at, version, created_at, updated_at,
          schedule_type, run_at, script_id, script_version, script_sha256, one_time_state, confirmation_ref,
          misfire_semantics, deadline_at, journey_id, confirmed_decision_event_id, preparation_id, candidate_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?, ?, 'ACTIVE', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        scheduleId, input.namespace, row.case_id, row.case_version, row.activated_plan_id,
        scheduleCredentialAlias, input.cronExpression ?? '0 0 1 1 *', input.timezone, fixtureScope,
        input.misfirePolicy === 'RUN_ONCE_WITHIN_GRACE' ? 'RUN_ONCE' : input.misfirePolicy,
        input.misfireGraceSeconds, input.maxRetries, nextFireAt, timestamp, timestamp,
        input.scheduleType, input.runAt ? new Date(input.runAt).toISOString() : null,
        row.script_id, row.script_version, row.script_sha256,
        input.scheduleType === 'ONE_TIME' ? 'PENDING' : null, input.confirmationRef,
        input.misfirePolicy,
        input.scheduleType === 'ONE_TIME'
          ? new Date(new Date(String(input.runAt)).getTime() + input.misfireGraceSeconds * 1000).toISOString()
          : null,
        input.journeyId,input.confirmedDecisionEventId,input.preparationId,String(row.candidate_id)
      );
      return {
        status: 201,
        objectType: 'SCHEDULE',
        objectId: scheduleId,
        response: {
          scheduleId, status: 'ACTIVE', version: 1, scheduleType: input.scheduleType, timezone: input.timezone,
          ...(input.scheduleType === 'RECURRING' ? { cronExpression: input.cronExpression } : { runAt: new Date(String(input.runAt)).toISOString() }),
          nextFireAt, caseId: row.case_id, caseVersion: row.case_version, planId: row.activated_plan_id,
           scriptId: row.script_id, scriptVersion: row.script_version, scriptHash: row.script_sha256,
           misfirePolicy: input.misfirePolicy, misfireGraceSeconds: input.misfireGraceSeconds,
          maxRetries: input.maxRetries, confirmationRef: input.confirmationRef,
          journeyId: input.journeyId, confirmedDecisionEventId: input.confirmedDecisionEventId
        }
      };
    });
  }

  async listI8ResultInbox(input: I8ResultInboxListInput): Promise<Record<string, unknown>> {
    return this.database.read(db => {
      const cursor = input.cursor ? Number(input.cursor.slice(4)) : Number.MAX_SAFE_INTEGER;
      const rows = db.prepare(`
        SELECT * FROM result_inbox_items
        WHERE namespace = ? AND sequence < ? ${input.unreadOnly ? "AND delivery_status = 'UNREAD'" : ''}
        ORDER BY sequence DESC LIMIT ?
      `).all(input.namespace, cursor, input.limit + 1) as Array<Record<string, unknown>>;
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(row => ({
          inboxId: row.inbox_id,
          itemHash: sha256(JSON.stringify({ inboxId: row.inbox_id, status: row.delivery_status, readAt: row.read_at, createdAt: row.created_at })),
          runId: row.run_id, taskId: row.task_id,
          ...(row.schedule_id ? { scheduleId: row.schedule_id, scheduleType: row.schedule_type } : { executionMode: 'ON_DEMAND' }),
          caseId: row.case_id, caseVersion: row.case_version, planId: row.plan_id,
          scriptId: row.script_id, scriptVersion: row.script_version, outcome: row.outcome,
          summary: row.summary, artifact: JSON.parse(String(row.artifact_metadata_json)),
          status: row.delivery_status, readAt: row.read_at, createdAt: row.created_at
        })),
        ...(rows.length > input.limit && page.length > 0 ? { nextCursor: `seq:${page[page.length - 1]?.sequence}` } : {}),
        unreadCount: (db.prepare("SELECT COUNT(*) count FROM result_inbox_items WHERE namespace = ? AND delivery_status = 'UNREAD'")
          .get(input.namespace) as { count: number }).count
      };
    });
  }

  async ackI8ResultInbox(input: I8ResultInboxAckInput, context: RequestContext): Promise<IdempotentResult> {
    const items = [...input.items].sort((left, right) => left.inboxId.localeCompare(right.inboxId));
    if (new Set(items.map(item => item.inboxId)).size !== items.length) throw new HarnessError(400, 'I8_RESULT_INBOX_ACK_DUPLICATE', 'CONTRACT', '收件箱确认目标不能重复。');
    return this.idempotent(input.namespace, 'i8_result_inbox_ack', input.idempotencyKey, { ...input, items }, context, (db, timestamp) => {
      for (const item of items) {
        const row = db.prepare(`SELECT inbox_id,delivery_status,read_at,created_at FROM result_inbox_items WHERE namespace=? AND inbox_id=?`)
          .get(input.namespace, item.inboxId) as { inbox_id: string; delivery_status: string; read_at: string | null; created_at: string } | undefined;
        if (!row) throw new HarnessError(404, 'I8_RESULT_INBOX_ITEM_NOT_FOUND', 'DOMAIN', '收件箱条目不存在。');
        const actualHash = sha256(JSON.stringify({ inboxId: row.inbox_id, status: row.delivery_status, readAt: row.read_at, createdAt: row.created_at }));
        if (actualHash !== item.expectedItemHash) throw new HarnessError(409, 'I8_RESULT_INBOX_ITEM_HASH_CONFLICT', 'CONTRACT', '收件箱条目已变化。', false, true);
      }
      const ids = items.map(item => item.inboxId);
      const placeholders = ids.map(() => '?').join(',');
      const acknowledgedCount = db.prepare(`UPDATE result_inbox_items SET delivery_status = 'READ', read_at = ?
        WHERE namespace = ? AND inbox_id IN (${placeholders}) AND delivery_status = 'UNREAD'`)
        .run(timestamp, input.namespace, ...ids).changes;
      return {
        status: 200,
        objectType: 'RESULT_INBOX_ACK',
        objectId: input.idempotencyKey,
        response: { acknowledgedInboxIds: ids, acknowledgedCount }
      };
    });
  }

  async createSchedule(input: ScheduleCreateInput, context: RequestContext): Promise<IdempotentResult> {
    try {
      parseCron(input.cronExpression);
      validateTimeZone(input.timezone);
    } catch (error) {
      throw new HarnessError(400, String((error as Error).message), 'CONTRACT', 'Cron 表达式或 IANA 时区无效。');
    }
    return this.idempotent(input.namespace, 'schedule_create', input.idempotencyKey, input, context, (db, timestamp) => {
      const plan = this.validatedPlan(db, input.namespace, input.planId, input.caseId, input.expectedCaseVersion);
      const scheduleId = opaqueId('schedule');
      const nextFireAt = nextCronOccurrence(input.cronExpression, input.timezone, new Date(timestamp)).toISOString();
      db.prepare(`
        INSERT INTO schedules(
          schedule_id, namespace, case_id, case_version, plan_id, credential_alias,
          cron_expression, timezone, environment, fixture_scope, misfire_policy,
          misfire_grace_seconds, max_retries, status, next_fire_at, version, created_at, updated_at,
          schedule_type, script_id, script_version, script_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 1, ?, ?, 'RECURRING', ?, ?, ?)
      `).run(
        scheduleId, input.namespace, input.caseId, input.expectedCaseVersion, input.planId,
        input.credentialAlias, input.cronExpression, input.timezone, input.environment,
        input.fixtureScope, input.misfirePolicy, input.misfireGraceSeconds, input.maxRetries,
        nextFireAt, timestamp, timestamp, plan.script_id, plan.script_version, plan.script_sha256
      );
      return {
        status: 200, objectType: 'SCHEDULE', objectId: scheduleId,
        response: { scheduleId, status: 'ACTIVE', version: 1, nextFireAt, cronExpression: input.cronExpression, timezone: input.timezone }
      };
    });
  }

  getSchedule(namespace: string, scheduleId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM schedule_executions e WHERE e.schedule_id = s.schedule_id) AS execution_count,
          (SELECT status FROM schedule_executions e WHERE e.schedule_id = s.schedule_id ORDER BY scheduled_for DESC LIMIT 1) AS last_execution_status
        FROM schedules s WHERE s.namespace = ? AND s.schedule_id = ?
      `).get(namespace, scheduleId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'SCHEDULE_NOT_FOUND', 'DOMAIN', '调度不存在。');
      return {
        scheduleId: row.schedule_id, caseId: row.case_id, caseVersion: row.case_version, planId: row.plan_id,
        cronExpression: row.cron_expression, timezone: row.timezone, environment: row.environment,
        fixtureScope: row.fixture_scope, misfirePolicy: row.misfire_semantics ?? row.misfire_policy,
        misfireGraceSeconds: row.misfire_grace_seconds, maxRetries: row.max_retries,
        status: row.status, nextFireAt: row.next_fire_at, lastEvaluatedAt: row.last_evaluated_at,
        pausedIncidentId: row.paused_incident_id, executionCount: row.execution_count,
        lastExecutionStatus: row.last_execution_status, version: row.version, updatedAt: row.updated_at
      };
    });
  }

  getI8Schedule(namespace: string, scheduleId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM schedule_executions e WHERE e.schedule_id = s.schedule_id) AS execution_count,
          (SELECT status FROM schedule_executions e WHERE e.schedule_id = s.schedule_id ORDER BY scheduled_for DESC LIMIT 1) AS last_execution_status
        FROM schedules s WHERE s.namespace = ? AND s.schedule_id = ?
      `).get(namespace, scheduleId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'SCHEDULE_NOT_FOUND', 'DOMAIN', '调度不存在。');
      return {
        scheduleId: row.schedule_id, scheduleType: row.schedule_type,
        caseId: row.case_id, caseVersion: row.case_version, planId: row.plan_id,
        scriptId: row.script_id, scriptVersion: row.script_version, scriptHash: row.script_sha256,
        ...(row.schedule_type === 'ONE_TIME' ? { runAt: row.run_at } : { cronExpression: row.cron_expression }),
        timezone: row.timezone, environment: row.environment, fixtureScope: row.fixture_scope,
        misfirePolicy: row.misfire_semantics ?? row.misfire_policy, misfireGraceSeconds: row.misfire_grace_seconds,
        maxRetries: row.max_retries, status: row.status, oneTimeState: row.one_time_state,
        completedAt: row.completed_at, nextFireAt: row.next_fire_at, deadlineAt: row.deadline_at,
        deferredState: row.deferred_state, deferredReasonCode: row.deferred_reason_code, deferredAt: row.deferred_at,
        lastEvaluatedAt: row.last_evaluated_at, pausedIncidentId: row.paused_incident_id,
        executionCount: row.execution_count, lastExecutionStatus: row.last_execution_status,
        version: row.version, updatedAt: row.updated_at
      };
    });
  }

  async disableSchedule(input: ScheduleDisableInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'schedule_disable', input.idempotencyKey, input, context, (db, timestamp) => {
      const row = db.prepare('SELECT version, status FROM schedules WHERE namespace = ? AND schedule_id = ?')
        .get(input.namespace, input.scheduleId) as { version: number; status: string } | undefined;
      if (!row) throw new HarnessError(404, 'SCHEDULE_NOT_FOUND', 'DOMAIN', '调度不存在。');
      if (row.version !== input.expectedVersion) throw new HarnessError(409, 'TARGET_VERSION_CONFLICT', 'CONCURRENCY', '调度版本已变化。', false, true, { currentVersion: row.version });
      if (row.status !== 'DISABLED') db.prepare(`UPDATE schedules SET status = 'DISABLED', version = version + 1, updated_at = ? WHERE schedule_id = ?`)
        .run(timestamp, input.scheduleId);
      return { status: 200, objectType: 'SCHEDULE', objectId: input.scheduleId,
        response: { scheduleId: input.scheduleId, status: 'DISABLED', version: row.status === 'DISABLED' ? row.version : row.version + 1, reason: input.reason } };
    });
  }

  async tickSchedules(now = new Date()): Promise<Record<string, number>> {
    return this.database.write(db => {
      const due = db.prepare(`SELECT * FROM schedules WHERE status = 'ACTIVE' AND next_fire_at <= ? ORDER BY next_fire_at`)
        .all(now.toISOString()) as Array<Record<string, unknown>>;
      const counters = { evaluated: due.length, queued: 0, skippedMisfire: 0, skippedMutex: 0 };
      for (const schedule of due) {
        const oneTime = schedule.schedule_type === 'ONE_TIME';
        const occurrences: Date[] = oneTime ? [new Date(String(schedule.next_fire_at))] : [];
        let occurrence = new Date(String(schedule.next_fire_at));
        while (!oneTime && occurrence <= now && occurrences.length < 600_000) {
          occurrences.push(occurrence);
          occurrence = nextCronOccurrence(String(schedule.cron_expression), String(schedule.timezone), occurrence);
        }
        const effectiveMisfirePolicy = String(schedule.misfire_semantics ?? schedule.misfire_policy);
        const runOnceIndex = effectiveMisfirePolicy === 'RUN_ONCE' ? occurrences.length - 1 : -1;
        occurrences.forEach((scheduledFor, index) => {
          const scheduledIso = scheduledFor.toISOString();
          const existing = db.prepare('SELECT execution_id FROM schedule_executions WHERE schedule_id = ? AND scheduled_for = ?')
            .get(schedule.schedule_id, scheduledIso) as { execution_id: string } | undefined;
          if (existing) return;
          const lateSeconds = Math.max(0, (now.getTime() - scheduledFor.getTime()) / 1000);
          const misfired = lateSeconds > Number(schedule.misfire_grace_seconds);
          const oneTimeGraceExpired = oneTime && (effectiveMisfirePolicy === 'RUN_ONCE_WITHIN_GRACE' || effectiveMisfirePolicy === 'SKIP')
            && (schedule.deadline_at ? now.toISOString() > String(schedule.deadline_at) : misfired);
          if (oneTimeGraceExpired || (misfired && (effectiveMisfirePolicy === 'SKIP' || index !== runOnceIndex))) {
            db.prepare(`INSERT INTO schedule_executions(execution_id, schedule_id, namespace, scheduled_for, status, reason_code, created_at, updated_at, completed_at)
              VALUES (?, ?, ?, ?, 'SKIPPED_MISFIRE', 'MISFIRE_POLICY', ?, ?, ?)`)
              .run(opaqueId('execution'), schedule.schedule_id, schedule.namespace, scheduledIso, now.toISOString(), now.toISOString(), now.toISOString());
            counters.skippedMisfire += 1;
            if (oneTime) {
              db.prepare(`UPDATE schedules SET status = 'DISABLED', one_time_state = 'SKIPPED',
                last_evaluated_at = ?, completed_at = ?, version = version + 1, updated_at = ? WHERE schedule_id = ?`)
                .run(now.toISOString(), now.toISOString(), now.toISOString(), schedule.schedule_id);
            }
            return;
          }
          const locked = db.prepare(`SELECT run_id FROM runs WHERE environment = ? AND fixture_scope = ? AND status IN ('QUEUED', 'RUNNING') LIMIT 1`)
            .get(schedule.environment, schedule.fixture_scope) as { run_id: string } | undefined;
          if (locked) {
            if (oneTime) {
              db.prepare(`UPDATE schedules SET deferred_state = 'WAITING_MUTEX',
                deferred_reason_code = 'ENVIRONMENT_FIXTURE_SCOPE_BUSY', deferred_at = ?,
                last_evaluated_at = ?, updated_at = ? WHERE schedule_id = ? AND status = 'ACTIVE'`)
                .run(now.toISOString(), now.toISOString(), now.toISOString(), schedule.schedule_id);
              counters.skippedMutex += 1;
              return;
            }
            db.prepare(`INSERT INTO schedule_executions(execution_id, schedule_id, namespace, scheduled_for, status, reason_code, created_at, updated_at, completed_at)
              VALUES (?, ?, ?, ?, 'SKIPPED_MUTEX', 'ENVIRONMENT_FIXTURE_SCOPE_BUSY', ?, ?, ?)`)
              .run(opaqueId('execution'), schedule.schedule_id, schedule.namespace, scheduledIso, now.toISOString(), now.toISOString(), now.toISOString());
            counters.skippedMutex += 1;
            return;
          }
          const executionId = opaqueId('execution');
          db.prepare(`INSERT INTO schedule_executions(execution_id, schedule_id, namespace, scheduled_for, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`)
            .run(executionId, schedule.schedule_id, schedule.namespace, scheduledIso, now.toISOString(), now.toISOString());
          const plan = this.validatedScheduledPlan(db, schedule);
          const run = this.enqueueRun(db, {
            namespace: String(schedule.namespace), caseId: String(schedule.case_id), caseVersion: Number(schedule.case_version),
            planId: String(schedule.plan_id), environment: 'local', credentialAlias: String(schedule.credential_alias),
            fixtureScope: String(schedule.fixture_scope), scheduleId: String(schedule.schedule_id), scheduleExecutionId: executionId,
            ...(schedule.journey_id ? {
              journeyId:String(schedule.journey_id),
              confirmedDecisionEventId:String(schedule.confirmed_decision_event_id),
              preparationId:String(schedule.preparation_id),
              candidateId:String(schedule.candidate_id)
            } : {})
          }, plan, now.toISOString());
          db.prepare(`UPDATE schedule_executions SET status = 'QUEUED', run_id = ?, task_id = ?, updated_at = ? WHERE execution_id = ?`)
            .run(run.runId, run.taskId, now.toISOString(), executionId);
          if (oneTime) {
            db.prepare(`UPDATE schedules SET one_time_state = 'RUNNING', next_fire_at = '9999-12-31T23:59:59.999Z',
              deferred_state = NULL, deferred_reason_code = NULL, deferred_at = NULL,
              last_evaluated_at = ?, version = version + 1, updated_at = ? WHERE schedule_id = ?`)
              .run(now.toISOString(), now.toISOString(), schedule.schedule_id);
          }
          counters.queued += 1;
        });
        if (!oneTime) {
          db.prepare(`UPDATE schedules SET next_fire_at = ?, last_evaluated_at = ?, updated_at = ? WHERE schedule_id = ?`)
            .run(occurrence.toISOString(), now.toISOString(), now.toISOString(), schedule.schedule_id);
        }
      }
      return counters;
    });
  }

  async claimNextRun(workerId: string, leaseSeconds = 300): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      // Losing a zero-retry scheduled lease leaves the business outcome unknown.
      // Preserve the original execution for human reconciliation, never requeue it.
      const stoppedRuns = db.prepare(`
        SELECT t.task_id, t.namespace, t.run_id, r.case_id, r.case_version, r.plan_id,
          r.origin_schedule_id, r.schedule_execution_id, s.schedule_type, s.script_id, s.script_version
        FROM tasks t JOIN runs r ON r.task_id=t.task_id
        JOIN schedules s ON s.schedule_id=r.origin_schedule_id
        WHERE t.task_type='RUN_EXECUTE' AND t.status='RUNNING'
          AND t.lease_expires_at IS NOT NULL AND t.lease_expires_at<=? AND s.max_retries=0
      `).all(timestamp) as Array<{
        task_id: string; namespace: string; run_id: string; case_id: string; case_version: number;
        plan_id: string; origin_schedule_id: string; schedule_execution_id: string;
        schedule_type: string; script_id: string; script_version: number;
      }>;
      for (const run of stoppedRuns) {
        const reasonCode = 'SCHEDULE_RUN_LEASE_EXPIRED';
        const summary = 'Worker 租约过期，业务结果未知；禁止自动重执行，请人工核对原运行及业务状态。';
        const incidentId = opaqueId('incident');
        const artifactRefs = db.prepare('SELECT artifact_id FROM artifacts WHERE run_id=?')
          .all(run.run_id).map(row => String((row as { artifact_id: string }).artifact_id));
        db.prepare(`UPDATE tasks SET status='FAILED', result_summary=?, error_code=?,
          error_category='ENVIRONMENT', retryable=0, user_action_required=1,
          lease_owner=NULL, lease_expires_at=NULL, version=version+1, updated_at=?, completed_at=?
          WHERE task_id=?`).run(summary, reasonCode, timestamp, timestamp, run.task_id);
        db.prepare("UPDATE runs SET status='BLOCKED', version=version+1, completed_at=? WHERE run_id=?")
          .run(timestamp, run.run_id);
        db.prepare(`UPDATE schedule_executions SET status='FAILED', reason_code=?, updated_at=?, completed_at=?
          WHERE execution_id=?`).run(reasonCode, timestamp, timestamp, run.schedule_execution_id);
        db.prepare(`INSERT INTO failure_incidents(incident_id,namespace,run_id,case_id,script_id,script_version,
          classification,reason_code,summary,diagnostic_status,version,created_at,updated_at)
          VALUES (?,?,?,?,?,?,'ENVIRONMENT',?,?,'CLASSIFIED',1,?,?)`)
          .run(incidentId, run.namespace, run.run_id, run.case_id, run.script_id, run.script_version,
            reasonCode, summary, timestamp, timestamp);
        const envelopeJson = canonicalJson({
          schemaVersion: 'i8-step-failure-envelope-v1', stage: 'FORMAL_RUN',
          object: { runId: run.run_id, taskId: run.task_id, caseId: run.case_id, caseVersion: run.case_version,
            scriptId: run.script_id, scriptVersion: run.script_version },
          errorCode: reasonCode, classification: 'ENVIRONMENT',
          inputSummary: { environment: 'local', originScheduleId: run.origin_schedule_id },
          outputSummary: { outcome: 'BLOCKED', resultArtifactId: null, humanInterventionRequired: true },
          artifactRefs, allowedRepairScope: 'REPORT_ONLY', contextLevel: 'CTX-L1',
          attemptCount: 0, maxAttempts: 3, redactionProfileId: 'HENGZHUN_FAILURE_REDACTION_V1'
        });
        db.prepare(`INSERT INTO i8_failure_incidents(incident_id,namespace,classification,disposition,status,created_at,updated_at)
          VALUES (?,?,'ENVIRONMENT','REPORT_ONLY','FAILURE_CLASSIFIED',?,?)`)
          .run(incidentId, run.namespace, timestamp, timestamp);
        db.prepare(`INSERT INTO i8_step_failure_envelopes(envelope_id,namespace,incident_id,stage,context_level,
          envelope_json,envelope_hash,attempt_count,max_attempts,created_at,updated_at)
          VALUES (?,?,?,'FORMAL_RUN','CTX-L1',?,?,0,3,?,?)`)
          .run(opaqueId('failureenv'), run.namespace, incidentId, envelopeJson, sha256(envelopeJson), timestamp, timestamp);
        if (run.schedule_type === 'ONE_TIME') {
          db.prepare(`UPDATE schedules SET status='DISABLED', one_time_state='FAILED', paused_incident_id=?,
            completed_at=?, version=version+1, updated_at=? WHERE schedule_id=?`)
            .run(incidentId, timestamp, timestamp, run.origin_schedule_id);
        } else {
          db.prepare(`UPDATE schedules SET status='PAUSED_FAILURE', paused_incident_id=?,
            version=version+1, updated_at=? WHERE schedule_id=? AND status='ACTIVE'`)
            .run(incidentId, timestamp, run.origin_schedule_id);
        }
        db.prepare(`INSERT OR IGNORE INTO result_inbox_items(inbox_id,namespace,run_id,task_id,schedule_id,
          schedule_type,case_id,case_version,plan_id,script_id,script_version,outcome,summary,
          artifact_metadata_json,delivery_status,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,'BLOCKED',?,?,'UNREAD',?)`)
          .run(opaqueId('inbox'), run.namespace, run.run_id, run.task_id, run.origin_schedule_id,
            run.schedule_type, run.case_id, run.case_version, run.plan_id, run.script_id, run.script_version,
            summary, canonicalJson({ available: false }), timestamp);
        db.prepare(`INSERT INTO audit_events(event_id,namespace,run_id,task_id,actor_type,action,
          object_type,object_id,outcome,correlation_id,details_json,created_at)
          VALUES (?,?,?,?,'SYSTEM','run.lease_expired','RUN',?,'FAILED',?,?,?)`)
          .run(opaqueId('evt'), run.namespace, run.run_id, run.task_id, run.run_id, opaqueId('lease'),
            canonicalJson({ reasonCode, incidentId, automaticRetry: false }), timestamp);
      }
      const expiredRuns = db.prepare(`
        SELECT DISTINCT run_id FROM tasks
        WHERE task_type = 'RUN_EXECUTE' AND status = 'RUNNING'
          AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
      `).all(timestamp).map(row => String((row as { run_id: string }).run_id));
      db.prepare(`
        UPDATE tasks
        SET status = 'QUEUED', progress = 0, lease_owner = NULL, lease_expires_at = NULL,
            version = version + 1, updated_at = ?
        WHERE task_type = 'RUN_EXECUTE' AND status = 'RUNNING'
          AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
      `).run(timestamp, timestamp);
      db.prepare(`
        UPDATE runs SET status = 'QUEUED', version = version + 1
        WHERE run_id IN (SELECT value FROM json_each(?))
          AND status = 'RUNNING'
      `).run(JSON.stringify(expiredRuns));
      db.prepare(`
        UPDATE schedule_executions SET status = 'RETRY_QUEUED', updated_at = ?
        WHERE run_id IN (SELECT value FROM json_each(?)) AND status = 'RUNNING'
      `).run(timestamp, JSON.stringify(expiredRuns));

      const row = db.prepare(`
        SELECT t.task_id, t.namespace, t.case_id, t.run_id, t.payload_json,
               r.case_version, r.plan_id, cv.definition_json,
               candidate.manifest_json AS candidate_manifest_json
        FROM tasks t
        JOIN runs r ON r.task_id = t.task_id
        JOIN case_versions cv ON cv.case_id = r.case_id AND cv.version = r.case_version
        LEFT JOIN i8_script_candidates candidate
          ON candidate.candidate_id = json_extract(t.payload_json, '$.candidate.candidateId')
        WHERE t.task_type = 'RUN_EXECUTE' AND t.status = 'QUEUED'
        ORDER BY t.created_at ASC
        LIMIT 1
      `).get() as {
        task_id: string; namespace: string; case_id: string; run_id: string;
        payload_json: string; case_version: number; plan_id: string; definition_json: string;
        candidate_manifest_json: string | null;
      } | undefined;
      if (!row) return { status: 'EMPTY' };

      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      db.prepare(`
        UPDATE tasks SET status = 'RUNNING', progress = 10, lease_owner = ?, lease_expires_at = ?,
            attempt_count = attempt_count + 1, version = version + 1, updated_at = ?
        WHERE task_id = ? AND status = 'QUEUED'
      `).run(workerId, leaseExpiresAt, timestamp, row.task_id);
      const lease = db.prepare(`SELECT version FROM tasks WHERE task_id = ? AND status = 'RUNNING' AND lease_owner = ?`)
        .get(row.task_id, workerId) as { version: number } | undefined;
      if (!lease) throw new HarnessError(409, 'WORKER_CLAIM_CONFLICT', 'CONCURRENCY', 'Worker 任务已被其他执行器领取。', false, true);
      db.prepare(`
        UPDATE runs SET status = 'RUNNING', version = version + 1,
            started_at = COALESCE(started_at, ?) WHERE run_id = ?
      `).run(timestamp, row.run_id);
      db.prepare(`
        UPDATE schedule_executions SET status = 'RUNNING', updated_at = ?
        WHERE execution_id = (SELECT schedule_execution_id FROM runs WHERE run_id = ?)
          AND status IN ('QUEUED', 'RETRY_QUEUED')
      `).run(timestamp, row.run_id);
      db.prepare(`
        INSERT INTO audit_events(
          event_id, namespace, run_id, task_id, actor_type, action, object_type,
          object_id, outcome, correlation_id, details_json, created_at
        ) VALUES (?, ?, ?, ?, 'WORKER', 'run.claim', 'RUN', ?, 'ACCEPTED', ?, ?, ?)
      `).run(opaqueId('evt'), row.namespace, row.run_id, row.task_id, row.run_id,
        opaqueId('worker'), JSON.stringify({ workerId, leaseExpiresAt }), timestamp);
      const definition = JSON.parse(row.definition_json) as Record<string, unknown>;
      const execution = JSON.parse(row.payload_json) as Record<string, unknown>;
      // A CaseDraft is frozen before TargetProfile confirmation, so its
      // definition intentionally does not carry the later profile binding.
      // The candidate manifest is the immutable execution artifact and is the
      // authoritative place to recover that exact confirmed profile at run
      // claim time.  Falling back to the case definition keeps legacy cases
      // compatible without widening any origin allow-list.
      let candidateTargetProfileId: string | undefined;
      try {
        const manifest = row.candidate_manifest_json ? JSON.parse(row.candidate_manifest_json) as Record<string, unknown> : undefined;
        if (typeof manifest?.targetProfileId === 'string') candidateTargetProfileId = manifest.targetProfileId;
      } catch {
        // A malformed candidate manifest must not grant a target profile. The
        // formal runner will fail closed using the ordinary entry-url rules.
      }
      const isI10Candidate = Boolean(execution.candidate)
        && typeof definition.credentialRef === 'string'
        && typeof definition.entryUrl === 'string';
      const targetProfileId = typeof definition.targetProfileId === 'string'
        ? definition.targetProfileId
        : candidateTargetProfileId;
      const targetProfile = typeof targetProfileId === 'string'
        ? db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=? AND status='ACTIVE'`)
          .get(row.namespace, targetProfileId) as {
            target_profile_id: string; version: number; profile_hash: string; launch_url: string;
            allowed_navigation_origins_json: string; allowed_interaction_origins_json: string;
            credential_origins_json: string; tls_policy: string; network_mode: string; status: string;
            resolved_addresses_json: string; adapter_binding_json: string;
          } | undefined
        : undefined;
      let parsedAdapterBinding: Record<string, unknown> | null = null;
      if (targetProfile) {
        try {
          const candidate = JSON.parse(targetProfile.adapter_binding_json || 'null') as unknown;
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            const binding = candidate as Record<string, unknown>;
            if (typeof binding.adapterId === 'string' && typeof binding.adapterVersion === 'string'
              && typeof binding.manifestHash === 'string') parsedAdapterBinding = binding;
          }
        } catch {
          // Malformed metadata cannot grant adapter-only network origins.
        }
      }
      return {
        status: 'CLAIMED',
        taskId: row.task_id,
        runId: row.run_id,
        namespace: row.namespace,
        caseId: row.case_id,
        caseVersion: row.case_version,
        planId: row.plan_id,
        definition,
        execution: {
          ...execution,
          ...(isI10Candidate ? {
            credentialRef: definition.credentialRef,
            entryUrl: definition.entryUrl,
            ...(targetProfile ? {
              targetProfile: {
                targetProfileId: targetProfile.target_profile_id,
                version: targetProfile.version,
                profileHash: targetProfile.profile_hash,
                launchUrl: targetProfile.launch_url,
                allowedNavigationOrigins: JSON.parse(targetProfile.allowed_navigation_origins_json),
                allowedInteractionOrigins: JSON.parse(targetProfile.allowed_interaction_origins_json),
                credentialOrigins: JSON.parse(targetProfile.credential_origins_json),
                tlsPolicy: targetProfile.tls_policy,
                networkMode: targetProfile.network_mode,
                resolvedAddresses: JSON.parse(targetProfile.resolved_addresses_json || '{}'),
                ...(parsedAdapterBinding ? { adapterBinding: parsedAdapterBinding } : {}),
                status: targetProfile.status
              }
            } : {})
          } : {})
        },
        leaseExpiresAt,
        leaseVersion: lease.version
      };
    });
  }

  async renewRunLease(taskId: string, workerId: string, leaseVersion: number, leaseSeconds = 300): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      const renewed = db.prepare(`
        UPDATE tasks
        SET lease_expires_at = ?, updated_at = ?
        WHERE task_id = ? AND task_type = 'RUN_EXECUTE' AND status = 'RUNNING'
          AND lease_owner = ? AND version = ?
          AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
      `).run(leaseExpiresAt, timestamp, taskId, workerId, leaseVersion, timestamp);
      if (renewed.changes !== 1) {
        throw new HarnessError(409, 'WORKER_LEASE_CONFLICT', 'CONCURRENCY', 'Worker 租约已失效，禁止续租。', false, true);
      }
      return { taskId, workerId, leaseVersion, leaseExpiresAt, status: 'RENEWED' };
    });
  }

  async claimNextAuthoringAction(workerId: string, visualContext?: {
    viewportWidth: number;
    viewportHeight: number;
    tokenizerId: string;
  }, leaseSeconds = 360): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE action_execution_slots SET status = 'EXPIRED', version = version + 1, updated_at = ?
        WHERE status = 'ACTIVE' AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      db.prepare(`
        UPDATE action_plan_items SET status = 'PENDING', updated_at = ?
        WHERE status = 'RUNNING' AND action_id IN (
          SELECT action_id FROM action_execution_slots WHERE status = 'EXPIRED'
        )
      `).run(timestamp);
      const row = db.prepare(`
        SELECT ap.plan_id, ap.task_id, ap.script_id, ap.cursor_ordinal, ap.previous_action_summary_json,
               ap.last_observation_json, ap.current_page_state_json,
               p.namespace, p.case_id, p.case_version, p.summary_json,
               current.action_id, current.action_type, current.prompt, current.target_ref, current.value_ref, current.risk_level,
               current.context_level, current.context_upgrade_reason_code,
               next.action_type AS next_type, next.prompt AS next_prompt,
               cap.status AS capability_status, locate_cap.status AS locate_capability_status
        FROM action_plans ap
        JOIN plans p ON p.plan_id = ap.plan_id
        JOIN action_plan_items current ON current.plan_id = ap.plan_id AND current.ordinal = ap.cursor_ordinal
        LEFT JOIN action_plan_items next ON next.plan_id = ap.plan_id AND next.ordinal = ap.cursor_ordinal + 1
        LEFT JOIN midscene_action_capabilities cap ON cap.action_type = current.action_type
        LEFT JOIN midscene_action_capabilities locate_cap ON locate_cap.action_type = 'LOCATE'
        WHERE ap.status IN ('QUEUED', 'RUNNING') AND current.status = 'PENDING'
          AND NOT EXISTS (
            SELECT 1 FROM action_execution_slots active
            WHERE active.plan_id = ap.plan_id AND active.status = 'ACTIVE'
          )
        ORDER BY ap.created_at ASC
        LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const slotId = opaqueId('slot');
      const contextAuditId = opaqueId('ctxaudit');
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      const risk = String(row.risk_level);
      const capability = String(row.capability_status ?? 'UNVERIFIED');
      const locateCapability = String(row.locate_capability_status ?? 'UNVERIFIED');
      // Midscene is an observation-only locator provider.  It never receives
      // an execution capability, including for a previously verified action.
      const executionMode: 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE' | 'PLAYWRIGHT_ONLY' = locateCapability === 'VERIFIED'
          ? 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE'
          : 'PLAYWRIGHT_ONLY';
      const contextLevel = String(row.context_level ?? 'CTX-L1') as ContextLevel;
      const globalExecutionSummary = JSON.parse(String(row.summary_json)) as Record<string, unknown>;
      const executionProfile = ['LOGIN_PROFILE', 'ACCOUNT_OWNERSHIP', 'AUTH_REJECTION_RECOVERY']
        .includes(String(globalExecutionSummary.executionProfile))
        ? globalExecutionSummary.executionProfile as ExecutionProfile
        : null;
      const assertionCount = typeof globalExecutionSummary.assertionCount === 'number'
        ? globalExecutionSummary.assertionCount
        : null;
      const currentAction = {
        actionType: row.action_type as AuthoringActionType,
        prompt: String(row.prompt),
        targetRef: row.target_ref as 'PAGE' | 'LOGIN_USERNAME' | 'LOGIN_SSO_TAB' | 'LOGIN_SUBMIT',
        valueRef: row.value_ref ? row.value_ref as 'SYNTHETIC_TEXT' : null,
        riskLevel: row.risk_level as 'LOW' | 'MEDIUM' | 'HIGH',
        executionMode
      };
      const contextEnvelope = buildActionContextEnvelope({
        contextLevel,
        tokenizerId: visualContext?.tokenizerId ?? 'mimo-v2.5-conservative-v1',
        imageTokenEstimate: estimateImageTokens(visualContext?.viewportWidth ?? 1024, visualContext?.viewportHeight ?? 520),
        workerId,
        slotId,
        leaseExpiresAt,
        currentAction,
        previousActionSummary: row.previous_action_summary_json ? JSON.parse(String(row.previous_action_summary_json)) : null,
        nextActionPreview: row.next_type ? { actionType: row.next_type as AuthoringActionType, prompt: String(row.next_prompt) } : null,
        recentFacts: row.last_observation_json ? JSON.parse(String(row.last_observation_json)) : null,
        currentPageState: row.current_page_state_json ? JSON.parse(String(row.current_page_state_json)) : null,
        minimalDependencyCone: {
          caseId: String(row.case_id),
          caseVersion: Number(row.case_version),
          executionProfile,
          assertionCount
        }
      });
      const contextEnvelopeHash = sha256(canonicalJson(contextEnvelope));
      db.prepare(`
        INSERT INTO action_execution_slots(
          slot_id, plan_id, task_id, action_id, lease_owner, lease_expires_at, status, version,
          created_at, updated_at, context_level, context_envelope_hash
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?)
      `).run(
        slotId, row.plan_id, row.task_id, row.action_id, workerId, leaseExpiresAt,
        timestamp, timestamp, contextEnvelope.contextLevel, contextEnvelopeHash
      );
      db.prepare(`
        INSERT INTO context_budget_audits(
          audit_id, namespace, plan_id, task_id, action_id, slot_id, consumer_type, context_level,
          model_context_limit_tokens, input_budget_tokens, reserved_output_tokens, estimated_input_tokens,
          image_token_estimate, tokenizer_id, budget_decision, redaction_profile_id,
          context_envelope_hash, upgrade_reason_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        contextAuditId, row.namespace, row.plan_id, row.task_id, row.action_id, slotId,
        contextEnvelope.consumerType, contextEnvelope.contextLevel, contextEnvelope.modelContextLimitTokens,
        contextEnvelope.inputBudgetTokens, contextEnvelope.reservedOutputTokens,
        contextEnvelope.estimatedInputTokens, contextEnvelope.imageTokenEstimate, contextEnvelope.tokenizerId,
        contextEnvelope.budgetDecision, contextEnvelope.redactionProfileId, contextEnvelopeHash,
        row.context_upgrade_reason_code ?? null, timestamp
      );
      db.prepare(`UPDATE action_plan_items SET status = 'RUNNING', updated_at = ? WHERE action_id = ?`)
        .run(timestamp, row.action_id);
      db.prepare(`UPDATE action_plans SET status = 'RUNNING', version = version + 1, updated_at = ? WHERE plan_id = ?`)
        .run(timestamp, row.plan_id);
      db.prepare(`UPDATE tasks SET status = 'RUNNING', progress = 10, version = version + 1, updated_at = ? WHERE task_id = ?`)
        .run(timestamp, row.task_id);
      return {
        status: 'CLAIMED',
        taskId: row.task_id,
        planId: row.plan_id,
        scriptId: row.script_id,
        slotId,
        actionId: row.action_id,
        contextAuditId,
        contextEnvelopeHash,
        contextEnvelope
      };
    });
  }

  async completeAuthoringAction(taskId: string, input: {
    workerId: string;
    slotId: string;
    outcome: 'VERIFIED_PASSED' | 'FAILED' | 'AMBIGUOUS';
    summary: string;
    pageState: Record<string, unknown>;
    verification: { dom: boolean; url: boolean; request: boolean; business: boolean };
    contextAuditId: string;
    contextEnvelopeHash: string;
    modelUsage: ModelUsage;
  }): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const slot = db.prepare(`
        SELECT s.*, i.ordinal, i.action_type, i.context_level AS item_context_level,
               ap.cursor_ordinal, ap.script_id, a.audit_id, a.budget_decision, a.completed_at AS audit_completed_at
        FROM action_execution_slots s
        JOIN action_plan_items i ON i.action_id = s.action_id
        JOIN action_plans ap ON ap.plan_id = s.plan_id
        JOIN context_budget_audits a ON a.slot_id = s.slot_id
        WHERE s.slot_id = ? AND s.task_id = ?
      `).get(input.slotId, taskId) as Record<string, unknown> | undefined;
      if (!slot) throw new HarnessError(404, 'ACTION_SLOT_NOT_FOUND', 'DOMAIN', '动作租约不存在。');
      if (slot.status !== 'ACTIVE' || slot.lease_owner !== input.workerId || String(slot.lease_expires_at) < timestamp) {
        throw new HarnessError(409, 'ACTION_LEASE_CONFLICT', 'CONCURRENCY', '动作租约已失效。', false, true);
      }
      if (slot.audit_id !== input.contextAuditId || slot.context_envelope_hash !== input.contextEnvelopeHash) {
        throw new HarnessError(409, 'ACTION_CONTEXT_AUDIT_CONFLICT', 'CONCURRENCY', '动作上下文审计引用与租约不一致。', false, true);
      }
      if (slot.audit_completed_at) {
        throw new HarnessError(409, 'ACTION_CONTEXT_USAGE_ALREADY_RECORDED', 'CONCURRENCY', '动作上下文用量已经完成记录。');
      }
      const deterministicVerified = Object.values(input.verification).every(Boolean);
      if (input.outcome === 'VERIFIED_PASSED' && !deterministicVerified) {
        throw new HarnessError(400, 'PLAYWRIGHT_VERIFICATION_REQUIRED', 'EVIDENCE', 'Midscene 动作必须由 Playwright 独立验证。');
      }
      const usage = input.modelUsage;
      db.prepare(`
        UPDATE context_budget_audits
        SET usage_status = ?, provider_ref = ?, model_ref = ?, actual_input_tokens = ?,
            actual_output_tokens = ?, actual_total_tokens = ?, completed_at = ?
        WHERE audit_id = ? AND completed_at IS NULL
      `).run(
        usage.status, usage.provider ?? null, usage.model ?? null, usage.inputTokens ?? null,
        usage.outputTokens ?? null, usage.totalTokens ?? null, timestamp, input.contextAuditId
      );
      const usageExceeded = usage.status === 'PROVIDER_REPORTED'
        && (Number(usage.inputTokens) > MODEL_CONTEXT_POLICIES.VISION_LLM.inputBudgetTokens
          || Number(usage.totalTokens) > MODEL_CONTEXT_POLICIES.VISION_LLM.modelContextLimitTokens);
      const effectiveOutcome = usageExceeded ? 'FAILED' : input.outcome;
      if (effectiveOutcome === 'AMBIGUOUS'
        && usage.status !== 'NOT_INVOKED'
        && slot.budget_decision === 'ALLOW'
        && slot.item_context_level !== 'CTX-L3') {
        const nextContextLevel: ContextLevel = slot.item_context_level === 'CTX-L1' ? 'CTX-L2' : 'CTX-L3';
        db.prepare(`
          UPDATE action_plan_items
          SET status = 'PENDING', context_level = ?, context_upgrade_reason_code = 'MIDSCENE_ACTION_AMBIGUOUS',
              verification_json = ?, updated_at = ?
          WHERE action_id = ?
        `).run(nextContextLevel, canonicalJson(input.verification), timestamp, slot.action_id);
        db.prepare(`UPDATE action_execution_slots SET status = 'FAILED', version = version + 1, updated_at = ? WHERE slot_id = ?`)
          .run(timestamp, input.slotId);
        db.prepare(`UPDATE action_plans SET status = 'RUNNING', version = version + 1, updated_at = ? WHERE plan_id = ?`)
          .run(timestamp, slot.plan_id);
        db.prepare(`
          UPDATE tasks SET status = 'QUEUED', result_summary = ?, error_code = NULL, error_category = NULL,
            user_action_required = 0, version = version + 1, updated_at = ? WHERE task_id = ?
        `).run(`视觉候选存在歧义，已按确定性规则升级到 ${nextContextLevel}。`, timestamp, taskId);
        return {
          taskId, planId: slot.plan_id, status: 'QUEUED', cursorAdvanced: false,
          contextUpgraded: true, nextContextLevel
        };
      }
      const itemStatus = effectiveOutcome;
      db.prepare(`UPDATE action_plan_items SET status = ?, verification_json = ?, updated_at = ? WHERE action_id = ?`)
        .run(itemStatus, canonicalJson(input.verification), timestamp, slot.action_id);
      db.prepare(`UPDATE action_execution_slots SET status = ?, version = version + 1, updated_at = ? WHERE slot_id = ?`)
        .run(effectiveOutcome === 'VERIFIED_PASSED' ? 'COMPLETED' : 'FAILED', timestamp, input.slotId);
      if (effectiveOutcome !== 'VERIFIED_PASSED') {
        db.prepare(`UPDATE action_plans SET status = 'WAITING_USER', version = version + 1, updated_at = ? WHERE plan_id = ?`)
          .run(timestamp, slot.plan_id);
        db.prepare(`
          UPDATE tasks SET status = 'WAITING_USER', progress = 0, result_summary = ?, error_code = ?,
            error_category = 'TEST_FAILURE', user_action_required = 1, version = version + 1, updated_at = ?
          WHERE task_id = ?
        `).run(
          usageExceeded ? '视觉模型实际用量超过16K硬上限。' : input.summary,
          usageExceeded ? 'VISION_CONTEXT_BUDGET_EXCEEDED' : effectiveOutcome === 'AMBIGUOUS' ? 'MIDSCENE_ACTION_AMBIGUOUS' : 'MIDSCENE_ACTION_FAILED',
          timestamp, taskId
        );
        return { taskId, planId: slot.plan_id, status: 'WAITING_USER', cursorAdvanced: false };
      }
      const remaining = db.prepare(`
        SELECT COUNT(*) AS count FROM action_plan_items WHERE plan_id = ? AND ordinal > ?
      `).get(slot.plan_id, slot.ordinal) as { count: number };
      const completed = remaining.count === 0;
      db.prepare(`
        UPDATE action_plans SET cursor_ordinal = ?, status = ?, previous_action_summary_json = ?,
          last_observation_json = ?, current_page_state_json = ?, version = version + 1, updated_at = ?
        WHERE plan_id = ?
      `).run(
        Number(slot.ordinal) + (completed ? 0 : 1), completed ? 'WAITING_USER' : 'RUNNING',
        canonicalJson({ ordinal: slot.ordinal, actionType: slot.action_type, summary: input.summary }),
        canonicalJson({ summary: input.summary, verification: input.verification }),
        canonicalJson(input.pageState), timestamp, slot.plan_id
      );
      if (completed) {
        db.prepare(`UPDATE scripts SET status = 'VALIDATING', updated_at = ? WHERE script_id = ?`).run(timestamp, slot.script_id);
        db.prepare(`UPDATE script_versions SET validation_status = 'PASSED' WHERE script_id = ? AND version = 1`).run(slot.script_id);
        db.prepare(`
          UPDATE tasks SET status = 'WAITING_USER', progress = 100, result_summary = ?,
            user_action_required = 1, version = version + 1, updated_at = ? WHERE task_id = ?
        `).run('候选脚本已通过 Playwright 验证，等待 Coze 中的用户明确确认激活。', timestamp, taskId);
      } else {
        const count = db.prepare('SELECT COUNT(*) AS count FROM action_plan_items WHERE plan_id = ?').get(slot.plan_id) as { count: number };
        const progress = Math.max(1, Math.min(99, Math.floor(Number(slot.ordinal) / count.count * 100)));
        db.prepare(`UPDATE tasks SET status = 'QUEUED', progress = ?, version = version + 1, updated_at = ? WHERE task_id = ?`)
          .run(progress, timestamp, taskId);
      }
      return { taskId, planId: slot.plan_id, status: completed ? 'WAITING_USER' : 'QUEUED', cursorAdvanced: true, completed };
    });
  }

  async recordMidsceneCapability(input: {
    actionType: AuthoringActionType;
    viewportCount: number;
    attemptCount: number;
    failureCount: number;
    falseSuccessCount: number;
    verificationRef: string;
  }): Promise<Record<string, unknown>> {
    const status = input.viewportCount >= 5
      && input.attemptCount >= input.viewportCount * 2
      && input.failureCount === 0
      && input.falseSuccessCount === 0
      ? 'VERIFIED'
      : 'DEGRADED';
    await this.database.write(db => db.prepare(`
      UPDATE midscene_action_capabilities SET status = ?, viewport_count = ?, attempt_count = ?,
        failure_count = ?, false_success_count = ?, verification_ref = ?, updated_at = ? WHERE action_type = ?
    `).run(status, input.viewportCount, input.attemptCount, input.failureCount, input.falseSuccessCount, input.verificationRef, nowIso(), input.actionType));
    return { actionType: input.actionType, status, admittedToLowMediumExecution: status === 'VERIFIED' };
  }

  async completeRun(taskId: string, input: WorkerCompletionInput): Promise<Record<string, unknown>> {
    const task = this.database.read(db => db.prepare(`
      SELECT t.namespace, t.run_id, t.case_id, t.status, t.lease_owner,
             t.lease_expires_at, t.version AS lease_version,
             r.case_version, r.plan_id,
             COALESCE(sc.script_id, p.script_id) AS script_id,
             COALESCE(sc.script_version, json_extract(t.payload_json, '$.scriptVersion'), s.current_version) AS script_version,
             r.origin_schedule_id, r.schedule_execution_id,
             sc.max_retries, sc.schedule_type, se.retry_count
      FROM tasks t
      JOIN runs r ON r.task_id = t.task_id
      JOIN plans p ON p.plan_id = r.plan_id
      JOIN scripts s ON s.script_id = p.script_id
      LEFT JOIN schedules sc ON sc.schedule_id = r.origin_schedule_id
      LEFT JOIN schedule_executions se ON se.execution_id = r.schedule_execution_id
      WHERE t.task_id = ? AND t.task_type = 'RUN_EXECUTE'
    `).get(taskId) as {
      namespace: string; run_id: string; case_id: string; status: string; lease_owner: string | null;
      lease_expires_at: string | null; lease_version: number;
      case_version: number; plan_id: string; script_id: string; script_version: number; origin_schedule_id: string | null;
      schedule_type: 'RECURRING' | 'ONE_TIME' | null;
      schedule_execution_id: string | null; max_retries: number | null; retry_count: number | null;
    } | undefined);
    if (!task) throw new HarnessError(404, 'WORKER_TASK_NOT_FOUND', 'DOMAIN', 'Worker 任务不存在。');
    if (task.status !== 'RUNNING' || task.lease_owner !== input.workerId
      || task.lease_version !== input.leaseVersion
      || task.lease_expires_at === null || task.lease_expires_at <= nowIso()) {
      throw new HarnessError(409, 'WORKER_LEASE_CONFLICT', 'CONCURRENCY', 'Worker 租约已失效。', false, true);
    }
    if (input.outcome === 'PASSED' && input.evidence.length < 3) {
      throw new HarnessError(400, 'EVIDENCE_INCOMPLETE', 'EVIDENCE', '通过结果必须包含报告、截图和日志证据。');
    }

    const stagedArtifacts: StagedArtifact[] = [];
    try {
      for (const evidence of input.evidence) {
        stagedArtifacts.push(this.artifacts.stage({
          namespace: task.namespace,
          runId: task.run_id,
          taskId,
          artifactType: evidence.artifactType,
          mediaType: evidence.mediaType,
          // A browser screenshot can contain sensitive rendered text outside
          // input elements. Until a pixel-level redaction verifier attests the
          // exact image, keep every screenshot non-downloadable.
          redactionStatus: evidence.artifactType === 'SCREENSHOT' ? 'QUARANTINED' : evidence.redactionStatus,
          extension: evidence.extension,
          content: Buffer.from(evidence.base64Content, 'base64'),
          metadata: evidence.metadata
        }));
      }
    } catch (error) {
      for (const artifact of stagedArtifacts) this.artifacts.discardStaged(artifact);
      throw error;
    }
    const artifacts = stagedArtifacts;
    const resultArtifact = artifacts.find(item => item.type === 'REPORT') ?? artifacts[0];
    const scheduledRetry = input.outcome !== 'PASSED'
      && input.errorCategory === 'ENVIRONMENT'
      && input.retryable === true
      && task.origin_schedule_id !== null
      && Number(task.retry_count ?? 0) < Number(task.max_retries ?? 0);
    try {
      if (scheduledRetry) {
        await this.database.write(db => {
          const completionTimestamp = nowIso();
          const fenced = db.prepare(`
            UPDATE tasks SET status = 'QUEUED', progress = 0, result_summary = ?, result_artifact_id = ?,
              error_code = ?, error_category = ?, retryable = 1, user_action_required = 0,
              lease_owner = NULL, lease_expires_at = NULL, version = version + 1, updated_at = ?, completed_at = NULL
            WHERE task_id = ? AND status = 'RUNNING' AND lease_owner = ? AND version = ?
              AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
          `).run(input.summary, resultArtifact?.artifactId ?? null, input.errorCode ?? 'TRANSIENT_ENVIRONMENT_FAILURE', input.errorCategory,
            completionTimestamp, taskId, input.workerId, input.leaseVersion, completionTimestamp);
          if (fenced.changes !== 1) {
            throw new HarnessError(409, 'WORKER_LEASE_CONFLICT', 'CONCURRENCY', 'Worker 租约已失效，禁止写入重试结果。', false, true);
          }
          for (const artifact of stagedArtifacts) this.artifacts.publishStaged(db, artifact);
          db.prepare(`UPDATE runs SET status = 'QUEUED', version = version + 1, completed_at = NULL WHERE run_id = ?`).run(task.run_id);
          db.prepare(`
            UPDATE schedule_executions SET status = 'RETRY_QUEUED', retry_count = retry_count + 1,
              reason_code = ?, updated_at = ? WHERE execution_id = ?
          `).run(input.errorCode ?? 'TRANSIENT_ENVIRONMENT_FAILURE', completionTimestamp, task.schedule_execution_id);
          db.prepare(`
            INSERT INTO audit_events(event_id, namespace, run_id, task_id, actor_type, action, object_type,
              object_id, outcome, correlation_id, details_json, created_at)
            VALUES (?, ?, ?, ?, 'HARNESS', 'schedule.retry', 'RUN', ?, 'ACCEPTED', ?, ?, ?)
          `).run(opaqueId('evt'), task.namespace, task.run_id, taskId, task.run_id, opaqueId('scheduler'),
            JSON.stringify({ retryCount: Number(task.retry_count ?? 0) + 1, maxRetries: task.max_retries }), completionTimestamp);
        });
        for (const artifact of stagedArtifacts) artifact.committed = true;
        return {
          taskId, runId: task.run_id, status: 'QUEUED', outcome: input.outcome,
          retryScheduled: true, retryCount: Number(task.retry_count ?? 0) + 1,
          artifactIds: artifacts.map(item => item.artifactId)
        };
      }
      const taskStatus = input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED';
      let incidentId: string | undefined;
      await this.database.write(db => {
        const completionTimestamp = nowIso();
        const fenced = db.prepare(`
          UPDATE tasks SET status = ?, progress = 100, result_summary = ?, result_artifact_id = ?,
            error_code = ?, error_category = ?, retryable = ?, user_action_required = ?,
            lease_owner = NULL, lease_expires_at = NULL, version = version + 1,
            updated_at = ?, completed_at = ?
          WHERE task_id = ? AND status = 'RUNNING' AND lease_owner = ? AND version = ?
            AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
        `).run(
          taskStatus, input.summary, resultArtifact?.artifactId ?? null,
          input.errorCode ?? null, input.errorCategory ?? null, input.retryable ? 1 : 0,
          input.userActionRequired ? 1 : 0, completionTimestamp, completionTimestamp, taskId,
          input.workerId, input.leaseVersion, completionTimestamp
        );
        if (fenced.changes !== 1) {
          throw new HarnessError(409, 'WORKER_LEASE_CONFLICT', 'CONCURRENCY', 'Worker 租约已失效，禁止覆盖执行结果。', false, true);
        }
        for (const artifact of stagedArtifacts) this.artifacts.publishStaged(db, artifact);
        db.prepare(`
          UPDATE runs SET status = ?, version = version + 1, completed_at = ? WHERE run_id = ?
        `).run(input.outcome, completionTimestamp, task.run_id);
        if (task.schedule_execution_id) {
          db.prepare(`
            UPDATE schedule_executions SET status = ?, reason_code = ?, updated_at = ?, completed_at = ?
            WHERE execution_id = ?
          `).run(input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED', input.errorCode ?? null, completionTimestamp, completionTimestamp, task.schedule_execution_id);
        }
        const artifactMetadata = resultArtifact ? canonicalJson({
          artifactId: resultArtifact.artifactId,
          type: resultArtifact.type,
          sha256: resultArtifact.sha256,
          byteSize: resultArtifact.byteSize,
          mediaType: resultArtifact.mediaType,
          redactionStatus: resultArtifact.redactionStatus
        }) : canonicalJson({ available: false });
        db.prepare(`
          INSERT OR IGNORE INTO result_inbox_items(
            inbox_id, namespace, run_id, task_id, schedule_id, schedule_type,
            case_id, case_version, plan_id, script_id, script_version, outcome,
            summary, result_artifact_id, artifact_metadata_json, delivery_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNREAD', ?)
        `).run(
          opaqueId('inbox'), task.namespace, task.run_id, taskId, task.origin_schedule_id,
          task.schedule_type, task.case_id, task.case_version, task.plan_id, task.script_id,
          task.script_version, input.outcome, input.summary, resultArtifact?.artifactId ?? null,
          artifactMetadata, completionTimestamp
        );
        if (task.origin_schedule_id && task.schedule_type === 'ONE_TIME') {
          db.prepare(`UPDATE schedules SET status = 'DISABLED', one_time_state = ?, completed_at = ?,
            version = version + 1, updated_at = ? WHERE schedule_id = ?`)
            .run(input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED', completionTimestamp, completionTimestamp, task.origin_schedule_id);
        }
        db.prepare(`
          INSERT INTO audit_events(
            event_id, namespace, run_id, task_id, actor_type, action, object_type,
            object_id, outcome, correlation_id, details_json, created_at
          ) VALUES (?, ?, ?, ?, 'WORKER', 'run.complete', 'RUN', ?, ?, ?, ?, ?)
        `).run(
          opaqueId('evt'), task.namespace, task.run_id, taskId, task.run_id,
          input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED', opaqueId('worker'),
          JSON.stringify({ outcome: input.outcome, artifactIds: artifacts.map(item => item.artifactId) }), completionTimestamp
        );
        if (input.outcome !== 'PASSED') {
          const existing = db.prepare('SELECT incident_id FROM failure_incidents WHERE run_id = ?')
            .get(task.run_id) as { incident_id: string } | undefined;
          incidentId = existing?.incident_id ?? opaqueId('incident');
          if (!existing) {
            const classification = classifyFailure(input.errorCategory, input.errorCode);
            db.prepare(`
            INSERT INTO failure_incidents(
              incident_id, namespace, run_id, case_id, script_id, script_version,
              classification, reason_code, summary, evidence_artifact_id,
              diagnostic_status, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLASSIFIED', 1, ?, ?)
          `).run(
            incidentId, task.namespace, task.run_id, task.case_id, task.script_id, task.script_version,
            classification, input.errorCode ?? 'WORKER_EXECUTION_FAILED', input.summary,
            resultArtifact?.artifactId ?? null, completionTimestamp, completionTimestamp
          );
          const i8Classification = classifyI8Failure(input.errorCategory, input.errorCode, input.failureDiagnostic);
          const disposition = i8FailureDisposition(i8Classification);
          const envelopeId = opaqueId('failureenv');
          const envelope = {
            schemaVersion: 'i8-step-failure-envelope-v1',
            stage: 'FORMAL_RUN',
            object: { runId: task.run_id, taskId, caseId: task.case_id, caseVersion: task.case_version, scriptId: task.script_id, scriptVersion: task.script_version },
            errorCode: input.errorCode ?? 'WORKER_EXECUTION_FAILED',
            classification: i8Classification,
            inputSummary: { environment: 'local', originScheduleId: task.origin_schedule_id ?? null },
            outputSummary: {
              outcome: input.outcome,
              resultArtifactId: resultArtifact?.artifactId ?? null,
              ...(input.failureDiagnostic ? { failureDiagnostic: input.failureDiagnostic } : {})
            },
            artifactRefs: artifacts.map(item => item.artifactId),
            allowedRepairScope: disposition,
            contextLevel: 'CTX-L1',
            attemptCount: 0,
            maxAttempts: 3,
            redactionProfileId: 'HENGZHUN_FAILURE_REDACTION_V1'
          };
          const envelopeJson = canonicalJson(envelope);
          db.prepare(`INSERT INTO i8_failure_incidents(incident_id, namespace, classification, disposition, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'FAILURE_CLASSIFIED', ?, ?)`)
            .run(incidentId, task.namespace, i8Classification, disposition, completionTimestamp, completionTimestamp);
          db.prepare(`INSERT INTO i8_step_failure_envelopes(envelope_id, namespace, incident_id, stage, context_level, envelope_json, envelope_hash, attempt_count, max_attempts, created_at, updated_at)
            VALUES (?, ?, ?, 'FORMAL_RUN', 'CTX-L1', ?, ?, 0, 3, ?, ?)`)
            .run(envelopeId, task.namespace, incidentId, envelopeJson, sha256(envelopeJson), completionTimestamp, completionTimestamp);
          if (classification === 'LOCATOR') {
            db.prepare(`UPDATE scripts SET status = 'VALIDATING', updated_at = ? WHERE script_id = ? AND status = 'SCRIPT_VALIDATED'`)
              .run(completionTimestamp, task.script_id);
          }
          }
          if (task.origin_schedule_id && incidentId && task.schedule_type !== 'ONE_TIME') {
            db.prepare(`
              UPDATE schedules SET status = 'PAUSED_FAILURE', paused_incident_id = ?,
                version = version + 1, updated_at = ? WHERE schedule_id = ? AND status = 'ACTIVE'
            `).run(incidentId, completionTimestamp, task.origin_schedule_id);
          }
        }
      });
      for (const artifact of stagedArtifacts) artifact.committed = true;
      return {
        taskId,
        runId: task.run_id,
        status: taskStatus,
        outcome: input.outcome,
        resultArtifactId: resultArtifact?.artifactId ?? null,
        artifactIds: artifacts.map(item => item.artifactId),
        ...(incidentId ? { incidentId } : {})
      };
    } catch (error) {
      for (const artifact of stagedArtifacts) this.artifacts.discardStaged(artifact);
      throw error;
    }
  }

  getI8Failure(namespace: string, incidentId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`SELECT fi.incident_id, fi.run_id, fi.case_id, fi.script_id, fi.script_version, fi.reason_code,
        i.classification, i.disposition, i.status, e.envelope_id, e.context_level, e.envelope_json, e.envelope_hash,
        e.attempt_count, e.max_attempts, e.updated_at, p.proposal_id, p.repair_candidate_id, p.status proposal_status,
        p.version proposal_version, p.script_version repair_script_version, p.script_sha256, p.manifest_sha256,
        b.status stability_status, cert.certificate_id, cert.validation_run_ids_json,
        COALESCE(policy.policy_version,'I8_2X3_V1') stability_policy_version,
        COALESCE(policy.required_runs,6) stability_required_runs
        FROM failure_incidents fi JOIN i8_failure_incidents i ON i.incident_id=fi.incident_id
        JOIN i8_step_failure_envelopes e ON e.envelope_id=(
          SELECT envelope_id FROM i8_step_failure_envelopes
          WHERE incident_id=fi.incident_id
          ORDER BY CASE context_level WHEN 'CTX-L3' THEN 3 WHEN 'CTX-L2' THEN 2 ELSE 1 END DESC
          LIMIT 1
        )
        LEFT JOIN i8_script_patch_proposals p ON p.proposal_id=(SELECT proposal_id FROM i8_script_patch_proposals WHERE incident_id=fi.incident_id ORDER BY attempt_no DESC LIMIT 1)
        LEFT JOIN i8_repair_stability_batches b ON b.proposal_id=p.proposal_id
        LEFT JOIN i8_repair_stability_certificates cert ON cert.proposal_id=p.proposal_id
        LEFT JOIN i10_stability_policy_bindings policy ON policy.object_type='REPAIR_BATCH' AND policy.object_id=b.batch_id
        WHERE fi.namespace=? AND fi.incident_id=?`).get(namespace, incidentId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I8_FAILURE_INCIDENT_NOT_FOUND', 'DOMAIN', 'I8 失败事故不存在。');
      const envelopePayload = JSON.parse(String(row.envelope_json)) as {
        outputSummary?: { failureDiagnostic?: { targetRef?: unknown } };
      };
      const diagnosticTargetRef = typeof envelopePayload.outputSummary?.failureDiagnostic?.targetRef === 'string'
        ? envelopePayload.outputSummary.failureDiagnostic.targetRef
        : undefined;
      const repairTarget = row.classification === 'LOCATOR'
        ? (diagnosticTargetRef && Object.prototype.hasOwnProperty.call(I8_CONTROLLED_CATALOG.repairTargets, diagnosticTargetRef)
            ? diagnosticTargetRef
            : Object.keys(I8_CONTROLLED_CATALOG.repairTargets).find(targetRef => String(row.reason_code).startsWith(targetRef)))
        : undefined;
      const approvedRepairOptions = repairTarget
        ? I8_CONTROLLED_CATALOG.repairTargets[repairTarget as keyof typeof I8_CONTROLLED_CATALOG.repairTargets]
          .slice(1)
          .map(locator => ({ operationType: 'TARGET_MAPPING', targetRef: repairTarget, locator }))
        : [];
      return { incidentId: row.incident_id, runId: row.run_id, caseId: row.case_id, scriptId: row.script_id,
        scriptVersion: row.script_version, classification: row.classification, reasonCode: row.reason_code,
        disposition: row.disposition, status: row.status, approvedRepairOptions,
        failureEnvelope: { envelopeId: row.envelope_id, contextLevel: row.context_level, envelopeHash: row.envelope_hash,
          attemptCount: row.attempt_count, maxAttempts: row.max_attempts, payload: envelopePayload },
        ...(row.proposal_id ? { proposal: { proposalId: row.proposal_id, repairCandidateId: row.repair_candidate_id,
          status: row.proposal_status, version: row.proposal_version, scriptVersion: row.repair_script_version,
          scriptHash: row.script_sha256, manifestHash: row.manifest_sha256,
          stability: { status: row.stability_status, requiredRuns: Number(row.stability_required_runs ?? 6), policyVersion: row.stability_policy_version, certificateId: row.certificate_id ?? null,
            validationRunIds: row.validation_run_ids_json ? JSON.parse(String(row.validation_run_ids_json)) : [] } } } : {}), updatedAt: row.updated_at };
    });
  }

  async proposeI8Repair(input: I8RepairProposeInput, context: RequestContext): Promise<IdempotentResult> {
    const patch = scriptPatchProposalSchema.parse(input.patch);
    const exhausted = await this.database.write(db => {
      const envelope = db.prepare(`
        SELECT e.attempt_count, e.max_attempts
        FROM i8_step_failure_envelopes e
        JOIN i8_failure_incidents i ON i.incident_id = e.incident_id
        WHERE e.namespace = ? AND e.incident_id = ?
        ORDER BY CASE e.context_level WHEN 'CTX-L3' THEN 3 WHEN 'CTX-L2' THEN 2 ELSE 1 END DESC
        LIMIT 1
      `).get(input.namespace, input.incidentId) as any;
      if (!envelope || Number(envelope.attempt_count) < Number(envelope.max_attempts)) return false;
      db.prepare(`UPDATE i8_failure_incidents SET status = 'UNRESOLVED', updated_at = ? WHERE incident_id = ?`)
        .run(nowIso(), input.incidentId);
      return true;
    });
    if (exhausted) {
      throw new HarnessError(409, 'I8_REPAIR_ATTEMPT_LIMIT_EXHAUSTED', 'DOMAIN', '三个修复候选已耗尽。', false, true);
    }
    return this.idempotent(input.namespace, 'i8_repair_propose', input.idempotencyKey, input, context, (db, timestamp) => {
      const incident = db.prepare(`SELECT fi.*, i.classification, i.disposition, e.envelope_id, e.envelope_hash, e.attempt_count, e.max_attempts,
        c.candidate_id base_candidate_id, c.script_id base_script_id, c.script_version base_script_version, c.source_chain_hash base_source_chain_hash,
        p.plan_json, p.executable_plan_id,
        COALESCE(policy.policy_version,'I8_2X3_V1') stability_policy_version,
        COALESCE(policy.required_runs,6) stability_required_runs FROM failure_incidents fi JOIN i8_failure_incidents i ON i.incident_id=fi.incident_id
        JOIN i8_step_failure_envelopes e ON e.envelope_id=(
          SELECT envelope_id FROM i8_step_failure_envelopes
          WHERE incident_id=fi.incident_id
          ORDER BY CASE context_level WHEN 'CTX-L3' THEN 3 WHEN 'CTX-L2' THEN 2 ELSE 1 END DESC
          LIMIT 1
        )
        JOIN i8_script_candidates c ON c.script_id=fi.script_id AND c.script_version=fi.script_version
        LEFT JOIN i8_stability_batches base_batch ON base_batch.candidate_id=c.candidate_id
        LEFT JOIN i10_stability_policy_bindings policy ON policy.object_type='CANDIDATE_BATCH' AND policy.object_id=base_batch.batch_id
        JOIN i8_executable_plans p ON p.executable_plan_id=c.executable_plan_id WHERE fi.namespace=? AND fi.incident_id=?`)
        .get(input.namespace, input.incidentId) as Record<string, unknown> | undefined;
      if (!incident) throw new HarnessError(404, 'I8_REPAIR_BASE_CANDIDATE_NOT_FOUND', 'DOMAIN', '事故没有可审计的 I8 基础候选。');
      if(JSON.parse(String(incident.plan_json)).fixtureProfile==='TRANSFER_UKEY_ORDER_QUERY')
        throw new HarnessError(409,'I10_BANK_VALIDATION_FRESH_POOL_REQUIRED','DOMAIN','资金候选不能在已使用的账户样本上自动修复或重新验证；请创建新案例与样本池。',false,true);
      if (incident.envelope_hash !== input.expectedEnvelopeHash) throw new HarnessError(409, 'I8_FAILURE_ENVELOPE_HASH_CONFLICT', 'CONCURRENCY', '失败封装已变化。', false, true, { currentEnvelopeHash: incident.envelope_hash });
      if (!['PATCH_ALLOWED', 'REAUTHOR_REQUIRED'].includes(String(incident.disposition))) throw new HarnessError(409, 'I8_REPAIR_DISPOSITION_NOT_PATCHABLE', 'DOMAIN', '该事故只能报告或重试，禁止脚本补丁。', false, true);
      const attemptNo = Number(incident.attempt_count) + 1;
      if (attemptNo > Number(incident.max_attempts)) throw new HarnessError(409, 'I8_REPAIR_ATTEMPT_LIMIT_EXHAUSTED', 'DOMAIN', '三个修复候选已耗尽。', false, true);
      if (incident.classification === 'LOCATOR' && patch.operations.some(item => item.type !== 'TARGET_MAPPING')) throw new HarnessError(409, 'I8_LOCATOR_REPAIR_SCOPE_EXCEEDED', 'CONTRACT', '定位事故只接受受控目标映射。', false, true);
      if (incident.classification === 'ASSERTION' && patch.operations.some(item => item.type !== 'ASSERTION_IMPLEMENTATION')) throw new HarnessError(409, 'I8_ASSERTION_REPAIR_SCOPE_EXCEEDED', 'CONTRACT', '断言事故只接受不弱化契约的实现修复。', false, true);
      const records = db.prepare(`SELECT record_json FROM i8_verified_action_records WHERE executable_plan_id=? ORDER BY ordinal`).all(incident.executable_plan_id).map((item: any) => JSON.parse(String(item.record_json)));
      let candidate;
      try { candidate = buildPatchedCandidatePackage(JSON.parse(String(incident.plan_json)), records, { candidateId: String(incident.base_candidate_id), scriptId: String(incident.base_script_id), scriptVersion: Number(incident.base_script_version), sourceChainHash: String(incident.base_source_chain_hash) }, patch, attemptNo, timestamp); }
      catch (error) { throw new HarnessError(409, error instanceof Error ? error.message : 'I8_PATCH_PROPOSAL_REJECTED', 'CONTRACT', '补丁未通过白名单和不弱化校验。', false, true); }
      const relativeDirectory = `.data/candidates/${input.namespace}/${candidate.candidateId}`;
      const resolved = path.resolve(this.productRoot, ...relativeDirectory.split('/')); const root = path.resolve(this.productRoot, '.data', 'candidates');
      if (!resolved.startsWith(`${root}${path.sep}`)) throw new HarnessError(500, 'I8_REPAIR_DIRECTORY_INVALID', 'ENVIRONMENT', '修复目录越界。');
      fs.mkdirSync(resolved, { recursive: true }); const manifestJson = canonicalJson(candidate.manifest);
      for (const [name, content] of [['script.cjs', candidate.scriptSource], ['manifest.json', manifestJson]] as const) { const target=path.join(resolved,name); if (fs.existsSync(target) && fs.readFileSync(target,'utf8')!==content) throw new HarnessError(409,'I8_REPAIR_FILE_CONFLICT','CONCURRENCY','修复文件冲突。',false,true); if(!fs.existsSync(target)) fs.writeFileSync(target,content,{encoding:'utf8',flag:'wx'}); }
      const proposalId=opaqueId('patch'), batchId=`repairbatch_${sha256(candidate.candidateId).slice(0,40)}`, patchJson=canonicalJson(patch);
      db.prepare(`INSERT INTO i8_script_patch_proposals(proposal_id,namespace,incident_id,envelope_id,base_candidate_id,repair_candidate_id,attempt_no,patch_json,patch_hash,script_id,script_version,dsl_json,dsl_hash,generator_version,relative_directory,script_sha256,manifest_json,manifest_sha256,source_chain_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'STABILITY_QUEUED',1,?,?)`)
        .run(proposalId,input.namespace,input.incidentId,incident.envelope_id,incident.base_candidate_id,candidate.candidateId,attemptNo,patchJson,sha256(patchJson),candidate.scriptId,candidate.scriptVersion,canonicalJson(candidate.dsl),candidate.dslHash,'hengzhun-script-package-builder-1.0.0',relativeDirectory,candidate.scriptHash,manifestJson,candidate.manifestHash,candidate.sourceChainHash,timestamp,timestamp);
      db.prepare(`INSERT INTO i8_repair_stability_batches(batch_id,namespace,proposal_id,repair_candidate_id,status,version,created_at,updated_at) VALUES (?,?,?,?,'QUEUED',1,?,?)`).run(batchId,input.namespace,proposalId,candidate.candidateId,timestamp,timestamp);
      const repairRequiredRuns=Number(incident.stability_required_runs ?? 6); const repairSequences=repairRequiredRuns/I8_STABILITY_VIEWPORTS.length;
      db.prepare(`INSERT INTO i10_stability_policy_bindings(object_type,object_id,policy_version,required_runs,created_at) VALUES ('REPAIR_BATCH',?,?,?,?)`).run(batchId,incident.stability_policy_version,repairRequiredRuns,timestamp);
      const suffix=candidate.candidateId.slice('candidate_'.length); const insertRun=db.prepare(`INSERT INTO i8_repair_stability_runs(validation_run_id,batch_id,repair_candidate_id,viewport_id,viewport_width,viewport_height,sequence_no,fixture_ref,status,created_at) VALUES (?,?,?,?,?,?,?,?,'QUEUED',?)`);
      for(const viewport of I8_STABILITY_VIEWPORTS) for(let sequence=1;sequence<=repairSequences;sequence+=1) insertRun.run(`validation_${suffix}_${viewport.suffix}_${sequence}`,batchId,candidate.candidateId,viewport.viewportId,viewport.width,viewport.height,sequence,`repairfixture_${suffix}_${viewport.suffix}_${sequence}`,timestamp);
      db.prepare(`UPDATE i8_step_failure_envelopes SET attempt_count=?,updated_at=? WHERE envelope_id=?`).run(attemptNo,timestamp,incident.envelope_id); db.prepare(`UPDATE i8_failure_incidents SET status='PATCH_ALLOWED',updated_at=? WHERE incident_id=?`).run(timestamp,input.incidentId);
      return {status:202,objectType:'I8_SCRIPT_PATCH_PROPOSAL',objectId:proposalId,response:{proposalId,incidentId:input.incidentId,repairCandidateId:candidate.candidateId,attemptNo,status:'STABILITY_QUEUED',version:1,scriptId:candidate.scriptId,scriptVersion:candidate.scriptVersion,scriptHash:candidate.scriptHash,manifestHash:candidate.manifestHash,requiredStabilityRuns:repairRequiredRuns,stabilityPolicyVersion:incident.stability_policy_version,activationRequired:true}};
    });
  }

  async claimNextI8RepairStability(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const row = db.prepare(`
        SELECT b.*, p.relative_directory, p.script_sha256, p.manifest_sha256,
               cv.definition_json,
               COALESCE(policy.policy_version, 'I8_2X3_V1') AS stability_policy_version,
               COALESCE(policy.required_runs, 6) AS required_runs
        FROM i8_repair_stability_batches b
        JOIN i8_script_patch_proposals p ON p.proposal_id = b.proposal_id
        LEFT JOIN failure_incidents fi ON fi.incident_id = p.incident_id
        LEFT JOIN runs r ON r.run_id = fi.run_id
        LEFT JOIN case_versions cv ON cv.case_id = r.case_id AND cv.version = r.case_version
        LEFT JOIN i10_stability_policy_bindings policy
          ON policy.object_type = 'REPAIR_BATCH' AND policy.object_id = b.batch_id
        WHERE b.status = 'QUEUED'
        ORDER BY b.created_at, b.batch_id
        LIMIT 1
      `).get() as any;
      if (!row) return { status: 'EMPTY' };
      const leaseExpiresAt = new Date(Date.now() + 600_000).toISOString();
      db.prepare(`UPDATE i8_repair_stability_batches SET status='RUNNING',lease_owner=?,lease_expires_at=?,version=version+1,updated_at=? WHERE batch_id=?`)
        .run(workerId, leaseExpiresAt, timestamp, row.batch_id);
      db.prepare(`UPDATE i8_repair_stability_runs SET status='RUNNING' WHERE batch_id=?`).run(row.batch_id);
      db.prepare(`UPDATE i8_script_patch_proposals SET status='STABILITY_VALIDATING',version=version+1,updated_at=? WHERE proposal_id=?`)
        .run(timestamp, row.proposal_id);
      const runs = db.prepare(`SELECT * FROM i8_repair_stability_runs WHERE batch_id=? ORDER BY viewport_width DESC,sequence_no`)
        .all(row.batch_id) as any[];
      if (runs.length !== Number(row.required_runs)) {
        throw new HarnessError(500, 'I8_REPAIR_STABILITY_RUN_SET_CORRUPT', 'EVIDENCE', '修复稳定性样本集合不完整。');
      }
      const definition = row.definition_json ? JSON.parse(String(row.definition_json)) as Record<string, unknown> : {};
      return {
        status: 'CLAIMED',
        batchId: row.batch_id,
        proposalId: row.proposal_id,
        namespace: row.namespace,
        candidateId: row.repair_candidate_id,
        relativeDirectory: row.relative_directory,
        scriptHash: row.script_sha256,
        manifestHash: row.manifest_sha256,
        credentialAlias: 'i3-customer',
        leaseOwner: workerId,
        leaseExpiresAt,
        stabilityPolicyVersion: row.stability_policy_version,
        requiredRuns: Number(row.required_runs),
        ...(String(row.stability_policy_version) === 'I10_2X2_V1' && typeof definition.credentialRef === 'string' ? { credentialRef: definition.credentialRef } : {}),
        ...(String(row.stability_policy_version) === 'I10_2X2_V1' && typeof definition.entryUrl === 'string' ? { entryUrl: definition.entryUrl } : {}),
        runs: runs.map(run => ({
          validationRunId: run.validation_run_id,
          viewportId: run.viewport_id,
          viewportWidth: run.viewport_width,
          viewportHeight: run.viewport_height,
          sequenceNo: run.sequence_no,
          fixtureRef: run.fixture_ref
        }))
      };
    });
  }


  async completeI8RepairStability(batchId: string, inputValue: I8StabilityCompletionInput): Promise<Record<string, unknown>> {
    const input = i8StabilityCompletionSchema.parse(inputValue);
    if (input.stoppedAfterFailure) {
      throw new HarnessError(409, 'I10_BANK_FAILURE_PREFIX_NOT_ALLOWED', 'CONTRACT', '首次资金失败停止回执不适用于修复稳定性批次。');
    }
    return this.database.write(db => {
      const batch = db.prepare(`
        SELECT b.*, p.script_sha256, p.incident_id, p.attempt_no,
               COALESCE(policy.policy_version,'I8_2X3_V1') stability_policy_version,
               COALESCE(policy.required_runs,6) required_runs
        FROM i8_repair_stability_batches b
        JOIN i8_script_patch_proposals p ON p.proposal_id = b.proposal_id
        LEFT JOIN i10_stability_policy_bindings policy ON policy.object_type='REPAIR_BATCH' AND policy.object_id=b.batch_id
        WHERE b.batch_id = ?
      `).get(batchId) as any;
      if (!batch) {
        throw new HarnessError(404, 'I8_REPAIR_STABILITY_BATCH_NOT_FOUND', 'DOMAIN', '修复稳定性批次不存在。');
      }
      if (batch.status !== 'RUNNING' || batch.lease_owner !== input.workerId ||
          input.candidateId !== batch.repair_candidate_id || input.scriptHash !== batch.script_sha256) {
        throw new HarnessError(409, 'I8_REPAIR_STABILITY_BINDING_INVALID', 'CONCURRENCY', '修复回传绑定无效。', false, true);
      }

      const expected = db.prepare(`SELECT * FROM i8_repair_stability_runs WHERE batch_id = ?`)
        .all(batchId) as Array<Record<string, unknown>>;
      const byId = new Map(input.runs.map(run => [run.validationRunId, run]));
      if (expected.length !== Number(batch.required_runs) || byId.size !== Number(batch.required_runs) || input.runs.length !== Number(batch.required_runs) || expected.some(row => !byId.has(String(row.validation_run_id)))) {
        throw new HarnessError(409, 'I8_REPAIR_STABILITY_RUN_SET_INVALID', 'CONTRACT', '必须回传当前策略规定的完整验证集合。', false, true);
      }

      for (const expectedRun of expected) {
        const actual = byId.get(String(expectedRun.validation_run_id));
        if (!actual || actual.viewportId !== expectedRun.viewport_id ||
            actual.viewportWidth !== Number(expectedRun.viewport_width) ||
            actual.viewportHeight !== Number(expectedRun.viewport_height) ||
            actual.sequenceNo !== Number(expectedRun.sequence_no) ||
            actual.fixtureRef !== expectedRun.fixture_ref) {
          throw new HarnessError(409, 'I8_REPAIR_STABILITY_RUN_IDENTITY_MISMATCH', 'CONTRACT', '修复稳定性样本身份不匹配。', false, true);
        }
      }

      const evidenceRoot = path.resolve(this.productRoot, '.data', 'stability');
      for (const run of input.runs) {
        for (const evidence of run.evidence) {
          const resolved = path.resolve(this.productRoot, ...evidence.relativePath.split('/'));
          if (!resolved.startsWith(`${evidenceRoot}${path.sep}`) || !fs.existsSync(resolved)) {
            throw new HarnessError(409, 'I8_REPAIR_EVIDENCE_MISSING', 'EVIDENCE', '修复证据缺失或越界。', false, true);
          }
          const bytes = fs.readFileSync(resolved);
          if (bytes.byteLength !== evidence.byteLength || sha256(bytes) !== evidence.sha256) {
            throw new HarnessError(409, 'I8_REPAIR_EVIDENCE_HASH_MISMATCH', 'EVIDENCE', '修复证据Hash不匹配。', false, true);
          }
        }
      }

      const assertionHashes = new Set(input.runs.map(run => run.assertionSetHash));
      const evidenceHashes = new Set(input.runs.map(run => run.evidenceSetHash));
      const success = input.runs.every(run => run.outcome === 'PASSED') && assertionHashes.size === 1 && evidenceHashes.size === 1;
      const timestamp = nowIso();
      const update = db.prepare(`
        UPDATE i8_repair_stability_runs
        SET status = ?, duration_ms = ?, assertion_set_hash = ?, evidence_set_hash = ?,
            evidence_json = ?, error_code = ?, completed_at = ?
        WHERE validation_run_id = ? AND batch_id = ? AND status = 'RUNNING'
      `);
      for (const run of input.runs) {
        update.run(run.outcome === 'PASSED' ? 'PASSED' : 'FAILED', run.durationMs, run.assertionSetHash,
          run.evidenceSetHash, canonicalJson(run.evidence), run.errorCode ?? null, timestamp, run.validationRunId, batchId);
      }

      let repairCertificateId: string | undefined;
      if (success) {
        repairCertificateId = opaqueId('repaircert');
        db.prepare(`
          INSERT INTO i8_repair_stability_certificates(
            certificate_id, namespace, proposal_id, batch_id, repair_candidate_id, script_sha256,
            runtime_fingerprint, validation_run_ids_json, assertion_set_hash, evidence_set_hash, status, issued_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?)
        `).run(repairCertificateId, batch.namespace, batch.proposal_id, batchId, batch.repair_candidate_id,
          batch.script_sha256, input.runtimeFingerprint, canonicalJson(input.runs.map(run => run.validationRunId)),
          [...assertionHashes][0], [...evidenceHashes][0], timestamp);
        db.prepare(`INSERT INTO i10_stability_policy_bindings(object_type,object_id,policy_version,required_runs,created_at) VALUES ('REPAIR_CERTIFICATE',?,?,?,?)`)
          .run(repairCertificateId,batch.stability_policy_version,batch.required_runs,timestamp);
      }

      db.prepare(`
        UPDATE i8_repair_stability_batches
        SET status = ?, lease_owner = NULL, lease_expires_at = NULL, runtime_fingerprint = ?,
            assertion_set_hash = ?, evidence_set_hash = ?, error_code = ?, version = version + 1,
            completed_at = ?, updated_at = ?
        WHERE batch_id = ?
      `).run(success ? 'PASSED' : 'FAILED', input.runtimeFingerprint,
        assertionHashes.size === 1 ? [...assertionHashes][0] : null,
        evidenceHashes.size === 1 ? [...evidenceHashes][0] : null,
        success ? null : 'I8_REPAIR_STABILITY_FAILED', timestamp, timestamp, batchId);
      db.prepare(`UPDATE i8_script_patch_proposals SET status = ?, version = version + 1, updated_at = ? WHERE proposal_id = ?`)
        .run(success ? 'WAITING_USER' : 'VALIDATION_FAILED', timestamp, batch.proposal_id);
      db.prepare(`UPDATE i8_failure_incidents SET status = ?, updated_at = ? WHERE incident_id = ?`)
        .run(success ? 'WAITING_USER' : 'PATCH_ALLOWED', timestamp, batch.incident_id);

      let contextLevel: 'CTX-L1' | 'CTX-L2' | 'CTX-L3' = 'CTX-L1';
      if (!success) {
        contextLevel = Number(batch.attempt_no) >= 2 ? 'CTX-L3' : 'CTX-L2';
        const prior = db.prepare(`
          SELECT envelope_json, attempt_count, max_attempts
          FROM i8_step_failure_envelopes
          WHERE incident_id = ?
          ORDER BY CASE context_level WHEN 'CTX-L3' THEN 3 WHEN 'CTX-L2' THEN 2 ELSE 1 END DESC
          LIMIT 1
        `).get(batch.incident_id) as any;
        const payload = {
          ...JSON.parse(String(prior.envelope_json)),
          contextLevel,
          attemptCount: Number(batch.attempt_no),
          adjacentFailureSummary: {
            proposalId: batch.proposal_id,
            repairCandidateId: batch.repair_candidate_id,
            batchId,
            failedRunCount: input.runs.filter(run => run.outcome === 'FAILED').length,
            errorCodes: [...new Set(input.runs.map(run => run.errorCode).filter(Boolean))].sort(),
            assertionSetConsistent: assertionHashes.size === 1,
            evidenceSetConsistent: evidenceHashes.size === 1
          }
        };
        const envelopeJson = canonicalJson(payload);
        db.prepare(`
          INSERT OR IGNORE INTO i8_step_failure_envelopes(
            envelope_id, namespace, incident_id, stage, context_level, envelope_json, envelope_hash,
            attempt_count, max_attempts, created_at, updated_at
          ) VALUES (?, ?, ?, 'FORMAL_RUN', ?, ?, ?, ?, ?, ?, ?)
        `).run(opaqueId('failureenv'), batch.namespace, batch.incident_id, contextLevel, envelopeJson,
          sha256(envelopeJson), Number(batch.attempt_no), Number(prior.max_attempts), timestamp, timestamp);
      }

      return {
        batchId,
        proposalId: batch.proposal_id,
        repairCandidateId: batch.repair_candidate_id,
        status: success ? 'PASSED' : 'FAILED',
        passedRuns: input.runs.filter(run => run.outcome === 'PASSED').length,
        requiredRuns: Number(batch.required_runs),
        stabilityPolicyVersion: batch.stability_policy_version,
        contextLevel,
        nextAction: success ? 'HUMAN_REPAIR_DECISION_REQUIRED' : 'REPAIR_PROPOSAL_REQUIRED'
      };
    });
  }

  async decideI8Repair(input: I8RepairDecisionInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_repair_decision', input.idempotencyKey, input, context, (db, timestamp) => {
      const proposal = db.prepare(`SELECT p.*, cert.certificate_id, ep.case_id, ep.case_version
        FROM i8_script_patch_proposals p
        JOIN i8_repair_stability_certificates cert ON cert.proposal_id = p.proposal_id
        JOIN i8_script_candidates base ON base.candidate_id = p.base_candidate_id
        JOIN i8_executable_plans ep ON ep.executable_plan_id = base.executable_plan_id
        WHERE p.namespace = ? AND p.proposal_id = ?`).get(input.namespace, input.proposalId) as any;
      if (!proposal) throw new HarnessError(409, 'I8_REPAIR_CERTIFICATE_REQUIRED', 'EVIDENCE', '修复候选未取得当前策略要求的稳定性证书。', false, true);
      if (proposal.version !== input.expectedProposalVersion) throw new HarnessError(409, 'I8_REPAIR_PROPOSAL_VERSION_CONFLICT', 'CONCURRENCY', '修复提案版本已变化。', false, true, { currentVersion: proposal.version });
      if (proposal.status !== 'WAITING_USER') throw new HarnessError(409, 'I8_REPAIR_DECISION_NOT_ALLOWED', 'DOMAIN', '当前不接受人工决定。', false, true);
      let activatedPlanId: string | null = null;
      if (input.choice === 'ACTIVATE') {
        const relativePath = `${proposal.relative_directory}/script.cjs`;
        const configuration = canonicalJson({ mode: 'I8_CANDIDATE', candidateId: proposal.repair_candidate_id, relativeDirectory: proposal.relative_directory, scriptHash: proposal.script_sha256, manifestHash: proposal.manifest_sha256 });
        const existing = db.prepare('SELECT sha256 FROM script_versions WHERE script_id = ? AND version = ?').get(proposal.script_id, proposal.script_version) as any;
        if (existing && existing.sha256 !== proposal.script_sha256) throw new HarnessError(409, 'I8_REPAIR_SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '修复脚本版本冲突。', false, true);
        if (!existing) db.prepare(`INSERT INTO script_versions(script_id, version, relative_path, sha256, validation_status, configuration_json, source_sha256, created_at) VALUES (?, ?, ?, ?, 'PASSED', ?, ?, ?)`)
          .run(proposal.script_id, proposal.script_version, relativePath, proposal.script_sha256, configuration, proposal.script_sha256, timestamp);
        db.prepare(`UPDATE scripts SET current_version = ?, status = 'SCRIPT_VALIDATED', updated_at = ? WHERE script_id = ?`).run(proposal.script_version, timestamp, proposal.script_id);
        activatedPlanId = `plan_i8_repair_${sha256(proposal.repair_candidate_id).slice(0, 40)}`;
        const summary = canonicalJson({ source: 'I8_RESTRICTED_REPAIR', proposalId: proposal.proposal_id, repairCandidateId: proposal.repair_candidate_id, certificateId: proposal.certificate_id, scriptHash: proposal.script_sha256, formalRegression: true });
        const repairPlanVersion = Number((db.prepare(`SELECT MAX(version) maximum FROM plans WHERE namespace = ? AND case_id = ? AND case_version = ?`).get(input.namespace, proposal.case_id, proposal.case_version) as any)?.maximum ?? 0) + 1;
        db.prepare(`INSERT INTO plans(plan_id, namespace, case_id, case_version, version, status, summary_json, content_hash, created_at, script_id, full_action_plan_json) VALUES (?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, NULL)`)
          .run(activatedPlanId, input.namespace, proposal.case_id, proposal.case_version, repairPlanVersion, summary, sha256(summary), timestamp, proposal.script_id);
      }
      const decisionId = opaqueId('repairdecision');
      db.prepare(`INSERT INTO i8_repair_decisions(decision_id, namespace, proposal_id, expected_proposal_version, choice, reason, confirmation_ref, activated_plan_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(decisionId, input.namespace, input.proposalId, input.expectedProposalVersion, input.choice, input.reason, input.confirmationRef, activatedPlanId, timestamp);
      db.prepare(`UPDATE i8_script_patch_proposals SET status = ?, version = version + 1, updated_at = ? WHERE proposal_id = ?`).run(input.choice === 'ACTIVATE' ? 'ACTIVATED' : 'REJECTED', timestamp, input.proposalId);
      db.prepare(`UPDATE i8_failure_incidents SET status = ?, updated_at = ? WHERE incident_id = ?`).run(input.choice === 'ACTIVATE' ? 'RESOLVED' : 'REJECTED', timestamp, proposal.incident_id);
      return { status: 200, objectType: 'I8_REPAIR_DECISION', objectId: decisionId, response: { decisionId, proposalId: input.proposalId, choice: input.choice, status: 'RECORDED', activatedPlanId, scriptId: proposal.script_id, scriptVersion: proposal.script_version, rerunRequired: input.choice === 'ACTIVATE', scheduleMigrationRequired: false } };
    });
  }

  getFailureIncident(namespace: string, incidentId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT fi.*, rc.candidate_id, rc.status AS candidate_status, rc.version AS candidate_version
        FROM failure_incidents fi
        LEFT JOIN repair_candidates rc ON rc.incident_id = fi.incident_id
        WHERE fi.namespace = ? AND fi.incident_id = ?
        ORDER BY rc.created_at DESC LIMIT 1
      `).get(namespace, incidentId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'FAILURE_INCIDENT_NOT_FOUND', 'DOMAIN', '失败事故不存在。');
      return {
        incidentId: row.incident_id,
        runId: row.run_id,
        caseId: row.case_id,
        scriptId: row.script_id,
        scriptVersion: row.script_version,
        classification: row.classification,
        reasonCode: row.reason_code,
        summary: row.summary,
        evidenceArtifactId: row.evidence_artifact_id,
        diagnosticStatus: row.diagnostic_status,
        diagnosis: row.diagnosis_json ? JSON.parse(String(row.diagnosis_json)) : null,
        version: row.version,
        candidate: row.candidate_id ? {
          candidateId: row.candidate_id,
          status: row.candidate_status,
          version: row.candidate_version
        } : null,
        updatedAt: row.updated_at
      };
    });
  }

  async createRepairCandidate(input: RepairCandidateCreateInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'repair_candidate_create', input.idempotencyKey, input, context, (db, timestamp) => {
      const incident = db.prepare(`
        SELECT fi.*, s.current_version, sv.relative_path, sv.sha256 AS source_sha256
        FROM failure_incidents fi
        JOIN scripts s ON s.script_id = fi.script_id
        JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
        WHERE fi.namespace = ? AND fi.incident_id = ?
      `).get(input.namespace, input.incidentId) as Record<string, unknown> | undefined;
      if (!incident) throw new HarnessError(404, 'FAILURE_INCIDENT_NOT_FOUND', 'DOMAIN', '失败事故不存在。');
      if (incident.classification !== 'LOCATOR') {
        throw new HarnessError(409, 'REPAIR_CLASSIFICATION_UNSUPPORTED', 'DOMAIN', '首版隔离修复只接受已分类的定位器失效。', false, true);
      }
      if (Number(incident.current_version) !== Number(incident.script_version)) {
        throw new HarnessError(409, 'SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '事故对应的脚本版本已不是当前版本。', false, true, { currentVersion: incident.current_version });
      }
      const existing = db.prepare(`
        SELECT candidate_id, status, version FROM repair_candidates
        WHERE incident_id = ? AND status IN ('VALIDATION_QUEUED', 'VALIDATING', 'WAITING_USER', 'ACTIVE')
        ORDER BY created_at DESC LIMIT 1
      `).get(input.incidentId) as { candidate_id: string; status: string; version: number } | undefined;
      if (existing) {
        return {
          status: 200,
          objectType: 'REPAIR_CANDIDATE',
          objectId: existing.candidate_id,
          response: { candidateId: existing.candidate_id, status: existing.status, version: existing.version, reused: true }
        };
      }
      const repair = LOCATOR_REPAIRS[String(incident.reason_code)];
      if (!repair) {
        db.prepare(`
          UPDATE failure_incidents SET diagnostic_status = 'UNRESOLVED', diagnosis_json = ?,
            version = version + 1, updated_at = ? WHERE incident_id = ?
        `).run(canonicalJson({ outcome: 'NO_ALLOWLISTED_REPAIR', reasonCode: incident.reason_code }), timestamp, input.incidentId);
        throw new HarnessError(409, 'REPAIR_TEMPLATE_UNAVAILABLE', 'DOMAIN', '没有与该失败代码匹配的受控修复模板。', false, true);
      }
      const candidateId = opaqueId('candidate');
      const jobId = opaqueId('repairjob');
      const allocated = db.prepare(`
        SELECT MAX(version_value) AS maximum FROM (
          SELECT version AS version_value FROM script_versions WHERE script_id = ?
          UNION ALL
          SELECT candidate_script_version AS version_value FROM repair_candidates WHERE script_id = ?
        )
      `).get(incident.script_id, incident.script_id) as { maximum: number | null };
      const candidateScriptVersion = Number(allocated.maximum ?? incident.current_version) + 1;
      const patch = {
        schemaVersion: 'i5-locator-override-v1',
        targetRef: repair.targetRef,
        selectorOverrides: { [repair.targetRef]: repair.selector },
        diagnosisCode: incident.reason_code
      };
      const patchJson = canonicalJson(patch);
      const diagnosis = {
        classification: 'LOCATOR',
        reasonCode: incident.reason_code,
        strategy: 'ALLOWLISTED_LOCATOR_OVERRIDE',
        targetRef: repair.targetRef,
        requiresIsolatedValidation: true,
        requiresUserActivation: true
      };
      db.prepare(`
        INSERT INTO repair_candidates(
          candidate_id, namespace, incident_id, script_id, base_script_version,
          candidate_script_version, patch_type, patch_json, patch_hash, risk_level,
          status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'LOCATOR_OVERRIDE', ?, ?, 'MEDIUM', 'VALIDATION_QUEUED', 1, ?, ?)
      `).run(
        candidateId, input.namespace, input.incidentId, incident.script_id, incident.current_version,
        candidateScriptVersion, patchJson, sha256(patchJson), timestamp, timestamp
      );
      db.prepare(`
        INSERT INTO repair_validation_jobs(job_id, namespace, candidate_id, status, credential_alias, created_at, updated_at)
        VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)
      `).run(jobId, input.namespace, candidateId, input.credentialAlias, timestamp, timestamp);
      db.prepare(`
        UPDATE failure_incidents SET diagnostic_status = 'DIAGNOSED', diagnosis_json = ?,
          version = version + 1, updated_at = ? WHERE incident_id = ?
      `).run(canonicalJson(diagnosis), timestamp, input.incidentId);
      return {
        status: 200,
        objectType: 'REPAIR_CANDIDATE',
        objectId: candidateId,
        response: {
          candidateId,
          jobId,
          status: 'VALIDATION_QUEUED',
          version: 1,
          riskLevel: 'MEDIUM',
          diagnosis,
          activationRequired: true
        }
      };
    });
  }

  async claimNextRepairValidation(workerId: string, leaseSeconds = 300): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE repair_validation_jobs SET status = 'QUEUED', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      db.prepare(`
        UPDATE repair_candidates SET status = 'VALIDATION_QUEUED', version = version + 1, updated_at = ?
        WHERE status = 'VALIDATING' AND candidate_id IN (
          SELECT candidate_id FROM repair_validation_jobs WHERE status = 'QUEUED'
        )
      `).run(timestamp);
      const row = db.prepare(`
        SELECT j.job_id, j.namespace, j.candidate_id, j.credential_alias,
               rc.patch_json, rc.patch_hash, rc.script_id, rc.base_script_version,
               fi.run_id, fi.case_id, r.case_version, p.plan_id,
               sv.relative_path
        FROM repair_validation_jobs j
        JOIN repair_candidates rc ON rc.candidate_id = j.candidate_id
        JOIN failure_incidents fi ON fi.incident_id = rc.incident_id
        JOIN runs r ON r.run_id = fi.run_id
        JOIN plans p ON p.plan_id = r.plan_id
        JOIN script_versions sv ON sv.script_id = rc.script_id AND sv.version = rc.base_script_version
        WHERE j.status = 'QUEUED'
        ORDER BY j.created_at ASC LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      db.prepare(`
        UPDATE repair_validation_jobs SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?,
          attempt_count = attempt_count + 1, updated_at = ? WHERE job_id = ? AND status = 'QUEUED'
      `).run(workerId, leaseExpiresAt, timestamp, row.job_id);
      db.prepare(`UPDATE repair_candidates SET status = 'VALIDATING', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
        .run(timestamp, row.candidate_id);
      const patch = JSON.parse(String(row.patch_json)) as { selectorOverrides: Record<string, string> };
      return {
        status: 'CLAIMED',
        jobId: row.job_id,
        candidateId: row.candidate_id,
        namespace: row.namespace,
        runId: row.run_id,
        caseId: row.case_id,
        caseVersion: row.case_version,
        planId: row.plan_id,
        execution: {
          credentialAlias: row.credential_alias,
          fixtureNamespace: `repair-${String(row.candidate_id).slice(-20)}`,
          scriptId: row.script_id,
          scriptPath: row.relative_path,
          selectorOverrides: patch.selectorOverrides,
          isolationMode: 'FRESH_BROWSER_CONTEXT_NO_COMMIT'
        },
        patchHash: row.patch_hash,
        leaseExpiresAt
      };
    });
  }

  async completeRepairValidation(jobId: string, input: RepairWorkerCompletionInput): Promise<Record<string, unknown>> {
    const job = this.database.read(db => db.prepare(`
      SELECT j.*, rc.candidate_id, rc.incident_id, fi.run_id
      FROM repair_validation_jobs j
      JOIN repair_candidates rc ON rc.candidate_id = j.candidate_id
      JOIN failure_incidents fi ON fi.incident_id = rc.incident_id
      WHERE j.job_id = ?
    `).get(jobId) as Record<string, unknown> | undefined);
    if (!job) throw new HarnessError(404, 'REPAIR_JOB_NOT_FOUND', 'DOMAIN', '修复验证任务不存在。');
    if (job.status !== 'RUNNING' || job.lease_owner !== input.workerId || String(job.lease_expires_at) < nowIso()) {
      throw new HarnessError(409, 'REPAIR_JOB_LEASE_CONFLICT', 'CONCURRENCY', '修复验证租约已失效。', false, true);
    }
    if (input.outcome === 'PASSED' && input.evidence.length < 3) {
      throw new HarnessError(400, 'REPAIR_EVIDENCE_INCOMPLETE', 'EVIDENCE', '候选通过必须包含报告、截图和日志。');
    }
    const artifacts: Record<string, unknown>[] = [];
    for (const evidence of input.evidence) {
      artifacts.push(await this.artifacts.create({
        namespace: String(job.namespace),
        runId: String(job.run_id),
        artifactType: evidence.artifactType,
        mediaType: evidence.mediaType,
        redactionStatus: evidence.redactionStatus,
        extension: evidence.extension,
        content: Buffer.from(evidence.base64Content, 'base64'),
        metadata: { ...evidence.metadata, repairCandidateId: job.candidate_id, isolatedValidation: true }
      }));
    }
    const resultArtifact = artifacts.find(item => item.type === 'REPORT') ?? artifacts[0];
    const passed = input.outcome === 'PASSED';
    const timestamp = nowIso();
    await this.database.write(db => {
      db.prepare(`
        UPDATE repair_validation_jobs SET status = ?, summary = ?, lease_owner = NULL,
          lease_expires_at = NULL, completed_at = ?, updated_at = ? WHERE job_id = ?
      `).run(passed ? 'PASSED' : 'FAILED', input.summary, timestamp, timestamp, jobId);
      db.prepare(`
        UPDATE repair_candidates SET status = ?, validation_artifact_id = ?,
          version = version + 1, updated_at = ? WHERE candidate_id = ?
      `).run(passed ? 'WAITING_USER' : 'VALIDATION_FAILED', resultArtifact?.artifactId ?? null, timestamp, job.candidate_id);
      db.prepare(`
        UPDATE failure_incidents SET diagnostic_status = ?, version = version + 1, updated_at = ? WHERE incident_id = ?
      `).run(passed ? 'CANDIDATE_READY' : 'UNRESOLVED', timestamp, job.incident_id);
      db.prepare(`
        INSERT INTO audit_events(
          event_id, namespace, run_id, actor_type, action, object_type, object_id,
          outcome, correlation_id, details_json, created_at
        ) VALUES (?, ?, ?, 'WORKER', 'repair.validate', 'REPAIR_CANDIDATE', ?, ?, ?, ?, ?)
      `).run(
        opaqueId('evt'), job.namespace, job.run_id, job.candidate_id,
        passed ? 'SUCCEEDED' : 'FAILED', opaqueId('worker'),
        canonicalJson({ jobId, artifactIds: artifacts.map(item => item.artifactId), isolated: true }), timestamp
      );
    });
    return {
      jobId,
      candidateId: job.candidate_id,
      status: passed ? 'WAITING_USER' : 'VALIDATION_FAILED',
      activationRequired: passed,
      resultArtifactId: resultArtifact?.artifactId ?? null
    };
  }

  getRepairCandidate(namespace: string, candidateId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT rc.*, j.job_id, j.status AS validation_status, j.summary AS validation_summary
        FROM repair_candidates rc
        JOIN repair_validation_jobs j ON j.candidate_id = rc.candidate_id
        WHERE rc.namespace = ? AND rc.candidate_id = ?
      `).get(namespace, candidateId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'REPAIR_CANDIDATE_NOT_FOUND', 'DOMAIN', '修复候选不存在。');
      return {
        candidateId: row.candidate_id,
        incidentId: row.incident_id,
        scriptId: row.script_id,
        baseScriptVersion: row.base_script_version,
        candidateScriptVersion: row.candidate_script_version,
        patchType: row.patch_type,
        patch: JSON.parse(String(row.patch_json)),
        patchHash: row.patch_hash,
        riskLevel: row.risk_level,
        status: row.status,
        version: row.version,
        validation: {
          jobId: row.job_id,
          status: row.validation_status,
          summary: row.validation_summary,
          artifactId: row.validation_artifact_id
        },
        activationRequired: row.status === 'WAITING_USER',
        updatedAt: row.updated_at
      };
    });
  }

  getTask(namespace: string, taskId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT t.*, r.version AS run_version, r.status AS run_status, fi.incident_id, fi.classification AS failure_classification
        FROM tasks t
        LEFT JOIN runs r ON r.run_id = t.run_id
        LEFT JOIN failure_incidents fi ON fi.run_id = t.run_id
        WHERE t.namespace = ? AND t.task_id = ?
      `).get(namespace, taskId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'TASK_NOT_FOUND', 'DOMAIN', '任务不存在。');
      // RF-002-S2 (G1): active verification challenge gate for this task
      const gate = db.prepare(`
        SELECT challenge_id, status, verification_type, version, user_preparation
        FROM i10_verification_challenges
        WHERE namespace = ? AND task_ref = ? AND status IN ('WAITING_USER_PREPARATION','WAITING_USER_ACTION')
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(namespace, taskId, nowIso()) as { challenge_id: string; status: string; verification_type: string; version: number; user_preparation: string } | undefined;
      const gatePresent = Boolean(gate);
      return {
        taskId: row.task_id,
        runId: row.run_id,
        caseId: row.case_id,
        type: row.task_type,
        status: row.status,
        progress: row.progress,
        version: row.version,
        runVersion: row.run_version,
        outcome: row.run_status === 'PASSED' || row.run_status === 'FAILED' || row.run_status === 'BLOCKED' ? row.run_status : null,
        summary: row.result_summary,
        resultArtifactId: row.result_artifact_id,
        errorCode: row.error_code,
        errorCategory: row.error_category,
        incidentId: row.incident_id,
        failureClassification: row.failure_classification,
        retryable: Boolean(row.retryable),
        userActionRequired: Boolean(row.user_action_required),
        updatedAt: row.updated_at,
        // RF-002-S2 (G1): omitted when no active challenge (never null)
        ...(gate
          ? { verificationGate: {
              challengeId: gate.challenge_id,
              status: gate.status,
              kind: gate.verification_type,
              version: Number(gate.version),
              verificationType: gate.verification_type,
              userPreparation: gate.user_preparation,
              resumeAllowed: gate.status === 'WAITING_USER_ACTION'
            } }
          : {}),
        // RF-002-S2 (G3): Harness-owned terminal semantics (WAITING_USER is an
        // MCP projection and is represented here by the verification gate)
        terminal: Boolean(gate) || ['SUCCEEDED', 'FAILED', 'WAITING_USER', 'CANCELLED'].includes(String(row.status)) || row.run_status === 'BLOCKED'
      };
    });
  }

  async repeatValidatedJourney(input: JourneyPrepareInput, context: RequestContext): Promise<Record<string, unknown>> {
    this.verifyJourneyEvidence(input.namespace,input.validatedJourneyId!);
    return this.i10.prepareJourney(input,context);
  }

  async recordFeedback(input: FeedbackRecordInput): Promise<Record<string, unknown>> {
    const parsed = feedbackRecordSchema.parse(input);
    return this.database.write(db => {
      const source = db.prepare(`SELECT fi.run_id,fi.classification,r.status,r.release_identity_hash,
        c.dsl_version,c.dsl_json,c.candidate_id,c.script_sha256,c.manifest_sha256,r.task_id,ep.plan_json FROM failure_incidents fi
        JOIN runs r ON r.run_id=fi.run_id AND r.namespace=fi.namespace AND r.case_id=fi.case_id
        JOIN tasks t ON t.task_id=r.task_id AND t.run_id=r.run_id AND t.status='FAILED'
        JOIN i8_script_candidates c ON c.candidate_id=r.candidate_id AND c.namespace=fi.namespace
          AND c.script_id=fi.script_id AND c.script_version=fi.script_version
        JOIN i8_executable_plans ep ON ep.executable_plan_id=c.executable_plan_id AND ep.namespace=fi.namespace
        WHERE fi.namespace=? AND fi.incident_id=?`).get(parsed.namespace,parsed.incidentId) as {
          run_id: string; classification: string; status: string; release_identity_hash: string;
          dsl_version: string; dsl_json: string; plan_json: string;
          candidate_id:string;script_sha256:string;manifest_sha256:string;task_id:string;
        } | undefined;
      if (!source || source.status !== 'FAILED' || source.classification !== (parsed.correction.type==='TARGET_MAPPING'?'LOCATOR':'ASSERTION'))
        throw new HarnessError(409,parsed.correction.type==='TARGET_MAPPING'?'FEEDBACK_FAILED_LOCATOR_SOURCE_REQUIRED':'FEEDBACK_FAILED_ASSERTION_SOURCE_REQUIRED','EVIDENCE','反馈必须绑定相应类型的原失败事故。',false,true);
      if (!this.releaseIdentityHash || source.release_identity_hash !== this.releaseIdentityHash)
        throw new HarnessError(409,'FEEDBACK_SOURCE_IDENTITY_MISMATCH','EVIDENCE','反馈源身份与当前身份不一致。',false,true);
      const plan = JSON.parse(source.plan_json);
      const binding = resolveTargetAdapterBinding(plan.targetProfileSnapshot?.adapterBinding);
      if (!binding || typeof plan.fixtureProfile !== 'string')
        throw new HarnessError(409,'FEEDBACK_TARGET_BINDING_REQUIRED','CONTRACT','原计划缺少明确目标适配器及场景绑定。',false,true);
      const dsl = JSON.parse(source.dsl_json);
      const correctionInput=parsed.correction;
      if (correctionInput.type==='TARGET_MAPPING' && !dsl.steps.some((step: { targetRef?: string }) => step.targetRef === correctionInput.targetRef))
        throw new HarnessError(409,'FEEDBACK_TARGET_NOT_IN_SOURCE','CONTRACT','纠正目标不在原冻结脚本中。',false,true);
      if(correctionInput.type==='ASSERTION_IMPLEMENTATION') {
        const step=dsl.steps.find((item:{stepId:string})=>item.stepId===correctionInput.stepId);
        const expectedOperation=correctionInput.implementation==='EXACT_TEXT'?'expectText':'expectEqual';
        if(!step || step.operation!==expectedOperation)
          throw new HarnessError(409,'FEEDBACK_ASSERTION_IMPLEMENTATION_MISMATCH','CONTRACT','纠正必须保持原断言操作和目标。',false,true);
        const reports=(db.prepare('SELECT artifact_id FROM artifacts WHERE namespace=? AND run_id=? AND task_id=?')
          .all(parsed.namespace,source.run_id,source.task_id) as Array<{artifact_id:string}>)
          .map(item=>this.artifacts.verifyIntegrity(parsed.namespace,item.artifact_id))
          .filter(item=>(item.metadata as Record<string,unknown>).evidenceKind==='REPORT');
        if(reports.length!==1)throw new HarnessError(409,'FEEDBACK_ASSERTION_REPORT_REQUIRED','EVIDENCE','需唯一原正式失败报告。',false,true);
        const bytes=this.artifacts.read(parsed.namespace,String(reports[0]!.artifactId)).content;
        let report;try{report=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
        const failed=Array.isArray(report.assertions)?report.assertions.filter((item:{passed:boolean})=>item.passed===false):[];
        if(report.schemaVersion!=='i8-formal-run-report-v1'||report.runId!==source.run_id||report.taskId!==source.task_id||
          report.passed!==false||report.candidateId!==source.candidate_id||report.scriptHash!==source.script_sha256||
          report.manifestHash!==source.manifest_sha256||failed.length!==1||failed[0].stepId!==step.stepId||failed[0].operation!==expectedOperation)
          throw new HarnessError(409,'FEEDBACK_ASSERTION_REPORT_MISMATCH','EVIDENCE','纠正未绑定原报告中的唯一失败断言。',false,true);
      }
      const correction = canonicalJson(parsed.correction);
      const existing = db.prepare('SELECT feedback_id,incident_id,correction_json,status FROM reviewed_feedback WHERE namespace=? AND confirmation_ref=?')
        .get(parsed.namespace,parsed.confirmationRef) as {feedback_id:string;incident_id:string;correction_json:string;status:string}|undefined;
      if (existing) {
        if (existing.incident_id !== parsed.incidentId || existing.correction_json !== correction)
          throw new HarnessError(409,'FEEDBACK_CONFIRMATION_CONFLICT','CONCURRENCY','同一确认引用不能覆盖原反馈。',false,true);
        return {feedbackId:existing.feedback_id,status:existing.status,deduplicated:true};
      }
      const feedbackId = opaqueId('feedback');
      db.prepare(`INSERT INTO reviewed_feedback(feedback_id,namespace,incident_id,source_run_id,release_identity_hash,
        confirmation_ref,adapter_binding_json,dsl_version,fixture_profile,correction_json,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'PENDING_VERIFICATION',?)`).run(feedbackId,parsed.namespace,parsed.incidentId,
          source.run_id,this.releaseIdentityHash,parsed.confirmationRef,canonicalJson(binding),source.dsl_version,
          plan.fixtureProfile,correction,nowIso());
      return {feedbackId,status:'PENDING_VERIFICATION',deduplicated:false};
    });
  }

  async verifyFeedback(input: FeedbackVerifyInput): Promise<Record<string, unknown>> {
    const parsed = feedbackVerifySchema.parse(input);
    return this.database.write(db => {
      const feedback = db.prepare('SELECT * FROM reviewed_feedback WHERE namespace=? AND feedback_id=?')
        .get(parsed.namespace,parsed.feedbackId) as Record<string,unknown>|undefined;
      if (!feedback) throw new HarnessError(404,'FEEDBACK_NOT_FOUND','DOMAIN','反馈不存在。');
      if (feedback.release_identity_hash !== this.releaseIdentityHash)
        throw new HarnessError(409,'FEEDBACK_SOURCE_IDENTITY_MISMATCH','EVIDENCE','反馈源身份已过期。',false,true);
      if (feedback.verification_journey_id && feedback.verification_journey_id !== parsed.verificationJourneyId)
        throw new HarnessError(409,'FEEDBACK_VERIFICATION_CONFLICT','CONCURRENCY','核验引用不可覆盖。',false,true);
      const proof = this.verifyJourneyEvidence(parsed.namespace,parsed.verificationJourneyId);
      if (proof.runId === feedback.source_run_id)
        throw new HarnessError(409,'FEEDBACK_INDEPENDENT_RUN_REQUIRED','EVIDENCE','不能用原运行证明纠正。',false,true);
      const repair = db.prepare(`SELECT p.*,base.dsl_json AS original_dsl,base.dsl_version AS original_dsl_version,
        ep.plan_json AS original_plan FROM i8_script_patch_proposals p
        JOIN runs original ON original.run_id=? AND original.namespace=p.namespace
          AND original.status='FAILED' AND original.release_identity_hash=?
        JOIN i8_script_candidates base ON base.candidate_id=original.candidate_id AND base.candidate_id=p.base_candidate_id
        JOIN i8_executable_plans ep ON ep.executable_plan_id=base.executable_plan_id
        JOIN runs verified ON verified.run_id=? AND verified.namespace=p.namespace
          AND verified.candidate_id=p.repair_candidate_id AND verified.case_id=original.case_id
          AND verified.case_version=original.case_version
        JOIN tasks t ON t.task_id=verified.task_id
          AND json_extract(t.payload_json,'$.scriptId')=p.script_id
          AND json_extract(t.payload_json,'$.scriptVersion')=p.script_version
          AND json_extract(t.payload_json,'$.scriptHash')=p.script_sha256
        JOIN i8_repair_stability_certificates cert ON cert.proposal_id=p.proposal_id
          AND cert.status='PASSED' AND cert.script_sha256=p.script_sha256
        JOIN i8_repair_stability_batches batch ON batch.batch_id=cert.batch_id AND batch.status='PASSED'
        JOIN i8_repair_decisions decision ON decision.proposal_id=p.proposal_id AND decision.choice='ACTIVATE'
          AND decision.activated_plan_id=verified.plan_id
        WHERE p.namespace=? AND p.incident_id=? AND p.status='ACTIVATED'`)
        .get(feedback.source_run_id,this.releaseIdentityHash,proof.runId,parsed.namespace,feedback.incident_id) as Record<string,unknown>|undefined;
      if (!repair) throw new HarnessError(409,'FEEDBACK_VERIFIED_REPAIR_REQUIRED','EVIDENCE','需原候选的已激活、持证修复及独立运行。',false,true);
      const patch = scriptPatchProposalSchema.parse(JSON.parse(String(repair.patch_json)));
      const correction = JSON.parse(String(feedback.correction_json));
      if (patch.operations.length !== 1 || canonicalJson(patch.operations[0]) !== canonicalJson(correction) ||
        canonicalJson(JSON.parse(String(repair.dsl_json))) !== canonicalJson(JSON.parse(String(repair.original_dsl))))
        throw new HarnessError(409,'FEEDBACK_CORRECTION_OR_GOAL_CHANGED','CONTRACT','纠正不一致或业务/断言被修改。',false,true);
      const plan = JSON.parse(String(repair.original_plan));
      if (canonicalJson(resolveTargetAdapterBinding(plan.targetProfileSnapshot?.adapterBinding)) !== feedback.adapter_binding_json ||
        plan.fixtureProfile !== feedback.fixture_profile || repair.original_dsl_version !== feedback.dsl_version)
        throw new HarnessError(409,'FEEDBACK_TARGET_BINDING_MISMATCH','CONTRACT','目标或合同不匹配。',false,true);
      const directory = path.resolve(this.productRoot,String(repair.relative_directory));
      const relative = path.relative(this.productRoot,directory);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
        throw new HarnessError(409,'FEEDBACK_REPAIR_ARTIFACT_INVALID','EVIDENCE','修复目录越界。',false,true);
      const scriptPath=path.join(directory,'script.cjs'),manifestPath=path.join(directory,'manifest.json');
      if (!fs.existsSync(scriptPath) || !fs.existsSync(manifestPath) ||
        sha256(fs.readFileSync(scriptPath)) !== repair.script_sha256 || sha256(fs.readFileSync(manifestPath)) !== repair.manifest_sha256)
        throw new HarnessError(409,'FEEDBACK_REPAIR_ARTIFACT_INVALID','EVIDENCE','修复制品字节不匹配。',false,true);
      if(correction.type==='ASSERTION_IMPLEMENTATION') {
        const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
        const embedded=fs.readFileSync(scriptPath,'utf8').match(/^const PACKAGE = Object\.freeze\((.*)\)$/m);
        const sourcePackage=embedded?JSON.parse(embedded[1]!):null;
        if(manifest.assertionImplementations?.[correction.stepId]!==correction.implementation||
          sourcePackage?.assertionImplementations?.[correction.stepId]!==correction.implementation||
          canonicalJson(sourcePackage.dsl)!==canonicalJson(JSON.parse(String(repair.original_dsl)))||
          canonicalJson(sourcePackage.fixtures)!==canonicalJson(plan.fixtureValues))
          throw new HarnessError(409,'FEEDBACK_ASSERTION_EXECUTION_REQUIRED','EVIDENCE','修复制品必须实际绑定原断言目标及精确实现。',false,true);
      }
      db.prepare("UPDATE reviewed_feedback SET status='VERIFIED',verification_journey_id=? WHERE feedback_id=? AND status='PENDING_VERIFICATION'")
        .run(parsed.verificationJourneyId,parsed.feedbackId);
      return {feedbackId:parsed.feedbackId,status:'VERIFIED',verificationJourneyId:parsed.verificationJourneyId,
        verificationRunId:proof.runId,deduplicated:feedback.status==='VERIFIED'};
    });
  }

  getFeedback(namespace: string, feedbackId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row=db.prepare('SELECT * FROM reviewed_feedback WHERE namespace=? AND feedback_id=?').get(namespace,feedbackId) as Record<string,unknown>|undefined;
      if(!row)throw new HarnessError(404,'FEEDBACK_NOT_FOUND','DOMAIN','反馈不存在。');
      const consumptionRows = db.prepare(`SELECT x.job_id,x.action_id,x.envelope_json,v.record_json,c.candidate_id,c.manifest_json,c.dsl_json
        FROM i10_authoring_contexts x
        JOIN i8_candidate_build_jobs j ON j.job_id=x.job_id AND j.namespace=? AND j.status='COMPLETED'
        JOIN i8_verified_action_records v ON v.executable_plan_id=j.executable_plan_id AND v.action_id=x.action_id AND v.namespace=j.namespace
        JOIN i8_script_candidates c ON c.executable_plan_id=j.executable_plan_id AND c.namespace=j.namespace
        WHERE json_extract(x.envelope_json,'$.currentAction.reviewedLocator.feedbackId')=?
          OR json_extract(x.envelope_json,'$.currentAction.reviewedAssertion.feedbackId')=? ORDER BY x.created_at,x.action_id`)
        .all(namespace,feedbackId,feedbackId) as Array<{job_id:string;action_id:string;envelope_json:string;record_json:string;candidate_id:string;manifest_json:string;dsl_json:string}>;
      const consumptions = consumptionRows.filter(item => {
        const action=JSON.parse(item.envelope_json).currentAction;
        const record=JSON.parse(item.record_json);
        const executed=record.outcome==='VERIFIED_PASSED' && record.visualEvidence?.invocation==='REAL'
          && record.visualEvidence?.locatorMatched===true && record.playwrightEvidence?.role==='EXECUTOR'
          && Object.values(record.verification).every(value=>value===true);
        if(!executed)return false;
        if(action.reviewedLocator?.feedbackId===feedbackId)
          return canonicalJson(action.reviewedLocator.locator)===canonicalJson(record.locator);
        const hint=action.reviewedAssertion,manifest=JSON.parse(item.manifest_json);
        const application=manifest.reviewedAssertionApplications?.[item.action_id];
        const step=JSON.parse(item.dsl_json).steps.find((value:{sourceActionId:string})=>value.sourceActionId===item.action_id);
        return hint?.feedbackId===feedbackId && record.assertionImplementation===hint.implementation
          && application?.feedbackId===feedbackId && application.implementation===hint.implementation
          && application.stepId===step?.stepId && manifest.assertionImplementations?.[step?.stepId]===hint.implementation;
      }).map(item=>({jobId:item.job_id,actionId:item.action_id,candidateId:item.candidate_id}));
      return {feedbackId:row.feedback_id,incidentId:row.incident_id,sourceRunId:row.source_run_id,
        releaseIdentityHash:row.release_identity_hash,status:row.status,adapterBinding:JSON.parse(String(row.adapter_binding_json)),
        dslVersion:row.dsl_version,fixtureProfile:row.fixture_profile,correction:JSON.parse(String(row.correction_json)),
        verificationJourneyId:row.verification_journey_id,createdAt:row.created_at,consumptions};
    });
  }

  verifyJourneyEvidence(namespace: string, journeyId: string): Record<string, unknown> {
    const authority = this.database.read(db => {
      const journey = db.prepare(`SELECT stage,status,references_json FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?`)
        .get(namespace, journeyId) as { stage: string; status: string; references_json: string } | undefined;
      if (!journey) throw new HarnessError(404, 'I10_JOURNEY_NOT_FOUND', 'DOMAIN', '交互旅程不存在。');
      const references = JSON.parse(journey.references_json) as Record<string, unknown>;
      const runId = typeof references.runId === 'string' ? references.runId : '';
      const taskId = typeof references.taskId === 'string' ? references.taskId : '';
      if (journey.stage !== 'COMPLETED' || journey.status !== 'COMPLETED' || !runId || !taskId) {
        throw new HarnessError(409, 'I10_EVIDENCE_JOURNEY_NOT_TERMINAL', 'EVIDENCE', '旅程尚未形成可验证的终态证据。', false, true);
      }
      const execution = db.prepare(`
        SELECT r.run_id,r.task_id,r.status AS run_status,r.release_identity_hash,t.status AS task_status
        FROM runs r JOIN tasks t ON t.task_id=r.task_id
        WHERE r.namespace=? AND r.run_id=? AND r.task_id=? AND r.journey_id=? AND t.run_id=r.run_id
      `).get(namespace, runId, taskId, journeyId) as Record<string, unknown> | undefined;
      if (!execution || execution.run_status !== 'PASSED' || execution.task_status !== 'SUCCEEDED') {
        throw new HarnessError(409, 'I10_EVIDENCE_EXECUTION_NOT_PASSED', 'EVIDENCE', '运行或任务尚未通过。', false, true);
      }
      if (!this.releaseIdentityHash || execution.release_identity_hash !== this.releaseIdentityHash) {
        throw new HarnessError(409, 'I10_EVIDENCE_RELEASE_IDENTITY_MISMATCH', 'EVIDENCE', '运行证据与当前 ReleaseIdentity 不一致。', false, false);
      }
      const event = db.prepare(`
        SELECT details_json FROM audit_events
        WHERE namespace=? AND run_id=? AND task_id=? AND action='run.complete' AND outcome='SUCCEEDED'
        ORDER BY sequence DESC LIMIT 1
      `).get(namespace, runId, taskId) as { details_json: string } | undefined;
      const details = event ? JSON.parse(event.details_json) as Record<string, unknown> : {};
      const artifactIds = Array.isArray(details.artifactIds)
        ? details.artifactIds.filter((value): value is string => typeof value === 'string') : [];
      if (artifactIds.length === 0) {
        throw new HarnessError(409, 'I10_EVIDENCE_ARTIFACT_SET_MISSING', 'EVIDENCE', '运行没有登记完整制品集合。', false, false);
      }
      return { runId, taskId, artifactIds };
    });
    const artifacts = authority.artifactIds.map(artifactId => {
      const verified = this.artifacts.verifyIntegrity(namespace, artifactId);
      if (verified.runId !== authority.runId || verified.taskId !== authority.taskId) {
        throw new HarnessError(409, 'I10_EVIDENCE_ARTIFACT_BINDING_MISMATCH', 'EVIDENCE', '制品与运行任务绑定不一致。', false, false);
      }
      const metadata = verified.metadata as Record<string, unknown>;
      const evidenceKind = typeof metadata.evidenceKind === 'string' ? metadata.evidenceKind : '';
      if (!evidenceKind) throw new HarnessError(409, 'I10_EVIDENCE_KIND_MISSING', 'EVIDENCE', '制品缺少证据类型。', false, false);
      return {
        artifactId, evidenceKind, artifactType: verified.type, sha256: verified.sha256,
        size: verified.byteSize, redactionStatus: verified.redactionStatus,
        sha256Verified: true, sizeVerified: true,
      };
    });
    const requiredKinds = ['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER'];
    const observedKinds = new Set(artifacts.map(item => item.evidenceKind));
    if (requiredKinds.some(kind => !observedKinds.has(kind))) {
      throw new HarnessError(409, 'I10_EVIDENCE_KIND_MISSING', 'EVIDENCE', '运行证据类型不完整。', false, false);
    }
    return {
      schemaVersion: 'hengzhun-cli-evidence-verification/v1', verdict: 'VERIFIED',
      journeyId, runId: authority.runId, taskId: authority.taskId,
      releaseIdentityHash: this.releaseIdentityHash, journeyTerminal: true,
      runStatus: 'PASSED', taskStatus: 'SUCCEEDED', requiredKinds, artifacts,
    };
  }

  verifyReleaseCaseEvidence(caseId: string, namespace: string, journeyId: string, expectedFailure?: unknown): Record<string, unknown> {
    if(caseId==='A06'||caseId==='P05'){
      const proof=this.verifyJourneyEvidence(namespace,journeyId);
      const refs=this.database.read(db=>JSON.parse((db.prepare('SELECT references_json FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?')
        .get(namespace,journeyId) as {references_json:string}).references_json));
      if(typeof refs.validatedJourneyId!=='string'||refs.validatedJourneyId===journeyId)
        throw new HarnessError(409,'RELEASE_REPEAT_SOURCE_REQUIRED','EVIDENCE','重复执行必须引用独立的已验证来源旅程。');
      const source=this.verifyJourneyEvidence(namespace,refs.validatedJourneyId);
      const binding=this.database.read(db=>{
        const row=db.prepare(`SELECT repeated.candidate_id,repeated.plan_id,
            json_extract(repeated_task.payload_json,'$.scriptId') AS executed_script_id,
            json_extract(repeated_task.payload_json,'$.scriptVersion') AS executed_script_version,
            json_extract(repeated_task.payload_json,'$.scriptHash') AS executed_script_hash
          FROM runs repeated JOIN runs original ON original.namespace=repeated.namespace
          JOIN tasks repeated_task ON repeated_task.task_id=repeated.task_id
          JOIN tasks original_task ON original_task.task_id=original.task_id
          WHERE repeated.namespace=? AND repeated.run_id=? AND original.run_id=?
            AND repeated.run_id<>original.run_id AND repeated.task_id<>original.task_id
            AND repeated.case_id=original.case_id AND repeated.case_version=original.case_version
            AND repeated.plan_id=original.plan_id AND repeated.candidate_id=original.candidate_id
            AND repeated.created_at>=original.completed_at
            AND json_extract(repeated_task.payload_json,'$.scriptId')=json_extract(original_task.payload_json,'$.scriptId')
            AND json_extract(repeated_task.payload_json,'$.scriptVersion')=json_extract(original_task.payload_json,'$.scriptVersion')
            AND json_extract(repeated_task.payload_json,'$.scriptHash')=json_extract(original_task.payload_json,'$.scriptHash')`)
          .get(namespace,proof.runId,source.runId) as {candidate_id:string;plan_id:string;executed_script_id:string;executed_script_version:number;executed_script_hash:string}|undefined;
        if(!row||refs.sourceRunId!==source.runId||refs.candidateId!==row.candidate_id||refs.planId!==row.plan_id)return undefined;
        const script=db.prepare(`SELECT script_id,script_version,script_sha256 FROM i8_script_candidates WHERE namespace=? AND candidate_id=?
          UNION ALL SELECT script_id,script_version,script_sha256 FROM i8_script_patch_proposals WHERE namespace=? AND repair_candidate_id=?`)
          .get(namespace,row.candidate_id,namespace,row.candidate_id) as {script_id:string;script_version:number;script_sha256:string}|undefined;
        if(!script||script.script_sha256!==refs.scriptHash||script.script_sha256!==row.executed_script_hash||
            script.script_id!==row.executed_script_id||script.script_version!==row.executed_script_version)return undefined;
        return {...row,...script};
      });
      if(!binding)throw new HarnessError(409,'RELEASE_REPEAT_FROZEN_BINDING_INVALID','EVIDENCE','两次运行未绑定同一个冻结候选、案例和脚本。');
      const timing=caseId==='P05'?this.database.read(db=>db.prepare('SELECT created_at,started_at,completed_at FROM runs WHERE namespace=? AND run_id=? AND task_id=?')
        .get(namespace,proof.runId,proof.taskId) as {created_at:string;started_at:string|null;completed_at:string|null}|undefined):undefined;
      const created=Date.parse(timing?.created_at??''),started=Date.parse(timing?.started_at??''),completed=Date.parse(timing?.completed_at??'');
      if(caseId==='P05'&&(!Number.isFinite(created)||!Number.isFinite(started)||!Number.isFinite(completed)||created>started||started>completed))
        throw new HarnessError(409,'RELEASE_QUEUE_TIMING_MISSING','EVIDENCE','容量运行缺少有序的实际账本时间。');
      return {...proof,...(caseId==='P05'?{timing:{createdAt:timing!.created_at,startedAt:timing!.started_at,completedAt:timing!.completed_at,
          queueMs:started-created,executionMs:completed-started}}:{}),sourceJourneyId:refs.validatedJourneyId,sourceRunId:source.runId,sourceTaskId:source.taskId,
        candidateId:binding.candidate_id,planId:binding.plan_id,scriptId:binding.script_id,
        scriptVersion:binding.script_version,scriptHash:binding.script_sha256,sameFrozenScript:true};
    }
    if(caseId==='A02'){
      const proof=this.verifyJourneyEvidence(namespace,journeyId);
      const binding=this.database.read(db=>db.prepare(`SELECT cv.definition_json FROM runs r
        JOIN case_versions cv ON cv.case_id=r.case_id AND cv.version=r.case_version
        WHERE r.namespace=? AND r.run_id=? AND r.task_id=? AND r.journey_id=?`)
        .get(namespace,proof.runId,proof.taskId,journeyId) as {definition_json:string}|undefined);
      const definition=binding?JSON.parse(binding.definition_json):{};
      const parsed=typedBusinessInputsV2Schema.safeParse(definition.businessInputs);
      const pool=bankValidationFixturesSchema.safeParse(definition.bankValidationFixtures);
      if(!parsed.success||!parsed.data.values.payerAccountId||!pool.success||
        pool.data.formalAccountIds.sourceAccountId!==parsed.data.values.payerAccountId)
        throw new HarnessError(409,'RELEASE_FINANCIAL_BINDING_REQUIRED','EVIDENCE','资金场景缺少实际执行案例版本的冻结业务输入。');
      return {...proof,businessInputs:parsed.data,formalAccountIds:pool.data.formalAccountIds};
    }
    if (caseId !== 'A04' && caseId !== 'A07') return this.verifyJourneyEvidence(namespace,journeyId);
    return this.database.read(db=>{
      const journey=db.prepare('SELECT stage,status,request_intent,input_envelope_json,missing_fields_json,references_json FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?')
        .get(namespace,journeyId) as {stage:string;status:string;request_intent:string;input_envelope_json:string;missing_fields_json:string;references_json:string}|undefined;
      if(!journey)throw new HarnessError(404,'I10_JOURNEY_NOT_FOUND','EVIDENCE','旅程不存在。');
      const runs=db.prepare('SELECT run_id,task_id,status,release_identity_hash FROM runs WHERE namespace=? AND journey_id=?')
        .all(namespace,journeyId) as Array<{run_id:string;task_id:string;status:string;release_identity_hash:string}>;
      if(caseId==='A04') {
        const input=JSON.parse(journey.input_envelope_json);
        const missing=JSON.parse(journey.missing_fields_json) as string[];
        const refs=JSON.parse(journey.references_json);
        const values=input.draftJson?.businessInputs?.values??{};
        const blockedFields=['payeeRef','amount'].filter(field=>missing.includes(`businessInputs.${field}`)&&!values[field]);
        if(journey.stage!=='NEEDS_INPUT'||journey.status!=='NEEDS_INPUT'||journey.request_intent!=='CASE_AUTHORING'||
          !this.releaseIdentityHash||input.releaseIdentityHash!==this.releaseIdentityHash||blockedFields.length===0||
          refs.preparationId||refs.runId||refs.taskId||runs.length!==0)
          throw new HarnessError(409,'RELEASE_MISSING_INPUT_NOT_BLOCKED','EVIDENCE','缺失输入未在执行前被阻止。');
        return {verdict:'VERIFIED',releaseIdentityHash:this.releaseIdentityHash,runStatus:'NEEDS_INPUT',journeyId,blockedFields,executionCount:0};
      }
      if(runs.length!==1||runs[0]!.status!=='FAILED'||runs[0]!.release_identity_hash!==this.releaseIdentityHash||
        journey.status!=='FAILED'||!['FAILED_ACTIONABLE','FAILED_CLOSED'].includes(journey.stage))
        throw new HarnessError(409,'RELEASE_CONTROLLED_FAILURE_NOT_PROVEN','EVIDENCE','未取得当前身份的受控失败运行。');
      const run=runs[0]!;
      const incident=db.prepare("SELECT reason_code FROM failure_incidents WHERE namespace=? AND run_id=? AND classification='ASSERTION'")
        .get(namespace,run.run_id) as {reason_code:string}|undefined;
      const task=db.prepare('SELECT status,error_code FROM tasks WHERE namespace=? AND task_id=?').get(namespace,run.task_id) as {status:string;error_code:string}|undefined;
      if(incident?.reason_code!=='I8_FORMAL_ASSERTION_FAILED'||task?.status!=='FAILED'||task.error_code!==incident.reason_code)
        throw new HarnessError(409,'RELEASE_ASSERTION_FAILURE_REQUIRED','EVIDENCE','失败不是指定的正式断言失败。');
      const expected=expectedFailure as {operation?:string;expectedText?:string;caseMarker?:string}|undefined;
      const input=JSON.parse(journey.input_envelope_json);
      if(expected?.operation!=='expectText'||!expected.expectedText||!expected.caseMarker||
        input.releaseIdentityHash!==this.releaseIdentityHash||!String(input.naturalLanguage).includes(expected.caseMarker))
        throw new HarnessError(409,'RELEASE_EXPECTED_ASSERTION_REQUIRED','EVIDENCE','未绑定清单指定的失败断言。');
      const candidate=db.prepare(`SELECT c.candidate_id,c.dsl_json,c.dsl_hash,c.script_sha256,c.manifest_sha256,p.plan_json
        FROM runs r JOIN i8_script_candidates c ON c.candidate_id=r.candidate_id AND c.namespace=r.namespace
        JOIN i8_executable_plans p ON p.executable_plan_id=c.executable_plan_id AND p.namespace=c.namespace
        WHERE r.namespace=? AND r.run_id=?`).get(namespace,run.run_id) as
        {candidate_id:string;dsl_json:string;dsl_hash:string;script_sha256:string;manifest_sha256:string;plan_json:string}|undefined;
      if(!candidate||sha256(candidate.dsl_json)!==candidate.dsl_hash)
        throw new HarnessError(409,'RELEASE_EXPECTED_ASSERTION_REQUIRED','EVIDENCE','未找到冻结的失败脚本。');
      const plan=JSON.parse(candidate.plan_json),dsl=JSON.parse(candidate.dsl_json);
      const assertionSteps=(dsl.steps as Array<{stepId:string;operation:string;expectedTextRef?:string}>).filter(step=>
        step.operation===expected.operation&&step.expectedTextRef&&plan.fixtureValues?.[step.expectedTextRef]===expected.expectedText);
      if(assertionSteps.length!==1)throw new HarnessError(409,'RELEASE_EXPECTED_ASSERTION_REQUIRED','EVIDENCE','指定断言未唯一绑定冻结脚本。');
      const artifacts=(db.prepare('SELECT artifact_id FROM artifacts WHERE namespace=? AND run_id=? AND task_id=?')
        .all(namespace,run.run_id,run.task_id) as Array<{artifact_id:string}>).map(row=>this.artifacts.verifyIntegrity(namespace,row.artifact_id));
      const kinds=new Set(artifacts.map(a=>(a.metadata as Record<string,unknown>).evidenceKind));
      if(['DOM','SCREENSHOT','TRACE','NETWORK','LEDGER'].some(kind=>!kinds.has(kind)))
        throw new HarnessError(409,'RELEASE_FAILURE_EVIDENCE_INCOMPLETE','EVIDENCE','受控失败的证据类型不完整。');
      const reports=artifacts.filter(a=>(a.metadata as Record<string,unknown>).evidenceKind==='REPORT');
      if(reports.length!==1)throw new HarnessError(409,'RELEASE_FAILURE_REPORT_REQUIRED','EVIDENCE','缺少唯一正式失败报告。');
      const bytes=this.artifacts.read(namespace,String(reports[0]!.artifactId)).content;
      let report;try{report=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
      const failed=Array.isArray(report.assertions)?report.assertions.filter((a:{passed:boolean})=>a.passed===false):[];
      if(report.schemaVersion!=='i8-formal-run-report-v1'||report.runId!==run.run_id||report.taskId!==run.task_id||report.passed!==false||
        report.candidateId!==candidate.candidate_id||report.scriptHash!==candidate.script_sha256||report.manifestHash!==candidate.manifest_sha256||
        report.failureReason!=='CANDIDATE_EXPECT_TEXT_FAILED'||failed.length!==1||
        failed[0].stepId!==assertionSteps[0]!.stepId||failed[0].operation!==expected.operation)
        throw new HarnessError(409,'RELEASE_EXPECTED_ASSERTION_MISMATCH','EVIDENCE','正式报告的失败步骤与指定断言不符。');
      return {verdict:'VERIFIED',releaseIdentityHash:this.releaseIdentityHash,runStatus:'FAILED',taskStatus:'FAILED',
        runId:run.run_id,taskId:run.task_id,journeyId,expectedAssertionStepId:assertionSteps[0]!.stepId,
        artifacts:artifacts.map(a=>({artifactId:a.artifactId,evidenceKind:(a.metadata as Record<string,unknown>).evidenceKind,
          sha256:a.sha256,size:a.byteSize,sha256Verified:a.sha256Verified,sizeVerified:a.sizeVerified}))};
    });
  }

  getArtifactMetadata(namespace: string, artifactId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare('SELECT * FROM artifacts WHERE namespace = ? AND artifact_id = ?').get(namespace, artifactId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'ARTIFACT_NOT_FOUND', 'DOMAIN', 'Artifact 不存在。');
      return {
        artifactId: row.artifact_id,
        runId: row.run_id,
        taskId: row.task_id,
        type: row.artifact_type,
        sha256: row.sha256,
        byteSize: row.byte_size,
        mediaType: row.media_type,
        redactionStatus: row.redaction_status,
        metadata: JSON.parse(String(row.metadata_json)),
        controlledAccess: { mode: 'HARNESS_MANAGED', downloadable: false },
        createdAt: row.created_at
      };
    });
  }

  async submitDecision(input: DecisionSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'decision_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      let currentVersion: number | undefined;
      if (input.targetType === 'RUN_RECOVERY') {
        currentVersion = (db.prepare('SELECT version FROM runs WHERE namespace = ? AND run_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      } else if (input.targetType === 'SCRIPT_ACTIVATION') {
        currentVersion = (db.prepare('SELECT current_version AS version FROM scripts WHERE namespace = ? AND script_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      } else if (input.targetType === 'SCHEDULE_RECOVERY') {
        currentVersion = (db.prepare('SELECT version FROM schedules WHERE namespace = ? AND schedule_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      } else {
        currentVersion = (db.prepare('SELECT version FROM repair_candidates WHERE namespace = ? AND candidate_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      }
      if (currentVersion === undefined) throw new HarnessError(404, 'DECISION_TARGET_NOT_FOUND', 'DOMAIN', '决策目标不存在。');
      if (currentVersion !== input.expectedVersion) {
        throw new HarnessError(409, 'TARGET_VERSION_CONFLICT', 'CONCURRENCY', '决策目标版本已变化。', false, true, { currentVersion });
      }
      const decisionId = opaqueId('decision');
      if (input.targetType === 'SCHEDULE_RECOVERY') {
        if (input.choice !== 'APPROVE' && input.choice !== 'REJECT') {
          throw new HarnessError(400, 'SCHEDULE_RECOVERY_CHOICE_INVALID', 'CONTRACT', '调度恢复只接受 APPROVE 或 REJECT。');
        }
        const schedule = db.prepare('SELECT * FROM schedules WHERE namespace = ? AND schedule_id = ?')
          .get(input.namespace, input.targetId) as Record<string, unknown>;
        if (schedule.status !== 'PAUSED_FAILURE') {
          throw new HarnessError(409, 'SCHEDULE_NOT_PAUSED', 'DOMAIN', '只有因失败暂停的调度可以执行恢复决策。', false, true);
        }
        db.prepare(`
          INSERT INTO schedule_recovery_decisions(
            decision_id, namespace, schedule_id, expected_version, choice, reason,
            confirmation_ref, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)
        `).run(decisionId, input.namespace, input.targetId, input.expectedVersion, input.choice, input.reason, input.confirmationRef, timestamp);
        let effect = 'SCHEDULE_REMAINS_PAUSED';
        if (input.choice === 'APPROVE') {
          const nextFireAt = nextCronOccurrence(String(schedule.cron_expression), String(schedule.timezone), new Date(timestamp)).toISOString();
          db.prepare(`
            UPDATE schedules SET status = 'ACTIVE', paused_incident_id = NULL, next_fire_at = ?,
              version = version + 1, updated_at = ? WHERE schedule_id = ?
          `).run(nextFireAt, timestamp, input.targetId);
          effect = 'SCHEDULE_RESUMED';
        }
        return {
          status: 200, objectType: 'DECISION', objectId: decisionId,
          response: {
            decisionId, targetType: input.targetType, targetId: input.targetId, status: 'RECORDED', version: 1,
            effect, scheduleVersion: input.choice === 'APPROVE' ? input.expectedVersion + 1 : input.expectedVersion
          }
        };
      }
      if (input.targetType === 'REPAIR_CANDIDATE_ACTIVATION') {
        if (input.choice !== 'APPROVE' && input.choice !== 'REJECT') {
          throw new HarnessError(400, 'REPAIR_DECISION_CHOICE_INVALID', 'CONTRACT', '修复候选只接受 APPROVE 或 REJECT。');
        }
        const candidate = db.prepare(`
          SELECT rc.*, sv.relative_path, COALESCE(sv.source_sha256, sv.sha256) AS base_sha256
          FROM repair_candidates rc
          JOIN script_versions sv ON sv.script_id = rc.script_id AND sv.version = rc.base_script_version
          WHERE rc.namespace = ? AND rc.candidate_id = ?
        `).get(input.namespace, input.targetId) as Record<string, unknown>;
        if (candidate.status !== 'WAITING_USER') {
          throw new HarnessError(409, 'REPAIR_CANDIDATE_NOT_APPROVABLE', 'DOMAIN', '修复候选尚未通过隔离验证或已完成决策。', false, true);
        }
        db.prepare(`
          INSERT INTO repair_activation_decisions(
            decision_id, namespace, candidate_id, expected_version, choice, reason,
            confirmation_ref, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)
        `).run(
          decisionId, input.namespace, input.targetId, input.expectedVersion,
          input.choice, input.reason, input.confirmationRef, timestamp
        );
        let effect: string;
        if (input.choice === 'APPROVE') {
          const script = db.prepare('SELECT current_version FROM scripts WHERE script_id = ?')
            .get(candidate.script_id) as { current_version: number };
          if (script.current_version !== Number(candidate.base_script_version)) {
            throw new HarnessError(409, 'SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '激活前正式脚本版本已变化。', false, true, { currentVersion: script.current_version });
          }
          const sourcePath = path.join(this.productRoot, ...String(candidate.relative_path).split('/'));
          if (!fs.existsSync(sourcePath)) {
            throw new HarnessError(409, 'CANDIDATE_SCRIPT_UNAVAILABLE', 'ENVIRONMENT', '候选依赖的基础脚本制品不存在。', false, true);
          }
          const sourceSha256 = sha256(fs.readFileSync(sourcePath));
          if (sourceSha256 !== candidate.base_sha256) {
            throw new HarnessError(409, 'SCRIPT_SOURCE_DRIFT', 'CONCURRENCY', '基础脚本文件 Hash 已变化，候选必须重新验证。', false, true);
          }
          const configurationJson = canonicalJson((JSON.parse(String(candidate.patch_json)) as { selectorOverrides: Record<string, string> }).selectorOverrides);
          const compositeSha256 = sha256(canonicalJson({ sourceSha256, configuration: JSON.parse(configurationJson) }));
          db.prepare(`
            INSERT INTO script_versions(
              script_id, version, relative_path, sha256, validation_status, created_at,
              configuration_json, source_sha256
            ) VALUES (?, ?, ?, ?, 'PASSED', ?, ?, ?)
          `).run(
            candidate.script_id, candidate.candidate_script_version, candidate.relative_path,
            compositeSha256, timestamp, configurationJson, sourceSha256
          );
          db.prepare(`UPDATE scripts SET current_version = ?, status = 'SCRIPT_VALIDATED', updated_at = ? WHERE script_id = ?`)
            .run(candidate.candidate_script_version, timestamp, candidate.script_id);
          db.prepare(`UPDATE repair_candidates SET status = 'ACTIVE', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
            .run(timestamp, input.targetId);
          db.prepare(`UPDATE failure_incidents SET diagnostic_status = 'RESOLVED', version = version + 1, updated_at = ? WHERE incident_id = ?`)
            .run(timestamp, candidate.incident_id);
          effect = 'REPAIR_CANDIDATE_ACTIVATED';
        } else {
          db.prepare(`UPDATE repair_candidates SET status = 'REJECTED', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
            .run(timestamp, input.targetId);
          db.prepare(`UPDATE failure_incidents SET diagnostic_status = 'DIAGNOSED', version = version + 1, updated_at = ? WHERE incident_id = ?`)
            .run(timestamp, candidate.incident_id);
          effect = 'REPAIR_CANDIDATE_REJECTED';
        }
        return {
          status: 200,
          objectType: 'DECISION',
          objectId: decisionId,
          response: {
            decisionId,
            targetType: input.targetType,
            targetId: input.targetId,
            status: 'RECORDED',
            version: 1,
            effect
          }
        };
      }
      db.prepare(`
        INSERT INTO decisions(
          decision_id, namespace, target_type, target_id, expected_version, choice,
          reason, status, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', 1, ?)
      `).run(decisionId, input.namespace, input.targetType, input.targetId, input.expectedVersion, input.choice, input.reason, timestamp);
      let effect = 'DEFERRED_TO_FUTURE_BATCH';
      if (input.targetType === 'SCRIPT_ACTIVATION') {
        const version = db.prepare(`
          SELECT validation_status FROM script_versions WHERE script_id = ? AND version = ?
        `).get(input.targetId, input.expectedVersion) as { validation_status: string } | undefined;
        if (!version || version.validation_status !== 'PASSED') {
          throw new HarnessError(409, 'SCRIPT_VALIDATION_NOT_PASSED', 'DOMAIN', '候选脚本尚未通过 Playwright 验证。', false, true);
        }
        const nextStatus = input.choice === 'APPROVE' ? 'SCRIPT_VALIDATED' : 'RETIRED';
        db.prepare(`UPDATE scripts SET status = ?, updated_at = ? WHERE script_id = ?`)
          .run(nextStatus, timestamp, input.targetId);
        if (input.choice === 'APPROVE') {
          db.prepare(`UPDATE plans SET status = 'READY' WHERE script_id = ? AND status = 'AUTHORING_REQUIRED'`)
            .run(input.targetId);
          const authoring = db.prepare('SELECT task_id, plan_id FROM action_plans WHERE script_id = ?').get(input.targetId) as { task_id: string; plan_id: string } | undefined;
          if (authoring) {
            db.prepare(`UPDATE action_plans SET status = 'COMPLETED', version = version + 1, updated_at = ? WHERE plan_id = ?`)
              .run(timestamp, authoring.plan_id);
            db.prepare(`UPDATE tasks SET status = 'SUCCEEDED', user_action_required = 0, completed_at = ?, updated_at = ?, version = version + 1 WHERE task_id = ?`)
              .run(timestamp, timestamp, authoring.task_id);
          }
        }
        effect = input.choice === 'APPROVE' ? 'SCRIPT_VALIDATED_AND_PLAN_READY' : 'SCRIPT_RETIRED';
      }
      return {
        status: 200,
        objectType: 'DECISION',
        objectId: decisionId,
        response: {
          decisionId,
          targetType: input.targetType,
          targetId: input.targetId,
          status: 'RECORDED',
          version: 1,
          effect
        }
      };
    });
  }
}
