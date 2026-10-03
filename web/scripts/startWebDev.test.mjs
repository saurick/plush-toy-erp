import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { createERPViteConfig } from '../vite.shared.mjs'
import {
  DEV_GITLAB_KEYCHAIN,
  devGitlabCredentialFilePath,
  readGitlabTokenFromFile,
  createViteChildEnvironment,
  parseStartWebDevArgs,
  resolveDevGitlabCredential,
  resolveWebRuntimeStartup,
  startStoppedLocalBackend,
  stopLocalWebFrontend,
} from './startWebDev.mjs'
import { parseYoyoosunDevArgs } from './startYoyoosunDev.mjs'
import {
  LOCAL_RUNTIME_RECOVERY_MODE,
  LocalRuntimePreflightError,
} from '../../scripts/local-runtime-preflight.mjs'

test('start web dev: 默认启用共享 runtime preflight', () => {
  assert.deepEqual(parseStartWebDevArgs([], {}), {
    apiOrigin: 'http://127.0.0.1:8300',
    frontendOnly: false,
    isolated: false,
    restart: false,
    stop: false,
    skipLifecycle: false,
    viteArgs: [],
  })
})

test('start web dev: pnpm lifecycle stop is explicit, local and never forwarded to Vite', () => {
  const options = parseStartWebDevArgs(['--local', '--stop'], {
    CODEX_THREAD_ID: 'fixture',
  })
  assert.equal(options.stop, true)
  assert.equal(options.isolated, false)
  assert.equal(options.restart, false)
  assert.deepEqual(options.viteArgs, [])
})

test('stop skips database, runtime startup and credentials while retaining owned Vite checks', async () => {
  const startup = await resolveWebRuntimeStartup({ stop: true, apiOrigin: 'unavailable' }, {
    preflight: () => assert.fail('stop must not inspect the database'),
    startBackend: () => assert.fail('stop must not start the backend'),
  })
  assert.equal(startup.recoveryMode, '')
  const stops = []
  const lines = []
  await stopLocalWebFrontend(15200, { projectRoot: '/fixture', stop: async (port, root) => stops.push({ port, root }), writeLine: (line) => lines.push(line) })
  assert.deepEqual(stops, [{ port: 15200, root: '/fixture/web' }])
  assert.match(lines[0], /后端独立管理/u)
  assert.equal(parseYoyoosunDevArgs(['--stop', '--port', '15201']).stop, true)
  assert.throws(() => parseYoyoosunDevArgs(['--stop', '--restart']), /不能同时/u)
})

test('the actual pnpm restart lifecycle performs exactly one restart operation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-pnpm-restart-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const entry = pathToFileURL(path.join(import.meta.dirname, 'startWebDev.mjs')).href
  fs.writeFileSync(path.join(root, 'trace.mjs'), `import {parseStartWebDevArgs} from ${JSON.stringify(entry)}; if(!parseStartWebDevArgs(process.argv.slice(2)).skipLifecycle) console.log('ACTUAL_ACTION='+process.env.npm_lifecycle_event);\n`)
  const { packageManager } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'plush-restart-fixture', version: '1.0.0', packageManager, scripts: { stop: 'node trace.mjs --local --stop', restart: 'node trace.mjs --local --restart', start: 'node trace.mjs', 'start:restart': 'node trace.mjs --local --restart' } }))
  const execute = promisify(execFile)
  for (const command of ['restart', 'start:restart']) {
    const { stdout } = await execute('pnpm', [command], { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, timeout: 30_000 })
    assert.deepEqual(stdout.match(/ACTUAL_ACTION=\S+/gu), [`ACTUAL_ACTION=${command}`])
  }
  for (const command of ['start', 'stop']) {
    const { stdout } = await execute('pnpm', [command], { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, timeout: 30_000 })
    assert.deepEqual(stdout.match(/ACTUAL_ACTION=\S+/gu), [`ACTUAL_ACTION=${command}`])
  }
})

