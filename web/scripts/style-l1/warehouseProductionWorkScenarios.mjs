import { expect } from 'playwright/test'
import {
  compareProductionWipQuantity,
  validateProductionWipAggregate,
} from '../../src/erp/utils/productionWipModel.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

function workRow(values = {}) {
  return {
    id: 901,
    kind: 'RECEIPT',
    stage: 'AWAITING_INBOUND',
    production_order_id: 71,
    production_order_item_id: 7100,
    order_no: 'MO-WAREHOUSE-TEST',
    fact_id: 901,
    fact_no: 'FG-WAREHOUSE-TEST',
    fact_status: 'DRAFT',
    fact_version: 1,
    production_wip_batch_id: 91003,
    batch_no: 'WIP-WAREHOUSE-TEST',
    operation_name: '手工制作',
    product_name: '模拟抱抱熊',
    product_code: 'P-WH-01',
    sku_code: 'SKU-WH-01',
    unit_name: '只',
    warehouse_id: 1,
    warehouse_name: '模拟成品仓',
    lot_no: 'FG-WH-LOT',
    quantity: '30',
    pending_inspection_quantity: '0',
    pending_packaging_quantity: '0',
    packaging_confirmed: true,
    action_batch_id: 91003,
    action: '',
    ...values,
  }
}

function workPage(rows, params) {
  const matches = rows.filter(
    (row) =>
      row.kind === params.kind &&
      (!params.keyword || Object.values(row).join(' ').includes(params.keyword))
  )
  const counts = { '': matches.length }
  for (const row of matches) counts[row.stage] = (counts[row.stage] || 0) + 1
  const filtered = matches.filter(
    (row) => !params.stage || row.stage === params.stage
  )
  return {
    items: filtered.slice(
      params.offset || 0,
      (params.offset || 0) + (params.limit || 20)
    ),
    total: filtered.length,
    counts,
  }
}

async function fulfill(route, id, data) {
  await route.fulfill({
    json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
  })
}
async function closeRoute(page) {
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: '关闭', exact: true })
    .click()
}

