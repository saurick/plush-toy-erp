import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

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

  async function assertFixedDetailPagination(page, modal) {
    const footer = modal.locator('.ant-modal-footer')
    const pagination = footer.locator('.ant-pagination')
    await pagination.waitFor()
    const before = await footer.boundingBox()
    await modal.locator('.ant-modal-body').evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    const after = await footer.boundingBox()
    assert(Math.abs(before.y - after.y) <= 1, '滚动明细时底部分页应保持固定')
    assert(
      after.y >= 0 && after.y + after.height <= page.viewportSize().height,
      '底部分页必须完整留在可视区域'
    )
    await modal.locator('.ant-modal-body').evaluate((node) => {
      node.scrollTop = 0
    })
  }

  async function assertWideDetailsModal(page, modal) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.ant-modal')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .every(
          (node) =>
            Math.abs(node.getBoundingClientRect().width - node.offsetWidth) < 1
        )
    )
    const metrics = await modal.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const cards = [...node.querySelectorAll('.erp-business-row-item-card')]
      const grid = cards[0]?.querySelector('.erp-business-row-item-card__grid')
      const head = cards[0]?.querySelector('.erp-business-row-item-card__head')
      return {
        viewport: window.innerWidth,
        width: box.width,
        left: box.left,
        right: box.right,
        overflow: node.scrollWidth - node.clientWidth,
        fieldOverflow: Math.max(
          0,
          ...cards.flatMap((card) =>
            [...card.querySelectorAll('dd')].map(
              (field) => field.scrollWidth - field.clientWidth
            )
          )
        ),
        firstCardRows: new Set(
          [
            ...(cards[0]?.querySelectorAll(
              '.erp-business-row-item-card__field'
            ) || []),
          ].map((field) => Math.round(field.getBoundingClientRect().top))
        ).size,
        columns: grid
          ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
          : 0,
        numberBesideFields:
          head && grid
            ? head.getBoundingClientRect().right <=
              grid.getBoundingClientRect().left + 1
            : false,
        fullFieldGaps: cards.flatMap((card) => {
          const gridWidth = card
            .querySelector('.erp-business-row-item-card__grid')
            .getBoundingClientRect().width
          return [
            ...card.querySelectorAll(
              '.erp-business-row-item-card__field--full'
            ),
          ].map((field) =>
            Math.abs(field.getBoundingClientRect().width - gridWidth)
          )
        }),
      }
    })
    assert(
      metrics.width <= 1801,
      `超宽屏弹窗应保留阅读宽度上限: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.left >= 15 && metrics.right <= metrics.viewport - 15,
      `弹窗两侧必须保留边距: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(metrics.left - (metrics.viewport - metrics.width) / 2) <= 1,
      `详情弹窗应保持水平居中: ${JSON.stringify(metrics)}`
    )
    if (metrics.viewport >= 1000 && metrics.viewport <= 1920) {
      assert(
        metrics.width >= metrics.viewport * 0.9 &&
          metrics.width <= metrics.viewport * 0.96,
        `桌面多明细弹窗应充分利用窗口宽度: ${JSON.stringify(metrics)}`
      )
    } else if (metrics.viewport < 1000) {
      assert(
        metrics.width >= metrics.viewport * 0.85,
        `窄屏明细不应留下过多空白: ${JSON.stringify(metrics)}`
      )
    }
    assert(
      metrics.overflow <= 1 && metrics.fieldOverflow <= 1,
      `明细字段应完整换行且不溢出弹窗: ${JSON.stringify(metrics)}`
    )
    assert(
      [1, 2, 4, 6].includes(metrics.columns) &&
        metrics.fullFieldGaps.every((gap) => gap <= 1),
      `明细最多六列，长文本字段应占满一行: ${JSON.stringify(metrics)}`
    )
    if (metrics.viewport >= 1000) {
      assert(metrics.numberBesideFields, '桌面明细编号应位于字段左侧窄栏')
    }
    return metrics
  }

  return [
    ...[
      {
        domain: 'sales_order',
        path: '/erp/sales/project-orders/sales-orders',
        heading: '销售订单',
        title: '销售订单详情',
        numberKey: 'order_no',
      },
      {
        domain: 'outsourcing_order',
        path: '/erp/purchase/processing-contracts',
        heading: '委外订单',
        title: '加工合同详情',
        numberKey: 'outsourcing_order_no',
      },
      {
        domain: 'purchase_receipt',
        rpc: 'purchase',
        path: '/erp/warehouse/inbound',
        heading: '入库管理',
        title: '采购入库详情',
        numberKey: 'receipt_no',
      },
    ].map((config) => {
      let fullReads = 0
      const isReceipt = config.domain === 'purchase_receipt'
      const retryFailure = config.domain === 'sales_order'
      const recordNo = `STYLE-DETAIL-${config.domain}`
      return {
        name: `business-details-entry-${config.domain}`,
        path: config.path,
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 1000 },
        beforeNavigate: async (page) => {
          fullReads = 0
          const items = Array.from({ length: 22 }, (_, index) => ({
            id: index + 1,
            [`${config.domain}_id`]: 1,
            line_no: index + 1,
            subject_type: 'PRODUCT',
            product_id: 1,
            product_name_snapshot:
              index === 1
                ? '长名称产品用于验证多字段明细'.repeat(4)
                : '样式产品',
            product_code_snapshot: `PROD-${index + 1}`,
            product_no_snapshot: `PROD-${index + 1}`,
            process_requirement: '缝线颜色按确认样品执行。'.repeat(6),
            sample_note: '打样说明第一行。\n第二行请核对尺寸。',
            material_id: 1,
            warehouse_id: 1,
            unit_id: 1,
            ordered_quantity: index === 1 ? '123456789.1234' : '130',
            outsourcing_quantity: '20',
            quantity: '20',
            unit_price: '1.80',
            amount: '36.00',
            line_status: 'open',
            note: `明细备注 ${index + 1}。\n${'请按单据逐项核对。'.repeat(10)}`,
          }))
          const record = {
            id: 1,
            [config.numberKey]: recordNo,
            version: 1,
            lifecycle_status: 'draft',
            status: 'POSTED',
            currency: 'CNY',
            supplier_id: 1,
            supplier_snapshot: { id: 1, name: '样式供应商' },
            supplier_name: '样式供应商',
            customer_id: 1,
            customer_snapshot: { id: 1, name: '样式客户' },
            item_count: items.length,
            ...(isReceipt ? { items } : {}),
          }
          await page.route(
            `**/rpc/${config.rpc || config.domain}`,
            async (route) => {
              const { id, method, params } = route.request().postDataJSON()
              let data
              if (method === `list_${config.domain}s`) {
                data = stylePaginatedRpcData(
                  [record],
                  `${config.domain}s`,
                  params
                )
              } else if (method === `get_${config.domain}`) {
                data = { [config.domain]: record }
              } else if (method === `list_${config.domain}_items`) {
                if (params.limit > 5) fullReads += 1
                if (retryFailure && params.limit > 5 && fullReads === 1) {
                  await route.fulfill({
                    json: {
                      jsonrpc: '2.0',
                      id,
                      result: {
                        code: RpcErrorCode.INTERNAL,
                        message: '明细暂时无法加载',
                        data: {},
                      },
                    },
                  })
                  return
                }
                data = stylePaginatedRpcData(
                  items,
                  `${config.domain}_items`,
                  params
                )
              } else {
                return route.fallback()
              }
              await route.fulfill({
                json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
              })
            }
          )
        },
        verify: async (page) => {
          await expectHeading(page, config.heading)
          const row = page
            .getByRole('row')
            .filter({ has: page.getByText(recordNo, { exact: true }) })
            .first()
          await row
            .getByRole('button', {
              name: `展开${recordNo}明细，共 22 条`,
              exact: true,
            })
            .click()
          const preview = page.getByRole('region', { name: '明细快速预览' })
          const viewAll = preview.getByRole('button', { name: '查看全部' })
          await viewAll.waitFor()
          const previewBounds = await preview.evaluate((node) => {
            const viewport = node
              .closest('.ant-table-container')
              .querySelector('.ant-table-content, .ant-table-body')
            const viewportBox = viewport.getBoundingClientRect()
            const box = node.getBoundingClientRect()
            return {
              width: box.width,
              viewportWidth: viewportBox.width,
              overflow: node.scrollWidth - node.clientWidth,
            }
          })
          assert(
            previewBounds.width <= previewBounds.viewportWidth + 1 &&
              previewBounds.overflow <= 1,
            `桌面展开明细应留在表格可视区域内: ${JSON.stringify(previewBounds)}`
          )
          await viewAll.focus()
          await page.keyboard.press('Enter')
          const modal = page.getByRole('dialog', {
            name: new RegExp(`^${config.title}`),
          })
          await modal.waitFor()
          assert.equal(await page.getByRole('dialog').count(), 1)
          if (retryFailure) {
            await modal.getByRole('button', { name: '重试' }).click()
          }
          await modal.getByText('明细 1', { exact: true }).waitFor()
          assert.equal(
            await modal.locator('.erp-business-row-item-card').count(),
            10
          )
          assert.equal(fullReads, isReceipt ? 0 : retryFailure ? 2 : 1)
          const metrics = await assertWideDetailsModal(page, modal)
          assert.equal(metrics.columns, 6)
          assert.equal(metrics.fullFieldGaps.length, retryFailure ? 30 : 10)
          await assertFixedDetailPagination(page, modal)
          if (retryFailure) {
            const rows = await modal
              .locator('.erp-business-row-item-card')
              .first()
              .locator('.erp-business-row-item-card__grid')
              .evaluateAll((nodes) =>
                nodes.map((node) =>
                  [...node.querySelectorAll('dt')].map(
                    (field) => field.textContent
                  )
                )
              )
            assert.deepEqual(rows[1], [
              '订单数量',
              '船头版数量',
              '生产数量',
              '已出货数',
              '未出货数',
              '单位',
            ])
            assert.deepEqual(rows[2], ['单价', '金额', '工程 / 打样', '设计师'])
            assert.equal(
              await modal
                .locator('.erp-business-row-item-card')
                .first()
                .locator('dt')
                .count(),
              22,
              '销售明细所有字段均应保留'
            )
            const sample = modal
              .locator('.erp-business-row-item-card')
              .first()
              .locator('dd')
              .filter({ hasText: '打样说明第一行' })
            assert.equal(
              await sample.innerText(),
              '打样说明第一行。\n第二行请核对尺寸。'
            )
          }
          await modal.screenshot({
            animations: 'disabled',
            path: path.join(
              outputDir,
              `business-details-entry-${config.domain}-open.png`
            ),
          })
          if (retryFailure) {
            for (const width of [1000, 390]) {
              await page.setViewportSize({ width, height: 1000 })
              await assertWideDetailsModal(page, modal)
              await assertFixedDetailPagination(page, modal)
              await modal.screenshot({
                animations: 'disabled',
                path: path.join(
                  outputDir,
                  `business-details-entry-${config.domain}-${width}.png`
                ),
              })
            }
            await page.setViewportSize({ width: 1440, height: 1000 })
          }
          await modal.locator('.ant-pagination-next button').click()
          await modal.getByText('明细 11', { exact: true }).waitFor()
          await page.waitForFunction(() => {
            const body = document.querySelector(
              '.erp-business-details-modal .ant-modal-body'
            )
            const card = body?.querySelector('.erp-business-row-item-card')
            if (!body || !card) return false
            const bodyBox = body.getBoundingClientRect()
            const cardBox = card.getBoundingClientRect()
            return (
              cardBox.top >= bodyBox.top - 1 &&
              cardBox.top < bodyBox.bottom - 20
            )
          })
          if (retryFailure) {
            await page.setViewportSize({ width: 390, height: 1000 })
            await modal
              .locator('section')
              .evaluate((node) => node.scrollIntoView({ block: 'start' }))
            await modal.screenshot({
              animations: 'disabled',
              path: path.join(
                outputDir,
                'business-details-entry-sales_order-mobile-fields.png'
              ),
            })
          }
          await page.keyboard.press('Escape')
          await modal.waitFor({ state: 'hidden' })
          await page.waitForFunction(
            () => document.activeElement?.textContent?.trim() === '查看全部'
          )
          assert.equal(
            await preview.locator('.erp-business-row-item-card').count(),
            5
          )
          await viewAll.click()
          await modal.getByText('明细 1', { exact: true }).waitFor()
          await modal.getByRole('button', { name: /关\s*闭/u }).click()
          await modal.waitFor({ state: 'hidden' })
          await assertNoHorizontalOverflow(
            page,
            `business-details-entry-${config.domain}`
          )
        },
      }
    }),
    ...['light', 'dark'].map((theme) => ({
      name: `business-details-wide-${theme}`,
      path: '/erp/purchase/accessories',
      auth: 'admin',
      themeMode: theme,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1000 },
      beforeNavigate: async (page) => {
        const now = Math.floor(Date.now() / 1000)
        const order = {
          id: 1,
          purchase_order_no: 'PO-STYLE-WIDE',
          supplier_id: 1,
          supplier_snapshot: {
            id: 1,
            code: 'SUP-STYLE-L1',
            name: '样式供应商',
          },
          currency: 'CNY',
          purchase_date: now,
          expected_arrival_date: now + 86_400,
          lifecycle_status: 'approved',
          version: 1,
          item_count: 25,
        }
        const items = Array.from({ length: 25 }, (_, index) => ({
          id: index + 1,
          purchase_order_id: 1,
          line_no: index + 1,
          material_id: 1,
          material_code_snapshot: `MAT-STYLE-${index + 1}`,
          material_name_snapshot:
            index === 1 ? '长名称材料用于检查完整换行'.repeat(5) : '样式材料',
          color_snapshot: '雾蓝',
          product_order_no_snapshot: `SO-STYLE-${index + 1}`,
          product_no_snapshot: 'PROD-STYLE-L1',
          product_name_snapshot: '样式产品',
          purchased_quantity: index === 1 ? '99999999999999.9999' : '365',
          unit_id: 1,
          unit_price: '1.80',
          amount: '657.00',
          expected_arrival_date: now + 86_400,
          line_status: ['open', 'closed', 'canceled'][index % 3],
          note:
            index === 1
              ? `${'按产品订单分别分包，标签与送货单对应。'.repeat(8)}\n末行交货说明。`
              : '外箱按订单分开',
        }))
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          let data
          if (method === 'list_purchase_orders') {
            data = stylePaginatedRpcData([order], 'purchase_orders', params)
          } else if (method === 'list_purchase_order_items') {
            data = stylePaginatedRpcData(items, 'purchase_order_items', params)
          } else if (method === 'get_purchase_order') {
            data = { purchase_order: order }
          } else {
            return route.fallback()
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(data),
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '采购订单')
        assert.equal(
          await page.locator('html').getAttribute('data-erp-theme'),
          theme
        )
        const orderCell = page
          .locator('.erp-business-data-table-card')
          .getByText('PO-STYLE-WIDE', { exact: true })
        const itemReads = []
        page.on('request', (request) => {
          if (!request.url().endsWith('/rpc/purchase_order')) return
          const { method, params } = request.postDataJSON()
          if (method === 'list_purchase_order_items') itemReads.push(params)
        })
        await page
          .getByRole('button', {
            name: '展开PO-STYLE-WIDE明细，共 25 条',
            exact: true,
          })
          .click()
        const preview = page.getByRole('region', { name: '明细快速预览' })
        const viewAll = preview.getByRole('button', { name: '查看全部' })
        await viewAll.click()
        const modal = page.getByRole('dialog', { name: /采购订单详情/u })
        await modal
          .getByText('采购订单明细（共 25 条）', { exact: true })
          .waitFor()
        assert.equal(
          await page.getByRole('dialog').count(),
          1,
          '查看全部只打开已有单据详情'
        )
        assert.equal(
          itemReads.length,
          2,
          '预览与详情各读取一次，不能再加载独立明细弹窗'
        )
        assert.equal(itemReads[0].limit, 5)
        assert(itemReads[1].limit > 5)
        if (theme === 'dark') {
          await assertDarkThemeContrast(page, {
            scenarioName: 'business-details-wide-dark',
            selector: '.erp-business-action-modal',
            minRatio: 3,
          })
        }
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          10
        )
        await assertFixedDetailPagination(page, modal)
        const fieldRows = await modal
          .locator('.erp-business-row-item-card')
          .first()
          .locator('.erp-business-row-item-card__grid')
          .evaluateAll((nodes) =>
            nodes.map((node) =>
              [...node.querySelectorAll('dt')].map((field) => field.textContent)
            )
          )
        assert.deepEqual(fieldRows, [
          [
            '下单材料名称',
            '下单材料编码',
            '下单颜色',
            '行状态',
            '采购数量',
            '单位',
          ],
          [
            '预计到货日期',
            '单价',
            '金额',
            '产品订单编号',
            '产品编号',
            '产品名称',
          ],
          ['备注'],
        ])
        assert.deepEqual(
          await modal
            .locator('.erp-business-row-item-card__field[data-tone]')
            .evaluateAll((nodes) =>
              nodes.slice(0, 3).map((node) => ({
                tone: node.dataset.tone,
                text: node.querySelector('dd').textContent,
              }))
            ),
          [
            { tone: 'positive', text: '未关闭' },
            { tone: 'neutral', text: '已关闭' },
            { tone: 'negative', text: '已取消' },
          ]
        )
        for (const width of [1920, 1440, 2560, 1000, 680, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          const metrics = await assertWideDetailsModal(page, modal)
          if (width >= 1440) {
            assert(
              metrics.columns === 6 && metrics.firstCardRows === 3,
              `常规采购明细应为两排字段加独立备注: ${JSON.stringify(metrics)}`
            )
          }
          assert.equal(
            metrics.fullFieldGaps.length,
            10,
            '每条采购明细均保留完整备注'
          )
          await assertNoHorizontalOverflow(
            page,
            `business-details-wide-${theme}-${width}`
          )
          await page.screenshot({
            path: path.join(
              outputDir,
              `business-details-wide-${theme}-${width}.png`
            ),
          })
          console.log(`[modal-width] ${theme} ${JSON.stringify(metrics)}`)
        }
        await modal.locator('.ant-pagination-next button').click()
        await modal.getByText('明细 11', { exact: true }).waitFor()
        await modal.locator('.ant-pagination-next button').click()
        await modal.getByText('明细 21', { exact: true }).waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          5
        )
        await modal.getByRole('button', { name: /关\s*闭/u }).click()
        await modal.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1920, height: 1000 })
        await page.waitForFunction(
          () => document.activeElement?.textContent?.trim() === '查看全部'
        )
        assert.equal(
          await preview.locator('.erp-business-row-item-card').count(),
          5,
          '返回列表保留原展开预览'
        )
        await orderCell.dblclick()
        await modal.getByText('明细 1', { exact: true }).waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          10
        )
        await modal.getByRole('button', { name: /关\s*闭/u }).click()
        await modal.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(
          page,
          `business-details-wide-${theme}-closed`
        )
      },
    })),
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
            if (body.method === 'list_sales_orders') {
              const now = Math.floor(Date.now() / 1000)
              const baseOrder = {
                id: 1,
                order_no: 'SO-STYLE-L1',
                customer_id: 1,
                customer_snapshot: {
                  id: 1,
                  code: 'CUS-STYLE-L1',
                  name: '暗色客户',
                },
                customer_order_no: 'PO-STYLE-L1',
                title: '样式销售订单',
                order_date: now,
                expected_ship_date: now + 86_400,
                lifecycle_status: 'draft',
                version: 1,
                item_count: 1,
                note: '',
                created_at: now,
                updated_at: now,
              }
              const salesOrders = [
                baseOrder,
                {
                  ...baseOrder,
                  id: 2,
                  order_no: 'SO-COUNT-ZERO',
                  item_count: 0,
                },
                {
                  ...baseOrder,
                  id: 3,
                  order_no: 'SO-COUNT-UNKNOWN',
                  item_count: undefined,
                },
                {
                  ...baseOrder,
                  id: 4,
                  order_no: 'SO-COUNT-LARGE',
                  item_count: Number.MAX_SAFE_INTEGER,
                },
              ]
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id || 'mock-id',
                  result: styleRpcResult({
                    sales_orders: salesOrders,
                    total: salesOrders.length,
                    limit: Number(body.params?.limit || 20),
                    offset: Number(body.params?.offset || 0),
                  }),
                }),
              })
              return
            }
            if (body.method === 'list_sales_order_items') {
              itemReadCalls += 1
              itemReadParams.push(body.params || {})
              if (Number(body.params?.sales_order_id || 0) === 3) {
                const now = Math.floor(Date.now() / 1000)
                await route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: body.id || 'mock-id',
                    result: styleRpcResult({
                      sales_order_items: [
                        {
                          id: 3,
                          sales_order_id: 3,
                          line_no: 1,
                          product_id: 1,
                          product_sku_id: 1,
                          product_code_snapshot: 'PROD-STYLE-L1',
                          product_name_snapshot: '样式产品',
                          sku_code_snapshot: 'SKU-STYLE-L1',
                          color_snapshot: '深棕',
                          ordered_quantity: '10',
                          unit_id: 1,
                          unit_name_snapshot: '只',
                          unit_price: '12.50',
                          amount: '125.00',
                          line_status: 'open',
                          note: '',
                          created_at: now,
                          updated_at: now,
                        },
                      ],
                      total: 1,
                      limit: Number(body.params?.limit || 5),
                      offset: Number(body.params?.offset || 0),
                    }),
                  }),
                })
                return
              }
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

          const zeroRow = page
            .getByRole('row')
            .filter({ has: page.getByText('SO-COUNT-ZERO', { exact: true }) })
            .first()
          const unknownRow = page
            .getByRole('row')
            .filter({
              has: page.getByText('SO-COUNT-UNKNOWN', { exact: true }),
            })
            .first()
          const largeRow = page
            .getByRole('row')
            .filter({ has: page.getByText('SO-COUNT-LARGE', { exact: true }) })
            .first()
          await zeroRow.getByText('0条', { exact: true }).waitFor()
          assert.equal(
            await zeroRow.locator('.erp-business-row-expand-button').count(),
            0,
            '精确 0 条必须显示为被动文本，不能提供展开动作'
          )
          const unknownExpand = unknownRow.getByRole('button', {
            name: '展开SO-COUNT-UNKNOWN明细，查看',
            exact: true,
          })
          assert.equal(await unknownExpand.innerText(), '查看')
          const largeCountMetrics = await largeRow
            .locator('.erp-business-row-expand-button')
            .evaluate((button) => {
              const cell = button.closest('td')
              const box = button.getBoundingClientRect()
              const cellBox = cell?.getBoundingClientRect()
              return {
                buttonWidth: box.width,
                cellWidth: cellBox?.width || 0,
                overflow: button.scrollWidth - button.clientWidth,
              }
            })
          assert(
            largeCountMetrics.buttonWidth <= 73 &&
              largeCountMetrics.cellWidth <= 105 &&
              largeCountMetrics.buttonWidth <= largeCountMetrics.cellWidth + 1,
            `大条数控件不得溢出明细列: ${JSON.stringify(largeCountMetrics)}`
          )
          await page.locator('.erp-business-data-table-card').screenshot({
            path: path.join(outputDir, 'business-row-items-counts-default.png'),
          })

          const expand = row.getByRole('button', {
            name: '展开SO-STYLE-L1明细，共 1 条',
            exact: true,
          })
          assert.equal(await expand.innerText(), '1条')
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
            name: '收起SO-STYLE-L1明细，共 1 条',
            exact: true,
          })
          assert.equal(await collapse.getAttribute('aria-expanded'), 'true')

          await collapse.click()
          await row
            .getByRole('button', {
              name: '展开SO-STYLE-L1明细，共 1 条',
              exact: true,
            })
            .focus()
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

          await unknownExpand.click()
          await page
            .getByRole('region', { name: '明细快速预览' })
            .waitFor({ state: 'visible', timeout: 10_000 })
          const loadedUnknown = unknownRow.getByRole('button', {
            name: '收起SO-COUNT-UNKNOWN明细，共 1 条',
            exact: true,
          })
          assert.equal(await loadedUnknown.innerText(), '1条')
          assert.equal(
            itemReadCalls,
            2,
            '未知条数只应在用户展开后读取一次明细并更新缓存 total'
          )
          await page.locator('.erp-business-data-table-card').screenshot({
            path: path.join(outputDir, 'business-row-items-unknown-loaded.png'),
          })
          await assertNoHorizontalOverflow(
            page,
            'business-row-items-source-document-cache-desktop'
          )
        },
      }
    })(),
    {
      name: 'business-row-items-permission-hidden-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['sales_order.read'],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['sales-orders'],
        actions: ['sales_order.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '销售订单')
        const row = page
          .getByRole('row')
          .filter({ has: page.getByText('SO-STYLE-L1', { exact: true }) })
          .first()
        await row.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await row.locator('.erp-business-row-expand-button').count(),
          0,
          '没有明细读取权限时不得显示展开动作'
        )
        assert.equal(
          await row.locator('.erp-business-row-item-count').count(),
          0,
          '没有明细读取权限时不得泄露条数'
        )
        assert.equal(
          await row.locator('.erp-business-row-expand-placeholder').count(),
          1,
          '无权限行应仅保留对齐占位'
        )
        await row.screenshot({
          path: path.join(
            outputDir,
            'business-row-items-permission-hidden.png'
          ),
        })
      },
    },
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
          await assertWideDetailsModal(page, modal)
          await assertFixedDetailPagination(page, modal)
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
          await page.setViewportSize({ width: 390, height: 900 })
          await assertWideDetailsModal(page, modal)
          await modal.screenshot({
            path: path.join(
              outputDir,
              'business-row-items-truncated-modal-mobile.png'
            ),
          })
          await modal.locator('.ant-modal-close').click({ force: true })
          await modal.waitFor({ state: 'hidden', timeout: 10_000 })
          await page.setViewportSize({ width: 1440, height: 900 })
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
            node
              .closest('.ant-table-container')
              ?.querySelector('.ant-table-content') ||
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
        await preview.screenshot({
          path: path.join(outputDir, 'business-row-items-mobile-dark.png'),
        })
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
