'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeCandidatePackage } = require('./i8-candidate-runner.cjs');
const {
  artifact, throwIfLeaseAborted, bindLeaseAbortToBrowser,
  assertTargetUrlResolution, chromiumHostResolverRules, resolveCredential, sha256,
  targetRuntimeAllowedOrigins
} = require('./i10-worker-utils.cjs');
const { policyForAction } = require('./i10-verification-policy.cjs');
const { requiresVisibleVerification, runVerificationPolicy } = require('./i10-verification-execution.cjs');

const EMPTY_SCREENSHOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const REQUIRED_EVIDENCE_KINDS = Object.freeze(['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER']);

function loadChromium() {
  return require('../../runtime/node_modules/playwright').chromium;
}

function fail(code, message, category = 'ENVIRONMENT') {
  throw Object.assign(new Error(message), { code, category });
}

function formalBaseUrl(task, environment, options) {
  const targetProfile = task.execution?.targetProfile;
  if (targetProfile) {
    const parsed = new URL(targetProfile.launchUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || targetProfile.status !== 'ACTIVE') {
      fail('I10_TARGET_PROFILE_BINDING_INVALID', '目标站点档案无效或未激活。', 'AUTHORIZATION');
    }
    // Candidate packages resolve their frozen route references against a site
    // origin, not the launch page.  A TargetProfile may legitimately use a
    // page such as /portal/login as its launch URL, but passing that pathname
    // through makes the candidate runner reject the base URL before it can
    // execute its (possibly absolute) frozen routes.
    return new URL('/', parsed).href;
  }
  const i10EntryUrl = options.entryUrl || task.execution?.entryUrl;
  if (i10EntryUrl) {
    let parsed;
    try { parsed = new URL(i10EntryUrl); }
    catch { fail('I10_ENTRY_URL_INVALID', 'I10 正式执行入口不是有效 URL。', 'CONTRACT'); }
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'http:' || !loopback || parsed.username || parsed.password
      || parsed.pathname !== '/portal/login' || parsed.search || parsed.hash) {
      fail('I10_ENTRY_URL_NOT_ALLOWED', 'I10 正式执行入口不在受控本机门户白名单中。', 'AUTHORIZATION');
    }
    return new URL('/', parsed).href;
  }
  return (environment.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '') + '/';
}

function runtimeAllowedOrigins(task, baseUrl) {
  return targetRuntimeAllowedOrigins(task.execution?.targetProfile, baseUrl);
}

function safePageLocation(page) {
  try {
    const value = new URL(page.url());
    return `${value.origin}${value.pathname}`;
  } catch {
    return null;
  }
}

async function safePageFingerprint(page) {
  try {
    const snapshot = await page.evaluate(() => ({
      title: document.title || '',
      path: location.pathname || '',
      testIds: [...document.querySelectorAll('[data-testid]')]
        .map(node => node.getAttribute('data-testid') || '')
        .filter(Boolean)
        .sort()
        .slice(0, 128)
    }));
    return sha256(JSON.stringify(snapshot));
  } catch {
    return null;
  }
}

function ordinalForStep(step) {
  const match = String(step?.stepId || '').match(/^dsl_(\d{2,})$/);
  return match ? Number(match[1]) : 0;
}

function quarantinedScreenshotArtifact(content, metadata = {}) {
  return artifact('SCREENSHOT', 'image/png', 'QUARANTINED', 'png', content, {
    evidenceKind: 'SCREENSHOT',
    ...metadata,
    pixelRedactionVerified: false,
    quarantineReason: 'PIXEL_REDACTION_NOT_VERIFIED'
  });
}

function buildDomEvidence(snapshot) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes.slice(0, 512).map(node => ({
    tag: String(node?.tag || '').slice(0, 32),
    role: String(node?.role || '').slice(0, 64),
    type: String(node?.type || '').replace(/password/ig, 'secret').slice(0, 32),
    visible: node?.visible === true,
    attributeHash: /^[a-f0-9]{64}$/.test(String(node?.attributeHash || '')) ? node.attributeHash : sha256(''),
    textHash: /^[a-f0-9]{64}$/.test(String(node?.textHash || '')) ? node.textHash : sha256(''),
  })) : [];
  return {
    schemaVersion: 'hengzhun-dom-evidence/v1',
    path: String(snapshot?.path || '').slice(0, 512),
    titleHash: sha256(String(snapshot?.title || '')),
    nodeCount: Number.isSafeInteger(snapshot?.nodeCount) ? snapshot.nodeCount : nodes.length,
    nodes,
  };
}

