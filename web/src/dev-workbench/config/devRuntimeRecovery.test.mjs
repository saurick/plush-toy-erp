import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV_BACKEND_RECOVERY_ROUTE,
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  DEV_RUNTIME_RECOVERY_HEADER,
  DEV_RUNTIME_RECOVERY_ROUTE_GLOBAL,
  getDevRuntimeRecoveryRoute,
  installDevRuntimeRecoveryFetch,
  redirectDevRuntimeRecovery,
  resolveDevRuntimeRecoveryRoute,
} from './devRuntimeRecovery.mjs'

test('服务未启动和启动失败进入总览，数据库异常保留迁移恢复入口', () => {
  for (const reason of [
    'local_backend_unavailable',
    'local_backend_start_failed',
  ]) {
    assert.equal(
      resolveDevRuntimeRecoveryRoute(reason),
      DEV_BACKEND_RECOVERY_ROUTE
    )
  }
  for (const reason of [
    'database_migration_pending',
    'database_status_unavailable',
    'local_runtime_preflight_timeout',
    '',
  ]) {
    assert.equal(
      resolveDevRuntimeRecoveryRoute(reason),
      DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
    )
  }
  assert.equal(
    getDevRuntimeRecoveryRoute({
      [DEV_RUNTIME_RECOVERY_ROUTE_GLOBAL]: DEV_BACKEND_RECOVERY_ROUTE,
    }),
    DEV_BACKEND_RECOVERY_ROUTE
  )
  assert.equal(
    getDevRuntimeRecoveryRoute({}),
    DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
  )
})

test('开发停服检查只安装一次，保留原请求与响应且不重放', async () => {
  const response = new Response('{}', {
    status: 503,
    headers: { [DEV_RUNTIME_RECOVERY_HEADER]: DEV_BACKEND_RECOVERY_ROUTE },
  })
  const calls = []
  const redirects = []
  const scope = {
    location: {
      pathname: '/m/boss/tasks',
      replace: (route) => redirects.push(route),
    },
    async fetch(...args) {
      assert.equal(this, scope)
      calls.push(args)
      return response
    },
  }
  const options = { method: 'POST', signal: new AbortController().signal }
  assert.equal(installDevRuntimeRecoveryFetch(scope), true)
  assert.equal(installDevRuntimeRecoveryFetch(scope), false)
  assert.equal(await scope.fetch('/rpc/admin', options), response)
  assert.equal(await scope.fetch('/rpc/masterdata', options), response)
  assert.deepEqual(calls, [
    ['/rpc/admin', options],
    ['/rpc/masterdata', options],
  ])
  assert.deepEqual(redirects, [DEV_BACKEND_RECOVERY_ROUTE])
})

test('开发检查保留普通响应和请求取消，不把缺少证明的故障当作停服', async () => {
  for (const response of [
    new Response('{}'),
    new Response('{}', { status: 503 }),
    new Response('{}', {
      status: 503,
      headers: { [DEV_RUNTIME_RECOVERY_HEADER]: 'https://example.com' },
    }),
  ]) {
    const scope = {
      location: {
        pathname: '/erp/dashboard',
        replace: () => assert.fail('不能跳转'),
      },
      fetch: async () => response,
    }
    assert.equal(installDevRuntimeRecoveryFetch(scope), true)
    assert.equal(await scope.fetch('/rpc/admin'), response)
  }
  const error = new DOMException('cancelled', 'AbortError')
  let calls = 0
  const scope = {
    fetch: async () => {
      calls += 1
      throw error
    },
  }
  assert.equal(installDevRuntimeRecoveryFetch(scope), true)
  await assert.rejects(scope.fetch('/rpc/admin'), (actual) => actual === error)
  assert.equal(calls, 1)
  assert.equal(installDevRuntimeRecoveryFetch({}), false)
})

test('电脑、手机和登录页的停服响应跳转一次，不重放原业务请求', () => {
  const response = new Response('{}', {
    status: 503,
    headers: { [DEV_RUNTIME_RECOVERY_HEADER]: DEV_BACKEND_RECOVERY_ROUTE },
  })
  for (const pathname of ['/erp/dashboard', '/m/boss/tasks', '/admin-login']) {
    const redirects = []
    const scope = {
      location: { pathname, replace: (route) => redirects.push(route) },
    }
    assert.equal(redirectDevRuntimeRecovery(response, scope), true)
    assert.equal(redirectDevRuntimeRecovery(response, scope), false)
    assert.deepEqual(redirects, [DEV_BACKEND_RECOVERY_ROUTE])
  }
})

test('普通错误、未证明响应和开发工作台不会触发跳转或接受外部地址', () => {
  for (const [status, route, pathname] of [
    [500, DEV_BACKEND_RECOVERY_ROUTE, '/erp/dashboard'],
    [503, '', '/m/boss/tasks'],
    [503, 'https://example.com', '/erp/dashboard'],
    [503, '//example.com', '/erp/dashboard'],
    [503, DEV_BACKEND_RECOVERY_ROUTE, '/__dev'],
    [503, DEV_BACKEND_RECOVERY_ROUTE, '/__dev/database-migration'],
  ]) {
    assert.equal(
      redirectDevRuntimeRecovery(
        new Response('{}', {
          status,
          headers: { [DEV_RUNTIME_RECOVERY_HEADER]: route },
        }),
        { location: { pathname, replace: () => assert.fail('不能跳转') } }
      ),
      false
    )
  }
})
