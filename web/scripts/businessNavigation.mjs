import assert from 'node:assert/strict'
import { businessModuleDefinitions } from '../src/erp/config/businessModules.mjs'
import { getBusinessModuleGroup } from '../src/erp/utils/businessModuleGroups.mjs'

// 通过真实侧栏和模块页签定位页面，权限检查仍以实际渲染入口为准。
export async function findVisibleBusinessPage(page, label) {
  const menu = page.locator('.erp-admin-menu:visible')
  const direct = menu.getByRole('menuitem', { name: label, exact: true })
  if (await direct.count()) {
    assert.equal(await direct.count(), 1, `侧栏必须只有一个 ${label} 入口`)
    return direct
  }
  const definition = businessModuleDefinitions.find((item) => item.label === label)
  const group = getBusinessModuleGroup(definition?.path)
  assert(group, `未登记 ${label} 的模块导航`)
  const moduleEntry = menu.getByRole('menuitem', { name: group.label, exact: true })
  assert.equal(await moduleEntry.count(), 1, `侧栏必须只有一个 ${group.label} 入口`)
  if (group.tabs.length === 1) return moduleEntry
  if (!(await moduleEntry.getAttribute('class')).includes('ant-menu-item-selected')) {
    await moduleEntry.click()
  }
  const tab = group.tabs.find((item) => item.path === definition.path)
  assert(tab, `未登记 ${label} 的模块页签`)
  const entry = page.locator('.erp-business-module-tabs').getByRole('tab', { name: tab.label, exact: true })
  await entry.waitFor({ state: 'visible' })
  assert.equal(await entry.count(), 1, `模块必须只有一个 ${label} 页签`)
  return entry
}