function buildNetworkEvidence(events) {
  return {
    schemaVersion: 'hengzhun-network-evidence/v1',
    events: (Array.isArray(events) ? events : []).slice(0, 512).map(event => {
      const parsed = new URL(String(event.url));
      return {
        phase: event.phase === 'response' ? 'response' : 'request',
        method: String(event.method || 'GET').slice(0, 16),
        url: `${parsed.origin}${parsed.pathname}`,
        resourceType: String(event.resourceType || '').slice(0, 32),
        ...(Number.isInteger(event.status) ? { status: event.status } : {}),
      };
    }),
  };
}

function buildEvidenceLedger({ task, candidateId, scriptHash, entries }) {
  return {
    schemaVersion: 'hengzhun-execution-evidence-ledger/v1',
    runId: task.runId,
    taskId: task.taskId,
    caseId: task.caseId,
    candidateId,
    scriptHash,
    entries: entries.map(entry => ({
      evidenceKind: entry.evidenceKind,
      sha256: sha256(entry.bytes),
      byteSize: entry.bytes.byteLength,
    })),
  };
}

async function captureDomEvidence(page) {
  const snapshot = await page.evaluate(async () => {
    const digest = async value => {
      const bytes = new TextEncoder().encode(String(value || ''));
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map(item => item.toString(16).padStart(2, '0')).join('');
    };
    const candidates = [...document.querySelectorAll('body *')];
    const nodes = [];
    for (const node of candidates.slice(0, 512)) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const attributes = ['id', 'name', 'data-testid', 'aria-label'].map(name => node.getAttribute(name) || '').join('\0');
      nodes.push({
        tag: node.tagName.toLowerCase(), role: node.getAttribute('role') || '', type: node.getAttribute('type') || '',
        visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
        attributeHash: await digest(attributes), textHash: await digest((node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 512)),
      });
    }
    return { title: document.title || '', path: location.pathname || '', nodeCount: candidates.length, nodes };
  });
  return buildDomEvidence(snapshot);
}

function evidenceArtifact(evidenceKind, artifactType, mediaType, redactionStatus, extension, bytes, metadata = {}) {
  return artifact(artifactType, mediaType, redactionStatus, extension, bytes, { evidenceKind, ...metadata });
}

