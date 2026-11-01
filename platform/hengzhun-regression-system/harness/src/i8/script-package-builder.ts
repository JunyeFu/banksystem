import { intentPlanSchema } from '../schemas';
import { canonicalJson, sha256 } from '../utils';
import type { ReviewedAssertion } from '../feedback';
import { accountObservation, assertBankAccountFields, assertNoPageErrors } from './page-observation';
import { isFuxingBankDemoAdapter, authenticationForTargetAdapter, FUXING_BANK_AUTHENTICATION as bankAuthentication } from './target-adapter-registry';
import {
  FUXING_BANK_DEMO_LOGIN_TEMPLATE as actionTemplate,
  FUXING_BANK_DEMO_REPAIR_TARGETS as REPAIR_TARGETS,
  FUXING_BANK_DEMO_ROUTES as ROUTES,
  FUXING_BANK_DEMO_TARGETS as TARGETS,
  FUXING_BANK_DEMO_TIMEOUTS as TIMEOUTS,
  FUXING_BANK_DEMO_TRANSFER_TEMPLATE as transferActionTemplate,
  fuxingBankDemoPageSignature as pageSignature
} from './adapters/fuxing-bank-demo';
import {
  dslDocumentSchema,
  executableActionPlanSchema,
  verifiedActionRecordSchema,
  type DslDocument,
  type ExecutableActionPlan,
  type VerifiedActionRecord
} from './stage3-schemas';

export const I8_GENERATOR_VERSION = 'hengzhun-script-package-builder-1.0.0';
type CandidateLocator = { kind: 'ROLE' | 'LABEL' | 'TEST_ID' | 'PLACEHOLDER' | 'TEXT' | 'CSS'; value: string };

// A confirmed TargetProfile normally compiles to the generic-web path.  The
// local Fuxing portal is the single controlled exception: its login and
// profile locators are versioned, deterministic fixtures, and a generic plan
// would incorrectly try to locate the post-login header on the login page.
// Keep this deliberately narrow so an arbitrary HTTP(S) target that happens
// to use the same route shape never inherits banking-specific selectors.
type ControlledFuxingIntentPlan = {
  executionProfile: string;
  adapterBinding?: Record<string, unknown>;
  targetProfileSnapshot?: Record<string, unknown>;
  route: string;
  steps: Array<{ action: string; expected: string }>;
  assertions: string[];
};

function isControlledFuxingLoginCase(intentPlan: ControlledFuxingIntentPlan): boolean {
  if (intentPlan.executionProfile !== 'GENERIC_WEB') return false;
  const snapshot = intentPlan.targetProfileSnapshot as Record<string, unknown> | undefined;
  // The binding comes from the approved target-profile snapshot.  A controller
  // supplied plan field may repeat it, but cannot invent it from name or URL.
  if (!isFuxingBankDemoAdapter(intentPlan.adapterBinding ?? snapshot?.adapterBinding)) return false;
  // An adapter identifies the application, not the business case.  Reusing an
  // ACTIVE Fuxing target profile for accounts, recipients, documents, or
  // messages must stay on the generic semantic-plan path.  The deterministic
  // login/profile template is valid only for its exact cross-page identity
  // comparison contract.
  const semanticText = [
    ...intentPlan.steps.flatMap(step => [step.action, step.expected]),
    ...intentPlan.assertions
  ].join('\n');
  return /(?:个人资料|个人中心|profile)/i.test(semanticText)
    && /(?:头像|avatar)/i.test(semanticText)
    && /(?:姓名|名称|display\s*name|name)/i.test(semanticText)
    && /(?:一致|相同|比较|对比|match|same|equal)/i.test(semanticText);
}

function isControlledFuxingTransferCase(intentPlan: ControlledFuxingIntentPlan & {
  inputContractVersion?: string;
  typedBusinessInputs?: { values?: Record<string, string> };
}): boolean {
  const snapshot = intentPlan.targetProfileSnapshot as Record<string, unknown> | undefined;
  if (!isFuxingBankDemoAdapter(intentPlan.adapterBinding ?? snapshot?.adapterBinding)) return false;
  if (intentPlan.inputContractVersion !== 'TypedBusinessInputsV2') return false;
  const inputs = intentPlan.typedBusinessInputs?.values;
  if (!inputs?.payerAccountId || !inputs.payeeRef || !inputs.amount || !inputs.currency || !inputs.purpose) return false;
  const semanticText = [
    ...intentPlan.steps.flatMap(step => [step.action, step.expected]),
    ...intentPlan.assertions
  ].join('\n');
  return /(?:转账|汇款|transfer)/i.test(semanticText)
    && /(?:首次确认|U盾|移动证书|单号|订单|网页验证|first\s*confirm|order)/i.test(semanticText);
}

