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

test('adminLoginRouting: demo_boss 从老板任务端选择电脑端后进入工作台', () => {
  const remembered = []
  const path = resolveAdminPostLoginPath({
    adminProfile: {
      username: 'demo_boss',
      is_super_admin: false,
      roles: [{ role_key: 'boss', name: '老板 / 管理层' }],
      permissions: ['mobile.boss.access', 'erp.workbench.read'],
      menus: [
        { key: 'global-dashboard', path: '/erp/dashboard' },
        { key: 'business-dashboard', path: '/erp/business-dashboard' },
      ],
    },
    entryTarget: ENTRY_TARGET.DESKTOP,
    entryConfig,
    redirectTo: '/m/boss/tasks',
    defaultRedirect: '/erp/dashboard',
    fromMobileRoleKey: 'boss',
    fixedMobileRoleKey: 'boss',
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

test('adminLoginRouting: 岗位任务端无可用角色且后台关闭时仍保留登录态进入提示页', () => {
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

  assert.equal(path, '/entry?reason=mobile-role-unassigned')
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

test('adminLoginRouting: 仅系统管理员岗位的超级管理员不自动进入老板端', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: {
      ...buildAdminProfile(),
      is_super_admin: true,
      roles: [{ role_key: 'admin', name: '系统管理员' }],
      permissions: ['mobile.boss.access'],
    },
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '',
    defaultRedirect: '/erp/dashboard',
    shouldRemember: false,
  })

  assert.equal(path, '/entry?reason=mobile-role-unassigned')
})

test('adminLoginRouting: 系统管理员从老板深链登录后保留登录态并进入岗位提示页', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: {
      ...buildAdminProfile(),
      is_super_admin: true,
      roles: [{ role_key: 'admin', name: '系统管理员' }],
      permissions: ['mobile.boss.access'],
    },
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '/m/boss/tasks',
    fromMobileRoleKey: 'boss',
    fixedMobileRoleKey: 'boss',
    shouldRemember: false,
  })

  assert.equal(path, '/entry?reason=mobile-role-unassigned')
})

test('adminLoginRouting: 已分配其他岗位的账号访问错误岗位深链时提示岗位不可用', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: buildAdminProfile(),
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '/m/boss/tasks',
    fromMobileRoleKey: 'boss',
    fixedMobileRoleKey: 'boss',
    shouldRemember: false,
  })

  assert.equal(path, '/entry?reason=mobile-role-unavailable')
})

test('adminLoginRouting: 超级管理员明确分配老板岗位后可以进入老板端', () => {
  const path = resolveAdminPostLoginPath({
    adminProfile: {
      ...buildAdminProfile(),
      is_super_admin: true,
      roles: [
        { role_key: 'admin', name: '系统管理员' },
        { role_key: 'boss', name: '老板 / 管理层' },
      ],
      permissions: ['mobile.boss.access'],
    },
    entryTarget: ENTRY_TARGET.MOBILE_TASKS,
    entryConfig,
    redirectTo: '',
    defaultRedirect: '/erp/dashboard',
    shouldRemember: false,
  })

  assert.equal(path, '/m/boss/tasks')
})
