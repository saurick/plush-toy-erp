import { DEV_PERMISSION_RELATIONSHIPS_API } from '../../src/dev-workbench/config/devPermissionRelationshipApi.mjs'

const roles = [
  {
    role_key: 'sales',
    name: '业务',
    version: 1,
    disabled: false,
    permissions: ['sales.order.read'],
  },
  {
    role_key: 'finance',
    name: '财务',
    version: 1,
    disabled: false,
    permissions: ['finance.receivable.read'],
  },
]

const permission = {
  permission_key: 'sales.order.read',
  name: '查看销售订单',
  module: 'sales',
  module_name: '销售管理',
  usage: { pages: [{ key: 'sales-orders', name: '销售订单' }] },
}

export function permissionRelationshipFixture({ preview = false } = {}) {
  return {
    source: 'local_development_read_only',
    customer_key: 'style-customer',
    read_at: new Date().toISOString(),
    accounts: [
      {
        id: 2,
        username: 'audit-disabled',
        account_status: 'suspended',
        roles: [roles[0]],
      },
    ],
    roles,
    permissions: [permission],
    warehouse_options: [],
    approval_settings: { items: [], partial: true },
    access_by_role_key: Object.fromEntries(
      roles.map((role) => [
        role.role_key,
        {
          role_key: role.role_key,
          role_version: 1,
          is_final: !preview,
          source: preview
            ? 'builtin_rbac_fallback'
            : 'active_customer_config_revision',
          permissions: [
            {
              permission_key: 'sales.order.read',
              rbac_granted: true,
              effective: true,
            },
          ],
          pages: [
            {
              key: 'sales-orders',
              label: '销售订单',
              path: '/erp/sales/project-orders/sales-orders',
              rbac_granted: true,
              effective: true,
            },
            {
              key: 'inventory',
              label: '库存台账',
              path: '/erp/warehouse/inventory',
              rbac_granted: false,
              effective: false,
            },
          ],
        },
      ])
    ),
  }
}

export async function installPermissionRelationshipMock(page) {
  await page.route(`**${DEV_PERMISSION_RELATIONSHIPS_API}`, (route) =>
    route.fulfill({ json: permissionRelationshipFixture() })
  )
}

