#!/usr/bin/env node
'use strict'

const http = require('node:http')
const port = Number(process.env.HENGZHUN_I10_STAGE8_PORT || 28884)
const fixtureUsername = process.env.I10_STAGE8_FIXTURE_USERNAME
const fixturePassword = process.env.I10_STAGE8_FIXTURE_PASSWORD
const portalBrand = String(process.env.I10_STAGE8_PORTAL_BRAND || '复兴银行门户').trim() || '复兴银行门户'
if (!fixtureUsername || !fixturePassword) {
  process.stderr.write('I10_STAGE8_FIXTURE_CREDENTIALS_MISSING\n')
  process.exit(2)
}
let locatorChanged = false
let verificationMode = false
let verificationCompleted = false
let transferFirstConfirmCount = 0
const transferConfirmCountByExecution = new Map()
const transferOrderNumber = 'HZ202607240001'

const html = body => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>复兴银行门户验收夹具</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#171a21;font:16px/1.5 system-ui,"Microsoft YaHei",sans-serif}.portal-header{height:72px;background:#fff;border-bottom:1px solid #dfe3ea;display:flex;align-items:center;padding:0 48px}.brand{font-size:22px;font-weight:700;color:#c9151e}.user-area{margin-left:auto;display:flex;align-items:center;gap:16px}.avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#eef1f5;color:#596273}.avatar-small{width:40px;height:40px}.avatar-large{width:112px;height:112px;font-size:36px}.display-name{display:inline-block;font-weight:700;min-width:40px}.profile-link{color:#c9151e;text-decoration:none;border-left:1px solid #dfe3ea;padding-left:16px}.page{min-height:calc(100vh - 72px);display:grid;place-items:center;padding:40px}.login-card,.profile-card{background:#fff;border:1px solid #dfe3ea;border-radius:10px;box-shadow:0 12px 36px rgba(28,37,54,.1)}.login-card{width:480px;padding:36px}.login-card h1{margin:0 0 28px;font-size:28px}.field{display:block;margin:18px 0;font-weight:600}.field input{display:block;width:100%;height:48px;margin-top:8px;border:1px solid #aeb7c6;border-radius:6px;padding:0 14px;font:inherit}.primary{width:100%;height:50px;margin-top:14px;border:0;border-radius:6px;background:#d71920;color:#fff;font-size:18px;font-weight:700}.profile-card{width:720px;padding:40px;display:flex;align-items:center;gap:42px}.profile-details{display:grid;grid-template-columns:110px 1fr;gap:18px 24px}.label{color:#6a7383}.value{font-weight:700}
</style><body>${body}</body></html>`
const server = http.createServer((request, response) => {
  const route = new URL(request.url, `http://127.0.0.1:${port}`).pathname
  if (route.startsWith('/__')) response.setHeader('content-type', 'application/json; charset=utf-8')
  else response.setHeader('content-type', 'text/html; charset=utf-8')
  if (route === '/__health') return response.end(JSON.stringify({
    status: 'ok',
    locatorChanged,
    verificationMode,
    verificationCompleted,
    transferFirstConfirmCount,
    transferConfirmCountByExecution: Object.fromEntries(transferConfirmCountByExecution)
  }))
  if (route === '/__mode/changed' && request.method === 'POST') {
    locatorChanged = true
    return response.end(JSON.stringify({ status: 'changed' }))
  }
  if (route === '/__mode/recovered' && request.method === 'POST') {
    locatorChanged = false
    return response.end(JSON.stringify({ status: 'recovered' }))
  }
  if (route === '/__mode/verification' && request.method === 'POST') {
    verificationMode = true
    verificationCompleted = false
    transferFirstConfirmCount = 0
    transferConfirmCountByExecution.clear()
    return response.end(JSON.stringify({ status: 'verification-required' }))
  }
  if (route === '/__mode/standard' && request.method === 'POST') {
    verificationMode = false
    verificationCompleted = false
    return response.end(JSON.stringify({ status: 'standard' }))
  }
  if (route === '/__verification/status') {
    return response.end(JSON.stringify({ completed: verificationCompleted }))
  }
  if (route === '/__verification/complete' && request.method === 'POST') {
    verificationCompleted = true
    return response.end(JSON.stringify({ status: 'completed' }))
  }
  if (route === '/__transfer/confirm' && request.method === 'POST') {
    const executionId = String(request.headers['x-hengzhun-execution-id'] || '').trim()
    if (!/^execution-[a-z0-9-]{8,80}$/i.test(executionId)) {
      response.statusCode = 400
      return response.end(JSON.stringify({ status: 'rejected', errorCode: 'EXECUTION_ID_REQUIRED' }))
    }
    transferFirstConfirmCount += 1
    transferConfirmCountByExecution.set(executionId, (transferConfirmCountByExecution.get(executionId) || 0) + 1)
    return response.end(JSON.stringify({
      status: 'accepted',
      nextRoute: verificationMode && !verificationCompleted ? '/portal/verification' : '/portal/orders/query'
    }))
  }
  const neutralLogin = ({ brand, heading, usernameId, passwordId, submitId, successRoute }) => {
    const encodedUser = JSON.stringify(fixtureUsername)
    const encodedPassword = JSON.stringify(fixturePassword)
    return html(`<header class="portal-header"><span class="brand">${brand}</span></header><main class="page"><section class="login-card"><h1>${heading}</h1><label class="field">工号<input id="${usernameId}" data-testid="${usernameId}"></label><label class="field">访问口令<input id="${passwordId}" data-testid="${passwordId}" type="password"></label><button class="primary" data-testid="${submitId}">进入工作台</button><div data-testid="neutral-login-error"></div></section></main><script>document.querySelector('[data-testid=${submitId}]').onclick=()=>{if(document.querySelector('[data-testid=${usernameId}]').value===${encodedUser}&&document.querySelector('[data-testid=${passwordId}]').value===${encodedPassword})location.href=${JSON.stringify(successRoute)};else document.querySelector('[data-testid=neutral-login-error]').textContent='身份校验失败'}</script>`)
  }
  if (route === '/neutral-a/sign-in') return response.end(neutralLogin({ brand: 'Nova 审批中心', heading: '统一登录', usernameId: 'approval-user', passwordId: 'approval-password', submitId: 'approval-submit', successRoute: '/neutral-a/dashboard' }))
  if (route === '/neutral-a/dashboard') return response.end(html(`<header class="portal-header"><span class="brand">Nova 审批中心</span><div class="user-area"><span data-testid="approval-user-name">测试专员</span></div></header><main class="page"><section class="profile-card"><div class="profile-details"><span class="label">工作台</span><a class="profile-link" data-testid="approval-workbench-entry" href="/neutral-a/work-items">进入工作台</a></div></section></main>`))
  if (route === '/neutral-a/work-items') return response.end(html(`<header class="portal-header"><span class="brand">Nova 审批中心</span><div class="user-area"><span data-testid="approval-user-name">测试专员</span></div></header><main class="page"><section class="profile-card" data-testid="approval-workbench"><div class="profile-details"><span class="label">页面标题</span><span class="value" data-testid="approval-title">待办审批</span><span class="label">待处理数量</span><span class="value" data-testid="approval-pending-count">3</span><span class="label">服务状态</span><span class="value" data-testid="approval-service-status">运行正常</span></div></section></main>`))
  if (route === '/neutral-b/login') return response.end(neutralLogin({ brand: 'Orion 资产服务', heading: '资产服务登录', usernameId: 'asset-user', passwordId: 'asset-password', submitId: 'asset-submit', successRoute: '/neutral-b/dashboard' }))
  if (route === '/neutral-b/dashboard') return response.end(html(`<header class="portal-header"><span class="brand">Orion 资产服务</span><div class="user-area"><span data-testid="asset-user-name">测试专员</span></div></header><main class="page"><section class="profile-card"><div class="profile-details"><span class="label">资产工作区</span><a class="profile-link" data-testid="asset-overview-entry" href="/neutral-b/assets">进入资产总览</a></div></section></main>`))
  if (route === '/neutral-b/assets') return response.end(html(`<header class="portal-header"><span class="brand">Orion 资产服务</span><div class="user-area"><span data-testid="asset-user-name">测试专员</span></div></header><main class="page"><section class="profile-card" data-testid="asset-workbench"><div class="profile-details"><span class="label">页面标题</span><span class="value" data-testid="asset-title">资产总览</span><span class="label">设备状态</span><span class="value" data-testid="asset-status">在用</span><span class="label">资产数量</span><span class="value" data-testid="asset-count">18</span></div></section></main>`))
  // This route intentionally has no pre-registered target profile. It is a
  // live fail-closed acceptance fixture: Flowise must stop at TargetProfile
  // confirmation instead of selecting a controlled adapter or dispatching
  // authoring merely because the site is locally reachable.
  if (route === '/neutral-unregistered/sign-in') return response.end(neutralLogin({ brand: 'Atlas 工单台', heading: '工单台登录', usernameId: 'ticket-user', passwordId: 'ticket-password', submitId: 'ticket-submit', successRoute: '/neutral-unregistered/home' }))
  if (route === '/neutral-unregistered/home') return response.end(html(`<header class="portal-header"><span class="brand">Atlas 工单台</span></header><main class="page"><section class="profile-card"><div class="profile-details"><span class="label">当前状态</span><span class="value" data-testid="ticket-home-status">待配置</span></div></section></main>`))
  if (route === '/portal/login') {
    const username = locatorChanged
      ? '<label class="field">用户名 / 手机号<input id="username" name="username"></label>'
      : '<label class="field">用户名 / 手机号<input id="username" name="username" data-testid="login-username"></label>'
    const encodedUser = JSON.stringify(fixtureUsername)
    const encodedPassword = JSON.stringify(fixturePassword)
    const successRoute = '/portal/dashboard'
    return response.end(html(`<header class="portal-header"><span class="brand">${portalBrand}</span></header><main class="page"><section class="login-card"><h1>账号密码登录</h1>${username}<label class="field">密码<input data-testid="login-password" type="password"></label><button class="primary" data-testid="login-submit">账号密码登录</button><div data-testid="login-error" role="alert"></div></section></main><script>if(!sessionStorage.getItem('hengzhunExecutionId'))sessionStorage.setItem('hengzhunExecutionId','execution-'+crypto.randomUUID());document.querySelector('button').onclick=()=>{if(document.querySelector('[name=username]').value===${encodedUser}&&document.querySelector('[data-testid=login-password]').value===${encodedPassword}){location.href=${JSON.stringify(successRoute)}}else{document.querySelector('[data-testid=login-error]').textContent='账号或密码错误'}}</script>`))
  }
  // Keep the controlled fixture user-visible and task-complete.  These are
  // isolated acceptance routes, not inferred production adapters: every
  // label deliberately corresponds to one of L1-H3's public case intents so
  // Midscene must still observe a visible target before Playwright acts.
  // The controlled portal must implement the same route contract as the
  // frozen Fuxing demonstration adapter.  This prevents acceptance evidence
  // from depending on an obsolete one-page transfer fixture.
  const header = `<header class="portal-header"><span class="brand">${portalBrand}</span><div class="user-area"><a class="profile-link" data-testid="accounts-entry" href="/portal/accounts">账户页面</a><a class="profile-link" data-testid="messages-entry" href="/portal/messages">消息页面</a><a class="profile-link" data-testid="transactions-entry" href="/portal/transactions">账户明细</a><a class="profile-link" data-testid="recipients-entry" href="/portal/recipients">收款人页面</a><a class="profile-link" data-testid="documents-entry" href="/portal/documents">文档页面</a><a class="profile-link" data-testid="transfer-entry" href="/portal/transfers">转账</a><span class="avatar avatar-small" data-testid="customer-profile-avatar">张</span><span class="display-name" data-testid="customer-profile-name">张三</span><a class="profile-link" data-testid="profile-link" href="/portal/profile">个人资料</a></div></header>`
  if (route === '/portal/verification') {
    return response.end(html(`<header class="portal-header"><span class="brand">复兴银行门户</span></header><main class="page"><section class="login-card"><h1>网页U盾验证</h1><p>转账信息已完成第一次确认。此本地演示只模拟已持久化U盾的网页确认，不收集PIN、验证码或口令。</p><p data-testid="verification-status">等待U盾确认完成</p><button class="primary" data-testid="ukey-verify-control">确认U盾验证</button></section></main><script>const complete=async()=>{await fetch('/__verification/complete',{method:'POST'});location.href='/portal/orders/query'};document.querySelector('[data-testid=ukey-verify-control]').onclick=complete;const timer=setInterval(async()=>{const state=await fetch('/__verification/status').then(r=>r.json());if(state.completed){clearInterval(timer);location.href='/portal/orders/query'}},300)</script>`))
  }
  if (route === '/portal/dashboard') return response.end(html(`${header}<main class="page"><section class="profile-card"><h1>欢迎登录复兴银行门户</h1></section></main>`))
  if (route === '/portal/accounts') return response.end(html(`${header}<main class="page"><section class="profile-card" data-testid="account-overview"><span class="avatar avatar-large">账</span><div class="profile-details"><h1 data-testid="account-card-heading">账户卡片</h1><span class="label">账户概览</span><span class="value" data-testid="account-overview-title">我的账户</span><span class="label">账户状态</span><span class="value" data-testid="account-status">正常</span><span class="label">余额</span><span class="value" data-testid="account-available-balance">12,345.67</span><p class="label" data-testid="account-overview-summary">账户卡片、余额和账户状态正常显示</p></div></section></main>`))
  if (route === '/portal/messages') return response.end(html(`${header}<main class="page"><section class="profile-card" data-testid="message-list"><div class="profile-details"><span class="label">消息列表</span><span class="value" data-testid="message-list-title">系统消息</span><span class="label">未读标识</span><span class="value" data-testid="message-unread">未读 1 条</span><span class="label">消息摘要</span><span class="value" data-testid="message-summary">账户变动通知</span></div></section></main>`))
  if (route === '/portal/transactions') return response.end(html(`${header}<main class="page"><section class="profile-card" data-testid="transaction-list"><div class="profile-details"><label class="label">交易日期筛选<select data-testid="transaction-date-filter"><option>近期交易</option></select></label><span class="label">交易日期</span><span class="value" data-testid="transaction-date">2026-07-30</span><span class="label">交易金额</span><span class="value" data-testid="transaction-amount">1,200.00</span><span class="label">交易状态</span><span class="value" data-testid="transaction-status">已完成</span></div></section></main>`))
  if (route === '/portal/recipients') return response.end(html(`${header}<main class="page"><section class="profile-card" data-testid="recipient-list"><div class="profile-details"><label class="label">收款人筛选<input data-testid="recipient-filter" value="张"></label><span class="label">收款人姓名</span><span class="value" data-testid="recipient-name">张三</span><span class="label">账户掩码</span><span class="value" data-testid="recipient-masked-account">6222 **** **** 1234</span><span class="label">收款人状态</span><span class="value" data-testid="recipient-status">正常</span></div></section></main>`))
  if (route === '/portal/documents') return response.end(html(`${header}<main class="page"><section class="profile-card" data-testid="document-list"><div class="profile-details"><label class="label">文档查询<input data-testid="document-filter" value="对账单"></label><span class="label">文档标题</span><span class="value" data-testid="document-title">七月电子对账单</span><span class="label">文档日期</span><span class="value" data-testid="document-date">2026-07-30</span><span class="label">下载入口</span><a class="profile-link" data-testid="document-download" href="/portal/documents/download">下载文档</a></div></section></main>`))
  if (route === '/portal/documents/download') return response.end('演示文档下载完成')
  if (route === '/portal/profile') return response.end(html(`${header}<main class="page"><section class="profile-card"><span class="avatar avatar-large" data-testid="profile-avatar">张</span><div class="profile-details"><span class="label">客户姓名</span><span class="value" data-testid="profile-display-name">张三</span><span class="label">客户编号</span><span class="value" data-testid="profile-customer-id">masked</span></div></section></main>`))
  if (route === '/portal/transfers') return response.end(html(`${header}<main class="page"><section class="profile-card" data-testid="transfer-list"><div class="profile-details"><h1>转账管理</h1><span class="label">转账列表</span><span class="value">本地演示记录</span><a class="primary" data-testid="transfer-list-new" href="/portal/transfers/new">新增转账</a></div></section></main>`))
  if (route === '/portal/transfers/new' || route === '/portal/transfer') return response.end(html(`${header}<main class="page"><section class="login-card" data-testid="transfer-form"><h1>新增转账</h1><label class="field">转账金额<input data-testid="transfer-amount"></label><label class="field">转账用途<input data-testid="transfer-description"></label><button class="primary" data-testid="transfer-submit">提交转账信息</button><section data-testid="transfer-review" hidden><h2>转账摘要</h2><p>请核对转账金额和用途后进行首次确认。</p><button class="primary" data-testid="transfer-first-confirm">确认转账信息</button></section></section></main><script>const review=document.querySelector('[data-testid=transfer-review]');document.querySelector('[data-testid=transfer-submit]').onclick=()=>{review.hidden=false};document.querySelector('[data-testid=transfer-first-confirm]').onclick=async()=>{const result=await fetch('/__transfer/confirm',{method:'POST',headers:{'x-hengzhun-execution-id':sessionStorage.getItem('hengzhunExecutionId')||''}}).then(r=>r.json());if(result.nextRoute)location.href=result.nextRoute}</script>`))
  if (route === '/portal/orders/query') return response.end(html(`${header}<main class="page"><section class="profile-card"><div class="profile-details"><span class="label">转账单号</span><span class="value" data-testid="transfer-order-number">${transferOrderNumber}</span><span class="label">受理状态</span><span class="value" data-testid="transfer-order-status">受理成功</span></div></section></main>`))
  response.statusCode = 404
  response.end(html('not found'))
})

server.listen(port, '127.0.0.1', () => process.stdout.write(`HENGZHUN_I10_STAGE8_PORTAL_READY:${port}\n`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
