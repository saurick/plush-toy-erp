import { stylePaginatedRpcData } from './rpcMockResult.mjs'

export function createQualitySourceActionScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
    outputDir,
    path,
  } = deps

  const selectRow = async (page, businessNo) => {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(businessNo, { exact: true }) })
      .first()
    await row.waitFor({ state: 'visible', timeout: 10_000 })
    await row.click()
  }

  const findSelectionActionButton = async (page, actionName) => {
    const direct = page.locator('button').filter({ hasText: actionName })
    const directCount = await direct.count()
    for (let index = 0; index < directCount; index += 1) {
      const candidate = direct.nth(index)
      if (
        (await candidate.isVisible()) &&
        String((await candidate.innerText()) || '').trim() === actionName
      ) {
        return candidate
      }
    }
    const moreButtons = page.getByRole('button', { name: /更多操作/u })
    let more = null
    for (let index = 0; index < (await moreButtons.count()); index += 1) {
      const candidate = moreButtons.nth(index)
      if (await candidate.isVisible()) more = candidate
    }
    assert(more, `未找到可见的更多操作按钮: ${actionName}`)
    await more.waitFor({ state: 'visible', timeout: 10_000 })
    await more.click()
    const drawer = page.locator('.erp-business-selection-action-drawer:visible')
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    const overflowButtons = drawer
      .locator('button')
      .filter({ hasText: actionName })
    for (let index = 0; index < (await overflowButtons.count()); index += 1) {
      const candidate = overflowButtons.nth(index)
      if (String((await candidate.innerText()) || '').trim() === actionName) {
        return candidate
      }
    }
    throw new Error(
      `更多操作中缺少“${actionName}”: ${String(
        (await drawer.innerText()) || ''
      ).replace(/\s+/gu, ' ')}`
    )
  }

  const ensureSelectionActionDrawer = async (page) => {
    const drawer = page.locator('.erp-business-selection-action-drawer:visible')
    if ((await drawer.count()) === 0) {
      const moreButtons = page.getByRole('button', { name: /更多操作/u })
      let more = null
      for (let index = 0; index < (await moreButtons.count()); index += 1) {
        const candidate = moreButtons.nth(index)
        if (await candidate.isVisible()) more = candidate
      }
      assert(more, '未找到可见的更多操作按钮')
      await more.click()
    }
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    return drawer
  }

  const clickSelectionAction = async (page, actionName) => {
    const button = await findSelectionActionButton(page, actionName)
    await button.click()
  }

  return [
    (() => {
      const productionInspection = {
        id: 908700101,
        inspection_no: 'QI-WIP-GATE-STYLE-L1',
        inspection_type: 'PRODUCTION_STAGE',
        source_type: 'PRODUCTION_WIP',
        production_wip_batch_id: 908700102,
        gate_code: 'SHELL',
        production_order_no: 'MO-WIP-STYLE-L1-001',
        production_order_item_id: 908700103,
        product_code: 'PLUSH-BEAR-WIP-L1',
        product_name: '车缝中的小熊公仔',
        operation_code: 'SEWING',
        operation_name: '车缝',
        wip_batch_no: 'WIP-SEWING-STYLE-L1-001',
        batch_quantity: '128.5',
        status: 'SUBMITTED',
        result: null,
        defect_rate_operator: null,
        defect_rate_percent: null,
        inspected_at: null,
        inspector_id: null,
        decision_note: '车缝完成后的皮套质量关口',
        inventory_lot_id: null,
        warehouse_id: null,
      }
      let productionListParams = []

      return {
        name: 'production-stage-quality-read-model-desktop',
        path: '/erp/production/quality-inspections',
        auth: 'admin',
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-production-stage-quality',
          is_super_admin: true,
          permissions: ['quality.inspection.read', 'quality.inspection.update'],
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          actions: [
            ...(customerRuntimeEffectiveSession?.actions || []),
            'quality.inspection.read',
            'quality.inspection.update',
          ],
        },
        beforeNavigate: async (page) => {
          productionListParams = []
          await page.route('**/rpc/quality', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            if (method === 'list_quality_inspections') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      quality_inspections: [],
                      total: 0,
                      limit: Number(params.limit || 20),
                      offset: Number(params.offset || 0),
                    },
                  },
                }),
              })
              return
            }
            if (method !== 'list_production_stage_quality_inspections') {
              await route.fallback()
              return
            }
            productionListParams.push(params)
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    quality_inspections: [productionInspection],
                    total: 1,
                    limit: Number(params.limit || 20),
                    offset: Number(params.offset || 0),
                  },
                },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '质量检验')
          await expectText(page, '暂无质量检验单')

          const filters = page.locator(
            '.erp-v1-quality-inspections-page .erp-business-operation-panel__filters'
          )
          const inspectionTypeSelect = filters
            .locator('.ant-select')
            .filter({ hasText: '全部检验类型' })
            .first()
          await inspectionTypeSelect.waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await inspectionTypeSelect.locator('.ant-select-selector').click()
          await page
            .locator('.ant-select-dropdown:visible .ant-select-item-option')
            .filter({ hasText: '生产分段质检' })
            .first()
            .click()

          const row = page
            .getByRole('row')
            .filter({
              has: page.getByText(productionInspection.inspection_no, {
                exact: true,
              }),
            })
            .first()
          await row.waitFor({ state: 'visible', timeout: 10_000 })
          const rowText = String((await row.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          for (const expected of [
            '生产分段质检',
            '生产订单：MO-WIP-STYLE-L1-001',
            '生产工序：车缝',
            '质量关口：皮套检验',
            'PLUSH-BEAR-WIP-L1 / 车缝中的小熊公仔',
            '在制批次：WIP-SEWING-STYLE-L1-001',
            '批次数量：128.5',
            '车缝完成后的皮套质量关口',
          ]) {
            assert(
              rowText.includes(expected),
              `生产分段质检列表缺少岗位文案 ${expected}: ${rowText}`
            )
          }

          assert(
            productionListParams.length > 0,
            '选择生产分段质检后必须调用专用 WIP 读模型'
          )
          for (const params of productionListParams) {
            for (const inventoryFilter of [
              'warehouse_id',
              'inventory_lot_id',
            ]) {
              assert.equal(
                Object.hasOwn(params, inventoryFilter),
                false,
                `生产分段质检请求不应携带库存筛选 ${inventoryFilter}`
              )
            }
          }

          for (const filterLabel of ['全部仓库', '全部批次']) {
            const filter = filters
              .locator('.ant-select')
              .filter({ hasText: filterLabel })
              .first()
            await filter.waitFor({ state: 'visible', timeout: 10_000 })
            assert.equal(
              await filter.evaluate((node) =>
                node.classList.contains('ant-select-disabled')
              ),
              true,
              `生产分段质检下 ${filterLabel} 应禁用`
            )
          }

          await row.click()
          for (const technicalCopy of [
            'PRODUCTION_STAGE',
            'PRODUCTION_WIP',
            'SHELL',
            'production_wip_batch_id',
            'production_order_item_id',
            'inventory_lot_id',
            'warehouse_id',
            String(productionInspection.id),
            String(productionInspection.production_wip_batch_id),
            String(productionInspection.production_order_item_id),
          ]) {
            const candidates = page.getByText(technicalCopy, {
              exact: false,
            })
            const visibleMatches = []
            for (
              let index = 0;
              index < (await candidates.count());
              index += 1
            ) {
              const candidate = candidates.nth(index)
              if (await candidate.isVisible()) {
                visibleMatches.push(
                  String((await candidate.innerText()) || '')
                    .replace(/\s+/gu, ' ')
                    .slice(0, 240)
                )
              }
            }
            assert.deepEqual(
              visibleMatches,
              [],
              `生产分段质检页面不应显示原始 ID 或技术字段 ${technicalCopy}: ${visibleMatches.join(
                ' | '
              )}`
            )
          }

          await page.screenshot({
            path: path.resolve(
              outputDir,
              'quality-production-stage-filter-desktop.png'
            ),
            fullPage: true,
          })
          await clickSelectionAction(page, '判定合格')
          const modal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '判定合格' })
            .last()
          await modal.waitFor({ state: 'visible', timeout: 10_000 })
          const modalText = String((await modal.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          for (const expected of [
            '来源单据：MO-WIP-STYLE-L1-001',
            '检验类型：生产分段质检',
            '质量关口：皮套检验',
            '产品：PLUSH-BEAR-WIP-L1 / 车缝中的小熊公仔',
            '生产工序：车缝',
            '在制批次：WIP-SEWING-STYLE-L1-001',
            '批次数量：128.5',
          ]) {
            assert(
              modalText.includes(expected),
              `生产分段质检判定来源缺少 ${expected}: ${modalText}`
            )
          }
          for (const rawValue of ['PRODUCTION_WIP', 'SHELL', '908700102']) {
            assert.equal(
              modalText.includes(rawValue),
              false,
              `生产分段质检判定来源不应显示原始值 ${rawValue}`
            )
          }
          await modal.screenshot({
            path: path.resolve(
              outputDir,
              'quality-production-stage-decision-source-desktop.png'
            ),
          })
          await modal
            .getByRole('button', { name: /关\s*闭/u })
            .click()
          await modal.waitFor({ state: 'hidden', timeout: 10_000 })
          await page
            .getByRole('button', { name: '清空已选', exact: true })
            .click()
          await expectText(page, '请选择一条记录')
          await row.waitFor({ state: 'visible', timeout: 10_000 })
          await assertNoHorizontalOverflow(
            page,
            'production-stage-quality-read-model-desktop'
          )
        },
      }
    })(),
    (() => {
      let currentInspection = null
      let rejectParams = []
      return {
        name: 'quality-defect-rate-decision-dark-narrow',
        path: '/erp/production/quality-inspections',
        auth: 'admin',
        themeMode: 'dark',
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-quality-defect-rate',
          is_super_admin: true,
          permissions: ['quality.inspection.read', 'quality.inspection.update'],
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          actions: [
            ...(customerRuntimeEffectiveSession?.actions || []),
            'quality.inspection.read',
            'quality.inspection.update',
          ],
        },
        beforeNavigate: async (page) => {
          rejectParams = []
          currentInspection = {
            id: 713,
            inspection_no: 'QI-DEFECT-RATE-STYLE-L1',
            purchase_receipt_id: 601,
            purchase_receipt_item_id: 602,
            inventory_lot_id: 401,
            material_id: 1,
            warehouse_id: 1,
            source_type: 'PURCHASE_RECEIPT',
            source_id: 601,
            source_no: 'PR-IQC-20260717-001',
            inspection_type: 'INCOMING',
            subject_type: 'MATERIAL',
            subject_id: 1,
            status: 'SUBMITTED',
            result: null,
            defect_rate_operator: null,
            defect_rate_percent: null,
            decision_note: null,
            created_at: 1_784_000_000,
            updated_at: 1_784_000_000,
          }

          await page.route('**/rpc/quality', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            if (method === 'list_quality_inspections') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      quality_inspections: [currentInspection],
                      total: 1,
                      limit: Number(params.limit || 20),
                      offset: Number(params.offset || 0),
                    },
                  },
                }),
              })
              return
            }
            if (method !== 'reject_quality_inspection') {
              await route.fallback()
              return
            }

            rejectParams.push(params)
            currentInspection = {
              ...currentInspection,
              status: 'REJECTED',
              result: 'REJECT',
              defect_rate_operator: params.defect_rate_operator,
              defect_rate_percent: params.defect_rate_percent,
              decision_note: params.decision_note || null,
              inspected_at: 1_784_086_400,
              updated_at: 1_784_086_400,
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: { quality_inspection: currentInspection },
                },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '质量检验')
          await selectRow(page, 'QI-DEFECT-RATE-STYLE-L1')
          await page.waitForTimeout(500)
          await clickSelectionAction(page, '判定不合格')

          const modal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '判定不合格' })
            .last()
          await modal.waitFor({ state: 'visible', timeout: 10_000 })
          await page.setViewportSize({ width: 390, height: 844 })
          await page.waitForTimeout(300)
          const modalText = String((await modal.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          for (const expected of [
            '来源单据：PR-IQC-20260717-001',
            '按当前来源单据估算，不需要逐件计数',
            '大于 50%',
            '自定义',
          ]) {
            assert(
              modalText.includes(expected),
              `来源单据不良率判定弹窗缺少 ${expected}: ${modalText}`
            )
          }
          assert.equal(
            await modal.getByLabel('自定义不良比例').count(),
            0,
            '未选择自定义档位时不应提前显示自定义比例输入框'
          )
          await modal.screenshot({
            path: path.resolve(
              outputDir,
              'quality-defect-rate-source-modal-dark-narrow.png'
            ),
          })

          await modal
            .getByRole('radio', { name: '自定义', exact: true })
            .click()
          const customInput = modal.getByLabel('自定义不良比例')
          await customInput.waitFor({ state: 'visible', timeout: 10_000 })
          await customInput.fill('37.5')
          assert.equal(await customInput.inputValue(), '37.5')
          const customLayoutMetrics = await modal.evaluate((node) => {
            const selectors = [
              '.ant-modal-content',
              '.ant-modal-body',
              '.erp-business-action-form',
            ]
            return selectors.map((selector) => {
              const target = node.querySelector(selector)
              return {
                selector,
                found: Boolean(target),
                clientWidth: target?.clientWidth || 0,
                scrollWidth: target?.scrollWidth || 0,
              }
            })
          })
          for (const metric of customLayoutMetrics) {
            assert(
              metric.found && metric.scrollWidth <= metric.clientWidth + 1,
              `自定义不良比例窄屏布局不应横向溢出: ${JSON.stringify(metric)}`
            )
          }
          await customInput.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: path.resolve(
              outputDir,
              'quality-defect-rate-custom-modal-dark-narrow.png'
            ),
          })

          await modal
            .getByRole('radio', { name: '大于 50%', exact: true })
            .click()
          assert.equal(
            await modal.getByLabel('自定义不良比例').count(),
            0,
            '切回固定档位后应清除并收起自定义比例输入框'
          )
          await modal.getByRole('button', { name: '确认不合格' }).click()
          await expectText(page, '质量检验已判定不合格')

          assert.equal(
            rejectParams.length,
            1,
            `不良率判定应只提交一次: ${JSON.stringify(rejectParams)}`
          )
          const params = rejectParams[0]
          assert.deepEqual(Object.keys(params).sort(), [
            'defect_rate_operator',
            'defect_rate_percent',
            'id',
            'inspected_at',
            'result',
          ])
          assert.equal(params.id, 713)
          assert.equal(params.result, 'REJECT')
          assert.equal(params.defect_rate_operator, 'GT')
          assert.equal(params.defect_rate_percent, '50')
          assert.match(params.inspected_at, /^\d{4}-\d{2}-\d{2}$/u)

          const updatedRow = page
            .getByRole('row')
            .filter({
              has: page.getByText('QI-DEFECT-RATE-STYLE-L1', { exact: true }),
            })
            .first()
          await updatedRow.waitFor({ state: 'visible', timeout: 10_000 })
          const updatedRate = updatedRow.getByText('大于 50%', {
            exact: true,
          })
          await updatedRate.waitFor({ state: 'visible', timeout: 10_000 })
          assert(
            String((await updatedRow.innerText()) || '').includes(
              'PR-IQC-20260717-001'
            ),
            '判定后列表应继续显示真实来源单号'
          )
          await updatedRate.scrollIntoViewIfNeeded()
          await assertNoHorizontalOverflow(
            page,
            'quality-defect-rate-decision-dark-narrow'
          )
        },
      }
    })(),
    (() => {
      let createParams = []
      let exactReceiptIDs = []
      return {
        name: 'quality-rejection-purchase-return-dark-narrow',
        path: '/erp/production/quality-inspections',
        auth: 'admin',
        themeMode: 'dark',
        viewport: { width: 390, height: 844 },
        adminProfile: {
          username: 'style-l1-quality-return',
          is_super_admin: true,
          permissions: [
            'quality.inspection.read',
            'quality.inspection.create',
            'quality.inspection.update',
            'purchase.return.read',
            'purchase.return.create',
          ],
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          actions: [
            ...(customerRuntimeEffectiveSession?.actions || []),
            'quality.inspection.read',
            'quality.inspection.create',
            'quality.inspection.update',
            'purchase.return.read',
            'purchase.return.create',
          ],
        },
        beforeNavigate: async (page) => {
          createParams = []
          exactReceiptIDs = []
          page.on('request', (request) => {
            if (!request.url().includes('/rpc/purchase')) return
            try {
              const body = request.postDataJSON() || {}
              if (
                body.method === 'create_purchase_return_from_quality_inspection'
              ) {
                createParams.push(body.params || {})
              }
            } catch {
              // 非 JSON-RPC 请求不参与断言。
            }
          })

          await page.route('**/rpc/quality', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method !== 'list_quality_inspections') {
              await route.fallback()
              return
            }
            const inspection = {
              id: 711,
              inspection_no: 'QI-REJECT-STYLE-L1',
              purchase_receipt_id: 601,
              purchase_receipt_item_id: 602,
              inventory_lot_id: 401,
              material_id: 1,
              warehouse_id: 1,
              source_type: 'PURCHASE_RECEIPT',
              source_id: 601,
              inspection_type: 'INCOMING',
              subject_type: 'MATERIAL',
              subject_id: 1,
              status: 'REJECTED',
              result: 'REJECT',
              decision_note: '色差超出允收范围，需退供应商',
              inspected_at: 1_784_000_000,
              created_at: 1_784_000_000,
              updated_at: 1_784_000_000,
            }
            const initialRejectedInspection = {
              ...inspection,
              id: 712,
              inspection_no: 'QI-INITIAL-REJECT-STYLE-L1',
              purchase_receipt_id: 603,
              purchase_receipt_item_id: 604,
              source_id: 603,
              decision_note: '首次到货检验不合格，阻止本单入库',
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'quality-rejected-list',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    quality_inspections: [
                      inspection,
                      initialRejectedInspection,
                    ],
                    total: 2,
                    limit: 20,
                    offset: 0,
                  },
                },
              }),
            })
          })

          await page.route('**/rpc/purchase', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            if (method === 'list_purchase_receipts') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      purchase_receipts: [],
                      total: 0,
                      limit: Number(params.limit || 50),
                      offset: Number(params.offset || 0),
                    },
                  },
                }),
              })
              return
            }
            if (method === 'get_purchase_receipt') {
              const receiptID = Number(params.id || 0)
              exactReceiptIDs.push(receiptID)
              const isPosted = receiptID === 601
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      purchase_receipt: {
                        id: receiptID,
                        receipt_no: isPosted
                          ? 'PR-STYLE-L1'
                          : 'PR-DRAFT-STYLE-L1',
                        supplier_name: '样式供应商',
                        status: isPosted ? 'POSTED' : 'DRAFT',
                        items: [
                          {
                            id: isPosted ? 602 : 604,
                            material_id: 1,
                            warehouse_id: 1,
                            lot_id: 401,
                          },
                        ],
                      },
                    },
                  },
                }),
              })
              return
            }
            if (
              method === 'list_purchase_returns' &&
              Number(params.quality_inspection_id || 0) === 711
            ) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      purchase_returns: [],
                      total: 0,
                      limit: Number(params.limit || 20),
                      offset: Number(params.offset || 0),
                    },
                  },
                }),
              })
              return
            }
            if (method !== 'create_purchase_return_from_quality_inspection') {
              await route.fallback()
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    purchase_return: {
                      id: 912,
                      return_no: params.return_no,
                      purchase_receipt_id: 601,
                      quality_inspection_id: 711,
                      supplier_name: '样式供应商',
                      return_reason: params.reason,
                      status: 'DRAFT',
                      returned_at: 1_784_000_000,
                      note: params.note || '',
                    },
                  },
                },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '质量检验')
          await page
            .getByRole('row')
            .filter({ hasText: 'QI-REJECT-STYLE-L1' })
            .click()
          const returnButton = await findSelectionActionButton(page, '退供应商')
          await page.waitForFunction(
            (button) => button instanceof HTMLButtonElement && !button.disabled,
            await returnButton.elementHandle()
          )
          assert(
            exactReceiptIDs.includes(601),
            '已入库来源不在首批列表时应按 ID 精确读取'
          )
          assert.equal(await returnButton.isEnabled(), true)
          await returnButton.click()

          const modal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '退供应商' })
            .last()
          await modal.waitFor({ state: 'visible', timeout: 10_000 })
          const modalText = String((await modal.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          for (const expected of [
            'QI-REJECT-STYLE-L1',
            'PR-STYLE-L1',
            '样式供应商',
            '样式材料',
            '样式仓库',
            'INV-LOT-001',
            '本次退货数量',
            '退货原因',
          ]) {
            assert(
              modalText.includes(expected),
              `不合格退供应商弹窗缺少 ${expected}: ${modalText}`
            )
          }
          for (const technicalCopy of [
            'quality_inspection_id',
            'purchase_receipt_id',
            'material_id',
            'warehouse_id',
            'lot_id',
            'idempotency_key',
          ]) {
            assert.equal(
              (await modal.getByText(technicalCopy, { exact: true }).count()) >
                0,
              false,
              `不合格退供应商弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await page.waitForTimeout(700)
          const quantityInput = modal.getByLabel('本次退货数量')
          const reasonInput = modal.getByLabel('退货原因')
          const noteInput = modal.getByLabel('备注')
          await quantityInput.fill('2')
          await reasonInput.fill('色差不合格，退回供应商')
          await noteInput.fill('请采购跟进退货交接')
          assert.equal(await quantityInput.inputValue(), '2')
          assert.equal(await reasonInput.inputValue(), '色差不合格，退回供应商')
          assert.equal(await noteInput.inputValue(), '请采购跟进退货交接')
          await modal.screenshot({
            path: path.resolve(
              outputDir,
              'quality-rejection-purchase-return-modal-dark-narrow.png'
            ),
          })
          await modal.getByRole('button', { name: '生成退货草稿' }).click()
          await page.waitForTimeout(400)
          const postSubmitText = String(
            (await page.locator('body').innerText()) || ''
          ).replace(/\s+/gu, ' ')
          assert.equal(
            createParams.length,
            1,
            `提交后未按预期调用采购退货来源命令: ${JSON.stringify({
              createParams,
              postSubmitText: postSubmitText.slice(0, 2500),
            })}`
          )
          assert(
            postSubmitText.includes('采购退货草稿已生成'),
            `采购退货来源命令已调用但页面未进入成功态: ${JSON.stringify({
              createParams,
              postSubmitText: postSubmitText.slice(0, 3000),
            })}`
          )
          await expectText(page, '采购退货草稿已生成')
          await page
            .getByText('采购退货草稿已生成，请到采购退货记录核对并确认', {
              exact: true,
            })
            .waitFor({ state: 'hidden', timeout: 10_000 })

          const params = createParams[0]
          const allowedKeys = new Set([
            'customer_key',
            'return_no',
            'quality_inspection_id',
            'quantity',
            'returned_at',
            'reason',
            'note',
            'idempotency_key',
          ])
          assert(
            Object.keys(params).every((key) => allowedKeys.has(key)),
            `采购退货请求包含服务端派生字段: ${JSON.stringify(params)}`
          )
          assert.equal(params.customer_key, 'yoyoosun')
          assert.equal(params.quality_inspection_id, 711)
          assert.equal(params.quantity, '2')
          assert.equal(params.reason, '色差不合格，退回供应商')
          assert.equal(typeof params.idempotency_key, 'string')
          for (const derivedField of [
            'purchase_receipt_id',
            'purchase_receipt_item_id',
            'supplier_id',
            'material_id',
            'warehouse_id',
            'unit_id',
            'lot_id',
          ]) {
            assert.equal(derivedField in params, false)
          }
          const completedButton = page.getByRole('button', {
            name: '已生成退货',
          })
          if ((await completedButton.count()) > 0) {
            assert.equal(await completedButton.isDisabled(), true)
          } else {
            await page.getByRole('button', { name: /更多操作/u }).click()
            const completedDrawerButton = page
              .locator('.ant-drawer:visible')
              .getByRole('button', { name: '已生成退货' })
            await completedDrawerButton.waitFor({
              state: 'visible',
              timeout: 10_000,
            })
            assert.equal(await completedDrawerButton.isDisabled(), true)
            await page.keyboard.press('Escape')
          }
          await expectText(
            page,
            '首次到货检验不合格会阻止本单入库，现有退供应商草稿只适用于已入库后追加检验不合格'
          )
          await selectRow(page, 'QI-INITIAL-REJECT-STYLE-L1')
          const initialRejectReturnButton = await findSelectionActionButton(
            page,
            '退供应商'
          )
          const initialRejectTitle =
            '首次到货检验不合格只阻止入库，不在此生成采购退货'
          await page.waitForFunction(
            ({ button, title }) => button?.getAttribute('title') === title,
            {
              button: await initialRejectReturnButton.elementHandle(),
              title: initialRejectTitle,
            }
          )
          assert(
            exactReceiptIDs.includes(603),
            '首次 IQC 来源不在首批列表时也应按 ID 精确读取'
          )
          assert.equal(await initialRejectReturnButton.isDisabled(), true)
          assert.equal(
            await initialRejectReturnButton.getAttribute('title'),
            initialRejectTitle
          )
          const initialRejectDrawer = await ensureSelectionActionDrawer(page)
          const initialRejectDrawerButton = initialRejectDrawer
            .locator('button')
            .filter({ hasText: '退供应商' })
          assert.equal(await initialRejectDrawerButton.isDisabled(), true)
          assert.equal(
            await initialRejectDrawerButton.getAttribute('title'),
            initialRejectTitle
          )
          await page.waitForFunction(
            (button) => {
              const rect = button?.getBoundingClientRect()
              return Boolean(
                rect && rect.top >= 0 && rect.bottom <= window.innerHeight
              )
            },
            await initialRejectDrawerButton.elementHandle()
          )
          await initialRejectDrawer.screenshot({
            path: path.resolve(
              outputDir,
              'quality-initial-iqc-rejection-disabled-drawer-dark-narrow.png'
            ),
          })
          await page.screenshot({
            path: path.resolve(
              outputDir,
              'quality-initial-iqc-rejection-disabled-dark-narrow.png'
            ),
            fullPage: true,
          })
          await assertNoHorizontalOverflow(
            page,
            'quality-rejection-purchase-return-dark-narrow'
          )
        },
      }
    })(),
    (() => {
      let createParams = []
      let createdInspection = null
      return {
        name: 'outsourcing-return-quality-create-desktop',
        path: '/erp/purchase/processing-contracts',
        auth: 'admin',
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-outsourcing-return-quality',
          is_super_admin: true,
          permissions: [
            'outsourcing.order.read',
            'outsourcing.fact.read',
            'quality.inspection.read',
            'quality.inspection.create',
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
            'quality.inspection.create',
            'finance.payable.confirm',
          ],
        },
        beforeNavigate: async (page) => {
          createParams = []
          createdInspection = null
          page.on('request', (request) => {
            if (!request.url().includes('/rpc/quality')) return
            try {
              const body = request.postDataJSON() || {}
              if (
                body.method ===
                'create_quality_inspection_from_outsourcing_return'
              ) {
                createParams.push(body.params || {})
              }
            } catch {
              // 非 JSON-RPC 请求不参与断言。
            }
          })

          await page.route('**/rpc/quality', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            if (method === 'list_quality_inspections' && createdInspection) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      quality_inspections: [createdInspection],
                      total: 1,
                      limit: Number(params.limit || 20),
                      offset: Number(params.offset || 0),
                    },
                  },
                }),
              })
              return
            }
            if (method === 'list_outsourcing_return_quality_inspections') {
              const inspections = createdInspection
                ? [createdInspection].filter(
                    (inspection) =>
                      !params.fact_id ||
                      Number(inspection.source_id) === Number(params.fact_id)
                  )
                : []
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      quality_inspections: inspections,
                      total: inspections.length,
                      limit: Number(params.limit || 50),
                      offset: Number(params.offset || 0),
                    },
                  },
                }),
              })
              return
            }
            if (
              method !== 'create_quality_inspection_from_outsourcing_return'
            ) {
              await route.fallback()
              return
            }
            createdInspection = {
              id: 712,
              inspection_no: params.inspection_no,
              inventory_lot_id: 402,
              warehouse_id: 1,
              source_type: 'OUTSOURCING_FACT',
              source_id: 3,
              inspection_type: 'OUTSOURCING_RETURN',
              subject_type: 'PRODUCT',
              subject_id: 1,
              status: 'DRAFT',
              result: null,
              decision_note: params.note || null,
              created_at: 1_784_000_000,
              updated_at: 1_784_000_000,
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: { quality_inspection: createdInspection },
                },
              }),
            })
          })
        },
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
          assert(
            String((await postedRow.innerText()) || '').includes(
              'SKU-OUTSOURCE-SNAPSHOT-L1'
            ),
            '委外回货记录必须显示来源行冻结的产品规格'
          )
          assert(
            String((await postedRow.innerText()) || '').includes('待发起质检'),
            '未发起质检的委外回货必须显示待质检状态'
          )
          await postedRow.click()
          assert.equal(
            await recordsModal
              .getByRole('button', { name: '生成应付', exact: true })
              .isDisabled(),
            true
          )
          const createButton = recordsModal.getByRole('button', {
            name: '发起质检',
            exact: true,
          })
          assert.equal(await createButton.isEnabled(), true)
          await createButton.click()

          const qualityModal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '发起委外回货质检' })
            .last()
          await qualityModal.waitFor({ state: 'visible', timeout: 10_000 })
          const modalText = String((await qualityModal.innerText()) || '')
            .replace(/\s+/gu, ' ')
            .trim()
          for (const expected of [
            'SIM-OUTSOURCE-CONTRACT-L1',
            'OUT-RR-POSTED-L1',
            '已过账',
            '回货数量',
            'SKU-OUTSOURCE-SNAPSHOT-L1',
            '质检单号（自动）',
            '送检备注',
          ]) {
            assert(
              modalText.includes(expected),
              `委外回货质检弹窗缺少 ${expected}: ${modalText}`
            )
          }
          const formLabels = await qualityModal
            .locator('.ant-form-item-label label')
            .allTextContents()
          assert.deepEqual(
            formLabels.map((label) => label.trim()),
            ['质检单号（自动）', '送检备注']
          )
          for (const technicalCopy of [
            'fact_id',
            'source_type',
            'source_id',
            'inventory_lot_id',
            'warehouse_id',
            'subject_id',
            'idempotency_key',
          ]) {
            assert.equal(
              modalText.includes(technicalCopy),
              false,
              `委外回货质检弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await qualityModal.getByLabel('送检备注').fill('委外回货抽检')
          await page.waitForTimeout(700)
          await qualityModal.screenshot({
            path: path.resolve(
              outputDir,
              'outsourcing-return-quality-create-modal-desktop.png'
            ),
          })
          await qualityModal
            .getByRole('button', { name: '生成质检草稿' })
            .click()
          await expectText(page, '质检草稿已生成，请在委外记录中继续办理')

          assert.equal(createParams.length, 1)
          const params = createParams[0]
          assert.deepEqual(Object.keys(params).sort(), [
            'customer_key',
            'fact_id',
            'inspection_no',
            'note',
          ])
          assert.equal(params.customer_key, 'yoyoosun')
          assert.equal(params.fact_id, 3)
          assert.equal(params.note, '委外回货抽检')

          await recordsModal.waitFor({ state: 'visible', timeout: 10_000 })
          await recordsModal
            .getByRole('row')
            .filter({ hasText: 'OUT-RR-POSTED-L1' })
            .first()
            .click()
          const refreshedPostedRow = recordsModal
            .getByRole('row')
            .filter({ hasText: 'OUT-RR-POSTED-L1' })
            .first()
          assert(
            String((await refreshedPostedRow.innerText()) || '').includes(
              '质检草稿'
            ),
            '质检草稿必须保持委外回货应付入口不可用'
          )
          assert.equal(
            await recordsModal
              .getByRole('button', { name: '生成应付', exact: true })
              .isDisabled(),
            true
          )
          const completedButton = recordsModal.getByRole('button', {
            name: '已发起质检',
            exact: true,
          })
          await completedButton.waitFor({ state: 'visible', timeout: 10_000 })
          assert.equal(await completedButton.isDisabled(), true)

          await page.keyboard.press('Escape')
          await recordsModal.waitFor({ state: 'hidden', timeout: 10_000 })
          await page.goto(
            new URL(
              '/erp/production/quality-inspections',
              page.url()
            ).toString(),
            { waitUntil: 'domcontentloaded' }
          )
          await expectHeading(page, '质量检验')
          const qualityRow = page
            .getByRole('row')
            .filter({ hasText: params.inspection_no })
            .first()
          await qualityRow.waitFor({ state: 'visible', timeout: 10_000 })
          const qualityRowText = String((await qualityRow.innerText()) || '')
            .replace(/\s+/gu, ' ')
            .trim()
          for (const expected of [
            '委外回货',
            '委外回货记录已关联',
            'PROD-STYLE-L1',
            'SKU-LOT-STYLE-L1',
          ]) {
            assert(
              qualityRowText.includes(expected),
              `委外回货质检读模型缺少 ${expected}: ${qualityRowText}`
            )
          }
          assert.equal(qualityRowText.includes('采购入库已关联'), false)
          assert.equal(qualityRowText.includes('材料已关联'), false)
          await assertNoHorizontalOverflow(
            page,
            'outsourcing-return-quality-create-desktop'
          )
        },
      }
    })(),
    (() => {
      let createParams = []
      let createdInspection = null
      const shipment = {
        id: 44,
        shipment_no: 'SHIP-FG-QI-STYLE-L1',
        status: 'DRAFT',
        sales_order_id: 1,
        customer_id: 1,
        customer_snapshot: '出货前检验客户',
        planned_ship_at: 1_784_172_800,
        shipped_at: null,
        total_net_weight_g: null,
        note: '等待出货前检验',
        items: [
          {
            id: 441,
            shipment_id: 44,
            sales_order_item_id: 1,
            product_id: 1,
            product_sku_id: 1,
            warehouse_id: 1,
            unit_id: 1,
            lot_id: 402,
            quantity: '8',
            note: '同批次第一行',
          },
          {
            id: 442,
            shipment_id: 44,
            sales_order_item_id: 1,
            product_id: 1,
            product_sku_id: 1,
            warehouse_id: 1,
            unit_id: 1,
            lot_id: 402,
            quantity: '4.5',
            note: '同批次第二行',
          },
        ],
        created_at: 1_784_086_400,
        updated_at: 1_784_086_400,
      }

      return {
        name: 'shipment-finished-goods-quality-create-desktop',
        path: '/erp/warehouse/shipments',
        auth: 'admin',
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-shipment-quality',
          is_super_admin: true,
          permissions: [
            'shipment.read',
            'quality.inspection.read',
            'quality.inspection.create',
            'warehouse.inventory.read',
          ],
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          actions: [
            ...(customerRuntimeEffectiveSession?.actions || []),
            'shipment.read',
            'quality.inspection.read',
            'quality.inspection.create',
            'warehouse.inventory.read',
          ],
        },
        beforeNavigate: async (page) => {
          createParams = []
          createdInspection = null
          await page.route('**/rpc/operational_fact', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method !== 'list_shipments') {
              await route.fallback()
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'shipment-quality-list',
                result: {
                  code: 0,
                  message: 'OK',
                  data: stylePaginatedRpcData(
                    [shipment],
                    'shipments',
                    body.params || {},
                    20
                  ),
                },
              }),
            })
          })
          await page.route('**/rpc/quality', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'shipment-quality', method, params = {} } = body
            if (method === 'list_finished_goods_quality_inspections') {
              const inspections = createdInspection ? [createdInspection] : []
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: stylePaginatedRpcData(
                      inspections,
                      'quality_inspections',
                      params
                    ),
                  },
                }),
              })
              return
            }
            if (method === 'create_finished_goods_quality_inspection_draft') {
              createParams.push(params)
              createdInspection = {
                id: 944,
                inspection_no: params.inspection_no,
                purchase_receipt_id: null,
                purchase_receipt_item_id: null,
                inventory_lot_id: 402,
                material_id: null,
                warehouse_id: 1,
                source_type: 'SHIPMENT',
                source_id: shipment.id,
                source_no: shipment.shipment_no,
                inspection_type: 'FINISHED_GOODS',
                subject_type: 'PRODUCT',
                subject_id: 1,
                status: 'DRAFT',
                result: null,
                decision_note: params.decision_note || null,
                created_at: 1_784_172_800,
                updated_at: 1_784_172_800,
              }
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: { quality_inspection: createdInspection },
                  },
                }),
              })
              return
            }
            if (
              method === 'get_quality_inspection' &&
              createdInspection &&
              Number(params.id) === createdInspection.id
            ) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: { quality_inspection: createdInspection },
                  },
                }),
              })
              return
            }
            if (method === 'list_quality_inspections' && createdInspection) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: stylePaginatedRpcData(
                      [createdInspection],
                      'quality_inspections',
                      params,
                      20
                    ),
                  },
                }),
              })
              return
            }
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '出货单')
          await selectRow(page, shipment.shipment_no)
          await clickSelectionAction(page, '发起出货前检验')

          const modal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '发起出货前成品检验' })
            .last()
          await modal.waitFor({ state: 'visible', timeout: 10_000 })
          const modalText = String((await modal.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          for (const expected of [
            shipment.shipment_no,
            '不启动任务流程',
            '不代表已经出货',
            'SKU-STYLE-L1',
            'SKU-LOT-STYLE-L1',
            '12.5（合并 2 条相同批次明细）',
          ]) {
            assert(
              modalText.includes(expected),
              `出货前成品检验弹窗缺少 ${expected}: ${modalText}`
            )
          }
          const formLabels = await modal
            .locator('.ant-form-item-label label')
            .allTextContents()
          assert.deepEqual(
            formLabels.map((label) => label.trim()),
            ['送检批次', '检验单号（自动）', '送检备注']
          )
          assert.equal(
            await modal.getByLabel('检验单号（自动）').isEditable(),
            false,
            '自动检验单号必须保持只读，作为未知结果重试锚点'
          )
          for (const technicalCopy of [
            'source_id',
            'subject_id',
            'warehouse_id',
            'inventory_lot_id',
            'idempotency_key',
          ]) {
            assert.equal(
              modalText.includes(technicalCopy),
              false,
              `出货前成品检验弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await modal.getByLabel('送检备注').fill('出货前批次抽检')
          await modal.screenshot({
            path: path.resolve(
              outputDir,
              'shipment-finished-goods-quality-create-modal-desktop.png'
            ),
          })
          await modal.getByRole('button', { name: '生成检验草稿' }).click()
          await page.waitForURL(
            /quality-inspections\?quality_inspection_id=944/u
          )
          await expectHeading(page, '质量检验')

          assert.equal(createParams.length, 1)
          assert.deepEqual(Object.keys(createParams[0]).sort(), [
            'customer_key',
            'decision_note',
            'finished_goods_lot_id',
            'inspection_no',
            'product_id',
            'shipment_id',
            'warehouse_id',
          ])
          assert.equal(createParams[0].shipment_id, shipment.id)
          assert.equal(createParams[0].finished_goods_lot_id, 402)
          assert.equal(createParams[0].product_id, 1)
          assert.equal(createParams[0].warehouse_id, 1)
          assert.equal(createParams[0].decision_note, '出货前批次抽检')
          await page
            .getByRole('row')
            .filter({ hasText: createdInspection.inspection_no })
            .first()
            .waitFor({ state: 'visible', timeout: 10_000 })
          await assertNoHorizontalOverflow(
            page,
            'shipment-finished-goods-quality-create-desktop'
          )
        },
      }
    })(),
  ]
}
