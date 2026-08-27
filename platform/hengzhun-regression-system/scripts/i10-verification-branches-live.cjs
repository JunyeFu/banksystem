#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { currentReleaseIdentity, sameReleaseIdentity } = require('./i10-release-identity.cjs')
const { policyForAction, resolveVerificationAfterAction } = require('../worker/src/i10-verification-policy.cjs')

const root = path.resolve(__dirname, '..')
const runtimeRequire = createRequire(path.join(root, 'runtime/node_modules/_hengzhun_loader.cjs'))
const outputPath = path.join(root, '.data/evidence/i10/verification-branches/result.json')
const portalBase = process.env.HENGZHUN_I10_STAGE8_PORTAL_URL || 'http://127.0.0.1:28884'
const binding = Object.freeze({ adapterId: 'fuxing-bank-demo', adapterVersion: '1.0.0' })

function fail(code) { throw Object.assign(new Error(code), { code }) }
async function setMode(mode) {
  const response = await fetch(`${portalBase}/__mode/${mode}`, { method: 'POST', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) fail(`I10_VERIFICATION_BRANCH_MODE_FAILED:${mode}`)
}
async function completeVerification() {
  const response = await fetch(`${portalBase}/__verification/complete`, { method: 'POST', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) fail('I10_VERIFICATION_BRANCH_HANDOFF_COMPLETE_FAILED')
}
function policy() {
  return policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', binding)
}
function handlers(page, { handoff = false } = {}) {
  return {
    observeControl: async () => {
      const locator = page.getByTestId('ukey-verify-control')
      if (!await locator.isVisible().catch(() => false)) fail('I10_UKEY_WEB_CONTROL_NOT_FOUND')
      return { locator }
    },
    executeControl: async observation => { await observation.locator.click(); return { kind: 'TEST_ID', value: 'ukey-verify-control' } },
    pageFingerprint: async () => new URL(page.url()).pathname,
    assertSuccessEvidence: async () => page.getByTestId('transfer-order-number').waitFor({ state: 'visible', timeout: 10_000 }),
    allowExternalFallback: handoff,
    onExternalChallenge: handoff ? async ({ attempts }) => {
      if (!Array.isArray(attempts) || attempts.length !== 3) fail('I10_VERIFICATION_BRANCH_HANDOFF_ATTEMPTS_INVALID')
      await completeVerification()
      return { status: 'VERIFICATION_CONFIRMED' }
    } : undefined
  }
}
async function main() {
  const frozen = currentReleaseIdentity()
  const { chromium } = runtimeRequire('playwright')
  const executablePath = process.env.HENGZHUN_CHROMIUM_EXECUTABLE || path.join(root, 'runtime/browsers/chromium-1217/chrome-win64/chrome.exe')
  const browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  try {
    await setMode('standard')
    await page.goto(`${portalBase}/portal/orders/query`)
    const direct = await resolveVerificationAfterAction(page, policy(), handlers(page))
    await setMode('verification')
    await page.goto(`${portalBase}/portal/verification`)
    const web = await resolveVerificationAfterAction(page, policy(), handlers(page))
    await setMode('verification-handoff')
    await page.goto(`${portalBase}/portal/verification`)
    const visible = await resolveVerificationAfterAction(page, policy(), handlers(page, { handoff: true }))
    if (!sameReleaseIdentity(frozen, currentReleaseIdentity())) fail('I10_VERIFICATION_BRANCH_RELEASE_IDENTITY_CHANGED_DURING_RUN')
    const evidence = {
      schemaVersion: 'hengzhun-i10-verification-branches-live-v1', mock: false, degraded: false,
      releaseIdentity: frozen,
      branches: {
        directResult: direct.status === 'AUTO_PASSED',
        webConfirmation: web.status === 'WEB_CONTROL_CLICKED',
        visibleHandoff: visible.status === 'EXTERNAL_CONFIRMED_AFTER_AUTO_ATTEMPTS' && visible.attempts?.length === 3
      },
      completedAt: new Date().toISOString()
    }
    if (Object.values(evidence.branches).some(value => value !== true)) fail('I10_VERIFICATION_BRANCH_EVIDENCE_INCOMPLETE')
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } finally {
    await setMode('standard').catch(() => undefined)
    await browser.close()
  }
}

main().catch(error => { process.stderr.write(`${String(error.code || error.message)}\n`); process.exitCode = 2 })
