import assert from 'node:assert/strict'
import test from 'node:test'

import { installAdminRpcMocks } from './adminRpcMocks.mjs'

test('style-l1 RPC mocks reject unknown methods across every installed domain', async () => {
  const handlers = new Map()
  await installAdminRpcMocks(
    {
      async route(pattern, handler) {
        handlers.set(pattern, handler)
      },
    },
    {
      effectiveSessionOverride: {
        actions: [],
        roles: [],
        workflow_visible_owner_role_keys_by_capability: {},
      },
    }
  )

  for (const domain of [
    'admin',
    'auth',
    'debug',
    'customer_config',
    'masterdata',
    'sales_order',
    'purchase_order',
    'outsourcing_order',
    'bom',
    'operational_fact',
    'purchase',
    'quality',
    'inventory',
    'business',
    'workflow',
    'attachment',
  ]) {
    const handler = handlers.get(`**/rpc/${domain}`)
    assert.equal(typeof handler, 'function', domain)
    let response
    await handler({
      request: () => ({
        headers: () => ({ referer: '' }),
        postDataJSON: () => ({
          id: domain,
          method: `unknown_${domain}_method`,
          params: {},
        }),
      }),
      fulfill: async ({ body }) => {
        response = JSON.parse(body)
      },
    })
    assert.notEqual(response?.result?.code, 0, domain)
  }
})

test('style-l1 admin RPC mock persists legal notice acknowledgement and still rejects unknown methods', async () => {
  const handlers = new Map()
  await installAdminRpcMocks(
    {
      async route(pattern, handler) {
        handlers.set(pattern, handler)
      },
    },
    {
      effectiveSessionOverride: {
        actions: [],
        roles: [],
        workflow_visible_owner_role_keys_by_capability: {},
      },
      legalNoticeAcknowledged: false,
    }
  )

  const handler = handlers.get('**/rpc/admin')
  assert.equal(typeof handler, 'function')
  const callAdmin = async (method, params = {}) => {
    let response
    await handler({
      request: () => ({
        headers: () => ({ referer: '' }),
        postDataJSON: () => ({ id: method, method, params }),
      }),
      fulfill: async ({ body }) => {
        response = JSON.parse(body)
      },
    })
    return response
  }
  const identity = {
    notice_version: '2026-08-11.1',
    content_fingerprint: '0123456789abcdef',
  }

  const before = await callAdmin('legal_notice_status', identity)
  assert.equal(before.result.code, 0)
  assert.deepEqual(before.result.data, {
    ...identity,
    acknowledged: false,
    acknowledged_at: 0,
  })

  const acknowledged = await callAdmin('acknowledge_legal_notice', identity)
  assert.equal(acknowledged.result.code, 0)
  assert.equal(acknowledged.result.data.acknowledged, true)
  assert.equal(
    Number.isSafeInteger(acknowledged.result.data.acknowledged_at),
    true
  )

  const repeated = await callAdmin('acknowledge_legal_notice', identity)
  assert.deepEqual(repeated.result.data, acknowledged.result.data)

  const after = await callAdmin('legal_notice_status', identity)
  assert.deepEqual(after.result.data, acknowledged.result.data)

  const unknown = await callAdmin('unknown_admin_method')
  assert.notEqual(unknown.result.code, 0)
})

test('style-l1 admin RPC mock starts normal business sessions with the current legal notice acknowledged', async () => {
  const handlers = new Map()
  await installAdminRpcMocks(
    {
      async route(pattern, handler) {
        handlers.set(pattern, handler)
      },
    },
    {
      effectiveSessionOverride: {
        actions: [],
        roles: [],
        workflow_visible_owner_role_keys_by_capability: {},
      },
    }
  )

  const handler = handlers.get('**/rpc/admin')
  assert.equal(typeof handler, 'function')
  const callAdmin = async (method, params = {}) => {
    let response
    await handler({
      request: () => ({
        headers: () => ({ referer: '' }),
        postDataJSON: () => ({ id: method, method, params }),
      }),
      fulfill: async ({ body }) => {
        response = JSON.parse(body)
      },
    })
    return response
  }
  const identity = {
    notice_version: '2026-08-11.1',
    content_fingerprint: 'fedcba9876543210',
  }

  const status = await callAdmin('legal_notice_status', identity)
  assert.equal(status.result.code, 0)
  assert.equal(status.result.data.acknowledged, true)
  assert.equal(Number.isSafeInteger(status.result.data.acknowledged_at), true)

  const unknown = await callAdmin('unknown_admin_method')
  assert.notEqual(unknown.result.code, 0)
})
