#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'config', 'demo-runtime-freeze.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const runtimeRoot = path.resolve(
  process.env[manifest.runtimeRootEnvironmentVariable]
    || path.join(projectRoot, manifest.defaultRuntimeRoot)
);
const failures = [];

function check(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${actual || '<missing>'}`);
}

function packageVersion(name) {
  const packageJson = path.join(runtimeRoot, 'node_modules', ...name.split('/'), 'package.json');
  if (!fs.existsSync(packageJson)) return null;
  return JSON.parse(fs.readFileSync(packageJson, 'utf8')).version || null;
}

async function main() {
  check('Node.js', process.version, manifest.node.version);
  for (const [name, expectedVersion] of Object.entries(manifest.packages)) {
    check(name, packageVersion(name), expectedVersion);
  }

  const browserDirectory = path.join(runtimeRoot, manifest.chromium.browserDirectory);
  if (!fs.existsSync(browserDirectory)) failures.push(`Chromium directory: expected ${browserDirectory}`);
  const browserExecutable = path.join(runtimeRoot, manifest.chromium.executable);
  if (!fs.existsSync(browserExecutable)) failures.push(`Chromium executable: expected ${browserExecutable}`);
  const ffmpegDirectory = path.join(runtimeRoot, manifest.ffmpeg.directory);
  if (!fs.existsSync(ffmpegDirectory)) failures.push(`FFmpeg directory: expected ${ffmpegDirectory}`);

  if (failures.length === 0) {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(runtimeRoot, 'browsers');
    const { chromium } = require(path.join(runtimeRoot, 'node_modules', 'playwright'));
    let browser;
    try {
      browser = await chromium.launch({headless: true, executablePath: browserExecutable});
      check('Chromium runtime version', await browser.version(), manifest.chromium.version);
    } catch (error) {
      failures.push(`Chromium launch: ${error.message}`);
    } finally {
      await browser?.close();
    }
  }

  if (failures.length > 0) {
    console.error('BLOCKED_ENV_VERSION_DRIFT');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify({
    status: 'DEMO_RUNTIME_VERSION_FROZEN',
    freezeId: manifest.freezeId,
    profile: manifest.profile,
    runtimeRoot,
    node: manifest.node.version,
    packages: manifest.packages,
    chromium: manifest.chromium,
    ffmpeg: manifest.ffmpeg
  }, null, 2));
}

main().catch((error) => {
  console.error('BLOCKED_ENV_VERSION_DRIFT');
  console.error(`- verifier failure: ${error.message}`);
  process.exitCode = 2;
});
