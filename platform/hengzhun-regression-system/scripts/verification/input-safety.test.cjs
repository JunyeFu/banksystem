'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { evaluateInputSafety, flowiseSecretGuardSource } = require('../i10-input-safety.cjs')

test('empty input is stopped before controller processing', () => {
  assert.deepEqual(evaluateInputSafety('   '), {
    status: 'EMPTY_HELP',
    safe: false,
    errorCode: 'I10_INPUT_REQUIRED'
  })
})

const secretLikeSamples = [
  '账号: customer01 密码: example-password',
  '验证码：123456',
  ['Authorization:', 'Bearer', 'exampleexampleexampleexample'].join(' '),
  ['API key', ['s', 'k'].join('') + '-exampleexampleexample'].join(' ')
]

for (const value of secretLikeSamples) {
  test(`secret-like input is blocked without echoing it: ${value.slice(0, 8)}`, () => {
    const result = evaluateInputSafety(value)
    assert.equal(result.status, 'SECRET_BLOCKED')
    assert.equal(result.safe, false)
    assert.equal(JSON.stringify(result).includes(value), false)
  })
}

test('Flowise guard accepts only the governed attachment-only sandbox marker as non-empty input', () => {
  const source = flowiseSecretGuardSource()
  assert.match(source, /\$input/)
  assert.match(source, /I10_ATTACHMENT_ONLY_INPUT/)
  assert.doesNotMatch(source, /fetch|axios|https?:\/\//i)
})

for (const value of [
  '账号密码已经通过本机安全页面保存，请使用当前credentialRef。',
  '测试到验证码步骤时暂停并提醒我在被测页面输入。',
  '验证复兴银行门户登录后姓名与头像一致。',
  'http://127.0.0.1:18082/portal/login'
]) {
  test(`non-secret business description is allowed: ${value.slice(0, 10)}`, () => {
    assert.deepEqual(evaluateInputSafety(value), {status:'SAFE',safe:true,errorCode:''})
  })
}
