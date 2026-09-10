#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { loadDevPorts } from '../../scripts/dev-ports.mjs'
import {
  LOCAL_RUNTIME_RECOVERY_MODE,
  LOCAL_RUNTIME_PREFLIGHT_TIMEOUT_MS,
  LocalRuntimePreflightError,
  isLoopbackAPIOrigin,
  isRecoverableWebRuntimePreflightError,
  runWebRuntimePreflight,
} from '../../scripts/local-runtime-preflight.mjs'
import { resolveDevBrowserLaunchEnv } from './openDevBrowser.js'
import {
  isCodexDevSession,
  resolveERPHMRClientPort,
  selectWebDevPort,
} from './localPort.mjs'
import { prepareWebInstance, webInstanceSignature } from './devWebInstance.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const devPorts = loadDevPorts(repoRoot)
const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

export const DEV_GITLAB_KEYCHAIN = Object.freeze({
  account: 'simon',
  service: 'plush-toy-erp.gitlab-read-api',
})

function normalizeGitlabToken(value) {
  const token = String(value || '').trim()
  if (!token) return ''
  if (token.length > 512 || /[\r\n]/u.test(token)) {
    throw new Error('GitLab 只读凭据格式无效')
  }
  return token
}

async function readGitlabTokenFromKeychain() {
  const { stdout } = await execFileAsync(
    'security',
    [
      'find-generic-password',
      '-w',
      '-s',
      DEV_GITLAB_KEYCHAIN.service,
      '-a',
      DEV_GITLAB_KEYCHAIN.account,
    ],
    { encoding: 'utf8', maxBuffer: 1024, timeout: 5000 }
  )
  return stdout
}

export async function resolveDevGitlabCredential({
  env = process.env,
  platform = process.platform,
  readKeychain = readGitlabTokenFromKeychain,
} = {}) {
  const inherited = normalizeGitlabToken(env.PLUSH_GITLAB_READ_TOKEN)
  if (inherited) return { source: 'environment', token: inherited }
  if (platform !== 'darwin') return { source: 'missing', token: '' }
  try {
    const token = normalizeGitlabToken(await readKeychain())
    return token
      ? { source: 'keychain', token }
      : { source: 'missing', token: '' }
  } catch (error) {
    if (error?.message === 'GitLab 只读凭据格式无效') throw error
    return { source: 'missing', token: '' }
  }
}

export function parseStartWebDevArgs(argv, env = process.env) {
  const viteArgs = []
  let frontendOnly = false
  let isolated = isCodexDevSession(env)
  let restart = false
  if (argv.includes('--local') && argv.includes('--isolated')) {
    throw new Error('--local 与 --isolated 不能同时使用')
  }
  for (const arg of argv) {
    if (arg === '--frontend-only') {
      frontendOnly = true
    } else if (arg === '--isolated') {
      isolated = true
    } else if (arg === '--local') {
      isolated = false
    } else if (arg === '--restart') {
      restart = true
    } else if (arg !== '--') {
      viteArgs.push(arg)
    }
  }
  return {
    apiOrigin: env.API_ORIGIN || `http://127.0.0.1:${devPorts.http}`,
    frontendOnly,
    isolated,
    restart,
    viteArgs,
  }
}

export async function resolveWebRuntimeStartup(
  options,
  {
    preflight = runWebRuntimePreflight,
    timeoutMs = LOCAL_RUNTIME_PREFLIGHT_TIMEOUT_MS,
    writeLine = (line) => process.stderr.write(`${line}\n`),
  } = {}
) {
  const localBackend = isLoopbackAPIOrigin(options.apiOrigin)
  const controller = new AbortController()
  let timer
  try {
    const checked = await Promise.race([
      preflight(options, { signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new LocalRuntimePreflightError(
              'local_runtime_preflight_timeout',
              '本地运行预检超时；可在迁移恢复页重新检查数据库与后端状态'
            )
          )
          controller.abort()
        }, timeoutMs)
      }),
    ])
    return {
      ...checked,
      recoveryMode: '',
      recoveryReason: '',
    }
  } catch (error) {
    if (options.frontendOnly || !localBackend) {
      throw error
    }
    const recoveryError = isRecoverableWebRuntimePreflightError(error)
      ? error
      : new LocalRuntimePreflightError(
          'local_runtime_preflight_failed',
          '本地运行预检未完成；请在迁移恢复页检查数据库配置、迁移状态和后端'
        )
    writeLine(
      `[start-web] ${recoveryError.message}\n[start-web] 已进入数据库迁移恢复模式；只开放恢复页，普通 ERP 页面与 RPC 暂停`
    )
    return {
      complete: false,
      frontendOnly: false,
      apiOrigin: options.apiOrigin,
      recoveryMode: LOCAL_RUNTIME_RECOVERY_MODE,
      recoveryReason: recoveryError.code,
    }
  } finally {
    clearTimeout(timer)
  }
}

