import path from 'node:path'
import { styleRpcResult } from './rpcMockResult.mjs'
import { assertVisibleBusinessFormControlHeight } from './inputControlAssertions.mjs'

export function createTransactionFormRecoveryScenarios({
  assert,
  customerRuntimeEffectiveSession,
  expectHeading,
  expectText,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  let createCalls = []
  let postedCalls = 0
  let operation
  return [
    {
      name: 'inventory-operation-create-recovery',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      viewport: { width: 1600, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'inventory'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'warehouse.adjustment.create',
        ],
      },
      beforeNavigate: async (page) => {
        createCalls = []
        postedCalls = 0
        operation = null
        await page.route('**/rpc/inventory', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'post_inventory_operation') postedCalls += 1
          if (body.method !== 'create_inventory_operation') {
            return route.fallback()
          }
          createCalls.push(body.params)
          operation ??= {
            ...body.params,
            id: 811,
            status: 'DRAFT',
            version: 1,
            created_by: 1,
            items: body.params.items.map((item, index) => ({
              ...item,
              id: 911 + index,
            })),
          }
          // The draft exists, but its first response omits the receipt. The retry must reuse the intent key.
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id: body.id,
              result: styleRpcResult(
                createCalls.length === 1
                  ? {}
                  : { inventory_operation: operation }
              ),
            },
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await page.locator('.ant-table-row').first().click()
        await page
          .locator('button:visible')
          .filter({ hasText: /盘\s*点/u })
          .first()
          .click()
        const dialog = page.getByRole('dialog').filter({
          has: page.getByText('登记库存盘点', { exact: true }),
        })
        await dialog.waitFor()
        const submit = dialog.getByRole('button', {
          name: '生成盘点作业',
          exact: true,
        })
        await submit.click()
        await expectText(dialog, '请填写作业单号')
        await expectText(dialog, '请填写业务原因')
        assert.equal(
          createCalls.length,
          0,
          'incomplete form must not write a draft'
        )
        await dialog
          .getByLabel('作业单号', { exact: true })
          .fill('CC-BROWSER-RECOVERY')
        await dialog
          .getByLabel('业务原因', { exact: true })
          .fill('盘点后核对差异')
        const counted = dialog.getByLabel('实盘数量', { exact: true })
        await counted.fill('-1')
        await submit.click()
        await expectText(dialog, '实盘数量必须是非负数')
        assert.equal(
          createCalls.length,
          0,
          'negative count must not reach the RPC'
        )
        await counted.fill('8')
        await submit.click()
        await expectText(page, '提交结果暂时无法确认，请保持填写内容不变后重试')
        assert.equal(createCalls.length, 1)
        assert.equal(await counted.inputValue(), '8')
        assert.equal(
          await dialog.getByLabel('作业单号', { exact: true }).inputValue(),
          'CC-BROWSER-RECOVERY'
        )
        assert.equal(
          await dialog.getByLabel('业务原因', { exact: true }).inputValue(),
          '盘点后核对差异'
        )
        await submit.click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(createCalls.length, 2)
        assert.deepEqual(
          createCalls[1],
          createCalls[0],
          'unknown response retry must preserve the complete intent and key'
        )
        const { idempotency_key: key, ...payload } = createCalls[0]
        assert.match(key, /^.{1,128}$/u)
        assert.deepEqual(payload, {
          operation_no: 'CC-BROWSER-RECOVERY',
          operation_type: 'CYCLE_COUNT',
          reason: '盘点后核对差异',
          items: [
            {
              line_no: '1',
              subject_type: 'PRODUCT',
              subject_id: 1,
              product_sku_id: 1,
              from_warehouse_id: 1,
              from_lot_id: 402,
              unit_id: 1,
              expected_quantity: '12.5',
              counted_quantity: '8',
            },
          ],
        })
        assert.equal(postedCalls, 0, 'creating a draft must not post inventory')
        await expectText(page, '库存作业草稿已生成，请核对后过账')
        await expectText(page, 'CC-BROWSER-RECOVERY')
        await assertNoHorizontalOverflow(
          page,
          'inventory-operation-create-recovery'
        )
        await page.screenshot({
          path: path.join(outputDir, 'inventory-operation-create-recovery.png'),
          fullPage: false,
        })
      },
    },
    {
      name: 'business-form-control-height-css-token',
      path: '/erp/finance/payments',
      auth: 'admin',
      viewport: { width: 1600, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'finance-payments'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'finance.payment.read',
          'finance.payment.create',
        ],
      },
      verify: async (page) => {
        await expectHeading(page, '收付款')
        await page
          .getByRole('button', { name: '登记收付款', exact: true })
          .click()
        const form = page.locator('.erp-business-action-form:visible')
        await form.waitFor()
        const input = form.getByLabel('收付款单号', { exact: true })
        const originalStyle = await input.getAttribute('style')
        const originalHeight = await input.evaluate((node) => node.offsetHeight)
        await assertVisibleBusinessFormControlHeight(page, 'css-token-original')
        try {
          await input.evaluate((node) =>
            node.style.setProperty(
              'height',
              'calc(var(--erp-control-height) + 4px)',
              'important'
            )
          )
          await page.waitForFunction(
            ({ id, height }) => document.getElementById(id)?.offsetHeight === height,
            { id: await input.getAttribute('id'), height: originalHeight + 4 }
          )
          await assert.rejects(
            () =>
              assertVisibleBusinessFormControlHeight(
                page,
                'css-token-negative-control'
              ),
            /业务表单单行输入控件高度未统一/u,
            'the resolved CSS token must still reject a real 4px mismatch'
          )
        } finally {
          await input.evaluate((node, style) => {
            if (style === null) node.removeAttribute('style')
            else node.setAttribute('style', style)
          }, originalStyle)
          await page.waitForFunction(
            ({ id, height }) => document.getElementById(id)?.offsetHeight === height,
            { id: await input.getAttribute('id'), height: originalHeight }
          )
        }
        await assertVisibleBusinessFormControlHeight(page, 'css-token-restored')
      },
    },
  ]
}