test('real frontend stop needs no database and preserves a foreign Vite process', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-web-stop-'))
  const children = []
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && !child.signalCode) {
        child.kill('SIGTERM')
        await once(child, 'close')
      }
    }
    fs.rmSync(root, { recursive: true, force: true })
  })
  const start = async (name) => {
    const projectRoot = path.join(root, name)
    const web = path.join(projectRoot, 'web')
    const entry = path.join(web, 'node_modules/vite/bin/vite.js')
    fs.mkdirSync(path.dirname(entry), { recursive: true })
    fs.writeFileSync(entry, "const s=require('node:http').createServer((q,r)=>r.end('fixture'));s.listen(0,'127.0.0.1',()=>console.log('PORT='+s.address().port));\n")
    const child = spawn(process.execPath, [entry], { cwd: web, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('fixture did not start')), 5000)
      child.once('error', reject)
      child.stdout.once('data', (chunk) => { clearTimeout(timer); resolve(Number(String(chunk).match(/PORT=(\d+)/u)?.[1])) })
    })
    return { projectRoot, child, port }
  }
  const owned = await start('owned')
  const foreign = await start('foreign')
  await assert.rejects(stopLocalWebFrontend(foreign.port, { projectRoot: owned.projectRoot, writeLine: () => {} }), /其他程序或工作区/u)
  await stopLocalWebFrontend(owned.port, { projectRoot: owned.projectRoot, writeLine: () => {} })
  assert.equal(foreign.child.exitCode, null)
  assert.equal((await fetch(`http://127.0.0.1:${foreign.port}`)).status, 200)
  await assert.rejects(fetch(`http://127.0.0.1:${owned.port}`))
})

test('start web dev: frontend-only 必须显式启用且保留 Vite 参数', () => {
  assert.deepEqual(
    parseStartWebDevArgs(['--', '--frontend-only', '--host', '127.0.0.1'], {
      API_ORIGIN: 'http://localhost:8300',
    }),
    {
      apiOrigin: 'http://localhost:8300',
      frontendOnly: true,
      isolated: false,
      restart: false,
      stop: false,
      skipLifecycle: false,
      viteArgs: ['--host', '127.0.0.1'],
    }
  )
  assert.equal(
    parseStartWebDevArgs([], { ERP_FRONTEND_ONLY: '1' }).frontendOnly,
    false,
    '遗留 shell 环境不能把普通 pnpm start 静默降级'
  )
})

test('start web dev: pending migration 启动受限恢复页而不是退出', async () => {
  const output = []
  const startup = await resolveWebRuntimeStartup(
    {
      apiOrigin: 'http://127.0.0.1:8300',
      frontendOnly: false,
      viteArgs: [],
    },
    {
      preflight: async () => {
        throw new LocalRuntimePreflightError(
          'database_migration_pending',
          'pending=1'
        )
      },
      writeLine: (line) => output.push(line),
      startBackend: async () => assert.fail('待迁移时不能启动后端'),
    }
  )

  assert.equal(startup.complete, false)
  assert.equal(startup.recoveryMode, LOCAL_RUNTIME_RECOVERY_MODE)
  assert.equal(startup.recoveryReason, 'database_migration_pending')
  assert.match(
    output.join('\n'),
    /业务入口保留原地址.*服务不可用提示.*RPC 暂停/u
  )
})

