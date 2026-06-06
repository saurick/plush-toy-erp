import assert from 'node:assert/strict'
import test from 'node:test'

import { ENTRY_TARGET, getEntryConfig } from '../../erp/config/entryConfig.mjs'
import { resolveAdminPostLoginPath } from './adminLoginRouting.mjs'

const entryConfig = getEntryConfig()

function buildAdminProfile() {
  return {
    is_super_admin: false,
    menus: [{ path: '/erp/dashboard', label: '看板中心' }],
    permissions: ['mobile.sales.access', 'workflow.task.read'],
  }
}

test('adminLoginRouting: 任务端来源且继续选择岗位任务端时回跳原任务端', () => {
  const remembered = []
  const path = resolveAdminPostLoginPath({
    adminProfile: buildAdminProfile(),
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '/m/sales/tasks',
    defaultRedirect: '/erp/dashboard',
    fromMobileRoleKey: 'sales',
    fixedMobileRoleKey: 'sales',
    isMobileApp: false,
    rememberChoice: (target) => remembered.push(target),
  })

  assert.equal(path, '/m/sales/tasks')
  assert.deepEqual(remembered, [ENTRY_TARGET.MOBILE_TASKS])
})

test('adminLoginRouting: 任务端来源但手动选择后台时不再回跳任务端', () => {
  const remembered = []
  const path = resolveAdminPostLoginPath({
    adminProfile: buildAdminProfile(),
    entryTarget: ENTRY_TARGET.DESKTOP,
    entryConfig,
    redirectTo: '/m/sales/tasks',
    defaultRedirect: '/erp/dashboard',
    fromMobileRoleKey: 'sales',
    fixedMobileRoleKey: 'sales',
    isMobileApp: false,
    rememberChoice: (target) => remembered.push(target),
  })

  assert.equal(path, '/erp/dashboard')
  assert.deepEqual(remembered, [ENTRY_TARGET.DESKTOP])
})
