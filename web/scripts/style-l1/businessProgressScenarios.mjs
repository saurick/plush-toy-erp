import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

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
      path: '/erp/business-dashboard',
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
        await page.route('**/rpc/business', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
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
        const progressCard = (orderNo) => board.getByRole('button', { name: `查看 ${orderNo} 完整进度`, exact: true })
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
            ? ['.erp-progress-reference', '.erp-progress-delivery-copy > strong', '.erp-progress-attention strong', '.erp-progress-due-cell']
            : ['.erp-progress-due-cell']
          for (const [index, selector] of targets.entries()) {
            await row.locator(selector).scrollIntoViewIfNeeded()
            const scrollTop = await board.locator('.erp-progress-list').evaluate((node) => node.scrollTop)
            const query = new URL(page.url()).searchParams
            query.delete('selected')
            const listReads = calls.filter((call) => call.method === 'list_progress').length
            const detailReads = calls.filter((call) => call.method === 'get_progress').length
            await row.locator(selector).click()
            await waitForDetail(orderNo)
            assert.equal(calls.filter((call) => call.method === 'get_progress').length, detailReads + 1, '整行点击只读取一次详情')
            assert.equal(calls.filter((call) => call.method === 'list_progress').length, listReads, '查看详情不重新读取列表')
            await page.keyboard.press('Escape')
            await dialog.waitFor({ state: 'hidden' })
            assert(await entry.evaluate((node) => node === document.activeElement), '关闭后焦点返回本行产品名称')
            assert(Math.abs(await board.locator('.erp-progress-list').evaluate((node) => node.scrollTop) - scrollTop) <= 1, '关闭后保留列表滚动位置')
            const restoredQuery = new URL(page.url()).searchParams
            restoredQuery.delete('selected')
            assert.equal(restoredQuery.toString(), query.toString(), '查看和关闭保留查询与分页')
            if (index === targets.length - 1) {
              await entry.press('Enter')
              await waitForDetail(orderNo)
            }
          }
        }
        if (failed) {
          await board.getByRole('button', { name: '重试', exact: true }).waitFor()
          assert((await board.getByRole('group', { name: '交期情况', exact: true }).locator('.erp-filter-chip__count').allTextContents()).every((count) => count === '—'))
          failNext = false
          await board.getByRole('button', { name: '重试', exact: true }).click()
        }
        await progressCard('SO-0001').waitFor()
        assert.equal(await board.locator('.erp-progress-table th').count(), 4, '订单与生产列表均不保留独立查看列')
        assert.equal(await board.locator('.erp-progress-action-cell').count(), 0)
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
        for (const label of ['产品名称未填写', '未定交期', '业务负责人未提供']) await missing.getByText(label, { exact: true }).waitFor()
        assert.match(await missing.locator('.erp-progress-customer').innerText(), /^客户未填写/u)
        await board.getByText('工程资料', { exact: true }).waitFor()
        assert.equal(await board.getByText('engineering_data', { exact: true }).count(), 0)
        const listReadCount = calls.filter((call) => call.method === 'list_progress').length
        assert.equal(await board.locator('.erp-progress-attention-cell').getByRole('button', { name: '查看 SO-0002 的关联任务', exact: true }).count(), 1, '关联任务入口位于当前关注区域')
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
          await board.getByRole('button', { name: '查看 SO-0002 的关联任务', exact: true }).click()
          await page.waitForURL((url) => url.pathname === '/erp/task-board' && url.searchParams.get('link_task') === '102')
          assert.equal(calls.filter((call) => call.method === 'get_progress').length, detailReads, '直达任务不同时打开进度')
          await page.goBack()
          await progressCard('SO-0002').waitFor()
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
          await page.getByPlaceholder('输入姓名').fill('查无负责人')
          await page.getByPlaceholder('输入姓名').press('Enter')
          await board.getByText('没有符合条件的记录').waitFor()
          assert.equal(new URL(page.url()).searchParams.get('owner'), '查无负责人')
          await page.getByRole('button', { name: '重置筛选', exact: true }).click()
          await page.keyboard.press('Escape')
          await progressCard('SO-0001').waitFor()
        }
        await board.getByRole('button', { name: /已逾期/ }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-progress-row').length === 1)
        await board.getByRole('button', { name: /仅看任务受阻/ }).click()
        await progressCard('SO-0001').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('blocked_only'), 'true')
        await board.getByRole('button', { name: '查看 SO-0001 的关联任务', exact: true }).click()
        drawer = page.getByRole('dialog')
        await drawer.getByRole('tab', { name: '关联任务', exact: true, selected: true }).waitFor()
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
        await drawer.getByRole('button', { name: '查看 TASK-0100', exact: true }).waitFor()
        assert.equal(await drawer.getByText('order_approval', { exact: true }).count(), 0)
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
        await verifyProgressMotion(page, assert, false)
        await progressCard('MO-0001').waitFor()
        assert.equal(await board.locator('.erp-progress-table th').count(), 4)
        await openFromRow('MO-0002')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        await verifyProgressMotion(page, assert, true)
        await board.getByRole('button', { name: /^筛选进度/ }).click()
        await page.getByPlaceholder('输入姓名').waitFor()
        await assertNoHorizontalOverflow(page, `${name}-filters-open`)
        if (narrow) {
          await page.getByRole('button', { name: '自定义交期日期', exact: true }).click()
          const dates = page.getByRole('dialog', { name: '选择交期日期范围', exact: true })
          await dates.waitFor()
          await assertNoHorizontalOverflow(page, `${name}-date-filter`)
          await dates.getByRole('button', { name: '取消', exact: true }).click()
        }
        await page.getByRole('button', { name: /^仅看未关联销售/ }).click()
        await page.getByRole('dialog', { name: '筛选进度', exact: true }).getByRole('button', { name: '完成', exact: true }).click()
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
