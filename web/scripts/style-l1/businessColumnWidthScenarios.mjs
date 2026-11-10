import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { selectWarehouseView } from './warehouseNavigationActions.mjs'
import { clickERPThemeOption } from './themeAssertions.mjs'
import { assertNoHorizontalOverflow } from './pageAssertions.mjs'
import { assertTableHeaderControlsFit } from './businessTableAssertions.mjs'

const card = '.erp-business-data-table-card'
const rowSelector = `${card} tbody tr[data-row-key]`
async function grid(page) {
  return page
    .locator(`${card} .ant-table-wrapper`)
    .first()
    .evaluate(async (root) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const head = [...root.querySelectorAll('thead')].find(
        (node) =>
          node.getBoundingClientRect().height > 0 &&
          getComputedStyle(node).visibility !== 'hidden'
      )
      const body = root.querySelector('tbody tr[data-row-key]')
      const content = root.querySelector('.ant-table-body, .ant-table-content')
      return {
        availableWidth: root.parentElement.clientWidth,
        width: root.getBoundingClientRect().width,
        headerWidth: head.closest('table').getBoundingClientRect().width,
        tableWidth: root
          .querySelector('tbody')
          .closest('table')
          .getBoundingClientRect().width,
        horizontalRange: content.scrollWidth - content.clientWidth,
        columns: [...head.querySelectorAll('th')].map((cell, index) => ({
          label: cell.textContent.trim(),
          width: cell.getBoundingClientRect().width,
          bodyWidth: body?.children[index]?.getBoundingClientRect().width || 0,
        })),
      }
    })
}
function assertStableGrid(before, after) {
  assert.deepEqual(
    after.columns.map((column) => column.label),
    before.columns.map((column) => column.label)
  )
  for (let index = 0; index < before.columns.length; index += 1)
    assert.ok(
      Math.abs(before.columns[index].width - after.columns[index].width) <= 1,
      `空态或加载不能改变列宽: ${JSON.stringify({ before: before.columns[index], after: after.columns[index] })}`
    )
}
function assertAlignedGrid(result) {
  assert.ok(
    Math.abs(result.width - result.availableWidth) <= 1,
    `表格外框应铺满容器: ${JSON.stringify(result)}`
  )
  assert.ok(
    result.tableWidth >= result.width - 1,
    `数据行至少铺满表格外框: ${JSON.stringify(result)}`
  )
  assert.ok(
    Math.abs(result.headerWidth - result.tableWidth) <= 1,
    `表头与数据行应共用横向边界: ${JSON.stringify(result)}`
  )
  assert.ok(
    Math.abs(result.columns[0].width - 52) <= 1,
    `选择列保持固定宽度: ${JSON.stringify(result.columns[0])}`
  )
  for (const column of result.columns)
    if (column.bodyWidth)
      assert.ok(
        Math.abs(column.width - column.bodyWidth) <= 1,
        `表头与表体列宽一致: ${JSON.stringify(column)}`
      )
}
async function exportCSV(page) {
  const pending = page.waitForEvent('download')
  await openBusinessTableTool(page, '导出筛选结果')
  return readFile(await (await pending).path(), 'utf8')
}

