#!/usr/bin/env node
'use strict'

const http = require('node:http')
const port = Number(process.env.HENGZHUN_I10_STAGE8_PORT || 28884)
const fixtureUsername = process.env.I10_STAGE8_FIXTURE_USERNAME
const fixturePassword = process.env.I10_STAGE8_FIXTURE_PASSWORD
if (!fixtureUsername || !fixturePassword) {
  process.stderr.write('I10_STAGE8_FIXTURE_CREDENTIALS_MISSING\n')
  process.exit(2)
}
let locatorChanged = false

const html = body => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>复兴银行门户验收夹具</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#171a21;font:16px/1.5 system-ui,"Microsoft YaHei",sans-serif}.portal-header{height:72px;background:#fff;border-bottom:1px solid #dfe3ea;display:flex;align-items:center;padding:0 48px}.brand{font-size:22px;font-weight:700;color:#c9151e}.user-area{margin-left:auto;display:flex;align-items:center;gap:16px}.avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#eef1f5;color:#596273}.avatar-small{width:40px;height:40px}.avatar-large{width:112px;height:112px;font-size:36px}.display-name{display:inline-block;font-weight:700;min-width:40px}.profile-link{color:#c9151e;text-decoration:none;border-left:1px solid #dfe3ea;padding-left:16px}.page{min-height:calc(100vh - 72px);display:grid;place-items:center;padding:40px}.login-card,.profile-card{background:#fff;border:1px solid #dfe3ea;border-radius:10px;box-shadow:0 12px 36px rgba(28,37,54,.1)}.login-card{width:480px;padding:36px}.login-card h1{margin:0 0 28px;font-size:28px}.field{display:block;margin:18px 0;font-weight:600}.field input{display:block;width:100%;height:48px;margin-top:8px;border:1px solid #aeb7c6;border-radius:6px;padding:0 14px;font:inherit}.primary{width:100%;height:50px;margin-top:14px;border:0;border-radius:6px;background:#d71920;color:#fff;font-size:18px;font-weight:700}.profile-card{width:720px;padding:40px;display:flex;align-items:center;gap:42px}.profile-details{display:grid;grid-template-columns:110px 1fr;gap:18px 24px}.label{color:#6a7383}.value{font-weight:700}
</style><body>${body}</body></html>`
const server = http.createServer((request, response) => {
  const route = new URL(request.url, `http://127.0.0.1:${port}`).pathname
  if (route.startsWith('/__')) response.setHeader('content-type', 'application/json; charset=utf-8')
  else response.setHeader('content-type', 'text/html; charset=utf-8')
  if (route === '/__health') return response.end(JSON.stringify({ status: 'ok', locatorChanged }))
  if (route === '/__mode/changed' && request.method === 'POST') {
    locatorChanged = true
    return response.end(JSON.stringify({ status: 'changed' }))
  }
  if (route === '/__mode/recovered' && request.method === 'POST') {
    locatorChanged = false
    return response.end(JSON.stringify({ status: 'recovered' }))
  }
  if (route === '/portal/login') {
    const username = locatorChanged
      ? '<label class="field">用户名 / 手机号<input id="username" name="username"></label>'
      : '<label class="field">用户名 / 手机号<input id="username" name="username" data-testid="login-username"></label>'
    const encodedUser = JSON.stringify(fixtureUsername)
    const encodedPassword = JSON.stringify(fixturePassword)
    return response.end(html(`<header class="portal-header"><span class="brand">复兴银行门户</span></header><main class="page"><section class="login-card"><h1>账号密码登录</h1>${username}<label class="field">密码<input data-testid="login-password" type="password"></label><button class="primary" data-testid="login-submit">账号密码登录</button><div data-testid="login-error"></div></section></main><script>document.querySelector('button').onclick=()=>{if(document.querySelector('[name=username]').value===${encodedUser}&&document.querySelector('[data-testid=login-password]').value===${encodedPassword}){location.href='/portal/dashboard'}else{document.querySelector('[data-testid=login-error]').textContent='账号或密码错误'}}</script>`))
  }
  const header = '<header class="portal-header"><span class="brand">复兴银行门户</span><div class="user-area"><span class="avatar avatar-small" data-testid="customer-profile-avatar">张</span><span class="display-name" data-testid="customer-profile-name">张三</span><a class="profile-link" data-testid="profile-link" href="/portal/profile">个人资料</a></div></header>'
  if (route === '/portal/dashboard') return response.end(html(`${header}<main class="page"><section class="profile-card"><h1>欢迎登录复兴银行门户</h1></section></main>`))
  if (route === '/portal/profile') return response.end(html(`${header}<main class="page"><section class="profile-card"><span class="avatar avatar-large" data-testid="profile-avatar">张</span><div class="profile-details"><span class="label">客户姓名</span><span class="value" data-testid="profile-display-name">张三</span><span class="label">客户编号</span><span class="value" data-testid="profile-customer-id">masked</span></div></section></main>`))
  response.statusCode = 404
  response.end(html('not found'))
})

server.listen(port, '127.0.0.1', () => process.stdout.write(`HENGZHUN_I10_STAGE8_PORTAL_READY:${port}\n`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
