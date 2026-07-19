import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { yoyoosunCustomerPackage } from '../../config/customers/yoyoosun/customerPackage.mjs'
import { yoyoosunFlowOrchestrationCoverage } from '../../config/customers/yoyoosun/flowOrchestrationCoverage.mjs'
import { yoyoosunProjectionMatrix } from '../../config/customers/yoyoosun/projectionMatrix.mjs'
import { yoyoosunRawSourceFormMap } from '../../config/customers/yoyoosun/rawSourceFormMap.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { yoyoosunTrialDataFixture } from '../../config/customers/yoyoosun/trialDataFixture.mjs'
import {
  buildColorCardDraftFromBOMVersion,
  buildMaterialDetailDraftFromBOMVersion,
  buildWorkInstructionDraftFromBOMVersion,
} from '../../web/src/erp/data/engineeringPrintTemplates.mjs'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../../web/src/erp/data/processingContractTemplate.mjs'
import {
  completeMaterialPurchaseContractDraft,
  completeProcessingContractDraft,
} from '../../web/src/erp/utils/contractPrintDraftCompleteness.mjs'
import { buildMaterialPurchaseContractDraftFromPurchaseOrder } from '../../web/src/erp/utils/masterDataOrderView.mjs'

const syntheticSourceId = '__synthetic_yoyoosun_trial__'
const requiredSourceCategories = new Set([
  'purchase_material_summary',
  'outsourcing_summary',
  'bom_workbook',
  'contract_print_reference',
  'workflow_ui_reference',
])
const forbiddenRuntimeFactCommitClaims =
  /自动过账|直接过账|直接写库存|直接写出货|直接写财务/

function assertNoPositiveRuntimeFactCommitClaim(text, context) {
  const normalizedText = String(text || '').replace(
    /(?:不|不能|不得|禁止)直接写(?:库存|出货|财务)(?:事实|流水|数据)?/g,
    ''
  )
  assert.doesNotMatch(normalizedText, forbiddenRuntimeFactCommitClaims, context)
}

function assertSyntheticSourceIds(sourceIds, context) {
  assert.deepEqual(
    sourceIds,
    [syntheticSourceId],
    `${context} must be marked as synthetic trial data only`
  )
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
  ['processingItem', '委外订单明细.processing_item'],
  ['supplierAlias', '加工厂主数据快照.name'],
  [
    'processCategory',
    '委外订单明细.process_name_snapshot，缺失时回退 process_category_snapshot',
  ],
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

const engineeringMaterialDetailPrintFieldCoverage = Object.freeze([
  ['productNo', 'BOM版本页.product_id -> 产品编号'],
  ['orderNo', 'BOM版本页.source_order_no'],
  ['productName', 'BOM版本页.product_id -> 产品名称'],
  ['quantityText', 'BOM版本页.quantity_text'],
  ['spareText', 'BOM版本页.spare_text'],
  ['dateText', 'BOM版本页.print_date'],
  ['designer', 'BOM版本页.designer'],
  ['maker', 'BOM版本页.maker'],
  ['auditor', 'BOM版本页.auditor'],
  ['hairDirection', 'BOM版本页.hair_direction'],
])

const engineeringMaterialDetailLinePrintFieldCoverage = Object.freeze([
  ['category', '材料主数据.category'],
  ['materialName', 'BOM明细.material_id -> 材料名称'],
  ['vendorCode', '材料主数据.vendor_code'],
  ['spec', '材料主数据.spec'],
  ['color', '材料主数据.color'],
  ['unit', 'BOM明细.unit_id -> 单位名称'],
  ['position', 'BOM明细.position'],
  ['pieces', 'BOM明细.piece_count'],
  ['unitUsage', 'BOM明细.quantity'],
  ['lossRate', 'BOM明细.loss_rate'],
  ['totalUsage', 'BOM明细.total_usage_snapshot'],
  ['processBase', 'BOM明细.process_base'],
  ['processMethod', 'BOM明细.process_method'],
])

const engineeringWorkInstructionPrintFieldCoverage = Object.freeze([
  ['productNo', 'BOM版本页.product_id -> 产品编号'],
  ['orderNo', 'BOM版本页.source_order_no'],
  ['productName', 'BOM版本页.product_id -> 产品名称'],
  ['department', '工程打印模板固定部门口径'],
  ['maker', 'BOM版本页.maker'],
  ['designer', 'BOM版本页.designer'],
  ['auditor', 'BOM版本页.auditor'],
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
  const units = yoyoosunTrialDataFixture.units.map((unit, index) => ({
    id: index + 1,
    value: index + 1,
    code: unit.unitCode,
    name: unit.unitName,
    label: `${unit.unitCode} / ${unit.unitName}`,
    suffixLabel: unit.unitName,
  }))
  const unitByCode = new Map(units.map((unit) => [unit.code, unit]))
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
    category: material.category,
    vendor_code: material.vendorCode,
    spec: material.spec,
    color: material.color,
    default_unit_id: unitByCode.get(material.unitCode)?.id || 0,
  }))
  const products = yoyoosunTrialDataFixture.products.map((product, index) => ({
    id: index + 1,
    code: product.productNo,
    name: product.productName,
  }))
  return {
    supplierByCode: new Map(suppliers.map((supplier) => [supplier.code, supplier])),
    materialByCode: new Map(materials.map((material) => [material.code, material])),
    unitByCode,
    productByNo: new Map(products.map((product) => [product.code, product])),
    materials,
    units,
    products,
    productOptions: products.map((product) => ({
      value: product.id,
      label: `${product.code} / ${product.name}`,
    })),
  }
}

function unixFromDateText(value) {
  const date = new Date(`${value}T00:00:00Z`)
  assert.ok(!Number.isNaN(date.getTime()), `${value} must be a valid date`)
  return Math.floor(date.getTime() / 1000)
}

