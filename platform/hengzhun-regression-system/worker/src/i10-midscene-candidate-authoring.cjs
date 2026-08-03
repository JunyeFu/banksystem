'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const productRoot = path.resolve(__dirname, '..', '..');
const runtimeRequire = createRequire(path.join(productRoot, 'runtime', 'node_modules', '_hengzhun_loader.cjs'));
const { chromium } = runtimeRequire('playwright');
const { PlaywrightAgent } = runtimeRequire('@midscene/web/playwright');
const { policyForAction, resolveVerificationAfterAction } = require('./i10-verification-policy.cjs');
const { FUXING_BANK_DEMO_ROUTES: FUXING_ROUTES, FUXING_BANK_DEMO_TARGETS: controlled, FUXING_BANK_DEMO_ROUTE_PATTERNS: FUXING_ROUTE_PATTERNS } = require('./adapters/fuxing-bank-demo/index.cjs');
const { buildMidscenePrompt, normalizeMidscenePromptEnvelope } = require('../../dist/harness/src/context-envelope.js');
const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'config', 'demo-runtime-freeze.json'), 'utf8'));
const I10_MIDSCENE_MAX_LOCATE_ATTEMPTS = 3;
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

function createMidsceneAgent(page) {
  return new PlaywrightAgent(page, { screenshotShrinkFactor: I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR });
}