export function compileExecutableActionPlan(intentPlanInput: unknown, intentPlanHash: string): ExecutableActionPlan {
  const intentPlan = intentPlanSchema.parse(intentPlanInput);
  const controlledTransferCase = isControlledFuxingTransferCase(intentPlan);
  if (intentPlan.executionProfile === 'GENERIC_WEB' && !isControlledFuxingLoginCase(intentPlan) && !controlledTransferCase) {
    const snapshot = intentPlan.targetProfileSnapshot as Record<string, unknown>;
    if (snapshot.status !== 'ACTIVE'
      || snapshot.targetProfileId !== intentPlan.targetProfileId
      || snapshot.version !== intentPlan.targetProfileVersion
      || snapshot.profileHash !== intentPlan.targetProfileHash) {
      throw new Error('I10_TARGET_PROFILE_NOT_FROZEN');
    }
    // A controller summary commonly condenses “use the saved credential to
    // log in” into one semantic step.  A browser cannot execute that as a
    // navigation: it still needs the username field, password field, and the
    // submit control.  Expand only this well-defined credential-login shape
    // for a frozen generic target.  All controls remain dynamic Midscene
    // locations and all actions remain Playwright executor actions; no
    // Fuxing-specific selector or route is introduced.
    type GenericIntentStep = typeof intentPlan.steps[number] & {
      operationHint?: ExecutableActionPlan['actions'][number]['operation'];
      routePatternHint?: string;
    };
    const readOnlyConstraints: string[] = [];
    const isReadOnlyConstraint = (value: string) =>
      /^(?:(?:确认|确保)(?:当前)?页面(?:处于|并保持)|保持(?:当前)?)只读(?:操作|检查状态|状态|模式)?[。]?$/u.test(value);
    const original: GenericIntentStep[] = intentPlan.steps.flatMap(step => {
      // A prohibition is a constraint, never the verb of an executor action.
      // Keep a positive clause in a mixed instruction (e.g. click Query, not
      // Transfer) rather than discarding the whole step.
      if (isReadOnlyConstraint(step.action)) { readOnlyConstraints.push(step.action); return []; }
      const clauses = step.action.split(/[，,；;]/u);
      const prohibited = clauses.filter(clause => /^(?:(?:且|并|也)?(?:未|不|不得|禁止|勿|不要)(?:点击|进入|打开|修改|提交|操作|转账|执行|访问|发起)|确认未触发(?:转账|业务申请|资料|日期修改))/u.test(clause.trim()));
      if (!prohibited.length) return [step];
      readOnlyConstraints.push(...prohibited.map(clause => clause.trim().replace(/[。.!！]+$/u, '')));
      const action = clauses.filter(clause => !prohibited.includes(clause)).join('，').trim();
      if (!action || isReadOnlyConstraint(action)) {
        readOnlyConstraints.push(step.action);
        return [];
      }
      return [{ ...step, action }];
    });
    const loginSeedIndex = original.findIndex(step =>
      step.inputValueSource === 'CREDENTIAL_REF' && /(?:登录|身份认证|身份验证|安全认证|认证完成|authenticat|login|sign[ _-]?in)/i.test(`${step.action} ${step.expected}`)
    );
    const loginCluster = new Set<number>();
    if (loginSeedIndex >= 0) {
      const describesAuthentication = (step: GenericIntentStep) =>
        /(?:登录|login|sign[ _-]?in|身份认证|认证完成|身份验证|安全认证|authenticat|credential|用户名|密码|username|password)/i.test(`${step.action} ${step.expected}`);
      let firstLoginIndex = loginSeedIndex;
      let lastLoginIndex = loginSeedIndex;
      while (firstLoginIndex > 0 && describesAuthentication(original[firstLoginIndex - 1]!)) firstLoginIndex -= 1;
      while (lastLoginIndex + 1 < original.length && describesAuthentication(original[lastLoginIndex + 1]!)) lastLoginIndex += 1;
      for (let index = firstLoginIndex; index <= lastLoginIndex; index += 1) loginCluster.add(index);
    }
    const loginIndexes = [...loginCluster];
    const loginIndex = loginIndexes.find(index =>
      /(?:authenticated|redirect|登录成功|身份验证通过|认证通过|跳转|进入.*(?:主页|首页|概览|dashboard|home))/i.test(String(original[index]!.expected))
    ) ?? loginIndexes.at(-1) ?? -1;
    const loginStep = loginIndex >= 0 ? original[loginIndex]! : undefined;
    const selectedAuthentication=authenticationForTargetAdapter(intentPlan.adapterBinding ?? snapshot.adapterBinding);
    const bankLogin = Boolean(selectedAuthentication);
    const bankLoginSteps: GenericIntentStep[] = loginStep && bankLogin
      ? selectedAuthentication!.actions.map(item => ({
          ...loginStep, action: item.instruction, expected: item.expected,
          inputValueSource: item.credentialKey ? 'CREDENTIAL_REF' : 'NONE',
          operationHint: item.operation as ExecutableActionPlan['actions'][number]['operation'],
          ...(item.routePatternRef ? { routePatternHint: item.routePatternRef } : {})
        })) : [];
    const source: GenericIntentStep[] = loginStep && bankLogin
      ? [{ ...loginStep, action: '打开银行登录页', expected: '银行登录页已加载', inputValueSource: 'NONE', operationHint: 'goto' },
          ...bankLoginSteps, ...original.filter((step,index)=>!loginCluster.has(index)&&!/(?:入口URL|启动URL|launch\s*url)/i.test(step.action))]
      : loginStep
      ? [
          {
            ...loginStep,
            action: '打开目标站点登录页',
            expected: '登录页已加载',
            inputValueSource: 'NONE',
            operationHint: 'goto'
          },
          {
            ...loginStep,
            action: '在用户名输入框输入安全凭据账号',
            expected: '账号已填入用户名输入框',
            inputValueSource: 'CREDENTIAL_REF',
            operationHint: 'fill'
          },
          {
            ...loginStep,
            action: '在密码输入框输入安全凭据密码',
            expected: '密码已填入密码输入框',
            inputValueSource: 'CREDENTIAL_REF',
            operationHint: 'fill'
          },
          {
            ...loginStep,
            action: '点击登录按钮',
            expected: '登录成功并进入已认证页面',
            inputValueSource: 'NONE',
            operationHint: 'click'
          },
          {
            ...loginStep,
            action: '等待登录后导航完成',
            expected: '浏览器已离开登录地址并进入目标站点允许的已认证页面',
            inputValueSource: 'NONE',
            operationHint: 'waitForURL'
          },
          ...original.filter((step, index) => !loginCluster.has(index) && !/(?:入口URL|启动URL|launch\s*url)/i.test(step.action))
        ]
      : original;
    // A single visual locator can only prove one concrete page fact.  Split a
    // conjunction such as “验证状态及余额” when the paired expected outcomes
    // are explicit.  This is language-level normalization for arbitrary
    // internal sites, not a bank-specific assertion template.
    const atomicSource = source.flatMap(step => {
      const text = `${step.action} ${step.expected}`;
      if (step.inputValueSource !== 'NONE' || !/(?:验证|检查|确认|显示|比较|比对|verify|expect)/i.test(text)) return [step];
      const actionMatch = String(step.action).match(/^\s*((?:验证|检查|确认|显示|比较|比对)\s*)(.+)$/);
      if (!actionMatch) return [step];
      const actionParts = actionMatch[2]!.split(/(?:以及|并且|且|及|和|、)/).map(part => part.trim()).filter(Boolean);
      const expectedParts = String(step.expected).split(/(?:[，,；;]|以及|并且|且|及|和)/).map(part => part.trim()).filter(Boolean);
      if (actionParts.length < 2 || actionParts.length !== expectedParts.length) return [step];
      return actionParts.map((part, index) => ({
        ...step,
        action: `${actionMatch[1]!}${part}`,
        expected: expectedParts[index]!
      }));
    });
    // Some controller/OCR combinations express one read-only page check as
    // several adjacent fragments (for example, list -> masked account ->
    // status).  They describe the same stable page region, not three user
    // interactions.  Coalesce them before action IDs are assigned so one
    // Midscene observation establishes the region and Playwright performs one
    // deterministic visibility assertion.  Do not coalesce any explicit
    // navigation, click, input, selection, upload, or download action.
    const isReadOnlyObservation = (step: GenericIntentStep) => {
      const text = `${step.action} ${step.expected}`;
      return /(?:验证|核验|检查|确认|显示|查看|浏览|读取|列出|定位|verify|expect|inspect)/i.test(text) &&
        !/(?:输入|填写|点击|进入|导航(?:至|到)?|前往|选择|下拉|筛选|过滤|上传|下载|fill|click|select|upload|download|navigate|go\s+to)/i.test(text);
    };
    const coalescedSource = atomicSource.reduce<GenericIntentStep[]>((items, step) => {
      const previous = items.at(-1);
      if (previous && previous.intentStepId === step.intentStepId &&
          isReadOnlyObservation(previous) && isReadOnlyObservation(step)) {
        items[items.length - 1] = {
          ...previous,
          action: `${previous.action}；${step.action}`,
          expected: `${previous.expected}；${step.expected}`
        };
        return items;
      }
      items.push(step);
      return items;
    }, []);
    const fixtureValues: Record<string, string> = {};
    const seed = canonicalJson({
      caseId: intentPlan.caseId,
      caseVersion: intentPlan.caseVersion,
      intentPlanHash,
      targetProfileHash: intentPlan.targetProfileHash,
      template: 'GENERIC_WEB_V2'
    });
    const executablePlanId = `eap_${sha256(seed).slice(0, 40)}`;
    const firstStep = coalescedSource[0];
    // Loading the entry URL must not consume a user's first business check.
    const executionSource = firstStep && !firstStep.operationHint &&
      !/^(?:打开|访问|进入登录|前往登录|navigate\b|open\b|go\s+to\b)/i.test(firstStep.action)
      ? [{ ...firstStep, action: '打开目标站点入口页', expected: '入口页已加载', inputValueSource: 'NONE' as const, operationHint: 'goto' as const }, ...coalescedSource]
      : coalescedSource;
    const actions: Array<Record<string, unknown> & { ordinal: number; operation: ExecutableActionPlan['actions'][number]['operation'] }> = executionSource.map((step, index) => {
      const text = `${step.action} ${step.expected}`;
      const stateOnly = !step.operationHint && /^(?:(?:完成(?:核对|检查|验证)|(?:核对|检查|验证)完成)后)?(?:确认|确保)?(?:当前)?(?:页面)?(?:保持|停留)/u.test(step.action) &&
        !/(?:点击|输入|填写|选择|上传|下载|打开|进入|前往)/u.test(step.action);
      const stayOnPage = stateOnly && String(step.action).match(/(?:保持在|停留在|页面为)([^，,；;。]+?(?:页面|页|列表|清单))[。]?$/u);
      const actionText = stayOnPage ? `核对${stayOnPage[1]}` : String(step.action || '').trim();
      const first = index === 0;
      let operation: ExecutableActionPlan['actions'][number]['operation'] = step.operationHint ?? (first ? 'goto' : 'click');
      // A bare "查询一份文档" and "确认下载入口" describe inspection, not a
      // click.  A genuine search/download must state its input/control or the
      // direct download action.  This keeps generic plans from inventing UI
      // controls that a target site never exposed.
      const readOnlyInspection = !step.operationHint && !first && (
        /^(?:(?:在|于)[^，,；;]{1,80}?(?:中|内|里|页面)\s*)?(?:只读|仅)?(?:(?:查看|浏览|读取|列出|展示|显示|确认|验证|核验|检查|校验|核对|查询|查找|定位)\s*|(?:inspect|verify|check|confirm|view|read|list|show|find|locate)\b\s*)/i.test(actionText) &&
        !/(?:点击|进入|导航(?:至|到)?|前往|输入|填写|选择|下拉|筛选|过滤|上传)|^(?:click|enter|navigate|go\s+to|fill|type|select|filter|upload)\b/i.test(actionText) &&
        !/(?:^|[\s，,；;])(?:点击)?下载(?:文件|文档|回单|报表)?(?:$|[\s，,；;])/i.test(actionText)
      );
      if (readOnlyInspection) operation = 'expectVisible';
      else if (!step.operationHint && !first && /(?:输入|填写)|^(?:fill|type)\b/i.test(actionText)) operation = 'fill';
      // When the approved instruction explicitly says to click a navigation
      // item, a later alternative word such as “or select” describes the
      // user's choice of that item; it does not turn the control into an HTML
      // select element. Keep the explicit executor verb authoritative.
      else if (!step.operationHint && !first && /(?:点击|选择并进入)|^(?:click)\b/i.test(actionText)) operation = 'click';
      else if (!step.operationHint && !first && /(?:选择|下拉|select|筛选|过滤|filter)/i.test(actionText)) operation = 'select';
      else if (!step.operationHint && !first && /(?:勾选|复选|check)/i.test(actionText)) operation = 'check';
      else if (!step.operationHint && !first && /(?:上传|upload)/i.test(actionText)) operation = 'upload';
      else if (!step.operationHint && !first && /(?:下载|download)/i.test(actionText)) operation = 'download';
      // “查看列表/信息/明细” describes a read-only page fact, not a click.
      // Treating it as a click forces the vision locator to find a nonexistent
      // interactive control and can misidentify a similarly named top-nav item.
      // Explicit navigation and click wording still retain their side effect.
      else if (!step.operationHint && !first && /(?:查看|浏览|读取|列出|定位|展示.*(?:列表|信息|明细)|显示.*(?:列表|信息|明细))/i.test(actionText) &&
        !/(?:点击|进入|导航(?:至|到)?|前往)/i.test(actionText)) operation = 'expectVisible';
      else if (!step.operationHint && !first && /(?:进入|导航(?:至|到)?|打开.*(?:页|页面)|go\s*to|navigate)/i.test(actionText)) operation = 'click';
      // Verification keywords alone do not prove a runtime challenge.  A
      // policy must be explicitly bound to an action by the deterministic plan.
      else if (!step.operationHint && !first && /(?:验证|核验|确认|检查|显示|一致|verify|expect)/i.test(actionText)) operation = 'expectVisible';
      else if (!step.operationHint && !first && /(?:等待.*(?:页面|跳转)|wait.*url)/i.test(actionText)) operation = 'waitForURL';
      if (!step.operationHint && /错误|异常|error/i.test(actionText) && /无错误|没有错误|未出现.*(?:错误|异常)|无.*加载异常|no\s+errors?/i.test(step.expected)) operation = 'expectNoErrors';
      const pageObservation = operation === 'expectVisible' ? accountObservation(actionText, intentPlan.adapterBinding ?? snapshot.adapterBinding) : undefined;
      const targetRef = `DYNAMIC_${String(index + 1).padStart(3, '0')}`;
      const fixtureRef = step.inputValueSource === 'CREDENTIAL_REF'
        ? (/password|密码/i.test(text) ? 'CREDENTIAL.PASSWORD' : 'CREDENTIAL.USERNAME')
        : `GENERIC.INPUT.${String(index + 1).padStart(3, '0')}`;
      if (operation === 'fill' || operation === 'upload') {
        if (step.inputValueSource === 'USER_TEXT' && step.inputValue) fixtureValues[fixtureRef] = step.inputValue;
      }
      // A filtering instruction normally names the value that must be selected
      // (for example “筛选近期交易”).  Preserve that user-visible value as a
      // deterministic select option rather than treating the filter as a
      // generic click.  If no value can be extracted, leave the fixture absent
      // so the Worker fails closed instead of choosing an arbitrary option.
      if (operation === 'select' && !fixtureValues[fixtureRef]) {
        const filterValue = String(step.inputValue || step.action || '')
          .replace(/^\s*(?:选择|下拉|select|筛选|过滤|filter)(?:为)?\s*/i, '')
          .replace(/[，,。；;].*$/, '')
          .trim();
        if (filterValue) fixtureValues[fixtureRef] = filterValue;
      }
      const actionId = `act_${String(index + 1).padStart(2, '0')}_${sha256(canonicalJson({ executablePlanId, index, step })).slice(0, 20)}`;
      const needsTarget = ['fill', 'click', 'select', 'check', 'upload', 'download', 'expectVisible'].includes(operation);
      return {
        actionId,
        ordinal: index + 1,
        operation,
        instruction: stayOnPage ? actionText : step.action,
        expected: step.expected,
        ...(pageObservation ? { pageObservation } : {}),
        ...(step.inputValue ? { inputValue: step.inputValue } : {}),
        ...(step.inputValueSource ? { inputValueSource: step.inputValueSource } : {}),
        pageSignature: {
          routePatternRef: 'TARGET_PROFILE',
          landmarkRef: 'GENERIC_PAGE',
          requiredAriaRefs: needsTarget ? [targetRef] : []
        },
        ...(needsTarget ? { semanticTargetRef: targetRef } : {}),
        ...(operation === 'goto' ? { routeRef: 'LAUNCH_URL' } : {}),
        ...(operation === 'waitForURL' ? { routePatternRef: step.routePatternHint ?? 'ALLOWED_NAVIGATION' } : {}),
        ...(operation === 'select' ? { optionRef: fixtureRef } : {}),
        fixtureRefs: operation === 'fill' || operation === 'upload' ? [fixtureRef] : [],
        preconditions: index === 0 ? ['目标站点档案已由用户确认并冻结'] : ['上一动作已由 Playwright 验证'],
        invariants: ['仅在目标站点档案允许的导航与交互源中操作', '不得记录凭据、Cookie 或 Storage State', ...readOnlyConstraints],
        postconditions: [operation.startsWith('expect') ? '业务断言成立' : '页面事实与动作结果已记录'],
        riskLevel: step.riskLevel,
        retryPolicy: { maximumRetries: operation === 'goto' || operation === 'waitForURL' ? 1 as const : 0 as const, sideEffectFree: !['click', 'check', 'upload'].includes(operation) },
        branchRules: [],
        failureExit: 'FAIL_ACTION' as const,
        evidencePolicy: operation.startsWith('expect') ? 'FACTS_AND_SCREENSHOT' as const : 'FACTS' as const,
        sourceIntentStepId: step.intentStepId
      };
    });
    actions.push({
      actionId: `act_${String(actions.length + 1).padStart(2, '0')}_${sha256(`${executablePlanId}:final`).slice(0, 20)}`,
      ordinal: actions.length + 1,
      operation: 'screenshot',
      instruction: '保存最终页面证据',
      expected: '最终页面证据已保存',
      pageSignature: { routePatternRef: 'TARGET_PROFILE', landmarkRef: 'GENERIC_PAGE', requiredAriaRefs: [] },
      fixtureRefs: [],
      preconditions: ['上一动作已由 Playwright 验证'],
      invariants: ['证据必须脱敏'],
      postconditions: ['最终证据已保存'],
      riskLevel: 'LOW',
      retryPolicy: { maximumRetries: 0, sideEffectFree: true },
      branchRules: [],
      failureExit: 'FAIL_ACTION',
      evidencePolicy: 'FACTS_AND_SCREENSHOT',
      sourceIntentStepId: atomicSource.at(-1)!.intentStepId
    });
    return executableActionPlanSchema.parse({
      schemaVersion: 'hengzhun-executable-action-plan-v2',
      executablePlanId,
      caseId: intentPlan.caseId,
      caseVersion: intentPlan.caseVersion,
      intentPlanHash,
      planVersion: 2,
      fixtureProfile: 'GENERIC_WEB',
      fixtureValues,
      targetProfileId: intentPlan.targetProfileId,
      targetProfileVersion: intentPlan.targetProfileVersion,
      targetProfileHash: intentPlan.targetProfileHash,
      targetProfileSnapshot: snapshot,
      actions
    });
  }
  let routePath = intentPlan.route;
  try {
    routePath = new URL(intentPlan.route).pathname;
  } catch {
    // A relative route is valid only when it matches the controlled portal route below.
  }
  const transferProfile = intentPlan.executionProfile === 'TRANSFER_UKEY_ORDER_QUERY' || controlledTransferCase;
  // A controlled login case is compiled into the fixed allow-listed template
  // below.  The controller's semantic risk labels describe the user's prose,
  // not the executable operations: rejecting a MEDIUM label here stranded
  // ordinary login/profile cases before that deterministic template could
  // replace the plan.  Keep the route boundary as the enforcement point; all
  // emitted executable actions remain LOW risk and allow-listed.
  if (routePath !== ROUTES.PORTAL_LOGIN) {
    throw new Error('I8_STAGE3_PROFILE_UNSUPPORTED');
  }
  const source = intentPlan.steps;
  const template = transferProfile ? transferActionTemplate : actionTemplate;
  const fixtureValues: Record<string, string> = {};
  if (transferProfile) {
    const inputs = intentPlan.typedBusinessInputs?.values;
    if (intentPlan.inputContractVersion !== 'TypedBusinessInputsV2' || !inputs?.payerAccountId || !inputs.payeeRef || !inputs.amount || !inputs.currency || !inputs.purpose) {
      throw new Error('I10_TYPED_BUSINESS_INPUT_REQUIRED');
    }
    fixtureValues['TRANSFER.PAYER_ACCOUNT_ID'] = inputs.payerAccountId;
    fixtureValues['TRANSFER.PAYEE_REF'] = inputs.payeeRef;
    fixtureValues['TRANSFER.AMOUNT'] = inputs.amount;
    fixtureValues['TRANSFER.CURRENCY'] = inputs.currency;
    fixtureValues['TRANSFER.PURPOSE'] = inputs.purpose;
    fixtureValues['TRANSFER.EXPECTED_STATUS'] = '已结算';
  }
  const seed = canonicalJson({ caseId: intentPlan.caseId, caseVersion: intentPlan.caseVersion, intentPlanHash, template: transferProfile ? 'TRANSFER_UKEY_ORDER_QUERY_V1' : 'LOGIN_PROFILE_V1' });
  const executablePlanId = `eap_${sha256(seed).slice(0, 40)}`;
  const actions = template.map((templateAction, index) => {
    const sourceIntentStepId = source[Math.min(Math.floor(index / Math.ceil(template.length / source.length)), source.length - 1)]!.intentStepId;
    const actionId = `act_${String(index + 1).padStart(2, '0')}_${sha256(canonicalJson({ executablePlanId, index, templateAction })).slice(0, 20)}`;
    return {
      actionId,
      ordinal: index + 1,
      operation: templateAction.operation,
      pageSignature: pageSignature(templateAction.page),
      ...(templateAction.target ? { semanticTargetRef: templateAction.target } : {}),
      ...('comparisonTargetRef' in templateAction ? { comparisonTargetRef: templateAction.comparisonTargetRef } : {}),
      ...('routeRef' in templateAction ? { routeRef: templateAction.routeRef } : {}),
      ...('routePatternRef' in templateAction ? { routePatternRef: templateAction.routePatternRef } : {}),
      ...('optionRef' in templateAction ? { optionRef: templateAction.optionRef } : {}),
      fixtureRefs: [...templateAction.fixture],
      preconditions: index === 0 ? ['受控客户 Fixture 已准备'] : ['上一动作已由 Playwright 验证'],
      invariants: ['仅访问复兴银行门户受控路由', '不得记录凭据、Cookie 或 Storage State'],
      postconditions: [templateAction.operation.startsWith('expect') ? '业务断言成立' : '页面事实与动作结果已记录'],
      riskLevel: 'LOW' as const,
      retryPolicy: { maximumRetries: templateAction.operation === 'goto' || templateAction.operation.startsWith('wait') ? 1 as const : 0 as const, sideEffectFree: templateAction.target !== 'TRANSFER_FIRST_CONFIRM' },
      branchRules: [],
      failureExit: 'FAIL_ACTION' as const,
      evidencePolicy: templateAction.operation === 'screenshot' ? 'FACTS_AND_SCREENSHOT' as const : 'FACTS' as const,
      ...(templateAction.target === 'TRANSFER_FIRST_CONFIRM' ? { verificationPolicy: {
        mode: 'AUTO_PERSISTED_UKEY' as const,
        triggerAfterTargetRef: 'TRANSFER_FIRST_CONFIRM',
        expectedRoutes: ['/portal/verification', '/portal/transfers/'],
        successRoute: '/portal/transfers/',
        successEvidenceTargetRef: 'TRANSFER_SETTLED'
      } } : {}),
      sourceIntentStepId
    };
  });
  return executableActionPlanSchema.parse({
    schemaVersion: 'i8-executable-action-plan-v1',
    executablePlanId,
    caseId: intentPlan.caseId,
    caseVersion: intentPlan.caseVersion,
    intentPlanHash,
    planVersion: 1,
    fixtureProfile: transferProfile ? 'TRANSFER_UKEY_ORDER_QUERY' : 'LOGIN_PROFILE',
    fixtureValues,
    actions
  });
}

