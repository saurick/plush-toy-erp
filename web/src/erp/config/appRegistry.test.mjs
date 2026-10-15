import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_ERP_APP_ID,
  getAppDefinition,
  mobileRoleDefinitions,
  resolveRuntimeAppId,
} from './appRegistry.mjs'

test('app registry only exposes the desktop runtime app', () => {
  assert.equal(DEFAULT_ERP_APP_ID, 'desktop')
  assert.equal(resolveRuntimeAppId(), 'desktop')
  assert.equal(getAppDefinition('desktop').id, 'desktop')
  assert.equal(getAppDefinition('desktop').title, '业务管理')
  assert.equal(getAppDefinition('desktop').shortTitle, '电脑端')
  const legacyMobileAppId = ['mobile', 'boss'].join('-')

  assert.throws(
    () => getAppDefinition(legacyMobileAppId),
    new RegExp(`Unknown ERP app id: ${legacyMobileAppId}`)
  )
})

test('mobile role definitions expose role paths without app ids', () => {
  assert.equal(mobileRoleDefinitions.length, 9)
  assert(mobileRoleDefinitions.some((role) => role.roleKey === 'engineering'))
  assert.equal(
    mobileRoleDefinitions.some((role) => 'id' in role),
    false
  )
  assert(
    mobileRoleDefinitions.every((role) => role.shortTitle.endsWith('手机待办'))
  )
  assert(
    mobileRoleDefinitions.every(
      (role) => !/岗位任务端|\/m\/|deferred/u.test(role.description)
    )
  )
})
