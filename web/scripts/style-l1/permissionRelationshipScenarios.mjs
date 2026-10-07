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

export function createPermissionRelationshipScenarios({
  assert,
  assertNoHorizontalOverflow,
}) {
  let readCount = 0
  return [
    {
      name: 'permission-relationship-consistency-desktop',
      path: '/__dev/permission-relationships?target=sales&tab=details',
      mockAdminRpc: true,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        readCount = 0
        await page.route('**/rpc/admin', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'list') {
            data = {
              admins: [
                {
                  id: 2,
                  username: 'audit-disabled',
                  account_status: 'suspended',
                  roles: [roles[0]],
                },
              ],
            }
          } else if (method === 'rbac_options') {
            data = {
              roles,
              permissions: [permission],
              warehouse_scope_options: [],
            }
          } else if (method === 'effective_role_access') {
            readCount += 1
            data = {
              effective_access: {
                role_key: params.role_key,
                role_version: 1,
                is_final: readCount !== 2,
                source:
                  readCount === 2
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
            }
          } else {
            await route.fallback()
            return
          }
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: { code: 0, message: 'OK', data },
            },
          })
        })
      },
      verify: async (page) => {
        const evidence = page.getByRole('region', { name: '当前权限证据版本' })
        const table = page.locator('.erp-permission-relationship__details')
        await evidence.getByText('最终生效结果', { exact: true }).waitFor()
        await table.getByText('查看销售订单', { exact: true }).waitFor()
        assert.equal(
          await table.getByText('库存台账', { exact: true }).count(),
          0
        )
        await page.getByText('包含未授予', { exact: true }).click()
        const ungranted = table
          .locator('tbody tr')
          .filter({ hasText: '库存台账' })
        await ungranted.getByText('未授予', { exact: true }).waitFor()

        await page.getByRole('button', { name: /刷新结果/u }).click()
        await evidence.getByText('预览或读取不完整', { exact: true }).waitFor()
        assert.equal(
          await table.getByText('查看销售订单', { exact: true }).count(),
          0
        )
        const values = await page
          .locator('[aria-label="权限关系汇总"] .ant-statistic-content')
          .allTextContents()
        assert.equal(values[2].trim(), '—')
        await page.getByRole('tab', { name: '实际菜单', exact: true }).click()
        await page.getByText('暂不能生成可用菜单', { exact: true }).waitFor()

        await page.getByRole('button', { name: /刷新结果/u }).click()
        await evidence.getByText('最终生效结果', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '关系图', exact: true }).click()
        await page
          .locator(
            '.erp-permission-relationship__graph .erp-markdown-mermaid__canvas svg'
          )
          .waitFor()
        await page.reload()
        await page
          .locator(
            '.erp-permission-relationship__graph .erp-markdown-mermaid__canvas svg'
          )
          .waitFor()
        assert.equal(new URL(page.url()).searchParams.get('tab'), 'graph')

        await page.getByText('按员工', { exact: true }).click()
        await evidence.getByText('当前不可使用', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '实际菜单', exact: true }).click()
        await page.getByText('当前不可实际使用', { exact: true }).waitFor()
        assert.equal(
          await page.locator('.erp-permission-navigation__items li').count(),
          0
        )
        assert.equal(
          (
            await page
              .locator('[aria-label="权限关系汇总"] .ant-statistic-content')
              .allTextContents()
          )[2].trim(),
          '0'
        )
        await assertNoHorizontalOverflow(page, '权限关系读取、恢复与停用边界')
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
          )
            { await pending }
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
