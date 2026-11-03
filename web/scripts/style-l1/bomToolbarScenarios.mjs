import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertBOMEditorDensity } from './bomEditorDensityAssertions.mjs'

export function createBOMToolbarScenarios(deps, base) {
  const scenarios = [
    ['desktop', { width: 1920, height: 1080 }, 'light', 2],
    ['dark', { width: 1440, height: 900 }, 'dark', 1],
    ['narrow', { width: 390, height: 844 }, 'light', 1],
  ].map(([variant, viewport, themeMode, deviceScaleFactor]) => ({
    ...base,
    name: `bom-toolbar-${variant}`,
    viewport,
    themeMode,
    deviceScaleFactor,
    verify: async (page) => {
      await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
      const editor = page.locator('.erp-bom-editor:visible')
      const owner = editor.locator('.erp-bom-material-groups')
      const toolbar = owner.getByRole('group', { name: 'BOM 选中对象操作', exact: true })
      const groups = owner.locator('.erp-bom-material-group')
      await toolbar.waitFor()
      await owner.getByRole('button', { name: '全部展开', exact: true }).click()
      assert.equal(await groups.count(), 3)
      await assertBOMEditorDensity(editor)
      const headers = await owner.locator('.erp-bom-parts-table > thead th').allTextContents()
      assert.equal(headers.includes('操作'), false)
      assert.equal(await owner.locator('.erp-bom-part-actions, .erp-bom-col-actions').count(), 0)
      assert.equal(headers.length, 12)
      assert.equal(await owner.locator('input[type="radio"], .erp-bom-selection-cell').count(), 0)
      assert.deepEqual(headers.slice(0, 6), ['物料名称', '厂商料号', '规格', '单位', '组装部位', '片数'])
      assert.equal(await toolbar.getByRole('button', { name: '复制部位', exact: true }).isDisabled(), true)
      const first = groups.first()
      const rows = first.locator('tr[data-bom-part-index]')
      const material = first.locator('input[aria-label^="物料名称 "]')
      const originalMaterial = await material.elementHandle()
      await expect(editor).toHaveAttribute('data-unsaved', 'false')
      await first.locator('.erp-bom-material-cell').nth(1).click()
      await expect(editor).toHaveAttribute('data-unsaved', 'false')
      assert.match(await toolbar.getByRole('status').innerText(), /^物料：.*1 个部位/u)
      await toolbar.getByRole('button', { name: '添加部位', exact: true }).click()
      await expect(rows).toHaveCount(2)
      assert.equal(await material.evaluate((node, old) => node === old, originalMaterial), true, '新增部位保持原物料控件')
      await rows.first().locator('td:not(.erp-bom-material-cell)').first().click()
      const position = first.getByLabel('部位 1', { exact: true })
      const positionNode = await position.elementHandle()
      await position.fill('左耳')
      await first.getByLabel('单位用量 1', { exact: true }).fill('0.125')
      await first.getByLabel('备注 1', { exact: true }).fill('本条部位草稿')
      await first.getByLabel('部位 2', { exact: true }).fill('右耳')
      assert.match(await toolbar.getByRole('status').innerText(), /部位：.*右耳/u, '进入另一行时操作跟随当前部位')
      await position.focus()
      assert.match(await toolbar.getByRole('status').innerText(), /部位：.*左耳/u)
      assert.equal(await position.evaluate((node, old) => node === old, positionNode), true)
      await owner.locator('.erp-sales-order-lines-form__head').scrollIntoViewIfNeeded()
      const selectionCells = await owner.locator('tr[data-bom-part-selected="true"] > td:not(.erp-bom-material-cell)').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor))
      assert.ok(selectionCells.length > 0 && selectionCells.every((color) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)'), `当前部位以轻量底色标记：${JSON.stringify(selectionCells)}`)
      await owner.locator('.erp-bom-parts-scroll').evaluate((node) => { node.scrollLeft = 0; node.dispatchEvent(new Event('scroll', { bubbles: true })) })
      await page.screenshot({ path: `${deps.outputDir}/bom-toolbar-${variant}-part-selected.png` })
      await toolbar.getByRole('button', { name: '复制部位', exact: true }).click()
      await expect(rows).toHaveCount(3)
      assert.equal(await first.getByLabel('部位 2', { exact: true }).inputValue(), '左耳')
      assert.equal(await first.getByLabel('备注 2', { exact: true }).inputValue(), '本条部位草稿')
      assert.equal(await first.getByLabel('部位 3', { exact: true }).inputValue(), '右耳')
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '部位 2')
      await rows.nth(1).locator('td:not(.erp-bom-material-cell)').first().click()
      await toolbar.getByRole('button', { name: '移除部位', exact: true }).click()
      await expect(rows).toHaveCount(2)
      await expect(toolbar.getByRole('status')).toHaveText('点击物料或部位后操作')
      assert.equal(await first.getByLabel('部位 1', { exact: true }).inputValue(), '左耳')
      assert.equal(await first.getByLabel('部位 2', { exact: true }).inputValue(), '右耳')
      await groups.nth(1).locator('tr[data-bom-part-index] td:not(.erp-bom-material-cell)').first().click()
      assert.equal(await toolbar.getByRole('button', { name: '移除部位', exact: true }).isDisabled(), true)
      await first.locator('.erp-bom-material-cell').nth(1).click()
      await toolbar.getByRole('button', { name: '移除物料', exact: true }).click()
      const confirm = page.locator('.ant-popover:visible')
      await expect(confirm).toContainText('及其 2 个部位')
      await confirm.getByRole('button', { name: '保留', exact: true }).click()
      await expect(confirm).toBeHidden()
      assert.equal(await rows.count(), 2)
      await toolbar.getByRole('button', { name: '移除物料', exact: true }).click()
      await groups.nth(1).locator('.erp-bom-material-cell').nth(1).click()
      await expect(page.locator('.ant-popover:visible')).toHaveCount(0)
      assert.match(await toolbar.getByRole('status').innerText(), /1 个部位/u)
      await first.locator('.erp-bom-material-cell').nth(1).click()
      await owner.locator('.erp-sales-order-lines-form__head').scrollIntoViewIfNeeded()
      await waitForFiniteAnimations(page)
      const layout = await owner.evaluate((node) => {
        const toolbar = node.querySelector('.erp-bom-selection-actions')
        const header = toolbar.closest('.erp-sales-order-lines-form__head')
        const box = header.getBoundingClientRect()
        return {
          header: { width: box.width, height: box.height },
          overflow: header.scrollWidth - header.clientWidth,
          buttons: [...toolbar.querySelectorAll('button')].map((button) => {
            const r = button.getBoundingClientRect()
            return { text: button.textContent.trim(), left: r.left - box.left, right: r.right - box.right, top: r.top - box.top, bottom: r.bottom - box.bottom, height: r.height }
          }),
        }
      })
      assert.ok(layout.overflow <= 1 && layout.buttons.every((button) => button.left >= -1 && button.right <= 1 && button.top >= -1 && button.bottom <= 1), JSON.stringify(layout))
      if (variant === 'narrow') assert.ok(layout.buttons.every((button) => button.height >= 44), JSON.stringify(layout))
      const materialNames = await owner.locator('.erp-bom-material-cell .app-select__reference-name').evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect()
        const item = node.closest('.ant-select-selection-item')
        return { text: node.textContent, width: box.width, height: box.height, opacity: getComputedStyle(item).opacity, visibility: getComputedStyle(item).visibility }
      }))
      console.log(`[bom-material-names] ${variant}: ${JSON.stringify(materialNames)}`)
      assert.equal(materialNames.length, await groups.count())
      assert.ok(materialNames.every((name) => name.text.trim() && name.width > 0 && name.height > 0 && name.opacity === '1' && name.visibility === 'visible'), `选择对象后物料名称仍可读：${JSON.stringify(materialNames)}`)
      await owner.locator('.erp-bom-parts-scroll').evaluate((node) => { node.scrollLeft = 0; node.dispatchEvent(new Event('scroll', { bubbles: true })) })
      await page.screenshot({ path: `${deps.outputDir}/bom-toolbar-${variant}-selected.png` })
      await toolbar.getByRole('button', { name: '移除物料', exact: true }).click()
      await page.locator('.ant-popover:visible').getByRole('button', { name: '移除整组', exact: true }).click()
      await expect(groups).toHaveCount(2)
      await expect(toolbar.getByRole('status')).toHaveText('点击物料或部位后操作')
      assert.equal(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true)
      await originalMaterial.dispose()
      await positionNode.dispose()
    },
  }))
  return [...scenarios, {
    ...base,
    name: 'bom-toolbar-readonly',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await page.getByText('BOM-STYLE-L1', { exact: true }).dblclick()
      const editor = page.locator('.erp-bom-editor:visible')
      const owner = editor.locator('.erp-bom-material-groups')
      await owner.getByLabel('部位 1', { exact: true }).waitFor()
      assert.equal(await owner.locator('input[type="radio"]').count(), 0)
      assert.equal(await owner.locator('.erp-bom-selection-actions').count(), 0)
      assert.equal(await owner.locator('.erp-bom-parts-table > thead th').count(), 12)
      assert.equal(await owner.getByLabel('部位 1', { exact: true }).isDisabled(), true)
      await assertBOMEditorDensity(editor)
      await page.screenshot({ path: `${deps.outputDir}/bom-toolbar-readonly.png` })
    },
  }, {
    name: 'bom-toolbar-formal',
    path: '/__dev/ui-design',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('button', { name: /全屏预览/u }).click()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.locator('.nav-item[data-page="engineering-hub"]').click()
      await frame.locator('[data-action="new-record"]').click()
      const editor = frame.locator('.bom-form-view')
      const allRows = editor.locator('[data-bom-part]')
      if (!(await allRows.count())) await editor.getByRole('button', { name: '添加物料', exact: true }).click()
      const first = editor.locator('[data-bom-material-group]').first()
      const rows = first.locator('[data-bom-part]')
      const toolbar = editor.getByRole('group', { name: 'BOM 选中对象操作', exact: true })
      assert.equal((await editor.locator('thead th').allTextContents()).includes('操作'), false)
      const before = await rows.count()
      await first.locator('.bom-material-cell').nth(1).click()
      await toolbar.getByRole('button', { name: '添加部位', exact: true }).click()
      await expect(rows).toHaveCount(before + 1)
      const position = first.getByLabel('组装部位 1', { exact: true })
      const node = await position.elementHandle()
      await rows.first().locator('td:not(.bom-material-cell)').first().click()
      await position.fill('设计左耳')
      assert.equal(await position.evaluate((input, old) => input === old, node), true)
      assert.match(await toolbar.getByRole('status').innerText(), /设计左耳/u)
      const count = await allRows.count()
      await toolbar.getByRole('button', { name: '复制部位', exact: true }).click()
      await expect(allRows).toHaveCount(count + 1)
      assert.equal(await first.getByLabel('组装部位 2', { exact: true }).inputValue(), '设计左耳')
      await rows.nth(1).locator('td:not(.bom-material-cell)').first().click()
      await toolbar.getByRole('button', { name: '移除部位', exact: true }).click()
      await expect(allRows).toHaveCount(count)
      await first.locator('.bom-material-cell').nth(1).click()
      await toolbar.getByRole('button', { name: '移除物料', exact: true }).click()
      const confirm = frame.locator('.overlay .modal')
      await expect(confirm).toContainText(`及其 ${before + 1} 个部位`)
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(await allRows.count(), count)
      await page.screenshot({ path: `${deps.outputDir}/bom-toolbar-formal-selected.png` })
      await toolbar.getByRole('button', { name: '移除物料', exact: true }).click()
      await confirm.getByRole('button', { name: '移除整组', exact: true }).click()
      await expect(allRows).toHaveCount(count - before - 1)
      await node.dispose()
    },
  }]
}
