export function createBusinessRowItemsPreviewScenarios(deps) {
  const {
    assert,
    assertDarkThemeContrast,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
    outputDir,
    path,
  } = deps

  return [
    (() => {
      let itemReadCalls = 0
      let itemReadParams = []
      return {
        name: 'business-row-items-source-document-cache-desktop',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          itemReadCalls = 0
          itemReadParams = []
          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method === 'list_sales_order_items') {
              itemReadCalls += 1
              itemReadParams.push(body.params || {})
            }
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await expectText(page, 'SO-STYLE-L1')
          const row = page
            .getByRole('row')
            .filter({ has: page.getByText('SO-STYLE-L1', { exact: true }) })
            .first()
          const selection = row.locator('input[type="radio"]')
          assert.equal(await selection.isChecked(), false)
          assert.equal(itemReadCalls, 0, '列表加载不得预取销售订单明细')

          const expand = row.getByRole('button', {
            name: '展开SO-STYLE-L1明细',
          })
          await expand.click()
          await page
            .locator('.erp-business-row-items-preview')
            .waitFor({ state: 'visible', timeout: 10_000 })
          await expectText(page, '已显示 1 / 1 条')
          assert.equal(itemReadCalls, 1)
          assert.deepEqual(itemReadParams, [
            { sales_order_id: 1, limit: 5, offset: 0 },
          ])
          assert.equal(await selection.isChecked(), false)
          assert.equal(
            await row
              .getAttribute('class')
              .then((value) =>
                String(value).includes('ant-table-row-selected')
              ),
            false
          )
          const collapse = row.getByRole('button', {
            name: '收起SO-STYLE-L1明细',
          })
          assert.equal(await collapse.getAttribute('aria-expanded'), 'true')

          await collapse.click()
          await row.getByRole('button', { name: '展开SO-STYLE-L1明细' }).focus()
          await page.keyboard.press('Enter')
          await page
            .locator('.erp-business-row-items-preview')
            .waitFor({ state: 'visible', timeout: 10_000 })
          assert.equal(itemReadCalls, 1, '同一 id + version 重复展开应命中缓存')
          assert.equal(await selection.isChecked(), false)
          await row.locator('.erp-business-row-expand-button').dblclick()
          assert.equal(
            await page.locator('.ant-modal:visible').count(),
            0,
            '双击明细箭头不得触发行双击编辑'
          )
          assert.equal(itemReadCalls, 1, '双击展开按钮也应复用明细缓存')
          assert.equal(await selection.isChecked(), false)
          await assertNoHorizontalOverflow(
            page,
            'business-row-items-source-document-cache-desktop'
          )
        },
      }
    })(),
    (() => {
      let detailReads = 0
      return {
        name: 'business-row-items-truncated-modal-desktop',
        path: '/erp/production/orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          detailReads = 0
          await page.route('**/rpc/production_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method === 'get_production_order') detailReads += 1
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '生产订单')
          await expectText(page, 'MO-STYLE-L1-20260713')
          const row = page
            .getByRole('row')
            .filter({
              has: page.getByText('MO-STYLE-L1-20260713', { exact: true }),
            })
            .first()
          const selection = row.locator('input[type="radio"]')
          assert.equal(await selection.isChecked(), false)
          await row
            .getByRole('button', {
              name: '展开MO-STYLE-L1-20260713明细',
            })
            .click()
          const preview = page.getByRole('region', { name: '明细快速预览' })
          await preview.waitFor({ state: 'visible', timeout: 10_000 })
          await expectText(page, '已显示 5 / 22 条')
          assert.equal(
            await preview.locator('.erp-business-row-item-card').count(),
            5
          )
          assert.equal(detailReads, 1)
          assert.equal(await selection.isChecked(), false)

          await preview.getByRole('button', { name: '查看全部' }).click()
          const modal = page.locator('.ant-modal:visible').filter({
            has: page.getByRole('region', { name: '完整明细' }),
          })
          await modal.waitFor({ state: 'visible', timeout: 10_000 })
          const fullItems = modal.getByRole('region', { name: '完整明细' })
          assert.equal(
            await fullItems.locator('.erp-business-row-item-card').count(),
            20
          )
          assert.equal(
            await modal
              .locator(
                'input:visible:not([disabled]), textarea:visible:not([disabled]), .ant-select:visible:not(.ant-select-disabled)'
              )
              .count(),
            0,
            '完整明细 Modal 必须保持只读'
          )
          assert.equal(
            await modal
              .getByRole('button', {
                name: /编辑|保存|提交|过账|入库|出货|取消单据/,
              })
              .count(),
            0,
            '完整明细 Modal 不得混入业务动作'
          )
          await modal.screenshot({
            path: path.join(
              outputDir,
              'business-row-items-truncated-modal-open.png'
            ),
          })
          await modal.locator('.ant-pagination-next button').click()
          assert.equal(
            await fullItems.locator('.erp-business-row-item-card').count(),
            2
          )
          await expectText(page, '第 21 行')
          await modal.locator('.ant-modal-close').click({ force: true })
          await modal.waitFor({ state: 'hidden', timeout: 10_000 })
          assert.equal(detailReads, 1, '查看全部应复用完整聚合缓存')
          assert.equal(await selection.isChecked(), false)
          await assertNoHorizontalOverflow(
            page,
            'business-row-items-truncated-modal-desktop'
          )
        },
      }
    })(),
    {
      name: 'business-row-items-mobile-dark',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1')
        const row = page
          .getByRole('row')
          .filter({ has: page.getByText('PR-STYLE-L1', { exact: true }) })
          .first()
        const nextRow = page
          .getByRole('row')
          .filter({
            has: page.getByText('PR-STYLE-L1-DRAFT', { exact: true }),
          })
          .first()
        const selection = row.locator('input[type="radio"]')
        const nextSelection = nextRow.locator('input[type="radio"]')
        await row.getByRole('button', { name: '展开PR-STYLE-L1明细' }).click()
        await page
          .getByRole('region', { name: '明细快速预览' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await nextRow
          .getByRole('button', { name: '展开PR-STYLE-L1-DRAFT明细' })
          .click()
        const preview = page.getByRole('region', { name: '明细快速预览' })
        await preview.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '样式草稿入库明细')
        assert.equal(await preview.count(), 1, '同时只能展开一张单据')
        assert.equal(
          await row
            .getByRole('button', { name: '展开PR-STYLE-L1明细' })
            .getAttribute('aria-expanded'),
          'false'
        )
        assert.equal(
          await nextRow
            .getByRole('button', { name: '收起PR-STYLE-L1-DRAFT明细' })
            .getAttribute('aria-expanded'),
          'true'
        )
        const metrics = await preview.evaluate((node) => {
          const card = node.querySelector('.erp-business-row-item-card')
          const button = document.querySelector(
            '.erp-business-row-expand-button[aria-expanded="true"]'
          )
          const scrollViewport =
            node.closest('.ant-table-container')?.querySelector('.ant-table-content') ||
            node.closest('.ant-table-body') ||
            node.closest('.ant-table-container')
          const cardStyle = card ? window.getComputedStyle(card) : null
          const buttonBox = button?.getBoundingClientRect()
          const previewBox = node.getBoundingClientRect()
          const viewportBox = scrollViewport?.getBoundingClientRect()
          return {
            cardBackground: cardStyle?.backgroundColor || '',
            cardOverflow: card ? card.scrollWidth - card.clientWidth : 0,
            previewOverflow: node.scrollWidth - node.clientWidth,
            previewWidth: previewBox.width,
            viewportWidth: viewportBox?.width || 0,
            buttonWidth: buttonBox?.width || 0,
            buttonHeight: buttonBox?.height || 0,
          }
        })
        assert(
          metrics.cardBackground !== 'rgb(251, 253, 251)' &&
            metrics.cardBackground !== 'rgb(255, 255, 255)',
          `暗色明细卡不应回退浅色背景: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.cardOverflow <= 1 && metrics.previewOverflow <= 1,
          `390px 明细卡应在容器内换行: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.viewportWidth > 0 &&
            metrics.previewWidth <= metrics.viewportWidth + 1,
          `展开区应留在表格可视滚动窗内: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.buttonWidth >= 36 && metrics.buttonHeight >= 36,
          `窄屏展开按钮应保持可触达尺寸: ${JSON.stringify(metrics)}`
        )
        assert.equal(await selection.isChecked(), false)
        assert.equal(await nextSelection.isChecked(), false)
        await assertDarkThemeContrast(page, {
          scenarioName: 'business-row-items-mobile-dark',
          selector: '.erp-business-row-items-preview',
          minRatio: 3,
        })
        await assertNoHorizontalOverflow(page, 'business-row-items-mobile-dark')
      },
    },
  ]
}
