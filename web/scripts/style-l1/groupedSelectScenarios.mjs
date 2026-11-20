import { writeFile } from 'node:fs/promises'
import { assertGroupedSelectHierarchy } from './groupedSelectAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

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
        await page.getByLabel('控件样例主题', { exact: true })
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
        await writeFile(`${outputDir}/grouped-select-business-rules.json`, JSON.stringify(evidence, null, 2))
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
      },
    },
  ]
}
