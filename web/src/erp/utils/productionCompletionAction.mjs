import { InventoryLotStatus, OperationalFactStatus } from '../../common/consts/statuses.generated.mjs'
import {
  numeric20Scale6QuantityUnits,
  numeric20Scale6TextFromUnits,
} from './numeric20Scale6.mjs'
import {
  buildSourceInboundLotFields,
  normalizeSourceInboundLotRequestFields,
} from './sourceInboundLotSelection.mjs'
import {
  PRODUCTION_WIP_ROUTE_CODE,
  productionWipBatchLineageMeta,
  productionWipCompletionEligibility,
} from './productionWipModel.mjs'

const CREATE_REQUEST_KEYS = new Set([
  'customer_key',
  'fact_no',
  'production_order_id',
  'production_order_item_id',
  'production_wip_batch_id',
  'warehouse_id',
  'lot_id',
  'new_lot_no',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'note',
])

function canonicalQuantity(value, allowZero = false) {
  const units = numeric20Scale6QuantityUnits(value)
  return units !== null && (allowZero || units !== '0')
    ? numeric20Scale6TextFromUnits(units)
    : ''
}

function quantityUnits(value, allowZero = false) {
  const units = numeric20Scale6QuantityUnits(value)
  if (units === null || (!allowZero && units === '0')) {
    throw invalidContract('完工数量不完整，请刷新后重试')
  }
  return BigInt(units)
}

function quantityTextFromUnits(value) {
  return numeric20Scale6TextFromUnits(value.toString())
}

function invalidContract(message = '完工入库内容不完整，请重新核对') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function requirePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidContract('完工入库内容有误，请刷新页面后重新填写')
  }
  return value
}

function requireAllowedKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw invalidContract('完工入库内容有误，请刷新页面后重新填写')
    }
  }
}

function requiredText(value, maxLength = 128) {
  if (typeof value !== 'string') throw invalidContract()
  const text = value.trim()
  if (!text || [...text].length > maxLength) throw invalidContract()
  return text
}

function optionalText(value, maxLength = 255) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw invalidContract()
  const text = value.trim()
  if (!text || [...text].length > maxLength) throw invalidContract()
  return text
}

function requiredID(value) {
  const parsed = Number(value || 0)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw invalidContract()
  return parsed
}

function optionalOccurredAt(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim()) throw invalidContract()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw invalidContract()
  return date.toISOString()
}

function normalizedQuantity(value) {
  return canonicalQuantity(value)
}

export function compareProductionCompletionQuantity(left, right) {
  const leftUnits = quantityUnits(left)
  const rightUnits = quantityUnits(right, true)
  return leftUnits === rightUnits ? 0 : leftUnits > rightUnits ? 1 : -1
}

