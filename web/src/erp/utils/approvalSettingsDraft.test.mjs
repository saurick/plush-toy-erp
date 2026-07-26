import assert from 'node:assert/strict'
import test from 'node:test'

import {
  freezeApprovalSettingsPayload,
  nextApprovalSettingsRevision,
} from './approvalSettingsDraft.mjs'

test('approval revision preserves a secure unique suffix within 64 characters', () => {
  const active = 'x'.repeat(64)
  const first = nextApprovalSettingsRevision(active, {
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
  })
  const second = nextApprovalSettingsRevision(active, {
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  })

  assert.equal(first.length, 64)
  assert.equal(second.length, 64)
  assert.notEqual(first, active)
  assert.notEqual(first, second)
  assert.match(first, /\.approval\.11111111111141118111111111111111$/)
})

test('approval publish payload is a detached deeply immutable snapshot', () => {
  const draftItems = [
    {
      approval_key: 'sales_order',
      enabled: true,
      members: [{ role_key: 'sales', strategy: 'primary', enabled: true }],
    },
  ]
  const payload = freezeApprovalSettingsPayload({
    settings: {
      customer_key: 'yoyoosun',
      config_revision: 'active-v1',
      config_hash: 'hash-v1',
    },
    revision: 'candidate-v2',
    draftItems,
  })

  draftItems[0].members[0].role_key = 'boss'
  assert.equal(payload.items[0].members[0].role_key, 'sales')
  assert.equal(Object.isFrozen(payload), true)
  assert.equal(Object.isFrozen(payload.items), true)
  assert.equal(Object.isFrozen(payload.items[0].members[0]), true)
  assert.throws(() => {
    payload.items[0].enabled = false
  }, TypeError)
})
