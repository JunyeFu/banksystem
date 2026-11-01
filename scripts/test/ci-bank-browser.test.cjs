'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseEnvironment, ownedSourcePath } = require('./ci-bank-browser.cjs');
test('Windows and Unix environment lines represent identical credentials', () => {
  const expected = { USERNAME: 'synthetic-user', PASSWORD: 'synthetic==', BASE_URL: 'http://127.0.0.1:21900' };
  const lines = Object.entries(expected).map(([key, value]) => `${key}=${value}`);
  assert.deepEqual(parseEnvironment(lines.join('\r\n')), expected);
  assert.deepEqual(parseEnvironment(lines.join('\n') + '\n'), expected);
});
test('line ending normalization does not trim credential contents', () => {
  assert.deepEqual(parseEnvironment('PASSWORD= synthetic value \r\n'), { PASSWORD: ' synthetic value ' });
});
test('WSL resolves only an explicit owned Windows source path', () => {
  assert.equal(ownedSourcePath('D:\\Agent\\.codex-temp\\banksystem-rf065\\source-snapshot', 'linux'), '/mnt/d/Agent/.codex-temp/banksystem-rf065/source-snapshot');
  assert.equal(ownedSourcePath('/tmp/banksystem-rf065/source-snapshot', 'linux'), '/tmp/banksystem-rf065/source-snapshot');
});
