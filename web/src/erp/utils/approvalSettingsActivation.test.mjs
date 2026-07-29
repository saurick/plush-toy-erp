import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approvalSettingsMutationMayHaveSucceeded,
  getApprovalSettingsBlockingItems,
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

test('approval preview blockers and uncertain transport are classified narrowly', () => {
  assert.deepEqual(
    getApprovalSettingsBlockingItems({
      items: [
        {
          approval_key: 'sales_order',
          configurable: true,
          enabled: true,
          blocked_reasons: ['no_eligible_approver'],
        },
        {
          approval_key: 'purchase_order',
          configurable: true,
          enabled: false,
          blocked_reasons: ['approval_disabled'],
        },
      ],
    }).map((item) => item.approval_key),
    ['sales_order']
  )
  assert.equal(
    approvalSettingsMutationMayHaveSucceeded({ isNetworkError: true }),
    true
  )
  assert.equal(
    approvalSettingsMutationMayHaveSucceeded({ isInvalidResponse: true }),
    true
  )
  assert.equal(
    approvalSettingsMutationMayHaveSucceeded({ isAbortError: true }),
    true
  )
  assert.equal(
    approvalSettingsMutationMayHaveSucceeded({ httpStatus: 408 }),
    true
  )
  assert.equal(
    approvalSettingsMutationMayHaveSucceeded({ httpStatus: 503 }),
    true
  )
  assert.equal(approvalSettingsMutationMayHaveSucceeded({ code: 50001 }), true)
  assert.equal(approvalSettingsMutationMayHaveSucceeded({ code: 40920 }), false)
})
