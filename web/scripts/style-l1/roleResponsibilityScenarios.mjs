import assert from 'node:assert/strict'
import { styleRpcResult } from './rpcMockResult.mjs'
import { assertNoHorizontalOverflow } from './pageAssertions.mjs'
import { selectAppearance } from './devWorkbenchThemeScenarios.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { buildFulfillmentRelations } from '../../src/dev-workbench/config/devFulfillmentRelations.mjs'

// Bounded contract fixture: domain tests cover the complete registered catalog.
function fixture() {
  const permissions = [
    ['warehouse.inbound.confirm', '确认入库', 'warehouse', '仓储'],
    ['warehouse.inventory.read', '查看库存', 'warehouse', '仓储'],
    ['purchase_order.read', '查看采购单', 'purchase', '采购'],
    ['quality.inspection.update', '更新质检', 'quality', '品质'],
    ['erp.print_template.read', '查看打印模板', 'erp', '通用工具'],
    ['erp.business_dashboard.read', '查看进度看板', 'erp', '通用工具'],
  ].map(([permission_key, name, module, module_name]) => ({
    permission_key,
    name,
    module,
    module_name,
    class: 'business',
    assignable: true,
  }))
  const role = (key, name, required) => ({
    role_key: key,
    name,
    role_type: 'business_default',
    version: 1,
    permissions: [...required, 'erp.print_template.read'],
    permissions_editable_by_current_admin: true,
    assignable_by_current_admin: true,
    description:
      key === 'warehouse'
        ? '负责收货、入库、库存与出库，保留必要的采购来源查询。'
        : '负责正式质量检验。',
    data_scopes: [
      { resource_type: 'warehouse', mode: 'ALL', resource_ids: [] },
    ],
    permission_policy: {
      template_key: key,
      registered: true,
      required_permissions: required,
      optional_permissions: [
        'erp.print_template.read',
        'erp.business_dashboard.read',
      ],
      missing_required_permissions: [],
      outside_template_permissions: [],
    },
  })
  const roles = [
    role('warehouse', '仓库', [
      'warehouse.inbound.confirm',
      'warehouse.inventory.read',
      'purchase_order.read',
    ]),
    role('quality', '品质', ['quality.inspection.update']),
  ]
  const access = (item, keys = item.permissions) => ({
    role_key: item.role_key,
    role_version: item.version,
    role_disabled: false,
    is_final: true,
    source: 'active_customer_config_revision',
    config_revision: 'fixture-role-policy',
    config_hash: 'fixture-hash',
    product_version: 'fixture-product',
    permissions: keys.map((permission_key) => ({
      permission_key,
      rbac_granted: true,
      effective: true,
      reasons: [],
    })),
    pages: [
      {
        key: 'inventory',
        label: '库存台账',
        path: '/erp/warehouse/inventory',
        rbac_granted: keys.includes('warehouse.inventory.read'),
        effective: keys.includes('warehouse.inventory.read'),
      },
    ],
  })
  const accounts = [
    {
      id: 20,
      username: 'fixture-warehouse',
      display_name: '仓库测试人员',
      account_status: 'active',
      roles: [roles[0]],
    },
    {
      id: 21,
      username: 'fixture-concurrent',
      display_name: '兼岗测试人员',
      account_status: 'suspended',
      roles,
    },
  ]
  return { permissions, roles, accounts, access }
}

async function install(page, { drift = false, restricted = false, activeConcurrent = false } = {}) {
  const data = fixture()
  if (activeConcurrent) data.accounts[1].account_status = 'active'
  if (drift)
    { data.roles[0].permissions = [
      'warehouse.inventory.read',
      'erp.print_template.read',
    ] }
  if (restricted) {
    const { access } = data
    data.access = (...args) => {
      const result = access(...args)
      result.permissions = result.permissions.map((item) => item.permission_key === 'warehouse.inventory.read'
        ? { ...item, effective: false, reasons: [{ label: '当前客户未启用库存查询' }] } : item)
      return result
    }
  }
  const writes = []
  const previews = []
  await page.route('**/__dev/api/permission-relationships', (route) =>
    route.fulfill({
      json: {
        source: 'local_development_read_only',
        customer_key: 'fixture-customer',
        read_at: new Date().toISOString(),
        ...data,
        access: undefined,
        warehouse_options: [],
        approval_settings: { items: [], partial: false },
        access_by_role_key: Object.fromEntries(
          data.roles.map((role) => [role.role_key, data.access(role)])
        ),
      },
    })
  )
  await page.route('**/rpc/admin', async (route) => {
    const { method, params = {}, id } = route.request().postDataJSON()
    let result
    if (method === 'rbac_options')
      { result = {
        roles: data.roles,
        permissions: data.permissions,
        menus: [],
        warehouse_scope_options: [],
      } }
    else if (method === 'effective_role_access') {
      const role = data.roles.find((item) => item.role_key === params.role_key)
      if (!role) return route.fallback()
      if (params.permission_keys) previews.push(params)
      result = {
        effective_access: {
          ...data.access(role, params.permission_keys),
          is_preview: Boolean(params.permission_keys),
        },
      }
    } else if (method === 'set_role_settings') {
      const role = data.roles.find((item) => item.role_key === params.role_key)
      assert.equal(params.expected_version, role.version)
      assert.ok(
        role.permission_policy.required_permissions.every((key) =>
          params.permission_keys.includes(key)
        ),
        'must preserve duties'
      )
      assert.ok(
        params.permission_keys.every((key) =>
          [
            ...role.permission_policy.required_permissions,
            ...role.permission_policy.optional_permissions,
          ].includes(key)
        ),
        'must not widen template'
      )
      writes.push(params)
      role.permissions = params.permission_keys
      role.version += 1
      result = { role }
    } else return route.fallback()
    return route.fulfill({
      json: { jsonrpc: '2.0', id, result: styleRpcResult(result) },
    })
  })
  return { writes, previews }
}

