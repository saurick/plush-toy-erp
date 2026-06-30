import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ENTRY_TARGET,
  detectEntryDeviceType,
  getEnabledMobileRoleKeys,
  getEntryConfig,
  isMobileRoleEntryEnabled,
  parseMobileRoleFromPath,
  resolveDefaultEntryTarget,
  resolveMobileTasksPath,
} from './entryConfig.mjs'

test('entryConfig: 默认展示后台和全部岗位任务端角色', () => {
  const config = getEntryConfig()

  assert.equal(config.desktop, true)
  assert.equal(config.mobileTasks, true)
  assert.deepEqual(getEnabledMobileRoleKeys(config), [
    'boss',
    'sales',
    'purchase',
    'production',
    'warehouse',
    'finance',
    'pmc',
    'quality',
    'engineering',
  ])
})

test('entryConfig: 支持运行时配置隐藏单个岗位任务端角色', () => {
  globalThis.window = {
    __PLUSH_ERP_ENTRY_CONFIG__: {
      mobileRoles: { warehouse: false },
    },
  }

  try {
    const config = getEntryConfig()
    assert.equal(isMobileRoleEntryEnabled('warehouse', config), false)
    assert.equal(isMobileRoleEntryEnabled('quality', config), true)
  } finally {
    delete globalThis.window
  }
})

test('entryConfig: 设备类型只决定默认入口', () => {
  assert.equal(
    resolveDefaultEntryTarget({ deviceType: 'phone' }),
    ENTRY_TARGET.MOBILE_TASKS
  )
  assert.equal(
    resolveDefaultEntryTarget({ deviceType: 'desktop' }),
    ENTRY_TARGET.DESKTOP
  )
  assert.equal(resolveDefaultEntryTarget({ deviceType: 'tablet' }), '')
  assert.equal(
    resolveDefaultEntryTarget({
      deviceType: 'tablet',
      lastTarget: ENTRY_TARGET.MOBILE_TASKS,
    }),
    ENTRY_TARGET.MOBILE_TASKS
  )
})

test('entryConfig: 路径优先于设备默认', () => {
  assert.equal(
    resolveDefaultEntryTarget({
      pathname: '/m/warehouse/tasks',
      deviceType: 'desktop',
    }),
    ENTRY_TARGET.MOBILE_TASKS
  )
  assert.equal(
    resolveDefaultEntryTarget({
      pathname: '/erp/dashboard',
      deviceType: 'phone',
    }),
    ENTRY_TARGET.DESKTOP
  )
})

test('entryConfig: 岗位任务端角色路径解析和生成稳定', () => {
  assert.equal(parseMobileRoleFromPath('/m/warehouse/tasks'), 'warehouse')
  assert.equal(resolveMobileTasksPath('quality'), '/m/quality/tasks')
  assert.equal(resolveMobileTasksPath('engineering'), '/m/engineering/tasks')
})

test('entryConfig: 平板识别覆盖 iPad 桌面 UA', () => {
  assert.equal(
    detectEntryDeviceType({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      maxTouchPoints: 5,
    }),
    'tablet'
  )
})
