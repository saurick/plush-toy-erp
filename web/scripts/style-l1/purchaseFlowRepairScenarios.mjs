import path from 'node:path'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

const unix = (date) => Date.parse(`${date}T00:00:00Z`) / 1000

async function respond(route, payload, data) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: payload.id,
      result: { code: 0, message: 'OK', data },
    }),
  })
}

async function selectRow(page, text) {
  const row = page
    .locator('.ant-table-tbody tr')
    .filter({ hasText: text })
    .first()
  await row.waitFor()
  const selection = row.locator('input[type="checkbox"], input[type="radio"]')
  if (await selection.count()) await selection.check()
  else await row.click()
}

async function selectionAction(page, name) {
  const actions = page.getByRole('button', { name, exact: true })
  for (let index = 0; index < (await actions.count()); index += 1) {
    const action = actions.nth(index)
    if (await action.isVisible()) return action
  }
  await page
    .getByRole('button', { name: /^更多操作，共/u })
    .first()
    .click()
  const menu = page.locator('.erp-business-selection-action-menu:visible')
  await menu.waitFor({ state: 'visible', timeout: 5000 })
  const action = menu.getByRole('button', { name, exact: true }).first()
  await action.waitFor({ state: 'visible', timeout: 5000 })
  return action
}

export function createPurchaseFlowRepairScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const common = {
    auth: 'admin',
    mockAdminRpc: true,
    effectiveSession: {
      ...customerRuntimeEffectiveSession,
      actions: [
        ...new Set([
          ...customerRuntimeEffectiveSession.actions,
          PermissionCode.FIELD_PROCUREMENT_COMMERCIAL_READ,
        ]),
      ],
    },
    viewport: { width: 3840, height: 2160 },
  }
  const today = currentBusinessDate()
  let termRequests = []
  return [
    {
      ...common,
      name: 'purchase-confirmed-terms-retry-desktop',
      path: '/erp/purchase/accessories',
      beforeNavigate: async (page) => {
        termRequests = []
        const order = {
          id: 91001,
          purchase_order_no: 'PO-REPAIR-PRICE',
          supplier_id: 1,
          supplier_snapshot: { name: '补价模拟材料厂' },
          currency: 'CNY',
          lifecycle_status: 'approved',
          version: 1,
          item_count: 1,
          purchase_date: unix(today),
          expected_arrival_date: null,
          supplier_confirmed_arrival_date: null,
        }
        const items = [
          {
            id: 91002,
            purchase_order_id: order.id,
            line_no: 1,
            line_status: 'open',
            material_id: 1,
            unit_id: 1,
            material_code_snapshot: 'MAT-PRICE',
            material_name_snapshot: '补价模拟布料',
            purchased_quantity: '4',
            unit_price: null,
            amount: null,
            expected_arrival_date: null,
          },
        ]
        await page.route('**/rpc/purchase_order', async (route) => {
          const payload = route.request().postDataJSON()
          switch (payload?.method) {
            case 'list_purchase_orders':
              return respond(route, payload, {
                purchase_orders: [order],
                total: 1,
                limit: 50,
                offset: 0,
                status_counts: { approved: 1 },
              })
            case 'get_purchase_order':
              return respond(route, payload, { purchase_order: order })
            case 'list_purchase_order_items':
              return respond(route, payload, {
                purchase_order_items: items,
                total: 1,
                limit: payload.params.limit,
                offset: payload.params.offset,
              })
            case 'complete_purchase_order_terms': {
              termRequests.push(payload.params)
              if (termRequests.length === 1) {
                order.version = 2
                items[0].unit_price = payload.params.items[0].unit_price
                return respond(route, payload, { purchase_order: null })
              }
              return respond(route, payload, { purchase_order: order })
            }
            default:
              return route.fallback()
          }
        })
      },
      verify: async (page) => {
        await selectRow(page, 'PO-REPAIR-PRICE')
        await page.screenshot({
          path: path.join(outputDir, 'purchase-terms-before-open-4k.png'),
        })
        const termsButton = page.getByRole('button', {
          name: '补齐价格与交期',
          exact: true,
        })
        if (await termsButton.isVisible()) await termsButton.click()
        else {
          const more = page.getByRole('button', { name: /^更多操作，共/u })
          await more.first().click()
          await page
            .getByRole('button', { name: '补齐价格与交期', exact: true })
            .last()
            .click({ timeout: 5000 })
        }
        const dialog = page.getByRole('dialog', { name: /补齐价格与交期/u })
        await dialog.getByLabel('第1行单价', { exact: true }).fill('2.5')
        assert.equal(
          await dialog.getByLabel('采购数量', { exact: true }).count(),
          0
        )
        await assertBusinessModalViewport(page, dialog, {
          label: '采购补价弹窗',
          maxWidth: 960,
        })
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: path.join(outputDir, 'purchase-terms-dialog-4k.png'),
        })
        await dialog.getByRole('button', { name: '保存', exact: true }).click()
        await page
          .getByText('结果暂时无法确认，请保持内容不变后重试', { exact: true })
          .waitFor()
        await dialog.getByRole('button', { name: '保存', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(termRequests.length, 2)
        assert.deepEqual(termRequests[0], termRequests[1])
        assert.ok(termRequests[0].idempotency_key)
        assert.equal(termRequests[0].actor_id, undefined)
        assert.equal(termRequests[0].items[0].purchased_quantity, undefined)
        assert.equal(termRequests[0].items[0].unit_price, '2.5')
      },
    },
    {
      ...common,
      name: 'purchase-receipt-partial-inbound-desktop',
      path: '/erp/warehouse/inbound',
      beforeNavigate: async (page) => {
        const receipt = {
          id: 92001,
          receipt_no: 'PR-REPAIR-PARTIAL',
          supplier_id: 1,
          supplier_name: '混合收货模拟材料厂',
          status: 'POSTED',
          received_at: unix(today),
          posted_at: unix(today),
          posted_lines: 1,
          pending_inbound_lines: 1,
          can_post: true,
          items: [
            {
              id: 92002,
              receipt_id: 92001,
              material_id: 1,
              warehouse_id: 1,
              unit_id: 1,
              lot_id: 1,
              quantity: '4',
              posted: true,
            },
            {
              id: 92003,
              receipt_id: 92001,
              material_id: 1,
              warehouse_id: 1,
              unit_id: 1,
              lot_id: 2,
              quantity: '6',
              posted: false,
            },
            {
              id: 92004,
              receipt_id: 92001,
              material_id: 1,
              warehouse_id: 1,
              unit_id: 1,
              lot_id: 3,
              quantity: '2',
              posted: false,
              rejection_disposed: true,
            },
          ],
        }
        await page.route('**/rpc/purchase', async (route) => {
          const payload = route.request().postDataJSON()
          if (payload?.method === 'list_purchase_receipts')
            return respond(route, payload, {
              purchase_receipts: [receipt],
              total: 1,
              limit: 50,
              offset: 0,
            })
          if (payload?.method === 'get_purchase_receipt')
            return respond(route, payload, { purchase_receipt: receipt })
          if (payload?.method === 'post_purchase_receipt') {
            assert.equal(payload.params.id, receipt.id)
            assert.equal(payload.params.quantity, undefined)
            receipt.posted_lines = 2
            receipt.pending_inbound_lines = 0
            receipt.can_post = false
            receipt.items[1].posted = true
            return respond(route, payload, { purchase_receipt: receipt })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await selectRow(page, 'PR-REPAIR-PARTIAL')
        const post = page
          .locator('button[data-business-action-key="post"]')
          .first()
        await post.waitFor({ state: 'visible' })
        await page
          .locator('button[data-business-action-key="view-details"]')
          .click()
        const details = page.getByRole('dialog', { name: /^采购入库详情/u })
        await details.getByText('尚未入库', { exact: true }).waitFor()
        await details.getByText('部分入库', { exact: true }).waitFor()
        await details.getByText('已拒收处置', { exact: true }).waitFor()
        assert.equal(
          await details.getByText('已入库', { exact: true }).count(),
          1
        )
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: path.join(outputDir, 'purchase-partial-inbound-details-4k.png'),
        })
        await details.getByRole('button', { name: '关闭', exact: true }).click()
        await details.waitFor({ state: 'hidden' })
        let payable = await selectionAction(page, '生成应付')
        assert.equal(await payable.isDisabled(), true)
        assert.equal(await post.isEnabled(), true)
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: path.join(outputDir, 'purchase-partial-inbound-4k.png'),
        })
        await post.click()
        await page
          .getByRole('button', { name: '确认', exact: true })
          .last()
          .click()
        await page.getByText('本次合格材料已入库', { exact: true }).waitFor()
        payable = await selectionAction(page, '生成应付')
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll('button')).some(
            (button) =>
              button.textContent.trim() === '生成应付' && !button.disabled
          )
        )
        assert.equal(await payable.isEnabled(), true)
        await page.keyboard.press('Escape')
      },
    },
  ]
}