test('start web dev: 未分类的本地预检错误仍可进入恢复页且不泄露原始错误', async () => {
  const output = []
  const startup = await resolveWebRuntimeStartup(
    {
      apiOrigin: 'http://127.0.0.1:8300',
      frontendOnly: false,
      viteArgs: [],
    },
    {
      preflight: async () => {
        throw new Error('postgres://user:private-secret@example.com/db')
      },
      writeLine: (line) => output.push(line),
    }
  )
  assert.equal(startup.complete, false)
  assert.equal(startup.recoveryMode, LOCAL_RUNTIME_RECOVERY_MODE)
  assert.equal(startup.recoveryReason, 'local_runtime_preflight_failed')
  assert.doesNotMatch(output.join('\n'), /private-secret|postgres:\/\//u)
})

test('start web dev: recovery 环境显式覆盖且普通启动清除遗留值', () => {
  const credential = { source: 'missing', token: '' }
  const recovery = createViteChildEnvironment({
    apiOrigin: 'http://127.0.0.1:8300',
    gitlabCredential: credential,
    recoveryMode: LOCAL_RUNTIME_RECOVERY_MODE,
    recoveryReason: 'database_migration_pending',
    env: { ERP_DEV_RECOVERY_MODE: 'stale', BROWSER: 'none' },
  })
  assert.equal(recovery.ERP_DEV_RECOVERY_MODE, LOCAL_RUNTIME_RECOVERY_MODE)
  assert.equal(recovery.ERP_DEV_RECOVERY_REASON, 'database_migration_pending')

  const normal = createViteChildEnvironment({
    apiOrigin: 'http://127.0.0.1:8300',
    gitlabCredential: credential,
    env: { ERP_DEV_RECOVERY_MODE: 'stale', BROWSER: 'none' },
  })
  assert.equal(Object.hasOwn(normal, 'ERP_DEV_RECOVERY_MODE'), false)
  assert.equal(Object.hasOwn(normal, 'ERP_DEV_RECOVERY_REASON'), false)
})

test('start web dev: 所有本地数据库预检阻断保留恢复入口', async () => {
  for (const code of [
    'workspace_migration_invalid',
    'database_config_unavailable',
    'database_status_unavailable',
    'database_programmability_blocked',
    'local_backend_unavailable',
  ]) {
    const startup = await resolveWebRuntimeStartup(
      { apiOrigin: 'http://127.0.0.1:8300' },
      {
        preflight: async () => {
          throw new LocalRuntimePreflightError(code, '检查未通过')
        },
        writeLine: () => {},
        startBackend: async () => false,
      }
    )
    assert.equal(startup.recoveryReason, code)
    assert.equal(startup.recoveryMode, LOCAL_RUNTIME_RECOVERY_MODE)
    assert.equal(startup.complete, false)
  }
})

test('start web dev: 预检卡住时取消命令并按时开放恢复页', async () => {
  let signal
  const startup = await resolveWebRuntimeStartup(
    { apiOrigin: 'http://127.0.0.1:8300' },
    {
      timeoutMs: 5,
      preflight: async (_, runtime) => {
        signal = runtime.signal
        await new Promise(() => {})
      },
      writeLine: () => {},
      startBackend: async () => assert.fail('预检超时不能启动后端'),
    }
  )
  assert.equal(signal.aborted, true)
  assert.equal(startup.recoveryReason, 'local_runtime_preflight_timeout')
  assert.equal(startup.recoveryMode, LOCAL_RUNTIME_RECOVERY_MODE)
})

test('start web dev: 冷启动只启动一次后端，再通过完整预检开放业务', async () => {
  const calls = []
  let ready = false
  const startup = await resolveWebRuntimeStartup(
    { apiOrigin: 'http://127.0.0.1:8300' },
    {
      isPortAvailable: async () => !ready,
      preflight: async (_options, runtime) => {
        calls.push('preflight')
        assert.equal(runtime.endpointTimeoutMs, ready ? undefined : 1000)
        if (!ready) {
          throw new LocalRuntimePreflightError(
            'local_backend_unavailable',
            '未启动'
          )
        }
        return { complete: true, apiOrigin: 'http://127.0.0.1:8300' }
      },
      startBackend: async () => {
        calls.push('start')
        ready = true
        return true
      },
    }
  )
  assert.deepEqual(calls, ['preflight', 'start', 'preflight'])
  assert.equal(startup.complete, true)
  assert.equal(startup.recoveryMode, '')
})

test('start web dev: 冷启动构建不受只读预检时限截断', async () => {
  let checks = 0
  const startup = await resolveWebRuntimeStartup(
    { apiOrigin: 'http://127.0.0.1:8300' },
    {
      timeoutMs: 20,
      preflight: async () => {
        checks++
        if (checks === 1) {
          throw new LocalRuntimePreflightError(
            'local_backend_unavailable',
            '未启动'
          )
        }
        return { complete: true }
      },
      startBackend: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40))
        return true
      },
    }
  )
  assert.equal(startup.complete, true)
  assert.equal(checks, 2)
})

test('start web dev: 已运行、仅前端和停止命令不启动后端', async () => {
  for (const options of [
    { apiOrigin: 'http://127.0.0.1:8300' },
    { apiOrigin: 'http://127.0.0.1:8300', frontendOnly: true },
    { apiOrigin: 'http://127.0.0.1:8300', stop: true },
  ]) {
    const startup = await resolveWebRuntimeStartup(options, {
      preflight: async () => ({ complete: !options.frontendOnly }),
      startBackend: async () => assert.fail('正常预检不能启动后端'),
    })
    assert.equal(startup.recoveryMode, '')
  }
})

test('start web dev: 后端启动或复验失败保留恢复页且不自动重试', async () => {
  for (const startFails of [true, false]) {
    let starts = 0
    const startup = await resolveWebRuntimeStartup(
      { apiOrigin: 'http://127.0.0.1:8300' },
      {
        preflight: async () => {
          throw new LocalRuntimePreflightError(
            'local_backend_unavailable',
            '未就绪'
          )
        },
        startBackend: async () => {
          starts++
          if (startFails) {
            throw new LocalRuntimePreflightError(
              'local_backend_start_failed',
              '启动失败'
            )
          }
          return true
        },
        writeLine: () => {},
      }
    )
    assert.equal(starts, 1)
    assert.equal(startup.complete, false)
    assert.equal(
      startup.recoveryReason,
      startFails ? 'local_backend_start_failed' : 'local_backend_unavailable'
    )
    assert.equal(startup.recoveryMode, LOCAL_RUNTIME_RECOVERY_MODE)
  }
})

