#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { loadDevPorts } from '../../scripts/dev-ports.mjs'
import { runWebRuntimePreflight } from '../../scripts/local-runtime-preflight.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const devPorts = loadDevPorts(repoRoot)

export function parseStartWebDevArgs(argv, env = process.env) {
  const viteArgs = []
  let frontendOnly = false
  for (const arg of argv) {
    if (arg === '--frontend-only') {
      frontendOnly = true
    } else if (arg !== '--') {
      viteArgs.push(arg)
    }
  }
  return {
    apiOrigin: env.API_ORIGIN || `http://127.0.0.1:${devPorts.http}`,
    frontendOnly,
    viteArgs,
  }
}

function runVite(viteArgs, apiOrigin) {
  const child = spawn(
    'pnpm',
    ['exec', 'vite', '--config', 'vite.config.mjs', ...viteArgs],
    {
      env: { ...process.env, API_ORIGIN: apiOrigin },
      stdio: 'inherit',
    }
  )
  child.on('error', (error) => {
    process.stderr.write(`[start-web] ${error.message}\n`)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code || 0)
  })
}

async function main() {
  const options = parseStartWebDevArgs(process.argv.slice(2))
  const result = await runWebRuntimePreflight(options)
  runVite(options.viteArgs, result.apiOrigin)
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`[start-web] ${error.message}\n`)
    process.exit(1)
  })
}