// Contexts are persisted before candidate compilation. Earlier package
// versions embedded the fixture name “张三” in display-name prompts. Remove
// that stale assumption at the visual boundary so old preparations remain
// executable; deterministic Playwright assertions still check actual equality.
function normalizeVisualEnvelope(envelope) {
  return normalizeMidscenePromptEnvelope(envelope);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

async function closeWithinTimeout(closeOperation, timeoutMs = I10_BROWSER_CLOSE_TIMEOUT_MS) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(closeOperation).catch(() => undefined),
      new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyMidsceneError(error) {
  const name = String(error?.name || 'Error').slice(0, 80);
  const sourceCode = String(error?.code || '').slice(0, 120);
  const status = Number.isInteger(error?.status) ? error.status : Number.isInteger(error?.statusCode) ? error.statusCode : null;
  const message = String(error?.message || '');
  let errorCode = 'I10_MIDSCENE_TRANSPORT_FAILED';
  let stage = 'MODEL_TRANSPORT';
  if (name === 'AIResponseParseError' || /parse|json|schema|empty content/i.test(message)) {
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
  const result = await page.evaluate(({ x, y, expectedTerms, regionMatch }) => {
    let node = document.elementFromPoint(x, y);
    if (!(node instanceof HTMLElement)) return null;
    // A visual assertion normally refers to a whole card/region, while the
    // model centre may fall on one of its values.  Inspect only the element
    // at Midscene's returned position and its own ancestors; never search
    // the page for a matching term.  This keeps Midscene as the locator
    // authority and lets Playwright obtain a stable DOM-backed region.
    if (regionMatch && expectedTerms.length) {
      const normalize = value => String(value || '').replace(/\s+/g, '').toLowerCase();
      for (let current = node; current instanceof HTMLElement && current !== document.body; current = current.parentElement) {
        const text = normalize([current.getAttribute('aria-label'), current.textContent].filter(Boolean).join(' '));
        if (expectedTerms.every(term => text.includes(term))) {
          node = current;
          break;
        }
      }
    }
    const testId = node.getAttribute('data-testid');
    if (testId) return { kind: 'TEST_ID', value: testId };
    const id = node.id;
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : '';
    if (label) return { kind: 'LABEL', value: label };
    const placeholder = node.getAttribute('placeholder');
    if (placeholder) return { kind: 'PLACEHOLDER', value: placeholder };
    const role = node.getAttribute('role') || ({ BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox' })[node.tagName];
    const name = node.getAttribute('aria-label') || node.textContent?.trim();
    if (role && name && name.length <= 160) return { kind: 'ROLE', value: `${role}|${name}` };
    if (id) return { kind: 'CSS', value: `#${CSS.escape(id)}` };
    const segments = [];
    let current = node;
    while (current && current !== document.body && segments.length < 6) {
      let segment = current.tagName.toLowerCase();
      const siblings = current.parentElement ? [...current.parentElement.children].filter(item => item.tagName === current.tagName) : [];
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      segments.unshift(segment);
      current = current.parentElement;
    }
    return { kind: 'CSS', value: `body > ${segments.join(' > ')}` };
  }, { x, y, expectedTerms, regionMatch: options.regionMatch === true });
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
    return [...document.querySelectorAll('a,button,select,input[type="button"],input[type="submit"],[role="button"]')]
      .map(node => {
        const element = /** @type {HTMLElement} */ (node);
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || tag;
        const associatedLabel = element instanceof HTMLInputElement || element instanceof HTMLSelectElement
          ? [...element.labels || []].map(label => label.textContent || '').join(' ')
          : '';
        const name = redact(element.getAttribute('aria-label') || element.getAttribute('title') || associatedLabel || element.textContent || element.getAttribute('value'));
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
  if (action?.operation !== 'expectVisible') return '';
  const instruction = String(action.instruction || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  // Use the first named fact as the visual anchor. A phrase such as
  // “确认账户卡片、余额和账户状态正常显示” describes an assertion set, not
  // a single target. The card title is the one visual target, while the
  // generated Playwright assertion keeps the full fact set in scope.
  const anchor = instruction
    .replace(/^(?:确认|验证|检查|查看|确保|查询)\s*[:：]?\s*/, '')
    .replace(/(?:是否)?(?:正常)?(?:显示|一致|存在|正确).*$/, '')
    .split(/[、，,；;]/)[0]
    .trim()
    .slice(0, 80);
  return instruction
    ? `\n当前动作是只读视觉定位：请在当前截图中优先定位与“${anchor || instruction}”一致的标题或信息卡片；该卡片承载“${instruction}”所述事实。不要判断业务规则是否成立；只返回该信息区块的中心位置，不要定位导航或输入框。`
    : '';
}

function genericActionTerms(action) {
  const instruction = String(action?.instruction || '').replace(/\s+/g, ' ').trim();
  if (!instruction) return [];
  if (action.operation === 'fill') {
    if (/密码|password/i.test(instruction)) return ['密码'];
    if (/用户名|账号|账户|username|user name/i.test(instruction)) return ['用户名'];
  }
  if (action.operation === 'click') {
    if (/登录|login|sign[ _-]?in/i.test(instruction)) return ['登录'];
    const page = instruction.match(/(?:打开|进入|导航(?:至|到)?|前往)\s*(.+?(?:页|页面|中心|工作台|汇款)?)(?:$|[，,；;])/i)?.[1]?.trim();
    if (page && page.length >= 2) {
      // Controller drafts commonly describe a navigation destination as
      // “个人资料页面”, while the rendered navigation label is simply
      // “个人资料”.  Normalize only this navigation presentation suffix:
      // mutation labels keep their literal text and remain fail-closed.
      const navigationLabel = page.replace(/(?:页面|页)$/u, '').trim();
      return [navigationLabel || page];
    }
  }
  const compact = instruction
    .replace(/^(?:确认|验证|检查|查看|确保|查询|打开|进入|导航(?:至|到)?)\s*[:：]?\s*/, '')
    .replace(/(?:是否)?(?:正常)?(?:显示|一致|存在|正确).*$/, '');
  const isCrossPageComparison = /(?:一致|相同|比较|对比)/u.test(instruction);
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
          .replace(/(?:页面)?(?:显示)?(?:列表|清单|详情)$/u, '')
          .replace(/页面$/u, '')
          .replace(/(?:文档|文件|报告)标题$/u, match => match.replace(/标题$/u, ''))
          .replace(/(?:账户|账号)掩码/gu, '账户')
          .replace(/(?:正确|正常)(?:展示|显示)?$/u, '')
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

async function genericLocatorMatchesAction(page, locatorProposal, action) {
  const terms = genericActionTerms(action);
  if (!terms.length) return false;
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
      text: normalize([
      element.getAttribute('aria-label'), element.getAttribute('title'),
      label, wrappingLabel, element.textContent, element.getAttribute('placeholder'), element.getAttribute('value')
      ].filter(Boolean).join(' ')),
      clickable: tagName === 'button' || tagName === 'a' || role === 'button' ||
        (tagName === 'input' && ['button', 'submit', 'reset', 'image'].includes(type))
    };
  });
  // A visual proposal for a click must resolve to an interactive control. A
  // surrounding label/card can contain the same wording yet only focus an
  // input, leaving the browser on the login page. This validates Midscene's
  // observation and then retries it; it is not a DOM-selector fallback.
  if (action.operation === 'click' && !evidence.clickable) return false;
  const normalized = String(evidence.text || '').replace(/\s+/g, '').toLowerCase();
  return terms.every(term => normalized.includes(String(term).replace(/\s+/g, '').toLowerCase()));
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

async function observeTargetWithMidscene(page, prompt) {
  const agent = createMidsceneAgent(page);
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

async function executeI10MidsceneCandidate(claim, credential, options={}) {
  const visualModel = process.env.VISION_MODEL_NAME || process.env.MIDSCENE_MODEL_NAME;
  const visualBaseUrl = process.env.VISION_BASE_URL || process.env.MIDSCENE_MODEL_BASE_URL;
  const visualApiKey = process.env.VISION_API_KEY || process.env.MIDSCENE_MODEL_API_KEY;
  const visualFamily = process.env.VISION_MODEL_FAMILY || process.env.MIDSCENE_MODEL_FAMILY;
  if (!visualModel || !visualBaseUrl || !visualApiKey || !visualFamily) throw Object.assign(new Error('I10_VISION_CONFIGURATION_MISSING'), { code: 'I10_VISION_CONFIGURATION_MISSING' });
  if (/mimo/i.test(visualModel) && visualFamily !== 'xiaomi-mimo') {
    throw Object.assign(new Error('I10_VISION_MODEL_FAMILY_MISMATCH'), {
      code: 'I10_VISION_MODEL_FAMILY_MISMATCH',
      details: { expectedFamily: 'xiaomi-mimo', configuredFamily: visualFamily }
    });
  }
  process.env.MIDSCENE_MODEL_NAME = visualModel;
  process.env.MIDSCENE_MODEL_BASE_URL = visualBaseUrl;
  process.env.MIDSCENE_MODEL_API_KEY = visualApiKey;
  process.env.MIDSCENE_MODEL_FAMILY = visualFamily;
  // @midscene/web resolves the OpenAI-compatible transport through the
  // upstream OPENAI_* keys.  The I10 VISION_* / MIDSCENE_* variables are our
  // portable public configuration surface, but setting only those aliases
  // leaves Midscene without a real transport while the standalone probe (that
  // calls VISION_BASE_URL directly) succeeds.  Mirror the already validated
  // process-local values immediately before creating the agent; never log
  // either value.
  process.env.OPENAI_BASE_URL = visualBaseUrl;
  process.env.OPENAI_API_KEY = visualApiKey;
  // Keep the SDK transport timeout aligned with the outer diagnostic timeout.
  // Promise.race alone does not cancel an in-flight SDK fetch, which can leave
  // the single Worker occupied after a typed timeout has been reported.
  process.env.MIDSCENE_MODEL_TIMEOUT = String(I10_MIDSCENE_LOCATE_TIMEOUT_MS);
  process.env.MIDSCENE_MODEL_RETRY_COUNT = '0';
  if (!credential?.username || !credential?.password) throw Object.assign(new Error('I10_CREDENTIAL_RESOLUTION_FAILED'), { code: 'I10_CREDENTIAL_RESOLUTION_FAILED' });
  const portal = resolvePortalBaseUrl(claim);
  const generic = claim?.plan?.fixtureProfile === 'GENERIC_WEB';
  const allowedNavigationOrigins = new Set(generic
    ? (claim.plan.targetProfileSnapshot?.allowedNavigationOrigins || [])
    : [portal.origin]);
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
  const browser = await chromium.launch({ headless: !requiresVisibleHandoff, executablePath: path.join(productRoot, 'runtime', manifest.chromium.executable) });
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 } });
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
          : '';
        const observationHints = [
          controlHint.length > 0
            ? `当前页面可交互控件名称摘要（仅用于视觉消歧；不得将其当作DOM定位器或跳过截图观察）：${JSON.stringify(controlHint)}`
            : '',
          landmarkHint.length > 0
            ? `当前页面可见标题摘要（仅用于帮助在截图中区分正文与导航；必须仍以截图观察后返回坐标）：${JSON.stringify(landmarkHint)}`
            : ''
        ].filter(Boolean).join('\n');
        const prompt = observationHints
          ? `${basePrompt}${genericInstruction}${adapterInstruction}\n${observationHints}`
          : `${basePrompt}${genericInstruction}${adapterInstruction}`;
        const box = expected ? await expected.boundingBox() : null;
        let location;
        let genericLocatorProposal;
        let locateAttempt = 0;
        for (locateAttempt = 1; locateAttempt <= I10_MIDSCENE_MAX_LOCATE_ATTEMPTS; locateAttempt += 1) {
          const attemptPrompt = locateAttempt === 1
            ? prompt
            : `${prompt}\n上一次视觉候选未通过受控目标一致性校验。请重新独立观察整张当前截图，只返回同一 currentAction 所描述目标，不得复用上一次位置。`;
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
            if (locateAttempt === I10_MIDSCENE_MAX_LOCATE_ATTEMPTS) {
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
            await new Promise(resolve => setTimeout(resolve, locateAttempt * 1_000));
            continue;
          }
          if (generic) {
            try {
              genericLocatorProposal = await deriveDynamicLocator(page, location, {
                expectedTerms: genericActionTerms(action),
                regionMatch: action.operation === 'expectVisible'
              });
              if (await genericLocatorMatchesAction(page, genericLocatorProposal, action)) break;
            } catch (error) {
              // Derivation failure is handled by the same bounded retry loop.
            }
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
            if (locateAttempt === I10_MIDSCENE_MAX_LOCATE_ATTEMPTS) {
              throw Object.assign(new Error('I10_MIDSCENE_LOCATOR_MISMATCH'), {
                code: 'I10_MIDSCENE_LOCATOR_MISMATCH',
                details: { targetRef: action.semanticTargetRef, locateAttempts: I10_MIDSCENE_MAX_LOCATE_ATTEMPTS }
              });
            }
            await new Promise(resolve => setTimeout(resolve, locateAttempt * 1_000));
            continue;
          }
          if (locatorMatchesExpected(location, box, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR, action.semanticTargetRef)) break;
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
      if (action.operation === 'goto') await page.goto(generic ? portal.href : new URL(FUXING_ROUTES.LOGIN, portal).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      else if (action.operation === 'fill' && action.semanticTargetRef === 'LOGIN_USERNAME') await locator(page, action.semanticTargetRef).fill(credential.username);
      else if (action.operation === 'fill' && action.semanticTargetRef === 'LOGIN_PASSWORD') await locator(page, action.semanticTargetRef).fill(credential.password);
      else if (action.operation === 'fill') {
        const fixtureRef = action.fixtureRefs?.[0];
        const credentialValue = action.inputValueSource === 'CREDENTIAL_REF'
          ? await resolveCredentialValueForLocatedInput(page, verifiedLocator, credential, action)
          : undefined;
        const value = credentialValue || (fixtureRef ? claim.plan.fixtureValues?.[fixtureRef] : undefined);
        if (typeof value !== 'string' || !value) throw Object.assign(new Error('I10_BUSINESS_FIXTURE_MISSING'), { code: 'I10_BUSINESS_FIXTURE_MISSING' });
        await (generic ? dynamicLocator(page, verifiedLocator) : locator(page, action.semanticTargetRef)).fill(value);
      }
      else if (action.operation === 'click') {
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
      else if (action.operation === 'select') await dynamicLocator(page, verifiedLocator).selectOption(action.inputValue || claim.plan.fixtureValues?.[action.optionRef]);
      else if (action.operation === 'check') await dynamicLocator(page, verifiedLocator).check();
      else if (action.operation === 'upload') await dynamicLocator(page, verifiedLocator).setInputFiles(claim.plan.fixtureValues?.[action.fixtureRefs?.[0]]);
      else if (action.operation === 'download') { const pending = page.waitForEvent('download'); await dynamicLocator(page, verifiedLocator).click(); await pending; }
      else if (action.operation === 'humanVerification') {
        if (typeof options.onVerificationChallenge !== 'function') throw Object.assign(new Error('I10_HUMAN_IN_LOOP_REQUIRED'), { code: 'I10_HUMAN_IN_LOOP_REQUIRED' });
        const decision = await options.onVerificationChallenge({ verificationType: 'USER_ASSISTED', userPreparation: action.instruction, namespace: claim.namespace, taskRef: claim.jobId, actionOrdinal: action.ordinal });
        if (decision?.status !== 'VERIFICATION_CONFIRMED') throw Object.assign(new Error('I10_VERIFICATION_NOT_CONFIRMED'), { code: 'I10_VERIFICATION_NOT_CONFIRMED' });
      }
      else if (action.operation === 'waitForURL') {
        if (generic) {
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
      } else if (action.operation === 'expectVisible') await (generic ? dynamicLocator(page, verifiedLocator) : locator(page, action.semanticTargetRef)).waitFor({ state: 'visible', timeout: 30_000 });
      else if (action.operation === 'expectEqual') {
        const left = (await locator(page, action.semanticTargetRef).innerText()).trim();
        const right = (await locator(page, action.comparisonTargetRef).innerText()).trim();
        if (left !== right) throw Object.assign(new Error('I10_EXPECT_EQUAL_FAILED'), { code: 'I10_EXPECT_EQUAL_FAILED' });
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
            return options.onVerificationChallenge({ verificationType: 'USER_ASSISTED', userPreparation: '请在可见浏览器会话中完成页面验证。', namespace: claim.namespace, taskRef: claim.jobId, actionOrdinal: action.ordinal });
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
  executeI10MidsceneCandidate,
  locatorMatchesExpected,
  mapModelCenterToViewport,
  classifyMidsceneError,
  normalizeVisualEnvelope,
  observeTargetWithMidscene,
  observeUkeyVerificationControl,
  executePlaywrightClick,
  deriveDynamicLocator,
  accessibleControlHint,
  genericActionTerms,
  requiresVisualLocator,
  genericLocatorMatchesAction,
  withMidsceneLocateTimeout,
  I10_MIDSCENE_LOCATE_TIMEOUT_MS,
  I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR,
  I10_BROWSER_CLOSE_TIMEOUT_MS,
  closeWithinTimeout
};
