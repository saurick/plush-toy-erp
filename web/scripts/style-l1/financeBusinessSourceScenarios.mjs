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
                data: {
                  shipments: [shipment],
                  total: 1,
                  limit: 100,
                  offset: 0,
                },
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
        assert(modalText.includes('客户与明细由出货单确定'))
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
        assert(modalText.includes('金额由系统核算'))
        assert.deepEqual(
          (
            await modal.locator('.ant-form-item-label label').allTextContents()
          ).map((label) => label.trim()),
          ['发生时间', '备注']
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
        await clickSelectionAction(page, '相关回货记录')
        const recordsModal = page
          .getByRole('dialog', { name: /相关回货记录/u })
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
  ]
}
