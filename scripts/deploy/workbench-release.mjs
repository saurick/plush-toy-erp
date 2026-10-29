import { cp, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import target from '../../server/deploy/workbench/target.json' with { type: 'json' }
import { assertLocalRsync } from './fixed-target-rsync.mjs'
import { digestFile, inventoryWorkbench, sealWorkbenchArtifact, sha256, verifyWorkbenchArtifact } from './workbench-artifact.mjs'

const SERVICE = 'plush-workbench-test.service'
const RELEASE_KEY = /^[a-f0-9]{16}-[a-f0-9-]{36}$/u
const TERMINAL = new Set(['passed', 'failed', 'blocked', 'not_proven', 'cancelled', 'timed_out'])
const SSH = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', target.sshHost]

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim()
  } catch { throw new Error(`工作台发布步骤执行失败：${path.basename(command)}`) }
}

function assertHost() {
  const addresses = Object.values(os.networkInterfaces()).flat().map((item) => item.address)
  if (process.platform !== 'linux' || os.hostname().split('.')[0] !== target.hostname ||
    !addresses.includes(target.bindAddress) || process.getuid?.() !== 0) throw new Error('当前主机不匹配登记的独立工作台目标')
}

async function assertPlainDirectory(directory) {
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('发布目录必须为普通目录')
}

export async function inspectWorkbenchState(releaseRoot) {
  const output = path.join(releaseRoot, 'output')
  if (!existsSync(output)) return []
  await assertPlainDirectory(output)
  const top = await readdir(output)
  if (top.some((name) => !['dev-workbench', 'dev-customer-config-operations', 'qa', 'playwright'].includes(name))) throw new Error('存在未确认归属的 output，保留现场')
  const entries = await inventoryWorkbench(output, { state: true })
  for (const entry of entries) {
    if (/(?:^|\/)(?:[^/]*[.-])?lock(?:[./-]|$)/iu.test(entry.path)) throw new Error('存在执行锁，工作台不能切换')
    if (/(?:^|\/)operations\/[^/]+\.json$/u.test(entry.path)) {
      const operation = JSON.parse(await readFile(path.join(output, entry.path), 'utf8'))
      if (!TERMINAL.has(operation.status)) throw new Error('存在未结束或未知操作，工作台不能切换')
    }
  }
  return entries
}

async function inspectRuntime(root) {
  const envFile = path.join(root, 'runtime/workbench.env')
  const stat = await lstat(envFile)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid()) throw new Error('运行 env 身份或权限不符合合同')
  const content = await readFile(envFile, 'utf8')
  if (/^\s*(?:export\s+)?PLUSH_[A-Z_]*(?:STORE|STORE_REPO_ROOT)[A-Z_]*\s*=/mu.test(content)) throw new Error('存在外部 store override，须先核清状态归属')
}

const runtime = {
  assertHost,
  async inspectService() {
    const environment = run('systemctl', ['show', SERVICE, '--property=Environment', '--value'])
    const files = run('systemctl', ['show', SERVICE, '--property=EnvironmentFiles', '--value'])
    const executable = run('systemctl', ['show', SERVICE, '--property=ExecStart', '--value'])
    if (/PLUSH_[A-Z_]*STORE[A-Z_]*=/u.test(environment) || files !== `${target.root}/runtime/workbench.env (ignore_errors=no)`) throw new Error('服务配置存在额外状态来源，须先核清')
    if (!executable.includes(`${target.root}/current/toolchain/bin/node`)) throw new Error('服务须使用 current 内固定 Node 制品')
    if (!environment.split(/\s+/u).some((value) => value.replace(/^"|"$/gu, '').startsWith(`PATH=${target.root}/current/toolchain/bin:`))) {
      throw new Error('服务子进程 PATH 须优先使用 current 内固定工具链')
    }
  },
  stop: async () => run('systemctl', ['stop', SERVICE]),
  start: async () => run('systemctl', ['start', SERVICE]),
  async health() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const response = await fetch(`http://${target.bindAddress}:${target.port}/healthz`, { signal: AbortSignal.timeout(1000) })
        if (response.ok) return await response.json()
      } catch { /* Bounded readback during service startup, never a write retry. */ }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error('独立工作台健康读取失败')
  },
  async publicCheck() {
    const options = { redirect: 'manual', signal: AbortSignal.timeout(15_000) }
    const login = await fetch(`${target.httpsOrigin}/__dev/login`, options)
    const api = await fetch(`${target.httpsOrigin}/__dev/api/delivery/summary`, options)
    if (login.status !== 200 || api.status !== 401 || api.headers.get('x-plush-workbench-auth') !== 'required') throw new Error('公网登录或未登录 API 边界读回失败')
  },
}

async function switchCurrent(root, link, id) {
  const temporary = path.join(root, `.current-${id}`)
  await symlink(link, temporary)
  await rename(temporary, path.join(root, 'current'))
}

