export const PRODUCTION_WIP_ROUTE_CODE = 'PLUSH_SEW_HAND_V1'

export const PRODUCTION_WIP_ACTION = Object.freeze({
  SPLIT_BATCH: 'SPLIT_BATCH',
  ASSIGN_EXECUTION: 'ASSIGN_EXECUTION',
  START_OPERATION: 'START_OPERATION',
  COMPLETE_OPERATION: 'COMPLETE_OPERATION',
  RECEIVE_OUTSOURCING_RETURN: 'RECEIVE_OUTSOURCING_RETURN',
  TRANSFER_TO_NEXT_OPERATION: 'TRANSFER_TO_NEXT_OPERATION',
  CONFIRM_PACKAGING_MATERIAL: 'CONFIRM_PACKAGING_MATERIAL',
  REWORK: 'REWORK',
})

export const PRODUCTION_WIP_EXECUTION_MODE = Object.freeze({
  IN_HOUSE: 'IN_HOUSE',
  OUTSOURCED: 'OUTSOURCED',
})

export const PRODUCTION_WIP_EXECUTION_MODE_META = Object.freeze({
  IN_HOUSE: Object.freeze({ label: '本厂生产', color: 'blue' }),
  OUTSOURCED: Object.freeze({ label: '外发加工', color: 'gold' }),
})

export const PRODUCTION_WIP_STATUS_META = Object.freeze({
  PLANNED: Object.freeze({ label: '待安排', color: 'blue' }),
  IN_PROGRESS: Object.freeze({ label: '本厂生产中', color: 'processing' }),
  OUTSOURCED: Object.freeze({ label: '外发加工中', color: 'gold' }),
  WAITING_QUALITY: Object.freeze({ label: '待品质检验', color: 'gold' }),
  ACCEPTED: Object.freeze({ label: '检验合格', color: 'green' }),
  REJECTED: Object.freeze({ label: '检验不合格', color: 'red' }),
  SPLIT: Object.freeze({ label: '已拆分', color: 'default' }),
  CANCELLED: Object.freeze({ label: '已取消', color: 'default' }),
})

export const PRODUCTION_WIP_FLOW_TYPE = Object.freeze({
  NORMAL: 'NORMAL',
  REWORK: 'REWORK',
})

export const PRODUCTION_PACKAGING_CONFIRMATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
})

export const PRODUCTION_WIP_OPERATION_LABELS = Object.freeze({
  FABRIC_PROCESSING: '布料加工',
  SEWING: '车缝',
  HANDWORK: '手工',
  PACKAGING: '包装',
})

export const PRODUCTION_WIP_OUTPUT_LABELS = Object.freeze({
  CUT_PIECE: '裁片',
  SHELL: '皮套',
  FINISHED_GOODS: '手工成品',
  PACKED_GOODS: '已包装成品',
})

export const PRODUCTION_WIP_QUALITY_GATE_LABELS = Object.freeze({
  CUT_PIECE: '裁片检验',
  SHELL: '皮套检验',
  FINISHED_GOODS: '成品检验',
  NEEDLE: '针检',
  SAMPLING: '抽检',
  CUSTOMER_ACCEPTANCE: '客户验货',
})

export const PRODUCTION_WIP_QUALITY_STATUS_META = Object.freeze({
  DRAFT: Object.freeze({ label: '质检草稿', color: 'default' }),
  SUBMITTED: Object.freeze({ label: '检验中', color: 'processing' }),
  PASSED: Object.freeze({ label: '已判定', color: 'green' }),
  REJECTED: Object.freeze({ label: '不合格', color: 'red' }),
  CANCELLED: Object.freeze({ label: '已取消', color: 'default' }),
})

const QUALITY_RESULT_META = Object.freeze({
  PASS: Object.freeze({ label: '合格', color: 'green' }),
  CONCESSION: Object.freeze({ label: '让步接收', color: 'orange' }),
  REJECT: Object.freeze({ label: '不合格', color: 'red' }),
})

const MAX_KEY_LENGTH = 128
const MAX_REASON_LENGTH = 255
const NON_NEGATIVE_QUANTITY_PATTERN = /^(?:0*\d+(?:\.\d+)?|0*\.\d+)$/u
export const PRODUCTION_WIP_QUANTITY_MAX_LENGTH = 21
const PRODUCTION_WIP_QUANTITY_MAX_INTEGER_DIGITS = 14
const PRODUCTION_WIP_QUANTITY_MAX_FRACTION_DIGITS = 6

function invalidResponse() {
  const error = new Error('服务器返回的生产工序信息不完整，请刷新后重试')
  error.isInvalidResponse = true
  return error
}

function invalidAction(message = '生产工序操作内容不完整，请核对后重试') {
  const error = new Error(message)
  error.isInvalidAction = true
  return error
}

export function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function optionalPositiveInteger(value) {
  return value == null || positiveSafeInteger(value)
}

function requiredText(value) {
  return typeof value === 'string' && Boolean(value.trim())
}

function optionalText(value) {
  return value == null || typeof value === 'string'
}

function canonicalNonNegativeQuantity(value) {
  const text = String(value ?? '').trim()
  if (
    text.length > PRODUCTION_WIP_QUANTITY_MAX_LENGTH ||
    !NON_NEGATIVE_QUANTITY_PATTERN.test(text)
  ) {
    return ''
  }
  const [whole = '0', fraction = ''] = text.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, '') || '0'
  if (
    normalizedWhole.length > PRODUCTION_WIP_QUANTITY_MAX_INTEGER_DIGITS ||
    fraction.length > PRODUCTION_WIP_QUANTITY_MAX_FRACTION_DIGITS
  ) {
    return ''
  }
  const normalizedFraction = fraction.replace(/0+$/u, '')
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole
}

function canonicalQuantity(value) {
  const normalized = canonicalNonNegativeQuantity(value)
  return normalized && normalized !== '0' ? normalized : ''
}

export function normalizeProductionWipQuantity(value) {
  const normalized = canonicalQuantity(value)
  if (!normalized) {
    throw invalidAction('数量必须大于 0，且最多 14 位整数和 6 位小数')
  }
  return normalized
}

