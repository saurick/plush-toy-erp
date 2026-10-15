import { exerciseTableScrollControls } from './tableScrollControlAssertions.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

function summaryFixture(inventoryStatus = 'AVAILABLE', empty = false) {
  const items = Array.from({ length: 16 }, (_, index) => ({
    material_id: index + 1,
    unit_id: (index % 2) + 1,
    material_name: index === 0 ? '米白短毛绒' : `核对材料 ${index + 1}`,
    unit_name: index % 2 ? '个' : '米',
    color: '米白',
    spec: '58 英寸 / 280g',
    supplier_item_no: `ML-${index + 1}`,
    supplier_name: '模拟材料厂商',
    required_quantity: '180.285',
  }))
  const sources = items.flatMap((item) =>
    [1212, 505].map((quantity, index) => ({
      material_id: item.material_id,
      unit_id: item.unit_id,
      sales_order_item_id: index + 1,
      line_no: index + 1,
      product_name: index ? '小熊挂件' : '节庆毛绒礼盒',
      customer_product_no: `DEMO-${index + 1}`,
      product_unit_name: '只',
      ordered_quantity: index ? '500' : '1200',
      pre_shipment_sample_quantity: index ? '5' : '12',
      production_quantity: String(quantity),
      order_date: '2026-09-25',
      bom_version: `BOM-${index + 1}`,
      bom_item_id: item.material_id * 10 + index,
      position: index ? '耳朵' : '身体',
      piece_count: '1',
      unit_usage: '0.1',
      loss_rate: '0.05',
      total_usage: index ? '53.025' : '127.26',
      material_note:
        item.material_id === 1
          ? '同一产品应使用同一染色批次，按确认色样裁剪。'.repeat(6)
          : '按确认样板核对',
    }))
  )
  return {
    id: 51,
    sales_order_id: 101,
    order_no: 'SO-MATERIAL-UI',
    order_status: 'active',
    status: 'SUBMITTED',
    version: 1,
    issues: [],
    purchase_orders: [],
    items: empty ? [] : items,
    sources: empty ? [] : sources,
    inventory_reference: {
      status: inventoryStatus,
      scope: 'ALL',
      as_of: '2026-09-26T02:00:00Z',
      items: items.map((item) => ({
        material_id: item.material_id,
        unit_id: item.material_id === 2 ? 3 : item.unit_id,
        quantity: '2500.125',
      })),
    },
  }
}

