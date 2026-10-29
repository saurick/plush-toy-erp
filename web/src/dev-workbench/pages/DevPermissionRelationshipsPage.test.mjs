import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'
import { readContractSource as readFileSync } from '../../../scripts/test/publicContractSource.mjs'

const source = readFileSync(
  fileURLToPath(
    new URL('./DevPermissionRelationshipsPage.jsx', import.meta.url)
  ),
  'utf8'
)
const navigationSource = readFileSync(
  fileURLToPath(
    new URL('../config/devPermissionNavigation.mjs', import.meta.url)
  ),
  'utf8'
)
const menuSource = readFileSync(
  fileURLToPath(
    new URL(
      '../components/DevPermissionNavigationOverview.jsx',
      import.meta.url
    )
  ),
  'utf8'
)
const graphSource = readFileSync(
  fileURLToPath(
    new URL('../components/DevPermissionRelationshipGraph.jsx', import.meta.url)
  ),
  'utf8'
)
const responsibilitySource = readFileSync(
  fileURLToPath(
    new URL('../components/DevRoleResponsibilityGraph.jsx', import.meta.url)
  ),
  'utf8'
)

test('permission capability page and menu remain valid JSX', async () => {
  for (const [name, code] of [
    ['page', source],
    ['menu', menuSource],
    ['graph', graphSource],
    ['responsibilities', responsibilitySource],
  ]) {
    await transformWithEsbuild(code, `${name}.jsx`, {
      loader: 'jsx',
      jsx: 'automatic',
    })
  }
})

test('permission lookup reads the controlled snapshot without business writes or impersonation', () => {
  assert.match(source, /readPermissionRelationshipSnapshot/u)
  assert.match(source, /base|snapshot/u)
  assert.match(source, /AbortController/u)
  assert.match(source, /request === requestRef\.current/u)
  assert.doesNotMatch(
    source + navigationSource + menuSource,
    /adminRpc|JsonRpc|AUTH_SCOPE|admin-login|set_roles|set_role_settings|publishApprovalSettings|applyApprovalSettings/u
  )
  assert.match(source, /getPermissionRelationshipContext/u)
  assert.match(navigationSource, /getPermissionRelationshipContext/u)
  assert.match(source, /实际可用范围以员工登录后的权限结果为准/u)
})

test('permission lookup preserves the shared Mermaid view, capability checks and role responsibilities', () => {
  assert.match(source, /aria-label="岗位与业务能力"/u)
  assert.match(source, /aria-label="功能与可用结果"/u)
  assert.match(source, /buildPermissionCapabilityGroups/u)
  assert.match(source, /搜索功能/u)
  assert.match(source, /DevPermissionRelationshipGraph/u)
  assert.match(graphSource, /MermaidDiagram/u)
  assert.match(graphSource, /chart=\{model\.chart\}/u)
  assert.match(graphSource, /showSourceOnError=\{false\}/u)
  assert.match(graphSource, /请选择功能范围/u)
  assert.match(graphSource, /未授予/u)
  assert.match(source, /<Tabs/u)
  for (const label of ['关系图', '实际菜单', '明细核对']) {
    assert.match(source, new RegExp(`label: '${label}'`, 'u'))
  }
  assert.match(source, /tabKey === 'graph'/u)
  assert.match(source, /DevRoleResponsibilityGraph/u)
  assert.match(responsibilitySource, /BusinessActionRelations/u)
  assert.match(responsibilitySource, /核心职责/u)
  assert.match(responsibilitySource, /可选辅助/u)
  assert.match(source, /<Drawer/u)
  assert.match(source, /tabKey === 'menu'/u)
  assert.match(source, /panel === 'evidence'/u)
  assert.match(source, /panel === 'responsibilities'/u)
  assert.match(source, /单据能否操作还需满足业务状态与责任条件/u)
})

test('context is carried through flow/configuration navigation and one-step auxiliary views', () => {
  for (const key of [
    'mode',
    'target',
    'module',
    'q',
    'status',
    'tab',
    'scope',
    'panel',
    'duty',
    'activity',
  ]) {
    assert.match(source, new RegExp(`['"]${key}['"]`, 'u'))
  }
  assert.match(source, /useNavigate/u)
  assert.match(source, /\/erp\/system\/permissions\?tab=roles&role=/u)
  assert.match(source, /DEV_FLOW_STATE_QUERY_KEYS\.relationPermission/u)
  assert.match(source, /DEV_FLOW_STATE_QUERY_KEYS\.roleStage/u)
  assert.match(source, /DEV_FLOW_STATE_QUERY_KEYS\.relationAction/u)
  assert.match(responsibilitySource, /onOpenRole\(role\.key\)/u)
  assert.match(responsibilitySource, /onOpenChain\(selected, actionKey\)/u)
  assert.doesNotMatch(source, /window\.location|window\.open/u)
  assert.match(source, /preventScroll: true/u)
  assert.doesNotMatch(source, /scrollIntoView/u)
})

test('menus keep the shared formal projection instead of copying page capability filters', () => {
  assert.match(
    source,
    /buildPermissionRelationshipNavigationModel\(contextInput\)/u
  )
  for (const helper of [
    'getNavigationSections',
    'getCustomerNavigationPresentation',
    'getSidebarNavigationSections',
    'groupSidebarNavigationSections',
    'buildRoleGuidedNavigation',
  ]) {
    assert.match(navigationSource, new RegExp(helper, 'u'))
  }
  assert.match(menuSource, /实际侧栏 \/ 可用菜单/u)
  assert.match(menuSource, /显示当前对象的完整侧栏入口/u)
  assert.doesNotMatch(source + menuSource, /\.\.\/\.\.\/erp\/components/u)
})