export function createBusinessColumnWidthScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const common = {
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  }
  return [
    {
      ...common,
      name: 'business-column-width-bom-fill',
      path: '/erp/purchase/material-bom',
      verify: async (page) => {
        await page.locator(rowSelector).first().waitFor()
        const evidence = []
        for (const width of [1920, 2560, 1440, 1024, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          const result = await grid(page)
          assertAlignedGrid(result)
          assert.equal(
            result.horizontalRange > 1,
            result.tableWidth > result.width + 1,
            `仅在列宽超过容器时横向滚动: ${JSON.stringify(result)}`
          )
          await assertNoHorizontalOverflow(page, `BOM 横向铺满 ${width}`)
          evidence.push({ viewport: width, ...result })
          if (width === 1920) await page.screenshot({
            path: path.join(outputDir, 'bom-table-fill-4k.png'),
            animations: 'disabled',
          })
        }
        await writeFile(
          path.join(outputDir, 'bom-table-fill.json'),
          JSON.stringify(evidence, null, 2)
        )
      },
    },
    {
      ...common,
      name: 'business-column-width-empty-recovery',
      path: '/erp/master/partners/customers',
      beforeNavigate: async (page) => {
        const probe = (page.columnWidthProbe = { hold: false, release: null })
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_customers') return route.fallback()
          if (probe.hold)
            await new Promise((resolve) => {
              probe.release = resolve
              probe.onHeld?.()
            })
          const records = params.keyword
            ? []
            : [
                {
                  id: 1,
                  code: 'SIM-COLUMN-001',
                  name: '模拟客户长名称与国际贸易进出口产品设计制造有限责任公司',
                  is_active: true,
                },
              ]
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                data: stylePaginatedRpcData(records, 'customers', params),
              },
            },
          })
        })
      },
      verify: async (page) => {
        await page.locator(rowSelector).first().waitFor()
        for (const width of [1920, 2560, 1440, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          const before = await grid(page)
          assertAlignedGrid(before)
          const search = page
            .locator('.erp-business-operation-panel__search input')
            .first()
          page.columnWidthProbe.hold = true
          const held = new Promise((resolve) => {
            page.columnWidthProbe.onHeld = resolve
          })
          await search.fill('模拟不存在的客户')
          await search.press('Enter')
          await page.locator(`${card} .ant-spin-spinning`).waitFor()
          await held
          const loading = await grid(page)
          assertStableGrid(before, loading)
          assertAlignedGrid(loading)
          page.columnWidthProbe.hold = false
          page.columnWidthProbe.release()
          await page.locator(`${card} .ant-table-placeholder`).waitFor()
          const empty = await grid(page)
          assertStableGrid(before, empty)
          assertAlignedGrid(empty)
          await search.fill('')
          await search.press('Enter')
          await page.locator(rowSelector).first().waitFor()
          const restored = await grid(page)
          assertStableGrid(before, restored)
          assertAlignedGrid(restored)
          await assertTableHeaderControlsFit(page, {
            scenarioName: 'business-column-width-empty-recovery',
          })
          await assertNoHorizontalOverflow(page, `客户列宽 ${width}`)
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        const light = await grid(page)
        await clickERPThemeOption(page, '暗色')
        assertStableGrid(light, await grid(page))
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-column-width-empty-recovery-dark.png'
          ),
        })
      },
    },
    {
      ...common,
      name: 'business-column-width-shipment-defaults',
      path: '/erp/warehouse/shipments',
      adminProfile: {
        erp_preferences: {
          column_orders: { shipments: ['item_count', '__column__13'] },
          hidden_columns: { shipments: ['__column__13'] },
        },
      },
      verify: async (page) => {
        await page.locator(rowSelector).first().waitFor()
        const initial = await grid(page)
        assertAlignedGrid(initial)
        const labels = initial.columns.map((column) => column.label)
        assert.equal(labels.includes('明细行'), false, '已保存的列设置不再显示明细行')
        assert.equal(labels.includes('出货日期'), false, '保留原先隐藏出货日期的设置')
        for (const label of [
          '出货单号',
          '状态',
          '财务审批',
          '收货信息',
          '总净重（克）',
          '备注',
        ])
          assert.ok(labels.includes(label), label)
        for (const label of ['物流信息', '包装信息', '实际运费'])
          assert.equal(labels.includes(label), false, label)
        const csv = await exportCSV(page)
        for (const label of [
          '物流信息',
          '明细行',
          '包装信息',
          '实际运费',
          '收货信息',
          '总净重（克）',
        ])
          assert.ok(
            csv.split('\n')[0].includes(label),
            `${label} 不因默认收起而丢失导出`
          )
        await openBusinessTableTool(page, '列设置')
        const dialog = page.getByRole('dialog', { name: /^列设置/u })
        assert.equal(await dialog.getByRole('checkbox', { name: '明细行', exact: true }).count(), 0)
        assert.equal(await dialog.getByRole('checkbox', { name: '出货日期', exact: true }).isChecked(), false)
        for (const label of ['物流信息', '包装信息', '实际运费'])
          await dialog
            .getByRole('checkbox', { name: label, exact: true })
            .check()
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator(rowSelector).first().waitFor()
        const savedLabels = (await grid(page)).columns.map((column) => column.label)
        assert.equal(savedLabels.includes('出货日期'), false, '保存其他列后仍隐藏出货日期')
        for (const label of ['物流信息', '包装信息', '实际运费'])
          assert.ok(savedLabels.includes(label), label)
        await page.setViewportSize({ width: 390, height: 844 })
        await assertNoHorizontalOverflow(page, '出货可选列窄屏')
        await page.setViewportSize({ width: 1920, height: 1080 })
        await openBusinessTableTool(page, '列设置')
        await dialog.getByRole('button', { name: '恢复默认', exact: true }).click()
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        const restored = await grid(page)
        assertAlignedGrid(restored)
        const restoredLabels = restored.columns.map((column) => column.label)
        assert.ok(restoredLabels.includes('出货日期'))
        assert.deepEqual(restoredLabels.filter((label) => label !== '出货日期'), labels)
      },
    },
    {
      ...common,
      name: 'business-column-width-inventory-defaults',
      path: '/erp/warehouse/inventory',
      verify: async (page) => {
        await page.locator(rowSelector).first().waitFor()
        const balances = await grid(page)
        assertAlignedGrid(balances)
        const identity = page
          .locator(`${rowSelector} .erp-product-identity`)
          .first()
        const identityBounds = await identity.evaluate((node) => {
          const image = node
            .querySelector('.erp-product-identity__picture')
            .getBoundingClientRect()
          const text = node.querySelector('.erp-product-identity__text')
          const range = document.createRange()
          range.selectNodeContents(text)
          const painted = [...range.getClientRects()].filter(
            (rect) => rect.width > 0
          )
          const box = (element) => {
            const rect = element.getBoundingClientRect()
            return { left: rect.left, right: rect.right, width: rect.width }
          }
          const style = getComputedStyle(text)
          return {
            imageRight: image.right,
            textLeft: Math.min(...painted.map((rect) => rect.left)),
            textRight: Math.max(...painted.map((rect) => rect.right)),
            identity: box(node),
            text: box(text),
            parent: box(node.parentElement),
            styles: {
              gridTemplateColumns: style.gridTemplateColumns,
              justifyContent: style.justifyContent,
              textAlign: style.textAlign,
              whiteSpace: style.whiteSpace,
              wordBreak: style.wordBreak,
            },
          }
        })
        assert.ok(
          identityBounds.textLeft >= identityBounds.imageRight,
          `产品名称不能被图片遮住: ${JSON.stringify(identityBounds)}`
        )
        assert.ok(
          identityBounds.textRight <= identityBounds.identity.right + 1,
          `产品名称应在身份栏内换行: ${JSON.stringify(identityBounds)}`
        )
        await page.screenshot({
          path: path.join(outputDir, 'inventory-defaults-4k.png'),
          animations: 'disabled',
        })
        const labels = balances.columns.map((column) => column.label)
        for (const label of [
          '账面数量',
          '已预留',
          '未预留数量',
          '材料可领用',
          '受限库存',
          '待成品检验',
          '待查货包装',
          '可发货数量',
          '批次',
        ])
          assert.ok(labels.includes(label), label)
        assert.equal(labels.includes('库存项'), false)
        await page.locator(rowSelector).first().dblclick()
        const balanceDetails = page.getByRole('dialog', {
          name: /库存余额详情/u,
        })
        await balanceDetails.getByText('存货类型', { exact: true }).waitFor()
        await balanceDetails.locator('.ant-modal-close').click()
        const csv = await exportCSV(page)
        for (const label of [
          '存货类型',
          '库存项',
          '受限库存',
          '待成品检验',
          '待查货包装',
          '可发货数量',
        ])
          assert.ok(csv.split('\n')[0].includes(label), label)
        await selectWarehouseView(page, '库存变动记录')
        await page.locator(rowSelector).first().waitFor()
        const transactions = await grid(page)
        assertAlignedGrid(transactions)
        await page.screenshot({
          path: path.join(outputDir, 'inventory-transactions-defaults-4k.png'),
          animations: 'disabled',
        })
        assert.ok(
          transactions.columns.some((column) => column.label === '来源单据')
        )
        await page.locator(rowSelector).first().dblclick()
        const transactionDetails = page.getByRole('dialog', {
          name: /库存变动记录详情/u,
        })
        await transactionDetails
          .getByText('来源明细', { exact: true })
          .waitFor()
        await transactionDetails
          .getByText('原库存变动记录', { exact: true })
          .waitFor()
        await transactionDetails.locator('.ant-modal-close').click()
        await page.setViewportSize({ width: 390, height: 844 })
        await assertNoHorizontalOverflow(page, '库存变动窄屏')
        await page.setViewportSize({ width: 1920, height: 1080 })
      },
    },
  ]
}