export function createViteChildEnvironment({
  apiOrigin,
  gitlabCredential,
  recoveryMode = '',
  recoveryReason = '',
  env = process.env,
} = {}) {
  const childEnvironment = {
    ...env,
    ...resolveDevBrowserLaunchEnv(env),
    API_ORIGIN: apiOrigin,
  }
  delete childEnvironment.ERP_DEV_RECOVERY_MODE
  delete childEnvironment.ERP_DEV_RECOVERY_REASON
  delete childEnvironment.PLUSH_GITLAB_READ_TOKEN
  if (recoveryMode) {
    childEnvironment.ERP_DEV_RECOVERY_MODE = recoveryMode
    childEnvironment.ERP_DEV_RECOVERY_REASON = recoveryReason
  }
  if (gitlabCredential.token) {
    childEnvironment.PLUSH_GITLAB_READ_TOKEN = gitlabCredential.token
  }
  return childEnvironment
}

export function runManagedVite(
  viteArgs,
  startup,
  gitlabCredential,
  env = process.env
) {
  const childEnvironment = createViteChildEnvironment({
    ...startup,
    gitlabCredential,
    env,
  })
  const viteCLI = path.join(
    path.dirname(require.resolve('vite/package.json')),
    'bin',
    'vite.js'
  )
  const child = spawn(
    process.execPath,
    [
      '--import',
      new URL('./viteParentLifetime.mjs', import.meta.url).href,
      viteCLI,
      '--config',
      'vite.config.mjs',
      ...viteArgs,
    ],
    {
      env: childEnvironment,
      cwd: path.join(repoRoot, 'web'),
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    }
  )
  return new Promise((resolve, reject) => {
    let stoppingSignal = ''
    const handlers = new Map(
      ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [
        signal,
        () => {
          stoppingSignal = signal
          if (child.connected) child.disconnect()
        },
      ])
    )
    const onExit = () => {
      if (child.connected) child.disconnect()
    }
    for (const [signal, handler] of handlers) process.once(signal, handler)
    process.once('exit', onExit)
    child.once('error', reject)
    child.once('close', (code, signal) => {
      for (const [name, handler] of handlers) process.off(name, handler)
      process.off('exit', onExit)
      resolve(stoppingSignal || signal ? 130 : (code ?? 1))
    })
  })
}

async function main() {
  const options = parseStartWebDevArgs(process.argv.slice(2))
  if (options.restart && options.isolated && !process.env.ERP_VITE_PORT) {
    throw new Error(
      '重启需要明确端口；本地前端使用 pnpm start --local --restart'
    )
  }
  const port = await selectWebDevPort({
    ports: devPorts,
    isolated: options.isolated,
  })
  const hmrClientPort = resolveERPHMRClientPort(
    process.env.ERP_VITE_HMR_CLIENT_PORT,
    port
  )
  const startup = await resolveWebRuntimeStartup(options)
  const gitlabCredential = startup.recoveryMode
    ? { source: 'missing', token: '' }
    : await resolveDevGitlabCredential()
  const signature = webInstanceSignature({
    ...options,
    projectRoot: repoRoot,
    customerKey: process.env.ERP_DEV_CUSTOMER_KEY || '',
  })
  const instance = await prepareWebInstance({
    ...startup,
    port,
    signature,
    projectRoot: repoRoot,
    restart: options.restart,
  })
  const url = `http://127.0.0.1:${port}${startup.recoveryMode ? '/__dev/database-migration' : '/'}`
  if (instance.reused) {
    process.stdout.write(
      `[start-web] 已复用本工作区前端（PID ${instance.pid}）：${url}\n[start-web] 服务继续由原终端管理；需要重新加载启动配置时执行 pnpm start --restart\n`
    )
    return
  }
  process.stdout.write(
    `[start-web] ${options.isolated ? '临时验证' : '本地开发'}：${url}\n`
  )
  if (gitlabCredential.source === 'keychain') {
    process.stderr.write('[start-web] GitLab 只读凭据已从 macOS 钥匙串加载\n')
  }
  const code = await runManagedVite(
    options.viteArgs,
    startup,
    gitlabCredential,
    {
      ...process.env,
      ERP_VITE_PORT: String(port),
      ERP_VITE_HMR_CLIENT_PORT: String(hmrClientPort),
      ERP_DEV_START_SIGNATURE: signature,
      ...(isCodexDevSession() && !process.env.BROWSER
        ? { BROWSER: 'none' }
        : {}),
    }
  )
  // 两个启动命令可能同时通过空闲探测；只有胜出的同配置服务可被复用。
  if (code === 1) {
    try {
      const winner = await prepareWebInstance({
        ...startup,
        port,
        signature,
        projectRoot: repoRoot,
        restart: false,
      })
      if (winner.reused) {
        process.stdout.write(
          `[start-web] 已复用同时启动的本工作区前端：${url}\n`
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
    process.stderr.write(`[start-web] ${error.message}\n`)
    process.exit(1)
  })
}
