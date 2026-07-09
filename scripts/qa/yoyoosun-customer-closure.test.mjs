import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { yoyoosunCustomerPackage } from '../../config/customers/yoyoosun/customerPackage.mjs'
import { yoyoosunFlowOrchestrationCoverage } from '../../config/customers/yoyoosun/flowOrchestrationCoverage.mjs'
import { yoyoosunProjectionMatrix } from '../../config/customers/yoyoosun/projectionMatrix.mjs'
import { yoyoosunRawSourceFormMap } from '../../config/customers/yoyoosun/rawSourceFormMap.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { yoyoosunTrialDataFixture } from '../../config/customers/yoyoosun/trialDataFixture.mjs'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../../web/src/erp/data/processingContractTemplate.mjs'
import {
  completeMaterialPurchaseContractDraft,
  completeProcessingContractDraft,
} from '../../web/src/erp/utils/contractPrintDraftCompleteness.mjs'
import {
  buildMaterialPurchaseContractDraftFromPurchaseOrder,
} from '../../web/src/erp/utils/masterDataOrderView.mjs'

const sourceManifest = JSON.parse(
  readFileSync('docs/customers/yoyoosun/source-manifest.json', 'utf8')
)

const manifestSourceIds = new Set(sourceManifest.sources.map((source) => source.sourceId))
const syntheticSourceIds = new Set(['__synthetic_yoyoosun_trial__'])
const forbiddenRuntimeFactCommitClaims =
  /自动过账|直接过账|直接写库存|直接写出货|直接写财务/

function assertNoPositiveRuntimeFactCommitClaim(text, context) {
  const normalizedText = String(text || '').replace(
    /(?:不|不能|不得|禁止)直接写(?:库存|出货|财务)(?:事实|流水|数据)?/g,
    ''
  )
  assert.doesNotMatch(normalizedText, forbiddenRuntimeFactCommitClaims, context)
}

function assertKnownSourceIds(sourceIds, context) {
  assert.ok(Array.isArray(sourceIds) && sourceIds.length > 0, `${context} sourceIds required`)
  for (const sourceId of sourceIds) {
    assert.ok(
      manifestSourceIds.has(sourceId) || syntheticSourceIds.has(sourceId),
      `${context} references unknown sourceId ${sourceId}`
    )
  }
}

function buildYoyoosunPrintTemplateDefaults() {
  return {
    templates: yoyoosunCustomerPackage.printTemplateDefaults.map((template) => ({
      template_key: template.templateKey,
      party_defaults: template.partyDefaults,
    })),
  }
}

function collectPlaceholderValues(value, pathName = 'root', out = []) {
  if (typeof value === 'string') {
    if (/(未配置|未维护|未关联)/u.test(value)) {
      out.push(`${pathName}=${value}`)
    }
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectPlaceholderValues(item, `${pathName}[${index}]`, out)
    )
    return out
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) =>
      collectPlaceholderValues(item, `${pathName}.${key}`, out)
    )
  }
  return out
}

const materialPurchaseContractPrintFieldCoverage = Object.freeze([
  ['contractNo', '采购订单页.purchase_order_no'],
  ['orderDateText', '采购订单页.purchase_date'],
  ['returnDateText', '采购订单页.expected_arrival_date'],
  ['supplierName', '供应商主数据快照.name'],
  ['supplierContact', '供应商联系人快照.contact_name'],
  ['supplierPhone', '供应商联系人快照.contact_phone'],
  ['supplierAddress', '供应商主数据快照.address'],
  ['buyerCompany', '采购订单页.contract_party_snapshot.buyerCompany'],
  ['buyerContact', '采购订单页.contract_party_snapshot.buyerContact'],
  ['buyerPhone', '采购订单页.contract_party_snapshot.buyerPhone'],
  ['buyerAddress', '采购订单页.contract_party_snapshot.buyerAddress'],
  ['buyerSigner', '采购订单页.contract_party_snapshot.buyerSigner'],
  ['signDateText', '采购订单页.purchase_date'],
])

