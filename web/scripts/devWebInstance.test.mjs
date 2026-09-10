import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  DEV_WEB_INSTANCE_PATH,
  prepareWebInstance,
  readWebInstance,
  stopWebInstance,
  webInstanceSignature,
} from './devWebInstance.mjs'

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
  ])
    assert.notEqual(webInstanceSignature({ ...options, ...change }), signature)
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
  const port = server.address().port
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