function runtimeMatchesArtifact(health, manifest) {
  return health?.status === 'ok' && health.maintenance === true &&
    health.activeWrites === 0 && health.artifactId === manifest.artifactId &&
    health.sourceSha === manifest.repository.commit && health.nodeVersion === manifest.nodeVersion
}

// The CLI fixes the target. Injection is only for isolated lifecycle regression tests.
export async function activateWorkbench({ input: requestedInput, root: requestedRoot = target.root, services = runtime }) {
  services.assertHost()
  const root = await realpath(requestedRoot)
  const input = await realpath(requestedInput)
  await assertPlainDirectory(root)
  await assertPlainDirectory(path.join(root, 'runtime'))
  await assertPlainDirectory(path.join(root, 'releases'))
  await inspectRuntime(root)
  await services.inspectService?.()
  const manifest = await verifyWorkbenchArtifact(input)
  const currentLink = await readlink(path.join(root, 'current'))
  if (!/^releases\/[a-f0-9-]+$/u.test(currentLink)) throw new Error('current 不属于登记的 releases，保留现场')
  const previous = await realpath(path.join(root, 'current'))
  if (!previous.startsWith(`${path.join(root, 'releases')}${path.sep}`)) throw new Error('current 指向登记目录之外')
  const previousManifest = await verifyWorkbenchArtifact(previous)
  const id = randomUUID()
  const releaseKey = `${manifest.artifactId.slice(0, 16)}-${id}`
  const candidate = path.join(root, 'releases', releaseKey)
  const marker = path.join(root, 'runtime/release.lock')
  await mkdir(marker, { mode: 0o700 })
  let stopAttempted = false
  let switched = false
  let mayUnlock = true
  let stage = 'maintenance-check'
  const receipt = { kind: 'plush.workbench-release-receipt', id, target: target.key,
    artifactId: manifest.artifactId, sourceSha: manifest.repository.commit,
    previous: currentLink, candidate: `releases/${releaseKey}`, startedAt: new Date().toISOString() }
  try {
    await writeFile(path.join(marker, 'owner.json'), JSON.stringify({ id, pid: process.pid }), { flag: 'wx', mode: 0o600 })
    const health = await services.health()
    if (health.maintenance !== true || health.activeWrites !== 0) throw new Error('工作台未静止或仍有写请求；本次未停服')
    await inspectWorkbenchState(previous)
    // Pre-copy and verify immutable inputs while reads stay available.
    stage = 'candidate-copy'
    await cp(input, candidate, { recursive: true, force: false, errorOnExist: true,
      filter: (source) => source !== path.join(input, 'output') })
    await verifyWorkbenchArtifact(candidate)
    // A failed stop response can still mean the service was stopped.
    stage = 'stop-service'
    stopAttempted = true
    await services.stop()
    stage = 'preserve-state'
    const state = await inspectWorkbenchState(previous)
    if (state.length) await cp(path.join(previous, 'output'), path.join(candidate, 'output'), { recursive: true, force: false, errorOnExist: true })
    const copied = await inspectWorkbenchState(candidate)
    if (JSON.stringify(copied) !== JSON.stringify(state)) throw new Error('状态保全摘要不一致')
    receipt.stateFiles = state.filter((entry) => !entry.directory).length
    receipt.stateSha256 = sha256(JSON.stringify(state))
    if (await readlink(path.join(root, 'current')) !== currentLink) throw new Error('current 在切换前变化')
    stage = 'switch-current'
    await switchCurrent(root, `releases/${releaseKey}`, id)
    switched = true
    stage = 'start-service'
    await services.start()
    stage = 'runtime-readback'
    const after = await services.health()
    if (!runtimeMatchesArtifact(after, manifest)) throw new Error('新版本运行身份未读回')
    stage = 'public-readback'
    await services.publicCheck()
    receipt.status = 'passed'
  } catch (error) {
    receipt.status = 'failed'
    receipt.failedStage = stage
    receipt.reason = error.message
    if (stopAttempted) {
      mayUnlock = false
      try {
        if (switched) {
          await services.stop()
          await switchCurrent(root, currentLink, `${id}-restore`)
        }
        await services.start()
        const restored = await services.health()
        if (!runtimeMatchesArtifact(restored, previousManifest)) throw new Error('原服务运行身份未读回')
        await services.publicCheck()
        receipt.previousServiceRestored = true
        mayUnlock = true
      } catch (recoveryError) {
        receipt.previousServiceRestored = false
        receipt.recoveryReason = recoveryError.message
      }
    }
  } finally {
    receipt.finishedAt = new Date().toISOString()
    await writeFile(path.join(root, 'runtime', `release-${id}.json`), `${JSON.stringify(receipt)}\n`, { flag: 'wx', mode: 0o600 })
    if (mayUnlock) await rm(marker, { recursive: true })
  }
  return receipt
}

