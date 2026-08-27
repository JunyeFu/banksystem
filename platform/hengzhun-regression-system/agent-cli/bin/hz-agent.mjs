#!/usr/bin/env node
import process from 'node:process'

import { runCli } from '../src/headless-app.mjs'
import { createLazyEnvironmentService } from '../src/production-service.mjs'

const abortController = new AbortController()
process.once('SIGINT', () => abortController.abort())
process.exitCode = await runCli(process.argv.slice(2), {
  service: createLazyEnvironmentService(),
  signal: abortController.signal,
})
