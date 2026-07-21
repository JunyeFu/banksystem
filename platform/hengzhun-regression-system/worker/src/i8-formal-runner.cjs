'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../runtime/node_modules/playwright');
const { executeCandidatePackage } = require('./i8-candidate-runner.cjs');
const { artifact, resolveCredential, sha256 } = require('./login-profile.cjs');

const EMPTY_SCREENSHOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const LOCATOR_ERROR_CODES = Object.freeze([
  ['login-username', 'LOGIN_USERNAME_LOCATOR_NOT_FOUND'],
  ['login-password', 'LOGIN_PASSWORD_LOCATOR_NOT_FOUND'],
  ['login-submit', 'LOGIN_SUBMIT_LOCATOR_NOT_FOUND'],
  ['customer-profile-name', 'PROFILE_NAME_LOCATOR_NOT_FOUND'],
  ['/portal/profile', 'PROFILE_LINK_LOCATOR_NOT_FOUND'],
  ['profile-display-name', 'PROFILE_DISPLAY_NAME_LOCATOR_NOT_FOUND']
]);

function fail(code, message, category = 'ENVIRONMENT') {
  throw Object.assign(new Error(message), { code, category });
}

async function executeI8FormalRun(task, environment = process.env, options = {}) {
  const descriptor = task.execution?.candidate;
  if (!descriptor?.candidateId || !descriptor.relativeDirectory || !descriptor.scriptHash || !descriptor.manifestHash) {
    fail('I8_CANDIDATE_DESCRIPTOR_INVALID', '正式执行缺少冻结候选身份。', 'CONTRACT');
  }
  const credential = resolveCredential(task.execution?.credentialAlias, environment);
  const productRoot = path.resolve(options.productRoot || path.resolve(__dirname, '..', '..'));
  const runtimeProductRoot = path.resolve(options.runtimeProductRoot || path.resolve(__dirname, '..', '..'));
  const executablePath = environment.HENGZHUN_CHROMIUM_EXECUTABLE
    || path.join(runtimeProductRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  if (!fs.existsSync(executablePath)) fail('CHROMIUM_UNAVAILABLE', '固定 Chromium 不可用。');
  const baseUrl = (environment.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '') + '/';
  const allowedOrigins = new Set([new URL(baseUrl).origin, 'http://127.0.0.1:18443', 'http://127.0.0.1:19000']);
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: false
  });
  const page = await context.newPage();
  let screenshot = EMPTY_SCREENSHOT;
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || allowedOrigins.has(url.origin)) return route.continue();
      return route.abort('blockedbyclient');
    });
    const result = await executeCandidatePackage({ productRoot, ...descriptor }, {
      baseUrl,
      page,
      fixtures: { 'LOGIN_PROFILE.USERNAME': credential.username, 'LOGIN_PROFILE.PASSWORD': credential.password },
      capture: async (_name, currentPage) => {
        screenshot = await currentPage.screenshot({
          fullPage: true,
          mask: [
            currentPage.getByTestId('login-username'), currentPage.getByTestId('login-password'),
            currentPage.getByTestId('customer-profile-name'), currentPage.getByTestId('customer-profile-avatar'),
            currentPage.getByTestId('profile-display-name'), currentPage.getByTestId('profile-avatar'),
            currentPage.getByTestId('profile-customer-id'), currentPage.getByTestId('profile-email'), currentPage.getByTestId('profile-phone')
          ],
          maskColor: '#202020'
        });
      }
    });
    const facts = Array.isArray(result.facts) ? result.facts.map(item => ({ stepId: item.stepId, operation: item.operation, passed: item.passed })) : [];
    const passed = result.outcome === 'PASSED' && facts.length > 0 && facts.every(item => item.passed === true);
    const report = {
      schemaVersion: 'i8-formal-run-report-v1', runId: task.runId, taskId: task.taskId,
      caseId: task.caseId, caseVersion: task.caseVersion, candidateId: descriptor.candidateId,
      scriptHash: descriptor.scriptHash, manifestHash: descriptor.manifestHash,
      freshBrowserContext: true, deterministicPlaywrightOnly: true,
      assertionSetHash: sha256(JSON.stringify(facts)), assertions: facts, passed
    };
    const evidence = [
      artifact('REPORT', 'application/json', 'REDACTED', 'json', JSON.stringify(report, null, 2), { schemaVersion: report.schemaVersion, passed }),
      artifact('SCREENSHOT', 'image/png', 'REDACTED', 'png', screenshot, { masked: true }),
      artifact('LOG', 'text/plain; charset=utf-8', 'REDACTED', 'log', `${facts.map(item => `${item.passed ? 'PASS' : 'FAIL'} ${item.stepId} ${item.operation}`).join('\n')}\n`, { containsCredentials: false })
    ];
    return passed
      ? { outcome: 'PASSED', summary: '已激活脚本通过纯 Playwright 正式回归。', evidence }
      : { outcome: 'FAILED', summary: '已激活脚本正式回归断言失败。', errorCode: 'I8_FORMAL_ASSERTION_FAILED', errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: false, evidence };
  } catch (error) {
    const errorMessage = String(error?.message || '');
    const locatorFailure = LOCATOR_ERROR_CODES.find(([needle]) => errorMessage.includes(needle));
    if (locatorFailure && (!error.code || error.name === 'TimeoutError')) {
      error.code = locatorFailure[1];
      error.category = 'TEST_FAILURE';
    }
    const diagnostic = { schemaVersion: 'i8-formal-diagnostic-v1', taskId: task.taskId, runId: task.runId, candidateId: descriptor.candidateId, errorCode: error.code || 'I8_FORMAL_EXECUTION_FAILED' };
    error.evidence = [
      artifact('DIAGNOSTIC', 'application/json', 'REDACTED', 'json', JSON.stringify(diagnostic, null, 2), { containsCredentials: false }),
      artifact('SCREENSHOT', 'image/png', 'REDACTED', 'png', await page.screenshot({ fullPage: true, mask: [page.getByTestId('login-username'), page.getByTestId('login-password')], maskColor: '#202020' }).catch(() => EMPTY_SCREENSHOT), { masked: true })
    ];
    if (!error.category) error.category = error.name === 'TimeoutError' ? 'ENVIRONMENT' : 'TEST_FAILURE';
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { executeI8FormalRun };
