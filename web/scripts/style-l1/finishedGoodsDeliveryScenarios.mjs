export function createFinishedGoodsDeliveryScenarios({
  assert,
  expectHeading,
  expectText,
  outputDir,
  path,
}) {
  return [
    {
      name: 'shipment-finished-goods-delivery-start-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-finished-goods-delivery-start',
        configHash: 'style-l1-finished-goods-delivery-start-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['shipments'],
        actions: ['shipment.read', 'shipment.create'],
        workflow_visible_owner_role_keys_by_capability: {},
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        const shipmentRow = page
          .locator('.erp-business-data-table-card .ant-table-row')
          .filter({ hasText: 'SHIP-STYLE-L1' })
          .first()
        await shipmentRow.click()

        const submitButton = page.getByRole('button', {
          name: '提交出货审批',
          exact: true,
        })
        await submitButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await submitButton.isDisabled(),
          false,
          '草稿出货单且有权限时应允许启动版本化出货流程'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'shipment-finished-goods-delivery-selected.png'
          ),
          fullPage: true,
        })

        await submitButton.click()
        const confirmButton = page.getByRole('button', {
          name: '提交放行',
          exact: true,
        })
        await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })
        await confirmButton.click()
        await expectText(page, '出货流程已提交，质量关口通过后进入财务审批')
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'shipment-finished-goods-delivery-started.png'
          ),
          fullPage: true,
        })
      },
    },
  ]
}
