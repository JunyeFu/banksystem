'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const productRoot = path.resolve(__dirname, '..', '..');
const runtimeRequire = createRequire(path.join(productRoot, 'runtime', 'node_modules', '_hengzhun_loader.cjs'));
const { policyForAction, resolveVerificationAfterAction } = require('./i10-verification-policy.cjs');
const { assertTargetUrlResolution, chromiumHostResolverRules, targetRuntimeAllowedOrigins, authoringExecutionFixtureValues, assertBankValidationLease } = require('./i10-worker-utils.cjs');
const { FUXING_BANK_DEMO_ROUTES: FUXING_ROUTES, FUXING_BANK_DEMO_TARGETS: controlled, FUXING_BANK_DEMO_ROUTE_PATTERNS: FUXING_ROUTE_PATTERNS, selectTransferParty, assertTransferSelection } = require('./adapters/fuxing-bank-demo/index.cjs');
const { buildMidscenePrompt, normalizeMidscenePromptEnvelope } = require('../../dist/harness/src/context-envelope.js');
const { ACCOUNT_FIELD_LABELS, assertBankAccountFields, assertNoPageErrors } = require('../../dist/harness/src/i8/page-observation.js');
const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'config', 'demo-runtime-freeze.json'), 'utf8'));
const I10_MIDSCENE_MAX_LOCATE_ATTEMPTS = 1;
// A visual provider call is remote I/O.  Without a bounded await a single
// stalled request holds the worker loop indefinitely, leaving its Harness
// lease expired while the job still reports RUNNING.  Keep this shorter than
// the worker lease and surface a typed, retryable diagnostic instead.
const I10_MIDSCENE_LOCATE_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(Number(process.env.I10_MIDSCENE_LOCATE_TIMEOUT_MS || 90_000), 90_000)
);
// MiMo accepts Midscene's OpenAI-compatible request shape, but full 1440x900
// lossless screenshots intermittently fail its multimodal prefill validation.
// Midscene defines this value as a divisor (and requires it to be >= 1), so
// 2 sends a valid 720x450 model image while leaving the browser viewport and
// deterministic Playwright assertions unchanged.
const I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR = 2;
// Browser shutdown is external I/O too.  A hung Chromium close used to keep
// the candidate job lease in RUNNING after every verified action had already
// been recorded, because the Worker could never return to its completion
// callback.  Bound cleanup so a stale browser cannot block the Harness write.
const I10_BROWSER_CLOSE_TIMEOUT_MS = 10_000;
const midsceneDiagnosticRoot = path.join(productRoot, '.data', 'evidence', 'i10', 'midscene-diagnostics');

let browserAutomationRuntime;
function loadBrowserAutomationRuntime() {
  if (!browserAutomationRuntime) {
    const { chromium } = runtimeRequire('playwright');
    const { PlaywrightAgent } = runtimeRequire('@midscene/web/playwright');
    browserAutomationRuntime = { chromium, PlaywrightAgent };
  }
  return browserAutomationRuntime;
}

function createMidsceneAgent(page, options = {}) {
  const { PlaywrightAgent } = loadBrowserAutomationRuntime();
  return new PlaywrightAgent(page, { screenshotShrinkFactor: I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR, ...options });
}

// Contexts are persisted before candidate compilation. Earlier package
// versions embedded the fixture name “张三” in display-name prompts. Remove
// that stale assumption at the visual boundary so old preparations remain
// executable; deterministic Playwright assertions still check actual equality.
function normalizeVisualEnvelope(envelope) {
  return normalizeMidscenePromptEnvelope(envelope);
}

function normalizedActionInstruction(action) {
  const instruction = String(action?.instruction || '').replace(/\s+/g, ' ').trim();
  if (action?.operation !== 'expectVisible') return instruction;
  return instruction
    .replace(/^.*完成(?:登录|认证)\s*[；;]/u, '')
    .replace(/^(?:在|于)[^，,；;]{1,80}?(?:中|内|里)\s*(?=(?:只读|仅)?(?:核对|检查|确认|验证|查看|读取))/u, '')
    .replace(/^(?:只读|仅)(?=(?:核对|检查|确认|验证|查看|读取))/u, '')
    .replace(/^在[^；;]{0,80}?(?:页面|页)\s*(?:查看|确认|验证|检查|核对|查询)\s*/u, '');
}

function explicitQuotedVisibleTerm(value) {
  const matches = [...String(value || '').matchAll(/[“"‘']([^”"’']{1,80})[”"’']/gu)];
  return matches.at(-1)?.[1]?.trim() || '';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

async function executeAuthoringAssertion(page,action,target,comparison,fixtureValues,implementation) {
  const required=action.operation==='expectText'?'EXACT_TEXT':'EXACT_EQUAL';
  if(implementation && implementation!==required)throw Object.assign(new Error('I10_ASSERTION_EXPERIENCE_MISMATCH'),{code:'I10_ASSERTION_EXPERIENCE_MISMATCH'});
  if(!implementation) {
    const left=(await target.innerText()).trim(),right=comparison?(await comparison.innerText()).trim():fixtureValues[action.fixtureRefs[0]];
    if(left!==right)throw Object.assign(new Error('I10_EXACT_ASSERTION_FAILED'),{code:action.operation==='expectText'?'I10_EXPECT_TEXT_FAILED':'I10_EXPECT_EQUAL_FAILED'});
    return;
  }
  let left,right;
  try {
    await target.waitFor({state:'visible',timeout:30000});left=await target.elementHandle();
    if(comparison){await comparison.waitFor({state:'visible',timeout:30000});right=await comparison.elementHandle();}
    const observed=await page.waitForFunction(({left,right,expected})=>right?left.innerText.trim()===right.innerText.trim():left.innerText.trim()===expected,
      {left,right,expected:fixtureValues[action.fixtureRefs[0]]},{timeout:30000});await observed.dispose();
  } catch(error) {
    if(error.name!=='TimeoutError')throw error;
    throw Object.assign(new Error('I10_EXACT_ASSERTION_FAILED'),{code:action.operation==='expectText'?'I10_EXPECT_TEXT_FAILED':'I10_EXPECT_EQUAL_FAILED'});
  } finally {if(left)await left.dispose();if(right)await right.dispose();}
}

async function closeWithinTimeout(closeOperation, timeoutMs = I10_BROWSER_CLOSE_TIMEOUT_MS, clock = globalThis) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(closeOperation).catch(() => undefined),
      new Promise(resolve => { timer = clock.setTimeout(resolve, timeoutMs); })
    ]);
  } finally {
    if (timer !== undefined) clock.clearTimeout(timer);
  }
}

function classifyMidsceneError(error) {
  const name = String(error?.name || 'Error').slice(0, 80);
  const sourceCode = String(error?.code || '').slice(0, 120);
  const nested = error?.dump?.taskInfo?.formatResponse?.errors;
  const message = [String(error?.message || ''), ...(Array.isArray(nested) ? nested.filter(item => typeof item === 'string') : [])].join('\n');
  const wrappedStatus = /\b(?:Last error:\s*|HTTP\s+)([45]\d{2})\b/i.exec(message);
  const status = Number.isInteger(error?.status) ? error.status : Number.isInteger(error?.statusCode) ? error.statusCode : wrappedStatus ? Number(wrappedStatus[1]) : null;
  let errorCode = 'I10_MIDSCENE_TRANSPORT_FAILED';
  let stage = 'MODEL_TRANSPORT';
  if (status && /unsupported model|model[_ ]not[_ ]found|model.*does not exist/i.test(message)) {
    errorCode = 'I10_MIDSCENE_MODEL_UNSUPPORTED';
  } else if (status && status !== 413) {
    errorCode = `I10_MIDSCENE_HTTP_${status}`;
  } else if (/AI call error:/i.test(message) && /timeout|timed out|abort/i.test(message)) {
    errorCode = 'I10_MIDSCENE_MODEL_TIMEOUT';
  } else if (name === 'AIResponseParseError' || /parse|json|schema|empty content/i.test(message)) {
    errorCode = 'I10_MIDSCENE_RESPONSE_SCHEMA_INVALID';
    stage = 'RESPONSE_PARSE';
  } else if (/context|token|too long|maximum.*length|413/i.test(message) || status === 413) {
    errorCode = 'I10_MIDSCENE_CONTEXT_LIMIT_EXCEEDED';
    stage = 'REQUEST_LIMIT';
  } else if (/failed to locate element|未找到.*(?:元素|按钮)|element.*not found/i.test(message)) {
    // Midscene may include an internal wait timeout in a locator failure
    // stack. Preserve the actionable page/target diagnosis instead of
    // misreporting it as a model transport timeout.
    errorCode = 'I10_MIDSCENE_TARGET_NOT_FOUND';
    stage = 'TARGET_LOCATION';
  } else if (/timeout|timed out|abort/i.test(message) || sourceCode === 'ETIMEDOUT' || sourceCode === 'UND_ERR_CONNECT_TIMEOUT') {
    errorCode = 'I10_MIDSCENE_MODEL_TIMEOUT';
  }
  return {
    errorCode,
    stage,
    errorClass: name,
    sourceCode: sourceCode || null,
    httpStatus: status,
    receivedModelContent: Boolean(error?.rawResponse || error?.response),
    messageFingerprint: sha256(message.slice(0, 2_000))
  };
}

