import { assertBusinessFormPage, closeBusinessFormPage } from './businessFormPageAssertions.mjs'

export function createBusinessFormFullscreenScenarios({ assert, outputDir }, scenarios) {
  const base = scenarios.find(scenario => scenario.name === 'business-form-page-production-desktop')
  const metrics = editor => editor.evaluate(node => {
    const rect = node.getBoundingClientRect()
    const body = node.querySelector('.erp-business-form-page__body')
    const footer = node.querySelector('.erp-business-form-page__footer').getBoundingClientRect()
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewport: { width: innerWidth, height: innerHeight },
      top: body.scrollTop, bodyOverflow: body.scrollWidth - body.clientWidth,
      footerBottom: footer.bottom,
      fullscreen: node.dataset.fullscreen,
    }
  })
  const assertFull = async editor => {
    const actual = await metrics(editor)
    assert.equal(actual.fullscreen, 'true', JSON.stringify(actual))
    assert.ok(Math.abs(actual.x) <= 1 && Math.abs(actual.y) <= 1, JSON.stringify(actual))
    assert.ok(Math.abs(actual.width - actual.viewport.width) <= 1, JSON.stringify(actual))
    assert.ok(Math.abs(actual.height - actual.viewport.height) <= 1, JSON.stringify(actual))
    assert.ok(actual.bodyOverflow <= 1, JSON.stringify(actual))
    assert.ok(actual.footerBottom <= actual.viewport.height + 1, JSON.stringify(actual))
  }
  return [
    ...['light', 'dark'].map(themeMode => ({
      ...base,
      name: `business-form-page-fullscreen-${themeMode}`,
      themeMode,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: themeMode === 'light' ? 2 : 1,
      verify: async page => {
        const trigger = page.getByRole('button', { name: '新建生产订单' })
        await trigger.click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await assertBusinessFormPage(page, editor)
        const normal = await metrics(editor)
        const body = editor.locator('.erp-business-form-page__body')
        const note = editor.getByRole('textbox', { name: '备注', exact: true })
        await note.fill('全屏切换保留输入，附件与明细继续在原表单中编辑')
        for (let count = 0; count < 6; count++) {
          await editor.getByRole('button', { name: '添加生产明细' }).first().click()
        }
        const noteHandle = await note.elementHandle()
        await body.evaluate(node => { node.scrollTop = Math.min(180, node.scrollHeight - node.clientHeight) })
        const top = await body.evaluate(node => node.scrollTop)
        assert.ok(top > 0, 'the long form must exercise a nonzero reading position')
        const table = editor.locator('.erp-compact-field-table').first()
        await table.evaluate(node => { node.scrollLeft = Math.min(100, node.scrollWidth - node.clientWidth) })
        const left = await table.evaluate(node => node.scrollLeft)
        await editor.getByRole('button', { name: '全屏编辑', exact: true }).click()
        await assertFull(editor)
        assert.equal(await noteHandle.evaluate(node => node.isConnected), true)
        assert.equal(await note.inputValue(), '全屏切换保留输入，附件与明细继续在原表单中编辑')
        assert.equal(await editor.locator('.erp-production-order-line').count(), 7)
        assert.equal(await body.evaluate(node => node.scrollTop), top)
        await editor.getByRole('button', { name: '退出全屏', exact: true }).click()
        const restored = await metrics(editor)
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(restored[key] - normal[key]) <= 1, `${key}: ${JSON.stringify(restored)}`)
        assert.equal(await body.evaluate(node => node.scrollTop), top)
        assert.equal(await table.evaluate(node => node.scrollLeft), left)

        await editor.getByRole('button', { name: '全屏编辑', exact: true }).click()
        const start = editor.getByRole('textbox', { name: '计划开始', exact: true })
        await start.click()
        await page.locator('.ant-picker-dropdown:visible').waitFor()
        await start.press('Escape')
        await page.locator('.ant-picker-dropdown:visible').waitFor({ state: 'hidden' })
        await assertFull(editor)
        const product = editor.locator('.erp-production-order-line').first().getByRole('combobox', { name: '* 产品', exact: true })
        await product.click()
        const dropdown = page.locator('.ant-select-dropdown:visible')
        await dropdown.waitFor()
        const popup = await dropdown.boundingBox()
        assert.ok(popup && popup.width > 0)
        await product.press('Escape')
        await dropdown.waitFor({ state: 'hidden' })
        await assertFull(editor)

        await editor.getByRole('button', { name: '创建草稿', exact: true }).click()
        await editor.locator('.ant-form-item-has-error').first().waitFor()
        await assertFull(editor)
        assert.equal(await note.inputValue(), '全屏切换保留输入，附件与明细继续在原表单中编辑')
        await editor.getByRole('button', { name: '返回列表', exact: true }).click()
        const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true })
        await confirm.waitFor()
        assert.equal(await confirm.getByRole('button', { name: /全屏/u }).count(), 0, 'short dialogs have no fullscreen action')
        await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
        await confirm.waitFor({ state: 'hidden' })
        await assertFull(editor)
        await editor.getByRole('button', { name: '退出全屏', exact: true }).press('Escape')
        assert.equal((await metrics(editor)).fullscreen, undefined)
        await editor.getByRole('button', { name: '全屏编辑', exact: true }).click()
        if (themeMode === 'light') await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: `${outputDir}/editor-fullscreen-${themeMode}.png`, fullPage: true })
        await closeBusinessFormPage(page, editor)
        await trigger.click()
        await editor.getByRole('button', { name: '全屏编辑', exact: true }).waitFor()
        assert.equal((await metrics(editor)).fullscreen, undefined)
        await closeBusinessFormPage(page, editor)
      },
    })),
    {
      ...base,
      name: 'business-form-page-fullscreen-viewport-recovery',
      verify: async page => {
        await page.getByRole('button', { name: '新建生产订单' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('button', { name: '全屏编辑', exact: true }).click()
        await assertFull(editor)
        await page.setViewportSize({ width: 390, height: 844 })
        await editor.getByRole('button', { name: /全屏/u }).waitFor({ state: 'hidden' })
        assert.equal((await metrics(editor)).fullscreen, undefined)
        await page.setViewportSize({ width: 1440, height: 900 })
        await editor.getByRole('button', { name: '全屏编辑', exact: true }).waitFor()
        assert.equal((await metrics(editor)).fullscreen, undefined)
        await closeBusinessFormPage(page, editor)
        await page.goto(new URL('/m/boss/tasks', page.url()).href)
        await page.locator('.mobile-role-tasks-page').waitFor({ state: 'visible' })
        assert.equal(await editor.count(), 0, 'the mobile task workspace must not mount a desktop source document')
        assert.equal(await page.getByRole('button', { name: /全屏/u }).count(), 0, 'the mobile task workspace remains without desktop fullscreen controls at desktop width')
      },
    },
    {
      ...base,
      name: 'business-form-page-fullscreen-readonly',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async page => {
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).click()
        await page.locator('[data-business-action-key="view"]').click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: '查看生产订单', exact: true }).waitFor()
        await editor.getByRole('status').getByText('只读查看').waitFor()
        const note = editor.getByRole('textbox', { name: '备注', exact: true })
        const value = await note.inputValue()
        await editor.getByRole('button', { name: '全屏查看', exact: true }).click()
        await assertFull(editor)
        assert.equal(await note.isDisabled(), true)
        assert.equal(await note.inputValue(), value)
        assert.equal(await editor.getAttribute('data-unsaved'), 'false')
        await page.screenshot({ path: `${outputDir}/editor-fullscreen-readonly-4k.png`, fullPage: true })
        await closeBusinessFormPage(page, editor)
        await page.locator('.erp-admin-sider').waitFor({ state: 'visible' })
      },
    },
    {
      name: 'dev-ui-design-form-fullscreen',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      verify: async page => {
        await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
        await page.getByRole('button', { name: /全屏预览/u }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('button', { name: '业务汇总', exact: true }).waitFor()
        await frame.locator('.nav-item[data-page="purchase"]').click()
        await frame.locator('[data-action="new-record"]').click()
        const form = frame.locator('.form-view')
        await form.waitFor()
        const note = form.locator('[data-form-field="remark"]')
        await note.fill('全屏切换保留设计示例内容')
        const handle = await note.elementHandle()
        await form.getByRole('button', { name: '全屏编辑', exact: true }).click()
        const actual = await form.evaluate(node => {
          const rect = node.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewport: [innerWidth, innerHeight] }
        })
        assert.ok(Math.abs(actual.x) <= 1 && Math.abs(actual.y) <= 1, JSON.stringify(actual))
        assert.ok(Math.abs(actual.width - actual.viewport[0]) <= 1, JSON.stringify(actual))
        assert.ok(Math.abs(actual.height - actual.viewport[1]) <= 1, JSON.stringify(actual))
        assert.equal(await handle.evaluate(node => node.isConnected), true)
        assert.equal(await note.inputValue(), '全屏切换保留设计示例内容')
        await form.getByRole('button', { name: '退出全屏', exact: true }).press('Escape')
        await form.getByRole('button', { name: '全屏编辑', exact: true }).waitFor()
        assert.equal(await note.inputValue(), '全屏切换保留设计示例内容')
      },
    },
  ]
}
