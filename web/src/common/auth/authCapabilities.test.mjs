import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTH_SMS_MODE,
  DEFAULT_AUTH_CAPABILITIES,
  normalizeAuthCapabilities,
} from './authCapabilities.mjs'

test('authCapabilities: empty response disables sms login by default', () => {
  assert.deepEqual(normalizeAuthCapabilities({}), {
    ...DEFAULT_AUTH_CAPABILITIES,
    smsLoginDisabledReason: '',
  })
})

test('authCapabilities: mock sms mode is visible to login pages', () => {
  assert.deepEqual(
    normalizeAuthCapabilities({
      sms_login: {
        enabled: true,
        mode: 'mock',
        mock_delivery: true,
      },
    }),
    {
      smsLoginEnabled: true,
      smsLoginMode: AUTH_SMS_MODE.MOCK,
      smsLoginMockDelivery: true,
      smsLoginDisabledReason: '',
    }
  )
})
