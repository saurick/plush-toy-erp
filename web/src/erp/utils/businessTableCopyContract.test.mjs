import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement, useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createReactTestHarness, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { resolveBusinessDetailCopyText, resolveBusinessTableCopyText } from './businessTableCopy.mjs'
import { deliverySnapshotFormValues } from './sourcePartySnapshots.mjs'

registerJSXTestLoader()

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(currentDirectory, '..')

function readSource(relativePath) {
  return readFileSync(resolve(sourceRoot, relativePath), 'utf8')
}

function assertCopyableMarker(relativePath, marker, sectionMarker = '') {
  const source = readSource(relativePath)
  const sectionIndex = sectionMarker ? source.indexOf(sectionMarker) : 0
  assert.notEqual(
    sectionIndex,
    -1,
    `${relativePath} must keep section ${sectionMarker}`
  )
  const markerIndex = source.indexOf(marker, sectionIndex)
  assert.notEqual(markerIndex, -1, `${relativePath} must keep ${marker}`)
  assert.match(
    source.slice(markerIndex, markerIndex + 520),
    /\bcopyable\s*:/u,
    `${relativePath} ${marker} must stay in the copy whitelist`
  )
}

test('a new business table column opts into the shared copy control and keeps row actions separate', async (t) => {
  const { act, container, render, runtimeWindow } = await createReactTestHarness(t)
  const { normalizeBusinessTableColumns } = await import('../components/business-list/BusinessListLayout.jsx')
  const [reference, note] = normalizeBusinessTableColumns([
    {
      title: '来源单号',
      dataIndex: 'external_reference',
      copyable: true,
      render: (value) => value ? `来源 ${value}` : '未填写',
    },
    { title: '备注', dataIndex: 'note', render: (value) => value },
  ])
  const writes = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value) => { writes.push(value) } },
  })
  const rowEvents = []
  const renderRow = (value) => render(createElement('div', {
    onClick: () => rowEvents.push('click'),
    onDoubleClick: () => rowEvents.push('dblclick'),
  }, reference.render(value, { external_reference: value }, 0), note.render('备注内容', {}, 0)))

  await renderRow('SO-NEW-001')
  assert.match(container.textContent, /来源 SO-NEW-001.*备注内容/u)
  const copy = container.querySelector('button[aria-label="复制来源单号"]')
  assert.ok(copy?.classList.contains('erp-business-copy-button'))
  assert.equal(container.querySelectorAll('button').length, 1)

  const sendMouseEvent = (type, detail) => act(async () => {
    copy.dispatchEvent(new runtimeWindow.MouseEvent(type, { bubbles: true, detail }))
  })
  copy.focus()
  await sendMouseEvent('click', 0)
  assert.equal(document.activeElement === copy, true, 'keyboard activation retains focus')
  await sendMouseEvent('click', 1)
  assert.equal(document.activeElement === copy, false, 'pointer activation releases focus')
  await sendMouseEvent('dblclick', 2)
  assert.deepEqual(writes, ['SO-NEW-001', 'SO-NEW-001'])
  assert.deepEqual(rowEvents, [])

  await renderRow('')
  assert.equal(container.textContent, '未填写备注内容')
  assert.equal(container.querySelectorAll('button').length, 0)
})

test('formal business main tables register useful text columns explicitly', () => {
  const expectations = [
    ['components/master-data/masterDataColumns.jsx', "dataIndex: 'code'"],
    [
      'components/sales-orders/salesOrderColumns.jsx',
      "dataIndex: 'order_no'",
      'export function buildSalesOrderColumns',
    ],
    [
      'components/purchase-orders/purchaseOrderColumns.jsx',
      "dataIndex: 'purchase_order_no'",
    ],
    [
      'components/quality-inspections/qualityInspectionColumns.jsx',
      "dataIndex: 'inspection_no'",
      'export function buildQualityInspectionDataColumns',
    ],
    ['components/bom/BOMVersionColumns.jsx', "dataIndex: 'version'"],
    ['components/bom/BOMVersionColumns.jsx', "dataIndex: 'source_order_no'"],
    [
      'components/outsourcing-orders/outsourcingOrderColumns.jsx',
      "dataIndex: 'outsourcing_order_no'",
    ],
    ['components/shipments/shipmentColumns.jsx', "dataIndex: 'shipment_no'"],
    [
      'components/operational-facts/operationalFactPageConfig.mjs',
      "copyable: { label: '单号' }",
    ],
    ['pages/PurchaseReceiptsPage.jsx', "dataIndex: 'receipt_no'"],
    ['components/finance/useFinancePaymentColumns.jsx', "dataIndex: 'payment_no'"],
    ['pages/WorkflowBusinessModulePage.jsx', "dataIndex: 'task_code'"],
    ['pages/ProductionOrdersPage.jsx', "dataIndex: 'order_no'"],
    ['pages/HistoryRecordsPage.jsx', "dataIndex: 'primary'"],
    ['components/inventory/inventoryLedgerPresentation.jsx', "dataIndex: 'lot_no'"],
  ]

  expectations.forEach(([relativePath, marker, sectionMarker]) =>
    assertCopyableMarker(relativePath, marker, sectionMarker)
  )
})