test('start web dev: 后端自动启动复用正式 Make 入口并隔离 GitLab 凭据', async () => {
  const calls = []
  assert.equal(
    await startStoppedLocalBackend(
      { apiOrigin: 'http://localhost:8300' },
      {
        isPortAvailable: async () => true,
        env: {
          PLUSH_GITLAB_TOKEN: 'private-write-token',
          PLUSH_GITLAB_READ_TOKEN: 'private-read-token',
        },
        execute: async (command, args, options) =>
          calls.push({ command, args, options }),
        writeLine: () => {},
      }
    ),
    true
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'make')
  assert.deepEqual(calls[0].args, ['run', 'ARGS=--source=frontend'])
  assert.match(calls[0].options.cwd, /\/server$/u)
  assert.equal(calls[0].options.env.GIT_OPTIONAL_LOCKS, '0')
  assert.equal(calls[0].options.env.PLUSH_GITLAB_TOKEN, '')
  assert.equal(calls[0].options.env.PLUSH_GITLAB_READ_TOKEN, '')
  assert.equal(calls[0].options.timeout, 600_000)
})

test('start web dev: 非登记目标、已有监听和仅前端命令不自动启动共享后端', async () => {
  for (const options of [
    { apiOrigin: 'http://127.0.0.1:8301' },
    { apiOrigin: 'http://example.com:8300' },
    { apiOrigin: 'https://127.0.0.1:8300' },
    { apiOrigin: 'http://127.0.0.1:8300', frontendOnly: true },
    { apiOrigin: 'http://127.0.0.1:8300', stop: true },
  ]) {
    assert.equal(
      await startStoppedLocalBackend(options, {
        isPortAvailable: async () => true,
        execute: async () => assert.fail('不能启动后端'),
      }),
      false
    )
  }
  assert.equal(
    await startStoppedLocalBackend(
      { apiOrigin: 'http://127.0.0.1:8300' },
      {
        isPortAvailable: async () => false,
        execute: async () => assert.fail('不能停止已有监听进程'),
      }
    ),
    false
  )
})

test('start web dev: 后端编译失败不透传凭据或原始异常', async () => {
  const output = []
  await assert.rejects(
    startStoppedLocalBackend(
      { apiOrigin: 'http://127.0.0.1:8300' },
      {
        isPortAvailable: async () => true,
        execute: async () => {
          throw new Error('postgres://user:secret@private/db')
        },
        writeLine: (line) => output.push(line),
      }
    ),
    (error) => {
      assert.equal(error.code, 'local_backend_start_failed')
      assert.doesNotMatch(error.message, /secret|postgres/u)
      return true
    }
  )
  assert.doesNotMatch(output.join('\n'), /secret|postgres/u)
})

test('start web dev: 正式启动诊断保留编译原因并再次脱敏', async () => {
  const output = []
  await assert.rejects(
    startStoppedLocalBackend(
      { apiOrigin: 'http://127.0.0.1:8300' },
      {
        isPortAvailable: async () => true,
        execute: async () => {
          throw Object.assign(new Error('internal failure'), {
            diagnostic:
              'compile failed: undefined symbol; postgres://user:private-secret@localhost/db',
          })
        },
        writeLine: (line) => output.push(line),
      }
    ),
    { code: 'local_backend_start_failed' }
  )
  assert.match(output.join('\n'), /compile failed: undefined symbol/u)
  assert.doesNotMatch(output.join('\n'), /user:private-secret/u)
})

test('start web dev: 远端错误与非法代理配置不获得本地迁移入口', async () => {
  for (const apiOrigin of [
    'http://example.com',
    'http://user:secret@127.0.0.1:8300',
  ]) {
    await assert.rejects(
      resolveWebRuntimeStartup(
        { apiOrigin },
        {
          preflight: async () => {
            throw new Error('remote unavailable')
          },
          writeLine: () => {},
        }
      )
    )
  }
})

test('start web dev: 显式 GitLab 凭据优先且不读取钥匙串', async () => {
  let keychainReads = 0
  const credential = await resolveDevGitlabCredential({
    env: { PLUSH_GITLAB_READ_TOKEN: 'explicit-read-token' },
    platform: 'darwin',
    readKeychain: async () => {
      keychainReads += 1
      return 'must-not-read'
    },
  })

  assert.deepEqual(credential, {
    source: 'environment',
    token: 'explicit-read-token',
  })
  assert.equal(keychainReads, 0)
})

