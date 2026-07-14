export function createOutsourcingSourceFactScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
    outputDir,
    path,
  } = deps

  const createScenario = ({
    name,
    actionType,
    productLotAvailable = true,
    viewport,
  }) => {
    const materialIssue = actionType === 'MATERIAL_ISSUE'
    const actionLabel = materialIssue ? '委外发料' : '登记回货'
    const createMethod = materialIssue
      ? 'create_outsourcing_material_issue_from_order'
      : 'create_outsourcing_return_receipt_from_order'
    const itemID = materialIssue ? 11 : 12
    const lotID = materialIssue ? 411 : 412
    const lotNo = materialIssue ? 'MAT-LOT-OUT-L1' : 'PROD-LOT-OUT-L1'
    const newLotNo = 'OUT-NEW-LOT-REREAD-L1'
    let operationalFactMethods = []
    let createParams = []

    return {
      name,
      path: '/erp/purchase/processing-contracts',
      auth: 'admin',
      viewport,
      adminProfile: {
        username: `style-l1-${materialIssue ? 'outsourcing-issue' : 'outsourcing-return'}`,
        is_super_admin: true,
        permissions: [
          'outsourcing.order.read',
          'outsourcing.fact.read',
          'outsourcing.material_issue.create',
          'outsourcing.return_receipt.create',
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          ...(customerRuntimeEffectiveSession?.actions || []),
          'outsourcing.order.read',
          'outsourcing.fact.read',
          'outsourcing.material_issue.create',
          'outsourcing.return_receipt.create',
        ],
      },
      beforeNavigate: async (page) => {
        operationalFactMethods = []
        createParams = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/operational_fact')) return
          try {
            const body = request.postDataJSON() || {}
            if (body.method) operationalFactMethods.push(body.method)
            if (body.method === createMethod) {
              createParams.push(body.params || {})
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })

        await page.route('**/rpc/outsourcing_order', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method, params = {} } = body
          const order = {
            id: 1,
            outsourcing_order_no: 'OUT-SOURCE-L1',
            supplier_id: 1,
            supplier_snapshot: {
              id: 1,
              code: 'SUP-OUT-L1',
              short_name: '源单加工厂',
              name: '源单加工厂',
            },
            source_order_no: 'SO-SOURCE-L1',
            source_sales_order_id: 1,
            order_date: 1_784_000_000,
            expected_return_date: 1_784_604_800,
            lifecycle_status: 'confirmed',
            version: 3,
            note: '委外源单办理样式合同',
            created_at: 1_784_000_000,
            updated_at: 1_784_000_000,
          }
          const items = [
            {
              id: 11,
              outsourcing_order_id: 1,
              line_no: 1,
              subject_type: 'MATERIAL',
              material_id: 1,
              process_id: 1,
              unit_id: 1,
              material_code_snapshot: 'MAT-SOURCE-L1',
              material_name_snapshot: '源单发料材料',
              process_name_snapshot: '裁床备料',
              process_category_snapshot: '委外备料',
              unit_name_snapshot: '米',
              outsourcing_quantity: '10',
              unit_price: '1.20',
              amount: '12.00',
              expected_return_date: 1_784_604_800,
              line_status: 'open',
              note: '',
            },
            {
              id: 12,
              outsourcing_order_id: 1,
              line_no: 2,
              subject_type: 'PRODUCT',
              product_id: 1,
              product_sku_id: 1,
              process_id: 2,
              unit_id: 2,
              product_order_no_snapshot: 'SO-SOURCE-L1',
              product_no_snapshot: 'PROD-SOURCE-L1',
              product_name_snapshot: '源单回货产品',
              process_name_snapshot: '车缝',
              process_category_snapshot: '委外车缝',
              unit_name_snapshot: '只',
              outsourcing_quantity: '8',
              unit_price: '2.00',
              amount: '16.00',
              expected_return_date: 1_784_604_800,
              line_status: 'open',
              note: '',
            },
          ]
          let data
          if (method === 'list_outsourcing_orders') {
            data = {
              outsourcing_orders: [order],
              total: 1,
              limit: Number(params.limit || 100),
              offset: Number(params.offset || 0),
            }
          } else if (method === 'get_outsourcing_order') {
            data = { outsourcing_order: order }
          } else if (method === 'list_outsourcing_order_items') {
            data = {
              outsourcing_order_items: items,
              total: items.length,
              limit: Number(params.limit || 100),
              offset: Number(params.offset || 0),
            }
          } else {
            await route.fallback()
            return
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { code: 0, message: 'OK', data },
            }),
          })
        })

        await page.route('**/rpc/inventory', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_inventory_lots') {
            await route.fallback()
            return
          }
          const lots = [
            {
              id: 411,
              subject_type: 'MATERIAL',
              subject_id: 1,
              lot_no: 'MAT-LOT-OUT-L1',
              status: 'ACTIVE',
            },
            {
              id: 412,
              subject_type: 'PRODUCT',
              subject_id: 1,
              product_sku_id: 1,
              lot_no: 'PROD-LOT-OUT-L1',
              status: 'ACTIVE',
            },
            {
              id: 413,
              subject_type: 'PRODUCT',
              subject_id: 99,
              product_sku_id: 1,
              lot_no: 'UNRELATED-LOT',
              status: 'ACTIVE',
            },
          ].filter((lot) => productLotAvailable || lot.id !== 412)
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'outsourcing-source-lots',
              result: {
                code: 0,
                message: 'OK',
                data: {
                  inventory_lots: lots,
                  total: lots.length,
                  limit: 100,
                  offset: 0,
                },
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '委外订单')
        await page
          .getByRole('button', { name: /展开.*OUT-SOURCE-L1.*明细/u })
          .click()
        const materialCard = page
          .locator('.erp-business-row-item-card')
          .filter({ hasText: 'MAT-SOURCE-L1' })
          .first()
        const productCard = page
          .locator('.erp-business-row-item-card')
          .filter({ hasText: 'PROD-SOURCE-L1' })
          .first()
        await materialCard.waitFor({ state: 'visible', timeout: 10_000 })
        await productCard.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await materialCard.getByRole('button', { name: '委外发料' }).count(),
          1,
          '材料明细应只提供委外发料入口'
        )
        assert.equal(
          await materialCard.getByRole('button', { name: '登记回货' }).count(),
          0,
          '材料明细不得提供产品回货入口'
        )
        assert.equal(
          await productCard.getByRole('button', { name: '登记回货' }).count(),
          1,
          '产品明细应只提供登记回货入口'
        )
        assert.equal(
          await productCard.getByRole('button', { name: '委外发料' }).count(),
          0,
          '产品明细不得提供任意材料发料入口'
        )

        const sourceCard = materialIssue ? materialCard : productCard
        await sourceCard.getByRole('button', { name: actionLabel }).click()
        const modal = page
          .locator('.ant-modal')
          .filter({ hasText: actionLabel })
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        const modalText = String((await modal.innerText()) || '').replace(
          /\s+/gu,
          ' '
        )
        for (const expectedText of [
          'OUT-SOURCE-L1',
          '源单加工厂',
          materialIssue ? 'MAT-SOURCE-L1' : 'PROD-SOURCE-L1',
          materialIssue ? '裁床备料' : '车缝',
          materialIssue ? '米' : '只',
          '计划数量',
          '已登记量',
          '剩余可登记',
        ]) {
          assert(
            modalText.includes(expectedText),
            `${name} 来源摘要缺少 ${expectedText}: ${modalText}`
          )
        }
        assert.equal(modalText.includes('UNRELATED-LOT'), false)
        for (const technicalCopy of [
          'subject_type',
          'source_id',
          'idempotency_key',
          'new_lot_no',
        ]) {
          assert.equal(
            (await modal.getByText(technicalCopy, { exact: true }).count()) > 0,
            false,
            `${name} 不应显示技术字段 ${technicalCopy}`
          )
        }
        const selectFirstOption = async (label, expectedOptionText = '') => {
          const field = modal
            .locator('.ant-form-item')
            .filter({ hasText: label })
            .first()
          const selected = field.locator('.ant-select-selection-item').first()
          const selectedText = await selected
            .innerText({ timeout: 1_000 })
            .catch(() => '')
          if (selectedText) {
            if (expectedOptionText) {
              assert(
                selectedText.includes(expectedOptionText),
                `${name} 已选批次必须匹配来源对象: ${selectedText}`
              )
            }
            return
          }
          await field.locator('.ant-select-selector').click()
          const dropdown = page.locator('.ant-select-dropdown:visible').last()
          await dropdown.waitFor({ state: 'visible', timeout: 10_000 })
          const option = dropdown.locator('.ant-select-item-option').first()
          await option.waitFor({ state: 'visible', timeout: 10_000 })
          if (expectedOptionText) {
            const optionText = String((await option.innerText()) || '').trim()
            assert(
              optionText.includes(expectedOptionText),
              `${name} 批次选项必须匹配来源对象: ${optionText}`
            )
          }
          await page.keyboard.press('Enter')
        }
        await selectFirstOption('仓库')
        if (materialIssue || productLotAvailable) {
          await selectFirstOption(
            materialIssue ? '材料批次' : '产品批次',
            lotNo
          )
        } else {
          const newLotRadio = modal.getByRole('radio', {
            name: '填写新批次号',
          })
          for (let attempt = 0; attempt < 20; attempt += 1) {
            if (await newLotRadio.isChecked()) break
            await page.waitForTimeout(100)
          }
          assert.equal(
            await newLotRadio.isChecked(),
            true,
            `${name} 无已有产品批次时应默认填写新批次号`
          )
          await modal.getByRole('textbox', { name: /新批次号/u }).fill(newLotNo)
        }
        await modal.getByLabel('本次办理数量').fill('2')
        await modal
          .locator('textarea')
          .fill(materialIssue ? '委外备料' : '委外回货')
        await modal.screenshot({
          path: path.resolve(outputDir, `${name}-modal.png`),
        })
        await modal.getByRole('button', { name: `确认${actionLabel}` }).click()
        const successText =
          !materialIssue && !productLotAvailable
            ? '已重新读取并确认委外回货草稿，请到委外记录核对并过账'
            : `${materialIssue ? '委外发料' : '委外回货'}草稿已生成`
        try {
          await expectText(page, successText)
        } catch (error) {
          const notices = await page
            .locator('.ant-message-notice')
            .allInnerTexts()
            .catch(() => [])
          throw new Error(
            `${error.message}; 当前消息=${JSON.stringify(notices)}; 请求=${JSON.stringify(createParams)}`
          )
        }

        assert.equal(
          createParams.length,
          1,
          `${name} 应且只应提交一次来源绑定请求: ${JSON.stringify({
            operationalFactMethods,
            createParams,
          })}`
        )
        const params = createParams[0]
        const allowedKeys = new Set([
          'customer_key',
          'fact_no',
          'outsourcing_order_id',
          'outsourcing_order_item_id',
          'warehouse_id',
          'lot_id',
          'new_lot_no',
          'quantity',
          'occurred_at',
          'note',
          'idempotency_key',
        ])
        assert(
          Object.keys(params).every((key) => allowedKeys.has(key)),
          `${name} 请求包含后端派生字段: ${JSON.stringify(params)}`
        )
        assert.equal(params.customer_key, 'yoyoosun')
        assert.equal(params.outsourcing_order_id, 1)
        assert.equal(params.outsourcing_order_item_id, itemID)
        assert.equal(params.warehouse_id, 1)
        if (!materialIssue && !productLotAvailable) {
          assert.equal(params.new_lot_no, newLotNo)
          assert.equal(Object.hasOwn(params, 'lot_id'), false)
        } else {
          assert.equal(params.lot_id, lotID)
          assert.equal(Object.hasOwn(params, 'new_lot_no'), false)
        }
        assert.equal(params.quantity, '2')
        assert.equal(typeof params.idempotency_key, 'string')
        assert.equal(params.idempotency_key.length > 0, true)
        assert.equal(
          operationalFactMethods.includes('create_outsourcing_fact'),
          false,
          `${name} 不得回退旧委外事实 RPC`
        )
        for (const serverDerivedField of [
          'fact_type',
          'subject_type',
          'subject_id',
          'supplier_id',
          'unit_id',
          'source_type',
          'source_id',
          'source_line_id',
        ]) {
          assert.equal(serverDerivedField in params, false)
        }
        await assertNoHorizontalOverflow(page, name)
      },
    }
  }

  return [
    createScenario({
      name: 'outsourcing-source-material-issue-desktop',
      actionType: 'MATERIAL_ISSUE',
      viewport: { width: 1440, height: 900 },
    }),
    createScenario({
      name: 'outsourcing-source-return-receipt-mobile',
      actionType: 'RETURN_RECEIPT',
      viewport: { width: 390, height: 844 },
    }),
    createScenario({
      name: 'outsourcing-source-return-new-lot-mobile',
      actionType: 'RETURN_RECEIPT',
      productLotAvailable: false,
      viewport: { width: 390, height: 844 },
    }),
  ]
}
