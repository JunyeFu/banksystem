'use strict';

const http = require('node:http');
const { randomUUID, timingSafeEqual } = require('node:crypto');

const DEFAULT_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 45000;
const DEFAULT_UPSTREAM_ATTEMPTS = 3;
const TOOL_PROTOCOL_INSTRUCTION = [
  'When a tool call is required, never simulate, infer, or guess the tool result.',
  'Return exactly one tool call and no prose using this format:',
  '<tool_call><function=TOOL_NAME><parameter=PARAMETER_NAME>VALUE</parameter></tool_call>.',
  'Use only a provided tool name and include every required parameter exactly once.',
].join(' ');

function logSafe(event, details = {}) {
  process.stdout.write(JSON.stringify({ event, ...details }) + '\n');
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function bearerMatches(request, expectedToken) {
  if (!expectedToken) return false;
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const left = Buffer.from(supplied);
  const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJsonBody(request, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) {
      const error = new Error('request body exceeds configured limit');
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function completionChunk(base, delta, finishReason = null) {
  return {
    id: base.id || `chatcmpl-${randomUUID()}`,
    object: 'chat.completion.chunk',
    created: base.created || Math.floor(Date.now() / 1000),
    model: base.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamCompletion(response, completion) {
  const choice = completion?.choices?.[0];
  const message = choice?.message || {};
  const delta = { role: message.role || 'assistant' };
  if (message.content !== undefined && message.content !== null) delta.content = message.content;
  if (message.reasoning_content !== undefined) delta.reasoning_content = message.reasoning_content;
  if (Array.isArray(message.tool_calls)) {
    delta.tool_calls = message.tool_calls.map((toolCall, index) => ({ index, ...toolCall }));
  }
  const inferredFinishReason = Array.isArray(message.tool_calls) && message.tool_calls.length > 0
    ? 'tool_calls'
    : (choice?.finish_reason || 'stop');

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  writeSse(response, completionChunk(completion, delta));
  writeSse(response, completionChunk(completion, {}, inferredFinishReason));
  if (completion.usage) {
    writeSse(response, {
      id: completion.id || `chatcmpl-${randomUUID()}`,
      object: 'chat.completion.chunk',
      created: completion.created || Math.floor(Date.now() / 1000),
      model: completion.model,
      choices: [],
      usage: completion.usage,
    });
  }
  response.end('data: [DONE]\n\n');
}

function coerceToolArgument(rawValue, schema) {
  const value = rawValue.trim();
  if (schema?.type === 'object' || schema?.type === 'array') return JSON.parse(value);
  if (schema?.type === 'integer') return Number.parseInt(value, 10);
  if (schema?.type === 'number') return Number(value);
  if (schema?.type === 'boolean') return value.toLowerCase() === 'true';
  return value;
}

function normalizePseudoToolCall(completion, requestedTools) {
  const choice = completion?.choices?.[0];
  const message = choice?.message;
  if (!message || Array.isArray(message.tool_calls) || typeof message.content !== 'string') return completion;
  const match = message.content.match(/<tool_call>[\s\S]*?<function=([A-Za-z0-9_]+)>[\s\S]*?<\/tool_call>/);
  if (!match) return completion;
  const name = match[1];
  const tool = requestedTools.find(candidate => candidate?.function?.name === name);
  if (!tool) return completion;
  const argumentsObject = {};
  const parameterPattern = /<parameter=([A-Za-z0-9_]+)>([\s\S]*?)<\/parameter>/g;
  for (const parameter of match[0].matchAll(parameterPattern)) {
    const schema = tool.function?.parameters?.properties?.[parameter[1]];
    argumentsObject[parameter[1]] = coerceToolArgument(parameter[2], schema);
  }
  const required = tool.function?.parameters?.required || [];
  if (required.some(key => !(key in argumentsObject))) return completion;
  message.content = null;
  message.tool_calls = [{
    id: `call_${randomUUID().replaceAll('-', '')}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(argumentsObject) },
  }];
  choice.finish_reason = 'tool_calls';
  logSafe('gateway.pseudo_tool_call.normalized', { toolName: name, argumentCount: Object.keys(argumentsObject).length });
  return completion;
}

function injectToolProtocol(messages, requestedTools) {
  if (!Array.isArray(messages) || !Array.isArray(requestedTools) || requestedTools.length === 0) {
    return messages;
  }
  return [{ role: 'system', content: TOOL_PROTOCOL_INSTRUCTION }, ...messages];
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}

function createModelGatewayServer(options = {}) {
  const upstreamBaseUrl = normalizeBaseUrl(options.upstreamBaseUrl || process.env.MIMO_MODEL_BASE_URL);
  const upstreamModel = options.upstreamModel || process.env.MIMO_MODEL_NAME;
  const upstreamApiKey = options.upstreamApiKey || process.env.MIMO_MODEL_API_KEY;
  const clientToken = options.clientToken || process.env.HENGZHUN_MODEL_GATEWAY_TOKEN;
  const bodyLimitBytes = options.bodyLimitBytes || DEFAULT_BODY_LIMIT_BYTES;
  const upstreamTimeoutMs = options.upstreamTimeoutMs || DEFAULT_UPSTREAM_TIMEOUT_MS;
  const upstreamAttempts = options.upstreamAttempts || DEFAULT_UPSTREAM_ATTEMPTS;
  const fetchImpl = options.fetchImpl || fetch;

  if (!upstreamBaseUrl || !upstreamModel || !upstreamApiKey || !clientToken) {
    throw new Error('model gateway configuration is incomplete');
  }

  return http.createServer(async (request, response) => {
    const requestStartedAt = Date.now();
    if (request.url !== '/health') logSafe('gateway.request.start', { method: request.method, route: request.url });
    try {
      if (request.method === 'GET' && request.url === '/health') {
        return json(response, 200, { status: 'ok', mode: 'nonstream-to-sse' });
      }
      if (!bearerMatches(request, clientToken)) {
        return json(response, 401, { error: { code: 'UNAUTHORIZED', message: 'valid bearer token required' } });
      }
      if (request.method === 'GET' && request.url === '/v1/models') {
        return json(response, 200, { object: 'list', data: [{ id: upstreamModel, object: 'model' }] });
      }
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        return json(response, 404, { error: { code: 'NOT_FOUND', message: 'route not found' } });
      }

      const requested = await readJsonBody(request, bodyLimitBytes);
      const wantsStream = requested.stream === true;
      const minimumOutputTokens = Number(options.minimumOutputTokens || process.env.MIMO_MODEL_MIN_OUTPUT_TOKENS || 2048);
      const upstreamRequest = {
        ...requested,
        messages: injectToolProtocol(requested.messages, requested.tools),
        model: upstreamModel,
        stream: false,
        max_tokens: Math.max(Number(requested.max_tokens) || 0, minimumOutputTokens),
        temperature: Math.min(Number(requested.temperature) || 0.2, 0.3),
      };
      if (Array.isArray(requested.tools) && requested.tools.length > 0) {
        logSafe('gateway.tool_protocol.injected', { toolCount: requested.tools.length });
      }
      delete upstreamRequest.stream_options;
      let upstreamResponse;
      let lastError;
      for (let attempt = 1; attempt <= upstreamAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
        try {
          logSafe('gateway.upstream.start', { streamRequested: wantsStream, attempt });
          upstreamResponse = await fetchImpl(`${upstreamBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${upstreamApiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(upstreamRequest),
            signal: controller.signal,
          });
          if (upstreamResponse.ok || upstreamResponse.status < 500 || attempt === upstreamAttempts) break;
          await upstreamResponse.arrayBuffer().catch(() => undefined);
          logSafe('gateway.upstream.retry', { attempt, reason: 'server_error' });
        } catch (error) {
          lastError = error;
          if (attempt === upstreamAttempts) throw error;
          logSafe('gateway.upstream.retry', { attempt, reason: error?.name === 'AbortError' ? 'timeout' : 'network' });
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!upstreamResponse) throw lastError || new Error('model provider did not return a response');

      logSafe('gateway.upstream.complete', {
        status: upstreamResponse.status,
        durationMs: Date.now() - requestStartedAt,
      });

      if (!upstreamResponse.ok) {
        await upstreamResponse.arrayBuffer().catch(() => undefined);
        return json(response, 502, {
          error: { code: 'UPSTREAM_REJECTED', message: 'model provider rejected the request' },
        });
      }
      const completion = normalizePseudoToolCall(await upstreamResponse.json(), Array.isArray(requested.tools) ? requested.tools : []);
      if (wantsStream) return streamCompletion(response, completion);
      return json(response, 200, completion);
    } catch (error) {
      if (error?.code === 'BODY_TOO_LARGE') {
        return json(response, 413, { error: { code: 'BODY_TOO_LARGE', message: error.message } });
      }
      if (error instanceof SyntaxError) {
        return json(response, 400, { error: { code: 'INVALID_JSON', message: 'request body must be valid JSON' } });
      }
      if (error?.name === 'AbortError') {
        return json(response, 504, { error: { code: 'UPSTREAM_TIMEOUT', message: 'model provider timed out' } });
      }
      return json(response, 500, { error: { code: 'GATEWAY_ERROR', message: 'model gateway failed safely' } });
    }
  });
}

if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 18789);
  const server = createModelGatewayServer();
  server.listen(port, host, () => {
    process.stdout.write(JSON.stringify({ status: 'ready', host, port, mode: 'nonstream-to-sse' }) + '\n');
  });
}

module.exports = { createModelGatewayServer };
