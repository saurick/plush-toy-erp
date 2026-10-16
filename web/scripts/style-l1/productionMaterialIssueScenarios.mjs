export function createProductionMaterialIssueScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    (() => {
      let operationalFactMethods = []
      let requirementListParams = []
      let materialIssueCreateParams = []
      let inventoryLotParams = []
      return {
        name: 'production-order-source-material-issue-desktop',
        path: '/erp/production/orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-production-material-issue',
          is_super_admin: true,
          permissions: [
            'pmc.plan.read',
            'pmc.plan.update',
            'production.fact.read',
            'production.material_issue.create',
          ],
        },
        beforeNavigate: async (page) => {
          operationalFactMethods = []
          requirementListParams = []
          materialIssueCreateParams = []
          inventoryLotParams = []
          page.on('request', (request) => {
            try {
              const body = request.postDataJSON() || {}
              if (
                request.url().includes('/rpc/inventory') &&
                body.method === 'list_inventory_lots'
              ) {
                inventoryLotParams.push(body.params || {})
              }
              if (!request.url().includes('/rpc/operational_fact')) return
              if (body.method) operationalFactMethods.push(body.method)
              if (
                body.method === 'list_production_order_material_requirements'
              ) {
                requirementListParams.push(body.params || {})
              }
              if (
                body.method === 'create_production_material_issue_from_order'
              ) {
                materialIssueCreateParams.push(body.params || {})
              }
            } catch {
              // 非 JSON-RPC 请求不参与本断言。
            }
          })
        },
        verify: async (page) => {
          await expectHeading(page, '生产订单')
          const orderText = page.getByText('MO-STYLE-L1-20260713', {
            exact: true,
          })
          await orderText.click()
          const releaseButton = page.getByRole('button', {
            name: '发布',
            exact: true,
          })
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (await releaseButton.isEnabled()) break
            await page.waitForTimeout(100)
          }
          assert.equal(
            await releaseButton.isEnabled(),
            true,
            '生产订单详情读取完成后应允许发布'
          )
          await releaseButton.click()
          await page.getByRole('button', { name: '确认发布' }).click()
          await expectText(page, '生产订单已发布，排产确认已进入 PMC 待办')

          await page
            .getByText('MO-STYLE-L1-20260713', { exact: true })
            .dblclick()
          const detailModal = page
            .locator('.erp-business-form-page:not([hidden])')
            .filter({ hasText: '查看生产订单' })
            .last()
          await detailModal.waitFor({ state: 'visible', timeout: 10_000 })
          await detailModal
            .getByRole('heading', { name: '物料需求与领料', exact: true })
            .waitFor()
          await detailModal
            .getByText(/物料需求已按发布时的 BOM 冻结/u)
            .waitFor()
          await detailModal
            .getByRole('navigation', { name: '表单分区' })
            .getByRole('button', { name: '物料需求与领料', exact: true })
            .click()
          const requirementWidth = await detailModal
            .locator('[data-form-section="物料需求与领料"]')
            .boundingBox()
          const formBody = await detailModal
            .locator('.erp-business-form-page__body')
            .boundingBox()
          assert(
            requirementWidth.width >= formBody.width - 40,
            '冻结物料表应占满表单内容宽度'
          )
          const materialRequirementCells = detailModal
            .locator('.ant-table-cell:visible')
            .filter({ hasText: 'MAT-STYLE-L1 / 样式短毛绒布' })
          await materialRequirementCells.first().waitFor()
          assert(
            (await materialRequirementCells.allInnerTexts()).every(
              (text) => text.trim() === 'MAT-STYLE-L1 / 样式短毛绒布'
            ),
            '生产订单详情中的物料需求单元格应保持代码与名称完整'
          )
          const remainingQuantityCells = detailModal
            .locator('.ant-table-cell:visible')
            .filter({ hasText: /^8\.000000$/u })
          await remainingQuantityCells.first().waitFor()
          assert(
            (await remainingQuantityCells.allInnerTexts()).every(
              (text) => text.trim() === '8.000000'
            ),
            '生产订单详情中的剩余可领数量应保持定点小数展示'
          )
          if (
            (await detailModal
              .getByRole('button', { name: '领料', exact: true })
              .count()) === 0
          ) {
            throw new Error(
              `生产领料行操作未开放: ${String(
                (await detailModal.innerText()) || ''
              ).replace(/\s+/gu, ' ')}`
            )
          }
          await detailModal
            .getByRole('button', { name: '领料', exact: true })
            .click()

          const issueModal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '生产领料' })
            .last()
          try {
            await issueModal.waitFor({ state: 'visible', timeout: 10_000 })
          } catch (error) {
            const bodyText = String(
              (await page.locator('body').innerText()) || ''
            ).replace(/\s+/gu, ' ')
            throw new Error(
              `生产领料弹窗未打开: ${JSON.stringify({
                operationalFactMethods,
                requirementListParams,
                inventoryLotParams,
                bodyText: bodyText.slice(0, 2400),
              })}; ${error.message}`
            )
          }
          const issueText = String(
            (await issueModal.innerText()) || ''
          ).replace(/\s+/gu, ' ')
          assert.match(issueText, /MO-STYLE-L1-20260713/u)
          assert.match(issueText, /MAT-STYLE-L1.*样式短毛绒布/u)
          assert.match(issueText, /计划需求.*10\.200000/u)
          assert.match(issueText, /已过账领料.*2\.200000/u)
          assert.match(issueText, /剩余可领.*8\.000000/u)
          try {
            await issueModal
              .getByText('MAT-LOT-STYLE-L1', { exact: false })
              .waitFor({ timeout: 10_000 })
          } catch (error) {
            throw new Error(
              `生产领料批次未加载: requests=${JSON.stringify(
                inventoryLotParams
              )}; modal=${issueText}`,
              { cause: error }
            )
          }
          for (const technicalCopy of [
            'material_id',
            'unit_id',
            'source_type',
            'source_id',
            'idempotency_key',
            'NEEDS_REVIEW',
          ]) {
            assert.equal(
              (await issueModal
                .getByText(technicalCopy, { exact: true })
                .count()) > 0,
              false,
              `生产领料弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await issueModal.getByLabel('本次领料数量').fill('3')
          await issueModal.locator('textarea').fill('首批生产领料')
          await issueModal.screenshot({
            path: path.resolve(
              outputDir,
              'production-order-source-material-issue-modal-desktop.png'
            ),
          })
          await issueModal
            .getByRole('button', { name: /生\s*成\s*领\s*料\s*记\s*录/u })
            .click()
          await expectText(page, '领料记录草稿已生成，请到生产记录核对并过账')

          assert.equal(
            requirementListParams.length,
            0,
            `领料应复用生产订单聚合中的冻结需求，不应重复读取: ${JSON.stringify(requirementListParams)}`
          )
          assert.deepEqual(inventoryLotParams, [
            {
              subject_type: 'MATERIAL',
              subject_id: 1,
              warehouse_id: 1,
              status: 'ACTIVE',
              limit: 200,
              offset: 0,
            },
          ])
          assert.equal(
            materialIssueCreateParams.length,
            1,
            `重复点击保护应只提交一次领料: ${JSON.stringify(materialIssueCreateParams)}`
          )
          const params = materialIssueCreateParams[0]
          const allowedKeys = new Set([
            'customer_key',
            'fact_no',
            'production_order_id',
            'production_order_item_id',
            'production_order_material_requirement_id',
            'warehouse_id',
            'lot_id',
            'quantity',
            'idempotency_key',
            'occurred_at',
            'note',
          ])
          assert(
            Object.keys(params).every((key) => allowedKeys.has(key)),
            `生产领料请求包含后端派生字段: ${JSON.stringify(params)}`
          )
          assert.equal(params.customer_key, 'yoyoosun')
          assert.equal(params.production_order_id, 71)
          assert.equal(params.production_order_item_id, 7101)
          assert.equal(params.production_order_material_requirement_id, 7201)
          assert.equal(params.warehouse_id, 1)
          assert.equal(params.lot_id, 403)
          assert.equal(params.quantity, '3')
          assert.equal(params.note, '首批生产领料')
          assert.equal(typeof params.idempotency_key, 'string')
          for (const serverDerivedField of [
            'material_id',
            'unit_id',
            'subject_type',
            'subject_id',
            'source_type',
            'source_id',
            'source_line_id',
          ]) {
            assert.equal(serverDerivedField in params, false)
          }
          assert.equal(
            operationalFactMethods.filter(
              (method) => method === 'list_production_facts'
            ).length,
            1,
            `创建后应只重新读取一次关联生产记录: ${JSON.stringify(operationalFactMethods)}`
          )
          await assertNoHorizontalOverflow(
            page,
            'production-order-source-material-issue-desktop'
          )
        },
      }
    })(),
  ]
}
