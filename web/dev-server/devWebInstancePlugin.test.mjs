import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevWebInstancePlugin } from './devWebInstancePlugin.mjs'

function setup() {
  let recovery = true
  let handler
  createDevWebInstancePlugin({
    signature: 'digest',
    isRecoveryActive: () => recovery,
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
