import { readFileSync } from 'node:fs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

const PNG = readFileSync(
  new URL(
    '../../../scripts/qa/fixtures/manual-acceptance-image.png',
    import.meta.url
  )
).toString('base64')
const LONG_NAME = `${'客户确认包装唛头与交付资料'.repeat(12)}.pdf`

async function expandInlineAttachments(container) {
  const toggle = container.getByRole('button', {
    name: /(展开|收起)附件$/u,
  })
  await toggle.click({ trial: true })
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click()
  }
}

export function createBusinessAttachmentScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  const managerScenarios = [
    { key: 'desktop', themeMode: 'light', width: 1440 },
    { key: 'dark', themeMode: 'dark', width: 1440 },
    { key: 'narrow', themeMode: 'light', width: 390 },
    { key: 'small', themeMode: 'light', width: 320 },
    { key: 'readonly', themeMode: 'light', width: 1440, readonly: true },
  ].map(({ key, themeMode, width, readonly = false }) => {
    let files = []
    let calls = []
    let failList = false
    let releaseUpload
    let holdUpload = false
    const row = (id, file_name, mime_type, extra = {}) => ({
      id,
      file_name,
      mime_type,
      file_size: 1024,
      owner_type: 'workflow_task',
      owner_id: 9101,
      attachment_type: 'evidence',
      uploaded_by: 1,
      uploaded_by_username: 'demo_boss',
      created_at: 1_800_000_000,
      content_base64: mime_type === 'image/png' ? PNG : 'c3R5bGUtbDE=',
      ...extra,
    })
    return {
      name: `business-attachment-manager-${key}`,
      path: '/erp/warehouse/shipping-release',
      auth: 'admin',
      themeMode,
      effectiveSession: readonly
        ? {
            ...customerRuntimeEffectiveSession,
            actions: customerRuntimeEffectiveSession.actions.filter(
              (action) => action !== 'workflow.task.update'
            ),
          }
        : customerRuntimeEffectiveSession,
      viewport: { width, height: 900 },
      workflowTaskFixtures: [
        {
          id: 9101,
          task_code: 'style-l1-attachment-review',
          task_group: 'shipment_finance_approval',
          task_name: '附件交互验收',
          source_type: 'shipment',
          source_id: 501,
          source_no: 'SHIP-ATTACHMENT-L1',
          task_status_key: 'ready',
          owner_role_key: 'finance',
          required_capability_key: 'workflow.task.approve',
          process_instance_id: 701,
          process_node_instance_id: 702,
          process_definition_revision_id: 703,
          version: 2,
          payload: { approval_scope: 'shipment_finance_release' },
        },
      ],
      beforeNavigate: async (page) => {
        files = [
          row(11, '产品正面图.png', 'image/png'),
          row(12, LONG_NAME, 'application/pdf'),
          row(13, '旧版说明.txt', 'text/plain', {
            withdrawn_at: 1_800_000_100,
            withdrawn_by_username: 'demo_boss',
            withdrawal_reason: '版本错误',
          }),
        ]
        calls = []
        failList = false
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data = {}
          let code = 0
          if (method === 'list_attachments') {
            if (failList) {
              code = 50000
              failList = false
            } else {
              data = {
                attachments: files.map(
                  ({ content_base64: _content, ...file }) => file
                ),
              }
            }
          } else if (method === 'download_attachment') {
            const file = files.find((item) => item.id === params.id)
            assert(file && !file.withdrawn_at, '不可读取已撤销的附件内容')
            data = { attachment: file }
          } else if (method === 'upload_attachment') {
            calls.push(params.file_name)
            assert.equal(params.expected_version, 2, '任务上传仍传入真实版本')
            if (holdUpload) {
              await new Promise((resolve) => {
                releaseUpload = resolve
              })
            }
            if (
              params.file_name === '失败后重试.txt' &&
              calls.filter((name) => name === params.file_name).length === 1
            ) {
              code = 40010
            } else {
              const saved = row(
                100 + files.length,
                params.file_name,
                params.mime_type,
                params
              )
              files.push(saved)
              data = { attachment: saved }
              if (params.file_name === '结果待确认.txt') code = 50000
            }
          } else if (method === 'withdraw_attachment') {
            assert.equal(params.expected_version, 2)
            assert(params.reason.trim().length > 0)
            const file = files.find((item) => item.id === params.id)
            Object.assign(file, {
              withdrawn_at: 1_800_000_200,
              withdrawn_by_username: 'demo_boss',
              withdrawal_reason: params.reason,
            })
            data = { attachment: file }
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
              result: { code, message: code ? '模拟附件处理失败' : 'OK', data },
            }),
          })
        })
      },
      verify: async (page) => {
        await page
          .getByText('style-l1-attachment-review', { exact: true })
          .first()
          .click()
        const openManager = async () => {
          let trigger = page.locator(
            '[data-business-action-key="workflow-task-attachments"]:visible'
          )
          if (!(await trigger.count())) {
            await page.getByRole('button', { name: /^更多操作，共/u }).click()
            trigger = page.locator(
              '[data-business-action-key="workflow-task-attachments"]:visible'
            )
          }
          await trigger.click()
          const dialog = page.getByRole('dialog', {
            name: '任务附件',
            exact: true,
          })
          await dialog.waitFor()
          await dialog.getByText('产品正面图.png', { exact: true }).waitFor()
          await waitForFiniteAnimations(page)
          return dialog
        }
        const modal = await openManager()
        const panel = modal.locator('.business-attachment-panel')
        const geometry = async () => {
          await waitForFiniteAnimations(page)
          const metrics = await panel.evaluate((node) => {
            const modal = node.closest('.ant-modal')
            const footer = node
              .querySelector('.business-attachment-panel__footer')
              .getBoundingClientRect()
            const body = modal
              .querySelector('.ant-modal-body')
              .getBoundingClientRect()
            const toolbar = node.querySelector(
              '.business-attachment-panel__toolbar'
            )
            const category = toolbar
              .querySelector('.erp-sliding-segmented')
              .getBoundingClientRect()
            const refresh = toolbar
              .querySelector('button')
              .getBoundingClientRect()
            const selection = node.querySelector(
              '.business-attachment-panel__upload-actions .ant-btn-primary'
            )
            return {
              width: modal.getBoundingClientRect().width,
              overflow: node.scrollWidth - node.clientWidth,
              bodyBottom: body.bottom,
              footerBottom: footer.bottom,
              footerTop: footer.top,
              viewport: innerHeight,
              toolbarOverflow: toolbar.scrollWidth - toolbar.clientWidth,
              categoryRight: category.right,
              categoryCenter: category.top + category.height / 2,
              refreshLeft: refresh.left,
              refreshCenter: refresh.top + refresh.height / 2,
              refreshHeight: refresh.height,
              selectionHeight: selection?.getBoundingClientRect().height || 0,
              dragHintVisible:
                node
                  .querySelector('.business-attachment-panel__drop-hint')
                  ?.getBoundingClientRect().height > 0,
            }
          })
          assert(
            metrics.width <= Math.min(780, width - 32) + 1,
            JSON.stringify(metrics)
          )
          assert(metrics.overflow <= 1, JSON.stringify(metrics))
          assert(
            metrics.toolbarOverflow <= 1 &&
              metrics.categoryRight <= metrics.refreshLeft + 1 &&
              Math.abs(metrics.categoryCenter - metrics.refreshCenter) <= 1,
            `分类与刷新应保持同一行且不重叠: ${JSON.stringify(metrics)}`
          )
          if (width <= 640) {
            assert(metrics.refreshHeight >= 44, JSON.stringify(metrics))
            if (!readonly) {
              assert(
                metrics.selectionHeight >= 44 && !metrics.dragHintVisible,
                JSON.stringify(metrics)
              )
            }
          } else if (!readonly) {
            assert(metrics.dragHintVisible, '电脑端保留拖拽提示')
          }
          assert(
            metrics.footerBottom <= metrics.bodyBottom + 1 &&
              metrics.footerTop >= 0 &&
              metrics.footerBottom < metrics.viewport,
            JSON.stringify(metrics)
          )
        }
        await geometry()
        await modal
          .locator('.business-attachment-panel__thumbnail img')
          .first()
          .waitFor()
        const withdrawn = modal
          .locator('.business-attachment-panel__row')
          .filter({ hasText: '旧版说明.txt' })
        assert.equal(
          await withdrawn.getByRole('button', { name: '下载附件' }).count(),
          0
        )
        assert.equal(
          await withdrawn.getByRole('button', { name: '预览附件' }).count(),
          0
        )
        const filename = modal.getByRole('button', {
          name: LONG_NAME,
          exact: true,
        })
        await filename.press('Enter')
        assert.equal(await filename.getAttribute('aria-expanded'), 'true')
        await geometry()
        await filename.press('Enter')
        if (key === 'desktop') {
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.business-attachment-panel .erp-sliding-segmented',
            1
          )
          assert.equal(
            await modal.locator('.business-attachment-panel__row').count(),
            1
          )
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.business-attachment-panel .erp-sliding-segmented',
            2,
            true
          )
        } else await modal.getByText('文件 2', { exact: true }).click()
        assert.equal(
          await modal.locator('.business-attachment-panel__row').count(),
          2
        )
        await modal.getByText('全部 3', { exact: true }).click()
        if (readonly) {
          assert.equal(await modal.locator('input[type="file"]').count(), 0)
          assert.equal(
            await modal.getByRole('button', { name: '撤销附件' }).count(),
            0
          )
        } else {
          assert.equal(
            await modal
              .getByRole('button', { name: '选择附件', exact: true })
              .count(),
            1
          )
        }
        await page.screenshot({
          path: path.join(outputDir, `attachment-manager-${key}.png`),
        })
        if (width <= 640) {
          files = []
          await modal
            .getByRole('button', { name: '刷新列表', exact: true })
            .click()
          await modal.getByText('暂无附件', { exact: true }).waitFor()
          await geometry()
          await modal.screenshot({
            path: path.join(outputDir, `attachment-manager-${key}-empty.png`),
          })
        }
        if (key !== 'desktop') {
          await modal.getByRole('button', { name: '完成', exact: true }).click()
          return
        }

        const imageRow = modal
          .locator('.business-attachment-panel__row')
          .filter({ hasText: '产品正面图.png' })
        await imageRow
          .locator('.business-attachment-panel__thumbnail img')
          .dispatchEvent('error')
        await imageRow
          .locator('.business-attachment-panel__thumbnail')
          .getByText('加载失败', { exact: true })
          .waitFor()
        const thumbnailFits = await imageRow
          .locator('.business-attachment-panel__thumbnail')
          .evaluate((box) => {
            const status = box
              .querySelector('.erp-image-placeholder')
              .getBoundingClientRect()
            const bounds = box.getBoundingClientRect()
            return (
              status.width <= bounds.width + 1 &&
              status.height <= bounds.height + 1
            )
          })
        assert(thumbnailFits, '缩略图错误提示不能被裁切')
        await imageRow.getByRole('button', { name: '预览附件' }).click()
        const preview = page.getByRole('dialog', {
          name: '产品正面图.png',
          exact: true,
        })
        await preview.locator('img').waitFor()
        assert(
          await preview
            .locator('img')
            .evaluate((img) => img.complete && img.naturalWidth > 1)
        )
        await preview.locator('.ant-modal-close').click()
        const originalContent = files.find(
          (item) => item.id === 11
        ).content_base64
        files.find((item) => item.id === 11).content_base64 = 'bm90LWFuLWltYWdl'
        await imageRow.getByRole('button', { name: '预览附件' }).click()
        await preview.getByText('图片加载失败', { exact: true }).waitFor()
        await preview.locator('.ant-modal-close').click()
        files.find((item) => item.id === 11).content_base64 = originalContent
        await imageRow.getByRole('button', { name: '预览附件' }).click()
        await preview.locator('img').waitFor()
        await preview.locator('.ant-modal-close').click()
        const download = page.waitForEvent('download')
        await imageRow.getByRole('button', { name: '下载附件' }).click()
        assert.equal((await download).suggestedFilename(), '产品正面图.png')
        await imageRow.getByRole('button', { name: '撤销附件' }).click()
        const withdrawDialog = page.getByRole('dialog', {
          name: '撤销附件',
          exact: true,
        })
        await withdrawDialog
          .getByRole('textbox', { name: '撤销原因' })
          .fill('上传了错误版本')
        await withdrawDialog
          .getByRole('button', { name: '确认撤销', exact: true })
          .click()
        await withdrawDialog.waitFor({ state: 'hidden' })
        assert.equal(
          await imageRow.getByRole('button', { name: '预览附件' }).count(),
          0
        )
        assert.equal(
          await imageRow.getByRole('button', { name: '下载附件' }).count(),
          0
        )
        assert(
          await imageRow.getByRole('button', { name: '撤销附件' }).isDisabled()
        )

        const input = modal.locator('input[type="file"]').first()
        const repeatedFile = {
          name: '重复选择.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('code,quantity\nA,1'),
        }
        const repeatedRows = modal
          .locator('.business-attachment-panel__row')
          .filter({ hasText: repeatedFile.name })
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          modal.getByRole('button', { name: '选择附件', exact: true }).click(),
        ])
        await chooser.setFiles([repeatedFile, repeatedFile])
        await repeatedRows.first().waitFor()
        assert.equal(await repeatedRows.count(), 1, '同一批重复文件只入队一次')
        await input.setInputFiles(repeatedFile)
        await page.getByText('已跳过 1 个重复文件', { exact: true }).waitFor()
        assert.equal(
          await repeatedRows.count(),
          1,
          '再次选择同一文件不能重复入队'
        )
        const repeatedTransfer = await page.evaluateHandle(() => {
          const data = new DataTransfer()
          data.items.add(
            new File(['code,quantity\nA,1'], '重复选择.csv', {
              type: 'text/csv',
            })
          )
          return data
        })
        await modal
          .locator('.business-attachment-panel__dropzone')
          .dispatchEvent('drop', { dataTransfer: repeatedTransfer })
        await repeatedTransfer.dispose()
        await page.getByText('已跳过 1 个重复文件', { exact: true }).waitFor()
        assert.equal(await repeatedRows.count(), 1, '拖入相同文件不能重复入队')
        await geometry()
        await page.screenshot({
          path: path.join(
            outputDir,
            'attachment-manager-duplicate-skipped.png'
          ),
        })
        await input.setInputFiles({
          ...repeatedFile,
          buffer: Buffer.from('code,quantity\nA,2'),
        })
        await modal
          .getByRole('button', { name: '上传 2 个文件', exact: true })
          .waitFor()
        assert.equal(
          await repeatedRows.count(),
          2,
          '同名同大小但内容不同的文件仍可加入'
        )
        await repeatedRows
          .last()
          .getByRole('button', { name: '移除待上传附件' })
          .click()
        await repeatedRows
          .getByRole('button', { name: '移除待上传附件' })
          .click()
        await input.setInputFiles(repeatedFile)
        await repeatedRows.waitFor()
        assert.equal(await repeatedRows.count(), 1, '移除后允许重新选择')
        await repeatedRows
          .getByRole('button', { name: '移除待上传附件' })
          .click()
        assert.equal(calls.length, 0, '队列去重不能触发上传')
        await input.setInputFiles([
          {
            name: '成功文件.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('success'),
          },
          {
            name: '失败后重试.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('retry'),
          },
          {
            name: '结果待确认.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('unknown'),
          },
        ])
        await modal.getByText('成功文件.txt', { exact: true }).waitFor()
        assert.equal(calls.length, 0, '选择文件不能立即上传')
        await modal.getByRole('button', { name: '完成', exact: true }).click()
        const closeDialog = page.getByRole('dialog', {
          name: '放弃未上传附件？',
          exact: true,
        })
        await closeDialog
          .getByRole('button', { name: '继续处理', exact: true })
          .click()
        assert.equal(
          await modal.locator('.business-attachment-panel__row').count(),
          6
        )
        holdUpload = true
        const started = page.waitForRequest(
          (request) =>
            request.url().endsWith('/rpc/attachment') &&
            request.postDataJSON()?.method === 'upload_attachment'
        )
        await modal
          .getByRole('button', { name: '上传 3 个文件', exact: true })
          .evaluate((button) => {
            button.click()
            button.click()
          })
        await started
        await modal.getByRole('button', { name: '完成', exact: true }).waitFor()
        assert(
          await modal
            .getByRole('button', { name: '完成', exact: true })
            .isDisabled()
        )
        assert(
          await modal
            .getByRole('button', { name: '移除待上传附件' })
            .first()
            .isDisabled()
        )
        assert.equal(await modal.locator('.ant-modal-close').count(), 0)
        holdUpload = false
        releaseUpload()
        const retryDialog = page.getByRole('dialog', {
          name: '部分附件上传失败',
          exact: true,
        })
        await retryDialog.waitFor()
        assert.deepEqual(calls, [
          '成功文件.txt',
          '失败后重试.txt',
          '结果待确认.txt',
        ])
        await retryDialog
          .getByRole('button', { name: '重试失败项（1）', exact: true })
          .evaluate((button) => {
            button.click()
            button.click()
          })
        await retryDialog
          .getByRole('button', { name: '重试失败项（0）', exact: true })
          .waitFor()
        assert.deepEqual(calls, [
          '成功文件.txt',
          '失败后重试.txt',
          '结果待确认.txt',
          '失败后重试.txt',
        ])
        await retryDialog
          .getByRole('button', { name: '稍后核对', exact: true })
          .click()
        const uncertain = modal
          .locator('.business-attachment-panel__row')
          .filter({ hasText: '结果待确认.txt' })
          .filter({ hasText: '结果待确认' })
          .last()
        assert.equal(
          await uncertain.getByRole('button', { name: /^重试附件/u }).count(),
          0
        )
        await input.setInputFiles({
          name: '结果待确认.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('unknown'),
        })
        await page.getByText('已跳过 1 个重复文件', { exact: true }).waitFor()
        assert.equal(
          await modal.getByRole('button', { name: '移除待上传附件' }).count(),
          1,
          '再次选择不能把结果待确认的附件变成新的待上传项'
        )
        failList = true
        await modal
          .getByRole('button', { name: '刷新列表', exact: true })
          .click()
        await modal.getByText('附件列表加载失败', { exact: true }).waitFor()
        assert.equal(
          await modal.getByText('暂无附件', { exact: true }).count(),
          0
        )
        await modal
          .getByRole('button', { name: '重试加载', exact: true })
          .click()
        await modal
          .getByText('附件列表加载失败', { exact: true })
          .waitFor({ state: 'hidden' })
        assert.equal(calls.length, 4, '刷新核对不会重复写入')
        await uncertain.getByRole('button', { name: '移除待上传附件' }).click()
        await geometry()
        await page.screenshot({
          path: path.join(outputDir, 'attachment-manager-recovered.png'),
        })

        files = []
        await modal
          .getByRole('button', { name: '刷新列表', exact: true })
          .click()
        await modal.getByText('暂无附件', { exact: true }).waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'attachment-manager-empty.png'),
        })
        const transfer = await page.evaluateHandle(() => {
          const data = new DataTransfer()
          data.items.add(
            new File(['dropped'], '拖拽文件.txt', { type: 'text/plain' })
          )
          return data
        })
        await modal
          .locator('.business-attachment-panel__dropzone')
          .dispatchEvent('drop', { dataTransfer: transfer })
        await transfer.dispose()
        await modal.getByText('拖拽文件.txt', { exact: true }).waitFor()
        assert.equal(calls.length, 4)
        await modal.getByRole('button', { name: '完成', exact: true }).click()
        await page
          .getByRole('dialog', { name: '放弃未上传附件？', exact: true })
          .getByRole('button', { name: '放弃并关闭', exact: true })
          .click()
        await modal.waitFor({ state: 'hidden' })
      },
    }
  })

  let releaseFormUpload
  let releaseOldList
  let holdList = false
  let uploaded = []
  const formBusyScenario = {
    name: 'business-attachment-form-busy',
    path: '/erp/sales/project-orders/sales-orders',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      uploaded = []
      holdList = false
      await page.route('**/rpc/attachment', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        let data
        if (method === 'list_attachments') {
          if (holdList) {
            await new Promise((resolve) => {
              releaseOldList = resolve
            })
          }
          data = { attachments: uploaded }
        } else if (method === 'upload_attachment') {
          await new Promise((resolve) => {
            releaseFormUpload = resolve
          })
          uploaded.push({
            ...params,
            id: 5501,
            uploaded_by_username: 'demo_boss',
            created_at: 1_800_000_000,
          })
          data = { attachment: uploaded[0] }
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
    },
    verify: async (page) => {
      await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
      const edit = page
        .locator('button:visible')
        .filter({ hasText: '编辑订单' })
        .first()
      if (!(await edit.count())) {
        await page.getByRole('button', { name: /^更多操作，共/u }).click()
      }
      await edit.click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      const panel = editor.locator('.business-attachment-panel')
      const theme = await page.locator('html').getAttribute('data-erp-theme')
      await panel.screenshot({
        path: path.join(outputDir, `attachment-summary-${theme}-collapsed.png`),
      })
      await expandInlineAttachments(editor)
      const summary = editor.locator(
        '.business-attachment-panel__compact-summary'
      )
      await panel.screenshot({
        path: path.join(outputDir, `attachment-summary-${theme}-expanded.png`),
      })
      await editor
        .getByText(/单个文件不超过\s*100 MB/u, { exact: false })
        .waitFor()
      const input = editor
        .locator('.business-attachment-panel input[type="file"]')
        .first()
      await input.setInputFiles({
        name: 'unsupported.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('unsupported'),
      })
      await input.evaluate((element) => {
        const oversized = new File(['oversized'], 'oversized.txt', {
          type: 'text/plain',
        })
        Object.defineProperty(oversized, 'size', {
          value: 100 * 1024 * 1024 + 1,
        })
        const transfer = new DataTransfer()
        transfer.items.add(oversized)
        element.files = transfer.files
        element.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await page
        .getByText('oversized.txt 超过 100MB，请压缩后再上传', {
          exact: true,
        })
        .waitFor()
      assert.equal(
        await editor.locator('.business-attachment-panel__row').count(),
        0,
        '格式与大小校验阻止无效文件入队'
      )
      await input.setInputFiles({
        name: '原5MB边界已放行.txt',
        mimeType: 'text/plain',
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      })
      const legacyBoundaryRow = editor
        .locator('.business-attachment-panel__row')
        .filter({ hasText: '原5MB边界已放行.txt' })
      await legacyBoundaryRow.waitFor()
      assert(await summary.isDisabled(), '待处理文件存在时保持展开')
      assert.equal(await summary.getAttribute('aria-expanded'), 'true')
      await legacyBoundaryRow
        .getByRole('button', { name: '移除待上传附件' })
        .click()
      assert.equal(
        await summary.isDisabled(),
        false,
        '移除待处理文件后恢复收起'
      )
      assert.equal(
        await summary.getAttribute('aria-expanded'),
        'true',
        '文件行操作不收起附件'
      )
      await input.setInputFiles({
        name: '表单上传.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('form upload'),
      })
      await editor.getByText('表单上传.txt', { exact: true }).waitFor()
      const request = page.waitForRequest(
        (req) =>
          req.url().endsWith('/rpc/attachment') &&
          req.postDataJSON()?.method === 'upload_attachment'
      )
      await editor
        .getByRole('button', { name: '上传 1 个文件', exact: true })
        .click()
      await request
      await editor.getByText('正在处理附件…', { exact: true }).waitFor()
      assert(await summary.isDisabled(), '上传中不能收起附件')
      assert.equal(await summary.getAttribute('aria-expanded'), 'true')
      assert(
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .isDisabled()
      )
      assert(
        await editor
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .isDisabled()
      )
      const blockedUnload = await page.evaluate(
        () =>
          !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
      )
      assert(blockedUnload, '上传中页面刷新仍有离开保护')
      releaseFormUpload()
      await editor.getByText('已上传', { exact: true }).waitFor()
      assert.equal(await summary.isDisabled(), false, '上传结束后恢复收起')
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await editor.waitFor({ state: 'hidden' })
      assert.equal(uploaded.length, 1)
      await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
      if (!(await edit.count())) {
        await page.getByRole('button', { name: /^更多操作，共/u }).click()
      }
      await edit.click()
      await editor.waitFor({ state: 'visible' })
      await expandInlineAttachments(editor)
      holdList = true
      const oldListStarted = page.waitForRequest(
        (request) =>
          request.url().endsWith('/rpc/attachment') &&
          request.postDataJSON()?.method === 'list_attachments'
      )
      await editor
        .getByRole('button', { name: '刷新列表', exact: true })
        .click()
      await oldListStarted
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await editor.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: /新建订单$/u }).click()
      await editor
        .getByRole('heading', { name: '新建销售订单', exact: true })
        .waitFor()
      const nextPanel = editor.locator('.business-attachment-panel')
      await expandInlineAttachments(nextPanel)
      await nextPanel
        .getByText('暂无附件，可先选择后随保存上传', { exact: true })
        .waitFor()
      assert.equal(
        await nextPanel.locator('.ant-spin-spinning').count(),
        0,
        '切换到新建记录要结束上一条记录的加载态'
      )
      holdList = false
      releaseOldList()
      await page.waitForLoadState('networkidle')
      assert.equal(
        await nextPanel.getByText('表单上传.txt', { exact: true }).count(),
        0,
        '旧记录的延迟响应不能覆盖新建记录'
      )
    },
  }
  let delayNextDraftList = false
  let failNextList = false
  let releaseDelayedList
  const ownerLifecycleScenario = {
    name: 'business-attachment-bom-owner-lifecycle',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      delayNextDraftList = false
      failNextList = false
      releaseDelayedList = null
      await page.route('**/rpc/attachment', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (
          method !== 'list_attachments' ||
          params.owner_type !== 'bom_header'
        ) {
          await route.fallback()
          return
        }
        const code = failNextList ? 50000 : 0
        failNextList = false
        if (delayNextDraftList && params.owner_id === 2) {
          delayNextDraftList = false
          await new Promise((resolve) => {
            releaseDelayedList = resolve
          })
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              code,
              message: code ? '模拟附件加载失败' : 'OK',
              data: {
                attachments: code
                  ? []
                  : [
                      {
                        id: 6000 + params.owner_id,
                        owner_type: 'bom_header',
                        owner_id: params.owner_id,
                        file_name:
                          params.owner_id === 2
                            ? '草稿工艺说明.txt'
                            : '生效版工艺说明.txt',
                        mime_type: 'text/plain',
                        file_size: 1024,
                        attachment_type: 'evidence',
                        uploaded_by_username: 'demo_boss',
                        created_at: 1_800_000_000,
                      },
                    ],
              },
            },
          }),
        })
      })
    },
    verify: async (page) => {
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      const panel = editor.getByRole('region', {
        name: 'BOM 附件',
        exact: true,
      })
      const assertSettled = async () => {
        await panel
          .locator('[aria-label="附件列表"][aria-busy="false"]')
          .waitFor({ state: 'attached' })
        assert.equal(await panel.locator('.ant-spin-spinning').count(), 0)
        assert.equal(
          await panel.locator('.ant-btn-loading').count(),
          0,
          '请求结束后附件列表和刷新按钮都退出加载状态'
        )
      }
      const closeEditor = async () => {
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })
      }
      await page.getByTitle('BOM-STYLE-DRAFT', { exact: true }).dblclick()
      await editor
        .getByRole('heading', { name: '编辑 BOM 草稿', exact: true })
        .waitFor()
      await expandInlineAttachments(panel)
      await panel
        .getByText('草稿工艺说明.txt', { exact: true })
        .waitFor({ timeout: 5000 })
      await assertSettled()
      await panel.screenshot({
        path: path.join(outputDir, 'attachment-bom-draft-loaded.png'),
      })
      await closeEditor()
      await page.getByRole('button', { name: /新建草稿$/u }).click()
      await expandInlineAttachments(panel)
      await panel
        .getByText('暂无附件，可先选择后随保存上传', { exact: true })
        .waitFor()
      await assertSettled()
      await closeEditor()
      await page.getByTitle('BOM-STYLE-DRAFT', { exact: true }).dblclick()
      await expandInlineAttachments(panel)
      await panel.getByText('草稿工艺说明.txt', { exact: true }).waitFor()
      await assertSettled()

      delayNextDraftList = true
      try {
        await Promise.all([
          page.waitForRequest(
            (request) => {
              if (!request.url().endsWith('/rpc/attachment')) return false
              const { method, params } = request.postDataJSON()
              return method === 'list_attachments' && params?.owner_id === 2
            },
            { timeout: 5000 }
          ),
          panel.getByRole('button', { name: '刷新列表', exact: true }).click(),
        ])
        await closeEditor()
        failNextList = true
        await page.getByTitle('BOM-STYLE-L1', { exact: true }).dblclick()
        await editor
          .getByRole('heading', { name: '查看 BOM 版本', exact: true })
          .waitFor()
        await panel.getByText('附件列表加载失败', { exact: true }).waitFor()
        assert(
          await panel
            .locator('.business-attachment-panel__compact-summary')
            .isDisabled()
        )
        assert.equal(
          await panel
            .locator('.business-attachment-panel__compact-summary')
            .getAttribute('aria-expanded'),
          'true'
        )
        await assertSettled()
        await panel
          .getByRole('button', { name: '重试加载', exact: true })
          .click()
        await panel.getByText('生效版工艺说明.txt', { exact: true }).waitFor()
        await assertSettled()
        releaseDelayedList()
        await page.waitForLoadState('networkidle')
        await panel.getByText('生效版工艺说明.txt', { exact: true }).waitFor()
        assert.equal(
          await panel.getByText('草稿工艺说明.txt', { exact: true }).count(),
          0
        )
        await assertSettled()
        await panel.screenshot({
          path: path.join(outputDir, 'attachment-bom-loaded.png'),
        })
      } finally {
        releaseDelayedList?.()
      }
    },
  }
  let recoverOrderAttachments = false
  const orderAttachmentRecoveryScenario = {
    name: 'sales-order-attachment-read-recovery',
    path: '/erp/sales/project-orders/sales-orders',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      recoverOrderAttachments = false
      await page.route('**/rpc/sales_order', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_sales_order_items') return route.fallback()
        const line = {
          id: 1,
          sales_order_id: 1,
          line_no: 1,
          product_id: 1,
          product_sku_id: 1,
          product_code_snapshot: 'PROD-STYLE-L1',
          product_name_snapshot: '样式产品',
          sku_code_snapshot: 'SKU-STYLE-L1',
          unit_id: 1,
          unit_name_snapshot: '只',
          ordered_quantity: '10',
          unit_price: '12.50',
          amount: '125.00',
          line_status: 'open',
          import_source: {
            file_name: '模拟订单.xlsx',
            sheet_name: '订单',
            row_number: 2,
            cells: [{ column: 'A', label: '设计师', value: '模拟设计师' }],
            image_files: ['模拟产品.png'],
          },
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              code: 0,
              data: {
                sales_order_items: [line],
                total: 1,
                source_version: 1,
                limit: Number(params.limit || 50),
                offset: Number(params.offset || 0),
              },
            },
          }),
        })
      })
      await page.route('**/rpc/attachment', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        const attachment = {
          id: 8822,
          owner_type: 'sales_order',
          owner_id: 1,
          file_name: '模拟产品.png',
          mime_type: 'image/png',
          content_base64: PNG,
        }
        let data
        if (
          method === 'list_attachments' &&
          params.owner_type === 'sales_order'
        ) {
          data = recoverOrderAttachments ? { attachments: [attachment] } : {}
        } else if (
          method === 'download_attachment' &&
          params.id === attachment.id
        ) {
          data = { attachment }
        } else {
          return route.fallback()
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { code: 0, data },
          }),
        })
      })
    },
    verify: async (page) => {
      await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
      const editAction = page
        .locator('[data-business-action-key="edit"]:visible')
        .first()
      if ((await editAction.count()) === 0) {
        await page.getByRole('button', { name: /^更多操作，共/u }).click()
      }
      await page
        .locator('[data-business-action-key="edit"]:visible')
        .first()
        .click()
      const editor = page
        .locator('.erp-business-form-page:not([hidden])')
        .filter({ hasText: '编辑销售订单' })
        .last()
      await editor.getByText('订单附件加载失败', { exact: true }).waitFor()
      const errorLayout = await editor
        .locator('.ant-alert')
        .filter({ hasText: '订单附件加载失败' })
        .evaluate((node) => {
          const alert = node.getBoundingClientRect()
          const parent = node.parentElement.getBoundingClientRect()
          const style = getComputedStyle(node.parentElement)
          return {
            alertWidth: alert.width,
            parentWidth: parent.width,
            display: style.display,
            columns: style.gridTemplateColumns,
          }
        })
      assert(
        errorLayout.alertWidth >= errorLayout.parentWidth - 2,
        JSON.stringify(errorLayout)
      )
      const sourceButton = editor.getByRole('button', {
        name: '核对原表：订单 第 2 行',
        exact: true,
      })
      await sourceButton.click()
      const evidence = page.locator('.ant-popover:not(.ant-popover-hidden)')
      await evidence
        .getByText('订单附件加载失败，请重试读取附件', { exact: true })
        .waitFor()
      assert.equal(
        await evidence.getByText('原表无可读取图片', { exact: true }).count(),
        0
      )
      await sourceButton.click()
      await editor.screenshot({
        path: path.join(outputDir, 'sales-order-attachment-read-failed.png'),
      })
      recoverOrderAttachments = true
      await editor
        .getByRole('button', { name: '重试读取附件', exact: true })
        .click()
      await editor
        .getByText('订单附件加载失败', { exact: true })
        .waitFor({ state: 'hidden' })
      await sourceButton.click()
      await evidence.locator('img[alt="订单产品原表图片"]').waitFor()
      await page.setViewportSize({ width: 390, height: 844 })
      const bounds = await evidence.evaluate((node) => ({
        width: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }))
      assert(bounds.scrollWidth <= bounds.width + 1, JSON.stringify(bounds))
      await page.setViewportSize({ width: 1440, height: 900 })
      await sourceButton.click()
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await editor.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: /新建订单/u }).click()
      const newEditor = page
        .locator('.erp-business-form-page:not([hidden])')
        .filter({ hasText: '新建销售订单' })
        .last()
      await newEditor.waitFor()
      assert.equal(
        await newEditor
          .getByRole('button', { name: '重试读取附件', exact: true })
          .count(),
        0
      )
    },
  }
  return [
    ...managerScenarios,
    formBusyScenario,
    {
      ...formBusyScenario,
      name: 'business-attachment-form-busy-dark',
      themeMode: 'dark',
    },
    ownerLifecycleScenario,
    orderAttachmentRecoveryScenario,
  ]
}
