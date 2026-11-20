import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activateApprovalSettings,
  getApprovalSettingsBlockerLabel,
  verifyAppliedApprovalSettings,
} from './approvalSettingsActivation.mjs'

const payload = Object.freeze({
  customer_key: 'yoyoosun',
  revision: 'next-revision',
  items: [
    {
      approval_key: 'sales_order',
      configured: true,
      enabled: true,
      members: [
        {
          role_key: 'pmc',
          user_id: 0,
          strategy: 'backup',
          enabled: true,
        },
        {
          role_key: 'sales',
          user_id: 0,
          strategy: 'primary',
          enabled: true,
        },
      ],
    },
  ],
})

const receipt = Object.freeze({
  customer_key: 'yoyoosun',
  revision: 'next-revision',
  config_hash: 'next-hash',
  product_version: 'product-v1',
  status: 'active',
})

test('approval readback verifies active identity, hash, product and projection', () => {
  const readback = {
    customer_key: 'yoyoosun',
    config_revision: 'next-revision',
    config_hash: 'next-hash',
    product_version: 'product-v1',
    source: 'active_customer_config',
    items: [
      {
        approval_key: 'sales_order',
        configurable: true,
        configured: true,
        enabled: true,
        members: [
          {
            role_key: 'sales',
            user_id: 0,
            strategy: 'primary',
            priority: 100,
            enabled: true,
          },
          {
            role_key: 'pmc',
            user_id: 0,
            strategy: 'backup',
            priority: 200,
            enabled: true,
          },
        ],
      },
      {
        approval_key: 'payment',
        configurable: false,
        enabled: false,
        members: [],
      },
    ],
  }
  assert.equal(
    verifyAppliedApprovalSettings({ readback, payload, receipt }),
    readback
  )
})

test('approval readback rejects revision, hash, source and projection drift', () => {
  const base = {
    customer_key: 'yoyoosun',
    config_revision: 'next-revision',
    config_hash: 'next-hash',
    product_version: 'product-v1',
    source: 'active_customer_config',
    items: payload.items,
  }
  const cases = [
    { ...base, config_revision: 'other' },
    { ...base, source: 'approval_settings_preview' },
    { ...base, config_hash: 'other' },
    {
      ...base,
      items: [
        {
          ...payload.items[0],
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
    },
  ]
  for (const readback of cases) {
    assert.throws(
      () => verifyAppliedApprovalSettings({ readback, payload, receipt }),
      (error) => error.isInvalidResponse === true
    )
  }
})

test('approval preview blockers are classified narrowly', async () => {
  assert.equal(
    getApprovalSettingsBlockerLabel('no_eligible_approver'),
    '没有符合岗位、账号和责任设置的办理人'
  )
  assert.equal(
    getApprovalSettingsBlockerLabel('future_blocker'),
    '当前设置不能启用'
  )
  const result = await activateApprovalSettings({
    payload,
    preview: async () => ({
      items: [
        {
          approval_key: 'sales_order',
          label: '销售订单审批',
          configurable: true,
          enabled: true,
          blocked_reasons: ['no_eligible_approver'],
        },
        {
          approval_key: 'purchase_order',
          label: '采购订单审批',
          configurable: true,
          enabled: false,
          blocked_reasons: ['approval_disabled'],
        },
      ],
    }),
    apply: async () => {
      throw new Error('blocked preview must not apply')
    },
    readback: async () => activeReadback(),
  })
  assert.equal(result.status, 'blocked')
  assert.match(result.blockingMessage, /销售订单审批/u)
  assert.doesNotMatch(result.blockingMessage, /采购订单审批/u)
})

function activeReadback() {
  return {
    customer_key: 'yoyoosun',
    config_revision: 'next-revision',
    config_hash: 'next-hash',
    product_version: 'product-v1',
    source: 'active_customer_config',
    items: payload.items,
  }
}

test('approval activation confirms one previewed payload and receipt', async () => {
  const calls = []
  const result = await activateApprovalSettings({
    payload,
    preview: async (input) => {
      calls.push(['preview', input])
      return { items: [] }
    },
    apply: async (input) => {
      calls.push(['apply', input])
      return receipt
    },
    readback: async () => {
      calls.push(['readback'])
      return activeReadback()
    },
  })
  assert.equal(result.status, 'confirmed')
  assert.deepEqual(
    calls.map(([name]) => name),
    ['preview', 'apply', 'readback']
  )
  assert.equal(calls[0][1], payload)
  assert.equal(calls[1][1], payload)
})

test('approval activation keeps blocked and uncertain outcomes explicit', async () => {
  let applyCalls = 0
  const blocked = await activateApprovalSettings({
    payload,
    preview: async () => ({
      items: [
        {
          approval_key: 'sales_order',
          label: '销售订单审批',
          configurable: true,
          enabled: true,
          blocked_reasons: ['no_eligible_approver'],
        },
      ],
    }),
    apply: async () => {
      applyCalls += 1
    },
    readback: async () => activeReadback(),
  })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.blockingMessage, /销售订单审批/u)
  assert.equal(applyCalls, 0)

  const unknown = await activateApprovalSettings({
    payload,
    preview: async () => ({ items: [] }),
    apply: async () => {
      throw Object.assign(new Error('network unavailable'), {
        isNetworkError: true,
      })
    },
    readback: async () => {
      throw new Error('readback unavailable')
    },
  })
  assert.equal(unknown.status, 'submission_unknown')
})

test('approval activation retry reads first and never reapplies a known receipt', async () => {
  let applyCalls = 0
  const result = await activateApprovalSettings({
    payload,
    receipt,
    retrying: true,
    preview: async () => {
      throw new Error('preview should not run')
    },
    apply: async () => {
      applyCalls += 1
    },
    readback: async () => {
      throw new Error('readback unavailable')
    },
  })
  assert.equal(result.status, 'confirmation_pending')
  assert.equal(applyCalls, 0)
})