export function buildProductionCompletionChoices(
  items = [],
  facts = [],
  wipAggregate = null,
  { excludeFactID = 0 } = {}
) {
  const postedByLine = new Map()
  const draftByLine = new Map()
  const postedByBatch = new Map()
  const draftByBatch = new Map()
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
    const lineID = Number(item?.id || 0)
    const routed = item?.route_code === PRODUCTION_WIP_ROUTE_CODE
    let batches = Array.isArray(item?.receivable_batches)
      ? item.receivable_batches
      : []
    if (routed && wipAggregate) {
      const eligibility = productionWipCompletionEligibility(
        wipAggregate,
        item,
        {
          orderStatus: wipAggregate?.productionOrder?.status,
        }
      )
      batches = eligibility.eligible ? eligibility.receivableBatches : []
    }
    const batchIDs = new Set()
    const receivableBatches = batches.map((batch) => {
      const batchID = Number(batch?.id || 0)
      if (
        !Number.isSafeInteger(batchID) ||
        batchID <= 0 ||
        Number(batch?.production_order_item_id || 0) !== lineID ||
        !['WAITING_QUALITY', 'ACCEPTED', 'REJECTED'].includes(String(batch?.status || '').toUpperCase()) ||
        batchIDs.has(batchID)
      ) {
        throw invalidContract('完工来源批次无法确认，请刷新后重试')
      }
      batchIDs.add(batchID)
      return batch
    })
    return {
      item,
      lineID,
      routed,
      receivableBatches,
    }
  })
  const itemByLine = new Map(
    normalizedItems.map((entry) => [entry.lineID, entry])
  )
  const excludedFactID = Number(excludeFactID || 0)
  const knownBatchByID = new Map()
  const operationCodeByID = new Map((wipAggregate?.operations || []).map((operation) => [operation.id, operation.operation_code]))
  for (const batch of Array.isArray(wipAggregate?.batches)
    ? wipAggregate.batches
    : normalizedItems.flatMap((entry) => entry.receivableBatches)) {
    const batchID = Number(batch?.id || 0)
    if (Number.isSafeInteger(batchID) && batchID > 0) {
      if (knownBatchByID.has(batchID)) {
        throw invalidContract('完工来源批次无法确认，请刷新后重试')
      }
      knownBatchByID.set(batchID, batch)
    }
  }
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (excludedFactID > 0 && Number(fact?.id || 0) === excludedFactID) {
      continue
    }
    if (
      fact?.fact_type !== 'FINISHED_GOODS_RECEIPT' ||
      fact?.source_type !== 'PRODUCTION_ORDER' ||
      !Number(fact?.source_line_id)
    ) {
      continue
    }
    const target = fact.status === OperationalFactStatus.POSTED ? postedByLine : draftByLine
    if (![OperationalFactStatus.POSTED, OperationalFactStatus.DRAFT].includes(fact.status)) continue
    const lineID = Number(fact.source_line_id)
    const itemEntry = itemByLine.get(lineID)
    if (!itemEntry) continue
    const quantity = quantityUnits(fact.quantity)
    if (itemEntry.routed) {
      let batchID = Number(fact?.production_wip_batch_id || 0)
      const batch = knownBatchByID.get(batchID)
      if (
        !Number.isSafeInteger(batchID) ||
        batchID <= 0 ||
        !batch ||
        Number(batch?.production_order_item_id || 0) !== lineID
      ) {
        throw invalidContract(
          '已有完工记录缺少可核对的来源批次，请联系管理员处理'
        )
      }
      // Old posted receipts remain attached to packaging as audit evidence,
      // but still reserve the handwork quantity that produced those goods.
      const visited = new Set()
      let intake = batch
      while (fact.status === OperationalFactStatus.POSTED && intake && !intake.finished_goods_receipt_id &&
        operationCodeByID.get(intake.production_order_operation_id) === 'PACKAGING') {
        if (visited.has(intake.id)) throw invalidContract('来源批次链路无法确认，请刷新后重试')
        visited.add(intake.id)
        intake = knownBatchByID.get(intake.source_batch_id)
      }
      if (visited.size) {
        if (!intake || operationCodeByID.get(intake.production_order_operation_id) !== 'HANDWORK') throw invalidContract('历史入库的手工来源无法确认，请核对来源记录')
        batchID = intake.id
      }
      const target = fact.status === OperationalFactStatus.POSTED ? postedByBatch : draftByBatch
      target.set(
        batchID,
        (target.get(batchID) || 0n) + quantity
      )
      continue
    }
    if (Number(fact?.production_wip_batch_id || 0) > 0) {
      throw invalidContract('已有完工记录的来源批次与生产明细不一致')
    }
    target.set(lineID, (target.get(lineID) || 0n) + quantity)
  }

  return normalizedItems.map((entry, index) => {
    const { item, lineID, routed, receivableBatches } = entry
    const planned = quantityUnits(item?.planned_quantity)
    const batchChoices = routed
      ? receivableBatches.map((batch) => {
          const batchID = Number(batch.id)
          const quantity = quantityUnits(batch.quantity)
          const posted = postedByBatch.get(batchID) || 0n
          const draft = draftByBatch.get(batchID) || 0n
          const consumed = posted + draft
          const remaining =
            quantity > consumed ? quantity - consumed : 0n
          const lineage = productionWipBatchLineageMeta(batch)
          const batchNo = String(batch?.batch_no || '').trim()
          return {
            value: batchID,
            label: [
              batchNo || '手工成品批次',
              lineage?.label,
              `剩余 ${quantityTextFromUnits(remaining)}`,
            ]
              .filter(Boolean)
              .join(' · '),
            batch,
            quantity: quantityTextFromUnits(quantity),
            posted: quantityTextFromUnits(posted),
            draft: quantityTextFromUnits(draft),
            remaining: quantityTextFromUnits(remaining),
            disabled: remaining <= 0n,
          }
        })
      : []
    const receivableQuantity = routed
      ? batchChoices.reduce(
          (total, choice) => total + quantityUnits(choice.quantity),
          0n
        )
      : item?.receivable_quantity
        ? quantityUnits(item.receivable_quantity)
        : planned
    const posted = routed
      ? batchChoices.reduce(
          (total, choice) => total + quantityUnits(choice.posted, true),
          0n
        )
      : postedByLine.get(lineID) || 0n
    const draft = routed
      ? batchChoices.reduce(
          (total, choice) => total + quantityUnits(choice.draft, true),
          0n
        )
      : draftByLine.get(lineID) || 0n
    const remaining = routed
      ? batchChoices.reduce(
          (total, choice) => total + quantityUnits(choice.remaining, true),
          0n
        )
      : receivableQuantity > posted + draft
        ? receivableQuantity - posted - draft
        : 0n
    const productText =
      [item?.product_code_snapshot, item?.product_name_snapshot]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ') || `生产明细 ${index + 1}`
    const skuText = String(item?.sku_code_snapshot || '').trim()
    const unitText = String(item?.unit_name_snapshot || '').trim()
    return {
      value: lineID,
      label: `${productText}${skuText ? ` ${skuText}` : ''} · 剩余 ${quantityTextFromUnits(remaining)}${unitText ? ` ${unitText}` : ''}`,
      item,
      planned: quantityTextFromUnits(planned),
      receivableQuantity: quantityTextFromUnits(receivableQuantity),
      posted: quantityTextFromUnits(posted),
      draft: quantityTextFromUnits(draft),
      remaining: quantityTextFromUnits(remaining),
      requiresBatch: routed,
      batchChoices,
      disabled:
        lineID <= 0 ||
        remaining <= 0n ||
        (routed && !batchChoices.some((choice) => !choice.disabled)),
    }
  })
}

