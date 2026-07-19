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
    rememberChoice: (target) => remembered.push(target),
  })

  assert.equal(path, '/erp/dashboard')
  assert.deepEqual(remembered, [ENTRY_TARGET.DESKTOP])
})

test('adminLoginRouting: 运行时关闭后台入口时手动选择后台也不进入后台', () => {
  const remembered = []
  const path = resolveAdminPostLoginPath({
    adminProfile: buildAdminProfile(),
    entryTarget: ENTRY_TARGET.DESKTOP,
    entryConfig: { ...entryConfig, desktop: false },
    redirectTo: '/erp/dashboard',
    defaultRedirect: '/erp/dashboard',
    fromMobileRoleKey: 'sales',
    fixedMobileRoleKey: 'sales',
    rememberChoice: (target) => remembered.push(target),
  })

  assert.equal(path, '/entry')
  assert.deepEqual(remembered, [])
})

test('adminLoginRouting: 岗位任务端无可用角色时不 fallback 到已关闭后台', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: {
      ...buildAdminProfile(),
      permissions: [],
    },
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig: { ...entryConfig, desktop: false },
    redirectTo: '',
    defaultRedirect: '/erp/dashboard',
    fixedMobileRoleKey: '',
    shouldRemember: false,
  })

  assert.equal(path, '')
})

test('adminLoginRouting: 固定岗位任务端不再回跳旧 /tasks 路径', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: buildAdminProfile(),
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '',
    defaultRedirect: '/erp/dashboard',
    fixedMobileRoleKey: 'sales',
    shouldRemember: false,
  })

  assert.equal(path, '/m/sales/tasks')
})

test('adminLoginRouting: 多个手机岗位登录后直接进入首个可用岗位', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: {
      ...buildAdminProfile(),
      permissions: ['mobile.sales.access', 'mobile.quality.access'],
    },
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '',
    defaultRedirect: '/erp/dashboard',
    shouldRemember: false,
  })

  assert.equal(path, '/m/sales/tasks')
})
