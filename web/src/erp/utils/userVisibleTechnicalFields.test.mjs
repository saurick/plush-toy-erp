import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const scanDirs = ['pages', 'components', 'mobile'].map((dir) =>
  join(rootDir, dir)
)
const scanFiles = ['utils/referenceSelectOptions.mjs'].map((file) =>
  join(rootDir, file)
)
scanFiles.push(join(rootDir, 'utils/dashboardTaskDisplay.mjs'))

const sourceExtensions = new Set(['.js', '.jsx', '.mjs'])
const businessVisibleScanDirs = ['pages', 'components'].map((dir) =>
  join(rootDir, dir)
)
const businessVisibleConfigFiles = [
  'config/businessModules.mjs',
  'config/devPrototypes.mjs',
].map((file) => join(rootDir, file))
const forbiddenUserVisibleText = [
  '幂等键',
  '内部引用',
  '内部主键',
  '内部流水',
  '内部批次',
  '内部余额',
  '内部记录',
  '内部来源',
  '客户 #',
  '供应商 #',
  '材料 #',
  '产品 #',
  'SKU #',
  '单位 #',
  '仓库 #',
  '销售订单 #',
  '销售订单行 #',
  '采购订单 #',
  '采购订单行 #',
  '采购入库 #',
  '采购入库单 #',
  '加工合同 ${',
  '出货单 #',
  '入库行 #',
  '批次 #',
  '管理员 #',
  '主键',
  '关联来源必须',
  '填写关联来源记录',
  '缺少出货单 ID',
  '来源选择器',
]
const forbiddenBusinessArchitectureText = ['生命周期']
const forbiddenBusinessSystemTimestampText = [
  '创建时间',
  '更新时间',
  '创建日期',
  '更新日期',
]

function isSourceFile(filePath) {
  return [...sourceExtensions].some((extension) => filePath.endsWith(extension))
}

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSourceFiles(path)
    }
    if (!entry.isFile() || !isSourceFile(path) || path.endsWith('.test.mjs')) {
      return []
    }
    return [path]
  })
}

test('业务前端页面不暴露技术实现字段文案', () => {
  const violations = []
  for (const dir of scanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const filePath of collectSourceFiles(dir)) {
      const content = readFileSync(filePath, 'utf8')
      for (const text of forbiddenUserVisibleText) {
        if (content.includes(text)) {
          violations.push(`${relative(rootDir, filePath)}: ${text}`)
        }
      }
    }
  }
  for (const filePath of scanFiles) {
    if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) continue
    const content = readFileSync(filePath, 'utf8')
    for (const text of forbiddenUserVisibleText) {
      if (content.includes(text)) {
        violations.push(`${relative(rootDir, filePath)}: ${text}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('业务可见文案不暴露架构状态机术语', () => {
  const violations = []
  const files = []
  for (const dir of scanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    files.push(...collectSourceFiles(dir))
  }
  for (const filePath of businessVisibleConfigFiles) {
    if (statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      files.push(filePath)
    }
  }

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    for (const text of forbiddenBusinessArchitectureText) {
      if (content.includes(text)) {
        violations.push(`${relative(rootDir, filePath)}: ${text}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('普通业务页面不默认展示系统创建更新时间', () => {
  const violations = []
  for (const dir of businessVisibleScanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const filePath of collectSourceFiles(dir)) {
      const content = readFileSync(filePath, 'utf8')
      for (const text of forbiddenBusinessSystemTimestampText) {
        if (content.includes(text)) {
          violations.push(`${relative(rootDir, filePath)}: ${text}`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('销售订单日期字段使用业务可见口径并保留弹窗日期控件', () => {
  const salesOrderFiles = [
    'components/sales-orders/SalesOrderForm.jsx',
    'components/sales-orders/salesOrderColumns.jsx',
    'components/sales-orders/salesOrderPageConfig.mjs',
  ].map((file) => join(rootDir, file))
  const combined = salesOrderFiles
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.match(combined, /label="签约日期"/u)
  assert.match(combined, /name="order_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="计划交付日期"/u)
  assert.match(combined, /name="planned_delivery_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /title: '签约日期'/u)
  assert.match(combined, /title: '计划交付日期'/u)
  assert.match(combined, /label: '签约日期'/u)
  assert.match(combined, /label: '计划交付日期'/u)
  assert.doesNotMatch(combined, /订单日期/u)
  assert.doesNotMatch(combined, /title: '计划交付'/u)
  assert.doesNotMatch(combined, /label: '计划交付'/u)
})

test('业务日期字段使用完整且一致的用户可见口径', () => {
  const businessDateFiles = [
    'components/purchase-orders/PurchaseOrderForm.jsx',
    'components/purchase-orders/purchaseOrderColumns.jsx',
    'components/purchase-orders/purchaseOrderPageConfig.mjs',
    'components/outsourcing-orders/OutsourcingOrderForm.jsx',
    'components/outsourcing-orders/outsourcingOrderColumns.jsx',
    'components/outsourcing-orders/outsourcingOrderPageConfig.mjs',
    'components/shipments/ShipmentBusinessModal.jsx',
    'components/shipments/shipmentColumns.jsx',
    'components/operational-facts/operationalFactPageConfig.mjs',
    'config/businessModules.mjs',
  ].map((file) => join(rootDir, file))
  const combined = businessDateFiles
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.match(combined, /label="下单日期"/u)
  assert.match(combined, /name="purchase_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="预计到货日期"/u)
  assert.match(combined, /name="expected_arrival_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="预计回货日期"/u)
  assert.match(combined, /name="expected_return_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="计划出货日期"/u)
  assert.match(combined, /title: '计划出货日期 \/ 实际出货日期'/u)
  assert.doesNotMatch(combined, /采购日期/u)
  assert.doesNotMatch(combined, /['"`]预计到货['"`]/u)
  assert.doesNotMatch(combined, /['"`]预计回货['"`]/u)
  assert.doesNotMatch(combined, /['"`]计划出货['"`]/u)
  assert.doesNotMatch(combined, /['"`]实际出货['"`]/u)
  assert.doesNotMatch(combined, /计划 \/ 实际出货/u)
})
