import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { readSelectPopup } from './singleSelectAssertions.mjs'

const warehouse = { id: 914, code: 'FG-BATCH', name: '成品仓', type: 'FINISHED_GOODS', is_active: true }
const product = { id: 915, code: 'FG-TOY', name: '模拟出货小兔', default_unit_id: 1, is_active: true }
const batches = ['TEST-SHIP-CP842', 'TEST-SHIP-CP825']
const visiblePopup = '.ant-select-dropdown:visible'
const isBatchRequest = ({ params }) => params?.subject_id === product.id && params.warehouse_id === warehouse.id

async function choose(page, input, text) {
  await input.press('ArrowDown')
  await page.locator(visiblePopup).getByText(text, { exact: true }).click()
  await page.locator(visiblePopup).waitFor({ state: 'hidden' })
}

function startProbe(input) {
  return input.evaluate((node) => {
    const select = node.closest('.ant-select')
    const body = node.closest('.erp-business-form-page__body')
    const frames = []
    let frame
    function sample() {
      const trigger = select.getBoundingClientRect()
      const state = { trigger: [trigger.x, trigger.y, trigger.width, trigger.height, body.scrollTop] }
      const popup = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      const style = popup && getComputedStyle(popup)
      const box = popup?.getBoundingClientRect()
      if (box?.right > 0 && box.bottom > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0) {
        // The painted box includes transforms that do not affect offsetWidth or offsetTop.
        state.popup = [box.x, box.y, box.width, box.height]
        state.side = (box.top + box.bottom) / 2 < trigger.y ? 'top' : 'bottom'
        state.loading = Boolean(popup.querySelector('[data-read-state="loading"]'))
      }
      frames.push(state)
      frame = requestAnimationFrame(sample)
    }
    window.__shipmentBatchProbe = { frames, stop: () => cancelAnimationFrame(frame) }
    sample()
  })
}

async function stopProbe(page) {
  await page.waitForFunction(() => window.__shipmentBatchProbe?.frames.filter(({ popup }) => popup).length >= 3)
  return page.evaluate(() => {
    const probe = window.__shipmentBatchProbe
    probe.stop()
    delete window.__shipmentBatchProbe
    return probe.frames
  })
}