function locatorFor(action: ExecutableActionPlan['actions'][number], record: VerifiedActionRecord, generic: boolean): CandidateLocator | undefined {
  if (!action.semanticTargetRef) return undefined;
  if (generic) {
    if (!record.locator || !['ROLE', 'LABEL', 'TEST_ID', 'PLACEHOLDER', 'TEXT', 'CSS'].includes(record.locator.kind)) {
      throw new Error('I10_GENERIC_VERIFIED_LOCATOR_REQUIRED');
    }
    return record.locator;
  }
  const controlled = TARGETS[action.semanticTargetRef as keyof typeof TARGETS];
  if (!controlled || !record.locator || record.locator.kind !== controlled.kind || record.locator.value !== controlled.value) {
    throw new Error('I8_VERIFIED_LOCATOR_NOT_ALLOWLISTED');
  }
  if (action.comparisonTargetRef && !TARGETS[action.comparisonTargetRef as keyof typeof TARGETS]) {
    throw new Error('I8_COMPARISON_TARGET_NOT_ALLOWLISTED');
  }
  return controlled;
}

export function buildDslDocument(planInput: unknown, recordsInput: unknown): { dsl: DslDocument; locators: Record<string, CandidateLocator>; fixtures: Record<string, string>; routes: Record<string, string>; verificationPolicies: Record<string, unknown> } {
  const plan = executableActionPlanSchema.parse(planInput);
  const records = (Array.isArray(recordsInput) ? recordsInput : []).map(record => verifiedActionRecordSchema.parse(record));
  if (plan.actions.some(action => action.pageObservation) && !isFuxingBankDemoAdapter(plan.targetProfileSnapshot?.adapterBinding)) throw new Error('BANK_OBSERVATION_BINDING_REQUIRED');
  if (records.length !== plan.actions.length) throw new Error('I8_VERIFIED_ACTION_SET_INCOMPLETE');
  const byAction = new Map(records.map(record => [record.actionId, record]));
  const generic = plan.fixtureProfile === 'GENERIC_WEB';
  const locators: Record<string, CandidateLocator> = {};
  const verificationPolicies: Record<string, unknown> = {};
  const steps = plan.actions.map(action => {
    const record = byAction.get(action.actionId);
    if (!record || record.executablePlanId !== plan.executablePlanId || record.ordinal !== action.ordinal) throw new Error('I8_VERIFIED_ACTION_MISMATCH');
    const expectedPageHash = sha256(canonicalJson(action.pageSignature));
    if (record.pageSignatureHash !== expectedPageHash) throw new Error('I8_PAGE_SIGNATURE_HASH_MISMATCH');
    const locator = locatorFor(action, record, generic);
    if (locator && action.semanticTargetRef) locators[action.semanticTargetRef] = locator;
    if (action.verificationPolicy) verificationPolicies[action.actionId] = { ...action.verificationPolicy, ...(record.verificationLocator ? { verifiedLocator: record.verificationLocator } : {}) };
    if (action.comparisonTargetRef) {
      const comparison = TARGETS[action.comparisonTargetRef as keyof typeof TARGETS];
      if (!comparison) throw new Error('I8_COMPARISON_TARGET_NOT_ALLOWLISTED');
      locators[action.comparisonTargetRef] = comparison;
    }
    const base = { stepId: `dsl_${String(action.ordinal).padStart(2, '0')}`, sourceActionId: action.actionId };
    switch (action.operation) {
      case 'goto': return { ...base, operation: 'goto' as const, routeRef: action.routeRef! };
      case 'fill': return { ...base, operation: 'fill' as const, targetRef: action.semanticTargetRef!, fixtureValueRef: action.fixtureRefs[0]! };
      case 'click': return { ...base, operation: 'click' as const, targetRef: action.semanticTargetRef! };
      case 'select': return { ...base, operation: 'select' as const, targetRef: action.semanticTargetRef!, optionRef: action.optionRef! };
      case 'check': return { ...base, operation: 'check' as const, targetRef: action.semanticTargetRef! };
      case 'upload': return { ...base, operation: 'upload' as const, targetRef: action.semanticTargetRef!, fixtureValueRef: action.fixtureRefs[0]! };
      case 'download': return { ...base, operation: 'download' as const, targetRef: action.semanticTargetRef!, timeoutPolicyRef: 'DEFAULT_30S' };
      case 'switchPage': return { ...base, operation: 'switchPage' as const, pageRef: 'LATEST_PAGE' };
      case 'enterFrame': return { ...base, operation: 'enterFrame' as const, targetRef: action.semanticTargetRef! };
      case 'exitFrame': return { ...base, operation: 'exitFrame' as const };
      case 'humanVerification': return { ...base, operation: 'humanVerification' as const, verificationType: 'USER_ASSISTED' };
      case 'waitForURL': return { ...base, operation: 'waitForURL' as const, routePatternRef: action.routePatternRef!, timeoutPolicyRef: 'DEFAULT_30S' };
      case 'waitForResponse': return { ...base, operation: 'waitForResponse' as const, responsePatternRef: action.responsePatternRef!, timeoutPolicyRef: 'DEFAULT_30S' };
      case 'expectVisible': return { ...base, operation: 'expectVisible' as const, targetRef: action.semanticTargetRef!, ...(action.pageObservation ? { pageObservation: action.pageObservation } : {}) };
      case 'expectNoErrors': return { ...base, operation: 'expectNoErrors' as const };
      case 'expectText': return { ...base, operation: 'expectText' as const, targetRef: action.semanticTargetRef!, expectedTextRef: action.fixtureRefs[0]! };
      case 'expectEqual': return { ...base, operation: 'expectEqual' as const, targetRef: action.semanticTargetRef!, comparisonTargetRef: action.comparisonTargetRef! };
      case 'screenshot': return { ...base, operation: 'screenshot' as const, evidenceNameRef: 'LOGIN_PROFILE_FINAL' };
    }
  });
  const launchUrl = generic ? String(plan.targetProfileSnapshot?.launchUrl ?? '') : '';
  const allowedNavigationOrigins = generic
    ? Array.from(new Set(
        (Array.isArray(plan.targetProfileSnapshot?.allowedNavigationOrigins)
          ? plan.targetProfileSnapshot.allowedNavigationOrigins
          : [new URL(launchUrl).origin])
          .map(value => String(value).trim())
          .filter(Boolean)
      )).sort()
    : [];
  const selectedAuthentication=authenticationForTargetAdapter(plan.targetProfileSnapshot?.adapterBinding)??bankAuthentication;
  const bankRoutes = {
    IDENTITY_PROVIDER: canonicalJson({origin:selectedAuthentication.identityOrigin,path:selectedAuthentication.issuerPath}),
    PORTAL_AUTHENTICATED: canonicalJson({origin:new URL(String(plan.targetProfileSnapshot?.launchUrl ?? selectedAuthentication.portalOrigin)).origin,path:selectedAuthentication.authenticatedPath})
  };
  const routes = generic
    ? { LAUNCH_URL: launchUrl, ALLOWED_NAVIGATION: canonicalJson(allowedNavigationOrigins),
        CREDENTIAL_ORIGINS: canonicalJson(plan.targetProfileSnapshot?.credentialOrigins ?? []),
        ...(authenticationForTargetAdapter(plan.targetProfileSnapshot?.adapterBinding) ? bankRoutes : {}) }
    : {...ROUTES,...bankRoutes,CREDENTIAL_ORIGINS:canonicalJson([bankAuthentication.identityOrigin])};
  return { dsl: dslDocumentSchema.parse({ schemaVersion: generic ? 'HENGZHUN_DSL_V2' : 'HENGZHUN_DSL_V1', executablePlanId: plan.executablePlanId, steps }), locators, fixtures: plan.fixtureValues, routes, verificationPolicies };
}