export function createRoleResponsibilityScenarios() {
  let state
  return [
    {
      name: 'role-responsibilities-desktop',
      path: '/__dev/permission-relationships?target=warehouse',
      auth: 'admin',
viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
      beforeNavigate: async (page) => { state = await install(page, { restricted: true }) },
      verify: async (page) => {
        await page.getByRole('tab', { name: '明细核对', exact: true }).click()
        const results = page.getByRole('region', { name: '功能与可用结果', exact: true })
        await results.getByText('确认入库', { exact: true }).waitFor()
        await results.getByText('当前客户未启用库存查询', { exact: true }).waitFor()
        assert.equal(await page.locator('main').getByRole('tab').count(), 3, '保留三个核对视图')
        assert.equal(await page.locator('main').getByText('可选辅助', { exact: true }).count(), 0, '完整职责按需查看')
        const search = page.getByRole('textbox', { name: '搜索功能', exact: true })
        await search.fill('更新质检'); await search.press('Enter')
        await results.getByText('未授予', { exact: true }).waitFor()
        await results.getByText('岗位未授予该功能', { exact: true }).waitFor()
        await search.fill('库存'); await search.press('Enter')
        await page.getByRole('button', { name: '只看受限', exact: true }).click()
        await results.getByText('当前客户未启用库存查询', { exact: true }).waitFor()
        const query = page.url()
        await page.getByRole('button', { name: '查看依据', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await drawer.getByText('权限明细', { exact: true }).waitFor()
        await drawer.getByText('全部模块汇总', { exact: true }).waitFor()
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' })
        assert.equal(page.url(), query)
        await page.getByRole('button', { name: '岗位职责', exact: true }).click()
        await drawer.getByText('可选辅助', { exact: true }).waitFor()
        await drawer.getByText('查看打印模板', { exact: true }).waitFor()
        await drawer.getByRole('region', { name: '职责关联详情', exact: true }).waitFor()
        await drawer.locator('.erp-dev-role-responsibilities__core summary').click()
        await drawer.locator('.erp-dev-role-responsibilities__core').getByText('确认入库', { exact: true }).waitFor()
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' })
        assert.equal(page.url(), query)
        assert.equal(await search.inputValue(), '库存')
        assert.equal(await page.getByRole('button', { name: '只看受限', exact: true }).getAttribute('aria-pressed'), 'true')
        assert.equal(state.writes.length, 0)
        assert.equal(await page.getByRole('button', { name: '岗位配置', exact: true }).count(), 0)
        await page.getByRole('tab', { name: '关系图', exact: true }).click()
        await page.getByRole('region', { name: '权限生效关系图', exact: true }).locator('.erp-markdown-mermaid__canvas svg').waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-role-entrypoints-desktop',
      path: '/__dev/permission-relationships?target=warehouse&tab=details',
      auth: 'admin',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => { state = await install(page) },
      verify: async (page) => {
        const search = page.getByRole('textbox', { name: '搜索功能', exact: true })
        await search.fill('确认入库'); await search.press('Enter')
        const results = page.getByRole('region', { name: '功能与可用结果', exact: true })
        await results.getByText('确认入库', { exact: true }).waitFor()
        const originalURL = page.url()
        assert.equal(await page.getByRole('button', { name: '岗位配置', exact: true }).count(), 0)
        await results.getByRole('button', { name: '业务链路', exact: true }).click()
        await page.waitForURL('**/__dev/status-flows?**')
        await page.getByRole('heading', { name: '业务链路', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('flow_permission'), 'warehouse.inbound.confirm')
        assert.equal(new URL(page.url()).searchParams.get('flow_role'), 'warehouse')
        await page.goBack(); await page.waitForURL(originalURL)
        await results.getByText('确认入库', { exact: true }).waitFor()
        assert.equal(await search.inputValue(), '确认入库')
        await page.getByRole('tab', { name: '关系图', exact: true }).click()
        const graph = page.getByRole('region', { name: '权限生效关系图', exact: true })
        await graph.locator('.erp-markdown-mermaid__canvas svg').waitFor()
        assert.equal(await page.getByRole('button', { name: '岗位配置', exact: true }).count(), 0)
        assert.equal(await page.getByRole('tab', { name: '关系图', exact: true }).getAttribute('aria-selected'), 'true')
        assert.equal(state.writes.length, 0)
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-account-role-choice-desktop',
      path: '/__dev/permission-relationships?mode=account&target=21&tab=details&q=库存&status=restricted',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => { state = await install(page, { activeConcurrent: true }) },
      verify: async (page) => {
        const button = page.getByRole('button', { name: '岗位职责', exact: true })
        await button.waitFor()
        assert.equal(await page.getByRole('button', { name: '岗位配置', exact: true }).count(), 0)
        const originalURL = page.url()
        await button.click()
        const drawer = page.getByRole('dialog')
        const qualityRole = drawer.locator('.erp-dev-role-responsibilities__role').filter({ has: page.getByText('品质', { exact: true }) })
        await qualityRole.getByRole('button', { name: '配置此岗位', exact: true }).click()
        await page.waitForURL('**/erp/system/permissions?tab=roles&role=quality')
        await page.getByRole('region', { name: '核心职责', exact: true }).waitFor()
        assert.equal(state.writes.length, 0)
        const responsibilityURL = new URL(originalURL)
        responsibilityURL.searchParams.set('panel', 'responsibilities')
        await page.goBack(); await page.waitForURL(responsibilityURL.href)
        await drawer.getByRole('region', { name: '岗位与业务职责', exact: true }).waitFor()
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' })
        await button.waitFor()
        assert.equal(await page.getByRole('button', { name: '岗位配置', exact: true }).count(), 0)
        assert.equal(new URL(page.url()).searchParams.get('mode'), 'account')
        assert.equal(new URL(page.url()).searchParams.get('target'), '21')
        assert.equal(await page.getByRole('textbox', { name: '搜索功能', exact: true }).inputValue(), '库存')
        assert.equal(await page.getByRole('button', { name: '只看受限', exact: true }).getAttribute('aria-pressed'), 'true')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-duty-entrypoints-desktop',
      path: '/__dev/permission-relationships?target=warehouse&module=warehouse',
      auth: 'admin',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => { state = await install(page) },
      verify: async (page) => {
        const graph = page.getByRole('region', { name: '权限生效关系图', exact: true })
        await graph.locator('.erp-markdown-mermaid__canvas svg').waitFor()
        await page.getByRole('button', { name: '岗位职责', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await drawer.getByRole('region', { name: '岗位与业务职责', exact: true }).waitFor()
        const duties = drawer.getByRole('region', { name: '岗位与业务职责', exact: true }).locator('button[aria-pressed]')
        const chosen = duties.last()
        assert.ok(await duties.count() > 0, '登记目录提供仓库职责')
        const label = await chosen.locator('span').innerText()
        await chosen.click()
        await drawer.getByRole('region', { name: '职责关联详情', exact: true }).getByText(label, { exact: true }).waitFor()
        const actionControl = drawer.locator('.ant-select').filter({ has: drawer.getByRole('combobox', { name: '关联动作', exact: true }) })
        if (await actionControl.count()) {
          await actionControl.locator('.ant-select-selector').click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').last().click()
          await page.waitForFunction(() => Boolean(new URL(location.href).searchParams.get('activity')))
        }
        const originalURL = page.url()
        const source = new URL(originalURL)
        await drawer.getByRole('button', { name: '打开业务链路', exact: true }).click()
        await page.waitForURL('**/__dev/status-flows?**')
        await page.getByRole('heading', { name: '业务链路', exact: true }).waitFor()
        const destination = new URL(page.url())
        assert.equal(destination.searchParams.get('flow_role'), 'warehouse')
        assert.equal(destination.searchParams.get('flow_stage'), source.searchParams.get('duty').split('/').slice(1).join('/'))
        const stage = buildFulfillmentRelations(DEV_FLOW_STATE_CATALOG).find((item) => item.stage.stage === destination.searchParams.get('flow_stage'))
        const action = stage?.actions.find((item) => item.key === destination.searchParams.get('flow_action'))
        assert.ok(action?.roleKeys.includes('warehouse'), '关联动作必须属于所选职责及岗位')
        if (source.searchParams.get('activity')) assert.equal(destination.searchParams.get('flow_action'), source.searchParams.get('activity'))
        await page.goBack(); await page.waitForURL(originalURL)
        await drawer.getByRole('region', { name: '职责关联详情', exact: true }).getByText(label, { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('activity'), source.searchParams.get('activity'))
        await drawer.getByRole('button', { name: '配置此岗位', exact: true }).click()
        await page.waitForURL('**/erp/system/permissions?tab=roles&role=warehouse')
        await page.getByRole('region', { name: '核心职责', exact: true }).waitFor()
        assert.equal(state.writes.length, 0)
        await page.goBack(); await page.waitForURL(originalURL)
        await drawer.getByRole('region', { name: '职责关联详情', exact: true }).getByText(label, { exact: true }).waitFor()
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' })
        await graph.locator('.erp-markdown-mermaid__canvas svg').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('module'), 'warehouse')
        await assertNoHorizontalOverflow(page)
      },
    },
    ...[
      {
        name: 'role-policy-desktop',
        width: 1920,
        height: 1080,
        themeMode: 'light',
      },
      {
        name: 'role-policy-mobile-dark',
        width: 390,
        height: 844,
        themeMode: 'dark',
      },
    ].map((variant) => ({
      name: variant.name,
      path: '/erp/system/permissions?tab=roles&role=warehouse',
      auth: 'admin',
      themeMode: variant.themeMode,
      viewport: { width: variant.width, height: variant.height },
      deviceScaleFactor: variant.width > 1000 ? 2 : 1,
      beforeNavigate: async (page) => {
        state = await install(page)
      },
      verify: async (page) => {
        const core = page.getByRole('region', { name: '核心职责', exact: true })
        await core.waitFor()
        await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
        await page.getByRole('dialog', { name: '仓库岗位设置', exact: true }).waitFor()
        await page.getByRole('button', { name: '退出全屏', exact: true }).click()
        assert.equal(
          await core.getByRole('checkbox').count(),
          0,
          'core details are progressive disclosure'
        )
        await core
          .getByRole('button', { name: '查看功能明细', exact: true })
          .click()
        const confirm = core.getByRole('checkbox', {
          name: '确认入库',
          exact: true,
        })
        assert.equal(await confirm.isChecked(), true)
        assert.equal(await confirm.isDisabled(), true)
        await core
          .getByRole('button', { name: '收起功能明细', exact: true })
          .click()
        const optional = page.getByRole('region', {
          name: '可选辅助',
          exact: true,
        })
        await optional
          .getByRole('checkbox', { name: '查看打印模板', exact: true })
          .uncheck()
        await page.getByText('有未保存调整', { exact: true }).waitFor()
        await page
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await page.getByText('当前设置已保存', { exact: true }).waitFor()
        assert.equal(state.writes.length, 1)
        assert.equal(
          state.writes[0].permission_keys.includes('erp.print_template.read'),
          false
        )
        assert.equal(
          state.writes[0].permission_keys.includes('purchase_order.read'),
          true
        )
        await assertNoHorizontalOverflow(page)
      },
    })),
    {
      name: 'role-policy-explicit-repair',
      path: '/erp/system/permissions?tab=roles&role=warehouse',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        state = await install(page, { drift: true })
      },
      verify: async (page) => {
        await page
          .getByText('当前配置与岗位职责不一致', { exact: true })
          .waitFor()
        assert.equal(state.writes.length, 0)
        assert.equal(
          await page
            .getByRole('button', { name: '保存岗位设置', exact: true })
            .isDisabled(),
          true
        )
        await page
          .getByRole('button', { name: '按模板整理', exact: true })
          .click()
        await page.getByText('有未保存调整', { exact: true }).waitFor()
        assert.equal(state.writes.length, 0)
        await page
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await page.getByText('当前设置已保存', { exact: true }).waitFor()
        assert.equal(state.writes.length, 1)
        assert.ok(
          state.writes[0].permission_keys.includes('warehouse.inbound.confirm')
        )
      },
    },
    {
      name: 'role-responsibilities-mobile-dark',
      path: '/__dev/permission-relationships?target=warehouse',
      themeMode: 'dark',
viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => { await install(page) },
      verify: async (page) => {
        await selectAppearance(page, 'dark', 'blue')
        await page.getByRole('tab', { name: '明细核对', exact: true }).click()
        const results = page.getByRole('region', { name: '功能与可用结果', exact: true })
        await results.getByText('确认入库', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '实际菜单', exact: true }).click()
        await page.getByRole('region', { name: '实际侧栏 / 可用菜单' }).getByText('仓储管理', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page)
        await page.getByRole('button', { name: '岗位职责', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await drawer.getByText('可选辅助', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page)
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '查看依据', exact: true }).click()
        await drawer.getByText('权限明细', { exact: true }).waitFor()
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('tab', { name: '明细核对', exact: true }).click()
        await results.getByText('确认入库', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