export async function transferWorkbench(input, manifest, { execute = false } = {}) {
  const incomingId = randomUUID()
  const destination = `${target.root}/incoming/${incomingId}`
  const script = `set -eu\n[ "$(hostname -s)" = '${target.hostname}' ]\n[ "$(id -u)" = 0 ]\n[ ! -e '${destination}' ]\nmkdir -m 700 '${destination}'\n`
  const args = ['--archive', '--no-owner', '--no-group', '--protect-args', '--timeout=600',
    '--exclude=/output/',
    '--rsh=ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8',
    '--', `${path.resolve(input)}/`, `${target.sshHost}:${destination}/`]
  if (!execute) return { target: target.key, artifactId: manifest.artifactId, sourceSha: manifest.repository.commit, remoteWrites: false }
  assertLocalRsync()
  run('ssh', [...SSH, 'bash -s'], { input: script })
  run('rsync', args)
  // Verify the uploaded executable before using it to verify the entire tree.
  const manifestHash = await digestFile(path.join(input, 'web/build-workbench/.workbench-artifact.json'))
  const checksums = [...manifest.entries.filter((entry) => entry.sha256).map((entry) => `${entry.sha256}  ${entry.path}`),
    `${manifestHash}  web/build-workbench/.workbench-artifact.json`].join('\n')
  const remote = `set -eu\ncd '${destination}'\nsha256sum --check --strict --quiet <<'PLUSH_WORKBENCH_CHECKSUMS'\n${checksums}\nPLUSH_WORKBENCH_CHECKSUMS\n[ "$(toolchain/bin/node --version)" = 'v${manifest.nodeVersion}' ]\nexec toolchain/bin/node scripts/deploy/workbench-release.mjs activate --input '${destination}' --artifact '${manifest.artifactId}' --execute\n`
  return JSON.parse(run('ssh', [...SSH, 'bash -s'], { input: remote }))
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args
  if (!command || command === '--help') {
    return { usage: 'node scripts/deploy/workbench-release.mjs seal|verify|deploy --input <prepared-release> [--execute]; rollback --release <release-key> [--execute]',
      target: target.key, note: '仅 seal --execute 写本机制品清单；deploy/rollback --execute 才操作固定目标。目标机不构建或安装依赖。' }
  }
  const options = {}
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i]
    if (key === '--execute') { if (options.execute) throw new Error('重复执行参数'); options.execute = true }
    else if (['--input', '--release', '--artifact'].includes(key) && rest[i + 1] && !Object.hasOwn(options, key)) options[key] = rest[++i]
    else throw new Error('工作台发布参数无效')
  }
  if (!['seal', 'verify', 'deploy', 'activate', 'rollback'].includes(command)) throw new Error('工作台发布动作无效')
  if (command === 'rollback') {
    if (!RELEASE_KEY.test(options['--release'] || '') || options['--input'] || options['--artifact']) throw new Error('回滚版本必须为精确 release key')
    if (!options.execute) return { target: target.key, release: options['--release'], remoteWrites: false }
    return JSON.parse(run('ssh', [...SSH, 'bash -s'], { input: `set -eu\ncd '${target.root}/current'\nexec toolchain/bin/node scripts/deploy/workbench-release.mjs activate --input '${target.root}/releases/${options['--release']}' --execute\n` }))
  }
  if (!options['--input'] || options['--release']) throw new Error('必须指定已准备的制品目录')
  const input = await realpath(options['--input'])
  if (command === 'seal') {
    if (!options.execute) return { target: target.key, source: await inspectSourcePlan(input), remoteWrites: false }
    const sealed = await sealWorkbenchArtifact(input)
    return { target: target.key, artifactId: sealed.artifactId, sourceSha: sealed.repository.commit, files: sealed.entries.length, status: 'passed' }
  }
  const manifest = await verifyWorkbenchArtifact(input)
  if (options['--artifact'] && options['--artifact'] !== manifest.artifactId) throw new Error('上传制品与已审阅摘要不一致')
  if (command === 'verify') return { target: target.key, artifactId: manifest.artifactId, sourceSha: manifest.repository.commit, status: 'passed' }
  if (command === 'deploy') return transferWorkbench(input, manifest, { execute: options.execute })
  if (!options.execute) return { target: target.key, artifactId: manifest.artifactId, remoteWrites: false }
  assertHost()
  if (!input.startsWith(`${target.root}/incoming/`) && !input.startsWith(`${target.root}/releases/`)) throw new Error('激活输入不属于固定目标')
  return activateWorkbench({ input })
}

async function inspectSourcePlan(input) {
  const { inspectWorkbenchSource } = await import('./workbench-artifact.mjs')
  return inspectWorkbenchSource(input)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await main()
    console.log(JSON.stringify(result))
    if (result.status === 'failed') process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({ status: 'blocked', message: error.message }))
    process.exitCode = 1
  }
}
