import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

export function createProductPaginationScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  expectHeading,
  expectText,
  outputDir,
  path,
}) {
  let products = []
  let listRequests = []
  let nextListRead = null

  const holdNextListRead = () => {
    let release
    nextListRead = new Promise((resolve) => { release = resolve })
    return release
  }

  const resetProducts = () => {
    products = Array.from({ length: 1245 }, (_, index) => {
      const id = 1245 - index
      return {
        id,
        code: `PROD-PAGE-${String(id).padStart(3, '0')}`,
        name: `分页产品 ${String(id).padStart(3, '0')}`,
        style_no: `STYLE-${String(id).padStart(3, '0')}`,
        customer_style_no: '',
        default_unit_id: 1,
        is_active: true,
        created_at: 1_752_825_600 + id,
        updated_at: 1_752_825_600 + id,
      }
    })
    listRequests = []
    nextListRead = null
  }

  const fulfill = (route, id, data) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: { code: 0, message: 'OK', data },
      }),
    })

  return [
    {
      name: 'product-create-pagination-newest-first-desktop',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        resetProducts()
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'product-pagination', method, params = {} } = body
          if (method === 'list_products') {
            const limit = Number(params.limit)
            const offset = Number(params.offset || 0)
            listRequests.push({ limit, offset })
            const pendingRead = nextListRead
            nextListRead = null
            if (await pendingRead === 'fail') {
              await route.fulfill({
                json: {
                  jsonrpc: '2.0',
                  id,
                  result: { code: RpcErrorCode.INTERNAL, message: '产品列表暂时无法读取', data: {} },
                },
              })
              return
            }
            await fulfill(route, id, {
              products: products.slice(offset, offset + limit),
              total: products.length,
              limit,
              offset,
            })
            return
          }
          if (method === 'create_product') {
            const nextID =
              Math.max(...products.map((product) => product.id)) + 1
            const createdProduct = {
              id: nextID,
              code: String(params.code || `PROD-PAGE-${nextID}`),
              name: String(params.name || '分页最新产品'),
              style_no: String(params.style_no || ''),
              customer_style_no: String(params.customer_style_no || ''),
              default_unit_id: Number(params.default_unit_id || 1),
              unit_net_weight_g: params.unit_net_weight_g || null,
              is_active: true,
              created_at: 1_752_825_600 + nextID,
              updated_at: 1_752_825_600 + nextID,
            }
            products = [createdProduct, ...products]
            await fulfill(route, id, { product: createdProduct })
            return
          }
          await route.fallback()
        })
      },
      verify: async (page) => {
        await expectHeading(page, '产品档案')
        await expectText(page, '共 1245 条')
        assert.deepEqual(listRequests.at(-1), { limit: 50, offset: 0 })

        const pageThreeRequest = page.waitForRequest((request) => {
          if (!request.url().endsWith('/rpc/masterdata')) return false
          const body = request.postDataJSON() || {}
          return (
            body.method === 'list_products' &&
            Number(body.params?.limit) === 50 &&
            Number(body.params?.offset) === 100
          )
        })
        await page.locator('.ant-pagination-item-3').click()
        await pageThreeRequest
        await expectText(page, 'PROD-PAGE-1145')

        const sorter = page.locator('.ant-table-column-sorters').first()
        await sorter.hover()
        await expectText(page, '仅排序当前页')

        await page.getByRole('button', { name: '新建产品' }).click()
        const modal = page
          .locator('.erp-business-form-page:not([hidden])')
          .last()
        await modal.waitFor({ state: 'visible' })
        await modal.getByLabel('产品名称').fill('分页最新产品')

        await page.waitForFunction(
          () => {
            const button = document.querySelector(
              '.erp-business-form-page:not([hidden]) .erp-business-form-page__actions .ant-btn-primary'
            )
            return button && !button.disabled
          },
          undefined,
          { timeout: 10_000 }
        )
        const saveDispatched = await page.evaluate(() => {
          const button = document.querySelector(
            '.erp-business-form-page:not([hidden]) .erp-business-form-page__actions .ant-btn-primary'
          )
          if (!button || button.disabled) return false
          button.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            })
          )
          return true
        })
        assert(saveDispatched, '新建产品保存按钮应可提交')
        await modal.waitFor({ state: 'hidden' })
        await expectText(page, '分页最新产品')
        await page
          .locator(
            '.erp-business-data-table-card .ant-table-tbody > tr.ant-table-row'
          )
          .filter({ hasText: '分页最新产品' })
          .waitFor({ state: 'visible' })
        assert(
          listRequests.some((request) => request.offset === 0),
          `新建产品后应回到第一页重新读取: ${JSON.stringify(listRequests)}`
        )

        const metrics = await page.evaluate(() => {
          const table = document.querySelector(
            '.erp-business-data-table-card .ant-table-container'
          )
          const rows = Array.from(
            document.querySelectorAll(
              '.erp-business-data-table-card .ant-table-tbody > tr.ant-table-row'
            )
          )
          return {
            activePage: String(
              document.querySelector('.ant-pagination-item-active')
                ?.textContent || ''
            ).trim(),
            firstRow: String(rows[0]?.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            pagination: String(
              document.querySelector('.ant-pagination')?.textContent || ''
            )
              .replace(/\s+/gu, ' ')
              .trim(),
            rowCount: rows.length,
            tableClientWidth: table?.clientWidth || 0,
            tableScrollWidth: table?.scrollWidth || 0,
          }
        })
        assert.equal(metrics.activePage, '1')
        assert.match(metrics.firstRow, /分页最新产品/u)
        assert.match(metrics.pagination, /共 1246 条/u)
        assert.equal(metrics.rowCount, 50)
        assert(
          metrics.tableScrollWidth >= metrics.tableClientWidth,
          `产品表格尺寸读回异常: ${JSON.stringify(metrics)}`
        )
        assert.deepEqual(
          listRequests
            .filter((request) => request.limit === 50)
            .slice(-2)
            .map((request) => request.offset),
          [100, 0]
        )

        const sizeSelect = page.locator('.ant-pagination-options .ant-select')
        const options = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content')
        const rowSelector = '.erp-business-data-table-card .ant-table-tbody > tr.ant-table-row'
        const waitForPageRequest = (limit, offset) => page.waitForRequest((request) => {
          if (!request.url().endsWith('/rpc/masterdata')) return false
          const body = request.postDataJSON() || {}
          return body.method === 'list_products' && Number(body.params?.limit) === limit && Number(body.params?.offset) === offset
        })
        for (const pageSize of [100, 200, 300, 500]) {
          await sizeSelect.click()
          assert.deepEqual(await options.allTextContents(), ['50 条/页', '100 条/页', '200 条/页', '300 条/页', '500 条/页'])
          const request = waitForPageRequest(pageSize, 0)
          await options.getByText(`${pageSize} 条/页`, { exact: true }).click()
          await request
          await page.waitForFunction(({ rowSelector, pageSize }) =>
            document.querySelectorAll(rowSelector).length === pageSize,
          { rowSelector, pageSize })
          await expectText(page, `第 1-${pageSize} 条 / 共 1246 条`)
        }

        const lastPageRequest = waitForPageRequest(500, 1000)
        await page.locator('.ant-pagination-item-3').click()
        await lastPageRequest
        await expectText(page, '第 1001-1246 条 / 共 1246 条')
        assert.equal(await page.locator(rowSelector).count(), 246)
        await expectText(page, 'PROD-PAGE-246')
        await expectText(page, 'PROD-PAGE-001')

        const firstPageRequest = waitForPageRequest(500, 0)
        await page.locator('.ant-pagination-item-1').click()
        await firstPageRequest
        await expectText(page, '第 1-500 条 / 共 1246 条')
        await sizeSelect.click()
        const releaseSizeRead = holdNextListRead()
        const defaultPageRequest = waitForPageRequest(50, 0)
        await options.getByText('50 条/页', { exact: true }).click()
        await defaultPageRequest
        try {
          await page.locator('.erp-business-data-table-card .ant-spin-spinning').waitFor()
          await expectText(page, '第 1-500 条 / 共 1246 条')
          assert.equal(await page.locator(rowSelector).count(), 500, '读取新条数期间保留上一批完整数据')
          assert.equal(await sizeSelect.locator('.ant-select-selection-item').innerText(), '500 条/页', '显示条数应与保留的数据一致')
        } finally {
          releaseSizeRead()
        }
        await expectText(page, '第 1-50 条 / 共 1246 条')
        assert.equal(await page.locator(rowSelector).count(), 50)

        const releasePageRead = holdNextListRead()
        const nextPageRequest = waitForPageRequest(50, 50)
        await page.locator('.ant-pagination-next button').click()
        await nextPageRequest
        try {
          await page.locator('.erp-business-data-table-card .ant-spin-spinning').waitFor()
          assert.equal(await page.locator('.ant-pagination-item-active').innerText(), '1', '翻页读取期间保留已显示的页码')
          await expectText(page, '第 1-50 条 / 共 1246 条')
          assert.match(await page.locator(rowSelector).first().innerText(), /分页最新产品/u)
        } finally {
          releasePageRead()
        }
        await expectText(page, '第 51-100 条 / 共 1246 条')
        assert.equal(await page.locator('.ant-pagination-item-active').innerText(), '2')
        assert.equal(await page.locator(rowSelector).count(), 50)
        assert.match(await page.locator(rowSelector).first().innerText(), /PROD-PAGE-1196/u)

        const releaseFailedRead = holdNextListRead()
        const failedSizeRequest = waitForPageRequest(500, 0)
        await sizeSelect.click()
        await options.getByText('500 条/页', { exact: true }).click()
        await failedSizeRequest
        releaseFailedRead('fail')
        await page.locator('.ant-message-error').waitFor()
        await page.locator('.erp-business-data-table-card .ant-spin-spinning').waitFor({ state: 'hidden' })
        await expectText(page, '第 51-100 条 / 共 1246 条')
        assert.equal(await page.locator('.ant-pagination-item-active').innerText(), '2')
        assert.equal(await sizeSelect.locator('.ant-select-selection-item').innerText(), '50 条/页')
        assert.equal(await page.locator(rowSelector).count(), 50)
        assert.match(await page.locator(rowSelector).first().innerText(), /PROD-PAGE-1196/u)

        const retrySizeRequest = waitForPageRequest(500, 0)
        await sizeSelect.click()
        await options.getByText('500 条/页', { exact: true }).click()
        await retrySizeRequest
        await expectText(page, '第 1-500 条 / 共 1246 条')
        assert.equal(await page.locator(rowSelector).count(), 500)

        const retryLastPageRequest = waitForPageRequest(500, 1000)
        await page.locator('.ant-pagination-item-3').click()
        await retryLastPageRequest
        await expectText(page, '第 1001-1246 条 / 共 1246 条')
        const resetSizeRequest = waitForPageRequest(50, 0)
        await sizeSelect.click()
        await options.getByText('50 条/页', { exact: true }).click()
        await resetSizeRequest
        await expectText(page, '第 1-50 条 / 共 1246 条')
        assert.equal(await page.locator('.ant-pagination-item-active').innerText(), '1')
        assert.equal(await page.locator(rowSelector).count(), 50)
        assert.match(await page.locator(rowSelector).first().innerText(), /分页最新产品/u)

        await page.screenshot({
          path: path.join(
            outputDir,
            'product-create-pagination-newest-first-desktop.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'product-create-pagination-newest-first-desktop'
        )
      },
    },
  ]
}
