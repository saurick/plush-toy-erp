import { expect } from 'playwright/test'
import { businessSplitLayoutButton, collapseBusinessSplit } from './businessSplitActions.mjs'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { createBusinessSplitPerformanceScenarios } from './businessSplitPerformanceScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createBusinessSplitOverlayScenarios } from './businessSplitOverlayScenarios.mjs'
import { assertVisibleControlPlaceholdersFit } from './inputControlAssertions.mjs'
import { parseRgb } from './colorAssertions.mjs'

export function createBusinessSplitScenarios({ assert, customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir }) {
  const assertTitlePickerSpacing = async (pane) => {
    const titles = await pane.locator('h1 .erp-split-page-title:visible').evaluateAll((roots) => roots.map((root) => {
      const text = root.querySelector('.ant-select-selection-item, .ant-select-selection-placeholder')
      const arrow = root.querySelector('.ant-select-clear') || root.querySelector('.ant-select-arrow')
      const frame = root.querySelector('.ant-select-selector')
      const selector = frame.getBoundingClientRect()
      const frameStyle = getComputedStyle(frame)
      const input = root.querySelector('.ant-select-selection-search-input')
      const search = input.getBoundingClientRect()
      const textStyle = getComputedStyle(text); const
inputStyle = getComputedStyle(input)
      const range = document.createRange()
      range.selectNodeContents(text)
      const label = range.getBoundingClientRect()
      const icon = arrow.getBoundingClientRect()
      const help = root.closest('h1').parentElement.querySelector('.erp-business-page-help-trigger')?.getBoundingClientRect()
      return {
        title: text.textContent,
        outlined: root.classList.contains('ant-select-outlined'),
        borderStyle: frameStyle.borderInlineStartStyle,
        borderWidth: parseFloat(frameStyle.borderInlineStartWidth),
        borderColor: frameStyle.borderInlineStartColor,
        height: selector.height,
        standardHeight: parseFloat(getComputedStyle(root).getPropertyValue('--erp-form-control-height')),
        gap: icon.left - label.right,
        centerOffset: Math.abs(icon.top + icon.height / 2 - label.top - label.height / 2),
        textInset: label.left - selector.left,
        inputInset: search.left - selector.left,
        iconInset: selector.right - icon.right,
        inputIconGap: icon.left - search.right,
        textFontSize: textStyle.fontSize,
        inputFontSize: inputStyle.fontSize,
        textLineHeight: textStyle.lineHeight,
        inputLineHeight: inputStyle.lineHeight,
        textFontWeight: textStyle.fontWeight,
        inputFontWeight: inputStyle.fontWeight,
        helpGap: help ? help.left - selector.right : null,
        helpCenterOffset: help ? Math.abs(help.top + help.height / 2 - icon.top - icon.height / 2) : null,
      }
    }))
    assert.equal(titles.length, 1, '当前页面只有一个可见标题选页入口')
    for (const title of titles) {
      assert.equal(title.outlined, true, '页面选择使用项目标准有边框下拉框')
      const border = parseRgb(title.borderColor)
      assert.ok(title.borderStyle === 'solid' && title.borderWidth >= 1 && border?.[3] > 0, `未展开时也保留可见控件边框 ${JSON.stringify(title)}`)
      assert.ok(Math.abs(title.height - title.standardHeight) <= 1, `页面选择沿用标准控件高度 ${JSON.stringify(title)}`)
      assert.ok(title.gap >= 6, `页面文字不侵入下拉图标区域 ${JSON.stringify(title)}`)
      assert.ok(title.centerOffset <= 1, `标题与箭头垂直居中 ${JSON.stringify(title)}`)
      assert.ok(title.textInset >= 10 && title.inputInset >= 10 && title.iconInset >= 8, `文字、输入和图标使用标准内边距 ${JSON.stringify(title)}`)
      assert.ok(title.inputIconGap >= 6, `搜索输入不侵入图标区域 ${JSON.stringify(title)}`)
      assert.equal(title.inputFontSize, title.textFontSize, '标题与搜索输入字号一致')
      assert.equal(title.inputFontWeight, title.textFontWeight, '标题与搜索输入字重一致')
      if (title.helpGap !== null) {
        assert.ok(title.helpGap >= 8 && title.helpGap <= 14, `标题控件与帮助入口间距稳定 ${JSON.stringify(title)}`)
        assert.ok(title.helpCenterOffset <= 1, `箭头与帮助入口垂直居中 ${JSON.stringify(title)}`)
      }
    }
  }
  const assertEmptyTitlePicker = async (page, pane, name) => {
    const title = pane.locator('.erp-split-page-title:visible')
    const picker = pane.getByRole('combobox', { name: /^选择[左右]栏页面$/u })
    await expect(title.locator('.ant-select-selection-placeholder')).toBeVisible()
    await assertTitlePickerSpacing(pane)
    const initial = await title.boundingBox()
    await page.screenshot({ path: `${outputDir}/${name}-empty-default.png`, clip: { x: initial.x - 8, y: initial.y - 8, width: initial.width + 16, height: initial.height + 16 } })
    await title.locator('.ant-select-selector').click()
    await expect(picker).toBeFocused()
    await expect(picker).toHaveAttribute('aria-expanded', 'true')
    await assertTitlePickerSpacing(pane)
    await page.screenshot({ path: `${outputDir}/${name}-empty-focused.png`, clip: { x: initial.x - 8, y: initial.y - 8, width: initial.width + 16, height: initial.height + 16 } })
    for (const keyword of ['模板打印中心', '']) {
      await picker.fill(keyword)
      await expect(picker).toHaveValue(keyword)
      if (keyword) await expect(page.locator('.ant-select-dropdown:visible').getByText(keyword, { exact: true })).toBeVisible()
      await assertTitlePickerSpacing(pane)
      const current = await title.boundingBox()
      assert.ok(Math.abs(initial.width - current.width) <= 1 && Math.abs(initial.height - current.height) <= 1, '聚焦、输入和清空保持标题控件尺寸')
    }
    await picker.press('Escape')
    await expect(picker).toHaveAttribute('aria-expanded', 'false')
    await expect(title.locator('.ant-select-selection-placeholder')).toBeVisible()
    await assertTitlePickerSpacing(pane)
  }
  return [
    { name: 'business-split-title-fusion-spacing', path: '/erp/purchase/processing-contracts', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-title-fusion-custom-headers', path: '/erp/master/materials', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-title-fusion', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-title-fusion-dark', path: '/erp/purchase/material-bom', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'business-split-title-fusion-narrow', path: '/erp/purchase/material-bom', viewport: { width: 800, height: 700 } },
    { name: 'business-split-header-actions', path: '/erp/master/materials', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-header-actions-dark', path: '/erp/master/materials', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'business-split-header-actions-narrow', path: '/erp/master/materials', viewport: { width: 800, height: 900 } },
    { name: 'business-split-material-sync', path: '/erp/master/materials', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-bom-draft', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-bom-draft-dark', path: '/erp/purchase/material-bom', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'business-split-layout', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-linked-material', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-linked-material-sections', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, adminProfile: { erp_preferences: { appearance: { formDisplay: 'section' } } } },
    { name: 'business-split-linked-material-dark', path: '/erp/purchase/material-bom', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'business-split-linked-material-narrow', path: '/erp/purchase/material-bom', viewport: { width: 800, height: 700 } },
    { name: 'business-split-linked-material-stale', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 } },
    { name: 'business-split-linked-material-source-reset', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 } },
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
            const material = { ...params, id: 799 + writes.length, is_active: true }
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
        if (definition.name.startsWith('business-split-header-actions')) {
          const narrow = definition.viewport.width < 992
          const left = page.locator('.erp-split-pane--left')
          const right = page.locator('.erp-split-pane--right')
          const workspace = page.locator('.erp-split-workspace')
          const showRight = async () => { if (narrow) await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click() }
          const open = async () => {
            await page.getByRole('button', { name: '分栏', exact: true }).first().click()
            await showRight()
          }
          const chooseMaterial = async () => {
            const input = right.getByRole('combobox', { name: /^选择[左右]栏页面$/u })
            await input.click()
            await input.fill('材料档案')
            await page.locator('.ant-select-dropdown:visible').getByText('材料档案', { exact: true }).click()
            await right.getByRole('button', { name: '新建材料' }).waitFor()
          }
          const directClose = () => right.getByRole('button', { name: '收起分栏', exact: true })
          await page.getByRole('button', { name: '新建材料' }).waitFor()
          const main = await page.getByRole('button', { name: '新建材料' }).elementHandle()
          await open()
          await expect(directClose()).toBeVisible()
          await expect(right.locator('.erp-split-page-title:visible .ant-select-clear')).toHaveCount(0)
          if (narrow) {
            await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
            await left.getByRole('button', { name: '收起分栏', exact: true }).click()
          } else await directClose().click()
          await expect(workspace).toHaveAttribute('data-split-open', 'false')
          await open()
          await chooseMaterial()
          await expect(left.locator('.erp-split-page-title:visible .ant-select-clear')).toHaveCount(0)
          await expect(right.locator('.erp-split-page-title:visible .ant-select-clear')).toHaveCount(1)
          await right.getByRole('button', { name: '新建材料' }).click()
          const editor = right.locator('.erp-business-form-page:not([hidden])')
          const draft = '清空与收起验证草稿'
          await editor.getByLabel('名称', { exact: true }).fill(draft)
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          await right.getByText('有未保存的资料输入', { exact: true }).waitFor()
          await right.locator('.erp-split-page-title:visible .ant-select-clear').click()
          const confirmation = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
          await confirmation.waitFor()
          await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click()
          await expect(right.locator('.erp-split-page-title:visible .ant-select-selection-item')).toHaveText('材料档案')
          await expect(right.getByText('有未保存的资料输入', { exact: true })).toBeVisible()
          await directClose().click()
          await expect(workspace).toHaveAttribute('data-split-open', 'false')
          await expect(confirmation).not.toBeVisible()
          await open()
          await right.getByRole('button', { name: '继续编辑', exact: true }).click()
          await expect(editor.getByLabel('名称', { exact: true })).toHaveValue(draft)
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          await right.locator('.erp-split-page-title:visible .ant-select-clear').click()
          await confirmation.waitFor()
          await confirmation.getByRole('button', { name: '放弃修改', exact: true }).click()
          await expect(right.getByText('点击标题选择页面，或将左侧菜单拖到这里', { exact: true })).toBeVisible()
          await expect(workspace).toHaveAttribute('data-split-open', 'true')
          await expect(right.getByRole('combobox', { name: /^选择[左右]栏页面$/u })).toBeFocused()
          await expect(right.locator('.erp-split-page-title:visible .ant-select-clear')).toHaveCount(0)
          await expect(directClose()).toBeVisible()
          await chooseMaterial()
          if (!narrow) {
            await businessSplitLayoutButton(page).click()
            await page.getByRole('dialog', { name: '分栏布局设置', exact: true }).getByRole('button', { name: '左右互换', exact: true }).click()
            assert.ok((await right.boundingBox()).x < (await left.boundingBox()).x, '附加页与两种动作一起移到左侧')
          }
          const input = right.getByRole('combobox', { name: /^选择[左右]栏页面$/u })
          await input.fill('材料')
          await input.press('Delete')
          await expect(right.locator('.erp-split-page-title:visible .ant-select-selection-item')).toHaveText('材料档案')
          await input.fill('')
          await input.press('Escape')
          await input.press('Delete')
          await expect(right.getByText('点击标题选择页面，或将左侧菜单拖到这里', { exact: true })).toBeVisible()
          await directClose().click()
          await expect(workspace).toHaveAttribute('data-split-open', 'false')
          assert.equal(await main.evaluate((node) => node.isConnected), true, '清空和收起不重建主页面')
          assert.equal(writes.length, 0, '清空与收起不调用业务保存')
          await open()
          await chooseMaterial()
          await waitForFiniteAnimations(page)
          await assertTitlePickerSpacing(right)
          await assertNoHorizontalOverflow(page, definition.name)
          await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: false })
          await main.dispose()
          return
        }
        if (definition.name === 'business-split-title-fusion-spacing') {
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          const left = page.locator('.erp-split-pane--left')
          const right = page.locator('.erp-split-pane--right')
          await expect(left.getByRole('heading', { name: '委外订单', exact: true })).toBeVisible()
          await assertTitlePickerSpacing(left)
          await assertEmptyTitlePicker(page, right, definition.name)
          await right.locator('.erp-split-page-title .ant-select-selector').click()
          await right.getByRole('combobox', { name: '选择右栏页面', exact: true }).fill('物料清单')
          await page.locator('.ant-select-dropdown:visible').getByText('物料清单（BOM）', { exact: true }).click()
          await expect(right.getByRole('heading', { name: '物料清单（BOM）', exact: true })).toBeVisible()
          await assertTitlePickerSpacing(right)
          const titleRow = await left.locator('.erp-business-page-header-card__title-row').boundingBox()
          await page.screenshot({ path: `${outputDir}/${definition.name}-header.png`, clip: { x: titleRow.x - 8, y: titleRow.y - 8, width: titleRow.width + 16, height: titleRow.height + 16 } })
          const helpTrigger = left.getByRole('button', { name: '查看委外订单页面说明', exact: true })
          await helpTrigger.click()
          const help = page.getByRole('dialog', { name: '委外订单怎么用', exact: true })
          await expect(help).toBeVisible()
          await help.getByRole('button', { name: '我知道了', exact: true }).click()
          await expect(help).toBeHidden()
          await expect(helpTrigger).toBeFocused()
          await assertNoHorizontalOverflow(page, definition.name)
          await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
          return
        }
        if (definition.name === 'business-split-title-fusion-custom-headers') {
          await page.getByRole('button', { name: '新建材料' }).click()
          await expect(page.locator('.erp-business-form-page:not([hidden])')).toHaveAttribute('aria-busy', 'false')
          await page.getByLabel('名称', { exact: true }).fill('标题切页保留输入')
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          const left = page.locator('.erp-split-pane--left')
          const right = page.locator('.erp-split-pane--right')
          const name = await left.getByLabel('名称', { exact: true }).elementHandle()
          for (const label of ['模板打印中心', '帮助中心', '工作台']) {
            const picker = right.getByRole('combobox', { name: '选择右栏页面', exact: true })
            await right.locator('.erp-split-page-title:visible .ant-select-selector').click()
            await picker.fill(label)
            await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
            await right.getByRole('heading', { name: label, exact: true }).waitFor()
            assert.equal(await right.locator('.erp-split-page-title:visible').count(), 1, `${label} 只在已有标题中提供选页`)
            await expect(left.getByLabel('名称', { exact: true })).toHaveValue('标题切页保留输入')
          }
          assert.equal(await left.getByLabel('名称', { exact: true }).evaluate((node, original) => node === original, name), true, '跨模块选页保留主栏表单实例')
          await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
          await name.dispose()
          return
        }
        if (definition.name.startsWith('business-split-title-fusion')) {
          const narrow = definition.viewport.width < 992
          const left = page.locator('.erp-split-pane--left')
          const right = page.locator('.erp-split-pane--right')
          const picker = (pane) => pane.getByRole('combobox', { name: /^选择[左右]栏页面$/u })
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          if (narrow) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          assert.equal(await page.locator('.erp-split-workspace__toolbar, .erp-split-pane__header').count(), 0, '分栏不再另占工作区和左右栏说明行')
          await expect(left.getByRole('heading', { name: '物料清单（BOM）', exact: true })).toBeVisible()
          await assertTitlePickerSpacing(left)
          const moduleTabs = left.locator('.erp-business-module-tabs')
          assert.equal(await moduleTabs.count(), 1, '保留模块导航实例')
          await expect(moduleTabs).toBeHidden()
          if (narrow) await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
          await assertEmptyTitlePicker(page, right, definition.name)
          await picker(right).click()
          await picker(right).fill('材料档案')
          await page.locator('.ant-select-dropdown:visible').getByText('材料档案', { exact: true }).click()
          await right.getByRole('button', { name: '新建材料' }).waitFor()
          await assertTitlePickerSpacing(right)
          if (narrow) {
            await businessSplitLayoutButton(page).click()
            await page.getByRole('button', { name: '左右互换', exact: true }).waitFor()
            await businessSplitLayoutButton(page).click()
            await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          }
          await left.getByRole('button', { name: '新建 BOM' }).click()
          const editor = left.locator('.erp-business-form-page:not([hidden])')
          await expect(editor).toHaveAttribute('aria-busy', 'false')
          await expect(editor.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled()
          await editor.getByLabel('订单数量', { exact: true }).fill('3030')
          await expect(editor.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          const quantity = await editor.getByLabel('订单数量', { exact: true }).elementHandle()
          await expect(left.locator('.erp-business-module-header')).toBeHidden()
          await expect(editor.getByRole('heading', { name: '新建 BOM 草稿', exact: true })).toBeVisible()
          await expect(picker(left)).toBeVisible()
          await assertTitlePickerSpacing(left)
          const geometry = await left.evaluate((pane) => {
            const editor = pane.querySelector('.erp-business-form-page:not([hidden])')
            const p = pane.getBoundingClientRect(); const
e = editor.getBoundingClientRect()
            const style = getComputedStyle(pane)
            return { paneTop: p.top, editorTop: e.top, topPadding: parseFloat(style.paddingTop), gap: e.top - p.top, headings: [...pane.querySelectorAll('h1')].filter((node) => node.getClientRects().length).length }
          })
          assert.ok(geometry.gap <= geometry.topPadding + 3, `编辑器上方没有重复模块栏头 ${JSON.stringify(geometry)}`)
          assert.equal(geometry.headings, 1, '编辑中只显示一个主标题')
          const reads = materialReads
          await businessSplitLayoutButton(page).click()
          await page.getByRole('button', { name: '左右互换', exact: true }).click()
          await expect(editor.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          await collapseBusinessSplit(page)
          await expect(editor.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          if (narrow) await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
          await expect(editor.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          assert.equal(await editor.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, quantity), true, '栏头融合、互换和收起不重建业务输入')
          assert.equal(materialReads, reads, '布局变化不重新读取物料列表')
          if (narrow) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await right.locator('.erp-split-page-title:visible .ant-select-clear').click()
          if (narrow) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await assertTitlePickerSpacing(right)
          await picker(right).click()
          await picker(right).fill('工作台')
          await page.locator('.ant-select-dropdown:visible').getByText('工作台', { exact: true }).click()
          await right.getByRole('heading', { name: '工作台', exact: true }).waitFor()
          if (narrow) await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
          await expect(editor.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
          await quantity.dispose()
          await assertNoHorizontalOverflow(page, definition.name)
          return
        }
        const layout = definition.name === 'business-split-layout'
        const linked = definition.name.startsWith('business-split-linked-material')
        const sectionDisplay = definition.name.endsWith('-sections')
        const draft = definition.name.startsWith('business-split-bom-draft') || layout || linked
        if (draft) {
          await page.getByRole('button', { name: '新建 BOM' }).click()
          await page.locator('.erp-business-form-page:not([hidden])').waitFor()
          await page.getByLabel('订单数量', { exact: true }).fill('3030')
          if (sectionDisplay) await page.getByRole('tab', { name: '材料分析明细表', exact: true }).click()
          await page.locator('.erp-business-form-page:not([hidden])').getByRole('button', { name: '添加物料' }).click()
        }
        if (linked) {
          const left = page.locator('.erp-split-pane--left')
          const right = page.locator('.erp-split-pane--right')
          const quantity = await left.getByLabel('订单数量', { exact: true }).elementHandle()
          await left.getByLabel('单位用量 1', { exact: true }).fill('0.125')
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          if (definition.viewport.width < 992) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await left.getByRole('button', { name: '新建物料', exact: true }).click()
          const editor = right.locator('.erp-business-form-page:not([hidden])')
          const assertEditorHeight = async () => expect.poll(() => editor.evaluate((node) => {
            const pane = node.closest('.erp-split-pane')
            const box = pane.getBoundingClientRect()
            const style = getComputedStyle(pane)
            const expectedBottom = box.bottom - Number.parseFloat(style.paddingBottom) - Number.parseFloat(style.borderBottomWidth)
            return Math.abs(node.getBoundingClientRect().bottom - expectedBottom)
          }), { message: '材料编辑页应占满所属栏，底部操作固定在栏内底部' }).toBeLessThanOrEqual(2)
          await editor.waitFor()
          await assertEditorHeight()
          await expect(editor.getByText('用于当前 BOM 物料组，保存后自动选回。', { exact: true })).toBeVisible()
          assert.equal(await page.getByRole('dialog').count(), 0, 'BOM 补建直接复用另一栏的材料编辑页')
          await expect(editor).toHaveAttribute('data-unsaved', 'false')
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          await expect(right.getByText('有未保存的资料输入', { exact: true })).toHaveCount(0)
          if (definition.viewport.width < 992) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await left.getByRole('button', { name: '新建物料', exact: true }).click()
          await editor.waitFor()
          const newName = '关联补建测试面料'
          if (sectionDisplay) await editor.getByRole('tab', { name: '基本资料', exact: true }).click()
          await editor.getByLabel('名称', { exact: true }).fill(newName)
          if (sectionDisplay) await editor.getByRole('tab', { name: '采购与库存', exact: true }).click()
          await editor.getByLabel('库存类别', { exact: true }).click()
          await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
          if (definition.name.endsWith('-source-reset')) {
            await left.getByRole('button', { name: '返回列表', exact: true }).click()
            await page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' }).getByRole('button', { name: '放弃修改', exact: true }).click()
            await expect(editor.getByRole('button', { name: '保存并使用', exact: true })).toHaveCount(0)
            await left.getByRole('button', { name: '新建 BOM' }).click()
            await left.getByRole('button', { name: '添加物料', exact: true }).click()
            await editor.getByRole('button', { name: '保存', exact: true }).click()
            await expect(editor).toBeHidden()
            assert.equal(writes.length, 1, '原单关闭后材料仍可独立保存')
            await expect(left.locator('.erp-bom-material-reference .ant-select-selection-item')).toHaveCount(0)
            await quantity.dispose()
            return
          }
          if (definition.name.endsWith('-stale')) {
            const choose = left.getByRole('combobox', { name: '物料名称 1', exact: true })
            await choose.click()
            await choose.fill('样式材料')
            await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'MAT-STYLE-L1' }).click()
            await editor.getByRole('button', { name: '保存并使用', exact: true }).click()
            await editor.getByText('原 BOM 物料组已变化，请返回物料组重新发起新建', { exact: true }).waitFor()
            assert.equal(writes.length, 0, '来源物料组改变后不能旁路新建或错组回填')
            await expect(left.locator('.erp-bom-material-reference .ant-select-selection-item').first()).toContainText('样式材料')
            await quantity.dispose()
            return
          }
          const materialName = await editor.getByLabel('名称', { exact: true }).elementHandle()
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          await expect(editor).toBeHidden()
          await expect(right.getByText('有未保存的资料输入', { exact: true })).toBeVisible()
          assert.equal(await page.getByRole('dialog').count(), 0, '返回列表保留输入，不要求先放弃')
          await right.getByRole('button', { name: '继续编辑', exact: true }).click()
          await assertEditorHeight()
          await expect(editor.getByLabel('名称', { exact: true })).toHaveValue(newName)
          assert.equal(await editor.getByLabel('名称', { exact: true }).evaluate((node, original) => node === original, materialName), true, '返回与恢复沿用同一份表单')
          const layoutButton = businessSplitLayoutButton(page)
          await collapseBusinessSplit(page)
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          await expect(editor.getByLabel('名称', { exact: true })).toHaveValue(newName)
          await layoutButton.click()
          await page.getByRole('button', { name: '左右互换', exact: true }).click()
          await assertEditorHeight()
          await editor.getByRole('button', { name: '保存并使用', exact: true }).click()
          await expect(editor).toBeHidden()
          assert.equal(writes.length, 1)
          await expect(left.locator('.erp-bom-material-reference .ant-select-selection-item').first()).toContainText(newName)
          await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          await expect(left.getByLabel('单位用量 1', { exact: true })).toHaveValue('0.125')
          assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, quantity), true, '关联建档不重建 BOM 编辑器')
          if (definition.viewport.width < 992) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await right.getByRole('button', { name: '新建材料' }).click()
          if (sectionDisplay) await editor.getByRole('tab', { name: '基本资料', exact: true }).click()
          await editor.getByLabel('名称', { exact: true }).fill('独立建档测试面料')
          if (sectionDisplay) await editor.getByRole('tab', { name: '采购与库存', exact: true }).click()
          await editor.getByLabel('库存类别', { exact: true }).click()
          await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
          await editor.getByRole('button', { name: '保存', exact: true }).click()
          await expect(editor).toBeHidden()
          assert.equal(writes.length, 2)
          await expect(left.locator('.erp-bom-material-reference .ant-select-selection-item').first()).toContainText(newName)
          await assertNoHorizontalOverflow(page, definition.name)
          await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
          await materialName.dispose()
          await quantity.dispose()
          return
        }
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        const left = page.locator('.erp-split-pane--left')
        const right = page.locator('.erp-split-pane--right')
        await right.waitFor()
        if (layout) {
          await businessSplitLayoutButton(page).click()
          await expect(page.getByRole('button', { name: '左右互换' })).toBeDisabled()
          await businessSplitLayoutButton(page).click()
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
          const originalHeader = await left.locator('.erp-business-form-page__header').elementHandle()
          const attachedHeader = await right.locator('.erp-business-form-page__header').elementHandle()
          await page.waitForLoadState('networkidle')
          const beforeLayoutReads = materialReads
          await businessSplitLayoutButton(page).click()
          await page.getByRole('spinbutton', { name: '左栏宽度百分比' }).fill('60')
          const originalBounds = await left.boundingBox()
          await page.getByRole('button', { name: '左右互换' }).click()
          await expect(right).toHaveAttribute('aria-label', '左栏页面')
          await expect(left).toHaveAttribute('aria-label', '右栏页面')
          assert.equal(await left.locator('.erp-business-form-page__header').evaluate((node, original) => node === original, originalHeader), true, '原页面操作栏随页面互换并保留实例')
          assert.equal(await right.locator('.erp-business-form-page__header').evaluate((node, original) => node === original, attachedHeader), true, '附加页选择器随页面互换并保留实例')
          await businessSplitLayoutButton(page).click()
          await expect(page.getByRole('spinbutton', { name: '左栏宽度百分比' })).toHaveValue('60')
          await businessSplitLayoutButton(page).click()
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
          await businessSplitLayoutButton(page).click()
          const widthInput = page.getByRole('spinbutton', { name: '左栏宽度百分比' })
          await expect(widthInput).toHaveValue('68')
          await widthInput.fill('')
          await widthInput.pressSequentially('6')
          await expect(widthInput).toHaveValue('6')
          await widthInput.pressSequentially('0')
          await expect(widthInput).toHaveValue('60')
          await widthInput.press('Enter')
          await expect.poll(async () => (await right.boundingBox()).width / (await panels.boundingBox()).width).toBeCloseTo(0.6, 2)
          await widthInput.fill('90')
          await widthInput.blur()
          await expect(widthInput).toHaveValue('68')
          await widthInput.fill('50')
          await waitForFiniteAnimations(page)
          const popupBounds = await page.locator('.ant-popover:visible').boundingBox()
          const layoutBounds = await businessSplitLayoutButton(page).boundingBox()
          assert.ok(Math.abs(popupBounds.x + popupBounds.width - layoutBounds.x - layoutBounds.width) <= 4, '改宽度后布局浮层继续与工作区按钮右侧对齐')
          await page.screenshot({ path: `${outputDir}/business-split-swap-layout.png`, fullPage: true })
          await page.locator('.ant-popover:visible').screenshot({ path: `${outputDir}/business-split-layout-menu.png` })
          await businessSplitLayoutButton(page).click()
          assert.equal(materialReads, beforeLayoutReads, '互换和调整宽度不重新读取业务资料')
          await originalHeader.dispose()
          await attachedHeader.dispose()
        }
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        assert.equal(writes.length, 1)
        if (draft) {
          const header = left.locator('.erp-business-form-page:not([hidden]) > .erp-business-form-page__header')
          const hint = header.locator('.erp-page-actions__refresh-hint')
          const refresh = header.getByRole('button', { name: '刷新当前页', exact: true })
          await expect(hint).toHaveText('相关资料有变动，返回列表后更新。')
          await expect(refresh).toBeVisible()
          await expect(left.locator(':scope > .ant-alert')).toHaveCount(0)
          await expect(right.locator('.erp-page-actions__refresh-hint')).toHaveCount(0)
          const hintBounds = await hint.boundingBox()
          const refreshBounds = await refresh.boundingBox()
          const hintLineHeight = await hint.evaluate((node) => Number.parseFloat(getComputedStyle(node).lineHeight))
          assert.ok(hintBounds.height <= hintLineHeight + 1, '桌面待更新提示只占一行')
          assert.ok(Math.abs(hintBounds.y + hintBounds.height / 2 - refreshBounds.y - refreshBounds.height / 2) <= 1, '轻提示与刷新按钮垂直居中')
          assert.ok(Math.abs(hintBounds.x - refreshBounds.x - refreshBounds.width - 8) <= 1, '轻提示紧邻刷新按钮')
          await header.screenshot({ path: `${outputDir}/${definition.name}-refresh-hint-detail.png` })
          await refresh.click()
          const confirmation = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
          await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click()
          await confirmation.waitFor({ state: 'hidden' })
          await expect(hint).toBeVisible()
          await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, leftDraft), true)
          const choose = left.getByRole('combobox', { name: '物料名称 1', exact: true })
          await choose.fill(newName)
          await page.locator('.ant-select-dropdown:visible').getByText(newName).waitFor()
          await choose.press('Escape')
          if (!layout) {
            await page.screenshot({ path: `${outputDir}/${definition.name}-refresh-hint.png`, fullPage: false })
            await page.setViewportSize({ width: 800, height: 900 })
            await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
            await expect(hint).toBeVisible()
            await expect(refresh).toBeVisible()
            await assertNoHorizontalOverflow(page, `${definition.name}-refresh-hint-narrow`)
            await assertVisibleControlPlaceholdersFit(page, `${definition.name}-refresh-hint-narrow`)
            await page.screenshot({ path: `${outputDir}/${definition.name}-refresh-hint-narrow.png`, fullPage: true })
            await page.setViewportSize(definition.viewport)
          }
        } else {
          if (definition.viewport.width < 992) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await left.getByText(newName).waitFor()
        }
        await assertNoHorizontalOverflow(page, definition.name)
        if (layout) {
          await page.screenshot({ path: `${outputDir}/business-split-swapped.png`, fullPage: true })
          await collapseBusinessSplit(page)
          await page.getByRole('button', { name: '分栏', exact: true }).first().click()
          assert.ok((await right.boundingBox()).x < (await left.boundingBox()).x, '收起再打开保留互换位置')
          await page.setViewportSize({ width: 800, height: 900 })
          await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
          await expect(left.getByLabel('订单数量', { exact: true })).toBeVisible()
          await businessSplitLayoutButton(page).click()
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
          await businessSplitLayoutButton(page).click()
          await page.getByRole('spinbutton', { name: '左栏宽度百分比' }).fill('50')
          await businessSplitLayoutButton(page).click()
        }
        await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
        await leftDraft?.dispose()
        await materialName?.dispose()
      },
    }
  }).concat(createBusinessSplitPerformanceScenarios({ assert, customerRuntimeEffectiveSession, outputDir }), createBusinessSplitOverlayScenarios({ assert, customerRuntimeEffectiveSession, outputDir, assertNoHorizontalOverflow }))
}
