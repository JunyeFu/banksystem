'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../../harness/conformance/server.cjs');

const TOKEN = 'test-token-not-a-secret';
let server;
let baseUrl;

test.before(async () => {
  server = await start({ host: '127.0.0.1', port: 0, token: TOKEN, budget: 4096, embeddingDims: 64 });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => new Promise(resolve => server.close(resolve)));

test('health is public and contains no runtime details', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'hengzhun-i1-conformance', version: '1.0.0' });
});

test('protected endpoints reject missing and wrong bearer tokens', async () => {
  for (const authorization of [undefined, 'Bearer wrong']) {
    const response = await fetch(`${baseUrl}/v1/echo/demo`, { headers: authorization ? { authorization } : {} });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'UNAUTHORIZED' });
  }
});

test('query, path, header, enum and default round trip', async () => {
  const response = await fetch(`${baseUrl}/v1/echo/%E4%B8%AD%E6%96%87?limit=7&mode=strict`, {
    headers: { authorization: `Bearer ${TOKEN}`, 'x-conformance-id': 'header-01' }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    pathValue: '中文', query: { limit: 7, mode: 'strict' }, headerValue: 'header-01'
  });
});

test('all required JSON types and two-level object round trip', async () => {
  const value = {
    text: 'case', count: 2, ratio: 0.5, enabled: true, tags: ['i1', 'safe'],
    profile: { owner: 'synthetic', options: { mode: 'safe' } }
  };
  const response = await fetch(`${baseUrl}/v1/echo/types`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(value)
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, value });
});

test('HTTP embedding and local mechanical model are deterministic and usable', async () => {
  const embedding = await fetch(`${baseUrl}/embedding`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts: ['衡准'], need_sparse: false })
  });
  const embeddingBody = await embedding.json();
  assert.equal(embedding.status, 200);
  assert.equal(embeddingBody.dense[0].length, 64);

  const model = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-2024-07-18', messages: [{ role: 'user', content: 'I1_CONFORMANCE_PING' }] })
  });
  assert.equal(model.status, 200);
  assert.equal((await model.json()).choices[0].message.content, 'I1_CONFORMANCE_PONG');

  const stream = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'I1_CONFORMANCE_PING' }] })
  });
  const streamBody = await stream.text();
  assert.equal(stream.status, 200);
  assert.match(streamBody, /"delta":\{"content":"I1_CONFORMANCE_PONG"\}/);
  assert.match(streamBody, /data: \[DONE\]/);
});
