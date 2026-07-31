'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SAFE_RELATIVE_DIRECTORY = /^\.data\/candidates\/[a-z0-9][a-z0-9._-]{2,63}\/candidate_[a-f0-9]{40}$/;
const FORBIDDEN_SOURCE = /(?:\brequire\s*\(|\bimport\s*\(|\beval\s*\(|\bFunction\s*\(|child_process|node:fs|node:path|process\.|\.\.\/|[A-Za-z]:\\)/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code, category: 'ENVIRONMENT' });
}

function resolveCandidateDirectory(productRoot, relativeDirectory) {
  if (!SAFE_RELATIVE_DIRECTORY.test(relativeDirectory)) fail('CANDIDATE_DIRECTORY_NOT_ALLOWLISTED', '候选目录不符合固定白名单。');
  const candidateRoot = path.resolve(productRoot, '.data', 'candidates');
  const directory = path.resolve(productRoot, ...relativeDirectory.split('/'));
  if (directory !== candidateRoot && !directory.startsWith(`${candidateRoot}${path.sep}`)) fail('CANDIDATE_DIRECTORY_ESCAPE', '候选目录越过受管根目录。');
  return directory;
}

function verifyCandidatePackage(descriptor) {
  const directory = resolveCandidateDirectory(descriptor.productRoot, descriptor.relativeDirectory);
  const manifestPath = path.join(directory, 'manifest.json');
  const scriptPath = path.join(directory, 'script.cjs');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(scriptPath)) fail('CANDIDATE_PACKAGE_INCOMPLETE', '候选包文件不完整。');
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const scriptBytes = fs.readFileSync(scriptPath);
  if (sha256(stableJson(JSON.parse(manifestText))) !== descriptor.manifestHash) fail('CANDIDATE_MANIFEST_HASH_MISMATCH', '候选清单 Hash 不匹配。');
  if (sha256(scriptBytes) !== descriptor.scriptHash) fail('CANDIDATE_SCRIPT_HASH_MISMATCH', '候选脚本 Hash 不匹配。');
  const manifest = JSON.parse(manifestText);
  if (manifest.candidateId !== descriptor.candidateId || manifest.generatorVersion !== 'hengzhun-script-package-builder-1.0.0') fail('CANDIDATE_MANIFEST_IDENTITY_MISMATCH', '候选清单身份不匹配。');
  if (!Array.isArray(manifest.dependencyAllowlist) || manifest.dependencyAllowlist.length !== 0) fail('CANDIDATE_DEPENDENCY_NOT_ALLOWLISTED', '候选包不得声明动态依赖。');
  const source = scriptBytes.toString('utf8');
  if (FORBIDDEN_SOURCE.test(source)) fail('CANDIDATE_SOURCE_FORBIDDEN', '候选脚本包含禁止语义。');
  return { directory, manifest, scriptPath };
}

function loadCandidateExecutor(descriptor) {
  const verified = verifyCandidatePackage(descriptor);
  delete require.cache[require.resolve(verified.scriptPath)];
  const candidate = require(verified.scriptPath);
  if (!['hengzhun-candidate-module-v1', 'hengzhun-candidate-module-v2'].includes(candidate?.schemaVersion) || typeof candidate.execute !== 'function') fail('CANDIDATE_MODULE_CONTRACT_INVALID', '候选模块不符合固定导出契约。');
  return candidate.execute;
}

async function executeCandidatePackage(descriptor, context) {
  const execute = loadCandidateExecutor(descriptor);
  const base = new URL(context.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/') fail('CANDIDATE_BASE_URL_INVALID', '基础地址不符合受控来源契约。');
  if (!context.page || typeof context.capture !== 'function' || !context.fixtures || typeof context.fixtures !== 'object') fail('CANDIDATE_RUNTIME_CONTEXT_INVALID', '候选运行上下文不完整。');
  return execute({
    page: context.page,
    baseUrl: base.toString(),
    fixtures: Object.freeze({ ...context.fixtures }),
    capture: context.capture,
    ...(typeof context.afterStep === 'function' ? { afterStep: context.afterStep } : {}),
    // Candidate modules are generated artifacts.  Passing this optional hook
    // keeps their public contract stable while allowing the formal runner to
    // persist a redacted execution boundary when a browser operation fails.
    ...(typeof context.onStep === 'function' ? { onStep: context.onStep } : {})
  });
}

module.exports = { executeCandidatePackage, loadCandidateExecutor, resolveCandidateDirectory, verifyCandidatePackage };