export function createShipmentBatchDropdownScenarios(deps) {
  const fixtures = new WeakMap()
  return [{
    name: 'shipment-batch-dropdown-stability',
    path: '/erp/warehouse/shipments',
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    viewport: { width: 1024, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      const fixture = { held: null, supplierLotNo: '', failBalances: false }
      fixtures.set(page, fixture)
      await page.route('**/rpc/*', async (route) => {
        const call = route.request().postDataJSON()
        const { id, method, params } = call
        const scope = { subject_type: 'PRODUCT', subject_id: product.id, warehouse_id: warehouse.id }
        let key
        let rows
        if (method === 'list_products') {
          key = 'products'
          rows = [product]
        } else if (method === 'list_warehouses') {
          key = 'warehouses'
          rows = [warehouse]
        } else if (isBatchRequest(call) && method === 'list_inventory_lots') {
          key = 'inventory_lots'
          rows = batches.map((lot_no, i) => ({ ...scope, id: 920 + i, lot_no, supplier_lot_no: fixture.supplierLotNo, status: 'ACTIVE' }))
        } else if (isBatchRequest(call) && method === 'list_inventory_balances') {
          key = 'inventory_balances'
          rows = batches.map((_, i) => ({
            ...scope,
            id: 930 + i,
            lot_id: 920 + i,
            unit_id: 1,
            lot_status: 'ACTIVE',
            quantity: '19',
            ready_to_ship_quantity: '19',
            active_reserved_quantity: '0',
          }))
          await fixture.held?.promise
          if (fixture.failBalances) {
            return route.fulfill({ json: { jsonrpc: '2.0', id, error: { code: -32603, message: '模拟库存读取失败' } } })
          }
        } else {
          return route.fallback()
        }
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(rows, key, params)) } })
      })
    },
    verify: async (page) => {
      const fixture = fixtures.get(page)
      await page.getByRole('button', { name: '新建出货单' }).click()
      const editor = page.locator('.erp-business-form-page:visible')
      await choose(page, editor.getByRole('combobox', { name: /第 1 行产品/u }), 'FG-TOY 模拟出货小兔')
      await choose(page, editor.getByRole('combobox', { name: '第 1 行成品仓', exact: true }), '成品仓 FG-BATCH')
      const input = editor.getByRole('combobox', { name: '第 1 行批次', exact: true })
      const popup = page.locator(visiblePopup)
      const select = input.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," app-select ")][1]')
      await input.scrollIntoViewIfNeeded()
      await input.focus()
      const trigger = await select.boundingBox()
      // Two rows should open upward here; one filtered row could fit below.
      await page.setViewportSize({ width: 1024, height: Math.ceil(trigger.y + trigger.height + 76) })
      await input.scrollIntoViewIfNeeded()
      await expect(input).toBeInViewport()
      await waitForFiniteAnimations(page)
      // Click the visible field without Playwright scrolling it away from the viewport edge.
      const point = await input.evaluate((node) => {
        const { x, y, width, height } = node.getBoundingClientRect()
        const center = { x: x + width / 2, y: y + height / 2 }
        const hit = document.elementFromPoint(center.x, center.y)
        return { ...center, reachesField: node.closest('.ant-select').contains(hit) }
      })
      assert(point.reachesField, '窗口边缘的批次输入框须能直接点开')

      async function requestBatches(open = () => input.press('ArrowDown')) {
        fixture.held = Promise.withResolvers()
        const request = page.waitForRequest((req) => {
          if (!req.url().includes('/rpc/inventory')) return false
          const call = req.postDataJSON()
          return call?.method === 'list_inventory_balances' && isBatchRequest(call)
        }, { timeout: 5000 })
        await open()
        const inventoryRequest = await request
        await expect(select).toHaveClass(/ant-select-loading/u)
        // Capture frames across a response that is known to still be pending.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        return inventoryRequest
      }

      try {
        await startProbe(input)
        await requestBatches(() => page.mouse.click(point.x, point.y))
        const pendingExpanded = await input.getAttribute('aria-expanded')
        fixture.held.resolve()
        const first = popup.getByText(`${batches[0]} 可用 · 可发 19`, { exact: true })
        await expect(first).toBeVisible()
        await waitForFiniteAnimations(page)
        const original = await readSelectPopup(popup)
        const frames = await stopProbe(page)
        const shown = frames.filter(({ popup }) => popup)
        const distinct = [...new Set(shown.map(({ popup, side }) => JSON.stringify({ popup, side })))]
        const paintedLoading = frames.some(({ loading }) => loading)
        const movement = Math.max(...shown.flatMap(({ popup }) => popup.map((value, i) => Math.abs(value - shown[0].popup[i]))))
        const stable = movement <= 1 && shown.every(({ side }) => side === shown[0].side)
        const maxText = Math.max(...original.options.map(({ textWidth }) => textWidth))
        assert(pendingExpanded === 'false' && !paintedLoading && stable && original.width <= Math.max(trigger.width, maxText) + 50,
          `加载不能画临时菜单，首次可见尺寸须合适且稳定：${JSON.stringify({ pendingExpanded, paintedLoading, distinct, width: original.width, maxText })}`)
        const movedTrigger = frames.find(({ trigger }) => trigger.some((value, i) => Math.abs(value - frames[0].trigger[i]) > 1))
        assert(!movedTrigger, `打开和慢响应期间不移动触发框或编辑页滚动位置：${JSON.stringify({ before: frames[0].trigger, after: movedTrigger?.trigger })}`)
        assert(original.bottom <= frames.at(-1).trigger[1], `下方空间不足时，浮层完整展开在触发框上方：${JSON.stringify({ trigger: frames.at(-1).trigger, popup: shown.at(-1).popup })}`)
        assert(original.options.every(({ lines, clipped }) => lines === 1 && !clipped), '短批次完整显示在一行')
        assert(original.width >= trigger.width - 1 && original.left >= 0 && original.right <= 1024, '浮层至少有触发框宽且完整留在视口')
        const clip = { x: Math.floor(original.left) - 12, y: Math.floor(original.top) - 12, width: Math.ceil(original.width) + 24, height: Math.ceil(original.bottom - original.top) + trigger.height + 32 }
        await page.screenshot({ path: `${deps.outputDir}/shipment-batch-dropdown-short.png`, clip })

        for (const keyword of ['CP825', '没有对应批次', '']) {
          await input.fill(keyword)
          await expect(popup).toContainText(keyword === '没有对应批次' ? '没有匹配的选项' : batches[1])
          await expect.poll(async () => {
            const box = await readSelectPopup(popup)
            return Math.abs(box.width - original.width) <= 1 && Math.abs(box.bottom - original.bottom) <= 1
          }, { message: '筛选、空结果和清空时保留浮层宽度及与输入框相接的边' }).toBe(true)
        }
        await first.click()
        await popup.waitFor({ state: 'hidden' })
        await expect(select.locator('.ant-select-selection-item')).toHaveText(batches[0])

        const canceled = await requestBatches()
        await input.press('Escape')
        fixture.held.resolve()
        const response = await canceled.response()
        await response?.finished()
        await waitForFiniteAnimations(page)
        await expect(select).not.toHaveClass(/ant-select-loading/u)
        await expect(input).toBeFocused()
        await expect(input).toHaveAttribute('aria-expanded', 'false')

        fixture.failBalances = true
        await requestBatches()
        fixture.held.resolve()
        await expect(popup).toContainText('库存暂未读到，重新打开再试')
        await expect(popup.locator('.ant-select-item-option:not(.ant-select-item-option-disabled)')).toHaveCount(0)
        await input.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        await expect(input).toBeFocused()

        fixture.failBalances = false
        fixture.supplierLotNo = '长供应商批号用于区分同一产品的可发货批次'.repeat(6)
        await requestBatches()
        fixture.held.resolve()
        await expect(popup.getByText(fixture.supplierLotNo, { exact: false }).first()).toBeVisible()
        await waitForFiniteAnimations(page)
        const long = await readSelectPopup(popup)
        assert(long.width > original.width + 50 && long.width <= 561 && long.left >= 0 && long.right <= 1024, '长候选按内容增宽，且受 560px 和可视范围约束')
        assert(long.options.every(({ clipped }) => !clipped) && long.options.some(({ lines }) => lines > 1), '达到宽度上限后长候选完整换行')
        await page.screenshot({ path: `${deps.outputDir}/shipment-batch-dropdown-expanded.png` })
        const metrics = JSON.stringify({
          triggerWidth: trigger.width, beforeResponse: pendingExpanded, short: original, long, paintedFrames: shown.length, maxPaintedMovement: movement,
        }, null, 2)
        await writeFile(`${deps.outputDir}/shipment-batch-dropdown-metrics.json`, `${metrics}\n`)
        await input.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        await expect(input).toBeFocused()
        await deps.assertNoHorizontalOverflow(page)
      } finally {
        fixture.held?.resolve()
        await page.evaluate(() => {
          window.__shipmentBatchProbe?.stop()
          delete window.__shipmentBatchProbe
        })
      }
    },
  }]
}