export function buildProductionCompletionLotOptions(item = {}, lots = []) {
  const productID = Number(item?.product_id || 0)
  const skuID = Number(item?.product_sku_id || 0)
  return (Array.isArray(lots) ? lots : [])
    .filter((lot) => {
      if (
        String(lot?.subject_type || '').toUpperCase() !== 'PRODUCT' ||
        Number(lot?.subject_id || 0) !== productID ||
        String(lot?.status || '').toUpperCase() !== InventoryLotStatus.ACTIVE
      ) {
        return false
      }
      const lotSkuID = Number(lot?.product_sku_id || 0)
      return skuID > 0 ? lotSkuID === skuID : lotSkuID === 0
    })
    .map((lot) => ({
      value: Number(lot.id),
      label:
        [lot.lot_no, lot.production_lot_no]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .join(' ') || '批次已关联',
    }))
    .filter((option) => Number.isSafeInteger(option.value) && option.value > 0)
}

export function buildProductionCompletionPayload(
  values = {},
  order = {},
  item = null
) {
  const orderStatus = String(order?.status || '').toUpperCase()
  if (!['RELEASED', 'CLOSED'].includes(orderStatus)) {
    throw new Error('当前生产订单状态不能登记生产完工')
  }
  const orderID = Number(order?.id || 0)
  const itemID = Number(values.production_order_item_id || 0)
  const warehouseID = Number(values.warehouse_id || 0)
  const quantity = normalizedQuantity(values.quantity)
  if (orderID <= 0 || itemID <= 0 || warehouseID <= 0 || !quantity) {
    throw new Error('请完整填写完工入库信息')
  }
  const routed = item?.route_code === PRODUCTION_WIP_ROUTE_CODE
  const productionWIPBatchID = Number(values.production_wip_batch_id || 0)
  if (
    routed &&
    (!Number.isSafeInteger(productionWIPBatchID) || productionWIPBatchID <= 0)
  ) {
    throw new Error('请选择本次完工对应的手工成品批次')
  }
  const selectedBatch = routed
    ? (Array.isArray(item?.receivable_batches)
        ? item.receivable_batches
        : []
      ).find((batch) => Number(batch?.id || 0) === productionWIPBatchID)
    : null
  if (
    routed &&
    Array.isArray(item?.receivable_batches) &&
    item.receivable_batches.length > 0 &&
    !selectedBatch
  ) {
    throw new Error('所选完工来源批次已变化，请重新选择')
  }
  if (
    orderStatus === 'CLOSED' &&
    (!routed ||
      !Number.isSafeInteger(Number(selectedBatch?.origin_rework_fact_id)) ||
      Number(selectedBatch.origin_rework_fact_id) <= 0)
  ) {
    throw new Error('已关闭订单只能登记成品返工补制批次的完工入库')
  }
  const occurredAtText = String(values.occurred_at || '').trim()
  const occurredAt = occurredAtText
    ? new Date(occurredAtText).toISOString()
    : undefined
  const lotFields = buildSourceInboundLotFields(values, {
    existingRequiredMessage: '请选择已有入库批次',
    newRequiredMessage: '请填写本次完工的新批次号',
    invalidMessage: '请选择已有入库批次或填写新批次号',
  })
  return {
    production_order_id: orderID,
    production_order_item_id: itemID,
    ...(routed ? { production_wip_batch_id: productionWIPBatchID } : {}),
    warehouse_id: warehouseID,
    ...lotFields,
    quantity,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(String(values.note || '').trim()
      ? { note: String(values.note).trim() }
      : {}),
  }
}

