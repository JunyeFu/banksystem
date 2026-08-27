import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { EncryptedOperationStore } from '../src/operation-store.mjs'

const RELEASE = '6'.repeat(64)
const OPERATION = `operation-${'c'.repeat(32)}`

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-operation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = await new EncryptedOperationStore({ root, operationIdFactory: () => OPERATION, ...options }).initialize()
  return { root, store }
}

test('CurrentUser DPAPI operation roundtrip keeps namespace and proposal bytes out of envelope and index', async (t) => {
  const { root, store } = await fixture(t)
  await store.create({ namespace: 'sensitive-tenant', operationKind: 'CREDENTIAL_ENROLLMENT', releaseIdentityHash: RELEASE })
  await store.putProposalArguments(OPERATION, RELEASE, 'proposal-enrollment', { label: 'private-label', sessionRef: OPERATION })
  const payload = await store.load(OPERATION, { expectedReleaseIdentityHash: RELEASE, expectedKind: 'CREDENTIAL_ENROLLMENT' })
  assert.equal(payload.proposalArguments['proposal-enrollment'].label, 'private-label')
  const persisted = `${await readFile(path.join(root, `${OPERATION}.hzo`), 'utf8')}\n${await readFile(path.join(root, 'index-v1.json'), 'utf8')}`
  for (const forbidden of ['sensitive-tenant', 'private-label', 'proposal-enrollment']) assert.equal(persisted.includes(forbidden), false)
})

test('operation release and kind drift fail before decrypted state is returned', async (t) => {
  const { store } = await fixture(t)
  await store.create({ namespace: 'tenant', operationKind: 'CREDENTIAL_ENROLLMENT', releaseIdentityHash: RELEASE })
  await assert.rejects(store.load(OPERATION, { expectedReleaseIdentityHash: '9'.repeat(64) }), (error) => error.code === 'OPERATION_RELEASE_IDENTITY_CONFLICT')
  await assert.rejects(store.load(OPERATION, { expectedKind: 'OTHER' }), (error) => error.code === 'OPERATION_KIND_CONFLICT')
})

test('completed operation clears proposal arguments and rejects every later mutation', async (t) => {
  const { store } = await fixture(t)
  await store.create({ namespace: 'tenant', operationKind: 'CREDENTIAL_ENROLLMENT', releaseIdentityHash: RELEASE })
  await store.putProposalArguments(OPERATION, RELEASE, 'proposal-enrollment', { label: 'label' })
  await store.complete(OPERATION, RELEASE, { type: 'APPROVAL_RESOLVED', proposalId: 'proposal-enrollment' })
  const payload = await store.load(OPERATION, { expectedReleaseIdentityHash: RELEASE })
  assert.equal(payload.status, 'COMPLETED')
  assert.deepEqual(payload.proposalArguments, {})
  await assert.rejects(store.appendEvent(OPERATION, RELEASE, { type: 'REPLAY' }), (error) => error.code === 'OPERATION_NOT_ACTIVE')
})

test('ciphertext tamper and a different DPAPI user fail closed without replacement', async (t) => {
  const { root, store } = await fixture(t)
  await store.create({ namespace: 'tenant', operationKind: 'CREDENTIAL_ENROLLMENT', releaseIdentityHash: RELEASE })
  const target = path.join(root, `${OPERATION}.hzo`)
  const original = await readFile(target, 'utf8')
  const envelope = JSON.parse(original)
  envelope.ciphertextBase64 = `${envelope.ciphertextBase64[0] === 'A' ? 'B' : 'A'}${envelope.ciphertextBase64.slice(1)}`
  await writeFile(target, JSON.stringify(envelope), 'utf8')
  await assert.rejects(store.load(OPERATION), (error) => error.code === 'OPERATION_CIPHERTEXT_TAMPERED')
  await writeFile(target, original, 'utf8')
  const otherUser = new EncryptedOperationStore({ root, dpapi: { protect() {}, unprotect() { throw new Error('other user') } } })
  await assert.rejects(otherUser.load(OPERATION), (error) => error.code === 'OPERATION_DPAPI_UNPROTECT_FAILED')
})
