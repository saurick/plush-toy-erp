import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  applyBusinessColumnSorters,
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  compareBusinessTableValues,
  createBusinessColumnSorter,
  filterBusinessListColumns,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  resolveModuleColumnKey,
  sanitizeModuleColumnOrder,
} from './moduleTableColumns.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const erpSourceRoot = resolve(__dirname, '..')

const columns = [
  { label: '编码', key: 'code' },
  { label: '客户', key: 'customerName' },
  { label: '金额', key: 'amount' },
]

function listFilesRecursively(rootDir) {
  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(rootDir, entry.name)
    if (entry.isDirectory()) {
      return listFilesRecursively(fullPath)
    }
    return [fullPath]
  })
}

test('moduleTableColumns: 会生成稳定列顺序 key', () => {
  assert.deepEqual(buildModuleColumnOrder(columns), [
    'code',
    'customerName',
    'amount',
  ])
})

test('moduleTableColumns: 会过滤非法和重复列 key', () => {
  assert.deepEqual(
    sanitizeModuleColumnOrder(['amount', 'unknown', 'amount', 'code'], columns),
    ['amount', 'code']
  )
})

test('moduleTableColumns: 会按用户顺序重排列，并把新增列补到末尾', () => {
  assert.deepEqual(applyModuleColumnOrder(columns, ['amount', 'code']), [
    columns[2],
    columns[0],
    columns[1],
  ])
})

test('moduleTableColumns: 默认优先级前置业务判断字段，不改变原始列定义', () => {
  const businessColumns = [
    { dataIndex: 'order_no', defaultPriority: 10 },
    { dataIndex: 'note' },
    { dataIndex: 'amount', defaultPriority: 40 },
    { dataIndex: 'status', defaultPriority: 20 },
    { dataIndex: 'due_at', defaultPriority: 30 },
  ]
  const originalColumns = businessColumns.slice()
  const expected = ['order_no', 'status', 'due_at', 'amount', 'note']
  assert.deepEqual(buildModuleColumnOrder(businessColumns), expected)
  assert.deepEqual(
    applyModuleColumnOrder(businessColumns).map((column) => column.dataIndex),
    expected
  )
  assert.deepEqual(businessColumns, originalColumns)
  assert.deepEqual(
    buildModuleColumnOrder([{ dataIndex: 'name' }, { dataIndex: 'status' }]),
    ['name', 'status'],
    '没有显式优先级的列表继续使用自身顺序，不根据字段名猜测业务'
  )
})

test('moduleTableColumns: 个人顺序优先，新增列按默认优先级追加，清空恢复新默认', () => {
  const businessColumns = [
    { dataIndex: 'order_no', defaultPriority: 10 },
    { dataIndex: 'note' },
    { dataIndex: 'amount', defaultPriority: 40 },
    { dataIndex: 'status', defaultPriority: 20 },
    { dataIndex: 'due_at', defaultPriority: 30 },
  ]
  const savedOrder = ['note', 'amount', 'order_no', 'status']
  assert.deepEqual(
    applyModuleColumnOrder(businessColumns, savedOrder).map(
      (column) => column.dataIndex
    ),
    [...savedOrder, 'due_at']
  )
  assert.deepEqual(
    applyModuleColumnOrder(businessColumns, []).map(
      (column) => column.dataIndex
    ),
    ['order_no', 'status', 'due_at', 'amount', 'note']
  )
  assert.deepEqual(moveModuleColumnOrder([], businessColumns, 'status', 1), [
    'order_no',
    'due_at',
    'status',
    'amount',
    'note',
  ])
})

