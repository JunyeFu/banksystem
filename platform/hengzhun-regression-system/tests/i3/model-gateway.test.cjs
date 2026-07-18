'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { createModelGatewayServer } = require('../../model-gateway/src/server.cjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

test('gateway converts a non-stream tool completion into OpenAI SSE', async () => {
  let receivedBody;
  const upstream = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1,
      model: 'mimo-v2.5',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          reasoning_content: 'controlled reasoning',
          tool_calls: [{
            id: 'call-test',
            type: 'function',
            function: { name: 'decision_submit', arguments: '{"choice":"APPROVE"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
  });
  const upstreamPort = await listen(upstream);
  const gateway = createModelGatewayServer({
    upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
    upstreamModel: 'mimo-v2.5',
    upstreamApiKey: 'upstream-secret',
    clientToken: 'gateway-secret',
  });
  const gatewayPort = await listen(gateway);

  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer gateway-secret', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'untrusted-model',
        messages: [{ role: 'user', content: 'submit decision' }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const body = await response.text();
    assert.match(body, /decision_submit/);
    assert.match(body, /controlled reasoning/);
    assert.match(body, /"finish_reason":"tool_calls"/);
    assert.match(body, /data: \[DONE\]/);
    assert.equal(receivedBody.model, 'mimo-v2.5');
    assert.equal(receivedBody.stream, false);
    assert.equal('stream_options' in receivedBody, false);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway rejects missing client authentication and exposes only safe health data', async () => {
  const gateway = createModelGatewayServer({
    upstreamBaseUrl: 'http://127.0.0.1:1/v1',
    upstreamModel: 'mimo-v2.5',
    upstreamApiKey: 'upstream-secret',
    clientToken: 'gateway-secret',
  });
  const gatewayPort = await listen(gateway);
  try {
    const health = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
    assert.deepEqual(await health.json(), { status: 'ok', mode: 'nonstream-to-sse' });
    const unauthorized = await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.code, 'UNAUTHORIZED');
  } finally {
    await close(gateway);
  }
});

test('gateway normalizes a complete MiMo pseudo tool block into a structured tool call', async () => {
  let receivedBody;
  const upstream = http.createServer((_request, response) => {
    const chunks = [];
    _request.on('data', chunk => chunks.push(chunk));
    _request.on('end', () => {
      receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        id: 'chatcmpl-pseudo',
        model: 'mimo-v2.5',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: '<tool_call><function=case_get><parameter=namespace>coze-i3-agent</parameter><parameter=caseId>case-safe</parameter></tool_call>',
          },
          finish_reason: 'stop',
        }],
      }));
    });
  });
  const upstreamPort = await listen(upstream);
  const gateway = createModelGatewayServer({
    upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
    upstreamModel: 'mimo-v2.5',
    upstreamApiKey: 'upstream-secret',
    clientToken: 'gateway-secret',
  });
  const gatewayPort = await listen(gateway);
  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer gateway-secret', 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'get case' }],
        stream: false,
        tools: [{
          type: 'function',
          function: {
            name: 'case_get',
            parameters: {
              type: 'object',
              properties: { namespace: { type: 'string' }, caseId: { type: 'string' } },
              required: ['namespace', 'caseId'],
            },
          },
        }],
      }),
    });
    const completion = await response.json();
    assert.equal(completion.choices[0].finish_reason, 'tool_calls');
    const call = completion.choices[0].message.tool_calls[0];
    assert.equal(call.function.name, 'case_get');
    assert.deepEqual(JSON.parse(call.function.arguments), { namespace: 'coze-i3-agent', caseId: 'case-safe' });
    assert.equal(completion.choices[0].message.content, null);
    assert.equal(receivedBody.messages[0].role, 'system');
    assert.match(receivedBody.messages[0].content, /never simulate, infer, or guess/i);
    assert.match(receivedBody.messages[0].content, /<tool_call><function=TOOL_NAME>/);
    assert.deepEqual(receivedBody.messages.slice(1), [{ role: 'user', content: 'get case' }]);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway retries a transient model transport failure without duplicating downstream output', async () => {
  let attempts = 0;
  const gateway = createModelGatewayServer({
    upstreamBaseUrl: 'http://model.invalid/v1',
    upstreamModel: 'mimo-v2.5',
    upstreamApiKey: 'upstream-secret',
    clientToken: 'gateway-secret',
    upstreamAttempts: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('transient'), { name: 'AbortError' });
      return new Response(JSON.stringify({
        id: 'chatcmpl-retry', model: 'mimo-v2.5',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const gatewayPort = await listen(gateway);
  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer gateway-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test retry' }], stream: true }),
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(attempts, 2);
    assert.equal((body.match(/data: \[DONE\]/g) || []).length, 1);
  } finally {
    await close(gateway);
  }
});
