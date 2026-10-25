import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createStandaloneWorkbenchServer, createStandaloneWorkbenchPlugins } from './standaloneWorkbench.mjs'
import { hashWorkbenchPassword, safeWorkbenchReturnTo, WORKBENCH_SESSION_COOKIE } from './workbenchSession.mjs'

const origin = 'https://workbench.example.test'
const password = 'test-only-independent-password-32-bytes'
const username = 'operator'
const passwordHash = await hashWorkbenchPassword(password)

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-workbench-http-'))
  await mkdir(path.join(root, 'assets'))
  await writeFile(path.join(root, 'workbench.html'), '<h1>isolated workbench</h1>')
  await writeFile(path.join(root, 'assets', 'page.js'), 'export const page = true')
  await writeFile(path.join(root, 'favicon-dev.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>')
  await writeFile(path.join(root, '.env'), 'must-not-be-served')
  await symlink(path.join(root, '.env'), path.join(root, 'assets', 'secret.js'))
  let calls = 0
  const events = []
  const server = await createStandaloneWorkbenchServer({
    staticRoot: root,
    httpsOrigin: origin,
    maintenanceFile: options.maintenanceFile,
    credentials: { username, passwordHash, ...options },
    plugins: [{ configureServer: ({ middlewares }) => middlewares.use(async (request, response, next) => {
      if (request.url.startsWith('/__dev/api/test')) { calls++; await options.holdWrite?.(request); response.end('protected sink') }
      else return next()
    }) }],
    writeEvent: (event) => events.push(event),
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true }) })
  const address = `http://127.0.0.1:${server.address().port}`
  const headers = {
    host: 'workbench.example.test',
    'x-forwarded-proto': 'https',
    'x-forwarded-for': '203.0.113.42',
    'sec-fetch-site': 'same-origin',
  }
  // Node fetch replaces Host, so exercise the actual TLS proxy contract with
  // HTTP requests whose Host matches the configured public origin.
  const request = (route, init = {}) => new Promise((resolve, reject) => {
    const outgoing = http.request(`${address}${route}`, {
      method: init.method || 'GET', headers: { ...headers, ...init.headers },
    }, (incoming) => {
      const chunks = []
      incoming.on('data', (chunk) => chunks.push(chunk))
      incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: incoming.statusCode, headers: incoming.headers,
      })))
      incoming.on('error', reject)
    })
    outgoing.on('error', reject)
    outgoing.end(init.body ? String(init.body) : undefined)
  })
  const login = (overrides = {}, cookie = '') => request('/__dev/auth/login', {
    method: 'POST',
    headers: {
      origin, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams({ username, password, returnTo: '/__dev/docs?path=README.md#overview', ...overrides }),
  })
  return { server, request, login, events, calls: () => calls }
}

test('standalone requires a valid operator identity and an immutable frontend artifact', async () => {
  await assert.rejects(createStandaloneWorkbenchServer({ httpsOrigin: '' }), /ORIGIN/u)
  await assert.rejects(createStandaloneWorkbenchServer({ staticRoot: '/nonexistent', httpsOrigin: origin }), /ENOENT/u)
})

test('release maintenance blocks new tool writes, retains reads and proves existing requests have drained', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-workbench-maintenance-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const maintenanceFile = path.join(root, 'release.lock')
  let started
  let finish
  const entered = new Promise((resolve) => { started = resolve })
  const held = new Promise((resolve) => { finish = resolve })
  const { request, login, calls } = await fixture(t, { maintenanceFile, holdWrite: async (incoming) => {
    if (incoming.method === 'POST') { started(); await held }
  } })
  const cookie = (await login()).headers.get('set-cookie').split(';')[0]
  const pending = request('/__dev/api/test/action', { method: 'POST', headers: { cookie, origin } })
  await entered
  await mkdir(maintenanceFile)
  const health = await (await request('/healthz')).json()
  assert.equal(health.maintenance, true)
  assert.equal(health.activeWrites, 1)
  const refused = await request('/__dev/api/test/action', { method: 'POST', headers: { cookie, origin } })
  assert.equal(refused.status, 503)
  assert.match(await refused.text(), /本次操作未开始/u)
  assert.equal((await request('/__dev/api/test/session', { headers: { cookie } })).status, 200)
  finish()
  assert.equal((await pending).status, 200)
  assert.equal((await (await request('/healthz')).json()).activeWrites, 0)
  assert.equal(calls(), 2)
})

