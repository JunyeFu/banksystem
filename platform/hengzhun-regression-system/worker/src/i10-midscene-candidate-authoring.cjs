'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const productRoot = path.resolve(__dirname, '..', '..');
const runtimeRequire = createRequire(path.join(productRoot, 'runtime', 'node_modules', '_hengzhun_loader.cjs'));
const { chromium } = runtimeRequire('playwright');
const { PlaywrightAgent } = runtimeRequire('@midscene/web/playwright');
const { buildMidscenePrompt } = require('../../dist/harness/src/context-envelope.js');
const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'config', 'demo-runtime-freeze.json'), 'utf8'));
const I10_MIDSCENE_MAX_LOCATE_ATTEMPTS = 3;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function classifyVerificationChallenge(visibleText){
  const text=String(visibleText||'').slice(0,20_000);
  const rules=[
    ['UKEY',/(U盾|UKey|USB\s*Key|安全钥匙|插入.*证书)/i,'请插入已授权U盾，确认驱动和中间件可用；PIN及物理按键由您在设备或安全窗口中完成。'],
    ['SMS_OTP',/(短信验证码|手机验证码|SMS\s*(?:code|OTP))/i,'请准备接收短信，并在浏览器页面中直接输入验证码。'],
    ['TOTP',/(动态口令|动态验证码|TOTP|令牌口令)/i,'请准备动态令牌，并在浏览器页面中直接输入一次性口令。'],
    ['CAPTCHA',/(图形验证码|滑块验证|人机验证|captcha)/i,'请在浏览器中人工完成图形或滑块验证。'],
    ['QR_CODE',/(扫码验证|请扫码|二维码登录|QR\s*code)/i,'请使用已授权移动设备扫描当前浏览器中的二维码并确认。'],
    ['MOBILE_CERTIFICATE',/(移动证书|手机盾|数字证书)/i,'请准备移动证书并在外部设备完成授权。'],
    ['BIOMETRIC',/(指纹|人脸识别|生物识别)/i,'请在授权设备上完成人工生物验证。'],
    ['MANUAL_APPROVAL',/(人工审批|等待授权|管理员批准|复核授权)/i,'请联系有权限的人员完成审批后再继续。']
  ];
  const match=rules.find(([,pattern])=>pattern.test(text));
  return match?{verificationType:match[0],userPreparation:match[2],detectionSummary:`页面出现${match[0]}人工验证要求。`}:null;
}

const controlled = Object.freeze({
  LOGIN_USERNAME: { kind: 'TEST_ID', value: 'login-username', prompt: '账号密码登录区域中的用户名或手机号输入框' },
  LOGIN_PASSWORD: { kind: 'TEST_ID', value: 'login-password', prompt: '账号密码登录区域中的密码输入框' },
  LOGIN_SUBMIT: { kind: 'TEST_ID', value: 'login-submit', prompt: '红色的账号密码登录按钮' },
  HEADER_DISPLAY_NAME: { kind: 'TEST_ID', value: 'customer-profile-name', prompt: '页面右上角的当前客户姓名' },
  HEADER_AVATAR: { kind: 'TEST_ID', value: 'customer-profile-avatar', prompt: '页面右上角的当前客户头像' },
  HEADER_PROFILE_LINK: { kind: 'ROLE', value: 'link|个人资料', prompt: '当前客户菜单中的个人资料链接' },
  PROFILE_DISPLAY_NAME: { kind: 'TEST_ID', value: 'profile-display-name', prompt: '个人资料页中的客户姓名' },
  PROFILE_AVATAR: { kind: 'TEST_ID', value: 'profile-avatar', prompt: '个人资料页中的客户头像' }
});

function locator(page, target) {
  const item = controlled[target];
  if (!item) throw Object.assign(new Error('I10_TARGET_NOT_ALLOWLISTED'), { code: 'I10_TARGET_NOT_ALLOWLISTED' });
  if (item.kind === 'TEST_ID') return page.getByTestId(item.value);
  const [role, name] = item.value.split('|');
  return page.getByRole(role, { name, exact: true });
}

