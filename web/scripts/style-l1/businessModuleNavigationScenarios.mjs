import assert from 'node:assert/strict'
import { BUSINESS_SEARCH_SCOPES } from '../../src/erp/utils/businessSearchScopes.mjs'

const moduleTabs = (page) => page.locator('.erp-business-module-tabs')
const switchTab = async (page, label) => {
  await moduleTabs(page).getByRole('tab', { name: label, exact: true }).click()
  await moduleTabs(page)
    .getByRole('tab', { name: label, exact: true, selected: true })
    .waitFor()
}

async function verifyModuleMotion(page, targetLabel, reduced = false) {
  await page.emulateMedia({
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  const result = await moduleTabs(page).evaluate(async (root, label) => {
    const group = root.querySelector('.ant-tabs-nav-list')
    const target = [...group.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === label
    )
    const before = root.getBoundingClientRect()
    const read = () => {
      const style = getComputedStyle(group, '::before')
      return {
        x: new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform
        ).m41,
        duration: style.transitionDuration,
      }
    }
    const start = read().x
    const destination = target.closest('.ant-tabs-tab').offsetLeft
    const frames = []
    target.click()
    const began = performance.now()
    await new Promise((resolve) => {
      const tick = () => {
        frames.push(read())
        if (performance.now() - began < 650) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    const after = root.getBoundingClientRect()
    return {
      start,
      destination,
      frames,
      mounted: root.isConnected && group.isConnected,
      selected: target.getAttribute('aria-selected'),
      deltaWidth: after.width - before.width,
      deltaHeight: after.height - before.height,
    }
  }, targetLabel)
  assert(result.mounted && result.selected === 'true', JSON.stringify(result))
  assert(
    Math.abs(result.deltaWidth) < 1 && Math.abs(result.deltaHeight) < 1,
    JSON.stringify(result)
  )
  assert(
    Math.abs(result.frames.at(-1).x - result.destination) < 1.5,
    JSON.stringify(result)
  )
  if (reduced) {
    assert(
      result.frames.every((frame) =>
        frame.duration.split(',').every((value) => parseFloat(value) === 0)
      ),
      JSON.stringify(result)
    )
  } else {
    assert(
      result.frames.some(
        (frame) =>
          frame.x > Math.min(result.start, result.destination) + 2 &&
          frame.x < Math.max(result.start, result.destination) - 2
      ),
      JSON.stringify(result)
    )
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}

export function createBusinessModuleNavigationScenarios({
  customerRuntimeEffectiveSession,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  return [
    {
      name: 'module-design-navigation',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        const sidebar = frame.locator('#sidebar')
        await sidebar.getByRole('button', { name: '基础资料', exact: true }).waitFor()
        assert.deepEqual(await sidebar.locator('.nav-label').allTextContents(), [
          '工作中心', '业务模块', '工具与查询', '系统与帮助',
        ])
        assert.equal(await sidebar.locator('.nav-group').nth(1).locator('.nav-item').count(), 10)
        for (const [moduleName, first, second] of [
          ['基础资料', '客户档案', '材料档案'],
          ['产品工程', '物料清单（BOM）', '加工环节'],
          ['库存管理', '采购入库', '库存台账'],
          ['财务管理', '应收', '对账'],
        ]) {
          await sidebar.getByRole('button', { name: moduleName, exact: true }).click()
          const tabs = frame.getByRole('tablist', { name: moduleName, exact: true })
          await tabs.getByRole('tab', { name: first, selected: true, exact: true }).waitFor()
          await tabs.getByRole('tab', { name: second, exact: true }).click()
          await tabs.getByRole('tab', { name: second, selected: true, exact: true }).waitFor()
        }
        await sidebar.getByRole('button', { name: '委外管理', exact: true }).click()
        assert.equal(await frame.locator('.module-tabs-row').count(), 0)
        await assertNoHorizontalOverflow(page)
      },
    },
    ...[
      ['master', '/erp/master/partners/customers', ['客户档案', '供应商与加工厂', '产品档案', '材料档案'], '客户档案', '供应商与加工厂'],
      ['engineering', '/erp/purchase/material-bom', ['物料清单（BOM）', '加工环节'], '物料清单（BOM）', '加工环节'],
      ['warehouse', '/erp/warehouse/inbound', ['采购入库', '库存台账'], '采购入库', '库存台账'],
    ].map(([key, route, labels, firstHeading, secondHeading]) => ({
      name: `module-${key}-navigation`,
      path: route,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const search = () => page.locator('.erp-admin-outlet input.ant-input').first()
        await page.getByRole('heading', { name: firstHeading, exact: true }).waitFor()
        assert.deepEqual(await moduleTabs(page).getByRole('tab').allTextContents(), labels)
        await search().fill(`${key}第一页面查询`)
        await switchTab(page, labels[1])
        await page.getByRole('heading', { name: secondHeading, exact: true }).waitFor()
        assert.equal(await search().inputValue(), '')
        await search().fill(`${key}第二页面查询`)
        await switchTab(page, labels[0])
        await page.getByRole('heading', { name: firstHeading, exact: true }).waitFor()
        assert.equal(await search().inputValue(), `${key}第一页面查询`)
        await verifyModuleMotion(page, labels[1])
        await page.getByRole('heading', { name: secondHeading, exact: true }).waitFor()
        assert.equal(await search().inputValue(), `${key}第二页面查询`)
        await verifyModuleMotion(page, labels[0], true)
        await assertNoHorizontalOverflow(page)
      },
    })),
    {
      name: 'module-master-limited-access',
      path: '/erp/master/materials',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['materials'],
        actions: ['material.read'],
        roles: ['warehouse'],
      },
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['material.read'],
        menus: ['/erp/master/materials'],
      },
      verify: async (page) => {
        await page.getByRole('heading', { name: '材料档案', exact: true }).waitFor()
        assert.deepEqual(await moduleTabs(page).getByRole('tab').allTextContents(), ['材料档案'])
        const menu = page.locator('.erp-admin-sider .erp-admin-menu')
        assert.equal(await menu.getByRole('menuitem').filter({ hasText: /^基础资料$/u }).count(), 1)
        assert.equal(await menu.getByRole('menuitem').filter({ hasText: /^(财务管理|采购管理)$/u }).count(), 0)
        await page.getByRole('button', { name: '全部模块', exact: true }).click()
        const catalog = page.locator('.erp-module-catalog')
        await catalog.getByRole('button', { name: '材料档案', exact: true }).waitFor()
        assert.equal(await catalog.getByRole('button', { name: '客户档案', exact: true }).count(), 0)
        await page.keyboard.press('Escape')
        await page.goto(new URL('/erp/master/partners/customers', page.url()).href)
        await page.waitForURL('**/erp/master/materials')
        await page.getByRole('heading', { name: '材料档案', exact: true }).waitFor()
      },
    },
    ...['light', 'dark'].map((themeMode) => ({
      name: `module-sidebar-boundaries-${themeMode}`,
      path: '/erp/finance/receivables',
      auth: 'admin',
      themeMode,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const verifyBoundary = async (sidebar) => {
          const outsourcing = sidebar
            .getByRole('menuitem')
            .filter({ hasText: /^委外管理$/u })
          await outsourcing.waitFor()
          const metrics = await sidebar.evaluate((root) => {
            const menu = root.querySelector('.erp-admin-menu')
            const labels = ['委外管理', '生产管理', '出货管理', '财务管理']
            const items = labels.map((label) =>
              [...menu.querySelectorAll('[role="menuitem"]')].find(
                (item) => item.textContent.trim() === label
              )
            )
            const businessGroup = items[0]?.closest('.ant-menu-item-group')
            return {
              peers: items.every((item) => item?.parentElement === items[0]?.parentElement),
              businessGroup: businessGroup?.querySelector('.ant-menu-item-group-title')?.textContent,
              areas: [...menu.children].map((section) => section.querySelector('.ant-menu-item-group-title')?.textContent),
              modules: [...(businessGroup?.querySelectorAll('[role="menuitem"]') || [])].map((item) => item.textContent.trim()),
              widths: items.map((item) => item?.getBoundingClientRect().width),
              lefts: items.map((item) => item?.getBoundingClientRect().left),
            }
          })
          assert(metrics.peers && metrics.businessGroup === '业务模块', JSON.stringify(metrics))
          assert.deepEqual(metrics.areas, ['工作中心', '业务模块', '工具与查询', '系统与帮助'])
          assert.deepEqual(metrics.modules, ['基础资料', '销售管理', '产品工程', '采购管理', '委外管理', '生产管理', '库存管理', '质检管理', '出货管理', '财务管理'])
          assert(
            metrics.widths.every(
              (width) => Math.abs(width - metrics.widths[0]) < 1
            ),
            JSON.stringify(metrics)
          )
          assert(
            metrics.lefts.every(
              (left) => Math.abs(left - metrics.lefts[0]) < 1
            ),
            JSON.stringify(metrics)
          )
          return outsourcing
        }
        const sidebar = page.locator('.erp-admin-sider')
        const outsourcing = await verifyBoundary(sidebar)
        await outsourcing.click()
        await page
          .getByRole('heading', { name: '委外订单', exact: true })
          .waitFor()
        assert.equal(await moduleTabs(page).count(), 0)
        assert.equal(
          await sidebar.locator('.ant-menu-item-selected').textContent(),
          '委外管理'
        )
        await sidebar
          .getByRole('menuitem')
          .filter({ hasText: /^财务管理$/u })
          .click()
        await moduleTabs(page)
          .getByRole('tab', { name: '应收', exact: true })
          .waitFor()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({
          path: path.join(
            outputDir,
            `module-sidebar-boundaries-${themeMode}.png`
          ),
          fullPage: false,
        })
        await page.setViewportSize({ width: 390, height: 844 })
        await page
          .getByRole('button', { name: '打开导航菜单', exact: true })
          .click()
        const drawer = page.locator('.erp-admin-drawer')
        await drawer.locator('.erp-admin-menu').waitFor({ state: 'visible' })
        await verifyBoundary(drawer)
        await page.keyboard.press('Escape')
        await drawer.locator('.ant-drawer-content').waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page)
      },
    })),
    {
      name: 'desktop-sidebar-collapse',
      path: '/erp/dashboard',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.locator('.erp-admin-sider').waitFor({ state: 'visible' })
        await page
          .locator('.erp-admin-sider .ant-menu-item-selected')
          .waitFor({ state: 'visible' })
        const readMetrics = () =>
          page.evaluate(() => {
            const sider = document.querySelector('.erp-admin-sider')
            const main = document.querySelector(
              '.erp-admin-shell > .ant-layout'
            )
            const header = document.querySelector('.erp-admin-header')
            const outlet = document.querySelector('.erp-admin-outlet')
            const menu = sider?.querySelector('.erp-admin-menu')
            const selected = sider?.querySelector('.ant-menu-item-selected')
            const selectedIcon = selected?.querySelector('.anticon')
            const collapse = sider?.querySelector('.erp-admin-brand__collapse')
            const catalog = sider?.querySelector('.erp-module-catalog-trigger')
            const siderBox = sider?.getBoundingClientRect()
            const mainBox = main?.getBoundingClientRect()
            const headerBox = header?.getBoundingClientRect()
            const outletBox = outlet?.getBoundingClientRect()
            const selectedBox = selected?.getBoundingClientRect()
            const iconBox = selectedIcon?.getBoundingClientRect()
            const selectedStyle = selected ? getComputedStyle(selected) : null
            const title = selected?.querySelector('.ant-menu-title-content')
            const titleBox = title?.getBoundingClientRect()
            const titleStyle = title ? getComputedStyle(title) : null
            const visibleGroupTitleCount = [
              ...(sider?.querySelectorAll('.ant-menu-item-group-title') || []),
            ].filter((node) => {
              const box = node.getBoundingClientRect()
              const style = getComputedStyle(node)
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                box.width > 0 &&
                box.height > 0
              )
            }).length
            return {
              collapsed: sider?.dataset.sidebarCollapsed,
              siderWidth: siderBox?.width || 0,
              mainLeft: mainBox?.left || 0,
              mainWidth: mainBox?.width || 0,
              headerWidth: headerBox?.width || 0,
              outletWidth: outletBox?.width || 0,
              menuCollapsed:
                menu?.classList.contains('ant-menu-inline-collapsed') === true,
              brandCopyVisible: Boolean(
                sider?.querySelector('.erp-admin-brand__logo-copy')
              ),
              visibleGroupTitleCount,
              selectedText: selected?.textContent?.trim() || '',
              selectedBox: selectedBox
                ? {
                    x: selectedBox.x,
                    width: selectedBox.width,
                    paddingInline: selectedStyle.paddingInline,
                    justifyContent: selectedStyle.justifyContent,
                  }
                : null,
              selectedIconBox: iconBox
                ? { x: iconBox.x, width: iconBox.width }
                : null,
              selectedTitleBox: titleBox
                ? {
                    x: titleBox.x,
                    width: titleBox.width,
                    display: titleStyle.display,
                    opacity: titleStyle.opacity,
                  }
                : null,
              selectedIconCenterDelta:
                selectedBox && iconBox
                  ? Math.abs(
                      selectedBox.left +
                        selectedBox.width / 2 -
                        (iconBox.left + iconBox.width / 2)
                    )
                  : Number.POSITIVE_INFINITY,
              collapseLabel: collapse?.getAttribute('aria-label') || '',
              collapseFocused: document.activeElement === collapse,
              catalogText: catalog?.textContent?.trim() || '',
              catalogLabel: catalog?.getAttribute('aria-label') || '',
              documentOverflow:
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
            }
          })

        const expanded = await readMetrics()
        assert.equal(expanded.collapsed, 'false')
        assert.equal(expanded.menuCollapsed, false)
        assert.equal(expanded.brandCopyVisible, true)
        assert(expanded.visibleGroupTitleCount > 0, JSON.stringify(expanded))
        assert.equal(expanded.collapseLabel, '收起侧边菜单')
        assert.match(expanded.catalogText, /全部模块/u)
        assert(
          Math.abs(expanded.siderWidth - 206) < 1,
          JSON.stringify(expanded)
        )
        assert(Math.abs(expanded.mainLeft - 206) < 1, JSON.stringify(expanded))

        const collapseButton = page.getByRole('button', {
          name: '收起侧边菜单',
          exact: true,
        })
        await collapseButton.focus()
        await page.keyboard.press('Enter')
        await page.waitForFunction(() => {
          const sider = document.querySelector('.erp-admin-sider')
          const selected = sider?.querySelector('.ant-menu-item-selected')
          const icon = selected?.querySelector('.anticon')
          const title = selected?.querySelector('.ant-menu-title-content')
          const selectedBox = selected?.getBoundingClientRect()
          const iconBox = icon?.getBoundingClientRect()
          const iconCentered =
            selectedBox && iconBox
              ? Math.abs(
                  selectedBox.left + selectedBox.width / 2 -
                    (iconBox.left + iconBox.width / 2)
                ) < 1.5
              : false
          return (
            sider?.dataset.sidebarCollapsed === 'true' &&
            Math.abs(sider.getBoundingClientRect().width - 64) < 0.1 &&
            getComputedStyle(title).display === 'none' &&
            iconCentered
          )
        })

        const collapsed = await readMetrics()
        assert.equal(collapsed.collapsed, 'true')
        assert.equal(collapsed.menuCollapsed, true)
        assert.equal(collapsed.brandCopyVisible, false)
        assert.equal(collapsed.visibleGroupTitleCount, 0)
        assert.equal(collapsed.selectedText, expanded.selectedText)
        assert.equal(collapsed.collapseLabel, '展开侧边菜单')
        assert.equal(collapsed.collapseFocused, true)
        assert.equal(collapsed.catalogText, '')
        assert.equal(collapsed.catalogLabel, '全部模块')
        assert(
          collapsed.selectedIconCenterDelta < 1.5,
          JSON.stringify(collapsed)
        )
        assert(
          Math.abs(collapsed.siderWidth - 64) < 1,
          JSON.stringify(collapsed)
        )
        assert(Math.abs(collapsed.mainLeft - 64) < 1, JSON.stringify(collapsed))
        assert(
          collapsed.mainWidth - expanded.mainWidth > 130,
          JSON.stringify({ expanded, collapsed })
        )
        assert(
          Math.abs(collapsed.headerWidth - collapsed.mainWidth) < 1,
          JSON.stringify(collapsed)
        )
        assert(
          collapsed.outletWidth > collapsed.mainWidth - 30,
          JSON.stringify(collapsed)
        )
        assert(collapsed.documentOverflow <= 1, JSON.stringify(collapsed))

        await page.screenshot({
          path: path.join(outputDir, 'desktop-sidebar-collapse-collapsed.png'),
        })

        const selectedItem = page.locator(
          '.erp-admin-sider .ant-menu-item-selected'
        )
        await selectedItem.hover()
        const tooltip = page.locator('.ant-tooltip:visible')
        await tooltip.waitFor({ state: 'visible' })
        assert.match(await tooltip.textContent(), /工作台/u)

        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByRole('button', { name: '打开导航菜单' }).click()
        const drawer = page.locator('.erp-admin-drawer')
        await drawer.locator('.erp-admin-menu').waitFor({ state: 'visible' })
        const drawerMetrics = await drawer.evaluate((node) => ({
          menuCollapsed:
            node
              .querySelector('.erp-admin-menu')
              ?.classList.contains('ant-menu-inline-collapsed') === true,
          brandCopyVisible: Boolean(
            node.querySelector('.erp-admin-brand__logo-copy')
          ),
          catalogText:
            node.querySelector('.erp-module-catalog-trigger')?.textContent || '',
        }))
        assert.equal(drawerMetrics.menuCollapsed, false)
        assert.equal(drawerMetrics.brandCopyVisible, true)
        assert.match(drawerMetrics.catalogText, /全部模块/u)
        await page.keyboard.press('Escape')
        await drawer.locator('.ant-drawer-content').waitFor({ state: 'hidden' })

        await page.setViewportSize({ width: 1440, height: 900 })
        const expandButton = page.getByRole('button', {
          name: '展开侧边菜单',
          exact: true,
        })
        await expandButton.focus()
        await page.keyboard.press('Enter')
        await page.waitForFunction(() => {
          const sider = document.querySelector('.erp-admin-sider')
          const title = sider?.querySelector(
            '.ant-menu-item-selected .ant-menu-title-content'
          )
          return (
            sider?.dataset.sidebarCollapsed === 'false' &&
            Math.abs(sider.getBoundingClientRect().width - 206) < 0.1 &&
            title &&
            getComputedStyle(title).display !== 'none' &&
            Number(getComputedStyle(title).opacity) > 0.99
          )
        })
        const restored = await readMetrics()
        assert.equal(restored.menuCollapsed, false)
        assert.equal(restored.brandCopyVisible, true)
        assert.equal(restored.selectedText, expanded.selectedText)
        assert.equal(restored.collapseLabel, '收起侧边菜单')
        assert.equal(restored.collapseFocused, true)
        assert(Math.abs(restored.mainWidth - expanded.mainWidth) < 1)
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'module-shipment-navigation',
      path: '/erp/finance/receivables',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const sidebar = page.locator('.erp-admin-sider')
        const shipmentMenu = sidebar
          .getByRole('menuitem')
          .filter({ hasText: /^出货管理$/u })
        const financeMenu = sidebar
          .getByRole('menuitem')
          .filter({ hasText: /^财务管理$/u })
        await shipmentMenu.waitFor()
        assert.equal(await shipmentMenu.count(), 1)
        assert.equal(await financeMenu.count(), 1)
        assert.equal(
          await sidebar
            .getByRole('menuitem')
            .filter({ hasText: /^(出货单|出货放行|库存预留|出库管理)$/u })
            .count(),
          0
        )
        const peers = await sidebar.evaluate((root) => {
          const items = [...root.querySelectorAll('[role="menuitem"]')]
          const shipping = items.find(
            (item) => item.textContent.trim() === '出货管理'
          )
          const finance = items.find(
            (item) => item.textContent.trim() === '财务管理'
          )
          return shipping?.parentElement === finance?.parentElement
        })
        assert.equal(peers, true)
        await shipmentMenu.click()
        await page.waitForURL('**/erp/warehouse/shipments')
        await moduleTabs(page)
          .getByRole('tab', { name: '出货单', exact: true, selected: true })
          .waitFor()
        assert.deepEqual(
          await moduleTabs(page).getByRole('tab').allTextContents(),
          ['出货单', '放行审批', '库存预留']
        )
        const search = page.getByPlaceholder(
          BUSINESS_SEARCH_SCOPES.shipment.placeholder,
          { exact: true }
        )
        await search.fill('出货导航查询')
        await switchTab(page, '库存预留')
        await page
          .getByRole('heading', { name: '库存预留', exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '确认出货', exact: true })
            .count(),
          0
        )
        await switchTab(page, '放行审批')
        await page
          .getByRole('heading', { name: '出货放行', exact: true })
          .waitFor()
        const approvalSearch = page.getByRole('textbox', {
          name: '搜索待办任务', exact: true,
        })
        await approvalSearch.fill('放行导航查询')
        await verifyModuleMotion(page, '库存预留')
        await verifyModuleMotion(page, '出货单', true)
        await search.waitFor()
        assert.equal(await search.inputValue(), '出货导航查询')
        await switchTab(page, '放行审批')
        await approvalSearch.waitFor()
        assert.equal(await approvalSearch.inputValue(), '放行导航查询')
        await switchTab(page, '库存预留')
        await financeMenu.click()
        await moduleTabs(page)
          .getByRole('tab', { name: '应收', exact: true })
          .waitFor()
        await shipmentMenu.click()
        await page.waitForURL('**/erp/warehouse/outbound')
        await moduleTabs(page)
          .getByRole('tab', { name: '库存预留', exact: true, selected: true })
          .waitFor()
        await shipmentMenu.click()
        assert.equal(new URL(page.url()).pathname, '/erp/warehouse/outbound')
        await page.screenshot({
          path: path.join(outputDir, 'module-shipment-navigation.png'),
        })
        await assertNoHorizontalOverflow(page)
        await page.setViewportSize({ width: 390, height: 844 })
        await switchTab(page, '出货单')
        await search.waitFor()
        assert.equal(await search.inputValue(), '出货导航查询')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'module-shipment-limited-access',
      path: '/erp/warehouse/outbound',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['outbound'],
        actions: ['warehouse.outbound.read'],
        roles: ['warehouse'],
      },
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['warehouse.outbound.read'],
        menus: ['/erp/warehouse/outbound'],
      },
      verify: async (page) => {
        await moduleTabs(page)
          .getByRole('tab', { name: '库存预留', exact: true })
          .waitFor()
        assert.deepEqual(
          await moduleTabs(page).getByRole('tab').allTextContents(),
          ['库存预留']
        )
        assert.equal(
          await page
            .locator('.erp-admin-sider')
            .getByRole('menuitem')
            .filter({ hasText: /^财务管理$/u })
            .count(),
          0
        )
        await page.goto(new URL('/erp/warehouse/shipments', page.url()).href)
        await page.waitForURL('**/erp/warehouse/outbound')
        await moduleTabs(page)
          .getByRole('tab', { name: '库存预留', exact: true, selected: true })
          .waitFor()
        assert.deepEqual(
          await moduleTabs(page).getByRole('tab').allTextContents(),
          ['库存预留']
        )
        await assertNoHorizontalOverflow(page)
      },
    },
    ...['light', 'dark'].map((themeMode) => ({
      name: `module-finance-navigation-${themeMode}`,
      path: '/erp/finance/receivables',
      auth: 'admin',
      themeMode,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: themeMode === 'dark' ? 1280 : 1440, height: 900 },
      verify: async (page) => {
        const nav = moduleTabs(page)
        await nav
          .getByRole('tab', { name: '应收', exact: true, selected: true })
          .waitFor()
        assert.deepEqual(await nav.getByRole('tab').allTextContents(), [
          '应收',
          '应付',
          '收付款',
          '对账',
          '发票',
        ])
        assert.equal(
          await page
            .locator('.erp-admin-sider [role="menuitem"]')
            .filter({ hasText: /^财务管理$/u })
            .count(),
          1
        )
        const search = page.getByPlaceholder(
          BUSINESS_SEARCH_SCOPES.finance.placeholder,
          { exact: true }
        )
        await search.fill('模块应收查询')
        await switchTab(page, '应付')
        await search.waitFor()
        assert.equal(await search.inputValue(), '')
        await search.fill('模块应付查询')
        await switchTab(page, '应收')
        await search.waitFor()
        assert.equal(await search.inputValue(), '模块应收查询')
        await verifyModuleMotion(page, '应付')
        assert.equal(await search.inputValue(), '模块应付查询')
        await verifyModuleMotion(page, '应收', true)
        await switchTab(page, '收付款')
        await search.waitFor()
        await search.fill('模块收付款查询')
        await switchTab(page, '发票')
        await search.waitFor()
        await switchTab(page, '收付款')
        await search.waitFor()
        assert.equal(await search.inputValue(), '模块收付款查询')
        const beforeURL = page.url()
        await page
          .locator('.erp-admin-sider [role="menuitem"]')
          .filter({ hasText: /^财务管理$/u })
          .click()
        assert.equal(page.url(), beforeURL)
        assert.equal(await search.inputValue(), '模块收付款查询')
        await assertNoHorizontalOverflow(page)
      },
    })),
    {
      name: 'module-finance-limited-access',
      path: '/erp/finance/payables',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['payables'],
        actions: ['finance.payable.read'],
        roles: ['finance'],
      },
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'finance', name: '财务' }],
        permissions: ['finance.payable.read'],
        menus: ['/erp/finance/payables'],
      },
      verify: async (page) => {
        await moduleTabs(page)
          .getByRole('tab', { name: '应付', exact: true })
          .waitFor()
        assert.deepEqual(
          await moduleTabs(page).getByRole('tab').allTextContents(),
          ['应付']
        )
        assert.equal(
          await page
            .locator('.erp-admin-sider [role="menuitem"]')
            .filter({ hasText: /^财务管理$/u })
            .count(),
          1
        )
        await assertNoHorizontalOverflow(page)
        await page.goto(new URL('/erp/finance/receivables', page.url()).href)
        await page.waitForURL('**/erp/finance/payables')
        await moduleTabs(page)
          .getByRole('tab', { name: '应付', exact: true })
          .waitFor()
        assert.deepEqual(
          await moduleTabs(page).getByRole('tab').allTextContents(),
          ['应付']
        )
      },
    },
    {
      name: 'module-production-navigation',
      path: '/erp/production/orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const nav = moduleTabs(page)
        await nav
          .getByRole('tab', { name: '生产订单', exact: true, selected: true })
          .waitFor()
        assert.deepEqual(await nav.getByRole('tab').allTextContents(), [
          '生产订单',
          '生产记录',
        ])
        const search = page.getByPlaceholder(
          BUSINESS_SEARCH_SCOPES.production.placeholder,
          { exact: true }
        )
        await search.fill('模块生产查询')
        const queryURL = page.url()
        await switchTab(page, '生产记录')
        await page
          .getByPlaceholder(
            BUSINESS_SEARCH_SCOPES.production_fact.placeholder,
            { exact: true }
          )
          .waitFor()
        await switchTab(page, '生产订单')
        await search.waitFor()
        assert.equal(await search.inputValue(), '模块生产查询')
        assert.equal(page.url(), queryURL)
        await verifyModuleMotion(page, '生产记录')
        await verifyModuleMotion(page, '生产订单', true)
        await page
          .locator('.erp-admin-sider [role="menuitem"]')
          .filter({ hasText: /^财务管理$/u })
          .click()
        await moduleTabs(page)
          .getByRole('tab', { name: '对账', exact: true })
          .waitFor()
        await page
          .locator('.erp-admin-sider [role="menuitem"]')
          .filter({ hasText: /^生产管理$/u })
          .click()
        await search.waitFor()
        assert.equal(page.url(), queryURL)
        assert.equal(await search.inputValue(), '模块生产查询')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'module-production-unsaved-guard',
      path: '/erp/production/orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.getByRole('button', { name: /新建生产订单/u }).click()
        await page
          .getByLabel('生产单号', { exact: true })
          .fill('未保存生产导航验证')
        await moduleTabs(page)
          .getByRole('tab', { name: '生产记录', exact: true })
          .click()
        const confirmation = page
          .getByRole('dialog')
          .filter({ hasText: '放弃未保存的修改？' })
        await confirmation
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        assert(new URL(page.url()).pathname === '/erp/production/orders')
        assert.equal(
          await page.getByLabel('生产单号', { exact: true }).inputValue(),
          '未保存生产导航验证'
        )
        await moduleTabs(page)
          .getByRole('tab', { name: '生产记录', exact: true })
          .click()
        await confirmation
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await page.waitForURL('**/erp/production/progress')
        await moduleTabs(page)
          .getByRole('tab', { name: '生产记录', selected: true })
          .waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'module-finance-narrow-navigation',
      path: '/erp/finance/receivables',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await switchTab(page, '应付')
        await page
          .getByPlaceholder(BUSINESS_SEARCH_SCOPES.finance.placeholder, {
            exact: true,
          })
          .waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'module-navigation-deeplink-race',
      path: '/erp/production/exceptions?view=decisions',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await moduleTabs(page)
          .getByRole('tab', { name: '生产记录', exact: true, selected: true })
          .waitFor()
        let finishRequest
        let requestStarted
        let requestFinished
        const started = new Promise((resolve) => {
          requestStarted = resolve
        })
        const release = new Promise((resolve) => {
          finishRequest = resolve
        })
        const finished = new Promise((resolve) => {
          requestFinished = resolve
        })
        const delayedHandler = async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method !== 'list_production_orders') return route.fallback()
          requestStarted()
          await release
          await route
            .fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"message":"delayed test failure"}',
            })
            .catch(() => {})
          requestFinished()
        }
        await page.route('**/rpc/production_order', delayedHandler)
        await switchTab(page, '生产订单')
        await Promise.race([
          started,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('production list request not observed')),
              10000
            )
          ),
        ])
        await switchTab(page, '生产记录')
        finishRequest()
        await finished
        await page.evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }))
        await page
          .getByPlaceholder(
            BUSINESS_SEARCH_SCOPES.production_fact.placeholder,
            { exact: true }
          )
          .waitFor()
        assert.equal(await page.locator('.ant-message-error').count(), 0)
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
