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
