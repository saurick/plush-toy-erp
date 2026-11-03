import { writeFile } from 'node:fs/promises'
import { createMobileTaskHandlingCoverageScenarios } from './mobileTaskHandlingCoverageScenarios.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'

export function createTaskBusinessFactsScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const sources = createMobileTaskHandlingCoverageScenarios(deps)
    .filter((scenario) => ['mobile-task-handling-sales', 'mobile-task-handling-purchase', 'mobile-task-handling-outsourcing', 'mobile-task-handling-shipment'].includes(scenario.name))
  const cases = sources.flatMap((base) => base.workflowTaskFixtures[0].source_type === 'shipment'
    ? [{ base, historical: false }, { base, historical: true }]
    : [{ base, historical: false }])

  return cases.flatMap(({ base, historical }) => [false, true].map((mobile) => {
    const original = base.workflowTaskFixtures[0]
    const task = { ...original, task_status_key: historical ? 'done' : 'ready', completed_at: historical ? original.completed_at : null }
    const source = original.source_type
    const name = `task-business-facts-${source}${source === 'shipment' ? historical ? '-history' : '-missing' : ''}-${mobile ? 'mobile-dark' : 'desktop-light'}`
    const order = source === 'sales_order'
      ? { id: task.source_id, order_no: task.source_no, customer_id: 1, customer_snapshot: { name: '模拟客户' }, currency: 'CNY', lifecycle_status: 'draft', version: 1, order_total: null, tax_mode: null, freight_terms: null, quoted_freight_amount: null, note: null, contact_snapshot: {} }
      : null
    const shipment = source === 'shipment'
      ? { id: task.source_id, shipment_no: task.source_no, status: historical ? 'SHIPPED' : 'DRAFT', version: 1, finance_release_status: historical ? 'APPROVED' : 'PENDING', finance_release_version: 1, sales_order_id: 1, customer_id: 1, customer_snapshot: '模拟客户', currency: 'CNY', planned_ship_at: 1793116800, total_net_weight_g: null, items: [{ id: 11, shipment_id: task.source_id, sales_order_item_id: 1, product_id: 1, product_sku_id: 1, warehouse_id: 1, unit_id: 1, lot_id: 1, quantity: '10' }] }
      : null

    return {
      ...base,
      name,
      path: mobile ? '/m/all/tasks' : `/erp/task-board${historical ? '?lane=finished' : ''}`,
      themeMode: mobile ? 'dark' : 'light',
      viewport: mobile ? { width: 320, height: 568 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          let data
          if (method === 'list_task_events') data = { items: [{ id: task.id * 10, task_id: task.id, task, event_type: 'created', created_at: task.created_at, task_version: task.version }], truncated: false }
          else if (method === 'get_task_handling_chain') data = { items: [task], truncated: false }
          else return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        })
        if (order) await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['get_sales_order', 'list_sales_orders'].includes(method)) return route.fallback()
          const data = method === 'get_sales_order'
            ? { sales_order: order }
            : stylePaginatedRpcData([order], 'sales_orders', params)
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        })
        if (shipment) await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['get_shipment', 'list_shipments'].includes(method)) return route.fallback()
          const data = method === 'get_shipment'
            ? { shipment }
            : stylePaginatedRpcData([shipment], 'shipments', params)
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        })
      },
      verify: async (page) => {
        const mutations = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/')) return
          const method = request.postDataJSON()?.method || ''
          if (/^(?:save_|create_|update_|delete_|submit_|complete_|execute_|post_|start_|confirm_|cancel_|reject_|resume_|block_|urge_|reassign_)/u.test(method)) mutations.push(method)
        })
        if (mobile) {
          await page.getByTestId('mobile-role-nav-tasks').click()
          if (historical) await page.getByRole('tab', { name: /^已办(?:\s|$)/u }).click()
          const card = page.locator(`[data-mobile-task-id="${task.id}"]`)
          await card.waitFor()
          await clickTaskCardContent(card, card.getByText(task.task_name, { exact: true }))
        } else {
          await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
        }
        await page.getByRole('tablist', { name: '任务处理步骤', exact: true }).getByRole('tab').nth(0).click()
        const information = page.getByTestId('workflow-task-business-information')
        const sourceCard = information.getByTestId('mobile-task-business-source')
        await sourceCard.getByText(task.source_no, { exact: true }).first().waitFor()
        await waitForFiniteAnimations(page)
        const facts = sourceCard.locator('.mobile-task-facts').first()
        await facts.waitFor()
        await page.getByText('任务已创建', { exact: true }).first().waitFor()
        assert.equal(await information.locator('[role="alert"]').count(), 0)
        assert.equal(await facts.locator('details').count(), 0, 'empty optional values do not create a disclosure')
        assert.equal((await facts.innerText()).includes('未填写信息'), false)
        const actions = await facts.locator('button').evaluateAll((buttons) => buttons.map((button) => ({ label: button.getAttribute('aria-label') || button.textContent, copy: button.classList.contains('erp-business-copy-button'), gallery: Boolean(button.closest('.erp-document-product-gallery, .erp-product-gallery, .erp-product-identity__picture, .erp-task-product-image')) })))
        assert.ok(actions.every((action) => action.copy || action.gallery), `source information preserves copy and picture actions without repeating task actions: ${JSON.stringify(actions)}`)
        if (order) {
          await facts.getByText('暂未生成', { exact: true }).waitFor()
          await facts.getByText('计税方式、运费条件尚未补齐。', { exact: true }).waitFor()
          assert.equal(await facts.locator('dd').filter({ hasText: 'CNY 0' }).count(), 0, 'a missing total is not rendered as zero')
          assert.equal((await facts.innerText()).includes('产品单价'), false, 'the UI does not invent a missing-price reason')
        }
        if (shipment) {
          const status = facts.locator('[data-missing-tone]')
          assert.equal(await status.innerText(), historical ? '未记录' : '待确认')
          assert.equal(await status.getAttribute('data-missing-tone'), historical ? 'neutral' : 'warning')
        }
        const geometry = await facts.evaluate((node) => {
          const grid = getComputedStyle(node.querySelector('dl'))
          return {
            grid: { display: grid.display, columns: grid.gridTemplateColumns, gap: grid.gap },
            statuses: [...node.querySelectorAll('.mobile-task-facts__status')].map((element) => {
              const style = getComputedStyle(element)
              let surface = element.parentElement
              while (surface && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(surface).backgroundColor)) surface = surface.parentElement
              return { text: element.textContent, tone: element.dataset.missingTone, tag: Boolean(element.closest('.ant-tag')), color: style.color, ownBackground: style.backgroundColor, background: surface ? getComputedStyle(surface).backgroundColor : '', fontSize: style.fontSize, fontWeight: style.fontWeight, radius: style.borderRadius, padding: style.padding, borderWidth: style.borderWidth, lineHeight: style.lineHeight }
            }),
            fields: [...node.querySelectorAll('dt')].map((element) => element.textContent),
            overflow: node.scrollWidth > node.clientWidth + 1,
          }
        })
        assert.equal(geometry.grid.display, 'grid')
        assert.equal(geometry.overflow, false)
        for (const status of geometry.statuses) {
          assert.equal(status.tag, false, 'missing information is plain text rather than a business-state tag')
          assert.ok(['transparent', 'rgba(0, 0, 0, 0)'].includes(status.ownBackground))
          assert.equal(status.borderWidth, '0px')
          assert.equal(status.radius, '0px')
          assert.equal(status.padding, '0px')
          const luminance = (color) => {
            const values = color.match(/[0-9.]+/gu).slice(0, 3).map(Number)
            const channels = color.startsWith('color(srgb') ? values : values.map((value) => value / 255)
            const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
            return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
          }
          const values = [luminance(status.color), luminance(status.background)].sort((left, right) => left - right)
          status.contrast = (values[1] + 0.05) / (values[0] + 0.05)
          assert.ok(status.contrast >= 4.5, `${status.text}: status text must remain readable (${status.contrast.toFixed(2)})`)
          const shape = ({ fontSize, fontWeight, radius, padding, lineHeight }) => ({ fontSize, fontWeight, radius, padding, lineHeight })
          assert.deepEqual(shape(status), shape(geometry.statuses[0]), 'missing-value hints share one type scale')
        }
        const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
        await steps.getByRole('tab').nth(1).click()
        await steps.getByRole('tab').nth(0).click()
        await sourceCard.waitFor()
        if (order) await facts.getByText('暂未生成', { exact: true }).waitFor()
        assert.deepEqual(mutations, [], 'viewing and switching steps must not write business data')
        await assertNoHorizontalOverflow(page, name)
        const hints = facts.locator('.mobile-task-facts__status')
        if (await hints.count()) {
          const hint = hints.last()
          const field = hint.locator('..').locator('..')
          await field.scrollIntoViewIfNeeded()
          await waitForFiniteAnimations(page)
          const readable = await hint.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            return rect.top >= 0 && rect.bottom <= innerHeight && Boolean(hit && element.contains(hit))
          })
          assert.equal(readable, true, 'status remains visible above sticky controls after scrolling')
          await field.screenshot({ path: path.join(outputDir, `${name}-status.png`) })
        } else await sourceCard.scrollIntoViewIfNeeded()
        await waitForFiniteAnimations(page)
        await writeFile(path.join(outputDir, `${name}.json`), JSON.stringify(geometry, null, 2))
        await sourceCard.screenshot({ path: path.join(outputDir, `${name}-source.png`) })
        await page.screenshot({ path: path.join(outputDir, `${name}.png`) })
      },
    }
  }))
}
