import { UI_DESIGN_PREVIEW_TIMEOUT_MS } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { DEV_TESTING_FULL_ACCEPTANCE_VIEW, DEV_TESTING_ROUTE, DEV_TESTING_WORKSPACE_VIEWS } from '../../src/dev-workbench/config/devTesting.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'
import { chooseUIDesignMode, chooseUIDesignState, visibleUIDesignFrame as frameSelector } from './devUIDesignNavigation.mjs'
import { assertBusinessNoteTextAreas } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDevUIDesignPreviewScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const waitReady = async (page) => {
    const frame = page.frameLocator(frameSelector)
    await page.locator(`${frameSelector}:not([aria-hidden])`).waitFor({ state: 'visible' })
    await frame.locator('.app').waitFor({ state: 'visible' })
    const geometry = await frame.locator('.app').evaluate((node) => {
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    assert(geometry.width > 0 && geometry.height > 0, '预览内容完成布局后才算就绪')
    assert.equal(await page.locator('.erp-dev-ui-design-feedback:visible').count(), 0)
    return frame
  }
  const openSamples = (page) => page.getByRole('tab', { name: '设计样例', exact: true }).click()
  const returnToPreview = (page) => page.getByRole('tab', { name: '可交互设计', exact: true }).click()
  return [
    {
      name: 'dev-ui-design-inbound-related-actions',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await frame.locator('.nav-item[data-page="warehouse-hub"]').click()
        await frame.locator('.table-wrap [data-action="select-row"][data-id="inbound-1"]').check()
        const actions = frame.locator('.operation-surface .business-record-actions')
        for (const width of [1920, 1024]) {
          await page.setViewportSize({ width, height: 1080 })
          const related = actions.getByRole('button', { name: '相关单据', exact: true })
          if (!(await related.isVisible())) {
            await actions.getByRole('button', { name: '更多操作', exact: true }).click()
          }
          await related.click()
          const records = actions.getByRole('button', { name: '退货与调整记录', exact: true })
          assert.equal(await records.count(), 1, '记录入口只保留在相关单据菜单')
          assert.equal(await records.evaluate((node) => node.closest('details').querySelector('summary').getAttribute('aria-label')), '相关单据')
          assert.equal(await actions.evaluate((node) => node.scrollWidth - node.clientWidth <= 1), true, '关联菜单不挤压操作区')
          await records.click()
          const dialog = frame.getByRole('dialog', { name: '退货与调整记录', exact: true })
          await dialog.waitFor({ state: 'visible' })
          await dialog.getByRole('button', { name: '返回', exact: true }).click()
          await dialog.waitFor({ state: 'hidden' })
        }
      },
    },
    ...['customers', 'suppliers'].map((key) => ({
      name: `dev-ui-design-contact-sidebar-${key}`,
      path: '/__dev/ui-design',
      viewport: { width: 1300, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await frame.locator('.nav-item[data-page="master-hub"]').click()
        await frame.locator(`[data-action="module-tab"][data-value="${key}"]`).click()
        const iframe = await page.locator(frameSelector).elementHandle()
        const documentFrame = await iframe.contentFrame()
        await iframe.dispose()
        const viewportWidth = await documentFrame.evaluate(() => innerWidth)
        const sidebar = frame.locator('#sidebar [data-action="toggle-sidebar"]')
        await sidebar.click()
        await waitForFiniteAnimations(documentFrame)
        await frame.locator('[data-action="new-record"]').click()
        await waitForFiniteAnimations(documentFrame)
        const contacts = frame.locator('.compact-contacts')
        const fields = contacts.locator('.compact-contact-fields').first()
        const name = contacts.locator('[data-form-field="contact-0-name"]')
        const note = contacts.locator('[data-form-field="contact-0-note"]')
        const toggle = contacts.locator('.document-line-details-toggle').first()
        const toolbar = frame.locator('.form-view .line-editor-toolbar')
        const inlineActions = contacts.locator('.contact-cell-actions').first()
        const nameNode = await name.elementHandle()
        const noteNode = await note.elementHandle()
        await name.fill('侧栏布局核对联系人')
        const assertLayout = async (compact, noteVisible) => {
          await waitForFiniteAnimations(documentFrame)
          assert.equal(await documentFrame.evaluate(() => innerWidth), viewportWidth, '侧栏操作不改变预览视口')
          assert.equal(await fields.evaluate((node) => getComputedStyle(node).display === 'grid'), compact)
          assert.equal(await note.isVisible(), noteVisible, '备注跟随容器布局并保留桌面展开状态')
          assert.equal(await toggle.isVisible(), !compact)
          assert.equal(await toolbar.isVisible(), !compact)
          assert.equal(await inlineActions.isVisible(), compact, '行操作与联系人字段布局同步')
          assert.equal(await name.evaluate((node, previous) => node === previous, nameNode), true)
          assert.equal(await note.evaluate((node, previous) => node === previous, noteNode), true)
          assert.equal(await name.inputValue(), '侧栏布局核对联系人')
        }
        await assertLayout(false, false)
        await sidebar.click()
        await assertLayout(true, true)
        const value = '侧栏切换保留的联系人说明\n'.repeat(12)
        await note.fill(value)
        await sidebar.click()
        await assertLayout(false, false)
        await toggle.click()
        await assertLayout(false, true)
        for (const compact of [true, false]) {
          await sidebar.click()
          await assertLayout(compact, true)
          assert.equal(await note.inputValue(), value)
          assert.ok(await note.evaluate((node) => node.scrollHeight <= node.clientHeight + 1), '容器变窄后长备注完整增高')
        }
        await nameNode.dispose()
        await noteNode.dispose()
        await page.screenshot({ path: path.join(outputDir, `prototype-${key}-contact-sidebar.png`) })
      },
    })),
    ...['customers', 'suppliers'].map((key) => ({
      name: `dev-ui-design-contact-notes-${key}`,
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await frame.locator('.nav-item[data-page="master-hub"]').click()
        await frame.locator(`[data-action="module-tab"][data-value="${key}"]`).click()
        await frame.locator('[data-action="new-record"]').click()
        const contacts = frame.locator('.compact-contacts')
        const note = contacts.locator('[data-form-field="contact-0-note"]')
        const toggle = contacts.locator('.document-line-details-toggle').first()
        assert.equal(await note.isVisible(), false, '桌面联系人备注默认收起')
        await toggle.click()
        const value = '联系人交付与联络说明\n'.repeat(10)
        await note.fill(value)
        const original = await note.elementHandle()
        const resize = async (width, visible) => {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 })
          await waitForFiniteAnimations(page)
          await note.waitFor({ state: visible ? 'visible' : 'hidden' })
          assert.equal(await note.inputValue(), value)
          assert.equal(await note.evaluate((node, previous) => node === previous, original), true, '宽窄切换保留原备注字段')
          assert.equal(await toggle.isVisible(), width === 1920, '联系人按实际字段布局提供展开入口')
          if (visible) assert.ok(await note.evaluate((node) => node.scrollHeight <= node.clientHeight + 1), '备注随可用宽度增高，内容不截断')
        }
        for (const width of [1000, 390, 1920]) await resize(width, true)
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true', '返回桌面保留已展开状态')
        assert.equal(await toggle.getAttribute('aria-label'), '收起第 1 行备注')
        await toggle.click()
        for (const width of [1000, 390, 1920]) await resize(width, width !== 1920)
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false', '窄屏强制展示不改变桌面收起状态')
        await original.dispose()
        await page.setViewportSize({ width: 390, height: 844 })
        await contacts.getByRole('button', { name: '添加联系人', exact: true }).click()
        const notes = contacts.locator('.compact-contact-note textarea')
        assert.equal(await notes.count(), 2)
        assert.equal(await notes.first().isVisible(), true, '窄屏重新渲染联系人时直接显示备注')
        assert.equal(await notes.nth(1).isVisible(), true, '窄屏新增联系人可直接填写备注')
        assert.equal(await notes.first().inputValue(), value)
        await notes.nth(1).fill('窄区域新增的联系人备注')
        await page.screenshot({ path: path.join(outputDir, `prototype-${key}-contact-notes-narrow.png`) })
        await page.setViewportSize({ width: 1920, height: 1080 })
        await waitForFiniteAnimations(page)
        const first = contacts.locator('.compact-contact-row').first()
        await first.locator('.document-line-details-toggle').click()
        const columns = await contacts.locator('thead th').count()
        const fixedSpans = await first.locator('.compact-contact-fields > .document-line-disclosure, .compact-contact-fields > .contact-cell-sequence').evaluateAll((cells) => cells.map((cell) => cell.rowSpan))
        assert.deepEqual(fixedSpans, [2, 2], '补充和序号两列覆盖整条展开的联系人')
        assert.equal(await first.locator('.compact-contact-note td').getAttribute('colspan'), String(columns - fixedSpans.length), '备注跨列避让补充和序号列')
        assert.equal(await first.locator('.contact-cell-sequence').getAttribute('rowspan'), '2')
        assert.equal(await notes.first().inputValue(), value)
        assert.equal(await notes.nth(1).inputValue(), '窄区域新增的联系人备注')
        await page.screenshot({ path: path.join(outputDir, `prototype-${key}-contact-notes-4k.png`), scale: 'device' })
      },
    })),
    {
      name: 'dev-ui-design-production-line-notes',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await frame.getByRole('button', { name: '生产管理', exact: true }).click()
        await frame.getByRole('button', { name: '新建生产单', exact: true }).click()
        const editor = frame.locator('.form-view')
        const row = editor.locator('tbody[data-form-row="0"]')
        const note = row.locator('textarea[data-form-field="line-note-0"]')
        const toggle = row.locator('[data-action="line-details"]')
        assert.equal(await note.isVisible(), false)
        assert.equal(await row.locator('[data-form-field="route-0"]').isVisible(), true)
        assert.equal(await row.locator('[data-form-field="inspection-0"]').isVisible(), true)
        await toggle.click()
        await note.fill('原型备注折叠后保留')
        const original = await note.elementHandle()
        await toggle.click()
        assert.equal(await note.isVisible(), false)
        assert.equal(await note.inputValue(), '原型备注折叠后保留')
        for (const width of [390, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await waitForFiniteAnimations(page)
          assert.equal(await note.isVisible(), width === 390, '窄区域直接展示，桌面恢复原折叠状态')
          assert.equal(await note.evaluate((node, previous) => node === previous, original), true)
        }
        const columns = await row.locator('xpath=ancestor::table[1]').locator('thead th').count()
        const fixedSpans = await row.locator(':scope > tr:first-child > .document-line-disclosure, :scope > tr:first-child > .document-line-sequence').evaluateAll((cells) => cells.map((cell) => cell.rowSpan))
        assert.deepEqual(fixedSpans, [2, 2], '补充和序号列保留生产办理字段的整条归属')
        assert.equal(await row.locator('.document-line-more > td').getAttribute('colspan'), String(columns - fixedSpans.length))
        await page.screenshot({ path: path.join(outputDir, 'prototype-production-line-notes.png') })
        await original.dispose()
      },
    },
    {
      name: 'dev-ui-design-form-navigation',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        await frame.getByRole('button', { name: '新建订单', exact: true }).click()
        const editor = frame.locator('.form-view')
        await editor.getByRole('button', { name: '添加订货明细', exact: true }).click()
        await waitForFiniteAnimations(page)
        const tableStyle = await editor.locator('.line-editor-simplified table').first().evaluate((table) => {
          const cell = table.querySelector('th')
          const style = getComputedStyle(cell)
          const frame = getComputedStyle(table.parentElement)
          return { height: cell.getBoundingClientRect().height, border: style.borderBottomWidth, fontSize: style.fontSize, padding: style.padding, frameBorder: frame.borderTopWidth, radius: frame.borderRadius }
        })
        assert.ok(tableStyle.height >= 40, JSON.stringify(tableStyle))
        assert.equal(tableStyle.border, '1px')
        assert.equal(tableStyle.fontSize, '12px')
        assert.equal(tableStyle.padding, '8px 6px')
        assert.equal(tableStyle.frameBorder, '1px')
        assert.equal(tableStyle.radius, '6px')
        const rowActions = editor.locator('.line-editor-toolbar [data-design-line-command]')
        assert.ok(await rowActions.count(), '独立交互稿保留行操作入口')
        assert.equal(await rowActions.evaluateAll((nodes) => nodes.every((node) => node.classList.contains('btn') && !node.classList.contains('text-btn'))), true, '独立交互稿行操作使用统一描边按钮')
        assert.equal(await editor.locator('[aria-label="编辑页显示"]').count(), 0, '原型编辑页沿用账号设置，标题栏不重复提供显示切换')
        const chooseDisplay = async (label) => {
          await frame.locator('[data-action="open-account"]').click()
          await frame.locator('.account-popover [data-action="open-theme"]').click()
          const dialog = frame.getByRole('dialog', { name: '外观与密度', exact: true })
          await dialog.getByRole('group', { name: '编辑页显示', exact: true }).getByRole('button', { name: label, exact: true }).click()
          await dialog.locator('.modal-foot').getByRole('button', { name: '关闭', exact: true }).click()
          await dialog.waitFor({ state: 'hidden' })
        }
        const note = editor.locator('textarea[data-form-field="remark"]')
        await note.fill('目录与页签切换后保留的原型草稿\n'.repeat(30))
        const identity = await note.elementHandle()
        await chooseDisplay('页签')
        const tabs = editor.getByRole('tablist', { name: '表单页签', exact: true })
        for (const width of [1920, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          await tabs.getByRole('tab').first().press('End')
          await waitForFiniteAnimations(page)
          const before = await tabs.boundingBox()
          const body = editor.locator('.form-scroll')
          await body.evaluate((node) => { node.scrollTop = node.scrollHeight })
          const after = await tabs.boundingBox()
          assert.ok(Math.abs(after.y - before.y) <= 1, `长表单滚动时原型页签保持可见：${JSON.stringify({ width, before, after })}`)
          assert.equal(await tabs.getByRole('tab').last().getAttribute('aria-selected'), 'true')
          const selected = await tabs.getByRole('tab').last().boundingBox()
          assert.ok(selected.x >= before.x - 1 && selected.x + selected.width <= before.x + before.width + 1, '窄屏当前页签完整可见')
          await tabs.getByRole('tab').first().click()
          await tabs.getByRole('tab').last().click()
          assert.equal(await identity.evaluate((node) => node.isConnected), true)
          assert.equal(await note.inputValue(), '目录与页签切换后保留的原型草稿\n'.repeat(30))
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await chooseDisplay('目录')
        assert.equal(await editor.locator('.form-section:visible').count(), 5)
        assert.equal(await identity.evaluate((node) => node.isConnected), true)
      },
    },
    {
      name: 'dev-ui-design-note-textareas',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        await frame.getByRole('button', { name: '新建订单', exact: true }).click()
        await frame.getByRole('button', { name: '添加订货明细', exact: true }).click()
        const editor = frame.locator('.form-view')
        const note = editor.locator('textarea[data-form-field="note-0"]')
        await note.waitFor()
        await assertBusinessNoteTextAreas(editor)
        for (const width of [1920, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertBusinessNoteTextAreas(editor)
          const height = (await note.boundingBox()).height
          await note.fill('分批交付要求与包装说明\n'.repeat(12))
          assert((await note.boundingBox()).height > height, '原型明细备注随输入增高')
          await assertBusinessNoteTextAreas(editor)
          await note.fill('')
          assert(Math.abs((await note.boundingBox()).height - height) <= 1, `清空原型备注恢复两行起步：${JSON.stringify({ width, initial: height, current: (await note.boundingBox()).height })}`)
        }
        await page.screenshot({ path: path.join(outputDir, 'prototype-note-two-rows.png') })
      },
    },
    {
      name: 'dev-ui-design-order-identifiers',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        const checkIdentifiers = async () => {
          const rows = frame.locator('tbody tr').filter({ has: frame.locator('.copy-value .entity-link') })
          await rows.first().waitFor()
          const metrics = await rows.evaluateAll((nodes) => nodes.map((row) => {
            const link = row.querySelector('.copy-value .entity-link')
            const copy = link.closest('.copy-value').querySelector(':scope > button')
            const linkBox = link.getBoundingClientRect()
            const copyBox = copy.getBoundingClientRect()
            const cellBox = link.closest('td').getBoundingClientRect()
            const range = document.createRange()
            range.selectNodeContents(link)
            return {
              number: link.textContent,
              linkWidth: linkBox.width,
              textHeight: range.getBoundingClientRect().height,
              linkHeight: linkBox.height,
              copyWidth: copyBox.width,
              copyHeight: copyBox.height,
              withinCell: linkBox.top >= cellBox.top && linkBox.bottom <= cellBox.bottom && linkBox.right <= copyBox.left && copyBox.right <= cellBox.right,
              color: getComputedStyle(link).color,
              expectedColor: getComputedStyle(row).color,
            }
          }))
          assert(metrics.length > 0)
          for (const metric of metrics) {
            assert(metric.linkWidth > 100, `订单编号不应套用图标尺寸: ${JSON.stringify(metric)}`)
            assert(metric.textHeight <= metric.linkHeight + 1 && metric.withinCell, `编号不得溢出或重叠: ${JSON.stringify(metric)}`)
            assert.equal(metric.copyWidth, 26)
            assert.equal(metric.copyHeight, 26)
            assert.equal(metric.color, metric.expectedColor, '订单编号保留主文本颜色')
          }
        }
        await checkIdentifiers()
        await frame.getByRole('button', { name: '复制 SO-20260918-032', exact: true }).click()
        await frame.getByRole('button', { name: 'SO-20260918-032', exact: true }).click()
        await frame.getByRole('dialog').waitFor()
        await frame.getByRole('button', { name: '关闭', exact: true }).click()
        await checkIdentifiers()
        await page.setViewportSize({ width: 1280, height: 800 })
        await checkIdentifiers()
        await assertNoHorizontalOverflow(page)
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'ui-design-order-identifiers-4k.png') })
        await chooseUIDesignState(page, '边界压力')
        await frame.locator('[data-list-scroll]').waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-design-boundary-consistency',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const requests = []
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/rpc/')) requests.push(request.url())
        })
        const frame = await waitReady(page)
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        const table = frame.locator('[data-list-scroll] .table-wrap > table')
        const headers = await table.locator('thead th').allTextContents()
        const views = await frame.getByRole('group', { name: '销售订单视图', exact: true }).innerText()
        const normalNumbers = await table.locator('.cell-no .entity-link').allTextContents()
        const query = frame.getByRole('textbox', { name: '搜索', exact: true })
        await query.fill('SO-20260918-032')
        await query.press('Enter')
        const normalSelection = frame.getByRole('checkbox', { name: '选择 SO-20260918-032', exact: true })
        await normalSelection.check()
        await page.screenshot({ path: path.join(outputDir, 'ui-design-normal-context-4k.png') })

        await chooseUIDesignState(page, '边界压力')
        await table.locator('tbody tr[data-row]').first().waitFor()
        await frame.getByRole('heading', { name: '销售订单', exact: true }).waitFor()
        assert.deepEqual(await table.locator('thead th').allTextContents(), headers, '压力状态沿用正常表头和列设置')
        assert.equal(await frame.getByRole('group', { name: '销售订单视图', exact: true }).innerText(), views)
        assert.equal(await frame.locator('.boundary-review-note,.boundary-table,.boundary-selection').count(), 0)
        assert.equal(await table.locator('tbody tr[data-row]').count(), 500, '压力状态直接使用单页 500 条上限')
        assert.match(await frame.locator('.table-footer').innerText(), /业务总数 1500 条/u)
        assert.equal(await query.inputValue(), '')
        assert.equal(await table.locator('tbody input:checked').count(), 0, '切换场景不自动选择记录')
        const firstNumber = await table.locator('.cell-no .entity-link').first().innerText()
        assert(firstNumber.length > 20, '样例覆盖长编号')
        await frame.getByRole('checkbox', { name: `选择 ${firstNumber}`, exact: true }).check()
        await frame.getByRole('button', { name: '下一页', exact: true }).click()
        assert.match(await frame.locator('.table-footer').innerText(), /已选 1 条/u)
        assert.notEqual(await table.locator('.cell-no .entity-link').first().innerText(), firstNumber)
        await frame.getByRole('button', { name: '上一页', exact: true }).click()
        assert.equal(await frame.getByRole('checkbox', { name: `选择 ${firstNumber}`, exact: true }).isChecked(), true)
        await frame.getByRole('button', { name: '清空已选', exact: true }).click()
        await table.locator('.cell-no .entity-link').first().click()
        await frame.getByRole('dialog').waitFor()
        await frame.getByText(firstNumber, { exact: true }).last().waitFor()
        await frame.getByRole('button', { name: '关闭', exact: true }).click()

        await query.fill(firstNumber)
        await query.press('Enter')
        assert.equal(await table.locator('tbody tr[data-row]').count(), 1, '搜索实际筛选同一批压力记录')
        await query.fill('不匹配的压力查询')
        await query.press('Enter')
        await frame.getByText('没有匹配的记录', { exact: true }).first().waitFor()
        await query.fill('')
        await query.press('Enter')
        await frame.getByRole('button', { name: /^草稿，/u }).click()
        await frame.getByText('没有匹配的记录', { exact: true }).first().waitFor()
        await frame.getByRole('button', { name: /^已提交，/u }).click()
        assert.match(await table.locator('tbody tr[data-row]').first().innerText(), /已提交/u)
        await frame.getByRole('button', { name: /^不限状态，/u }).click()
        await frame.getByRole('button', { name: '交付进度', exact: true }).click()
        await frame.locator('.priority-visual-surface').waitFor()
        await frame.getByRole('button', { name: '订单列表', exact: true }).click()
        await frame.getByRole('button', { name: /^订单总额/u }).click()
        const amounts = await table.locator('tbody .cell-metric').allTextContents()
        const values = amounts.map((value) => Number(value.replace(/[^\d.]/gu, '')))
        assert.deepEqual(values, [...values].sort((a, b) => a - b), '表格排序使用同一批压力金额')
        await frame.getByRole('button', { name: '表格工具', exact: true }).click()
        await frame.getByRole('button', { name: '弹窗边界', exact: true }).click()
        await frame.locator('.business-detail-modal [data-detail-line]').first().waitFor()
        await frame.getByRole('button', { name: '关闭', exact: true }).click()
        for (const width of [1920, 1280]) {
          await page.setViewportSize({ width, height: width === 1920 ? 1080 : 800 })
          await assertNoHorizontalOverflow(page)
          const overflow = await frame.locator('.app').evaluate((node) => node.scrollWidth - node.clientWidth)
          assert(overflow <= 1, `压力页面不产生页面级横向溢出：${overflow}px`)
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'ui-design-boundary-shared-layout-4k.png') })
        await chooseUIDesignState(page, '正常')
        assert.equal(await query.inputValue(), 'SO-20260918-032')
        assert.equal(await normalSelection.isChecked(), true, '恢复普通场景的选择')
        await query.fill('')
        await query.press('Enter')
        assert.deepEqual(await table.locator('.cell-no .entity-link').allTextContents(), normalNumbers, '压力数据不覆盖普通样例')
        await frame.getByRole('button', { name: '采购管理', exact: true }).click()
        await chooseUIDesignState(page, '边界压力')
        await frame.getByRole('heading', { name: '采购订单', exact: true }).waitFor()
        assert.match(await table.locator('.cell-no .entity-link').first().innerText(), /^PO-/u)
        await page.locator('.erp-dev-ui-design-state-select .ant-select-clear').click()
        await frame.getByRole('heading', { name: '采购订单', exact: true }).waitFor()
        await chooseUIDesignState(page, '边界压力')
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        await page.locator('.erp-dev-ui-design-state-select .ant-select-clear').click()
        await frame.getByRole('heading', { name: '销售订单', exact: true }).waitFor()
        assert.deepEqual(await table.locator('.cell-no .entity-link').allTextContents(), normalNumbers, '跨模块退出也恢复对应普通记录')
        assert.deepEqual(requests, [], '状态模拟不读取或写入业务接口')
      },
    },
    {
      name: 'dev-ui-design-help-role-clear',
      path: '/__dev/ui-design?page=help',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await waitReady(page)
        const picker = frame.locator('ui-select[aria-label="推荐岗位"]')
        await picker.locator('.design-select-clear').click()
        await frame.getByText('请选择岗位指南', { exact: true }).waitFor()
        assert.equal(await picker.evaluate((node) => node.value), '')
        assert.equal(await frame.locator('#rh-viewBody').isVisible(), false)
        await chooseSelectOption(picker, 'engineering')
        await frame.getByRole('region', { name: '帮助首页', exact: true }).waitFor()
        assert.equal(await picker.evaluate((node) => node.value), 'engineering')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-design-preview-modes',
      path: '/__dev/ui-design?page=',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        const modes = page.getByLabel('设计预览界面', { exact: true })
        assert.deepEqual(await modes.locator('.ant-segmented-item-label').allTextContents(), ['桌面 ERP', '手机版', '登录页'])
        assert.equal(await modes.getByRole('radio', { name: '桌面 ERP' }).isChecked(), true)
        await frame.locator('.nav-item[data-page="tasks"]').click()
        const search = frame.locator('#board-search')
        await search.fill('采购到货')
        await search.press('Enter')
        const opener = frame.getByRole('button', { name: '办理样例', exact: true })
        await opener.click()
        const samples = frame.getByRole('dialog', { name: '办理样例', exact: true })
        const example = samples.getByRole('button', { name: '完善量产工程资料', exact: true })
        await example.click()
        const task = frame.getByRole('dialog', { name: '任务办理', exact: true })
        await task.getByRole('button', { name: '任务办理', exact: true }).click()
        await task.getByRole('button', { name: '编制 BOM', exact: true }).click()
        assert.equal(await frame.locator('.form-view [data-form-field="source-order"]').inputValue(), 'SO-20260925-001')
        await frame.locator('.form-foot [data-action="handling-return"]').click()
        await task.getByRole('button', { name: '返回办理样例', exact: true }).click()
        assert.equal(await example.evaluate((node) => document.activeElement === node), true)
        await samples.getByRole('button', { name: '返回任务管理', exact: true }).click()
        assert.equal(await opener.evaluate((node) => document.activeElement === node), true)
        assert.equal(await search.inputValue(), '采购到货')

        const switcher = '[aria-label="设计预览界面"]'
        await verifyMobileNavigationMotion(page, assert, switcher, 1)
        await waitReady(page)
        await verifyMobileNavigationMotion(page, assert, switcher, 2, true)
        await waitReady(page)
        await page.goBack()
        await waitReady(page)
        assert.equal(await modes.getByRole('radio', { name: '手机版' }).isChecked(), true)
        await chooseUIDesignMode(page, '桌面 ERP')
        await waitReady(page)
        assert.equal(await search.inputValue(), '采购到货')
        await page.screenshot({ path: path.join(outputDir, 'ui-design-preview-modes-4k.png') })
        await page.setViewportSize({ width: 390, height: 844 })
        await chooseUIDesignMode(page, '手机版')
        await waitReady(page)
        const headerTabs = page.locator('.erp-dev-ui-design-header').getByRole('tablist')
        assert.deepEqual(await headerTabs.getByRole('tab').allTextContents(), ['可交互设计', '设计样例', '设计说明', '设计依据'])
        assert.equal(await headerTabs.evaluate((node) => {
          const wrap = node.querySelector('.ant-tabs-nav-wrap').getBoundingClientRect()
          return [...node.querySelectorAll('[role="tab"]')].every((tab) => {
            const box = tab.getBoundingClientRect()
            return box.left >= wrap.left - 1 && box.right <= wrap.right + 1
          })
        }), true, '窄屏完整显示上排四个页签')
        const bar = await modes.evaluate((node) => ({
          fits: node.scrollWidth <= node.clientWidth + 1,
          labelsFit: [...node.querySelectorAll('.ant-segmented-item-label')].every((label) => label.scrollWidth <= label.clientWidth + 1),
        }))
        assert(bar.fits && bar.labelsFit, '窄屏完整显示三个预览入口')
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-preview-modes-narrow.png') })
      },
    },
    {
      name: 'dev-ui-design-production-entry',
      path: '/__dev/ui-design?page=production-hub',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        const heading = frame.getByRole('heading', { name: '生产管理', exact: true })
        await heading.waitFor()
        assert.equal(await page.getByLabel('设计预览界面', { exact: true }).getByRole('radio', { name: '桌面 ERP' }).isChecked(), true)
        for (const name of ['生产订单', '生产执行', '生产记录', '异常处理']) {
          const tab = frame.getByRole('tab', { name, exact: true })
          await tab.click()
          assert.equal(await tab.getAttribute('aria-selected'), 'true')
          await heading.waitFor()
        }
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        assert.equal(await frame.getByRole('tab', { name: '异常处理', exact: true }).getAttribute('aria-selected'), 'true')
        await chooseUIDesignMode(page, '手机版')
        await waitReady(page)
        await chooseUIDesignMode(page, '桌面 ERP')
        await waitReady(page)
        assert.equal(await frame.getByRole('tab', { name: '异常处理', exact: true }).getAttribute('aria-selected'), 'true')
        assert.equal(new URL(page.url()).searchParams.get('page'), 'production-hub')
        await page.reload()
        await waitReady(page)
        await heading.waitFor()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-production-entry-4k.png') })
      },
    },
    {
      name: 'dev-ui-design-workbench-navigation-sync',
      path: '/__dev/ui-design?page=workbench&workbenchMode=preview',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        const navigation = frame.getByRole('navigation', { name: '效能工作台主导航' })
        const heading = frame.locator('.dev-design-heading')
        assert.equal(await frame.locator('#topbar').isVisible(), false)
        await heading.getByRole('button', { name: '刷新演示', exact: true }).waitFor()
        assert.equal(await frame.locator('.dev-page-tools').count(), 0, '原型与正式工作台同步移除页面工具')

        await navigation.getByRole('button', { name: '测试验证', exact: true }).click()
        await frame.getByRole('table', { name: '测试验证工具清单' }).waitFor()
        assert.equal(await navigation.getByRole('button', { name: '链路实测报告', exact: true }).count(), 0)
        assert.equal(await frame.getByRole('table', { name: '测试验证工具清单' }).getByRole('button', { name: '链路实测报告', exact: true }).count(), 0)
        assert.equal(await heading.getByRole('tab').count(), 0)
        assert.equal(await heading.getByRole('button', { name: '开始验证', exact: true }).count(), 0)
        await navigation.getByRole('button', { name: '测试执行', exact: true }).click()
        await heading.getByRole('heading', { name: '测试执行', exact: true }).waitFor()
        const groups = frame.getByRole('tablist', { name: '测试环境与指引', exact: true })
        assert.deepEqual(await groups.getByRole('tab').allTextContents(), ['本地测试', '服务器验证', '测试指引'])
        assert.equal(await navigation.locator('[aria-current="page"]').innerText(), '测试执行')
        const reportStates = frame.getByRole('table', { name: '已有报告状态样例', exact: true })
        assert.equal(await reportStates.locator('tbody tr').count(), 5)
        assert.equal(await reportStates.getByRole('columnheader').count(), 2)
        assert.equal(await frame.getByRole('table', { name: '测试维度说明', exact: true }).count(), 0, '方法说明统一从测试指引阅读')
        const localTabs = frame.getByRole('tablist', { name: '本地测试功能' })
        assert.deepEqual(await localTabs.getByRole('tab').allTextContents(), DEV_TESTING_WORKSPACE_VIEWS.map(({ label }) => label))
        await frame.getByText('本地开发机 · 当前工作区的执行与报告。', { exact: true }).waitFor()
        await localTabs.getByRole('tab', { name: '完整回归', exact: true }).click()
        await frame.getByRole('region', { name: '运行条件', exact: true }).waitFor()
        const regressionLink = frame.getByRole('link', { name: '打开完整回归', exact: true })
        assert.equal(await regressionLink.getAttribute('href'), `${DEV_TESTING_ROUTE}?view=${DEV_TESTING_FULL_ACCEPTANCE_VIEW}`)
        await frame.getByRole('region', { name: '回归范围', exact: true }).waitFor()
        const regressionRecords = frame.getByRole('region', { name: '执行记录', exact: true })
        const regressionSteps = frame.getByRole('region', { name: '业务链与步骤', exact: true })
        await regressionSteps.getByText('销售受理到生产准备', { exact: true }).waitFor()
        await regressionRecords.locator('summary').click()
        await regressionRecords.getByText('已生成本地回归计划，尚未运行。', { exact: true }).waitFor()
        await regressionSteps.locator('summary').click()
        await regressionSteps.getByText('销售提交订单后进入受理流程。', { exact: true }).waitFor()
        await localTabs.getByRole('tab', { name: '本轮验证', exact: true }).click()
        await frame.getByRole('button', { name: '演示本轮验证', exact: true }).click()

        const tabs = groups
        for (const reduced of [false, true]) {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
          await tabs.scrollIntoViewIfNeeded()
          const motion = await tabs.evaluate(async (root, reduced) => {
            const target = root.querySelectorAll('[role="tab"]')[reduced ? 0 : 2]
            const before = root.getBoundingClientRect()
            const start = parseFloat(getComputedStyle(root, '::before').left)
            const samples = []
            target.click()
            const began = performance.now()
            await new Promise((resolve) => {
              const sample = () => {
                const style = getComputedStyle(root, '::before')
                samples.push({ left: parseFloat(style.left), duration: style.transitionDuration, mounted: root.isConnected })
                if (performance.now() - began < 350) requestAnimationFrame(sample)
                else resolve()
              }
              requestAnimationFrame(sample)
            })
            const after = root.getBoundingClientRect()
            return { start, target: target.offsetLeft, samples, selected: target.getAttribute('aria-selected'), drift: ['x', 'y', 'width', 'height'].map((key) => after[key] - before[key]) }
          }, reduced)
          assert.equal(motion.selected, 'true')
          assert(motion.samples.every((sample) => sample.mounted) && motion.drift.every((delta) => Math.abs(delta) <= 1), JSON.stringify(motion))
          assert(Math.abs(motion.samples.at(-1).left - motion.target) <= 1, JSON.stringify(motion))
          if (reduced) assert(motion.samples.every((sample) => sample.duration.split(',').every((value) => parseFloat(value) === 0)))
          else assert(motion.samples.some((sample) => sample.left > Math.min(motion.start, motion.target) + 1 && sample.left < Math.max(motion.start, motion.target) - 1), JSON.stringify(motion))
        }
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
        await localTabs.getByRole('tab', { name: '压力测试', exact: true }).click()
        await frame.getByRole('button', { name: '运行压测演示', exact: true }).click()
        const pressureSummary = frame.getByRole('table', { name: '压力测试关键结果样例', exact: true })
        assert.equal(await pressureSummary.locator('tbody tr').count(), 4)
        await frame.getByRole('button', { name: '报告详情', exact: true }).click()
        const pressureDetails = frame.getByRole('dialog', { name: '压力测试报告详情', exact: true })
        await pressureDetails.waitFor()
        await pressureDetails.locator('.modal-foot').getByRole('button', { name: '关闭', exact: true }).click()
        await localTabs.getByRole('tab', { name: '覆盖报告', exact: true }).click()
        assert.equal(await frame.locator('#dev-design-panel').getByRole('button', { name: '链路实测报告', exact: true }).count(), 0)
        await localTabs.getByRole('tab', { name: '链路实测', exact: true }).click()
        await localTabs.getByRole('tab', { name: '链路实测', exact: true, selected: true }).waitFor()
        await frame.getByRole('heading', { name: '链路实测报告', exact: true }).waitFor()
        const chainResults = frame.getByRole('table', { name: '链路实测结果样例', exact: true })
        assert.deepEqual(await chainResults.getByRole('columnheader').allTextContents(), ['链路', '结果', '首个未通过环节'])
        const chainSteps = frame.getByRole('table', { name: '链路步骤样例', exact: true })
        await chainSteps.getByText('登记不合格品处置', { exact: true }).waitFor()
        await chainResults.getByRole('button', { name: '采购下单到入库应付', exact: true }).click()
        assert.deepEqual(await chainSteps.getByRole('rowheader').allTextContents(), ['采购到货交接'])
        await frame.getByRole('button', { name: '查看全部链路', exact: true }).click()
        await chainSteps.getByText('登记不合格品处置', { exact: true }).waitFor()
        assert.equal(await frame.getByRole('button', { name: /^(查看全部步骤|收起步骤)$/u }).count(), 0)
        await chainResults.waitFor()
        assert.equal(await navigation.locator('[aria-current="page"]').innerText(), '测试执行')
        await localTabs.getByRole('tab', { name: '覆盖报告', exact: true }).click()
        await groups.getByRole('tab', { name: '测试指引', exact: true }).click()
        await heading.getByRole('heading', { name: '测试执行', exact: true }).waitFor()
        assert.deepEqual(await groups.getByRole('tab').allTextContents(), ['本地测试', '服务器验证', '测试指引'])
        const guideDirectory = frame.getByRole('navigation', { name: '测试指引目录', exact: true })
        await guideDirectory.waitFor()
        assert.equal(await guideDirectory.getByRole('button').count(), 5)
        assert.equal(await frame.getByRole('tablist', { name: '测试指引主题', exact: true }).count(), 0)
        await guideDirectory.getByRole('button', { name: '增长验证', exact: true }).click()
        await frame.locator('#dev-design-panel').getByRole('heading', { name: '增长验证', exact: true }).waitFor()
        await guideDirectory.waitFor()
        await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
        await localTabs.getByRole('tab', { name: '覆盖报告', exact: true }).click()
        await localTabs.getByRole('tab', { name: '覆盖报告', exact: true, selected: true }).waitFor()
        await groups.getByRole('tab', { name: '服务器验证', exact: true }).click()
        await frame.getByRole('table', { name: '服务器证据分类' }).waitFor()
        assert.equal(await localTabs.isVisible(), false)
        await navigation.getByRole('button', { name: '交付运维', exact: true }).click()
        const deliveryTabs = frame.getByRole('tablist', { name: '交付运维视图', exact: true })
        assert.deepEqual(await deliveryTabs.getByRole('tab').allTextContents(), ['交付任务', '环境证据'])
        await deliveryTabs.getByRole('tab', { name: '环境证据', exact: true }).click()
        await frame.getByRole('table', { name: '环境证据样例' }).waitFor()
        assert.equal(await frame.getByRole('table', { name: '环境证据样例' }).getByText('未采集', { exact: true }).count(), 3)
        await deliveryTabs.getByRole('tab', { name: '交付任务', exact: true }).click()
        await frame.getByRole('button', { name: '管理版本与部署', exact: true }).click()
        await heading.getByRole('heading', { name: '版本发布', exact: true }).waitFor()
        assert.equal(await navigation.locator('[aria-current="page"]').innerText(), '版本发布')
        await frame.getByRole('button', { name: '核对交付条件', exact: true }).click()
        await frame.getByRole('button', { name: '确认样例条件齐备', exact: true }).click()
        await frame.getByRole('button', { name: '核对并准备版本发布', exact: true }).click()
        await frame.getByRole('button', { name: '确认演示', exact: true }).click()
        await navigation.getByRole('button', { name: '交付运维', exact: true }).click()
        await frame.getByRole('button', { name: '读取演示结果', exact: true }).click()
        await frame.getByRole('dialog', { name: '演示操作回执', exact: true }).waitFor()
        await frame.getByRole('button', { name: '返回工作台', exact: true }).click()

        await frame.getByText('演示设置与边界', { exact: true }).click()
        await chooseSelectOption(frame.locator('#dev-design-state'), 'error')
        await frame.getByRole('heading', { name: '证据暂时无法读取', exact: true }).waitFor()
        await frame.getByRole('button', { name: '重新读取', exact: true }).click()
        await frame.getByRole('region', { name: '交付运维任务' }).waitFor()
        await assertNoHorizontalOverflow(page)
        const innerOverflow = await frame.locator('body').evaluate((node) => node.scrollWidth - node.clientWidth)
        assert(innerOverflow <= 1, `设计稿横向溢出 ${innerOverflow}px`)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-workbench-sync-4k.png') })
      },
    },
    {
      name: 'dev-ui-design-viewport-fill',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const assertViewportFilled = async (selector) => {
          const geometry = await page.locator(selector).evaluate((node) => {
            const box = node.getBoundingClientRect()
            const workspace = document.querySelector('.erp-dev-ui-design-page')
            const header = workspace.querySelector('header')
            const style = getComputedStyle(workspace)
            return {
              height: box.height,
              bottomGap: innerHeight - box.bottom,
              expectedGap: parseFloat(style.paddingBottom),
              headerBottom: header.getBoundingClientRect().bottom,
              top: box.top,
              pageOverflow: document.documentElement.scrollHeight - innerHeight,
            }
          })
          assert(geometry.height > 0, `${selector}: 内容区可见`)
          assert(Math.abs(geometry.bottomGap - geometry.expectedGap) <= 1,
            `${selector}: 内容区延伸到页面底部边距 ${JSON.stringify(geometry)}`)
          assert(geometry.top >= geometry.headerBottom, `${selector}: 内容不覆盖页签`)
          assert(geometry.pageOverflow <= 1, `${selector}: 由内容区独立滚动 ${JSON.stringify(geometry)}`)
          await assertNoHorizontalOverflow(page)
        }
        const reader = '.erp-dev-ui-design-reader:visible'
        const documentShell = '.erp-design-document-shell'
        for (const viewport of [
          { width: 1920, height: 1080 },
          { width: 1920, height: 813 },
          { width: 1440, height: 900 },
          { width: 980, height: 900 },
          { width: 1024, height: 600 },
        ]) {
          await page.setViewportSize(viewport)
          await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
          await waitReady(page)
          await assertViewportFilled(reader)
          for (const name of ['设计说明', '设计依据']) {
            await page.getByRole('tab', { name, exact: true }).click()
            await page.locator(documentShell).waitFor()
            await assertViewportFilled(documentShell)
            await page.getByRole('button', { name: '收起目录', exact: true }).click()
            await assertViewportFilled(documentShell)
            await page.getByRole('button', { name: '展开目录', exact: true }).click()
          }
        }
        await page.getByRole('group', { name: '当前图解的规范来源' }).getByRole('button').click()
        await page.locator('.erp-design-prose').waitFor()
        await assertViewportFilled(documentShell)
        const scroll = await page.locator('.erp-design-document-content').evaluate((node) => {
          node.scrollTop = node.scrollHeight
          return { top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight }
        })
        assert(scroll.scrollHeight > scroll.height && scroll.top > 0, '长文仍在阅读区内滚动')
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        await openSamples(page)
        await page.getByRole('region', { name: '控件设计', exact: true }).waitFor()
        await assertViewportFilled(reader)
        await returnToPreview(page)
        await waitReady(page)
        await assertViewportFilled(reader)
        await page.setViewportSize({ width: 1920, height: 1080 })
        await assertViewportFilled(reader)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-viewport-fill-4k.png') })
      },
    },
    {
      name: 'dev-ui-design-preview-lifecycle',
      path: '/__dev/ui-design?page=help&control=feedback',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const preview = page.locator(frameSelector)
        const frame = await waitReady(page)
        await frame.getByRole('heading', { name: '你想完成什么？', exact: true }).waitFor()
        const helpWindow = await preview.elementHandle()
        await chooseUIDesignMode(page, '登录页')
        await waitReady(page)
        assert.equal(await helpWindow.evaluate((node) => node.isConnected && node.closest('[hidden]') !== null), true, '切换界面保留隐藏的桌面预览')
        const loginWindow = await preview.elementHandle()
        const account = frame.locator('input').first()
        await account.fill('keep-preview-state')

        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        assert.equal(await loginWindow.evaluate((node) => node.isConnected), true)
        assert.equal(await account.inputValue(), 'keep-preview-state')

        const topTabs = '.erp-dev-ui-design-header .erp-sliding-tabs'
        await verifyMobileNavigationMotion(page, assert, topTabs, 1)
        await page.getByRole('region', { name: '控件设计', exact: true }).waitFor()
        assert.equal(await preview.isVisible(), false)
        assert.equal(await page.getByLabel('设计预览界面', { exact: true }).isVisible(), false)
        assert.equal(await page.getByRole('button', { name: '返回预览', exact: true }).count(), 0)
        await verifyMobileNavigationMotion(page, assert, topTabs, 0, true)
        await waitReady(page)
        assert.equal(await loginWindow.evaluate((node) => node.isConnected), true)
        assert.equal(await account.inputValue(), 'keep-preview-state')

        for (const label of ['桌面 ERP', '登录页', '手机版', '桌面 ERP']) {
          await chooseUIDesignMode(page, label)
        }
        await waitReady(page)
        await frame.getByRole('heading', { name: '你想完成什么？', exact: true }).waitFor()
        const beforeReset = await preview.elementHandle()
        await page.getByRole('button', { name: /重置演示/u }).click()
        await waitReady(page)
        assert.equal(await beforeReset.evaluate((node) => node.isConnected), false)
        const search = frame.getByRole('searchbox', { name: '搜索操作图解和参考手册' })
        const results = frame.locator('#rh-manualResults')
        const assertSearch = async (draft, submitted) => {
          await search.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          assert.equal(await search.inputValue(), draft, '布局重绘保留当前搜索草稿')
          assert.equal(await search.evaluate((node) => node.defaultValue), submitted, '布局切换不提交搜索草稿')
          assert.equal(await results.isVisible(), Boolean(submitted))
          if (submitted) await results.getByRole('heading', { name: `搜索“${submitted}”`, exact: true }).waitFor()
        }
        await search.fill('采购')
        await assertSearch('采购', '')
        const frameBeforeExpand = await preview.elementHandle()
        const normalFrame = await preview.boundingBox()
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await page.getByRole('dialog', { name: '交互设计全屏预览', exact: true }).waitFor()
        const expandedFrame = await preview.boundingBox()
        assert(expandedFrame.width > normalFrame.width && expandedFrame.height > normalFrame.height, '宿主放大同时增加宽高，不以内容宽度切换代替')
        assert.equal(await frameBeforeExpand.evaluate((node) => node.isConnected), true)
        await assertSearch('采购', '')
        await page.screenshot({ path: path.join(outputDir, 'ui-preview-help-fullscreen-search-4k.png') })
        await search.press('Enter')
        await assertSearch('采购', '采购')
        await search.fill('采购订单')
        await page.getByRole('button', { name: /退出全屏/u }).click()
        await page.getByRole('dialog', { name: '交互设计全屏预览', exact: true }).waitFor({ state: 'hidden' })
        await assertSearch('采购订单', '采购')
        for (const width of [1280, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertSearch('采购订单', '采购')
          await assertNoHorizontalOverflow(page)
        }
        await page.screenshot({ path: path.join(outputDir, 'ui-preview-help-restored-search-4k.png') })
        await search.press('Escape')
        await assertSearch('采购', '采购')
        await search.locator('xpath=..').getByRole('button', { name: '清除搜索', exact: true }).click()
        await assertSearch('', '')
        await search.fill('未提交的修改')
        await frame.getByRole('tab', { name: '业务使用手册', exact: true }).click()
        await assertSearch('', '')
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await page.getByRole('dialog', { name: '交互设计全屏预览', exact: true }).waitFor()
        await search.press('Escape')
        await page.getByRole('dialog', { name: '交互设计全屏预览', exact: true }).waitFor({ state: 'hidden' })
        await waitReady(page)
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(outputDir, 'ui-preview-help-ready.png') })
      },
    },
    ...[
      { name: 'script', script: "throw new Error('preview-startup-fixture')", expectedConsoleErrorPatterns: [/preview-startup-fixture/u] },
      { name: 'layout', script: "document.querySelector('.app').style.height = '0px'" },
      { name: 'empty', script: "document.querySelector('.app').replaceChildren()" },
      { name: 'timeout', script: 'window.requestAnimationFrame = function () { return 0 }' },
    ].map(({ name, script, expectedConsoleErrorPatterns }) => ({
      name: `dev-ui-design-preview-${name}-recovery`,
      path: '/__dev/ui-design?page=help',
      viewport: { width: 1440, height: 900 },
      expectedConsoleErrorPatterns,
      beforeNavigate: async (page) => {
        const fixture = `<!doctype html><html><head><style>html,body,.app{height:100%;margin:0}.app{overflow:hidden}</style></head><body><div class="app"><h1>预览恢复样例</h1></div><script>if(window.__ERP_UI_DESIGN_PREVIEW_ID__ === 'help-0') {${script}}</script></body></html>`
        await page.route((url) => url.pathname.endsWith('/docs/product/ui-design/index.html') && url.searchParams.has('raw'), (route) => route.fulfill({
          status: 200,
          contentType: 'text/javascript',
          body: `export default ${JSON.stringify(fixture)}`,
        }))
      },
      verify: async (page) => {
        if (name === 'timeout') {
          await page.getByText('正在加载交互预览', { exact: true }).waitFor()
        }
        const retry = page.getByRole('button', { name: /重新加载预览/u })
        await retry.waitFor({ timeout: UI_DESIGN_PREVIEW_TIMEOUT_MS + 5000 })
        await page.getByText('交互预览未能显示', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-dev-ui-design-stage').getAttribute('data-preview-failure'), name)
        assert.equal(await page.locator(frameSelector).getAttribute('tabindex'), '-1')
        await assertNoHorizontalOverflow(page)
        if (name === 'layout') {
          const original = await page.locator(frameSelector).elementHandle()
          const frame = page.frameLocator(frameSelector)
          await frame.locator('.app').evaluate((node) => { node.style.height = '100%' })
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
          await waitReady(page)
          assert.equal(await original.evaluate((node) => node.isConnected), true, '可见性恢复时在原窗口重检布局，不重置健康演示')
          await frame.locator('.app').evaluate((node) => { node.style.height = '0px' })
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
          await retry.waitFor()
          assert.equal(await page.locator('.erp-dev-ui-design-stage').getAttribute('data-preview-failure'), 'layout')
          await page.screenshot({ path: path.join(outputDir, 'ui-preview-layout-error.png') })
          await page.setViewportSize({ width: 390, height: 844 })
          await page.emulateMedia({ colorScheme: 'dark' })
          await assertNoHorizontalOverflow(page)
          assert.equal(await retry.isVisible(), true)
          await page.screenshot({ path: path.join(outputDir, 'ui-preview-layout-error-mobile.png') })
          await page.setViewportSize({ width: 1440, height: 900 })
        }

        await page.evaluate(() => {
          const frame = document.querySelector('iframe')
          for (const data of [
            { type: 'ui-design-preview-status', previewId: 'login-0', status: 'ready' },
            { type: 'ui-design-preview-status', previewId: 'help-0', status: 'unexpected' },
          ]) {
            window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }))
          }
          window.dispatchEvent(new MessageEvent('message', {
            source: window,
            data: { type: 'ui-design-preview-status', previewId: 'help-0', status: 'ready' },
          }))
        })
        assert.equal(await retry.isVisible(), true, '其他文档、过期入口及未知状态不能覆盖失败结果')
        await retry.click()
        const frame = await waitReady(page)
        await frame.getByRole('heading', { name: '预览恢复样例', exact: true }).waitFor()
        await page.evaluate(() => {
          window.dispatchEvent(new MessageEvent('message', {
            source: document.querySelector('iframe').contentWindow,
            data: { type: 'ui-design-preview-status', previewId: 'help-0', status: 'failed' },
          }))
        })
        assert.equal(await retry.isVisible(), false, '旧重置代次的回执不能污染已恢复的预览')
        await assertNoHorizontalOverflow(page)
      },
    })),
  ]
}
