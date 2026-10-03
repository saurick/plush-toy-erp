import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('HelpCenterPage: 使用当前账号岗位和已开放页面生成帮助', () => {
  const source = readRepoFile('web/src/erp/pages/HelpCenterPage.jsx')
  const content = readRepoFile(
    'web/src/erp/components/help/HelpScenarioContent.jsx'
  )

  assert.match(source, /useOutletContext\(\)/u)
  assert.match(source, /getRoleHelpGuidesForProfile\(adminProfile/u)
  assert.match(source, /getRoleHelpScenarios\(selectedGuide/u)
  assert.match(source, /selectedScenario\.available/u)
  assert.match(source, /allowedMenuPaths: visibleMenuPaths/u)
  assert.match(source, /data-role-help-key=\{selectedGuide\.key\}/u)
  assert.match(source, /htmlFor="erp-help-center-role-select"/u)
  assert.match(source, /id="erp-help-center-role-select"/u)
  assert.match(source, /当前账号未开放此页面/u)
  assert.match(content, /办理概览/u)
  assert.match(content, /完成后应看到/u)
  assert.match(content, /遇到异常/u)
  assert.match(content, /处理后怎样继续/u)
  assert.match(content, /scenario\.exception\.action/u)
  assert.match(content, /SlidingSegmented/u)
  assert.match(
    source,
    /key=\{`\$\{selectedGuide.key\}:\$\{selectedScenario.key\}`\}/u
  )
  assert.match(source, /切换这里只查看说明/u)
  assert.match(source, /查看岗位/u)
  assert.match(source, /不改变岗位或权限/u)
  assert.doesNotMatch(source, /<Alert|showIcon/u)
  assert.doesNotMatch(source, /常见问题/u)
  assert.doesNotMatch(source, /selectedGuide\.questions/u)
  assert.doesNotMatch(source, /selectedGuide\.summary/u)
  assert.doesNotMatch(source, /selectedGuide\.cautions/u)
  assert.doesNotMatch(source, /操作时要注意/u)
})

test('HelpCenterPage: 通用帮助由登录壳追加且不依赖业务权限项', () => {
  const layoutSource = readRepoFile('web/src/erp/components/ERPLayout.jsx')
  const permissionSource = readRepoFile(
    'web/src/erp/config/menuPermissions.mjs'
  )

  assert.match(layoutSource, /getAuthenticatedNavigationSections/u)
  assert.match(layoutSource, /item\.access === 'authenticated'/u)
  assert.match(layoutSource, /permissionGovernedVisibleSections/u)
  assert.match(layoutSource, /getCustomerNavigationPresentation/u)
  assert.match(layoutSource, /buildRoleGuidedNavigation/u)
  assert.match(layoutSource, /label: '常用工作'/u)
  assert.match(layoutSource, /roleGuidedNavigation\.secondarySections\.map/u)
  assert.match(layoutSource, /data-navigation-presentation/u)
  assert.doesNotMatch(
    layoutSource,
    /ROLE_GUIDED_MORE_MENU_KEY|setRoleGuidedOpenKeys|更多功能/u
  )
  assert.match(
    layoutSource,
    /currentEntry\?\.sidebarParentPath \|\| currentNavigationEntry\.menuPath/u
  )
  assert.match(layoutSource, /\?\s*\[currentSidebarPath\]\s*:\s*\[\]/u)
  assert.doesNotMatch(layoutSource, /defaultOpenKeys=/u)
  assert.match(
    layoutSource,
    /currentEntry\?\.access === 'authenticated'[\s\S]*return false/u
  )
  assert.doesNotMatch(permissionSource, /erp\.help_center\.read/u)
})
