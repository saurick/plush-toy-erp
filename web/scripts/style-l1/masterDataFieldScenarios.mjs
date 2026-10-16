import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'

export function createMasterDataFieldScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    closeBusinessFormModal,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    {
      name: 'product-net-weight-unit-suffix-desktop',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_units') {
            await route.fallback()
            return
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'product-weight-unit-options',
              result: {
                code: 0,
                message: 'OK',
                data: {
                  units: [
                    {
                      id: 1,
                      code: 'KG',
                      name: '千克',
                      precision: 3,
                      is_active: true,
                    },
                    {
                      id: 2,
                      code: 'PCS',
                      name: '件',
                      precision: 0,
                      is_active: true,
                    },
                  ],
                  total: 2,
                  limit: 100,
                  offset: 0,
                },
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '产品档案')
        await page.getByRole('button', { name: '新建产品' }).click()
        const modal = page
          .locator(
            '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
          )
          .last()
        await expectText(page, '产品单重（净重）')
        const suffix = modal.locator('.erp-item-field-unit-suffix').first()
        await suffix.waitFor()
        await expectText(modal, '件')
        await modal.screenshot({
          path: path.join(
            outputDir,
            'product-net-weight-unit-suffix-default.png'
          ),
        })
        const weightInput = modal.getByLabel('产品单重（净重）')
        await weightInput.fill('425')
        await modal
          .locator('#default_unit_id')
          .locator(
            'xpath=ancestor::div[contains(@class,"ant-select-selector")]'
          )
          .click()
        await page
          .locator(
            '.ant-select-dropdown:visible .ant-select-item-option-content'
          )
          .filter({ hasText: '千克' })
          .click()
        await page.keyboard.press('Tab')
        await page
          .locator('.ant-select-dropdown:visible')
          .waitFor({ state: 'hidden' })
        await expectText(modal, '千克')
        assert.equal(
          await weightInput.inputValue(),
          '',
          '默认单位变更后应清除旧产品单重'
        )
        const suffixMetrics = await suffix.evaluate((node) => {
          const wrapper = node.closest('.ant-input-number-affix-wrapper')
          const input = wrapper?.querySelector('.ant-input-number')
          return {
            text: String(node.textContent || '').trim(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
            inputCount: wrapper?.querySelectorAll('input').length,
            innerBorder: input && getComputedStyle(input).borderLeftWidth,
            radius: wrapper && getComputedStyle(wrapper).borderRadius,
            height: wrapper?.getBoundingClientRect().height,
          }
        })
        assert.equal(suffixMetrics.inputCount, 1, '单位不得成为第二个输入框')
        assert.equal(suffixMetrics.innerBorder, '0px', '数值与单位共用外边框')
        assert.equal(suffixMetrics.radius, '8px')
        assert.equal(suffixMetrics.height, 34, '单位框与相邻控件等高')
        assert.equal(
          suffixMetrics.text,
          '克',
          `产品单重应使用清晰的中文克单位: ${JSON.stringify(suffixMetrics)}`
        )
        assert(
          suffixMetrics.scrollWidth <= suffixMetrics.clientWidth + 1 &&
            suffixMetrics.scrollHeight <= suffixMetrics.clientHeight + 1,
          `产品单重单位后缀不得被裁切: ${JSON.stringify(suffixMetrics)}`
        )
        await modal.screenshot({
          path: path.join(outputDir, 'product-net-weight-unit-suffix.png'),
        })
        await closeBusinessFormModal(page, modal)
        await assertNoHorizontalOverflow(
          page,
          'product-net-weight-unit-suffix-desktop'
        )
      },
    },
    {
      name: 'bom-person-field-labels-desktop',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-bom-person-field-labels',
        configHash: 'style-l1-bom-person-field-labels-hash',
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'workflow.task.create',
          'workflow.task.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
        },
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '物料清单（BOM）')
        await page.getByRole('button', { name: '新建 BOM' }).click()
        const modal = page
          .locator(
            '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
          )
          .last()
        await expectText(page, '新建 BOM 草稿')
        await modal.getByLabel('制表人', { exact: true }).waitFor()
        await modal.getByLabel('审核人', { exact: true }).waitFor()
        const labelMetrics = await modal.evaluate((node) => {
          const normalizeText = (value) =>
            String(value || '')
              .replace(/\s+/gu, '')
              .trim()
          return ['制表人', '审核人'].map((label) => {
            const formItem = Array.from(
              node.querySelectorAll('.ant-form-item')
            ).find(
              (item) =>
                normalizeText(
                  item.querySelector('.ant-form-item-label')?.textContent
                ) === label
            )
            const labelNode = formItem?.querySelector(
              '.ant-form-item-label label'
            )
            const input = formItem?.querySelector('input')
            const itemRect = formItem?.getBoundingClientRect()
            const labelRect = labelNode?.getBoundingClientRect()
            const inputRect = input?.getBoundingClientRect()
            return {
              label,
              found: Boolean(formItem && labelNode && input),
              labelWidth: labelRect?.width || 0,
              inputWidth: inputRect?.width || 0,
              contained:
                Boolean(itemRect && inputRect) &&
                inputRect.left >= itemRect.left - 1 &&
                inputRect.right <= itemRect.right + 1,
            }
          })
        })
        assert(
          labelMetrics.every(
            (item) =>
              item.found &&
              item.labelWidth > 0 &&
              item.inputWidth > 0 &&
              item.contained
          ),
          `BOM 人员字段标签和值槽应完整可见且保持在字段容器内: ${JSON.stringify(
            labelMetrics
          )}`
        )
        await modal.screenshot({
          path: path.join(outputDir, 'bom-person-field-labels-default.png'),
        })

        const makerInput = modal.getByLabel('制表人', { exact: true })
        const auditorInput = modal.getByLabel('审核人', { exact: true })
        await makerInput.fill('工程制表人员姓名边界样例')
        await auditorInput.fill('工程审核人员姓名边界样例')
        await auditorInput.focus()
        assert.equal(
          await makerInput.inputValue(),
          '工程制表人员姓名边界样例',
          'BOM 制表人字段应接受并保留人员姓名'
        )
        assert.equal(
          await auditorInput.inputValue(),
          '工程审核人员姓名边界样例',
          'BOM 审核人字段应接受并保留人员姓名'
        )
        await modal.screenshot({
          path: path.join(outputDir, 'bom-person-field-labels-boundary.png'),
        })
        await closeBusinessFormModal(page, modal)
      },
    },
    {
      name: 'bom-xlsx-import-draft-desktop',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const rpcMutations = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/')) return
          try {
            const body = request.postDataJSON() || {}
            if (
              /^(?:activate_|create_|save_|update_)/u.test(
                String(body.method || '')
              )
            ) {
              rpcMutations.push(body)
            }
          } catch {
            // Non-JSON requests are outside the RPC mutation contract.
          }
        })

        await expectHeading(page, '物料清单（BOM）')
        const importButton = page.locator(
          'button[data-business-action-key="import-bom-xlsx"]'
        )
        await importButton.waitFor({ state: 'visible' })
        await page.waitForFunction(() => {
          const button = document.querySelector(
            'button[data-business-action-key="import-bom-xlsx"]'
          )
          return button instanceof HTMLButtonElement && !button.disabled
        })
        await page.getByLabel('选择 BOM Excel 文件').setInputFiles({
          name: 'BOM-IMPORT-STYLE-L1.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createBOMImportWorkbookFixture(),
        })

        const modal = page
          .locator(
            '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
          )
          .last()
        await modal.waitFor({ state: 'visible' })
        await expectText(page, '检查并保存导入草稿')
        await expectText(page, '已读取 2 条 BOM 明细')
        await expectText(page, '请先关联 1 种物料')
        assert.equal(
          await modal.getByLabel('来源订单号', { exact: true }).inputValue(),
          'ORDER-IMPORT-L1',
          'BOM 导入应带入原表订单号'
        )
        assert.equal(
          await modal.getByLabel('订单数量', { exact: true }).inputValue(),
          '100',
          'BOM 导入应保留用于损耗核对的原表订单数量'
        )
        assert.equal(
          (
            await modal.getByLabel('制表日期', { exact: true }).inputValue()
          ).replaceAll('/', '-'),
          '2026-01-19',
          'BOM 导入应把 Excel 日期序列转换为本地化显示的业务日期'
        )

        const importMetrics = await modal.evaluate((node) => {
          const alert = node.querySelector('.erp-bom-import-review')
          const modalBody = node.querySelector('.erp-business-form-page__body')
          const rows = Array.from(
            node.querySelectorAll('tr[data-bom-part-index]')
          )
          const statuses = rows.map((row) =>
            row
              .querySelector('.erp-bom-import-line-status')
              ?.getAttribute('data-bom-import-row-status')
          )
          const alertRect = alert?.getBoundingClientRect()
          const bodyRect = modalBody?.getBoundingClientRect()
          return {
            issueCount: alert?.getAttribute('data-bom-import-issue-count'),
            statuses,
            rowCount: rows.length,
            alertContained:
              Boolean(alertRect && bodyRect) &&
              alertRect.left >= bodyRect.left - 1 &&
              alertRect.right <= bodyRect.right + 1,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert.deepEqual(
          importMetrics,
          {
            issueCount: '1',
            statuses: ['matched', 'unresolved'],
            rowCount: 2,
            alertContained: true,
            documentOverflowX: 0,
          },
          `BOM 导入校对态应清楚区分已匹配与待补全行，且不撑破页面: ${JSON.stringify(
            importMetrics
          )}`
        )
        await modal.screenshot({
          path: path.join(outputDir, 'bom-xlsx-import-unresolved.png'),
        })

        await modal.getByLabel('BOM 版本', { exact: true }).fill('V-IMPORT-L1')
        await modal.getByRole('button', { name: '保存草稿' }).click()
        await expectText(page, '暂未保存：请先关联 1 种物料')
        assert.equal(
          rpcMutations.filter((item) => item.method === 'save_bom_with_items')
            .length,
          0,
          '待补全的 BOM 导入不得提前写入草稿'
        )

        const rows = modal.locator('tr[data-bom-part-index]')
        const unresolvedRow = rows.nth(1)
        await unresolvedRow.scrollIntoViewIfNeeded()
        const materialSelect = unresolvedRow
          .locator('.erp-bom-material-cell .ant-select')
          .first()
        await materialSelect.click()
        await materialSelect.locator('input').fill('MAT-STYLE-L1')
        await page.keyboard.press('Enter')
        await modal
          .locator('.erp-bom-material-group')
          .first()
          .locator('.erp-bom-material-cell .ant-select-selection-item')
          .filter({ hasText: '样式材料' })
          .waitFor({ state: 'visible' })
        assert.equal(
          await modal.locator('.erp-bom-material-group').count(),
          1,
          '同一物料和单位在补全后应合并身份栏'
        )
        await modal
          .locator('.erp-bom-import-review[data-bom-import-issue-count="0"]')
          .waitFor({ state: 'visible' })
        assert.deepEqual(
          await modal
            .locator('.erp-bom-import-line-status')
            .evaluateAll((nodes) =>
              nodes.map((node) =>
                node.getAttribute('data-bom-import-row-status')
              )
            ),
          ['matched', 'matched'],
          '人工选择现有材料后，待补全行应即时变为已匹配'
        )
        await unresolvedRow.scrollIntoViewIfNeeded()
        await modal.screenshot({
          path: path.join(outputDir, 'bom-xlsx-import-resolved.png'),
        })

        const saveRequestPromise = page.waitForRequest((request) => {
          if (!request.url().includes('/rpc/bom')) return false
          try {
            return request.postDataJSON()?.method === 'save_bom_with_items'
          } catch {
            return false
          }
        })
        await modal.getByRole('button', { name: '保存草稿' }).click()
        const saveRequest = await saveRequestPromise
        const saveBody = saveRequest.postDataJSON()
        assert.equal(saveBody.method, 'save_bom_with_items')
        assert.equal(saveBody.params.product_id, 1)
        assert.equal(saveBody.params.version, 'V-IMPORT-L1')
        assert.equal(saveBody.params.source_order_no, 'ORDER-IMPORT-L1')
        assert.equal(saveBody.params.print_date, '2026-01-19')
        assert.equal(saveBody.params.items.length, 2)
        assert.deepEqual(
          saveBody.params.items.map((item) => ({
            materialID: item.material_id,
            unitID: item.unit_id,
            quantity: item.quantity,
            lossRate: item.loss_rate,
            totalUsage: item.total_usage_snapshot,
          })),
          [
            {
              materialID: 1,
              unitID: 1,
              quantity: '0.5',
              lossRate: '0.1',
              totalUsage: '55',
            },
            {
              materialID: 1,
              unitID: 1,
              quantity: '1',
              lossRate: '0',
              totalUsage: undefined,
            },
          ],
          '导入保存必须使用现有主数据 ID、单位用量和逐行核对后的损耗率'
        )
        assert.equal(
          JSON.stringify(saveBody.params).includes('_import_source'),
          false,
          '页面校对元数据不得进入正式 BOM 写入合同'
        )
        await modal.waitFor({ state: 'hidden' })
        await expectText(page, 'BOM 导入草稿已创建')
        assert.deepEqual(
          rpcMutations.map((item) => item.method),
          ['save_bom_with_items'],
          'BOM Excel 导入只能保存草稿，不得自动创建主数据或激活版本'
        )
        await assertNoHorizontalOverflow(page, 'bom-xlsx-import-draft-desktop')
      },
    },
  ]
}

