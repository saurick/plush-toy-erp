import { readFile, writeFile } from 'node:fs/promises'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { BOM_IMPORT_EXAMPLE_CONTEXT, BOM_IMPORT_EXAMPLE_FILENAME, BOM_IMPORT_EXAMPLE_MATERIALS, BOM_IMPORT_EXAMPLE_ROWS } from '../../src/erp/data/bomImportFormat.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

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
                data: stylePaginatedRpcData([
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
                  ], 'units', body.params),
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
        const unitSelect = modal.locator('.ant-select:has(#default_unit_id)')
        await weightInput.fill('500')
        await unitSelect.locator('.ant-select-clear').click()
        assert.equal(await weightInput.inputValue(), '', '清空默认单位也清除依赖单重')
        await unitSelect.getByText('请选择默认单位', { exact: true }).waitFor()
        await modal.locator('.ant-form-item-explain-error').filter({ hasText: '请选择默认单位' }).waitFor()
        await modal.locator('#default_unit_id').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: '千克' }).click()
        await modal.locator('.ant-form-item-explain-error').filter({ hasText: '请选择默认单位' }).waitFor({ state: 'hidden' })
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
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page.getByRole('menuitem', { name: /从 Excel 新建/u }).click(),
        ])
        await chooser.setFiles({
          name: 'BOM-IMPORT-STYLE-L1.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createBOMImportWorkbookFixture(),
        })
        const preview = page.getByRole('dialog', { name: '从 Excel 新建 BOM', exact: true })
        await preview.waitFor({ state: 'visible' })
        assert.equal(rpcMutations.length, 0, '文件预览不得写入业务数据')
        await preview.getByRole('button', { name: '带入并核对', exact: true }).click()

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
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '样式材料' }).first().click()
        await modal
          .locator('.erp-bom-material-group')
          .first()
          .locator('.erp-bom-material-cell .ant-select-selection-item')
          .filter({ hasText: '样式材料' })
          .waitFor({ state: 'visible' })
        await modal.locator('.erp-bom-import-review[data-bom-import-issue-count="0"]').waitFor({ state: 'visible' })
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
        await expectText(page, 'BOM 草稿已保存，尚未启用')
        assert.deepEqual(
          rpcMutations.map((item) => item.method),
          ['save_bom_with_items'],
          'BOM Excel 导入只能保存草稿，不得自动创建主数据或激活版本'
        )
        await assertNoHorizontalOverflow(page, 'bom-xlsx-import-draft-desktop')
      },
    },
    {
      name: 'bom-xlsx-import-editor-desktop',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        let saved
        await page.route('**/rpc/bom', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'save_bom_with_items') {
            saved = { ...body.params, id: 2, status: 'DRAFT', edit_version: 2 }
            await route.fallback()
            return
          }
          if (body.method !== 'get_bom_version' || !saved || Number(body.params.id) !== saved.id) { await route.fallback(); return }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: { bom_version: saved } } }) })
        })
      },
      verify: async (page) => {
        const writes = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/bom')) return
          const body = request.postDataJSON()
          if (/^(save_|copy_|activate_)/u.test(body?.method || '')) writes.push(body)
        })
        await page.getByRole('row').filter({ hasText: 'BOM-STYLE-DRAFT' }).getByRole('checkbox').check()
        await page.locator('button[data-business-action-key="edit"]').click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: '编辑 BOM 草稿 · 未生效', exact: true }).waitFor()
        await editor.getByLabel('BOM 版本', { exact: true }).fill('人工核对版')
        await editor.getByLabel('订单数量', { exact: true }).fill('50')
        await editor.getByLabel('来源订单号', { exact: true }).fill('KEEP-ORDER-50')
        await editor.getByLabel('制表人', { exact: true }).fill('保留制表人')
        const parts = editor.locator('tr[data-bom-part-index]')
        assert.equal(await parts.count(), 3)
        const openPreview = async () => {
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click(),
          ])
          await chooser.setFiles({ name: 'BOM-EDITOR-L1.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture() })
          const preview = page.getByRole('dialog', { name: '导入材料明细', exact: true })
          await preview.waitFor({ state: 'visible' })
          return preview
        }
        const cancelled = await openPreview()
        await cancelled.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(await parts.count(), 3, '取消预览应保留原有明细')
        const append = await openPreview()
        await append.getByText('保留当前订单数量 50（原表 100），总用量按当前数量计算。', { exact: true }).waitFor()
        for (const width of [1024, 390]) {
          await page.setViewportSize({ width, height: 900 })
          const metrics = await append.evaluate((node) => {
            const box = node.getBoundingClientRect()
            return { left: box.left, right: box.right, viewport: window.innerWidth }
          })
          assert(metrics.left >= 0 && metrics.right <= metrics.viewport, `导入预览应收口在 ${width}px 视口内：${JSON.stringify(metrics)}`)
          await assertNoHorizontalOverflow(page, `bom-import-preview-${width}`)
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await append.getByRole('button', { name: '追加 2 个部位', exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-business-form-page:not([hidden]) tr[data-bom-part-index]').length === 5)
        assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '50')
        await editor.getByText('保留当前订单数量 50（原表 100），总用量按当前数量计算。', { exact: true }).waitFor()
        assert.equal(await editor.getByLabel('来源订单号', { exact: true }).inputValue(), 'KEEP-ORDER-50')
        assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), '人工核对版')
        assert.equal(await editor.getByLabel('制表人', { exact: true }).inputValue(), '保留制表人')
        assert.equal(writes.length, 0, '预览和带入不得提前保存')
        await editor.getByRole('button', { name: '撤销本次导入', exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-business-form-page:not([hidden]) tr[data-bom-part-index]').length === 3)
        const replace = await openPreview()
        await replace.getByRole('radio', { name: '替换现有 3 个部位', exact: true }).check()
        await replace.getByText('确认后将替换当前草稿明细，保存前可撤销本次导入。', { exact: true }).waitFor()
        await replace.getByRole('button', { name: '替换并带入 2 个部位', exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-business-form-page:not([hidden]) tr[data-bom-part-index]').length === 2)
        await editor.getByRole('button', { name: '撤销本次导入', exact: true }).waitFor()
        const material = parts.nth(1).locator('.erp-bom-material-cell .ant-select').first()
        await material.click()
        await material.locator('input').fill('MAT-STYLE-L1')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '样式材料' }).first().click()
        await editor.locator('.erp-bom-import-review[data-bom-import-issue-count="0"]').waitFor()
        assert.equal(await editor.getByRole('button', { name: '撤销本次导入', exact: true }).count(), 0, '人工改动后不能用旧快照覆盖新修改')
        await page.screenshot({ path: path.join(outputDir, 'bom-xlsx-import-editor-replaced.png'), fullPage: true })
        const saveRequest = page.waitForRequest((request) => request.url().includes('/rpc/bom') && request.postDataJSON()?.method === 'save_bom_with_items')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
        const saved = (await saveRequest).postDataJSON().params
        assert.equal(saved.id, 2)
        assert(saved.expected_version, '已有草稿导入必须沿用并发版本检查')
        assert.equal(saved.product_id, 1)
        assert.equal(saved.version, '人工核对版')
        assert.equal(saved.quantity_text, '50')
        assert.equal(saved.source_order_no, 'KEEP-ORDER-50')
        assert.equal(saved.maker, '保留制表人')
        assert.equal(saved.items.length, 2)
        assert(saved.items.every((item) => !item.id && !item._import_source), '新导入行不能继承旧行身份或提交页面校对元数据')
        assert(saved.items.every((item) => !item.total_usage_snapshot), '不同订单数量不能保留原表总用量快照')
        assert.deepEqual(writes.map((write) => write.method), ['save_bom_with_items'])
        await editor.waitFor({ state: 'hidden' })
        await page.getByRole('row').filter({ hasText: saved.version }).getByRole('checkbox').uncheck()
        await page.getByRole('row').filter({ hasText: 'BOM-STYLE-L1' }).getByRole('checkbox').check()
        await page.locator('button[data-business-action-key="view"]').click()
        await editor.getByRole('heading', { name: '查看 BOM 版本 · 已启用 · 只读', exact: true }).waitFor()
        assert.equal(await editor.getByRole('button', { name: '从 Excel 导入', exact: true }).count(), 0)
        await assertNoHorizontalOverflow(page, 'bom-xlsx-import-editor-desktop')
      },
    },
    {
      name: 'bom-excel-source-precision-roundtrip',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        let stored
        let missingSourceOnce = true
        await page.route('**/rpc/bom', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'list_bom_versions' && stored) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: stylePaginatedRpcData([stored], 'bom_versions', body.params) } }) })
            return
          }
          if (body.method === 'save_bom_with_items') {
            stored = { ...body.params, id: 901, status: 'DRAFT', edit_version: (stored?.edit_version || 0) + 1, print_date: Date.parse('2026-01-19T00:00:00Z') / 1000, items: body.params.items.map((item, index) => ({ ...item, id: 910 + index })) }
          } else if (body.method !== 'get_bom_version' || !stored || body.params.id !== stored.id) { await route.fallback(); return }
          const readback = body.method === 'get_bom_version' && missingSourceOnce ? { ...stored, items: stored.items.map((item) => ({ ...item, source_snapshot: null })) } : stored
          if (body.method === 'get_bom_version') missingSourceOnce = false
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: { bom_version: readback } } }) })
        })
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON()
          let data
          if (body.method === 'list_units') data = stylePaginatedRpcData([{ id: 1, code: 'PCS', name: '个', is_active: true }], 'units', body.params)
          else if (body.method === 'list_products') data = stylePaginatedRpcData([{ id: 1, code: 'PROD-STYLE-L1', name: '样式产品', is_active: true }], 'products', body.params)
          else if (body.method === 'list_materials') data = stylePaginatedRpcData([{ id: 1, code: 'MAT-STYLE-L1', name: '样式材料', supplier_item_no: '示例织造AB-001#-02#米白', default_unit_id: 1, is_active: true }], 'materials', body.params)
          else { await route.fallback(); return }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data } }) })
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /从 Excel 新建/u }).click()])
        await chooser.setFiles({ name: '高精度示例.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture({ highPrecision: true }) })
        const preview = page.getByRole('dialog', { name: '从 Excel 新建 BOM', exact: true })
        await preview.getByRole('columnheader', { name: '总用量 含损耗10%', exact: true }).waitFor()
        assert.equal(await preview.getByRole('columnheader', { name: '损耗 %', exact: true }).count(), 0)
        await preview.getByText('0.012', { exact: true }).waitFor()
        await preview.getByText('1.36', { exact: true }).waitFor()
        assert.equal(await preview.getByText(/按六位小数/u).count(), 0)
        await preview.getByRole('button', { name: '带入并核对', exact: true }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click({ trial: true })
        await editor.getByLabel('BOM 版本', { exact: true }).fill('SOURCE-PRECISION')
        await editor.getByText(/原表总用量表头 2 行/u).waitFor()
        const quantity = editor.getByLabel('单位用量 1', { exact: true })
        assert.equal(await quantity.inputValue(), '0.012')
        await quantity.focus()
        assert.equal(await quantity.inputValue(), '0.0123456789012345')
        await quantity.press('Tab')
        assert.equal(await quantity.inputValue(), '0.012')
        await editor.getByRole('button', { name: '查看单位用量原值 1', exact: true }).click()
        const popover = page.locator('.ant-popover:visible')
        await popover.getByText('0.0123456789012345', { exact: true }).waitFor()
        assert.equal(await popover.getByText('0.012346', { exact: true }).count(), 0)
        await editor.getByRole('button', { name: '查看单位用量原值 1', exact: true }).click()
        const total = editor.locator('tr[data-bom-part-index="0"] .erp-bom-number-cell')
        await total.getByText('1.36', { exact: true }).waitFor()
        const firstSave = page.waitForRequest((request) => request.url().endsWith('/rpc/bom') && request.postDataJSON()?.method === 'save_bom_with_items')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
        assert.equal((await firstSave).postDataJSON().params.id, undefined)
        await editor.getByText('草稿已保存，但原表数据尚未完整读回，请保留当前内容并重试。', { exact: true }).waitFor()
        assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), 'SOURCE-PRECISION')
        const retrySave = page.waitForRequest((request) => request.url().endsWith('/rpc/bom') && request.postDataJSON()?.method === 'save_bom_with_items')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
        const { params } = (await retrySave).postDataJSON()
        assert.equal(params.id, 901, '回读失败重试必须更新已保存草稿，不能重复新建')
        assert.equal(params.expected_version, 1)
        assert.equal(params.items[0].quantity, '0.0123456789012345')
        assert.equal(params.items[0].source_snapshot.quantity_value, '0.0123456789012345')
        assert.equal(params.items[0].source_snapshot.quantity_format, '0.000')
        assert.equal(params.items[0].source_snapshot.loss_source, 'header')
        assert.equal(params.items[0].total_usage_snapshot, '1.358024679135795')
        await editor.waitFor({ state: 'hidden' })
        await writeFile(path.join(outputDir, 'bom-source-precision-save.json'), JSON.stringify(params, null, 2))
        await page.getByRole('row').filter({ hasText: 'SOURCE-PRECISION' }).getByRole('checkbox').check()
        await page.locator('button[data-business-action-key="view"]').click()
        await editor.getByRole('heading', { name: /^查看 BOM 版本.*只读$/u }).waitFor()
        assert.equal(await editor.getByRole('button', { name: '保存草稿', exact: true }).count(), 0)
        const sourceInfo = editor.getByRole('button', { name: '查看单位用量原值 1', exact: true })
        assert.equal(await sourceInfo.isEnabled(), true, '只读仍可核对来源数值')
        await sourceInfo.click()
        await page.locator('.ant-popover:visible').getByText('0.0123456789012345', { exact: true }).waitFor()
        await sourceInfo.click()
      },
    },
    {
      name: 'bom-excel-format-example-roundtrip',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        let saved
        await page.route('**/rpc/bom', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'save_bom_with_items') {
            saved = { ...body.params, id: 2, status: 'DRAFT', edit_version: 2, items: body.params.items }
            await route.fallback()
            return
          }
          if (body.method !== 'get_bom_version' || !saved || Number(body.params.id) !== saved.id) { await route.fallback(); return }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: { bom_version: saved } } }) })
        })
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON()
          let data
          if (body.method === 'list_units') data = stylePaginatedRpcData([{ id: 7, code: 'YD', name: '码', is_active: true }, { id: 8, code: 'KG', name: '千克', is_active: true }], 'units', body.params)
          else if (body.method === 'list_products') data = stylePaginatedRpcData([{ id: 1, code: BOM_IMPORT_EXAMPLE_CONTEXT.code, name: BOM_IMPORT_EXAMPLE_CONTEXT.name, is_active: true }], 'products', body.params)
          else if (body.method === 'list_materials') {
            const catalog = BOM_IMPORT_EXAMPLE_MATERIALS.map((row, index) => ({ id: 101 + index, code: `MAT-EXAMPLE-${index + 1}`, name: row.materialName, supplier_item_no: row.supplierItemNo, default_unit_id: 7 + index, is_active: true }))
            const ids = body.params?.ids
            const keyword = String(body.params?.keyword || '')
            const rows = catalog.filter((row) => (!ids || ids.includes(row.id)) && (!keyword || `${row.code} ${row.name}`.includes(keyword)))
            data = stylePaginatedRpcData(rows, 'materials', body.params)
          }
          else { await route.fallback(); return }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data } }) })
        })
      },
      verify: async (page) => {
        const writes = []
        page.on('request', (request) => {
          if (request.url().includes('/rpc/bom') && request.postDataJSON()?.method === 'save_bom_with_items') writes.push(request.postDataJSON())
        })
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        await page.getByRole('menuitem', { name: '查看 Excel 格式', exact: true }).click()
        await page.getByRole('dialog', { name: 'Excel 格式说明', exact: true }).getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByRole('button', { name: '新建 BOM' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click({ trial: true })
        await editor.getByLabel('BOM 版本', { exact: true }).fill('EXAMPLE-ROUNDTRIP')
        assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '')
        const product = editor.locator('input#product_id')
        await product.click()
        await product.fill(BOM_IMPORT_EXAMPLE_CONTEXT.code)
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: BOM_IMPORT_EXAMPLE_CONTEXT.name }).first().click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        await editor.getByRole('button', { name: '查看 Excel 格式', exact: true }).click()
        const format = page.getByRole('dialog', { name: 'Excel 格式说明', exact: true })
        await format.getByRole('img', { name: 'Excel 材料分析明细表示意图', exact: true }).waitFor()
        await page.waitForFunction(() => {
          const image = document.querySelector('.erp-bom-excel-guide__preview > img')
          return image?.complete && image.naturalWidth > 0
        })
        await format.getByText(/无需重排/u).waitFor()
        await format.getByText(/可保留汇总/u).waitFor()
        await format.getByText(/示例使用码／千克/u).waitFor()
        await format.getByText(/图片需另行添加为附件/u).waitFor()
        assert.equal(await format.getByRole('table').count(), 0, '图示应替代字段清单表')
        assert.equal(await format.locator('.erp-document-guide__parts li').count(), 3)
        for (const width of [1024, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await waitForFiniteAnimations(page)
          const box = await format.boundingBox()
          assert(box && box.x >= 0 && box.x + box.width <= width, `格式说明应在 ${width}px 内完整显示`)
          await assertNoHorizontalOverflow(page, `bom-excel-format-${width}`)
          const metrics = await format.evaluate((node) => {
            const figure = node.querySelector('.erp-document-guide__figure').getBoundingClientRect()
            const parts = node.querySelector('.erp-document-guide__parts').getBoundingClientRect()
            const image = node.querySelector('.erp-bom-excel-guide__preview').getBoundingClientRect()
            const markers = [...node.querySelectorAll('.erp-bom-excel-guide__marker')].map((marker) => {
              const rect = marker.getBoundingClientRect()
              return { number: marker.textContent.trim(), fits: rect.left >= image.left - 1 && rect.right <= image.right + 1 && rect.top >= image.top - 1 && rect.bottom <= image.bottom + 1 }
            })
            const download = node.querySelector('a[download]').getBoundingClientRect()
            return { sideBySide: parts.left >= figure.right, stacked: parts.top >= figure.bottom, markers, footerVisible: download.top >= 0 && download.bottom <= window.innerHeight }
          })
          assert.equal(width > 540 ? metrics.sideBySide : metrics.stacked, true, `图示与短说明应适应 ${width}px: ${JSON.stringify(metrics)}`)
          assert.deepEqual(metrics.markers.map((marker) => marker.number), ['1', '2', '3'])
          assert(metrics.markers.every((marker) => marker.fits), `区域编号应留在图示内: ${JSON.stringify(metrics)}`)
          assert(metrics.footerVisible, '窄屏下载和关闭操作应留在可见区域')
          if (width === 390) await page.screenshot({ path: path.join(outputDir, 'bom-excel-guide-390.png'), fullPage: true })
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, 'bom-excel-format-help.png'), fullPage: true })
        await format.screenshot({ path: path.join(outputDir, 'bom-excel-format-dialog.png') })
        const [download] = await Promise.all([page.waitForEvent('download'), format.getByRole('link', { name: '下载示例 Excel', exact: true }).click()])
        assert.equal(download.suggestedFilename(), BOM_IMPORT_EXAMPLE_FILENAME)
        const file = await download.path()
        assert(file, '示例应下载为实际文件')
        const bytes = await readFile(file)
        const bundled = await readFile(new URL('../../src/erp/data/bom-import-example.xlsx', import.meta.url))
        assert(bytes.equals(bundled), '下载内容应与解析器回归验证的示例完全相同')
        await format.press('Escape')
        await format.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent.includes('查看 Excel 格式'))
        assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), 'EXAMPLE-ROUNDTRIP')
        const preview = page.getByRole('dialog', { name: '导入材料明细', exact: true })
        const openDownloadedPreview = async () => {
          const [chooser] = await Promise.all([page.waitForEvent('filechooser'), editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click()])
          await chooser.setFiles({ name: download.suggestedFilename(), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes })
          await preview.waitFor({ state: 'visible' })
          await preview.getByText('同时带入原表订单数量 100。', { exact: true }).waitFor()
        }
        await openDownloadedPreview()
        await preview.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '')
        assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 0)
        await openDownloadedPreview()
        assert.equal(await preview.getByText('已匹配', { exact: true }).count(), 3)
        await preview.getByRole('button', { name: '带入并核对', exact: true }).click()
        await editor.locator('.erp-bom-import-review[data-bom-import-issue-count="0"]').waitFor()
        assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '100')
        await editor.locator('tr[data-bom-part-index="0"] .erp-bom-number-cell').getByText('44.10', { exact: true }).waitFor()
        await editor.getByRole('button', { name: '撤销本次导入', exact: true }).click()
        assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '')
        assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 0)
        assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), 'EXAMPLE-ROUNDTRIP')
        await openDownloadedPreview()
        await preview.getByRole('button', { name: '带入并核对', exact: true }).click()
        await editor.getByLabel('订单数量', { exact: true }).fill('')
        await editor.getByText('请填写订单数量（原表 100），以计算总用量。', { exact: true }).waitFor()
        assert.equal(await editor.getByRole('button', { name: '撤销本次导入', exact: true }).count(), 0)
        await editor.locator('tr[data-bom-part-index="0"] .erp-bom-number-cell').getByText('—', { exact: true }).waitFor()
        await editor.getByLabel('订单数量', { exact: true }).fill('100')
        await editor.locator('tr[data-bom-part-index="0"] .erp-bom-number-cell').getByText('44.10', { exact: true }).waitFor()
        assert.equal(await editor.getByText('请填写订单数量（原表 100），以计算总用量。', { exact: true }).count(), 0)
        assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 3)
        assert.equal(await editor.locator('.erp-bom-material-group').count(), 2, '原表合并的材料应保留为两个分组、三个部位')
        assert.equal(writes.length, 0, '格式说明、下载和带入不得写入草稿')
        for (const [partIndex, code] of [[0, 'MAT-EXAMPLE-1'], [2, 'MAT-EXAMPLE-2']]) {
          const control = editor.locator(`tr[data-bom-part-index="${partIndex}"] .erp-bom-material-cell .ant-select`).first()
          await control.click()
          const searched = page.waitForResponse((response) => {
            if (!response.url().includes('/rpc/masterdata')) return false
            const body = response.request().postDataJSON()
            return body?.method === 'list_materials' && body.params?.keyword === code
          })
          await control.locator('input').fill(code)
          await searched
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: code }).click()
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        await page.waitForFunction(() => {
          const editor = document.querySelector('.erp-business-form-page:not([hidden])')
          return ['示例短毛绒', '示例填充棉'].every((name, index) => editor?.querySelector(`tr[data-bom-part-index="${index ? 2 : 0}"] .erp-bom-material-cell .ant-select-selection-item`)?.textContent.includes(name))
        })
        const save = page.waitForRequest((request) => request.url().includes('/rpc/bom') && request.postDataJSON()?.method === 'save_bom_with_items')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
        const { params } = (await save).postDataJSON()
        assert.equal(params.product_id, 1)
        assert.equal(params.version, 'EXAMPLE-ROUNDTRIP')
        assert.equal(params.quantity_text, '100')
        assert.deepEqual(params.items.map((item) => item.material_id), [101, 101, 102])
        assert.deepEqual(params.items.map((item) => item.unit_id), [7, 7, 8])
        assert.deepEqual(params.items.map((item) => item.quantity), BOM_IMPORT_EXAMPLE_ROWS.map((row) => String(row.quantity)))
        assert.deepEqual(params.items.map((item) => item.loss_rate), ['0.05', '0.05', '0'])
        assert(params.items.every((item) => !item.total_usage_snapshot), '人工改过订单数量后不恢复旧的适用总量快照')
        assert.deepEqual(params.items.map((item) => item.source_snapshot.total_value), ['44.1', '8.4', '18'])
        assert.deepEqual(params.items.map((item) => item.process_base || ''), ['贴衬', '贴衬', ''])
        assert.deepEqual(params.items.map((item) => item.process_method), ['热裁', '热裁', '充棉'])
        await writeFile(path.join(outputDir, 'bom-example-save-request.json'), JSON.stringify(params, null, 2))
        await writeFile(path.join(outputDir, 'bom-example-downloaded.xlsx'), bytes)
        await editor.waitFor({ state: 'hidden' })
        assert.equal(writes.length, 1)
        await page.getByRole('row').filter({ hasText: params.version }).getByRole('checkbox').check()
        await page.locator('button[data-business-action-key="view"]').click()
        await editor.getByRole('heading', { name: /^查看 BOM 版本.*只读$/u }).waitFor()
        assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '100')
        await editor.locator('tr[data-bom-part-index="0"] .erp-bom-number-cell').getByText('44.10', { exact: true }).waitFor()
      },
    },
    {
      name: 'bom-excel-format-guide-dark',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 1024, height: 900 },
      verify: async (page) => {
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        await page.getByRole('menuitem', { name: '查看 Excel 格式', exact: true }).click()
        const format = page.getByRole('dialog', { name: 'Excel 格式说明', exact: true })
        await format.getByRole('img', { name: 'Excel 材料分析明细表示意图', exact: true }).waitFor()
        await page.waitForFunction(() => document.querySelector('.erp-bom-excel-guide__preview > img')?.naturalWidth > 0)
        await waitForFiniteAnimations(page)
        assert.equal(await page.evaluate(() => document.documentElement.dataset.erpTheme), 'dark')
        assert.equal(await format.locator('.erp-document-guide__parts li').count(), 3)
        await assertNoHorizontalOverflow(page, 'bom-excel-format-guide-dark')
        await format.screenshot({ path: path.join(outputDir, 'bom-excel-guide-dark.png') })
        await format.getByRole('button', { name: '关闭', exact: true }).click()
      },
    },
    {
      name: 'bom-excel-format-guide-image-failure',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1024, height: 900 },
      expectedConsoleErrorPatterns: [/Failed to load resource:.*net::ERR_FAILED.*bom-import-example-preview/u],
      beforeNavigate: async (page) => {
        await page.route('**/*bom-import-example-preview*', (route) => route.abort())
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        await page.getByRole('menuitem', { name: '查看 Excel 格式', exact: true }).click()
        const format = page.getByRole('dialog', { name: 'Excel 格式说明', exact: true })
        await format.getByText('图片加载失败', { exact: true }).waitFor()
        assert.equal(await format.locator('.erp-bom-excel-guide__marker:visible').count(), 0, '图片失败时不保留失去对应区域的编号')
        assert.equal(await format.locator('.erp-document-guide__parts li').count(), 3)
        const [download] = await Promise.all([page.waitForEvent('download'), format.getByRole('link', { name: '下载示例 Excel', exact: true }).click()])
        assert.equal(download.suggestedFilename(), BOM_IMPORT_EXAMPLE_FILENAME)
        assert((await readFile(await download.path())).length > 0)
        await assertNoHorizontalOverflow(page, 'bom-excel-format-guide-image-failure')
        await format.getByRole('button', { name: '关闭', exact: true }).click()
      },
    },
    {
      name: 'dev-ui-design-bom-import-entry',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        await page.getByRole('button', { name: /全屏预览/u }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('.nav-item[data-page="engineering-hub"]').click()
        const choose = async () => {
          await frame.getByLabel('更多新建方式', { exact: true }).click()
          await frame.getByRole('button', { name: '从 Excel 新建', exact: true }).click()
          return frame.getByRole('dialog', { name: '从 Excel 新建 BOM', exact: true })
        }
        const cancelled = await choose()
        await cancelled.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(await frame.locator('.form-view').count(), 0)
        const preview = await choose()
        await preview.getByRole('button', { name: '带入并核对', exact: true }).click()
        const editor = frame.locator('.form-view')
        const rows = editor.locator('#materials tbody tr')
        assert.equal(await rows.count(), 2)
        assert.equal(await editor.locator('.form-foot [data-action="bom-import"]').count(), 0)
        await editor.getByRole('button', { name: '查看 Excel 格式', exact: true }).click()
        const format = frame.getByRole('dialog', { name: 'Excel 格式说明', exact: true })
        await format.getByRole('img', { name: 'Excel 材料分析明细表示意图', exact: true }).waitFor()
        assert.equal(await format.locator('.bom-excel-guide-marker').count(), 3)
        assert.equal(await format.getByRole('table').count(), 0)
        const [download] = await Promise.all([page.waitForEvent('download'), format.getByRole('link', { name: '下载示例 Excel', exact: true }).click()])
        const downloaded = await readFile(await download.path())
        const expected = await readFile(new URL('../../src/erp/data/bom-import-example.xlsx', import.meta.url))
        assert(downloaded.equals(expected), '原型下载必须与正式页面使用同一份示例')
        await format.locator('.modal-foot').getByRole('button', { name: '关闭', exact: true }).click()
        assert.equal(await rows.count(), 2)
        await editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click()
        const details = frame.getByRole('dialog', { name: '导入材料明细', exact: true })
        await details.getByRole('button', { name: '追加 2 个部位', exact: true }).click()
        assert.equal(await rows.count(), 4)
        await editor.getByRole('button', { name: '撤销本次导入', exact: true }).click()
        assert.equal(await rows.count(), 2)
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
