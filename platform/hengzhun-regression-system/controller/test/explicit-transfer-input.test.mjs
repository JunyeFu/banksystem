import test from 'node:test'
import assert from 'node:assert/strict'
import { createJourneyCandidateAuthor, assertSafeAgentText } from '../src/journey-author.mjs'
const payee = '11111111-1111-4111-8111-111111111111'
const input = { targetSystem: '合成银行', entryUrl: 'http://bank.invalid/', credentialRef: 'credential_12345678-1234-4234-8234-123456789abc' }
const transfer = { payerAccountId: '3', payeeRef: payee, amount: '100.00', currency: 'CNY', purpose: '回归验证' }
const draft = values => ({ title: '转账', objective: '验证', summary: '验证', preconditions: [],
  steps: [{ action: '转账', expected: '成功' }], assertions: ['成功'], confidence: 1, businessInputs: { transfer: values } })
const author = values => createJourneyCandidateAuthor({ invokeJson: async () => JSON.stringify(draft(values)) })
test('labelled business values reject unrelated balance, account and beneficiary', async () => {
  const goal = `付款账户3，余额900.00 CNY，收款人${payee}，转账100.00 CNY，用途：回归验证。历史金额800.00。`
  for (const changed of [{ amount: '900.00' }, { payerAccountId: '1' }, { payeeRef: '22222222-2222-4222-8222-222222222222' }]) {
    await assert.rejects(author({ ...transfer, ...changed }).author({ ...input, goal }), { code: 'JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT' })
  }
  assert.equal((await author(transfer).author({ ...input, goal })).businessInputs.values.amount, '100.00')
})
test('equal decimal values are accepted; conflicting labels require input without executable money values', async () => {
  const goal = `付款账户3，收款人${payee}，转账100 CNY，用途：回归验证。`
  assert.equal((await author(transfer).author({ ...input, goal })).missingFields.length, 0)
  for (const suffix of ['另有付款账户4', `另有收款人22222222-2222-4222-8222-222222222222`, '另有转账200 CNY']) {
    const value = await author(transfer).author({ ...input, goal: `${goal}${suffix}` })
    assert.ok(value.missingFields.length)
    assert.equal(value.businessInputs?.values?.amount, undefined)
  }
})
test('explicit secrets are rejected, normal password-policy goals and safe credential references are not', () => {
  for (const text of ['密码：SYNTHETIC', 'Authorization: Bearer synthetic', 'api_key=synthetic']) assert.throws(() => assertSafeAgentText(text), { code: 'AGENT_SECRET_FORBIDDEN' })
  assertSafeAgentText('检查密码策略，通过安全凭据登录', input.credentialRef)
})