test('moduleTableColumns: 默认排序不改变展示列的已保存标识或快捷移动对象', () => {
  const businessColumns = [
    { title: '单号', dataIndex: 'order_no', defaultPriority: 10 },
    { title: '收货信息' },
    { title: '出货日期', defaultPriority: 30 },
    { title: '状态', dataIndex: 'status', defaultPriority: 20 },
  ]
  assert.deepEqual(buildModuleColumnOrder(businessColumns), [
    'order_no',
    'status',
    '__column__2',
    '__column__1',
  ])
  const savedOrder = ['__column__1', 'order_no', '__column__2', 'status']
  assert.deepEqual(
    applyModuleColumnOrder(businessColumns, savedOrder).map(
      (column) => column.title
    ),
    ['收货信息', '单号', '出货日期', '状态']
  )
  assert.equal(
    resolveModuleColumnKey(businessColumns[2], businessColumns),
    '__column__2'
  )
  assert.deepEqual(
    repositionModuleColumnOrder([], businessColumns, '__column__2', 0),
    ['__column__2', 'order_no', 'status', '__column__1']
  )
})

test('moduleTableColumns: 相同优先级保持声明顺序，非法优先级和隐藏字段不抢占前列', () => {
  const businessColumns = [
    { dataIndex: 'note', defaultPriority: '1' },
    { dataIndex: 'amount', defaultPriority: 20 },
    { dataIndex: 'currency', defaultPriority: 20 },
    { dataIndex: 'status', defaultPriority: 10 },
    {
      dataIndex: 'hidden',
      defaultPriority: 0,
      hiddenByEffectiveFieldPolicy: true,
    },
    { dataIndex: 'tail', defaultPriority: NaN },
  ]
  assert.deepEqual(buildModuleColumnOrder(businessColumns), [
    'status',
    'amount',
    'currency',
    'note',
    'tail',
  ])
})

test('moduleTableColumns: 辅助字段退出列表但保留详情和导出，权限隐藏仍优先', () => {
  const allColumns = [
    { dataIndex: 'code', defaultPriority: 10 },
    { dataIndex: 'short_name', listHidden: true },
    { title: '业务摘要', defaultPriority: 30 },
    { dataIndex: 'status', defaultPriority: 20 },
    { dataIndex: 'tax_no', listHidden: true, hiddenByEffectiveFieldPolicy: true },
  ]
  const original = structuredClone(allColumns)
  const saved = ['short_name', '__column__2', 'tax_no', 'code']
  assert.deepEqual(buildModuleColumnOrder(allColumns), [
    'code', 'status', '__column__2',
  ])
  assert.deepEqual(sanitizeModuleColumnOrder(saved, allColumns), [
    '__column__2', 'code',
  ])
  const ordered = applyModuleColumnOrder(allColumns, saved)
  assert.deepEqual(ordered, [
    allColumns[2], allColumns[0], allColumns[3], allColumns[1],
  ])
  assert.deepEqual(filterBusinessListColumns(ordered), [
    allColumns[2], allColumns[0], allColumns[3],
  ])
  assert.deepEqual(allColumns, original)
})

test('moduleTableColumns: 快捷移动和恢复默认不经过辅助列，展示列标识稳定', () => {
  const allColumns = [
    { dataIndex: 'code' },
    { dataIndex: 'short_name', listHidden: true },
    { title: '摘要' },
    { dataIndex: 'status' },
  ]
  assert.deepEqual(moveModuleColumnOrder([], allColumns, 'code', 1), [
    '__column__2', 'code', 'status',
  ])
  assert.deepEqual(repositionModuleColumnOrder([], allColumns, 'status', 0), [
    'status', 'code', '__column__2',
  ])
  assert.deepEqual(
    filterBusinessListColumns(applyModuleColumnOrder(allColumns, [])),
    [allColumns[0], allColumns[2], allColumns[3]]
  )
  assert.deepEqual(filterBusinessListColumns(undefined), [])
})

test('moduleTableColumns: 支持列顺序上移和下移', () => {
  assert.deepEqual(
    moveModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'amount',
      -1
    ),
    ['code', 'amount', 'customerName']
  )
  assert.deepEqual(
    moveModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'code',
      -1
    ),
    ['code', 'customerName', 'amount']
  )
})

