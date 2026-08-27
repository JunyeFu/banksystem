'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSuccessfulResponseBody } = require('../verify-i10-model-probes.cjs');

test('model probe accepts a complete OpenAI-compatible response', () => {
  const parsed = parseSuccessfulResponseBody(JSON.stringify({
    choices: [{ message: { content: '{"probe":"ok"}' } }],
    usage: { total_tokens: 12 }
  }));
  assert.equal(parsed.content, '{"probe":"ok"}');
  assert.deepEqual(parsed.parsedContent, { probe: 'ok' });
  assert.equal(parsed.usage.total_tokens, 12);
});

test('model probe rejects an empty or truncated successful response', () => {
  assert.throws(() => parseSuccessfulResponseBody(''), SyntaxError);
  assert.throws(() => parseSuccessfulResponseBody('{'), SyntaxError);
  assert.throws(
    () => parseSuccessfulResponseBody(JSON.stringify({ choices: [{ message: { content: '' } }] })),
    error => error?.code === 'MODEL_PROBE_RESPONSE_CONTENT_EMPTY'
  );
  assert.throws(
    () => parseSuccessfulResponseBody(JSON.stringify({ choices: [{ message: { content: '{"probe":"unterminated' } }] })),
    error => error?.code === 'MODEL_PROBE_RESPONSE_CONTENT_JSON_INVALID'
  );
  assert.throws(
    () => parseSuccessfulResponseBody(JSON.stringify({ choices: [{ message: { content: '[]' } }] })),
    error => error?.code === 'MODEL_PROBE_RESPONSE_CONTENT_JSON_OBJECT_REQUIRED'
  );
});
