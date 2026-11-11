import { writeFile } from 'node:fs/promises'
import { createWarehouseEntryStabilityScenarios } from './warehouseEntryStabilityScenarios.mjs'
import { createBusinessToolbarCompositionScenarios } from './businessToolbarCompositionScenarios.mjs'
import { selectWarehouseView } from './warehouseNavigationActions.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createInventoryPresentationScenarios(deps) {
  const {
    assert,
    assertBusinessHeaderCompact,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    ...createBusinessToolbarCompositionScenarios(deps),
    ...createWarehouseEntryStabilityScenarios(deps),
    {
      name: 'warehouse-workbench-control-parity',
      path: '/erp/task-board?mode=todo',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const modes = page.getByRole('tablist', { name: '待办显示方式', exact: true })
        await modes.getByRole('tab', { name: '列表', selected: true }).waitFor()
        assert.match(await modes.evaluate((root) => getComputedStyle(root, '::before').boxShadow), /-2px/u, '内容导航保留下划线')
        const all = page.getByRole('button', { name: '全部待办', exact: true })
        await all.waitFor()
        const appearance = await all.evaluate((button) => {
          const style = getComputedStyle(button)
          return { radius: style.borderRadius, border: style.borderWidth, height: button.getBoundingClientRect().height }
        })
        assert.equal(appearance.radius, '8px')
        assert.equal(appearance.border, '1px')
        await modes.getByRole('tab', { name: '日历', exact: true }).click()
        await modes.getByRole('tab', { name: '日历', selected: true }).waitFor()
        await modes.getByRole('tab', { name: '列表', exact: true }).click()
        await all.waitFor()
        assert.equal(await all.getAttribute('aria-pressed'), 'true')
        await writeFile(path.join(outputDir, 'workbench-category-controls.json'), JSON.stringify(appearance, null, 2))
      },
    },
    {
      name: 'warehouse-category-navigation',
      path: '/erp/warehouse/outbound?warehouse_view=shipment',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const selector = '.erp-business-module-view-tabs'
        const navigation = page.locator(selector)
        await navigation.getByRole('tab', { name: '销售出货', exact: true, selected: true }).waitFor()
        assert.deepEqual(await navigation.getByRole('tab').allTextContents(), ['销售出货', '生产领料', '委外发料', '库存预留'])
        const style = await navigation.evaluate((root) => {
          const tab = getComputedStyle(root.querySelector('[aria-selected="true"]'))
          return { border: tab.borderTopWidth, background: tab.backgroundColor, marker: getComputedStyle(root, '::before').boxShadow }
        })
        assert.equal(style.border, '0px')
        assert.equal(style.background, 'rgba(0, 0, 0, 0)')
        assert.match(style.marker, /-2px/u)
        const motion = await verifySlidingMotion(page, assert, selector, 1)
        await verifySlidingMotion(page, assert, selector, 0, true)
        await navigation.getByRole('tab', { name: '销售出货', exact: true }).focus()
        await page.keyboard.press('End')
        await navigation.getByRole('tab', { name: '库存预留', selected: true }).waitFor()
        await page.keyboard.press('Home')
        await navigation.getByRole('tab', { name: '销售出货', selected: true }).waitFor()
        await page.keyboard.press('ArrowRight')
        await navigation.getByRole('tab', { name: '生产领料', selected: true }).waitFor()
        assert.equal(await navigation.getByRole('tab', { selected: true }).getAttribute('tabindex'), '0')
        assert.equal(await navigation.locator('[role="tab"][tabindex="0"]').count(), 1)
        await selectWarehouseView(page, '销售出货')
        await page.waitForFunction((selector) => {
          const root = document.querySelector(selector)
          const selected = root.querySelector('[aria-selected="true"]')
          const { transform } = getComputedStyle(root, '::before')
          return Math.abs(new DOMMatrixReadOnly(transform === 'none' ? undefined : transform).m41 - selected.offsetLeft) < 1
        }, selector)
        await page.locator('.erp-business-module-header').screenshot({ path: path.join(outputDir, 'warehouse-category-tabs-header.png') })
        await navigation.screenshot({ path: path.join(outputDir, 'warehouse-category-tabs.png') })
        await page.setViewportSize({ width: 390, height: 844 })
        await navigation.getByRole('tab', { name: '生产领料', exact: true }).focus()
        await page.keyboard.press('End')
        await navigation.getByRole('tab', { name: '库存预留', selected: true }).waitFor()
        const narrow = await navigation.evaluate((root) => {
          const box = root.getBoundingClientRect()
          const buttons = [...root.querySelectorAll('[role="tab"]')]
          const selected = root.querySelector('[aria-selected="true"]').getBoundingClientRect()
          return {
            height: box.height,
            width: box.width,
            scrollWidth: root.scrollWidth,
            tops: buttons.map((button) => button.offsetTop),
            heights: buttons.map((button) => button.getBoundingClientRect().height),
            selectedVisible: selected.left >= box.left - 1 && selected.right <= box.right + 1,
          }
        })
        assert.equal(new Set(narrow.tops).size, 1, '窄屏分类保持一行')
        assert.ok(narrow.heights.every((height) => height >= 44), '分类保留手机触控高度')
        assert.ok(narrow.selectedVisible, `键盘切到最后分类时应自动滚入可视区: ${JSON.stringify(narrow)}`)
        await assertNoHorizontalOverflow(page, 'warehouse-category-tabs-narrow')
        await writeFile(path.join(outputDir, 'warehouse-category-tabs.json'), JSON.stringify({ motion, narrow }, null, 2))
      },
    },
    {
      name: 'warehouse-layout-all-views',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const header = page.locator('.erp-business-module-header')
        const primary = header.locator('.erp-business-module-tabs')
        const secondary = page.locator('.erp-business-operation-panel__content-switch .erp-business-module-view-tabs')
        const evidence = []
        const inspect = async (label, width) => {
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const metrics = await page.locator('.erp-admin-outlet--module').first().evaluate((root) => {
            const header = root.querySelector('.erp-business-module-header')
            const panel = root.querySelector('.erp-business-operation-panel')
            const command = panel?.querySelector('.erp-business-operation-panel__command')
            const box = (node) => node?.getBoundingClientRect().toJSON()
            const headerBox = box(header)
            const commandBox = box(command)
            const controls = command ? [...command.children].flatMap((node) => node.classList.contains('erp-business-operation-panel__command-host') ? [...node.children] : [node]).map(box).filter((item) => item.width > 1) : []
            return {
              header: headerBox,
              command: commandBox,
              panel: box(panel),
              controls,
              gap: commandBox ? box(panel).top - headerBox.bottom : null,
              duplicateHeaders: root.querySelectorAll('.erp-business-page-header-card--secondary').length,
              classificationInHeader: Boolean(header.querySelector('.erp-business-module-view-tabs')),
              classificationInToolbar: Boolean(command?.querySelector('.erp-business-module-view-tabs')),
            }
          })
          assert.ok(metrics.command, `${label} 应复用业务工具栏`)
          assert.equal(metrics.duplicateHeaders, 0, `${label} 不增加独立子页头`)
          assert.equal(metrics.classificationInHeader, false, `${label} 主入口与内容分类分层`)
          assert.equal(metrics.classificationInToolbar, !label.startsWith('库存作业'), `${label} 内容分类属于查询工具栏`)
          if (width >= 1366) {
            assert.ok(metrics.header.height <= 56, `${label} 模块入口保持一行: ${JSON.stringify(metrics)}`)
            assert.ok(metrics.command.height <= (width >= 1920 ? 56 : 100), `${label} 查询工具栏按实际可用宽度紧凑排列: ${JSON.stringify(metrics)}`)
            assert.ok(metrics.gap <= 8, `${label} 只保留一次模块间距`)
          }
          for (const box of metrics.controls) {
            assert.ok(box.left >= metrics.command.left - 1 && box.right <= metrics.command.right + 1, `${label} 工具不得溢出: ${JSON.stringify(metrics)}`)
          }
          await assertNoHorizontalOverflow(page, `${label}-${width}`)
          evidence.push({ label, width, ...metrics })
        }
        for (const [group, views] of [
          ['库存查询', ['库存余额', '库存批次', '库存变动记录']],
          ['入库办理', ['采购收货', '成品入库', '委外回货', '工序回货']],
          ['出库办理', ['销售出货', '生产领料', '委外发料', '库存预留']],
        ]) {
          await primary.getByRole('tab', { name: group, exact: true }).click()
          await primary.getByRole('tab', { name: group, exact: true, selected: true }).waitFor()
          await secondary.getByRole('tab', { name: views[0], exact: true }).waitFor()
          assert.deepEqual(await secondary.getByRole('tab').allTextContents(), views)
          await secondary.evaluate((node) => { window.__warehouseNavigation = node })
          for (const [index, view] of views.entries()) {
            await selectWarehouseView(page, view)
            assert.equal(await secondary.evaluate((node) => node === window.__warehouseNavigation), true, '分类切换只更新内容，分类按钮条保持挂载')
            await page.locator('.erp-business-operation-panel__command').waitFor()
            for (const width of [1920, 1366, 820, 390]) {
              await page.setViewportSize({ width, height: 1080 })
              await inspect(`${group}-${view}`, width)
            }
            await page.setViewportSize({ width: 1920, height: 1080 })
            if (view === '库存批次') {
              const statuses = page.getByRole('group', { name: '批次状态', exact: true })
              await statuses.getByRole('button', { name: /^可用，/u }).click()
              await statuses.getByRole('button', { name: /^可用，/u, pressed: true }).waitFor()
              await secondary.getByRole('tab', { name: '库存批次', exact: true, selected: true }).waitFor()
              const filterStyle = await statuses.getByRole('button', { name: /^可用，/u }).evaluate((node) => {
                const style = getComputedStyle(node)
                return { radius: style.borderRadius, border: style.borderTopWidth }
              })
              assert.deepEqual(filterStyle, { radius: '8px', border: '1px' })
              await page.locator('.erp-business-operation-panel__command').screenshot({ path: path.join(outputDir, 'warehouse-lots-tabs-and-filters.png') })
              await statuses.getByRole('button', { name: /^不限状态，/u }).click()
              await statuses.getByRole('button', { name: /^不限状态，/u, pressed: true }).waitFor()
            }
            if (index === 0) {
              await page.screenshot({ path: path.join(outputDir, `warehouse-${group}-4k.png`) })
            }
          }
        }
        await primary.getByRole('tab', { name: '入库办理', exact: true }).click()
        await primary.getByRole('tab', { name: '入库办理', exact: true, selected: true }).waitFor()
        await selectWarehouseView(page, '采购收货')
        const search = page.locator('.erp-business-operation-panel__search input')
        await search.fill('采购核对')
        await search.press('Enter')
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        await page.getByRole('dialog', { name: '筛选条件', exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await selectWarehouseView(page, '成品入库')
        await selectWarehouseView(page, '采购收货')
        assert.equal(await search.inputValue(), '采购核对', '往返分类保留所属页面搜索')
        await primary.getByRole('tab', { name: '库存作业', exact: true }).click()
        await page.getByRole('combobox', { name: '作业类型', exact: true }).waitFor()
        assert.equal(await secondary.count(), 0, '库存作业不显示库存查询分类')
        for (const width of [1920, 1366, 820, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          await inspect('库存作业', width)
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'warehouse-库存作业-4k.png') })
        const readOperation = (predicate) => page.waitForRequest((request) => {
          if (!request.url().endsWith('/rpc/inventory') || request.method() !== 'POST') return false
          const { method, params } = request.postDataJSON()
          return method === 'list_inventory_operations' && predicate(params)
        })
        const typeRead = readOperation((params) => params.operation_type === 'TRANSFER')
        await page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '作业类型', exact: true }) }).locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('库存调拨', { exact: true }).click()
        await typeRead
        const statusRead = readOperation((params) => params.operation_type === 'TRANSFER' && params.status === 'DRAFT')
        await page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '作业状态', exact: true }) }).locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('草稿', { exact: true }).click()
        await statusRead
        const allCreatorsRead = readOperation((params) => params.status === 'DRAFT' && !params.created_by)
        await page.getByRole('checkbox', { name: '仅看我创建', exact: true }).uncheck()
        await allCreatorsRead
        const refreshRead = readOperation((params) => params.operation_type === 'TRANSFER' && params.status === 'DRAFT' && !params.created_by)
        await header.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await refreshRead
        await writeFile(path.join(outputDir, 'warehouse-layout-metrics.json'), JSON.stringify(evidence, null, 2))
      },
    },
    {
      name: 'warehouse-layout-dark-split',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page.getByRole('button', { name: '分栏', exact: true }).click()
        const left = page.locator('.erp-split-pane--left')
        const right = page.locator('.erp-split-pane--right')
        const picker = right.getByRole('combobox', { name: '选择右栏页面', exact: true })
        await picker.click()
        await picker.fill('出库办理')
        await page.locator('.ant-select-dropdown:visible').getByText('出库办理', { exact: true }).click()
        await selectWarehouseView(page, '生产领料', right)
        await left.locator('.erp-business-module-view-tabs [role="tab"][aria-selected="true"]').filter({ hasText: '采购收货' }).waitFor()
        const leftSearch = left.locator('.erp-business-operation-panel__search input')
        await leftSearch.fill('左栏采购')
        await leftSearch.press('Enter')
        await right.locator('.erp-business-operation-panel__search input').fill('右栏领料')
        assert.equal(await leftSearch.inputValue(), '左栏采购', '分栏分类与搜索互不覆盖')
        await page.keyboard.press('Tab')
        await assertERPThemeMode(page, { scenarioName: 'warehouse-layout-dark-split', expectedMode: 'dark', expectedEffectiveTheme: 'dark' })
        await assertNoHorizontalOverflow(page, 'warehouse-layout-dark-split')
        await page.screenshot({ path: path.join(outputDir, 'warehouse-dark-split-4k.png') })
      },
    },
    {
      name: 'warehouse-design-layout-sync',
      path: '/__dev/ui-design?page=workspace',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        const header = frame.locator('.module-tabs-row')
        await frame.locator('#sidebar').getByRole('button', { name: '仓储管理', exact: true }).click()
        await header.getByRole('tab', { name: '库存查询', exact: true }).waitFor()
        for (const [group, views] of [
          ['库存查询', ['库存余额', '库存批次', '库存变动记录']],
          ['入库办理', ['采购收货', '成品入库', '委外回货', '工序回货']],
          ['出库办理', ['销售出货', '生产领料', '委外发料', '库存预留']],
        ]) {
          await header.getByRole('tab', { name: group, exact: true }).click()
          const navigation = frame.locator('.operation-surface .warehouse-navigation')
          assert.deepEqual(await navigation.getByRole('tab').allTextContents(), views)
          if (group === '库存查询') assert.equal(await frame.locator('.command-row').getByRole('button', { name: '新建库存操作', exact: true }).count(), 0, '查询工具栏不重复提供库存作业入口')
          await navigation.getByRole('tab', { name: views.at(-1), exact: true }).click()
          assert.equal(await frame.locator('.operation-surface .warehouse-navigation').getByRole('tab', { selected: true }).innerText(), views.at(-1))
        }
        assert.equal(await header.locator('.warehouse-navigation').count(), 0, '设计源主入口与内容分类分别组织')
        assert.equal(await frame.locator('.command-row .warehouse-navigation').count(), 1, '设计源内容分类位于查询工具栏')
        await page.screenshot({ path: path.join(outputDir, 'warehouse-design-sync-4k.png') })
      },
    },
    {
      name: 'inventory-toolbar-density-responsive',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await expectHeading(page, '库存查询')
        const command = page.locator('.erp-inventory-ledger-page .erp-business-operation-panel__command')
        await page.getByRole('tablist', { name: '库存查询分类', exact: true }).waitFor()
        for (const width of [1920, 1440, 1366, 820, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          const metrics = await command.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const controls = [...element.children].filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => ({ class: node.className, ...node.getBoundingClientRect().toJSON() }))
            const search = element.querySelector('.erp-business-operation-panel__search')
            const moduleHeader = document.querySelector('.erp-business-module-header')
            const headerBounds = moduleHeader.getBoundingClientRect()
            return {
              bounds: bounds.toJSON(),
              controls,
              searchWidth: search.getBoundingClientRect().width,
              searchMaxWidth: getComputedStyle(search).maxWidth,
              headerHeight: headerBounds.height,
              headerGap: bounds.top - headerBounds.bottom,
              secondaryHeaders: document.querySelectorAll('.erp-inventory-ledger-page .erp-business-page-header-card--secondary').length,
            }
          })
          assert.equal(metrics.secondaryHeaders, 0, '库存分类与查询组合，不另设二级页头')
          assert.ok(metrics.controls.every((box) => box.left >= metrics.bounds.left && box.right <= metrics.bounds.right + 1), `库存工具栏控件须位于自身边界内: ${JSON.stringify(metrics)}`)
          for (let i = 0; i < metrics.controls.length; i += 1) {
            for (const peer of metrics.controls.slice(i + 1)) {
              const current = metrics.controls[i]
              const overlapX = Math.min(current.right, peer.right) - Math.max(current.left, peer.left)
              const overlapY = Math.min(current.bottom, peer.bottom) - Math.max(current.top, peer.top)
              assert.ok(overlapX <= 1 || overlapY <= 1, `库存工具栏换行后不能重叠: ${JSON.stringify(metrics)}`)
            }
          }
          assert.equal(metrics.searchMaxWidth, 'none', '库存搜索应与共享工具栏一样利用剩余宽度')
          if (width >= 1440) {
            assert.ok(metrics.bounds.height <= 56, `宽屏库存工具栏应保持单行: ${JSON.stringify(metrics)}`)
            assert.ok(metrics.searchWidth >= 268, `库存搜索框须保持共享的最小可用宽度: ${JSON.stringify(metrics)}`)
            const centers = metrics.controls.map((box) => box.top + box.height / 2)
            assert.ok(Math.max(...centers) - Math.min(...centers) <= 1, '宽屏分类、视图与查询操作应垂直居中对齐')
            assert.ok(metrics.headerHeight <= 56, `宽屏模块导航保持单行: ${JSON.stringify(metrics)}`)
            assert.ok(metrics.headerGap <= 8, '模块导航和查询栏之间只保留一次共享间隔')
          }
          if (width === 1920) assert.ok(metrics.searchWidth > 400, `宽屏库存搜索须利用原先留白: ${JSON.stringify(metrics)}`)
          await assertNoHorizontalOverflow(page, `inventory-toolbar-${width}`)
          await page.screenshot({ path: path.join(outputDir, `inventory-toolbar-${width}.png`), fullPage: false })
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        const search = command.locator('.erp-business-operation-panel__search input')
        await search.fill('SKU')
        await search.press('Enter')
        assert.equal(await command.getByRole('button', { name: '管理', exact: true }).count(), 0)
        const warehouseSettings = command.getByRole('button', { name: '仓库设置', exact: true })
        await warehouseSettings.focus()
        await warehouseSettings.press('Enter')
        const settings = page.getByRole('dialog').filter({ hasText: '仓库设置' })
        await settings.waitFor()
        await settings.locator('.ant-modal-close').click()
        await settings.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent === '仓库设置')
        assert.equal(await search.inputValue(), 'SKU', '关闭仓库设置应保留搜索词并返回原工具栏')
        await command.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u }).click()
        const filters = page.getByRole('dialog', { name: '筛选条件' })
        const types = filters.getByRole('group', { name: '存货类型', exact: true })
        const objectFilter = (name) => filters.getByRole('combobox', { name, exact: true })
        assert.equal(await objectFilter('存货').isDisabled(), true)
        await types.getByRole('button', { name: '材料', exact: true }).click()
        await objectFilter('材料').waitFor()
        await filters.getByText('选择材料', { exact: true }).waitFor()
        await types.getByRole('button', { name: '成品', exact: true }).click()
        await objectFilter('产品').waitFor()
        await filters.getByText('选择产品', { exact: true }).waitFor()
        await types.getByRole('button', { name: '不限', exact: true }).click()
        assert.equal(await objectFilter('存货').isDisabled(), true)
        await filters.getByRole('button', { name: '完成', exact: true }).click()
        assert.equal(await search.inputValue(), 'SKU', '打开和关闭筛选应保留搜索词')
        await search.fill('')
        await search.press('Enter')
        await verifySlidingMotion(page, assert, '.erp-inventory-ledger-page .erp-sliding-segmented', 1)
        await page.getByRole('region', { name: '仓库库存分布', exact: true }).waitFor()
        await verifySlidingMotion(page, assert, '.erp-inventory-ledger-page .erp-sliding-segmented', 0, true)
        assert.equal(await command.getByRole('button', { name: '库存作业', exact: true }).count(), 0, '查询区不重复模块入口')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '库存作业', exact: true }).click()
        await page.waitForURL('**/erp/warehouse/inventory?workspace=operations')
        await expectHeading(page, '库存作业')
      },
    },
    {
      name: 'inventory-visible-copy-desktop',
      beforeNavigate: async (page) => {
        page.warehouseNavigationReadFailures = []
        page.warehouseNavigationListRequests = []
        page.on('request', (request) => {
          if (!request.url().endsWith('/rpc/inventory')) return
          const call = request.postDataJSON()
          if (['list_inventory_lots', 'list_inventory_txns'].includes(call?.method) && !Array.isArray(call.params?.ids)) {
            page.warehouseNavigationListRequests.push({ method: call.method, id: call.id })
          }
        })
        page.on('requestfailed', (request) => {
          if (!request.url().includes('/rpc/')) return
          const call = request.postDataJSON()
          page.warehouseNavigationReadFailures.push({
            path: new URL(request.url()).pathname,
            method: call?.method,
            id: call?.id,
            reason: request.failure()?.errorText,
          })
        })
        await page.route('**/rpc/*', async (route) => {
          const { method, params } = route.request().postDataJSON() || {}
          if (
            ['list_inventory_lots', 'list_inventory_txns'].includes(method) &&
            !Array.isArray(params?.ids)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 80))
          }
          await route.fallback()
        })
      },
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const historyReads = []
        const navigateInventoryView = async (view, navigate) => {
          const method = view === 'lots' ? 'list_inventory_lots' : 'list_inventory_txns'
          const [response] = await Promise.all([
            page.waitForResponse((response) => {
              if (!response.url().endsWith('/rpc/inventory')) return false
              const call = response.request().postDataJSON()
              return call.method === method && !Array.isArray(call.params?.ids)
            }),
            navigate(),
          ])
          assert.equal(response.status(), 200)
          assert.equal(await response.finished(), null)
          assert.equal((await response.json()).result.code, 0)
          const label = view === 'lots' ? '库存批次' : '库存变动记录'
          assert.equal(new URL(page.url()).searchParams.get('view'), view)
          await page.locator('.erp-business-module-view-tabs [role="tab"][aria-selected="true"]')
            .filter({ hasText: label }).waitFor()
          // A same-document history change does not reset Playwright's networkidle state.
          // Wait for the new rows and hydrated references before unloading this document.
          const rowKey = view === 'lots' ? 'lots-401' : 'txns-501'
          const row = page.locator(`tr[data-row-key="${rowKey}"]`)
          for (const text of view === 'lots'
            ? ['INV-LOT-001', 'MAT-STYLE-L1']
            : ['PROD-STYLE-L1', 'SKU-STYLE-L1', 'WH-STYLE-L1', 'SKU-LOT-STYLE-L1']) {
            await row.filter({ hasText: text }).waitFor()
          }
          if (view === 'lots') {
            await page.locator('tr[data-row-key="lots-402"]')
              .filter({ hasText: 'PROD-STYLE-L1' })
              .filter({ hasText: 'SKU-STYLE-L1' }).waitFor()
          }
          await page.locator('.erp-inventory-ledger-page .ant-spin-spinning').waitFor({ state: 'hidden' })
          historyReads.push({ view, method, rowKey, status: response.status() })
        }
        await expectHeading(page, '库存查询')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-balance-desktop',
        })
        await assertTextAbsent(page, '查看内容')
        await navigateInventoryView('lots', () => selectWarehouseView(page, '库存批次'))
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-lots-desktop',
        })
        await navigateInventoryView('txns', () => selectWarehouseView(page, '库存变动记录'))
        for (let cycle = 0; cycle < 5; cycle += 1) {
          await navigateInventoryView('lots', () => page.goBack())
          await navigateInventoryView('txns', () => page.goForward())
          await navigateInventoryView('txns', () => page.reload())
        }
        assert.equal(await page.locator('.erp-business-module-view-tabs [role="tab"][aria-selected="true"]').innerText(), '库存变动记录')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-transactions-desktop',
        })
        await expectText(page, '撤销调整')
        await assertTextAbsent(page, '库存流水')
        await assertTextAbsent(page, '流水')
        await assertTextAbsent(page, '冲正')
        await page.screenshot({
          path: path.join(outputDir, 'inventory-visible-copy-desktop.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(page, 'inventory-visible-copy-desktop')
        assert.deepEqual(page.warehouseNavigationReadFailures, [], '完成视图加载后再导航，不应留下失败或取消的 RPC')
        assert.deepEqual(page.warehouseNavigationListRequests.map(({ method }) => method), historyReads.map(({ method }) => method), '默认第一页切换视图时每次只查询一次列表')
        await writeFile(path.join(outputDir, 'inventory-history-refresh.json'), JSON.stringify({
          cycles: 5,
          historyReads,
          requestedReads: page.warehouseNavigationListRequests,
          failedReads: page.warehouseNavigationReadFailures,
        }, null, 2))
      },
    },
    {
      name: 'warehouse-inventory-pagination-view-reset',
      path: '/erp/warehouse/inventory?view=lots',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const lots = Array.from({ length: 51 }, (_, index) => ({
          id: 2000 + index,
          lot_no: `PAGINATION-LOT-${String(index + 1).padStart(3, '0')}`,
          subject_type: 'MATERIAL',
          subject_id: 1,
          status: 'ACTIVE',
        }))
        await page.route('**/rpc/inventory', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_inventory_lots' || Array.isArray(params.ids)) return route.fallback()
          await route.fulfill({ json: {
            jsonrpc: '2.0',
            id,
            result: styleRpcResult(stylePaginatedRpcData(lots, 'inventory_lots', params)),
          } })
        })
      },
      verify: async (page) => {
        const activePage = page.locator('[data-business-view-panel]:not([hidden]) .ant-pagination-item-active')
        await page.locator('tr[data-row-key="lots-2000"]').waitFor()
        await page.locator('.ant-pagination-item-2').click()
        await page.locator('tr[data-row-key="lots-2050"]')
          .filter({ hasText: 'PAGINATION-LOT-051' }).waitFor()
        assert.equal(await activePage.getAttribute('title'), '2')
        const [response] = await Promise.all([
          page.waitForResponse((response) => {
            if (!response.url().endsWith('/rpc/inventory')) return false
            const call = response.request().postDataJSON()
            return call.method === 'list_inventory_txns' && call.params.offset === 0
          }),
          selectWarehouseView(page, '库存变动记录'),
        ])
        assert.equal(response.status(), 200)
        assert.equal(await response.finished(), null)
        assert.equal((await response.json()).result.code, 0)
        await page.locator('tr[data-row-key="txns-501"]').waitFor()
        assert.equal(await activePage.getAttribute('title'), '1')
        await writeFile(path.join(outputDir, 'inventory-pagination-view-reset.json'), JSON.stringify({
          fromPage: 2,
          toPage: 1,
          query: response.request().postDataJSON().params,
        }, null, 2))
      },
    },
    {
      name: 'warehouse-inventory-server-table-sort',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const balances = Array.from({ length: 51 }, (_, index) => ({
          id: 3000 + index,
          subject_type: 'MATERIAL',
          subject_id: 1,
          warehouse_id: 1,
          unit_id: 1,
          quantity: index === 50 ? '0.125' : '12',
        }))
        const lots = [
          { id: 4000, lot_no: 'SORT-LOT-LATE', received_at: 1781683200 },
          { id: 4001, lot_no: 'SORT-LOT-EARLY', received_at: 1781596800 },
        ]
        let failDescendingOnce = true
        await page.route('**/rpc/inventory', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_inventory_balances') {
            if (params.sort_direction === 'desc' && failDescendingOnce) {
              failDescendingOnce = false
              return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '读取失败' } } })
            }
            const rows = params.sort_direction === 'asc' ? [balances[50], ...balances.slice(0, 50)] : balances
            return route.fulfill({ json: {
              jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(rows, 'inventory_balances', params)),
            } })
          }
          if (method === 'list_inventory_lots' && !Array.isArray(params.ids)) {
            const rows = params.sort_by === 'received_at' ? [...lots].reverse() : lots
            return route.fulfill({ json: {
              jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(rows, 'inventory_lots', params)),
            } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const quantity = page.getByRole('columnheader', { name: '账面数量', exact: true })
        const panel = page.locator('[data-business-view-panel]:not([hidden])')
        const activePage = panel.locator('.ant-pagination-item-active')
        const waitForFirstRow = (key) => panel.locator('.ant-table-tbody tr[data-row-key]').first()
          .and(page.locator(`tr[data-row-key="${key}"]`)).waitFor()
        const readAfter = (method, check, action) => Promise.all([
          page.waitForResponse((response) => {
            if (!response.url().endsWith('/rpc/inventory')) return false
            const call = response.request().postDataJSON()
            return call.method === method && !Array.isArray(call.params?.ids) && check(call.params || {})
          }),
          action(),
        ])
        const balances = 'list_inventory_balances'
        await waitForFirstRow('balances-3000')
        const search = page.locator('.erp-business-operation-panel__search input')
        await search.fill('SORT')
        await readAfter(balances, (p) => p.keyword === 'SORT', () => search.press('Enter'))
        await panel.locator('.ant-pagination-item-2').click()
        await waitForFirstRow('balances-3050')
        assert.equal(await activePage.getAttribute('title'), '2')
        const isQuantityAscending = (p) =>
          p.keyword === 'SORT' && p.sort_by === 'quantity' && p.sort_direction === 'asc' && p.offset === 0
        await readAfter(balances, isQuantityAscending, () => quantity.press('Enter'))
        await waitForFirstRow('balances-3050')
        await quantity.and(page.locator('[aria-sort="ascending"]')).waitFor()
        assert.equal(await activePage.getAttribute('title'), '1')
        await panel.locator('.ant-pagination-item-2').click()
        await waitForFirstRow('balances-3049')
        const isDescendingFirstPage = (p) => p.sort_direction === 'desc' && p.offset === 0
        const [failed] = await readAfter(balances, isDescendingFirstPage, () => quantity.click())
        assert.equal((await failed.json()).result.code, 50000)
        await page.locator('.erp-inventory-ledger-page .ant-spin-spinning').waitFor({ state: 'hidden' })
        assert.equal(await quantity.getAttribute('aria-sort'), 'ascending')
        assert.equal(await activePage.getAttribute('title'), '2')
        await waitForFirstRow('balances-3049')
        const refresh = page.getByRole('button', { name: '刷新当前页', exact: true })
        await readAfter(balances, isDescendingFirstPage, () => refresh.click())
        await waitForFirstRow('balances-3000')
        await quantity.and(page.locator('[aria-sort="descending"]')).waitFor()
        await readAfter('list_inventory_lots', (p) => !p.sort_by, () => selectWarehouseView(page, '库存批次'))
        await waitForFirstRow('lots-4000')
        const received = page.getByRole('columnheader', { name: '接收日期', exact: true })
        await readAfter('list_inventory_lots', (p) => p.sort_by === 'received_at' && p.sort_direction === 'asc', () => received.click())
        await waitForFirstRow('lots-4001')
        await received.and(page.locator('[aria-sort="ascending"]')).waitFor()
        await readAfter(balances, (p) => p.sort_by === 'quantity' && p.sort_direction === 'desc', () => selectWarehouseView(page, '库存余额'))
        await quantity.and(page.locator('[aria-sort="descending"]')).waitFor()
        await readAfter(balances, (p) => !p.sort_by && !p.sort_direction && p.keyword === 'SORT', () => quantity.click())
        await page.waitForFunction(() => !document.querySelector('[data-business-view-panel="balances"]:not([hidden]) th[aria-sort]'))
        await assertNoHorizontalOverflow(page, 'warehouse-inventory-server-table-sort')
      },
    },
    {
      name: 'inventory-compact-header-dark-mobile',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '库存查询')
        await selectWarehouseView(page, '库存余额')
        await assertERPThemeMode(page, {
          scenarioName: 'inventory-compact-header-dark-mobile',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-dark-mobile',
        })
        await assertTextAbsent(page, '查看内容')
        await page
          .locator('.erp-admin-content')
          .evaluate((node) => node.scrollTo({ top: 0, behavior: 'auto' }))
        const mobileHeaderMetrics = await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const header = document.querySelector(
            '.erp-business-page-header-card'
          )
          const title = header?.querySelector('h1')
          const tabs = Array.from(
            header?.querySelectorAll(
              '.erp-business-module-tabs [role="tab"]'
            ) || []
          )
          const contentRect = content?.getBoundingClientRect()
          const headerRect = header?.getBoundingClientRect()
          const titleRect = title?.getBoundingClientRect()
          return {
            scrollTop: content?.scrollTop ?? null,
            content: contentRect?.toJSON() || null,
            header: headerRect?.toJSON() || null,
            title: title
              ? {
                  text: title.textContent?.trim() || '',
                  rect: titleRect?.toJSON() || null,
                  color: window.getComputedStyle(title).color,
                }
              : null,
            tabs: tabs.map((value) => ({
              text: value.textContent?.trim() || '',
              rect: value.getBoundingClientRect().toJSON(),
              color: window.getComputedStyle(value).color,
            })),
          }
        })
        assert.equal(
          mobileHeaderMetrics.scrollTop,
          0,
          `库存暗色手机页头截图前应回到内容顶部: ${JSON.stringify(
            mobileHeaderMetrics
          )}`
        )
        assert(
          mobileHeaderMetrics.title?.text === '仓储管理' &&
            mobileHeaderMetrics.tabs.length === 4 &&
            mobileHeaderMetrics.tabs.every(
              (item) =>
                item.rect.top >= mobileHeaderMetrics.content.top &&
                item.rect.bottom <= mobileHeaderMetrics.content.bottom
            ),
          `库存暗色手机页头标题和页签应在可视内容区内: ${JSON.stringify(
            mobileHeaderMetrics
          )}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'inventory-compact-header-dark-mobile.png'
          ),
          fullPage: true,
        })
        await page.locator('.erp-business-module-header').screenshot({
          path: path.join(
            outputDir,
            'inventory-compact-header-dark-mobile-header.png'
          ),
        })
        await selectWarehouseView(page, '库存变动记录')
        assert.equal(new URL(page.url()).searchParams.get('view'), 'txns')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-transactions-dark-mobile',
        })
        await assertNoHorizontalOverflow(
          page,
          'inventory-compact-header-dark-mobile'
        )
      },
    },
  ]
}