function generatedSourceLegacy(dsl: DslDocument, locators: Record<string, CandidateLocator>, fixtures: Record<string, string>, routes: Record<string, string>, verificationPolicies: Record<string, unknown> = {}, assertionImplementations: Record<string, string> = {}): string {
  const embedded = canonicalJson({ dsl, locators, routes, timeouts: TIMEOUTS, fixtures, verificationPolicies, assertionImplementations });
  return `'use strict'\nconst PACKAGE = Object.freeze(${embedded})\n\nfunction locator(page, ref) {\n  const item = PACKAGE.locators[ref]\n  if (!item) throw Object.assign(new Error('Target is not allowlisted'), { code: 'CANDIDATE_TARGET_NOT_ALLOWLISTED' })\n  if (item.kind === 'TEST_ID') return page.getByTestId(item.value)\n  if (item.kind === 'LABEL') return page.getByLabel(item.value, { exact: true })\n  if (item.kind === 'PLACEHOLDER') return page.getByPlaceholder(item.value, { exact: true })\n  if (item.kind === 'TEXT') return page.getByText(item.value, { exact: true })\n  if (item.kind === 'CSS') return page.locator(item.value)\n  if (item.kind === 'ROLE') {\n    const [role, ...nameParts] = item.value.split('|'); const name = nameParts.join('|')\n    return page.getByRole(role, { name, exact: true })\n  }\n  throw Object.assign(new Error('Locator kind is not allowlisted'), { code: 'CANDIDATE_LOCATOR_KIND_INVALID' })\n}\n\nfunction routeUrl(baseUrl, routeRef) {\n  const route = PACKAGE.routes[routeRef]\n  if (!route) throw Object.assign(new Error('Route is not allowlisted'), { code: 'CANDIDATE_ROUTE_NOT_ALLOWLISTED' })\n  const base = new URL(baseUrl)\n  const resolved = new URL(route, base)\n  return resolved\n}\n\nasync function execute(context) {\n  const { page, baseUrl, fixtures, capture, afterStep, humanVerification, onStep } = context\n  const runtimeFixtures = Object.freeze({ ...PACKAGE.fixtures, ...fixtures })\n  const facts = []\n  for (const step of PACKAGE.dsl.steps) {\n    if (typeof onStep === 'function') await onStep({ phase: 'STARTED', stepId: step.stepId, operation: step.operation, targetRef: step.targetRef || null }, page)\n    if (step.operation === 'goto') await page.goto(routeUrl(baseUrl, step.routeRef).toString(), { waitUntil: 'domcontentloaded', timeout: PACKAGE.timeouts.DEFAULT_30S })\n    else if (step.operation === 'fill') await locator(page, step.targetRef).fill(runtimeFixtures[step.fixtureValueRef])\n    else if (step.operation === 'click') await locator(page, step.targetRef).click()\n    else if (step.operation === 'select') await locator(page, step.targetRef).selectOption(runtimeFixtures[step.optionRef] || step.optionRef)\n    else if (step.operation === 'check') await locator(page, step.targetRef).check()\n    else if (step.operation === 'upload') await locator(page, step.targetRef).setInputFiles(runtimeFixtures[step.fixtureValueRef])\n    else if (step.operation === 'download') { const pending = page.waitForEvent('download', { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] }); await locator(page, step.targetRef).click(); await pending }\n    else if (step.operation === 'switchPage') page = context.pages?.[step.pageRef] || page\n    else if (step.operation === 'humanVerification') { if (typeof humanVerification !== 'function') throw Object.assign(new Error('Human verification is required'), { code: 'CANDIDATE_HUMAN_VERIFICATION_REQUIRED' }); await humanVerification(step, page) }\n    else if (step.operation === 'waitForURL') await page.waitForLoadState('domcontentloaded', { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] })\n    else if (step.operation === 'waitForResponse') await page.waitForResponse((response) => response.url().includes(step.responsePatternRef), { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] })\n    else if (step.operation === 'expectVisible' && !(await locator(page, step.targetRef).isVisible())) throw Object.assign(new Error('Expected target to be visible'), { code: 'CANDIDATE_EXPECT_VISIBLE_FAILED' })\n    else if (step.operation === 'expectText') { const actual = (await locator(page, step.targetRef).innerText()).trim(); if (actual !== runtimeFixtures[step.expectedTextRef]) throw Object.assign(new Error('Expected text did not match'), { code: 'CANDIDATE_EXPECT_TEXT_FAILED' }) }\n    else if (step.operation === 'expectEqual') { const left = (await locator(page, step.targetRef).innerText()).trim(); const right = (await locator(page, step.comparisonTargetRef).innerText()).trim(); if (left !== right) throw Object.assign(new Error('Expected values to be equal'), { code: 'CANDIDATE_EXPECT_EQUAL_FAILED' }) }\n    else if (step.operation === 'screenshot') await capture(step.evidenceNameRef, page)\n    if (typeof afterStep === 'function') await afterStep(step, page)\n    facts.push({ stepId: step.stepId, operation: step.operation, passed: true })\n    if (typeof onStep === 'function') await onStep({ phase: 'PASSED', stepId: step.stepId, operation: step.operation, targetRef: step.targetRef || null }, page)\n  }\n  return { outcome: 'PASSED', facts }\n}\n\nmodule.exports = Object.freeze({ schemaVersion: 'hengzhun-candidate-module-v2', execute })\n`;
}

