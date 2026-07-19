import path from 'node:path'

import { stylePaginatedRpcData } from './rpcMockResult.mjs'

export function createFinanceBusinessSourceScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
  } = deps

  const selectRow = async (page, businessNo) => {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(businessNo, { exact: true }) })
      .first()
    await row.waitFor({ state: 'visible', timeout: 10_000 })
    await row.click()
    return row
  }

  const clickSelectionAction = async (page, actionName) => {
    const direct = page.getByRole('button', {
      name: actionName,
      exact: true,
    })
    if ((await direct.count()) > 0 && (await direct.first().isVisible())) {
      await direct.first().click()
      return
    }
    const more = page.getByRole('button', { name: /更多操作/u }).last()
    await more.waitFor({ state: 'visible', timeout: 10_000 })
    await more.click()
    const drawer = page.locator('.erp-business-selection-action-drawer')
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    await drawer.getByRole('button', { name: actionName, exact: true }).click()
  }

  const assertFinanceSourceModal = async (
    page,
    { title, sourceNo, reconciliation = false }
  ) => {
    const modal = page.getByRole('dialog', { name: title }).last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await modal.getByLabel('业务编号').waitFor({ state: 'visible' })
    await modal.getByLabel('发生时间').waitFor({ state: 'visible' })
    const modalText = String((await modal.innerText()) || '').replace(
      /\s+/gu,
      ' '
    )
    assert(
      modalText.includes(sourceNo),
      `${title} 应显示业务来源 ${sourceNo}: ${modalText}`
    )
    assert(
      modalText.includes(
        reconciliation ? '不是多单据核销' : '金额和币种由系统核算'
      ),
      `${title} 应说明来源锁定边界: ${modalText}`
    )
    const formLabels = await modal
      .locator('.ant-form-item-label label')
      .allTextContents()
    assert.deepEqual(
      formLabels.map((label) => label.trim()),
      ['业务编号', '发生时间', '备注'],
      `${title} 只允许岗位人员填写三个业务字段`
    )
    const noteInput = modal.getByLabel('备注')
    await noteInput.scrollIntoViewIfNeeded()
    await noteInput.waitFor({ state: 'visible' })
    for (const technicalText of [
      'source_type',
      'source_id',
      'idempotency_key',
      'RBAC',
      'API',
    ]) {
      assert.equal(
        modalText.includes(technicalText),
        false,
        `${title} 不应显示技术字段 ${technicalText}`
      )
    }
    return modal
  }

  const mockPayableSource = async (
    page,
    { factNo, sourceType, sourceID, sourceNo }
  ) => {
    await page.route('**/rpc/operational_fact', async (route) => {
      const body = route.request().postDataJSON() || {}
      if (body.method !== 'list_finance_facts') {
        await route.fallback()
        return
      }
      const now = Math.floor(Date.now() / 1000)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || 'finance-related-source',
          result: {
            code: 0,
            message: 'OK',
            data: {
              finance_facts: [
                {
                  id: 91,
                  fact_no: factNo,
                  fact_type: 'PAYABLE',
                  status: 'POSTED',
                  counterparty_type: 'SUPPLIER',
                  counterparty_id: 1,
                  amount: '70.00',
                  fee_amount: '0',
                  currency: 'CNY',
                  source_type: sourceType,
                  source_id: sourceID,
                  source_no: sourceNo,
                  occurred_at: now,
                  note: '关联单据跳转回归',
                  created_at: now,
                  updated_at: now,
                },
              ],
              total: 1,
              limit: 20,
              offset: 0,
            },
          },
        }),
      })
    })
  }

  const mockEmptyPaginatedLists = async (
    page,
    routePattern,
    recordKeyByMethod
  ) => {
    await page.route(routePattern, async (route) => {
      const body = route.request().postDataJSON() || {}
      const recordKey = recordKeyByMethod[body.method]
      if (!recordKey) {
        await route.fallback()
        return
      }
      const limit = Number(body.params?.limit || 200)
      const offset = Number(body.params?.offset || 0)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || `empty-${body.method}`,
          result: {
            code: 0,
            message: 'OK',
            data: {
              [recordKey]: [],
              total: 0,
              limit,
              offset,
            },
          },
        }),
      })
    })
  }

  const openPayableSource = async (page, factNo) => {
    await expectHeading(page, '应付管理')
    await selectRow(page, factNo)
    await page.getByRole('button', { name: /相关单据/u }).click()
    await page.getByRole('menuitem', { name: '来源单据', exact: true }).click()
  }

  return [
    {
      name: 'finance-shipment-receivable-invoice-source-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/operational_fact', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_shipments') {
            await route.fallback()
            return
          }
          const now = Math.floor(Date.now() / 1000)
          const shipment = {
            id: 1,
            shipment_no: 'SHIP-STYLE-L1',
            status: 'SHIPPED',
            sales_order_id: 1,
            customer_id: 1,
            customer_snapshot: '暗色客户',
            planned_ship_at: now - 86_400,
            shipped_at: now,
            total_net_weight_g: '2.5',
            note: '已确认出货，等待财务记录',
            items: [
              {
                id: 1,
                shipment_id: 1,
                sales_order_item_id: 1,
                product_id: 1,
                warehouse_id: 1,
                unit_id: 1,
                lot_id: 1,
                quantity: '10',
                note: '样式出货明细',
                created_at: now,
                updated_at: now,
              },
            ],
            created_at: now - 86_400,
            updated_at: now,
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'finance-shipment-source',
              result: {
                code: 0,
                message: 'OK',
                data: stylePaginatedRpcData(
                  [shipment],
                  'shipments',
                  body.params || {}
                ),
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        await selectRow(page, 'SHIP-STYLE-L1')
        await clickSelectionAction(page, '生成应收')
        let modal = page.getByRole('dialog', { name: '生成应收' }).last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        let modalText = String((await modal.innerText()) || '').replace(
          /\s+/gu,
          ' '
        )
        assert(modalText.includes('SHIP-STYLE-L1'))
        assert(modalText.includes('暗色客户'))
        assert(modalText.includes('客户、金额和应收账期由来源单据确定'))
        assert.deepEqual(
          (
            await modal.locator('.ant-form-item-label label').allTextContents()
          ).map((label) => label.trim()),
          ['发生时间', '备注']
        )
        await modal.locator('textarea').fill('出货应收来源核对')
        await modal.getByRole('button', { name: '生成应收草稿' }).click()
        await expectText(page, '应收草稿已生成，请到应收管理核对并确认')
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })

        await selectRow(page, 'SHIP-STYLE-L1')
        await clickSelectionAction(page, '生成开票记录')
        modal = page.getByRole('dialog', { name: '生成开票记录' }).last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        modalText = String((await modal.innerText()) || '').replace(
          /\s+/gu,
          ' '
        )
        assert(modalText.includes('SHIP-STYLE-L1'))
        assert(modalText.includes('暗色客户'))
        assert(modalText.includes('客户、金额和应收账期由来源单据确定'))
        assert.deepEqual(
          (
            await modal.locator('.ant-form-item-label label').allTextContents()
          ).map((label) => label.trim()),
          ['发票类别', '发生时间', '备注']
        )
        assert.equal(await modal.locator('textarea').inputValue(), '')
        for (const technicalText of [
          'source_type',
          'source_id',
          'idempotency_key',
          'RBAC',
          'API',
        ]) {
          assert.equal(modalText.includes(technicalText), false)
        }
        await modal.getByRole('combobox', { name: '发票类别' }).click()
        await page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option')
          .filter({ hasText: '出口普通发票' })
          .click()
        await modal.locator('textarea').fill('出货开票来源核对')
        await modal.getByRole('button', { name: '生成开票草稿' }).click()
        await expectText(page, '开票记录草稿已生成，请到发票管理核对并确认')
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'finance-shipment-receivable-invoice-source-desktop'
        )
      },
    },
    (() => {
      let invoiceListRequests = []
      let shipmentGetRequests = []
      return {
        name: 'finance-invoice-shipment-invoice-related-roundtrip-desktop',
        path: '/erp/finance/invoices',
        auth: 'admin',
        adminProfile: {
          username: 'style-l1-invoice-shipment-roundtrip',
          is_super_admin: false,
          permissions: ['finance.invoice.read', 'shipment.read'],
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          pages: ['invoices', 'shipments'],
          actions: ['finance.invoice.read', 'shipment.read'],
        },
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          invoiceListRequests = []
          shipmentGetRequests = []
          await page.route('**/rpc/operational_fact', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method === 'list_finance_facts') {
              invoiceListRequests.push(body.params || {})
            }
            if (body.method === 'get_shipment') {
              shipmentGetRequests.push(body.params || {})
            }
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '发票管理')
          await selectRow(page, 'INV-STYLE-L1')
          await page.getByRole('button', { name: /相关单据/u }).click()
          await page
            .getByRole('menuitem', { name: '来源单据', exact: true })
            .click()

          await expectHeading(page, '出货单')
          await expectText(page, 'SHIP-STYLE-L1')
          let search = page.getByPlaceholder('搜索出货')
          assert.equal(await search.inputValue(), 'SHIP-STYLE-L1')
          let url = new URL(page.url())
          assert.equal(url.searchParams.get('shipment_id'), '1')
          assert(
            shipmentGetRequests.some((params) => params.id === 1),
            `出货精确读取必须使用数值 ID: ${JSON.stringify(
              shipmentGetRequests
            )}`
          )
          const firstShipmentGetCount = shipmentGetRequests.filter(
            (params) => params.id === 1
          ).length
          await page.screenshot({
            path: path.resolve(
              import.meta.dirname,
              '../../output/playwright/style-l1/finance-invoice-roundtrip-shipment-filter.png'
            ),
            fullPage: true,
          })

          await page.getByRole('button', { name: /相关单据/u }).click()
          await page
            .getByRole('menuitem', { name: '开票记录', exact: true })
            .click()

          await expectHeading(page, '发票管理')
          await expectText(page, 'INV-STYLE-L1')
          search = page.getByPlaceholder('搜索单号')
          url = new URL(page.url())
          assert.equal(url.searchParams.get('source_type'), 'SHIPMENT')
          assert.equal(url.searchParams.get('source_id'), '1')
          assert.equal(url.searchParams.get('link_keyword'), 'SHIP-STYLE-L1')
          assert(
            invoiceListRequests.some(
              (params) =>
                params.fact_type === 'INVOICE' &&
                params.source_type === 'SHIPMENT' &&
                params.source_id === 1
            ),
            `第二跳必须以数值来源 ID 精确请求发票列表: ${JSON.stringify(
              invoiceListRequests
            )}`
          )
          await page.waitForFunction(
            () =>
              document.querySelector('input[placeholder="搜索单号"]')
                ?.value === 'INV-STYLE-L1'
          )
          assert.equal(await search.inputValue(), 'INV-STYLE-L1')
          const firstInvoiceExactRequestCount = invoiceListRequests.filter(
            (params) =>
              params.fact_type === 'INVOICE' &&
              params.source_type === 'SHIPMENT' &&
              params.source_id === 1
          ).length

          await page.getByRole('button', { name: /相关单据/u }).click()
          await page
            .getByRole('menuitem', { name: '来源单据', exact: true })
            .click()

          await expectHeading(page, '出货单')
          await expectText(page, 'SHIP-STYLE-L1')
          search = page.getByPlaceholder('搜索出货')
          await page.waitForFunction(
            () =>
              document.querySelector('input[placeholder="搜索出货"]')
                ?.value === 'SHIP-STYLE-L1'
          )
          assert.equal(await search.inputValue(), 'SHIP-STYLE-L1')
          url = new URL(page.url())
          assert.equal(url.searchParams.get('shipment_id'), '1')
          assert(
            shipmentGetRequests.filter((params) => params.id === 1).length >
              firstShipmentGetCount,
            `第二轮出货精确读取仍必须使用数值 ID: ${JSON.stringify(
              shipmentGetRequests
            )}`
          )

          await page.getByRole('button', { name: /相关单据/u }).click()
          await page
            .getByRole('menuitem', { name: '开票记录', exact: true })
            .click()

          await expectHeading(page, '发票管理')
          await expectText(page, 'INV-STYLE-L1')
          search = page.getByPlaceholder('搜索单号')
          await page.waitForFunction(
            () =>
              document.querySelector('input[placeholder="搜索单号"]')
                ?.value === 'INV-STYLE-L1'
          )
          assert.equal(await search.inputValue(), 'INV-STYLE-L1')
          url = new URL(page.url())
          assert.equal(url.searchParams.get('source_type'), 'SHIPMENT')
          assert.equal(url.searchParams.get('source_id'), '1')
          assert.equal(url.searchParams.get('link_keyword'), 'SHIP-STYLE-L1')
          assert(
            invoiceListRequests.filter(
              (params) =>
                params.fact_type === 'INVOICE' &&
                params.source_type === 'SHIPMENT' &&
                params.source_id === 1
            ).length > firstInvoiceExactRequestCount,
            `第二轮发票精确请求仍必须使用数值来源 ID: ${JSON.stringify(
              invoiceListRequests
            )}`
          )
          await assertNoHorizontalOverflow(
            page,
            'finance-invoice-roundtrip-invoice-canonical-filter'
          )
          await page.screenshot({
            path: path.resolve(
              import.meta.dirname,
              '../../output/playwright/style-l1/finance-invoice-roundtrip-invoice-canonical-filter.png'
            ),
            fullPage: true,
          })
          assert.equal(
            await page.locator('.ant-message-error').count(),
            0,
            `不应出现错误提示: ${(
              await page.locator('.ant-message-error').allTextContents()
            ).join(' / ')}`
          )

          await page.getByRole('button', { name: '清空筛选' }).click()
          await page.waitForFunction(
            () =>
              document.querySelector('input[placeholder="搜索单号"]')
                ?.value === ''
          )
          assert.equal(await search.inputValue(), '')
          url = new URL(page.url())
          assert.equal(url.searchParams.has('source_type'), false)
          assert.equal(url.searchParams.has('source_id'), false)
          assert.equal(url.searchParams.has('link_keyword'), false)
          await assertNoHorizontalOverflow(
            page,
            'finance-invoice-shipment-invoice-related-roundtrip-desktop'
          )
        },
      }
    })(),
    {
      name: 'finance-purchase-payable-source-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await selectRow(page, 'PR-STYLE-L1')
        await clickSelectionAction(page, '生成应付')
        const modal = await assertFinanceSourceModal(page, {
          title: '从采购入库生成应付',
          sourceNo: 'PR-STYLE-L1',
        })
        assert.equal(
          await modal.getByLabel('业务编号').inputValue(),
          'AP-PR-STYLE-L1'
        )
        await modal.getByLabel('备注').fill('采购入库应付核对')
        await modal.getByRole('button', { name: '生成应付草稿' }).click()
        await expectText(page, '应付草稿已生成，请到应付管理核对并确认')
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'finance-purchase-payable-source-desktop'
        )
      },
    },
    {
      name: 'shipment-related-quality-inspection-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await mockEmptyPaginatedLists(page, '**/rpc/masterdata', {
          list_customers: 'customers',
          list_materials: 'materials',
          list_products: 'products',
          list_product_skus: 'product_skus',
          list_units: 'units',
          list_warehouses: 'warehouses',
        })
        await mockEmptyPaginatedLists(page, '**/rpc/inventory', {
          list_inventory_lots: 'inventory_lots',
        })
        await mockEmptyPaginatedLists(page, '**/rpc/sales_order', {
          list_sales_orders: 'sales_orders',
        })
        await mockEmptyPaginatedLists(page, '**/rpc/purchase', {
          list_purchase_receipts: 'purchase_receipts',
        })
        await page.route('**/rpc/quality', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_quality_inspections') {
            await route.fallback()
            return
          }
          const now = Math.floor(Date.now() / 1000)
          const matchesShipment =
            String(body.params?.source_type || '').toUpperCase() ===
              'SHIPMENT' && Number(body.params?.source_id || 0) === 1
          const qualityInspections = matchesShipment
            ? [
                {
                  id: 791,
                  inspection_no: 'QI-SHIP-RELATED-L1',
                  inventory_lot_id: 1,
                  warehouse_id: 1,
                  source_type: 'SHIPMENT',
                  source_id: 1,
                  source_no: 'SHIP-STYLE-L1',
                  inspection_type: 'FINISHED_GOODS',
                  subject_type: 'PRODUCT',
                  subject_id: 1,
                  status: 'SUBMITTED',
                  result: '',
                  original_lot_status: 'HOLD',
                  inspected_at: 0,
                  inspector_id: null,
                  decision_note: '等待出货前检验判定',
                  created_at: now,
                  updated_at: now,
                },
              ]
            : []
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'shipment-related-quality',
              result: {
                code: 0,
                message: 'OK',
                data: stylePaginatedRpcData(
                  qualityInspections,
                  'quality_inspections',
                  body.params || {}
                ),
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        await selectRow(page, 'SHIP-STYLE-L1')
        await page.getByRole('button', { name: /相关单据/u }).click()
        await page
          .getByRole('menuitem', { name: '出货前检验', exact: true })
          .click()
        await expectHeading(page, '质量检验')
        await expectText(page, 'QI-SHIP-RELATED-L1')
        const search = page.getByPlaceholder('搜索质检单')
        assert.equal(await search.inputValue(), 'SHIP-STYLE-L1')
        const url = new URL(page.url())
        assert.equal(url.searchParams.get('source_type'), 'SHIPMENT')
        assert.equal(url.searchParams.get('source_id'), '1')
        assert.equal(url.searchParams.get('link_keyword'), 'SHIP-STYLE-L1')
        assert.equal(
          await page.locator('.ant-message-error').count(),
          0,
          `不应出现错误提示: ${(
            await page.locator('.ant-message-error').allTextContents()
          ).join(' / ')}`
        )
        await page.getByRole('button', { name: '清空筛选' }).click()
        await page.waitForFunction(
          () =>
            document.querySelector('input[placeholder="搜索质检单"]')?.value ===
            ''
        )
        assert.equal(new URL(page.url()).searchParams.has('source_type'), false)
        assert.equal(new URL(page.url()).searchParams.has('source_id'), false)
        assert.equal(
          new URL(page.url()).searchParams.has('link_keyword'),
          false
        )
        await assertNoHorizontalOverflow(
          page,
          'shipment-related-quality-inspection-desktop'
        )
      },
    },
    {
      name: 'finance-payable-related-purchase-receipt-desktop',
      path: '/erp/finance/payables',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-finance-related-source',
        is_super_admin: false,
        roles: [{ role_key: 'finance', name: '财务' }],
        permissions: ['finance.payable.read', 'purchase.receipt.read'],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['payables', 'inbound'],
        actions: ['finance.payable.read', 'purchase.receipt.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await mockPayableSource(page, {
          factNo: 'AP-RELATED-PR-L1',
          sourceType: 'PURCHASE_RECEIPT',
          sourceID: 601,
          sourceNo: 'PR-STYLE-L1',
        })
      },
      verify: async (page) => {
        await openPayableSource(page, 'AP-RELATED-PR-L1')
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1')
        const search = page.getByPlaceholder('搜索入库单')
        assert.equal(await search.inputValue(), 'PR-STYLE-L1')
        const url = new URL(page.url())
        assert.equal(url.searchParams.get('receipt_id'), '601')
        assert.equal(url.searchParams.get('link_keyword'), 'PR-STYLE-L1')
        assert.equal(
          await page.locator('.ant-message-error').count(),
          0,
          `不应出现错误提示: ${(
            await page.locator('.ant-message-error').allTextContents()
          ).join(' / ')}`
        )
        await page.getByRole('button', { name: '清空筛选' }).click()
        await page.waitForFunction(
          () =>
            document.querySelector('input[placeholder="搜索入库单"]')?.value ===
            ''
        )
        assert.equal(await search.inputValue(), '')
        assert.equal(new URL(page.url()).searchParams.has('receipt_id'), false)
        assert.equal(
          new URL(page.url()).searchParams.has('link_keyword'),
          false
        )
        await assertNoHorizontalOverflow(
          page,
          'finance-payable-related-purchase-receipt-desktop'
        )
      },
    },
    {
      name: 'finance-payable-related-source-permission-gate-desktop',
      path: '/erp/finance/payables',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-payable-only-restricted',
        is_super_admin: false,
        permissions: ['finance.payable.read'],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['payables'],
        actions: ['finance.payable.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await mockPayableSource(page, {
          factNo: 'AP-RELATED-GATED-L1',
          sourceType: 'PURCHASE_RECEIPT',
          sourceID: 601,
          sourceNo: 'PR-STYLE-L1',
        })
      },
      verify: async (page) => {
        await expectHeading(page, '应付管理')
        await selectRow(page, 'AP-RELATED-GATED-L1')
        const relatedButton = page.getByRole('button', {
          name: /相关单据/u,
        })
        assert.equal(await relatedButton.isDisabled(), true)
        assert.equal(await page.locator('.ant-message-error').count(), 0)
        assert.equal(new URL(page.url()).pathname, '/erp/finance/payables')
        await assertNoHorizontalOverflow(
          page,
          'finance-payable-related-source-permission-gate-desktop'
        )
      },
    },
    {
      name: 'finance-payable-related-outsourcing-order-desktop',
      path: '/erp/finance/payables',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-payable-outsourcing-related',
        is_super_admin: true,
        permissions: [
          'finance.payable.read',
          'outsourcing.order.read',
          'outsourcing.fact.read',
          'workflow.task.read',
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          ...(customerRuntimeEffectiveSession?.actions || []),
          'finance.payable.read',
          'outsourcing.order.read',
          'outsourcing.fact.read',
          'workflow.task.read',
        ],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await mockEmptyPaginatedLists(page, '**/rpc/masterdata', {
          list_contacts_by_owner: 'contacts',
          list_materials: 'materials',
          list_processes: 'processes',
          list_products: 'products',
          list_product_skus: 'product_skus',
          list_suppliers: 'suppliers',
          list_units: 'units',
          list_warehouses: 'warehouses',
        })
        await mockEmptyPaginatedLists(page, '**/rpc/inventory', {
          list_inventory_lots: 'inventory_lots',
        })
        await mockPayableSource(page, {
          factNo: 'AP-RELATED-OUT-L1',
          sourceType: 'OUTSOURCING_FACT',
          sourceID: 3,
          sourceNo: 'OUT-RR-POSTED-L1',
        })
      },
      verify: async (page) => {
        await openPayableSource(page, 'AP-RELATED-OUT-L1')
        await expectHeading(page, '委外订单')
        await expectText(page, 'SIM-OUTSOURCE-CONTRACT-L1')
        const search = page.getByPlaceholder('搜索合同')
        assert.equal(await search.inputValue(), 'SIM-OUTSOURCE-CONTRACT-L1')
        const url = new URL(page.url())
        assert.equal(url.searchParams.get('outsourcing_fact_id'), '3')
        assert.equal(url.searchParams.get('link_keyword'), 'OUT-RR-POSTED-L1')
        assert.equal(
          await page.locator('.ant-message-error').count(),
          0,
          `不应出现错误提示: ${(
            await page.locator('.ant-message-error').allTextContents()
          ).join(' / ')}`
        )
        await page.getByRole('button', { name: '清空筛选' }).click()
        await page.waitForFunction(
          () =>
            document.querySelector('input[placeholder="搜索合同"]')?.value ===
            ''
        )
        assert.equal(await search.inputValue(), '')
        assert.equal(
          new URL(page.url()).searchParams.has('outsourcing_fact_id'),
          false
        )
        assert.equal(
          new URL(page.url()).searchParams.has('link_keyword'),
          false
        )
        await assertNoHorizontalOverflow(
          page,
          'finance-payable-related-outsourcing-order-desktop'
        )
      },
    },
    {
      name: 'finance-outsourcing-payable-source-desktop',
      path: '/erp/purchase/processing-contracts',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-outsourcing-payable',
        is_super_admin: true,
        permissions: [
          'outsourcing.order.read',
          'outsourcing.fact.read',
          'quality.inspection.read',
          'workflow.task.read',
          'finance.payable.read',
          'finance.payable.confirm',
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          ...(customerRuntimeEffectiveSession?.actions || []),
          'outsourcing.order.read',
          'outsourcing.fact.read',
          'quality.inspection.read',
          'workflow.task.read',
          'finance.payable.read',
          'finance.payable.confirm',
        ],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '委外订单')
        await selectRow(page, 'SIM-OUTSOURCE-CONTRACT-L1')
        await clickSelectionAction(page, '委外记录')
        const recordsModal = page
          .getByRole('dialog', { name: /委外记录/u })
          .last()
        await recordsModal.waitFor({ state: 'visible', timeout: 10_000 })
        const postedRow = recordsModal
          .getByRole('row')
          .filter({ hasText: 'OUT-RR-POSTED-L1' })
          .first()
        await postedRow.waitFor({ state: 'visible', timeout: 10_000 })
        await postedRow
          .getByText('质检合格', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert(
          String((await postedRow.innerText()) || '').includes('质检合格'),
          '委外回货应付入口必须展示当前合格质检状态'
        )
        await postedRow.click()
        const createPayableButton = recordsModal.getByRole('button', {
          name: '生成应付',
          exact: true,
        })
        assert.equal(await createPayableButton.isEnabled(), true)
        await createPayableButton.click()
        const sourceModal = await assertFinanceSourceModal(page, {
          title: '从委外回货生成应付',
          sourceNo: 'OUT-RR-POSTED-L1',
        })
        assert(
          String((await sourceModal.innerText()) || '').includes(
            'SKU-OUTSOURCE-SNAPSHOT-L1'
          ),
          '委外回货应付弹窗必须显示来源行冻结的产品规格'
        )
        await sourceModal.getByLabel('备注').fill('委外回货应付核对')
        await sourceModal.getByRole('button', { name: '生成应付草稿' }).click()
        await expectText(page, '应付草稿已生成，请到应付管理核对并确认')
        await sourceModal.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'finance-outsourcing-payable-source-desktop'
        )
      },
    },
    {
      name: 'finance-single-reconciliation-source-narrow',
      path: '/erp/finance/receivables',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '应收管理')
        await selectRow(page, 'AR-STYLE-L1')
        await clickSelectionAction(page, '单笔核对')
        const modal = await assertFinanceSourceModal(page, {
          title: '登记单笔核对',
          sourceNo: 'AR-STYLE-L1',
          reconciliation: true,
        })
        await modal.getByLabel('备注').fill('客户应收单笔核对')
        await modal.getByRole('button', { name: '生成核对草稿' }).click()
        await expectText(page, '单笔核对草稿已生成，请到对账管理核对并确认')
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'finance-single-reconciliation-source-narrow'
        )
      },
    },
    (() => {
      let factStatus = 'DRAFT'
      let cancellationParams = null
      let cancellationResult = null
      return {
        name: 'finance-draft-cancellation-desktop',
        path: '/erp/finance/receivables',
        auth: 'admin',
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          pages: ['receivables'],
          actions: ['finance.receivable.read', 'finance.receivable.confirm'],
        },
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-finance-draft-cancel',
          is_super_admin: true,
          permissions: [
            'finance.receivable.read',
            'finance.receivable.confirm',
          ],
        },
        beforeNavigate: async (page) => {
          factStatus = 'DRAFT'
          cancellationParams = null
          cancellationResult = null
          await page.route('**/rpc/operational_fact', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (
              !['list_finance_facts', 'cancel_finance_fact'].includes(
                body.method
              )
            ) {
              await route.fallback()
              return
            }
            const now = Math.floor(Date.now() / 1000)
            if (body.method === 'cancel_finance_fact') {
              cancellationParams = body.params || {}
              factStatus = 'CANCELLED'
            }
            const financeFact = {
              id: 9501,
              fact_no: 'AR-DRAFT-CANCEL-L1',
              fact_type: 'RECEIVABLE',
              status: factStatus,
              counterparty_type: 'CUSTOMER',
              counterparty_id: 1,
              amount: '1200.00',
              fee_amount: '0',
              currency: 'CNY',
              source_type: 'SHIPMENT',
              source_id: 1,
              source_no: 'SHIP-STYLE-L1',
              idempotency_key: 'AR-DRAFT-CANCEL-L1',
              occurred_at: now,
              note: '草稿退出浏览器回归',
              created_at: now,
              updated_at: now,
              ...(factStatus === 'CANCELLED'
                ? {
                    cancelled_at: now,
                    cancelled_by: 1,
                    cancelled_by_name: 'style-l1-finance-draft-cancel',
                    cancel_reason: cancellationParams?.reason,
                  }
                : {}),
            }
            if (body.method === 'cancel_finance_fact') {
              cancellationResult = financeFact
            }
            const data =
              body.method === 'list_finance_facts'
                ? {
                    finance_facts: [financeFact],
                    total: 1,
                    limit: Number(body.params?.limit || 20),
                    offset: Number(body.params?.offset || 0),
                  }
                : { finance_fact: financeFact }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'finance-draft-cancellation',
                result: { code: 0, message: 'OK', data },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '应收管理')
          await selectRow(page, 'AR-DRAFT-CANCEL-L1')
          await page
            .locator('button:visible')
            .filter({ hasText: '作废草稿' })
            .first()
            .click()
          const modal = page
            .getByRole('dialog', { name: '作废财务草稿' })
            .last()
          await modal.waitFor({ state: 'visible', timeout: 10_000 })
          await expectText(page, '作废不会生成过账或库存变更')
          await modal
            .getByPlaceholder('请填写客户、供应商或账款调整的业务原因')
            .fill('来源出货资料修正')
          await modal
            .getByRole('button', { name: '确认取消', exact: true })
            .click()
          await page.waitForFunction(() => {
            const messageText = Array.from(
              document.querySelectorAll('.ant-message-notice')
            )
              .map((node) => String(node.textContent || '').trim())
              .join(' ')
            return messageText.includes('作废财务草稿已完成')
          })
          assert.equal(factStatus, 'CANCELLED')
          assert.equal(cancellationParams?.id, 9501)
          assert.equal(cancellationParams?.reason, '来源出货资料修正')
          assert.equal(cancellationResult?.status, 'CANCELLED')
          assert.equal(
            cancellationResult?.cancelled_by_name,
            'style-l1-finance-draft-cancel'
          )
          assert.equal(cancellationResult?.cancel_reason, '来源出货资料修正')
          assert(Number(cancellationResult?.cancelled_at) > 0)
          await modal.waitFor({ state: 'hidden', timeout: 10_000 })
          await assertNoHorizontalOverflow(
            page,
            'finance-draft-cancellation-desktop'
          )
        },
      }
    })(),
  ]
}