function buildRuntimeBOMVersionFromFixture(bomVersion, lookups) {
  const product = lookups.productByNo.get(bomVersion.productNo)
  assert.ok(product, `${bomVersion.bomNo} product fixture required`)
  return {
    product_id: product.id,
    version: bomVersion.versionNo,
    source_order_no: bomVersion.sourceOrderNo,
    quantity_text: bomVersion.quantityText,
    spare_text: bomVersion.spareText,
    print_date: unixFromDateText(bomVersion.printDate),
    designer: bomVersion.designer,
    maker: bomVersion.maker,
    auditor: bomVersion.auditor,
    hair_direction: bomVersion.hairDirection,
    note: bomVersion.bomNo,
    items: bomVersion.lines.map((line, index) => {
      const material = lookups.materialByCode.get(line.materialCode)
      const unit = lookups.unitByCode.get(line.unitCode)
      assert.ok(material, `${bomVersion.bomNo} line ${index + 1} material fixture required`)
      assert.ok(unit, `${bomVersion.bomNo} line ${index + 1} unit fixture required`)
      return {
        line_no: index + 1,
        material_id: material.id,
        unit_id: unit.id,
        quantity: line.usageQty,
        loss_rate: line.lossRate,
        position: line.position,
        piece_count: line.pieceCount,
        total_usage_snapshot: line.totalUsage,
        process_base: line.processBase,
        process_method: line.processMethod,
        note: line.note,
      }
    }),
  }
}

test('yoyoosun product config maps private sources by category only', () => {
  assert.equal(yoyoosunRawSourceFormMap.customerKey, 'yoyoosun')
  assert.equal(yoyoosunRawSourceFormMap.status, 'source_category_mapping_only')
  assert.equal(yoyoosunRawSourceFormMap.privateValidation.status, 'external_required')
  assert.equal(yoyoosunRawSourceFormMap.privateValidation.bundledInProductRepository, false)
  assert.equal(yoyoosunRawSourceFormMap.privateValidation.productQaRequiresPrivateManifest, false)

  const categories = new Set(
    yoyoosunRawSourceFormMap.entries.map((entry) => entry.categoryKey)
  )
  assert.deepEqual(categories, requiredSourceCategories)

  for (const entry of yoyoosunRawSourceFormMap.entries) {
    assert.ok(entry.categoryKey, 'categoryKey required')
    assert.equal(
      Object.prototype.hasOwnProperty.call(entry, 'sourceId'),
      false,
      `${entry.categoryKey} must not retain private sourceId`
    )
    assert.ok(entry.targetForms.length > 0, `${entry.categoryKey} targetForms required`)
    assert.ok(entry.targetEntities.length > 0, `${entry.categoryKey} targetEntities required`)
    assert.ok(entry.fieldCoverage.length > 0, `${entry.categoryKey} fieldCoverage required`)
    assert.match(entry.boundary, /不|不能|不得|只|人工|候选/)
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
    'purchase_receipts',
    'quality_inspections',
    'outsourcing_facts',
    'inventory_lots',
  ])

  for (const entry of yoyoosunRawSourceFormMap.entries) {
    assert.notEqual(entry.status, 'runtime_enabled')
    for (const target of entry.targetEntities) {
      assert.ok(!forbiddenTargets.has(target), `${entry.categoryKey} targets forbidden runtime table ${target}`)
    }
    assertNoPositiveRuntimeFactCommitClaim(
      entry.boundary,
      `${entry.categoryKey} boundary must not promise runtime fact commits`
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
  assert.equal(yoyoosunRoleFlowMatrix.status, 'runtime_manifest_source')
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.ok(role.roleKey)
    assert.ok(role.displayName)
    assert.ok(role.ownerPools.length > 0)
    assert.ok(role.capabilityKeys.includes('erp.dashboard.read'), `${role.roleKey} needs dashboard access`)
    assert.ok(role.capabilityKeys.includes('workflow.task.read'), `${role.roleKey} needs workflow.task.read`)
    assert.match(role.guardrail, /不|不能|只有|必须/)
    assertNoPositiveRuntimeFactCommitClaim(
      role.guardrail,
      `${role.roleKey} guardrail must not promise runtime fact commits`
    )
  }
})

test('yoyoosun source task owners can reject invalid production handoffs', () => {
  const roleByKey = new Map(
    yoyoosunRoleFlowMatrix.roles.map((role) => [role.roleKey, role])
  )
  for (const roleKey of ['pmc', 'production']) {
    const role = roleByKey.get(roleKey)
    assert.ok(
      role?.capabilityKeys.includes('workflow.task.reject'),
      `${roleKey} must be able to reject its own source-generated task before the source is cancelled`
    )
  }
})

test('yoyoosun production owns processing contract confirmation', () => {
  const roleByKey = new Map(
    yoyoosunRoleFlowMatrix.roles.map((role) => [role.roleKey, role])
  )
  const productionRole = roleByKey.get('production')
  const purchaseRole = roleByKey.get('purchase')

  assert.ok(productionRole.capabilityKeys.includes('outsourcing.order.confirm'))
  assert.ok(productionRole.printTemplates.includes('processing-contract'))
  assert.equal(
    purchaseRole.capabilityKeys.some((key) => key.startsWith('outsourcing.order.')),
    false,
    '永绅采购岗位不应越权确认生产 / 委外加工合同'
  )
})

test('yoyoosun WIP role projection stays within Product Core ownership', () => {
  const roleByKey = new Map(
    yoyoosunRoleFlowMatrix.roles.map((role) => [role.roleKey, role])
  )
  const sales = roleByKey.get('sales')
  const pmc = roleByKey.get('pmc')
  const quality = roleByKey.get('quality')
  const production = roleByKey.get('production')

  assert(sales.menuSurfaces.includes('production-orders'))
  assert(sales.capabilityKeys.includes('production.wip.read'))
  assert(
    sales.capabilityKeys.includes('production.packaging_material.confirm')
  )
  assert.equal(sales.capabilityKeys.includes('pmc.plan.read'), false)
  assert.equal(sales.capabilityKeys.includes('production.wip.assign'), false)
  assert(pmc.capabilityKeys.includes('production.wip.read'))
  assert(quality.capabilityKeys.includes('production.wip.read'))
  for (const key of [
    'production.wip.read',
    'production.wip.assign',
    'production.wip.execute',
    'production.wip.rework',
  ]) {
    assert(production.capabilityKeys.includes(key), `production needs ${key}`)
  }
  assert.equal(
    production.capabilityKeys.includes(
      'production.packaging_material.confirm'
    ),
    false
  )
})