export function generatedSource(dsl: DslDocument, locators: Record<string, CandidateLocator>, fixtures: Record<string, string> = {}, routes: Record<string, string> = ROUTES, verificationPolicies: Record<string, unknown> = {}, assertionImplementations: Record<string, string> = {}): string {
  const legacy = generatedSourceLegacy(dsl, locators, fixtures, routes, verificationPolicies, assertionImplementations);
  const exactAssertion = `async function assertExact(page, step, fixtures) {
  let left, right;
  try {
    const target = locator(page, step.targetRef);
    await target.waitFor({ state: 'visible', timeout: PACKAGE.timeouts.DEFAULT_30S });
    left = await target.elementHandle();
    if (step.operation === 'expectEqual') {
      const comparison = locator(page, step.comparisonTargetRef);
      await comparison.waitFor({ state: 'visible', timeout: PACKAGE.timeouts.DEFAULT_30S });
      right = await comparison.elementHandle();
    }
    const observed = await page.waitForFunction(({ left, right, expected }) => right
      ? left.innerText.trim() === right.innerText.trim()
      : left.innerText.trim() === expected,
      { left, right, expected: fixtures[step.expectedTextRef] }, { timeout: PACKAGE.timeouts.DEFAULT_30S });
    await observed.dispose();
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    throw Object.assign(new Error('Exact assertion did not satisfy its unchanged goal'),
      { code: step.operation === 'expectEqual' ? 'CANDIDATE_EXPECT_EQUAL_FAILED' : 'CANDIDATE_EXPECT_TEXT_FAILED' });
  } finally {
    if (left) await left.dispose();
    if (right) await right.dispose();
  }
}

`;
  const factsAnchor = "const facts = []";
  const factsWithNavigationBaseline = "const facts = []\n  let navigationBaseline = null";
  const clickAnchor = "else if (step.operation === 'click') await locator(page, step.targetRef).click()";
  const clickWithNavigationBaseline = "else if (step.operation === 'click') { if (step.targetRef === 'TRANSFER_SUBMIT' || step.targetRef === 'TRANSFER_FIRST_CONFIRM') { const form = page.getByTestId('transfer-form'); for (const [attribute, ref] of [['data-payer-account-id','TRANSFER.PAYER_ACCOUNT_ID'],['data-beneficiary-id','TRANSFER.PAYEE_REF'],['data-currency','TRANSFER.CURRENCY']]) { if (await form.getAttribute(attribute) !== runtimeFixtures[ref]) throw Object.assign(new Error('Actual transfer selection differs from bound business inputs'), {code:'CANDIDATE_TRANSFER_SELECTION_MISMATCH'}) } } const beforeClickUrl = page.url(); await locator(page, step.targetRef).click(); navigationBaseline = beforeClickUrl }";
  const selectAnchor = "else if (step.operation === 'select') await locator(page, step.targetRef).selectOption(runtimeFixtures[step.optionRef] || step.optionRef)";
  const explicitSelect = "else if (step.operation === 'select') { const value = runtimeFixtures[step.optionRef]; const prefix = step.targetRef === 'TRANSFER_SOURCE_ACCOUNT' ? 'transfer-source-option-' : step.targetRef === 'TRANSFER_BENEFICIARY' ? 'transfer-beneficiary-option-' : null; if (prefix) { await locator(page, step.targetRef).click(); await page.getByTestId(prefix + value).click() } else await locator(page, step.targetRef).selectOption(value || step.optionRef) }";
  const instantaneousAssertion = "else if (step.operation === 'expectVisible' && !(await locator(page, step.targetRef).isVisible())) throw Object.assign(new Error('Expected target to be visible'), { code: 'CANDIDATE_EXPECT_VISIBLE_FAILED' })";
  const boundedAssertion = "else if (step.operation === 'expectVisible') { try { await locator(page, step.targetRef).waitFor({ state: 'visible', timeout: PACKAGE.timeouts.DEFAULT_30S }) } catch { throw Object.assign(new Error('Expected target to become visible'), { code: `CANDIDATE_EXPECT_VISIBLE_FAILED_${step.targetRef}` }) } }";
  if (!legacy.includes(instantaneousAssertion)) throw new Error('CANDIDATE_TEMPLATE_EXPECT_VISIBLE_ANCHOR_MISSING');
  const afterStepAnchor = "if (typeof afterStep === 'function') await afterStep(step, page)";
  if (!legacy.includes(afterStepAnchor)) throw new Error('CANDIDATE_TEMPLATE_AFTER_STEP_ANCHOR_MISSING');
  const loadStateOnlyWait = "else if (step.operation === 'waitForURL') await page.waitForLoadState('domcontentloaded', { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] })";
  const boundedUrlWait = "else if (step.operation === 'waitForURL') { const configured = PACKAGE.routes[step.routePatternRef]; let rule; try { rule = JSON.parse(configured) } catch { const route = new URL(configured, baseUrl); rule = { origin: route.origin, path: route.pathname } } const baseline = navigationBaseline || page.url(); await page.waitForURL((url) => Array.isArray(rule) ? rule.includes(url.origin) && url.toString() !== baseline : url.origin === rule.origin && url.pathname.startsWith(rule.path), { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] }); navigationBaseline = null; await page.waitForLoadState('domcontentloaded', { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] }) }";
  const fillAnchor = "else if (step.operation === 'fill') await locator(page, step.targetRef).fill(runtimeFixtures[step.fixtureValueRef])";
const guardedFill = "else if (step.operation === 'fill') { if (/^(CREDENTIAL|LOGIN_PROFILE)\\./.test(step.fixtureValueRef)) { const origins = JSON.parse(PACKAGE.routes.CREDENTIAL_ORIGINS || '[]'); if (!origins.includes(new URL(page.url()).origin)) throw Object.assign(new Error('Credential origin is not approved'), { code: 'CANDIDATE_CREDENTIAL_ORIGIN_NOT_ALLOWED' }); if (PACKAGE.routes.IDENTITY_PROVIDER) { const identity = JSON.parse(PACKAGE.routes.IDENTITY_PROVIDER); const current = new URL(page.url()); if (current.origin !== identity.origin || !(current.pathname === identity.path || current.pathname.startsWith(identity.path + '/'))) throw Object.assign(new Error('Credential realm is not approved'), { code: 'CANDIDATE_CREDENTIAL_REALM_NOT_ALLOWED' }) } } await locator(page, step.targetRef).fill(runtimeFixtures[step.fixtureValueRef]) }";
  if (!legacy.includes(factsAnchor) || !legacy.includes(clickAnchor)) throw new Error('CANDIDATE_TEMPLATE_NAVIGATION_BASELINE_ANCHOR_MISSING');
  if (!legacy.includes(loadStateOnlyWait)) throw new Error('CANDIDATE_TEMPLATE_WAIT_FOR_URL_ANCHOR_MISSING');
  return legacy.replace('async function execute(context)', assertBankAccountFields.toString() + '\n' + assertNoPageErrors.toString() + '\n' + exactAssertion + 'async function execute(context)')
    .replace("else if (step.operation === 'screenshot')", "else if (step.operation === 'expectNoErrors') await assertNoPageErrors(page)\n    else if (step.operation === 'screenshot')")
    .replace("else if (step.operation === 'expectText') {", "else if (step.operation === 'expectText' && PACKAGE.assertionImplementations[step.stepId] === 'EXACT_TEXT') await assertExact(page, step, runtimeFixtures)\n    else if (step.operation === 'expectText') {")
    .replace("else if (step.operation === 'expectEqual') {", "else if (step.operation === 'expectEqual' && PACKAGE.assertionImplementations[step.stepId] === 'EXACT_EQUAL') await assertExact(page, step, runtimeFixtures)\n    else if (step.operation === 'expectEqual') {")
    .replace(factsAnchor, factsWithNavigationBaseline)
    .replace(clickAnchor, clickWithNavigationBaseline)
    .replace(selectAnchor, explicitSelect)
    .replace(instantaneousAssertion, boundedAssertion)
    .replace(loadStateOnlyWait, boundedUrlWait)
    .replace(fillAnchor, guardedFill)
    .replace(afterStepAnchor, "if (step.pageObservation) await assertBankAccountFields(page, step.pageObservation)\n    if (typeof afterStep === 'function') await afterStep(step, page, PACKAGE.verificationPolicies[step.sourceActionId])");
}

