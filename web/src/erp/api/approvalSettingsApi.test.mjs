import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./approvalSettingsApi.mjs', import.meta.url)),
  'utf8'
)

async function loadApi(call) {
  globalThis.__approvalSettingsCall = call
  const transformed = source
    .replace(
      /import \{ AUTH_SCOPE \} from '[^']+'\n/,
      "const AUTH_SCOPE = { ADMIN: 'admin' }\n"
    )
    .replace(
      /import \{ ADMIN_BASE_PATH \} from '[^']+'\n/,
      "const ADMIN_BASE_PATH = '/admin'\n"
    )
    .replace(
      /import \{ JsonRpc \} from '[^']+'\n/,
      'class JsonRpc { call(method, params) { return globalThis.__approvalSettingsCall(method, params) } }\n'
    )
  return import(
    `data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}#${Date.now()}-${Math.random()}`
  )
}

test('approval settings API uses fixed strict revision contract', async () => {
  const calls = []
  const api = await loadApi(async (method, params) => {
    calls.push({ method, params })
    return {
      data:
        method === 'publish_approval_settings' ||
        method === 'apply_approval_settings'
          ? {
              revision: {
                customer_key: params.customer_key,
                revision: params.revision,
                config_hash: 'hash-2',
                product_version: 'v1',
                status:
                  method === 'apply_approval_settings' ? 'active' : 'published',
              },
            }
          : {
              approval_settings: {
                items: (params.items || []).map((item) => ({
                  ...item,
                  configured: true,
                })),
              },
            },
    }
  })
  const input = {
    customer_key: 'yoyoosun',
    revision: 'approval-rev-2',
    expected_active_revision: 'approval-rev-1',
    expected_active_hash: 'a'.repeat(64),
    items: [
      {
        approval_key: 'sales_order',
        enabled: true,
        members: [
          {
            role_key: 'sales',
            user_id: 0,
            strategy: 'primary',
            enabled: true,
          },
        ],
      },
    ],
  }
  await api.previewApprovalSettings(input)
  await api.publishApprovalSettings(input)
  await api.applyApprovalSettings(input)
  assert.deepEqual(
    calls.map((call) => call.method),
    [
      'preview_approval_settings',
      'publish_approval_settings',
      'apply_approval_settings',
    ]
  )
  assert.deepEqual(calls[0].params, input)
  assert.deepEqual(calls[2].params, input)
})

test('approval settings API rejects missing CAS and invalid members locally', async () => {
  const api = await loadApi(async () => {
    throw new Error('RPC must not be called')
  })
  assert.throws(
    () =>
      api.buildApprovalSettingsRevisionPayload({
        revision: 'r2',
        items: [
          {
            approval_key: 'sales_order',
            enabled: true,
            members: [],
          },
        ],
      }),
    /当前生效版本/
  )
  assert.throws(
    () =>
      api.buildApprovalSettingsRevisionPayload({
        revision: 'r2',
        expected_active_revision: 'r1',
        expected_active_hash: 'hash',
        items: [
          {
            approval_key: 'sales_order',
            enabled: true,
            members: [
              {
                role_key: '',
                user_id: 1,
                strategy: 'primary',
                enabled: true,
              },
            ],
          },
        ],
      }),
    /审批岗位/
  )
})

test('approval settings API fails closed when a successful response has no payload', async () => {
  const api = await loadApi(async () => ({ data: null }))
  await assert.rejects(() => api.getApprovalSettings(), /审批责任数据不完整/)
  await assert.rejects(
    () =>
      api.previewApprovalSettings({
        revision: 'r2',
        expected_active_revision: 'r1',
        expected_active_hash: 'hash',
        items: [
          {
            approval_key: 'sales_order',
            enabled: true,
            members: [],
          },
        ],
      }),
    /审批责任数据不完整/
  )
})

test('approval settings API requires explicit configured state', async () => {
  const api = await loadApi(async () => ({
    data: {
      approval_settings: {
        items: [
          {
            approval_key: 'sales_order',
            enabled: false,
          },
        ],
      },
    },
  }))
  await assert.rejects(() => api.getApprovalSettings(), /审批责任数据不完整/)
})

test('approval settings API marks incomplete mutation receipts as uncertain', async () => {
  const api = await loadApi(async (method) => ({
    data: {
      revision:
        method === 'apply_approval_settings'
          ? {
              customer_key: 'yoyoosun',
              revision: 'r2',
              config_hash: 'hash-2',
              product_version: 'v1',
              status: 'published',
            }
          : { revision: 'r2' },
    },
  }))
  const input = {
    customer_key: 'yoyoosun',
    revision: 'r2',
    expected_active_revision: 'r1',
    expected_active_hash: 'hash',
    items: [
      {
        approval_key: 'sales_order',
        enabled: true,
        members: [],
      },
    ],
  }
  await assert.rejects(
    () => api.publishApprovalSettings(input),
    (error) =>
      error?.isInvalidResponse === true &&
      /审批责任发布结果不完整/.test(error.message)
  )
  await assert.rejects(
    () => api.applyApprovalSettings(input),
    (error) =>
      error?.isInvalidResponse === true &&
      /审批责任生效回执不完整/.test(error.message)
  )
})