test('yoyoosun finance purchase-contract responsibility uses role composition', () => {
  const roleByKey = new Map(
    yoyoosunRoleFlowMatrix.roles.map((role) => [role.roleKey, role])
  )
  const bossRole = roleByKey.get('boss')
  const purchaseRole = roleByKey.get('purchase')
  const financeRole = roleByKey.get('finance')
  const assignmentProfile = yoyoosunRoleFlowMatrix.roleAssignmentProfiles.find(
    (profile) => profile.profileKey === 'finance_purchase_contract_operator'
  )

  assert.ok(bossRole.capabilityKeys.includes('purchase.order.read'))
  assert.ok(bossRole.capabilityKeys.includes('purchase.order.approve'))
  assert.ok(purchaseRole.capabilityKeys.includes('purchase.order.create'))
  assert.ok(purchaseRole.capabilityKeys.includes('purchase.order.update'))
  assert.equal(
    purchaseRole.capabilityKeys.includes('purchase.order.approve'),
    false
  )
  assert.equal(
    financeRole.capabilityKeys.some((key) => key.startsWith('purchase.order.')),
    false,
    'finance core role must not absorb purchase source-document permissions'
  )
  assert.deepEqual(
    new Set(assignmentProfile.roleKeys),
    new Set(['finance', 'purchase'])
  )
  assert.match(assignmentProfile.guardrail, /不把 purchase\.order\.\* 权限并入/)
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
  const businessFlowKeys = new Set(
    yoyoosunCustomerPackage.businessFlows.map((flow) => flow.key)
  )
  const stateMachineKeys = new Set(
    yoyoosunCustomerPackage.stateMachines.map((machine) => machine.key)
  )
  const processPolicyKeys = new Set(
    yoyoosunCustomerPackage.processPolicies.map((policy) => policy.key)
  )
  const coverage = new Map(
    yoyoosunFlowOrchestrationCoverage.layers.map((layer) => [
      layer.key,
      new Set(layer.evidence),
    ])
  )

  for (const key of businessFlowKeys)
    assert.ok(
      coverage.get('business_flows').has(key),
      `${key} business flow must be covered`
    )
  for (const key of stateMachineKeys)
    assert.ok(
      coverage.get('state_machines').has(key),
      `${key} state machine must be covered`
    )
  for (const key of processPolicyKeys)
    assert.ok(
      coverage.get('process_policies').has(key),
      `${key} process policy must be covered`
    )
})

test('yoyoosun flow orchestration coverage includes required runtime processes and UI entries', () => {
  const runtimeProcesses = new Set(
    yoyoosunFlowOrchestrationCoverage.runtimeProcesses.map(
      (process) => process.key
    )
  )
  for (const key of [
    'sales_order_acceptance',
    'material_supply',
    'finished_goods_delivery',
  ]) {
    assert.ok(
      runtimeProcesses.has(key),
      `${key} runtime process coverage required`
    )
  }
  for (const uiKey of [
    'desktop_task_board',
    'mobile_role_tasks',
    'customer_config_preview',
    'purchase_contract_print',
    'processing_contract_print',
  ]) {
    assert.ok(
      yoyoosunFlowOrchestrationCoverage.uiEntrypoints.includes(uiKey),
      `${uiKey} UI entry coverage required`
    )
  }
})