test('sales order contacts keep missing values safe and copy text independent of the stacked display', async () => {
  const { buildSalesOrderColumns } = await import('../components/sales-orders/salesOrderColumns.jsx')
  const contact = buildSalesOrderColumns().find(({ dataIndex }) => dataIndex === 'contact_snapshot')
  for (const [snapshot, display, copy] of [
    [undefined, '-', ''],
    [null, '-', ''],
    [{}, '-', ''],
    [{ name: '小吴' }, '小吴', '小吴'],
    [{ phone: '010-12345678' }, '010-12345678', '010-12345678'],
    [{ name: '小吴', mobile: '13800000000', phone: '010-12345678' }, '小吴13800000000', '小吴 13800000000'],
  ]) {
    const record = { contact_snapshot: snapshot, order_no: 'must-not-be-rendered' }
    const markup = renderToStaticMarkup(contact.render(snapshot, record, 0))
    assert.equal(markup.replace(/<[^>]*>/gu, ''), display)
    assert.equal(contact.copyable.resolveValue(snapshot, record), copy)
    assert.equal(contact.exportValue(record), copy)
    assert.doesNotMatch(markup, /must-not-be-rendered|\[object Object\]/u)
  }
})

test('sales, shipment and customer columns copy the visible delivery fields together', async () => {
  const [{ buildSalesOrderColumns }, { buildShipmentColumns }, { buildMasterDataRecordColumns }] = await Promise.all([
    import('../components/sales-orders/salesOrderColumns.jsx'),
    import('../components/shipments/shipmentColumns.jsx'),
    import('../components/master-data/masterDataColumns.jsx'),
  ])
  const delivery = { recipient: '模拟收货人', phone: '020-****0001', country_region: '中国', address: '示例路 10 号' }
  const expected = '收货人：模拟收货人\n收货电话：020-****0001\n国家 / 地区：中国\n收货地址：示例路 10 号'
  for (const columns of [buildSalesOrderColumns(), buildShipmentColumns({ salesOrdersByID: new Map() })]) {
    const column = columns.find(({ dataIndex }) => dataIndex === 'delivery_snapshot')
    const record = { delivery_snapshot: delivery }
    assert.equal(resolveBusinessTableCopyText(column, delivery, record), expected)
    assert.equal(resolveBusinessDetailCopyText(column, record), expected)
    assert.equal(column.exportValue(record), '中国 模拟收货人 020-****0001 示例路 10 号')
    assert.equal(resolveBusinessDetailCopyText(column, { delivery_snapshot: { address: '-', country_region: '中国' } }), '')
  }
  const column = buildMasterDataRecordColumns({ type: 'customers' }).find(({ key }) => key === 'default_delivery')
  assert.equal(resolveBusinessDetailCopyText(column, {
    country_region: '中国',
    default_delivery_address: '新示例地址',
  }), '收货地址：新示例地址')
})

test('read-only delivery copy follows replaced and cleared form fields', async (t) => {
  const { act, container, render } = await createReactTestHarness(t)
  const [{ Form }, { default: DeliveryAddressFields }] = await Promise.all([
    import('antd'),
    import('../components/business-list/DeliveryAddressFields.jsx'),
  ])
  const writes = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value) => { writes.push(value) } },
  })
  function Preview({ snapshot }) {
    const [form] = Form.useForm()
    useEffect(() => { form.setFieldsValue(deliverySnapshotFormValues(snapshot)) }, [form, snapshot])
    return createElement(Form, { form, disabled: true }, createElement(DeliveryAddressFields, { form, disabled: true }))
  }
  const copy = () => container.querySelector('button[aria-label="复制收货信息"]')
  await render(createElement(Preview, { snapshot: { recipient: '模拟收货人', phone: '020-****0001' } }))
  assert.ok(copy())
  assert.equal(copy().disabled, false)
  await act(async () => copy().click())
  await render(createElement(Preview, { snapshot: { address: '新示例地址' } }))
  await act(async () => copy().click())
  assert.deepEqual(writes, ['收货人：模拟收货人\n收货电话：020-****0001', '收货地址：新示例地址'])
  await render(createElement(Preview, { snapshot: {} }))
  assert.equal(Boolean(copy()), false)
})

test('copy whitelist avoids routine dates, amounts, quantities and statuses', () => {
  const sources = [
    'components/sales-orders/salesOrderColumns.jsx',
    'components/purchase-orders/purchaseOrderColumns.jsx',
    'components/quality-inspections/qualityInspectionColumns.jsx',
    'components/shipments/shipmentColumns.jsx',
    'components/inventory/inventoryLedgerPresentation.jsx',
  ].map(readSource)
  const forbiddenFields = [
    'amount',
    'goods_amount',
    'lifecycle_status',
    'planned_delivery_date',
    'quantity',
    'status',
  ]

  for (const source of sources) {
    for (const field of forbiddenFields) {
      const marker = `dataIndex: '${field}'`
      let searchFrom = 0
      while (source.indexOf(marker, searchFrom) >= 0) {
        const markerIndex = source.indexOf(marker, searchFrom)
        const lineStart = source.lastIndexOf('\n', markerIndex) + 1
        const indent =
          source.slice(lineStart, markerIndex).match(/^\s*/u)?.[0] || ''
        const closingToken = `\n${indent.slice(0, -2)}},`
        const lineEnd = source.indexOf('\n', markerIndex)
        const sameLineEnd = source.slice(markerIndex, lineEnd).indexOf('},')
        const nextColumnIndex =
          sameLineEnd >= 0
            ? markerIndex + sameLineEnd
            : source.indexOf(closingToken, markerIndex)
        const columnTail = source.slice(markerIndex, nextColumnIndex)
        assert.doesNotMatch(
          columnTail,
          /\bcopyable\s*:/u,
          `${marker} must not gain a copy action`
        )
        searchFrom = markerIndex + marker.length
      }
    }
  }
})
