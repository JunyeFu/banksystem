#!/usr/bin/env node
'use strict'

// This file is deliberately dependency-free: it is consumed by lifecycle and
// acceptance scripts before the package's development dependencies are known
// to be usable.  Identifier syntax is data, not a series of copied regexes.
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const contractPath = path.join(root, 'contracts', 'i10', 'opaque-reference-v1.json')
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))

if (contract.schemaVersion !== 'hengzhun-i10-opaque-reference-v1' || !contract.references) {
  throw new Error('I10_OPAQUE_REFERENCE_CONTRACT_INVALID')
}

function definition(kind) {
  const value = contract.references[String(kind || '').toLowerCase()]
  if (!value || typeof value.prefix !== 'string' || typeof value.suffixPattern !== 'string') {
    throw new Error(`I10_OPAQUE_REFERENCE_KIND_UNKNOWN:${String(kind || '')}`)
  }
  return value
}

function source(kind) {
  const value = definition(kind)
  return `${value.prefix}${value.suffixPattern}`
}

function pattern(kind, flags = 'i') {
  return new RegExp(`^${source(kind)}$`, flags)
}

function scanPattern(kind, flags = 'ig') {
  return new RegExp(source(kind), flags)
}

function isReference(kind, value) {
  return pattern(kind).test(String(value || '').trim())
}

function referencesIn(value, kind) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return [...text.matchAll(scanPattern(kind))].map(match => match[0])
}

function latestReference(value, kind) {
  const matches = referencesIn(value, kind)
  return matches.length ? matches.at(-1) : null
}

module.exports = {
  contract,
  contractPath,
  definition,
  source,
  pattern,
  scanPattern,
  isReference,
  referencesIn,
  latestReference
}
