import { readFile, writeFile } from 'node:fs/promises'
import { chooseUIDesignState } from './devUIDesignNavigation.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'

const frameSelector = 'iframe[title="ERP 最新可交互设计"]'

export function createDevUIDesignPressureScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const open = async (page) => {
    const requests = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/rpc/')) requests.push(request.url())
    })
    const frame = page.frameLocator(frameSelector)
    await page.locator(`${frameSelector}:not([aria-hidden])`).waitFor()
    await frame.getByRole('button', { name: '销售管理', exact: true }).click()
    await chooseUIDesignState(page, '边界压力')
    await frame.locator('[data-list-scroll] tbody tr[data-row]').first().waitFor()
    return { frame, requests }
  }
  const search = async (input, value) => {
    await input.fill(value)
    await input.press('Enter')
  }
  const noOverflow = async (page, frame) => {
    await assertNoHorizontalOverflow(page)
    const overflow = await frame.locator('.app').evaluate((node) => node.scrollWidth - node.clientWidth)
    assert(overflow <= 1, `压力内容不得扩大页面：${overflow}px`)
  }
  const modalGeometry = async (page, frame) => {
    const geometry = await frame.locator('[role="dialog"]:visible').last().evaluate((node) => {
      const box = node.getBoundingClientRect()
      const head = node.querySelector('.modal-head').getBoundingClientRect()
      const foot = node.querySelector('.modal-foot').getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, height: innerHeight, headBottom: head.bottom, footTop: foot.top, footBottom: foot.bottom }
    })
    assert(geometry.top >= 0 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry))
    assert(geometry.headBottom <= geometry.footTop && geometry.footBottom <= geometry.height + 1, '长内容不挤走标题和底部操作')
    const frameBox = await page.locator(frameSelector).boundingBox()
    assert(frameBox.y + geometry.footBottom <= page.viewportSize().height + 1, '底部操作在实际浏览器视口内可见')
  }
  const shared = { path: '/__dev/ui-design', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
  return [
    {
      ...shared,
      name: 'dev-ui-design-pressure-capacity',
      verify: async (page) => {
        const { frame, requests } = await open(page)
        const table = frame.locator('[data-list-scroll] .table-wrap > table')
        await frame.getByRole('button', { name: '表格工具', exact: true }).click()
        await frame.getByRole('button', { name: '列设置', exact: true }).click()
        await frame.locator('[data-action="all-columns"]').click()
        await frame.locator('[data-action="save-columns"]').click()
        assert.equal(await table.locator('thead th').count(), 8, '实际展开全部业务列')
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('HeapProfiler.collectGarbage')
        const heapBefore = (await cdp.send('Runtime.getHeapUsage')).usedSize
        const timings = []
        for (const size of [50, 500]) {
          await chooseSelectOption(frame.locator('#business-page-size'), String(size))
          await table.locator('tbody tr[data-row]').nth(size - 1).waitFor()
          const first = await table.locator('tbody tr[data-row]').first().getAttribute('data-row')
          await table.evaluate((node) => {
            node.ownerDocument.defaultView.__boundaryLongTasks = []
            const observer = new PerformanceObserver((list) => {
              node.ownerDocument.defaultView.__boundaryLongTasks.push(...list.getEntries().map((entry) => entry.duration))
            })
            observer.observe({ type: 'longtask' })
            node.ownerDocument.defaultView.__boundaryObserver = observer
          })
          const start = performance.now()
          await frame.getByRole('button', { name: '下一页', exact: true }).click()
          await table.locator('tbody tr[data-row]').first().waitFor()
          assert.notEqual(await table.locator('tbody tr[data-row]').first().getAttribute('data-row'), first)
          const metrics = await frame.locator('.app').evaluate(async (node) => {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const view = node.ownerDocument.defaultView
            view.__boundaryObserver.disconnect()
            return { rows: node.querySelectorAll('[data-list-scroll] tr[data-row]').length, nodes: node.querySelectorAll('*').length, longTasks: view.__boundaryLongTasks }
          })
          const elapsedMs = performance.now() - start
          assert.equal(metrics.rows, size)
          assert(elapsedMs < 2500, `${size} 条翻页超过 2500ms：${elapsedMs.toFixed(1)}ms`)
          assert(Math.max(0, ...metrics.longTasks) < 750, '单次主线程阻塞须小于 750ms')
          assert(metrics.nodes < 50000, '一页 DOM 节点保持有界')
          timings.push({ size, elapsedMs, ...metrics })
        }
        await cdp.send('HeapProfiler.collectGarbage')
        const heapAfter = (await cdp.send('Runtime.getHeapUsage')).usedSize
        assert(heapAfter - heapBefore < 32 * 1024 * 1024, '从 50 到 500 条的存活堆增量小于 32MiB')
        await cdp.detach()
        await writeFile(path.join(outputDir, 'ui-pressure-render-metrics.json'), JSON.stringify({ thresholds: { renderMs: 2500, longTaskMs: 750, heapGrowthBytes: 32 * 1024 * 1024 }, timings, heapBefore, heapAfter }, null, 2))
        await page.screenshot({ path: path.join(outputDir, 'ui-pressure-500-records-4k.png') })
        await frame.getByRole('button', { name: '第 1 页', exact: true }).click()
        const query = frame.getByRole('textbox', { name: '搜索', exact: true })
        await search(query, 'SO-20260926-000000004')
        const missing = table.locator('[data-row="EDGE-sales-4"]')
        await missing.waitFor()
        assert.equal(await missing.locator('.cell-metric').innerText(), '待核对')
        assert.equal(await missing.locator('.cell-date').innerText(), '—')
        assert(!/undefined|null/u.test(await missing.innerText()), '缺值不透出实现值')
        await search(query, 'SO-20260926-000000005')
        assert.match(await table.locator('[data-row="EDGE-sales-5"] .cell-metric').innerText(), /(?:CNY|USD|HKD) 0\.00/u)
        await search(query, '')
        await frame.getByRole('button', { name: '表格工具', exact: true }).click()
        const downloadReady = page.waitForEvent('download')
        await frame.getByRole('button', { name: '导出筛选结果', exact: true }).click()
        const download = await downloadReady
        const exportPath = await download.path()
        assert(exportPath)
        const csv = await readFile(exportPath, 'utf8')
        assert.equal(csv.trim().split(/\r?\n/u).length, 1501, '导出实际包含全部 1500 条，覆盖分页外记录')
        assert(csv.includes('INTERNATIONAL_CUSTOMER_'))
        await writeFile(path.join(outputDir, 'ui-pressure-export.csv'), csv)
        await frame.getByRole('button', { name: '表格工具', exact: true }).click()
        await frame.getByRole('button', { name: '弹窗边界', exact: true }).click()
        const firstNumber = await frame.locator('.business-detail-modal .modal-head > .data-note').innerText()
        await frame.getByRole('button', { name: '关闭', exact: true }).click()
        await search(frame.getByRole('textbox', { name: '搜索', exact: true }), firstNumber)
        const row = table.locator('[data-row="EDGE-sales-1"]')
        const values = await row.evaluate((node) => ({ no: node.querySelector('.cell-no .entity-link').textContent, party: node.querySelector('.cell-party .strong').textContent, amount: node.querySelector('.cell-metric').textContent }))
        assert.equal(values.no.length, 64)
        assert.equal(values.party.length, 255)
        assert.match(values.amount, /99,999,999,999,999\.99/u)
        await row.getByRole('checkbox').check()
        assert.equal(await frame.getByRole('button', { name: '新建订单', exact: true }).isEnabled(), false, '压力记录不修改普通样例')
        for (const width of [1920, 1280, 1024]) {
          await page.setViewportSize({ width, height: width === 1920 ? 1080 : 720 })
          await noOverflow(page, frame)
          const actionBar = frame.locator('.operation-surface .business-record-actions')
          const overflow = await actionBar.evaluate((node) => node.scrollWidth - node.clientWidth)
          assert(overflow <= 1, '长动作名称收进既有更多菜单')
          const geometry = await row.evaluate((node) => {
            const party = node.querySelector('.cell-party .strong')
            const identity = node.querySelector('.cell-no .entity-link')
            const link = identity.getBoundingClientRect()
            const range = node.ownerDocument.createRange()
            range.selectNodeContents(identity)
            const copy = node.querySelector('.cell-no .copy-value > button').getBoundingClientRect()
            return { height: node.getBoundingClientRect().height, clamped: getComputedStyle(party).webkitLineClamp, identityTextHeight: range.getBoundingClientRect().height, linkHeight: link.height, linkRight: link.right, copyLeft: copy.left }
          })
          assert(geometry.height <= 132, `极值记录保持可扫描行高：${JSON.stringify(geometry)}`)
          assert.equal(geometry.clamped, '2')
          assert(geometry.linkRight <= geometry.copyLeft, '完整编号入口与复制按钮不重叠')
          assert(geometry.identityTextHeight <= geometry.linkHeight + 1, `64 字符订单号保持完整可见：${JSON.stringify(geometry)}`)
        }
        const more = frame.locator('.operation-surface .business-record-actions').getByRole('button', { name: '更多操作', exact: true })
        await more.click()
        const inspect = frame.locator('.operation-surface [data-action="inspect-record"][data-value="lines"]').filter({ visible: true })
        await inspect.click()
        await frame.locator('[data-detail-line]').first().waitFor()
        await modalGeometry(page, frame)
        await frame.locator('.business-detail-modal').getByRole('button', { name: '基本信息', exact: true }).click()
        const customerNumber = await frame.getByText('客户单号', { exact: true }).evaluate((node) => node.nextElementSibling.textContent)
        assert.equal(customerNumber.length, 128, '列表收纳后可在详情查看完整客户单号')
        await frame.getByRole('button', { name: '关闭', exact: true }).click()
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'ui-pressure-all-columns-4k.png') })
        assert.deepEqual(requests, [])
      },
    },
    {
      ...shared,
      name: 'dev-ui-design-pressure-collections',
      verify: async (page) => {
        const { frame, requests } = await open(page)
        await frame.getByRole('button', { name: '表格工具', exact: true }).click()
        await frame.getByRole('button', { name: '弹窗边界', exact: true }).click()
        const detail = frame.locator('.business-detail-modal')
        assert.equal(await detail.locator('[data-detail-line]').count(), 50)
        await detail.getByRole('button', { name: '明细下一页', exact: true }).click()
        assert.match(await detail.locator('[data-detail-line]').first().getAttribute('data-detail-line'), /LINE-51$/u)
        await search(detail.getByRole('textbox', { name: '搜索明细', exact: true }), '明细 249')
        assert.equal(await detail.locator('[data-detail-line]').count(), 1)
        await search(detail.getByRole('textbox', { name: '搜索明细', exact: true }), '')
        await chooseSelectOption(detail.locator('ui-select[data-collection="lines"]'), '250')
        assert.equal(await detail.locator('[data-detail-line]').count(), 250, '250 条为实际明细行')
        assert(await detail.locator('.record-collection-controls .design-select-value').evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '250 条选值完整可读')
        await detail.getByRole('button', { name: '关联单据', exact: true }).click()
        await detail.getByText('关联单据与任务 · 120 张单据', { exact: true }).waitFor()
        await detail.getByRole('button', { name: '关联单据下一页', exact: true }).click()
        const query = detail.getByRole('textbox', { name: '搜索关联单据', exact: true })
        await search(query, '000120')
        const card = detail.locator('.related-card')
        assert.equal(await card.count(), 1)
        const linkedNumber = await card.locator('span').innerText()
        await card.click()
        await frame.getByRole('dialog', { name: '采购单详情', exact: true }).waitFor()
        await frame.getByText(linkedNumber.split(' · ')[0], { exact: true }).last().waitFor()
        await frame.getByRole('button', { name: '返回原视图', exact: true }).click()
        assert.equal(await query.inputValue(), '000120', '返回关联列表保留检索条件')
        await detail.getByRole('button', { name: '操作记录', exact: true }).click()
        await search(detail.getByRole('textbox', { name: '搜索操作记录', exact: true }), '第 119 次')
        assert.equal(await detail.locator('.timeline-item').count(), 1)
        await detail.getByRole('button', { name: '附件 60', exact: true }).click()
        const attachments = frame.getByRole('dialog', { name: '业务附件', exact: true })
        assert.equal(await attachments.locator('.attachment-row').count(), 50)
        await attachments.getByRole('button', { name: '附件下一页', exact: true }).click()
        assert.equal(await attachments.locator('.attachment-row').count(), 10)
        await attachments.locator('[data-action="attachment-mode"][data-value="image"]').click()
        assert.equal(await attachments.locator('.attachment-row').count(), 20)
        const broken = attachments.locator('.attachment-row').filter({ has: frame.locator('[data-id="EDGE-sales-1-ATT-4"]') })
        await broken.locator('.attachment-image-fallback').waitFor({ state: 'visible' })
        await broken.getByRole('button', { name: '预览', exact: true }).click()
        await frame.getByRole('button', { name: '重新读取图片', exact: true }).click()
        const image = frame.locator('.attachment-full-preview img')
        await image.waitFor()
        assert(await image.evaluate(async (node) => { await node.decode(); return node.naturalWidth > 0 }))
        await frame.getByRole('button', { name: '关闭', exact: true }).click()
        await attachments.locator('[data-action="attachment-mode"][data-value="file"]').click()
        const failed = attachments.locator('.attachment-row').filter({ has: frame.locator('[data-id="EDGE-sales-1-ATT-2"]') })
        const filename = failed.locator('.attachment-name')
        assert.equal((await filename.innerText()).length, 255)
        await filename.click()
        assert.equal(await filename.getAttribute('aria-expanded'), 'true', '可展开查看完整文件名')
        await filename.click()
        await failed.getByRole('button', { name: '重试', exact: true }).click()
        await attachments.getByRole('button', { name: '上传 1 个文件', exact: true }).click()
        await failed.getByText('已上传', { exact: true }).waitFor()
        await failed.getByRole('button', { name: '预览', exact: true }).click()
        await frame.locator('.attachment-text-preview').filter({ hasText: '包装确认 2' }).waitFor()
        await frame.getByRole('button', { name: '关闭', exact: true }).click()
        for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 600 }]) {
          await page.setViewportSize(size)
          await modalGeometry(page, frame)
          await noOverflow(page, frame)
          const labels = await attachments.locator('.compact-field-help summary').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height })))
          assert(labels.every((item) => item.text === '?' && item.height <= 45), '图标式帮助保留现有 44px 触区，不塞入多字标签')
          const badges = await attachments.locator('.attachment-row .badge').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))
          assert(badges.every((width) => width <= 130), '附件状态保持内容宽度')
          assert(await attachments.locator('.record-collection-controls .design-select-value').evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '附件每页条数不截断')
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'ui-pressure-attachments-4k.png') })
        await attachments.getByRole('button', { name: '完成', exact: true }).click()
        await detail.getByRole('button', { name: '关闭', exact: true }).click()
        await chooseUIDesignState(page, '正常')
        assert.equal(await frame.locator('[data-list-scroll] tr[data-row]').count(), 14)
        await frame.locator('[data-list-scroll] .cell-no .entity-link').first().click()
        const expectedLines = await detail.getByText('明细数量', { exact: true }).evaluate((node) => Number.parseInt(node.nextElementSibling.textContent, 10))
        await detail.getByRole('button', { name: '明细', exact: true }).click()
        assert.equal(await detail.locator('[data-detail-line]').count(), expectedLines, '普通样例也按实际明细数量展示')
        await detail.locator('[data-action="open-attachments"]').click()
        const ordinaryFiles = await attachments.locator('.attachment-name').allTextContents()
        const ordinaryStates = await attachments.locator('.attachment-row .badge').allTextContents()
        await attachments.getByRole('button', { name: '完成', exact: true }).click()
        await detail.getByRole('button', { name: '关闭', exact: true }).click()
        await chooseUIDesignState(page, '边界压力')
        await frame.getByRole('button', { name: '表格工具', exact: true }).click()
        await frame.getByRole('button', { name: '弹窗边界', exact: true }).click()
        await detail.getByRole('button', { name: '附件 60', exact: true }).click()
        await attachments.getByRole('button', { name: '上传 1 个文件', exact: true }).click()
        await page.locator('.erp-dev-ui-design-state-select .ant-select-clear').click()
        await frame.locator('[data-list-scroll] .cell-no .entity-link').first().click()
        await detail.locator('[data-action="open-attachments"]').click()
        assert.deepEqual(await attachments.locator('.attachment-name').allTextContents(), ordinaryFiles, '压力上传中的文件不残留到普通样例')
        await attachments.getByRole('button', { name: '刷新列表', exact: true }).click()
        await page.waitForTimeout(800)
        assert.deepEqual(await attachments.locator('.attachment-name').allTextContents(), ordinaryFiles)
        assert.deepEqual(await attachments.locator('.attachment-row .badge').allTextContents(), ordinaryStates)
        assert.equal(await frame.locator('#toasts .toast').filter({ hasText: '附件已上传' }).count(), 0, '离开后的旧上传不在新场景显示成功')
        await attachments.getByRole('button', { name: '完成', exact: true }).click()
        await detail.getByRole('button', { name: '关闭', exact: true }).click()
        assert.deepEqual(requests, [])
      },
    },
    {
      ...shared,
      name: 'dev-ui-design-pressure-recovery',
      verify: async (page) => {
        const { frame, requests } = await open(page)
        const row = frame.locator('[data-list-scroll] tr[data-row]').first()
        const id = await row.getAttribute('data-row')
        await row.getByRole('checkbox').check()
        await frame.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await frame.getByRole('status').filter({ hasText: '正在重新读取' }).waitFor()
        await frame.locator('[data-list-scroll][aria-busy="false"]').waitFor()
        assert.equal(await frame.locator(`tr[data-row="${id}"] input`).isChecked(), true)
        await chooseUIDesignState(page, '压力 · 读取失败')
        await frame.getByRole('alert').filter({ hasText: '本次读取失败' }).waitFor()
        assert.equal(await frame.locator(`tr[data-row="${id}"] input`).isChecked(), true)
        assert.equal(await frame.locator('[data-list-scroll] tr[data-row]').count(), 500, '刷新失败保留上次成功内容')
        await frame.getByRole('button', { name: '重新读取', exact: true }).click()
        await frame.locator('[data-list-scroll][aria-busy="false"]').waitFor()
        assert.equal(await frame.getByRole('alert').count(), 0)
        assert.equal(await page.locator('.erp-dev-ui-design-state-select .ant-select-selection-item').innerText(), '边界压力', '重试成功后同步压力状态')
        await chooseUIDesignState(page, '压力 · 读取较慢')
        await frame.getByRole('status').filter({ hasText: '正在重新读取' }).waitFor()
        await search(frame.getByRole('textbox', { name: '搜索', exact: true }), '000001')
        await frame.locator('.state-surface[aria-busy="true"]').waitFor()
        await frame.getByRole('button', { name: '采购管理', exact: true }).click()
        await frame.getByRole('heading', { name: '采购订单', exact: true }).waitFor()
        await frame.locator('[data-list-scroll][aria-busy="false"]').waitFor()
        const numbers = await frame.locator('[data-list-scroll] .cell-no .entity-link').allTextContents()
        assert(numbers.length > 0 && numbers.every((value) => value.startsWith('PO-')), '过期销售读取不覆盖采购结果')
        await chooseUIDesignState(page, '正常')
        assert.equal(await frame.locator('#business-page-size').evaluate((node) => node.value), '50', '跨模块退出也恢复正常页容量')
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('HeapProfiler.collectGarbage')
        const before = (await cdp.send('Runtime.getHeapUsage')).usedSize
        const samples = []
        for (let i = 0; i < 5; i += 1) {
          await chooseUIDesignState(page, '边界压力')
          await frame.locator('[data-list-scroll]').waitFor()
          await chooseUIDesignState(page, '正常')
          await cdp.send('HeapProfiler.collectGarbage')
          samples.push((await cdp.send('Runtime.getHeapUsage')).usedSize)
        }
        const growth = Math.max(...samples) - before
        assert(growth < 16 * 1024 * 1024, `五轮切换后存活堆增量不得超过 16MiB：${growth}`)
        await cdp.detach()
        await writeFile(path.join(outputDir, 'ui-pressure-recovery-memory.json'), JSON.stringify({ before, samples, growth, cycles: 5, thresholdBytes: 16 * 1024 * 1024 }, null, 2))
        await noOverflow(page, frame)
        assert.deepEqual(requests, [])
      },
    },
  ]
}
