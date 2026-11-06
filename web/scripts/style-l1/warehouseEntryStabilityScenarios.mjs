import { writeFile } from 'node:fs/promises'

export function createWarehouseEntryStabilityScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  return [
    {
      name: 'warehouse-outbound-cold-entry-stability',
      path: '/erp/warehouse/outbound?warehouse_view=shipment',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.addInitScript(() => {
          const sample = { frames: [], errors: [], done: false, changes: {} }
          window.__warehouseColdEntry = sample
          window.addEventListener('error', (event) =>
            sample.errors.push(String(event.message))
          )
          let start = 0
          let loadedAt = 0
          const rect = (node) =>
            node
              ? [
                  node.offsetWidth,
                  node.offsetHeight,
                  ...['x', 'y', 'width', 'height'].map(
                    (key) =>
                      Math.round(node.getBoundingClientRect()[key] * 10) / 10
                  ),
                ]
              : null
          const tick = () => {
            const header = document.querySelector('.erp-business-module-header')
            if (header) {
              if (!start) start = performance.now()
              const command = document.querySelector(
                '.erp-business-operation-panel__command'
              )
              const table = document.querySelector(
                '.erp-business-data-table-card'
              )
              const visible = document.querySelector(
                '.erp-business-selection-action-bar__compact-visible'
              )
              sample.frames.push({
                t: performance.now() - start,
                header: rect(header),
                command: rect(command),
                table: rect(table),
                nav: [...header.querySelectorAll('.ant-tabs-nav')].map(rect),
                actions: rect(visible),
                rowCount: document.querySelectorAll('tbody tr.ant-table-row')
                  .length,
                bodyWidth: document.body.scrollWidth,
                errors: sample.errors.length,
              })
              if (!loadedAt && sample.frames.at(-1).rowCount === 47)
                { loadedAt = performance.now() }
              if (
                (loadedAt && performance.now() - loadedAt > 5000) ||
                performance.now() - start > 24000
              ) {
                sample.done = true
                sample.loadedAt = loadedAt ? loadedAt - start : null
                return
              }
            }
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'list_shipments') return route.fallback()
          const now = Math.floor(Date.now() / 1000)
          const rows = Array.from({ length: 47 }, (_, index) => ({
            id: index + 1,
            shipment_no: `SHIP-COLD-${String(index + 1).padStart(4, '0')}`,
            status:
              index === 0 ? 'CANCELLED' : index === 1 ? 'DRAFT' : 'SHIPPED',
            finance_release_status: 'PENDING',
            finance_release_version: 1,
            sales_order_id: 1,
            customer_id: 1,
            customer_snapshot: '布局核对客户',
            planned_ship_at: now,
            shipped_at: index > 1 ? now : null,
            total_net_weight_g: null,
            note: '加载稳定性模拟出货',
            items: [
              {
                id: index + 1,
                shipment_id: index + 1,
                sales_order_item_id: 1,
                product_id: 1,
                product_sku_id: 1,
                warehouse_id: 1,
                unit_id: 1,
                lot_id: 1,
                quantity: '10',
              },
            ],
            created_at: now,
            updated_at: now,
          }))
          await new Promise((resolve) => setTimeout(resolve, 250))
          const selected = params.status
            ? rows.filter((row) => row.status === params.status)
            : rows
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                message: '',
                data: {
                  shipments: selected.slice(
                    params.offset || 0,
                    (params.offset || 0) + (params.limit || 50)
                  ),
                  total: selected.length,
                  status_counts: { DRAFT: 1, CANCELLED: 1, SHIPPED: 45 },
                },
              },
            },
          })
        })
      },
      verify: async (page) => {
        await page.waitForFunction(() => window.__warehouseColdEntry?.done)
        const sample = await page.evaluate(() => window.__warehouseColdEntry)
        await writeFile(
          path.join(outputDir, 'warehouse-cold-frames.json'),
          JSON.stringify(sample, null, 2)
        )
        const tail = sample.frames.filter(
          (frame) => frame.t > (sample.loadedAt ?? 18000) + 1500
        )
        const variants = Object.fromEntries(
          ['header', 'command', 'nav', 'actions', 'table'].map((key) => [
            key,
            [...new Set(tail.map((frame) => JSON.stringify(frame[key])))],
          ])
        )
        await writeFile(
          path.join(outputDir, 'warehouse-cold-variants.json'),
          JSON.stringify(
            { frames: sample.frames.length, errors: sample.errors, variants },
            null,
            2
          )
        )
        await page.screenshot({
          path: path.join(outputDir, 'warehouse-cold-entry-4k.png'),
        })
        assert.equal(tail.at(-1).rowCount, 47, '冷进入应装载完整模拟出货列表')
        assert.ok(tail.at(-1).actions, '应采样真实的当前记录操作区')
        assert.equal(
          await page.locator('.erp-business-module-tabs [role=tab]').count(),
          4,
          '四个主入口与子分类分别呈现'
        )
        assert.equal(
          await page
            .getByRole('tablist', { name: '出库办理分类', exact: true })
            .count(),
          1
        )
        for (const key of ['header', 'command', 'nav', 'actions', 'table'])
          { assert.ok(
            variants[key].length <= 1,
            `冷进入后 ${key} 持续抖动: ${JSON.stringify(variants[key])}`
          ) }
        await page.locator('.erp-admin-content').evaluate((element) => { element.scrollTop = 600 })
        await page.waitForFunction(() => {
          const toolbar = document.querySelector('.erp-business-toolbar-workspace > .erp-business-operation-panel')
          const header = document.querySelector('.erp-business-data-table-card--sticky .ant-table-sticky-holder')
          return toolbar && header && Math.abs(toolbar.getBoundingClientRect().bottom - header.getBoundingClientRect().top) <= 1
        })
        const sticky = await page.locator('.erp-business-toolbar-workspace').evaluate((workspace) => {
          const toolbar = workspace.querySelector('.erp-business-operation-panel')
          const header = workspace.querySelector('.ant-table-sticky-holder')
          return { toolbar: toolbar.getBoundingClientRect().toJSON(), header: header.getBoundingClientRect().toJSON() }
        })
        await writeFile(path.join(outputDir, 'warehouse-toolbar-sticky-ownership.json'), JSON.stringify(sticky, null, 2))
      },
    },
  ]
}