async function executeI8FormalRun(task, environment = process.env, options = {}) {
  const descriptor = task.execution?.candidate;
  if (!descriptor?.candidateId || !descriptor.relativeDirectory || !descriptor.scriptHash || !descriptor.manifestHash) {
    fail('I8_CANDIDATE_DESCRIPTOR_INVALID', '正式执行缺少冻结候选身份。', 'CONTRACT');
  }
  const credential = options.credential || resolveCredential(task.execution?.credentialAlias, environment);
  if (!credential || typeof credential.username !== 'string' || typeof credential.password !== 'string'
    || !credential.username || !credential.password) {
    fail('I10_CREDENTIAL_RESOLUTION_INVALID', '正式执行未获得有效的进程内凭据。', 'AUTHORIZATION');
  }
  const productRoot = path.resolve(options.productRoot || path.resolve(__dirname, '..', '..'));
  const runtimeProductRoot = path.resolve(options.runtimeProductRoot || path.resolve(__dirname, '..', '..'));
  const executablePath = environment.HENGZHUN_CHROMIUM_EXECUTABLE
    || path.join(runtimeProductRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  if (!fs.existsSync(executablePath)) fail('CHROMIUM_UNAVAILABLE', '固定 Chromium 不可用。');
  const baseUrl = formalBaseUrl(task, environment, options);
  const targetProfile = task.execution?.targetProfile;
  const allowedOrigins = runtimeAllowedOrigins(task, baseUrl);
  if (targetProfile) {
    for (const origin of allowedOrigins) await assertTargetUrlResolution(origin, targetProfile);
  }
  const candidateManifestPath = path.resolve(productRoot, descriptor.relativeDirectory, 'manifest.json');
  let candidateManifest;
  try { candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8')); }
  catch { fail('I8_CANDIDATE_MANIFEST_UNREADABLE', '正式执行无法读取冻结候选清单。', 'CONTRACT'); }
  // A handoff can only work when the original browser context is visible from
  // the beginning.  Headless runs remain the default for ordinary policies.
  const visibleHandoff = requiresVisibleVerification(candidateManifest, typeof options.onVerificationChallenge === 'function');
  const browser = await loadChromium().launch({
    executablePath,
    headless: !visibleHandoff,
    ...(targetProfile ? { args: [chromiumHostResolverRules(targetProfile)] } : {})
  });
  const detachLeaseAbort = bindLeaseAbortToBrowser(options.signal, browser);
  const context = await browser.newContext({
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: targetProfile?.tlsPolicy === 'ALLOW_SELF_SIGNED'
  });
  const page = await context.newPage();
  const traceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-trace-'));
  const tracePath = path.join(traceDirectory, 'trace.zip');
  let traceActive = false;
  const networkEvents = [];
  let screenshot = EMPTY_SCREENSHOT;
  let currentStep = null;
  try {
    throwIfLeaseAborted(options.signal);
    await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
    traceActive = true;
    page.on('request', request => networkEvents.push({
      phase: 'request', method: request.method(), url: request.url(), resourceType: request.resourceType()
    }));
    page.on('response', response => {
      const request = response.request();
      networkEvents.push({ phase: 'response', method: request.method(), url: response.url(), resourceType: request.resourceType(), status: response.status() });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || allowedOrigins.has(url.origin)) return route.continue();
      return route.abort('blockedbyclient');
    });
    const result = await executeCandidatePackage({ productRoot, ...descriptor }, {
      baseUrl,
      page,
      fixtures: {
        'LOGIN_PROFILE.USERNAME': credential.username,
        'LOGIN_PROFILE.PASSWORD': credential.password,
        'CREDENTIAL.USERNAME': credential.username,
        'CREDENTIAL.PASSWORD': credential.password
      },
      capture: async (_name, currentPage) => {
        screenshot = await currentPage.screenshot({
          fullPage: true,
          mask: targetProfile ? [
            currentPage.locator('input[type="password"]'),
            currentPage.locator('input[autocomplete*="username"],input[autocomplete*="email"],input[autocomplete*="tel"]')
          ] : [
            currentPage.getByTestId('login-username'), currentPage.getByTestId('login-password'),
            currentPage.getByTestId('customer-profile-name'), currentPage.getByTestId('customer-profile-avatar'),
            currentPage.getByTestId('profile-display-name'), currentPage.getByTestId('profile-avatar'),
            currentPage.getByTestId('profile-customer-id'), currentPage.getByTestId('profile-email'), currentPage.getByTestId('profile-phone'),
            currentPage.getByTestId('transfer-recipient-name'), currentPage.getByTestId('transfer-recipient-account'),
            currentPage.getByTestId('transfer-amount'), currentPage.getByTestId('transfer-purpose')
          ],
          maskColor: '#202020'
        });
      },
      afterStep: async (step, currentPage, storedPolicy) => {
        const policy = storedPolicy || policyForAction(
          { semanticTargetRef: step.targetRef }, task.execution?.fixtureProfile, targetProfile?.adapterBinding
        );
        await runVerificationPolicy(currentPage, policy, {
          namespace: task.namespace,
          taskRef: task.taskId,
          actionOrdinal: ordinalForStep(step),
          onVerificationAttempt: options.onVerificationAttempt,
          allowExternalFallback: visibleHandoff,
          onExternalChallenge: options.onVerificationChallenge
            ? attempts => options.onVerificationChallenge({
              verificationType: 'UKEY',
              userPreparation: '请在当前可见浏览器会话中完成页面验证后再点击 proceed。',
              namespace: task.namespace,
              taskRef: task.taskId,
              actionOrdinal: ordinalForStep(step),
              attempts
            })
            : undefined,
          assertSuccessEvidence: async targetRef => (targetRef === 'TRANSFER_SETTLED'
            ? currentPage.locator('[data-testid="transfer-result-status"][data-status="SETTLED"]') : currentPage.getByTestId(targetRef))
            .waitFor({ state: 'visible', timeout: 15_000 })
        });
      },
      onStep: async (step) => { currentStep = { ...step, pageUrl: safePageLocation(page) }; }
    });
    screenshot = await page.screenshot({
      fullPage: true,
      mask: [
        page.locator('input[type="password"]'),
        page.locator('input[autocomplete*="username"],input[autocomplete*="email"],input[autocomplete*="tel"]')
      ],
      maskColor: '#202020'
    });
    const domEvidence = await captureDomEvidence(page);
    const networkEvidence = buildNetworkEvidence(networkEvents);
    await context.tracing.stop({ path: tracePath });
    traceActive = false;
    const trace = fs.readFileSync(tracePath);
    const facts = Array.isArray(result.facts) ? result.facts.map(item => ({ stepId: item.stepId, operation: item.operation, passed: item.passed })) : [];
    const passed = result.outcome === 'PASSED' && facts.length > 0 && facts.every(item => item.passed === true);
    const report = {
      schemaVersion: 'i8-formal-run-report-v1', runId: task.runId, taskId: task.taskId,
      caseId: task.caseId, caseVersion: task.caseVersion, candidateId: descriptor.candidateId,
      scriptHash: descriptor.scriptHash, manifestHash: descriptor.manifestHash,
      freshBrowserContext: true, deterministicPlaywrightOnly: true,
      assertionSetHash: sha256(JSON.stringify(facts)), assertions: facts, passed
    };
    const reportBytes = Buffer.from(JSON.stringify(report, null, 2));
    const logBytes = Buffer.from(`${facts.map(item => `${item.passed ? 'PASS' : 'FAIL'} ${item.stepId} ${item.operation}`).join('\n')}\n`);
    const domBytes = Buffer.from(JSON.stringify(domEvidence, null, 2));
    const networkBytes = Buffer.from(JSON.stringify(networkEvidence, null, 2));
    const ledgerEntries = [
      { evidenceKind: 'REPORT', bytes: reportBytes }, { evidenceKind: 'SCREENSHOT', bytes: screenshot },
      { evidenceKind: 'LOG', bytes: logBytes }, { evidenceKind: 'DOM', bytes: domBytes },
      { evidenceKind: 'TRACE', bytes: trace }, { evidenceKind: 'NETWORK', bytes: networkBytes },
    ];
    const ledgerBytes = Buffer.from(JSON.stringify(buildEvidenceLedger({
      task, candidateId: descriptor.candidateId, scriptHash: descriptor.scriptHash, entries: ledgerEntries,
    }), null, 2));
    const evidence = [
      evidenceArtifact('REPORT', 'REPORT', 'application/json', 'REDACTED', 'json', reportBytes, { schemaVersion: report.schemaVersion, passed }),
      quarantinedScreenshotArtifact(screenshot),
      evidenceArtifact('LOG', 'LOG', 'text/plain; charset=utf-8', 'REDACTED', 'log', logBytes, { containsCredentials: false }),
      evidenceArtifact('DOM', 'JSON', 'application/json', 'REDACTED', 'json', domBytes, { schemaVersion: domEvidence.schemaVersion }),
      evidenceArtifact('TRACE', 'TRACE', 'application/zip', 'QUARANTINED', 'zip', trace, { sourcesIncluded: false }),
      evidenceArtifact('NETWORK', 'JSON', 'application/json', 'REDACTED', 'json', networkBytes, { schemaVersion: networkEvidence.schemaVersion }),
      evidenceArtifact('LEDGER', 'JSON', 'application/json', 'REDACTED', 'json', ledgerBytes, { schemaVersion: 'hengzhun-execution-evidence-ledger/v1' }),
    ];
    return passed
      ? { outcome: 'PASSED', summary: '已激活脚本通过纯 Playwright 正式回归。', evidence }
      : { outcome: 'FAILED', summary: '已激活脚本正式回归断言失败。', errorCode: 'I8_FORMAL_ASSERTION_FAILED', errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: false, evidence };
  } catch (error) {
    throwIfLeaseAborted(options.signal);
    if (!error.code && error.name === 'TimeoutError' && currentStep?.stepId) {
      // Do not infer a page control from arbitrary timeout text.  The frozen
      // step reference in the diagnostic is the factual boundary; a later
      // repair flow can choose a locator candidate from that evidence.
      error.code = 'I8_CANDIDATE_STEP_TIMEOUT';
      error.category = 'TEST_FAILURE';
    }
    const diagnostic = {
      schemaVersion: 'i8-formal-diagnostic-v2', taskId: task.taskId, runId: task.runId,
      candidateId: descriptor.candidateId, errorCode: error.code || 'I8_FORMAL_EXECUTION_FAILED',
      errorClass: String(error?.name || 'Error').slice(0, 80),
      failureStage: currentStep?.phase || 'BEFORE_FIRST_STEP',
      stepId: currentStep?.stepId || null,
      operation: currentStep?.operation || null,
      targetRef: currentStep?.targetRef || null,
      pageLocation: safePageLocation(page),
      pageFingerprint: await safePageFingerprint(page)
    };
    // This boundary is intentionally duplicated in the completion envelope:
    // the Harness needs the same structured fact to distinguish a frozen
    // locator failure from generic candidate-script logic.  No raw error text,
    // page content or credentials cross this boundary.
    error.failureDiagnostic = diagnostic;
    if(/^CANDIDATE_EXPECT_(?:TEXT|EQUAL|VISIBLE)_FAILED(?:_|$)/.test(error.code||'')&&
      ['expectText','expectEqual','expectVisible'].includes(currentStep?.operation)) {
      const report={schemaVersion:'i8-formal-run-report-v1',runId:task.runId,taskId:task.taskId,
        caseId:task.caseId,caseVersion:task.caseVersion,candidateId:descriptor.candidateId,
        scriptHash:descriptor.scriptHash,manifestHash:descriptor.manifestHash,passed:false,
        assertions:[{stepId:currentStep.stepId,operation:currentStep.operation,passed:false}],
        failureReason:error.code,failureDiagnostic:diagnostic};
      const reportBytes=Buffer.from(JSON.stringify(report));
      const domBytes=Buffer.from(JSON.stringify(await captureDomEvidence(page)));
      const networkBytes=Buffer.from(JSON.stringify(buildNetworkEvidence(networkEvents)));
      const failureScreenshot=await page.screenshot({fullPage:true,mask:[
        page.locator('input[type="password"]'),
        page.locator('input[autocomplete*="username"],input[autocomplete*="email"],input[autocomplete*="tel"]')],maskColor:'#202020'});
      await context.tracing.stop({path:tracePath});traceActive=false;
      const trace=fs.readFileSync(tracePath);
      const entries=[{evidenceKind:'REPORT',bytes:reportBytes},{evidenceKind:'DOM',bytes:domBytes},
        {evidenceKind:'SCREENSHOT',bytes:failureScreenshot},{evidenceKind:'NETWORK',bytes:networkBytes},{evidenceKind:'TRACE',bytes:trace}];
      const ledger=Buffer.from(JSON.stringify(buildEvidenceLedger({task,candidateId:descriptor.candidateId,scriptHash:descriptor.scriptHash,entries})));
      return {outcome:'FAILED',summary:'冻结脚本的页面断言失败。',errorCode:'I8_FORMAL_ASSERTION_FAILED',
        errorCategory:'TEST_FAILURE',retryable:false,userActionRequired:true,failureDiagnostic:diagnostic,evidence:[
          evidenceArtifact('REPORT','REPORT','application/json','REDACTED','json',reportBytes,{passed:false}),
          evidenceArtifact('DOM','JSON','application/json','REDACTED','json',domBytes),
          quarantinedScreenshotArtifact(failureScreenshot,{captureContext:'FAILURE'}),
          evidenceArtifact('NETWORK','JSON','application/json','REDACTED','json',networkBytes),
          evidenceArtifact('TRACE','TRACE','application/zip','QUARANTINED','zip',trace),
          evidenceArtifact('LEDGER','JSON','application/json','REDACTED','json',ledger),
        ]};
    }
    error.evidence = [
      artifact('DIAGNOSTIC', 'application/json', 'REDACTED', 'json', JSON.stringify(diagnostic, null, 2), { containsCredentials: false }),
      quarantinedScreenshotArtifact(await page.screenshot({
        fullPage: true,
        mask: [
          page.getByTestId('login-username'), page.getByTestId('login-password'),
          page.getByTestId('transfer-recipient-name'), page.getByTestId('transfer-recipient-account'),
          page.getByTestId('transfer-amount'), page.getByTestId('transfer-purpose')
        ],
        maskColor: '#202020'
      }).catch(() => EMPTY_SCREENSHOT), { captureContext: 'FAILURE' })
    ];
    if (!error.category) error.category = error.name === 'TimeoutError' ? 'ENVIRONMENT' : 'TEST_FAILURE';
    throwIfLeaseAborted(options.signal);
    throw error;
  } finally {
    if (traceActive) await context.tracing.stop().catch(() => {});
    detachLeaseAbort();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    fs.rmSync(traceDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  REQUIRED_EVIDENCE_KINDS, buildDomEvidence, buildNetworkEvidence, buildEvidenceLedger,
  executeI8FormalRun, formalBaseUrl, ordinalForStep, quarantinedScreenshotArtifact, runtimeAllowedOrigins
};