function quantityInteger(value, scale) {
  const normalized = canonicalQuantity(value)
  if (!normalized) {
    throw invalidAction('数量必须大于 0，且最多 14 位整数和 6 位小数')
  }
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`)
}

export function compareProductionWipQuantity(left, right) {
  const leftText = canonicalQuantity(left)
  const rightText = canonicalQuantity(right)
  if (!leftText || !rightText) {
    throw invalidAction('数量必须大于 0，且最多 14 位整数和 6 位小数')
  }
  const leftScale = leftText.split('.')[1]?.length || 0
  const rightScale = rightText.split('.')[1]?.length || 0
  const scale = Math.max(leftScale, rightScale)
  const leftValue = quantityInteger(leftText, scale)
  const rightValue = quantityInteger(rightText, scale)
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1
}

function quantityTextFromInteger(value, scale) {
  const digits = value.toString().padStart(scale + 1, '0')
  if (scale === 0) return digits
  const whole = digits.slice(0, -scale) || '0'
  const fraction = digits.slice(-scale).replace(/0+$/u, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export function buildProductionWipConservingSplits(
  sourceQuantity,
  splitQuantity
) {
  const source = normalizeProductionWipQuantity(sourceQuantity)
  const split = normalizeProductionWipQuantity(splitQuantity)
  if (compareProductionWipQuantity(split, source) >= 0) {
    throw invalidAction('拆分数量必须小于当前批次数量')
  }
  const sourceScale = source.split('.')[1]?.length || 0
  const splitScale = split.split('.')[1]?.length || 0
  const scale = Math.max(sourceScale, splitScale)
  const remainder = quantityTextFromInteger(
    quantityInteger(source, scale) - quantityInteger(split, scale),
    scale
  )
  return Object.freeze([
    Object.freeze({ quantity: split }),
    Object.freeze({ quantity: remainder }),
  ])
}

export function productionWipUUID(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID !== 'function') {
    throw invalidAction('当前浏览器暂时无法安全提交，请刷新或升级浏览器后重试')
  }
  return cryptoProvider.randomUUID()
}

function validateProductionOrder(order, expectedOrderID) {
  if (
    !order ||
    typeof order !== 'object' ||
    !positiveSafeInteger(order.id) ||
    !requiredText(order.order_no) ||
    !positiveSafeInteger(order.version) ||
    !requiredText(order.status) ||
    (positiveSafeInteger(expectedOrderID) && order.id !== expectedOrderID)
  ) {
    throw invalidResponse()
  }
  return order
}

function validateProductionOrderItem(item, productionOrderID) {
  if (
    !item ||
    typeof item !== 'object' ||
    !positiveSafeInteger(item.id) ||
    item.production_order_id !== productionOrderID ||
    !positiveSafeInteger(item.line_no) ||
    !positiveSafeInteger(item.product_id) ||
    !positiveSafeInteger(item.unit_id) ||
    !optionalPositiveInteger(item.product_sku_id) ||
    !canonicalQuantity(item.planned_quantity) ||
    !optionalText(item.product_code_snapshot) ||
    !optionalText(item.product_name_snapshot) ||
    !optionalText(item.sku_code_snapshot) ||
    !optionalText(item.unit_name_snapshot) ||
    !optionalText(item.route_code) ||
    typeof item.customer_inspection_required !== 'boolean'
  ) {
    throw invalidResponse()
  }
  return item
}

function validateQualityGates(gates) {
  if (
    !Array.isArray(gates) ||
    new Set(gates).size !== gates.length ||
    gates.some(
      (gate) =>
        !Object.hasOwn(PRODUCTION_WIP_QUALITY_GATE_LABELS, String(gate || ''))
    )
  ) {
    throw invalidResponse()
  }
  return gates
}

function validateOperation(operation, productionOrderID) {
  if (
    !operation ||
    typeof operation !== 'object' ||
    !positiveSafeInteger(operation.id) ||
    operation.production_order_id !== productionOrderID ||
    !positiveSafeInteger(operation.production_order_item_id) ||
    operation.route_code !== PRODUCTION_WIP_ROUTE_CODE ||
    !positiveSafeInteger(operation.route_version) ||
    !positiveSafeInteger(operation.step_no) ||
    !requiredText(operation.operation_code) ||
    !positiveSafeInteger(operation.process_id) ||
    !requiredText(operation.process_code_snapshot) ||
    !requiredText(operation.process_name_snapshot) ||
    !Object.hasOwn(
      PRODUCTION_WIP_OUTPUT_LABELS,
      String(operation.output_code || '')
    ) ||
    typeof operation.inhouse_allowed !== 'boolean' ||
    typeof operation.outsourcing_allowed !== 'boolean' ||
    (!operation.inhouse_allowed && !operation.outsourcing_allowed) ||
    !canonicalQuantity(operation.planned_quantity) ||
    !positiveSafeInteger(operation.created_at) ||
    !optionalText(operation.business_confirmation_code) ||
    (operation.business_confirmation_code != null &&
      operation.business_confirmation_code !== 'PACKAGING_MATERIAL')
  ) {
    throw invalidResponse()
  }
  validateQualityGates(operation.required_quality_gates)
  return operation
}

function validatePlushRouteSnapshots(operations, itemByID) {
  const byItem = new Map()
  for (const operation of operations) {
    const current = byItem.get(operation.production_order_item_id) || []
    current.push(operation)
    byItem.set(operation.production_order_item_id, current)
  }
  for (const [itemID, itemOperations] of byItem) {
    const item = itemByID.get(itemID)
    const customerGates = item?.customer_inspection_required
      ? ['FINISHED_GOODS', 'NEEDLE', 'SAMPLING', 'CUSTOMER_ACCEPTANCE']
      : ['FINISHED_GOODS', 'NEEDLE', 'SAMPLING']
    const expected = [
      {
        stepNo: 10,
        operationCode: 'FABRIC_PROCESSING',
        outputCode: 'CUT_PIECE',
        inhouseAllowed: false,
        outsourcingAllowed: true,
        qualityGates: ['CUT_PIECE'],
        businessConfirmationCode: null,
      },
      {
        stepNo: 20,
        operationCode: 'SEWING',
        outputCode: 'SHELL',
        inhouseAllowed: true,
        outsourcingAllowed: true,
        qualityGates: ['SHELL'],
        businessConfirmationCode: null,
      },
      {
        stepNo: 30,
        operationCode: 'HANDWORK',
        outputCode: 'FINISHED_GOODS',
        inhouseAllowed: true,
        outsourcingAllowed: true,
        qualityGates: customerGates,
        businessConfirmationCode: null,
      },
      {
        stepNo: 40,
        operationCode: 'PACKAGING',
        outputCode: 'PACKED_GOODS',
        inhouseAllowed: true,
        outsourcingAllowed: false,
        qualityGates: [],
        businessConfirmationCode: 'PACKAGING_MATERIAL',
      },
    ]
    const sorted = [...itemOperations].sort(
      (left, right) => left.step_no - right.step_no
    )
    if (
      !item ||
      item.route_code !== PRODUCTION_WIP_ROUTE_CODE ||
      sorted.length !== expected.length ||
      sorted.some((operation, index) => {
        const wanted = expected[index]
        return (
          operation.route_version !== 1 ||
          operation.step_no !== wanted.stepNo ||
          operation.operation_code !== wanted.operationCode ||
          operation.output_code !== wanted.outputCode ||
          operation.inhouse_allowed !== wanted.inhouseAllowed ||
          operation.outsourcing_allowed !== wanted.outsourcingAllowed ||
          operation.business_confirmation_code !==
            wanted.businessConfirmationCode ||
          canonicalQuantity(operation.planned_quantity) !==
            canonicalQuantity(item.planned_quantity) ||
          operation.required_quality_gates.length !==
            wanted.qualityGates.length ||
          operation.required_quality_gates.some(
            (gateCode, gateIndex) => gateCode !== wanted.qualityGates[gateIndex]
          )
        )
      })
    ) {
      throw invalidResponse()
    }
  }
}

function validateBatch(batch, productionOrderID) {
  if (
    !batch ||
    typeof batch !== 'object' ||
    !positiveSafeInteger(batch.id) ||
    batch.production_order_id !== productionOrderID ||
    !positiveSafeInteger(batch.production_order_item_id) ||
    !positiveSafeInteger(batch.production_order_operation_id) ||
    !optionalPositiveInteger(batch.source_batch_id) ||
    !requiredText(batch.batch_no) ||
    !Object.hasOwn(PRODUCTION_WIP_FLOW_TYPE, batch.flow_type) ||
    (batch.execution_mode != null &&
      !Object.hasOwn(
        PRODUCTION_WIP_EXECUTION_MODE_META,
        batch.execution_mode
      )) ||
    !Object.hasOwn(PRODUCTION_WIP_STATUS_META, batch.status) ||
    !positiveSafeInteger(batch.version) ||
    !canonicalQuantity(batch.quantity) ||
    !optionalText(batch.rework_reason) ||
    (batch.flow_type === PRODUCTION_WIP_FLOW_TYPE.REWORK &&
      (!positiveSafeInteger(batch.source_batch_id) ||
        !requiredText(batch.rework_reason))) ||
    (batch.flow_type === PRODUCTION_WIP_FLOW_TYPE.NORMAL &&
      batch.rework_reason != null)
  ) {
    throw invalidResponse()
  }
  return batch
}

function validateMaterialRequirement(value, productionOrderID) {
  if (
    !value ||
    typeof value !== 'object' ||
    !positiveSafeInteger(value.id) ||
    value.production_order_id !== productionOrderID ||
    !positiveSafeInteger(value.production_order_item_id) ||
    !positiveSafeInteger(value.bom_header_id) ||
    !positiveSafeInteger(value.bom_item_id) ||
    !positiveSafeInteger(value.material_id) ||
    !positiveSafeInteger(value.unit_id) ||
    (value.production_operation_code != null &&
      value.production_operation_code !== 'FABRIC_PROCESSING') ||
    !canonicalQuantity(value.unit_quantity_snapshot) ||
    !canonicalNonNegativeQuantity(value.loss_rate_snapshot) ||
    !canonicalQuantity(value.planned_quantity) ||
    !canonicalNonNegativeQuantity(value.issued_quantity) ||
    !canonicalNonNegativeQuantity(value.remaining_quantity) ||
    !requiredText(value.material_code_snapshot) ||
    !requiredText(value.material_name_snapshot) ||
    !requiredText(value.unit_code_snapshot) ||
    !requiredText(value.unit_name_snapshot) ||
    !positiveSafeInteger(value.created_at) ||
    !positiveSafeInteger(value.updated_at)
  ) {
    throw invalidResponse()
  }
  return value
}

function validateOutsourcingAllocation(value) {
  const subjectType = String(value?.subject_type || '')
    .trim()
    .toUpperCase()
  if (
    !value ||
    typeof value !== 'object' ||
    !positiveSafeInteger(value.id) ||
    !positiveSafeInteger(value.production_wip_batch_id) ||
    !positiveSafeInteger(value.outsourcing_order_item_id) ||
    !optionalPositiveInteger(value.production_order_material_requirement_id) ||
    !['PRODUCT', 'MATERIAL'].includes(subjectType) ||
    !canonicalQuantity(value.allocated_quantity) ||
    !positiveSafeInteger(value.unit_id) ||
    !positiveSafeInteger(value.created_by) ||
    !positiveSafeInteger(value.created_at) ||
    (subjectType === 'PRODUCT' &&
      value.production_order_material_requirement_id != null) ||
    (subjectType === 'MATERIAL' &&
      !positiveSafeInteger(value.production_order_material_requirement_id))
  ) {
    throw invalidResponse()
  }
  return value
}

function validateQualityInspection(inspection) {
  if (
    !inspection ||
    typeof inspection !== 'object' ||
    !positiveSafeInteger(inspection.id) ||
    !positiveSafeInteger(inspection.production_wip_batch_id) ||
    !Object.hasOwn(
      PRODUCTION_WIP_QUALITY_GATE_LABELS,
      String(inspection.gate_code || '')
    ) ||
    !Object.hasOwn(
      PRODUCTION_WIP_QUALITY_STATUS_META,
      String(inspection.status || '')
    ) ||
    (inspection.result != null &&
      !Object.hasOwn(QUALITY_RESULT_META, String(inspection.result || ''))) ||
    !optionalText(inspection.inspection_no) ||
    (inspection.status === 'PASSED' && inspection.result !== 'PASS') ||
    (inspection.status === 'REJECTED' && inspection.result !== 'REJECT') ||
    (['DRAFT', 'SUBMITTED'].includes(inspection.status) &&
      inspection.result != null)
  ) {
    throw invalidResponse()
  }
  return inspection
}

function validatePackagingConfirmation(value, productionOrderID) {
  if (
    !value ||
    typeof value !== 'object' ||
    !positiveSafeInteger(value.id) ||
    value.production_order_id !== productionOrderID ||
    !positiveSafeInteger(value.production_order_item_id) ||
    !Object.hasOwn(PRODUCTION_PACKAGING_CONFIRMATION_STATUS, value.status) ||
    !positiveSafeInteger(value.version) ||
    !optionalText(value.packaging_version_snapshot) ||
    (value.packaging_version_snapshot != null &&
      [...value.packaging_version_snapshot.trim()].length > 128) ||
    !optionalText(value.note) ||
    (value.note != null && [...value.note.trim()].length > MAX_REASON_LENGTH) ||
    !optionalPositiveInteger(value.confirmed_by) ||
    !optionalPositiveInteger(value.confirmed_at) ||
    !positiveSafeInteger(value.created_at) ||
    !positiveSafeInteger(value.updated_at) ||
    (value.status === 'PENDING' &&
      (value.confirmed_by != null || value.confirmed_at != null)) ||
    (value.status === 'CONFIRMED' &&
      (!requiredText(value.packaging_version_snapshot) ||
        !positiveSafeInteger(value.confirmed_by) ||
        !positiveSafeInteger(value.confirmed_at)))
  ) {
    throw invalidResponse()
  }
  return value
}

function ensureUniqueIDs(records) {
  const ids = records.map((record) => record.id)
  if (new Set(ids).size !== ids.length) throw invalidResponse()
}

function hasBatchLineageCycle(batch, batchByID) {
  const seen = new Set()
  let current = batch
  while (current) {
    if (seen.has(current.id)) return true
    seen.add(current.id)
    current = current.source_batch_id
      ? batchByID.get(current.source_batch_id)
      : null
  }
  return false
}

export function validateProductionWipAggregate(data, expected = {}) {
  if (
    !data ||
    !Array.isArray(data.production_wip_batches) ||
    !Array.isArray(data.material_requirements) ||
    !Array.isArray(data.production_order_operations) ||
    !Array.isArray(data.outsourcing_allocations) ||
    !Array.isArray(data.packaging_confirmations) ||
    !Array.isArray(data.quality_inspections) ||
    (data.production_order_items != null &&
      !Array.isArray(data.production_order_items))
  ) {
    throw invalidResponse()
  }
  const order = validateProductionOrder(
    data.production_order,
    expected.productionOrderID
  )
  const items = (data.production_order_items || []).map((item) =>
    validateProductionOrderItem(item, order.id)
  )
  const operations = data.production_order_operations
    .map((operation) => validateOperation(operation, order.id))
    .sort((left, right) => {
      if (left.production_order_item_id !== right.production_order_item_id) {
        return left.production_order_item_id - right.production_order_item_id
      }
      return left.step_no - right.step_no
    })
  const batches = data.production_wip_batches.map((batch) =>
    validateBatch(batch, order.id)
  )
  const materialRequirements = data.material_requirements.map((requirement) =>
    validateMaterialRequirement(requirement, order.id)
  )
  const outsourcingAllocations = data.outsourcing_allocations.map(
    validateOutsourcingAllocation
  )
  const qualityInspections = data.quality_inspections.map(
    validateQualityInspection
  )
  const packagingConfirmations = data.packaging_confirmations.map((value) =>
    validatePackagingConfirmation(value, order.id)
  )
  ensureUniqueIDs(items)
  ensureUniqueIDs(operations)
  ensureUniqueIDs(batches)
  ensureUniqueIDs(materialRequirements)
  ensureUniqueIDs(outsourcingAllocations)
  ensureUniqueIDs(qualityInspections)
  ensureUniqueIDs(packagingConfirmations)

  const activeQualityGateKeys = qualityInspections
    .filter((inspection) => inspection.status !== 'CANCELLED')
    .map(
      (inspection) =>
        `${inspection.production_wip_batch_id}:${inspection.gate_code}`
    )
  if (new Set(activeQualityGateKeys).size !== activeQualityGateKeys.length) {
    throw invalidResponse()
  }

  const itemIDs = new Set(items.map((item) => item.id))
  const itemByID = new Map(items.map((item) => [item.id, item]))
  const operationByID = new Map(
    operations.map((operation) => [operation.id, operation])
  )
  const requirementByID = new Map(
    materialRequirements.map((requirement) => [requirement.id, requirement])
  )
  const operationItemIDs = new Set(
    operations.map((operation) => operation.production_order_item_id)
  )
  const batchByID = new Map(batches.map((batch) => [batch.id, batch]))
  const allocationsByBatch = new Map()
  for (const allocation of outsourcingAllocations) {
    const current = allocationsByBatch.get(allocation.production_wip_batch_id)
    if (current) {
      current.push(allocation)
    } else {
      allocationsByBatch.set(allocation.production_wip_batch_id, [allocation])
    }
  }
  const allocationItemKeys = outsourcingAllocations.map(
    (allocation) =>
      `${allocation.production_wip_batch_id}:${allocation.outsourcing_order_item_id}`
  )
  const allocationRequirementKeys = outsourcingAllocations
    .filter(
      (allocation) =>
        allocation.production_order_material_requirement_id != null
    )
    .map(
      (allocation) =>
        `${allocation.production_wip_batch_id}:${allocation.production_order_material_requirement_id}`
    )
  if (
    materialRequirements.some(
      (requirement) => !itemIDs.has(requirement.production_order_item_id)
    ) ||
    operations.some(
      (operation) =>
        itemIDs.size > 0 && !itemIDs.has(operation.production_order_item_id)
    ) ||
    batches.some((batch) => {
      const operation = operationByID.get(batch.production_order_operation_id)
      const sourceBatch = batch.source_batch_id
        ? batchByID.get(batch.source_batch_id)
        : null
      return (
        !operation ||
        operation.production_order_item_id !== batch.production_order_item_id ||
        (itemIDs.size > 0 && !itemIDs.has(batch.production_order_item_id)) ||
        (batch.source_batch_id && !sourceBatch) ||
        hasBatchLineageCycle(batch, batchByID) ||
        (sourceBatch &&
          sourceBatch.production_order_item_id !==
            batch.production_order_item_id)
      )
    }) ||
    outsourcingAllocations.some((allocation) => {
      const batch = batchByID.get(allocation.production_wip_batch_id)
      const operation = batch
        ? operationByID.get(batch.production_order_operation_id)
        : null
      const item = batch ? itemByID.get(batch.production_order_item_id) : null
      const requirement = allocation.production_order_material_requirement_id
        ? requirementByID.get(
            allocation.production_order_material_requirement_id
          )
        : null
      const isNormalFabric =
        operation?.operation_code === 'FABRIC_PROCESSING' &&
        batch?.flow_type === PRODUCTION_WIP_FLOW_TYPE.NORMAL
      if (!batch || !operation || !item) return true
      if (allocation.subject_type === 'MATERIAL') {
        return (
          !isNormalFabric ||
          !requirement ||
          requirement.production_order_item_id !==
            batch.production_order_item_id ||
          requirement.production_operation_code !== 'FABRIC_PROCESSING' ||
          allocation.unit_id !== requirement.unit_id ||
          compareProductionWipQuantity(
            allocation.allocated_quantity,
            requirement.planned_quantity
          ) !== 0
        )
      }
      return (
        isNormalFabric ||
        allocation.production_order_material_requirement_id != null ||
        allocation.unit_id !== item.unit_id ||
        compareProductionWipQuantity(
          allocation.allocated_quantity,
          batch.quantity
        ) !== 0
      )
    }) ||
    batches.some((batch) => {
      const allocations = allocationsByBatch.get(batch.id) || []
      if (batch.execution_mode !== PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED) {
        return allocations.length !== 0
      }
      const operation = operationByID.get(batch.production_order_operation_id)
      if (
        operation?.operation_code === 'FABRIC_PROCESSING' &&
        batch.flow_type === PRODUCTION_WIP_FLOW_TYPE.NORMAL
      ) {
        const requirementIDs = materialRequirements
          .filter(
            (requirement) =>
              requirement.production_order_item_id ===
                batch.production_order_item_id &&
              requirement.production_operation_code === 'FABRIC_PROCESSING'
          )
          .map((requirement) => requirement.id)
        return (
          requirementIDs.length === 0 ||
          allocations.length !== requirementIDs.length ||
          allocations.some(
            (allocation) => allocation.subject_type !== 'MATERIAL'
          ) ||
          requirementIDs.some(
            (requirementID) =>
              !allocations.some(
                (allocation) =>
                  allocation.production_order_material_requirement_id ===
                  requirementID
              )
          )
        )
      }
      return (
        allocations.length !== 1 || allocations[0]?.subject_type !== 'PRODUCT'
      )
    }) ||
    new Set(allocationItemKeys).size !== allocationItemKeys.length ||
    new Set(allocationRequirementKeys).size !==
      allocationRequirementKeys.length ||
    qualityInspections.some((inspection) => {
      const batch = batchByID.get(inspection.production_wip_batch_id)
      const operation = batch
        ? operationByID.get(batch.production_order_operation_id)
        : null
      return (
        !batch ||
        !operation ||
        !operation.required_quality_gates.includes(inspection.gate_code)
      )
    }) ||
    packagingConfirmations.some(
      (confirmation) =>
        !operationItemIDs.has(confirmation.production_order_item_id) ||
        (itemIDs.size > 0 &&
          !itemIDs.has(confirmation.production_order_item_id))
    ) ||
    new Set(
      packagingConfirmations.map(
        (confirmation) => confirmation.production_order_item_id
      )
    ).size !== packagingConfirmations.length ||
    (operations.length > 0 &&
      operationItemIDs.size !== packagingConfirmations.length)
  ) {
    throw invalidResponse()
  }
  validatePlushRouteSnapshots(operations, itemByID)
  const initialized = operations.length > 0 || batches.length > 0
  if (initialized && (operations.length === 0 || batches.length === 0)) {
    throw invalidResponse()
  }
  return Object.freeze({
    productionOrder: order,
    items: Object.freeze(items),
    materialRequirements: Object.freeze(materialRequirements),
    batches: Object.freeze(batches),
    outsourcingAllocations: Object.freeze(outsourcingAllocations),
    operations: Object.freeze(operations),
    qualityInspections: Object.freeze(qualityInspections),
    packagingConfirmations: Object.freeze(packagingConfirmations),
    initialized,
  })
}

function requireActionText(value, label, maxLength = MAX_KEY_LENGTH) {
  const text = String(value || '').trim()
  if (!text || [...text].length > maxLength) {
    throw invalidAction(`${label}不完整，请刷新后重试`)
  }
  return text
}

function copyPositiveID(params, source, key, required = false) {
  const value = source?.[key]
  if (value == null && !required) return
  if (!positiveSafeInteger(value)) throw invalidAction()
  params[key] = value
}

function normalizeOutsourcingAllocations(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 100) {
    throw invalidAction('请选择已关联的加工合同明细')
  }
  const seenItems = new Set()
  const seenRequirements = new Set()
  const allocations = values.map((value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !positiveSafeInteger(value.outsourcing_order_item_id)
    ) {
      throw invalidAction('请选择已关联的加工合同明细')
    }
    if (seenItems.has(value.outsourcing_order_item_id)) {
      throw invalidAction('加工合同明细不能重复关联')
    }
    seenItems.add(value.outsourcing_order_item_id)
    const allocation = {
      outsourcing_order_item_id: value.outsourcing_order_item_id,
    }
    if (value.production_order_material_requirement_id != null) {
      if (
        !positiveSafeInteger(value.production_order_material_requirement_id) ||
        seenRequirements.has(value.production_order_material_requirement_id)
      ) {
        throw invalidAction('生产材料需求不能重复关联')
      }
      seenRequirements.add(value.production_order_material_requirement_id)
      allocation.production_order_material_requirement_id =
        value.production_order_material_requirement_id
    }
    return Object.freeze(allocation)
  })
  allocations.sort((left, right) => {
    if (left.outsourcing_order_item_id !== right.outsourcing_order_item_id) {
      return left.outsourcing_order_item_id - right.outsourcing_order_item_id
    }
    return (
      (left.production_order_material_requirement_id || 0) -
      (right.production_order_material_requirement_id || 0)
    )
  })
  return Object.freeze(allocations)
}

export function buildProductionWipActionParams(action, values = {}) {
  const normalizedAction = requireActionText(action, '操作类型')
  if (!Object.values(PRODUCTION_WIP_ACTION).includes(normalizedAction)) {
    throw invalidAction('当前操作暂不可用，请刷新后重试')
  }
  const params = { action: normalizedAction }
  copyPositiveID(params, values, 'production_order_id', true)
  params.idempotency_key = requireActionText(
    values.idempotency_key,
    '安全提交凭据'
  )

  const requireBatch = () => {
    copyPositiveID(params, values, 'production_wip_batch_id', true)
    copyPositiveID(params, values, 'expected_version', true)
    if (!params.production_wip_batch_id || !params.expected_version) {
      throw invalidAction()
    }
  }
  const copyQuantity = () => {
    if (values.quantity != null && String(values.quantity).trim()) {
      params.quantity = normalizeProductionWipQuantity(values.quantity)
    }
  }
  switch (normalizedAction) {
    case PRODUCTION_WIP_ACTION.SPLIT_BATCH: {
      requireBatch()
      if (
        !Array.isArray(values.splits) ||
        values.splits.length < 2 ||
        values.splits.length > 100
      ) {
        throw invalidAction('请填写拆分数量')
      }
      params.splits = Object.freeze(
        values.splits.map((split) => {
          if (!split || typeof split !== 'object') {
            throw invalidAction('请填写拆分数量')
          }
          return Object.freeze({
            quantity: normalizeProductionWipQuantity(split.quantity),
          })
        })
      )
      break
    }
    case PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION:
      requireBatch()
      if (
        !Object.hasOwn(
          PRODUCTION_WIP_EXECUTION_MODE_META,
          values.execution_mode
        )
      ) {
        throw invalidAction('请选择本厂生产或外发加工')
      }
      params.execution_mode = values.execution_mode
      if (!params.execution_mode) throw invalidAction()
      if (params.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED) {
        params.outsourcing_allocations = normalizeOutsourcingAllocations(
          values.outsourcing_allocations
        )
      }
      break
    case PRODUCTION_WIP_ACTION.START_OPERATION:
    case PRODUCTION_WIP_ACTION.COMPLETE_OPERATION:
    case PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN:
      requireBatch()
      break
    case PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION:
      requireBatch()
      copyPositiveID(params, values, 'target_operation_id', true)
      copyQuantity()
      if (!params.target_operation_id || !params.quantity) {
        throw invalidAction()
      }
      break
    case PRODUCTION_WIP_ACTION.REWORK:
      requireBatch()
      copyPositiveID(params, values, 'target_operation_id', true)
      copyQuantity()
      if (values.reason != null && String(values.reason).trim()) {
        params.reason = requireActionText(
          values.reason,
          '返工原因',
          MAX_REASON_LENGTH
        )
      }
      if (!params.target_operation_id || !params.quantity || !params.reason) {
        throw invalidAction('请选择返工去向、填写数量和原因')
      }
      break
    case PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL:
      copyPositiveID(params, values, 'production_order_item_id', true)
      copyPositiveID(params, values, 'expected_version', true)
      params.packaging_version_snapshot = requireActionText(
        values.packaging_version_snapshot,
        '包装版本',
        128
      )
      if (values.note != null && String(values.note).trim()) {
        params.note = requireActionText(
          values.note,
          '确认说明',
          MAX_REASON_LENGTH
        )
      }
      break
    default:
      throw invalidAction()
  }
  return Object.freeze(params)
}

export function productionWipOrderItem(aggregate, batch) {
  if (!aggregate || !batch) return null
  return (
    aggregate.items.find(
      (item) => item.id === batch.production_order_item_id
    ) || null
  )
}

export function productionWipPackagingConfirmationForBatch(aggregate, batch) {
  if (!aggregate || !batch) return null
  return (
    aggregate.packagingConfirmations.find(
      (confirmation) =>
        confirmation.production_order_item_id === batch.production_order_item_id
    ) || null
  )
}

export function productionWipOrderItemLabel(item = {}) {
  const line = positiveSafeInteger(item.line_no) ? `第 ${item.line_no} 行` : ''
  const product = [
    item.product_name_snapshot,
    item.sku_code_snapshot || item.product_code_snapshot,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' / ')
  return [line, product || '订单产品已关联'].filter(Boolean).join(' · ')
}

export function productionWipBatchLabel(batch = {}, item = null) {
  return [
    String(batch.batch_no || '').trim() || '在制批次待核对',
    productionWipOrderItemLabel(item || {}),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function productionWipOperationLabel(operation = {}) {
  return (
    String(operation.process_name_snapshot || '').trim() ||
    PRODUCTION_WIP_OPERATION_LABELS[
      String(operation.operation_code || '').trim()
    ] ||
    '工序待核对'
  )
}

function nullablePositiveID(value) {
  if (value === null || value === undefined) return null
  return positiveSafeInteger(value) ? value : undefined
}

function snapshotText(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean)
}

function outsourcingFactoryLabel(order = {}) {
  const snapshot =
    order.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  return (
    snapshotText(snapshot.short_name, snapshot.name, snapshot.code) ||
    '加工厂已关联'
  )
}

export function productionWipOutsourcingCandidateMatches(
  source = {},
  { productionOrderItem = {}, operation = {}, batch = {} } = {}
) {
  const order = source?.order
  const item = source?.item
  const itemSKU = nullablePositiveID(item?.product_sku_id)
  const productionSKU = nullablePositiveID(productionOrderItem?.product_sku_id)
  const operationCode = String(operation.operation_code || '').trim()
  const productOperationAllowed =
    ['SEWING', 'HANDWORK'].includes(operationCode) ||
    (operationCode === 'FABRIC_PROCESSING' &&
      batch.flow_type === PRODUCTION_WIP_FLOW_TYPE.REWORK)
  if (
    !order ||
    !item ||
    !positiveSafeInteger(order.id) ||
    !positiveSafeInteger(order.version) ||
    !requiredText(order.outsourcing_order_no) ||
    String(order.lifecycle_status || '')
      .trim()
      .toLowerCase() !== 'confirmed' ||
    !productOperationAllowed ||
    !positiveSafeInteger(item.id) ||
    item.outsourcing_order_id !== order.id ||
    String(item.line_status || '')
      .trim()
      .toLowerCase() !== 'open' ||
    String(item.subject_type || '')
      .trim()
      .toUpperCase() !== 'PRODUCT' ||
    !positiveSafeInteger(item.product_id) ||
    item.product_id !== productionOrderItem.product_id ||
    item.material_id != null ||
    itemSKU === undefined ||
    productionSKU === undefined ||
    itemSKU !== productionSKU ||
    !positiveSafeInteger(item.process_id) ||
    item.process_id !== operation.process_id ||
    !positiveSafeInteger(item.unit_id) ||
    item.unit_id !== productionOrderItem.unit_id
  ) {
    return false
  }
  try {
    return (
      compareProductionWipQuantity(
        item.outsourcing_quantity,
        batch.quantity
      ) === 0
    )
  } catch {
    return false
  }
}

export function productionWipFabricMaterialRequirements(aggregate, batch = {}) {
  if (
    !aggregate ||
    !Array.isArray(aggregate.materialRequirements) ||
    !positiveSafeInteger(batch?.production_order_item_id)
  ) {
    return Object.freeze([])
  }
  return Object.freeze(
    aggregate.materialRequirements
      .filter(
        (requirement) =>
          requirement.production_order_item_id ===
            batch.production_order_item_id &&
          requirement.production_operation_code === 'FABRIC_PROCESSING'
      )
      .sort((left, right) => left.id - right.id)
  )
}

export function productionWipMaterialOutsourcingCandidateMatches(
  source = {},
  { requirement = {}, operation = {} } = {}
) {
  const order = source?.order
  const item = source?.item
  if (
    !order ||
    !item ||
    !positiveSafeInteger(order.id) ||
    !positiveSafeInteger(order.version) ||
    !requiredText(order.outsourcing_order_no) ||
    String(order.lifecycle_status || '')
      .trim()
      .toLowerCase() !== 'confirmed' ||
    String(operation.operation_code || '').trim() !== 'FABRIC_PROCESSING' ||
    requirement.production_operation_code !== 'FABRIC_PROCESSING' ||
    !positiveSafeInteger(item.id) ||
    item.outsourcing_order_id !== order.id ||
    String(item.line_status || '')
      .trim()
      .toLowerCase() !== 'open' ||
    String(item.subject_type || '')
      .trim()
      .toUpperCase() !== 'MATERIAL' ||
    !positiveSafeInteger(item.material_id) ||
    item.material_id !== requirement.material_id ||
    item.product_id != null ||
    item.product_sku_id != null ||
    !positiveSafeInteger(item.process_id) ||
    item.process_id !== operation.process_id ||
    !positiveSafeInteger(item.unit_id) ||
    item.unit_id !== requirement.unit_id
  ) {
    return false
  }
  try {
    return (
      compareProductionWipQuantity(
        item.outsourcing_quantity,
        requirement.planned_quantity
      ) === 0
    )
  } catch {
    return false
  }
}

function distinctMaterialCandidateAssignment(requirementOptions) {
  const assignedRequirementByItem = new Map()
  const selectedItemByRequirement = new Map()
  const visit = (requirementID, visitedItems) => {
    const entry = requirementOptions.find(
      (candidate) => candidate.requirementID === requirementID
    )
    for (const option of entry?.options || []) {
      if (visitedItems.has(option.value)) continue
      visitedItems.add(option.value)
      const previousRequirementID = assignedRequirementByItem.get(option.value)
      if (
        previousRequirementID == null ||
        visit(previousRequirementID, visitedItems)
      ) {
        assignedRequirementByItem.set(option.value, requirementID)
        selectedItemByRequirement.set(requirementID, option.value)
        return true
      }
    }
    return false
  }
  for (const entry of requirementOptions) {
    if (!visit(entry.requirementID, new Set())) return null
  }
  return selectedItemByRequirement
}

export function buildProductionWipFabricContractOptions(
  sources = [],
  { requirements = [], operation = {} } = {}
) {
  if (!Array.isArray(sources) || !Array.isArray(requirements)) {
    return Object.freeze([])
  }
  const sourceOrders = new Map()
  for (const source of sources) {
    if (positiveSafeInteger(source?.order?.id)) {
      sourceOrders.set(source.order.id, source.order)
    }
  }
  const bundles = []
  for (const [orderID, order] of sourceOrders) {
    const requirementOptions = requirements.map((requirement) => {
      const seen = new Set()
      const material =
        [
          snapshotText(requirement.material_code_snapshot),
          snapshotText(requirement.material_name_snapshot),
        ]
          .filter(Boolean)
          .join(' / ') || '材料已关联'
      const unit = snapshotText(requirement.unit_name_snapshot) || '单位已关联'
      const quantity = normalizeProductionWipQuantity(
        requirement.planned_quantity
      )
      const options = sources
        .filter(
          (source) =>
            source?.order?.id === orderID &&
            productionWipMaterialOutsourcingCandidateMatches(source, {
              requirement,
              operation,
            })
        )
        .filter((source) => {
          if (seen.has(source.item.id)) return false
          seen.add(source.item.id)
          return true
        })
        .map((source) => {
          const { item } = source
          const line = positiveSafeInteger(item.line_no)
            ? `第 ${item.line_no} 行`
            : '合同明细'
          const process =
            snapshotText(
              item.process_name_snapshot,
              operation.process_name_snapshot
            ) || '布料加工'
          return Object.freeze({
            value: item.id,
            label: `${line} · ${material} · ${process} · ${quantity} ${unit}`,
            searchText: `${line} ${material} ${process} ${quantity} ${unit}`,
          })
        })
        .sort((left, right) =>
          String(left.label).localeCompare(String(right.label), 'zh-CN')
        )
      return Object.freeze({
        requirementID: requirement.id,
        options: Object.freeze(options),
      })
    })
    if (
      requirementOptions.length === 0 ||
      requirementOptions.some((entry) => entry.options.length === 0)
    ) {
      continue
    }
    const suggestedAssignment =
      distinctMaterialCandidateAssignment(requirementOptions)
    if (!suggestedAssignment) continue
    const contract = String(order.outsourcing_order_no).trim()
    const factory = outsourcingFactoryLabel(order)
    bundles.push(
      Object.freeze({
        value: orderID,
        label: `${contract} · ${factory} · 覆盖 ${requirements.length} 项布料`,
        searchText: `${contract} ${factory}`,
        requirementOptions: Object.freeze(
          requirementOptions.map((entry) =>
            Object.freeze({
              ...entry,
              suggestedItemID: suggestedAssignment.get(entry.requirementID),
            })
          )
        ),
      })
    )
  }
  return Object.freeze(
    bundles.sort((left, right) =>
      String(left.label).localeCompare(String(right.label), 'zh-CN')
    )
  )
}

export function buildProductionWipOutsourcingCandidateOptions(
  sources = [],
  context = {}
) {
  const seen = new Set()
  return (Array.isArray(sources) ? sources : [])
    .filter((source) =>
      productionWipOutsourcingCandidateMatches(source, context)
    )
    .filter((source) => {
      if (seen.has(source.item.id)) return false
      seen.add(source.item.id)
      return true
    })
    .map((source) => {
      const { order, item } = source
      const product =
        [
          snapshotText(
            item.product_no_snapshot,
            context.productionOrderItem?.product_code_snapshot
          ),
          snapshotText(
            item.product_name_snapshot,
            context.productionOrderItem?.product_name_snapshot
          ),
        ]
          .filter(Boolean)
          .join(' / ') || '产品已关联'
      const sku =
        snapshotText(
          item.sku_code_snapshot,
          context.productionOrderItem?.sku_code_snapshot
        ) || '无规格'
      const process =
        snapshotText(
          item.process_name_snapshot,
          context.operation?.process_name_snapshot
        ) || '工序已关联'
      const unit =
        snapshotText(
          item.unit_name_snapshot,
          context.productionOrderItem?.unit_name_snapshot
        ) || '单位已关联'
      const quantity = normalizeProductionWipQuantity(item.outsourcing_quantity)
      const factory = outsourcingFactoryLabel(order)
      const contract = String(order.outsourcing_order_no).trim()
      const line = positiveSafeInteger(item.line_no)
        ? `第 ${item.line_no} 行`
        : '合同明细'
      const matchSummary = `产品 ${product}；规格 ${sku}；工序 ${process}；数量 ${quantity} ${unit}`
      return Object.freeze({
        value: item.id,
        label: `${contract} · ${factory} · ${line} · ${process} · ${quantity} ${unit}`,
        title: `${contract} · ${factory} · ${matchSummary}`,
        searchText: [
          contract,
          factory,
          line,
          product,
          sku,
          process,
          quantity,
          unit,
        ]
          .filter(Boolean)
          .join(' '),
        matchSummary,
      })
    })
    .sort((left, right) =>
      String(left.label).localeCompare(String(right.label), 'zh-CN')
    )
}

export function productionWipOutputLabel(operation = {}) {
  return (
    PRODUCTION_WIP_OUTPUT_LABELS[String(operation.output_code || '').trim()] ||
    '工序产出'
  )
}

export function productionWipStatusMeta(status) {
  return (
    PRODUCTION_WIP_STATUS_META[String(status || '').trim()] ||
    Object.freeze({ label: '状态待核对', color: 'default' })
  )
}

export function productionWipQualityGateLabel(gateCode) {
  return (
    PRODUCTION_WIP_QUALITY_GATE_LABELS[String(gateCode || '').trim()] ||
    '质量关口'
  )
}

export function productionWipQualityInspectionMeta(inspection = {}) {
  const result = QUALITY_RESULT_META[String(inspection.result || '').trim()]
  if (result) return result
  return (
    PRODUCTION_WIP_QUALITY_STATUS_META[
      String(inspection.status || '').trim()
    ] || Object.freeze({ label: '状态待核对', color: 'default' })
  )
}

export function productionWipCompletionEligibility(aggregate, item = {}) {
  if (item.route_code !== PRODUCTION_WIP_ROUTE_CODE) {
    return Object.freeze({
      eligible: true,
      reason: '',
      acceptedPackagingQuantity: null,
    })
  }
  if (!aggregate?.initialized) {
    return Object.freeze({
      eligible: false,
      reason: '该生产明细尚未建立完整工序路线，暂不能登记完工入库',
    })
  }
  const packagingOperation = aggregate.operations.find(
    (operation) =>
      operation.production_order_item_id === item.id &&
      operation.operation_code === 'PACKAGING'
  )
  if (!packagingOperation) {
    return Object.freeze({
      eligible: false,
      reason: '该生产明细的包装工序尚未建立完整，暂不能登记完工入库',
    })
  }
  const packagingAcceptedBatches = aggregate.batches.filter(
    (batch) =>
      batch.production_order_item_id === item.id &&
      batch.production_order_operation_id === packagingOperation.id &&
      batch.status === 'ACCEPTED'
  )
  if (packagingAcceptedBatches.length === 0) {
    return Object.freeze({
      eligible: false,
      reason: '需先完成包装工序并通过工序质量关口，才能登记完工入库',
    })
  }
  const packagingConfirmed = aggregate.packagingConfirmations.some(
    (confirmation) =>
      confirmation.production_order_item_id === item.id &&
      confirmation.status === 'CONFIRMED'
  )
  if (!packagingConfirmed) {
    return Object.freeze({
      eligible: false,
      reason: '需先确认包材版面和包装版本，才能登记完工入库',
    })
  }
  const scale = Math.max(
    ...packagingAcceptedBatches.map(
      (batch) => canonicalQuantity(batch.quantity).split('.')[1]?.length || 0
    )
  )
  const acceptedPackagingQuantity = quantityTextFromInteger(
    packagingAcceptedBatches.reduce(
      (total, batch) => total + quantityInteger(batch.quantity, scale),
      BigInt(0)
    ),
    scale
  )
  return Object.freeze({
    eligible: true,
    reason: '',
    acceptedPackagingQuantity,
  })
}

export function partitionProductionCompletionItems(
  items = [],
  aggregate = null
) {
  const eligibleItems = []
  const blockedItems = []
  for (const item of Array.isArray(items) ? items : []) {
    const eligibility = productionWipCompletionEligibility(aggregate, item)
    if (eligibility.eligible) {
      eligibleItems.push(
        eligibility.acceptedPackagingQuantity
          ? Object.freeze({
              ...item,
              accepted_packaging_quantity:
                eligibility.acceptedPackagingQuantity,
            })
          : item
      )
    } else {
      blockedItems.push(Object.freeze({ item, reason: eligibility.reason }))
    }
  }
  return Object.freeze({
    eligibleItems: Object.freeze(eligibleItems),
    blockedItems: Object.freeze(blockedItems),
  })
}

export function currentProductionWipOperation(aggregate, batch) {
  if (!aggregate || !batch?.production_order_operation_id) return null
  return (
    aggregate.operations.find(
      (operation) => operation.id === batch.production_order_operation_id
    ) || null
  )
}

export function productionWipOperationsForBatch(aggregate, batch) {
  if (!aggregate || !batch) return []
  return aggregate.operations.filter(
    (operation) =>
      operation.production_order_item_id === batch.production_order_item_id
  )
}

export function nextProductionWipOperation(aggregate, batch) {
  const current = currentProductionWipOperation(aggregate, batch)
  if (!current) return null
  const operations = productionWipOperationsForBatch(aggregate, batch)
  return (
    operations.find((operation) => operation.step_no > current.step_no) || null
  )
}

export function productionWipBatchLineage(aggregate, batch) {
  if (!aggregate || !batch) return []
  const byID = new Map(
    aggregate.batches.map((candidate) => [candidate.id, candidate])
  )
  const lineage = []
  const seen = new Set()
  let current = batch
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    lineage.push(current)
    current = current.source_batch_id ? byID.get(current.source_batch_id) : null
  }
  return lineage
}

export function productionWipBatchForOperation(
  aggregate,
  selectedBatch,
  operation
) {
  if (!operation) return null
  return (
    productionWipBatchLineage(aggregate, selectedBatch).find(
      (batch) => batch.production_order_operation_id === operation.id
    ) || null
  )
}

export function productionWipQualityInspectionsForBatch(aggregate, batch) {
  if (!aggregate || !batch) return []
  return aggregate.qualityInspections.filter(
    (inspection) => inspection.production_wip_batch_id === batch.id
  )
}

export function productionWipQualitySummary(aggregate, batch) {
  const operation = currentProductionWipOperation(aggregate, batch)
  if (!operation?.required_quality_gates?.length) return '本工序无需品质关口'
  const inspections = productionWipQualityInspectionsForBatch(aggregate, batch)
  return operation.required_quality_gates
    .map((gateCode) => {
      const matching = inspections.filter(
        (candidate) => candidate.gate_code === gateCode
      )
      const inspection =
        matching.find((candidate) => candidate.status !== 'CANCELLED') ||
        matching.at(-1)
      const state = inspection
        ? productionWipQualityInspectionMeta(inspection).label
        : '待生成检验单'
      return `${productionWipQualityGateLabel(gateCode)}：${state}`
    })
    .join('；')
}
