import { UI_DESIGN_PREVIEW_TIMEOUT_MS } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'
import { chooseUIDesignState } from './devUIDesignNavigation.mjs'

const frameSelector = 'iframe[title="ERP 最新可交互设计"]'

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
    assert.equal(await page.locator('.erp-dev-ui-design-feedback').count(), 0)
    const selectionOverflow = await page.locator('.erp-dev-ui-design-page-select:visible .ant-select-selection-item')
      .evaluate((node) => node.scrollWidth - node.clientWidth)
    assert(selectionOverflow <= 1, `预览入口名称被截断 ${selectionOverflow}px`)
    return frame
  }
  const select = async (page, value) => {
    const label = { workspace: '业务界面', login: '登录页', help: '岗位帮助', controls: '控件设计', workbench: '效能工作台', 'production-hub': '生产管理' }[value]
    const control = page.locator('.erp-dev-ui-design-page-select:visible')
    await control.click()
    const listId = await control.getByRole('combobox').getAttribute('aria-controls')
    const popup = page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id=${JSON.stringify(listId)}]`) })
    await popup.getByText(label, { exact: true }).click()
    await popup.waitFor({ state: 'hidden' })
    if (value === 'workbench') await page.getByText('整体交互预览', { exact: true }).click()
  }
  return [
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
      name: 'dev-ui-design-entry-clear',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await waitReady(page)
        const control = page.locator('.erp-dev-ui-design-page-select:visible')
        await control.locator('.ant-select-clear').click()
        await page.getByText('请选择设计预览入口', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('page'), '')
        assert.equal(await control.locator('.ant-select-selection-placeholder').innerText(), '设计预览入口')
        assert.equal(await page.locator(`${frameSelector}:visible`).count(), 0)
        await page.reload()
        await page.getByText('请选择设计预览入口', { exact: true }).waitFor()
        await select(page, 'controls')
        await page.locator('.erp-dev-ui-design-reader .erp-dev-ui-design-page-select .ant-select-clear').click()
        await page.getByText('请选择设计预览入口', { exact: true }).waitFor()
        await select(page, 'workspace')
        await waitReady(page)
        assert.equal(await control.locator('.ant-select-clear').evaluate((node) => getComputedStyle(node).opacity), '1')
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-entry-clear-4k.png') })
        await page.goBack()
        await page.getByText('请选择设计预览入口', { exact: true }).waitFor()
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
        assert.equal(await page.locator('.erp-dev-ui-design-page-select').getByText('生产管理', { exact: true }).isVisible(), true)
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
        await page.reload()
        await waitReady(page)
        await heading.waitFor()
        await select(page, 'workbench')
        await waitReady(page)
        await select(page, 'production-hub')
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
        assert.deepEqual(await localTabs.getByRole('tab').allTextContents(), ['测试总览', '本轮验证', '覆盖报告', '链路实测', '压力测试'])
        await frame.getByText('本地开发机 · 当前工作区的执行与报告。', { exact: true }).waitFor()
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
        await chainResults.getByRole('button', { name: '采购下单到入库应付', exact: true }).click()
        await frame.getByRole('table', { name: '链路步骤样例', exact: true }).waitFor()
        await frame.getByRole('button', { name: '收起步骤', exact: true }).click()
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
        await page.locator('.erp-design-reader-toolbar').getByText('规范原文', { exact: true }).click()
        await page.locator('.erp-design-prose').waitFor()
        await assertViewportFilled(documentShell)
        const scroll = await page.locator('.erp-design-document-content').evaluate((node) => {
          node.scrollTop = node.scrollHeight
          return { top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight }
        })
        assert(scroll.scrollHeight > scroll.height && scroll.top > 0, '长文仍在阅读区内滚动')
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        await select(page, 'controls')
        await page.getByRole('region', { name: '控件设计', exact: true }).waitFor()
        await assertViewportFilled(reader)
        await page.locator(`${reader} .erp-dev-ui-design-page-select .ant-select-clear`).click()
        await page.getByText('请选择设计预览入口', { exact: true }).waitFor()
        await assertViewportFilled(reader)
        await select(page, 'workspace')
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
        await select(page, 'login')
        await waitReady(page)
        assert.equal(await helpWindow.evaluate((node) => node.isConnected), false, '切换入口不复用旧文档的浏览上下文')
        const loginWindow = await preview.elementHandle()
        const account = frame.locator('input').first()
        await account.fill('keep-preview-state')

        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        assert.equal(await loginWindow.evaluate((node) => node.isConnected), true)
        assert.equal(await account.inputValue(), 'keep-preview-state')

        await select(page, 'controls')
        await page.getByRole('region', { name: '控件设计', exact: true }).waitFor()
        assert.equal(await preview.isVisible(), false)
        await select(page, 'login')
        await waitReady(page)
        assert.equal(await loginWindow.evaluate((node) => node.isConnected), true)
        assert.equal(await account.inputValue(), 'keep-preview-state')

        for (const entry of ['help', 'login', 'workbench', 'help']) {
          await select(page, entry)
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
