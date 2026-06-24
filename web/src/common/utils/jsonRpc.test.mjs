import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

function loadJsonRpcModule({ token = 'stored-token' } = {}) {
  const filePath = path.resolve(import.meta.dirname, './jsonRpc.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const events = []
  const logoutCalls = []
  const fetchCalls = []

  class RpcError extends Error {
    constructor(message, extra = {}) {
      super(message)
      this.code = extra.code ?? null
      this.isNetworkError = !!extra.isNetworkError
      this.isAbortError = !!extra.isAbortError
      this.cause = extra.cause
    }

    static fromHttp(status) {
      return new RpcError(`HTTP error ${status}`, { code: status })
    }

    static fromKratos(json) {
      return new RpcError(json.message, { code: json.code })
    }

    static fromJsonRpc(json) {
      return new RpcError(json.error?.message || 'JSON-RPC error', {
        code: json.error?.code,
      })
    }

    static fromBiz(json) {
      return new RpcError(json.result?.message || 'Business error', {
        code: json.result?.code,
      })
    }
  }

  const transformed = source
    .replace(
      /import\s+\{\s*RpcError\s*\}\s+from\s+["']@\/common\/utils\/rpcError["']\s*/u,
      'const { RpcError } = __rpcError__\n'
    )
    .replace(
      /import\s+\{\s*getToken,\s*logout,\s*getLoginPath\s*\}\s+from\s+["']@\/common\/auth\/auth["']\s*/u,
      'const { getToken, logout, getLoginPath } = __auth__\n'
    )
    .replace(
      /import\s+\{\s*authBus\s*\}\s+from\s+["']@\/common\/auth\/authBus["']\s*/u,
      'const { authBus } = __authBus__\n'
    )
    .replace(
      /import\s+\{\s*isAuthFailureCode\s*\}\s+from\s+["']@\/common\/consts\/errorCodes["']\s*/u,
      'const { isAuthFailureCode } = __errorCodes__\n'
    )
    .replace(/export class JsonRpc/u, 'class JsonRpc')
    .replace(/export function isRpcAbortError/u, 'function isRpcAbortError')
    .concat('\nmodule.exports = { JsonRpc, isRpcAbortError };\n')

  const sandbox = {
    module: { exports: {} },
    exports: {},
    window: {
      location: {
        pathname: '/admin-login',
        search: '',
        hash: '',
      },
    },
    fetch: async (url, init) => {
      fetchCalls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            jsonrpc: '2.0',
            id: '1',
            result: { code: 0, data: { ok: true } },
          }
        },
      }
    },
    __rpcError__: { RpcError },
    __auth__: {
      getToken(scope) {
        return `${token}:${scope}`
      },
      logout(scope) {
        logoutCalls.push(scope)
      },
      getLoginPath() {
        return '/admin-login'
      },
    },
    __authBus__: {
      authBus: {
        emitUnauthorized(payload) {
          events.push(payload)
        },
      },
    },
    __errorCodes__: {
      isAuthFailureCode(code) {
        return Number(code) === 10005
      },
    },
  }

  vm.runInNewContext(transformed, sandbox, { filename: filePath })
  return {
    JsonRpc: sandbox.module.exports.JsonRpc,
    isRpcAbortError: sandbox.module.exports.isRpcAbortError,
    fetchCalls,
    logoutCalls,
    events,
    setFetch(fn) {
      sandbox.fetch = fn
    },
  }
}

test('jsonRpc: withAuth=false 不携带旧 token', async () => {
  const harness = loadJsonRpcModule()
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

test('jsonRpc: AbortError 标记为取消请求而不是网络错误', async () => {
  const harness = loadJsonRpcModule()
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

test('jsonRpc: withAuth=false 的鉴权错误不触发全局重新登录弹窗', async () => {
  const harness = loadJsonRpcModule()
  harness.setFetch(async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        jsonrpc: '2.0',
        id: '1',
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
    name: 'Error',
    code: 10005,
  })
  assert.deepEqual(harness.logoutCalls, [])
  assert.deepEqual(harness.events, [])
})

test('jsonRpc: 默认认证调用仍会处理登录态失效', async () => {
  const harness = loadJsonRpcModule()
  harness.setFetch(async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        jsonrpc: '2.0',
        id: '1',
        result: { code: 10005, message: 'expired' },
      }
    },
  }))
  const rpc = new harness.JsonRpc({ url: 'business', authScope: 'admin' })

  await assert.rejects(() => rpc.call('list'), {
    name: 'Error',
    code: 10005,
  })
  assert.deepEqual(harness.logoutCalls, ['admin'])
  assert.equal(harness.events.length, 1)
  assert.equal(harness.events[0].loginPath, '/admin-login')
})
