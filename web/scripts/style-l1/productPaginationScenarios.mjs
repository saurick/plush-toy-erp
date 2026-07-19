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

  const resetProducts = () => {
    products = Array.from({ length: 45 }, (_, index) => {
      const id = 45 - index
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
            const limit = Number(params.limit || 20)
            const offset = Number(params.offset || 0)
            listRequests.push({ limit, offset })
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
        await expectText(page, '共 45 条')

        const pageThreeRequest = page.waitForRequest((request) => {
          if (!request.url().endsWith('/rpc/masterdata')) return false
          const body = request.postDataJSON() || {}
          return (
            body.method === 'list_products' &&
            Number(body.params?.offset) === 40
          )
        })
        await page.locator('.ant-pagination-item-3').click()
        await pageThreeRequest
        await expectText(page, 'PROD-PAGE-005')

        const sorter = page.locator('.ant-table-column-sorters').first()
        await sorter.hover()
        await expectText(page, '仅排序当前页')

        await page.getByRole('button', { name: '新建产品' }).click()
        const modal = page
          .locator('.erp-business-action-modal--form.ant-modal:visible')
          .last()
        await modal.waitFor({ state: 'visible' })
        await modal.getByLabel('产品名称').fill('分页最新产品')

        const firstPageRequest = page.waitForRequest((request) => {
          if (!request.url().endsWith('/rpc/masterdata')) return false
          const body = request.postDataJSON() || {}
          return (
            body.method === 'list_products' && Number(body.params?.offset) === 0
          )
        })
        await modal.locator('.ant-modal-footer .ant-btn-primary').click()
        await firstPageRequest
        await modal.waitFor({ state: 'hidden' })
        await expectText(page, '分页最新产品')

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
        assert.match(metrics.pagination, /共 46 条/u)
        assert.equal(metrics.rowCount, 20)
        assert(
          metrics.tableScrollWidth >= metrics.tableClientWidth,
          `产品表格尺寸读回异常: ${JSON.stringify(metrics)}`
        )
        assert.deepEqual(
          listRequests
            .filter((request) => request.limit === 20)
            .slice(-2)
            .map((request) => request.offset),
          [40, 0]
        )

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
