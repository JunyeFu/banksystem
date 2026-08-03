export type InteractionModuleKind =
  | 'BRIEF'
  | 'PROGRESS'
  | 'ARTIFACTS'
  | 'INPUT_REQUEST'
  | 'CONFIRMATION'
  | 'USER_STEPS'
  | 'WARNING'
  | 'TECHNICAL_REFERENCE';

export interface InteractionArtifactCard {
  artifactId: string;
  displayName: string;
  purpose: string;
  format: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  href?: string;
  expiresAt?: string;
  oneTime?: boolean;
}

export interface InteractionResponseInput {
  journeyId: string;
  version: number;
  requestIntent: string;
  inputType: string;
  stage: string;
  status: string;
  missingFields: string[];
  contractMissingFields?: unknown[];
  semanticMissingFields?: unknown[];
  allowedActions: string[];
  nextAction: Record<string, unknown>;
  references: Record<string, unknown>;
  progress: Record<string, unknown>;
  error?: Record<string, unknown>;
  recoverable: boolean;
  updatedAt: string;
  artifactCards?: InteractionArtifactCard[];
  interactionMode: string;
  inputRequest?: Record<string, unknown>;
  proposal?: Record<string, unknown>;
}

const fieldLabels: Readonly<Record<string, string>> = Object.freeze({
  credentialRef: '本机安全凭据',
  inputType: '案例输入方式',
  naturalLanguage: '案例描述',
  entryUrl: '被测系统入口地址',
  I10_ENTRY_URL_REQUIRED: '被测系统入口地址',
  I10_ENTRY_URL_INVALID: '有效的HTTP/HTTPS入口地址',
  I10_TARGET_SYSTEM_REQUIRED: '目标系统名称',
  I10_DRAFT_REQUIRED: '完整案例草案',
  I10_DRAFT_STEPS_REQUIRED: '可执行的案例步骤',
  I10_ASSERTIONS_REQUIRED: '验收断言',
  I10_CREDENTIAL_REF_INVALID: '有效的本机安全凭据',
  I10_SEMANTIC_INPUT_REQUIRED: '案例业务信息',
  targetSystem: '目标系统名称',
  caseDraft: '完整案例信息',
  flowiseFileRef: '已上传的受控附件',
  originalFilename: '附件文件名',
  scheduleId: '调度参考编号',
  taskId: '任务参考编号'
});

const actionLabels: Readonly<Record<string, string>> = Object.freeze({
  APPROVE_CASE: '批准案例草案',
  REJECT_CASE: '退回案例草案',
  ACTIVATE_SCRIPT: '激活已验证脚本',
  REJECT_SCRIPT: '不激活脚本',
  RUN_ON_DEMAND: '立即执行一次',
  CREATE_ONE_TIME_SCHEDULE: '创建单次定时回归',
  CREATE_RECURRING_SCHEDULE: '创建周期回归',
  DEFER_EXECUTION: '暂不执行',
  ACTIVATE_REPAIR: '激活已验证修复',
  REJECT_REPAIR: '不激活修复',
  COMPLETE_RUNTIME_VERIFICATION: '已完成人工验证',
  ABORT_RUNTIME_VERIFICATION: '中止本次验证',
  DISABLE_SCHEDULE: '停用该调度',
  CANCEL: '取消'
});

const statusTitles: Readonly<Record<string, string>> = Object.freeze({
  NEEDS_INPUT: '还需要您补充信息',
  AWAITING_USER: '请确认下一步',
  PROCESSING: '衡准正在处理',
  COMPLETED: '本轮处理已完成',
  FAILED: '本轮处理未完成',
  CANCELLED: '操作已取消'
});

const safeText = (value: unknown, fallback = ''): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const humanField = (field: string): string =>
  fieldLabels[field] ??
  (/[\u3400-\u9fff]/.test(field) && /[？?。]$/.test(field) ? field : '必要信息');
const humanAction = (action: string): string => actionLabels[action] ?? '继续';