const materialPurchaseLinePrintFieldCoverage = Object.freeze([
  ['contractNo', '采购订单页.purchase_order_no'],
  ['productOrderNo', '采购订单明细.product_order_no_snapshot'],
  ['productNo', '采购订单明细.product_no_snapshot'],
  ['productName', '采购订单明细.product_name_snapshot'],
  ['materialName', '采购订单明细.material_name_snapshot'],
  ['vendorCode', '采购订单明细.material_code_snapshot'],
  ['spec', '材料主数据.spec'],
  ['unit', '单位主数据.name'],
  ['unitPrice', '采购订单明细.unit_price'],
  ['quantity', '采购订单明细.purchased_quantity'],
  ['amount', '采购订单明细.amount 或数量×单价派生'],
  ['remark', '采购订单明细.note'],
])

const processingContractPrintFieldCoverage = Object.freeze([
  ['contractNo', '委外订单页.outsourcing_order_no'],
  ['orderDateText', '委外订单页.order_date'],
  ['returnDateText', '委外订单页.expected_return_date'],
  ['supplierName', '加工厂主数据快照.name'],
  ['supplierContact', '加工厂联系人快照.contact_name'],
  ['supplierPhone', '加工厂联系人快照.contact_phone'],
  ['supplierAddress', '加工厂主数据快照.address'],
  ['buyerCompany', '委外订单页.contract_party_snapshot.buyerCompany'],
  ['buyerContact', '委外订单页.contract_party_snapshot.buyerContact'],
  ['buyerPhone', '委外订单页.contract_party_snapshot.buyerPhone'],
  ['buyerAddress', '委外订单页.contract_party_snapshot.buyerAddress'],
  ['buyerSigner', '委外订单页.contract_party_snapshot.buyerSigner'],
  ['buyerSignDateText', '委外订单页.order_date'],
])

const processingLinePrintFieldCoverage = Object.freeze([
  ['contractNo', '委外订单页.outsourcing_order_no'],
  ['productOrderNo', '委外订单明细.product_order_no_snapshot'],
  ['productNo', '委外订单明细.product_no_snapshot'],
  ['productName', '委外订单明细.product_name_snapshot'],
  ['processName', '委外订单明细.process_name_snapshot'],
  ['supplierAlias', '加工厂主数据快照.name'],
  ['processCategory', '委外订单明细.process_category_snapshot'],
  ['unit', '单位主数据.name'],
  ['unitPrice', '委外订单明细.unit_price'],
  ['quantity', '委外订单明细.outsourcing_quantity'],
  ['amount', '委外订单明细.amount 或数量×单价派生'],
  ['remark', '委外订单明细.note'],
])

const contractPartySnapshotCoverage = Object.freeze([
  ['buyerCompany', '源单合同方快照.buyerCompany'],
  ['buyerContact', '源单合同方快照.buyerContact'],
  ['buyerPhone', '源单合同方快照.buyerPhone'],
  ['buyerAddress', '源单合同方快照.buyerAddress'],
  ['buyerSigner', '源单合同方快照.buyerSigner'],
])

function assertNonBlankFields(record, coverage, context) {
  for (const [key, source] of coverage) {
    assert.ok(
      String(record?.[key] || '').trim(),
      `${context}.${key} must have value from ${source}`
    )
  }
}

