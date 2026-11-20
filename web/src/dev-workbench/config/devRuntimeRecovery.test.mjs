import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL,
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  DEV_RUNTIME_RECOVERY_EVENT,
  DEV_RUNTIME_RECOVERY_HEADER,
  DEV_RUNTIME_STATUS_API_PATH,
  DEV_RUNTIME_STATUS_KIND,
  activateDevRuntimeRecovery,
  installDevRuntimeRecoveryFetch,
  isDevDatabaseMigrationRecoveryActive,
  startDevRuntimeRecoveryMonitor,
} from './devRuntimeRecovery.mjs'

const blockedResponse = () =>
  new Response('{}', {
    status: 503,
    headers: {
      [DEV_RUNTIME_RECOVERY_HEADER]: DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
    },
  })
const flush = () => new Promise((resolve) => setImmediate(resolve))

function createScope(pathname) {
  const scope = new EventTarget()
  scope.location = {
    pathname,
    search: '?view=mine',
    hash: '#current',
    replace: () => assert.fail('服务故障不能改变业务地址'),
    reload: () => assert.fail('状态检查不能重载或重放业务请求'),
  }
  return scope
}

test('电脑、手机与登录页保留路径、查询和锚点，只通知一次停服状态', () => {
  for (const pathname of [
    '/erp/dashboard',
    '/m/boss/tasks',
    '/admin-login',
    '/',
  ]) {
    const scope = createScope(pathname)
    let events = 0
    scope.addEventListener(DEV_RUNTIME_RECOVERY_EVENT, () => events++)
    assert.equal(activateDevRuntimeRecovery(blockedResponse(), scope), true)
    assert.equal(activateDevRuntimeRecovery(blockedResponse(), scope), false)
    assert.equal(isDevDatabaseMigrationRecoveryActive(scope), true)
    assert.equal(events, 1)
    assert.equal(scope.location.pathname, pathname)
    assert.equal(scope.location.search, '?view=mine')
    assert.equal(scope.location.hash, '#current')
  }
})

test('开发停服检查只安装一次，保留原请求与响应且不重放写请求', async () => {
  const response = blockedResponse()
  const calls = []
  const scope = createScope('/m/boss/tasks')
  scope.fetch = async function recordedFetch(...args) {
    assert.equal(this, scope)
    calls.push(args)
    return response
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
})

test('普通错误、未证明响应、外部地址和开发工具不会触发停服状态', () => {
  for (const [status, route, pathname] of [
    [500, DEV_DATABASE_MIGRATION_RECOVERY_ROUTE, '/erp/dashboard'],
    [503, '', '/m/boss/tasks'],
    [503, 'https://example.com', '/erp/dashboard'],
    [503, '//example.com', '/erp/dashboard'],
    [503, '/__dev/', '/erp/dashboard'],
    [503, DEV_DATABASE_MIGRATION_RECOVERY_ROUTE, '/__dev'],
    [503, DEV_DATABASE_MIGRATION_RECOVERY_ROUTE, '/__dev/database-migration'],
  ]) {
    const scope = createScope(pathname)
    assert.equal(
      activateDevRuntimeRecovery(
        new Response('{}', {
          status,
          headers: { [DEV_RUNTIME_RECOVERY_HEADER]: route },
        }),
        scope
      ),
      false
    )
    assert.equal(isDevDatabaseMigrationRecoveryActive(scope), false)
  }
})

test('请求取消保留原异常，不产生停服状态或自动重试', async () => {
  const error = new DOMException('cancelled', 'AbortError')
  let calls = 0
  const scope = createScope('/erp/dashboard')
  scope.fetch = async () => {
    calls++
    throw error
  }
  assert.equal(installDevRuntimeRecoveryFetch(scope), true)
  await assert.rejects(scope.fetch('/rpc/admin'), (actual) => actual === error)
  assert.equal(calls, 1)
  assert.equal(isDevDatabaseMigrationRecoveryActive(scope), false)
  assert.equal(installDevRuntimeRecoveryFetch({}), false)
})

test('仅轮询只读状态，完整就绪证明解除提示并停止检查，地址和会话保持不变', async () => {
  const scope = createScope('/m/boss/tasks')
  scope[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] = true
  scope.localStorage = { removeItem: () => assert.fail('停服不能清除会话') }
  const jobs = []
  const calls = []
  const statuses = ['blocked', 'ready']
  scope.setTimeout = (callback) => {
    jobs.push(callback)
    return jobs.length
  }
  scope.clearTimeout = () => {}
  scope.fetch = async (url, options) => {
    calls.push({ url, options })
    return Response.json({
      kind: DEV_RUNTIME_STATUS_KIND,
      status: statuses.shift(),
    })
  }
  let opened = 0
  const stop = startDevRuntimeRecoveryMonitor(() => opened++, { scope })
  await flush()
  assert.equal(opened, 0)
  assert.equal(isDevDatabaseMigrationRecoveryActive(scope), true)
  await jobs.shift()()
  assert.equal(opened, 1)
  assert.equal(isDevDatabaseMigrationRecoveryActive(scope), false)
  assert.equal(jobs.length, 0)
  assert.equal(calls.length, 2)
  for (const { url, options } of calls) {
    assert.equal(url, DEV_RUNTIME_STATUS_API_PATH)
    assert.equal(options.method, undefined)
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'same-origin')
  }
  assert.equal(scope.location.pathname, '/m/boss/tasks')
  assert.equal(scope.location.search, '?view=mine')
  assert.equal(scope.location.hash, '#current')
  stop()
})

test('状态读取断网、拒绝或证明无效时继续等待，不把普通成功响应当成恢复', async () => {
  const scope = createScope('/erp/dashboard')
  scope[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] = true
  const jobs = []
  const outcomes = [
    new Error('offline'),
    new Response('{}', { status: 403 }),
    Response.json({ status: 'ready' }),
    Response.json({
      kind: DEV_RUNTIME_STATUS_KIND,
      status: 'blocked',
    }),
  ]
  scope.setTimeout = (callback) => {
    jobs.push(callback)
    return jobs.length
  }
  scope.clearTimeout = () => {}
  scope.fetch = async () => {
    const outcome = outcomes.shift()
    if (outcome instanceof Error) throw outcome
    return outcome
  }
  const stop = startDevRuntimeRecoveryMonitor(
    () => assert.fail('没有完整证明不能恢复'),
    { scope }
  )
  await flush()
  while (outcomes.length) await jobs.shift()()
  assert.equal(isDevDatabaseMigrationRecoveryActive(scope), true)
  assert.equal(jobs.length, 1)
  stop()
})

test('离开等待页会取消未完成检查并忽略旧响应，再次停服仍能正常恢复', async () => {
  const scope = createScope('/admin-login')
  scope[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] = true
  let resolveResponse
  let signal
  scope.fetch = (_url, options) => {
    signal = options.signal
    return new Promise((resolve) => {
      resolveResponse = resolve
    })
  }
  scope.setTimeout = () => assert.fail('离开页面后不能继续轮询')
  scope.clearTimeout = () => {}
  const stop = startDevRuntimeRecoveryMonitor(
    () => assert.fail('不能处理离开页面后的响应'),
    { scope }
  )
  stop()
  assert.equal(signal.aborted, true)
  resolveResponse(
    Response.json({ kind: DEV_RUNTIME_STATUS_KIND, status: 'ready' })
  )
  await flush()
  assert.equal(isDevDatabaseMigrationRecoveryActive(scope), true)
  scope[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] = false
  assert.equal(activateDevRuntimeRecovery(blockedResponse(), scope), true)
})
