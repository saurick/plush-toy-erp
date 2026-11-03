import { expect } from 'playwright/test'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { createBusinessSplitPerformanceScenarios } from './businessSplitPerformanceScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createBusinessSplitOverlayScenarios } from './businessSplitOverlayScenarios.mjs'

export function createBusinessSplitScenarios({ assert, customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir }) {
  return [
    { name: 'business-split-material-sync', path: '/erp/master/materials', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-bom-draft', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-layout', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-material-dark', path: '/erp/master/materials', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'business-split-material-narrow', path: '/erp/master/materials', viewport: { width: 800, height: 900 } },
  ].map((definition) => {
    const writes = []
    let materialReads = 0
    return {
      ...definition,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      beforeNavigate: async (page) => {
        writes.length = 0
        materialReads = 0
        const records = await installBOMMaterialMatchingMocks(page)
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_material' || method === 'list_materials') materialReads += 1
          let data
          if (method === 'create_material') {
            writes.push(params)
            const material = { ...params, id: 800, is_active: true }
            records.push(material)
            data = { material }
          } else if (method === 'get_material') data = { material: records.find((row) => row.id === params.id) }
          else if (method === 'list_materials') {
            const keyword = String(params.keyword || '').toLowerCase()
            data = stylePaginatedRpcData(records.filter((row) => (!params.active_only || row.is_active) && (!keyword || Object.values(row).join(' ').toLowerCase().includes(keyword))), 'materials', params)
          } else return route.fallback()
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: styleRpcResult(data) }) })
        })
      },
      verify: async (page) => {
        const layout = definition.name === 'business-split-layout'
        const draft = definition.name === 'business-split-bom-draft' || layout
        if (draft) {
          await page.getByRole('button', { name: '新建 BOM' }).click()
          await page.locator('.erp-business-form-page:not([hidden])').waitFor()
          await page.getByLabel('订单数量', { exact: true }).fill('3030')
          await page.locator('.erp-business-form-page:not([hidden])').getByRole('button', { name: '添加物料' }).click()
        }
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        const left = page.locator('.erp-split-pane--left')
        const right = page.locator('.erp-split-pane--right')
        await right.waitFor()
        if (layout) {
          await left.getByRole('button', { name: '布局', exact: true }).click()
          await expect(page.getByRole('button', { name: '左右互换' })).toBeDisabled()
          await left.getByRole('button', { name: '布局', exact: true }).click()
        }
        const pagePicker = right.getByRole('combobox', { name: '选择右栏页面' })
        await pagePicker.click()
        const pageChoices = page.locator('.ant-select-dropdown:visible')
        await pageChoices.getByText('工作中心', { exact: true }).waitFor()
        if (layout) {
          await waitForFiniteAnimations(page)
          await page.screenshot({ path: `${outputDir}/business-split-page-groups.png`, fullPage: true })
          await pageChoices.screenshot({ path: `${outputDir}/business-split-page-groups-detail.png` })
        }
        await pagePicker.fill('材料档案')
        await pageChoices.getByText('基础资料', { exact: true }).waitFor()
        assert.equal(await pageChoices.getByText('工作中心', { exact: true }).count(), 0, '搜索过滤不匹配的分组')
        await page.locator('.ant-select-dropdown:visible').getByText('材料档案', { exact: true }).click()
        await right.getByRole('button', { name: '新建材料' }).waitFor()
        assert.equal(new URL(page.url()).pathname, definition.path, '右栏切页必须保留左栏路由')
        const leftDraft = draft ? await left.getByLabel('订单数量', { exact: true }).elementHandle() : null
        await right.getByRole('button', { name: '新建材料' }).click()
        const editor = right.locator('.erp-business-form-page:not([hidden])')
        await editor.waitFor()
        const newName = '分栏新增面料'
        await editor.getByLabel('名称', { exact: true }).fill(newName)
        await editor.getByLabel('库存类别', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
        const materialName = layout ? await editor.getByLabel('名称', { exact: true }).elementHandle() : null
        if (layout) {
          const originalHeader = await left.locator('.erp-split-pane__header').elementHandle()
          const attachedHeader = await right.locator('.erp-split-pane__header').elementHandle()
          await page.waitForLoadState('networkidle')
          const beforeLayoutReads = materialReads
          await left.getByRole('button', { name: '布局', exact: true }).click()
          await page.getByRole('spinbutton', { name: '左栏宽度百分比' }).fill('60')
          const originalBounds = await left.boundingBox()
          await page.getByRole('button', { name: '左右互换' }).click()
          await expect(right).toHaveAttribute('aria-label', '左栏页面')
          await expect(left).toHaveAttribute('aria-label', '右栏页面')
          assert.equal(await left.locator('.erp-split-pane__header').evaluate((node, original) => node === original, originalHeader), true, '原页面操作栏随页面互换并保留实例')
          assert.equal(await right.locator('.erp-split-pane__header').evaluate((node, original) => node === original, attachedHeader), true, '附加页选择器随页面互换并保留实例')
          await left.getByRole('button', { name: '布局', exact: true }).click()
          await expect(page.getByRole('spinbutton', { name: '右栏宽度百分比' })).toHaveValue('40')
          await left.getByRole('button', { name: '布局', exact: true }).click()
          const bounds = await right.boundingBox()
          assert.ok(bounds.x < (await left.boundingBox()).x, '附加页实际移动到左侧')
          assert.ok(Math.abs(bounds.width - originalBounds.width) <= 2, '互换保留左侧宽度比例')
          assert.equal(await editor.getByLabel('名称', { exact: true }).evaluate((node, original) => node === original, materialName), true)
          assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, leftDraft), true)
          await expect(editor.getByLabel('名称', { exact: true })).toHaveValue(newName)
          assert.equal(await editor.getByLabel('名称', { exact: true }).evaluate((node) => getComputedStyle(node).direction), 'ltr', '互换不改变页内文字方向')
          const panels = page.locator('.erp-split-panels')
          const resize = async (direction) => {
            const box = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-dragger').boundingBox()
            const total = await panels.boundingBox()
            const before = await right.boundingBox()
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            await page.mouse.down()
            await page.mouse.move(direction < 0 ? total.x + 5 : total.x + total.width - 5, box.y + box.height / 2, { steps: 8 })
            assert.ok(Math.abs((await right.boundingBox()).width - before.width) < 2, '互换后拖动期间不重排长表')
            await expect.poll(async () => {
              const preview = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-preview').boundingBox()
              return (preview.x + preview.width / 2 - total.x) / total.width
            }).toBeCloseTo(direction < 0 ? 0.32 : 0.68, 2)
            await page.mouse.up()
            return (await right.boundingBox()).width / total.width
          }
          assert.ok(Math.abs(await resize(-1) - 0.32) < 0.01, '互换后向左拖到 32% 下限')
          assert.ok(Math.abs(await resize(1) - 0.68) < 0.01, '互换后可以从下限向右拖到 68% 上限')
          await left.getByRole('button', { name: '布局', exact: true }).click()
          const widthInput = page.getByRole('spinbutton', { name: '右栏宽度百分比' })
          await expect(widthInput).toHaveValue('32')
          await widthInput.fill('')
          await widthInput.pressSequentially('6')
          await expect(widthInput).toHaveValue('6')
          await widthInput.pressSequentially('0')
          await expect(widthInput).toHaveValue('60')
          await widthInput.press('Enter')
          await expect.poll(async () => (await left.boundingBox()).width / (await panels.boundingBox()).width).toBeCloseTo(0.6, 2)
          await widthInput.fill('90')
          await widthInput.blur()
          await expect(widthInput).toHaveValue('68')
          await widthInput.fill('50')
          await waitForFiniteAnimations(page)
          const popupBounds = await page.locator('.ant-popover:visible').boundingBox()
          const layoutBounds = await left.getByRole('button', { name: '布局', exact: true }).boundingBox()
          assert.ok(Math.abs(popupBounds.x + popupBounds.width / 2 - layoutBounds.x - layoutBounds.width / 2) <= 4, '改宽度后布局浮层继续对齐原按钮')
          await page.screenshot({ path: `${outputDir}/business-split-swap-layout.png`, fullPage: true })
          await page.locator('.ant-popover:visible').screenshot({ path: `${outputDir}/business-split-layout-menu.png` })
          await left.getByRole('button', { name: '布局', exact: true }).click()
          assert.equal(materialReads, beforeLayoutReads, '互换和调整宽度不重新读取业务资料')
          await originalHeader.dispose()
          await attachedHeader.dispose()
        }
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        assert.equal(writes.length, 1)
        if (draft) {
          await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, leftDraft), true)
          const choose = left.getByRole('combobox', { name: '物料名称 1', exact: true })
          await choose.fill(newName)
          await page.locator('.ant-select-dropdown:visible').getByText(newName).waitFor()
          await choose.press('Escape')
        } else {
          if (definition.viewport.width < 992) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await left.getByText(newName).waitFor()
        }
        await assertNoHorizontalOverflow(page, definition.name)
        if (layout) {
          await page.screenshot({ path: `${outputDir}/business-split-swapped.png`, fullPage: true })
          await right.getByRole('button', { name: '收起分栏', exact: true }).first().click()
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          assert.ok((await right.boundingBox()).x < (await left.boundingBox()).x, '收起再打开保留互换位置')
          await page.setViewportSize({ width: 800, height: 900 })
          await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
          await expect(left.getByLabel('订单数量', { exact: true })).toBeVisible()
          await left.getByRole('button', { name: '布局', exact: true }).click()
          await page.getByRole('button', { name: '左右互换' }).click()
          await expect(left).toHaveAttribute('aria-label', '左栏页面')
          await expect(left.getByLabel('订单数量', { exact: true })).toBeVisible()
          assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, leftDraft), true)
          assert.equal(writes.length, 1, '互换、拖动和窄屏恢复不重复保存')
          await page.setViewportSize(definition.viewport)
          await expect(right).toBeVisible()
          const separator = await page.locator('.erp-split-panels > .ant-splitter-bar .ant-splitter-bar-dragger').boundingBox()
          const beforeResize = await left.boundingBox()
          await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2)
          await page.mouse.down()
          await page.mouse.move(separator.x + 100, separator.y + separator.height / 2, { steps: 5 })
          assert.ok(Math.abs((await left.boundingBox()).width - beforeResize.width) < 2, '两种排列均由预览线跟手，放手后更新页面')
          await page.mouse.up()
          await expect.poll(async () => (await left.boundingBox()).width - beforeResize.width).toBeGreaterThan(80)
          await left.getByRole('button', { name: '布局', exact: true }).click()
          await page.getByRole('spinbutton', { name: '左栏宽度百分比' }).fill('50')
          await left.getByRole('button', { name: '布局', exact: true }).click()
        }
        await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
        await leftDraft?.dispose()
        await materialName?.dispose()
      },
    }
  }).concat(createBusinessSplitPerformanceScenarios({ assert, customerRuntimeEffectiveSession, outputDir }), createBusinessSplitOverlayScenarios({ assert, customerRuntimeEffectiveSession, outputDir, assertNoHorizontalOverflow }))
}
