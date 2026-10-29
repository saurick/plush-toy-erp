import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function respond(route, payload, data) {
  return route.fulfill({
    json: {
      jsonrpc: '2.0',
      id: payload.id,
      result: { code: 0, message: 'OK', data },
    },
  })
}

export function createPurchaseFollowupScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const today = currentBusinessDate()
  const common = {
    auth: 'admin',
    mockAdminRpc: true,
    viewport: { width: 3840, height: 2160 },
    effectiveSession: {
      ...customerRuntimeEffectiveSession,
      actions: customerRuntimeEffectiveSession.actions.filter(
        (code) => code !== PermissionCode.FIELD_PROCUREMENT_COMMERCIAL_READ
      ),
    },
  }
  let deliveryCalls = []
  let boardCalls = []
  let failBoard = false
  let supplierSaveCalls = 0
  let materialQueries = []
  const followups = Array.from({ length: 51 }, (_, index) => ({
    key: `overdue:purchase_order:93001:${index + 1}`,
    kind: 'overdue',
    source_type: 'purchase_order',
    source_id: 93001,
    source_no: 'PO-FOLLOWUP',
    order_id: 93001,
    order_no: 'PO-FOLLOWUP',
    line_id: index + 1,
    line_no: index + 1,
    supplier_id: 1,
    supplier_name: '采购跟进模拟厂商',
    material_code: `MAT-${index + 1}`,
    material_name: `待到货面料 ${index + 1}`,
    unit_name: '米',
    quantity: '6',
    due_date: today,
    date_source: 'line',
  }))
  return [
    {
      ...common,
      name: 'purchase-supplier-switch-guard',
      path: '/erp/purchase/accessories',
      effectiveSession: customerRuntimeEffectiveSession,
      beforeNavigate: async (page) => {
        supplierSaveCalls = 0
        materialQueries = []
        const suppliers = [1, 2].map((id) => ({
          id,
          code: `SUP-${id}`,
          name: `防错厂商${id}`,
          is_active: true,
          default_payment_term_days: 0,
        }))
        const materials = [
          {
            id: 1,
            code: 'MAT-A',
            name: '防错材料',
            supplier_id: 1,
            supplier_item_no: 'FACTORY-A-1',
            unit_id: 1,
            is_active: true,
          },
        ]
        const order = {
          id: 93011,
          purchase_order_no: 'PO-SUPPLIER',
          supplier_id: 1,
          supplier_snapshot: { name: '防错厂商1' },
          lifecycle_status: 'draft',
          version: 1,
          currency: 'CNY',
          payment_term_days: 0,
          purchase_date: Date.parse(`${today}T00:00:00+08:00`) / 1000,
          item_count: 1,
        }
        const items = [
          {
            id: 93012,
            purchase_order_id: order.id,
            line_no: 1,
            line_status: 'open',
            material_id: 1,
            unit_id: 1,
            material_code_snapshot: 'MAT-A',
            material_name_snapshot: '防错材料',
            purchased_quantity: '10',
            unit_price: null,
            amount: null,
          },
        ]
        await page.route('**/rpc/masterdata', async (route) => {
          const p = route.request().postDataJSON()
          if (p.method === 'list_suppliers') {
            const rows = suppliers.filter(
              (supplier) => !p.params.ids || p.params.ids.includes(supplier.id)
            )
            return respond(route, p, {
              suppliers: rows,
              total: rows.length,
              limit: p.params.limit,
              offset: 0,
            })
          }
          if (p.method === 'list_materials') {
            materialQueries.push(p.params)
            const rows = materials.filter(
              (m) =>
                !p.params.purchase_supplier_id ||
                m.supplier_id === Number(p.params.purchase_supplier_id)
            )
            return respond(route, p, {
              materials: rows,
              total: rows.length,
              limit: p.params.limit,
              offset: 0,
            })
          }
          return route.fallback()
        })
        await page.route('**/rpc/purchase_order', async (route) => {
          const p = route.request().postDataJSON()
          if (p.method === 'list_purchase_orders') {
            return respond(route, p, {
              purchase_orders: [order],
              total: 1,
              limit: p.params.limit,
              offset: 0,
              status_counts: { draft: 1 },
            })
          }
          if (p.method === 'get_purchase_order') {
            return respond(route, p, { purchase_order: order })
          }
          if (p.method === 'list_purchase_order_items') {
            return respond(route, p, {
              purchase_order_items: items,
              total: 1,
              limit: p.params.limit,
              offset: 0,
            })
          }
          if (p.method === 'save_purchase_order_with_items') supplierSaveCalls++
          return route.fallback()
        })
      },
      verify: async (page) => {
        const row = page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: 'PO-SUPPLIER' })
          .first()
        await row.locator('input[type="checkbox"], input[type="radio"]').check()
        await page.locator('[data-business-action-key="purchase-edit"]').click()
        const dialog = page.getByRole('region', {
          name: '编辑采购订单',
          exact: true,
        })
        const supplier = dialog.getByLabel('供应商', { exact: true })
        await supplier.press('ArrowDown')
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '防错厂商2' })
          .click()
        await dialog
          .getByRole('button', { name: '保存草稿', exact: true })
          .click()
        await dialog
          .getByText('材料属于其他厂商，请重新选择', { exact: true })
          .waitFor()
        assert.equal(supplierSaveCalls, 0)
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().postDataJSON()?.method === 'list_materials' &&
              Number(
                response.request().postDataJSON()?.params?.purchase_supplier_id
              ) === 2
          ),
          dialog.getByLabel('材料名称', { exact: true }).press('ArrowDown'),
        ])
        assert.ok(
          materialQueries.some((q) => Number(q.purchase_supplier_id) === 2)
        )
        await page.keyboard.press('Escape')
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: path.join(outputDir, 'purchase-supplier-guard-4k.png'),
        })
      },
    },
    {
      ...common,
      name: 'purchase-delivery-without-prices',
      path: '/erp/purchase/accessories',
      beforeNavigate: async (page) => {
        deliveryCalls = []
        const order = {
          id: 93001,
          purchase_order_no: 'PO-DELIVERY',
          supplier_id: 1,
          supplier_snapshot: { name: '交期模拟厂商' },
          lifecycle_status: 'approved',
          version: 1,
          currency: 'CNY',
          purchase_date: Date.parse(`${today}T00:00:00+08:00`) / 1000,
          item_count: 1,
        }
        const items = [
          {
            id: 93002,
            purchase_order_id: order.id,
            line_no: 1,
            line_status: 'open',
            material_id: 1,
            unit_id: 1,
            material_code_snapshot: 'MAT-DELIVERY',
            material_name_snapshot: '交期模拟面料',
            purchased_quantity: '10',
            unit_price: null,
            amount: null,
          },
        ]
        await page.route('**/rpc/purchase_order', async (route) => {
          const p = route.request().postDataJSON()
          if (p.method === 'list_purchase_orders') {
            return respond(route, p, {
              purchase_orders: [order],
              total: 1,
              limit: p.params.limit,
              offset: 0,
              status_counts: { approved: 1 },
            })
          }
          if (p.method === 'get_purchase_order') {
            return respond(route, p, { purchase_order: order })
          }
          if (p.method === 'list_purchase_order_items') {
            return respond(route, p, {
              purchase_order_items: items,
              total: 1,
              limit: p.params.limit,
              offset: 0,
            })
          }
          if (p.method === 'update_purchase_order_delivery') {
            deliveryCalls.push(p.params)
            return respond(route, p, {
              purchase_order: { ...order, version: 2 },
            })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const row = page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: 'PO-DELIVERY' })
          .first()
        await row.locator('input[type="checkbox"], input[type="radio"]').check()
        let action = page.getByRole('button', { name: '维护交期', exact: true })
        if (!(await action.isVisible())) {
          await page
            .getByRole('button', { name: /^更多操作，共/u })
            .first()
            .click()
          action = page
            .getByRole('button', { name: '维护交期', exact: true })
            .last()
        }
        await action.click()
        const dialog = page.getByRole('dialog', { name: /维护交期/u })
        await dialog.getByText('交期模拟面料', { exact: false }).waitFor()
        assert.equal(
          await dialog.getByRole('spinbutton').count(),
          0,
          '无价格权限时不显示价格输入'
        )
        await dialog.getByLabel('第1行预计到货日期', { exact: true }).click()
        await page
          .locator(`.ant-picker-dropdown:visible td[title="${today}"]`)
          .click()
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: path.join(outputDir, 'purchase-delivery-only-4k.png'),
        })
        await dialog.getByRole('button', { name: '保存', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(deliveryCalls.length, 1)
        assert.equal(deliveryCalls[0].items[0].unit_price, undefined)
        assert.ok(deliveryCalls[0].items[0].expected_arrival_date)
        assert.ok(deliveryCalls[0].idempotency_key)
      },
    },
    {
      ...common,
      name: 'purchase-followup-server-pagination',
      path: '/erp/purchase/accessories',
      beforeNavigate: async (page) => {
        boardCalls = []
        failBoard = false
        await page.route('**/rpc/purchase_order', async (route) => {
          const p = route.request().postDataJSON()
          if (p.method !== 'list_purchase_followups') return route.fallback()
          boardCalls.push(p.params)
          if (failBoard) {
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id: p.id,
                error: { code: -32603, message: '模拟读取失败' },
              },
            })
          }
          let all = followups
          if (p.params.keyword) {
            all = all.filter((row) => row.material_code === p.params.keyword)
          }
          const total = all.length
          return respond(route, p, {
            rows: all.slice(p.params.offset, p.params.offset + p.params.limit),
            total,
            counts: { overdue: total },
            days: { [today]: total },
            as_of_date: today,
            access: { quality: false, commercial: false, finance: false },
            limit: p.params.limit,
            offset: p.params.offset,
          })
        })
      },
      verify: async (page) => {
        await page.getByText('到货计划', { exact: true }).click()
        const panel = page.getByRole('region', {
          name: '采购到货计划',
          exact: true,
        })
        await panel.getByRole('button', { name: /^全部\s*51/u }).waitFor()
        assert.equal(
          await panel.locator('.ant-table-tbody > tr[data-row-key]').count(),
          25
        )
        await panel.locator('.ant-pagination-next button').click()
        await panel
          .getByText('MAT-26 · 待到货面料 26', { exact: true })
          .waitFor()
        assert.equal(boardCalls.at(-1).offset, 25)
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          panel
            .getByRole('button', { name: '导出当前结果', exact: true })
            .click(),
        ])
        assert.equal(
          (await readFile(await download.path(), 'utf8')).trim().split('\n')
            .length,
          52
        )
        const search = page.getByPlaceholder('搜索单号、供应商或材料', {
          exact: true,
        })
        await search.fill('MAT-3')
        await search.press('Enter')
        await panel.getByRole('button', { name: /^全部\s*1\s/u }).waitFor()
        assert.equal(boardCalls.at(-1).offset, 0)
        assert.equal(boardCalls.at(-1).keyword, 'MAT-3')
        await page
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await panel.getByRole('button', { name: /^全部\s*51/u }).waitFor()
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: path.join(outputDir, 'purchase-followups-4k.png'),
        })
        failBoard = true
        await page
          .getByRole('button', { name: '刷新当前页', exact: true })
          .click()
        await panel
          .getByRole('button', { name: '重新加载', exact: true })
          .waitFor()
        assert.equal(
          await panel.locator('.ant-table-tbody > tr[data-row-key]').count(),
          0
        )
        failBoard = false
        await panel
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        await panel.getByRole('button', { name: /^全部\s*51/u }).waitFor()
        await page.getByText('异常汇总', { exact: true }).click()
        const exceptions = page.getByRole('region', {
          name: '采购异常汇总',
          exact: true,
        })
        await exceptions.getByRole('button', { name: /^全部\s*51/u }).waitFor()
        for (const label of ['缺少单价', '待核对应付', '拒收待处理']) {
          assert.equal(
            await exceptions
              .getByRole('button', { name: new RegExp(label) })
              .count(),
            0
          )
        }
        assert.equal(boardCalls.at(-1).view, 'exceptions')
        for (const width of [1440, 768]) {
          await page.setViewportSize({ width, height: 1000 })
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth
            ),
            false
          )
        }
      },
    },
  ]
}