export interface CandidatePackage {
  candidateId: string;
  scriptId: string;
  scriptVersion: number;
  dsl: DslDocument;
  dslHash: string;
  scriptSource: string;
  scriptHash: string;
  sourceChainHash: string;
  manifest: Record<string, unknown>;
  manifestHash: string;
}

export interface RestrictedPatchProposal {
  schemaVersion: 'i8-script-patch-proposal-v1';
  operations: Array<Record<string, unknown> & { type: 'TARGET_MAPPING' | 'WAIT_CONDITION' | 'ACTION_PARAMETER' | 'STEP_ORDER' | 'ASSERTION_IMPLEMENTATION' }>;
  rationale: string;
}

export function buildPatchedCandidatePackage(
  planInput: unknown,
  recordsInput: unknown,
  base: { candidateId: string; scriptId: string; scriptVersion: number; sourceChainHash: string },
  proposal: RestrictedPatchProposal,
  attemptNo: number,
  generatedAt: string
): CandidatePackage {
  const { dsl: originalDsl, locators: originalLocators, fixtures, routes, verificationPolicies } = buildDslDocument(planInput, recordsInput);
  let steps = originalDsl.steps.map(step => ({ ...step }));
  const locators = { ...originalLocators };
  const assertionImplementations: Record<string, string> = {};
  for(const value of recordsInput as unknown[]) {
    const record=verifiedActionRecordSchema.parse(value);
    if(!record.assertionImplementation)continue;
    const step=steps.find(item=>item.sourceActionId===record.actionId);
    if(step?.operation!==(record.assertionImplementation==='EXACT_TEXT'?'expectText':'expectEqual'))
      throw new Error('I10_ASSERTION_EXPERIENCE_EVIDENCE_REQUIRED');
    assertionImplementations[step.stepId]=record.assertionImplementation;
  }
  for (const operation of proposal.operations) {
    if (operation.type === 'TARGET_MAPPING') {
      const targetRef = String(operation.targetRef);
      const requested = operation.locator as { kind?: string; value?: string };
      const alternatives = REPAIR_TARGETS[targetRef as keyof typeof REPAIR_TARGETS];
      const controlled = alternatives?.find(item => item.kind === requested?.kind && item.value === requested?.value);
      if (!controlled) throw new Error('I8_PATCH_TARGET_MAPPING_NOT_ALLOWLISTED');
      if (!steps.some(step => 'targetRef' in step && step.targetRef === targetRef)) throw new Error('I8_PATCH_TARGET_UNUSED');
      const current = locators[targetRef as keyof typeof locators];
      if (current?.kind === controlled.kind && current.value === controlled.value) {
        throw new Error('I8_PATCH_TARGET_MAPPING_NOOP');
      }
      locators[targetRef] = controlled;
    } else if (operation.type === 'WAIT_CONDITION') {
      const step = steps.find(item => item.stepId === operation.stepId);
      if (!step || !['waitForURL', 'waitForResponse'].includes(step.operation) || operation.timeoutPolicyRef !== 'DEFAULT_30S') throw new Error('I8_PATCH_WAIT_CONDITION_NOT_ALLOWLISTED');
      Object.assign(step, { timeoutPolicyRef: 'DEFAULT_30S' });
    } else if (operation.type === 'ACTION_PARAMETER') {
      const step = steps.find(item => item.stepId === operation.stepId);
      if (!step || step.operation !== 'select' || operation.parameter !== 'optionRef' || step.optionRef !== operation.value) throw new Error('I8_PATCH_ACTION_PARAMETER_NOT_ALLOWLISTED');
    } else if (operation.type === 'ASSERTION_IMPLEMENTATION') {
      const step = steps.find(item => item.stepId === operation.stepId);
      const expected = step?.operation === 'expectVisible' ? 'BOUNDED_VISIBLE' : step?.operation === 'expectText' ? 'EXACT_TEXT' : step?.operation === 'expectEqual' ? 'EXACT_EQUAL' : undefined;
      if (!expected || operation.implementation !== expected) throw new Error('I8_PATCH_ASSERTION_WEAKENING_REJECTED');
      if (expected === 'BOUNDED_VISIBLE' || assertionImplementations[step!.stepId]) throw new Error('I8_PATCH_ASSERTION_IMPLEMENTATION_NOOP');
      assertionImplementations[step!.stepId] = expected;
    } else if (operation.type === 'STEP_ORDER') {
      const order = operation.orderedStepIds as unknown;
      if (!Array.isArray(order) || order.length !== steps.length || new Set(order).size !== steps.length || steps.some(step => !order.includes(step.stepId))) throw new Error('I8_PATCH_STEP_ORDER_INVALID');
      const reordered = order.map(id => steps.find(step => step.stepId === id)!);
      const fixedOriginal = steps.filter(step => !step.operation.startsWith('expect')).map(step => step.stepId);
      const fixedReordered = reordered.filter(step => !step.operation.startsWith('expect')).map(step => step.stepId);
      if (canonicalJson(fixedOriginal) !== canonicalJson(fixedReordered) || reordered.at(-1)?.operation !== 'screenshot') throw new Error('I8_PATCH_STEP_ORDER_UNSAFE');
      steps = reordered;
    }
  }
  const dsl = dslDocumentSchema.parse({ ...originalDsl, steps });
  const dslJson = canonicalJson(dsl);
  const dslHash = sha256(dslJson);
  const patchHash = sha256(canonicalJson(proposal));
  const sourceChainHash = sha256(canonicalJson({ baseCandidateId: base.candidateId, baseSourceChainHash: base.sourceChainHash, patchHash, attemptNo, generatorVersion: I8_GENERATOR_VERSION }));
  const repairProvenance = canonicalJson({
    schemaVersion: 'i8-repair-provenance-v1',
    baseCandidateId: base.candidateId,
    patchHash,
    attemptNo,
    sourceChainHash
  });
  const scriptSource = `// HENGZHUN_REPAIR_PROVENANCE ${repairProvenance}\n${generatedSource(dsl, locators, fixtures, routes, verificationPolicies, assertionImplementations)}`;
  const scriptHash = sha256(scriptSource);
  const candidateId = `candidate_${sha256(canonicalJson({ sourceChainHash, scriptHash })).slice(0, 40)}`;
  const scriptVersion = base.scriptVersion + attemptNo;
  const manifest = {
    schemaVersion: 'hengzhun-candidate-manifest-v1', candidateId, scriptId: base.scriptId, scriptVersion,
    executablePlanId: dsl.executablePlanId, dslVersion: dsl.schemaVersion, dslHash, assertionImplementations,
    generatorVersion: I8_GENERATOR_VERSION, sourceChainHash, repairOfCandidateId: base.candidateId,
    patchHash, repairAttempt: attemptNo, files: [{ relativePath: 'script.cjs', sha256: scriptHash }], dependencyAllowlist: [],
    verificationPolicyModes: [...new Set(Object.values(verificationPolicies).map((item: any) => String(item?.mode || 'NONE')))].sort(),
    generatedAt
  };
  const manifestHash = sha256(canonicalJson(manifest));
  return { candidateId, scriptId: base.scriptId, scriptVersion, dsl, dslHash, scriptSource, scriptHash, sourceChainHash, manifest, manifestHash };
}

