import assert from 'node:assert/strict'
import { createServer, get } from 'node:http'
import test from 'node:test'
import { createDevOperatorAuthMiddleware } from './devOperatorAuthPlugin.mjs'
import {
  createDevPermissionRelationshipsPlugin,
  readLocalPermissionRelationships,
} from './devPermissionRelationshipsPlugin.mjs'
import { DEV_PERMISSION_RELATIONSHIPS_API } from '../src/dev-workbench/config/devPermissionRelationshipApi.mjs'

const snapshot = {
  source: 'local_development_read_only',
  customer_key: 'test-customer',
  read_at: '2026-10-07T00:00:00Z',
  accounts: [],
  roles: [],
  permissions: [],
  warehouse_options: [],
  access_by_role_key: {},
  approval_settings: { items: [] },
}

async function serve(
  t,
  { access = 'private-network', readSnapshot = async () => snapshot } = {}
) {
  let handler
  createDevPermissionRelationshipsPlugin({ readSnapshot }).configureServer({
    middlewares: {
      use(fn) {
        handler = fn
      },
    },
  })
  const auth = createDevOperatorAuthMiddleware({
    readAccessMode: () => access,
    readCredentials: () => ({
      username: 'developer',
      password: 'independent-workbench-secret-12345',
    }),
  })
  const server = createServer((req, res) =>
    auth(req, res, () =>
      handler(req, res, () => {
        res.writeHead(404)
        res.end()
      })
    )
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      })
  )
  return `http://127.0.0.1:${server.address().port}${DEV_PERMISSION_RELATIONSHIPS_API}`
}

test('private workbench reads are independent of absent, ordinary and stale ERP tokens', async (t) => {
  const url = await serve(t)
  for (const authorization of [
    '',
    'Bearer ordinary-erp-role',
    'Bearer expired-erp-session',
  ]) {
    const response = await fetch(url, {
      headers: authorization ? { authorization } : {},
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), snapshot)
  }
})

test('operator workbench still requires its independent identity; ERP token grants no developer access', async (t) => {
  const url = await serve(t, { access: 'operator' })
  for (const authorization of ['', 'Bearer super-admin-erp-token']) {
    assert.equal((await fetch(url, { headers: { authorization } })).status, 401)
  }
  const authorization = `Basic ${Buffer.from('developer:independent-workbench-secret-12345').toString('base64')}`
  assert.equal((await fetch(url, { headers: { authorization } })).status, 200)
})

test('developer snapshot rejects cross-site reads, arbitrary targets and all mutations before querying', async (t) => {
  let reads = 0
  const url = await serve(t, {
    readSnapshot: async () => {
      reads += 1
      return snapshot
    },
  })
  for (const [suffix, options, status] of [
    ['', { headers: { origin: 'https://foreign.example' } }, 403],
    ['', { headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    ['?target=production', {}, 400],
    ['?role_key=admin', {}, 400],
    ['', { method: 'POST', body: '{}' }, 405],
    ['', { method: 'DELETE' }, 405],
  ]) {
    assert.equal(
      (await fetch(url + suffix, options)).status,
      status,
      JSON.stringify({ suffix, options })
    )
  }
  const hostStatus = await new Promise((resolve, reject) => {
    get(url, { headers: { host: 'foreign.example' } }, (response) => {
      response.resume()
      resolve(response.statusCode)
    }).on('error', reject)
  })
  assert.equal(hostStatus, 403)
  assert.equal(reads, 0)
})

test('read failures return no stale snapshot, subprocess error or secret', async (t) => {
  const url = await serve(t, {
    readSnapshot: async () => {
      throw new Error('postgres://secret@private-host/database')
    },
  })
  const response = await fetch(url)
  assert.equal(response.status, 503)
  const body = await response.text()
  assert.doesNotMatch(body, /secret|private-host|postgres|accounts/u)
})

test('local reader uses fixed commands and keeps database credentials on the server', async () => {
  const calls = []
  const result = await readLocalPermissionRelationships('/workspace/project', {
    readEnvironment: () => ({ ERP_CUSTOMER_KEY: 'test-customer' }),
    resolveAuditDSN: async () => 'postgres://internal-secret/database',
    run: async (command, args, options) => {
      calls.push({ command, args, options })
      return { stdout: JSON.stringify(snapshot) }
    },
  })
  assert.deepEqual(
    calls.map(({ command, args }) => [command, ...args]),
    [['go', 'run', './cmd/dev-permission-relationships']]
  )
  assert.equal(
    calls[0].options.env.POSTGRES_DSN,
    'postgres://internal-secret/database'
  )
  assert.equal(calls[0].options.env.ERP_CUSTOMER_KEY, 'test-customer')
  assert.equal(calls[0].options.env.GIT_OPTIONAL_LOCKS, '0')
  assert.equal(calls[0].options.cwd, '/workspace/project/server')
  assert.doesNotMatch(JSON.stringify(result), /internal-secret/u)
})
