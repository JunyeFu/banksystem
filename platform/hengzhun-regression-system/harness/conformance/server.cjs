#!/usr/bin/env node
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const DEFAULT_PORT = 18787;
const DEFAULT_BUDGET = 4096;
const MAX_BODY_BYTES = 64 * 1024;

function json(res, status, value, budget = DEFAULT_BUDGET) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > budget) {
    return json(res, 413, { error: 'RESPONSE_BUDGET_EXCEEDED', budgetBytes: budget }, budget);
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('REQUEST_TOO_LARGE'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('INVALID_JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function authorized(req, expectedToken) {
  if (!expectedToken) return false;
  const header = req.headers.authorization || '';
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validateTypes(body) {
  const checks = [
    ['text', typeof body.text === 'string'],
    ['count', Number.isInteger(body.count)],
    ['ratio', typeof body.ratio === 'number' && Number.isFinite(body.ratio)],
    ['enabled', typeof body.enabled === 'boolean'],
    ['tags', Array.isArray(body.tags) && body.tags.every(value => typeof value === 'string')],
    ['profile', body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)],
    ['profile.owner', body.profile && typeof body.profile.owner === 'string'],
    ['profile.options', body.profile && body.profile.options && typeof body.profile.options === 'object'],
    ['profile.options.mode', body.profile && body.profile.options && ['safe', 'strict'].includes(body.profile.options.mode)]
  ];
  return checks.filter(([, valid]) => !valid).map(([name]) => name);
}

function embeddingFor(text, dims) {
  const vector = new Array(dims).fill(0);
  const bytes = crypto.createHash('sha256').update(String(text)).digest();
  for (let index = 0; index < dims; index += 1) {
    vector[index] = Number((((bytes[index % bytes.length] / 255) * 2 - 1) / Math.sqrt(dims)).toFixed(8));
  }
  return vector;
}

function openAiResponse(body) {
  const prompt = Array.isArray(body.messages)
    ? body.messages.map(message => typeof message.content === 'string' ? message.content : '').join('\n')
    : '';
  const content = prompt.includes('I1_CONFORMANCE_PING')
    ? 'I1_CONFORMANCE_PONG'
    : '衡准 I1 本地一致性模型已响应。该模型仅验证平台机械链路，不代表生产推理能力。';
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || 'gpt-4o-mini-2024-07-18',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  };
}

function createApp(options = {}) {
  const token = options.token ?? process.env.HENGZHUN_CONFORMANCE_TOKEN ?? '';
  const budget = Number(options.budget ?? process.env.RESPONSE_BUDGET_BYTES ?? DEFAULT_BUDGET);
  const embeddingDims = Number(options.embeddingDims ?? process.env.EMBEDDING_DIMS ?? 64);
  const metrics = { chatCompletionRequests: 0, embeddingRequests: 0, protectedEchoRequests: 0 };

  return async function handler(req, res) {
    const requestId = crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    try {
      const url = new URL(req.url, 'http://conformance.local');

      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { status: 'ok', service: 'hengzhun-i1-conformance', version: '1.0.0' }, budget);
      }
      if (req.method === 'GET' && url.pathname === '/support_status') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return res.end('1');
      }
      if (req.method === 'GET' && url.pathname === '/metrics') {
        return json(res, 200, metrics, budget);
      }
      if (req.method === 'POST' && url.pathname === '/embedding') {
        metrics.embeddingRequests += 1;
        const body = await readJson(req);
        if (!Array.isArray(body.texts) || !body.texts.every(value => typeof value === 'string')) {
          return json(res, 400, { error: 'INVALID_TEXTS' }, budget);
        }
        if (body.texts.length > 32) return json(res, 400, { error: 'TOO_MANY_TEXTS' }, budget);
        return json(res, 200, {
          dense: body.texts.map(value => embeddingFor(value, embeddingDims)),
          sparse: body.need_sparse ? body.texts.map(() => ({})) : []
        }, Math.max(budget, 64 * 1024));
      }
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        metrics.chatCompletionRequests += 1;
        const body = await readJson(req);
        const response = openAiResponse(body);
        if (body.stream === true) {
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
          const base = { id: response.id, object: 'chat.completion.chunk', created: response.created, model: response.model };
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: response.choices[0].message.content }, finish_reason: null }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: response.usage })}\n\n`);
          return res.end('data: [DONE]\n\n');
        }
        return json(res, 200, response, budget);
      }

      if (url.pathname.startsWith('/v1/') && !authorized(req, token)) {
        return json(res, 401, { error: 'UNAUTHORIZED' }, budget);
      }

      const echoMatch = url.pathname.match(/^\/v1\/echo\/([^/]+)$/);
      if (req.method === 'GET' && echoMatch) {
        metrics.protectedEchoRequests += 1;
        const limitRaw = url.searchParams.get('limit');
        const mode = url.searchParams.get('mode') || 'safe';
        const limit = limitRaw === null ? 10 : Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !['safe', 'strict'].includes(mode)) {
          return json(res, 400, { error: 'INVALID_QUERY' }, budget);
        }
        return json(res, 200, {
          pathValue: decodeURIComponent(echoMatch[1]),
          query: { limit, mode },
          headerValue: String(req.headers['x-conformance-id'] || '')
        }, budget);
      }

      if (req.method === 'POST' && url.pathname === '/v1/echo/types') {
        const body = await readJson(req);
        const invalid = validateTypes(body);
        if (invalid.length) return json(res, 400, { error: 'INVALID_BODY', fields: invalid }, budget);
        return json(res, 200, { accepted: true, value: body }, budget);
      }

      if (req.method === 'GET' && url.pathname === '/v1/delay') {
        const seconds = Number(url.searchParams.get('seconds'));
        if (![1, 30, 60, 120].includes(seconds)) return json(res, 400, { error: 'UNSUPPORTED_DELAY' }, budget);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        return json(res, 202, { accepted: true, delaySeconds: seconds, taskId: `synthetic-${requestId}` }, budget);
      }

      return json(res, 404, { error: 'NOT_FOUND' }, budget);
    } catch (error) {
      return json(res, error.status || 500, { error: error.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'INTERNAL_ERROR' }, budget);
    }
  };
}

function start(options = {}) {
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const port = Number(options.port ?? process.env.PORT ?? DEFAULT_PORT);
  const server = http.createServer(createApp(options));
  return new Promise(resolve => server.listen(port, host, () => resolve(server)));
}

module.exports = { createApp, start };

if (require.main === module) {
  start().then(server => {
    const address = server.address();
    process.stdout.write(JSON.stringify({ event: 'listening', service: 'hengzhun-i1-conformance', port: address.port }) + '\n');
  });
}
