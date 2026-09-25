import assert from 'node:assert/strict'
import test from 'node:test'

import { authBus } from '../auth/authBus.js'
import {
  JsonRpc,
  isRpcAbortError,
  pauseAuthenticatedRpcCalls,
} from './jsonRpc.js'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
  }
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  })
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor)
    } else {
      delete globalThis[name]
    }
  }
}

function createJsonRpcHarness(t, { token = 'stored-token' } = {}) {
  const events = []
  const logoutCalls = []
  const fetchCalls = []
  let tokenWasRemoved = false
  let fetchImpl = async (url, init) => {
    fetchCalls.push({ url, init })
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          jsonrpc: '2.0',
          id: JSON.parse(init.body).id,
          result: { code: 0, data: { ok: true } },
        }
      },
    }
  }
  const localStorage = memoryStorage()
  const originalRemoveItem = localStorage.removeItem
  localStorage.getItem = (key) => {
    if (key !== 'admin_access_token' || tokenWasRemoved) return null
    const value = typeof token === 'function' ? token() : token
    return value ? `${value}:admin` : null
  }
  localStorage.removeItem = (key) => {
    if (key === 'admin_access_token') {
      tokenWasRemoved = true
      logoutCalls.push('admin')
    }
    originalRemoveItem(key)
  }

  const restoreGlobals = [
    replaceGlobal('fetch', (...args) => fetchImpl(...args)),
    replaceGlobal('localStorage', localStorage),
    replaceGlobal('sessionStorage', memoryStorage()),
    replaceGlobal('window', {
      location: {
        pathname: '/admin-login',
        search: '',
        hash: '',
      },
    }),
  ]
  const unsubscribe = authBus.onUnauthorized((payload) => events.push(payload))
  t.after(() => {
    unsubscribe()
    for (const restore of restoreGlobals.reverse()) restore()
  })

  return {
    JsonRpc,
    isRpcAbortError,
    pauseAuthenticatedRpcCalls,
    fetchCalls,
    logoutCalls,
    events,
    setFetch(fn) {
      fetchImpl = fn
    },
  }
}

test('jsonRpc: withAuth=false 不携带旧 token', async (t) => {
  const harness = createJsonRpcHarness(t)
  const rpc = new harness.JsonRpc({
    url: 'auth',
    authScope: 'admin',
    withAuth: false,
  })

  await rpc.call('capabilities')

  assert.equal(harness.fetchCalls.length, 1)
  assert.equal(harness.fetchCalls[0].init.headers.Authorization, undefined)
  assert.deepEqual(harness.logoutCalls, [])
  assert.deepEqual(harness.events, [])
})

test('jsonRpc: 暂停期间拒绝业务读写，不排队，恢复读取与其他认证域独立', async (t) => {
  const harness = createJsonRpcHarness(t)
  const resume = harness.pauseAuthenticatedRpcCalls('admin')
  const releaseSecondPause = harness.pauseAuthenticatedRpcCalls('admin')
  t.after(() => {
    resume()
    releaseSecondPause()
  })
  const business = new harness.JsonRpc({ url: 'sales_order' })
  for (const method of ['list', 'save']) {
    await assert.rejects(business.call(method), { isAbortError: true })
  }
  assert.equal(harness.fetchCalls.length, 0)
  await new harness.JsonRpc({ url: 'admin' }).call('me')
  await new harness.JsonRpc({ url: 'customer_config' }).call(
    'get_effective_session'
  )
  await new harness.JsonRpc({ url: 'auth' }).call('logout')
  await new harness.JsonRpc({ url: 'auth', withAuth: false }).call('login')
  await new harness.JsonRpc({ url: 'orders', authScope: 'customer' }).call(
    'list'
  )
  assert.equal(harness.fetchCalls.length, 5)
  resume()
  await assert.rejects(business.call('save'), { isAbortError: true })
  releaseSecondPause()
  resume()
  assert.equal(harness.fetchCalls.length, 5, '恢复不会补发断连期间的写操作')
  await business.call('list')
  assert.equal(harness.fetchCalls.length, 6)
})

