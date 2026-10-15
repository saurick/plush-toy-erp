import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevWebInstancePlugin } from './devWebInstancePlugin.mjs'

function setup(options = {}) {
  let recovery = true
  let handler
  createDevWebInstancePlugin({
    signature: 'digest',
    isRecoveryActive: () => recovery,
    ...options,
  }).configureServer({
    middlewares: {
      use: (fn) => {
        handler = fn
      },
    },
  })
  const request = {
    url: '/__dev/api/web-instance',
    method: 'GET',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:15201' },
  }
  const invoke = (overrides = {}) => {
    const response = {
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value
      },
      end(body) {
        this.body = body
      },
    }
    handler({ ...request, ...overrides }, response, () => {
      response.next = true
    })
    return response
  }
  return {
    invoke,
    recover: () => {
      recovery = false
    },
  }
}

test('实例读回绑定实际恢复状态，不暴露路径、启动环境或凭据', () => {
  const { invoke, recover } = setup()
  const response = invoke()
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(response.body), {
    kind: 'plush-web-dev',
    pid: process.pid,
    signature: 'digest',
    recovery: true,
  })
  recover()
  assert.equal(JSON.parse(invoke().body).recovery, false)
  assert.equal(invoke({ url: '/erp' }).next, true)
})

test('实例接口只接受 loopback GET，拒绝外网地址、Host 注入与写请求', () => {
  const { invoke } = setup()
  for (const override of [
    { method: 'POST' },
    { socket: { remoteAddress: '192.0.2.5' } },
    { headers: { host: 'attacker.example' } },
  ]) {
    const response = invoke(override)
    assert.equal(response.statusCode, 403)
    assert.equal(response.body, '{}')
  }
})

test('过期主入口和辅助前端不能发起迁移或重启，状态读取仍可用', () => {
  let currentSource = 'loaded-control-code'
  const options = {
    loadedRuntimeSource: currentSource,
    readRuntimeSource: () => currentSource,
  }
  const { invoke } = setup(options)
  const action = {
    url: '/__dev/api/database-migration/actions',
    method: 'POST',
  }
  assert.equal(invoke(action).next, true)
  currentSource = 'changed-control-code'
  for (const port of [5175, 15200]) {
    const response = invoke({
      ...action,
      headers: { host: `127.0.0.1:${port}` },
    })
    assert.equal(response.statusCode, 409)
    assert.equal(response.next, undefined)
    assert.equal(response.headers['cache-control'], 'no-store')
    const payload = JSON.parse(response.body)
    assert.equal(payload.code, 'dev_runtime_source_changed')
    assert.match(payload.message, /重新运行启动命令/u)
    assert.match(payload.message, /未停止后端或执行迁移/u)
  }
  for (const url of [
    '/__dev/api/database-migration/session',
    '/__dev/api/database-migration/summary',
    '/__dev/database-migration',
    '/rpc',
  ]) {
    assert.equal(invoke({ url }).next, true)
  }
  // Recreating the plugin during a config reload must retain the loaded stamp.
  assert.equal(setup(options).invoke(action).statusCode, 409)
})

test('无法核对开发服务代码时拒绝动作，原始错误和本机路径不进入响应', () => {
  const { invoke } = setup({
    readRuntimeSource: () => {
      throw new Error('EACCES /private/config/secret')
    },
  })
  for (const url of [
    '/__dev/api/database-migration/actions?retry=1',
    '/__dev/api/database-migration/../database-migration/actions',
  ]) {
    const response = invoke({ url, method: 'POST' })
    assert.equal(response.statusCode, 409)
    assert.equal(response.next, undefined)
    assert.doesNotMatch(response.body, /EACCES|private|secret/u)
  }
})
