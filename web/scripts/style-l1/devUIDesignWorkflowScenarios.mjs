import { openUIDesignAppearance, openUIDesignMobileTasks } from './devUIDesignNavigation.mjs'
import { chooseSelectOption, readSelectValue } from './selectControlActions.mjs'
import { readFile } from 'node:fs/promises'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { ERP_DARK_PALETTE } from '../../src/common/theme/erpThemePalette.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { createDevTaskGovernanceScenarios } from './devTaskGovernanceScenarios.mjs'
import { createDevRoleFlowScenarios } from './devRoleFlowScenarios.mjs'

export function createDevUIDesignWorkflowScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const open = async (page) => {
    await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
    const navigationPaint = await page
      .locator('.erp-dev-ui-design-reader:visible > .erp-dev-ui-design-toolbar')
      .evaluate((node) => {
        const css = getComputedStyle(node)
        return {
          background: getComputedStyle(node.parentElement).backgroundColor,
          toolbarBackground: css.backgroundColor,
          padding: css.padding,
        }
      })
    assert.deepEqual(navigationPaint, {
      background: 'rgb(255, 255, 255)',
      toolbarBackground: 'rgba(0, 0, 0, 0)',
      padding: '5px 12px',
    }, 'UI 设计预览操作由完整白色操作区承载')
    await page.locator('.erp-dev-ui-design-page > header').getByRole('tab', { name: '可交互设计', exact: true }).waitFor()
    await page.getByRole('button', { name: /全屏预览/ }).click()
    const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
    await frame.getByRole('button', { name: '业务汇总', exact: true }).waitFor()
    assert.equal(
      await frame.locator('.page-navigation').evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(255, 255, 255)',
      '交互设计同步呈现顶部操作区白底'
    )
    return frame
  }
  const shot = (page, name) => page.screenshot({ path: path.join(outputDir, `${name}.png`) })
  const verifyTaskCopyMenu = async (scope) => {
    const menu = scope.locator('.task-copy-menu')
    const copy = menu.getByRole('button', { name: '复制任务信息', exact: true })
    assert.equal(await menu.getAttribute('open'), null)
    assert.equal(await copy.isVisible(), false)
    await menu.getByLabel('更多操作', { exact: true }).click()
    await copy.waitFor()
    assert.equal(await copy.count(), 1)
    await menu.getByLabel('更多操作', { exact: true }).click()
    assert.equal(await copy.isVisible(), false)
  }
  const verifyTaskDetailFlow = async (page) => {
    const frame = await open(page)
    const openTask = (id) => frame.locator(`button[data-action="open-task"][data-id="${id}"]`).click()
    const next = () => frame.locator('[data-action="task-next"]').click()
    const closeReceipt = () => frame.locator('.modal [data-action="close-overlay"]').last().click()
    const closeTask = () => frame.locator('.drawer [data-action="close-drawer"]').first().click()
    const visibleActions = () => frame.locator('.drawer [data-action="task-choice"] strong').allTextContents()

    await openTask('T06')
    assert.equal(await frame.locator('.task-steps button').count(), 3)
    assert.equal(await frame.locator('.task-steps').isVisible(), true)
    assert.equal(await frame.locator('.task-focus-content .task-fused-meta > div').count(), 2)
    await verifyTaskCopyMenu(frame.locator('.drawer'))
    assert.equal(await frame.locator('.drawer .source-summary').count(), 0)
    await next()
    assert.deepEqual(await visibleActions(), ['完成本岗', '标记阻塞', '催办', '转交任务'])
    assert.equal(await frame.getByText('更多处理方式', { exact: true }).count(), 0)
    await frame.locator('[data-action="task-choice"][data-value="urge"]').click()
    await next()
    await next()
    assert.equal(await frame.locator('#task-note').evaluate((node) => node === document.activeElement), true)
    await frame.locator('#task-note').fill('请确认放行材料')
    await next()
    assert.match(await frame.locator('.modal-body').innerText(), /到期提醒/)
    await closeReceipt()

    await openTask('T06')
    await next()
    await frame.locator('[data-action="task-choice"][data-value="block"]').click()
    await next()
    await frame.locator('#task-note').fill('等待补齐装箱资料')
    await next()
    await closeReceipt()
    await openTask('T06')
    await next()
    assert.deepEqual(await visibleActions(), ['解除阻塞', '催办', '转交任务'])
    await next()
    await frame.locator('#task-note').fill('资料已经补齐')
    await next()
    await closeReceipt()

    await openTask('T01')
    await frame.getByRole('button', { name: '查看材料汇总', exact: true }).click()
    const materialSummary = frame.getByRole('dialog', { name: '材料汇总', exact: true })
    assert.equal(await materialSummary.locator('.material-summary-product').count(), 2)
    await materialSummary.getByRole('button', { name: '查看短毛绒 2mm部位用量', exact: true }).click()
    assert.match(await materialSummary.locator('#material-parts-0').innerText(), /1043.532.*182.0525/s)
    await materialSummary.locator('.material-summary-help summary').click()
    assert.match(await materialSummary.locator('.material-summary-help').innerText(), /不自动抵扣采购数量/)
    await materialSummary.getByRole('button', { name: '关闭材料汇总' }).press('Escape')
    assert.equal(await materialSummary.count(), 0)
    assert.equal(await frame.getByRole('button', { name: '查看材料汇总', exact: true }).evaluate((node) => node === document.activeElement), true)
    await frame.locator('.task-focus-content [data-action="task-context-open"]').click()
    assert.match(await frame.locator('.business-detail-modal').innerText(), /SO-20260925-001/)
    await frame.locator('.business-detail-modal [data-action="close-drawer"]').last().click()
    assert.match(await frame.locator('.drawer').innerText(), /审批工程用料申请/)
    assert.equal(await frame.locator('.task-focus-content [data-action="task-context-open"]').evaluate((node) => node === document.activeElement), true)
    await next()
    assert.deepEqual(await visibleActions(), ['审批通过', '审批退回', '标记阻塞', '催办', '转交任务'])
    assert.equal(await frame.getByText('跳过处理', { exact: true }).count(), 0)
    await shot(page, 'ui-task-actions-all-visible')
    await frame.locator('[data-action="task-choice"][data-value="assign"]').click()
    await next()
    assert.deepEqual(await frame.locator('#task-target option').allTextContents(), ['请选择接收人', '交回产品工程，由岗位人员处理', '周敏 · 产品工程'])
    await next()
    assert.equal(await frame.locator('#task-target').evaluate((node) => node === document.activeElement), true)
    await shot(page, 'ui-task-assignment-validation')
    await closeTask()

    await openTask('T02')
    assert.equal(await frame.locator('[data-action="task-next"]').count(), 0)
    await frame.locator('.drawer-foot [data-action="task-context-open"]').click()
    assert.match(await frame.locator('.business-detail-modal').innerText(), /PO-20260924-013/)
    await frame.locator('.business-detail-modal [data-action="close-drawer"]').last().click()
    await closeTask()

    return { frame, materialSummary }
  }
  return [
    ...createDevTaskGovernanceScenarios({ assert, outputDir, path }),
    ...createDevRoleFlowScenarios({ assert, outputDir, path }),
    {
      name: 'ui-design-persistent-operation-bar',
      path: '/__style-l1/persistent-operation-bar',
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        const source = prepareUIDesignSandboxSource(await readFile(new URL('../../../docs/product/ui-design/index.html', import.meta.url), 'utf8'))
        const srcdoc = source.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        await page.route('**/__style-l1/persistent-operation-bar', (route) => route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><head><style>html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto minmax(0,1fr)}h1{margin:0;font:14px system-ui}iframe{width:100%;height:100%;border:0}</style></head><body><h1>交互设计</h1><iframe title="ERP 当前交互设计" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe></body></html>`,
        }))
      },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 当前交互设计"]')
        await frame.getByRole('button', { name: '产品工程', exact: true }).click()
        const placeholder = frame.locator('.record-row--empty')
        await placeholder.waitFor({ state: 'visible' })
        assert.match(await placeholder.innerText(), /当前操作.*请选择一条记录/su)
        assert.doesNotMatch(await frame.locator('.command-row').innerText(), /先选记录|选中记录后/u)
        await frame.getByRole('checkbox', { name: '选择 BOM-20260925-001', exact: true }).check()
        assert.equal(await placeholder.count(), 0)
        let allActions
        for (const width of [1920, 1280, 768, 390, 320, 1440]) {
          await page.setViewportSize({ width, height: 1000 })
          await frame.locator('[data-adaptive-actions]').evaluate(async () => {
            await document.fonts.ready
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          })
          const geometry = await frame.locator('[data-adaptive-actions]').evaluate((bar) => {
            const visible = bar.querySelector('.business-action-visible')
            const menu = bar.querySelector('.business-action-menu')
            const buttons = [...visible.querySelectorAll('button')]
            const rect = bar.getBoundingClientRect()
            return {
              keys: [...bar.querySelectorAll('.business-action-group button')].map((button) => button.textContent.trim()).sort(),
              more: !menu.hidden,
              overflow: menu.querySelectorAll('.business-action-group').length,
              top: buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
              outside: buttons.some((button) => button.getBoundingClientRect().right > rect.right + 1),
            }
          })
          allActions ??= geometry.keys
          assert.deepEqual(geometry.keys, allActions, '原型缩放不遗漏既有操作')
          assert.ok(new Set(geometry.top).size <= 1, '原型直接按钮保持一行')
          assert.equal(geometry.outside, false, '原型按钮不超出可用宽度')
          assert.equal(geometry.more, geometry.overflow > 0, '原型仅溢出时显示更多操作')
          if (width === 1920) assert.equal(geometry.more, false, '原型宽度足够时全部直接显示')
        }
        await frame.getByRole('button', { name: '清空已选', exact: true }).click()
        await placeholder.waitFor({ state: 'visible' })
        const search = frame.getByRole('textbox', { name: '搜索', exact: true })
        await search.fill('不存在的BOM样例')
        await frame.getByText('没有匹配的记录', { exact: true }).first().waitFor({ state: 'visible' })
        assert.equal(await placeholder.count(), 0, '空列表不保留操作占位')
        await search.fill('')
        await placeholder.waitFor({ state: 'visible' })
        await shot(page, 'persistent-operation-bar-design')
      },
    },
    {
      name: 'dev-ui-design-business-orders-finance',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await open(page)
        const toolbar = frame.locator('.business-record-actions').first()
        const action = (id) => toolbar.locator(`[data-operation="${id}"]`)
        const confirm = () => frame.locator('[data-action="business-record-confirm"]').click()
        const closeDetails = async () => {
          for (let i = 0; i < 6 && await frame.getByRole('button', { name: '返回原视图', exact: true }).count(); i += 1) {
            await frame.getByRole('button', { name: '返回原视图', exact: true }).click()
          }
        }
        await frame.locator('.nav-item[data-page="purchase"]').click()
        await frame.locator('#list-search').fill('PO-20260925-008')
        await frame.locator('#list-search').press('Enter')
        await frame.locator('.table-wrap [data-action="select-row"]').first().check()
        await action('arrival').click()
        await frame.getByLabel('实点数量 1', { exact: true }).fill('240')
        await frame.getByLabel('送货标示数量 1', { exact: true }).fill('250')
        assert.match(await frame.locator('[data-arrival-difference="0"]').innerText(), /少 10/)
        await frame.locator('[data-action="save-compact-action"]').click()
        await action('related').click()
        const related = frame.getByRole('dialog', { name: '相关单据', exact: true })
        assert.match(await related.innerText(), /到货已登记并送检.*240 码；尚未入库/s)
        await related.locator('[data-action="business-record-back"]').last().click()
        await frame.locator('.nav-item[data-page="production-hub"]').click()
        await frame.locator('#list-search').fill('MO-20260922-026')
        await frame.locator('#list-search').press('Enter')
        await frame.locator('.table-wrap [data-action="select-row"]').first().check()
        await action('schedule').click()
        await frame.locator('#business-date').fill('2026-10-12')
        await chooseSelectOption(frame.locator('#business-line'), '车缝一组')
        await confirm()
        await closeDetails()
        await action('completion').click()
        await frame.locator('#business-quantity').fill('240')
        await frame.locator('#business-note').fill('首批完工，等待仓库核对。')
        await confirm()
        const completion = frame.getByRole('dialog', { name: '生产记录详情', exact: true })
        await completion.locator('.modal-head').getByText('草稿', { exact: true }).waitFor()
        assert.match(await completion.innerText(), /待仓库核对后入库/)
        await closeDetails()
        await frame.locator('.nav-item[data-page="finance-hub"]').click()
        await frame.locator('[data-action="status"][data-value="posted"]').click()
        await frame.locator('.table-wrap [data-action="select-row"]').first().check()
        const selected = frame.locator('.table-wrap tr.selected')
        const sourceId = await selected.getAttribute('data-row')
        await action('payment').click()
        await frame.locator('#business-amount').fill('100')
        await confirm()
        const payment = frame.getByRole('dialog', { name: '收付款单详情', exact: true })
        await payment.locator('.modal-head').getByText('待审批', { exact: true }).waitFor()
        await payment.locator('[data-operation="approval"]').click()
        await frame.locator('[data-action="task-next"]').click()
        await frame.locator('[data-action="task-next"]').click()
        await frame.locator('#task-note').fill('款项与银行记录已核对。')
        await frame.locator('[data-action="task-next"]').click()
        await frame.getByRole('dialog', { name: '任务办理回执', exact: true }).getByRole('button', { name: '关闭', exact: true }).last().click()
        await payment.locator('[data-operation="allocate"]').click()
        await chooseSelectOption(frame.locator('#business-fact'), `receivables:${sourceId}`)
        await frame.locator('#business-amount').fill('101')
        await confirm()
        await frame.getByRole('alert').filter({ hasText: '核销不能超额' }).waitFor()
        await frame.locator('#business-amount').fill('100')
        await confirm()
        await payment.locator('.modal-head').getByText('已核销', { exact: true }).waitFor()
        await payment.locator('[data-operation="reverse"]').click()
        await frame.locator('#business-reason').fill('演示原核销金额恢复。')
        await confirm()
        await payment.locator('.modal-head').getByText('已冲销', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'business-finance-result-4k.png'), scale: 'device' })
        await closeDetails()
        await frame.locator('.nav-item[data-page="warehouse-hub"]').click()
        await frame.locator('[data-action="module-tab"][data-value="inventory"]').click()
        await frame.locator('.table-wrap [data-action="select-row"]').first().check()
        const quantityBefore = await frame.locator('tr.selected .cell-metric').innerText()
        await action('inventory-work').click()
        await frame.getByRole('textbox', { name: '操作原因', exact: true }).fill('核对本次盘点差异。')
        await frame.getByRole('spinbutton', { name: '作业数量 1', exact: true }).fill('1200')
        await frame.locator('[data-action="save-form"]').click()
        await frame.locator('[data-action="back-list"]').click()
        assert.equal(await frame.locator('tr.selected .cell-metric').innerText(), quantityBefore, '保存作业草稿不改变台账数量')
        await action('inventory-work').click()
        assert.equal(await frame.getByRole('spinbutton', { name: '作业数量 1', exact: true }).inputValue(), '1200')
      },
    },
    {
      name: 'dev-ui-design-business-bom-actions',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await open(page)
        const toolbar = frame.locator('.business-record-actions').first()
        const action = (id) => toolbar.locator(`[data-operation="${id}"]`)
        const select = (id) => frame.locator(`.table-wrap [data-action="select-row"][data-id="${id}"]`).check()
        const confirm = () => frame.locator('[data-action="business-record-confirm"]').click()
        const back = () => frame.getByRole('button', { name: '返回原视图', exact: true }).click()
        await frame.locator('.nav-item[data-page="engineering-hub"]').click()
        await frame.locator('.record-row--placeholder').waitFor({ state: 'visible' })
        assert.equal(await toolbar.count(), 0, '未选记录时仅显示常驻引导')
        await select('bom-1')
        await toolbar.locator('[data-action="open-related-tasks"]').click()
        const relatedTasks = frame.getByRole('dialog', { name: '相关任务', exact: true })
        const sourceOrder = relatedTasks.getByRole('combobox', { name: '关联销售订单', exact: true })
        await sourceOrder.waitFor()
        assert.equal(await sourceOrder.locator('option:checked').innerText(), 'SO-20260925-001')
        await relatedTasks.getByRole('button', { name: '审批工程用料申请', exact: true }).waitFor()
        assert.equal(await relatedTasks.getByRole('button', { name: '新建跟进任务', exact: true }).isEnabled(), true)
        assert.equal(await frame.getByRole('dialog', { name: '订单详情', exact: true }).count(), 0, '关联订单在同一任务窗口核对')
        await relatedTasks.locator('.modal-foot').getByRole('button', { name: '关闭', exact: true }).click()
        await action('activate').click()
        await confirm()
        await frame.getByRole('dialog', { name: 'BOM详情', exact: true }).locator('.modal-head').getByText('已启用 · 只读', { exact: true }).waitFor()
        await back()
        assert.equal(await action('edit').isDisabled(), false)
        assert.equal(await action('edit').innerText(), '查看草稿（1）')
        assert.equal(await frame.locator('tr[data-row="bom-5"] .cell-status').innerText(), '历史版本', '同产品旧生效版本转历史')
        await select('bom-4')
        await action('archive').click()
        await confirm()
        await back()
        await frame.locator('[data-action="clear-selection"]').click()
        await select('bom-1')
        assert.equal(await action('activate').innerText(), '重新启用')
        await action('activate').click()
        await confirm()
        await back()
        await frame.locator('.table-wrap [data-action="select-row"][data-id="bom-1"]').uncheck()
        await select('bom-5')
        await action('copy-version').click()
        await frame.locator('[data-form-field="bom-version"]').fill('量产修订稿 B')
        await frame.locator('[data-form-field="usage-0"]').fill('1.26')
        await frame.locator('[data-action="save-form"]').click()
        await frame.locator('[data-action="back-list"]').click()
        await action('copy-version').click()
        assert.equal(await frame.locator('[data-form-field="bom-version"]').inputValue(), '量产修订稿 B 副本')
        assert.equal(await frame.locator('[data-form-field="usage-0"]').inputValue(), '1.26')
        await frame.locator('[data-form-field="usage-0"]').fill('2.5')
        await frame.locator('[data-action="save-form"]').click()
        await frame.locator('[data-action="back-list"]').click()
        for (const id of ['print-material', 'print-color', 'print-instruction']) {
          await action(id).click()
          await frame.locator('.print-paper').waitFor()
          if (id === 'print-material') {
            await frame.locator('[data-form-field="print-title"]').fill('材料分析核对稿')
            await frame.locator('[data-action="print-save-draft"]').click()
            const downloadEvent = page.waitForEvent('download')
            await frame.locator('[data-action="print-download"]').click()
            const download = await downloadEvent
            assert.match(download.suggestedFilename(), /物料分析明细表\.html$/)
            const file = path.join(outputDir, 'bom-print-download.html')
            await download.saveAs(file)
            assert.match(await readFile(file, 'utf8'), /材料分析核对稿/)
          }
          assert.match(await frame.locator('.paper-meta').innerText(), /BOM-20260926/)
          await frame.getByRole('button', { name: '返回业务页面', exact: true }).click()
        }
        await frame.locator('#list-search').fill('BOM-20260926-017')
        await frame.locator('#list-search').press('Enter')
        await frame.locator('.table-wrap [data-action="select-row"]').first().check()
        // The source draft and its copy keep separate material values.
        if (await frame.locator('[data-action="clear-selection"]').count()) {
          await frame.locator('[data-action="clear-selection"]').click()
          await frame.locator('.table-wrap [data-action="select-row"]').first().check()
        }
        await action('edit').click()
        assert.equal(await frame.locator('[data-form-field="usage-0"]').inputValue(), '1.26')
        await frame.locator('[data-action="back-list"]').click()
        await frame.locator('#list-search').fill('')
        await frame.locator('#list-search').press('Enter')
        const geometry = await frame.locator('.operation-surface').evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }))
        assert(geometry.scroll <= geometry.width + 1)
        await page.screenshot({ path: path.join(outputDir, 'business-bom-actions-4k.png'), scale: 'device' })
      },
    },
    {
      name: 'dev-ui-design-business-task-return',
      path: '/__dev/ui-design?page=task-handling',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        const drawer = frame.getByRole('dialog', { name: '任务办理', exact: true })
        const related = frame.getByRole('dialog', { name: '相关任务', exact: true })
        await frame.locator('.nav-item[data-page="sales"]').click()
        await frame.locator('#list-search').fill('SO-20260925-001')
        await frame.locator('#list-search').press('Enter')
        await frame.locator('.table-wrap [data-action="select-row"][data-id="S01"]').check()
        await page.screenshot({ path: path.join(outputDir, 'business-sales-actions-4k.png'), scale: 'device' })
        await frame.locator('.business-record-actions [data-action="open-related-tasks"]').click()
        await related.locator('button[data-action="open-task"][data-id="H01"]:visible').click()
        await drawer.getByRole('button', { name: '编制 BOM', exact: true }).click()
        await frame.locator('[data-action="add-material-group"]').first().click()
        await frame.locator('[data-form-field="usage-0"]').fill('0.92')
        await frame.locator('[data-action="handling-save-continue"]').click()
        await drawer.waitFor()
        assert.equal(await frame.locator('#list-search').inputValue(), 'SO-20260925-001')
        assert.equal(await frame.locator('.table-wrap [data-id="S01"][data-action="select-row"]').isChecked(), true)
        await page.screenshot({ path: path.join(outputDir, 'business-task-return-4k.png'), scale: 'device' })
        await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
        await related.waitFor()
        await related.locator('button[data-action="open-task"][data-id="H04"]:visible').click()
        await drawer.getByLabel('处理结果', { exact: true }).fill('图稿与包装警示语已核对，本次跟进完成。')
        await drawer.getByRole('button', { name: '记录并完成跟进', exact: true }).click()
        await drawer.getByRole('button', { name: '返回业务页面', exact: true }).click()
        const completedFollowup = related.locator('tr').filter({ hasText: '跟进包装图稿确认' })
        assert.match(await completedFollowup.innerText(), /已完成/u)
        await completedFollowup.locator('button[data-action="open-task"][data-id="H04"]').click()
        await drawer.getByText('图稿与包装警示语已核对，本次跟进完成。', { exact: true }).waitFor()
        await drawer.getByRole('button', { name: '返回业务页面', exact: true }).click()
        await related.getByRole('button', { name: '关闭', exact: true }).last().click()
        await frame.locator('.nav-item[data-page="tasks"]').click()
        await frame.getByRole('button', { name: '全部任务', exact: true }).click()
        await frame.locator('[data-action="board-status"][data-value="done"]').click()
        await frame.locator('.task-handling-table button[data-id="H04"]').click()
        assert.match(await drawer.innerText(), /图稿与包装警示语已核对/)
      },
    },
    {
      name: 'dev-ui-design-business-fact-actions',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await open(page)
        const toolbar = frame.locator('.business-record-actions').first()
        const action = (id) => toolbar.locator(`[data-operation="${id}"]`)
        const select = (id) => frame.locator(`.table-wrap [data-action="select-row"][data-id="${id}"]`).check()
        const back = () => frame.getByRole('button', { name: '返回原视图', exact: true }).click()
        await frame.locator('.nav-item[data-page="warehouse-hub"]').click()
        await select('inbound-1')
        await action('post').click()
        assert.equal(await readSelectValue(frame.locator('#business-warehouse')), '')
        await frame.locator('[data-action="business-record-confirm"]').click()
        await frame.locator('#business-warehouse').waitFor()
        await chooseSelectOption(frame.locator('#business-warehouse'), '原料仓')
        await frame.locator('[data-action="business-record-confirm"]').click()
        await frame.getByRole('dialog', { name: '入库单详情', exact: true }).locator('.modal-head').getByText('已入库', { exact: true }).waitFor()
        await back()
        assert.equal(await action('post').isDisabled(), true, '防止重复入库')
        await toolbar.locator('[data-action="open-related-tasks"]').click()
        const related = frame.getByRole('dialog', { name: '相关任务', exact: true })
        assert.match(await related.innerText(), /确认采购入库.*已完成/s)
        await related.getByRole('button', { name: '确认采购入库', exact: true }).click()
        const inboundResult = frame.getByRole('dialog', { name: '任务办理', exact: true })
        await inboundResult.locator('.drawer-head').getByText('办理结果', { exact: true }).waitFor()
        assert.match(await inboundResult.innerText(), /确认采购入库.*已完成/s)
        assert.equal(await inboundResult.locator('.task-handling-result[role="status"]').innerText(), 'RCV-20260926-006 已入账至原料仓，关联待办已完成。')
        await inboundResult.getByRole('button', { name: '返回业务页面', exact: true }).click()
        await related.waitFor()
        assert.match(await related.innerText(), /确认采购入库.*已完成/s)
        await related.getByRole('button', { name: '关闭', exact: true }).last().click()
        await frame.locator('.nav-item[data-page="shipping-hub"]').click()
        await select('shipments-1')
        assert.equal(await action('ship').isDisabled(), true)
        assert.equal(await action('receivable').isDisabled(), true)
        await action('release-review').click()
        const task = frame.getByRole('dialog').last()
        await task.locator('[data-action="task-next"]').click()
        await task.locator('[data-action="task-next"]').click()
        await frame.locator('#task-note').fill('已核对本次出货资料，同意放行。')
        await task.locator('[data-action="task-next"]').click()
        await frame.getByRole('dialog', { name: '任务办理回执', exact: true }).getByRole('button', { name: '关闭', exact: true }).last().click()
        assert.equal(await action('ship').isDisabled(), true, '放行不等于通过出货前检验')
        await action('inspection').click()
        const inspection = frame.getByRole('dialog', { name: '质检单详情', exact: true })
        assert.equal(await inspection.locator('[data-operation="submit"]').isDisabled(), true)
        await inspection.locator('[data-operation="checks"]').click()
        await chooseSelectOption(frame.getByLabel('检查结果 1', { exact: true }), '合格')
        await frame.locator('[data-action="save-compact-action"]').click()
        await inspection.locator('[data-operation="submit"]').click()
        await frame.locator('[data-action="business-record-confirm"]').click()
        await inspection.locator('[data-operation="pass"]').click()
        await frame.locator('[data-action="business-record-confirm"]').click()
        // Return through the originating detail and list without replacing the source selection.
        for (let depth = 0; depth < 6 && await frame.getByRole('button', { name: '返回原视图', exact: true }).count(); depth += 1) await back()
        assert.equal(await frame.getByRole('dialog').count(), 0)
        assert.equal(await action('ship').isEnabled(), true)
        await action('ship').click()
        await frame.locator('[data-action="business-record-confirm"]').click()
        const shipment = frame.getByRole('dialog', { name: '出货单详情', exact: true })
        await shipment.locator('.modal-head').getByText('已出货', { exact: true }).waitFor()
        assert.equal(await shipment.locator('[data-operation="ship"]').isDisabled(), true)
        await shipment.locator('[data-operation="receivable"]').click()
        await frame.getByRole('dialog', { name: '应收单详情', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'business-shipment-result-4k.png'), scale: 'device' })
      },
    },
    {
      name: 'dev-ui-design-task-handling',
      path: '/__dev/ui-design?page=task-handling',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        page.setDefaultTimeout(8000)
        await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
        await page.getByText('任务处理', { exact: true }).waitFor()
        await verifyMobileNavigationMotion(page, assert, '.erp-dev-ui-design-header .erp-sliding-tabs', 1)
        await verifyMobileNavigationMotion(page, assert, '.erp-dev-ui-design-header .erp-sliding-tabs', 0, true)
        await page.frameLocator('iframe[title="ERP 最新可交互设计"]').locator('.task-handling-board').waitFor()
        await page.screenshot({ path: path.join(outputDir, 'task-handling-workbench-4k.png'), scale: 'device' })
        await page.getByRole('button', { name: /全屏预览/ }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        const drawer = frame.getByRole('dialog', { name: '任务办理', exact: true })
        const openTask = (id) => frame.locator(`.task-handling-table button[data-id="${id}"]`).click()
        const capture = (name) => page.screenshot({ path: path.join(outputDir, `task-handling-${name}-4k.png`), scale: 'device' })
        const confirm = (name) => frame.getByRole('dialog', { name, exact: true }).getByRole('button', { name: '确认', exact: true }).click()
        await frame.locator('.task-handling-board').waitFor()
        assert.equal(await frame.locator('.nav-item[data-page="engineering-hub"]').count(), 1)
        assert.equal(await frame.locator('.task-handling-table tbody tr').count(), 8)
        await capture('list')
        await frame.getByRole('button', { name: '流程跟踪', exact: true }).click()
        await frame.locator('.task-board-table tbody tr td').first().click()
        const tracking = frame.getByRole('dialog', { name: '流程跟踪', exact: true })
        await tracking.getByRole('button', { name: '去处理工程资料', exact: true }).click()
        await drawer.getByRole('button', { name: '编制 BOM', exact: true }).waitFor()
        await drawer.getByRole('button', { name: '返回流程', exact: true }).click()
        await tracking.getByRole('button', { name: '返回列表', exact: true }).click()
        await frame.getByRole('button', { name: '异常跟踪', exact: true }).click()
        const exceptionStates = frame.getByRole('group', { name: '异常处理状态', exact: true })
        assert.deepEqual(await exceptionStates.locator('b').allTextContents(), ['1', '1', '0'])
        await exceptionStates.getByRole('button', { name: /^已处理完/ }).click()
        await frame.getByText('当前条件下没有匹配记录', { exact: true }).waitFor()
        assert.deepEqual(await exceptionStates.locator('b').allTextContents(), ['1', '1', '0'])
        await exceptionStates.getByRole('button', { name: /^未处理完/ }).click()
        for (const label of ['业务模块', '业务流程', '业务环节']) assert.equal(await frame.locator('.task-discovery-controls').getByText(label, { exact: true }).count(), 0)
        await chooseSelectOption(frame.getByRole('combobox', { name: '办理人', exact: true }), '仓管小王')
        assert.deepEqual(await exceptionStates.locator('b').allTextContents(), ['0', '0', '0'])
        await frame.getByRole('button', { name: '清除条件', exact: true }).click()
        assert.deepEqual(await exceptionStates.locator('b').allTextContents(), ['1', '1', '0'])
        await capture('exceptions')
        await frame.getByRole('button', { name: /^关联待办/ }).click()
        await frame.getByRole('button', { name: '查看关联任务', exact: true }).click()
        await drawer.getByRole('button', { name: '返回关联待办', exact: true }).click()
        await frame.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
        await frame.getByRole('button', { name: /^关联订单/ }).click()
        await frame.getByRole('heading', { name: /^关联订单/ }).waitFor()
        await frame.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
        assert.equal(await frame.getByRole('button', { name: '异常跟踪', exact: true }).getAttribute('aria-pressed'), 'true')
        await frame.getByRole('button', { name: '待我处理', exact: true }).click()
        await frame.locator('[data-action="board-status"][data-value="normal"]').click()
        await openTask('H01')
        await drawer.getByRole('button', { name: '查看来源单据', exact: true }).click()
        const source = frame.getByRole('dialog', { name: '订单详情', exact: true })
        await source.getByText('已生效', { exact: true }).waitFor()
        await source.getByRole('button', { name: '返回原视图', exact: true }).click()
        assert.equal(await drawer.getByRole('button', { name: '提交老板审核', exact: true }).isDisabled(), true)
        await capture('drawer')
        await drawer.getByRole('button', { name: '编制 BOM', exact: true }).click()
        await frame.locator('.form-view').waitFor()
        assert.equal(await frame.locator('.anchor-nav button').count(), 4)
        assert.equal(await frame.locator('[data-form-field="party"]').inputValue(), '节庆毛绒礼盒')
        assert.equal(await frame.locator('[data-form-field="source-order"]').inputValue(), 'SO-20260925-001')
        assert.equal(await frame.locator('[data-form-field="party"]').isDisabled(), true)
        await capture('bom')
        await frame.locator('[data-action="handling-save"]').click()
        await frame.getByRole('alert').filter({ hasText: '至少添加一项材料部位' }).waitFor()
        await frame.locator('[data-action="add-material-group"]').first().click()
        await frame.locator('[data-form-field="usage-0"]').fill('0')
        await frame.locator('[data-action="handling-save"]').click()
        await frame.getByRole('alert').filter({ hasText: '正数用量' }).waitFor()
        await frame.locator('[data-form-field="usage-0"]').fill('0.82')
        await frame.locator('[data-action="handling-save"]').click()
        assert.match(await frame.locator('.form-foot').innerText(), /草稿已保存.*任务办理中/)
        await capture('bom-filled')
        await frame.locator('[data-form-field="version-note"]').fill('补充绒向说明')
        await frame.locator('.form-foot [data-action="handling-return"]').click()
        await frame.getByRole('dialog').filter({ hasText: '未保存' }).waitFor()
        await frame.locator('[data-action="close-overlay"]').click()
        await frame.locator('[data-action="handling-save-continue"]').click()
        await drawer.waitFor()
        await drawer.getByRole('button', { name: '核对并启用', exact: true }).click()
        await confirm('启用量产 BOM')
        await drawer.getByRole('button', { name: '登记样品确认', exact: true }).click()
        await confirm('登记量产样品确认')
        await frame.getByRole('alert').filter({ hasText: '样品确认说明' }).waitFor()
        await frame.getByLabel('样品确认说明', { exact: true }).fill('已核对本轮样品、材料、部位与绒向。')
        await confirm('登记量产样品确认')
        await drawer.getByRole('button', { name: '提交老板审核', exact: true }).click()
        await frame.getByRole('dialog', { name: '提交本单用料审核', exact: true }).getByRole('button', { name: '确认提交', exact: true }).click()
        await drawer.getByText('工程用料已提交', { exact: true }).waitFor()
        await capture('receipt')
        await drawer.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await openTask('H01-review-1')
        await drawer.getByRole('button', { name: '退回工程', exact: true }).click()
        await frame.getByRole('alert').filter({ hasText: '退回原因' }).waitFor()
        await drawer.getByLabel('审核意见', { exact: true }).fill('请重新核对身体外皮损耗率。')
        const drawerGeometry = await drawer.locator('.drawer-body').evaluate((node) => ({
          width: node.clientWidth, scroll: node.scrollWidth,
        }))
        assert(drawerGeometry.scroll <= drawerGeometry.width + 1, '审核依据和意见应完整适配抽屉宽度')
        assert(await drawer.locator('thead th').first().evaluate((node) => node.clientWidth) >= 180, '材料列应保留可阅读宽度')
        await capture('approval')
        await drawer.getByRole('button', { name: '退回工程', exact: true }).click()
        await drawer.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await openTask('H01')
        await drawer.getByText('待工程修改', { exact: true }).waitFor()
        await drawer.getByRole('button', { name: '继续编制', exact: true }).click()
        assert.equal(await frame.locator('[data-form-field="usage-0"]').inputValue(), '0.82')
        await frame.locator('.form-foot [data-action="handling-return"]').click()
        await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
        await openTask('H02')
        await drawer.getByRole('button', { name: '确认通过，交财务', exact: true }).click()
        await page.keyboard.press('Escape')
        assert.equal(await frame.getByRole('dialog', { name: '通过并交财务审核', exact: true }).count(), 0)
        await drawer.getByRole('button', { name: '确认通过，交财务', exact: true }).click()
        await confirm('通过并交财务审核')
        await drawer.getByText('用料审核已通过', { exact: true }).waitFor()
        await drawer.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await openTask('H03')
        await drawer.getByRole('button', { name: '确认入库', exact: true }).click()
        const inbound = frame.getByRole('dialog', { name: '确认采购入库', exact: true })
        await inbound.getByRole('button', { name: '确认入库', exact: true }).click()
        await inbound.getByRole('alert').waitFor()
        await chooseSelectOption(inbound.getByLabel('入库仓库', { exact: true }), '原料仓')
        await capture('inbound')
        await inbound.getByRole('button', { name: '确认入库', exact: true }).click()
        assert.match(await drawer.innerText(), /已入账至原料仓.*关联待办已完成/)
        await drawer.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await openTask('H04')
        await drawer.getByRole('button', { name: '记录并完成跟进', exact: true }).click()
        await frame.getByRole('alert').filter({ hasText: '处理结果' }).waitFor()
        await drawer.getByLabel('处理结果', { exact: true }).fill('图稿已确认，警示语仍待业务补充。')
        await drawer.getByRole('button', { name: '记录并完成跟进', exact: true }).click()
        assert.match(await drawer.innerText(), /包装确认仍由对应业务办理/)
        await drawer.getByRole('button', { name: '返回任务列表', exact: true }).click()
        const geometry = await frame.locator('body').evaluate((node) => ({
          width: node.clientWidth, scroll: node.scrollWidth,
        }))
        assert(geometry.scroll <= geometry.width + 1, '任务处理预览不产生页面横向溢出')
        await page.getByRole('button', { name: /退出全屏/ }).click()
        await page.reload()
        await frame.locator('.task-handling-board').waitFor()
        assert.match(page.url(), /page=task-handling/)
      },
    },
    {
      name: 'dev-ui-design-task-tracking',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await frame.locator('.nav-item[data-action="nav"][data-page="tasks"]').click()
        await frame.locator('[data-action="open-task-filter"]').click()
        assert.equal(await frame.locator('[data-action="open-task-filter"]').getAttribute('aria-expanded'), 'true')
        await chooseSelectOption(frame.getByRole('combobox', { name: '负责岗位', exact: true }), { index: 1 })
        const directClear = frame.getByRole('group', { name: '筛选操作', exact: true }).getByRole('button', { name: '清空筛选', exact: true })
        await directClear.click()
        assert.equal(await frame.getByRole('dialog', { name: '筛选条件', exact: true }).count(), 0)
        assert.equal(await directClear.count(), 0)
        assert.equal(await frame.locator('[data-action="open-task-filter"]').evaluate((node) => node === document.activeElement), true)
        assert.equal(await frame.locator('[data-action="open-task-filter"]').getAttribute('aria-expanded'), 'false')
        await frame.locator('[data-action="open-task-filter"]').click()
        await chooseSelectOption(frame.getByRole('combobox', { name: '负责岗位', exact: true }), { index: 1 })
        assert.equal(await frame.getByRole('dialog', { name: '筛选条件', exact: true }).getByRole('button', { name: '清空筛选', exact: true }).isEnabled(), true)
        await frame.getByRole('dialog', { name: '筛选条件', exact: true }).getByRole('button', { name: '清空筛选', exact: true }).click()
        assert.equal(await readSelectValue(frame.getByRole('combobox', { name: '负责岗位', exact: true })), 'all')
        await frame.getByRole('button', { name: '完成', exact: true }).click()
        await frame.getByRole('button', { name: '流程跟踪', exact: true }).click()
        const pager = frame.getByRole('navigation', { name: '流转记录分页' })
        assert.match(await pager.innerText(), /第 1-1 条 \/ 共 1 条/)
        assert.equal(await readSelectValue(pager.getByRole('combobox', { name: '每页流转记录数' })), '20')
        await chooseSelectOption(pager.getByRole('combobox', { name: '每页流转记录数' }), '8')
        const row = frame.locator('.task-board-table tbody tr')
        assert.equal(await row.locator('.workbench-task-entry').count(), 0)
        await row.getByRole('button', { name: '复制 SO-20260925-001', exact: true }).click()
        assert.equal(await frame.getByRole('dialog', { name: '流程跟踪', exact: true }).count(), 0)
        await row.getByRole('button', { name: '查看浅棕小熊大图', exact: true }).click()
        await frame.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        assert.equal(await frame.getByRole('dialog', { name: '流程跟踪', exact: true }).count(), 0)
        await frame.locator('.task-board-table tbody tr td').nth(2).click()
        const progress = frame.getByRole('dialog', { name: '流程跟踪', exact: true })
        await progress.waitFor()
        assert.match(await progress.innerText(), /流转步骤.*订单审批.*工程资料/s)
        assert.equal(await progress.locator('.drawer-body [data-action="open-tracking-task"]').count(), 0)
        await progress.locator('.drawer-foot').getByRole('button', { name: '去处理工程资料', exact: true }).click()
        await frame.locator('.task-steps').waitFor()
        assert.match(await frame.locator('.task-steps').innerText(), /核对任务.*选择处理.*确认与结果/s)
        await frame.locator('.drawer-head').getByRole('button', { name: '返回流程', exact: true }).click()
        await progress.waitFor()
        await progress.getByRole('button', { name: '返回列表', exact: true }).click()
        await progress.waitFor({ state: 'hidden' })
        assert.equal(await frame.locator('.task-board-table tbody tr').count(), 1)
        assert.equal(await readSelectValue(pager.getByRole('combobox', { name: '每页流转记录数' })), '8')
        const states = frame.getByRole('group', { name: '流转状态', exact: true })
        assert.deepEqual(await states.locator('.filter-chip-count').allTextContents(), ['1', '1', '0'])
        await states.getByRole('button', { name: /^已结束/ }).click()
        await frame.getByText('当前筛选下没有记录', { exact: true }).waitFor()
        assert.deepEqual(await states.locator('.filter-chip-count').allTextContents(), ['1', '1', '0'])
        await frame.locator('[data-action="open-task-filter"]').click()
        await frame.getByRole('group', { name: '跟踪范围', exact: true }).getByRole('button', { name: '我参与的', exact: true }).click()
        assert.equal(await states.getByRole('button', { name: /^全部状态/ }).getAttribute('aria-pressed'), 'true')
        await frame.getByRole('button', { name: '完成', exact: true }).click()
        await frame.locator('[data-action="open-task-filter"]').click()
        await frame.getByRole('group', { name: '跟踪范围', exact: true }).getByRole('button', { name: '相关流程', exact: true }).click()
        assert.equal(await states.getByRole('button', { name: /^已结束/ }).getAttribute('aria-pressed'), 'true')
        await frame.getByRole('dialog', { name: '筛选条件', exact: true }).getByRole('button', { name: '清空筛选', exact: true }).click()
        await frame.getByLabel('开始日期', { exact: true }).fill('2099-01-01')
        await frame.getByText('当前筛选下没有记录', { exact: true }).waitFor()
        await frame.getByRole('dialog', { name: '筛选条件', exact: true }).getByRole('button', { name: '清空筛选', exact: true }).click()
        await frame.getByRole('button', { name: '完成', exact: true }).click()
        await frame.locator('.nav-item[data-action="nav"][data-page="sales"]').click()
        assert.ok(await frame.locator('#view tr[data-row]').count() > 0)
        await frame.locator('[data-action="open-filter"]').click()
        const filters = frame.locator('#filter-popover')
        assert.equal(await filters.getByRole('button', { name: '应用筛选', exact: true }).count(), 0)
        await filters.getByLabel('开始日期', { exact: true }).fill('2099-01-01')
        assert.equal(await frame.locator('#view tr[data-row]').count(), 0, '日期选择应立即更新列表')
        await filters.getByLabel('开始日期', { exact: true }).fill('')
        assert.ok(await frame.locator('#view tr[data-row]').count() > 0, '清空日期应立即恢复列表')
      },
    },
    {
      name: 'dev-ui-design-column-settings',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await frame.locator('[data-action="nav"][data-page="sales"]').click()
        const headers = frame.locator('.table-wrap .sort-btn')
        const before = await headers.allTextContents()
        const openSettings = async () => {
          await frame.getByRole('button', { name: '表格工具', exact: true }).click()
          await frame.getByRole('button', { name: '列设置', exact: true }).click()
        }
        const dialog = frame.getByRole('dialog', { name: '列设置', exact: true })
        await openSettings()
        assert(!(await dialog.getByRole('checkbox', { name: '当前进度', exact: true }).isChecked()))
        await dialog.getByRole('button', { name: '全部显示', exact: true }).click()
        assert.deepEqual(await headers.allTextContents(), before, '草稿不改变表格')
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await openSettings()
        assert(!(await dialog.getByRole('checkbox', { name: '当前进度', exact: true }).isChecked()), '关闭放弃草稿')
        const firstColumn = await dialog.locator('[data-column-key]').first().getAttribute('data-column-key')
        await dialog.getByRole('button', { name: '当前进度 拖动排列', exact: true }).dragTo(dialog.locator('[data-column-key]').first())
        assert.equal(await dialog.locator('[data-column-key]').first().getAttribute('data-column-key'), 'progress')
        await dialog.getByText('有未保存的调整', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await openSettings()
        assert.equal(await dialog.locator('[data-column-key]').first().getAttribute('data-column-key'), firstColumn, '取消放弃排列草稿')
        await dialog.getByRole('button', { name: '全部显示', exact: true }).click()
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        assert.equal(await headers.count(), before.length + 1)
        await openSettings()
        await dialog.getByRole('button', { name: '恢复默认', exact: true }).click()
        assert.equal(await headers.count(), before.length + 1, '恢复默认也须完成后生效')
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        assert.deepEqual(await headers.allTextContents(), before)
      },
    },
    {
      name: 'dev-ui-design-mobile-progress-task-entry',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await openUIDesignMobileTasks(frame)
        await page.setViewportSize({ width: 390, height: 844 })
        await frame.locator('[data-action="mobile-main"][data-value="progress"]').click()
        const firstCard = frame.locator('.rm-progress-card').first()
        assert.equal(await firstCard.locator('button button').count(), 0, '图片预览与进度入口保持独立按钮')
        const firstImage = firstCard.locator('[data-action="product-image-preview"]')
        const imageBox = await firstImage.boundingBox()
        assert.equal(imageBox.width, 64)
        assert.equal(imageBox.height, 64)
        await firstImage.click()
        await frame.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        assert.equal(await frame.locator('#mobile-progress-search').count(), 1, '点图片仍留在进度列表')
        await shot(page, 'ui-mobile-progress-product-images')
        const previewViewport = page.viewportSize()
        await page.setViewportSize({ width: 390, height: 640 })
        const progressScroll = frame.locator('#mobile-task-scroll')
        await progressScroll.evaluate((node) => { node.scrollTop = 400 })
        const backTop = frame.getByRole('button', { name: '回到顶部', exact: true })
        await backTop.waitFor({ state: 'visible' })
        await backTop.click()
        await backTop.waitFor({ state: 'hidden' })
        const scrollHandle = await progressScroll.elementHandle()
        await (await scrollHandle.ownerFrame()).waitForFunction((node) => node.scrollTop <= 2, scrollHandle)
        await page.setViewportSize(previewViewport)
        const emptyEntry = frame.locator('.rm-progress-task.empty')
        assert.equal(await emptyEntry.innerText(), '暂无待处理任务')
        assert.equal(await emptyEntry.locator('button, svg').count(), 0)
        assert.equal(await emptyEntry.evaluate((node) => node.tagName), 'DIV')
        const single = frame.locator('[data-action="mobile-progress-tasks"][data-id="MP02"]')
        assert.match(await single.innerText(), /跟进客供包装到仓/)
        const designSearch = frame.locator('#mobile-progress-search')
        const designQuery = frame.locator('.rm-progress-controls .rm-query')
        const designCollapsed = await designSearch.locator('..').boundingBox()
        const designRowBefore = await designQuery.boundingBox()
        const designCardCount = await frame.locator('.rm-progress-card').count()
        await designSearch.click()
        const designHandle = await designSearch.elementHandle()
        const designFrame = await designHandle.ownerFrame()
        await designFrame.waitForFunction((input) => {
          const wrapper = input.closest('.rm-search').getBoundingClientRect()
          const row = input.closest('.rm-query').getBoundingClientRect()
          return Math.abs(wrapper.right - row.right) < 2
        }, designHandle)
        const designExpanded = await designSearch.locator('..').boundingBox()
        assert(designExpanded.width > designCollapsed.width + 20, '设计原型聚焦后横向展开')
        assert.equal((await designQuery.boundingBox()).height, designRowBefore.height, '设计原型展开不挤动列表')
        for (const button of await designSearch.locator('..').getByRole('button').all()) {
          const box = await button.boundingBox()
          assert(box.width >= 44 && box.height >= 44, '设计原型搜索按钮保留 44px 触摸区')
        }
        await designSearch.fill('品牌吉祥物')
        assert.equal(await frame.locator('.rm-progress-card').count(), designCardCount, '设计原型输入不触发搜索')
        await designSearch.press('Enter')
        assert.equal(await designSearch.evaluate((node) => node === document.activeElement), false)
        await designFrame.waitForFunction(() => !document.querySelector('#mobile-progress-search').closest('.rm-search').classList.contains('search-expanded'))
        await single.click()
        await frame.getByRole('heading', { name: '跟进客供包装到仓', exact: true }).waitFor()
        assert.equal(await frame.locator('.rm-business-details').count(), 0)
        await frame.locator('[data-action="mobile-back"]').click()
        assert.equal(await frame.locator('#mobile-progress-search').inputValue(), '品牌吉祥物')
        assert.equal(await frame.locator('[data-action="mobile-main"][data-value="progress"]').getAttribute('aria-current'), 'page')
        await frame.locator('#mobile-progress-search').fill('')
        await frame.locator('#mobile-progress-search').press('Enter')
        await frame.locator('[data-action="mobile-progress-view"][data-value="production"]').click()
        assert.equal(await frame.locator('.rm-progress-card .rm-card-image').count(), 1, '缺图产品使用统一占位')
        const multiple = frame.locator('[data-action="mobile-progress-tasks"][data-id="MP03"]')
        assert.match(await multiple.innerText(), /确认本厂或外发安排.*共 2 项待办/s)
        await multiple.click()
        await frame.getByRole('heading', { name: '进度详情', exact: true }).waitFor()
        assert.equal(await frame.locator('[data-action="mobile-progress-detail-group"][data-value="tasks"]').getAttribute('aria-expanded'), 'true')
        const linked = frame.locator('[data-action="mobile-open-linked-task"]')
        assert.equal(await linked.count(), 2)
        await frame.locator('[data-action="mobile-open-linked-task"][data-id="M13"]').click()
        await frame.getByRole('heading', { name: '核对包装资料', exact: true }).waitFor()
        await frame.locator('[data-action="mobile-back"]').click()
        await frame.getByRole('heading', { name: '进度详情', exact: true }).waitFor()
        assert.equal(await linked.count(), 2)
        await shot(page, 'ui-mobile-progress-task-entry')
        await frame.locator('.rm-action-bar [data-action="mobile-progress-back"]').click()
        assert.match(await multiple.innerText(), /共 2 项待办/)
        await frame.locator('[data-action="mobile-options"]').click()
        const filters = frame.getByRole('dialog', { name: '进度筛选', exact: true })
        await filters.getByRole('button', { name: /^已逾期\s*\d/ }).click()
        await filters.getByRole('button', { name: '已结束', exact: true }).click()
        assert.equal(await filters.getByRole('button', { name: /^不限交期\s*\d/ }).getAttribute('aria-pressed'), 'true')
        for (const label of ['已逾期', '7天内到期', '仅看任务受阻']) {
          assert.equal(await filters.getByRole('button', { name: new RegExp(`^${label}\\s*\\d`) }).count(), 0)
        }
        await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        assert.match(await multiple.innerText(), /共 2 项待办/)
      },
    },
    {
      name: 'dev-ui-design-mobile-task-recovery',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await openUIDesignMobileTasks(frame)
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(await frame.locator('.rm-task-card[data-id="M01"] .rm-card-head .badge').innerText(), '待处理', '截止风险放在时间区，不替换任务状态')
        const card = frame.locator('.rm-task-card[data-id="M02"]')
        assert.equal(await card.locator('.rm-card-head > strong').innerText(), '确认采购到货差异')
        assert.match(await card.locator('.rm-card-product').innerText(), /塑料眼/u)
        assert.equal(await card.locator('.rm-card-head .badge').innerText(), '受阻')
        assert.match(await card.locator('.rm-card-foot').innerText(), /仓库 · 未指定办理人/u)
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 })
          const geometry = await card.evaluate((node) => {
            const title = node.querySelector('.rm-card-head > strong').getBoundingClientRect()
            const status = node.querySelector('.rm-card-head .badge').getBoundingClientRect()
            const body = node.querySelector('.rm-card-body').getBoundingClientRect()
            const source = node.querySelector('.rm-card-source').getBoundingClientRect()
            return { titleRight: title.right, statusLeft: status.left, bodyTop: body.top, titleBottom: title.bottom, sourceTop: source.top, bodyBottom: body.bottom, overflow: node.scrollWidth > node.clientWidth + 1 }
          })
          assert(geometry.titleRight <= geometry.statusLeft, '长任务标题不挤压任务状态')
          assert(geometry.bodyTop >= geometry.titleBottom)
          assert(geometry.sourceTop >= geometry.bodyBottom)
          assert.equal(geometry.overflow, false)
          await assertNoHorizontalOverflow(page, `手机版任务预览-${width}`)
        }
        const openTask = () => frame.locator('[data-action="mobile-open-task"][data-id="M02"]').click()
        await openTask()
        assert.equal(await frame.locator('.rm-steps button').count(), 3)
        assert.equal(await frame.locator('.rm-steps').isVisible(), true)
        await verifyTaskCopyMenu(frame.locator('.rm-flow-topbar'))
        assert.equal(await frame.locator('.rm-source-summary').count(), 0)
        assert.equal(await frame.locator('[data-action="mobile-source-open"]').count(), 0)
        await frame.locator('[data-action="mobile-open-process"]').click()
        assert.deepEqual(await frame.locator('.rm-choice-list').first().locator('strong').allTextContents(), ['解除阻塞', '催办'])
        await frame.locator('#mobile-reason').fill('数量差异已经核实')
        await frame.locator('[data-action="mobile-submit"]').click()
        await frame.locator('[data-action="mobile-return-list"]').click()
        await openTask()
        assert.equal(await frame.locator('.rm-action-bar [data-action="mobile-open-process"]').innerText(), '处理任务')
        assert.equal(await frame.locator('.rm-action-bar [data-action="mobile-source-open"]').count(), 0)
        await frame.locator('[data-action="mobile-open-process"]').click()
        assert.deepEqual(await frame.locator('.rm-choice-list').first().locator('strong').allTextContents(), ['完成本岗', '标记阻塞', '催办'])
        await frame.locator('[data-action="mobile-action-choice"][data-value="blocked"]').click()
        await frame.locator('#mobile-reason').fill('等待供应商补齐凭据')
        await frame.locator('[data-action="mobile-submit"]').click()
        await frame.locator('[data-action="mobile-return-list"]').click()
        await openTask()
        await frame.locator('[data-action="mobile-open-process"]').click()
        await frame.locator('[data-action="mobile-action-choice"][data-value="urge"]').click()
        await frame.locator('#mobile-reason').fill('请提供凭据')
        await frame.locator('[data-action="mobile-submit"]').click()
        assert.match(await frame.locator('.rm-task-identity .badge').innerText(), /阻塞/)
        await frame.locator('[data-action="mobile-return-list"]').click()
        await openTask()
        assert.match(await frame.locator('.rm-callout.danger').innerText(), /等待供应商补齐凭据/)
        await shot(page, 'ui-mobile-task-collaboration-recovery')
      },
    },
    {
      name: 'dev-ui-design-task-detail-focus',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: verifyTaskDetailFlow,
    },
    {
      name: 'dev-ui-design-task-summary-flow',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const { frame, materialSummary } = await verifyTaskDetailFlow(page)

        await frame.getByRole('button', { name: '业务汇总', exact: true }).click()
        assert.deepEqual(await frame.locator('.summary-table th').allTextContents(), ['订单号', '产品', '审批状态', '提交时间', '查看'])
        await frame.locator('#dashboard-summary-search').fill('IP 联名')
        await frame.locator('#dashboard-summary-search').press('Enter')
        assert.equal(await frame.locator('.summary-table tbody tr').count(), 1)
        await frame.locator('[data-action="open-material-summary"]').click()
        assert.match(await materialSummary.innerText(), /SO-20260924-006/)
        await materialSummary.locator('xpath=..').click({ position: { x: 4, y: 4 } })
        await materialSummary.waitFor({ state: 'hidden' })
        assert.equal(await frame.locator('#dashboard-summary-search').inputValue(), 'IP 联名')
        const downloadPromise = page.waitForEvent('download')
        await frame.getByRole('button', { name: '导出当前汇总', exact: true }).click()
        const download = await downloadPromise
        const csvPath = path.join(outputDir, 'engineering-summary.csv')
        await download.saveAs(csvPath)
        const csv = await readFile(csvPath, 'utf8')
        assert.match(csv, /SO-20260924-006/)
        assert.doesNotMatch(csv, /SO-20260925-001|已采购|待采购/)
        await frame.locator('[data-action="dashboard-summary-type"][data-value="sales"]').click()
        assert.match(await frame.locator('.summary-table').innerText(), /待核对/)
        assert.equal(await frame.locator('.summary-table .difference').count(), 0)
        const summaryGeometry = await frame
          .locator('.summary-table-wrap')
          .evaluate((wrap) => ({
            leftInset:
              wrap.getBoundingClientRect().left -
              wrap.closest('.summary-workspace').getBoundingClientRect().left,
            horizontalRange: wrap.scrollWidth - wrap.clientWidth,
          }))
        assert(summaryGeometry.leftInset >= 11)
        const summaryScrollActions = frame.locator('.summary-scroll-actions')
        assert.equal(
          await summaryScrollActions.isVisible(),
          summaryGeometry.horizontalRange > 2
        )
        if (summaryGeometry.horizontalRange > 2) {
          const rightArrow = summaryScrollActions.getByRole('button', { name: '向右查看列' })
          const rightBox = await rightArrow.boundingBox()
          await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2)
          await rightArrow.click()
          await frame.locator('.summary-table-wrap').evaluate((wrap) =>
            new Promise((resolve) => {
              const check = () =>
                wrap.scrollLeft > 1 ? resolve() : requestAnimationFrame(check)
              check()
            })
          )
          const leftArrow = summaryScrollActions.getByRole('button', { name: '向左查看列' })
          const leftBox = await leftArrow.boundingBox()
          await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2)
          await leftArrow.click()
          await frame.locator('.summary-table-wrap').evaluate((wrap) =>
            new Promise((resolve) => {
              const check = () =>
                wrap.scrollLeft <= 1 ? resolve() : requestAnimationFrame(check)
              check()
            })
          )
        }
        await frame.locator('[data-action="dashboard-summary-type"][data-value="outsourcing"]').click()
        assert.doesNotMatch((await frame.locator('.summary-table th').allTextContents()).join(' '), /已发出|已回货|未回/)
        await shot(page, 'ui-summary-contract-scope')

        await frame.locator('[data-action="nav"][data-page="progress"]').first().click()
        assert.equal(await frame.locator('.progress-compact-table tbody tr').count(), 3)
        await frame.locator('[data-action="progress-view"][data-value="production"]').click()
        assert.equal(await frame.locator('.progress-compact-table tbody tr').count(), 1)
        assert.match(await frame.locator('.progress-compact-table tbody').innerText(), /MO-/)
        await frame.locator('#progress-search').fill('没有这样的产品')
        await frame.locator('#progress-search').press('Enter')
        assert.equal(await frame.locator('.progress-compact-table tbody tr').count(), 0)
        assert.equal(await frame.locator('.progress-summary').count(), 0)
        assert.match(await frame.locator('.progress-list').innerText(), /没有符合条件/)
        assert.equal(await frame.locator('[data-action="progress-open-detail"]').count(), 0)

        await frame.locator('[data-action="nav"][data-page="help"]').first().click()
        const entryButton = frame.locator('#rh-entryButton')
        assert.equal(await entryButton.isVisible(), false, '帮助首页先选择具体办事场景')
        const recommendation = frame.getByRole('region', { name: '帮助首页', exact: true })
          .getByRole('navigation', { name: '推荐办事场景', exact: true })
          .locator('button[data-scene]').first()
        const sceneTitle = await recommendation.locator('strong').innerText()
        await recommendation.click()
        assert.equal(await frame.locator('#rh-sceneTitle').innerText(), sceneTitle)
        await entryButton.waitFor()
        await entryButton.click()
        const entryDialog = frame.locator('#rh-entryDialog')
        await entryDialog.waitFor()
        const frameBox = await page
          .locator('iframe[title="ERP 最新可交互设计"]')
          .boundingBox()
        const dialogBox = await entryDialog.boundingBox()
        assert.ok(frameBox && dialogBox)
        await page.mouse.click(
          Math.max(frameBox.x + 4, dialogBox.x - 12),
          dialogBox.y + 12
        )
        await entryDialog.waitFor({ state: 'hidden' })
        assert.equal(
          await entryButton.evaluate((node) => node === document.activeElement),
          true
        )
      },
    },
    {
      name: 'dev-ui-design-narrow-data-access',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await frame.locator('[data-action="nav"][data-page="sales"]').click()
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(await frame.locator('.mobile-card-list').isVisible(), true)
        assert.equal(await frame.locator('.table-footer .pager').isVisible(), true)
        const firstPage = await frame.locator('.mobile-card-list .entity-link').allTextContents()
        assert.ok(firstPage.length > 0)
        assert.equal(await readSelectValue(frame.locator('#business-page-size')), '50')
        assert.equal(await frame.locator('.table-footer [data-action="page-next"]').isEnabled(), false, '当前演示数据不足一页，不显示虚假下一页')
        await shot(page, 'ui-mobile-business-default-page')
        await frame.locator('[data-action="open-nav"]').click()
        await frame.locator('#sidebar [data-action="nav"][data-page="audit"]').click()
        assert.equal(await frame.locator('.audit-table').isVisible(), true)
        assert.ok(await frame.locator('.audit-table tbody tr').count() > 0)
        const overflow = await frame.locator('body').evaluate((body) => ({
          page: body.scrollWidth - innerWidth,
          table: document.querySelector('.audit-data-surface .table-wrap').scrollWidth - document.querySelector('.audit-data-surface .table-wrap').clientWidth,
        }))
        assert.ok(overflow.page <= 1, JSON.stringify(overflow))
        assert.ok(overflow.table > 0, JSON.stringify(overflow))
        await frame.locator('[data-action="audit-open"]').first().click()
        assert.match(await frame.locator('.drawer').innerText(), /字段变化/)
        await frame.locator('.drawer [data-action="close-drawer"]').first().click()
        await shot(page, 'ui-mobile-audit-access')
        await page.setViewportSize({ width: 1440, height: 900 })
        await openUIDesignAppearance(frame)
        await frame.locator('[data-action="set-mode"][data-value="dark"]').click()
        await frame.locator('[data-action="close-overlay"]').last().click()
        const colors = await frame.locator('body').evaluate((body) => {
          const sample = document.createElement('span')
          sample.style.color = 'var(--text-3)'
          sample.style.background = 'var(--surface)'
          body.append(sample)
          const root = getComputedStyle(body)
          const result = {
            foreground: getComputedStyle(sample).color,
            background: getComputedStyle(sample).backgroundColor,
            palette: {
              page: root.getPropertyValue('--canvas').trim(),
              shell: root.getPropertyValue('--shell').trim(),
              surface: root.getPropertyValue('--surface').trim(),
              raised: root.getPropertyValue('--surface-raised').trim(),
              soft: root.getPropertyValue('--surface-muted').trim(),
            },
          }
          sample.remove()
          return result
        })
        assert.deepEqual(
          colors.palette,
          {
            page: ERP_DARK_PALETTE.page,
            shell: ERP_DARK_PALETTE.shell,
            surface: ERP_DARK_PALETTE.surface,
            raised: ERP_DARK_PALETTE.surfaceRaised,
            soft: ERP_DARK_PALETTE.surfaceSoft,
          },
          '交互设计未使用统一黑色暗色调色板'
        )
        assert.ok(getContrastRatio(parseRgb(colors.foreground), parseRgb(colors.background)) >= 4.5, JSON.stringify(colors))
        await shot(page, 'ui-audit-dark')
      },
    },
  ]
}
