#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { normalizeDevCustomerKey } from '../devCustomerConfigPlugin.mjs'
import {
  loadDevPorts,
  validateDevAuxPort,
} from '../../scripts/dev-ports.mjs'
import { resolveAvailablePort } from './localPort.mjs'
import {
  normalizeAPIOrigin,
  runWebRuntimePreflight,
} from '../../scripts/local-runtime-preflight.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const devPorts = loadDevPorts(repoRoot)

function parseArgs(argv) {
  const options = {
    customer: process.env.ERP_CUSTOMER_KEY || 'yoyoosun',
    port: process.env.PORT || String(devPorts.auxStart),
    apiOrigin:
      process.env.API_ORIGIN || `http://127.0.0.1:${devPorts.http}`,
    frontendOnly: false,
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
    } else if (arg === '--frontend-only') {
      options.frontendOnly = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  options.customer = normalizeDevCustomerKey(options.customer)
  options.port = String(options.port || '').trim()
  options.apiOrigin = normalizeAPIOrigin(options.apiOrigin)

  if (!options.customer) {
    throw new Error('customer is required')
  }

  if (!/^\d+$/.test(options.port)) {
    throw new Error(`port must be a number: ${options.port}`)
  }

  return options
}

export function checkDevCustomerPackage(customer, projectRoot = repoRoot) {
  const customerKey = normalizeDevCustomerKey(customer)
  const customerDir = path.join(projectRoot, 'config', 'customers', customerKey)
  const configPath = path.join(customerDir, 'customer-config.example.js')
  const faviconPath = path.join(
    customerDir,
    'public-assets',
    `favicon-${customerKey}.svg`
  )

  if (!existsSync(configPath)) {
    throw new Error(
      `客户配置源不存在：config/customers/${customerKey}/customer-config.example.js`
    )
  }
  const configSource = readFileSync(configPath, 'utf8')
  if (!configSource.includes(`customerKey: "${customerKey}"`)) {
    throw new Error(`客户配置源未声明 customerKey=${customerKey}`)
  }
  if (!existsSync(faviconPath) || statSync(faviconPath).size <= 0) {
    throw new Error(
      `客户公开资源不存在：public-assets/favicon-${customerKey}.svg`
    )
  }

  return { customerKey, configPath, faviconPath }
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
      `[${label}] preflight=${
        options.frontendOnly
          ? 'frontend-only (database/backend explicitly skipped; non-green)'
          : 'database migration + backend health/ready + customer config/assets'
      }`,
      `[${label}] mode=vite dev server with HMR`,
      `[${label}] customer_config publish/activate is not executed`,
      `[${label}] backend customer context=restart with "cd ../server && make dev_restart" when 8300 was not started for yoyoosun (local default=yoyoosun; local-test gate enabled; explicit demo override remains available)`,
      `[${label}] desktop fallback=same-key builtin RBAC is local preview only; customer business pages still require an active revision`,
      `[${label}] local config sync=http://127.0.0.1:${options.port}/__dev/customer-config?customer=${options.customer}&view=import&action=test-apply (login, review, then apply explicitly)`,
      ...verificationLines,
      [
        `ERP_DEV_CUSTOMER_KEY=${options.customer}`,
        `ERP_VITE_PORT=${options.port}`,
        `ERP_VITE_HMR_CLIENT_PORT=${options.port}`,
        `API_ORIGIN=${options.apiOrigin}`,
        'pnpm start:yoyoosun',
      ].join(' '),
      '',
    ].join('\n')
  )
}

function runVite(options) {
  const child = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.mjs'], {
    env: {
      ...process.env,
      ERP_DEV_CUSTOMER_KEY: options.customer,
      ERP_VITE_PORT: options.port,
      ERP_VITE_HMR_CLIENT_PORT: options.port,
      API_ORIGIN: options.apiOrigin,
    },
    stdio: 'inherit',
  })

  child.on('error', (error) => {
    process.stderr.write(`[start-yoyoosun] ${error.message}\n`)
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
  const options = parseArgs(process.argv.slice(2))
  const requestedPort = validateDevAuxPort(
    devPorts,
    options.port,
    'start:yoyoosun port'
  )
  options.requestedPort = String(requestedPort)
  options.port = await resolveAvailablePort(
    requestedPort,
    devPorts.auxStart + 100 - requestedPort
  )

  printPlan(options)

  if (options.printPlan) {
    return
  }

  await runWebRuntimePreflight(options)
  checkDevCustomerPackage(options.customer)
  process.stdout.write(
    `[start-yoyoosun] 客户配置与公开资源预检通过：${options.customer}\n`
  )
  runVite(options)
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`[start-yoyoosun] ${error.message}\n`)
    process.exit(1)
  })
}