export function normalizeProductionCompletionCreateRequest(params = {}) {
  const source = requirePlainObject(params)
  requireAllowedKeys(source, CREATE_REQUEST_KEYS)
  const customerKey = optionalText(source.customer_key, 64)
  const note = optionalText(source.note)
  const occurredAt = optionalOccurredAt(source.occurred_at)
  const quantity = normalizedQuantity(source.quantity)
  if (!quantity) throw invalidContract()
  let lotFields
  try {
    lotFields = normalizeSourceInboundLotRequestFields(source)
  } catch {
    throw invalidContract('完工入库批次有误，请重新选择或填写')
  }
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    fact_no: requiredText(source.fact_no),
    production_order_id: requiredID(source.production_order_id),
    production_order_item_id: requiredID(source.production_order_item_id),
    ...(source.production_wip_batch_id == null
      ? {}
      : {
          production_wip_batch_id: requiredID(source.production_wip_batch_id),
        }),
    warehouse_id: requiredID(source.warehouse_id),
    ...lotFields,
    quantity,
    idempotency_key: requiredText(source.idempotency_key),
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(note ? { note } : {}),
  }
}

export function validateProductionCompletionResult(
  result,
  request = {},
  item = null
) {
  const expectedLotID = Number(request?.lot_id || 0)
  const expectedWIPBatchID = Number(request?.production_wip_batch_id || 0)
  const actualWIPBatchID = Number(result?.production_wip_batch_id || 0)
  const expectedProductID = Number(item?.product_id || 0)
  const expectedUnitID = Number(item?.unit_id || 0)
  if (
    !result ||
    !Number.isSafeInteger(Number(result.id)) ||
    Number(result.id) <= 0 ||
    String(result.status || '').toUpperCase() !== OperationalFactStatus.DRAFT ||
    String(result.fact_type || '').toUpperCase() !== 'FINISHED_GOODS_RECEIPT' ||
    String(result.subject_type || '').toUpperCase() !== 'PRODUCT' ||
    !Number.isSafeInteger(Number(result.lot_id)) ||
    Number(result.lot_id) <= 0 ||
    String(result.source_type || '').toUpperCase() !== 'PRODUCTION_ORDER' ||
    Number(result.source_id || 0) !==
      Number(request.production_order_id || 0) ||
    Number(result.source_line_id || 0) !==
      Number(request.production_order_item_id || 0) ||
    (expectedWIPBatchID > 0
      ? actualWIPBatchID !== expectedWIPBatchID
      : actualWIPBatchID !== 0) ||
    (expectedLotID > 0 && Number(result.lot_id) !== expectedLotID) ||
    (expectedProductID > 0 &&
      Number(result.subject_id) !== expectedProductID) ||
    (expectedUnitID > 0 && Number(result.unit_id) !== expectedUnitID)
  ) {
    throw invalidContract('完工记录返回结果无法确认')
  }
  return result
}

export function findProductionCompletionResult(
  facts = [],
  request = {},
  item = null
) {
  const idempotencyKey = String(request?.idempotency_key || '').trim()
  const factNo = String(request?.fact_no || '').trim()
  const matched = (Array.isArray(facts) ? facts : []).find(
    (fact) =>
      (idempotencyKey && fact?.idempotency_key === idempotencyKey) ||
      (factNo && fact?.fact_no === factNo)
  )
  return matched
    ? validateProductionCompletionResult(matched, request, item)
    : null
}
