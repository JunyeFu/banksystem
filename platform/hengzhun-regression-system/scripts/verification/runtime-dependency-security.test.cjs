'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '../..');
const extract = require(path.join(root, 'runtime/node_modules/extract-zip'));

async function withArchive(zip, assertion) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hz-rf065-zip-'));
  try {
    const archive = path.join(temporary, 'input.zip');
    const output = path.join(temporary, 'output');
    await fs.writeFile(archive, await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }));
    await assertion(archive, output, temporary);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

test('patched ZIP preserves normal nested extraction and upstream identification', async () => {
  const zip = new JSZip().file('nested/file.txt', 'bank-browser-fixture');
  await withArchive(zip, async (archive, output) => {
    await extract(archive, { dir: output });
    assert.equal(await fs.readFile(path.join(output, 'nested/file.txt'), 'utf8'), 'bank-browser-fixture');
  });
  assert.equal(require(path.join(root, 'runtime/node_modules/extract-zip/package.json')).version, '2.0.1');
  assert.equal(await fs.readFile(path.join(root, 'runtime/node_modules/extract-zip/index.js'), 'utf8'), await fs.readFile(path.join(root, 'vendor/extract-zip/index.js'), 'utf8'));
  const browserRequire = createRequire(path.join(root, 'runtime/node_modules/@puppeteer/browsers/package.json'));
  assert.equal(browserRequire.resolve('extract-zip'), path.join(root, 'runtime/node_modules/extract-zip/index.js'));
});

test('patched ZIP refuses absolute and traversal symlink entries before planting a link', async () => {
  for (const target of ['/tmp/outside', '../../outside']) {
    const zip = new JSZip().file('escape', target, { unixPermissions: 0o120777 });
    await withArchive(zip, async (archive, output) => {
      await assert.rejects(extract(archive, { dir: output }), /ZIP_SYMLINK_ENTRY_FORBIDDEN/);
      assert.deepEqual(await fs.readdir(output), []);
    });
  }
});

test('patched ZIP refuses an existing destination link and leaves outside data unchanged', async () => {
  const zip = new JSZip().file('leaf', 'must-not-write');
  await withArchive(zip, async (archive, output, temporary) => {
    const outside = path.join(temporary, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'sentinel.txt'), 'preserve');
    await fs.mkdir(output);
    await fs.symlink(outside, path.join(output, 'leaf'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(extract(archive, { dir: output }), /ZIP_SYMLINK_DESTINATION_FORBIDDEN/);
    assert.equal(await fs.readFile(path.join(outside, 'sentinel.txt'), 'utf8'), 'preserve');
    assert.deepEqual(await fs.readdir(outside), ['sentinel.txt']);
  });
});

test('patched ZIP refuses parent links before creating any outside directories', async () => {
  const zip = new JSZip().file('redirect/new-dir/file.txt', 'must-not-write', { createFolders: false });
  await withArchive(zip, async (archive, output, temporary) => {
    const outside = path.join(temporary, 'outside');
    await fs.mkdir(outside);
    await fs.mkdir(output);
    await fs.symlink(outside, path.join(output, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(extract(archive, { dir: output }));
    assert.deepEqual(await fs.readdir(outside), []);
  });
});

test('video preflight requires successful decoding rather than accepting an intact header', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hz-rf065-media-'));
  try {
    const freeze = require(path.join(root, 'config/demo-runtime-freeze.json'));
    const file = path.join(temporary, 'valid.mp4');
    const encoded = spawnSync(path.join(root, 'runtime', freeze.mediaFfmpeg.executable), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=96x64:rate=10', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', file], { encoding: 'utf8', windowsHide: true });
    assert.equal(encoded.status, 0, encoded.stderr);
    const { inspectVideo } = require(path.join(root, 'worker/src/i10-video-ingest-runner.cjs'));
    assert.deepEqual(inspectVideo(file), { codec: 'h264', width: 96, height: 64, durationSeconds: 1 });
    const bytes = await fs.readFile(file);
    const start = bytes.indexOf(Buffer.from('mdat')) + 4;
    const end = bytes.indexOf(Buffer.from('moov')) - 4;
    assert.ok(start >= 4 && end > start);
    bytes.fill(0, start, end);
    const corrupt = path.join(temporary, 'corrupt.mp4');
    await fs.writeFile(corrupt, bytes);
    assert.throws(() => inspectVideo(corrupt), { code: 'I10_VIDEO_DECODE_FAILED' });
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
