#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { normalizeDevCustomerKey } from '../dev-server/devCustomerConfigPlugin.mjs'
import { loadDevPorts, validateDevAuxPort } from '../../scripts/dev-ports.mjs'
import { prepareWebInstance, webInstanceSignature } from './devWebInstance.mjs'
import { normalizeAPIOrigin } from '../../scripts/local-runtime-preflight.mjs'
import { writeTerminalMessage } from '../../scripts/terminal-log.mjs'
import {
  runManagedVite,
  resolveDevGitlabCredential,
  resolveWebRuntimeStartup,
  stopLocalWebFrontend,
  writeWebStartupSummary,
} from './startWebDev.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const devPorts = loadDevPorts(repoRoot)

export function parseYoyoosunDevArgs(argv) {
  const options = {
    customer: process.env.ERP_CUSTOMER_KEY || 'yoyoosun',
    port: process.env.PORT || String(devPorts.auxStart),
    apiOrigin: process.env.API_ORIGIN || `http://127.0.0.1:${devPorts.http}`,
    frontendOnly: false,
    printPlan: false,
    restart: false,
    stop: false,
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
    } else if (arg === '--restart') {
      options.restart = true
    } else if (arg === '--stop') {
      options.stop = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  options.customer = normalizeDevCustomerKey(options.customer)
  options.port = String(options.port || '').trim()
  if (!options.stop) options.apiOrigin = normalizeAPIOrigin(options.apiOrigin)
  if (options.stop && options.restart) throw new Error('停止和重启不能同时指定')

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
      `[${label}] port=${options.port}`,
      `[${label}] port policy=fixed; reuse a matching instance or automatically replace an outdated Vite from this workspace`,
      `[${label}] url=http://localhost:${options.port}/erp`,
      `[${label}] backend=${options.apiOrigin}`,
      `[${label}] preflight=${
        options.frontendOnly
          ? 'frontend-only (database/backend explicitly skipped; non-green)'
          : 'database migration + backend health/ready; recoverable local blockers open the restricted migration page'
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
        `API_ORIGIN=${options.apiOrigin}`,
        'pnpm start:yoyoosun',
      ].join(' '),
      '',
    ].join('\n')
  )
}

export function runYoyoosunVite(
  options,
  startup,
  gitlabCredential,
  { run = runManagedVite, env = process.env } = {}
) {
  return run([], startup, gitlabCredential, {
    ...env,
    ERP_DEV_CUSTOMER_KEY: options.customer,
    ERP_VITE_PORT: options.port,
    API_ORIGIN: options.apiOrigin,
    ERP_DEV_START_SIGNATURE: options.signature,
  })
}

async function main() {
  const options = parseYoyoosunDevArgs(process.argv.slice(2))
  const requestedPort = validateDevAuxPort(
    devPorts,
    options.port,
    'start:yoyoosun port'
  )
  options.port = String(requestedPort)

  if (options.stop) {
    await stopLocalWebFrontend(requestedPort)
    return
  }

  if (options.printPlan) {
    printPlan(options)
    return
  }

  const startup = await resolveWebRuntimeStartup(options)
  const gitlabCredential = startup.recoveryMode
    ? { source: 'missing', token: '' }
    : await resolveDevGitlabCredential()
  checkDevCustomerPackage(options.customer)
  options.signature = webInstanceSignature({
    ...options,
    projectRoot: repoRoot,
    customerKey: options.customer,
    viteArgs: [],
  })
  const restartCommand =
    options.port === String(devPorts.auxStart)
      ? 'pnpm restart:yoyoosun'
      : `pnpm start:yoyoosun --restart --port ${options.port}`
  const instance = await prepareWebInstance({
    ...startup,
    port: Number(options.port),
    projectRoot: repoRoot,
    signature: options.signature,
    restart: options.restart,
    replaceStale: true,
    restartCommand,
  })
  writeWebStartupSummary({ startup, port: options.port, customerKey: options.customer, label: 'start-yoyoosun', route: '/erp' })
  if (instance.reused) {
    writeTerminalMessage(
      `[start-yoyoosun] 已复用本工作区前端（PID ${instance.pid}）：http://127.0.0.1:${options.port}/erp`,
      { tone: startup.complete ? 'success' : 'warning' }
    )
    return
  }
  writeTerminalMessage(
    `[start-yoyoosun] 客户配置与公开资源预检通过：${options.customer}`,
    { tone: 'success' }
  )
  if (['file', 'keychain'].includes(gitlabCredential.source)) {
    process.stderr.write(
      '[start-yoyoosun] GitLab 只读凭据已从受控服务端存储加载\n'
    )
  }
  const code = await runYoyoosunVite(options, startup, gitlabCredential)
  // 同时启动时，只有一个 Vite 能占用固定端口；失败者复用已启动的同配置实例。
  if (code === 1 && !options.restart) {
    try {
      const winner = await prepareWebInstance({
        ...startup,
        port: Number(options.port),
        projectRoot: repoRoot,
        signature: options.signature,
        restart: false,
      })
      if (winner.reused) {
        writeTerminalMessage(
          `[start-yoyoosun] 已复用同时启动的本工作区前端（PID ${winner.pid}）：http://127.0.0.1:${options.port}/erp`,
          { tone: startup.complete ? 'success' : 'warning' }
        )
        return
      }
    } catch {
      // 保留 Vite 本次启动失败的退出码与诊断。
    }
  }
  process.exitCode = code
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  main().catch((error) => {
    writeTerminalMessage(`[start-yoyoosun] ${error.message}`, {
      tone: 'error',
      stream: process.stderr,
    })
    process.exit(1)
  })
}
