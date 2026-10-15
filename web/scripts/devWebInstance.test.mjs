import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import {
  DEV_WEB_INSTANCE_PATH,
  prepareWebInstance,
  readWebInstance,
  stopWebInstance,
  webInstanceSignature,
} from './devWebInstance.mjs'
import { canListenOnPort } from './localPort.mjs'

test('已有前端必须匹配真实工作区、后端、客户、模式和 Vite 参数', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-web-instance-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const options = {
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    frontendOnly: false,
    viteArgs: [],
    customerKey: '',
  }
  const signature = webInstanceSignature(options)
  assert.equal(
    webInstanceSignature({ ...options, apiOrigin: `${options.apiOrigin}/` }),
    signature
  )
  for (const change of [
    { projectRoot: os.tmpdir() },
    { apiOrigin: 'http://127.0.0.1:18300' },
    { frontendOnly: true },
    { viteArgs: ['--mode', 'staging'] },
    { customerKey: 'demo' },
  ]) {
    assert.notEqual(webInstanceSignature({ ...options, ...change }), signature)
  }
})

test('迁移服务代码变化后不能复用旧进程，文档、页面和测试变化不要求重启', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-web-source-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (name, content) => {
    const file = path.join(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  const plugin = 'web/dev-server/devDatabaseMigrationPlugin.mjs'
  write(plugin, 'export const auditBeforeStop = false')
  const options = {
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    frontendOnly: false,
    viteArgs: [],
  }
  const loadedSignature = webInstanceSignature(options)
  write('README.md', '说明')
  write('web/src/Page.jsx', 'export default () => null')
  write('web/dev-server/devDatabaseMigrationPlugin.test.mjs', 'test()')
  assert.equal(webInstanceSignature(options), loadedSignature)

  write(plugin, 'export const auditBeforeStop = true')
  const currentSignature = webInstanceSignature(options)
  assert.notEqual(currentSignature, loadedSignature)
  await assert.rejects(
    prepareWebInstance(
      { ...options, port: 5175, signature: currentSignature },
      {
        available: async () => false,
        readInstance: async () => ({
          pid: 123,
          signature: loadedSignature,
          recovery: false,
        }),
        stop: () =>
          assert.fail('code changes do not authorize stopping a process'),
      }
    ),
    /开发服务代码已更新.*pnpm start --local --restart/u
  )
  for (const file of [
    'web/dev-server/nested/newRuntime.mjs',
    'web/vite.shared.mjs',
    'scripts/local-migration.mjs',
    'scripts/local-database-roles.mjs',
    'scripts/local-runtime-bundle.mjs',
    'scripts/local-runtime-rehearsal.mjs',
  ]) {
    const before = webInstanceSignature(options)
    write(file, 'export const revision = 1')
    assert.notEqual(webInstanceSignature(options), before)
    rmSync(path.join(root, file))
    // Empty directories do not change the code that a process has loaded.
    assert.equal(webInstanceSignature(options), before)
  }
  rmSync(path.join(root, plugin))
  assert.notEqual(webInstanceSignature(options), currentSignature)
})

test('真实占用端口仅复用同配置服务，普通 HTTP/HTML、恢复状态不符均阻断', async (t) => {
  let body = {
    kind: 'plush-web-dev',
    pid: process.pid,
    signature: 'expected',
    recovery: false,
  }
  const server = http.createServer((request, response) => {
    assert.equal(request.url, DEV_WEB_INSTANCE_PATH)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const { port } = server.address()
  const options = {
    port,
    projectRoot: os.tmpdir(),
    signature: 'expected',
    recoveryMode: '',
  }
  assert.deepEqual(await prepareWebInstance(options), {
    reused: true,
    pid: process.pid,
  })
  await assert.rejects(
    prepareWebInstance({ ...options, signature: 'other' }),
    /配置不同/u
  )
  await assert.rejects(
    prepareWebInstance({
      ...options,
      signature: 'other',
      restartCommand: 'pnpm restart:yoyoosun',
    }),
    /pnpm restart:yoyoosun。未停止任何服务/u
  )
  await assert.rejects(
    prepareWebInstance({ ...options, recoveryMode: 'database-migration' }),
    /配置不同/u
  )
  body = { ...body, recovery: true }
  assert.equal(
    (
      await prepareWebInstance({
        ...options,
        recoveryMode: 'database-migration',
      })
    ).reused,
    true
  )
  body = '<html>another server</html>'
  assert.equal(await readWebInstance(port), null)
  await assert.rejects(prepareWebInstance(options), /未停止任何服务/u)
})

const owned = {
  pid: 123,
  cwd: '/repo/web',
  command: 'node /repo/web/node_modules/vite/bin/vite.js',
  started: 'now',
  owned: true,
}

test('客户普通启动复用同配置，自动替换旧配置、旧代码或无实例摘要的本工作区 Vite', async () => {
  const options = {
    port: 15210,
    projectRoot: '/repo',
    signature: 'current',
    recoveryMode: '',
    replaceStale: true,
  }
  assert.deepEqual(
    await prepareWebInstance(options, {
      available: async () => false,
      readInstance: async () => ({
        pid: 123,
        signature: 'current',
        recovery: false,
      }),
      stop: () => assert.fail('同配置服务应继续复用'),
    }),
    { reused: true, pid: 123 }
  )
  for (const instance of [
    { pid: 123, signature: 'old', recovery: false },
    { pid: 123, signature: 'current', recovery: true },
    null,
  ]) {
    const calls = []
    const output = []
    assert.deepEqual(
      await prepareWebInstance(options, {
        available: async () => false,
        readInstance: async () => instance,
        stop: async (...args) => calls.push(args),
        writeLine: (line) => output.push(line),
      }),
      { reused: false }
    )
    assert.deepEqual(calls, [[15210, '/repo/web']])
    assert.match(output.join('\n'), /已停止本工作区旧前端.*15210/u)
  }
})

test('客户自动替换不能绕过进程归属或吞掉停止失败', async () => {
  const options = {
    port: 15210,
    projectRoot: '/repo',
    signature: 'current',
    replaceStale: true,
  }
  for (const listeners of [
    [{ ...owned, owned: false }],
    [owned, { ...owned, pid: 456, owned: false }],
  ]) {
    const output = []
    await assert.rejects(
      prepareWebInstance(options, {
        available: async () => false,
        readInstance: async () => null,
        stop: (port, webRoot) =>
          stopWebInstance(port, webRoot, {
            inspect: async () => listeners,
            kill: () => assert.fail('不能停止其他程序或工作区'),
          }),
        writeLine: (line) => output.push(line),
      }),
      /未停止任何服务/u
    )
    assert.deepEqual(output, [])
  }
  await assert.rejects(
    prepareWebInstance(options, {
      available: async () => false,
      readInstance: async () => null,
      stop: async () => {
        throw new Error('停止未完成')
      },
      writeLine: () => assert.fail('停止失败不能报告替换成功'),
    }),
    /停止未完成/u
  )
})

test('客户自动替换真实 Vite 后固定端口可重新监听，同目录普通 Node 服务保留', { timeout: 30_000 }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-web-takeover-'))
  const webRoot = path.join(root, 'web')
  mkdirSync(webRoot)
  writeFileSync(
    path.join(webRoot, 'vite.config.mjs'),
    `export default {
      server: { host: '127.0.0.1', port: Number(process.env.TEST_PORT), strictPort: true },
      plugins: [{ name: 'test-instance', configureServer(server) {
        server.middlewares.use('${DEV_WEB_INSTANCE_PATH}', (_req, res) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ kind: 'plush-web-dev', pid: process.pid,
            signature: process.env.TEST_SIGNATURE, recovery: false }));
        });
      } }],
    }`
  )
  const probe = http.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  const children = []
  t.after(async () => {
    for (const { child, closed } of children) {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGTERM')
      await closed
    }
    rmSync(root, { recursive: true, force: true })
  })
  const start = async (signature, vite = true) => {
    const viteCLI = path.join(
      path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
      'bin/vite.js'
    )
    const child = spawn(
      process.execPath,
      vite
        ? [viteCLI, '--config', 'vite.config.mjs']
        : [
            '-e',
            `require('node:http').createServer((_req,res)=>res.end('other')).listen(${port},'127.0.0.1')`,
          ],
      {
        cwd: webRoot,
        env: {
          ...process.env,
          TEST_PORT: String(port),
          TEST_SIGNATURE: signature,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    const closed = once(child, 'close')
    children.push({ child, closed })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      assert.equal(child.exitCode, null, output)
      if (
        vite
          ? (await readWebInstance(port))?.pid === child.pid
          : !(await canListenOnPort(port))
      ) {
        return { child, closed }
      }
      await delay(50)
    }
    assert.fail(`临时服务未启动：${output}`)
  }
  const options = {
    port,
    projectRoot: root,
    signature: 'current',
    replaceStale: true,
  }
  const old = await start('old')
  const output = []
  assert.deepEqual(
    await prepareWebInstance(options, { writeLine: (line) => output.push(line) }),
    { reused: false }
  )
  await old.closed
  assert.equal(await canListenOnPort(port), true)
  assert.match(output.join('\n'), /已停止本工作区旧前端/u)
  const current = await start('current')
  assert.deepEqual(await prepareWebInstance(options), {
    reused: true,
    pid: current.child.pid,
  })
  current.child.kill('SIGTERM')
  await current.closed
  const other = await start('', false)
  await assert.rejects(
    prepareWebInstance(options),
    /属于其他程序或工作区.*未停止任何服务/u
  )
  assert.equal(other.child.exitCode, null)
  assert.equal(await canListenOnPort(port), false)
})

test('显式重启必须在两次归属核对一致后仅向目标 PID 发送 SIGTERM', async () => {
  let inspections = 0
  const killed = []
  await stopWebInstance(15210, '/repo/web', {
    inspect: async () => {
      inspections += 1
      return [owned]
    },
    kill: (pid) => killed.push(pid),
    available: async () => true,
  })
  assert.equal(inspections, 2)
  assert.deepEqual(killed, [123])
})

test('其他程序、混合占用、PID 重用和检查失败不能进入停服', async () => {
  for (const snapshots of [
    [[{ ...owned, owned: false }]],
    [[owned, { ...owned, pid: 456, owned: false }]],
    [[owned], [{ ...owned, started: 'later' }]],
    [[owned], []],
  ]) {
    let index = 0
    await assert.rejects(
      stopWebInstance(15210, '/repo/web', {
        inspect: async () => snapshots[index++],
        kill: () => assert.fail('must not signal an unverified process'),
      }),
      /未停止任何服务/u
    )
  }
  await assert.rejects(
    stopWebInstance(15210, '/repo/web', {
      inspect: async () => {
        throw new Error('inspection unavailable')
      },
      kill: () => assert.fail('must not signal on inspection failure'),
    }),
    /inspection unavailable/u
  )
})

test('重启超时保留现场，不发送 SIGKILL 或停止新占用者', async () => {
  const killed = []
  await assert.rejects(
    stopWebInstance(15210, '/repo/web', {
      inspect: async () => [owned],
      kill: (pid) => killed.push(pid),
      available: async () => false,
      pause: async () => {},
    }),
    /未强制结束进程/u
  )
  assert.deepEqual(killed, [123])
})

test('空闲端口不查询进程或复用状态，重启占用端口必须走归属守卫', async () => {
  assert.deepEqual(
    await prepareWebInstance(
      { port: 15210 },
      {
        available: async () => true,
        readInstance: () => assert.fail('unnecessary HTTP request'),
        stop: () => assert.fail('unnecessary stop'),
      }
    ),
    { reused: false }
  )
  const calls = []
  await prepareWebInstance(
    { port: 15210, projectRoot: '/repo', restart: true },
    {
      available: async () => false,
      stop: async (...args) => calls.push(args),
    }
  )
  assert.deepEqual(calls, [[15210, '/repo/web']])
})