test('start web dev: macOS 自动读取固定钥匙串凭据', async () => {
  const credential = await resolveDevGitlabCredential({
    env: {},
    platform: 'darwin',
    readKeychain: async () => 'keychain-read-token\n',
  })

  assert.deepEqual(DEV_GITLAB_KEYCHAIN, {
    account: os.userInfo().username,
    service: 'plush-toy-erp.gitlab-read-api',
  })
  assert.deepEqual(credential, {
    source: 'keychain',
    token: 'keychain-read-token',
  })
})

test('start web dev: 非 macOS 或缺少钥匙串凭据时安全降级', async () => {
  let keychainReads = 0
  const nonMac = await resolveDevGitlabCredential({
    env: {},
    platform: 'linux',
    readCredentialFile: async () => '',
    readKeychain: async () => {
      keychainReads += 1
      return 'must-not-read'
    },
  })
  const missing = await resolveDevGitlabCredential({
    env: {},
    platform: 'darwin',
    readKeychain: async () => {
      throw new Error('item not found')
    },
  })

  assert.deepEqual(nonMac, { source: 'missing', token: '' })
  assert.deepEqual(missing, { source: 'missing', token: '' })
  assert.equal(keychainReads, 0)
})

test('start web dev: Linux 从受控文件加载只读凭据且不读取钥匙串', async () => {
  let requestedPath
  const credential = await resolveDevGitlabCredential({
    env: {},
    platform: 'linux',
    readCredentialFile: async ({ filePath }) => {
      requestedPath = filePath
      return 'fixture-read-token\n'
    },
    readKeychain: async () => {
      throw new Error('must not read keychain')
    },
  })
  assert.equal(requestedPath, devGitlabCredentialFilePath())
  assert.deepEqual(credential, { source: 'file', token: 'fixture-read-token' })
  const explicit = await resolveDevGitlabCredential({
    env: { PLUSH_GITLAB_READ_TOKEN: 'environment-read-token' },
    platform: 'linux',
    readCredentialFile: async () => {
      throw new Error('must not read file')
    },
  })
  assert.equal(explicit.source, 'environment')
})

test('start web dev: 凭据文件拒绝共享权限、软链接、错误 owner 和超长内容', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-gitlab-read-file-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const filePath = path.join(root, 'read-token')
  fs.writeFileSync(filePath, 'fixture-read-token', { mode: 0o600 })
  assert.equal(
    await readGitlabTokenFromFile({ filePath }),
    'fixture-read-token'
  )
  await assert.rejects(
    readGitlabTokenFromFile({ filePath, ownerId: os.userInfo().uid + 1 }),
    /服务用户/u
  )
  fs.chmodSync(filePath, 0o644)
  await assert.rejects(readGitlabTokenFromFile({ filePath }), /服务用户/u)
  fs.chmodSync(filePath, 0o600)
  const link = path.join(root, 'linked-token')
  fs.symlinkSync(filePath, link)
  await assert.rejects(readGitlabTokenFromFile({ filePath: link }), /安全读取/u)
  fs.writeFileSync(filePath, 'x'.repeat(1025))
  await assert.rejects(readGitlabTokenFromFile({ filePath }), /服务用户/u)
  assert.equal(
    await readGitlabTokenFromFile({ filePath: path.join(root, 'missing') }),
    ''
  )
  await assert.rejects(
    readGitlabTokenFromFile({ filePath: 'relative-token' }),
    /绝对路径/u
  )
})

test('start web dev: 受控凭据文件路径不进入 Vite 子进程', () => {
  const environment = createViteChildEnvironment({
    apiOrigin: 'http://127.0.0.1:8300',
    gitlabCredential: { source: 'file', token: 'fixture-read-token' },
    env: { PLUSH_GITLAB_READ_TOKEN_FILE: '/private/read-token' },
  })
  assert.equal(environment.PLUSH_GITLAB_READ_TOKEN, 'fixture-read-token')
  assert.equal(
    Object.hasOwn(environment, 'PLUSH_GITLAB_READ_TOKEN_FILE'),
    false
  )
})

test('start web dev: preflight 地址与 Vite RPC/template 代理使用同一 API_ORIGIN', async () => {
  const previousAPIOrigin = process.env.API_ORIGIN
  process.env.API_ORIGIN = 'http://127.0.0.1:18430/'
  try {
    const configFactory = createERPViteConfig('desktop')
    const config = await configFactory({
      command: 'serve',
      mode: 'development',
    })
    assert.equal(config.server.proxy['/rpc'].target, 'http://127.0.0.1:18430')
    assert.equal(
      config.server.proxy['/templates'].target,
      'http://127.0.0.1:18430'
    )
  } finally {
    if (previousAPIOrigin === undefined) delete process.env.API_ORIGIN
    else process.env.API_ORIGIN = previousAPIOrigin
  }
})