export function createSupplierProcessingScenarios(deps) {
  const {
    assert,
    closeBusinessFormModal,
    expectHeading,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    {
      name: 'supplier-processing-multi-select-layout-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const processFixtures = [
          ['PROC-EMBROIDERY-L1', '面部电绣', '电脑绣花'],
          ['PROC-LASER-L1', '耳片激光', '激光裁切'],
          ['PROC-TRANSFER-L1', '图案热转印', '热转印'],
          ['PROC-SEWING-L1', '本体车缝', '车缝'],
          ['PROC-STUFFING-L1', '本体充棉', '充棉'],
          ['PROC-CUTTING-L1', '面料裁片', '裁床'],
          ['PROC-INSPECTION-L1', '外观查货', '查货'],
          ['PROC-PACKAGING-L1', '成品包装', '包装'],
        ].map(([code, name, category], index) => ({
          id: index + 101,
          code,
          name,
          category,
          outsourcing_enabled: true,
          inhouse_enabled: true,
          quality_required: false,
          is_active: true,
        }))

        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_processes') {
            await route.fallback()
            return
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'supplier-process-layout',
              result: {
                code: 0,
                message: 'OK',
                data: {
                  processes: processFixtures,
                  total: processFixtures.length,
                  limit: 100,
                  offset: 0,
                },
              },
            }),
          })
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '供应商与加工厂')
        await page.getByRole('button', { name: '新建供应商' }).click()

        const modal = page
          .locator(
            '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
          )
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        const processField = modal
          .locator('.ant-form-item')
          .filter({ hasText: '可加工工序' })
          .first()
        await processField.locator('.ant-select').click()
        const unselectedOptions = page.locator(
          '.ant-select-dropdown:visible .ant-select-item-option:not(.ant-select-item-option-disabled):not(.ant-select-item-option-selected)'
        )
        for (let index = 0; index < processFixtures.length; index += 1) {
          await unselectedOptions.first().click()
        }
        await page.keyboard.press('Escape')

        const readLayout = () =>
          processField.evaluate((node) => {
            const toRect = (element) => {
              const rect = element?.getBoundingClientRect()
              return rect
                ? {
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  }
                : null
            }
            const selector = node.querySelector('.ant-select-selector')
            const extra = node.querySelector('.ant-form-item-extra')
            const tags = Array.from(
              node.querySelectorAll('.ant-select-selection-item')
            ).map(toRect)
            return {
              field: {
                clientWidth: node.clientWidth,
                scrollWidth: node.scrollWidth,
              },
              selector: toRect(selector),
              extra: toRect(extra),
              tags,
            }
          })

        const assertLayout = (metrics, state) => {
          assert.equal(
            metrics.tags.length,
            processFixtures.length,
            `${state} 应显示全部已选工序: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.selector && metrics.selector.height > 36,
            `${state} 多选框应随标签换行增高: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.tags.every(
              (tag) =>
                tag &&
                tag.left >= metrics.selector.left - 1 &&
                tag.right <= metrics.selector.right + 1 &&
                tag.top >= metrics.selector.top - 1 &&
                tag.bottom <= metrics.selector.bottom + 1
            ),
            `${state} 已选标签不得越过多选框边界: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.extra &&
              metrics.extra.top >= metrics.selector.bottom - 1 &&
              metrics.tags.every((tag) => tag.bottom <= metrics.extra.top + 1),
            `${state} 多选标签不得覆盖字段说明: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.field.scrollWidth <= metrics.field.clientWidth + 1,
            `${state} 多选字段不得产生横向溢出: ${JSON.stringify(metrics)}`
          )
        }

        const desktopMetrics = await readLayout()
        assertLayout(desktopMetrics, '供应商多选桌面态')
        await modal.screenshot({
          path: path.join(
            outputDir,
            'supplier-processing-multi-select-selected-desktop.png'
          ),
        })

        await page.setViewportSize({ width: 720, height: 900 })
        await page.waitForTimeout(180)
        const narrowMetrics = await readLayout()
        assertLayout(narrowMetrics, '供应商多选窄屏态')
        await modal.screenshot({
          path: path.join(
            outputDir,
            'supplier-processing-multi-select-layout-narrow.png'
          ),
        })
        await closeBusinessFormModal(page, modal)
      },
    },
  ]
}
