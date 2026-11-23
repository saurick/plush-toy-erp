import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { openDateFilter } from './dateFilterActions.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'
import { isTransparentColor } from './colorAssertions.mjs'

async function verifyProgressMotion(page, assert, reduced) {
  const selector = '[aria-label="进度查看方式"]'
  const root = page.locator(selector)
  await root.getByRole('tab', { name: '订单交付', exact: true }).click()
  await root.getByRole('tab', { name: '订单交付', exact: true, selected: true }).waitFor()
  const index = await root.getByRole('tab').evaluateAll((tabs) => tabs.findIndex((tab) => tab.textContent.trim() === '生产执行'))
  assert(index >= 0, '内容导航包含目标页签')
  await verifyMobileNavigationMotion(page, assert, selector, index, reduced)
}

export function createBusinessProgressScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const make = (
    name,
    { dark = false, failed = false, restricted = false, narrow = false } = {}
  ) => {
    let failNext = failed
    const calls = []
    return {
      name,
      path: '/erp/business-dashboard?view=orders',
      auth: 'admin',
      themeMode: dark ? 'dark' : 'light',
      viewport: narrow
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: narrow ? 3 : 3840 / 1440,
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          'erp.business_dashboard.read',
          'sales_order.read',
          'sales_order_item.read',
          'purchase.order.read',
          'purchase.receipt.read',
          'field.procurement_commercial.read',
          'pmc.plan.read',
          'production.wip.read',
          'workflow.task.read',
          'product.read',
        ],
      },
      beforeNavigate: async (page) => {
        failNext = failed
        calls.length = 0
        const productImage = await page.evaluate(() => {
          const canvas = document.createElement('canvas')
          canvas.width = 128
          canvas.height = 128
          const context = canvas.getContext('2d')
          context.fillStyle = '#edf4ee'
          context.fillRect(0, 0, 128, 128)
          context.fillStyle = '#81a48b'
          context.beginPath()
          context.arc(64, 64, 40, 0, Math.PI * 2)
          context.fill()
          return canvas.toDataURL('image/png').split(',')[1]
        })
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_product_image_references', 'download_attachment'].includes(method)) return route.fallback()
          const data = method === 'list_product_image_references' ? {
            images: (params.product_ids || []).map((productID) => ({ product_id: productID, image_attachment_id: productID === 9 ? 0 : 880000 + productID })),
          } : {
            attachment: { id: Number(params.id), owner_type: 'product', owner_id: Number(params.id) - 880000, mime_type: 'image/png', content_base64: productImage },
          }
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
        })
        const relatedTasks = () => {
          const sample = progressFixtureData({ id: 1, view: 'orders' }, { detail: true }).sections.tasks[0]
          return Array.from({ length: 22 }, (_, i) => ({
            ...sample,
            id: 100 + i,
            number: `TASK-${String(100 + i).padStart(4, '0')}`,
            label: i === 0 ? 'order_approval' : i === 1 ? '办理出货前检验' : `复核第 ${i} 批来料检验`,
            role: i ? 'quality' : 'purchase',
            status: i === 0 ? 'blocked' : i === 1 ? 'ready' : 'done',
            note: i === 0 ? sample.note : '',
          }))
        }
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'get_task' || ![102, 121].includes(params.task_id)) return route.fallback()
          calls.push({ method, params })
          const task = {
            id: params.task_id,
            version: 1,
            task_name: `核对指定任务 ${params.task_id}`,
            task_status_key: 'done',
            task_group: 'business_followup',
            task_no: `RW20261118-0${params.task_id}`,
            owner_role_key: 'purchase',
            source_type: 'sales_order',
            source_id: 1,
            source_no: 'SO-0001',
          }
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data: { task } } } })
        })
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'list_purchase_followups') return route.fallback()
          calls.push({ method, params })
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                data: {
                  rows: [],
                  total: 0,
                  counts: {},
                  days: {},
                  as_of_date: '2026-11-18',
                  access: { quality: false, commercial: true, finance: false },
                },
              },
            },
          })
        })
        await page.route('**/rpc/business', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_progress_owner_options') {
            const names = restricted ? ['模拟业务员'] : ['模拟业务员', '已结束订单的业务员']
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data: { names } } } })
          }
          if (method === 'list_progress_tasks') {
            calls.push({ method, params })
            const rows = relatedTasks().filter((row) => (!params.owner_role_key || row.role === params.owner_role_key) &&
              (params.task_status === 'all' || (params.task_status === 'ended') === (row.status === 'done')))
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data: { rows: rows.slice(params.offset, params.offset + params.limit), total: rows.length } } } })
          }
          if (!['list_progress', 'get_progress'].includes(method)) {
            return route.fallback()
          }
          calls.push({ method, params })
          if (params.keyword === '迟到响应') await delay(400)
          if (failNext) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '查询暂不可用' },
              }),
            })
          }
          const data = progressFixtureData(params, {
            restricted,
            detail: method === 'get_progress',
          })
          if (!restricted) {
            const rows = data.rows || [data.row]
            for (const row of rows) {
              if (row.id === 5) Object.assign(row, { customer: '', product: '', sales_owner: '' })
              if (row.id === 2) {
                Object.assign(row, {
                  attention_task: 'engineering_data',
                  attention_task_id: 102,
                  attention_role: 'engineering',
                  open_tasks: 1,
                })
              }
            }
            if (data.sections?.batches && data.row.id === 2) {
              const batch = data.sections.batches[0]
              data.sections.batches = Array.from({ length: 12 }, (_, index) => ({ ...batch, id: 1000 + index, number: `BATCH-LONG-${index + 1}` }))
            }
            if (data.sections?.tasks) {
              data.sections.tasks[0].label = 'order_approval'
              if (name === 'erp-business-dashboard-desktop' && data.row.id === 1) {
                const records = relatedTasks()
                data.sections.tasks = records.slice(0, 20)
                data.has_more.tasks = true
                data.task_total = records.length
              }
            }
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { code: 0, message: 'OK', data },
            }),
          })
        })
      },
      verify: async (page) => {
        const board = page.getByRole('region', { name: '进度看板', exact: true })
        const progressCard = (orderNo) => board.getByRole('button', { name: `查看进度：${orderNo}`, exact: true })
        const search = board.getByPlaceholder('搜单号、客户、产品')
        const waitForDetail = async (orderNo) => {
          const dialog = page.getByRole('dialog')
          await dialog.getByRole('heading', { name: orderNo, exact: true }).waitFor()
          await dialog.locator('.erp-progress-detail-header').waitFor()
          await page.waitForFunction(() => document.activeElement?.closest('.erp-progress-modal[role="dialog"]'), null, { timeout: 10000 }).catch(async (failure) => {
            const focus = await page.evaluate(() => ({ active: document.activeElement?.outerHTML?.slice(0, 600), dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => ({ className: node.className, visible: Boolean(node.getClientRects().length), focused: node.contains(document.activeElement) })) }))
            throw new Error(`${failure.message}\n${JSON.stringify(focus)}`)
          })
        }
        const openFromRow = async (orderNo) => {
          const row = board.locator('.erp-progress-row').filter({ hasText: orderNo })
          const entry = progressCard(orderNo)
          const dialog = page.getByRole('dialog')
          const reference = row.locator('.erp-progress-reference')
          await reference.scrollIntoViewIfNeeded()
          if (!narrow) {
            const box = await reference.boundingBox()
            await page.mouse.move(box.x + 3, box.y + box.height / 2)
            await page.mouse.down()
            await page.mouse.move(box.x + Math.min(box.width - 3, 90), box.y + box.height / 2, { steps: 8 })
            await page.mouse.up()
            assert(await page.evaluate(() => String(window.getSelection()).length > 0), '进度单号可拖选复制')
            assert.equal(await dialog.isVisible(), false, '拖选文字不误开进度')
            await page.evaluate(() => window.getSelection().removeAllRanges())
          }
          const targets = name === 'erp-business-dashboard-desktop'
            ? ['.erp-progress-identity > strong', '.erp-progress-reference', '.erp-progress-delivery-copy > strong', '.erp-progress-due-cell']
            : ['.erp-progress-due-cell']
          const listReads = calls.filter((call) => call.method === 'list_progress').length
          const detailReads = calls.filter((call) => call.method === 'get_progress').length
          const initialURL = page.url()
          for (const selector of targets) {
            await row.locator(selector).click()
            assert.equal(await dialog.isVisible(), false, '单击表格内容不打开进度')
            assert.equal(page.url(), initialURL)
          }
          assert.equal(calls.filter((call) => call.method === 'get_progress').length, detailReads)
          const rowShortcut = row.locator('.erp-progress-due-cell strong')
          const mouseEntry = narrow ? entry : rowShortcut
          await mouseEntry.scrollIntoViewIfNeeded()
          const scrollTop = await board.locator('.erp-progress-list').evaluate((node) => node.scrollTop)
          if (narrow) await mouseEntry.click()
          else await mouseEntry.dblclick()
          await waitForDetail(orderNo)
          assert.equal(calls.filter((call) => call.method === 'get_progress').length, detailReads + 1, '每次打开只读取一次详情')
          assert.equal(calls.filter((call) => call.method === 'list_progress').length, listReads, '查看详情不重新读取列表')
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'hidden' })
          assert(await entry.evaluate((node) => node === document.activeElement), '关闭后焦点返回本行查看进度按钮')
          assert(Math.abs(await board.locator('.erp-progress-list').evaluate((node) => node.scrollTop) - scrollTop) <= 1, '关闭后保留列表滚动位置')
          const restoredQuery = new URL(page.url()).searchParams
          const initialQuery = new URL(initialURL).searchParams
          restoredQuery.delete('selected')
          initialQuery.delete('selected')
          assert.equal(restoredQuery.toString(), initialQuery.toString(), '查看和关闭保留查询与分页')
          await entry.press('Enter')
          await waitForDetail(orderNo)
        }
        if (failed) {
          await board.getByRole('button', { name: '重试', exact: true }).waitFor()
          assert((await board.getByRole('group', { name: '交期情况', exact: true }).locator('.erp-filter-chip__count').allTextContents()).every((count) => count === '—'))
          failNext = false
          await board.getByRole('button', { name: '重试', exact: true }).click()
        }
        await progressCard('SO-0001').waitFor()
        const table = board.locator('.erp-progress-table')
        assert.deepEqual(await table.locator('th').allTextContents(), ['订单 / 产品', '订单状态', '交期', '已出货 / 订购', '当前关注 / 处理人', '操作'])
        assert(await table.locator('tbody tr').evaluateAll((rows) => rows.every((row) =>
          row.cells.length === 6 && Array.from(row.cells).every((cell) => cell.colSpan === 1))))
        assert.equal(await board.getByRole('button', { name: '查看任务', exact: true }).count(), 0)
        const firstCells = table.locator('tbody tr').first().getByRole('cell')
        if (name === 'erp-business-dashboard-desktop') {
          const copy = firstCells.first().getByRole('button', { name: '复制订单号', exact: true })
          assert.equal(await copy.evaluate((node) => getComputedStyle(node).opacity), '1')
          await assertTaskCopy(page, copy, '', { failure: true, failureMessage: '复制失败，请手动复制' })
          await assertTaskCopy(page, copy, 'SO-0001', { keyboard: true })
          await page.getByText('复制失败，请手动复制', { exact: true }).waitFor({ state: 'hidden' })
          await page.getByRole('button', { name: '关闭「订单号已复制」提示', exact: true }).click()
          assert.equal(await page.getByRole('dialog').count(), 0)
        }
        assert.equal(await firstCells.nth(1).getByText('已生效', { exact: true }).count(), 1, '订单状态独立展示')
        assert.equal(await firstCells.first().getByText('已生效', { exact: true }).count(), 0)
        const firstProgressEntry = firstCells.last()
          .getByRole('button', { name: '查看进度：SO-0001', exact: true })
        assert.equal(await firstProgressEntry.innerText(), '查看进度')
        const buttonStyle = await firstProgressEntry.evaluate((button) => {
          const { borderTopColor, borderTopStyle, borderTopWidth, paddingInlineStart } = getComputedStyle(button)
          const cell = button.closest('td')
          const centerX = ({ left, right }) => (left + right) / 2
          const buttonOffset = centerX(button.getBoundingClientRect()) - centerX(cell.getBoundingClientRect())
          return { borderTopColor, borderTopStyle, borderTopWidth, paddingInlineStart, buttonOffset }
        })
        assert.equal(buttonStyle.borderTopStyle, 'solid')
        assert(!isTransparentColor(buttonStyle.borderTopColor) && parseFloat(buttonStyle.borderTopWidth) > 0, '初始态显示进度按钮描边')
        assert(parseFloat(buttonStyle.paddingInlineStart) > 0, '进度按钮文字与边框保有间距')
        assert(Math.abs(buttonStyle.buttonOffset) <= 1, '查看进度按钮在操作列内居中')
        if (!narrow) {
          const headerOffset = await table.locator('th').last().evaluate((header) => {
            const label = document.createRange()
            label.selectNodeContents(header)
            const textBounds = label.getBoundingClientRect()
            const cellBounds = header.getBoundingClientRect()
            return (textBounds.left + textBounds.right - cellBounds.left - cellBounds.right) / 2
          })
          assert(Math.abs(headerOffset) <= 1, '操作表头在列内居中')
        }
        assert.equal(await board.locator('.erp-progress-summary').count(), 0)
        const firstImage = board.locator('.erp-progress-row').first().locator('.erp-product-identity img')
        await firstImage.waitFor()
        await page.waitForFunction(() => {
          const image = document.querySelector('.erp-progress-row .erp-product-identity img')
          return image?.complete && image.naturalWidth > 0
        })
        assert.equal(await board.locator('.erp-progress-identity-cell button button').count(), 0, '产品图片和进度入口不嵌套按钮')
        await board.locator('.erp-progress-row').first().getByRole('button', { name: /查看.+大图/ }).click()
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.has('selected'), false, '点图只预览图片，不打开完整进度')
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor({ state: 'hidden' })
        const density = await board.locator('.erp-progress-row').evaluateAll((rows) => rows.slice(0, 4).map((row) => ({ height: row.getBoundingClientRect().height, overflow: row.scrollWidth - row.clientWidth })))
        assert(density.every((row) => row.overflow <= 1), JSON.stringify(density))
        if (!narrow) assert(density.every((row) => row.height < 135), JSON.stringify(density))
        await assertNoHorizontalOverflow(page, name)
        await page.screenshot({ path: path.join(outputDir, `${name}-overview.png`) })
        if (restricted) {
          const blocked = board.getByRole('button', { name: /仅看任务受阻/ })
          assert(await blocked.isDisabled())
          assert.equal(await blocked.locator('.erp-filter-chip__count').innerText(), '—')
          await board.getByText('任务无查看权限').first().waitFor()
          assert.equal(await board.locator('.erp-progress-task-entry').count(), 0, '无任务权限不显示任务入口')
          assert.equal(await board.getByText('面料交期尚未确认', { exact: true }).count(), 0)
          await progressCard('SO-0001').click()
          const detail = page.getByRole('dialog')
          await detail.getByRole('button', { name: '查看生产明细' }).waitFor()
          assert(await detail.getByRole('button', { name: '查看生产明细' }).isDisabled())
          await page.keyboard.press('Escape')
          return
        }
        await board.getByText('面料交期尚未确认', { exact: true }).waitFor()
        await board.getByText('采购 · 办理人未提供', { exact: false }).first().waitFor()
        const missing = board.locator('.erp-progress-row').filter({ hasText: 'SO-0005' })
        for (const label of ['产品名称未填写', '未定交期', '暂无可见待办']) await missing.getByText(label, { exact: true }).waitFor()
        assert.match(await missing.locator('.erp-progress-customer').innerText(), /^客户未填写/u)
        await board.getByText('工程资料', { exact: true }).waitFor()
        assert.equal(await board.getByText('engineering_data', { exact: true }).count(), 0)
        const listReadCount = calls.filter((call) => call.method === 'list_progress').length
        const singleTask = board.locator('.erp-progress-attention-cell').getByRole('button', { name: '工程资料（SO-0002）', exact: true })
        assert.equal(await singleTask.innerText(), '工程资料')
        const listMetric = board.locator('.erp-progress-row').filter({ hasText: 'SO-0002' }).getByRole('button', { name: '查看已出货 / 订购数值与口径', exact: true })
        await listMetric.hover()
        await page.locator('.ant-popover:visible .erp-progress-metric-hint').getByText('400 / 800 只', { exact: true }).waitFor()
        await listMetric.focus()
        await listMetric.press('Escape')
        await page.locator('.ant-popover:visible .erp-progress-metric-hint').waitFor({ state: 'hidden' })
        assert(await listMetric.evaluate((node) => node === document.activeElement))
        assert.equal(await page.getByRole('dialog').count(), 0)
        await openFromRow('SO-0002')
        let drawer = page.getByRole('dialog')
        await waitForDetail('SO-0002')
        assert.equal(new URL(page.url()).searchParams.get('selected'), 'orders:2')
        if (name === 'erp-business-dashboard-desktop') {
          await assertTaskCopy(page, drawer.getByRole('button', { name: '复制订单号', exact: true }), 'SO-0002', { keyboard: true })
          assert(await drawer.isVisible(), '复制单号后保持详情打开')
          await page.getByRole('button', { name: '关闭「订单号已复制」提示', exact: true }).click()
        }
        assert.equal(calls.filter((call) => call.method === 'list_progress').length, listReadCount)
        await drawer.getByRole('tab', { name: '进度总览', exact: true, selected: true }).waitFor()
        const stageMetric = drawer.getByRole('button', { name: '查看已出货 / 订购数值与口径', exact: true })
        await stageMetric.focus()
        await page.locator('.ant-popover:visible .erp-progress-metric-hint').getByText('400 / 800 只', { exact: true }).waitFor()
        await stageMetric.press('Escape')
        await page.locator('.ant-popover:visible .erp-progress-metric-hint').waitFor({ state: 'hidden' })
        assert(await drawer.isVisible(), '关闭提示不关闭详情')
        await drawer.getByRole('button', { name: '查看质检明细', exact: true }).click()
        await drawer.getByRole('tab', { name: '工序批次', exact: true, selected: true }).waitFor()
        const detailScroll = drawer.locator('.erp-progress-detail-scroll')
        const navTop = await drawer.getByRole('tablist', { name: '进度明细分类' }).evaluate((node) => node.getBoundingClientRect().top)
        await detailScroll.evaluate((node) => { node.scrollTop = node.scrollHeight })
        const shell = await drawer.evaluate((root) => {
          const scroll = root.querySelector('.erp-progress-detail-scroll')
          const last = scroll.querySelector('.erp-progress-record:last-child')
          const box = scroll.getBoundingClientRect()
          const tail = last.getBoundingClientRect()
          return { top: scroll.scrollTop, navTop: root.querySelector('.erp-progress-detail-tabs').getBoundingClientRect().top, bottomGap: box.bottom - tail.bottom, rightGap: box.right - tail.right, overflow: scroll.scrollWidth - scroll.clientWidth }
        })
        assert(shell.top > 0 && Math.abs(shell.navTop - navTop) <= 1 && shell.bottomGap >= 0 && shell.rightGap >= 28 && shell.overflow <= 1, JSON.stringify(shell))
        await drawer.getByRole('tab', { name: '产品明细', exact: true }).click()
        await drawer.getByRole('tab', { name: '工序批次', exact: true }).click()
        await page.waitForFunction((top) => Math.abs(document.querySelector('.erp-progress-detail-scroll').scrollTop - top) <= 1, shell.top)
        await page.screenshot({ path: path.join(outputDir, `${name}-detail-scroll.png`) })
        await assertBusinessModalViewport(page, drawer, { label: name })
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert(await progressCard('SO-0002').evaluate((node) => node === document.activeElement))
        await progressCard('SO-0001').focus()
        await page.keyboard.press('Space')
        await waitForDetail('SO-0001')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        if (name === 'erp-business-dashboard-desktop') {
          const detailReads = calls.filter((call) => call.method === 'get_progress').length
          await singleTask.click()
          await page.waitForURL((url) => url.pathname === '/erp/task-board' && url.searchParams.get('task_id') === '102')
          assert.equal(calls.filter((call) => call.method === 'get_progress').length, detailReads, '直达任务不同时打开进度')
          await page.goBack()
          await progressCard('SO-0002').waitFor()
          assert(await singleTask.evaluate((node) => node === document.activeElement), '返回后焦点恢复到任务名称')
          const pagination = board.getByRole('navigation', { name: '进度分页' })
          await pagination.getByText('第 1-20 条 / 共 24 条', { exact: true }).waitFor()
          await pagination.locator('.ant-select-selector').click()
          await page.getByText('100 条/页', { exact: true }).click()
          await pagination.getByText('第 1-24 条 / 共 24 条', { exact: true }).waitFor()
          assert(calls.some((call) => call.params.limit === 100 && call.params.offset === 0))
          assert.equal(await pagination.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true)
          await pagination.locator('.ant-select-selector').click()
          await page.getByText('20 条/页', { exact: true }).click()
          await board.locator('.ant-pagination-next button').click()
          await progressCard('SO-0025').waitFor()
          await board.locator('.ant-pagination-prev button').click()
          await progressCard('SO-0001').waitFor()
          await board.getByRole('button', { name: /^筛选进度/ }).click()
          const owner = page.getByRole('combobox', { name: '处理人或业务负责人' })
          await owner.press('ArrowDown')
          await owner.fill('已结束订单')
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').getByText('已结束订单的业务员', { exact: true }).click()
          await board.getByText('没有符合条件的记录').waitFor()
          assert.equal(new URL(page.url()).searchParams.get('owner_name'), '已结束订单的业务员')
          await page.getByRole('button', { name: '清空筛选', exact: true }).click()
          await page.keyboard.press('Escape')
          await progressCard('SO-0001').waitFor()
        }
        await board.getByRole('button', { name: /已逾期/ }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-progress-row').length === 1)
        await board.getByRole('button', { name: /仅看任务受阻/ }).click()
        await progressCard('SO-0001').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('blocked_only'), 'true')
        await board.getByRole('button', { name: '2 项待办（SO-0001）', exact: true }).click()
        drawer = page.getByRole('dialog')
        await drawer.getByRole('tab', { name: '关联任务', exact: true, selected: true }).waitFor()
        await drawer.getByRole('button', { name: '待处理', exact: true, pressed: true }).waitFor()
        await drawer.getByText('订单审批', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '产品明细', exact: true }).click()
        await drawer.getByText('已出货 400', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '进度总览', exact: true }).click()
        const stageLabels = await drawer.locator('[data-progress-stage]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-progress-stage')))
        assert.deepEqual(stageLabels, ['engineering', 'materials', 'production', 'quality', 'shipment'])
        await drawer.getByRole('tab', { name: '领料', exact: true }).click()
        await drawer.getByText('短毛绒面料', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '领料', exact: true }).focus()
        await page.keyboard.press('ArrowRight')
        await drawer.getByRole('tab', { name: '关联任务', exact: true, selected: true }).waitFor()
        await drawer.getByRole('button', { name: '查看任务 TASK-0100', exact: true }).waitFor()
        assert.equal(await drawer.getByText('order_approval', { exact: true }).count(), 0)
        if (name === 'erp-business-dashboard-desktop') {
          await drawer.getByRole('button', { name: '全部任务', exact: true }).click()
          await drawer.getByRole('navigation', { name: '本单任务分页' }).getByRole('button', { name: '下一页' }).click()
          const picked = drawer.getByRole('button', { name: '查看任务 TASK-0121', exact: true })
          await picked.click()
          await page.getByRole('heading', { name: '核对指定任务 121', exact: true }).waitFor()
          assert(calls.some((call) => call.method === 'get_task' && call.params.task_id === 121))
          await page.getByRole('button', { name: '返回进度看板', exact: true }).click()
          await picked.waitFor()
          assert.equal(new URL(page.url()).searchParams.get('blocked_only'), 'true')
          await drawer.getByRole('button', { name: '已结束', exact: true }).click()
          await drawer.getByRole('button', { name: '查看任务 TASK-0102', exact: true }).waitFor()
          assert(calls.some((call) => call.method === 'list_progress_tasks' && call.params.task_status === 'ended' && call.params.id === 1))
          const followupRead = page.waitForRequest((request) => request.url().endsWith('/rpc/purchase_order') && request.postDataJSON()?.method === 'list_purchase_followups')
          await drawer.getByRole('button', { name: '本单采购跟进', exact: true }).click()
          assert.equal((await followupRead).postDataJSON().params.sales_order_id, 1)
          await page.getByRole('tab', { name: '采购跟进', selected: true }).waitFor()
          await page.getByRole('button', { name: '返回进度看板', exact: true }).click()
          await drawer.getByRole('tab', { name: '关联任务', selected: true }).waitFor()
          await drawer.getByRole('button', { name: '已结束', pressed: true }).waitFor()
        }
        await assertBusinessModalViewport(page, drawer, { label: name })
        await page.screenshot({ path: path.join(outputDir, `${name}-complete-progress.png`) })
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(new URL(page.url()).searchParams.get('due_status'), 'overdue')
        await board.getByRole('button', { name: /仅看任务受阻/ }).click()
        await board.getByRole('button', { name: /^不限交期/ }).click()
        await search.fill('查找目标客户')
        await search.press('Enter')
        await progressCard('SO-0025').waitFor()
        if (name === 'erp-business-dashboard-desktop') {
          const late = page.waitForRequest((request) => request.url().endsWith('/rpc/business') && request.postDataJSON()?.params?.keyword === '迟到响应')
          await search.fill('迟到响应')
          await search.press('Enter')
          await late
          await search.fill('查找目标客户')
          await search.press('Enter')
          await progressCard('SO-0025').waitFor()
          await page.waitForTimeout(500)
          assert.equal(await progressCard('SO-0025').count(), 1)
        }
        await search.fill('查无此单')
        await search.press('Enter')
        await board.getByText('没有符合条件的记录').waitFor()
        assert.equal(await board.locator('.erp-progress-row').count(), 0)
        await search.fill('')
        await search.press('Enter')
        await progressCard('SO-0001').waitFor()
        if (name === 'erp-business-dashboard-desktop') {
          const switcher = board.getByLabel('交付查看方式', { exact: true })
          await switcher.getByText('产品明细', { exact: true }).click()
          const line = board.locator('tr[data-progress-line-id="101"]')
          await assertTaskCopy(page, line.getByRole('button', { name: '复制订单号', exact: true }), 'SO-0001')
          await assertTaskCopy(page, line.getByRole('button', { name: '复制客户款号', exact: true }), 'STYLE-0001')
          await switcher.getByText('整单', { exact: true }).click()
          await progressCard('SO-0001').waitFor()
        }
        await verifyProgressMotion(page, assert, false)
        await progressCard('MO-0001').waitFor()
        const productionTable = board.locator('table[aria-label="生产执行紧凑总览"]')
        assert.deepEqual(await productionTable.locator('th').allTextContents(), ['生产单 / 产品', '生产单状态', '计划结束', '有效完工 / 计划', '当前关注 / 处理人', '操作'])
        const productionCells = productionTable.locator('tbody tr').first().getByRole('cell')
        if (name === 'erp-business-dashboard-desktop') {
          await assertTaskCopy(page, productionCells.first().getByRole('button', { name: '复制生产单号', exact: true }), 'MO-0001')
          assert.equal(await page.getByRole('dialog').count(), 0)
        }
        assert.equal(await productionCells.nth(1).getByText('已下达', { exact: true }).count(), 1)
        await productionCells.last().getByRole('button', { name: '查看进度：MO-0001', exact: true }).waitFor()
        await openFromRow('MO-0002')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        await verifyProgressMotion(page, assert, true)
        await board.getByRole('button', { name: /^筛选进度/ }).click()
        await page.getByRole('combobox', { name: '处理人或业务负责人', exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, `${name}-filters-open`)
        if (narrow) {
          const dates = await openDateFilter(page, page.getByRole('dialog', { name: '筛选进度', exact: true }))
          await assertNoHorizontalOverflow(page, `${name}-date-filter`)
          await dates.getByRole('button', { name: '取消', exact: true }).click()
        }
        await page.getByRole('button', { name: /^仅看未关联销售/ }).click()
        await page.getByRole('dialog', { name: '筛选进度', exact: true }).getByRole('button', { name: '收起', exact: true }).click()
        assert.equal(await board.getByRole('button', { name: /^筛选进度/ }).evaluate((node) => node === document.activeElement), true)
        await progressCard('MO-0003').waitFor()
        await page.waitForFunction(() => document.querySelectorAll('.erp-progress-row').length === 1)
        await board.getByText('按明细查看', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, `${name}-production.png`) })
        await assertNoHorizontalOverflow(page, `${name}-production`)
        await board.locator('[aria-label="进度查看方式"]').getByText('订单交付', { exact: true }).click()
        await progressCard('SO-0001').waitFor()
        assert.equal(new URL(page.url()).searchParams.has('unlinked_only'), false)
        await board.locator('[aria-label="进度查看方式"]').getByText('生产执行', { exact: true }).click()
        await progressCard('MO-0003').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('unlinked_only'), 'true')
        await board.locator('.erp-progress-row').filter({ hasText: 'MO-0003' }).getByRole('button', { name: '按明细查看', exact: true }).click()
        drawer = page.getByRole('dialog')
        await drawer.getByRole('tab', { name: '产品明细', exact: true }).waitFor()
        if (name === 'erp-business-dashboard-desktop') {
          await drawer.getByRole('button', { name: '打开原单', exact: true }).click()
          await page.waitForURL((url) => url.pathname === '/erp/production/orders' && url.searchParams.get('production_order_id') === '3')
          await page.goBack()
          await progressCard('MO-0003').waitFor()
          assert.equal(new URL(page.url()).searchParams.get('unlinked_only'), 'true')
        } else {
          await page.keyboard.press('Escape')
        }
      },
    }
  }
  return [
    make('erp-business-dashboard-desktop'),
    make('erp-business-dashboard-dark-desktop', { dark: true }),
    make('erp-business-dashboard-stats-unavailable-desktop', { failed: true }),
    make('erp-business-dashboard-workflow-unavailable-desktop', {
      restricted: true,
    }),
    make('erp-business-dashboard-narrow', { narrow: true }),
  ]
}