test('yoyoosun projection matrix separates runtime visibility from formal field contracts', () => {
  const consumedSurfaces = yoyoosunProjectionMatrix.fieldSurfaces.filter(
    (surface) => surface.status === 'runtime_visibility_consumed'
  )
  const formalFieldContracts = yoyoosunProjectionMatrix.fieldSurfaces.filter(
    (surface) => surface.status === 'formal_field_contract'
  )

  assert.deepEqual(
    consumedSurfaces.map((surface) => surface.surfaceKey).sort(),
    ['customers.default', 'sales_orders.default', 'suppliers.default']
  )
  assert.deepEqual(yoyoosunProjectionMatrix.fieldProjection.consumedPolicyKeys, [
    'visible',
  ])
  assert.equal(
    yoyoosunProjectionMatrix.fieldProjection.currentPolicySource,
    'product_core_catalog_defaults'
  )
  assert.equal(
    yoyoosunProjectionMatrix.fieldProjection.customerSpecificOverrideDefined,
    false
  )
  assert.ok(formalFieldContracts.length >= 10, 'formal field contracts must stay explicit')
  assert.ok(
    consumedSurfaces.every(
      (surface) =>
        surface.policyKeys.length === 1 && surface.policyKeys[0] === 'visible'
    ),
    'runtime field policy may only claim the currently consumed visibility key'
  )
  for (const surface of yoyoosunProjectionMatrix.fieldSurfaces) {
    assert.ok(surface.surfaceKey.endsWith('.default'))
    assert.ok(surface.fields.length > 0)
  }
  for (const surfaceKey of [
    'bom_versions.default',
    'bom_items.default',
    'purchase_orders.default',
    'outsourcing_orders.default',
  ]) {
    assert.equal(
      yoyoosunProjectionMatrix.fieldSurfaces.find(
        (surface) => surface.surfaceKey === surfaceKey
      )?.status,
      'formal_field_contract',
      `${surfaceKey} must not be presented as an active customer field policy`
    )
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

test('yoyoosun customer package keeps public buyer defaults free of personal contact data', () => {
  const defaultsByTemplate = new Map(
    yoyoosunCustomerPackage.printTemplateDefaults.map((item) => [
      item.templateKey,
      item.partyDefaults,
    ])
  )
  assert.deepEqual(defaultsByTemplate.get('material-purchase-contract'), {
    buyerCompany: '永绅',
    buyerContact: '采购负责人',
    buyerPhone: '',
    buyerAddress: '东莞-茶山',
    buyerSigner: '',
  })
  assert.deepEqual(defaultsByTemplate.get('processing-contract'), {
    buyerCompany: '永绅',
    buyerContact: '委外负责人',
    buyerPhone: '',
    buyerAddress: '东莞茶山',
    buyerSigner: '',
  })
  for (const defaults of defaultsByTemplate.values()) {
    assert.ok(
      Object.values(defaults).every((value) => value !== '待维护'),
      'print party defaults must not keep placeholder values'
    )
    assert.equal(defaults.buyerPhone, '')
    assert.equal(defaults.buyerSigner, '')
  }
})

test('yoyoosun trial fixture covers core and customer flow domains', () => {
  const requiredCollections = {
    units: 4,
    customers: 2,
    suppliers: 3,
    materials: 5,
    products: 3,
    warehouses: 4,
    bomVersions: 2,
    salesOrders: 3,
    purchaseOrders: 2,
    outsourcingOrders: 2,
    purchaseReceipts: 2,
    qualityInspections: 3,
    inventoryLots: 3,
    shipments: 3,
    financeDrafts: 3,
    productionWipScenarios: 10,
    workflowTasks: 5,
  }

  for (const [collectionKey, minCount] of Object.entries(requiredCollections)) {
    const records = yoyoosunTrialDataFixture[collectionKey]
    assert.ok(Array.isArray(records) && records.length >= minCount, `${collectionKey} fixture should have at least ${minCount} records`)
    records.forEach((record, index) =>
      assertSyntheticSourceIds(record.sourceIds, `${collectionKey}[${index}]`)
    )
  }
})

test('yoyoosun production WIP fixture covers route decisions, quality blocks, packaging separation and immutable snapshots', () => {
  const scenarios = yoyoosunTrialDataFixture.productionWipScenarios
  const byType = new Map(
    scenarios.map((scenario) => [scenario.scenarioType, scenario])
  )
  const simulatedIdentityKeys = new Set([
    'scenarioNo',
    'productionOrderNo',
    'productNo',
    'parentBatchNo',
    'executionNo',
    'conditionRecordNo',
    'ruleSourceNo',
    'allocationNo',
    'childBatchNo',
    'inspectionNo',
    'batchNo',
    'reworkNo',
    'originalExecutionNo',
    'newExecutionNo',
    'confirmationNo',
    'packagingVersionNo',
    'packagingMaterialLotNo',
    'snapshotNo',
    'routeCode',
    'versionNo',
    'currentVersionNo',
    'executionRouteVersionNo',
  ])

  function assertSyntheticScenarioRecords(value, pathName) {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertSyntheticScenarioRecords(item, `${pathName}[${index}]`)
      )
      return
    }
    if (!value || typeof value !== 'object') return

    const identityEntries = Object.entries(value).filter(([key]) =>
      simulatedIdentityKeys.has(key)
    )
    if (identityEntries.length > 0) {
      for (const [key, identity] of identityEntries) {
        assert.match(String(identity), /^SIM-/u, `${pathName}.${key}`)
      }
      assertSyntheticSourceIds(value.sourceIds, pathName)
    }
    for (const [key, item] of Object.entries(value)) {
      if (key !== 'sourceIds') {
        assertSyntheticScenarioRecords(item, `${pathName}.${key}`)
      }
    }
  }

  assert.equal(scenarios.length, 10)
  for (const [index, scenario] of scenarios.entries()) {
    assert.match(scenario.scenarioNo, /^SIM-/u)
    assert.match(scenario.productionOrderNo, /^SIM-/u)
    assert.match(scenario.parentBatchNo, /^SIM-/u)
    assertSyntheticSourceIds(
      scenario.sourceIds,
      `productionWipScenarios[${index}]`
    )
    assertSyntheticScenarioRecords(
      scenario,
      `productionWipScenarios[${index}]`
    )
  }

  const allInhouse = byType.get(
    'all_inhouse_customer_inspection_not_applicable'
  )
  assert.deepEqual(
    allInhouse.stepExecutions.map((execution) => [
      execution.stepCode,
      execution.executionMode,
      execution.movementType,
    ]),
    [
      ['sewing', 'in_house', 'wip_transfer'],
      ['handwork', 'in_house', 'wip_transfer'],
    ]
  )
  assert.deepEqual(
    {
      required: allInhouse.customerInspection.required,
      status: allInhouse.customerInspection.status,
      finalPackagingAllowed:
        allInhouse.customerInspection.finalPackagingAllowed,
    },
    {
      required: false,
      status: 'not_applicable',
      finalPackagingAllowed: true,
    }
  )
  assert.equal('inspectionNo' in allInhouse.customerInspection, false)

  const sewingOutsourced = byType.get('sewing_outsourced_handwork_inhouse')
  assert.deepEqual(
    sewingOutsourced.stepExecutions.map((execution) => [
      execution.stepCode,
      execution.executionMode,
      execution.movementType,
    ]),
    [
      ['sewing', 'outsourced', 'outsourcing_return'],
      ['handwork', 'in_house', 'wip_transfer'],
    ]
  )
  assert.deepEqual(
    [
      sewingOutsourced.stepExecutions[0].status,
      sewingOutsourced.qualityGate.gateCode,
      sewingOutsourced.qualityGate.result,
      sewingOutsourced.stepExecutions[1].status,
    ],
    ['returned', 'shell_inspection', 'passed', 'ready']
  )

  const handworkOutsourced = byType.get('sewing_inhouse_handwork_outsourced')
  assert.deepEqual(
    handworkOutsourced.stepExecutions.map((execution) => [
      execution.stepCode,
      execution.executionMode,
      execution.movementType,
    ]),
    [
      ['sewing', 'in_house', 'wip_transfer'],
      ['handwork', 'outsourced', 'outsourcing_return'],
    ]
  )
  assert.deepEqual(
    [
      handworkOutsourced.stepExecutions[0].status,
      handworkOutsourced.qualityGate.gateCode,
      handworkOutsourced.qualityGate.result,
    ],
    ['completed', 'shell_inspection', 'passed']
  )

  const split = byType.get('same_step_split')
  assert.equal(split.stepCode, 'sewing')
  assert.deepEqual(
    new Set(split.allocations.map((allocation) => allocation.executionMode)),
    new Set(['in_house', 'outsourced'])
  )
  assert.equal(
    split.allocations.reduce(
      (total, allocation) => total + Number(allocation.quantity),
      0
    ),
    Number(split.quantity)
  )
  assert.equal(
    new Set(split.allocations.map((allocation) => allocation.childBatchNo))
      .size,
    split.allocations.length
  )

  const shellRework = byType.get('shell_inspection_rework')
  assert.deepEqual(
    {
      gateCode: shellRework.qualityGate.gateCode,
      result: shellRework.qualityGate.result,
      blockedStepCode: shellRework.qualityGate.blockedStepCode,
      targetStepCode: shellRework.rework.targetStepCode,
    },
    {
      gateCode: 'shell_inspection',
      result: 'rejected',
      blockedStepCode: 'handwork',
      targetStepCode: 'sewing',
    }
  )
  assert.notEqual(
    shellRework.rework.originalExecutionNo,
    shellRework.rework.newExecutionNo
  )

  const needleRejected = byType.get('needle_inspection_rejected')
  assert.deepEqual(
    {
      gateCode: needleRejected.qualityGate.gateCode,
      result: needleRejected.qualityGate.result,
      blockedStepCode: needleRejected.qualityGate.blockedStepCode,
      finalPackagingAllowed:
        needleRejected.qualityGate.finalPackagingAllowed,
    },
    {
      gateCode: 'needle_inspection',
      result: 'rejected',
      blockedStepCode: 'sampling_inspection',
      finalPackagingAllowed: false,
    }
  )

  const customerPassed = byType.get('customer_inspection_passed')
  const customerBlocked = byType.get('customer_inspection_blocked')
  assert.deepEqual(
    [
      [
        allInhouse.customerInspection.required,
        allInhouse.customerInspection.status,
        allInhouse.customerInspection.finalPackagingAllowed,
      ],
      [
        customerPassed.customerInspection.required,
        customerPassed.customerInspection.status,
        customerPassed.customerInspection.finalPackagingAllowed,
      ],
      [
        customerBlocked.customerInspection.required,
        customerBlocked.customerInspection.status,
        customerBlocked.customerInspection.finalPackagingAllowed,
      ],
    ],
    [
      [false, 'not_applicable', true],
      [true, 'passed', true],
      [true, 'rejected', false],
    ]
  )
  assert.equal(
    customerBlocked.customerInspection.blockedStepCode,
    'final_packaging'
  )

  const packaging = byType.get('packaging_business_quality_separated')
  assert.deepEqual(
    {
      businessRole: packaging.businessConfirmation.roleKey,
      businessResult: packaging.businessConfirmation.result,
      qualityRole: packaging.qualityInspection.roleKey,
      qualityResult: packaging.qualityInspection.result,
      finalPackagingAllowed: packaging.finalPackagingAllowed,
    },
    {
      businessRole: 'sales',
      businessResult: 'confirmed',
      qualityRole: 'quality',
      qualityResult: 'rejected',
      finalPackagingAllowed: false,
    }
  )

  const routeSnapshot = byType.get('route_snapshot_immutable')
  assert.deepEqual(routeSnapshot.routeSnapshot.orderedStepCodes, [
    'fabric_processing',
    'cut_piece_inspection',
    'sewing',
    'shell_inspection',
    'handwork',
    'finished_goods_inspection',
    'needle_inspection',
    'sampling_inspection',
    'customer_inspection',
    'final_packaging',
    'finished_goods_inbound',
  ])
  assert.notEqual(
    routeSnapshot.routeSnapshot.versionNo,
    routeSnapshot.routeTemplateAfterRelease.currentVersionNo
  )
  assert.equal(
    routeSnapshot.executionRouteVersionNo,
    routeSnapshot.routeSnapshot.versionNo
  )
  assert.equal(routeSnapshot.snapshotChanged, false)
})

test('yoyoosun processing-contract fixture covers sewing fabric and handwork subjects', () => {
  const outsourcingOrders = yoyoosunTrialDataFixture.outsourcingOrders
  const lines = outsourcingOrders.flatMap((order) => order.lines)
  const sewingOrder = outsourcingOrders.find((order) =>
    order.lines.some((line) => line.processName.includes('车缝'))
  )
  const handworkOrder = outsourcingOrders.find((order) =>
    order.lines.some((line) => line.processName.includes('手工'))
  )
  const sewing = lines.find((line) => line.processName.includes('车缝'))
  const fabric = lines.find((line) => line.processName.includes('布料'))
  const handwork = lines.find((line) => line.processName.includes('手工'))

  assert.ok(sewingOrder)
  assert.ok(handworkOrder)
  assert.equal(sewing?.subjectType || 'PRODUCT', 'PRODUCT')
  assert.ok(sewing?.productNo)
  assert.equal(fabric?.subjectType, 'MATERIAL')
  assert.ok(fabric?.materialCode)
  assert.equal(handwork?.subjectType, 'PRODUCT')
  assert.ok(handwork?.productNo)
  assert.equal(sewingOrder?.sourceOrderNo, handworkOrder?.sourceOrderNo)
  assert.equal(sewing?.productNo, handwork?.productNo)
  assert.ok(
    handworkOrder?.orderDate > sewingOrder?.returnDate,
    '手工委外样例必须在车缝回货之后下单'
  )
  const sewingPassedInspection =
    yoyoosunTrialDataFixture.qualityInspections.find(
      (inspection) =>
        inspection.sourceNo === sewingOrder?.outsourcingOrderNo &&
        inspection.result === 'passed'
    )
  assert.ok(sewingPassedInspection, '车缝回货必须有合格质检样例')
  assert.ok(
    sewingPassedInspection?.inspectedAt >= sewingOrder?.returnDate &&
      sewingPassedInspection?.inspectedAt < handworkOrder?.orderDate,
    '车缝回货通过检验后才能进入手工样例'
  )
})

test('yoyoosun trial fixture uses short anonymized business copy and keeps SIM identities', () => {
  const visibleCopy = JSON.stringify(yoyoosunTrialDataFixture)

  assert.doesNotMatch(
    visibleCopy,
    /【试用】|合成(?:试用|玩偶|客户|材料供应商)|联系人[甲乙]|委外加工商/u
  )
  assert.deepEqual(
    yoyoosunTrialDataFixture.customers.map((customer) => customer.displayName),
    ['样例·美悦礼品', '样例·森野文创']
  )
  assert.deepEqual(
    yoyoosunTrialDataFixture.products.map((product) => product.productName),
    ['云朵小熊', '星星挂兔', '云朵小熊大号']
  )
  assert.ok(
    yoyoosunTrialDataFixture.suppliers.every(
      (supplier) =>
        supplier.supplierCode.startsWith('SIM-') &&
        supplier.displayName.startsWith('样例·')
    )
  )
  assert.ok(
    yoyoosunTrialDataFixture.products.every((product) =>
      product.productNo.startsWith('SIM-')
    )
  )
  assert.ok(
    yoyoosunTrialDataFixture.materials.every((material) =>
      material.materialCode.startsWith('SIM-')
    )
  )
  assert.ok(
    yoyoosunTrialDataFixture.outsourcingOrders
      .flatMap((order) => order.lines)
      .some((line) => line.processName === '裁片加工')
  )
  assert.ok(
    yoyoosunTrialDataFixture.qualityInspections.some(
      (inspection) =>
        inspection.sourceNo === 'SIM-OS-002' &&
        inspection.result === 'rejected'
    )
  )
})

test('yoyoosun fixture keeps quality and payable references on valid preview sources', () => {
  const validQualitySources = new Set([
    ...yoyoosunTrialDataFixture.purchaseReceipts.map(
      (receipt) => receipt.receiptNo
    ),
    ...yoyoosunTrialDataFixture.outsourcingOrders.map(
      (order) => order.outsourcingOrderNo
    ),
  ])
  for (const inspection of yoyoosunTrialDataFixture.qualityInspections) {
    assert.ok(validQualitySources.has(inspection.sourceNo))
  }

  const qualityResultBySource = new Map(
    yoyoosunTrialDataFixture.qualityInspections.map((inspection) => [
      inspection.sourceNo,
      inspection.result,
    ])
  )
  for (const draft of yoyoosunTrialDataFixture.financeDrafts.filter(
    (item) => item.factType.startsWith('payable')
  )) {
    assert.equal(qualityResultBySource.get(draft.sourceNo), 'passed')
  }
})

test('yoyoosun trial fixture covers manual regression states without claiming real import', () => {
  assert.equal(yoyoosunTrialDataFixture.status, 'preview_only')
  assert.match(
    yoyoosunTrialDataFixture.boundary,
    /must not be applied to customer production data/
  )

  assert.deepEqual(
    new Set(
      yoyoosunTrialDataFixture.salesOrders.map((order) => order.lifecycleStatus)
    ),
    new Set(['draft', 'active', 'cancelled'])
  )
  assert.deepEqual(
    new Set(
      yoyoosunTrialDataFixture.qualityInspections.map(
        (inspection) => inspection.result
      )
    ),
    new Set(['pending', 'passed', 'rejected'])
  )
  assert.deepEqual(
    new Set(
      yoyoosunTrialDataFixture.shipments.map((shipment) => shipment.status)
    ),
    new Set(['draft', 'shipped', 'cancelled'])
  )
  assert.deepEqual(
    new Set(
      yoyoosunTrialDataFixture.workflowTasks.map((task) => task.ownerRoleKey)
    ),
    new Set(['sales', 'purchase', 'boss', 'quality', 'warehouse'])
  )
  assert.deepEqual(
    new Set(
      yoyoosunTrialDataFixture.workflowTasks.map((task) => task.taskStatusKey)
    ),
    new Set(['ready', 'blocked', 'done'])
  )
  assert.equal(
    yoyoosunTrialDataFixture.workflowTasks.some((task) =>
      ['production_scheduling', 'production_exception', 'shipment_release'].includes(
        task.taskGroup
      )
    ),
    false,
    'trial fixture must not forge source-produced workflow task groups'
  )
})

test('yoyoosun warehouse fixture uses typed master data and valid references', () => {
  const warehouseByCode = new Map(
    yoyoosunTrialDataFixture.warehouses.map((warehouse) => [
      warehouse.warehouseCode,
      warehouse,
    ])
  )

  assert.deepEqual(
    new Set(
      yoyoosunTrialDataFixture.warehouses.map(
        (warehouse) => warehouse.warehouseType
      )
    ),
    new Set(['RAW_MATERIAL', 'FINISHED_GOODS', 'OTHER', 'QC_HOLD'])
  )
  for (const collectionKey of [
    'purchaseReceipts',
    'inventoryLots',
    'shipments',
  ]) {
    for (const record of yoyoosunTrialDataFixture[collectionKey]) {
      assert.ok(
        warehouseByCode.has(record.warehouseCode),
        `${collectionKey} references unknown warehouse ${record.warehouseCode}`
      )
    }
  }

  assert.equal(
    warehouseByCode.get(
      yoyoosunTrialDataFixture.purchaseReceipts[0].warehouseCode
    )?.warehouseType,
    'RAW_MATERIAL'
  )
  assert.equal(
    warehouseByCode.get(
      yoyoosunTrialDataFixture.inventoryLots.find(
        (lot) => lot.materialCode === 'SIM-MAT-CARTON-001'
      )?.warehouseCode
    )?.warehouseType,
    'OTHER'
  )
  assert.ok(
    yoyoosunTrialDataFixture.shipments.every(
      (shipment) =>
        warehouseByCode.get(shipment.warehouseCode)?.warehouseType ===
        'FINISHED_GOODS'
    ),
    'finished-product shipments must use the finished-goods warehouse'
  )
})

test('yoyoosun trial print fixtures have no empty critical print fields', () => {
  for (const supplier of yoyoosunTrialDataFixture.suppliers) {
    for (const key of [
      'displayName',
      'contactName',
      'contactPhone',
      'address',
    ]) {
      assert.ok(
        String(supplier[key] || '').trim(),
        `supplier ${supplier.supplierCode} ${key} must not be blank`
      )
    }
  }

  const purchaseOrder = yoyoosunTrialDataFixture.purchaseOrders[0]
  const purchaseLine = purchaseOrder.lines[0]
  assert.ok(purchaseOrder.purchaseOrderNo)
  assert.ok(purchaseOrder.supplierCode)
  assert.ok(purchaseOrder.printTemplateKey === 'material-purchase-contract')
  for (const key of [
    'productOrderNo',
    'productNo',
    'productName',
    'materialName',
    'unitCode',
    'quantity',
    'unitPrice',
    'amount',
  ]) {
    assert.ok(
      String(purchaseLine[key] || '').trim(),
      `purchase line ${key} must not be blank`
    )
  }

  const outsourcingOrder = yoyoosunTrialDataFixture.outsourcingOrders[0]
  const outsourcingLine = outsourcingOrder.lines[0]
  assert.ok(outsourcingOrder.outsourcingOrderNo)
  assert.ok(outsourcingOrder.processorCode)
  assert.ok(outsourcingOrder.printTemplateKey === 'processing-contract')
  for (const key of [
    'productOrderNo',
    'productNo',
    'productName',
    'processingItem',
    'processName',
    'unitCode',
    'quantity',
    'unitPrice',
    'amount',
  ]) {
    assert.ok(
      String(outsourcingLine[key] || '').trim(),
      `outsourcing line ${key} must not be blank`
    )
  }

  for (const bomVersion of yoyoosunTrialDataFixture.bomVersions) {
    for (const key of [
      'sourceOrderNo',
      'quantityText',
      'spareText',
      'printDate',
      'designer',
      'maker',
      'auditor',
      'hairDirection',
    ]) {
      assert.ok(
        String(bomVersion[key] || '').trim(),
        `bom version ${bomVersion.bomNo} ${key} must not be blank`
      )
    }
    for (const [index, line] of bomVersion.lines.entries()) {
      for (const key of [
        'materialCode',
        'usageQty',
        'unitCode',
        'position',
        'pieceCount',
        'lossRate',
        'totalUsage',
        'processBase',
        'processMethod',
      ]) {
        assert.ok(
          String(line[key] || '').trim(),
          `bom version ${bomVersion.bomNo} line ${index + 1} ${key} must not be blank`
        )
      }
    }
  }
})

test('yoyoosun engineering print field coverage maps every paper variable to BOM pages or master data', () => {
  const lookups = buildFixtureLookups()

  for (const bomVersion of yoyoosunTrialDataFixture.bomVersions) {
    const runtimeVersion = buildRuntimeBOMVersionFromFixture(bomVersion, lookups)
    const options = {
      productOptions: lookups.productOptions,
      products: lookups.products,
      materials: lookups.materials,
      units: lookups.units,
      companyName: '永绅试用',
    }

    const materialDetailDraft = buildMaterialDetailDraftFromBOMVersion(runtimeVersion, options)
    assertNonBlankFields(
      materialDetailDraft,
      engineeringMaterialDetailPrintFieldCoverage,
      `${bomVersion.bomNo}.materialDetail`
    )
    materialDetailDraft.lines.forEach((line, index) =>
      assertNonBlankFields(
        line,
        engineeringMaterialDetailLinePrintFieldCoverage,
        `${bomVersion.bomNo}.materialDetail.lines[${index}]`
      )
    )

    const colorCardDraft = buildColorCardDraftFromBOMVersion(runtimeVersion, options)
    assert.ok(colorCardDraft.productNo, `${bomVersion.bomNo}.colorCard.productNo must not be blank`)
    assert.ok(colorCardDraft.productName, `${bomVersion.bomNo}.colorCard.productName must not be blank`)
    assert.ok(colorCardDraft.maker, `${bomVersion.bomNo}.colorCard.maker must not be blank`)
    assert.ok(colorCardDraft.dateText, `${bomVersion.bomNo}.colorCard.dateText must not be blank`)
    assert.ok(colorCardDraft.auditor, `${bomVersion.bomNo}.colorCard.auditor must not be blank`)
    colorCardDraft.blocks.forEach((block, index) => {
      assert.ok(block.materialName, `${bomVersion.bomNo}.colorCard.blocks[${index}].materialName must not be blank`)
      assert.ok(block.vendor, `${bomVersion.bomNo}.colorCard.blocks[${index}].vendor must not be blank`)
      assert.ok(block.lines.some((line) => line.position && line.method), `${bomVersion.bomNo}.colorCard.blocks[${index}] must include position and method`)
    })

    const workInstructionDraft = buildWorkInstructionDraftFromBOMVersion(runtimeVersion, options)
    assertNonBlankFields(
      workInstructionDraft,
      engineeringWorkInstructionPrintFieldCoverage,
      `${bomVersion.bomNo}.workInstruction`
    )
    assert.equal(
      workInstructionDraft.versionText,
      '',
      `${bomVersion.bomNo}.workInstruction.versionText must stay blank without a dedicated print edition source`
    )
    assert.equal(
      workInstructionDraft.processName,
      '',
      `${bomVersion.bomNo}.workInstruction.processName must not aggregate BOM item processes`
    )
    assert.equal(
      workInstructionDraft.processDateText,
      '',
      `${bomVersion.bomNo}.workInstruction.processDateText must stay blank without an explicit source`
    )
    assert.ok(workInstructionDraft.rows.length >= runtimeVersion.items.length, `${bomVersion.bomNo}.workInstruction rows must be generated from BOM items`)
    for (const [index, row] of workInstructionDraft.rows.entries()) {
      assert.ok(row.text.includes('用量：'), `${bomVersion.bomNo}.workInstruction.rows[${index}] must include quantity`)
      assert.ok(row.text.includes('加工：'), `${bomVersion.bomNo}.workInstruction.rows[${index}] must include process`)
    }
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
      contract_party_snapshot: purchaseOrder.contractPartySnapshot,
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
    assert.ok(
      supplier,
      `${outsourcingOrder.outsourcingOrderNo} processor fixture required`
    )
    const order = {
      outsourcing_order_no: outsourcingOrder.outsourcingOrderNo,
      supplier_id: supplier.id,
      contract_party_snapshot: outsourcingOrder.contractPartySnapshot,
      supplier_snapshot: {
        name: supplier.name,
        short_name: supplier.short_name,
        contact_name: supplier.contact_name,
        contact_phone: supplier.contact_phone,
        address: supplier.address,
      },
      source_order_no:
        outsourcingOrder.sourceOrderNo || outsourcingOrder.lines[0]?.productOrderNo,
      order_date: outsourcingOrder.orderDate,
      expected_return_date: outsourcingOrder.returnDate,
    }
    const items = outsourcingOrder.lines.map((line, index) => {
      const unit = lookups.unitByCode.get(line.unitCode)
      const subjectType = line.subjectType || 'PRODUCT'
      const product =
        subjectType === 'PRODUCT'
          ? lookups.productByNo.get(line.productNo)
          : undefined
      const material =
        subjectType === 'MATERIAL'
          ? lookups.materialByCode.get(line.materialCode)
          : undefined
      assert.ok(
        subjectType === 'PRODUCT' ? product : material,
        `${outsourcingOrder.outsourcingOrderNo} ${subjectType.toLowerCase()} fixture required`
      )
      assert.ok(unit, `${outsourcingOrder.outsourcingOrderNo} unit fixture required`)
      return {
        line_no: index + 1,
        subject_type: subjectType,
        product_id: product?.id,
        material_id: material?.id,
        process_id: index + 1,
        unit_id: unit.id,
        product_order_no_snapshot:
          subjectType === 'PRODUCT' ? line.productOrderNo : undefined,
        product_no_snapshot: subjectType === 'PRODUCT' ? line.productNo : undefined,
        product_name_snapshot:
          subjectType === 'PRODUCT' ? line.productName : undefined,
        material_code_snapshot:
          subjectType === 'MATERIAL' ? line.materialCode : undefined,
        material_name_snapshot:
          subjectType === 'MATERIAL' ? line.materialName : undefined,
        material_category_snapshot:
          subjectType === 'MATERIAL' ? material?.category : undefined,
        processing_item: line.processingItem,
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
      "name={[field.name, 'subject_type']}",
      "name={[field.name, 'product_id']}",
      "name={[field.name, 'material_id']}",
      "name={[field.name, 'product_order_no_snapshot']}",
      "name={[field.name, 'product_no_snapshot']}",
      "name={[field.name, 'product_name_snapshot']}",
      "name={[field.name, 'material_code_snapshot']}",
      "name={[field.name, 'material_name_snapshot']}",
      "name={[field.name, 'process_id']}",
      "name={[field.name, 'process_name_snapshot']}",
      "name={[field.name, 'process_category_snapshot']}",
      "name={[field.name, 'unit_id']}",
      "name={[field.name, 'outsourcing_quantity']}",
      "name={[field.name, 'unit_price']}",
      'label="金额预览"',
      "name={[field.name, 'note']}",
    ],
    'outsourcing order form'
  )
  assert.ok(
    outsourcingForm.includes('<Input') &&
      outsourcingForm.includes('readOnly') &&
      !outsourcingForm.includes("name={[field.name, 'amount']}"),
    'outsourcing amount must remain a read-only preview while backend derives the saved amount'
  )
  assert.ok(
    outsourcingPage.includes('加工合同打印') &&
      outsourcingPage.includes('openProcessingContractPrint'),
    'outsourcing order page must expose processing contract print action'
  )
})

test('yoyoosun engineering print source pages expose every business-owned print field', () => {
  const bomForm = readFileSync(
    'web/src/erp/components/bom/BOMVersionForms.jsx',
    'utf8'
  )
  const bomPage = readFileSync('web/src/erp/pages/BOMVersionsPage.jsx', 'utf8')
  const bomColumns = readFileSync(
    'web/src/erp/components/bom/BOMVersionColumns.jsx',
    'utf8'
  )

  assertSourceContainsAll(
    bomForm,
    [
      'name="source_order_no"',
      'name="quantity_text"',
      'name="spare_text"',
      'name="print_date"',
      'name="designer"',
      'name="maker"',
      'name="auditor"',
      'name="hair_direction"',
      'name="piece_count"',
      'name="total_usage_snapshot"',
      'name="process_base"',
      'name="process_method"',
    ],
    'bom version form'
  )
  assertSourceContainsAll(
    bomPage,
    [
      "name={[field.name, 'piece_count']}",
      "name={[field.name, 'total_usage_snapshot']}",
      "name={[field.name, 'process_base']}",
      "name={[field.name, 'process_method']}",
      'openPrintWorkspaceWindow',
      'buildMaterialDetailDraftFromBOMVersion',
      'buildColorCardDraftFromBOMVersion',
      'buildWorkInstructionDraftFromBOMVersion',
    ],
    'bom version page'
  )
  assertSourceContainsAll(
    bomColumns,
    ['source_order_no', 'designer', 'print_date'],
    'bom version columns'
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
      source_order_no:
        outsourcingOrder.sourceOrderNo || outsourcingOrder.lines[0]?.productOrderNo,
      order_date: outsourcingOrder.orderDate,
      expected_return_date: outsourcingOrder.returnDate,
    }
    const items = outsourcingOrder.lines.map((line, index) => {
      const unit = lookups.unitByCode.get(line.unitCode)
      const subjectType = line.subjectType || 'PRODUCT'
      const product =
        subjectType === 'PRODUCT'
          ? lookups.productByNo.get(line.productNo)
          : undefined
      const material =
        subjectType === 'MATERIAL'
          ? lookups.materialByCode.get(line.materialCode)
          : undefined
      assert.ok(
        subjectType === 'PRODUCT' ? product : material,
        `${outsourcingOrder.outsourcingOrderNo} ${subjectType.toLowerCase()} fixture required`
      )
      assert.ok(unit, `${outsourcingOrder.outsourcingOrderNo} unit fixture required`)
      return {
        line_no: index + 1,
        subject_type: subjectType,
        product_id: product?.id,
        material_id: material?.id,
        process_id: index + 1,
        unit_id: unit.id,
        product_order_no_snapshot:
          subjectType === 'PRODUCT' ? line.productOrderNo : undefined,
        product_no_snapshot: subjectType === 'PRODUCT' ? line.productNo : undefined,
        product_name_snapshot:
          subjectType === 'PRODUCT' ? line.productName : undefined,
        material_code_snapshot:
          subjectType === 'MATERIAL' ? line.materialCode : undefined,
        material_name_snapshot:
          subjectType === 'MATERIAL' ? line.materialName : undefined,
        material_category_snapshot:
          subjectType === 'MATERIAL' ? material?.category : undefined,
        processing_item: line.processingItem,
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
