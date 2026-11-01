'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const client = () => import(pathToFileURL(path.resolve(__dirname, '../../../../scripts/test/rf057/release-client.mjs')))

test('release command registers reports then returns the single Harness verdict', async () => {
  const {verifyRegisteredReports} = await client()
  const calls = []
  const verdict = {decision:'NO_GO', verificationPerformed:true, required:28, passed:1}
  const result = await verifyRegisteredReports(['agent/runs/report-a.json'], async (route, body) => {
    calls.push({route, body})
    return route.endsWith(':verify') ? verdict : {status:'REGISTERED'}
  })
  assert.equal(result, verdict)
  assert.deepEqual(calls, [
    {route:'/v1/releases/reports:register', body:{reportPath:'agent/runs/report-a.json'}},
    {route:'/v1/releases:verify', body:{}}
  ])
})

test('release command never fabricates verification after registration failure or invalid response', async () => {
  const {verifyRegisteredReports} = await client()
  let calls = 0
  await assert.rejects(verifyRegisteredReports(['report'], async () => {
    calls++; throw new Error('immutable report changed')
  }), /immutable report changed/)
  assert.equal(calls, 1)
  await assert.rejects(verifyRegisteredReports([], async () => ({decision:'GO', verificationPerformed:false})),
    /RELEASE_VERIFICATION_RESPONSE_INVALID/)
})
