import { writeFile } from 'node:fs/promises'
import { expect } from 'playwright/test'
import { DEV_FLOW_STATE_CATALOG } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { DEV_PERMISSION_RELATIONSHIPS_API } from '../../src/dev-workbench/config/devPermissionRelationshipApi.mjs'
import { assertGroupedSelectHierarchy } from './groupedSelectAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { searchWholeLibrary } from './devFlowExplorerControls.mjs'
import { permissionRelationshipFixture } from './permissionRelationshipScenarios.mjs'

export function createGroupedSelectScenarios({ assert, assertNoHorizontalOverflow, outputDir }) {
  return [
    ...['light', 'dark'].flatMap((themeMode) => ['desktop', 'mobile'].map((device) => ({
      name: `shared-grouped-select-${themeMode}-${device}`,
      path: '/__dev/ui-design?page=controls&control=grouped-select',
      viewport: device === 'desktop' ? { width: 1920, height: 1080 } : { width: 390, height: 844 },
      deviceScaleFactor: 2,
      themeMode,
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const single = page.getByRole('combobox', { name: '单选记录类型', exact: true })
        const control = stage.locator('.ant-select').filter({ has: single })
        await single.waitFor()
        await page.getByLabel('组件样例主题', { exact: true })
          .getByText(themeMode === 'dark' ? '深色' : '浅色', { exact: true }).click()
        await control.locator('.ant-select-selector').click()
        const popup = page.locator('.ant-select-dropdown:visible')
        const evidence = await assertGroupedSelectHierarchy(popup, `${themeMode}/${device}/单选`)
        if (device === 'mobile') assert(evidence.every((item) => item.optionHeight >= 44), '手机选项保留至少 44px 触区')
        const selected = popup.locator('.ant-select-item-option-selected')
        assert.equal(await selected.locator('.anticon-check').count(), 1, '分组单选保留选中勾选')
        const ordinary = popup.locator('.ant-select-item-option:not(.ant-select-item-option-selected):not(.ant-select-item-option-disabled)').first()
        assert.equal(await ordinary.evaluate((node) => getComputedStyle(node).fontWeight), '400', '普通选项保持常规字重')
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${outputDir}/grouped-select-${themeMode}-${device}.png` })
        await popup.locator('.ant-select-item-group').first().click()
        await popup.getByText('供应商与加工厂', { exact: true }).click({ force: true })
        assert.equal(await stage.getByLabel('分组单选结果').innerText(), '采购订单', '分类和禁用项不改变选择')
        assert(await popup.isVisible(), '点击分类标题保留选项层')

        await single.fill('采购')
        assert.equal(await popup.locator('.ant-select-item-group').count(), 1, '搜索只保留匹配分类')
        assert.equal(await popup.locator('.ant-select-item-option').count(), 1)
        await single.fill('不存在的记录类型')
        await popup.getByText('没有匹配的记录类型', { exact: true }).waitFor()
        await single.fill('')
        assert.equal(await popup.locator('.ant-select-item-group').count(), 2)
        await single.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert(await single.evaluate((node) => node === document.activeElement), '关闭后焦点保留在选择入口')
        await control.locator('.ant-select-clear').click()
        assert.equal(await stage.getByLabel('分组单选结果').innerText(), '未选择记录类型')
        await single.press('ArrowDown')
        await popup.waitFor()
        await waitForFiniteAnimations(page)
        await popup.getByText('材料档案', { exact: true }).hover()
        await single.press('ArrowDown')
        assert.equal(await popup.locator('.ant-select-item-option-active').innerText(), '销售订单', '方向键跳过分类和禁用项')
        await single.press('Enter')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await stage.getByLabel('分组单选结果').innerText(), '销售订单')

        const multiple = page.getByRole('combobox', { name: '多选记录类型', exact: true })
        const multipleControl = stage.locator('.ant-select').filter({ has: multiple })
        await multipleControl.locator('.ant-select-selector').click()
        evidence.push(...await assertGroupedSelectHierarchy(popup, `${themeMode}/${device}/多选`))
        assert.equal(await popup.locator('.ant-select-item-option-selected .anticon-check').count(), 2)
        await popup.getByText('销售订单', { exact: true }).click()
        assert.equal(await stage.getByLabel('分组多选结果').innerText(), '材料档案')
        await multiple.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        await multipleControl.locator('.ant-select-clear').click()
        assert.equal(await stage.getByLabel('分组多选结果').innerText(), '未选择记录类型')
        await stage.getByRole('button', { name: '重置分组示例', exact: true }).click()
        assert.equal(await stage.getByLabel('分组单选结果').innerText(), '采购订单')
        assert.equal(await stage.getByLabel('分组多选结果').innerText(), '材料档案、销售订单')
        await assertNoHorizontalOverflow(page, `分组下拉/${themeMode}/${device}`)
        await writeFile(`${outputDir}/grouped-select-${themeMode}-${device}.json`, JSON.stringify(evidence, null, 2))

        await page.goto(new URL('/__dev/ui-design?page=controls&control=inputs', page.url()).href)
        const flat = page.getByRole('combobox', { name: '产品类别', exact: true })
        await stage.locator('.ant-select').filter({ has: flat }).locator('.ant-select-selector').click()
        await popup.locator('.ant-select-item-option').first().waitFor()
        assert.equal(await popup.locator('.ant-select-item-group').count(), 0, '短枚举继续平铺')
        assert.equal(await popup.locator('.ant-select-item-option').first().evaluate((node) => getComputedStyle(node).paddingInlineStart), '10px', '分组缩进不影响普通选项')
        await flat.press('Escape')
      },
    }))),
    {
      name: 'grouped-select-business-rules',
      path: '/__dev/business-rules?view=states&flow=source.sales_order',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      auth: 'admin',
      mockAdminRpc: true,
      verify: async (page) => {
        const evidence = {}
        for (const [tab, label] of [['状态流转', '选择状态对象'], ['流程定义', '选择流程定义'], ['事实规则', '选择事实定义']]) {
          await page.getByRole('tab', { name: tab, exact: true }).click()
          const input = page.getByRole('combobox', { name: label, exact: true })
          await page.locator('.ant-select').filter({ has: input }).locator('.ant-select-selector').click()
          const popup = page.locator('.ant-select-dropdown:visible')
          evidence[label] = await assertGroupedSelectHierarchy(popup, label)
          const weights = await popup.locator('.erp-dev-flow-definition-option__label').evaluateAll((nodes) => nodes.map((node) => ({
            selected: Boolean(node.closest('.ant-select-item-option-selected')),
            weight: getComputedStyle(node).fontWeight,
          })))
          assert(weights.every((item) => item.weight === (item.selected ? '600' : '400')), `${label}: 名称不再统一加粗`)
          await waitForFiniteAnimations(page)
          await page.screenshot({ path: `${outputDir}/grouped-select-rules-${tab}-4k.png` })
          await input.press('Escape')
        }
        await assertNoHorizontalOverflow(page, '业务规则分组下拉')
        const overview = DEV_FLOW_STATE_CATALOG.businessChainOverview
        await page.goto(new URL('/__dev/flow-explorer?chain=purchase_to_inventory', page.url()).href)
        const editor = page.getByRole('region', { name: '流程探索', exact: true })
        await searchWholeLibrary(editor)
        const nodeFilter = editor.getByRole('button', { name: /^筛选业务节点/u })
        const filterDialog = page.getByRole('dialog', { name: '筛选业务节点', exact: true })
        const sourceField = filterDialog.getByRole('region', { name: '来源链路', exact: true })
        const selectedSource = sourceField.getByRole('button', { pressed: true })
        const clearSource = sourceField.getByRole('button', { name: '清空来源链路', exact: true })
        const closeFilters = filterDialog.getByRole('button', { name: '收起', exact: true })
        const results = editor.getByRole('status', { name: '节点筛选结果', exact: true })
        const allResults = await results.innerText()
        await nodeFilter.click()
        await waitForFiniteAnimations(page)
        await expect(filterDialog.getByRole('textbox')).toHaveCount(0)
        const sourceGroups = sourceField.getByRole('group')
        await expect(sourceGroups).toHaveCount(overview.lanes.length)
        for (const { label } of overview.lanes) {
          await expect(sourceField.getByRole('group', { name: label, exact: true })).toBeInViewport({ ratio: 1 })
        }
        await expect(closeFilters).toBeInViewport()
        await expect(clearSource).toHaveText('清空来源链路')
        await expect(clearSource).toBeDisabled()
        await sourceField.getByRole('button', { name: '采购下单到入库应付', exact: true }).click()
        await expect(selectedSource).toHaveText('采购下单到入库应付')
        await sourceField.getByRole('button', { name: '销售受理到生产准备', exact: true }).click()
        await expect(sourceGroups).toHaveCount(overview.lanes.length)
        await expect(selectedSource).toHaveText('销售受理到生产准备')
        await expect(filterDialog.getByText('来源链路：销售受理到生产准备', { exact: true })).toHaveCount(0)
        await expect(nodeFilter).toHaveAccessibleName(/来源链路：销售受理到生产准备/u)
        await expect(results).not.toHaveText(allResults)
        await closeFilters.click()
        await nodeFilter.click()
        await expect(sourceGroups).toHaveCount(overview.lanes.length)
        await expect(selectedSource).toHaveText('销售受理到生产准备')
        await clearSource.click()
        await expect(selectedSource).toHaveCount(0)
        await expect(nodeFilter).not.toHaveAccessibleName(/来源链路/u)
        await expect(results).toHaveText(allResults)
        await closeFilters.click()
        await writeFile(`${outputDir}/grouped-select-business-rules.json`, JSON.stringify(evidence, null, 2))
      },
    },
    {
      name: 'grouped-select-workbench-catalogs',
      path: '/__dev/integration',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      auth: 'admin',
      mockAdminRpc: true,
      beforeNavigate: async (page) => {
        const snapshot = permissionRelationshipFixture()
        snapshot.permissions[0].module = 'sales_order'
        snapshot.permissions.push(...[
          ['warehouse.inventory.read', '查看库存', 'warehouse', '仓储'],
          ['masterdata.material.read', '查看材料', 'masterdata', '基础资料'],
          ['workflow.task.read', '查看任务', 'workflow', '任务协同'],
          ['system.role.read', '查看岗位', 'system', '系统管理'],
        ].map(([permission_key, name, module, module_name]) => ({ permission_key, name, module, module_name })))
        await page.route(`**${DEV_PERMISSION_RELATIONSHIPS_API}`, (route) => route.fulfill({ json: snapshot }))
      },
      verify: async (page) => {
        const popup = page.locator('.ant-select-dropdown:visible')
        const control = (input) => page.locator('.ant-select').filter({ has: input })
        const open = (input) => control(input).locator('.ant-select-selector').click()
        const domain = page.getByRole('combobox', { name: '筛选业务域', exact: true })
        const domainFilters = page.locator('.erp-dev-integration__filters')
        const domainResults = domainFilters.getByRole('status')
        await expect(domainResults).toHaveText(/^共 \d+ 个接口$/u)
        const total = await domainResults.innerText()
        await open(domain)
        await expect(popup.locator('.ant-select-item-group')).toHaveText(['订单与履约 · 9', '资料与协作 · 5', '账号与系统 · 6'])
        await assertGroupedSelectHierarchy(popup, '接口清单业务域')
        await expect(popup.getByText('资料与协作 · 5', { exact: true })).toBeInViewport()
        await page.screenshot({ path: `${outputDir}/interface-domains-4k.png` })
        await domain.fill('sales_order')
        await expect(popup.getByRole('option')).toHaveText('销售订单')
        await popup.getByRole('option', { name: '销售订单', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('domain') === 'sales_order')
        await expect(domainResults).not.toHaveText(total)
        await open(domain)
        await domain.fill('协作任务')
        await popup.getByRole('option', { name: '协作任务', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('domain') === 'workflow')
        await control(domain).hover()
        await control(domain).locator('.ant-select-clear').click()
        await page.waitForURL((url) => !url.searchParams.has('domain'))
        await expect(domainResults).toHaveText(total)
        await expect(control(domain).locator('.ant-select-selection-placeholder')).toHaveText('全部业务域')
        await assertNoHorizontalOverflow(page, '接口清单业务域')

        await page.goto(new URL('/__dev/permission-relationships?target=sales', page.url()).href)
        const module = page.getByRole('combobox', { name: '选择关系图功能范围', exact: true })
        const graph = page.getByRole('region', { name: '权限生效关系图', exact: true })
        await expect(graph.locator('svg').first()).toBeVisible()
        await open(module)
        await expect(popup.locator('.ant-select-item-group')).toHaveText(['业务办理 · 2', '基础资料与通用工具 · 2', '系统与开发 · 1'])
        await expect(popup.getByRole('option').first()).toHaveText('权限总览')
        await expect(popup.getByRole('option', { selected: true })).toHaveText('权限总览')
        await assertGroupedSelectHierarchy(popup, '权限关系功能范围')
        await expect(popup.getByText('系统与开发 · 1', { exact: true })).toBeInViewport()
        await page.screenshot({ path: `${outputDir}/permission-modules-4k.png` })
        await module.fill('不存在的范围')
        await expect(popup.getByText('没有匹配的选项', { exact: true })).toBeVisible()
        await module.fill('warehouse')
        await expect(popup.getByRole('option')).toHaveText('仓储')
        await popup.getByRole('option', { name: '仓储', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('module') === 'warehouse')
        await expect(graph.getByText(/未授予“仓储”模块权限/u)).toBeVisible()
        await open(module)
        await expect(popup.getByRole('option', { selected: true })).toHaveText('仓储')
        await popup.getByRole('option', { name: '权限总览', exact: true }).click()
        await page.waitForURL((url) => (url.searchParams.get('module') || 'all') === 'all')
        await expect(graph.locator('svg').first()).toBeVisible()
        await assertNoHorizontalOverflow(page, '权限关系功能范围')
      },
    },
    {
      name: 'grouped-select-design-html',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('button', { name: '历史记录中心', exact: true }).click()
        const picker = frame.locator('ui-select[aria-label="历史记录类型"]')
        const initial = await picker.getAttribute('data-value')
        await picker.click()
        const menu = frame.locator('.design-select-menu:popover-open')
        await menu.waitFor()
        const metrics = await menu.locator('[role="group"]').evaluateAll((groups) => groups.map((group) => {
          const heading = group.querySelector('.design-select-group')
          const option = group.querySelector('.design-select-option')
          const style = getComputedStyle(heading)
          return {
            title: heading.textContent,
            indent: option.getBoundingClientRect().left + parseFloat(getComputedStyle(option).paddingLeft) - heading.getBoundingClientRect().left - parseFloat(style.paddingLeft),
            background: style.backgroundColor,
            weight: style.fontWeight,
            cursor: style.cursor,
          }
        }))
        assert.equal(metrics.length, 2)
        assert(metrics.every((item) => item.indent === 18 && item.weight === '500' && item.cursor === 'default' && item.background !== 'rgba(0, 0, 0, 0)'), '独立 HTML 与共享控件保持同样的分类层级')
        await menu.locator('.design-select-group').first().click()
        assert.equal(await picker.getAttribute('data-value'), initial, 'HTML 分类标题不可选择')
        await menu.getByRole('option', { name: '采购订单', exact: true }).click()
        assert.equal(await picker.getAttribute('data-value'), '采购订单')
        await picker.click()
        assert(await menu.locator('[aria-selected="true"] .design-select-check').isVisible(), 'HTML 选中项保留勾选')
        await page.screenshot({ path: `${outputDir}/grouped-select-design-html-4k.png` })
        await picker.press('Escape')
        await menu.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page, '分组下拉独立 HTML')

        await page.goto(new URL('/__dev/ui-design?page=workbench&workbenchMode=preview', page.url()).href)
        await frame.locator('#sidebar').getByRole('button', { name: '接口与集成', exact: true }).click()
        const domain = frame.getByRole('combobox', { name: '筛选业务域', exact: true })
        const domainMenu = domain.locator('.design-select-menu:popover-open')
        const domainSearch = domain.getByRole('textbox', { name: '搜索业务域', exact: true })
        const rows = frame.getByRole('table', { name: '接口清单样例', exact: true }).locator('tbody tr')
        await domain.click()
        await expect(domainMenu.getByRole('group')).toHaveCount(2)
        await expect(domainSearch).toBeFocused()
        await domainSearch.fill('找不到的业务域')
        await expect(domainMenu.getByText('没有匹配的选项', { exact: true })).toBeVisible()
        await domainSearch.fill('sales_order')
        await expect(domainMenu.getByRole('option')).toHaveAccessibleName('销售订单')
        await domainSearch.press('Enter')
        await expect(domain).toHaveAttribute('data-value', 'sales_order')
        await expect(rows).toHaveCount(2)
        await domain.click()
        await domainSearch.fill('登录')
        await domainSearch.press('Escape')
        await expect(domainMenu).toHaveCount(0)
        await expect(domain).toHaveAttribute('data-value', 'sales_order')
        await domain.getByRole('button', { name: '清空筛选业务域', exact: true }).click()
        await expect(domain).toHaveAttribute('data-value', '')
        await expect(rows).toHaveCount(3)
      },
    },
  ]
}
