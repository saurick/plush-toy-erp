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
      title: '计划 / 实际出货',
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
    'pages/BOMVersionsPage.jsx',
    'pages/ShipmentsPage.jsx',
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
  assert.match(masterDataColumns, /applyBusinessColumnSorters\(/u)
  assert.match(salesOrdersPage, /buildSalesOrderColumns\(/u)
  assert.match(salesOrdersPage, /buildSalesOrderItemColumns\(/u)
  assert.match(salesOrderColumns, /applyBusinessColumnSorters\(/u)
  assert.match(purchaseOrdersPage, /buildPurchaseOrderColumns\(/u)
  assert.match(purchaseOrderColumns, /applyBusinessColumnSorters\(/u)
})