test('unauthenticated pages, assets, encoded paths, API sessions and actions cannot reach any sink', async (t) => {
  const { request, calls } = await fixture(t)
  for (const route of ['/__dev', '/__dev/docs', '/assets/page.js', '/__dev/api/test/session', '/%5f%5fdev/api/test']) {
    const result = await request(route)
    assert.equal(result.status, 401, route)
    assert.equal(result.headers.get('cache-control'), 'no-store')
    assert.equal(result.headers.get('x-plush-workbench-auth'), 'required')
    assert.equal((await result.text()).includes(passwordHash), false)
  }
  assert.equal((await request('/__dev/api/test/action', { method: 'POST' })).status, 401)
  const page = await request('/__dev/docs?path=README.md', { headers: { accept: 'text/html' } })
  assert.equal(page.status, 303)
  assert.equal(page.headers.get('location'), '/__dev/login?returnTo=%2F__dev%2Fdocs%3Fpath%3DREADME.md')
  assert.equal(calls(), 0)
})

test('login page is a real form with protected transport, bounded fields and an escaped return path', async (t) => {
  const { request } = await fixture(t)
  const page = await request('/__dev/login?returnTo=%2F__dev%2Fdocs%3Fx%3D%22%3E%3Cscript%3E')
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('referrer-policy'), 'same-origin')
  assert.match(page.headers.get('content-security-policy'), /(?:^|; )img-src 'self'(?:;|$)/u)
  const body = await page.text()
  assert.match(body, /<link rel="icon" type="image\/svg\+xml" href="\/favicon-dev\.svg">/u)
  assert.match(body, /autocomplete="current-password"/u)
  assert.match(body, /value="\/__dev\/docs\?x=%22%3E%3Cscript%3E"/u)
  assert.equal(body.includes('<script>'), false)
  assert.equal(body.includes(password), false)
  assert.equal(page.headers.get('www-authenticate'), null)
  assert.equal((await request('/__dev/login', { headers: { 'x-forwarded-proto': 'http' } })).status, 403)
  assert.equal((await request('/__dev/login', { headers: { host: 'evil.test' } })).status, 403)
  assert.equal((await request('/__dev/login', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })).status, 403)
})