export function createWarehouseProductionWorkScenarios(deps) {
  return [
    {
      name: 'warehouse-purchase-return-more-desktop',
      path: '/erp/warehouse/inbound?warehouse_view=purchase',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        const receipt = {
          id: 1,
          receipt_no: 'PR-WH-MORE',
          status: 'POSTED',
          version: 1,
          supplier_id: 1,
          received_at: 1784246400,
          posted_at: 1784246400,
          posted_by: 1,
          item_count: 1,
          items: [
            {
              id: 1,
              receipt_id: 1,
              material_id: 1,
              warehouse_id: 1,
              unit_id: 1,
              lot_id: 1,
              quantity: '10',
              posted_quantity: '10',
            },
          ],
        }
        await page.route('**/rpc/purchase', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_purchase_receipts') {
            return fulfill(
              route,
              id,
              stylePaginatedRpcData([receipt], 'purchase_receipts', params)
            )
          }
          if (method === 'get_purchase_receipt') {
            return fulfill(route, id, { purchase_receipt: receipt })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.getByText('PR-WH-MORE', { exact: true }).click()
        await expect(
          page
            .locator('.erp-business-selection-action-bar__compact-visible')
            .getByRole('button', { name: '生成采购退货', exact: true })
        ).toHaveCount(0)
        await page.getByRole('button', { name: /^更多操作，共/u }).click()
        const menu = page.locator('.erp-business-selection-action-menu:visible')
        await expect(
          menu.getByRole('button', { name: '生成采购退货', exact: true })
        ).toBeVisible()
        await expect(
          menu.getByRole('button', { name: '退货与调整记录', exact: true })
        ).toHaveCount(0)
        await expect(menu.locator('.erp-business-selection-action-menu__heading')).toHaveCount(0)
        await menu.press('Escape')
        await page.getByRole('button', { name: /相关单据/u }).click()
        await expect(
          page.getByRole('menuitem', { name: '退货与调整记录', exact: true })
        ).toBeVisible()
        await deps.assertNoHorizontalOverflow(page, 'warehouse-purchase-more')
      },
    },
    ...[1920, 1024].map((width) => {
      let receipt
      let posts
      return {
        name:
          width === 1920
            ? 'warehouse-finished-goods-receipt-desktop'
            : 'warehouse-finished-goods-receipt-narrow',
        path: '/erp/warehouse/inbound?warehouse_view=completion',
        auth: 'admin',
        effectiveSession: deps.customerRuntimeEffectiveSession,
        viewport: { width, height: 1080 },
        deviceScaleFactor: width === 1920 ? 2 : 1,
        beforeNavigate: async (page) => {
          receipt = workRow()
          posts = []
          await page.route('**/rpc/*', async (route) => {
            const { method, params = {}, id } = route.request().postDataJSON()
            if (method === 'list_warehouse_production_work') {
              return fulfill(route, id, workPage([receipt], params))
            }
            if (method === 'post_production_fact') {
              posts.push(params)
              receipt = {
                ...receipt,
                fact_status: 'POSTED',
                fact_version: 2,
                stage: 'AWAITING_QUALITY',
                pending_inspection_quantity: '30',
              }
              return fulfill(route, id, {
                production_fact: {
                  id: params.id,
                  status: 'POSTED',
                  version: params.expected_version + 1,
                  posted_at: 1784246400,
                  posted_by: 1,
                },
              })
            }
            return route.fallback()
          })
        },
        verify: async (page) => {
          const table = page.locator('.erp-business-toolbar-workspace')
          await table.getByText('FG-WAREHOUSE-TEST', { exact: true }).click()
          await table
            .getByRole('button', { name: '确认成品入库', exact: true })
            .click()
          const dialog = page.getByRole('dialog').last()
          await dialog.getByLabel(/^仓库实收数量\s*（只）$/u).fill('29')
          await dialog
            .getByRole('button', { name: '确认成品入库', exact: true })
            .click()
          await expect(
            dialog.getByText('实收数量与收仓单不一致，请先核对并编辑收仓草稿', {
              exact: true,
            })
          ).toBeVisible()
          deps.assert.equal(posts.length, 0)
          await dialog.getByLabel(/^仓库实收数量\s*（只）$/u).fill('30')
          await dialog
            .getByRole('checkbox', {
              name: '实物、仓库、批次与本次来源一致',
              exact: true,
            })
            .check()
          await dialog
            .getByRole('button', { name: '确认成品入库', exact: true })
            .click()
          await expect(dialog).not.toBeVisible()
          await expect(
            table.getByText('待检', { exact: true }).last()
          ).toBeVisible()
          deps.assert.deepEqual(posts, [{ id: 901, expected_version: 1 }])
          await table
            .getByRole('button', { name: '查看处理进度', exact: true })
            .click()
          await expect(
            page
              .getByRole('dialog')
              .last()
              .getByText('30 只', { exact: true })
              .first()
          ).toBeVisible()
          await deps.assertNoHorizontalOverflow(
            page,
            'warehouse-receipt-review'
          )
          await page.screenshot({
            path: deps.path.join(
              deps.outputDir,
              `warehouse-receipt-${width}.png`
            ),
            fullPage: true,
          })
        },
      }
    }),
    {
      name: 'warehouse-production-return-and-packing-desktop',
      path: '/erp/warehouse/inbound?warehouse_view=process-return',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      productionOrderReleased: true,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        let aggregate = null
        let returnDone = false
        let packingAction = 'TRANSFER_TO_NEXT_OPERATION'
        let packingID = 91003
        let packingComplete = false
        page.__warehouseActions = []
        await page.route('**/rpc/production_wip', async (route) => {
          const { method, params = {}, id } = route.request().postDataJSON()
          if (method === 'list_warehouse_production_work') {
            const rows =
              params.kind === 'RETURN'
                ? [
                    workRow({
                      id: 91021,
                      kind: 'RETURN',
                      fact_id: 0,
                      fact_no: '',
                      fact_status: '',
                      fact_version: 0,
                      production_wip_batch_id: 91021,
                      production_order_item_id: 7102,
                      batch_no: 'WIP-STYLE-91021',
                      operation_name: '布料加工',
                      quantity: '20',
                      action_batch_id: 91021,
                      stage: returnDone
                        ? 'AWAITING_QUALITY'
                        : 'AWAITING_RETURN',
                      action: returnDone ? '' : 'RECEIVE_OUTSOURCING_RETURN',
                    }),
                  ]
                : [
                    workRow({
                      id: 902,
                      fact_id: 902,
                      fact_no: 'FG-PACK-EXACT',
                      quantity: '4',
                      fact_status: 'POSTED',
                      stage: packingComplete ? 'READY' : 'AWAITING_PACKAGING',
                      pending_packaging_quantity: packingComplete ? '0' : '4',
                      action: packingAction,
                      action_batch_id: packingID,
                    }),
                  ]
            return fulfill(route, id, workPage(rows, params))
          }
          if (method === 'get_production_wip' && aggregate) {
            return fulfill(route, id, aggregate)
          }
          if (method === 'execute_production_wip_action' && aggregate) {
            page.__warehouseActions.push(params)
            const batch = aggregate.production_wip_batches.find(
              (row) => row.id === params.production_wip_batch_id
            )
            deps.assert.ok(Boolean(batch))
            deps.assert.equal(params.expected_version, batch.version)
            batch.version += 1
            if (params.action === 'RECEIVE_OUTSOURCING_RETURN') {
              deps.assert.equal(
                compareProductionWipQuantity(params.quantity, batch.quantity),
                0
              )
              batch.status = 'WAITING_QUALITY'
              returnDone = true
            } else if (params.action === 'TRANSFER_TO_NEXT_OPERATION') {
              deps.assert.equal(params.finished_goods_receipt_id, 902)
              deps.assert.equal(params.quantity, '4')
              const template = aggregate.production_order_operations.find(
                (op) =>
                  op.production_order_item_id ===
                    batch.production_order_item_id &&
                  op.operation_code === 'PACKAGING'
              )
              packingID = 99044
              packingAction = 'ASSIGN_EXECUTION'
              aggregate.production_wip_batches.push({
                ...batch,
                id: packingID,
                batch_no: 'WIP-PACK-EXACT',
                production_order_operation_id: template.id,
                source_batch_id: batch.id,
                finished_goods_receipt_id: 902,
                status: 'PLANNED',
                execution_mode: null,
                quantity: '4',
                version: 1,
              })
            } else if (params.action === 'ASSIGN_EXECUTION') {
              deps.assert.equal(params.execution_mode, 'IN_HOUSE')
              batch.execution_mode = 'IN_HOUSE'
              packingAction = 'START_OPERATION'
            } else if (params.action === 'START_OPERATION') {
              batch.status = 'IN_PROGRESS'
              packingAction = 'COMPLETE_OPERATION'
            } else if (params.action === 'COMPLETE_OPERATION') {
              batch.status = 'ACCEPTED'
              packingComplete = true
            }
            validateProductionWipAggregate(aggregate, { productionOrderID: 71 })
            return fulfill(route, id, aggregate)
          }
          return route.fallback()
        })
        page.__warehouseSetAggregate = (value) => {
          validateProductionWipAggregate(value, { productionOrderID: 71 })
          aggregate = value
        }
      },
      verify: async (page) => {
        const scope = page.locator('.erp-business-toolbar-workspace')
        await scope.getByText('MO-WAREHOUSE-TEST', { exact: true }).click()
        const response = page.waitForResponse(
          (res) => res.request().postDataJSON()?.method === 'get_production_wip'
        )
        await scope
          .getByRole('button', { name: '登记回货点数', exact: true })
          .click()
        const raw = structuredClone((await (await response).json()).result.data)
        await closeRoute(page)
        const returned = raw.production_wip_batches.find(
          (row) => row.id === 91021
        )
        returned.status = 'OUTSOURCED'
        returned.execution_mode = 'OUTSOURCED'
        raw.outsourcing_allocations.push(
          ...raw.material_requirements
            .filter(
              (row) =>
                row.production_order_item_id ===
                returned.production_order_item_id
            )
            .map((requirement, index) => ({
              ...raw.outsourcing_allocations[0],
              id: 99050 + index,
              production_wip_batch_id: returned.id,
              outsourcing_order_item_id: 99060 + index,
              production_order_material_requirement_id: requirement.id,
              allocated_quantity: requirement.planned_quantity,
              unit_id: requirement.unit_id,
            }))
        )
        const packed = raw.production_wip_batches.find(
          (row) => row.id === 91004
        )
        raw.production_wip_batches = raw.production_wip_batches.filter(
          (row) => row.id !== packed.id
        )
        raw.finished_goods_receipts = [
          {
            id: 901,
            fact_no: 'FG-PACK-FIRST',
            production_wip_batch_id: 91003,
            status: 'POSTED',
            quantity: '6',
            reworked_quantity: '0',
          },
          {
            id: 902,
            fact_no: 'FG-PACK-EXACT',
            production_wip_batch_id: 91003,
            status: 'POSTED',
            quantity: '4',
            reworked_quantity: '0',
          },
        ]
        const confirmation = raw.packaging_confirmations.find(
          (row) =>
            row.production_order_item_id === packed.production_order_item_id
        )
        Object.assign(confirmation, {
          status: 'CONFIRMED',
          packaging_version_snapshot: '模拟确认包装资料',
          confirmed_by: 1,
          confirmed_at: 1784246400,
        })
        page.__warehouseSetAggregate(raw)
        await scope
          .getByRole('button', { name: '登记回货点数', exact: true })
          .click()
        let dialog = page.getByRole('dialog').last()
        await dialog.getByLabel('仓库实点数量', { exact: true }).fill('0')
        await dialog
          .getByRole('button', { name: '确认办理', exact: true })
          .click()
        await expect(
          dialog.getByText('数量必须大于 0，且最多 14 位整数和 6 位小数', {
            exact: true,
          })
        ).toBeVisible()
        deps.assert.equal(page.__warehouseActions.length, 0)
        await dialog.getByLabel('仓库实点数量', { exact: true }).fill('19')
        await dialog
          .getByRole('button', { name: '确认办理', exact: true })
          .click()
        await expect(
          dialog.getByText('实点数量与本批次不一致，请先核对，暂不能整批送检', {
            exact: true,
          })
        ).toBeVisible()
        deps.assert.equal(page.__warehouseActions.length, 0)
        await dialog
          .getByLabel('仓库实点数量', { exact: true })
          .fill(returned.quantity)
        await dialog
          .getByRole('button', { name: '确认办理', exact: true })
          .click()
        await expect(
          page.getByText('外发回仓已登记', { exact: true })
        ).toBeVisible()
        await closeRoute(page)
        await page.getByRole('tab', { name: '成品入库', exact: true }).click()
        for (const action of [
          'TRANSFER_TO_NEXT_OPERATION',
          'ASSIGN_EXECUTION',
          'START_OPERATION',
          'COMPLETE_OPERATION',
        ]) {
          await scope
            .getByRole('cell')
            .getByText('FG-PACK-EXACT', { exact: true })
            .click()
          await scope
            .getByRole('button', { name: '办理查货包装', exact: true })
            .click()
          dialog = page.getByRole('dialog').last()
          if (action === 'TRANSFER_TO_NEXT_OPERATION') {
            const receipt = dialog.getByLabel('成品入库单', { exact: true })
            await expect(receipt).toBeDisabled()
            await expect(
              dialog.getByText('FG-PACK-EXACT · 可包装 4', { exact: true })
            ).toBeVisible()
            await expect(
              dialog.getByLabel('本次移交数量', { exact: true })
            ).toHaveValue('4')
          }
          await dialog
            .getByRole('button', { name: '确认办理', exact: true })
            .click()
          await expect(
            page.getByText(
              {
                TRANSFER_TO_NEXT_OPERATION: '已转入下道工序',
                ASSIGN_EXECUTION: '加工安排已保存',
                START_OPERATION: '当前工序已开始',
                COMPLETE_OPERATION: '包装已完成，库存不重复入库',
              }[action],
              { exact: true }
            )
          ).toBeVisible()
          await closeRoute(page)
        }
        deps.assert.deepEqual(
          page.__warehouseActions.map((request) => request.action),
          [
            'RECEIVE_OUTSOURCING_RETURN',
            'TRANSFER_TO_NEXT_OPERATION',
            'ASSIGN_EXECUTION',
            'START_OPERATION',
            'COMPLETE_OPERATION',
          ]
        )
        await expect(
          scope.getByText('检验包装已完成', { exact: true }).last()
        ).toBeVisible()
        await deps.assertNoHorizontalOverflow(
          page,
          'warehouse-production-packing'
        )
        await page.screenshot({
          path: deps.path.join(
            deps.outputDir,
            'warehouse-production-packing-4k.png'
          ),
          fullPage: true,
        })
      },
    },
  ]
}
