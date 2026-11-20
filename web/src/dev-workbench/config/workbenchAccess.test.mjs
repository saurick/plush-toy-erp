import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkbenchSession, WORKBENCH_ROLES } from './workbenchAccess.mjs'

test('session presentation accepts only server-defined identities and never defaults an unknown role to operator', () => {
  const base = { username: 'viewer', role: WORKBENCH_ROLES.viewer, expiresAt: '2030-01-01T00:00:00.000Z' }
  assert.deepEqual(parseWorkbenchSession({ ...base, password: 'must-not-propagate' }), base)
  for (const value of [null, {}, { ...base, role: '' }, { ...base, role: 'admin' }, { ...base, username: '' }, { ...base, expiresAt: 'invalid' }]) {
    assert.throws(() => parseWorkbenchSession(value), /登录状态无效/u)
  }
})
