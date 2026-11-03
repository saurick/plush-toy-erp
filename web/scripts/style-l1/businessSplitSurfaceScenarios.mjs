import { expect } from 'playwright/test'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createBusinessSplitSurfaceScenarios(existing, { assert, customerRuntimeEffectiveSession, outputDir }) {
  const shared = { auth: 'admin', effectiveSession: customerRuntimeEffectiveSession, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
  const within = async (pane, popup, label) => {
    await popup.waitFor()
    await waitForFiniteAnimations(pane.page())
    const a = await pane.boundingBox()
    const b = await popup.boundingBox()
    assert.ok(a && b && b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.width <= a.x + a.width + 1 && b.y + b.height <= a.y + a.height + 1, `${label}: ${JSON.stringify({ pane: a, popup: b })}`)
  }
  const open = async (page, title) => {
    page.setDefaultTimeout(12000)
    await page.getByRole('button', { name: '分栏', exact: true }).first().click()
    const left = page.locator('.erp-split-pane--left')
    const right = page.locator('.erp-split-pane--right')
    const picker = right.getByRole('combobox', { name: '选择右栏页面' })
    await picker.click()
    await picker.fill(title)
    await page.locator('.ant-select-dropdown:visible').getByText(title, { exact: true }).click()
    return { left, right, picker }
  }
  const source = existing.find((scenario) => scenario.name === 'sales-order-attachment-read-recovery')
  return [
    ...['light', 'dark'].map((themeMode) => ({
      ...shared,
themeMode,
name: `business-split-control-surfaces-${themeMode}`,
path: '/erp/sales/project-orders/sales-orders',
      beforeNavigate: installBOMMaterialMatchingMocks,
      verify: async (page) => {
        const { left, right } = await open(page, '材料档案')
        await right.getByRole('button', { name: /新建材料$/u }).waitFor()
        const hint = right.locator('.erp-business-action-tooltip-anchor[aria-disabled="true"]').first()
        await hint.hover()
        await within(right, page.locator('.ant-tooltip:visible'), '禁用动作说明')
        await right.getByRole('radio').first().check()
        const disable = right.getByRole('button', { name: /停用$/u })
        if (!await disable.isVisible()) {
          await right.getByRole('button', { name: /^更多操作/u }).click()
          await within(right, page.locator('.ant-dropdown:visible'), '操作菜单')
        }
        await disable.click()
        const confirm = page.locator('.ant-popconfirm:visible')
        await within(right, confirm, '停用确认')
        await confirm.getByRole('button', { name: '取消', exact: true }).click()
        await left.getByRole('button', { name: /新建订单$/u }).click()
        const editor = left.locator('.erp-business-form-page:not([hidden])')
        await page.setViewportSize({ width: 1024, height: 900 })
        await left.getByRole('button', { name: '布局', exact: true }).click()
        await page.getByRole('spinbutton', { name: '左栏宽度百分比' }).fill('32')
        await page.keyboard.press('Escape')
        await within(left, editor.locator('.erp-business-form-page__display-control'), '最窄栏的显示切换')
        await within(left, editor.locator('.erp-business-form-page__actions'), '最窄栏的保存操作')
        await expect(editor.getByRole('button', { name: '保存草稿', exact: true })).toBeInViewport()
        await editor.getByLabel('下单日期', { exact: true }).click()
        const calendar = page.locator('.ant-picker-dropdown:visible')
        await within(left, calendar, '日期选择')
        const day = calendar.locator('.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)').last()
        const date = await day.getAttribute('title')
        await day.click()
        await expect(editor.getByLabel('下单日期', { exact: true })).toHaveValue(date.replaceAll('-', '/'))
        await page.keyboard.press('Escape')
        const country = editor.getByLabel('国家 / 地区', { exact: true })
        await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '国家 / 地区', exact: true }) }).locator('.ant-select-selector').click()
        await country.fill('中国')
        await within(left, page.locator('.ant-select-dropdown:visible'), '国家选择')
        await page.locator('.ant-select-dropdown:visible').getByText('中国大陆', { exact: true }).click()
        await editor.locator('.ant-cascader').locator('.ant-select-selector').click()
        const regions = page.locator('.ant-cascader-dropdown:visible')
        await regions.getByText('广东省', { exact: true }).click()
        await regions.getByText('广州市', { exact: true }).click()
        await within(left, regions, '省市区级联选择')
        await regions.getByText('荔湾区', { exact: true }).click()
        await expect(editor.locator('.ant-cascader')).toContainText('荔湾区')
        await regions.waitFor({ state: 'hidden' })
        await page.keyboard.press('Escape')
        await right.getByRole('button', { name: /新建材料$/u }).click()
        const color = right.locator('.erp-material-color-suggested-input input')
        await color.focus()
        await within(right, page.locator('.erp-material-color-suggested-input__popup:visible'), '颜色输入建议')
        await page.keyboard.press('Escape')
        await page.screenshot({ path: `${outputDir}/business-split-control-surfaces-${themeMode}.png`, fullPage: true })
      },
    })),
    {
      ...shared,
name: 'business-split-permission-fullscreen',
path: '/erp/master/materials',
beforeNavigate: installBOMMaterialMatchingMocks,
      verify: async (page) => {
        const { left, right } = await open(page, '权限管理')
        await right.locator('.erp-role-template-card').filter({ hasText: '财务' }).click()
        const details = right.getByRole('button', { name: '查看功能明细', exact: true })
        if (await details.count()) await details.click()
        await right.getByRole('button', { name: '全屏编辑', exact: true }).click()
        const panel = right.getByRole('dialog', { name: '财务岗位设置', exact: true })
        await within(right, panel, '岗位设置全屏范围')
        await expect(panel).toHaveAttribute('aria-modal', 'false')
        await expect(left).not.toHaveAttribute('inert', '')
        await left.getByRole('button', { name: /新建材料$/u }).click()
        await left.getByLabel('名称', { exact: true }).fill('另一栏未保存的内容')
        await page.keyboard.press('Escape')
        await expect(panel).toBeVisible()
        assert.equal(await page.locator('body').evaluate((node) => node.style.overflow), '')
        const identity = await panel.elementHandle()
        await left.getByRole('button', { name: '布局', exact: true }).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        await within(right, panel, '互换后的岗位设置')
        assert.equal(await panel.evaluate((node, original) => node === original, identity), true)
        await left.getByRole('button', { name: '收起分栏', exact: true }).first().click()
        await expect(panel).toBeHidden()
        assert.equal(await page.locator('body').evaluate((node) => node.style.overflow), '')
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        await within(right, panel, '恢复后的岗位设置')
        await page.screenshot({ path: `${outputDir}/business-split-permission-fullscreen-both-active.png`, fullPage: true })
        await panel.getByRole('button', { name: '退出全屏', exact: true }).click()
        await expect(left.getByLabel('名称', { exact: true })).toHaveValue('另一栏未保存的内容')
        await identity.dispose()
      },
    },
    {
      ...shared,
name: 'business-split-help-fullscreen',
path: '/erp/help-center?role=warehouse&scene=finished-goods',
beforeNavigate: installBOMMaterialMatchingMocks,
      verify: async (page) => {
        const { left, right } = await open(page, '材料档案')
        const graph = left.locator('.erp-help-flow .erp-markdown-mermaid').first()
        await graph.locator('[data-mermaid-node-id]').first().waitFor()
        await graph.locator('[data-mermaid-fullscreen-action="open"]').click()
        await within(left, graph, '帮助图表全屏范围')
        await expect(graph).toHaveAttribute('aria-modal', 'false')
        await right.getByRole('button', { name: /新建材料$/u }).click()
        await right.getByLabel('名称', { exact: true }).fill('图表旁的草稿')
        await page.keyboard.press('Escape')
        await expect(graph).toHaveAttribute('data-mermaid-fullscreen', 'true')
        await within(left, graph, '另一栏编辑时的图表范围')
        assert.equal(await page.locator('body').evaluate((node) => node.style.overflow), '')
        await page.screenshot({ path: `${outputDir}/business-split-help-fullscreen-both-active.png`, fullPage: true })
        await graph.locator('[data-mermaid-fullscreen-action="close"]').click()
        await expect(right.getByLabel('名称', { exact: true })).toHaveValue('图表旁的草稿')
      },
    },
    {
      ...source,
...shared,
name: 'business-split-source-image',
      beforeNavigate: async (page) => {
        await source.beforeNavigate(page)
        await installBOMMaterialMatchingMocks(page)
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_attachments' || params.owner_type !== 'sales_order') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { attachments: [{ id: 8822, owner_type: 'sales_order', owner_id: 1, file_name: '模拟产品.png', mime_type: 'image/png' }] } } } })
        })
      },
      verify: async (page) => {
        const { left, right } = await open(page, '材料档案')
        await left.getByText('SO-STYLE-L1', { exact: false }).first().click()
        let edit = left.locator('[data-business-action-key="edit"]:visible').first()
        if (await edit.count() === 0) await left.getByRole('button', { name: /^更多操作/u }).click()
        edit = page.locator('[data-business-action-key="edit"]:visible').first()
        await edit.click()
        const expand = left.locator('.erp-line-editor__details-toggle').first()
        await expand.waitFor()
        if (await expand.getAttribute('aria-expanded') === 'false') await expand.click()
        await left.getByRole('button', { name: /核对原表：订单 第 2 行$/u }).click()
        const evidence = page.locator('.ant-popover:visible')
        await evidence.locator('img[alt="订单产品原表图片"]').waitFor()
        await within(left, evidence, '原表依据浮层')
        await evidence.getByRole('button', { name: '查看订单产品原表图片', exact: true }).click()
        const preview = page.getByRole('dialog', { name: '订单产品原表图片预览', exact: true })
        await within(left, preview, '原表图片预览')
        await expect(preview).toHaveAttribute('aria-modal', 'false')
        await right.getByRole('button', { name: /新建材料$/u }).click()
        await right.getByLabel('名称', { exact: true }).fill('预览旁的草稿')
        await within(left, preview, '另一栏编辑时的原表预览范围')
        await page.screenshot({ path: `${outputDir}/business-split-source-image-both-active.png`, fullPage: true })
        await preview.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        await expect(right.getByLabel('名称', { exact: true })).toHaveValue('预览旁的草稿')
      },
    },
  ]
}
