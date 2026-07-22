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

  assert.match(source, /useOutletContext\(\)/u)
  assert.match(source, /getRoleHelpGuidesForProfile\(adminProfile/u)
  assert.match(source, /filterRoleHelpPriorities\(selectedGuide/u)
  assert.match(source, /priority\.available/u)
  assert.match(source, /data-role-help-key=\{selectedGuide\.key\}/u)
  assert.match(source, /htmlFor="erp-help-center-role-select"/u)
  assert.match(source, /id="erp-help-center-role-select"/u)
  assert.match(source, /当前没有可直接打开的常用入口/u)
})

test('HelpCenterPage: 通用帮助由登录壳追加且不依赖业务权限项', () => {
  const layoutSource = readRepoFile('web/src/erp/components/ERPLayout.jsx')
  const permissionSource = readRepoFile(
    'web/src/erp/config/menuPermissions.mjs'
  )

  assert.match(layoutSource, /getAuthenticatedNavigationSections/u)
  assert.match(layoutSource, /item\.access === 'authenticated'/u)
  assert.match(layoutSource, /permissionGovernedVisibleSections/u)
  assert.match(
    layoutSource,
    /currentEntry\?\.access === 'authenticated'[\s\S]*return false/u
  )
  assert.doesNotMatch(permissionSource, /erp\.help_center\.read/u)
})
