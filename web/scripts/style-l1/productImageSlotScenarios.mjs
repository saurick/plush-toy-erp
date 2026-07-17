import { installAdminRpcMocks } from './adminRpcMocks.mjs'

const PRODUCT_IMAGE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function createDeferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function productImageAttachment(slotKey, id, fileName, nowUnix) {
  return {
    id,
    owner_type: 'product',
    owner_id: 1,
    attachment_type: 'product_image',
    slot_key: slotKey,
    file_name: fileName,
    mime_type: 'image/png',
    file_size: 68,
    sha256: `${id}`.padStart(64, '0'),
    uploaded_by: 1,
    note: null,
    created_at: nowUnix,
  }
}

function createProductImageMockState() {
  const nowUnix = Math.floor(Date.now() / 1000)
  return {
    nextID: 103,
    calls: [],
    nextWriteGate: null,
    attachments: [
      productImageAttachment('primary', 101, '产品主图.png', nowUnix),
      productImageAttachment('secondary', 102, '产品辅图.png', nowUnix),
    ],
  }
}

async function installProductImageAttachmentMocks(page, state) {
  await page.route('**/rpc/attachment', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'product-image-style-l1', method, params = {} } = body
    const isProductRequest =
      (method === 'list_attachments' && params.owner_type === 'product') ||
      (method === 'upload_attachment' && params.owner_type === 'product') ||
      method === 'clear_product_image' ||
      (method === 'download_attachment' &&
        state.attachments.some(
          (attachment) => attachment.id === Number(params.id || 0)
        ))
    if (!isProductRequest) {
      await route.fallback()
      return
    }

    state.calls.push({ method, params: { ...params } })
    if (
      state.nextWriteGate &&
      ['upload_attachment', 'clear_product_image'].includes(method)
    ) {
      const writeGate = state.nextWriteGate
      state.nextWriteGate = null
      await writeGate.promise
    }
    let data = {}
    if (method === 'list_attachments') {
      data = { attachments: state.attachments.map((item) => ({ ...item })) }
    } else if (method === 'upload_attachment') {
      const attachment = productImageAttachment(
        params.slot_key,
        state.nextID,
        params.file_name,
        Math.floor(Date.now() / 1000)
      )
      state.nextID += 1
      attachment.mime_type = params.mime_type
      attachment.file_size = Number(params.file_size || 0)
      state.attachments = [
        attachment,
        ...state.attachments.filter(
          (item) => item.slot_key !== params.slot_key
        ),
      ]
      data = { attachment }
    } else if (method === 'clear_product_image') {
      state.attachments = state.attachments.filter(
        (item) => item.slot_key !== params.slot_key
      )
      data = { cleared: true }
    } else if (method === 'download_attachment') {
      data = {
        attachment: {
          ...state.attachments.find(
            (item) => item.id === Number(params.id || 0)
          ),
          content_base64: PRODUCT_IMAGE_PNG_BASE64,
        },
      }
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
}

async function openProductEditModal(page, assert) {
  const productRow = page
    .locator('.ant-table-row')
    .filter({ hasText: 'PROD-STYLE-L1' })
  await productRow.waitFor()
  assert.equal(await productRow.count(), 1, '产品列表应有且仅有一条目标记录')
  await productRow.dblclick()
  const modal = page.locator(
    '.erp-business-action-modal--form.ant-modal:visible'
  )
  await modal.waitFor()
  await modal.getByText('产品图 1（主图）', { exact: true }).waitFor()
  await modal.getByText('产品图 2（辅图）', { exact: true }).waitFor()
  return modal
}

async function readProductImageSlotMetrics(modal) {
  return modal.locator('.product-image-slots').evaluate((section) => {
    const cards = Array.from(section.querySelectorAll('.product-image-slot'))
    const effectiveImageCount = cards.filter((card) => {
      const placeholder = card.querySelector('.product-image-slot__placeholder')
      return (
        Boolean(card.querySelector('img')) ||
        String(placeholder?.textContent || '').includes('已设置图片')
      )
    }).length
    const grid = section.querySelector('.product-image-slots__grid')
    const gridStyle = grid ? window.getComputedStyle(grid) : null
    return {
      cardCount: cards.length,
      effectiveImageCount,
      sectionClientWidth: section.clientWidth,
      sectionScrollWidth: section.scrollWidth,
      gridTemplateColumns: gridStyle?.gridTemplateColumns || '',
      cardLefts: cards.map((card) =>
        Math.round(card.getBoundingClientRect().x)
      ),
      cardWidths: cards.map((card) =>
        Math.round(card.getBoundingClientRect().width)
      ),
    }
  })
}

export function createProductImageSlotScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    closeBusinessFormModal,
    customerRuntimeEffectiveSession,
    expectHeading,
    outputDir,
    path,
  } = deps

  let desktopState = createProductImageMockState()
  let mobileState = createProductImageMockState()
  let bomPrintState = createProductImageMockState()

  return [
    {
      name: 'product-image-slots-desktop',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        desktopState = createProductImageMockState()
        await installProductImageAttachmentMocks(page, desktopState)
      },
      verify: async (page) => {
        await expectHeading(page, '产品档案')
        let modal = await openProductEditModal(page, assert)
        await modal.getByText('产品主图.png', { exact: true }).waitFor()
        await modal.getByText('产品辅图.png', { exact: true }).waitFor()

        let metrics = await readProductImageSlotMetrics(modal)
        assert.equal(metrics.cardCount, 2, '产品编辑应固定显示两个图片槽')
        assert.equal(
          metrics.effectiveImageCount,
          2,
          '首次编辑应读取两张已保存产品图'
        )
        assert(
          metrics.sectionScrollWidth <= metrics.sectionClientWidth + 1,
          `桌面产品图片槽不应横向溢出: ${JSON.stringify(metrics)}`
        )

        const primarySlot = modal
          .locator('.product-image-slot')
          .filter({ hasText: '产品图 1（主图）' })
        const secondarySlot = modal
          .locator('.product-image-slot')
          .filter({ hasText: '产品图 2（辅图）' })
        await primarySlot.getByRole('button', { name: '清空' }).click()
        metrics = await readProductImageSlotMetrics(modal)
        assert.equal(metrics.effectiveImageCount, 1, '清空主图后应保留一张辅图')
        await secondarySlot.getByRole('button', { name: '清空' }).click()
        metrics = await readProductImageSlotMetrics(modal)
        assert.equal(metrics.effectiveImageCount, 0, '两个槽均可暂存为空')
        await primarySlot.getByRole('button', { name: '撤销清空' }).click()
        metrics = await readProductImageSlotMetrics(modal)
        assert.equal(metrics.effectiveImageCount, 1, '主图可恢复到已保存状态')
        await secondarySlot.getByRole('button', { name: '撤销清空' }).click()
        metrics = await readProductImageSlotMetrics(modal)
        assert.equal(
          metrics.effectiveImageCount,
          2,
          '两个槽均可恢复到已保存状态'
        )

        await primarySlot.locator('input[type="file"]').setInputFiles({
          name: '待取消主图.png',
          mimeType: 'image/png',
          buffer: Buffer.from(PRODUCT_IMAGE_PNG_BASE64, 'base64'),
        })
        await primarySlot.getByText('保存产品后替换', { exact: true }).waitFor()
        await modal.screenshot({
          path: path.join(outputDir, 'product-image-slots-desktop-pending.png'),
        })
        assert.equal(
          desktopState.calls.filter((call) =>
            ['upload_attachment', 'clear_product_image'].includes(call.method)
          ).length,
          0,
          '选择或清空图片时不得提前写附件接口'
        )
        await closeBusinessFormModal(page, modal)
        assert.equal(
          desktopState.calls.filter((call) =>
            ['upload_attachment', 'clear_product_image'].includes(call.method)
          ).length,
          0,
          '取消产品编辑不得上传或清空产品图'
        )

        modal = await openProductEditModal(page, assert)
        await modal.getByText('产品主图.png', { exact: true }).waitFor()
        const savePrimarySlot = modal
          .locator('.product-image-slot')
          .filter({ hasText: '产品图 1（主图）' })
        const saveSecondarySlot = modal
          .locator('.product-image-slot')
          .filter({ hasText: '产品图 2（辅图）' })
        await savePrimarySlot.locator('input[type="file"]').setInputFiles({
          name: '新主图.png',
          mimeType: 'image/png',
          buffer: Buffer.from(PRODUCT_IMAGE_PNG_BASE64, 'base64'),
        })
        await savePrimarySlot
          .getByText('保存产品后替换', { exact: true })
          .waitFor()
        await saveSecondarySlot.getByRole('button', { name: '清空' }).click()
        const writeGate = createDeferred()
        desktopState.nextWriteGate = writeGate
        try {
          await modal
            .locator('.ant-modal-footer .ant-btn-primary')
            .click({ force: true })
          for (
            let attempt = 0;
            desktopState.nextWriteGate && attempt < 100;
            attempt += 1
          ) {
            await page.waitForTimeout(20)
          }
          assert.equal(
            desktopState.nextWriteGate,
            null,
            '产品保存应进入受控的产品图写入请求'
          )
          await page.waitForTimeout(50)
          const savingModalState = await page.evaluate(() => {
            const currentModal = Array.from(
              document.querySelectorAll(
                '.erp-business-action-modal--form.ant-modal'
              )
            ).find((element) => element.getBoundingClientRect().width > 0)
            const buttons = Array.from(
              currentModal?.querySelectorAll('.ant-modal-footer button') || []
            )
            const cancelButton = buttons.find(
              (button) => button.textContent?.replace(/\s+/g, '') === '取消'
            )
            const closeButton = currentModal?.querySelector('.ant-modal-close')
            return {
              visible: Boolean(currentModal),
              buttonTexts: buttons.map((button) => button.textContent?.trim()),
              cancelDisabled: Boolean(cancelButton?.disabled),
              closeVisible: Boolean(
                closeButton && closeButton.getBoundingClientRect().width > 0
              ),
            }
          })
          assert(
            savingModalState.visible && savingModalState.cancelDisabled,
            `产品与图片保存期间应禁用取消按钮: ${JSON.stringify(savingModalState)}`
          )
          assert(
            !savingModalState.closeVisible,
            `产品与图片保存期间不应显示关闭按钮: ${JSON.stringify(savingModalState)}`
          )
          await page.keyboard.press('Escape')
          await page.waitForTimeout(50)
          assert(
            await modal.isVisible(),
            '产品与图片保存期间，取消按钮、关闭按钮和 ESC 都不得关闭弹窗'
          )
        } finally {
          writeGate.resolve()
        }
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })

        const writeCalls = desktopState.calls.filter((call) =>
          ['upload_attachment', 'clear_product_image'].includes(call.method)
        )
        assert.deepEqual(
          writeCalls.map(({ method, params }) => ({
            method,
            owner_type: params.owner_type,
            attachment_type: params.attachment_type,
            owner_id: params.owner_id,
            slot_key: params.slot_key,
          })),
          [
            {
              method: 'upload_attachment',
              owner_type: 'product',
              attachment_type: 'product_image',
              owner_id: 1,
              slot_key: 'primary',
            },
            {
              method: 'clear_product_image',
              owner_type: undefined,
              attachment_type: undefined,
              owner_id: 1,
              slot_key: 'secondary',
            },
          ],
          '保存产品后才应按固定槽写入主图并清空辅图'
        )
        await assertNoHorizontalOverflow(page, 'product-image-slots-desktop')
      },
    },
    {
      name: 'product-image-slots-mobile',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        mobileState = createProductImageMockState()
        await installProductImageAttachmentMocks(page, mobileState)
      },
      verify: async (page) => {
        await expectHeading(page, '产品档案')
        const modal = await openProductEditModal(page, assert)
        await modal.getByText('产品主图.png', { exact: true }).waitFor()
        const metrics = await readProductImageSlotMetrics(modal)
        assert.equal(metrics.cardCount, 2, '移动端仍应保留两个固定图片槽')
        assert.equal(
          metrics.effectiveImageCount,
          2,
          '移动端应读取两张已保存产品图'
        )
        assert.equal(
          new Set(metrics.cardLefts).size,
          1,
          `移动端两个图片槽应为单列布局: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.sectionScrollWidth <= metrics.sectionClientWidth + 1,
          `移动端产品图片槽不应横向溢出: ${JSON.stringify(metrics)}`
        )
        await modal.screenshot({
          path: path.join(outputDir, 'product-image-slots-mobile.png'),
        })
        await assertNoHorizontalOverflow(page, 'product-image-slots-mobile')
        await closeBusinessFormModal(page, modal)
      },
    },
    {
      name: 'product-image-bom-print-snapshot',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        bomPrintState = createProductImageMockState()
        await installProductImageAttachmentMocks(page, bomPrintState)
      },
      verify: async (page) => {
        await expectHeading(page, '物料清单（BOM）')
        const bomRow = page
          .locator('.ant-table-row')
          .filter({ hasText: 'BOM-STYLE-L1' })
          .first()
        await bomRow.waitFor()
        await bomRow.locator('input[type="checkbox"]').check({ force: true })

        const printButton = page.getByRole('button', {
          name: '打印物料明细',
        })
        await printButton.waitFor()
        assert.equal(
          await printButton.isDisabled(),
          false,
          '选中 BOM 且拥有打印权限时应允许生成物料明细草稿'
        )

        const [popup] = await Promise.all([
          page.waitForEvent('popup', { timeout: 10_000 }),
          printButton.click(),
        ])
        await installAdminRpcMocks(popup, {
          baseURL: new URL(page.url()).origin,
        })
        try {
          await popup.waitForLoadState('domcontentloaded')
          const paper = popup.locator('.erp-material-detail-paper')
          await paper.waitFor({ state: 'visible', timeout: 15_000 })
          const imageSlots = paper.locator(
            '.erp-material-detail-paper__images .erp-engineering-print-image-slot'
          )
          assert.equal(
            await imageSlots.count(),
            2,
            '物料明细应保留两个产品图槽'
          )
          const productImages = imageSlots.locator('img')
          assert.equal(
            await productImages.count(),
            2,
            'BOM 打印草稿应显示产品主图和辅图快照'
          )
          for (let index = 0; index < 2; index += 1) {
            assert.match(
              (await productImages.nth(index).getAttribute('src')) || '',
              /^data:image\/png;base64,/u,
              `产品图 ${index + 1} 应已冻结为打印草稿 data URL`
            )
          }
          await popup.screenshot({
            path: path.join(outputDir, 'product-image-bom-print-paper.png'),
            fullPage: true,
          })
        } finally {
          if (!popup.isClosed()) {
            await popup.close()
          }
        }

        const readCalls = bomPrintState.calls.filter((call) =>
          ['list_attachments', 'download_attachment'].includes(call.method)
        )
        const listCalls = readCalls.filter(
          (call) => call.method === 'list_attachments'
        )
        assert.equal(
          listCalls.length,
          1,
          'BOM 打印应只读取一次关联产品图片列表'
        )
        assert.deepEqual(
          {
            owner_type: listCalls[0].params.owner_type,
            owner_id: listCalls[0].params.owner_id,
            attachment_type: listCalls[0].params.attachment_type,
          },
          {
            owner_type: 'product',
            owner_id: 1,
            attachment_type: 'product_image',
          },
          'BOM 打印必须按关联产品和产品图片类型读取'
        )
        assert.deepEqual(
          readCalls
            .filter((call) => call.method === 'download_attachment')
            .map((call) => Number(call.params.id || 0))
            .sort((left, right) => left - right),
          [101, 102],
          'BOM 打印应下载两个固定产品图片槽并冻结为草稿快照'
        )
        await assertNoHorizontalOverflow(
          page,
          'product-image-bom-print-snapshot'
        )
      },
    },
  ]
}
