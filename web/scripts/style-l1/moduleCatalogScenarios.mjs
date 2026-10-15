import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function openCatalog(page) {
  await page.locator('.erp-module-catalog-trigger:visible').click()
  const dialog = page.getByRole('dialog', { name: '全部模块', exact: true })
  await dialog.waitFor({ state: 'visible' })
  await waitForFiniteAnimations(page)
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') === '搜索功能或分组',
    undefined,
    { timeout: 2000 }
  )
  assert.equal(
    await dialog
      .getByRole('textbox', { name: '搜索功能或分组' })
      .evaluate((node) => document.activeElement === node),
    true,
    '打开全部模块后应聚焦搜索'
  )
  return dialog
}

export function createModuleCatalogScenarios({
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
      'style-l1-catalog-sales'
    ),
  }
  const longCustomerLabel = `客户档案${'与往来资料'.repeat(8)}`
  return [
    {
      ...sales,
      name: 'module-catalog-custom-label',
      customerConfig: {
        ...roleGuidedCustomerConfig,
        desktopMenu: {
          ...roleGuidedCustomerConfig.desktopMenu,
          itemOverrides: { customers: { label: longCustomerLabel } },
        },
      },
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const dialog = await openCatalog(page)
        await dialog.getByRole('textbox').fill('往来资料')
        const entry = dialog.getByRole('button', {
          name: longCustomerLabel,
          exact: true,
        })
        assert.equal(
          await dialog.locator('.erp-module-catalog__entry').count(),
          1
        )
        const fits = await entry.evaluate((node) => {
          const text = node.querySelector('span')
          const arrow = node.lastElementChild.getBoundingClientRect()
          const rect = node.getBoundingClientRect()
          return (
            node.scrollWidth <= node.clientWidth + 1 &&
            text.getBoundingClientRect().right <= arrow.left &&
            text.getBoundingClientRect().bottom <= rect.bottom
          )
        })
        assert(fits, '客户配置的长名称应完整换行且不挤压箭头')
        await page.screenshot({
          path: `${outputDir}/module-catalog-long-label.png`,
        })
      },
    },
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

        const catalogTrigger = page.locator(
          '.erp-module-catalog-trigger:visible'
        )
        await assertPointerCursors(catalogTrigger, '全部模块入口')
        const catalog = await openCatalog(page)
        await assertPointerCursors(
          catalog.locator('.erp-module-catalog__entry:not(:disabled)'),
          '全部模块目录'
        )
        await page.keyboard.press('Escape')
        await catalog.waitFor({ state: 'hidden' })

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
      ...sales,
      name: 'module-catalog-search-desktop',
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        await page.screenshot({
          path: `${outputDir}/module-catalog-sidebar.png`,
        })
        let dialog = await openCatalog(page)
        const expected = [
          ...sales.adminProfile.menus.map((item) => item.label),
          '历史记录中心',
          '帮助中心',
        ].sort()
        const labels = await dialog
          .locator('.erp-module-catalog__entry')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute('aria-label'))
          )
        assert.deepEqual(
          labels.sort(),
          expected,
          '目录必须完整复用当前账号的已授权页面'
        )
        assert.equal(
          await dialog
            .locator('[aria-current="page"]')
            .getAttribute('aria-label'),
          '工作台'
        )
        await page.screenshot({
          path: `${outputDir}/module-catalog-desktop.png`,
        })
        const search = dialog.getByRole('textbox', { name: '搜索功能或分组' })
        await search.fill(' 财务 ')
        await dialog.getByText('没有匹配的功能，请换个关键词').waitFor()
        assert.equal(
          await dialog.locator('.erp-module-catalog__entry').count(),
          0
        )
        await search.fill('基础资料')
        assert.deepEqual(
          await dialog.locator('.erp-module-catalog__entry').allTextContents(),
          ['客户档案', '产品档案']
        )
        await search.fill('  产品  ')
        assert.equal(
          await dialog.locator('.erp-module-catalog__entry').count(),
          1
        )
        await search.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        assert.equal(
          await page
            .locator('.erp-module-catalog-trigger:visible')
            .evaluate((node) => document.activeElement === node),
          true,
          '关闭目录后焦点应返回入口'
        )
        dialog = await openCatalog(page)
        assert.equal(await dialog.getByRole('textbox').inputValue(), '')
        await dialog.getByRole('textbox').fill('产品')
        await page.keyboard.press('Tab')
        // The shared search input exposes its clear button before the result.
        await dialog
          .getByRole('button', { name: '产品档案', exact: true })
          .focus()
        await page.keyboard.press('Enter')
        await page.waitForURL((url) => url.pathname === '/erp/master/products')
        await dialog.waitFor({ state: 'hidden' })
        await page
          .locator('.erp-admin-menu .ant-menu-item-selected')
          .filter({ hasText: '基础资料' })
          .waitFor()
        assert.equal(
          await page
            .locator('.erp-business-module-tabs')
            .getByRole('tab', { name: '产品档案', exact: true })
            .getAttribute('aria-selected'),
          'true'
        )
      },
    },
    {
      ...sales,
      name: 'module-catalog-mobile-dark',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.getByRole('button', { name: '打开导航菜单' }).click()
        const drawer = page.locator('.erp-admin-drawer:visible')
        await drawer.locator('.ant-menu-submenu-title').click()
        await waitForFiniteAnimations(page)
        const trigger = drawer.locator('.erp-module-catalog-trigger')
        const before = await trigger.boundingBox()
        await drawer.locator('.erp-admin-menu').evaluate((node) => {
          node.scrollTop = node.scrollHeight
        })
        const after = await trigger.boundingBox()
        assert.equal(after.y, before.y, '滚动菜单时全部模块应固定在底部')
        assert(after.y + after.height <= 844)
        const dialog = await openCatalog(page)
        const bounds = await dialog.boundingBox()
        assert(
          bounds.x >= 0 &&
            bounds.x + bounds.width <= 390 &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= 844
        )
        assert.equal(
          await dialog
            .locator('.erp-module-catalog__results')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          true
        )
        await page.screenshot({
          path: `${outputDir}/module-catalog-mobile-dark-dialog.png`,
        })
        await dialog.getByRole('textbox').fill('产品')
        await dialog
          .getByRole('button', { name: '产品档案', exact: true })
          .click()
        await page.waitForURL((url) => url.pathname === '/erp/master/products')
        await dialog.waitFor({ state: 'hidden' })
        await drawer.waitFor({ state: 'hidden' })
      },
    },
    {
      ...sales,
      name: 'module-catalog-finance-direct-entry',
      adminProfile: customerRoleAdminProfile('finance', 'demo_finance'),
      effectiveSession: customerRoleRuntimeSession(
        ['finance'],
        'style-l1-catalog-finance'
      ),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const dialog = await openCatalog(page)
        await dialog.getByRole('textbox').fill('应收')
        await dialog
          .getByRole('button', { name: '应收管理', exact: true })
          .click()
        await page.waitForURL(
          (url) => url.pathname === '/erp/finance/receivables'
        )
        await page
          .locator('.erp-admin-menu .ant-menu-item-selected')
          .filter({ hasText: '财务管理' })
          .waitFor()
      },
    },
    {
      name: 'module-catalog-permission-boundary',
      path: '/erp/history',
      auth: 'admin',
      adminProfile: { is_super_admin: false, permissions: [], menus: [] },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [],
        actions: [],
      },
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const dialog = await openCatalog(page)
        assert.deepEqual(
          await dialog.locator('.erp-module-catalog__entry').allTextContents(),
          ['历史记录中心当前页', '帮助中心']
        )
        await dialog.getByRole('textbox').fill('客户')
        await dialog.getByText('没有匹配的功能，请换个关键词').waitFor()
      },
    },
    {
      name: 'module-catalog-unsaved-form',
      path: '/erp/master/partners/customers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await page.getByRole('button', { name: '新建客户' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.waitFor({ state: 'visible' })
        const note = editor.locator('textarea:visible').first()
        await note.fill('目录跳转保留输入')
        assert.equal(await editor.getAttribute('data-unsaved'), 'true')
        let dialog = await openCatalog(page)
        await dialog
          .getByRole('button', { name: '工作台', exact: true })
          .click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(
          new URL(page.url()).pathname,
          '/erp/master/partners/customers'
        )
        assert.equal(await note.inputValue(), '目录跳转保留输入')
        dialog = await openCatalog(page)
        await dialog
          .getByRole('button', { name: '工作台', exact: true })
          .click()
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await page.waitForURL((url) => url.pathname === '/erp/dashboard')
        await editor.waitFor({ state: 'hidden' })
      },
    },
  ]
}