async function selectGraphModule(page, label) {
  const control = page
    .locator('.ant-select')
    .filter({
      has: page.getByRole('combobox', {
        name: '选择关系图功能范围',
        exact: true,
      }),
    })
  await control.locator('.ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(label, { exact: true })
    .click()
}

export function createPermissionRelationshipScenarios({
  assert,
  assertNoHorizontalOverflow,
}) {
  let readCount = 0
  let emptyModuleReadCount = 0
  return [
    {
      name: 'permission-relationship-empty-module-desktop',
      path: '/__dev/permission-relationships?target=sales&module=debug',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        emptyModuleReadCount = 0
        await page.route(`**${DEV_PERMISSION_RELATIONSHIPS_API}`, (route) => {
          emptyModuleReadCount += 1
          const fixture = structuredClone(
            permissionRelationshipFixture({
              preview: emptyModuleReadCount === 3,
            })
          )
          fixture.accounts[0].account_status = 'active'
          fixture.approval_settings = { items: [] }
          fixture.permissions.push(
            {
              permission_key: 'debug.business_chain.read',
              name: '查看业务链路调试能力',
              module: 'debug',
              module_name: '调试工具',
            },
            {
              permission_key: 'warehouse.inventory.read',
              name: '查看库存',
              module: 'warehouse',
              module_name: '仓储',
            }
          )
          fixture.roles[0].permissions.push('warehouse.inventory.read')
          fixture.access_by_role_key.sales.permissions.push({
            permission_key: 'warehouse.inventory.read',
            rbac_granted: true,
            effective: false,
            reasons: [{ label: '当前客户未启用' }],
          })
          return route.fulfill({ json: fixture })
        })
      },
      verify: async (page) => {
        const graph = page.getByRole('region', {
          name: '权限生效关系图',
          exact: true,
        })
        await graph
          .getByText('业务未授予“调试工具”模块权限', { exact: true })
          .waitFor()
        assert.equal(await graph.locator('.erp-markdown-mermaid__canvas svg').count(), 0)
        const tabs = page.locator('.erp-permission-relationship__tabs > .ant-tabs-nav')
        const originalTabs = await tabs.elementHandle()
        const tabBox = await tabs.boundingBox()
        await selectGraphModule(page, '销售管理')
        await graph.locator('.erp-markdown-mermaid__canvas svg').waitFor()
        assert.match(await graph.innerText(), /查看销售订单/u)
        await selectGraphModule(page, '仓储')
        await graph.getByText(/功能：查看库存/u).waitFor()
        assert.match(await graph.innerText(), /当前受限/u)
        assert.equal(emptyModuleReadCount, 1, '范围切换复用同一权限快照')
        await page.getByRole('tab', { name: '明细核对', exact: true }).click()
        const results = page.getByRole('region', {
          name: '功能与可用结果',
          exact: true,
        })
        await results.getByText('当前客户未启用', { exact: true }).waitFor()
        assert.equal(
          await tabs.evaluate(
            (node, original) => node === original,
            originalTabs
          ),
          true,
          '视图切换保留同一页签条'
        )
        assert.ok(
          Math.abs((await tabs.boundingBox()).y - tabBox.y) <= 1,
          '页签条不随内容改变位置'
        )
        const search = page.getByRole('textbox', {
          name: '搜索功能',
          exact: true,
        })
        await search.fill('调试能力')
        await search.press('Enter')
        await results.getByText('未授予', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '实际菜单', exact: true }).click()
        await page
          .getByRole('region', { name: '实际侧栏 / 可用菜单' })
          .waitFor()
        await page.getByRole('tab', { name: '明细核对', exact: true }).click()
        assert.equal(await search.inputValue(), '调试能力')
        await page.getByRole('tab', { name: '关系图', exact: true }).click()
        await selectGraphModule(page, '仓储')
        const control = page
          .locator('.ant-select')
          .filter({
            has: page.getByRole('combobox', {
              name: '选择关系图功能范围',
              exact: true,
            }),
          })
        await control.hover()
        await control.locator('.ant-select-clear').click()
        await graph.getByText('请选择功能范围', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('module'), '')
        await page.reload()
        await graph.getByText('请选择功能范围', { exact: true }).waitFor()
        await selectGraphModule(page, '仓储')
        await graph.getByText(/功能：查看库存/u).waitFor()
        await page
          .getByRole('button', { name: '刷新结果', exact: true })
          .click()
        await page.getByText(/最终页面结果尚未完整读取/u).waitFor()
        assert.equal(
          await page.locator('.erp-permission-relationship__graph svg').count(),
          0,
          '未核实结果不展示最终授权图'
        )
        await page
          .getByRole('button', { name: '刷新结果', exact: true })
          .click()
        await graph.getByText(/功能：查看库存/u).waitFor()
        for (const width of [1024, 1280, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page, `关系图 ${width}px`)
        }
        await originalTabs.dispose()
      },
    },
    {
      name: 'permission-relationship-target-clear',
      path: '/__dev/permission-relationships?target=sales',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: installPermissionRelationshipMock,
      verify: async (page) => {
        const control = page
          .locator('.ant-select')
          .filter({
            has: page.getByRole('combobox', {
              name: '选择要查看的岗位',
              exact: true,
            }),
          })
        await control.hover()
        await control.locator('.ant-select-clear').click()
        await page
          .getByText('请选择要查看的岗位或员工', { exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).searchParams.get('target'), '')
        await page.reload()
        await page
          .getByText('请选择要查看的岗位或员工', { exact: true })
          .waitFor()
        await control.locator('.ant-select-selector').click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .first()
          .click()
        await page
          .getByRole('region', { name: '权限生效关系图', exact: true })
          .waitFor()
        assert.notEqual(new URL(page.url()).searchParams.get('target'), '')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-relationship-current-navigation-desktop',
      path: '/__dev/permission-relationships?target=sales&tab=menu',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        const fixture = permissionRelationshipFixture()
        fixture.approval_settings = { items: [] }
        const paths = [
          '/erp/dashboard',
          '/erp/task-board',
          '/erp/master/partners/customers',
          '/erp/master/partners/suppliers',
          '/erp/master/products',
          '/erp/sales/project-orders/sales-orders',
          '/erp/production/quality-inspections',
          '/erp/warehouse/inventory',
          '/erp/production/orders',
          '/erp/production/exceptions',
          '/erp/warehouse/shipments',
          '/erp/print-center',
        ]
        fixture.roles[0].navigation_mode = 'custom'
        fixture.roles[0].primary_menu_paths = ['/erp/warehouse/shipments']
        fixture.access_by_role_key.sales.pages = paths.map((path) => ({
          key: path,
          path,
          effective: true,
          rbac_granted: true,
        }))
        await page.route(`**${DEV_PERMISSION_RELATIONSHIPS_API}`, (route) =>
          route.fulfill({ json: fixture })
        )
      },
      verify: async (page) => {
        const navigation = page.getByRole('region', {
          name: '实际侧栏 / 可用菜单',
        })
        await navigation.getByText('按业务模块', { exact: true }).waitFor()
        assert.deepEqual(
          await navigation
            .locator('.erp-permission-navigation__group-head strong')
            .allTextContents(),
          ['工作中心', '业务模块', '工具与查询', '系统与帮助']
        )
        assert.equal(
          await navigation.getByText('常用工作', { exact: true }).count(),
          0
        )
        assert.equal(
          await navigation.getByText('自定义布局', { exact: true }).count(),
          0
        )
        assert.equal(
          await page.getByRole('dialog').count(),
          0,
          '实际菜单是持久页签中的完整视图'
        )
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-relationship-consistency-desktop',
      path: '/__dev/permission-relationships?target=sales&tab=details',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        readCount = 0
        await page.route(`**${DEV_PERMISSION_RELATIONSHIPS_API}`, (route) => {
          readCount += 1
          return route.fulfill({
            json: permissionRelationshipFixture({ preview: readCount === 2 }),
          })
        })
      },
      verify: async (page) => {
        const results = page.getByRole('region', {
          name: '功能与可用结果',
          exact: true,
        })
        await results.getByText('查看销售订单', { exact: true }).waitFor()
        const evidenceButton = page.getByRole('button', {
          name: '查看依据',
          exact: true,
        })
        await evidenceButton.click()
        const drawer = page.getByRole('dialog')
        await drawer.getByText('当前权限证据版本', { exact: true }).count()
        await drawer
          .getByRole('button', { name: '包含未授予', exact: true })
          .click()
        await drawer.getByText('未授予', { exact: true }).first().waitFor()
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(
          await evidenceButton.evaluate(
            (node) => document.activeElement === node
          ),
          true
        )
        await page
          .getByRole('button', { name: '刷新结果', exact: true })
          .click()
        await page.getByText(/最终页面结果尚未完整读取/u).waitFor()
        assert.equal(await results.count(), 0)
        await page.getByRole('tab', { name: '实际菜单', exact: true }).click()
        assert.equal(
          await page.locator('.erp-permission-navigation__items').count(),
          0
        )
        await page
          .getByRole('button', { name: '刷新结果', exact: true })
          .click()
        await page
          .getByRole('region', { name: '实际侧栏 / 可用菜单' })
          .waitFor()
        await page.getByText('按员工', { exact: true }).click()
        await page
          .getByRole('alert')
          .getByText(/账号当前临时停用/u)
          .waitFor()
        assert.equal(
          await page.locator('.erp-permission-navigation__items').count(),
          0
        )
        assert.equal(
          await page.locator('.erp-permission-relationship__graph svg').count(),
          0
        )
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-relationship-independent-access-desktop',
      path: '/__dev/permission-relationships?target=sales&tab=menu',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      expectedConsoleErrorPatterns: [
        /503.*Service Unavailable|Failed to load resource.*503/u,
      ],
      beforeNavigate: installPermissionRelationshipMock,
      verify: async (page) => {
        let failed = false
        let businessReads = 0
        await page.route('**/rpc/admin', async (route) => {
          businessReads += 1
          const { id } = route.request().postDataJSON()
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: { code: 40301, message: '权限不足' },
            },
          })
        })
        await page.route(
          `**${DEV_PERMISSION_RELATIONSHIPS_API}`,
          async (route) => {
            assert.equal(route.request().headers().authorization, undefined)
            await route.fulfill(
              failed
                ? { status: 503, json: { message: 'unavailable' } }
                : { json: permissionRelationshipFixture() }
            )
          }
        )
        for (const token of [
          '',
          'ordinary-sales-role',
          'ordinary-warehouse-role',
        ]) {
          await page.evaluate((value) => {
            if (value) localStorage.setItem('admin_access_token', value)
            else localStorage.removeItem('admin_access_token')
          }, token)
          await page.reload()
          await page
            .getByRole('region', { name: '实际侧栏 / 可用菜单' })
            .waitFor()
          assert.equal(
            await page.getByRole('link', { name: '打开后台登录' }).count(),
            0
          )
        }
        failed = true
        await page.getByRole('button', { name: /刷新结果/u }).click()
        await page
          .getByRole('alert')
          .getByText('登记开发库的权限数据暂不可用，请检查只读查询配置后重试', {
            exact: true,
          })
          .waitFor()
        assert.equal(
          await page.locator('.erp-permission-navigation__items').count(),
          0
        )
        const target = page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '选择要查看的岗位', exact: true }) })
        assert.match(await target.locator('.ant-select-selection-item').innerText(), /业务/u, '读取失败保留查看对象，但不能展示旧授权结果')
        failed = false
        await page.getByRole('button', { name: '重试', exact: true }).click()
        await page
          .getByRole('region', { name: '实际侧栏 / 可用菜单' })
          .waitFor()
        assert.equal(businessReads, 0, '开发权限查看不得调用 ERP 管理接口')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-relationship-mermaid-tools-desktop',
      path: '/__dev/permission-relationships?target=sales',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: installPermissionRelationshipMock,
      verify: async (page) => {
        const graph = page.getByRole('region', {
          name: '权限生效关系图',
          exact: true,
        })
        await graph.locator('.erp-markdown-mermaid__canvas svg').waitFor()
        const layout = graph.getByRole('button', {
          name: /切换权限生效关系图为.*布局/u,
        })
        const initialLayoutLabel = await layout.getAttribute('aria-label')
        await layout.click()
        assert.notEqual(
          await layout.getAttribute('aria-label'),
          initialLayoutLabel
        )
        await graph
          .getByRole('button', { name: '放大权限生效关系图', exact: true })
          .click()
        await graph
          .getByRole('button', {
            name: '重置权限生效关系图为 100%',
            exact: true,
          })
          .click()
        await graph
          .getByRole('button', { name: '适应权限生效关系图全图', exact: true })
          .click()
        await graph
          .getByRole('button', { name: '全屏查看权限生效关系图', exact: true })
          .click()
        await page.getByRole('dialog').waitFor()
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        assert.equal(
          await page
            .getByRole('tab', { name: '关系图', exact: true })
            .getAttribute('aria-selected'),
          'true'
        )
        assert.equal(
          await page.locator('[aria-label="权限关系汇总"]').count(),
          0,
          '默认页不堆叠全局统计'
        )
        await page
          .getByRole('button', { name: '查看依据', exact: true })
          .click()
        await page
          .getByRole('dialog')
          .getByText('全部模块汇总', { exact: true })
          .waitFor()
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'permission-relationship-responsibilities-desktop',
      path: '/__dev/permission-relationships?target=sales&module=sales',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        const fixture = structuredClone(permissionRelationshipFixture())
        fixture.roles[0].permission_policy = {
          registered: true,
          template_key: 'sales',
          required_permissions: ['sales.order.read'],
          optional_permissions: ['erp.print_template.read'],
        }
        fixture.permissions.push({
          permission_key: 'erp.print_template.read',
          name: '查看打印模板',
          module: 'erp',
          module_name: '工作台与通用工具',
        })
        await page.route(`**${DEV_PERMISSION_RELATIONSHIPS_API}`, (route) =>
          route.fulfill({ json: fixture })
        )
      },
      verify: async (page) => {
        await page
          .getByRole('region', { name: '权限生效关系图', exact: true })
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor()
        await page
          .getByRole('button', { name: '岗位职责', exact: true })
          .click()
        const drawer = page.getByRole('dialog')
        await drawer.getByText('可选辅助', { exact: true }).waitFor()
        await drawer.getByText('查看打印模板', { exact: true }).waitFor()
        await drawer.getByText('未启用', { exact: true }).waitFor()
        const duties = drawer
          .getByRole('region', { name: '岗位与业务职责', exact: true })
          .locator('button[aria-pressed]')
        assert.ok((await duties.count()) > 0)
        const dutyLabel = await duties.last().locator('span').innerText()
        await duties.last().click()
        await drawer.getByRole('region', { name: '职责关联详情', exact: true }).getByText(dutyLabel, { exact: true }).waitFor()
        assert.equal(await duties.last().getAttribute('aria-pressed'), 'true')
        await drawer
          .getByRole('region', { name: '职责关联详情', exact: true })
          .waitFor()
        await drawer
          .getByRole('region', { name: '职责配置检查', exact: true })
          .getByText('未分配启用账号', { exact: false })
          .waitFor()
        await drawer
          .getByRole('button', { name: '查看岗位功能', exact: true })
          .click()
        await drawer.waitFor({ state: 'hidden' })
        await page
          .getByRole('region', { name: '功能与可用结果', exact: true })
          .getByText('核心职责', { exact: true })
          .waitFor()
        assert.equal(
          new URL(page.url()).pathname,
          '/__dev/permission-relationships'
        )
        assert.equal(
          await page
            .getByRole('button', { name: '岗位配置', exact: true })
            .count(),
          0
        )
        assert.equal(
          await page
            .getByRole('button', { name: '业务链路', exact: true })
            .count(),
          0
        )
        await page.getByRole('tab', { name: '关系图', exact: true }).click()
        await page
          .getByRole('region', { name: '权限生效关系图', exact: true })
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor()
      },
    },
    {
      name: 'permission-center-switch-pending-desktop',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '业务' })
          .click()
        await page.getByRole('tab', { name: /岗位导航/u }).click()
        await page.getByRole('tab', { name: '页面访问', exact: true }).click()
        const accessPanel = page.locator('.erp-role-effective-access')
        await accessPanel
          .locator('.erp-role-effective-access__page')
          .first()
          .waitFor()
        let release
        const pending = new Promise((resolve) => {
          release = resolve
        })
        await page.route('**/rpc/admin', async (route) => {
          const body = route.request().postDataJSON()
          if (
            body.method === 'effective_role_access' &&
            body.params?.role_key === 'finance'
          ) {
            await pending
          }
          await route.fallback()
        })
        try {
          await page
            .locator('.erp-role-template-card')
            .filter({ hasText: '财务' })
            .click()
          await accessPanel
            .getByText('正在核对页面访问结果', { exact: true })
            .waitFor()
          assert.equal(
            await accessPanel
              .locator('.erp-role-effective-access__page')
              .count(),
            0
          )
        } finally {
          release()
        }
        await accessPanel
          .locator('.erp-role-effective-access__page')
          .first()
          .waitFor()
        await assertNoHorizontalOverflow(page, '切换岗位等待与恢复')
      },
    },
  ]
}
