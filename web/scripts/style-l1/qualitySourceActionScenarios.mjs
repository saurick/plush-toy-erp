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

  return [
    (() => {
      let createParams = []
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
                    quality_inspections: [inspection],
                    total: 1,
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
                      limit: 20,
                      offset: 0,
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
          const returnButton = page.getByRole('button', { name: '退供应商' })
          await returnButton.waitFor({ state: 'visible', timeout: 10_000 })
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
          await expectText(page, '质检草稿已生成，请到质量检验继续办理')

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
  ]
}