function assertSourceContainsAll(source, needles, context) {
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${context} must include ${needle}`)
  }
}

function buildFixtureLookups() {
  const suppliers = yoyoosunTrialDataFixture.suppliers.map((supplier, index) => ({
    id: index + 1,
    code: supplier.supplierCode,
    name: supplier.displayName,
    short_name: supplier.displayName,
    contact_name: supplier.contactName,
    contact_phone: supplier.contactPhone,
    address: supplier.address,
  }))
  const materials = yoyoosunTrialDataFixture.materials.map((material, index) => ({
    id: index + 1,
    code: material.materialCode,
    name: material.materialName,
    spec: material.spec,
    default_unit_id: index + 1,
  }))
  const units = yoyoosunTrialDataFixture.units.map((unit, index) => ({
    id: index + 1,
    value: index + 1,
    code: unit.unitCode,
    name: unit.unitName,
    label: `${unit.unitCode} / ${unit.unitName}`,
    suffixLabel: unit.unitName,
  }))
  const products = yoyoosunTrialDataFixture.products.map((product, index) => ({
    id: index + 1,
    code: product.productNo,
    name: product.productName,
  }))
  return {
    supplierByCode: new Map(suppliers.map((supplier) => [supplier.code, supplier])),
    materialByCode: new Map(materials.map((material) => [material.code, material])),
    unitByCode: new Map(units.map((unit) => [unit.code, unit])),
    productByNo: new Map(products.map((product) => [product.code, product])),
    materials,
    units,
  }
}

test('yoyoosun raw source form map covers every source manifest entry', () => {
  assert.equal(yoyoosunRawSourceFormMap.customerKey, sourceManifest.customerKey)
  const mapped = new Map(
    yoyoosunRawSourceFormMap.entries.map((entry) => [entry.sourceId, entry])
  )

  for (const source of sourceManifest.sources) {
    const mapping = mapped.get(source.sourceId)
    assert.ok(mapping, `${source.sourceId} must have form mapping`)
    assert.ok(mapping.targetForms.length > 0, `${source.sourceId} targetForms required`)
    assert.ok(mapping.targetEntities.length > 0, `${source.sourceId} targetEntities required`)
    assert.ok(mapping.fieldCoverage.length > 0, `${source.sourceId} fieldCoverage required`)
    assert.match(mapping.boundary, /不|不能|只|dry-run|人工|候选/)
  }
})

test('yoyoosun raw source form map does not target runtime fact tables directly', () => {
  const forbiddenTargets = new Set([
    'inventory_txns',
    'inventory_balances',
    'shipments.shipped_fact',
    'finance_facts.posted',
    'workflow_done_to_fact_posted',
    'business_records',
  ])

  for (const entry of yoyoosunRawSourceFormMap.entries) {
    assert.notEqual(entry.status, 'runtime_enabled')
    for (const target of entry.targetEntities) {
      assert.ok(!forbiddenTargets.has(target), `${entry.sourceId} targets forbidden runtime table ${target}`)
    }
    assertNoPositiveRuntimeFactCommitClaim(
      entry.boundary,
      `${entry.sourceId} boundary must not promise runtime fact commits`
    )
  }
})

test('yoyoosun role flow matrix covers every workflow owner pool', () => {
  const configuredOwnerPools = new Set(
    yoyoosunRoleFlowMatrix.roles.flatMap((role) => [...role.ownerPools])
  )
  const workflowOwnerPools = new Set(
    yoyoosunCustomerPackage.workflows.flatMap((workflow) => [
      ...workflow.ownerPools,
      ...workflow.nodes.map((node) => node.ownerPool).filter(Boolean),
    ])
  )

  for (const ownerPool of workflowOwnerPools) {
    assert.ok(configuredOwnerPools.has(ownerPool), `owner pool ${ownerPool} missing role matrix entry`)
  }
})

test('yoyoosun role flow matrix keeps workflow handling separate from facts', () => {
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.ok(role.roleKey)
    assert.ok(role.displayName)
    assert.ok(role.ownerPools.length > 0)
    assert.ok(role.capabilityKeys.includes('workflow.task.read'), `${role.roleKey} needs workflow.task.read`)
    assert.match(role.guardrail, /不|不能|只有|必须/)
    assertNoPositiveRuntimeFactCommitClaim(
      role.guardrail,
      `${role.roleKey} guardrail must not promise runtime fact commits`
    )
  }
})

test('yoyoosun flow orchestration coverage records runtime and preview layers', () => {
  const layers = new Map(
    yoyoosunFlowOrchestrationCoverage.layers.map((layer) => [layer.key, layer])
  )
  assert.equal(layers.get('workflow_task')?.status, 'runtime_enabled')
  assert.equal(layers.get('process_runtime')?.status, 'runtime_enabled_partial')
  assert.equal(layers.get('business_flows')?.status, 'preview_only')
  assert.equal(layers.get('state_machines')?.status, 'preview_only')
  assert.equal(layers.get('process_policies')?.status, 'preview_only')
})

test('yoyoosun flow orchestration coverage includes all configured preview flows', () => {
  const businessFlowKeys = new Set(yoyoosunCustomerPackage.businessFlows.map((flow) => flow.key))
  const stateMachineKeys = new Set(yoyoosunCustomerPackage.stateMachines.map((machine) => machine.key))
  const processPolicyKeys = new Set(yoyoosunCustomerPackage.processPolicies.map((policy) => policy.key))
  const coverage = new Map(
    yoyoosunFlowOrchestrationCoverage.layers.map((layer) => [layer.key, new Set(layer.evidence)])
  )

  for (const key of businessFlowKeys) assert.ok(coverage.get('business_flows').has(key), `${key} business flow must be covered`)
  for (const key of stateMachineKeys) assert.ok(coverage.get('state_machines').has(key), `${key} state machine must be covered`)
  for (const key of processPolicyKeys) assert.ok(coverage.get('process_policies').has(key), `${key} process policy must be covered`)
})

test('yoyoosun flow orchestration coverage includes required runtime processes and UI entries', () => {
  const runtimeProcesses = new Set(
    yoyoosunFlowOrchestrationCoverage.runtimeProcesses.map((process) => process.key)
  )
  for (const key of ['sales_order_acceptance', 'material_supply', 'finished_goods_delivery']) {
    assert.ok(runtimeProcesses.has(key), `${key} runtime process coverage required`)
  }
  for (const uiKey of ['desktop_task_board', 'mobile_role_tasks', 'customer_config_preview', 'purchase_contract_print', 'processing_contract_print']) {
    assert.ok(yoyoosunFlowOrchestrationCoverage.uiEntrypoints.includes(uiKey), `${uiKey} UI entry coverage required`)
  }
})

test('yoyoosun projection matrix separates consumed and backend-allowed field surfaces', () => {
  const consumedSurfaces = yoyoosunProjectionMatrix.fieldSurfaces.filter(
    (surface) => surface.status === 'runtime_enabled'
  )
  const backendAllowedSurfaces = yoyoosunProjectionMatrix.fieldSurfaces.filter(
    (surface) => surface.status === 'backend_runtime_allowed'
  )

  assert.ok(consumedSurfaces.length >= 3, 'runtime consumed surfaces must stay explicit')
  assert.ok(backendAllowedSurfaces.length >= 8, 'backend-allowed surfaces must stay visible')
  for (const surface of yoyoosunProjectionMatrix.fieldSurfaces) {
    assert.ok(surface.surfaceKey.endsWith('.default'))
    assert.ok(surface.fields.length > 0)
  }
  const outsourcingSurface = yoyoosunProjectionMatrix.fieldSurfaces.find(
    (surface) => surface.surfaceKey === 'outsourcing_orders.default'
  )
  assert.ok(outsourcingSurface.fields.includes('expected_return_date'))
  assert.ok(!outsourcingSurface.fields.includes('return_date'))
})

test('yoyoosun print projection protects supplier and processor snapshots', () => {
  for (const template of yoyoosunProjectionMatrix.printTemplateDefaults) {
    assert.equal(template.status, 'runtime_enabled')
    assert.equal(template.defaultFieldPolicy, 'buyer_party_only')
    assert.ok(template.protectedBusinessSnapshots.includes('lines'))
    assert.ok(template.protectedBusinessSnapshots.includes('supplierName'))
  }
})

test('yoyoosun customer package print party defaults are complete source-backed values', () => {
  const defaultsByTemplate = new Map(
    yoyoosunCustomerPackage.printTemplateDefaults.map((item) => [
      item.templateKey,
      item.partyDefaults,
    ])
  )
  assert.deepEqual(defaultsByTemplate.get('material-purchase-contract'), {
    buyerCompany: '永绅',
    buyerContact: '郭改玉',
    buyerPhone: '13537313218',
    buyerAddress: '东莞-茶山',
    buyerSigner: '郭改玉',
  })
  assert.deepEqual(defaultsByTemplate.get('processing-contract'), {
    buyerCompany: '永绅',
    buyerContact: '刘志强',
    buyerPhone: '13694972987',
    buyerAddress: '东莞茶山',
    buyerSigner: '刘志强',
  })
  for (const defaults of defaultsByTemplate.values()) {
    assert.ok(
      Object.values(defaults).every((value) => String(value || '').trim()),
      'print party defaults must not include blank values'
    )
    assert.ok(
      Object.values(defaults).every((value) => value !== '待维护'),
      'print party defaults must not keep placeholder values'
    )
  }
})

test('yoyoosun trial fixture covers core and customer flow domains', () => {
  const requiredCollections = {
    units: 4,
    customers: 2,
    suppliers: 3,
    materials: 5,
    products: 3,
    warehouses: 3,
    bomVersions: 2,
    salesOrders: 3,
    purchaseOrders: 2,
    outsourcingOrders: 2,
    purchaseReceipts: 2,
    qualityInspections: 3,
    inventoryLots: 3,
    shipments: 3,
    financeDrafts: 3,
    workflowTasks: 5,
  }

  for (const [collectionKey, minCount] of Object.entries(requiredCollections)) {
    const records = yoyoosunTrialDataFixture[collectionKey]
    assert.ok(Array.isArray(records) && records.length >= minCount, `${collectionKey} fixture should have at least ${minCount} records`)
    records.forEach((record, index) =>
      assertKnownSourceIds(record.sourceIds, `${collectionKey}[${index}]`)
    )
  }
})

test('yoyoosun trial fixture covers manual regression states without claiming real import', () => {
  assert.equal(yoyoosunTrialDataFixture.status, 'preview_only')
  assert.match(yoyoosunTrialDataFixture.boundary, /must not be applied to customer production data/)

  assert.deepEqual(
    new Set(yoyoosunTrialDataFixture.salesOrders.map((order) => order.lifecycleStatus)),
    new Set(['draft', 'active', 'cancelled'])
  )
  assert.deepEqual(
    new Set(yoyoosunTrialDataFixture.qualityInspections.map((inspection) => inspection.result)),
    new Set(['pending', 'passed', 'rejected'])
  )
  assert.deepEqual(
    new Set(yoyoosunTrialDataFixture.shipments.map((shipment) => shipment.status)),
    new Set(['draft', 'shipped', 'cancelled'])
  )
  assert.deepEqual(
    new Set(yoyoosunTrialDataFixture.workflowTasks.map((task) => task.ownerRoleKey)),
    new Set(['sales', 'purchasing', 'boss', 'quality', 'warehouse'])
  )
  assert.deepEqual(
    new Set(yoyoosunTrialDataFixture.workflowTasks.map((task) => task.taskStatusKey)),
    new Set(['ready', 'blocked', 'done'])
  )
})

test('yoyoosun trial print fixtures have no empty critical print fields', () => {
  for (const supplier of yoyoosunTrialDataFixture.suppliers) {
    for (const key of ['displayName', 'contactName', 'contactPhone', 'address']) {
      assert.ok(String(supplier[key] || '').trim(), `supplier ${supplier.supplierCode} ${key} must not be blank`)
    }
  }

  const purchaseOrder = yoyoosunTrialDataFixture.purchaseOrders[0]
  const purchaseLine = purchaseOrder.lines[0]
  assert.ok(purchaseOrder.purchaseOrderNo)
  assert.ok(purchaseOrder.supplierCode)
  assert.ok(purchaseOrder.printTemplateKey === 'material-purchase-contract')
  for (const key of ['productOrderNo', 'productNo', 'productName', 'materialName', 'unitCode', 'quantity', 'unitPrice', 'amount']) {
    assert.ok(String(purchaseLine[key] || '').trim(), `purchase line ${key} must not be blank`)
  }

  const outsourcingOrder = yoyoosunTrialDataFixture.outsourcingOrders[0]
  const outsourcingLine = outsourcingOrder.lines[0]
  assert.ok(outsourcingOrder.outsourcingOrderNo)
  assert.ok(outsourcingOrder.processorCode)
  assert.ok(outsourcingOrder.printTemplateKey === 'processing-contract')
  for (const key of ['productOrderNo', 'productNo', 'productName', 'processName', 'unitCode', 'quantity', 'unitPrice', 'amount']) {
    assert.ok(String(outsourcingLine[key] || '').trim(), `outsourcing line ${key} must not be blank`)
  }
})

test('yoyoosun contract print field coverage maps every paper variable to business or config values', () => {
  const lookups = buildFixtureLookups()
  const printTemplateDefaults = buildYoyoosunPrintTemplateDefaults()

  for (const purchaseOrder of yoyoosunTrialDataFixture.purchaseOrders) {
    const supplier = lookups.supplierByCode.get(purchaseOrder.supplierCode)
    assert.ok(supplier, `${purchaseOrder.purchaseOrderNo} supplier fixture required`)
    assertNonBlankFields(
      purchaseOrder.contractPartySnapshot,
      contractPartySnapshotCoverage,
      `${purchaseOrder.purchaseOrderNo}.contractPartySnapshot`
    )
    const order = {
      purchase_order_no: purchaseOrder.purchaseOrderNo,
      supplier_id: supplier.id,
      supplier_snapshot: {
        name: supplier.name,
        short_name: supplier.short_name,
        contact_name: supplier.contact_name,
        contact_phone: supplier.contact_phone,
        address: supplier.address,
      },
      purchase_date: purchaseOrder.orderDate,
      expected_arrival_date: purchaseOrder.expectedArrivalDate,
    }
    const items = purchaseOrder.lines.map((line, index) => {
      const material = lookups.materialByCode.get(line.materialCode)
      const unit = lookups.unitByCode.get(line.unitCode)
      assert.ok(material, `${purchaseOrder.purchaseOrderNo} material fixture required`)
      assert.ok(unit, `${purchaseOrder.purchaseOrderNo} unit fixture required`)
      return {
        line_no: index + 1,
        material_id: material.id,
        unit_id: unit.id,
        product_order_no_snapshot: line.productOrderNo,
        product_no_snapshot: line.productNo,
        product_name_snapshot: line.productName,
        material_code_snapshot: line.materialCode,
        material_name_snapshot: line.materialName,
        unit_name_snapshot: unit.name,
        purchased_quantity: line.quantity,
        unit_price: line.unitPrice,
        amount: line.amount,
        note: line.note,
        line_status: 'open',
      }
    })
    const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(order, items, {
      materials: lookups.materials,
      unitOptions: lookups.units,
      printTemplateDefaults,
    })
    assertNonBlankFields(
      draft,
      materialPurchaseContractPrintFieldCoverage,
      `${purchaseOrder.purchaseOrderNo}.draft`
    )
    draft.lines.forEach((line, index) =>
      assertNonBlankFields(
        line,
        materialPurchaseLinePrintFieldCoverage,
        `${purchaseOrder.purchaseOrderNo}.lines[${index}]`
      )
    )
  }

  for (const outsourcingOrder of yoyoosunTrialDataFixture.outsourcingOrders) {
    const supplier = lookups.supplierByCode.get(outsourcingOrder.processorCode)
    assert.ok(supplier, `${outsourcingOrder.outsourcingOrderNo} processor fixture required`)
    const order = {
      outsourcing_order_no: outsourcingOrder.outsourcingOrderNo,
      supplier_id: supplier.id,
      supplier_snapshot: {
        name: supplier.name,
        short_name: supplier.short_name,
        contact_name: supplier.contact_name,
        contact_phone: supplier.contact_phone,
        address: supplier.address,
      },
      source_order_no: outsourcingOrder.lines[0]?.productOrderNo,
      order_date: outsourcingOrder.orderDate,
      expected_return_date: outsourcingOrder.returnDate,
    }
    const items = outsourcingOrder.lines.map((line, index) => {
      const unit = lookups.unitByCode.get(line.unitCode)
      const product = lookups.productByNo.get(line.productNo)
      assert.ok(product, `${outsourcingOrder.outsourcingOrderNo} product fixture required`)
      assert.ok(unit, `${outsourcingOrder.outsourcingOrderNo} unit fixture required`)
      return {
        line_no: index + 1,
        product_id: product.id,
        process_id: index + 1,
        unit_id: unit.id,
        product_order_no_snapshot: line.productOrderNo,
        product_no_snapshot: line.productNo,
        product_name_snapshot: line.productName,
        process_name_snapshot: line.processName,
        process_category_snapshot: line.processCategory,
        unit_name_snapshot: unit.name,
        outsourcing_quantity: line.quantity,
        unit_price: line.unitPrice,
        amount: line.amount,
        note: line.note,
        line_status: 'open',
      }
    })
    const draft = buildProcessingContractDraftFromOutsourcingOrder(order, items, {
      printTemplateDefaults,
    })
    assertNonBlankFields(
      draft,
      processingContractPrintFieldCoverage,
      `${outsourcingOrder.outsourcingOrderNo}.draft`
    )
    draft.lines.forEach((line, index) =>
      assertNonBlankFields(
        line,
        processingLinePrintFieldCoverage,
        `${outsourcingOrder.outsourcingOrderNo}.lines[${index}]`
      )
    )
  }
})

test('yoyoosun contract print source pages expose every business-owned print field', () => {
  const purchaseForm = readFileSync(
    'web/src/erp/components/purchase-orders/PurchaseOrderForm.jsx',
    'utf8'
  )
  const purchaseOperationPanel = readFileSync(
    'web/src/erp/components/purchase-orders/PurchaseOrderOperationPanel.jsx',
    'utf8'
  )
  const outsourcingForm = readFileSync(
    'web/src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx',
    'utf8'
  )
  const outsourcingPage = readFileSync(
    'web/src/erp/pages/V1OutsourcingOrdersPage.jsx',
    'utf8'
  )

  assertSourceContainsAll(
    purchaseForm,
    [
      'name="supplier_id"',
      'name="purchase_date"',
      'name="expected_arrival_date"',
      "name={['contract_party_snapshot', 'buyerCompany']}",
      "name={['contract_party_snapshot', 'buyerContact']}",
      "name={['contract_party_snapshot', 'buyerPhone']}",
      "name={['contract_party_snapshot', 'buyerAddress']}",
      "name={['contract_party_snapshot', 'buyerSigner']}",
      "name={[field.name, 'material_code_snapshot']}",
      "name={[field.name, 'material_name_snapshot']}",
      "name={[field.name, 'product_order_no_snapshot']}",
      "name={[field.name, 'product_no_snapshot']}",
      "name={[field.name, 'product_name_snapshot']}",
      "name={[field.name, 'unit_id']}",
      "name={[field.name, 'purchased_quantity']}",
      "name={[field.name, 'unit_price']}",
      "name={[field.name, 'amount']}",
      "name={[field.name, 'note']}",
    ],
    'purchase order form'
  )
  assert.ok(
    purchaseOperationPanel.includes('打印合同') &&
      purchaseOperationPanel.includes('printPurchaseContract'),
    'purchase operation panel must expose purchase contract print action'
  )

  assertSourceContainsAll(
    outsourcingForm,
    [
      'name="supplier_id"',
      'name="order_date"',
      'name="expected_return_date"',
      "name={['contract_party_snapshot', 'buyerCompany']}",
      "name={['contract_party_snapshot', 'buyerContact']}",
      "name={['contract_party_snapshot', 'buyerPhone']}",
      "name={['contract_party_snapshot', 'buyerAddress']}",
      "name={['contract_party_snapshot', 'buyerSigner']}",
      "name={[field.name, 'product_order_no_snapshot']}",
      "name={[field.name, 'product_no_snapshot']}",
      "name={[field.name, 'product_name_snapshot']}",
      "name={[field.name, 'process_id']}",
      "name={[field.name, 'process_name_snapshot']}",
      "name={[field.name, 'process_category_snapshot']}",
      "name={[field.name, 'unit_id']}",
      "name={[field.name, 'outsourcing_quantity']}",
      "name={[field.name, 'unit_price']}",
      "name={[field.name, 'amount']}",
      "name={[field.name, 'note']}",
    ],
    'outsourcing order form'
  )
  assert.ok(
    outsourcingPage.includes('加工合同打印') &&
      outsourcingPage.includes('openProcessingContractPrint'),
    'outsourcing order page must expose processing contract print action'
  )
})

test('yoyoosun contract print drafts from trial business sources do not emit missing-value placeholders', () => {
  const lookups = buildFixtureLookups()
  const printTemplateDefaults = buildYoyoosunPrintTemplateDefaults()

  for (const purchaseOrder of yoyoosunTrialDataFixture.purchaseOrders) {
    const supplier = lookups.supplierByCode.get(purchaseOrder.supplierCode)
    assert.ok(supplier, `${purchaseOrder.purchaseOrderNo} supplier fixture required`)
    const order = {
      purchase_order_no: purchaseOrder.purchaseOrderNo,
      supplier_id: supplier.id,
      supplier_snapshot: {
        name: supplier.name,
        short_name: supplier.short_name,
        contact_name: supplier.contact_name,
        contact_phone: supplier.contact_phone,
        address: supplier.address,
      },
      contract_party_snapshot: purchaseOrder.contractPartySnapshot,
      purchase_date: purchaseOrder.orderDate,
      expected_arrival_date: purchaseOrder.expectedArrivalDate,
    }
    const items = purchaseOrder.lines.map((line, index) => {
      const material = lookups.materialByCode.get(line.materialCode)
      const unit = lookups.unitByCode.get(line.unitCode)
      assert.ok(material, `${purchaseOrder.purchaseOrderNo} material fixture required`)
      assert.ok(unit, `${purchaseOrder.purchaseOrderNo} unit fixture required`)
      return {
        line_no: index + 1,
        material_id: material.id,
        unit_id: unit.id,
        product_order_no_snapshot: line.productOrderNo,
        product_no_snapshot: line.productNo,
        product_name_snapshot: line.productName,
        material_code_snapshot: line.materialCode,
        material_name_snapshot: line.materialName,
        unit_name_snapshot: unit.name,
        purchased_quantity: line.quantity,
        unit_price: line.unitPrice,
        amount: line.amount,
        note: line.note,
        line_status: 'open',
      }
    })
    const draft = completeMaterialPurchaseContractDraft(
      buildMaterialPurchaseContractDraftFromPurchaseOrder(order, items, {
        materials: lookups.materials,
        unitOptions: lookups.units,
        printTemplateDefaults,
      })
    )
    assert.deepEqual(
      collectPlaceholderValues(draft),
      [],
      `${purchaseOrder.purchaseOrderNo} print draft must not include missing-value placeholders`
    )
  }

  for (const outsourcingOrder of yoyoosunTrialDataFixture.outsourcingOrders) {
    const supplier = lookups.supplierByCode.get(outsourcingOrder.processorCode)
    assert.ok(supplier, `${outsourcingOrder.outsourcingOrderNo} processor fixture required`)
    assertNonBlankFields(
      outsourcingOrder.contractPartySnapshot,
      contractPartySnapshotCoverage,
      `${outsourcingOrder.outsourcingOrderNo}.contractPartySnapshot`
    )
    const order = {
      outsourcing_order_no: outsourcingOrder.outsourcingOrderNo,
      supplier_id: supplier.id,
      supplier_snapshot: {
        name: supplier.name,
        short_name: supplier.short_name,
        contact_name: supplier.contact_name,
        contact_phone: supplier.contact_phone,
        address: supplier.address,
      },
      contract_party_snapshot: outsourcingOrder.contractPartySnapshot,
      source_order_no: outsourcingOrder.lines[0]?.productOrderNo,
      order_date: outsourcingOrder.orderDate,
      expected_return_date: outsourcingOrder.returnDate,
    }
    const items = outsourcingOrder.lines.map((line, index) => {
      const unit = lookups.unitByCode.get(line.unitCode)
      const product = lookups.productByNo.get(line.productNo)
      assert.ok(product, `${outsourcingOrder.outsourcingOrderNo} product fixture required`)
      assert.ok(unit, `${outsourcingOrder.outsourcingOrderNo} unit fixture required`)
      return {
        line_no: index + 1,
        product_id: product.id,
        process_id: index + 1,
        unit_id: unit.id,
        product_order_no_snapshot: line.productOrderNo,
        product_no_snapshot: line.productNo,
        product_name_snapshot: line.productName,
        process_name_snapshot: line.processName,
        process_category_snapshot: line.processCategory,
        unit_name_snapshot: unit.name,
        outsourcing_quantity: line.quantity,
        unit_price: line.unitPrice,
        amount: line.amount,
        note: line.note,
        line_status: 'open',
      }
    })
    const draft = completeProcessingContractDraft(
      buildProcessingContractDraftFromOutsourcingOrder(order, items, {
        printTemplateDefaults,
      })
    )
    assert.deepEqual(
      collectPlaceholderValues(draft),
      [],
      `${outsourcingOrder.outsourcingOrderNo} print draft must not include missing-value placeholders`
    )
  }
})
