'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')

test('neutral acceptance fixtures expose their own post-login navigation and no Fuxing route', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'i10-stage8-controlled-portal.cjs'), 'utf8')
  for (const [prefix, login, dashboard, destination, entry] of [
    ['neutral-a', '/neutral-a/sign-in', '/neutral-a/dashboard', '/neutral-a/work-items', 'approval-workbench-entry'],
    ['neutral-b', '/neutral-b/login', '/neutral-b/dashboard', '/neutral-b/assets', 'asset-overview-entry']
  ]) {
    const block = source.slice(source.indexOf(`if (route === '${login}')`), source.indexOf(`if (route === '${destination}')`))
    assert.ok(block.includes(`successRoute: '${dashboard}'`), `${prefix} login must lead to its own neutral dashboard`)
    assert.ok(block.includes(`href=\"${destination}\"`), `${prefix} dashboard must expose a real navigation control`)
    assert.ok(block.includes(`data-testid=\"${entry}\"`), `${prefix} navigation control must be independently locatable`)
    assert.doesNotMatch(block, /\/portal\//, `${prefix} must not use a Fuxing portal route`)
  }
})

test('L2 neutral fixture runs keep per-target evidence and describe a real navigation action', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'i10-l2-generic-screenshot-live.cjs'), 'utf8')
  assert.match(source, /l2-generic-screenshot\$\{neutralFixtureName/)
  assert.match(source, /点击页面上的“进入工作台”入口/)
  assert.match(source, /neutralFixture: fixtureName/)
})

test('unregistered fixture is isolated and its live driver stops before authoring', () => {
  const fixture = fs.readFileSync(path.join(root, 'scripts', 'i10-stage8-controlled-portal.cjs'), 'utf8')
  const driver = fs.readFileSync(path.join(root, 'scripts', 'i10-gz05-unregistered-target-live.cjs'), 'utf8')
  const block = fixture.slice(fixture.indexOf("if (route === '/neutral-unregistered/sign-in')"), fixture.indexOf("if (route === '/portal/login')"))
  assert.match(block, /Atlas 工单台/)
  assert.doesNotMatch(block, /\/portal\//)
  assert.match(driver, /humanInputAgentflow_i10_v4_target_profile_confirm/)
  assert.match(driver, /PENDING_CONFIRMATION/)
  assert.match(driver, /I10_GZ05_AUTHORING_DISPATCHED_BEFORE_TARGET_CONFIRMATION/)
})

test('controlled I10 acceptance portal exposes every L1-H3 destination and a webpage U-key confirmation', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'i10-stage8-controlled-portal.cjs'), 'utf8')
  for (const [route, testId, visibleLabel] of [
    ['/portal/accounts', 'accounts-entry', '账户页面'],
    ['/portal/messages', 'messages-entry', '消息页面'],
    ['/portal/transactions', 'transactions-entry', '账户明细'],
    ['/portal/recipients', 'recipients-entry', '收款人页面'],
    ['/portal/documents', 'documents-entry', '文档页面'],
    ['/portal/transfers', 'transfer-entry', '转账'],
    ['/portal/profile', 'profile-link', '个人资料']
  ]) {
    assert.match(source, new RegExp(`href=\\"${route.replaceAll('/', '\\/')}\\"`))
    assert.match(source, new RegExp(`data-testid=\\"${testId}\\"`))
    assert.match(source, new RegExp(visibleLabel))
  }
  assert.match(source, /data-testid="ukey-verify-control"/)
  assert.match(source, /data-testid="transfer-list-new"/)
  assert.match(source, /\/portal\/transfers\/new/)
  assert.match(source, /data-testid="transfer-submit"/)
  assert.match(source, /data-testid="transfer-review"/)
  assert.match(source, /data-testid="login-error" role="alert"/)
  assert.match(source, /不收集PIN、验证码或口令/)
  assert.match(source, /location\.href='\/portal\/orders\/query'/)
  assert.match(source, /data-testid="account-card-heading">账户卡片/)
  assert.match(source, /账户卡片、余额和账户状态正常显示/)
})
