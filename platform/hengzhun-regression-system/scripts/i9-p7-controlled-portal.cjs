#!/usr/bin/env node
'use strict'

const http = require('node:http')
const port = Number(process.env.HENGZHUN_I9_P7_PORT || 28883)
let changed = false

const html = body => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body>${body}</body></html>`
const server = http.createServer((request, response) => {
  const route = new URL(request.url, `http://127.0.0.1:${port}`).pathname
  response.setHeader('content-type', route.startsWith('/__') ? 'application/json' : 'text/html; charset=utf-8')
  if (route === '/__health') return response.end(JSON.stringify({ status: 'ok', changed }))
  if (route === '/__mode/changed' && request.method === 'POST') {
    changed = true
    return response.end(JSON.stringify({ status: 'changed' }))
  }
  if (route === '/portal/login') {
    const username = changed
      ? '<label>用户名 / 手机号<input id="username" name="username"></label>'
      : '<label>用户名 / 手机号<input id="username" name="username" data-testid="login-username"></label>'
    return response.end(html(`${username}<label>密码<input data-testid="login-password" type="password"></label><button data-testid="login-submit">账号密码登录</button><div data-testid="login-error"></div><script>document.querySelector('button').onclick=()=>{if(document.querySelector('[name=username]').value==='synthetic-user'&&document.querySelector('[data-testid=login-password]').value==='synthetic-password'){location.href='/portal/dashboard'}else{document.querySelector('[data-testid=login-error]').textContent='账号或密码错误'}}</script>`))
  }
  if (route === '/portal/dashboard') return response.end(html('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><a href="/portal/profile">个人资料</a>'))
  if (route === '/portal/profile') return response.end(html('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><span data-testid="profile-display-name">张三</span><span data-testid="profile-avatar">张</span><span data-testid="profile-customer-id">masked</span><span data-testid="profile-email">masked@example.invalid</span><span data-testid="profile-phone">000</span>'))
  response.statusCode = 404
  response.end(html('not found'))
})

server.listen(port, '127.0.0.1', () => process.stdout.write(`I9_P7_CONTROLLED_PORTAL_READY:${port}\n`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
