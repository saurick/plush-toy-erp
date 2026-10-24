import assert from 'node:assert/strict'
import { createServer, get } from 'node:http'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDevOperatorAuthMiddleware } from './devOperatorAuthPlugin.mjs'
import {
  createDevPermissionRelationshipsPlugin,
  readLocalPermissionRelationships,
  readStandalonePermissionRelationships,
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

test('standalone reads the registered audit role with a fixed artifact and never invokes a compiler', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbench-permission-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'toolchain/bin'), { recursive: true })
  await writeFile(path.join(root, 'toolchain/bin/dev-permission-relationships'), 'artifact', { mode: 0o700 })
  const file = path.join(root, 'audit-dsn')
  const dsn = 'postgres://plush_dev_backup:private-read-secret@192.168.0.133:5432/plush_erp?sslmode=disable'
  await writeFile(file, dsn, { mode: 0o600 })
  const calls = []
  const options = { env: { PLUSH_WORKBENCH_PERMISSION_AUDIT_DSN_FILE: file, PLUSH_GITLAB_TOKEN: 'must-not-inherit', ERP_CUSTOMER_KEY: snapshot.customer_key },
    verifyRole: async (value) => { assert.equal(value, dsn) },
    run: async (...args) => { calls.push(args); return { stdout: JSON.stringify(snapshot) } } }
  const result = await readStandalonePermissionRelationships(root, options)
  assert.deepEqual(result, snapshot)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], path.join(root, 'toolchain/bin/dev-permission-relationships'))
  assert.deepEqual(calls[0][1], [])
  assert.equal(calls[0][2].env.POSTGRES_DSN, dsn)
  assert.equal(calls[0][2].env.PLUSH_GITLAB_TOKEN, undefined)
  for (const bad of [dsn.replace('plush_dev_backup', 'plush_dev_app'), dsn.replace('/plush_erp?', '/plush_erp_production?'), dsn.replace('192.168.0.133:5432', '127.0.0.1:15432')]) {
    await writeFile(file, bad)
    await assert.rejects(readStandalonePermissionRelationships(root, options))
  }
  await rm(file)
  await symlink(path.join(root, 'other'), file)
  await assert.rejects(readStandalonePermissionRelationships(root, options))
  assert.equal(calls.length, 1)
})
