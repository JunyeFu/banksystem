'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function listFiles(root) {
  const files = []
  const visit = directory => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push(absolute)
      else throw new Error(`unsupported runtime entry: ${absolute}`)
    }
  }
  visit(root)
  return files
}

function hashRuntimeTree(root) {
  const resolvedRoot = path.resolve(root)
  const aggregate = crypto.createHash('sha256')
  let totalBytes = 0
  const files = listFiles(resolvedRoot)
  for (const absolute of files) {
    const relative = path.relative(resolvedRoot, absolute).split(path.sep).join('/')
    const stat = fs.statSync(absolute)
    const fileHash = sha256File(absolute)
    aggregate.update(`${relative}\0${stat.size}\0${fileHash}\n`, 'utf8')
    totalBytes += stat.size
  }
  return {
    algorithm: 'sha256(sorted-posix-relative-path\\0byte-length\\0file-sha256\\n)',
    sha256: aggregate.digest('hex'),
    fileCount: files.length,
    totalBytes
  }
}

module.exports = { hashRuntimeTree, listFiles, sha256File }