test('login permits only its exact appearance bootstrap and escapes supplied HTML', async (t) => {
  const { request } = await fixture(t)
  const response = await request('/__dev/login?returnTo=%2F__dev%2Fdocs%3Fx%3D%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')
  const body = await response.text()
  const scripts = [...body.matchAll(/<script id="workbench-appearance">([\s\S]*?)<\/script>/gu)]
  assert.equal(scripts.length, 1)
  assert.equal([...body.matchAll(/<script\b/gu)].length, 1)
  const hash = createHash('sha256').update(scripts[0][1]).digest('base64')
  const csp = response.headers.get('content-security-policy')
  assert.equal(csp.split('; ').find((part) => part.startsWith('script-src ')), `script-src 'sha256-${hash}'`)
  assert.match(csp, /^default-src 'none';/u)
  assert.match(csp, /form-action 'self'; base-uri 'none'; frame-ancestors 'none'$/u)
  assert.match(scripts[0][1], /plush_workbench_appearance/u)
  assert.doesNotMatch(scripts[0][1], /admin_erp_preferences|fetch\(|XMLHttpRequest/u)
})

test('the login favicon is public only through the trusted HTTPS boundary and cannot open other resources', async (t) => {
  const { request, calls } = await fixture(t)
  const icon = await request('/favicon-dev.svg')
  assert.equal(icon.status, 200)
  assert.equal(icon.headers.get('content-type'), 'image/svg+xml')
  assert.match(await icon.text(), /^<svg /u)
  assert.equal((await request('/favicon-dev.svg', { method: 'HEAD' })).status, 200)
  assert.equal((await request('/favicon-dev.svg', { method: 'POST' })).status, 401)
  for (const route of ['/favicon.svg', '/assets/page.js', '/__dev/api/test', '/__dev/auth/session']) {
    assert.equal((await request(route)).status, 401, route)
  }
  for (const headers of [
    { 'x-forwarded-proto': 'http' }, { host: 'evil.test' },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site', referer: 'https://tools.example.test/' },
  ]) {
    assert.equal((await request('/favicon-dev.svg', { headers })).status, 403)
  }
  assert.equal(calls(), 0)
})

test('correct login restores the deep link, uses a secure opaque cookie and protects all subsequent resources', async (t) => {
  const { request, login, calls, events } = await fixture(t)
  const result = await login()
  assert.equal(result.status, 303)
  assert.equal(result.headers.get('location'), '/__dev/docs?path=README.md#overview')
  const rawCookie = result.headers.get('set-cookie')
  assert.match(rawCookie, /HttpOnly; Secure; SameSite=Strict/u)
  assert.match(rawCookie, /Path=\//u)
  assert.equal(rawCookie.includes(password), false)
  const cookie = rawCookie.split(';')[0]
  for (const route of ['/__dev', '/__dev/docs', '/assets/page.js', '/__dev/api/test']) {
    const response = await request(route, { headers: { cookie } })
    assert.equal(response.status, 200, route)
    await response.text()
  }
  const session = await request('/__dev/auth/session', { headers: { cookie } })
  assert.deepEqual(Object.keys(await session.json()).sort(), ['expiresAt', 'username'])
  assert.equal(calls(), 1)
  assert.equal(JSON.stringify(events).includes(password), false)
  assert.equal(JSON.stringify(events).includes(cookie), false)
  assert.equal((await request('/assets/secret.js', { headers: { cookie } })).status, 404)
  assert.equal((await request('/.env', { headers: { cookie } })).status, 404)
  assert.equal((await request('/src/dev-workbench/standalone.jsx', { headers: { cookie } })).status, 404)
})

test('external top-level links reach only the public login form while cross-site tools and frames stay closed', async (t) => {
  const { request, calls } = await fixture(t)
  const headers = {
    accept: 'text/html',
    referer: 'https://outside.example/',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
  }
  const entry = await request('/__dev/docs?path=README.md', { headers })
  assert.equal(entry.status, 303)
  assert.equal(entry.headers.get('location'), '/__dev/login?returnTo=%2F__dev%2Fdocs%3Fpath%3DREADME.md')
  const login = await request('/__dev/login', { headers })
  assert.equal(login.status, 200)
  assert.match(login.headers.get('content-security-policy'), /(?:^|; )img-src 'self'(?:;|$)/u)
  assert.match(await login.text(), /登录工作台/u)
  const sameSiteHeaders = { ...headers, 'sec-fetch-site': 'same-site', referer: 'https://tools.example.test/' }
  assert.equal((await request('/__dev/login', { headers: sameSiteHeaders })).status, 200)
  assert.equal((await request('/__dev/api/test', { headers: sameSiteHeaders })).status, 403)
  for (const route of ['/__dev/api/test', '/__dev/auth/session', '/assets/page.js']) {
    assert.equal((await request(route, { headers })).status, 403)
  }
  assert.equal((await request('/__dev/login', { headers: { ...headers, 'sec-fetch-dest': 'iframe' } })).status, 403)
  assert.equal((await request('/__dev/auth/login', { method: 'POST', headers })).status, 403)
  assert.equal((await request('/__dev/login', { headers: { ...headers, 'x-forwarded-proto': 'http' } })).status, 403)
  assert.equal(calls(), 0)
})

test('wrong credentials, business bearer, forged cookie and cross-origin writes never create a session', async (t) => {
  const { request, login } = await fixture(t)
  const failed = await login({ password: 'wrong' })
  assert.equal(failed.status, 401)
  assert.equal(failed.headers.get('set-cookie'), null)
  assert.match(await failed.text(), /name="returnTo" value="\/__dev\/docs\?path=README.md#overview"/u)
  assert.equal((await request('/__dev/api/test', { headers: { authorization: 'Bearer business-token' } })).status, 401)
  assert.equal((await request('/__dev/api/test', { headers: { cookie: `${WORKBENCH_SESSION_COOKIE}=${'a'.repeat(64)}` } })).status, 401)
  for (const route of ['/__dev/auth/login', '/__dev/auth/logout']) {
    assert.equal((await request(route, { method: 'POST', headers: { origin: 'https://evil.test' } })).status, 403)
    assert.equal((await request(route, { method: 'POST' })).status, 403)
  }
})

test('login attempts are rate limited without logging submitted account or password', async (t) => {
  const { login } = await fixture(t)
  for (let i = 0; i < 5; i++) assert.equal((await login({ password: 'wrong' })).status, 401)
  const response = await login()
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '900')
})

test('logout invalidates the server session, expired sessions fail closed and re-login rotates the cookie', async (t) => {
  let time = 1000
  const { request, login } = await fixture(t, { now: () => time, sessionTtlMs: 1000 })
  const initial = await login()
  const firstCookie = initial.headers.get('set-cookie').split(';')[0]
  const again = await login({}, firstCookie)
  const cookie = again.headers.get('set-cookie').split(';')[0]
  assert.notEqual(firstCookie, cookie)
  assert.equal((await request('/__dev/api/test', { headers: { cookie: firstCookie } })).status, 401)
  assert.equal((await request('/__dev/api/test', { headers: { cookie } })).status, 200)
  const logout = await request('/__dev/auth/logout', { method: 'POST', headers: { origin, cookie } })
  assert.equal(logout.status, 303)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/u)
  assert.equal((await request('/__dev/api/test', { headers: { cookie } })).status, 401)
  const after = await login()
  const expiring = after.headers.get('set-cookie').split(';')[0]
  time += 1001
  assert.equal((await request('/__dev/api/test', { headers: { cookie: expiring } })).status, 401)
})

