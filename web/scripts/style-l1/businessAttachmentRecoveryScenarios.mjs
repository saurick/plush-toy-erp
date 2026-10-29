import { Buffer } from 'node:buffer'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export function createBusinessAttachmentRecoveryScenarios(deps) {
  const {
    assert,
    assertAntdModalCentered,
    closeBusinessFormModal,
    expectHeading,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  const { findSelectionActionButton } = createBusinessFormalAssertions(deps)
  return [
    (() => {
      const retryFileName = 'batch-needs-retry.txt'
      const pendingRetryFileName = 'pending-needs-retry.txt'
      const retryFileNames = new Set([retryFileName, pendingRetryFileName])
      let uploadCalls = []
      let uploadedAttachments = []
      let nextAttachmentID = 7000

      return {
        name: 'business-attachment-partial-failure-retry-desktop',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          uploadCalls = []
          uploadedAttachments = []
          nextAttachmentID = 7000
          await page.route('**/rpc/attachment', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'attachment-batch-retry', method, params = {} } = body
            let code = 0
            let message = 'OK'
            let data = {}

            if (method === 'list_attachments') {
              data = { attachments: uploadedAttachments }
            } else if (method === 'upload_attachment') {
              const fileName = String(params.file_name || '')
              const previousAttempts = uploadCalls.filter(
                (name) => name === fileName
              ).length
              uploadCalls.push(fileName)
              if (retryFileNames.has(fileName) && previousAttempts === 0) {
                code = 40010
                message = '当前附件上传失败，请重试'
              } else {
                nextAttachmentID += 1
                const attachment = {
                  id: nextAttachmentID,
                  owner_type: params.owner_type,
                  owner_id: Number(params.owner_id || 0),
                  attachment_type: params.attachment_type || 'evidence',
                  slot_key: params.slot_key || null,
                  file_name: fileName,
                  mime_type: params.mime_type || 'text/plain',
                  file_size: Number(params.file_size || 0),
                  sha256:
                    '0000000000000000000000000000000000000000000000000000000000000000',
                  uploaded_by: 1,
                  uploaded_by_username: 'demo_boss',
                  note: null,
                  withdrawn_at: null,
                  withdrawn_by: null,
                  withdrawn_by_username: null,
                  withdrawal_reason: null,
                  created_at: 1_750_000_000,
                }
                uploadedAttachments = [...uploadedAttachments, attachment]
                data = { attachment }
              }
            } else {
              code = 40010
              message = `附件批量重试场景不支持 ${String(method || '')}`
            }

            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code, message, data },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await expectText(page, 'SO-STYLE-L1')
          await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
          await (await findSelectionActionButton(page, '编辑订单')).click()
          const orderModal = page
            .locator('.erp-business-form-page:not([hidden])')
            .filter({ hasText: '编辑销售订单' })
            .last()
          await orderModal.waitFor({ state: 'visible', timeout: 10_000 })

          const attachmentInput = orderModal
            .locator('.business-attachment-panel input[type="file"]')
            .first()
          await attachmentInput.setInputFiles([
            {
              name: 'batch-success-a.txt',
              mimeType: 'text/plain',
              buffer: Buffer.from('batch-success-a'),
            },
            {
              name: retryFileName,
              mimeType: 'text/plain',
              buffer: Buffer.from('batch-needs-retry'),
            },
            {
              name: 'batch-success-c.txt',
              mimeType: 'text/plain',
              buffer: Buffer.from('batch-success-c'),
            },
          ])
          assert.equal(uploadCalls.length, 0, '选择文件只进入待上传队列')
          await orderModal
            .getByRole('button', { name: '上传 3 个文件', exact: true })
            .click()

          const retryModal = page
            .getByRole('dialog', {
              name: '部分附件上传失败',
              exact: true,
            })
            .last()
          await retryModal.waitFor({ state: 'visible', timeout: 10_000 })
          await assertAntdModalCentered(
            page,
            retryModal,
            'business-attachment-partial-failure-retry-desktop'
          )
          assert.deepEqual(
            uploadCalls,
            ['batch-success-a.txt', retryFileName, 'batch-success-c.txt'],
            '首轮必须尝试全部附件，不能在单个失败后提前停止'
          )
          const retryMetrics = await retryModal.evaluate((node) => ({
            text: String(node.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            overflowX: node.scrollWidth - node.clientWidth,
            retryButtons: Array.from(node.querySelectorAll('button')).filter(
              (button) =>
                String(button.textContent || '').replace(/\s+/gu, '') ===
                '重试失败项（1）'
            ).length,
          }))
          assert(
            retryMetrics.text.includes('本轮共 3 个附件') &&
              retryMetrics.text.includes('已成功 2 个') &&
              retryMetrics.text.includes('未完成 1 个') &&
              retryMetrics.text.includes(retryFileName) &&
              !retryMetrics.text.includes('batch-success-a.txt') &&
              !retryMetrics.text.includes('batch-success-c.txt'),
            `批量上传应逐项展示失败结果: ${JSON.stringify(retryMetrics)}`
          )
          assert.equal(
            retryMetrics.retryButtons,
            1,
            `部分失败弹窗应提供唯一失败项重试入口: ${JSON.stringify(
              retryMetrics
            )}`
          )
          assert(
            retryMetrics.overflowX <= 1,
            `部分失败弹窗不应横向溢出: ${JSON.stringify(retryMetrics)}`
          )
          await retryModal.screenshot({
            path: path.join(
              outputDir,
              'business-attachment-partial-failure-retry-modal.png'
            ),
          })

          await retryModal
            .locator('button')
            .filter({ hasText: '重试失败项（1）' })
            .click()
          await retryModal.waitFor({ state: 'hidden', timeout: 10_000 })
          assert.deepEqual(
            uploadCalls,
            [
              'batch-success-a.txt',
              retryFileName,
              'batch-success-c.txt',
              retryFileName,
            ],
            '重试只能再次发送上一轮失败项，成功项不得重复上传'
          )
          for (const fileName of [
            'batch-success-a.txt',
            retryFileName,
            'batch-success-c.txt',
          ]) {
            await orderModal
              .getByText(fileName, { exact: true })
              .waitFor({ state: 'visible', timeout: 10_000 })
          }
          assert.equal(
            await orderModal.getByText('上传失败', { exact: true }).count(),
            0,
            '重试成功后不应残留失败项'
          )
          assert.equal(
            await orderModal.getByText('结果待确认', { exact: true }).count(),
            0,
            '明确失败重试成功后不应残留待确认状态'
          )
          const attachmentPanel = orderModal.locator(
            '.business-attachment-panel'
          )
          await attachmentPanel.scrollIntoViewIfNeeded()
          const recoveredMetrics = await attachmentPanel.evaluate((node) => ({
            text: String(node.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            overflowX: node.scrollWidth - node.clientWidth,
          }))
          assert(
            recoveredMetrics.overflowX <= 1,
            `重试恢复后的附件面板不应横向溢出: ${JSON.stringify(
              recoveredMetrics
            )}`
          )
          await attachmentPanel.screenshot({
            path: path.join(
              outputDir,
              'business-attachment-partial-failure-retry-recovered.png'
            ),
          })
          await closeBusinessFormModal(page, orderModal)

          await gotoScenarioPath(
            page,
            '/erp/master/products?catalog=product_skus',
            { waitUntil: 'domcontentloaded' }
          )
          await expectHeading(page, '产品档案')
          await page.getByRole('tab', { name: '产品规格' }).waitFor()
          await page.getByRole('button', { name: '新建产品规格' }).click()
          const newSKUProductModal = page
            .locator(
              '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
            )
            .filter({ hasText: '新建产品规格' })
            .last()
          await newSKUProductModal.waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          const productField = newSKUProductModal
            .locator('.ant-form-item')
            .filter({ hasText: '所属产品' })
            .first()
          await productField.locator('.ant-select').click()
          await page
            .locator(
              '.ant-select-dropdown:visible .ant-select-item-option-content'
            )
            .filter({ hasText: 'PROD-STYLE-L1' })
            .first()
            .click()

          const pendingAttachmentInput = newSKUProductModal
            .locator('.business-attachment-panel input[type="file"]')
            .first()
          await pendingAttachmentInput.setInputFiles([
            {
              name: 'pending-success-a.txt',
              mimeType: 'text/plain',
              buffer: Buffer.from('pending-success-a'),
            },
            {
              name: pendingRetryFileName,
              mimeType: 'text/plain',
              buffer: Buffer.from('pending-needs-retry'),
            },
            {
              name: 'pending-success-c.txt',
              mimeType: 'text/plain',
              buffer: Buffer.from('pending-success-c'),
            },
          ])
          await newSKUProductModal
            .getByText(pendingRetryFileName, { exact: true })
            .waitFor({ state: 'visible', timeout: 10_000 })
          assert.equal(
            await newSKUProductModal
              .getByText('保存后上传', { exact: true })
              .count(),
            3,
            '新建表单选择附件后必须先保持待保存状态'
          )

          const pendingUploadStart = uploadCalls.length
          await newSKUProductModal
            .locator('.erp-business-form-page__footer .ant-btn-primary')
            .click()
          const pendingRetryModal = page
            .getByRole('dialog', {
              name: '部分附件上传失败',
              exact: true,
            })
            .last()
          await pendingRetryModal.waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await assertAntdModalCentered(
            page,
            pendingRetryModal,
            'business-attachment-post-save-partial-failure-retry-desktop'
          )
          assert.deepEqual(
            uploadCalls.slice(pendingUploadStart),
            [
              'pending-success-a.txt',
              pendingRetryFileName,
              'pending-success-c.txt',
            ],
            '保存新记录后绑定附件也必须尝试完全部待上传文件'
          )
          await pendingRetryModal.screenshot({
            path: path.join(
              outputDir,
              'business-attachment-post-save-partial-failure-retry-modal.png'
            ),
          })
          await pendingRetryModal
            .locator('button')
            .filter({ hasText: '重试失败项（1）' })
            .click()
          await pendingRetryModal.waitFor({
            state: 'hidden',
            timeout: 10_000,
          })
          assert.deepEqual(
            uploadCalls.slice(pendingUploadStart),
            [
              'pending-success-a.txt',
              pendingRetryFileName,
              'pending-success-c.txt',
              pendingRetryFileName,
            ],
            '保存后重试只能再次绑定失败附件，成功附件不得重复发送'
          )
          await newSKUProductModal.waitFor({
            state: 'hidden',
            timeout: 10_000,
          })
          await expectText(page, '产品规格已保存')
        },
      }
    })(),
  ]
}
