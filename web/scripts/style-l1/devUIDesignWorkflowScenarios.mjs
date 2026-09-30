import { readFile } from 'node:fs/promises'
import { ERP_DARK_PALETTE } from '../../src/common/theme/erpThemePalette.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

export function createDevUIDesignWorkflowScenarios({ assert, outputDir, path }) {
  const open = async (page) => {
    await page.getByRole('heading', { name: 'UI 交互设计', exact: true }).waitFor()
    const navigationPaint = await page
      .locator('.erp-dev-ui-design-page > .erp-sliding-tabs > .ant-tabs-nav')
      .evaluate((node) => {
        const css = getComputedStyle(node)
        return { background: css.backgroundColor, padding: css.padding }
      })
    assert.deepEqual(navigationPaint, {
      background: 'rgb(255, 255, 255)',
      padding: '10px 12px',
    }, 'UI 设计导航由完整白色操作区承载')
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
  return [
    {
      name: 'dev-ui-design-column-settings',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await frame.locator('[data-action="nav"][data-page="sales"]').click()
        const headers = frame.locator('.table-wrap .sort-btn')
        const before = await headers.allTextContents()
        const openSettings = () => frame.getByRole('button', { name: '列设置', exact: true }).click()
        const dialog = frame.getByRole('dialog', { name: '列设置', exact: true })
        await openSettings()
        assert(!(await dialog.getByRole('checkbox', { name: '当前进度', exact: true }).isChecked()))
        await dialog.getByRole('button', { name: '全部显示', exact: true }).click()
        assert.deepEqual(await headers.allTextContents(), before, '草稿不改变表格')
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await openSettings()
        assert(!(await dialog.getByRole('checkbox', { name: '当前进度', exact: true }).isChecked()), '关闭放弃草稿')
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
        await frame.locator('[data-action="open-mobile-tasks"]').click()
        await page.setViewportSize({ width: 390, height: 844 })
        await frame.locator('[data-action="mobile-main"][data-value="progress"]').click()
        const emptyEntry = frame.locator('.rm-progress-task.empty')
        assert.equal(await emptyEntry.innerText(), '暂无待处理任务')
        assert.equal(await emptyEntry.locator('button, svg').count(), 0)
        assert.equal(await emptyEntry.evaluate((node) => node.tagName), 'DIV')
        const single = frame.locator('[data-action="mobile-progress-tasks"][data-id="MP02"]')
        assert.match(await single.innerText(), /任务：跟进客供包装到仓/)
        await frame.locator('#mobile-progress-search').fill('品牌吉祥物')
        await single.click()
        await frame.getByRole('heading', { name: '跟进客供包装到仓', exact: true }).waitFor()
        assert.equal(await frame.locator('.rm-business-details').count(), 0)
        await frame.locator('[data-action="mobile-back"]').click()
        assert.equal(await frame.locator('#mobile-progress-search').inputValue(), '品牌吉祥物')
        assert.equal(await frame.locator('[data-action="mobile-main"][data-value="progress"]').getAttribute('aria-current'), 'page')
        await frame.locator('#mobile-progress-search').fill('')
        await frame.locator('[data-action="mobile-progress-view"][data-value="production"]').click()
        const multiple = frame.locator('[data-action="mobile-progress-tasks"][data-id="MP03"]')
        assert.match(await multiple.innerText(), /2 项待处理.*首要：确认本厂或外发安排/s)
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
        assert.match(await multiple.innerText(), /2 项待处理/)
      },
    },
    {
      name: 'dev-ui-design-mobile-task-recovery',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        await frame.locator('[data-action="open-mobile-tasks"]').click()
        await page.setViewportSize({ width: 390, height: 844 })
        const openTask = () => frame.locator('[data-action="mobile-open-task"][data-id="M02"]').click()
        await openTask()
        assert.equal(await frame.locator('.rm-source-summary').count(), 0)
        await frame.locator('[data-action="mobile-source-open"]').click()
        assert.match(await frame.locator('.business-detail-modal').innerText(), /PO-20260924-013/)
        await frame.locator('.business-detail-modal [data-action="close-drawer"]').last().click()
        await frame.locator('[data-action="mobile-open-process"]').click()
        assert.deepEqual(await frame.locator('.rm-choice-list').first().locator('strong').allTextContents(), ['解除阻塞', '催办'])
        await frame.locator('#mobile-reason').fill('数量差异已经核实')
        await frame.locator('[data-action="mobile-submit"]').click()
        await frame.locator('[data-action="mobile-return-list"]').click()
        await openTask()
        assert.equal(await frame.locator('.rm-action-bar').innerText(), '处理任务')
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
        assert.match(await frame.locator('.rm-flow-status').innerText(), /阻塞/)
        await frame.locator('[data-action="mobile-return-list"]').click()
        await openTask()
        assert.match(await frame.locator('.rm-callout.danger').innerText(), /等待供应商补齐凭据/)
        await shot(page, 'ui-mobile-task-collaboration-recovery')
      },
    },
    {
      name: 'dev-ui-design-task-summary-flow',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = await open(page)
        const openTask = (id) => frame.locator(`button[data-action="open-task"][data-id="${id}"]`).click()
        const next = () => frame.locator('[data-action="task-next"]').click()
        const closeReceipt = () => frame.locator('.modal [data-action="close-overlay"]').last().click()
        const closeTask = () => frame.locator('.drawer [data-action="close-drawer"]').first().click()
        const visibleActions = () => frame.locator('.drawer [data-action="task-choice"] strong').allTextContents()

        await openTask('T06')
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
        await frame.locator('[data-action="task-context-open"]').click()
        assert.match(await frame.locator('.business-detail-modal').innerText(), /SO-20260925-001/)
        await frame.locator('.business-detail-modal [data-action="close-drawer"]').last().click()
        assert.match(await frame.locator('.drawer').innerText(), /审批工程用料申请/)
        assert.equal(await frame.locator('[data-action="task-context-open"]').evaluate((node) => node === document.activeElement), true)
        await next()
        assert.deepEqual(await visibleActions(), ['审批通过', '审批退回', '标记阻塞', '催办', '转交任务'])
        assert.equal(await frame.getByText('跳过处理', { exact: true }).count(), 0)
        await shot(page, 'ui-task-actions-all-visible')
        await frame.locator('[data-action="task-choice"][data-value="assign"]').click()
        await next()
        assert.deepEqual(await frame.locator('#task-target option').allTextContents(), ['请选择接收人', '产品工程共同待办', '周敏 · 产品工程'])
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

        await frame.getByRole('button', { name: '业务汇总', exact: true }).click()
        assert.deepEqual(await frame.locator('.summary-table th').allTextContents(), ['订单号', '产品', '审批状态', '提交时间', '查看'])
        await frame.locator('#dashboard-summary-search').fill('IP 联名')
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
        assert.equal(await frame.locator('.progress-row').count(), 3)
        await frame.locator('[data-action="progress-view"][data-value="production"]').click()
        assert.equal(await frame.locator('.progress-row').count(), 1)
        assert.match(await frame.locator('.progress-summary').innerText(), /MO-/)
        await frame.locator('#progress-search').fill('没有这样的产品')
        assert.equal(await frame.locator('.progress-row').count(), 0)
        assert.match(await frame.locator('.progress-summary').innerText(), /没有可查看/)
        assert.equal(await frame.locator('[data-action="progress-open-detail"]').count(), 0)

        await frame.locator('[data-action="nav"][data-page="help"]').first().click()
        const entryButton = frame.locator('#rh-entryButton')
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
        await frame.locator('.table-footer [data-action="page-number"][data-value="2"]').click()
        const secondPage = await frame.locator('.mobile-card-list .entity-link').allTextContents()
        assert.ok(secondPage.length > 0)
        assert.ok(secondPage.every((id) => !firstPage.includes(id)))
        await shot(page, 'ui-mobile-business-next-page')
        await frame.locator('[data-action="open-nav"]').click()
        await frame.getByRole('button', { name: '全部模块', exact: true }).click()
        await frame.locator('[data-action="catalog-nav"][data-page="audit"]').click()
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
        await frame.locator('[data-action="open-theme"]').click()
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