test('moduleTableColumns: 支持把列移动到指定位置', () => {
  assert.deepEqual(
    repositionModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'amount',
      0
    ),
    ['amount', 'code', 'customerName']
  )
  assert.deepEqual(
    repositionModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'code',
      2
    ),
    ['customerName', 'amount', 'code']
  )
})

test('moduleTableColumns: 无 dataIndex/key 的展示列按原始列位置解析顺序 key', () => {
  const displayColumns = [
    { title: '单号', dataIndex: 'order_no' },
    {
      title: '客户',
      sortValue: (record) => record.customer_snapshot,
      render: (_, record) => record.customer_snapshot || '-',
    },
    {
      title: '计划出货日期 / 实际出货日期',
      sortValue: (record) => record.shipped_at || record.planned_ship_at,
      render: (_, record) => record.shipped_at || record.planned_ship_at || '-',
    },
  ]

  assert.deepEqual(buildModuleColumnOrder(displayColumns), [
    'order_no',
    '__column__1',
    '__column__2',
  ])
  assert.equal(
    resolveModuleColumnKey(displayColumns[1], displayColumns),
    '__column__1'
  )
  assert.deepEqual(
    moveModuleColumnOrder(
      buildModuleColumnOrder(displayColumns),
      displayColumns,
      resolveModuleColumnKey(displayColumns[1], displayColumns),
      -1
    ),
    ['__column__1', 'order_no', '__column__2']
  )
})

test('moduleTableColumns: 业务主表排序空值稳定排最后', () => {
  assert.equal(compareBusinessTableValues('', 'A', 'ascend'), 1)
  assert.equal(compareBusinessTableValues('', 'A', 'descend'), -1)
  assert.equal(compareBusinessTableValues('B', 'A', 'ascend'), 1)
})

test('moduleTableColumns: 业务主表排序支持 dataIndex、sortValue 与显式跳过', () => {
  const businessColumns = applyBusinessColumnSorters([
    { title: '编号', dataIndex: 'code' },
    { title: '数量', key: 'quantity', sortValue: (record) => record.qty },
    { title: '备注', dataIndex: 'note', sortable: false },
  ])

  assert.equal(typeof businessColumns[0].sorter, 'function')
  assert.equal(typeof businessColumns[1].sorter, 'function')
  assert.equal(businessColumns[2].sorter, undefined)
  assert.equal(
    businessColumns[0].sorter({ code: 'A2' }, { code: 'A10' }, 'ascend'),
    -1
  )
  assert.equal(businessColumns[1].sorter({ qty: 12 }, { qty: 3 }, 'ascend'), 9)
})

test('moduleTableColumns: 业务主表排序可读取嵌套路径', () => {
  const sorter = createBusinessColumnSorter({
    dataIndex: 'customer.name',
  })

  assert.equal(
    sorter({ customer: { name: '客户B' } }, { customer: { name: '客户A' } }),
    1
  )
})

test('moduleTableColumns: ERP 表格列禁止配置省略属性', () => {
  const sourceFiles = listFilesRecursively(erpSourceRoot).filter(
    (filePath) =>
      /\.(mjs|js|jsx)$/u.test(filePath) && !/\.test\./u.test(filePath)
  )
  const offenders = sourceFiles.flatMap((filePath) => {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    return lines.flatMap((line, index) =>
      /\bellipsis\s*:/u.test(line)
        ? [`${filePath.replace(`${erpSourceRoot}/`, '')}:${index + 1}`]
        : []
    )
  })

  assert.deepEqual(offenders, [])
})

