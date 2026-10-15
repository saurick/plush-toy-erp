import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { once } from 'node:events'
import { createDevOperatorAuthMiddleware, createDevOperatorAuthPlugin } from './devOperatorAuthPlugin.mjs'
import { createDevWorkbenchServePlugins } from './devWorkbenchPlugins.mjs'

const credentials = {
  username: 'local-operator',
  password: 'isolated-test-password-with-32-bytes',
}
const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
const paths = [
  '/__dev',
  '/__dev/database-migration',
  '/__dev/api/database-migration/session',
  '/__dev/api/database-migration/summary',
  '/__dev/api/database-migration/action',
  '/__dev/api/delivery/session',
  '/__dev/api/delivery/summary',
  '/__dev/api/delivery/action',
  '/__dev/api/data-preparation/session',
  '/__dev/api/data-preparation/action',
  '/__dev/api/qa/testing',
  '/__dev/api/qa/coverage',
  '/__dev/api/qa/quality-gates',
  '/__dev/api/customer-config/operations',
  '/__dev/api/customer-import/dry-run',
  '/%5f%5fdev/api/delivery/action',
  '/__dev%2fapi%2fdelivery%2faction',
]

test('configured HTTPS proxy supports both access modes and retains independent operator authentication', () => {
  for (const accessMode of ['operator', 'private-network']) {
    const middlewares = []
    createDevOperatorAuthPlugin({
      httpsOrigin: 'https://dev.example.test',
      readCredentials: () => credentials,
      readAccessMode: () => accessMode,
    }).configureServer({ middlewares: { use: (middleware) => middlewares.push(middleware) } })
    const invokeProxy = (header) => {
      let passed = false
      const response = { statusCode: 200, setHeader() {}, end() {} }
      const request = {
        url: '/__dev/api/delivery/session', method: 'GET',
        headers: {
          host: 'dev.example.test', authorization: header,
          'x-forwarded-proto': 'https', 'x-forwarded-for': '192.168.0.66',
        },
        socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      }
      middlewares[0](request, response, () => middlewares[1](request, response, () => { passed = true }))
      return { passed, status: response.statusCode }
    }
    assert.deepEqual(invokeProxy(), accessMode === 'operator'
      ? { passed: false, status: 401 } : { passed: true, status: 200 })
    assert.deepEqual(invokeProxy(authorization), { passed: true, status: 200 })
  }
})

function invoke(url, { identity = credentials, accessMode = 'operator', header, remote = '127.0.0.1', encrypted = false, method = 'GET', headers = {} } = {}) {
  const middleware = createDevOperatorAuthMiddleware({
    readCredentials: () => identity,
    readAccessMode: () => accessMode,
  })
  let passed = false
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    end(body) { this.body = body },
  }
  middleware({
    url, method,
    headers: { host: remote === '127.0.0.1' ? 'localhost:15200' : '192.168.0.133:15200', authorization: header, ...headers },
    socket: { remoteAddress: remote, localAddress: '192.168.0.133', localPort: 15200, encrypted },
  }, response, () => { passed = true })
  return { passed, response }
}

test('all workbench entry points require a separate operator identity, including sessions and cancellation', () => {
  for (const path of paths) {
    for (const method of ['GET', 'POST', 'DELETE']) {
      for (const header of [undefined, 'Bearer business-user-token', 'Basic invalid', `Basic ${Buffer.from('local-operator:wrong').toString('base64')}`, [authorization]]) {
        const { passed, response } = invoke(path, { method, header })
        assert.equal(passed, false, `${method} ${path}`)
        assert.equal(response.statusCode, 401)
        assert.equal(response.headers['cache-control'], 'no-store')
      }
      assert.equal(invoke(path, { method, header: authorization }).passed, true)
    }
  }
})

test('missing or weak configuration fails closed and never returns the credential', () => {
  for (const identity of [null, {}, { ...credentials, username: 'bad:name' }, { ...credentials, password: 'short' }]) {
    const { passed, response } = invoke('/__dev/api/delivery/session', { identity, header: authorization })
    assert.equal(passed, false)
    assert.equal(response.statusCode, 503)
    assert.equal(response.body.includes(credentials.password), false)
  }
})

