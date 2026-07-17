#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const productRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(productRoot, '..', '..');
const configPath = path.join(productRoot, 'coze', 'public-ui-configuration.yaml');
const evidencePath = path.join(repositoryRoot, 'docs', 'evidence', 'platform', 'hengzhun-i5-import-repair-2026-07-17.md');
const failures = [];

try {
  const config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
  const i5 = config.i5;
  const expected = [
    [i5?.agent?.status, 'PUBLISHED', 'agent status'],
    [i5?.knowledgeBase?.status, 'PUBLISHED_BOUND', 'knowledge status'],
    [i5?.plugin?.currentStatus, 'PUBLISHED_BOUND', 'plugin status'],
    [i5?.plugin?.publishedVersion, 'v0.0.7', 'plugin version'],
    [i5?.plugin?.publicOperationCount, 11, 'plugin operation count'],
    [i5?.acceptance?.naturalLanguageApproval, 'VERIFIED', 'natural-language approval'],
    [i5?.acceptance?.duplicateApprovalRejected, 'HTTP_409_TARGET_VERSION_CONFLICT', 'duplicate approval guard'],
    [i5?.acceptance?.authoritativeCandidateState, 'ACTIVE_VERSION_4', 'candidate state'],
    [i5?.acceptance?.authoritativeIncidentState, 'RESOLVED_VERSION_4', 'incident state'],
    [i5?.acceptance?.readBackViaRepairCandidateGet, 'VERIFIED', 'candidate read-back'],
    [i5?.acceptance?.platformConfigurationPublished, true, 'platform publication'],
    [i5?.acceptance?.platformExitGate, 'CLOSED', 'I5 platform exit gate']
  ];
  for (const [actual, wanted, label] of expected) {
    if (actual !== wanted) failures.push(`${label}: expected ${wanted}, got ${actual}`);
  }

  for (const [value, label] of [
    [i5?.agent?.agentId, 'agentId'],
    [i5?.knowledgeBase?.knowledgeBaseId, 'knowledgeBaseId'],
    [i5?.plugin?.pluginId, 'pluginId']
  ]) {
    if (!/^\d{16,20}$/.test(String(value ?? ''))) failures.push(`${label}: invalid public resource id`);
  }

  const evidence = fs.readFileSync(evidencePath, 'utf8');
  if (!/^status: verified$/m.test(evidence)) failures.push('I5 evidence status is not verified');
  for (const marker of ['v0.0.7', 'ACTIVE/version 4', 'RESOLVED/version 4', 'TARGET_VERSION_CONFLICT']) {
    if (!evidence.includes(marker)) failures.push(`I5 evidence missing marker: ${marker}`);
  }
  if (/([a-z]:\\|\.env|cookie|password\s*[:=]|api[_-]?key\s*[:=]|bearer\s+[a-z0-9_-]{12,})/i.test(evidence)) {
    failures.push('I5 evidence contains forbidden sensitive or host-specific material');
  }
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error('HENGZHUN_I5_PUBLIC_PLATFORM_RESULTS_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I5_PUBLIC_PLATFORM_RESULTS_VERIFIED',
    publicOperationCount: 11,
    candidateState: 'ACTIVE_VERSION_4',
    incidentState: 'RESOLVED_VERSION_4',
    duplicateApprovalGuard: 'HTTP_409_TARGET_VERSION_CONFLICT',
    platformExitGate: 'CLOSED'
  }, null, 2));
}
