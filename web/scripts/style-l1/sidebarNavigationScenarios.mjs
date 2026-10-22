import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { findVisibleBusinessPage } from '../businessNavigation.mjs'

export function createSidebarNavigationScenarios({
  customerRoleAdminProfile,
  customerRoleRuntimeSession,
  roleGuidedCustomerConfig,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const sales = {
    path: '/erp/dashboard',
    auth: 'admin',
    customerConfig: roleGuidedCustomerConfig,
    adminProfile: customerRoleAdminProfile('sales', 'demo_sales'),
    effectiveSession: customerRoleRuntimeSession(
      ['sales'],
      'style-l1-sidebar-sales'
    ),
  }
  return [
    {
      ...sales,
      name: 'interactive-cursor-surfaces',
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const assertPointerCursors = async (targets, label) => {
          await targets.first().waitFor({ state: 'visible' })
          await targets.first().hover()
          const cursors = await targets.evaluateAll((nodes) =>
            nodes.map((node) => getComputedStyle(node).cursor)
          )
          assert(
            cursors.length > 0 &&
              cursors.every((cursor) => cursor === 'pointer'),
            `${label} hover 后应全部显示手型指针: ${JSON.stringify(cursors)}`
          )
        }

        await assertPointerCursors(
          page.locator(
            '.erp-admin-sider .erp-admin-menu [role="menuitem"]:not([aria-disabled="true"])'
          ),
          '桌面侧栏菜单'
        )

        const accountTrigger = page.getByTestId('desktop-account-menu-trigger')
        await assertPointerCursors(accountTrigger, '账号菜单入口')
        await accountTrigger.click()
        const accountMenu = page.locator('.ant-dropdown:visible')
        await assertPointerCursors(
          accountMenu.locator(
            '[role="menuitem"]:not([aria-disabled="true"])'
          ),
          '账号下拉菜单'
        )
        await page.keyboard.press('Escape')
        await accountMenu.waitFor({ state: 'hidden' })

        await page.setViewportSize({ width: 390, height: 844 })
        const mobileMenuTrigger = page.getByRole('button', {
          name: '打开导航菜单',
        })
        await assertPointerCursors(mobileMenuTrigger, '移动导航入口')
        await mobileMenuTrigger.click()
        const mobileDrawer = page.locator('.erp-admin-drawer:visible')
        await assertPointerCursors(
          mobileDrawer.locator(
            '.erp-admin-menu [role="menuitem"]:not([aria-disabled="true"])'
          ),
          '移动侧栏菜单'
        )
      },
    },
    {
      ...sales, name: 'sidebar-pages-desktop', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: async (page) => {
        assert.equal(await page.getByRole('button', { name: '全部模块', exact: true }).count(), 0)
        await (await findVisibleBusinessPage(page, '产品档案')).click()
        await page.waitForURL('**/erp/master/products')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '产品档案', selected: true, exact: true }).waitFor()
        const footer = page.locator('.erp-admin-sider .erp-admin-sider__footer')
        assert.equal(await footer.getByRole('button').count(), 1)
        await footer.getByTestId('desktop-account-menu-trigger').click()
        await page.getByRole('menuitem', { name: '外观与密度', exact: true }).waitFor()
        await footer.getByTestId('desktop-account-menu-trigger').click()
        await page.getByRole('menuitem', { name: '外观与密度', exact: true }).waitFor({ state: 'hidden' })
        await page.screenshot({ path: `${outputDir}/sidebar-account-only-4k.png`, animations: 'disabled' })
      },
    },
    {
      ...sales, name: 'sidebar-account-mobile-dark', themeMode: 'dark', viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.getByRole('button', { name: '打开导航菜单' }).click()
        const drawer = page.locator('.erp-admin-drawer:visible')
        const menu = drawer.locator('.erp-admin-menu')
        await menu.getByRole('menuitem', { name: '工作台', exact: true }).waitFor()
        await page.setViewportSize({ width: 390, height: 400 })
        await waitForFiniteAnimations(page)
        const account = drawer.getByTestId('drawer-account-menu-trigger')
        const before = await account.boundingBox()
        const scrollTop = await menu.evaluate(node => { node.scrollTop = node.scrollHeight; return node.scrollTop })
        assert(scrollTop > 0, '短屏实际滚动菜单')
        const after = await account.boundingBox()
        assert.equal(after.y, before.y, '账号固定在菜单滚动区外')
        assert(after.y + after.height <= 400)
        await page.setViewportSize({ width: 390, height: 844 })
        await waitForFiniteAnimations(page)
        await menu.getByRole('menuitem', { name: '基础资料', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '产品档案', exact: true }).click()
        await page.waitForURL('**/erp/master/products')
        await page.screenshot({ path: `${outputDir}/sidebar-account-mobile-dark.png` })
      },
    },
    {
      ...sales, name: 'sidebar-finance-page-entry',
      adminProfile: customerRoleAdminProfile('finance', 'demo_finance'),
      effectiveSession: customerRoleRuntimeSession(['finance'], 'style-l1-sidebar-finance'),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        await (await findVisibleBusinessPage(page, '应收管理')).click()
        await page.waitForURL('**/erp/finance/receivables')
        await page.locator('.erp-admin-menu .ant-menu-item-selected').filter({ hasText: '财务管理' }).waitFor()
      },
    },
    {
      name: 'sidebar-permission-boundary', path: '/erp/history', auth: 'admin',
      adminProfile: { is_super_admin: false, permissions: [], menus: [] },
      effectiveSession: { ...customerRuntimeEffectiveSession, pages: [], actions: [] },
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const menu = page.locator('.erp-admin-sider .erp-admin-menu')
        await menu.getByRole('menuitem', { name: '历史记录中心', exact: true }).waitFor()
        assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['历史记录中心', '帮助中心'])
        await menu.getByRole('menuitem', { name: '帮助中心', exact: true }).click()
        await page.waitForURL('**/erp/help-center')
      },
    },
    {
      name: 'sidebar-unsaved-form', path: '/erp/master/partners/customers', auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession, viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await page.getByRole('button', { name: '新建客户' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        const note = editor.locator('textarea:visible').first()
        await note.fill('导航跳转保留输入')
        const home = page.locator('.erp-admin-sider .erp-admin-menu').getByRole('menuitem', { name: '工作台', exact: true })
        await home.click()
        await page.getByRole('button', { name: '继续编辑', exact: true }).click()
        assert.equal(await note.inputValue(), '导航跳转保留输入')
        assert.equal(new URL(page.url()).pathname, '/erp/master/partners/customers')
        await home.click()
        await page.getByRole('button', { name: '放弃修改', exact: true }).click()
        await page.waitForURL('**/erp/dashboard')
        await editor.waitFor({ state: 'hidden' })
      },
    },
  ]
}
