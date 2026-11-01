import { createHash } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'

import { CliError, EXIT } from './contracts.mjs'

export const MAX_INPUT_BYTES = 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

function decodeUtf8(bytes) {
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new CliError('INPUT_UTF8_INVALID', EXIT.INPUT_INVALID) }
  if (!text.trim()) throw new CliError('INPUT_EMPTY', EXIT.INPUT_INVALID)
  return text
}

async function readBoundedHandle(filePath, maxBytes) {
  const info = await lstat(filePath).catch(() => { throw new CliError('FILE_UNREADABLE', EXIT.INPUT_INVALID) })
  if (!info.isFile() || info.isSymbolicLink()) throw new CliError('FILE_TYPE_INVALID', EXIT.INPUT_INVALID)
  if (info.size > maxBytes) throw new CliError('FILE_SIZE_EXCEEDED', EXIT.INPUT_INVALID)
  const handle = await open(filePath, 'r').catch(() => { throw new CliError('FILE_UNREADABLE', EXIT.INPUT_INVALID) })
  try {
    const stable = await handle.stat()
    if (!stable.isFile() || stable.size !== info.size || stable.size > maxBytes) throw new CliError('FILE_CHANGED_DURING_PREFLIGHT', EXIT.INPUT_INVALID)
    return handle.readFile()
  } finally { await handle.close() }
}

async function readBoundedStdin(stdin, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of stdin) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > maxBytes) throw new CliError('INPUT_SIZE_EXCEEDED', EXIT.INPUT_INVALID)
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

export async function readInput(inputFile, stdin) {
  const bytes = inputFile === '-' ? await readBoundedStdin(stdin, MAX_INPUT_BYTES) : await readBoundedHandle(inputFile, MAX_INPUT_BYTES)
  return decodeUtf8(bytes)
}

export async function preflightAttachment(filePath) {
  const bytes = await readBoundedHandle(filePath, MAX_ATTACHMENT_BYTES)
  const name = path.basename(filePath)
  return Object.freeze({
    bytes,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    originalFilename: name,
    nameBase64Url: Buffer.from(name, 'utf8').toString('base64url'),
  })
}
