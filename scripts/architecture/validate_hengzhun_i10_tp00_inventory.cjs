#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')

const repoRoot = path.resolve(__dirname, '..', '..')
const inventoryPath = path.join(
  repoRoot,
  'agent',
  'plans',
  'active',
  'hengzhun-i10-tp00-change-inventory-v1.json'
)

function fail(message) {
  process.stderr.write(`TP00_INVENTORY_INVALID: ${message}\n`)
  process.exitCode = 1
}

function loadInventory() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  if (inventory.schemaVersion !== 'hengzhun-i10-tp00-change-inventory/v1') {
    throw new Error(`unsupported schemaVersion: ${inventory.schemaVersion}`)
  }
  if (!Array.isArray(inventory.batches) || inventory.batches.length === 0) {
    throw new Error('batches must be a non-empty array')
  }
  const ids = inventory.batches.map((batch) => batch.id)
  if (new Set(ids).size !== ids.length) throw new Error('batch ids must be unique')
  for (const batch of inventory.batches.filter((candidate) => candidate.disposition === 'CHANGE_BATCH')) {
    const contract = inventory.reviewContracts?.[batch.id]
    if (!contract || !Array.isArray(contract.reviewCommands) || contract.reviewCommands.length === 0) {
      throw new Error(`${batch.id} must define non-empty reviewCommands`)
    }
    if (typeof contract.workingDirectory !== 'string' || contract.workingDirectory.trim() === '') {
      throw new Error(`${batch.id} must define workingDirectory`)
    }
    if (typeof contract.rollback !== 'string' || contract.rollback.trim() === '') {
      throw new Error(`${batch.id} must define rollback`)
    }
    if (typeof contract.runtimeEvidence !== 'string' || contract.runtimeEvidence.trim() === '') {
      throw new Error(`${batch.id} must define runtimeEvidence`)
    }
  }
  return inventory
}

function dirtyPaths() {
  const output = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  const records = output.split('\0').filter(Boolean)
  const paths = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const status = record.slice(0, 2)
    const filePath = record.slice(3).replaceAll('\\', '/')
    paths.push({ status, path: filePath })
    if (status.includes('R') || status.includes('C')) index += 1
  }
  return paths
}

function compileBatches(inventory) {
  return inventory.batches.map((batch) => ({
    ...batch,
    regexes: batch.patterns.map((pattern) => new RegExp(pattern))
  }))
}

function main() {
  const inventory = loadInventory()
  const batches = compileBatches(inventory)
  const assignments = new Map(batches.map((batch) => [batch.id, []]))
  const unknown = []
  const overlaps = []

  const entries = dirtyPaths()
  const pathSetHash = crypto.createHash('sha256')
  for (const entry of entries) {
    pathSetHash.update(entry.status)
    pathSetHash.update('\0')
    pathSetHash.update(entry.path)
    pathSetHash.update('\0')
  }
  const pathSetDigest = pathSetHash.digest('hex')
  for (const entry of entries) {
    const owners = batches.filter((batch) => batch.regexes.some((regex) => regex.test(entry.path)))
    if (owners.length === 0) unknown.push(entry)
    else if (owners.length > 1) overlaps.push({ ...entry, owners: owners.map((owner) => owner.id) })
    else assignments.get(owners[0].id).push(entry)
  }

  if (unknown.length > 0) {
    fail(`unassigned dirty paths: ${unknown.map((entry) => entry.path).join(', ')}`)
  }
  if (overlaps.length > 0) {
    fail(`multiply assigned dirty paths: ${overlaps.map((entry) => `${entry.path}=>${entry.owners.join('+')}`).join(', ')}`)
  }
  if (entries.length !== inventory.baseline.expectedFileLevelDirtyEntriesAfterTp00) {
    fail(`dirty path count changed: ${entries.length} != ${inventory.baseline.expectedFileLevelDirtyEntriesAfterTp00}`)
  }
  if (inventory.baseline.pathSetDigest && pathSetDigest !== inventory.baseline.pathSetDigest) {
    fail(`dirty path set changed: ${pathSetDigest} != ${inventory.baseline.pathSetDigest}`)
  }

  const changePaths = inventory.batches
    .filter((batch) => batch.disposition === 'CHANGE_BATCH')
    .flatMap((batch) => assignments.get(batch.id))
  const excludedPaths = inventory.batches
    .filter((batch) => batch.disposition !== 'CHANGE_BATCH')
    .flatMap((batch) => assignments.get(batch.id))

  function digestEntries(batch, entries) {
    const digest = crypto.createHash('sha256')
    for (const entry of entries) {
      digest.update(entry.status)
      digest.update('\0')
      digest.update(entry.path)
      digest.update('\0')
      if (batch.disposition === 'CHANGE_BATCH') {
        const absolutePath = path.join(repoRoot, ...entry.path.split('/'))
        digest.update(fs.readFileSync(absolutePath))
      } else {
        digest.update('CONTENT_NOT_READ')
      }
      digest.update('\0')
    }
    return digest.digest('hex')
  }

  const summary = {
    schemaVersion: inventory.schemaVersion,
    taskPackage: inventory.taskPackage,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    pathSetDigest,
    dirtyPathCount: entries.length,
    changePathCount: changePaths.length,
    excludedPathCount: excludedPaths.length,
    unknownPathCount: unknown.length,
    overlapPathCount: overlaps.length,
    batches: Object.fromEntries(
      inventory.batches.map((batch) => [batch.id, {
        disposition: batch.disposition,
        count: assignments.get(batch.id).length,
        digest: digestEntries(batch, assignments.get(batch.id)),
        paths: assignments.get(batch.id).map((entry) => entry.path)
      }])
    )
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (unknown.length === 0 && overlaps.length === 0) process.stderr.write('TP00_INVENTORY_OK\n')
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
