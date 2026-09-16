import assert from 'node:assert/strict'
import path from 'node:path'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

const mobileActions = ['mobile.sales.access', 'workflow.task.read']

async function reply(route, body, result) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
  })
}

export function createAccountPasswordScenarios({
  expectText,
  assertNoHorizontalOverflow,
  outputDir,
}) {
  return [
    ...[false, true].map((mobile) => ({
      name: mobile
        ? 'account-password-mobile-dark'
        : 'account-password-desktop',
      path: mobile ? '/m/sales/tasks' : '/erp/system/permissions',
      auth: 'admin',
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      themeMode: mobile ? 'dark' : 'light',
      ...(mobile
        ? {
            customerKey: 'yoyoosun',
            adminProfile: {
              is_super_admin: false,
              display_name: '密码验证业务员工',
              roles: [{ role_key: 'sales', name: '业务' }],
              permissions: mobileActions,
              menus: [],
            },
            effectiveSession: {
              configRevision: 'style-l1-account-password',
              configHash: 'style-l1-account-password-hash',
              customer: { key: 'yoyoosun', name: '永绅' },
              pages: [],
              actions: mobileActions,
              workflow_visible_owner_role_keys_by_capability: {
                'workflow.task.read': ['sales'],
              },
              fieldPolicies: {},
              workPools: [],
              source: 'active_customer_config_revision',
            },
          }
        : {}),
      verify: async (page) => {
        const calls = []
        let releaseSuccess
        await page.route('**/rpc/admin', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'change_password') return route.fallback()
          calls.push(body.params)
          assert.deepEqual(Object.keys(body.params).sort(), [
            'new_password',
            'old_password',
          ])
          if (body.params.old_password === 'wrong-password') {
            return reply(route, body, {
              code: RpcErrorCode.AUTH_INVALID_PASSWORD,
              message: '密码错误',
            })
          }
          if (body.params.old_password === 'uncertain-password') {
            return reply(route, body, undefined)
          }
          await new Promise((resolve) => {
            releaseSuccess = resolve
          })
          return reply(route, body, {
            code: 0,
            message: '密码已修改，请重新登录',
          })
        })
        const openPassword = async () => {
          if (mobile) {
            await page
              .getByRole('button', { name: '我的', exact: true })
              .click()
            await page
              .getByRole('button', { name: '修改密码', exact: true })
              .click()
          } else {
            await page.getByRole('button', { name: /^账号菜单：/u }).click()
            await page.getByRole('menuitem', { name: /修改密码/u }).click()
          }
        }
        await openPassword()
        const dialog = page.getByRole('dialog', {
          name: '修改密码',
          exact: true,
        })
        const oldPassword = dialog.getByLabel('旧密码', { exact: true })
        const newPassword = dialog.getByLabel('新密码', { exact: true })
        const confirmation = dialog.getByLabel('确认新密码', { exact: true })
        const submit = dialog.getByRole('button', { name: '修改并重新登录' })
        await oldPassword.fill('draft-password')
        await dialog.getByRole('button', { name: /取\s*消/u }).click()
        await dialog.waitFor({ state: 'hidden' })
        await openPassword()
        assert.equal(
          await oldPassword.inputValue(),
          '',
          '关闭后不能保留密码草稿'
        )
        await oldPassword.fill('wrong-password')
        await newPassword.fill('new-password')
        await confirmation.fill('different-password')
        await submit.click()
        await expectText(dialog, '两次输入的新密码不一致')
        assert.equal(calls.length, 0, '确认密码不一致时不能发请求')
        await confirmation.fill('new-password')
        await submit.click()
        await expectText(dialog, '旧密码不正确')
        assert.equal(await newPassword.inputValue(), 'new-password')
        assert.equal(calls.length, 1)
        await oldPassword.fill('uncertain-password')
        await submit.click()
        await expectText(dialog, '未能确认密码是否修改成功')
        assert.equal(calls.length, 2, '未知结果不能自动重试')
        await oldPassword.fill('old-password')
        await submit.click()
        await dialog.locator('.ant-btn-loading').waitFor({ state: 'visible' })
        assert.equal(
          await dialog.getByRole('button', { name: /取\s*消/u }).isDisabled(),
          true
        )
        assert.equal(await oldPassword.isDisabled(), true)
        await page.keyboard.press('Escape')
        assert.equal(await dialog.isVisible(), true, '保存中不能关闭弹窗')
        assert.equal(calls.length, 3)
        const box = await dialog.boundingBox()
        const viewport = page.viewportSize()
        assert(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= viewport.width + 1 &&
            box.y + box.height <= viewport.height + 1,
          '改密弹窗必须完整显示'
        )
        await assertNoHorizontalOverflow(
          page,
          mobile ? 'password-mobile' : 'password-desktop'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            mobile
              ? 'password-mobile-dialog.png'
              : 'password-desktop-dialog.png'
          ),
        })
        assert.equal(typeof releaseSuccess, 'function')
        releaseSuccess()
        await page.waitForURL('**/admin-login')
        assert.equal(
          await page.evaluate(() => localStorage.getItem('admin_access_token')),
          null
        )
        await expectText(page, '密码已修改，请使用新密码重新登录')
      },
    })),
    ...[true, false].map((superAdmin) => ({
      name: superAdmin
        ? 'account-password-default-reset-super'
        : 'account-password-default-reset-manager',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        is_super_admin: superAdmin,
        roles: [{ role_key: 'admin', name: '系统管理员', role_type: 'system' }],
        permissions: [
          'system.user.read',
          'system.user.update',
          'system.role.read',
          'system.permission.read',
        ],
        menus: [
          {
            key: 'permission-center',
            label: '权限管理',
            path: '/erp/system/permissions',
            required_any: ['system.user.read', 'system.role.read'],
            required_all: [],
          },
        ],
      },
      verify: async (page) => {
        const calls = []
        await page.route('**/rpc/admin', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'reset_default_password') return route.fallback()
          calls.push(body.params)
          assert.deepEqual(
            Object.keys(body.params),
            ['id'],
            '默认密码由服务端决定'
          )
          return reply(
            route,
            body,
            calls.length === 1
              ? { code: RpcErrorCode.INTERNAL, message: 'Internal' }
              : { code: 0, message: '已重置为默认密码' }
          )
        })
        const accountTab = page.getByRole('tab', { name: /员工账号/u })
        try {
          await accountTab.waitFor({ state: 'visible', timeout: 10_000 })
        } catch (error) {
          await page.screenshot({
            path: path.join(outputDir, 'password-account-entry-failure.png'),
          })
          throw new Error(
            `${error.message}\n${page.url()}\n${(await page.locator('body').innerText()).slice(0, 1600)}`
          )
        }
        await accountTab.click()
        const employee = page.getByRole('row', { name: /assistant-admin/u })
        await employee
          .getByRole('button', { name: '重置密码', exact: true })
          .click()
        const dialog = page.getByRole('dialog', { name: /重置密码：/u })
        const defaultReset = dialog.getByRole('button', {
          name: '重置为 12345678',
          exact: true,
        })
        if (!superAdmin) {
          assert.equal(
            await defaultReset.count(),
            0,
            '普通管理员不可见默认密码快捷重置'
          )
          assert.equal(
            await dialog.getByLabel('新密码', { exact: true }).isVisible(),
            true
          )
          await dialog.getByRole('button', { name: /取\s*消/u }).click()
          return
        }
        await dialog
          .getByLabel('新密码', { exact: true })
          .fill('ignored-password')
        await defaultReset.click()
        await expectText(page, '重置员工账号密码失败')
        assert.equal(
          await dialog.isVisible(),
          true,
          '失败时保留目标账号及重置入口'
        )
        assert.equal(
          await dialog.getByLabel('新密码', { exact: true }).inputValue(),
          'ignored-password'
        )
        await page.screenshot({
          path: path.join(outputDir, 'password-default-reset-dialog.png'),
        })
        await defaultReset.click()
        await dialog.waitFor({ state: 'hidden' })
        await expectText(page, '重置为默认密码，请提醒本人登录后修改')
        assert.equal(calls.length, 2)
        assert.equal(calls[0].id, calls[1].id)
        await assertNoHorizontalOverflow(page, 'default-password-reset')
      },
    })),
  ]
}