function writeMidsceneDiagnostic(claim, diagnostic) {
  fs.mkdirSync(midsceneDiagnosticRoot, { recursive: true });
  const safeJobId = String(claim?.jobId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const target = path.join(midsceneDiagnosticRoot, `${safeJobId}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {
    schemaVersion: 'hengzhun-i10-midscene-diagnostic-v1',
    jobId: safeJobId,
    events: []
  };
  existing.events.push({ ...diagnostic, recordedAt: new Date().toISOString() });
  existing.events = existing.events.slice(-50);
  fs.writeFileSync(temporary, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function locator(page, target) {
  const item = controlled[target];
  if (!item) throw Object.assign(new Error('I10_TARGET_NOT_ALLOWLISTED'), { code: 'I10_TARGET_NOT_ALLOWLISTED' });
  if (item.kind === 'TEST_ID') return page.getByTestId(item.value);
  if (item.kind === 'CSS') return page.locator(item.value);
  const [role, name] = item.value.split('|');
  return page.getByRole(role, { name, exact: true });
}

async function controlledTargetPresence(page, targetRef) {
  // Diagnostic-only evidence for a controlled locator drift. Keep it wholly
  // structural: counts and tag names reveal whether the expected control is
  // mounted without persisting any customer-visible text or input values.
  const item = controlled[targetRef];
  if (!item) return { known: false };
  const candidate = locator(page, targetRef);
  const count = await candidate.count().catch(() => -1);
  const tags = count > 0
    ? await candidate.evaluateAll(nodes => nodes.slice(0, 3).map(node => node.tagName.toLowerCase())).catch(() => [])
    : [];
  return {
    known: true,
    locatorKind: item.kind,
    matchCount: count,
    tagNames: tags,
    navigationCount: await page.locator('nav').count().catch(() => -1),
    linkCount: await page.locator('a').count().catch(() => -1),
    // A route path is structural navigation metadata, not page content. It is
    // sufficient to distinguish an adapter-label drift from an application
    // route drift without recording link text, profile data or query values.
    linkPaths: await page.locator('a').evaluateAll(nodes => nodes.slice(0, 16).map(node => {
      try { return new URL(node.href, window.location.href).pathname; } catch { return ''; }
    }).filter(Boolean)).catch(() => []),
    linkPurposeCounts: await page.locator('a').evaluateAll(nodes => {
      const counts = { transfer: 0, remittance: 0, account: 0, dashboard: 0 };
      for (const node of nodes) {
        const value = String(node.textContent || '').replace(/\s+/g, '');
        if (value.includes('转账')) counts.transfer += 1;
        if (value.includes('汇款')) counts.remittance += 1;
        if (value.includes('账户')) counts.account += 1;
        if (value.includes('概览')) counts.dashboard += 1;
      }
      return counts;
    }).catch(() => ({ transfer: -1, remittance: -1, account: -1, dashboard: -1 }))
  };
}

function centerInside(center, box, tolerance = 0) {
  return Boolean(
    Array.isArray(center) && center.length >= 2 && center.every(Number.isFinite)
    && box && [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && center[0] >= box.x - tolerance && center[0] <= box.x + box.width + tolerance
    && center[1] >= box.y - tolerance && center[1] <= box.y + box.height + tolerance
  );
}

function mapModelCenterToViewport(location, screenshotShrinkFactor = 1) {
  const center = Array.isArray(location?.center) ? location.center : null;
  if (!center || !Number.isFinite(Number(center[0])) || !Number.isFinite(Number(center[1]))) return null;
  return [Number(center[0]) * screenshotShrinkFactor, Number(center[1]) * screenshotShrinkFactor];
}

function locatorMatchesExpected(location, box, screenshotShrinkFactor = 1, targetRef = '') {
  // Midscene returns pixels in the prepared model image. When the image is
  // reduced for the provider, map the visual center back into the browser
  // viewport before comparing it with Playwright's deterministic DOM box.
  // The tolerance covers image resampling and model box approximation; actual
  // browser interaction still uses the controlled Playwright locator. The
  // compact header avatar sits beside the user-menu affordance, so only that
  // semantic target receives a narrowly wider visual acceptance region.
  const mapped = mapModelCenterToViewport(location, screenshotShrinkFactor);
  if (!mapped) return false;
  return centerInside(mapped, box, targetRef === 'HEADER_AVATAR' ? 48 : 24);
}

function resolvePortalBaseUrl(claim) {
  if (claim?.plan?.fixtureProfile === 'GENERIC_WEB') {
    const snapshot = claim.plan.targetProfileSnapshot;
    const configured = String(snapshot?.launchUrl || claim?.entryUrl || '');
    const entry = new URL(configured);
    if (!['http:', 'https:'].includes(entry.protocol) || entry.username || entry.password
      || snapshot?.status !== 'ACTIVE'
      || snapshot?.targetProfileId !== claim.plan.targetProfileId
      || snapshot?.profileHash !== claim.plan.targetProfileHash) {
      throw Object.assign(new Error('I10_TARGET_PROFILE_BINDING_INVALID'), { code: 'I10_TARGET_PROFILE_BINDING_INVALID' });
    }
    return entry;
  }
  const configured = claim?.entryUrl || process.env.HENGZHUN_PORTAL_BASE_URL || `http://127.0.0.1:18082${FUXING_ROUTES.LOGIN}`;
  const entry = new URL(configured);
  if (entry.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(entry.hostname) || entry.username || entry.password || entry.search || entry.hash || entry.pathname !== FUXING_ROUTES.LOGIN) {
    throw Object.assign(new Error('I10_PORTAL_ENTRY_URL_NOT_ALLOWED'), { code: 'I10_PORTAL_ENTRY_URL_NOT_ALLOWED' });
  }
  return new URL('/', entry);
}

function boundedVisualHitOffsets(options = {}) {
  if (options.regionMatch !== true || Number(options.expectedTermCount || 0) < 1) return [[0, 0]];
  return [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]];
}

async function deriveDynamicLocator(page, location, options = {}) {
  // aiLocate reports coordinates in the image sent to the visual model.  Never
  // let those coordinates drive a browser action directly: map them back into
  // the viewport and use them only to ask Playwright for a DOM-backed locator.
  const screenshotShrinkFactor = Number(options.screenshotShrinkFactor || I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR);
  const mappedCenter = mapModelCenterToViewport(location, screenshotShrinkFactor);
  const [x, y] = mappedCenter || [];
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw Object.assign(new Error('I10_MIDSCENE_LOCATION_INVALID'), { code: 'I10_MIDSCENE_LOCATION_INVALID' });
  const expectedTerms = Array.isArray(options.expectedTerms)
    ? options.expectedTerms.map(value => String(value || '').replace(/\s+/g, '').toLowerCase()).filter(Boolean).slice(0, 3)
    : [];
  const hitOffsets = boundedVisualHitOffsets({
    regionMatch: options.regionMatch === true,
    expectedTermCount: expectedTerms.length
  });
  const result = await page.evaluate(({ x, y, expectedTerms, regionMatch, interactionMatch, hitOffsets }) => {
    let node = document.elementFromPoint(x, y);
    if (!(node instanceof Element)) return null;
    // Visual models often point at the icon or text node painted inside a
    // control. Preserve the model-selected hit target, but promote that exact
    // descendant to its nearest interactive ancestor before deriving a
    // Playwright locator. This is deliberately not a document-wide lookup.
    if (interactionMatch) {
      let interactive = node.closest('a,button,input,select,textarea,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"]');
      // A model coordinate can land on the painted text of an HTML label.
      // Follow only that exact label's native control association; this keeps
      // the visual hit as authority and does not search the document by a
      // guessed field name or selector.
      if (!(interactive instanceof HTMLElement)) {
        const selectedLabel = node.closest('label');
        interactive = selectedLabel?.control ||
          (selectedLabel?.htmlFor ? document.getElementById(selectedLabel.htmlFor) : null);
      }
      // Input libraries often paint an affix wrapper around the real input.
      // If Midscene hits the wrapper itself (not just a child icon), inspect
      // that exact visual hit before walking its ancestors. Accept a control
      // only when the bounded subtree contains one unambiguous interactive
      // descendant. Stop at body so this can never become a page-wide lookup.
      if (!(interactive instanceof HTMLElement)) {
        for (let current = node; current instanceof HTMLElement && current !== document.body; current = current.parentElement) {
          const nearbyControls = [...current.querySelectorAll('a,button,input,select,textarea,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"]')];
          if (nearbyControls.length === 1) {
            interactive = nearbyControls[0];
            break;
          }
          if (nearbyControls.length > 1) break;
        }
      }
      if (!(interactive instanceof HTMLElement)) return null;
      node = interactive;
    } else if (!(node instanceof HTMLElement)) {
      node = node.parentElement;
      if (!(node instanceof HTMLElement)) return null;
    }
    // A visual assertion normally refers to a whole card/region, while the
    // model centre may fall on one of its values or just outside a card edge.
    // Inspect the hit point plus a fixed 24px cross and only each hit's own
    // ancestors; never search the page for a matching term. This preserves
    // Midscene as the locator authority while tolerating image resampling at
    // a visible region boundary.
    if (regionMatch && expectedTerms.length) {
      const normalize = value => String(value || '').replace(/\s+/g, '').toLowerCase();
      let matchedRegion = null;
      for (const [dx, dy] of hitOffsets) {
        let sampled = document.elementFromPoint(x + dx, y + dy);
        if (sampled instanceof Element && !(sampled instanceof HTMLElement)) sampled = sampled.parentElement;
        for (let current = sampled; current instanceof HTMLElement && current !== document.body; current = current.parentElement) {
          const text = normalize([current.getAttribute('aria-label'), current.textContent].filter(Boolean).join(' '));
          if (expectedTerms.every(term => text.includes(term))) {
            matchedRegion = current;
            break;
          }
        }
        if (matchedRegion) break;
      }
      if (matchedRegion) node = matchedRegion;
    }
    const testId = node.getAttribute('data-testid');
    if (testId) return { kind: 'TEST_ID', value: testId };
    const id = node.id;
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : '';
    if (label) return { kind: 'LABEL', value: label };
    const placeholder = node.getAttribute('placeholder');
    if (placeholder) return { kind: 'PLACEHOLDER', value: placeholder };
    const role = node.getAttribute('role') || ({ BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox' })[node.tagName];
    const explicitAccessibleName = String(node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    // Browser accessible-name computation may reorder or omit nested React
    // text nodes, so textContent is not a sound exact ROLE name. Use ROLE only
    // when the hit element provides an explicit aria-label. Otherwise retain
    // the exact Midscene-selected DOM element through the bounded structural
    // CSS path below, and validate its visible evidence before execution.
    if (role && explicitAccessibleName && explicitAccessibleName.length <= 160) {
      return { kind: 'ROLE', value: `${role}|${explicitAccessibleName}` };
    }
    if (id) return { kind: 'CSS', value: `#${CSS.escape(id)}` };
    const segments = [];
    let current = node;
    while (current && current !== document.body && segments.length < 24) {
      let segment = current.tagName.toLowerCase();
      const siblings = current.parentElement ? [...current.parentElement.children].filter(item => item.tagName === current.tagName) : [];
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      segments.unshift(segment);
      current = current.parentElement;
    }
    if (current !== document.body || !segments.length) return null;
    return { kind: 'CSS', value: `body > ${segments.join(' > ')}` };
  }, {
    x,
    y,
    expectedTerms,
    regionMatch: options.regionMatch === true,
    interactionMatch: options.interactionMatch === true,
    hitOffsets
  });
  if (!result) throw Object.assign(new Error('I10_DYNAMIC_LOCATOR_DERIVATION_FAILED'), { code: 'I10_DYNAMIC_LOCATOR_DERIVATION_FAILED' });
  return result;
}

async function accessibleControlHint(page, maximum = 24) {
  // Generic profiles cannot ship site-specific selectors.  A small, redacted
  // accessibility summary gives the visual model the *names* of currently
  // interactive controls for disambiguation only; it never supplies a DOM
  // locator or coordinates, so Midscene must still observe the screenshot and
  // Playwright remains the sole executor.  Do not collect input values or
  // arbitrary page text because they may contain business data.
  const controls = await page.evaluate(limit => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const redact = value => normalize(value)
      .replace(/\b\d{4,}\b/g, '***')
      .slice(0, 96);
    return [...document.querySelectorAll('a,button,select,input:not([type="hidden"]),textarea,[contenteditable="true"],[role="button"],[role="textbox"],[role="combobox"]')]
      .map(node => {
        const element = /** @type {HTMLElement} */ (node);
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || tag;
        const associatedLabel = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
          ? [...element.labels || []].map(label => label.textContent || '').join(' ')
          : '';
        const inputValueIsSafeLabel = element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(String(element.type || '').toLowerCase());
        const name = redact(element.getAttribute('aria-label') || element.getAttribute('title') || associatedLabel ||
          element.getAttribute('placeholder') || element.textContent || (inputValueIsSafeLabel ? element.getAttribute('value') : ''));
        return name ? `${role}:${name}` : null;
      })
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(Number(limit) || 24, 32)));
  }, maximum);
  return Array.isArray(controls) ? controls : [];
}

function genericLocateInstruction(action) {
  // A read-only assertion may describe several facts (for example, card,
  // balance and status) rather than one DOM control. Midscene must locate
  // one visible *region* that carries those facts; Playwright then verifies
  // the region it receives. This is not a DOM-selector fallback: missing
  // visual evidence remains a failed authoring attempt.
  const instruction = normalizedActionInstruction(action).slice(0, 240);
  // Keep the visual prompt and the later Playwright term check on the same
  // durable business noun. Controller prose may call a list/table an account
  // "card", even when the rendered application correctly labels the region
  // "账户列表". Repeating that invented presentation noun in the prompt makes
  // Midscene search for text that cannot exist and contradicts
  // genericActionTerms().
  const visualInstruction = action?.operation === 'expectVisible'
    ? instruction.replace(/(?:账户|账号)卡片/gu, '账户列表')
    : instruction;
  if (action?.operation === 'fill') {
    return `\n当前动作需要填写字段：请在当前截图中定位“${instruction}”对应的可编辑输入控件本体中心。不要返回字段标签文字、表单卡片、容器边框或说明文字。`;
  }
  if (action?.operation === 'download') {
    return '\n当前动作需要下载：请在当前截图中定位可点击的下载按钮或下载链接本体中心。标题、日期等相邻只读事实由Playwright另行验证；不要定位文档标题、日期文字、卡片或容器。';
  }
  if (action?.operation === 'click') {
    if (/^(?:进入|打开|查看|前往).*(?:明细|详情)(?:页|页面)?$/u.test(instruction) &&
        !/(?:提交|删除|转账|汇款|保存|确认|激活|创建|新增)/u.test(instruction)) {
      return `\n当前动作需要进入具体记录的明细或详情：请定位能直接打开具体记录的卡片、行内按钮或明确的详情链接。不要定位只进入列表页的顶层导航链接；不要返回周围容器。`;
    }
    const navigationAlternatives = genericActionTerms(action);
    const targetDescription = navigationAlternatives.length > 1
      ? navigationAlternatives.map(value => `“${value}”`).join('或')
      : `“${instruction}”`;
    return `\n当前动作需要点击控件：请在当前截图中定位${targetDescription}对应的可点击按钮或链接本体中心。不要返回周围卡片、标题或说明文字。`;
  }
  if (action?.operation === 'select' || action?.operation === 'check' || action?.operation === 'upload') {
    return `\n当前动作需要操作表单控件：请在当前截图中定位“${instruction}”对应的控件本体中心，不要返回标签或容器。`;
  }
  if (action?.operation !== 'expectVisible') return '';
  if (/(?:主页|首页).*(?:与|和).*(?:个人资料|个人中心).*(?:姓名|名称|头像)/u.test(instruction)) {
    return '\n当前动作是跨页面只读一致性断言：请在当前个人资料页截图中定位承载客户姓名或大头像的个人资料内容卡中心。不要定位顶部导航栏、页头小头像、客户菜单或“个人资料”导航链接；Playwright将对已记录的两页事实执行确定性比较。';
  }
  if (/(?:主页|首页).*(?:姓名|名称).*(?:头像)|(?:主页|首页).*(?:头像).*(?:姓名|名称)/u.test(instruction)) {
    return '\n当前动作是主页身份区只读观察：请定位页面顶部或右上角同时承载当前用户姓名文本与头像视觉元素的身份区域中心。不要定位页面中央欢迎卡、品牌标题、导航链接或普通内容卡。';
  }
  // Use the first named fact as the visual anchor. A phrase such as
  // “确认账户卡片、余额和账户状态正常显示” describes an assertion set, not
  // a single target. The card title is the one visual target, while the
  // generated Playwright assertion keeps the full fact set in scope.
  const generatedAnchor = visualInstruction
    .replace(/^(?:确认|验证|检查|查看|确保|查询)\s*[:：]?\s*/, '')
    .replace(/^(?:显示|展示)\s*/, '')
    .replace(/(?:是否)?(?:正常)?(?:显示|一致|存在|正确).*$/, '')
    .split(/[、，,；;]/)[0]
    .replace(/(?:列表|清单)(?:中|内|里)$/u, '')
    .replace(/区域$/u, '')
    .trim()
    .slice(0, 80);
  const anchor = genericActionTerms(action)[0] || explicitQuotedVisibleTerm(visualInstruction) || generatedAnchor;
  return visualInstruction
    ? `\n当前动作是只读视觉定位：请在当前截图中优先定位与“${anchor || visualInstruction}”一致的可见文字本身或与其语义一致的直接信息区域中心。其余业务描述只定义断言上下文，不要求与该锚点出现在同一卡片或逐字呈现。不要判断业务规则是否成立；只返回该可见目标的中心位置，不要定位导航或输入框。`
    : '';
}

function composeMidscenePrompt({ action, basePrompt, genericInstruction, adapterInstruction, observationHints }) {
  const parts = action?.operation === 'expectVisible' && genericInstruction
    ? [genericInstruction, basePrompt, adapterInstruction, observationHints]
    : [basePrompt, genericInstruction, adapterInstruction, observationHints];
  return parts.map(value => String(value || '').trim()).filter(Boolean).join('\n');
}

function isSingleSignOnEntryAction(action) {
  return action?.operation === 'click' && /^(?:点击|打开|进入)?\s*[“"]?统一身份认证(?:登录)?(?:入口|按钮)?[”"]?(?:按钮)?[。.!！]?$/u.test(normalizedActionInstruction(action));
}

function isAuthenticationSubmitAction(action) {
  return action?.operation === 'click' && /^提交身份认证表单[。.!！]?$/u.test(normalizedActionInstruction(action));
}

function genericActionTerms(action) {
  if (action?.pageObservation) return [ACCOUNT_FIELD_LABELS[action.pageObservation.fields[0]]];
  const terms = genericActionTermsForInstruction(action);
  if (action?.operation !== 'expectVisible') return terms;
  // All observation branches share the same final anchor normalization. A
  // container/currency qualifier describes where to check, not literal label
  // text; full business assertions still own currency and value validation.
  return terms.map(term => term
    .replace(/^.+?(?:列表|清单|表格)(?:中|内|里)(?:的)?(.+)$/u, '$1')
    .replace(/^(?:人民币|CNY)(?:账户)?(?:的)?(?=(?:可用)?余额)/u, '')
    .replace(/[。.!！?？]+$/u, '').trim()).filter(Boolean);
}

function genericActionTermsForInstruction(action) {
  const instruction = normalizedActionInstruction(action);
  if (!instruction) return [];
  if (action.operation === 'fill') {
    if (/密码|password/i.test(instruction)) return ['密码'];
    if (/用户名|账号|账户|username|user name/i.test(instruction)) return ['用户名'];
  }
  if (action.operation === 'select') {
    const selection = instruction
      .replace(/^按\s*/u, '')
      .replace(/(?:进行)?(?:筛选|过滤|选择)$/u, '')
      .trim();
    if (selection.length >= 2) return [selection];
  }
  if (action.operation === 'click') {
    if (instruction.includes('统一身份认证')) return isSingleSignOnEntryAction(action) ? ['统一身份认证登录'] : [];
    if (isAuthenticationSubmitAction(action)) return ['登录'];
    if (/登录|login|sign[ _-]?in/i.test(instruction)) return ['登录'];
    const quotedControl = /(?:点击|click|导航(?:至|到)?|进入|打开|前往)\s*[“"‘']/iu.test(instruction)
      ? explicitQuotedVisibleTerm(instruction)
      : '';
    if (quotedControl) return [quotedControl];
    const navigationAction = instruction
      .replace(/^(?:在)?(?:页面)?导航菜单中(?=(?:打开|进入|前往|导航))/u, '')
      .replace(/^(?:(?:从|在)(?:门户|页面))?导航(?:菜单)?(?:中)?(?=(?:打开|进入|前往))/u, '');
    const page = navigationAction.match(/(?:打开|进入|导航(?:至|到)?|前往)\s*(.+?(?:页|页面|中心|工作台|汇款)?)(?:$|[，,；;])/i)?.[1]?.trim();
    if (page && page.length >= 2) {
      // Controller drafts commonly describe a navigation destination as
      // “个人资料页面”, while the rendered navigation label is simply
      // “个人资料”.  Normalize only this navigation presentation suffix:
      // mutation labels keep their literal text and remain fail-closed.
      const navigationLabel = page
        .replace(/[。.!！?？]+$/u, '')
        .replace(/(?:页面|页)$/u, '')
        .replace(/功能$/u, '')
        .replace(/^[“"'‘「『]\s*/u, '')
        .replace(/\s*[”"'’」』]$/u, '')
        // “进入账户明细” commonly targets an account card whose accessible
        // name contains the durable noun “账户”, while the destination URL
        // and later assertions prove that the click reached the detail view.
        // This applies only to the navigation branch; mutation labels below
        // never pass through this normalization.
        .replace(/(?:明细|详情)$/u, '')
        .trim();
      if (/^(?:转账汇款|汇款转账)$/u.test(navigationLabel)) return ['转账'];
      const alternatives = navigationLabel.split(/(?:或者|或)/u)
        .map(value => value.trim())
        .filter(value => value.length >= 2);
      if (alternatives.length > 1) return alternatives.slice(0, 3);
      return [navigationLabel.replace(/(?:列表|清单)$/u, '') || page];
    }
  }
  if (action.operation === 'download') return ['下载'];
  if (action.operation === 'expectVisible') {
    // In "the X field of each record in this list", the list and record are
    // structural qualifiers. The rendered column label is the durable visual
    // fact that both Midscene and Playwright can verify.
    const listRecordField = instruction.match(
      /(?:列表|清单|表格|页面)中(?:各|每个|所有)?[^，,；;。.!！?？]{1,24}?的([^，,；;。.!！?？]{2,20}?)(?:信息|字段|数值|文本)(?:[。.!！?？]|$)/u
    )?.[1]?.replace(/^[“"‘']|[”"’']$/gu, '').trim();
    if (listRecordField && listRecordField.length >= 2) return [listRecordField];
    // A direct field inspection names its record only as context. Strip that
    // qualifier and the presentation suffix so the visual anchor is the field
    // label painted on the page.
    const directVisibleFact = instruction.match(
      /^(?:查看|确认|验证|核验|检查|核对)\s*(?:该[^，,；;。.!！?？]{0,24}?的)?([^、及和与，,；;。.!！?？]{2,40}?)(?:信息|字段|数值|文本)(?:[。.!！?？]|$)/u
    )?.[1]?.replace(/^[“"‘']|[”"’']$/gu, '').trim();
    if (directVisibleFact && directVisibleFact.length >= 2) return [directVisibleFact];
    // A possessive conjunction such as "人民币账户及其可用余额信息" names
    // the account only as context and the trailing field as the concrete
    // visible fact. Keep this narrow to explicit presentation nouns so an
    // arbitrary conjunction cannot silently change the asserted target.
    const possessiveConjunctionFact = instruction.match(
      /(?:及|和|与)其\s*([^，,；;。.!！?？]{2,40}?)(?:信息|字段|数值|文本)(?:[。.!！?？]|$)/u
    )?.[1]?.replace(/^[“"‘']|[”"’']$/gu, '').trim();
    if (possessiveConjunctionFact && possessiveConjunctionFact.length >= 2) return [possessiveConjunctionFact];
    const possessiveBalanceFact = instruction.match(
      /(?:及|和|与)(?:其\s*|对应(?:的)?\s*)(可用余额|余额)(?:[。.!！?？]|$)/u
    )?.[1];
    if (possessiveBalanceFact) return [possessiveBalanceFact];
    // In a compound read-only sentence, the final explicit check names the
    // visible fact to anchor (for example “..., and check whether its available
    // balance is visible”). The preceding lookup clause supplies context, not
    // literal page copy. Midscene and Playwright must use this same fact.
    const checkedVisibleFact = instruction.match(
      /[，,；;]\s*(?:并|且|以及)?(?:检查|确认|验证|核对|查看)\s*(?:其|该[^，,；;]{0,24}?的)?(.{2,40}?)(?:是否)?(?:可见|显示|展示|存在)(?:[。.!！?？]|$)/u
    )?.[1]
      ?.replace(/(?:字段|数值|文本)$/u, '')
      .replace(/^[“"‘']|[”"’']$/gu, '')
      .trim();
    if (checkedVisibleFact && checkedVisibleFact.length >= 2) return [checkedVisibleFact];
    const trailingVerifiedFact = instruction.match(
      /[，,；;]\s*(?:并|且|以及)?(?:检查|确认|验证|核对|查看)\s*其([^，,；;。.!！?？]{2,40})(?=[，,；;。.!！?？]|$)/u
    )?.[1]
      ?.replace(/(?:字段|数值|文本)$/u, '')
      .replace(/(?:正确|正常)$/u, '')
      .replace(/^[“"‘']|[”"’']$/gu, '')
      .trim();
    if (trailingVerifiedFact && trailingVerifiedFact.length >= 2) return [trailingVerifiedFact];
    // A standalone currency assertion can anchor the literal ISO code painted
    // by the page. Compound assertions must first select their later visible
    // fact, rather than allowing an earlier qualifier to take precedence.
    const currencyCode = !/[，,；;]/u.test(instruction)
      ? instruction.match(
        /币种(?:为|是)?[^（(，,；;。]{0,24}[（(]\s*([A-Z]{3})(?:\s*[/／][^）)]*)?[）)]/iu
      )?.[1]?.toUpperCase()
      : '';
    if (currencyCode) return [currencyCode];
    const chineseCurrencyCode = !/[，,；;]/u.test(instruction) &&
      /(?:币种|货币)(?:为|是)?\s*[“"'‘「『]?\s*人民币(?:\s*[”"'’」』])?/u.test(instruction)
      ? 'CNY'
      : '';
    if (chineseCurrencyCode) return [chineseCurrencyCode];
    // Quoted text is a strong visual hint only when a later explicit check
    // does not name the fact being verified. In compound prose such as
    // “币种为‘人民币’的账户，并检查其可用余额是否显示”, the quoted value is
    // a lookup qualifier while the trailing check names the visible target.
    const quotedFact = explicitQuotedVisibleTerm(instruction);
    if (quotedFact) return [quotedFact];
  }
  const compact = instruction
    .replace(/^(?:确认|验证|检查|校验|核对|查看|确保|查询|打开|进入|导航(?:至|到)?)\s*[:：]?\s*/, '')
    .replace(/^(?:显示|展示)\s*/, '')
    .replace(/(?:是否)?(?:正常)?(?:显示|一致|存在|正确).*$/, '');
  // A controller may omit punctuation between several read-only document
  // facts ("标题日期下载入口"). That is an assertion set, not one literal DOM
  // label. Anchor the first visible fact and let the Playwright assertion
  // validate the complete surrounding region selected by the visual model.
  if (action.operation === 'expectVisible' && /标题.*日期.*下载入口/u.test(compact) && !/[、，,；;]/u.test(compact)) {
    return ['标题'];
  }
  const listThenInspect = action.operation === 'expectVisible'
    ? compact.match(/^(.+?)(?:列表|清单)(?:并核对|并确认|并检查|并验证|并查看|且核对|且确认|以及核对)/u)
    : null;
  if (listThenInspect?.[1]?.trim()) return [listThenInspect[1].trim()];
  const isCrossPageComparison = /(?:一致|相同|比较|对比)/u.test(instruction) ||
    /(?:主页|首页).*(?:与|和).*(?:个人资料|个人中心).*(?:姓名|名称|头像)/u.test(instruction);
  const terms = compact.split(/[、，,；;]|(?:以及|并且|且|及|和)/)
    .map(value => value.trim())
    // "查看收款人列表" normally refers to a page region whose visible heading
    // is "收款人管理", not to a literal control named "收款人列表".  Keep the
    // stable business noun as the visual anchor.  This is deliberately limited
    // to read-only assertions: mutation actions must retain their exact labels.
    .map(value => action.operation === 'expectVisible'
      ? (() => {
        // Controller wording often says "收款人页面显示列表" while the
        // application correctly labels the visible region "收款人管理". Keep
        // the durable domain noun, and discard presentation-only suffixes.
        // Likewise, "账户掩码" and "状态正确展示" should anchor a page region
        // that exposes an account/status field rather than require that exact
        // generated phrase to be painted on screen.
        const anchor = value
          .replace(/^(?:一|某|任意)?份/u, '')
          .replace(/^.*页面中(?:的)?(.+?)(?:列表|清单)区域$/u, '$1')
          .replace(/^.*(?:中|内|里)的/u, '')
          .replace(/^.*的(?=(?:可用余额|余额|账户状态|币种)$)/u, '')
          .replace(/(?:列表|清单)(?:中|内|里)$/u, '')
          .replace(/(?:页面)?(?:显示)?(?:列表|清单|详情)$/u, '')
          .replace(/页面$/u, '')
          // A generated read-only intent may call a table/card collection
          // "账户卡片", while the live application exposes durable labels
          // such as "账户列表" and "可用余额".  Anchor the business noun;
          // Playwright still validates balance and status in the selected
          // surrounding region.
          .replace(/(?:账户|账号)卡片/gu, '账户列表')
          // A read-only assertion names the semantic fact as "文档下载入口",
          // while the actual interactive affordance is commonly labelled
          // only "下载".  Midscene locates that visible affordance and
          // Playwright retains the full surrounding assertion.  Keep this
          // normalization inside expectVisible only; mutation operations
          // continue to require their literal labels.
          .replace(/^(?:文档|文件|报告)?下载入口$/u, '下载')
          .replace(/(?:文档|文件|报告)标题$/u, match => match.replace(/标题$/u, ''))
          .replace(/(?:账户|账号)掩码/gu, '账户')
          .replace(/区域$/u, '')
          .replace(/(?:正确|正常)(?:展示|显示)?$/u, '')
          .replace(/(?:清晰)?可读$/u, '')
          .replace(/(?:展示|显示)$/u, '')
          .trim();
        // A cross-page comparison (for example, homepage versus profile
        // name/avatar) has no single literal DOM element.  Midscene's role
        // here is to observe one current-page fact; Playwright owns the
        // deterministic cross-page assertion.  Use a stable visible fact as
        // the visual anchor instead of inventing a combined label.
        if (isCrossPageComparison && /(?:姓名|名称|name)/iu.test(anchor)) return '姓名';
        if (isCrossPageComparison && /(?:头像|avatar)/iu.test(anchor)) return '头像';
        return anchor || value;
      })()
      : value)
    .filter(value => value.length >= 2)
    .slice(0, 3);
  // A visual proposal needs one anchor, while Playwright assertions cover the
  // rest of a multi-fact outcome. Requiring every fact to be on the exact
  // clicked pixel would reject an otherwise valid card heading.
  return action.operation === 'expectVisible' ? terms.slice(0, 1) : terms;
}

async function accessibleLandmarkHint(page) {
  // This is a text-only observation aid, not a locator. Generic applications
  // often place a target card below similarly named navigation links. Supplying
  // visible headings helps Midscene disambiguate the screenshot before it
  // proposes coordinates; Playwright still derives its locator from those
  // coordinates and never substitutes a document-wide text lookup.
  return page.locator('h1,h2,h3,h4,h5,h6,[role="heading"]')
    .evaluateAll(nodes => nodes.map(node => String(node.textContent || '')
      .replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 24))
    .catch(() => []);
}

function requiresVisualLocator(action) {
  // A screenshot preserves the page reached by the prior visual actions; it
  // is not itself a user-interface target.  Requiring the vision model to
  // locate a phrase such as "保存最终页面证据" makes generic authoring fail
  // after all meaningful navigation has succeeded.  Keep Midscene mandatory
  // for actions that target an element, while letting Playwright capture the
  // full page deterministically.
  return Boolean(action?.semanticTargetRef) && ![
    'goto', 'waitForURL', 'screenshot', 'humanVerification'
  ].includes(String(action?.operation || ''));
}

function requiresInteractiveLocator(action) {
  return ['click', 'fill', 'select', 'check', 'upload', 'download'].includes(String(action?.operation || ''));
}

function identityEvidenceMatches(action, evidence) {
  const crossPageIdentityAction = action.operation === 'expectVisible' &&
    /(?:主页|首页).*(?:与|和).*(?:个人资料|个人中心).*(?:姓名|名称|头像)/u.test(String(action.instruction || ''));
  const identityRegionAction = action.operation === 'expectVisible' &&
    /(?:主页|首页).*(?:姓名|名称).*(?:头像)|(?:主页|首页).*(?:头像).*(?:姓名|名称)/u.test(String(action.instruction || ''));
  if (crossPageIdentityAction) return evidence.identityVisual || /(?:姓名|名称)/u.test(String(evidence.text || ''));
  if (identityRegionAction) return evidence.identityVisual && String(evidence.text || '').trim().length > 0;
  return null;
}

function genericEvidenceMatchesTerms(action, evidenceText, terms = genericActionTerms(action)) {
  const normalized = String(evidenceText || '').replace(/\s+/g, '').toLowerCase();
  // The approved SSO entry intent names a control's purpose, not literal page copy.
  // Keep this equivalence exact so registration, help and combined business actions cannot pass.
  if (action?.operation === 'click' && normalizedActionInstruction(action).includes('统一身份认证')) {
    return isSingleSignOnEntryAction(action) && normalized === '统一身份认证登录';
  }
  if (isAuthenticationSubmitAction(action)) return normalized === '登录';
  // Generic applications often label the row/card affordance simply “查看”
  // even when the controller describes the read-only navigation as “进入账户
  // 明细页面”. Accept that presentation equivalence only for a click whose
  // approved instruction explicitly enters/opens a detail view. Mutation
  // clicks (submit, delete, transfer, save, confirm) retain literal matching.
  if (action?.operation === 'click' &&
      /^(?:进入|打开|查看|前往).*(?:明细|详情)(?:页|页面)?$/u.test(String(action?.instruction || '').trim()) &&
      !/(?:提交|删除|转账|汇款|保存|确认|激活|创建|新增)/u.test(String(action?.instruction || '')) &&
      /(?:查看|详情|明细)/u.test(normalized)) return true;
  // A document-query observation may legitimately resolve to the concrete
  // document title (for example "七月电子对账单") rather than a container that
  // literally repeats the word "文档". Bound this equivalence to read-only
  // observation on the documents route; Playwright still validates the full
  // title/date/download assertion set after the visual proposal.
  if (action?.operation === 'expectVisible' && /查询.*(?:文档|文件|对账单)|(?:文档|文件|对账单).*查询/iu.test(String(action?.instruction || ''))) {
    return /文档|文件|对账单|statement/iu.test(normalized);
  }
  const disjunctiveNavigation = action?.operation === 'click' && terms.length > 1 &&
    /(?:打开|进入|导航(?:至|到)?|前往).*(?:或者|或)/u.test(String(action?.instruction || ''));
  return (disjunctiveNavigation ? terms.some.bind(terms) : terms.every.bind(terms))(
    term => normalized.includes(String(term).replace(/\s+/g, '').toLowerCase())
  );
}

async function genericLocatorMatchesAction(page, locatorProposal, action) {
  const terms = genericActionTerms(action);
  const readOnlyDetailNavigation = isReadOnlyDetailNavigation(action);
  const identityMatch = identityEvidenceMatches(action, {});
  const identityRegionAction = identityMatch !== null;
  if (!terms.length && !identityRegionAction) return false;
  const candidate = dynamicLocator(page, locatorProposal);
  await candidate.waitFor({ state: 'visible', timeout: 15_000 });
  const evidence = await candidate.evaluate(node => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const element = /** @type {HTMLElement} */ (node);
    const id = element.getAttribute('id');
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '';
    const wrappingLabel = element.closest('label')?.textContent || '';
    const tagName = element.tagName.toLowerCase();
    const role = normalize(element.getAttribute('role'));
    const type = normalize(element.getAttribute('type')).toLowerCase();
    return {
      tagName,
      text: normalize([
      element.getAttribute('aria-label'), element.getAttribute('title'),
      label, wrappingLabel, element.textContent, element.getAttribute('placeholder'), element.getAttribute('value')
      ].filter(Boolean).join(' ')),
      regionText: normalize(element.closest('section,article,[role="region"],[class*="card" i]')?.textContent || ''),
      clickable: tagName === 'button' || tagName === 'a' || role === 'button' ||
        (tagName === 'input' && ['button', 'submit', 'reset', 'image'].includes(type)),
      editable: tagName === 'textarea' || element.isContentEditable ||
        (tagName === 'input' && !['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'].includes(type)),
      selectable: tagName === 'select' || role === 'combobox' || role === 'listbox',
      checkable: (tagName === 'input' && ['checkbox', 'radio'].includes(type)) ||
        role === 'checkbox' || role === 'radio' || role === 'switch',
      uploadable: tagName === 'input' && type === 'file'
      ,identityVisual: Boolean(element.matches('img,svg,[class*="avatar" i]') || element.querySelector('img,svg,[class*="avatar" i]'))
    };
  });
  // A visual proposal for a click must resolve to an interactive control. A
  // surrounding label/card can contain the same wording yet only focus an
  // input, leaving the browser on the login page. This validates Midscene's
  // observation before execution; a mismatch stops without a selector fallback.
  if (action.operation === 'click' && !evidence.clickable) return false;
  const detailEvidenceMatch = readOnlyDetailLocatorEvidence(action, evidence, terms);
  if (detailEvidenceMatch !== null) return detailEvidenceMatch;
  if (action.operation === 'fill' && !evidence.editable) return false;
  if (action.operation === 'select' && !evidence.selectable) return false;
  if (action.operation === 'check' && !evidence.checkable) return false;
  if (action.operation === 'upload' && !evidence.uploadable) return false;
  if (action.operation === 'download' && !evidence.clickable) return false;
  const evaluatedIdentityMatch = identityEvidenceMatches(action, evidence);
  if (evaluatedIdentityMatch !== null) return evaluatedIdentityMatch;
  return genericEvidenceMatchesTerms(action,
    action.operation === 'expectVisible' || readOnlyDetailNavigation
      ? `${evidence.text} ${evidence.regionText}`
      : evidence.text,
    terms);
}

function isReadOnlyDetailNavigation(action) {
  const instruction = String(action?.instruction || '').trim();
  return action?.operation === 'click' &&
    /^(?:进入|打开|查看|前往).*(?:明细|详情)(?:页|页面)?$/u.test(instruction) &&
    !/(?:提交|删除|转账|汇款|保存|确认|激活|创建|新增)/u.test(instruction);
}

function readOnlyDetailLocatorEvidence(action, evidence, terms = genericActionTerms(action)) {
  if (!isReadOnlyDetailNavigation(action)) return null;
  const normalizedText = String(evidence?.text || '').replace(/\s+/g, '').toLowerCase();
  const exactListNavigation = evidence?.tagName === 'a' && terms
    .some(term => normalizedText === String(term).replace(/\s+/g, '').toLowerCase());
  if (exactListNavigation || /(?:提交|删除|转账|汇款|保存|确认|激活|创建|新增)/u.test(normalizedText)) return false;
  return evidence?.clickable === true && ['a', 'button'].includes(String(evidence?.tagName || '').toLowerCase());
}

function dynamicLocator(page, item) {
  if (item.kind === 'TEST_ID') return page.getByTestId(item.value);
  if (item.kind === 'LABEL') return page.getByLabel(item.value, { exact: true });
  if (item.kind === 'PLACEHOLDER') return page.getByPlaceholder(item.value, { exact: true });
  if (item.kind === 'TEXT') return page.getByText(item.value, { exact: true });
  if (item.kind === 'CSS') return page.locator(item.value);
  if (item.kind === 'ROLE') {
    const [role, ...name] = item.value.split('|');
    return page.getByRole(role, { name: name.join('|'), exact: true });
  }
  throw Object.assign(new Error('I10_DYNAMIC_LOCATOR_KIND_INVALID'), { code: 'I10_DYNAMIC_LOCATOR_KIND_INVALID' });
}

async function withMidsceneLocateTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(
          new Error('I10_MIDSCENE_MODEL_TIMEOUT'),
          { code: 'I10_MIDSCENE_MODEL_TIMEOUT' }
        )), I10_MIDSCENE_LOCATE_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function observeTargetWithMidscene(page, prompt, agentOptions) {
  const agent = createMidsceneAgent(page, agentOptions);
  try {
    // This is evidence only.  The worker deliberately does not expose any
    // Midscene action API here; all page mutation remains below in Playwright.
    const screenshotHash = sha256(await page.screenshot({ type: 'png' }));
    const location = await withMidsceneLocateTimeout(() => agent.aiLocate(prompt));
    return {
      location,
      screenshotHash,
      proposalHash: sha256(stableJson({ promptHash: sha256(prompt), screenshotHash, location }))
    };
  } finally {
    await agent.destroy().catch(() => undefined);
  }
}

async function observeUkeyVerificationControl(page) {
  const observation = await observeTargetWithMidscene(
    page,
    '当前页面是转账后的网页验证页。只定位页面内用于继续、验证或确认U盾授权的可点击网页按钮；不要定位导航、帮助文案或静态说明文字。'
  );
  const locatorProposal = await deriveDynamicLocator(page, observation.location);
  const candidate = dynamicLocator(page, locatorProposal);
  await candidate.waitFor({ state: 'visible', timeout: 15_000 });
  const tagName = await candidate.evaluate(node => node.tagName).catch(() => '');
  const role = await candidate.getAttribute('role').catch(() => null);
  if (!['BUTTON', 'A', 'INPUT'].includes(tagName) && role !== 'button') {
    throw Object.assign(new Error('I10_UKEY_WEB_CONTROL_NOT_FOUND'), { code: 'I10_UKEY_WEB_CONTROL_NOT_FOUND' });
  }
  return { ...observation, locator: locatorProposal };
}

async function executePlaywrightClick(page, locatorProposal) {
  const candidate = dynamicLocator(page, locatorProposal);
  await candidate.waitFor({ state: 'visible', timeout: 15_000 });
  await candidate.click();
  return locatorProposal;
}

async function resolveCredentialValueForLocatedInput(page, locatorProposal, credential, action) {
  const candidate = dynamicLocator(page, locatorProposal);
  await candidate.waitFor({ state: 'visible', timeout: 15_000 });
  const isPasswordInput = await candidate.evaluate(node => {
    const element = /** @type {HTMLInputElement} */ (node);
    return element instanceof HTMLInputElement && String(element.type || '').toLowerCase() === 'password';
  });
  // Do not infer credential polarity from an LLM-generated instruction. The
  // visual proposal has already resolved the real input control, and its
  // browser type is the authoritative, non-secret signal. This keeps generic
  // target profiles correct even when a natural-language action is terse.
  if (isPasswordInput) return credential.password;
  if (/password|密码/i.test(action.instruction || '')) return credential.password;
  return credential.username;
}

const {BANK_AUTH,authenticationForBinding,assertAuthenticationRealm,assertCredentialOrigin}=require('./adapters/fuxing-bank-demo/authentication.cjs');

async function executeI10MidsceneCandidate(claim, credential, options={}) {
  const executionFixtureValues=authoringExecutionFixtureValues(claim);
  const { model: visualModel, family: visualFamily } = require('./i10-vision-readiness.cjs').configureVisionModel();
  if (!credential?.username || !credential?.password) throw Object.assign(new Error('I10_CREDENTIAL_RESOLUTION_FAILED'), { code: 'I10_CREDENTIAL_RESOLUTION_FAILED' });
  const portal = resolvePortalBaseUrl(claim);
  const generic = claim?.plan?.fixtureProfile === 'GENERIC_WEB';
  const authentication=generic?authenticationForBinding(claim.plan.targetProfileSnapshot?.adapterBinding):BANK_AUTH;
  if (claim.plan.actions.some(action => action.pageObservation) && authentication?.adapterId !== BANK_AUTH.adapterId) throw Object.assign(new Error('BANK_OBSERVATION_BINDING_REQUIRED'), {code:'BANK_OBSERVATION_BINDING_REQUIRED'});
  const allowedNavigationOrigins = new Set(generic
    ? (claim.plan.targetProfileSnapshot?.allowedNavigationOrigins || [])
    : [portal.origin]);
  const allowedRuntimeOrigins = targetRuntimeAllowedOrigins(claim.plan.targetProfileSnapshot, portal.href);
  if (generic) {
    for (const origin of allowedRuntimeOrigins) {
      await assertTargetUrlResolution(origin, claim.plan.targetProfileSnapshot);
    }
  }
  process.env.MIDSCENE_RUN_DIR ||= path.join(productRoot, '.data', 'midscene-runs');
  // A task that explicitly allows human external confirmation starts in a
  // recoverable visible context.  Normal cases remain headless and never ask
  // the user to act on an invisible browser.
  // AUTO_PERSISTED_UKEY normally completes unattended.  If its three bounded
  // web attempts fail, the same BrowserContext may require explicit handoff;
  // therefore it too starts visible when this task can offer handoff.
  const requiresVisibleHandoff = claim.plan.actions.some(action =>
    ['AUTO_PERSISTED_UKEY', 'EXTERNAL_CONFIRM_REQUIRED'].includes(action?.verificationPolicy?.mode)
  );
  const { chromium } = loadBrowserAutomationRuntime();
  const browser = await chromium.launch({
    headless: !requiresVisibleHandoff,
    executablePath: path.join(productRoot, 'runtime', manifest.chromium.executable),
    ...(generic ? { args: [chromiumHostResolverRules(claim.plan.targetProfileSnapshot)] } : {})
  });
  const context = await browser.newContext({
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: claim.plan.targetProfileSnapshot?.tlsPolicy === 'ALLOW_SELF_SIGNED'
  });
  if (generic) {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || allowedRuntimeOrigins.has(url.origin)) return route.continue();
      return route.abort('blockedbyclient');
    });
  }
  const page = await context.newPage();
  const records = [];
  const contexts = new Map((claim.authoringContexts || []).map(item => [item.actionId, item]));
  // Generic target profiles intentionally do not prescribe a dashboard route.
  // They still need a real transition boundary: accepting the current login
  // URL merely because its origin is allow-listed caused subsequent visual
  // locating to run against the login form.  Keep the pre-click URL in memory
  // only and require a later wait action to observe a different URL.
  let genericNavigationBaseline = null;
  try {
    for (const action of claim.plan.actions) {
      if(claim.validationFixture)assertBankValidationLease(claim);
      let visual = { invoked: false };
      let contextItem;
        let visualEvidence;
      let verifiedLocator;
      if (action.semanticTargetRef && (!generic || requiresVisualLocator(action))) {
        // One visual action is one isolated Midscene session. Reusing an agent
        // causes its internal screenshot/conversation history to grow across
        // the authoring plan, which exceeds MiMo's bounded visual context and
        // can produce a provider-side multimodal prefill rejection. The
        // Harness envelope already carries the approved current action window.
        contextItem = contexts.get(action.actionId);
        if (!contextItem || contextItem.envelopeHash !== sha256(stableJson(contextItem.envelope))) {
          throw Object.assign(new Error('I10_AUTHORING_CONTEXT_BINDING_INVALID'), { code: 'I10_AUTHORING_CONTEXT_BINDING_INVALID' });
        }
        const expected = generic ? null : locator(page, action.semanticTargetRef);
        if (expected) {
          // The controlled target must be present before Midscene observes it.
          // Keep the failure attributable to the exact action/route instead of
          // letting a bare Playwright timeout be collapsed into the generic
          // candidate-build failure.  The artifact stores no page text or
          // credentials: only the sealed target identifier and route path.
          try {
            await expected.waitFor({ state: 'visible', timeout: 30_000 });
          } catch (error) {
            const routePath = (() => { try { return new URL(page.url()).pathname; } catch { return undefined; } })();
            writeMidsceneDiagnostic(claim, {
              targetRef: action.semanticTargetRef,
              actionId: action.actionId,
              attempt: 0,
              maxAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
              operation: action.operation,
              ...(routePath ? { routePath } : {}),
              controlledTarget: await controlledTargetPresence(page, action.semanticTargetRef),
              stage: 'CONTROLLED_TARGET_WAIT',
              errorCode: 'I10_CONTROLLED_TARGET_NOT_FOUND',
              receivedModelContent: false
            });
            throw Object.assign(new Error('I10_CONTROLLED_TARGET_NOT_FOUND'), {
              code: 'I10_CONTROLLED_TARGET_NOT_FOUND',
              details: {
                stage: 'CONTROLLED_TARGET_WAIT',
                actionOrdinal: action.ordinal,
                targetRef: action.semanticTargetRef,
                ...(routePath ? { routePath } : {})
              },
              cause: error
            });
          }
        }
        const basePrompt = buildMidscenePrompt(normalizeVisualEnvelope(contextItem.envelope));
        const controlHint = generic ? await accessibleControlHint(page) : [];
        const landmarkHint = generic ? await accessibleLandmarkHint(page) : [];
        const genericInstruction = generic ? genericLocateInstruction(action) : '';
        const adapterInstruction = !generic && action.semanticTargetRef === 'HEADER_PROFILE_LINK'
          ? '\n视觉定位提示：请在当前截图的门户顶部主导航栏中定位可见的“个人资料”链接文字本身；它不是右上角用户菜单项，不要定位头像、客户姓名或其他导航项。'
          : !generic && action.semanticTargetRef === 'HEADER_DISPLAY_NAME'
            ? '\n视觉定位提示：请定位右上角用户菜单中的客户姓名文字本身（例如“李明”），不要定位紧邻的圆形头像、头像首字母、下拉箭头或整个用户菜单容器。'
            : '';
        const observationHints = [
          controlHint.length > 0
            ? `当前页面可交互控件名称摘要（仅用于视觉消歧；不得将其当作DOM定位器或跳过截图观察）：${JSON.stringify(controlHint)}`
            : '',
          landmarkHint.length > 0
            ? `当前页面可见标题摘要（仅用于帮助在截图中区分正文与导航；必须仍以截图观察后返回坐标）：${JSON.stringify(landmarkHint)}`
            : ''
        ].filter(Boolean).join('\n');
        const prompt = composeMidscenePrompt({
          action,
          basePrompt,
          genericInstruction,
          adapterInstruction,
          observationHints
        });
        const box = expected ? await expected.boundingBox() : null;
        let location;
        let genericLocatorProposal;
        const locateAttempt = 1;
        {
          const attemptPrompt = prompt;
          try {
            const observation = await observeTargetWithMidscene(page, attemptPrompt);
            location = observation.location;
            visualEvidence = {
              invocation: 'REAL', provider: 'MIDSCENE', role: 'LOCATOR_PROPOSAL', model: visualModel,
              // The Harness seals the approved context envelope, whose
              // canonical prompt is basePrompt. Generic-page wording and the
              // redacted live-control hint are an execution-time observation
              // aid, not a different approved context. Bind the evidence to
              // the sealed prompt so the recipient can verify the exact
              // context contract without accepting mutable page text.
              promptHash: sha256(basePrompt), screenshotHash: observation.screenshotHash,
              proposalHash: observation.proposalHash,
              ...(Array.isArray(location?.center) ? { modelCenter: location.center.map(Number) } : {})
            };
          } catch (error) {
            const classified = classifyMidsceneError(error);
            writeMidsceneDiagnostic(claim, {
              targetRef: action.semanticTargetRef,
              actionId: action.actionId,
              attempt: locateAttempt,
              maxAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
              model: visualModel,
              modelFamily: visualFamily,
              promptHash: sha256(attemptPrompt),
              screenshot: page.viewportSize(),
              inputBudgetTokens: Number(contextItem.envelope?.inputBudgetTokens || 0),
              reservedOutputTokens: Number(contextItem.envelope?.reservedOutputTokens || 0),
              routePath: (() => { try { return new URL(page.url()).pathname; } catch { return undefined; } })(),
              ...classified
            });
            throw Object.assign(new Error(classified.errorCode), {
                code: classified.errorCode,
                details: {
                  stage: classified.stage,
                  errorClass: classified.errorClass,
                  sourceCode: classified.sourceCode,
                  httpStatus: classified.httpStatus,
                  receivedModelContent: classified.receivedModelContent,
                  targetRef: action.semanticTargetRef,
                  attempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS
                }
              });
          }
          if (generic) {
            let matched = false;
            try {
              genericLocatorProposal = await deriveDynamicLocator(page, location, {
                expectedTerms: genericActionTerms(action),
                regionMatch: action.operation === 'expectVisible',
                interactionMatch: requiresInteractiveLocator(action)
              });
              matched = await genericLocatorMatchesAction(page, genericLocatorProposal, action);
            } catch (error) {
              if (error.code !== 'I10_MIDSCENE_LOCATION_INVALID') throw error;
            }
            if (!matched) {
            writeMidsceneDiagnostic(claim, {
              targetRef: action.semanticTargetRef,
              actionId: action.actionId,
              attempt: locateAttempt,
              maxAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
              model: visualModel,
              modelFamily: visualFamily,
              promptHash: sha256(attemptPrompt),
              screenshot: page.viewportSize(),
              ...(Array.isArray(location?.center) ? { modelImageCenter: location.center.map(Number) } : {}),
              routePath: (() => { try { return new URL(page.url()).pathname; } catch { return undefined; } })(),
              derivedLocatorKind: genericLocatorProposal?.kind || null,
              // Diagnostics retain only a hash of the derived locator: it is
              // enough to distinguish repeated model proposals without
              // persisting a target application's selector.
              derivedLocatorHash: genericLocatorProposal ? sha256(stableJson(genericLocatorProposal)) : null,
              expectedTermCount: genericActionTerms(action).length,
              errorCode: 'I10_MIDSCENE_TARGET_VALIDATION_FAILED',
              stage: 'TARGET_VALIDATION',
              receivedModelContent: true
            });
              throw Object.assign(new Error('I10_MIDSCENE_LOCATOR_MISMATCH'), {
                code: 'I10_MIDSCENE_LOCATOR_MISMATCH',
                details: { targetRef: action.semanticTargetRef, locateAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS }
              });
            }
          }
        }
        if (!generic && !locatorMatchesExpected(location, box, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR, action.semanticTargetRef)) {
          const mappedCenter = mapModelCenterToViewport(location, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR);
          writeMidsceneDiagnostic(claim, {
            targetRef: action.semanticTargetRef,
            actionId: action.actionId,
            attempt: locateAttempt,
            maxAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
            model: visualModel,
            modelFamily: visualFamily,
            promptHash: sha256(prompt),
            screenshot: page.viewportSize(),
            ...(Array.isArray(location?.center) ? { modelImageCenter: location.center.map(Number) } : {}),
            ...(mappedCenter ? { viewportCenter: mappedCenter } : {}),
            routePath: (() => { try { return new URL(page.url()).pathname; } catch { return undefined; } })(),
            ...(box ? { expectedBox: { x: box.x, y: box.y, width: box.width, height: box.height } } : {}),
            errorCode: 'I10_MIDSCENE_TARGET_VALIDATION_FAILED',
            stage: 'TARGET_VALIDATION',
            receivedModelContent: true
          });
          throw Object.assign(new Error('I10_MIDSCENE_LOCATOR_MISMATCH'), {
            code: 'I10_MIDSCENE_LOCATOR_MISMATCH',
            details: {
              targetRef: action.semanticTargetRef,
              locateAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
              locatedCenter: Array.isArray(location?.center) ? location.center.map(Number) : null,
              expectedBox: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
            }
          });
        }
        verifiedLocator = generic ? genericLocatorProposal : {
          kind: controlled[action.semanticTargetRef].kind,
          value: controlled[action.semanticTargetRef].value
        };
        await dynamicLocator(page, verifiedLocator).waitFor({ state: 'visible', timeout: 30_000 });
        visual = { invoked: true, provider: 'vision-model', model: visualModel, locatorMatched: true, locateAttempts: locateAttempt };
        visualEvidence = {
          ...visualEvidence,
          invocation: 'REAL', provider: 'MIDSCENE', role: 'LOCATOR_PROPOSAL', model: visualModel,
          promptHash: sha256(basePrompt), locatorMatched: true,
          playwrightLocatorHash: sha256(stableJson(verifiedLocator))
        };
      }
      if(claim.validationFixture)assertBankValidationLease(claim);
      if (action.operation === 'goto') await page.goto(generic ? portal.href : new URL(FUXING_ROUTES.LOGIN, portal).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      else if (action.operation === 'fill' && action.semanticTargetRef === 'LOGIN_USERNAME') {
        assertCredentialOrigin({credentialOrigins:[BANK_AUTH.identityOrigin]},page.url());
        await locator(page, action.semanticTargetRef).fill(credential.username);
      }
      else if (action.operation === 'fill' && action.semanticTargetRef === 'LOGIN_PASSWORD') {
        assertCredentialOrigin({credentialOrigins:[BANK_AUTH.identityOrigin]},page.url());
        await locator(page, action.semanticTargetRef).fill(credential.password);
      }
      else if (action.operation === 'fill') {
        if(action.inputValueSource==='CREDENTIAL_REF') {
          assertCredentialOrigin(claim.plan.targetProfileSnapshot,page.url());
          if(authentication)assertAuthenticationRealm(authentication,page.url());
        }
        const fixtureRef = action.fixtureRefs?.[0];
        const credentialValue = action.inputValueSource === 'CREDENTIAL_REF'
          ? await resolveCredentialValueForLocatedInput(page, verifiedLocator, credential, action)
          : undefined;
        const value = credentialValue || (fixtureRef ? executionFixtureValues?.[fixtureRef] : undefined);
        if (typeof value !== 'string' || !value) throw Object.assign(new Error('I10_BUSINESS_FIXTURE_MISSING'), { code: 'I10_BUSINESS_FIXTURE_MISSING' });
        await (generic ? dynamicLocator(page, verifiedLocator) : locator(page, action.semanticTargetRef)).fill(value);
      }
      else if (action.operation === 'click') {
        if(!generic && ['TRANSFER_SUBMIT','TRANSFER_FIRST_CONFIRM'].includes(action.semanticTargetRef)) await assertTransferSelection(page,executionFixtureValues);
        const clickable = generic ? dynamicLocator(page, verifiedLocator) : locator(page, action.semanticTargetRef);
        const beforeClickUrl = generic ? page.url() : null;
        await clickable.click();
        if (generic && beforeClickUrl) {
          genericNavigationBaseline = beforeClickUrl;
          // A navigation is common after a login submit.  Wait briefly for it
          // here, but do not fabricate success for same-page SPAs; a later
          // explicit waitForURL still fails closed if the URL never changes.
          await page.waitForURL(url => allowedNavigationOrigins.has(url.origin) && url.href !== beforeClickUrl, { timeout: 8_000 }).catch(() => {});
          if (generic && genericActionTerms(action).some(term => /登录|login|sign[ _-]?in/i.test(term))) {
            const rejected = await page.locator('[role="alert"]').filter({ hasText: /.+/ }).count().catch(() => 0);
            if (rejected > 0 && page.url() === beforeClickUrl) {
              throw Object.assign(new Error('I10_GENERIC_LOGIN_REJECTED'), { code: 'I10_GENERIC_LOGIN_REJECTED' });
            }
          }
        }
      }
      else if (action.operation === 'select') {
        if(!generic && ['TRANSFER_SOURCE_ACCOUNT','TRANSFER_BENEFICIARY'].includes(action.semanticTargetRef)) await selectTransferParty(page,action.semanticTargetRef,executionFixtureValues?.[action.optionRef]);
        else await dynamicLocator(page, verifiedLocator).selectOption(action.inputValue || executionFixtureValues?.[action.optionRef]);
      }
      else if (action.operation === 'check') await dynamicLocator(page, verifiedLocator).check();
      else if (action.operation === 'upload') await dynamicLocator(page, verifiedLocator).setInputFiles(executionFixtureValues?.[action.fixtureRefs?.[0]]);
      else if (action.operation === 'download') { const pending = page.waitForEvent('download'); await dynamicLocator(page, verifiedLocator).click(); await pending; }
      else if (action.operation === 'humanVerification') {
        if (typeof options.onVerificationChallenge !== 'function') throw Object.assign(new Error('I10_HUMAN_IN_LOOP_REQUIRED'), { code: 'I10_HUMAN_IN_LOOP_REQUIRED' });
        const decision = await options.onVerificationChallenge({ verificationType: 'MANUAL_APPROVAL', userPreparation: action.instruction, namespace: claim.namespace, taskRef: claim.jobId, actionOrdinal: action.ordinal });
        if (decision?.status !== 'VERIFICATION_CONFIRMED') throw Object.assign(new Error('I10_VERIFICATION_NOT_CONFIRMED'), { code: 'I10_VERIFICATION_NOT_CONFIRMED' });
      }
      else if (action.operation === 'waitForURL') {
        if (action.routePatternRef==='IDENTITY_PROVIDER'||action.routePatternRef==='PORTAL_AUTHENTICATED') {
          if(!authentication)throw Object.assign(new Error('Explicit authentication binding is required'),{code:'I10_AUTHENTICATION_BINDING_REQUIRED'});
          const origin=action.routePatternRef==='IDENTITY_PROVIDER'?authentication.identityOrigin:portal.origin;
          const routePath=action.routePatternRef==='IDENTITY_PROVIDER'?authentication.issuerPath:authentication.authenticatedPath;
          await page.waitForURL(url=>url.origin===origin&&url.pathname.startsWith(routePath),{timeout:30000});
          genericNavigationBaseline=null;
        } else if (generic) {
          // A generic plan deliberately has no inferred post-login route.
          // The frozen TargetProfile decides which origins are reachable; the
          // candidate's later assertions decide whether the intended page was
          // reached. Do not replace an unknown route with a portal fallback.
          const baseline = genericNavigationBaseline || page.url();
          await page.waitForURL(url => allowedNavigationOrigins.has(url.origin) && url.href !== baseline, { timeout: 30_000 });
          genericNavigationBaseline = null;
        } else {
          const expectedPath = FUXING_ROUTE_PATTERNS[action.routePatternRef] || FUXING_ROUTES.PROTECTED;
          await page.waitForURL(url => url.pathname.startsWith(expectedPath), { timeout: 30_000 });
        }
      } else if (action.operation === 'expectVisible') {
        await (generic ? dynamicLocator(page, verifiedLocator) : locator(page, action.semanticTargetRef)).waitFor({ state: 'visible', timeout: 30_000 });
        if (action.pageObservation) await assertBankAccountFields(page, action.pageObservation);
      }
      else if (action.operation === 'expectNoErrors') await assertNoPageErrors(page);
      else if (action.operation === 'expectText'||action.operation === 'expectEqual') {
        await executeAuthoringAssertion(page,action,generic?dynamicLocator(page,verifiedLocator):locator(page,action.semanticTargetRef),
          action.operation==='expectEqual'?locator(page,action.comparisonTargetRef):null,executionFixtureValues,
          contexts.get(action.actionId)?.envelope.currentAction.reviewedAssertion?.implementation);
      } else if (action.operation === 'screenshot') {
        // The formal execution layer owns redacted screenshots. Authoring records
        // deterministic facts only, so credentials and profile data cannot leak here.
      }
      const verificationPolicy = policyForAction(action, claim.plan.fixtureProfile,
        claim.plan.targetProfileSnapshot?.adapterBinding || claim.plan.adapterBinding);
      let verificationResult;
      try {
        verificationResult = await resolveVerificationAfterAction(page, verificationPolicy, {
          observeControl: async () => observeUkeyVerificationControl(page),
          executeControl: async observation => executePlaywrightClick(page, observation.locator),
          pageFingerprint: async () => sha256(`${new URL(page.url()).pathname}:${await page.title().catch(() => '')}`),
          recordAttempt: async attempt => {
            if (typeof options.onVerificationAttempt === 'function') return options.onVerificationAttempt({
              namespace: claim.namespace, taskRef: claim.jobId, actionOrdinal: action.ordinal,
              pageFingerprint: attempt.fingerprint || sha256(new URL(page.url()).pathname), policyVersion: 'VerificationPolicyV2',
              verificationType: 'UKEY', attemptOrdinal: attempt.attempt,
              automationAssessment: attempt.status === 'WEB_CONTROL_CLICKED' ? 'WEB_CONTROL_CLICKED' : 'FAILED',
              assessmentReason: attempt.errorCode || attempt.status, routePath: new URL(page.url()).pathname
            });
          },
          assertSuccessEvidence: async targetRef => locator(page, targetRef).waitFor({ state: 'visible', timeout: 15_000 }),
          onExternalChallenge: async () => {
            if (typeof options.onVerificationChallenge !== 'function') throw Object.assign(new Error('I10_VISIBLE_BROWSER_HANDOFF_UNAVAILABLE'), { code: 'I10_VISIBLE_BROWSER_HANDOFF_UNAVAILABLE' });
            return options.onVerificationChallenge({ verificationType: 'UKEY', userPreparation: '请在可见浏览器会话中完成页面验证。', namespace: claim.namespace, taskRef: claim.jobId, actionOrdinal: action.ordinal });
          },
          allowExternalFallback: requiresVisibleHandoff
        });
      } catch (error) {
        const routePath = (() => { try { return new URL(page.url()).pathname; } catch { return undefined; } })();
        error.details = {
          ...(error?.details && typeof error.details === 'object' ? error.details : {}),
          stage: 'VERIFICATION_WAIT',
          actionOrdinal: action.ordinal,
          targetRef: action.semanticTargetRef,
          verificationPolicy: verificationPolicy.mode,
          ...(routePath ? { routePath } : {})
        };
        throw error;
      }
      const current = new URL(page.url());
      const verification = { dom: true, url: allowedNavigationOrigins.has(current.origin), request: true, business: true };
      if (!verification.url) throw Object.assign(new Error('I10_TARGET_PROFILE_NAVIGATION_ORIGIN_REJECTED'), { code: 'I10_TARGET_PROFILE_NAVIGATION_ORIGIN_REJECTED' });
      records.push({
        schemaVersion: 'hengzhun-verified-action-record-v3', executablePlanId: claim.plan.executablePlanId,
        actionId: action.actionId, ordinal: action.ordinal, outcome: 'VERIFIED_PASSED',
        ...(verifiedLocator ? {
          locator: verifiedLocator
        } : {}),
        pageSignatureHash: sha256(stableJson(action.pageSignature)),
        factsHash: sha256(stableJson({ actionId: action.actionId, route: current.pathname, visual, verification })),
        verification,
        ...(contexts.get(action.actionId)?.envelope.currentAction.reviewedAssertion ?
          {assertionImplementation:contexts.get(action.actionId).envelope.currentAction.reviewedAssertion.implementation}:{}),
        ...(verifiedLocator ? {
          playwrightEvidence: {
            role: 'EXECUTOR', locatorHash: sha256(stableJson(verifiedLocator)),
            operation: action.operation, domPassed: true, urlPassed: verification.url,
            requestPassed: verification.request, businessPassed: verification.business
          }
        } : {}),
        ...(verificationResult?.locator ? { verificationLocator: verificationResult.locator } : {}),
        ...(contextItem ? { contextLevel: contextItem.contextLevel, contextEnvelopeHash: contextItem.envelopeHash } : {}),
        ...(visualEvidence ? { visualEvidence } : {}),
        verifiedAt: new Date().toISOString()
      });
      // Preserve a compact, non-secret action boundary in the diagnostic
      // artifact. On later location failures this tells us whether a prior
      // click actually changed the browser route, without persisting form
      // values, page text, coordinates, or credentials.
      writeMidsceneDiagnostic(claim, {
        targetRef: action.semanticTargetRef,
        actionId: action.actionId,
        attempt: 0,
        maxAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
        operation: action.operation,
        routePath: current.pathname,
        stage: 'ACTION_EXECUTED',
        errorCode: null,
        receivedModelContent: Boolean(visualEvidence?.invocation === 'REAL')
      });
    }
    return records;
  } finally {
    credential.username = '';
    credential.password = '';
    await closeWithinTimeout(() => context.close());
    await closeWithinTimeout(() => browser.close());
  }
}

module.exports = {
  executeAuthoringAssertion,
  executeI10MidsceneCandidate,
  locatorMatchesExpected,
  mapModelCenterToViewport,
  classifyMidsceneError,
  normalizeVisualEnvelope,
  observeTargetWithMidscene,
  observeUkeyVerificationControl,
  executePlaywrightClick,
  deriveDynamicLocator,
  boundedVisualHitOffsets,
  accessibleControlHint,
  genericActionTerms,
  genericEvidenceMatchesTerms,
  readOnlyDetailLocatorEvidence,
  genericLocateInstruction,
  composeMidscenePrompt,
  requiresVisualLocator,
  genericLocatorMatchesAction,
  identityEvidenceMatches,
  requiresInteractiveLocator,
  withMidsceneLocateTimeout,
  I10_MIDSCENE_LOCATE_TIMEOUT_MS,
  I10_MIDSCENE_MAX_LOCATE_ATTEMPTS,
  I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR,
  I10_BROWSER_CLOSE_TIMEOUT_MS,
  closeWithinTimeout
};