export function buildCandidatePackage(planInput: unknown, recordsInput: unknown, generatedAt: string, reviewedAssertions=new Map<string,ReviewedAssertion>()): CandidatePackage {
  const plan = executableActionPlanSchema.parse(planInput);
  const records = (recordsInput as unknown[]).map(record => verifiedActionRecordSchema.parse(record));
  const { dsl, locators, fixtures, routes, verificationPolicies } = buildDslDocument(plan, records);
  const assertionImplementations:Record<string,string>={},reviewedAssertionApplications:Record<string,ReviewedAssertion & {stepId:string}>={};
  for(const action of plan.actions) {
    const review=reviewedAssertions.get(action.actionId);
    if(!review)continue;
    const operation=review.implementation==='EXACT_TEXT'?'expectText':'expectEqual';
    if(action.operation!==operation||records.find(item=>item.actionId===action.actionId)?.assertionImplementation!==review.implementation)
      throw new Error('I10_ASSERTION_EXPERIENCE_EVIDENCE_REQUIRED');
    const stepId=dsl.steps.find(step=>step.sourceActionId===action.actionId)!.stepId;
    assertionImplementations[stepId]=review.implementation;
    reviewedAssertionApplications[action.actionId]={...review,stepId};
  }
  const dslJson = canonicalJson(dsl);
  const dslHash = sha256(dslJson);
  const recordSetHash = sha256(canonicalJson(records));
  const sourceChainHash = sha256(canonicalJson({ intentPlanHash: plan.intentPlanHash, executablePlanHash: sha256(canonicalJson(plan)), recordSetHash, dslHash, generatorVersion: I8_GENERATOR_VERSION }));
  const scriptSource = generatedSource(dsl, locators, fixtures, routes, verificationPolicies,assertionImplementations);
  const scriptHash = sha256(scriptSource);
  const candidateId = `candidate_${sha256(canonicalJson({ sourceChainHash, scriptHash })).slice(0, 40)}`;
  const scriptId = `script_${sha256(`${plan.caseId}:i8-generated`).slice(0, 40)}`;
  const manifest = {
    schemaVersion: 'hengzhun-candidate-manifest-v1',
    candidateId,
    scriptId,
    scriptVersion: 1,
    caseId: plan.caseId,
    caseVersion: plan.caseVersion,
    executablePlanId: plan.executablePlanId,
    executablePlanVersion: plan.planVersion,
    dslVersion: dsl.schemaVersion,
    dslHash,
    generatorVersion: I8_GENERATOR_VERSION,
    ...(reviewedAssertions.size?{assertionImplementations,reviewedAssertionApplications}:{}),
    sourceChainHash,
    files: [{ relativePath: 'script.cjs', sha256: scriptHash }],
    dependencyAllowlist: [],
    verificationPolicyModes: [...new Set(Object.values(verificationPolicies).map((item: any) => String(item?.mode || 'NONE')))].sort(),
    ...(plan.fixtureProfile === 'GENERIC_WEB' ? {
      targetProfileId: plan.targetProfileId,
      targetProfileVersion: plan.targetProfileVersion,
      targetProfileHash: plan.targetProfileHash,
      targetProfileSnapshot: plan.targetProfileSnapshot
    } : {}),
    generatedAt
  };
  const manifestHash = sha256(canonicalJson(manifest));
  return { candidateId, scriptId, scriptVersion: 1, dsl, dslHash, scriptSource, scriptHash, sourceChainHash, manifest, manifestHash };
}

export const I8_CONTROLLED_CATALOG = Object.freeze({ routes: ROUTES, targets: TARGETS, repairTargets: REPAIR_TARGETS, timeouts: TIMEOUTS });
