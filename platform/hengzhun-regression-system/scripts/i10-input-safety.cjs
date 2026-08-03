'use strict'

const SECRET_LABEL = /(?:账号密码|登录密码|交易密码|U盾密码|用户名|账号|密码|口令|验证码|动态码|PIN|password|passwd|pwd|username|otp|captcha)\s*[:：=]\s*\S{2,}/i
const API_KEY = /\bsk-[A-Za-z0-9_-]{12,}\b/
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/i

function evaluateInputSafety(value) {
  const text = String(value ?? '').trim()
  if (!text) return { status: 'EMPTY_HELP', safe: false, errorCode: 'I10_INPUT_REQUIRED' }
  if (SECRET_LABEL.test(text) || API_KEY.test(text) || BEARER.test(text)) {
    return { status: 'SECRET_BLOCKED', safe: false, errorCode: 'I10_SECRET_INPUT_FORBIDDEN' }
  }
  return { status: 'SAFE', safe: true, errorCode: '' }
}

function flowiseSecretGuardSource() {
  return `
// Flowise preserves a real attachment-only action as the opaque
// [I10_ATTACHMENT_ONLY_INPUT] sandbox input. Prefer the original user text
// when present so secret detection never relies on that internal marker.
const text = String(($rawInput ?? '').trim() || ($input ?? '').trim());
const secretLabel = /(?:账号密码|登录密码|交易密码|U盾密码|用户名|账号|密码|口令|验证码|动态码|PIN|password|passwd|pwd|username|otp|captcha)\\s*[:：=]\\s*\\S{2,}/i;
const apiKey = /\\bsk-[A-Za-z0-9_-]{12,}\\b/;
const bearer = /\\bBearer\\s+[A-Za-z0-9._~+/-]{12,}=*\\b/i;
const status = !text ? 'EMPTY_HELP' : (secretLabel.test(text) || apiKey.test(text) || bearer.test(text) ? 'SECRET_BLOCKED' : 'SAFE');
return {
  status,
  safe: status === 'SAFE' ? 'YES' : 'NO',
  feedback: status === 'SAFE' ? text : '',
  errorCode: status === 'EMPTY_HELP' ? 'I10_INPUT_REQUIRED' : (status === 'SECRET_BLOCKED' ? 'I10_SECRET_INPUT_FORBIDDEN' : '')
};`
}

module.exports = { evaluateInputSafety, flowiseSecretGuardSource }