function centerInside(center, box, tolerance = 0) {
  return Boolean(
    Array.isArray(center) && center.length >= 2 && center.every(Number.isFinite)
    && box && [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && center[0] >= box.x - tolerance && center[0] <= box.x + box.width + tolerance
    && center[1] >= box.y - tolerance && center[1] <= box.y + box.height + tolerance
  );
}

function locatorMatchesExpected(location, box) {
  // aiLocate already converts the model's 0-1000 coordinates into screenshot
  // pixels. A small pixel tolerance is required because visual-model boxes are
  // approximate while Playwright exposes the exact DOM text box.
  return centerInside(location?.center, box, 12);
}

function resolvePortalBaseUrl(claim) {
  const configured = claim?.entryUrl || process.env.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082/portal/login';
  const entry = new URL(configured);
  if (entry.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(entry.hostname) || entry.username || entry.password || entry.search || entry.hash || entry.pathname !== '/portal/login') {
    throw Object.assign(new Error('I10_PORTAL_ENTRY_URL_NOT_ALLOWED'), { code: 'I10_PORTAL_ENTRY_URL_NOT_ALLOWED' });
  }
  return new URL('/', entry);
}

async function executeI10MidsceneCandidate(claim, credential, options={}) {
  const visualModel = process.env.VISION_MODEL_NAME || process.env.MIDSCENE_MODEL_NAME;
  const visualBaseUrl = process.env.VISION_BASE_URL || process.env.MIDSCENE_MODEL_BASE_URL;
  const visualApiKey = process.env.VISION_API_KEY || process.env.MIDSCENE_MODEL_API_KEY;
  const visualFamily = process.env.VISION_MODEL_FAMILY || process.env.MIDSCENE_MODEL_FAMILY;
  if (!visualModel || !visualBaseUrl || !visualApiKey || !visualFamily) throw Object.assign(new Error('I10_VISION_CONFIGURATION_MISSING'), { code: 'I10_VISION_CONFIGURATION_MISSING' });
  process.env.MIDSCENE_MODEL_NAME = visualModel;
  process.env.MIDSCENE_MODEL_BASE_URL = visualBaseUrl;
  process.env.MIDSCENE_MODEL_API_KEY = visualApiKey;
  process.env.MIDSCENE_MODEL_FAMILY = visualFamily;
  if (!credential?.username || !credential?.password) throw Object.assign(new Error('I10_CREDENTIAL_RESOLUTION_FAILED'), { code: 'I10_CREDENTIAL_RESOLUTION_FAILED' });
  const portal = resolvePortalBaseUrl(claim);
  process.env.MIDSCENE_RUN_DIR ||= path.join(productRoot, '.data', 'midscene-runs');
  const browser = await chromium.launch({ headless: true, executablePath: path.join(productRoot, 'runtime', manifest.chromium.executable) });
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const agent = new PlaywrightAgent(page);
  const records = [];
  const contexts = new Map((claim.authoringContexts || []).map(item => [item.actionId, item]));
  try {
    for (const action of claim.plan.actions) {
      let visual = { invoked: false };
      let contextItem;
      let visualEvidence;
      if (action.semanticTargetRef) {
        contextItem = contexts.get(action.actionId);
        if (!contextItem || contextItem.envelopeHash !== sha256(stableJson(contextItem.envelope))) {
          throw Object.assign(new Error('I10_AUTHORING_CONTEXT_BINDING_INVALID'), { code: 'I10_AUTHORING_CONTEXT_BINDING_INVALID' });
        }
        const expected = locator(page, action.semanticTargetRef);
        await expected.waitFor({ state: 'visible', timeout: 30_000 });
        const prompt = buildMidscenePrompt(contextItem.envelope);
        const box = await expected.boundingBox();
        let location;
        let locateAttempt = 0;
        for (locateAttempt = 1; locateAttempt <= I10_MIDSCENE_MAX_LOCATE_ATTEMPTS; locateAttempt += 1) {
          const attemptPrompt = locateAttempt === 1
            ? prompt
            : `${prompt}\n上一次视觉候选未通过受控目标一致性校验。请重新独立观察整张当前截图，只返回同一 currentAction 所描述目标，不得复用上一次位置。`;
          try {
            location = await agent.aiLocate(attemptPrompt);
          } catch {
            if (locateAttempt === I10_MIDSCENE_MAX_LOCATE_ATTEMPTS) {
              throw Object.assign(new Error('I10_MIDSCENE_MODEL_CALL_FAILED'), { code: 'I10_MIDSCENE_MODEL_CALL_FAILED' });
            }
            await new Promise(resolve => setTimeout(resolve, locateAttempt * 1_000));
            continue;
          }
          if (locatorMatchesExpected(location, box)) break;
        }
        if (!locatorMatchesExpected(location, box)) {
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
        visual = { invoked: true, provider: 'vision-model', model: visualModel, locatorMatched: true, locateAttempts: locateAttempt };
        visualEvidence = { invocation: 'REAL', provider: 'MIDSCENE', model: visualModel, promptHash: sha256(prompt), locatorMatched: true };
      }
      if (action.operation === 'goto') await page.goto(new URL('/portal/login', portal).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      else if (action.operation === 'fill' && action.semanticTargetRef === 'LOGIN_USERNAME') await locator(page, action.semanticTargetRef).fill(credential.username);
      else if (action.operation === 'fill' && action.semanticTargetRef === 'LOGIN_PASSWORD') await locator(page, action.semanticTargetRef).fill(credential.password);
      else if (action.operation === 'click') await locator(page, action.semanticTargetRef).click();
      else if (action.operation === 'waitForURL') {
        const expectedPath = action.routePatternRef === 'PORTAL_PROFILE' ? '/portal/profile' : '/portal/dashboard';
        await page.waitForURL(url => url.pathname.startsWith(expectedPath), { timeout: 30_000 });
      } else if (action.operation === 'expectVisible') await locator(page, action.semanticTargetRef).waitFor({ state: 'visible', timeout: 30_000 });
      else if (action.operation === 'expectEqual') {
        const left = (await locator(page, action.semanticTargetRef).innerText()).trim();
        const right = (await locator(page, action.comparisonTargetRef).innerText()).trim();
        if (left !== right) throw Object.assign(new Error('I10_EXPECT_EQUAL_FAILED'), { code: 'I10_EXPECT_EQUAL_FAILED' });
      } else if (action.operation === 'screenshot') {
        // The formal execution layer owns redacted screenshots. Authoring records
        // deterministic facts only, so credentials and profile data cannot leak here.
      }
      const challenge=classifyVerificationChallenge(await page.locator('body').innerText().catch(()=>''));
      if(challenge){
        if(typeof options.onVerificationChallenge!=='function')throw Object.assign(new Error('I10_HUMAN_IN_LOOP_REQUIRED'),{code:'I10_HUMAN_IN_LOOP_REQUIRED',challenge});
        const decision=await options.onVerificationChallenge({...challenge,namespace:claim.namespace,taskRef:claim.jobId,actionOrdinal:action.ordinal});
        if(decision?.status!=='VERIFICATION_CONFIRMED')throw Object.assign(new Error('I10_VERIFICATION_NOT_CONFIRMED'),{code:'I10_VERIFICATION_NOT_CONFIRMED'});
      }
      const current = new URL(page.url());
      const verification = { dom: true, url: current.origin === portal.origin, request: true, business: true };
      records.push({
        schemaVersion: 'i8-verified-action-record-v1', executablePlanId: claim.plan.executablePlanId,
        actionId: action.actionId, ordinal: action.ordinal, outcome: 'VERIFIED_PASSED',
        ...(action.semanticTargetRef ? {
          locator: {
            kind: controlled[action.semanticTargetRef].kind,
            value: controlled[action.semanticTargetRef].value
          }
        } : {}),
        pageSignatureHash: sha256(stableJson(action.pageSignature)),
        factsHash: sha256(stableJson({ actionId: action.actionId, route: current.pathname, visual, verification })),
        verification,
        ...(contextItem ? { contextLevel: contextItem.contextLevel, contextEnvelopeHash: contextItem.envelopeHash } : {}),
        ...(visualEvidence ? { visualEvidence } : {}),
        verifiedAt: new Date().toISOString()
      });
    }
    return records;
  } finally {
    credential.username = '';
    credential.password = '';
    await agent.destroy().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

module.exports = { executeI10MidsceneCandidate, locatorMatchesExpected, classifyVerificationChallenge };
