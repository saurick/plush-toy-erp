import assert from 'node:assert/strict'
import test from 'node:test'
import { Linter } from 'eslint'
import { readContractSource } from '../../../scripts/test/publicContractSource.mjs'
import * as contracts from '../../common/consts/statuses.generated.mjs'

function presentationKeys(relative, name) {
  const url = new URL(relative, import.meta.url)
  const source = readContractSource(url)
  let result
  const rule = { create() { return {
    VariableDeclarator(node) {
      if (node.id.name !== name) return
      const value = node.init?.type === 'CallExpression' || node.init?.type === 'NewExpression' ? node.init.arguments[0] : node.init
      if (value?.type === 'ObjectExpression') result = value.properties.map((property) => property.key.value ?? property.key.name)
      else if (value?.type === 'ArrayExpression') result = value.elements.map((entry) => entry.type === 'Literal' ? entry.value : entry.properties.find((property) => property.key.name === 'value')?.value.value)
    },
  } } }
  const messages = new Linter().verify(source, [{
    files: ['**/*.{mjs,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { coverage: { rules: { keys: rule } } },
    rules: { 'coverage/keys': 'error' },
  }], { filename: url.pathname, allowInlineConfig: false })
  assert.deepEqual(messages, [])
  assert(Array.isArray(result), `${relative}: ${name} must remain inspectable`)
  return result.filter((key) => key !== '')
}

for (const [file, name, ...domains] of [
  ['./masterDataOrderView.mjs', 'SALES_ORDER_STATUS_LABELS', 'SalesOrderStatus'],
  ['./masterDataOrderView.mjs', 'SALES_ORDER_STATUS_COLORS', 'SalesOrderStatus'],
  ['./masterDataOrderView.mjs', 'SALES_ORDER_ITEM_STATUS_LABELS', 'SalesOrderItemStatus'],
  ['./masterDataOrderView.mjs', 'PURCHASE_ORDER_STATUS_LABELS', 'PurchaseOrderStatus'],
  ['./masterDataOrderView.mjs', 'PURCHASE_ORDER_STATUS_COLORS', 'PurchaseOrderStatus'],
  ['./masterDataOrderView.mjs', 'PURCHASE_ORDER_ITEM_STATUS_LABELS', 'PurchaseOrderItemStatus'],
  ['./masterDataOrderView.mjs', 'OUTSOURCING_ORDER_STATUS_LABELS', 'OutsourcingOrderStatus'],
  ['./masterDataOrderView.mjs', 'OUTSOURCING_ORDER_STATUS_COLORS', 'OutsourcingOrderStatus'],
  ['./masterDataOrderView.mjs', 'OUTSOURCING_ORDER_ITEM_STATUS_LABELS', 'OutsourcingOrderItemStatus'],
  ['./masterDataOrderView.mjs', 'SOURCE_DOCUMENT_ITEM_STATUS_TONES', 'SalesOrderItemStatus', 'PurchaseOrderItemStatus', 'OutsourcingOrderItemStatus'],
  ['./productionOrderModel.mjs', 'PRODUCTION_ORDER_STATUS_META', 'ProductionOrderStatus'],
  ['./businessVisualizationModels.mjs', 'PRODUCTION_ORDER_STATUS_META', 'ProductionOrderStatus'],
  ['./productionWipModel.mjs', 'PRODUCTION_WIP_STATUS_META', 'ProductionWIPStatus'],
  ['./productionWipModel.mjs', 'PRODUCTION_WIP_QUALITY_STATUS_META', 'QualityInspectionStatus'],
  ['./processRuntimePresentation.mjs', 'PROCESS_STATUS_LABELS', 'ProcessStatus'],
  ['./processRuntimePresentation.mjs', 'PROCESS_RESOLUTION_LABELS', 'ProcessResolution'],
  ['./processRuntimePresentation.mjs', 'NODE_STATUS_LABELS', 'ProcessNodeStatus'],
  ['./processRuntimePresentation.mjs', 'NODE_TYPE_KEYS', 'ProcessNodeType'],
  ['../components/finance/financePaymentPresentation.jsx', 'PAYMENT_STATUS_META', 'FinancePaymentStatus'],
  ['../components/finance/financePaymentPresentation.jsx', 'PAYMENT_DIRECTION_OPTIONS', 'FinancePaymentDirection'],
  ['../components/finance/financePaymentPresentation.jsx', 'CREDIT_STATUS_OPTIONS', 'FinanceAllocationStatus'],
  ['../pages/InventoryLedgerPage.jsx', 'INVENTORY_OPERATION_STATUS_LABELS', 'InventoryOperationStatus'],
  ['../pages/InventoryLedgerPage.jsx', 'LOT_STATUS_OPTIONS', 'InventoryLotStatus'],
  ['../pages/InventoryLedgerPage.jsx', 'LOT_STATUS_LABELS', 'InventoryLotStatus'],
  ['../pages/InventoryLedgerPage.jsx', 'LOT_STATUS_COLORS', 'InventoryLotStatus'],
  ['../pages/PurchaseReceiptsPage.jsx', 'STATUS_OPTIONS', 'PurchaseReceiptStatus'],
  ['../components/quality-inspections/qualityInspectionColumns.jsx', 'QUALITY_STATUS_OPTIONS', 'QualityInspectionStatus'],
  ['../components/quality-inspections/qualityInspectionColumns.jsx', 'QUALITY_STATUS_LABELS', 'QualityInspectionStatus'],
  ['../components/operational-facts/operationalFactPageConfig.mjs', 'STATUS_OPTIONS', 'OperationalFactStatus', 'ShipmentStatus', 'StockReservationStatus'],
]) { test(`business status coverage: ${file} ${name} follows ${domains.join(', ')}`, () => {
  const actual = presentationKeys(file, name)
  assert.equal(new Set(actual).size, actual.length, `${name}: duplicate public values`)
  const expected = [...new Set(domains.flatMap((domain) => Object.values(contracts[domain])))].sort()
  assert.deepEqual(actual.sort(), expected, `${name}: update presentation when the domain changes`)
}) }