test('standard Basic scheme casing and the documented UTF-8 credential size are accepted', () => {
  assert.equal(invoke('/__dev/api/delivery/session', { header: authorization.replace('Basic ', 'basic ') }).passed, true)
  const identity = { username: 'u'.repeat(64), password: '密'.repeat(1024) }
  const header = `Basic ${Buffer.from(`${identity.username}:${identity.password}`).toString('base64')}`
  assert.equal(invoke('/__dev/api/delivery/session', { identity, header }).passed, true)
  assert.equal(invoke('/__dev/api/delivery/session', { header: 'Basic ' + 'A'.repeat(8192) }).response.statusCode, 401)
})

test('LAN plaintext and untrusted metadata remain rejected even with valid credentials', () => {
  assert.equal(invoke('/__dev/api/delivery/session', { header: authorization, remote: '192.168.0.66' }).response.statusCode, 403)
  assert.equal(invoke('/__dev/api/delivery/session', { header: authorization, remote: '192.168.0.66', encrypted: true }).passed, true)
  assert.equal(invoke('/__dev/api/delivery/session', { header: authorization, headers: { 'sec-fetch-site': 'cross-site' } }).response.statusCode, 403)
  assert.equal(invoke('/__dev/api/delivery/session', { header: authorization, headers: { host: 'evil.example' } }).response.statusCode, 403)
})

test('explicit personal-network mode permits direct local and LAN entry without operator credentials', () => {
  for (const path of paths) {
    for (const remote of ['127.0.0.1', '192.168.0.66', '::ffff:192.168.0.66']) {
      for (const method of ['GET', 'POST']) {
        const { passed, response } = invoke(path, {
          accessMode: 'private-network', identity: null, remote, method,
        })
        assert.equal(passed, true, `${method} ${path} ${remote}`)
        assert.equal(response.headers['cache-control'], 'no-store')
        assert.equal(response.headers['www-authenticate'], undefined)
      }
    }
  }
})

test('personal-network mode retains network, Host and cross-site guards', () => {
  const base = { accessMode: 'private-network', identity: null, remote: '192.168.0.66' }
  for (const changed of [
    { remote: '8.8.8.8' },
    { remote: '100.64.0.1' },
    { headers: { host: 'localhost:15200' } },
    { headers: { host: 'evil.example:15200' } },
    { headers: { host: '192.168.0.133:15201' } },
    { headers: { origin: 'http://evil.example' } },
    { headers: { referer: 'http://evil.example/' } },
    { headers: { 'sec-fetch-site': 'cross-site' } },
    { remote: '8.8.8.8', headers: { 'x-forwarded-for': '192.168.0.66', 'x-forwarded-host': '192.168.0.133:15200' } },
    { method: 'DELETE' },
  ]) {
    const { passed, response } = invoke('/__dev/api/delivery/session', { ...base, ...changed })
    assert.equal(passed, false, JSON.stringify(changed))
    assert.equal(response.statusCode, 403)
  }
})

test('unsupported access modes fail closed instead of disabling authentication', () => {
  for (const accessMode of ['', null, 'public', 'private_network']) {
    const { passed, response } = invoke('/__dev', { accessMode, header: authorization })
    assert.equal(passed, false)
    assert.equal(response.statusCode, 503)
  }
})

test('business and availability endpoints keep their existing independent guards', () => {
  for (const path of ['/rpc/admin', '/', '/__dev/api/runtime-status', '/__dev/api/web-instance']) {
    assert.equal(invoke(path, { identity: null }).passed, true)
  }
  assert.equal(invoke('/__dev/api/%', {}).response.statusCode, 400)
})

test('authentication precedes every privileged plugin and is absent from production', () => {
  const plugins = createDevWorkbenchServePlugins({ command: 'serve', mode: 'development', projectRoot: '/unused' })
  assert.equal(plugins[0].name, 'plush-dev-operator-auth')
  assert.equal(plugins[0].enforce, 'pre')
  assert.deepEqual(createDevWorkbenchServePlugins({ command: 'build', mode: 'production' }), [])
})

test('real isolated HTTP requests cannot reach a privileged sink without operator credentials', async (t) => {
  const middleware = createDevOperatorAuthMiddleware({ readCredentials: () => credentials })
  let calls = 0
  const server = http.createServer((request, response) => {
    middleware(request, response, () => { calls++; response.end('authorized') })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const path of paths.slice(0, 15)) {
    const response = await fetch(`${origin}${path}`)
    assert.equal(response.status, 401)
    await response.text()
  }
  assert.equal(calls, 0)
  const response = await fetch(`${origin}/__dev/api/delivery/session`, { headers: { authorization } })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'authorized')
  assert.equal(calls, 1)
})
