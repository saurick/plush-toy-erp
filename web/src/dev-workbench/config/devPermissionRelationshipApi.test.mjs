import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV_PERMISSION_RELATIONSHIPS_API,
  readPermissionRelationshipSnapshot,
  validatePermissionRelationshipSnapshot,
} from './devPermissionRelationshipApi.mjs'

const snapshot = {
  source: 'local_development_read_only',
  customer_key: 'test',
  read_at: '2026-10-07T00:00:00Z',
  accounts: [],
  roles: [],
  permissions: [],
  warehouse_options: [],
  access_by_role_key: {},
  approval_settings: { items: [], partial: true },
}

test('relationship client reads only the developer endpoint without ERP authorization', async () => {
  const controller = new AbortController()
  const result = await readPermissionRelationshipSnapshot({
    signal: controller.signal,
    fetchImpl: async (url, options) => {
      assert.equal(url, DEV_PERMISSION_RELATIONSHIPS_API)
      assert.equal(options.method, 'GET')
      assert.equal(options.headers.Authorization, undefined)
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.signal, controller.signal)
      return { ok: true, json: async () => snapshot }
    },
  })
  assert.equal(result, snapshot)
})

test('relationship client rejects missing evidence rather than displaying empty permissions', () => {
  for (const invalid of [
    null,
    {},
    { ...snapshot, source: 'erp_session' },
    { ...snapshot, read_at: '' },
    { ...snapshot, roles: null },
    { ...snapshot, approval_settings: {} },
    { ...snapshot, access_by_role_key: [] },
  ]) {
    assert.throws(
      () => validatePermissionRelationshipSnapshot(invalid),
      /不完整/u
    )
  }
})

test('access errors direct users to the workbench boundary and never ERP login or raw server errors', async () => {
  for (const status of [401, 403, 503]) {
    await assert.rejects(
      readPermissionRelationshipSnapshot({
        fetchImpl: async () => ({
          ok: false,
          status,
          json: async () => {
            throw new Error('must not consume raw errors')
          },
        }),
      }),
      (error) => {
        assert.match(
          error.userMessage,
          status === 503 ? /本地开发权限数据/u : /开发工作台访问检查/u
        )
        assert.doesNotMatch(error.userMessage, /后台登录|secret|数据库密码/u)
        return true
      }
    )
  }
})