test('default session expires after one absolute hour without extending on activity', async (t) => {
  const startedAt = Date.parse('2026-10-24T00:00:00.000Z')
  let time = startedAt
  const { request, login, calls } = await fixture(t, { now: () => time })
  const initial = await login()
  const rawCookie = initial.headers.get('set-cookie')
  assert.match(rawCookie, /(?:^|; )Max-Age=3600(?:;|$)/u)
  const cookie = rawCookie.split(';')[0]
  time += 30 * 60 * 1000
  const active = await request('/__dev/api/test', { headers: { cookie } })
  assert.equal(active.status, 200)
  assert.equal(active.headers.get('set-cookie'), null)
  const session = await request('/__dev/auth/session', { headers: { cookie } })
  assert.equal((await session.json()).expiresAt, new Date(startedAt + 60 * 60 * 1000).toISOString())
  time = startedAt + 60 * 60 * 1000 - 1
  assert.equal((await request('/__dev/api/test', { headers: { cookie } })).status, 200)
  time++
  const expired = await request('/__dev/api/test', { headers: { cookie } })
  assert.equal(expired.status, 401)
  assert.match(expired.headers.get('set-cookie'), /Max-Age=0/u)
  assert.equal(calls(), 2)
})

test('return paths cannot navigate outside workbench pages or reenter auth/API endpoints', () => {
  for (const value of ['https://evil.test', '//evil.test', '/erp', '/__dev/api/action', '/__dev/auth/login', '/__dev/login', '/__dev/%61pi/action', '/__dev/../erp', '/__dev\\evil', '/__dev%0d%0aLocation:evil']) {
    assert.equal(safeWorkbenchReturnTo(value), '/__dev', value)
  }
  assert.equal(safeWorkbenchReturnTo('/__dev/docs?path=README.md#section'), '/__dev/docs?path=README.md#section')
})

test('standalone reuses the same tools and omits local Vite availability and Basic authentication', () => {
  const names = createStandaloneWorkbenchPlugins('/unused', 'http://127.0.0.1:8335').map((plugin) => plugin.name)
  assert(names.includes('plush-dev-delivery-bridge'))
  assert(names.includes('plush-dev-quality-gates'))
  assert(names.includes('plush-dev-database-migration'))
  assert(!names.includes('plush-dev-operator-auth'))
  assert(!names.includes('plush-dev-web-instance'))
  assert(!names.includes('plush-dev-database-migration-recovery'))
})

test('standalone refuses duplicate generic CI execution but leaves reads and project routes available', async (t) => {
  const { request, login, calls } = await fixture(t)
  const cookie = (await login()).headers.get('set-cookie').split(';')[0]
  for (const route of ['/__dev/api/qa/quality-gates/actions', '/__dev/api/qa/coverage/actions']) {
    const response = await request(route, { method: 'POST', headers: { cookie, origin } })
    assert.equal(response.status, 403)
    assert.match(await response.text(), /GitLab CI/u)
  }
  assert.equal(calls(), 0)
  assert.equal((await request('/__dev/api/test/history', { headers: { cookie } })).status, 200)
  assert.equal((await request('/__dev/api/test/project-action', { method: 'POST', headers: { cookie, origin } })).status, 200)
  assert.equal(calls(), 2)
})