function requestedInputs(input: InteractionResponseInput) {
  if (input.interactionMode === 'INPUT_REQUIRED' && input.inputRequest) {
    return [{
      field: String(input.inputRequest.inputKind ?? 'userInput'),
      label: safeText(input.inputRequest.prompt, '请补充本轮所需信息'),
      reason: '请只输入本轮所需的非秘密信息，填写后点击proceed提交校验。',
      inputMode: 'USER_FEEDBACK',
      examples: Array.isArray(input.inputRequest.examples) ? input.inputRequest.examples.map(String) : [],
      secretHandling: 'NEVER_ENTER_SECRETS_IN_CHAT'
    }];
  }
  return input.missingFields.map(field => ({
    field,
    label: humanField(field),
    reason: field === 'credentialRef'
      ? '账号密码必须通过本机安全凭据页面录入，不能发送到对话中。'
      : `继续处理前需要提供${humanField(field)}。`,
    inputMode: field === 'credentialRef' ? 'LOCAL_SECURE_FORM' : 'USER_MESSAGE',
    secretHandling: field === 'credentialRef' ? 'NEVER_ENTER_IN_CHAT' : 'NOT_SECRET'
  }));
}

function requiredUserActions(input: InteractionResponseInput) {
  if (input.status === 'NEEDS_INPUT') {
    if (input.inputRequest) {
      return ['按上方示例填写非秘密信息，然后点击proceed提交校验；点击reject取消或保留现状。'];
    }
    return requestedInputs(input).map(item => item.field === 'credentialRef'
      ? '打开本机安全凭据页面录入账号和密码，完成后回到此对话发送“继续”。'
      : `请补充${item.label}。`);
  }
  if (input.status === 'PROCESSING') {
    return ['无需重复提交；稍后发送“继续”即可查询最新状态。'];
  }
  if (input.status === 'FAILED' && input.recoverable) {
    return ['根据上方提示补充或修正信息后重新提交；系统不会在信息不完整时继续调用业务工具。'];
  }
  return [];
}

function briefItems(input: InteractionResponseInput): string[] {
  const description = safeText(input.nextAction.description);
  if (input.status === 'NEEDS_INPUT') {
    return [`当前信息尚不足以安全进入下一阶段。`,
      `缺少：${input.missingFields.map(humanField).join('、')}。`];
  }
  if (input.interactionMode === 'CONFIRM_EXACT' && input.proposal) {
    return [safeText(input.proposal.summary, description || '请确认这一项精确方案。')];
  }
  if (input.status === 'AWAITING_USER') {
    return [description || '当前成果已经通过确定性校验，需要您作出决定。'];
  }
  if (input.status === 'PROCESSING') {
    return [description || '后台任务正在执行，当前无需再次提交。'];
  }
  if (input.status === 'COMPLETED') {
    return [description || '本轮任务已经完成。'];
  }
  if (input.status === 'CANCELLED') {
    return ['本次操作已取消，没有继续执行后续业务动作。'];
  }
  return [safeText(input.error?.message, description || '系统已安全停止本轮处理。')];
}

function selectModuleKinds(input: InteractionResponseInput): InteractionModuleKind[] {
  const modules: InteractionModuleKind[] = [];
  if (input.status === 'FAILED') modules.push('WARNING');
  modules.push('BRIEF');
  if (input.status === 'PROCESSING') modules.push('PROGRESS');
  if ((input.artifactCards?.length ?? 0) > 0) modules.push('ARTIFACTS');
  if (input.status === 'NEEDS_INPUT') modules.push('INPUT_REQUEST');
  if (input.interactionMode === 'CONFIRM_EXACT' && input.proposal) modules.push('CONFIRMATION');
  if (requiredUserActions(input).length > 0) modules.push('USER_STEPS');
  return modules;
}

