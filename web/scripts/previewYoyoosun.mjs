#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { normalizeDevCustomerKey } from '../devCustomerConfigPlugin.mjs'
import { resolveAvailablePort } from './localPort.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(webRoot, '..')

function parseArgs(argv) {
  const options = {
    customer: process.env.ERP_CUSTOMER_KEY || 'yoyoosun',
    port: process.env.PORT || '5176',
    apiOrigin: process.env.API_ORIGIN || 'http://127.0.0.1:8300',
    skipBuild: false,
    skipHealthCheck: false,
    printPlan: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--') {
      continue
    } else if (arg === '--customer') {
      options.customer = next || ''
      index += 1
    } else if (arg === '--port') {
      options.port = next || ''
      index += 1
    } else if (arg === '--api-origin') {
      options.apiOrigin = next || ''
      index += 1
    } else if (arg === '--skip-build') {
      options.skipBuild = true
    } else if (arg === '--skip-health-check') {
      options.skipHealthCheck = true
    } else if (arg === '--print-plan') {
      options.printPlan = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  options.customer = normalizeDevCustomerKey(options.customer)
  options.port = String(options.port || '').trim()
  options.apiOrigin = String(options.apiOrigin || '')
    .trim()
    .replace(/\/+$/, '')

  if (!options.customer) {
    throw new Error('customer is required')
  }

  if (!/^\d+$/.test(options.port)) {
    throw new Error(`port must be a number: ${options.port}`)
  }

  if (!options.apiOrigin) {
    throw new Error('api origin is required')
  }

  return options
}

function commandLines(options) {
  const lines = []

  if (!options.skipBuild) {
    lines.push('cd web && pnpm build:all')
  }

  lines.push(
    [
      'node scripts/build/apply-customer-web-config.mjs',
      `--customer ${options.customer}`,
      '--config-root config',
      '--web-build-dir web/build',
    ].join(' ')
  )

  lines.push(
    [
      'cd web &&',
      'APP_ID=desktop',
      `PORT=${options.port}`,
      `API_ORIGIN=${options.apiOrigin}`,
      'pnpm serve:prod',
    ].join(' ')
  )

  return lines
}

function printPlan(options) {
  const label = 'preview-yoyoosun'
  const portNote =
    options.port === options.requestedPort
      ? `[${label}] port=${options.port}`
      : `[${label}] requested port ${options.requestedPort} is occupied; using ${options.port}`
  const verificationLines = [
    `[${label}] verify customer config: curl -fsS http://localhost:${options.port}/customer-config.js | grep 'customerKey: "${options.customer}"'`,
  ]

  if (options.customer === 'yoyoosun') {
    verificationLines.push(
      `[${label}] verify customer asset: curl -fsSI http://localhost:${options.port}/customer-assets/yoyoosun/favicon-yoyoosun.svg | grep -i 'content-type: image/svg+xml'`
    )
  }

  process.stdout.write(
    [
      `[${label}] customer=${options.customer}`,
      portNote,
      `[${label}] url=http://localhost:${options.port}/erp`,
      `[${label}] backend=${options.apiOrigin}`,
      `[${label}] customer_config publish/activate is not executed`,
      ...verificationLines,
      ...commandLines(options).map((line) => `[preview-yoyoosun] ${line}`),
      '',
    ].join('\n')
  )
}

async function checkBackendHealth(apiOrigin) {
  const healthUrl = new URL('/healthz', `${apiOrigin}/`).toString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)

  try {
    const response = await fetch(healthUrl, {
      signal: controller.signal,
    })
    if (!response.ok) {
      process.stdout.write(
        `[preview-yoyoosun] backend health warning: ${healthUrl} returned ${response.status}\n`
      )
      return
    }
    process.stdout.write(`[preview-yoyoosun] backend health ok: ${healthUrl}\n`)
  } catch (error) {
    process.stdout.write(
      `[preview-yoyoosun] backend health warning: ${healthUrl} is not reachable (${error.message})\n`
    )
  } finally {
    clearTimeout(timeout)
  }
}

function runStep(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} exited by ${signal}`))
        return
      }

      if (code !== 0) {
        reject(
          new Error(`${command} ${args.join(' ')} exited with code ${code}`)
        )
        return
      }

      resolve()
    })
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  options.requestedPort = options.port
  options.port = await resolveAvailablePort(options.port)

  printPlan(options)

  if (options.printPlan) {
    return
  }

  if (!options.skipHealthCheck) {
    await checkBackendHealth(options.apiOrigin)
  }

  if (!options.skipBuild) {
    await runStep('pnpm', ['build:all'], {
      cwd: webRoot,
    })
  }

  await runStep(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/build/apply-customer-web-config.mjs'),
      '--customer',
      options.customer,
      '--config-root',
      path.join(repoRoot, 'config'),
      '--web-build-dir',
      path.join(webRoot, 'build'),
    ],
    {
      cwd: repoRoot,
    }
  )

  await runStep('pnpm', ['serve:prod'], {
    cwd: webRoot,
    env: {
      APP_ID: 'desktop',
      PORT: options.port,
      API_ORIGIN: options.apiOrigin,
    },
  })
}

main().catch((error) => {
  process.stderr.write(`[preview-yoyoosun] ${error.message}\n`)
  process.exit(1)
})
