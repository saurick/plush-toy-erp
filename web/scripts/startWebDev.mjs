#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { loadDevPorts } from '../../scripts/dev-ports.mjs'
import {
  LOCAL_RUNTIME_RECOVERY_MODE,
  isLoopbackAPIOrigin,
  isRecoverableWebRuntimePreflightError,
  runWebRuntimePreflight,
} from '../../scripts/local-runtime-preflight.mjs'
import { resolveDevBrowserLaunchEnv } from './openDevBrowser.js'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const devPorts = loadDevPorts(repoRoot)
const execFileAsync = promisify(execFile)

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
    { encoding: 'utf8', maxBuffer: 1024 }
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

export async function resolveWebRuntimeStartup(
  options,
  {
    preflight = runWebRuntimePreflight,
    writeLine = (line) => process.stderr.write(`${line}\n`),
  } = {}
) {
  try {
    return {
      ...(await preflight(options)),
      recoveryMode: '',
      recoveryReason: '',
    }
  } catch (error) {
    if (
      options.frontendOnly ||
      !isLoopbackAPIOrigin(options.apiOrigin) ||
      !isRecoverableWebRuntimePreflightError(error)
    ) {
      throw error
    }
    writeLine(
      `[start-web] ${error.message}\n[start-web] 已进入数据库迁移恢复模式；只开放恢复页，普通 ERP 页面与 RPC 暂停`
    )
    return {
      complete: false,
      frontendOnly: false,
      apiOrigin: options.apiOrigin,
      recoveryMode: LOCAL_RUNTIME_RECOVERY_MODE,
      recoveryReason: error.code,
    }
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
  if (recoveryMode) {
    childEnvironment.ERP_DEV_RECOVERY_MODE = recoveryMode
    childEnvironment.ERP_DEV_RECOVERY_REASON = recoveryReason
  }
  if (gitlabCredential.token) {
    childEnvironment.PLUSH_GITLAB_READ_TOKEN = gitlabCredential.token
  }
  return childEnvironment
}

function runVite(viteArgs, startup, gitlabCredential) {
  const childEnvironment = createViteChildEnvironment({
    ...startup,
    gitlabCredential,
  })
  const child = spawn(
    'pnpm',
    ['exec', 'vite', '--config', 'vite.config.mjs', ...viteArgs],
    {
      env: childEnvironment,
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
  const startup = await resolveWebRuntimeStartup(options)
  const gitlabCredential = await resolveDevGitlabCredential()
  if (gitlabCredential.source === 'keychain') {
    process.stderr.write('[start-web] GitLab 只读凭据已从 macOS 钥匙串加载\n')
  }
  runVite(options.viteArgs, startup, gitlabCredential)
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
