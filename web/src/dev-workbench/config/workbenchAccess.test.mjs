import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkbenchSession } from './workbenchAccess.mjs'

test('session presentation validates the authenticated account and expiry', () => {
  const session = { username: 'operator', expiresAt: '2030-01-01T00:00:00.000Z' }
  assert.deepEqual(parseWorkbenchSession({ ...session, password: 'must-not-propagate' }), session)
  for (const value of [null, {}, { ...session, username: '' }, { ...session, expiresAt: 'invalid' }]) {
    assert.throws(() => parseWorkbenchSession(value), /登录状态无效/u)
  }
})