test('moduleTableColumns: 主业务列表页使用共享排序入口', () => {
  const mainBusinessTableFiles = [
    'pages/WorkflowBusinessModulePage.jsx',
    'pages/V1PurchaseReceiptsPage.jsx',
    'components/bom/BOMVersionColumns.jsx',
    'components/shipments/shipmentColumns.jsx',
  ]

  const missing = mainBusinessTableFiles.filter((relativePath) => {
    const content = readFileSync(resolve(erpSourceRoot, relativePath), 'utf8')
    return !content.includes('applyBusinessColumnSorters(')
  })

  assert.deepEqual(missing, [])

  const masterDataPage = readFileSync(
    resolve(erpSourceRoot, 'pages/V1MasterDataPage.jsx'),
    'utf8'
  )
  const masterDataColumns = readFileSync(
    resolve(erpSourceRoot, 'components/master-data/masterDataColumns.jsx'),
    'utf8'
  )
  const salesOrdersPage = readFileSync(
    resolve(erpSourceRoot, 'pages/V1SalesOrdersPage.jsx'),
    'utf8'
  )
  const salesOrderColumns = readFileSync(
    resolve(erpSourceRoot, 'components/sales-orders/salesOrderColumns.jsx'),
    'utf8'
  )
  const purchaseOrdersPage = readFileSync(
    resolve(erpSourceRoot, 'pages/V1PurchaseOrdersPage.jsx'),
    'utf8'
  )
  const purchaseOrderColumns = readFileSync(
    resolve(
      erpSourceRoot,
      'components/purchase-orders/purchaseOrderColumns.jsx'
    ),
    'utf8'
  )
  assert.match(masterDataPage, /buildMasterDataRecordColumns\(/u)
  assert.match(masterDataPage, /filterColumnsByEffectiveFieldPolicy\(/u)
  assert.match(masterDataColumns, /applyBusinessColumnSorters\(/u)
  assert.match(salesOrdersPage, /buildSalesOrderColumns\(/u)
  assert.match(salesOrderColumns, /applyBusinessColumnSorters\(/u)
  assert.match(purchaseOrdersPage, /buildPurchaseOrderColumns\(/u)
  assert.match(purchaseOrderColumns, /applyBusinessColumnSorters\(/u)
})

test('moduleTableColumns: formal field contracts do not retain inactive field policy aliases', () => {
  const files = {
    masterDataColumns: readFileSync(
      resolve(erpSourceRoot, 'components/master-data/masterDataColumns.jsx'),
      'utf8'
    ),
    salesOrderColumns: readFileSync(
      resolve(erpSourceRoot, 'components/sales-orders/salesOrderColumns.jsx'),
      'utf8'
    ),
    purchaseOrderColumns: readFileSync(
      resolve(
        erpSourceRoot,
        'components/purchase-orders/purchaseOrderColumns.jsx'
      ),
      'utf8'
    ),
    outsourcingOrderColumns: readFileSync(
      resolve(
        erpSourceRoot,
        'components/outsourcing-orders/outsourcingOrderColumns.jsx'
      ),
      'utf8'
    ),
    shipmentColumns: readFileSync(
      resolve(erpSourceRoot, 'components/shipments/shipmentColumns.jsx'),
      'utf8'
    ),
    qualityInspectionColumns: readFileSync(
      resolve(
        erpSourceRoot,
        'components/quality-inspections/qualityInspectionColumns.jsx'
      ),
      'utf8'
    ),
  }

  assert.doesNotMatch(files.purchaseOrderColumns, /effectiveFieldKey/u)
  assert.doesNotMatch(files.outsourcingOrderColumns, /effectiveFieldKey/u)
  assert.doesNotMatch(files.shipmentColumns, /effectiveFieldKey/u)
  assert.doesNotMatch(files.qualityInspectionColumns, /effectiveFieldKey/u)
  assert.match(files.masterDataColumns, /effectiveFieldKey:\s*'supplier_type'/u)
  assert.doesNotMatch(files.masterDataColumns, /effectiveFieldKey:\s*'tax_no'/u)
  assert.match(files.salesOrderColumns, /effectiveFieldKey:\s*'source_no'/u)
  assert.match(
    files.salesOrderColumns,
    /effectiveFieldKey:\s*'expected_ship_date'/u
  )
})
