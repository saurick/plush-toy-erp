import assert from 'node:assert/strict'
import { styleRpcResult } from './rpcMockResult.mjs'

export function createPermissionRoleSwitchScenarios() {
  return [
    {
      name: 'permission-center-clean-role-switching',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        const menus = [
          {
            key: 'customers',
            label: '客户档案',
            path: '/erp/master/partners/customers',
            required_any: ['customer.read'],
          },
          {
            key: 'sales-orders',
            label: '销售订单',
            path: '/erp/sales/project-orders/sales-orders',
            required_any: ['sales_order.read'],
          },
        ]
        const permissions = [
          {
            permission_key: 'customer.read',
            name: '查看客户',
            module: 'customer',
            permission_class: 'business',
            assignable: true,
          },
          {
            permission_key: 'sales_order.read',
            name: '查看销售订单',
            module: 'sales_order',
            permission_class: 'business',
            assignable: true,
          },
        ]
        const roles = [
          {
            role_key: 'sales',
            name: '业务',
            primary_menu_paths: [menus[0].path],
            secondary_menu_paths: ['/erp/warehouse/inventory'],
          },
          {
            role_key: 'finance',
            name: '财务',
            primary_menu_paths: [menus[1].path],
            secondary_menu_paths: [],
          },
        ].map((role) => ({
          ...role,
          role_type: 'business_default',
          version: 1,
          navigation_mode: 'custom',
          permissions: permissions.map(
            (permission) => permission.permission_key
          ),
          permissions_editable_by_current_admin: true,
          data_scopes: [
            { resource_type: 'warehouse', mode: 'ALL', resource_ids: [] },
          ],
        }))
        // Saved layouts can differ from currently available pages without a user edit.
        await page.route('**/rpc/admin', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'rbac_options') {
            data = { roles, permissions, menus, warehouse_scope_options: [] }
          } else if (method === 'effective_role_access') {
            const role = roles.find((item) => item.role_key === params.role_key)
            const keys = params.permission_keys || role.permissions
            data = {
              effective_access: {
                role_key: role.role_key,
                role_version: role.version,
                is_final: true,
                permissions: keys.map((permission_key) => ({
                  permission_key,
                  effective: true,
                })),
                pages: menus.map((menu) => ({
                  ...menu,
                  effective: keys.includes(menu.required_any[0]),
                })),
              },
            }
          } else {
            await route.fallback()
            return
          }
          await route.fulfill({
            json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
          })
        })
      },
      verify: async (page) => {
        const save = page.getByRole('button', {
          name: '保存岗位设置',
          exact: true,
        })
        const roleCard = (name) =>
          page.locator('.erp-role-template-card').filter({ hasText: name })
        const assertClean = async () => {
          await page
            .locator('.erp-role-center-save-status')
            .getByText('当前设置已保存', { exact: true })
            .waitFor()
          assert.equal(await save.isDisabled(), true, '只查看岗位不应启用保存')
          assert.equal(
            await page.getByRole('dialog').count(),
            0,
            '只切换岗位不应要求放弃修改'
          )
        }
        let writes = 0
        page.on('request', (request) => {
          if (
            request.url().endsWith('/rpc/admin') &&
            request.postDataJSON()?.method === 'set_role_permissions'
          ) {
            writes += 1
          }
        })
        await page.getByRole('tab', { name: '岗位导航', exact: true }).click()
        await page.waitForFunction(() => {
          const input = document.querySelector(
            '[aria-label="岗位导航排列方式"]'
          )
          return input && !input.disabled
        })
        await assertClean()
        for (const name of ['财务', '业务', '财务', '业务']) {
          await roleCard(name).click()
          assert.equal(
            await roleCard(name).getAttribute('aria-pressed'),
            'true'
          )
          await page.waitForFunction(() => {
            const input = document.querySelector(
              '[aria-label="岗位导航排列方式"]'
            )
            return input && !input.disabled
          })
          await assertClean()
        }
        await page
          .getByRole('button', { name: '刷新当前页', exact: true })
          .click()
        await assertClean()
        await page.getByRole('tab', { name: '员工账号', exact: true }).click()
        await page.getByRole('textbox', { name: '搜索员工账号' }).waitFor()
        assert.equal(await page.getByRole('dialog').count(), 0)
        await page.getByRole('tab', { name: '岗位设置', exact: true }).click()
        await assertClean()

        await page
          .getByRole('checkbox', { name: '查看销售订单', exact: true })
          .click()
        await page
          .locator('.erp-role-center-save-status')
          .getByText('有未保存调整', { exact: true })
          .waitFor()
        await roleCard('财务').click()
        const discard = page
          .getByRole('dialog')
          .filter({ hasText: '放弃未保存的岗位调整？' })
        await discard.waitFor()
        await discard
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await discard.waitFor({ state: 'hidden' })
        assert.equal(
          await roleCard('业务').getAttribute('aria-pressed'),
          'true'
        )
        assert.equal(
          await page
            .getByRole('checkbox', { name: '查看销售订单', exact: true })
            .isChecked(),
          false
        )
        await roleCard('财务').click()
        await discard
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await discard.waitFor({ state: 'hidden' })
        await assertClean()
        await roleCard('业务').click()
        await assertClean()
        assert.equal(
          await page
            .getByRole('checkbox', { name: '查看销售订单', exact: true })
            .isChecked(),
          true
        )

        await page.getByRole('tab', { name: '岗位导航', exact: true }).click()
        await page
          .locator(
            '.erp-role-navigation-editor__head > .ant-select .ant-select-selector'
          )
          .click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '系统推荐' })
          .click()
        await roleCard('财务').click()
        await discard.waitFor()
        await discard
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await discard.waitFor({ state: 'hidden' })
        await assertClean()
        assert.equal(writes, 0, '查看、编辑后放弃均不应写入岗位权限')
      },
    },
  ]
}