test('jsonRpc: 旧登录请求的迟到鉴权失败不能清除新登录', async (t) => {
  let token = 'old-session'
  const harness = createJsonRpcHarness(t, { token: () => token })
  let complete
  harness.setFetch(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  const request = new harness.JsonRpc({ url: 'admin' }).call('me')
  token = 'new-session'
  complete({
    ok: false,
    status: 401,
    json: async () => ({ code: 10005, message: 'expired' }),
  })
  await assert.rejects(request)
  assert.equal(harness.logoutCalls.length, 0)
  assert.equal(harness.events.length, 0)
})

test('jsonRpc: AbortError 标记为取消请求而不是网络错误', async (t) => {
  const harness = createJsonRpcHarness(t)
  harness.setFetch(async () => {
    const error = new Error('The user aborted a request.')
    error.name = 'AbortError'
    throw error
  })
  const rpc = new harness.JsonRpc({ url: 'masterdata', authScope: 'admin' })

  await assert.rejects(
    () => rpc.call('list_materials'),
    (error) => {
      assert.equal(error.message, 'Request aborted')
      assert.equal(error.isAbortError, true)
      assert.equal(error.isNetworkError, false)
      assert.equal(harness.isRpcAbortError(error), true)
      return true
    }
  )
})

test('jsonRpc: 只接受版本、请求 id 和对象 result 完整匹配的成功响应', async (t) => {
  const invalidResponses = [
    () => null,
    () => [],
    () => ({}),
    (id) => ({ jsonrpc: '1.0', id, result: { code: 0 } }),
    () => ({ jsonrpc: '2.0', id: 'other', result: { code: 0 } }),
    (id) => ({ jsonrpc: '2.0', id }),
    (id) => ({ jsonrpc: '2.0', id, result: null }),
    (id) => ({ jsonrpc: '2.0', id, result: [] }),
    (id) => ({ jsonrpc: '2.0', id, result: 'ok' }),
  ]

  const harness = createJsonRpcHarness(t)
  for (const responseBody of invalidResponses) {
    harness.setFetch(async (_url, init) => ({
      ok: true,
      status: 200,
      async json() {
        return responseBody(JSON.parse(init.body).id)
      },
    }))
    const rpc = new harness.JsonRpc({ url: 'business', authScope: 'admin' })

    await assert.rejects(
      () => rpc.call('list'),
      (error) => {
        assert.equal(error.isInvalidResponse, true)
        assert.equal(error.httpStatus, 200)
        assert.equal(
          error.message,
          'Invalid JSON-RPC success response from server'
        )
        return true
      }
    )
  }
})

test('jsonRpc: 返回匹配请求 id 的对象 result', async (t) => {
  const harness = createJsonRpcHarness(t)
  const rpc = new harness.JsonRpc({ url: 'business', authScope: 'admin' })

  const result = await rpc.call('list')

  assert.deepEqual(result, { code: 0, data: { ok: true } })
})

test('jsonRpc: withAuth=false 的鉴权错误不触发全局重新登录弹窗', async (t) => {
  const harness = createJsonRpcHarness(t)
  harness.setFetch(async (_url, init) => ({
    ok: true,
    status: 200,
    async json() {
      return {
        jsonrpc: '2.0',
        id: JSON.parse(init.body).id,
        result: { code: 10005, message: 'expired' },
      }
    },
  }))
  const rpc = new harness.JsonRpc({
    url: 'auth',
    authScope: 'admin',
    withAuth: false,
  })

  await assert.rejects(() => rpc.call('capabilities'), {
    name: 'RpcError',
    code: 10005,
  })
  assert.deepEqual(harness.logoutCalls, [])
  assert.deepEqual(harness.events, [])
})

test('jsonRpc: 默认认证调用仍会处理登录态失效', async (t) => {
  const harness = createJsonRpcHarness(t)
  harness.setFetch(async (_url, init) => ({
    ok: true,
    status: 200,
    async json() {
      return {
        jsonrpc: '2.0',
        id: JSON.parse(init.body).id,
        result: { code: 10005, message: 'expired' },
      }
    },
  }))
  const rpc = new harness.JsonRpc({ url: 'business', authScope: 'admin' })

  await assert.rejects(() => rpc.call('list'), {
    name: 'RpcError',
    code: 10005,
  })
  assert.deepEqual(harness.logoutCalls, ['admin'])
  assert.equal(harness.events.length, 1)
  assert.equal(harness.events[0].loginPath, '/admin-login')
  assert.equal(harness.events[0].message, '登录已过期，请重新登录')
  assert.notEqual(harness.events[0].message, 'expired')
})

test('jsonRpc: HTTP 鉴权失败响应触发全局重新登录弹窗并脱敏', async (t) => {
  const harness = createJsonRpcHarness(t)
  harness.setFetch(async () => ({
    ok: false,
    status: 401,
    async json() {
      return {
        code: 40302,
        message: 'token expired',
      }
    },
  }))
  const rpc = new harness.JsonRpc({ url: 'business', authScope: 'admin' })

  await assert.rejects(() => rpc.call('list'), {
    name: 'RpcError',
    code: 40302,
  })
  assert.deepEqual(harness.logoutCalls, ['admin'])
  assert.equal(harness.events.length, 1)
  assert.equal(harness.events[0].loginPath, '/admin-login')
  assert.equal(harness.events[0].message, '请先登录')
  assert.notEqual(harness.events[0].message, 'token expired')
})

test('jsonRpc: HTTP 权限不足不触发重新登录弹窗', async (t) => {
  const harness = createJsonRpcHarness(t)
  harness.setFetch(async () => ({
    ok: false,
    status: 403,
    async json() {
      return {
        code: 40304,
        message: 'permission denied',
      }
    },
  }))
  const rpc = new harness.JsonRpc({ url: 'business', authScope: 'admin' })

  await assert.rejects(() => rpc.call('list'), {
    name: 'RpcError',
    code: 40304,
  })
  assert.deepEqual(harness.logoutCalls, [])
  assert.deepEqual(harness.events, [])
})

test('jsonRpc: withAuth=false 的 HTTP 鉴权失败不触发重新登录弹窗', async (t) => {
  const harness = createJsonRpcHarness(t)
  harness.setFetch(async () => ({
    ok: false,
    status: 401,
    async json() {
      return {
        code: 40302,
        message: 'token expired',
      }
    },
  }))
  const rpc = new harness.JsonRpc({
    url: 'auth',
    authScope: 'admin',
    withAuth: false,
  })

  await assert.rejects(() => rpc.call('capabilities'), {
    name: 'RpcError',
    code: 40302,
  })
  assert.deepEqual(harness.logoutCalls, [])
  assert.deepEqual(harness.events, [])
})
