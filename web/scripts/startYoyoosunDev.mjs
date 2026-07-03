#!/usr/bin/env node
import { spawn } from 'node:child_process'
import process from 'node:process'

import { normalizeDevCustomerKey } from '../devCustomerConfigPlugin.mjs'
import { resolveAvailablePort } from './localPort.mjs'

function parseArgs(argv) {
  const options = {
    customer: process.env.ERP_CUSTOMER_KEY || 'yoyoosun',
    port: process.env.PORT || '5176',
    apiOrigin: process.env.API_ORIGIN || 'http://127.0.0.1:8300',
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

function printPlan(options) {
  const label = 'start-yoyoosun'
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
      `[${label}] mode=vite dev server with HMR`,
      `[${label}] customer_config publish/activate is not executed`,
      ...verificationLines,
      [
        `ERP_DEV_CUSTOMER_KEY=${options.customer}`,
        `ERP_VITE_PORT=${options.port}`,
        `ERP_VITE_HMR_CLIENT_PORT=${options.port}`,
        'pnpm start',
      ].join(' '),
      '',
    ].join('\n')
  )
}

function runVite(options) {
  const child = spawn('pnpm', ['start'], {
    env: {
      ...process.env,
      ERP_DEV_CUSTOMER_KEY: options.customer,
      ERP_VITE_PORT: options.port,
      ERP_VITE_HMR_CLIENT_PORT: options.port,
    },
    stdio: 'inherit',
  })

  child.on('error', (error) => {
    process.stderr.write(`[start-yoyoosun] ${error.message}\n`)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(0)
    }
    process.exit(code || 0)
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

  runVite(options)
}

main().catch((error) => {
  process.stderr.write(`[start-yoyoosun] ${error.message}\n`)
  process.exit(1)
})