export function createMaterialSummaryScenarios({
  assert,
  outputDir,
  customerRuntimeEffectiveSession,
}) {
  return ['light', 'dark'].map((themeMode) => {
    let inventoryStatus = 'AVAILABLE'
    let empty = false
    let reads = 0
    const writes = []
    return {
      name: `material-summary-task-${themeMode}`,
      path: '/erp/task-board',
      auth: 'admin',
      themeMode,
      viewport: { width: 1600, height: 1000 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'sales_order.read',
          'engineering.material.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
          'workflow.task.update': ['engineering'],
          'workflow.task.complete': ['engineering'],
        },
      },
      workflowTaskFixtures: [
        {
          id: 9451,
          task_code: 'STYLE-L1-MATERIAL-SUMMARY',
          task_group: 'engineering_data',
          task_name: '核对工程用料依据',
          source_type: 'sales_order',
          source_id: 101,
          source_no: 'SO-MATERIAL-UI',
          task_status_key: 'ready',
          owner_role_key: 'engineering',
          created_at: 1790085600,
          version: 1,
          payload: { product_name: '节庆毛绒礼盒', sales_order_id: 101 },
        },
      ],
      beforeNavigate: async (page) => {
        inventoryStatus = 'AVAILABLE'
        empty = false
        reads = 0
        writes.length = 0
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_engineering_material_request') {
            if (/submit|review|update|create|delete/.test(method))
              writes.push(method)
            return route.fallback()
          }
          reads += 1
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(summaryFixture(inventoryStatus, empty)),
            }),
          })
        })
      },
      verify: async (page) => {
        await page
          .getByRole('button', {
            name: '查看核对工程用料依据详情',
            exact: true,
          })
          .click()
        const drawer = page.locator('.erp-task-action-drawer')
        const trigger = drawer.getByRole('button', {
          name: '查看材料汇总',
          exact: true,
        })
        await trigger.waitFor()
        assert.equal(reads, 0, '只有打开汇总时才读取材料')
        await trigger.scrollIntoViewIfNeeded()
        const taskScroll = await drawer
          .locator('.ant-drawer-body')
          .evaluate((node) => node.scrollTop)
        const taskStep = await drawer
          .locator('.erp-task-action-drawer__step--active')
          .innerText()
        await trigger.click()
        const dialog = page.locator('.erp-material-summary-modal')
        await dialog.getByText('米白短毛绒', { exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        const products = dialog.locator('.erp-material-product')
        assert.equal(await products.count(), 2)
        const productRects = await products.evaluateAll((nodes) =>
          nodes.map((node) => ({
            y: node.getBoundingClientRect().y,
            height: node.getBoundingClientRect().height,
          }))
        )
        assert(
          Math.abs(productRects[0].y - productRects[1].y) < 1,
          '两个产品摘要应并排'
        )
        assert(
          productRects.every((rect) => rect.height < 130),
          '产品摘要保持紧凑'
        )
        assert.equal(
          await dialog.getByRole('img', { name: /暂无可显示的图片/ }).count(),
          2
        )
        const scroller = dialog
          .locator('.erp-material-sheet__table .ant-table-body')
          .first()
        assert.equal(
          await dialog.locator('.erp-material-sheet__table > .app-table .app-table-scroll-buttons').count(),
          0,
          '宽度足够时没有无效定位按钮'
        )
        assert.equal(
          await dialog.getByText('单位待核对', { exact: true }).count(),
          1
        )
        await page.screenshot({
          path: `${outputDir}/material-summary-${themeMode}.png`,
        })
        const expand = dialog.getByRole('button', {
          name: /^(查看|收起)米白短毛绒部位用量$/,
        })
        await expand.press('Enter')
        assert.equal(await expand.getAttribute('aria-expanded'), 'true')
        assert.match(
          await dialog.locator('.erp-material-parts').innerText(),
          /127.26.*53.025/s
        )
        assert.equal(
          await dialog
            .locator('.erp-material-sheet__totals .ant-space-item')
            .count(),
          2,
          '不同单位分别合计'
        )
        await expand.press('Enter')
        const note = dialog.locator('.erp-material-notes').first()
        await note.locator('summary').click()
        assert.match(await note.innerText(), /同一产品应使用同一染色批次/)
        await note.locator('summary').click()
        await dialog.locator('.erp-material-sheet__help summary').click()
        assert.match(
          await dialog.locator('.erp-material-sheet__help').innerText(),
          /库存仅作参考.*不自动抵扣采购数量/s
        )

        await page.setViewportSize({ width: 850, height: 900 })
        await exerciseTableScrollControls(page, dialog.locator('.erp-material-sheet__table > .app-table'), scroller)

        assert(
          (await scroller.evaluate((node) => node.scrollWidth)) >
            (await scroller.evaluate((node) => node.clientWidth))
        )
        assert.equal(
          await dialog.evaluate(
            (node) => node.scrollWidth > node.clientWidth + 1
          ),
          false
        )
        await page.setViewportSize({ width: 1600, height: 1000 })
        await dialog
          .locator('.erp-material-sheet__table > .app-table .app-table-scroll-buttons')
          .waitFor({ state: 'detached' })
        await dialog.locator('.ant-modal-close').press('Escape')
        await dialog.waitFor({ state: 'detached' })
        assert(await drawer.isVisible(), '关闭汇总应保留原任务')
        await page.waitForFunction(
          () => document.activeElement?.textContent?.trim() === '查看材料汇总'
        )
        assert.equal(
          await trigger.evaluate((node) => node === document.activeElement),
          true
        )
        assert.equal(
          await drawer
            .locator('.erp-task-action-drawer__step--active')
            .innerText(),
          taskStep
        )
        assert(
          Math.abs(
            (await drawer
              .locator('.ant-drawer-body')
              .evaluate((node) => node.scrollTop)) - taskScroll
          ) < 2,
          '返回后保持任务滚动位置'
        )

        inventoryStatus = 'FORBIDDEN'
        await trigger.click()
        await dialog.getByText('未开放查看', { exact: true }).first().waitFor()
        assert.equal(
          await dialog.getByText('未开放查看', { exact: true }).count(),
          16
        )
        await dialog.locator('.ant-modal-close').click()
        inventoryStatus = 'UNAVAILABLE'
        await trigger.click()
        await dialog.getByText('暂不可用', { exact: true }).first().waitFor()
        inventoryStatus = 'AVAILABLE'
        const beforeRetry = reads
        await dialog
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await dialog.getByText('单位待核对', { exact: true }).waitFor()
        assert.equal(reads, beforeRetry + 1)
        assert.equal(
          await dialog.getByText('暂不可用', { exact: true }).count(),
          0
        )
        await dialog.locator('.ant-modal-close').click()
        empty = true
        await trigger.click()
        await dialog
          .getByText('暂无材料明细，请先补齐订单工程资料与 BOM', {
            exact: true,
          })
          .waitFor()
        assert.equal(await dialog.locator('.erp-material-product').count(), 0)
        assert.equal(
          await dialog.getByRole('button', { name: /部位用量/ }).count(),
          0
        )
        assert.deepEqual(writes, [], '只读核对与重新读取不得提交业务写入')
      },
    }
  })
}