export function renderInteractionMarkdown(envelope: Record<string, unknown>): string {
  const headline = String(envelope.headline ?? '衡准处理结果');
  const brief = Array.isArray(envelope.briefItems) ? envelope.briefItems.map(String) : [];
  const artifacts = Array.isArray(envelope.artifactCards) ? envelope.artifactCards as Array<Record<string, unknown>> : [];
  const inputs = Array.isArray(envelope.requestedInputs) ? envelope.requestedInputs as Array<Record<string, unknown>> : [];
  const actions = Array.isArray(envelope.requiredUserActions) ? envelope.requiredUserActions.map(String) : [];
  const confirmation = envelope.confirmation as Record<string, unknown> | undefined;
  const warnings = Array.isArray(envelope.warnings) ? envelope.warnings.map(String) : [];
  const progress = envelope.progressSummary as Record<string, unknown> | undefined;
  const lines = [`## ${headline}`, ''];
  for (const warning of warnings) lines.push(`> 注意：${warning}`, '');
  for (const item of brief) lines.push(item, '');
  if (progress) {
    lines.push('### 当前进度', '');
    lines.push(String(progress.message ?? '后台任务正在处理。'), '');
    if (Number.isFinite(progress.percent)) lines.push(`已完成：${Number(progress.percent)}%`, '');
  }
  if (artifacts.length > 0) {
    lines.push('### 可下载成果', '');
    for (const artifact of artifacts) {
      const name = String(artifact.displayName ?? '成果文件');
      const href = typeof artifact.href === 'string' ? artifact.href : '';
      const format = String(artifact.format ?? 'FILE');
      const size = Number(artifact.byteSize ?? 0);
      const digest = String(artifact.sha256 ?? '').slice(0, 12);
      lines.push(href ? `- [下载 ${name}](${href})` : `- ${name}（需要时可申请下载）`);
      lines.push(`  格式：${format}｜大小：${size}字节${digest ? `｜Hash：${digest}…` : ''}`);
    }
    lines.push('');
  }
  if (inputs.length > 0) {
    lines.push('### 请补充', '');
    for (const item of inputs) {
      lines.push(`- ${String(item.label ?? '必要信息')}：${String(item.reason ?? '')}`);
      const examples = Array.isArray(item.examples) ? item.examples.map(String) : [];
      for (const example of examples) lines.push(`  - 示例：${example}`);
    }
    lines.push('');
  }
  if (confirmation && Array.isArray(confirmation.options)) {
    lines.push('### 请确认', '');
    for (const option of confirmation.options as Array<Record<string, unknown>>) {
      lines.push(`- 点击 ${String(option.label ?? 'proceed')}：${String(option.effect ?? '')}`);
    }
    lines.push('');
  }
  if (actions.length > 0) {
    lines.push('### 下一步', '');
    actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  }
  return lines.join('\n').trim();
}

export function composeInteractionResponse(input: InteractionResponseInput): Record<string, unknown> {
  const artifacts = input.artifactCards ?? [];
  const inputs = requestedInputs(input);
  const userActions = requiredUserActions(input);
  const warnings = input.status === 'FAILED'
    ? [safeText(input.error?.message, '系统已失败关闭，没有继续执行未经确认的操作。')]
    : [];
  const confirmation = input.interactionMode === 'CONFIRM_EXACT' && input.proposal
    ? {
        mode: 'CHOICE_ONLY',
        freeTextAllowed: false,
        secretInputAllowed: false,
        proposalId: input.proposal.proposalId,
        payloadHash: input.proposal.payloadHash,
        options: [
          { value: input.proposal.proceedDecision, label: 'proceed（继续）', effect: input.proposal.effect },
          { value: input.proposal.rejectDecision, label: 'reject（拒绝）', effect: input.proposal.rejectEffect }
        ]
      }
    : undefined;
  const response: Record<string, unknown> = {
    schemaVersion: 'hengzhun-i10-interaction-response-v3',
    interactionMode: input.interactionMode,
    headline: statusTitles[input.status] ?? '衡准处理结果',
    briefItems: briefItems(input),
    modules: selectModuleKinds(input),
    ...(input.status === 'PROCESSING' ? {
      progressSummary: {
        message: safeText(input.nextAction.description, '后台任务正在处理。'),
        ...(Number.isFinite(input.progress.percent) ? {
          percent: Math.max(0, Math.min(100, Number(input.progress.percent)))
        } : {})
      }
    } : {}),
    artifactCards: artifacts,
    requestedInputs: inputs,
    requiredUserActions: userActions,
    ...(confirmation ? { confirmation } : {}),
    ...(input.inputRequest ? { inputRequest: input.inputRequest } : {}),
    ...(input.proposal ? { proposal: input.proposal } : {}),
    warnings,
    reference: {
      journeyId: input.journeyId,
      version: input.version,
      updatedAt: input.updatedAt
    },
    technicalDetailsRef: {
      requestIntent: input.requestIntent,
      inputType: input.inputType,
      stage: input.stage,
      status: input.status,
      nextActionType: input.nextAction.type ?? ''
    },
    recoverable: input.recoverable
  };
  response.renderedMarkdown = renderInteractionMarkdown(response);
  return response;
}
