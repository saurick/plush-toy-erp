import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

export async function openBusinessRecordDetails(
  page,
  recordNo,
  actionName = '查看详情'
) {
  const row = page
    .getByRole('row')
    .filter({ has: page.getByText(recordNo, { exact: true }) })
    .first()
  await row.getByText(recordNo, { exact: true }).first().click()
  await page
    .locator('button[data-business-action-key="clear-selection"]:visible')
    .waitFor()
  const actionNamePattern = new RegExp(`${actionName.split('').join('\\s*')}$`, 'u')
  let action = page
    .getByRole('button', { name: actionNamePattern })
    .filter({ visible: true })
    .first()
  if (!(await action.count())) {
    await page
      .getByRole('button', { name: /^更多操作，共/u })
      .filter({ visible: true })
      .first()
      .click()
    action = page
      .locator('.erp-business-selection-action-menu:visible')
      .getByRole('button', { name: actionNamePattern })
      .first()
  }
  await action.focus()
  await action.press('Enter')
}

export function createBusinessDetailsScenarios(deps) {
  const {
    assert,
    assertDarkThemeContrast,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    outputDir,
    path,
  } = deps

  async function waitForDetailsMotion(modal) {
    await modal.evaluate(async (node) => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {}))
      )
    })
  }

  async function assertFixedDetailPagination(page, modal) {
    await waitForDetailsMotion(modal)
    const footer = modal.locator('.ant-modal-footer')
    const pagination = footer.locator('.ant-pagination')
    await pagination.waitFor()
    await footer.getByRole('combobox', { name: '每页明细条数' }).waitFor()
    const controls = await footer.evaluate((node) => {
      const select = node
        .querySelector('.erp-business-details-page-size')
        .getBoundingClientRect()
      const pages = node
        .querySelector('.ant-pagination')
        .getBoundingClientRect()
      const close = node
        .querySelector(':scope > .ant-btn')
        .getBoundingClientRect()
      const buttons = [
        ...node.querySelectorAll(
          '.ant-pagination-item, .ant-pagination-item-link'
        ),
      ]
      return {
        overflow: node.scrollWidth - node.clientWidth,
        selectorBeforePages: select.right <= pages.left,
        sameRow:
          Math.abs(select.top - pages.top) <= 2 &&
          Math.abs(close.top - pages.top) <= 2,
        buttonsBoxed: buttons.every(
          (button) =>
            Number.parseFloat(getComputedStyle(button).borderTopWidth) >= 1
        ),
      }
    })
    assert(
      controls.overflow <= 1,
      `分页控件不得横向溢出: ${JSON.stringify(controls)}`
    )
    if (page.viewportSize().width >= 768) {
      assert(
        controls.selectorBeforePages &&
          controls.sameRow &&
          controls.buttonsBoxed,
        `桌面应依次显示条数选择、方框页码和关闭: ${JSON.stringify(controls)}`
      )
    }
    const before = await footer.boundingBox()
    await modal.locator('.ant-modal-body').evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    const after = await footer.boundingBox()
    assert(
      Math.abs(before.y - after.y) <= 1,
      `滚动明细时底部分页应保持固定: ${JSON.stringify({ before, after })}`
    )
    assert(
      after.y >= 0 && after.y + after.height <= page.viewportSize().height,
      '底部分页必须完整留在可视区域'
    )
    await modal.locator('.ant-modal-body').evaluate((node) => {
      node.scrollTop = 0
    })
  }

  async function changeDetailsPageSize(page, modal, size) {
    await modal
      .getByRole('combobox', { name: '每页明细条数' })
      .press('ArrowDown')
    await page
      .getByRole('option', { name: `${size} 条/页`, exact: true })
      .click()
    await page.waitForFunction(() => {
      const body = document.querySelector(
        '.erp-business-details-modal .ant-modal-body'
      )
      const firstCard = body?.querySelector('.erp-business-row-item-card')
      if (!firstCard) return false
      const card = firstCard.getBoundingClientRect()
      const viewport = body.getBoundingClientRect()
      return card.top >= viewport.top - 1 && card.top < viewport.bottom
    })
  }

  async function assertWideDetailsModal(page, modal) {
    await waitForDetailsMotion(modal)
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.ant-modal')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .every(
          (node) =>
            !/\bant-zoom-(appear|enter)\b/u.test(node.className) &&
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
        heading: '采购入库',
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
                fullReads += 1
                if (retryFailure && fullReads === 1) {
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
          await row.waitFor()
          assert.equal(
            await row.locator('.ant-table-row-expand-icon-cell').count(),
            0
          )
          await openBusinessRecordDetails(page, recordNo)
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
          await page.waitForFunction(() =>
            /查看详情|更多操作/u.test(document.activeElement?.textContent || '')
          )
          await openBusinessRecordDetails(page, recordNo)
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
        const orders = [
          order,
          {
            ...order,
            id: 2,
            purchase_order_no: 'PO-STYLE-EMPTY',
            item_count: 0,
          },
          {
            ...order,
            id: 3,
            purchase_order_no: 'PO-STYLE-SINGLE',
            item_count: 1,
          },
        ]
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          let data
          if (method === 'list_purchase_orders') {
            data = stylePaginatedRpcData(orders, 'purchase_orders', params)
          } else if (method === 'list_purchase_order_items') {
            const orderItems =
              params.purchase_order_id === 2
                ? []
                : params.purchase_order_id === 3
                  ? [{ ...items[0], purchase_order_id: 3 }]
                  : items
            data = stylePaginatedRpcData(
              orderItems,
              'purchase_order_items',
              params
            )
          } else if (method === 'get_purchase_order') {
            data = {
              purchase_order:
                orders.find((item) => item.id === params.id) || order,
            }
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
        await openBusinessRecordDetails(page, 'PO-STYLE-WIDE')
        const modal = page.getByRole('dialog', { name: /采购订单详情/u })
        await modal
          .getByText('采购订单明细（共 25 条）', { exact: true })
          .waitFor()
        assert.equal(
          await page.getByRole('dialog').count(),
          1,
          '查看入口只打开完整单据详情'
        )
        assert.equal(
          itemReads.length,
          1,
          '直接完整读取明细，不再先请求前五条预览'
        )
        assert.equal(itemReads[0].limit, 200)
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
        await changeDetailsPageSize(page, modal, 20)
        await modal.getByText('明细 1', { exact: true }).waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          20
        )
        await modal.locator('.ant-pagination-next button').click()
        await modal.getByText('明细 21', { exact: true }).waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          5
        )
        await changeDetailsPageSize(page, modal, 50)
        await modal.getByText('明细 1', { exact: true }).waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          25
        )
        assert.equal(
          await modal.locator('.ant-pagination-next button').isDisabled(),
          true
        )
        assert.equal(
          await modal.locator('.ant-pagination-prev button').isDisabled(),
          true
        )
        await assertFixedDetailPagination(page, modal)
        await modal.getByRole('button', { name: /关\s*闭/u }).click()
        await modal.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1920, height: 1000 })
        await orderCell.dblclick()
        await modal.getByText('明细 1', { exact: true }).waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          10
        )
        assert.equal(
          await modal
            .locator(
              '.erp-business-details-page-size .ant-select-selection-item'
            )
            .innerText(),
          '10 条/页'
        )
        await modal.getByRole('button', { name: /关\s*闭/u }).click()
        await modal.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(
          page,
          `business-details-wide-${theme}-closed`
        )
        for (const [number, count] of [
          ['PO-STYLE-EMPTY', 0],
          ['PO-STYLE-SINGLE', 1],
        ]) {
          await page
            .locator('.erp-business-data-table-card')
            .getByText(number, { exact: true })
            .dblclick()
          await modal
            .locator('.erp-business-details-total')
            .getByText(`共 ${count} 条`, { exact: true })
            .waitFor()
          assert.equal(
            await modal.locator('.erp-business-row-item-card').count(),
            count
          )
          assert.equal(
            await modal
              .getByRole('combobox', { name: '每页明细条数' })
              .isDisabled(),
            count === 0
          )
          assert.equal(
            await modal.locator('.ant-pagination-prev button').isDisabled(),
            true
          )
          assert.equal(
            await modal.locator('.ant-pagination-next button').isDisabled(),
            true
          )
          if (count === 1) {
            await changeDetailsPageSize(page, modal, 20)
            assert.equal(
              await modal.locator('.erp-business-row-item-card').count(),
              1
            )
          }
          await modal.getByRole('button', { name: /关\s*闭/u }).click()
          await modal.waitFor({ state: 'hidden' })
        }
      },
    })),
    {
      name: 'business-details-permission-hidden-desktop',
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
        const reads = []
        page.on('request', (request) => {
          if (request.url().endsWith('/rpc/sales_order')) {
            reads.push(request.postDataJSON()?.method)
          }
        })
        await expectHeading(page, '销售订单')
        await openBusinessRecordDetails(page, 'SO-STYLE-L1')
        const modal = page.getByRole('dialog', { name: /销售订单详情/u })
        await modal.waitFor()
        assert.equal(
          await modal.locator('.erp-business-row-item-card').count(),
          0
        )
        assert.equal(
          await modal.getByRole('combobox', { name: '每页明细条数' }).count(),
          0
        )
        assert(
          !reads.includes('list_sales_order_items'),
          '缺少明细权限时不读取或展示明细'
        )
        await modal.getByRole('button', { name: /关\s*闭/u }).click()
      },
    },
    ...[
      {
        name: 'production',
        path: '/erp/production/orders',
        heading: '生产订单',
        record: 'MO-STYLE-L1-20260713',
        action: '查看',
        title: '查看生产订单',
        items: '.erp-production-order-line',
        count: 22,
      },
      {
        name: 'bom',
        path: '/erp/purchase/material-bom',
        heading: 'BOM',
        record: 'BOM-STYLE-L1',
        action: '查看',
        title: '查看 BOM 版本',
      },
      {
        name: 'shipment',
        path: '/erp/warehouse/shipments',
        heading: '出货',
        record: 'SHIP-STYLE-L1',
        action: '查看明细',
        title: '查看出货明细',
      },
    ].map((config) => ({
      name: `business-details-entry-${config.name}`,
      path: config.path,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        await page.getByText(config.record, { exact: true }).first().waitFor()
        assert.equal(
          await page
            .locator(
              '.erp-business-data-table-card .ant-table-row-expand-icon-cell'
            )
            .count(),
          0
        )
        await openBusinessRecordDetails(page, config.record, config.action)
        const details = page.getByRole('region', {
          name: config.title,
          exact: true,
        })
        await details.waitFor()
        if (config.items) {
          assert.equal(
            await details.locator(config.items).count(),
            config.count,
            '完整查看必须包含第五条之后的明细'
          )
        }
        assert.equal(
          await details.getByRole('button', { name: /^保存/u }).count(),
          0
        )
        await assertNoHorizontalOverflow(
          page,
          `business-details-entry-${config.name}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            `business-details-entry-${config.name}.png`
          ),
        })
        await details
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page.getByText(config.record, { exact: true }).first().waitFor()
      },
    })),
  ]
}
