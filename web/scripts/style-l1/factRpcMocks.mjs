import { setTimeout as delay } from 'node:timers/promises'
import { requireWorkflowTaskExplainParams } from '../../src/erp/utils/workflowTaskActionAccess.mjs'
import { requireWorkflowTaskCreateParams } from '../../src/erp/utils/workflowTaskCreateContract.mjs'
import {
  workflowMockActionDecision,
  workflowMockCanAccessTaskForCapability,
  workflowMockCanCreateTask,
  workflowMockCanViewTask,
  workflowMockPermissionAllowed,
} from '../../src/mocks/workflowTaskMockAuthorization.mjs'
import {
  requireWorkflowTaskMutationParams,
  workflowTaskMutationSignature,
} from '../../src/erp/utils/workflowTaskMutation.mjs'
import { buildWorkflowTaskBoardMock } from '../../src/mocks/workflowTaskBoardMock.mjs'
import { purchaseReceiptMutationSignature } from '../../src/erp/utils/purchaseReceiptMutation.mjs'
import {
  stylePaginatedRpcData,
  styleRpcResult,
  unsupportedRpcMethod,
} from './rpcMockResult.mjs'

const SALES_ORDER_RESERVATION_CREATE_KEYS = new Set([
  'customer_key',
  'reservation_no',
  'sales_order_id',
  'sales_order_item_id',
  'warehouse_id',
  'lot_id',
  'quantity',
  'reserved_at',
  'note',
  'idempotency_key',
])

const OUTSOURCING_MATERIAL_ISSUE_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'outsourcing_order_id',
  'outsourcing_order_item_id',
  'warehouse_id',
  'lot_id',
  'quantity',
  'occurred_at',
  'note',
  'idempotency_key',
])
const OUTSOURCING_RETURN_RECEIPT_CREATE_KEYS = new Set([
  ...OUTSOURCING_MATERIAL_ISSUE_CREATE_KEYS,
  'new_lot_no',
])

const OUTSOURCING_RETURN_QUALITY_LIST_KEYS = new Set([
  'customer_key',
  'fact_id',
  'status',
  'result',
  'keyword',
  'inventory_lot_id',
  'warehouse_id',
  'product_id',
  'date_from',
  'date_to',
  'limit',
  'offset',
])

const PRODUCTION_COMPLETION_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'production_order_id',
  'production_order_item_id',
  'warehouse_id',
  'lot_id',
  'new_lot_no',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'note',
])

const PRODUCTION_REWORK_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'source_completion_fact_id',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'reason',
])

const SHIPMENT_RECEIVABLE_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'shipment_id',
  'idempotency_key',
  'occurred_at',
  'note',
])
const SHIPMENT_INVOICE_CREATE_KEYS = new Set([
  ...SHIPMENT_RECEIVABLE_CREATE_KEYS,
  'invoice_category',
])
const SHIPMENT_INVOICE_CATEGORIES = new Set([
  'NONE',
  'EXPORT_GENERAL',
  'VAT_GENERAL_1',
  'VAT_SPECIAL_3',
  'VAT_SPECIAL_13',
])

const PURCHASE_RECEIPT_PAYABLE_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'purchase_receipt_id',
  'idempotency_key',
  'occurred_at',
  'note',
])

const OUTSOURCING_RETURN_PAYABLE_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'outsourcing_fact_id',
  'idempotency_key',
  'occurred_at',
  'note',
])

const SINGLE_FACT_RECONCILIATION_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'finance_fact_id',
  'idempotency_key',
  'occurred_at',
  'note',
])

const SHIPMENT_SOURCE_CANDIDATE_LIST_KEYS = new Set([
  'keyword',
  'sales_order_id',
  'limit',
  'offset',
])

export function mockShipmentSourceCandidates(params = {}, candidates = []) {
  if (
    Object.keys(params || {}).some(
      (key) => !SHIPMENT_SOURCE_CANDIDATE_LIST_KEYS.has(key)
    )
  ) {
    return unsupportedRpcMethod(
      'operational_fact',
      'list_shipment_source_candidates invalid params'
    )
  }
  const limit = Number(params.limit ?? 50)
  const offset = Number(params.offset ?? 0)
  const salesOrderID =
    params.sales_order_id === undefined ? 0 : Number(params.sales_order_id || 0)
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    limit > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    (params.sales_order_id !== undefined &&
      (!Number.isSafeInteger(salesOrderID) || salesOrderID <= 0))
  ) {
    return unsupportedRpcMethod(
      'operational_fact',
      'list_shipment_source_candidates invalid params'
    )
  }
  const keyword = String(params.keyword || '')
    .trim()
    .toLowerCase()
  const filtered = candidates.filter((candidate) => {
    if (
      salesOrderID &&
      Number(candidate.sales_order_id || 0) !== salesOrderID
    ) {
      return false
    }
    if (!keyword) return true
    return [
      candidate.order_no,
      candidate.customer_name,
      candidate.product_code,
      candidate.product_name,
      candidate.product_code_snapshot,
      candidate.product_name_snapshot,
      candidate.sku_code,
      candidate.sku_name,
    ].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(keyword)
    )
  })
  return {
    shipment_source_candidates: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  }
}

function validSourceFinanceCreate(params, allowedKeys, sourceIDKey) {
  const idempotencyKey = String(params?.idempotency_key || '').trim()
  return (
    Object.keys(params || {}).every((key) => allowedKeys.has(key)) &&
    String(params?.fact_no || '').trim() !== '' &&
    String(params?.fact_no || '').trim().length <= 64 &&
    Number.isSafeInteger(Number(params?.[sourceIDKey])) &&
    Number(params?.[sourceIDKey]) > 0 &&
    idempotencyKey !== '' &&
    [...idempotencyKey].length <= 128
  )
}

function validInboundLotIntent(params, { allowNew }) {
  const lotID = Number(params?.lot_id || 0)
  const newLotNo = String(params?.new_lot_no || '').trim()
  const hasExisting = Number.isSafeInteger(lotID) && lotID > 0
  const hasNew = newLotNo !== ''
  return (
    hasExisting !== hasNew &&
    (!hasNew || (allowNew && [...newLotNo].length <= 64))
  )
}

function sourceInboundRequestIntent(method, params) {
  return JSON.stringify([
    method,
    Object.entries(params || {}).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  ])
}

const PRODUCTION_MATERIAL_REQUIREMENTS_LIST_KEYS = new Set([
  'customer_key',
  'production_order_id',
])

const PRODUCTION_MATERIAL_ISSUE_CREATE_KEYS = new Set([
  'customer_key',
  'fact_no',
  'production_order_id',
  'production_order_item_id',
  'production_order_material_requirement_id',
  'warehouse_id',
  'lot_id',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'note',
])

function purchaseReceiptMutationResult(attempts, scope, params, create) {
  const idempotencyKey = String(params?.idempotency_key || '').trim()
  if (!idempotencyKey || [...idempotencyKey].length > 128) {
    return {
      error: { code: 40010, message: '采购入库请求缺少有效请求标识', data: {} },
    }
  }
  const attemptKey = `${scope}:${idempotencyKey}`
  const signature = purchaseReceiptMutationSignature(params)
  const current = attempts.get(attemptKey)
  if (current?.signature === signature) {
    return { data: current.data }
  }
  if (current) {
    return {
      error: { code: 40920, message: '采购入库请求内容已变化', data: {} },
    }
  }
  const data = create()
  attempts.set(attemptKey, { signature, data })
  return { data }
}

export async function installFactRpcMocks(page, context) {
  const { adminProfile, effectiveSession, nowUnix, resolveDelayFromReferer } =
    context
  const createdProductionCompletions = []
  const createdProductionMaterialIssues = []
  const createdProductionReworks = []
  const createdOutsourcingFacts = []
  const outsourcingFactStatusOverrides = new Map()
  const ambiguousInboundResponses = new Set()
  const productionCompletionAttempts = new Map()
  const productionReworkAttempts = new Map()
  const outsourcingSourceFactAttempts = new Map()
  let shipmentStatus = 'DRAFT'

  await page.route('**/rpc/operational_fact', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const shipmentItem = {
      id: 1,
      shipment_id: 1,
      sales_order_item_id: 1,
      product_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '10',
      unit_net_weight_g_snapshot: null,
      note: '样式出货明细',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const shipment = {
      id: 1,
      shipment_no: 'SHIP-STYLE-L1',
      status: shipmentStatus,
      sales_order_id: 1,
      customer_id: 1,
      customer_snapshot: '暗色客户',
      planned_ship_at: nowUnix() + 86_400,
      shipped_at: null,
      total_net_weight_g: null,
      note: '样式回归出货单',
      items: [shipmentItem],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const shipmentSourceCandidates = Array.from({ length: 21 }, (_, index) => {
      const lineNo = index + 1
      return {
        sales_order_id: 1,
        order_no: 'SO-STYLE-L1',
        order_status: 'active',
        order_version: 1,
        customer_id: 1,
        customer_snapshot: {
          id: 1,
          code: 'CUS-STYLE-L1',
          name: '暗色客户',
        },
        customer_name: '暗色客户',
        sales_order_item_id: lineNo,
        line_no: lineNo,
        line_status: 'open',
        product_id: 1,
        product_sku_id: 1,
        product_code: `PROD-STYLE-L1-${String(lineNo).padStart(2, '0')}`,
        product_name: `样式产品 ${lineNo}`,
        product_code_snapshot: `PROD-STYLE-L1-${String(lineNo).padStart(2, '0')}`,
        product_name_snapshot: `样式产品 ${lineNo}`,
        color_snapshot: '深棕',
        sku_code: 'SKU-STYLE-L1',
        sku_name: '深棕',
        unit_id: 1,
        unit_code: 'PCS',
        unit_name: '只',
        ordered_quantity: '10',
        shipped_quantity: '0',
        remaining_quantity: '10',
        selectable: true,
        disabled_reason: '',
      }
    })
    const productionFact = {
      id: 1,
      fact_no: 'PROD-FACT-L1',
      fact_type: 'FINISHED_GOODS_RECEIPT',
      status: 'DRAFT',
      subject_type: 'PRODUCT',
      subject_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '6',
      source_type: 'PRODUCTION_ORDER',
      source_id: 71,
      source_line_id: 7100,
      idempotency_key: 'PROD-FACT-L1',
      occurred_at: nowUnix(),
      note: '样式生产事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const postedProductionCompletion = {
      ...productionFact,
      id: 81,
      fact_no: 'PROD-FG-POSTED-L1',
      status: 'POSTED',
      subject_id: 301,
      product_sku_id: 401,
      warehouse_id: 1,
      unit_id: 501,
      lot_id: 480,
      quantity: '6',
      source_type: 'PRODUCTION_ORDER',
      source_id: 71,
      source_line_id: 7100,
      idempotency_key: 'PROD-FG-POSTED-L1',
      note: '已过账成品入库',
    }
    const productionMaterialRequirement = {
      id: 7201,
      production_order_id: 71,
      production_order_item_id: 7101,
      bom_header_id: 701,
      bom_item_id: 7301,
      material_id: 1,
      unit_id: 1,
      unit_quantity_snapshot: '0.500000',
      loss_rate_snapshot: '0.020000',
      planned_quantity: '10.200000',
      issued_quantity: '2.200000',
      remaining_quantity: '8.000000',
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式短毛绒布',
      unit_code_snapshot: 'M',
      unit_name_snapshot: '米',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const outsourcingFact = {
      id: 1,
      fact_no: 'OUTSOURCE-FACT-L1',
      fact_type: 'RETURN_RECEIPT',
      status: 'DRAFT',
      subject_type: 'MATERIAL',
      subject_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '8',
      supplier_id: 1,
      supplier_name: '样式供应商',
      source_type: 'OUTSOURCING_ORDER',
      source_id: 1,
      source_line_id: null,
      idempotency_key: 'OUTSOURCE-FACT-L1',
      occurred_at: nowUnix(),
      note: '样式委外事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const postedOutsourcingReturn = {
      ...outsourcingFact,
      id: 3,
      fact_no: 'OUT-RR-POSTED-L1',
      fact_type: 'RETURN_RECEIPT',
      status: 'POSTED',
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 201,
      sku_code_snapshot: 'SKU-OUTSOURCE-SNAPSHOT-L1',
      lot_id: 402,
      quantity: '2',
      source_type: 'OUTSOURCING_ORDER',
      source_id: 1,
      source_line_id: 12,
      idempotency_key: 'OUT-RR-POSTED-L1',
      note: '已过账委外回货',
    }
    const paginatedOutsourcingReturns = Array.from(
      { length: 200 },
      (_, index) => ({
        ...postedOutsourcingReturn,
        id: 10_200 - index,
        fact_no: `OUT-RR-PAGE-L1-${String(index + 1).padStart(3, '0')}`,
        status: 'DRAFT',
        source_line_id: 20_000 + index,
        sku_code_snapshot: `SKU-OUTSOURCE-PAGE-L1-${String(index + 1).padStart(
          3,
          '0'
        )}`,
        idempotency_key: `OUT-RR-PAGE-L1-${String(index + 1).padStart(3, '0')}`,
        note: '委外回货分页样例',
      })
    )
    const stockReservation = {
      id: 1,
      reservation_no: 'RSV-STYLE-L1',
      status: 'ACTIVE',
      sales_order_id: 1,
      sales_order_item_id: 1,
      product_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '4',
      idempotency_key: 'RSV-STYLE-L1',
      reserved_at: nowUnix(),
      note: '样式库存预留',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const financeFactType = String(params.fact_type || 'RECEIVABLE')
      .trim()
      .toUpperCase()
    const financeFactNoByType = {
      RECEIVABLE: 'AR-STYLE-L1',
      PAYABLE: 'AP-STYLE-L1',
      INVOICE: 'INV-STYLE-L1',
      RECONCILIATION: 'REC-STYLE-L1',
      PAYMENT: 'PAY-STYLE-L1',
    }
    const financeFact = {
      id: 1,
      fact_no: financeFactNoByType[financeFactType] || 'FIN-STYLE-L1',
      fact_type: financeFactType,
      status: 'POSTED',
      counterparty_type:
        financeFactType === 'PAYABLE'
          ? 'SUPPLIER'
          : financeFactType === 'RECONCILIATION'
            ? 'OTHER'
            : 'CUSTOMER',
      counterparty_id: 1,
      amount: '1200',
      fee_amount: '0',
      currency: 'CNY',
      source_type:
        financeFactType === 'PAYABLE' ? 'PURCHASE_RECEIPT' : 'SHIPMENT',
      source_id: 1,
      source_line_id: null,
      idempotency_key: financeFactNoByType[financeFactType] || 'FIN-STYLE-L1',
      occurred_at: nowUnix(),
      note: '样式财务事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_production_exceptions':
        data = stylePaginatedRpcData([], 'production_exceptions', params)
        break
      case 'list_outsourcing_return_dispositions':
        data = stylePaginatedRpcData(
          [],
          'outsourcing_return_dispositions',
          params
        )
        break
      case 'list_production_facts':
        {
          const facts = [
            productionFact,
            postedProductionCompletion,
            ...createdProductionCompletions,
            ...createdProductionMaterialIssues,
            ...createdProductionReworks,
          ].filter(
            (fact) =>
              (!params.source_type ||
                fact.source_type === params.source_type) &&
              (!params.source_id ||
                Number(fact.source_id || 0) === Number(params.source_id)) &&
              (!params.source_line_id ||
                Number(fact.source_line_id || 0) ===
                  Number(params.source_line_id))
          )
          data = stylePaginatedRpcData(facts, 'production_facts', params)
        }
        break
      case 'create_production_completion_from_order':
        {
          const requiredValues = [
            params.fact_no,
            params.production_order_id,
            params.production_order_item_id,
            params.warehouse_id,
            params.quantity,
            params.idempotency_key,
          ]
          if (
            !Object.keys(params).every((key) =>
              PRODUCTION_COMPLETION_CREATE_KEYS.has(key)
            ) ||
            requiredValues.some((value) => !String(value ?? '').trim()) ||
            Number(params.production_order_id) !== 71 ||
            !Number.isSafeInteger(Number(params.production_order_item_id)) ||
            Number(params.production_order_item_id) <= 0 ||
            !Number.isFinite(Number(params.quantity)) ||
            Number(params.quantity) <= 0 ||
            !validInboundLotIntent(params, { allowNew: true })
          ) {
            data = unsupportedRpcMethod(
              'operational_fact',
              'create_production_completion_from_order invalid params'
            )
            break
          }
          const intent = sourceInboundRequestIntent(method, params)
          const attempt = productionCompletionAttempts.get(
            params.idempotency_key
          )
          if (attempt && attempt.intent !== intent) {
            data = unsupportedRpcMethod(
              'operational_fact',
              'create_production_completion_from_order idempotency intent conflict'
            )
            break
          }
          const existing = attempt?.fact
          const created = existing || {
            id: 180 + createdProductionCompletions.length,
            fact_no: params.fact_no,
            fact_type: 'FINISHED_GOODS_RECEIPT',
            status: 'DRAFT',
            subject_type: 'PRODUCT',
            subject_id: 301,
            product_sku_id: 401,
            warehouse_id: Number(params.warehouse_id),
            unit_id: 501,
            lot_id: Number(params.lot_id || 480),
            quantity: params.quantity,
            source_type: 'PRODUCTION_ORDER',
            source_id: Number(params.production_order_id),
            source_line_id: Number(params.production_order_item_id),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at
              ? Math.floor(new Date(params.occurred_at).getTime() / 1000)
              : nowUnix(),
            note: params.note || '',
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          if (!existing) {
            createdProductionCompletions.push(created)
            productionCompletionAttempts.set(params.idempotency_key, {
              fact: created,
              intent,
            })
          }
          const ambiguous =
            params.new_lot_no === 'PROD-NEW-LOT-REREAD-L1' &&
            !ambiguousInboundResponses.has(params.idempotency_key)
          if (ambiguous) {
            ambiguousInboundResponses.add(params.idempotency_key)
          }
          data = { production_fact: ambiguous ? null : created }
        }
        break
      case 'create_production_rework_from_completion':
        {
          const idempotencyKey = String(params.idempotency_key || '').trim()
          const reason = String(params.reason || '').trim()
          const quantity = Number(params.quantity || 0)
          if (
            !Object.keys(params).every((key) =>
              PRODUCTION_REWORK_CREATE_KEYS.has(key)
            ) ||
            !String(params.fact_no || '').trim() ||
            [...String(params.fact_no || '').trim()].length > 64 ||
            Number(params.source_completion_fact_id) !==
              postedProductionCompletion.id ||
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            quantity > Number(postedProductionCompletion.quantity) ||
            !idempotencyKey ||
            [...idempotencyKey].length > 128 ||
            !reason ||
            [...reason].length > 255
          ) {
            data = unsupportedRpcMethod(
              'operational_fact',
              'create_production_rework_from_completion invalid params'
            )
            break
          }
          const intent = sourceInboundRequestIntent(method, params)
          const attempt = productionReworkAttempts.get(idempotencyKey)
          if (attempt && attempt.intent !== intent) {
            data = unsupportedRpcMethod(
              'operational_fact',
              'create_production_rework_from_completion idempotency intent conflict'
            )
            break
          }
          const existing = attempt?.fact
          const created = existing || {
            ...postedProductionCompletion,
            id: 280 + createdProductionReworks.length,
            fact_no: params.fact_no,
            fact_type: 'REWORK',
            status: 'DRAFT',
            quantity: params.quantity,
            source_type: 'PRODUCTION_FACT',
            source_id: postedProductionCompletion.id,
            source_line_id: postedProductionCompletion.source_line_id,
            idempotency_key: idempotencyKey,
            occurred_at: params.occurred_at
              ? Math.floor(new Date(params.occurred_at).getTime() / 1000)
              : nowUnix(),
            note: reason,
          }
          if (!existing) {
            createdProductionReworks.push(created)
            productionReworkAttempts.set(idempotencyKey, {
              fact: created,
              intent,
            })
          }
          const ambiguous =
            reason === 'STYLE-L1-REWORK-REREAD' &&
            !ambiguousInboundResponses.has(idempotencyKey)
          if (ambiguous) ambiguousInboundResponses.add(idempotencyKey)
          data = { production_fact: ambiguous ? null : created }
        }
        break
      case 'list_production_order_material_requirements':
        if (
          !Object.keys(params).every((key) =>
            PRODUCTION_MATERIAL_REQUIREMENTS_LIST_KEYS.has(key)
          ) ||
          !Number.isSafeInteger(params.production_order_id) ||
          params.production_order_id <= 0
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'list_production_order_material_requirements invalid params'
          )
          break
        }
        data = {
          material_requirements:
            params.production_order_id === 71
              ? [productionMaterialRequirement]
              : [],
        }
        break
      case 'create_production_material_issue_from_order':
        {
          const requiredValues = [
            params.fact_no,
            params.production_order_id,
            params.production_order_item_id,
            params.production_order_material_requirement_id,
            params.warehouse_id,
            params.lot_id,
            params.quantity,
            params.idempotency_key,
          ]
          if (
            !Object.keys(params).every((key) =>
              PRODUCTION_MATERIAL_ISSUE_CREATE_KEYS.has(key)
            ) ||
            requiredValues.some((value) => !String(value ?? '').trim()) ||
            Number(params.production_order_id) !== 71 ||
            Number(params.production_order_item_id) !== 7101 ||
            Number(params.production_order_material_requirement_id) !== 7201
          ) {
            data = unsupportedRpcMethod(
              'operational_fact',
              'create_production_material_issue_from_order invalid params'
            )
            break
          }
          const existing = createdProductionMaterialIssues.find(
            (fact) => fact.idempotency_key === params.idempotency_key
          )
          const created = existing || {
            id: 200 + createdProductionMaterialIssues.length,
            fact_no: params.fact_no,
            fact_type: 'MATERIAL_ISSUE',
            status: 'DRAFT',
            subject_type: 'MATERIAL',
            subject_id: productionMaterialRequirement.material_id,
            product_sku_id: null,
            warehouse_id: Number(params.warehouse_id),
            unit_id: productionMaterialRequirement.unit_id,
            lot_id: Number(params.lot_id),
            quantity: params.quantity,
            source_type: 'PRODUCTION_ORDER',
            source_id: Number(params.production_order_id),
            source_line_id: Number(
              params.production_order_material_requirement_id
            ),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          if (!existing) createdProductionMaterialIssues.push(created)
          data = { production_fact: created }
        }
        break
      case 'post_production_fact':
        data = {
          production_fact: { ...productionFact, status: 'POSTED' },
        }
        break
      case 'cancel_production_fact':
        data = {
          production_fact: { ...productionFact, status: 'CANCELLED' },
        }
        break
      case 'list_outsourcing_facts':
        {
          const includePaginatedReturns =
            params.source_type === 'OUTSOURCING_ORDER' &&
            Number(params.source_id || 0) === 1
          const facts = [
            ...(includePaginatedReturns ? paginatedOutsourcingReturns : []),
            outsourcingFact,
            postedOutsourcingReturn,
            ...createdOutsourcingFacts,
          ]
            .map((fact) => ({
              ...fact,
              status:
                outsourcingFactStatusOverrides.get(Number(fact.id)) ||
                fact.status,
            }))
            .filter(
              (fact) =>
                (!params.source_type ||
                  fact.source_type === params.source_type) &&
                (!params.source_id ||
                  Number(fact.source_id || 0) === Number(params.source_id)) &&
                (!params.source_line_id ||
                  Number(fact.source_line_id || 0) ===
                    Number(params.source_line_id))
            )
          const limit = Number(params.limit || 50)
          const offset = Number(params.offset || 0)
          data = {
            outsourcing_facts: facts.slice(offset, offset + limit),
            total: facts.length,
            limit,
            offset,
          }
        }
        break
      case 'create_outsourcing_material_issue_from_order':
      case 'create_outsourcing_return_receipt_from_order':
        {
          const isMaterialIssue =
            method === 'create_outsourcing_material_issue_from_order'
          const requiredValues = [
            params.fact_no,
            params.quantity,
            params.idempotency_key,
          ]
          const requiredPositiveIDs = [
            params.outsourcing_order_id,
            params.outsourcing_order_item_id,
            params.warehouse_id,
          ]
          const idempotencyKey = String(params.idempotency_key || '').trim()
          const allowedKeys = isMaterialIssue
            ? OUTSOURCING_MATERIAL_ISSUE_CREATE_KEYS
            : OUTSOURCING_RETURN_RECEIPT_CREATE_KEYS
          if (
            !Object.keys(params).every((key) => allowedKeys.has(key)) ||
            requiredValues.some((value) => !String(value ?? '').trim()) ||
            requiredPositiveIDs.some(
              (value) =>
                !Number.isSafeInteger(Number(value)) || Number(value) <= 0
            ) ||
            !Number.isFinite(Number(params.quantity)) ||
            Number(params.quantity) <= 0 ||
            [...idempotencyKey].length > 128 ||
            !validInboundLotIntent(params, { allowNew: !isMaterialIssue })
          ) {
            data = unsupportedRpcMethod(
              'operational_fact',
              `${method} invalid params`
            )
            break
          }
          const intent = sourceInboundRequestIntent(method, params)
          const attempt = outsourcingSourceFactAttempts.get(idempotencyKey)
          if (attempt && attempt.intent !== intent) {
            data = unsupportedRpcMethod(
              'operational_fact',
              `${method} idempotency intent conflict`
            )
            break
          }
          const existing = attempt?.fact
          const created = existing || {
            ...outsourcingFact,
            id: 20 + createdOutsourcingFacts.length,
            fact_no: params.fact_no,
            fact_type: isMaterialIssue ? 'MATERIAL_ISSUE' : 'RETURN_RECEIPT',
            status: 'DRAFT',
            subject_type: isMaterialIssue ? 'MATERIAL' : 'PRODUCT',
            subject_id: 1,
            product_sku_id: isMaterialIssue ? null : 201,
            warehouse_id: Number(params.warehouse_id),
            lot_id: Number(params.lot_id || 482),
            quantity: params.quantity,
            source_type: 'OUTSOURCING_ORDER',
            source_id: Number(params.outsourcing_order_id),
            source_line_id: Number(params.outsourcing_order_item_id),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
          }
          if (!existing) {
            createdOutsourcingFacts.push(created)
            outsourcingSourceFactAttempts.set(idempotencyKey, {
              fact: created,
              intent,
            })
          }
          const ambiguous =
            params.new_lot_no === 'OUT-NEW-LOT-REREAD-L1' &&
            !ambiguousInboundResponses.has(idempotencyKey)
          if (ambiguous) ambiguousInboundResponses.add(idempotencyKey)
          data = { outsourcing_fact: ambiguous ? null : created }
        }
        break
      case 'post_outsourcing_fact':
      case 'cancel_outsourcing_fact': {
        const factID = Number(params.id || 0)
        const allowedKeys = new Set(['customer_key', 'id'])
        const current = [
          outsourcingFact,
          postedOutsourcingReturn,
          ...paginatedOutsourcingReturns,
          ...createdOutsourcingFacts,
        ].find((fact) => Number(fact.id) === factID)
        const currentStatus =
          outsourcingFactStatusOverrides.get(factID) || current?.status
        const nextStatus =
          method === 'post_outsourcing_fact' ? 'POSTED' : 'CANCELLED'
        const validStatus =
          method === 'post_outsourcing_fact'
            ? currentStatus === 'DRAFT'
            : ['DRAFT', 'POSTED'].includes(currentStatus)
        if (
          !current ||
          !Number.isSafeInteger(factID) ||
          factID <= 0 ||
          !Object.keys(params).every((key) => allowedKeys.has(key)) ||
          !validStatus
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            `${method} invalid params or status`
          )
          break
        }
        outsourcingFactStatusOverrides.set(factID, nextStatus)
        data = {
          outsourcing_fact: { ...current, status: nextStatus },
        }
        break
      }
      case 'list_shipment_source_candidates':
        data = mockShipmentSourceCandidates(params, shipmentSourceCandidates)
        break
      case 'get_shipment':
        if (
          Object.keys(params).length !== 1 ||
          !Number.isSafeInteger(params.id) ||
          params.id <= 0 ||
          params.id !== shipment.id
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'get_shipment invalid params'
          )
          break
        }
        data = { shipment }
        break
      case 'list_shipments':
        {
          const shipments =
            (params.status && params.status !== shipment.status) ||
            (params.source_id &&
              Number(params.source_id) !== shipment.sales_order_id)
              ? []
              : [shipment]
          data = stylePaginatedRpcData(shipments, 'shipments', params)
        }
        break
      case 'create_shipment_with_items':
        data = {
          shipment: {
            ...shipment,
            id: 2,
            ...params,
            items: (params.items || []).map((item, index) => ({
              ...shipmentItem,
              ...item,
              id: index + 2,
              shipment_id: 2,
            })),
          },
        }
        break
      case 'ship_shipment':
        shipmentStatus = 'SHIPPED'
        data = { shipment: { ...shipment, status: shipmentStatus } }
        break
      case 'cancel_shipment':
        shipmentStatus = 'CANCELLED'
        data = { shipment: { ...shipment, status: shipmentStatus } }
        break
      case 'list_stock_reservations':
        {
          const stockReservations =
            (params.source_id &&
              Number(params.source_id) !== stockReservation.sales_order_id) ||
            (params.status && params.status !== stockReservation.status)
              ? []
              : [stockReservation]
          data = stylePaginatedRpcData(
            stockReservations,
            'stock_reservations',
            params
          )
        }
        break
      case 'create_stock_reservation_from_sales_order':
        if (
          !Object.keys(params).every((key) =>
            SALES_ORDER_RESERVATION_CREATE_KEYS.has(key)
          )
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'create_stock_reservation_from_sales_order invalid params'
          )
          break
        }
        data = {
          stock_reservation: {
            ...stockReservation,
            id: 2,
            reservation_no: params.reservation_no,
            sales_order_id: Number(params.sales_order_id),
            sales_order_item_id: Number(params.sales_order_item_id),
            warehouse_id: Number(params.warehouse_id),
            lot_id: params.lot_id ? Number(params.lot_id) : null,
            quantity: params.quantity,
            idempotency_key: params.idempotency_key,
            reserved_at: params.reserved_at || nowUnix(),
            note: params.note || '',
          },
        }
        break
      case 'release_stock_reservation':
        data = {
          stock_reservation: { ...stockReservation, status: 'RELEASED' },
        }
        break
      case 'list_finance_facts':
        {
          const facts = [financeFact].filter(
            (fact) =>
              (!params.source_type ||
                fact.source_type === params.source_type) &&
              (!params.source_id ||
                (typeof params.source_id === 'number' &&
                  Number(fact.source_id || 0) === params.source_id))
          )
          data = {
            finance_facts: facts,
            total: facts.length,
            limit: Number(params.limit || 100),
            offset: Number(params.offset || 0),
          }
        }
        break
      case 'list_finance_payments':
        data = {
          payments: [
            {
              id: 41,
              payment_no: 'PAY-STYLE-L1',
              direction: 'RECEIPT',
              status: 'DRAFT',
              counterparty_type: 'CUSTOMER',
              counterparty_id: 1,
              amount: '1200.00',
              currency: 'CNY',
              account_ref: '银行账户尾号 6688',
              evidence_ref: '回单 STYLE-L1',
              version: 1,
              occurred_at: nowUnix(),
              allocations: [],
            },
          ],
          total: 1,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'list_finance_credit_notes':
        data = {
          credit_notes: [],
          total: 0,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'list_sales_returns':
        data = {
          sales_returns: [
            {
              id: 51,
              return_no: 'RMA-STYLE-L1',
              shipment_id: 1,
              customer_name: '暗色客户',
              status: 'APPROVED',
              reason: '客户验收后发现包装破损',
              version: 2,
              items: [{ id: 511, quantity: '2' }],
              approved_at: nowUnix(),
            },
          ],
          total: 1,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'create_receivable_from_shipment':
        if (
          !validSourceFinanceCreate(
            params,
            SHIPMENT_RECEIVABLE_CREATE_KEYS,
            'shipment_id'
          )
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'create_receivable_from_shipment invalid params'
          )
          break
        }
        data = {
          finance_fact: {
            ...financeFact,
            id: 19,
            fact_no: params.fact_no,
            fact_type: 'RECEIVABLE',
            status: 'DRAFT',
            counterparty_type: 'CUSTOMER',
            amount: '125.00',
            currency: 'CNY',
            source_type: 'SHIPMENT',
            source_id: Number(params.shipment_id),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
          },
        }
        break
      case 'create_invoice_from_shipment':
        if (
          !validSourceFinanceCreate(
            params,
            SHIPMENT_INVOICE_CREATE_KEYS,
            'shipment_id'
          ) ||
          !SHIPMENT_INVOICE_CATEGORIES.has(
            String(params.invoice_category || '')
              .trim()
              .toUpperCase()
          )
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'create_invoice_from_shipment invalid params'
          )
          break
        }
        data = {
          finance_fact: {
            ...financeFact,
            id: 20,
            fact_no: params.fact_no,
            fact_type: 'INVOICE',
            status: 'DRAFT',
            counterparty_type: 'CUSTOMER',
            amount: '125.00',
            currency: 'CNY',
            source_type: 'SHIPMENT',
            source_id: Number(params.shipment_id),
            idempotency_key: params.idempotency_key,
            invoice_category: String(params.invoice_category)
              .trim()
              .toUpperCase(),
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
          },
        }
        break
      case 'create_payable_from_purchase_receipt':
        if (
          !validSourceFinanceCreate(
            params,
            PURCHASE_RECEIPT_PAYABLE_CREATE_KEYS,
            'purchase_receipt_id'
          )
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'create_payable_from_purchase_receipt invalid params'
          )
          break
        }
        data = {
          finance_fact: {
            ...financeFact,
            id: 21,
            fact_no: params.fact_no,
            fact_type: 'PAYABLE',
            status: 'DRAFT',
            counterparty_type: 'SUPPLIER',
            amount: '70.00',
            currency: 'CNY',
            source_type: 'PURCHASE_RECEIPT',
            source_id: Number(params.purchase_receipt_id),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
          },
        }
        break
      case 'create_payable_from_outsourcing_return':
        if (
          !validSourceFinanceCreate(
            params,
            OUTSOURCING_RETURN_PAYABLE_CREATE_KEYS,
            'outsourcing_fact_id'
          )
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'create_payable_from_outsourcing_return invalid params'
          )
          break
        }
        data = {
          finance_fact: {
            ...financeFact,
            id: 22,
            fact_no: params.fact_no,
            fact_type: 'PAYABLE',
            status: 'DRAFT',
            counterparty_type: 'SUPPLIER',
            amount: '4.00',
            currency: 'CNY',
            source_type: 'OUTSOURCING_FACT',
            source_id: Number(params.outsourcing_fact_id),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
          },
        }
        break
      case 'create_reconciliation_from_finance_fact':
        if (
          !validSourceFinanceCreate(
            params,
            SINGLE_FACT_RECONCILIATION_CREATE_KEYS,
            'finance_fact_id'
          )
        ) {
          data = unsupportedRpcMethod(
            'operational_fact',
            'create_reconciliation_from_finance_fact invalid params'
          )
          break
        }
        data = {
          finance_fact: {
            ...financeFact,
            id: 23,
            fact_no: params.fact_no,
            fact_type: 'RECONCILIATION',
            status: 'DRAFT',
            source_type: 'FINANCE_FACT',
            source_id: Number(params.finance_fact_id),
            idempotency_key: params.idempotency_key,
            occurred_at: params.occurred_at || nowUnix(),
            note: params.note || '',
          },
        }
        break
      case 'post_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'POSTED' } }
        break
      case 'settle_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'SETTLED' } }
        break
      case 'cancel_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'CANCELLED' } }
        break
      default:
        data = unsupportedRpcMethod('operational_fact', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  const purchaseReceiptItem = {
    id: 602,
    receipt_id: 601,
    source_line_no: '入库行 1',
    purchase_order_item_id: 1,
    material_id: 1,
    material_name_snapshot: '样式材料',
    warehouse_id: 1,
    warehouse_name: '样式仓库',
    unit_id: 1,
    quantity: '20',
    lot_id: 401,
    lot_no: 'INV-LOT-001',
    unit_price: '3.50',
    amount: '70.00',
    note: '样式入库明细',
    created_at: nowUnix(),
    updated_at: nowUnix(),
  }
  let nextPurchaseReceiptId = 700
  let nextPurchaseReceiptItemId = 800
  const purchaseReceipts = [
    {
      id: 601,
      receipt_no: 'PR-STYLE-L1',
      purchase_order_id: 1,
      purchase_order_no: 'PO-STYLE-L1',
      supplier_id: 1,
      supplier_name: '样式供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'POSTED',
      note: '样式采购入库',
      items: [purchaseReceiptItem],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 603,
      receipt_no: 'PR-STYLE-L1-DRAFT',
      purchase_order_id: 1,
      purchase_order_no: 'PO-STYLE-L1',
      supplier_name: '样式草稿供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'DRAFT',
      note: '样式草稿采购入库',
      items: [
        {
          ...purchaseReceiptItem,
          id: 604,
          receipt_id: 603,
          source_line_no: '草稿入库行 1',
          quantity: '12',
          amount: '42.00',
          note: '样式草稿入库明细',
        },
      ],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 605,
      receipt_no: 'PR-STYLE-L1-CANCELLED',
      supplier_name: '样式取消供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'CANCELLED',
      note: '样式取消采购入库',
      items: [],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
  ]
  const purchaseReceiptMutationAttempts = new Map()
  const purchaseReturnRecord = {
    id: 901,
    return_no: 'PRT-STYLE-L1',
    purchase_receipt_id: 601,
    supplier_name: '样式供应商',
    status: 'DRAFT',
    returned_at: nowUnix(),
    note: '样式采购退货',
    items: [
      {
        id: 911,
        return_id: 901,
        purchase_receipt_item_id: 602,
        material_id: 1,
        warehouse_id: 1,
        unit_id: 1,
        lot_id: 401,
        quantity: '2',
      },
    ],
  }
  const purchaseReceiptAdjustmentRecord = {
    id: 902,
    adjustment_no: 'PRA-STYLE-L1',
    purchase_receipt_id: 601,
    reason: '样式数量核对',
    status: 'POSTED',
    adjusted_at: nowUnix(),
    note: '样式入库调整',
    items: [
      {
        id: 912,
        adjustment_id: 902,
        purchase_receipt_item_id: 602,
        adjust_type: 'QUANTITY_DECREASE',
        material_id: 1,
        warehouse_id: 1,
        unit_id: 1,
        lot_id: 401,
        quantity: '1',
      },
    ],
  }

  await page.route('**/rpc/purchase', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    const filteredPurchaseReceipts = () => {
      const status = String(params.status || '').trim()
      const keyword = String(params.keyword || '')
        .trim()
        .toLowerCase()
      return purchaseReceipts.filter((receipt) => {
        if (status && receipt.status !== status) return false
        if (!keyword) return true
        return [receipt.receipt_no, receipt.supplier_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
    }

    let data = {}
    let rpcResult = null
    switch (method) {
      case 'list_purchase_rejection_dispositions':
        data = stylePaginatedRpcData(
          [],
          'purchase_rejection_dispositions',
          params
        )
        break
      case 'list_purchase_receipts':
        {
          const rows = filteredPurchaseReceipts()
          const offset = Number(params.offset || 0)
          const limit = Number(params.limit || rows.length || 100)
          data = {
            purchase_receipts: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          }
        }
        break
      case 'create_purchase_receipt_from_purchase_order':
        {
          const purchaseOrderID = Number(params.purchase_order_id || 0)
          const mutation = purchaseReceiptMutationResult(
            purchaseReceiptMutationAttempts,
            `create-from-order:${purchaseOrderID}`,
            params,
            () => {
              const receiptId = nextPurchaseReceiptId
              nextPurchaseReceiptId += 1
              const itemId = nextPurchaseReceiptItemId
              nextPurchaseReceiptItemId += 1
              const item = {
                ...purchaseReceiptItem,
                id: itemId,
                receipt_id: receiptId,
                warehouse_id: Number(params.warehouse_id || 1),
              }
              const receipt = {
                ...purchaseReceipts[1],
                ...params,
                id: receiptId,
                receipt_no: String(params.receipt_no || '').trim(),
                status: 'DRAFT',
                items: [item],
                created_at: nowUnix(),
                updated_at: nowUnix(),
              }
              purchaseReceipts.unshift(receipt)
              return { purchase_receipt: receipt }
            }
          )
          data = mutation.data || {}
          rpcResult = mutation.error || null
        }
        break
      case 'post_purchase_receipt':
        {
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === Number(params.id)
          )
          if (receipt) receipt.status = 'POSTED'
          data = {
            purchase_receipt: receipt || { ...purchaseReceipts[0], ...params },
          }
        }
        break
      case 'cancel_purchase_receipt':
        {
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === Number(params.id)
          )
          if (receipt) receipt.status = 'CANCELLED'
          data = {
            purchase_receipt: receipt || { ...purchaseReceipts[0], ...params },
          }
        }
        break
      case 'get_purchase_receipt':
        data = {
          purchase_receipt:
            purchaseReceipts.find(
              (item) => Number(item.id) === Number(params.id)
            ) || purchaseReceipts[0],
        }
        break
      case 'add_purchase_receipt_item':
        {
          const receiptID = Number(params.receipt_id || 0)
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === receiptID
          )
          const mutation = purchaseReceiptMutationResult(
            purchaseReceiptMutationAttempts,
            `add-item:${receiptID}`,
            params,
            () => {
              const item = {
                ...purchaseReceiptItem,
                ...params,
                receipt_id: receiptID,
                id: nextPurchaseReceiptItemId,
                created_at: nowUnix(),
                updated_at: nowUnix(),
              }
              nextPurchaseReceiptItemId += 1
              if (receipt) {
                receipt.items = [...(receipt.items || []), item]
              }
              return { purchase_receipt_item: item }
            }
          )
          data = mutation.data || {}
          rpcResult = mutation.error || null
        }
        break
      case 'list_purchase_returns':
        data = stylePaginatedRpcData(
          Number(params.purchase_receipt_id || 0) === 601
            ? [purchaseReturnRecord]
            : [],
          'purchase_returns',
          params
        )
        break
      case 'post_purchase_return':
        purchaseReturnRecord.status = 'POSTED'
        data = { purchase_return: purchaseReturnRecord }
        break
      case 'cancel_purchase_return':
        purchaseReturnRecord.status = 'CANCELLED'
        data = { purchase_return: purchaseReturnRecord }
        break
      case 'list_purchase_receipt_adjustments':
        data = stylePaginatedRpcData(
          Number(params.purchase_receipt_id || 0) === 601
            ? [purchaseReceiptAdjustmentRecord]
            : [],
          'purchase_receipt_adjustments',
          params
        )
        break
      case 'post_purchase_receipt_adjustment':
        purchaseReceiptAdjustmentRecord.status = 'POSTED'
        data = {
          purchase_receipt_adjustment: purchaseReceiptAdjustmentRecord,
        }
        break
      case 'cancel_purchase_receipt_adjustment':
        purchaseReceiptAdjustmentRecord.status = 'CANCELLED'
        data = {
          purchase_receipt_adjustment: purchaseReceiptAdjustmentRecord,
        }
        break
      default:
        data = unsupportedRpcMethod('purchase', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: rpcResult || styleRpcResult(data),
      }),
    })
  })

  await page.route('**/rpc/quality', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const qualityInspection = {
      id: 701,
      inspection_no: 'QI-STYLE-L1',
      purchase_receipt_id: 601,
      purchase_receipt_item_id: 602,
      inventory_lot_id: 401,
      material_id: 1,
      warehouse_id: 1,
      source_type: 'PURCHASE_RECEIPT',
      source_id: 601,
      inspection_type: 'INCOMING',
      subject_type: 'MATERIAL',
      subject_id: 1,
      status: 'SUBMITTED',
      result: '',
      original_lot_status: 'HOLD',
      inspected_at: 0,
      inspector_id: null,
      decision_note: '等待品质判定',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const acceptedOutsourcingReturnInspection = {
      id: 703,
      inspection_no: 'QI-OUT-PASS-STYLE-L1',
      inventory_lot_id: 402,
      warehouse_id: 1,
      source_type: 'OUTSOURCING_FACT',
      source_id: 3,
      inspection_type: 'OUTSOURCING_RETURN',
      subject_type: 'PRODUCT',
      subject_id: 1,
      status: 'PASSED',
      result: 'PASS',
      original_lot_status: 'HOLD',
      inspected_at: nowUnix(),
      inspector_id: 1,
      decision_note: '委外回货质检合格',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_quality_inspections':
        {
          const keyword = String(params.keyword || '')
            .trim()
            .toLowerCase()
          const haystack = [
            qualityInspection.inspection_no,
            'PR-STYLE-L1',
            'INV-LOT-001',
          ]
            .join(' ')
            .toLowerCase()
          const qualityInspections =
            keyword && !haystack.includes(keyword) ? [] : [qualityInspection]
          data = stylePaginatedRpcData(
            qualityInspections,
            'quality_inspections',
            params
          )
        }
        break
      case 'list_outsourcing_return_quality_inspections':
        if (
          !Object.keys(params).every((key) =>
            OUTSOURCING_RETURN_QUALITY_LIST_KEYS.has(key)
          )
        ) {
          data = unsupportedRpcMethod('quality', `${method}:invalid-params`)
          break
        }
        {
          const qualityInspections = [
            acceptedOutsourcingReturnInspection,
          ].filter(
            (inspection) =>
              (!params.fact_id ||
                Number(params.fact_id) === Number(inspection.source_id)) &&
              (!params.status || params.status === inspection.status) &&
              (!params.result || params.result === inspection.result)
          )
          data = stylePaginatedRpcData(
            qualityInspections,
            'quality_inspections',
            params,
            50
          )
        }
        break
      case 'create_quality_inspection_draft':
        data = {
          quality_inspection: {
            ...qualityInspection,
            ...params,
            id: 702,
            status: 'DRAFT',
            result: '',
          },
        }
        break
      case 'submit_quality_inspection':
      case 'pass_quality_inspection':
      case 'reject_quality_inspection':
      case 'cancel_quality_inspection':
      case 'get_quality_inspection':
        data = { quality_inspection: { ...qualityInspection, ...params } }
        break
      default:
        data = unsupportedRpcMethod('quality', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  await page.route('**/rpc/inventory', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const inventoryBalance = {
      id: 301,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      warehouse_id: 1,
      lot_id: 402,
      unit_id: 1,
      quantity: '12.5',
      active_reserved_quantity: '4',
      available_quantity: '8.5',
      updated_at: nowUnix(),
    }
    const inventoryLot = {
      id: 401,
      subject_type: 'MATERIAL',
      subject_id: 1,
      lot_no: 'INV-LOT-001',
      supplier_lot_no: 'SUP-LOT-001',
      color_no: 'C01',
      dye_lot_no: 'DYE-01',
      production_lot_no: '',
      status: 'HOLD',
      received_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const activeMaterialLot = {
      ...inventoryLot,
      id: 403,
      warehouse_id: 1,
      lot_no: 'MAT-LOT-STYLE-L1',
      supplier_lot_no: 'MAT-SUP-LOT-L1',
      status: 'ACTIVE',
    }
    const skuInventoryLot = {
      id: 402,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      lot_no: 'SKU-LOT-STYLE-L1',
      supplier_lot_no: '',
      color_no: 'C01',
      dye_lot_no: '',
      production_lot_no: 'PROD-LOT-STYLE-L1',
      status: 'ACTIVE',
      received_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const inventoryTxn = {
      id: 501,
      txn_type: 'REVERSAL',
      direction: -1,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      warehouse_id: 1,
      lot_id: 402,
      quantity: '1.5',
      unit_id: 1,
      source_type: 'MANUAL_SEED',
      source_id: 9001,
      source_line_id: 9002,
      reversal_of_txn_id: 888500999,
      idempotency_key: 'INV-TXN-001',
      note: 'ledger seed',
      occurred_at: nowUnix(),
      created_at: nowUnix(),
    }

    let data = {}
    const keyword = String(params.keyword || '')
      .trim()
      .toLowerCase()
    const matchesKeyword = (...values) => {
      if (!keyword) return true
      return values
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(keyword))
    }
    switch (method) {
      case 'list_inventory_balances':
        {
          const inventoryBalances =
            (!params.subject_type ||
              inventoryBalance.subject_type === params.subject_type) &&
            (!params.subject_id ||
              inventoryBalance.subject_id === Number(params.subject_id)) &&
            (!params.product_sku_id ||
              inventoryBalance.product_sku_id ===
                Number(params.product_sku_id)) &&
            matchesKeyword(
              inventoryBalance.id,
              inventoryBalance.subject_type,
              inventoryBalance.subject_id,
              inventoryBalance.warehouse_id,
              inventoryBalance.lot_id,
              inventoryBalance.quantity,
              inventoryBalance.available_quantity
            )
              ? [inventoryBalance]
              : []
          data = stylePaginatedRpcData(
            inventoryBalances,
            'inventory_balances',
            params
          )
        }
        break
      case 'list_inventory_lots':
        {
          const candidates = [inventoryLot, skuInventoryLot]
          if (
            params.status === 'ACTIVE' &&
            params.subject_type === 'MATERIAL'
          ) {
            candidates.push(activeMaterialLot)
          }
          const inventoryLots = candidates.filter(
            (item) =>
              (!params.subject_type ||
                item.subject_type === params.subject_type) &&
              (!params.subject_id ||
                item.subject_id === Number(params.subject_id)) &&
              (!params.product_sku_id ||
                item.product_sku_id === Number(params.product_sku_id)) &&
              (!params.warehouse_id ||
                !item.warehouse_id ||
                item.warehouse_id === Number(params.warehouse_id)) &&
              (!params.status || item.status === params.status) &&
              matchesKeyword(
                item.id,
                item.lot_no,
                item.supplier_lot_no,
                item.color_no,
                item.dye_lot_no,
                item.status
              )
          )
          data = {
            inventory_lots: inventoryLots.slice(
              Number(params.offset || 0),
              Number(params.offset || 0) + Number(params.limit || 100)
            ),
            total: inventoryLots.length,
            limit: Number(params.limit || 100),
            offset: Number(params.offset || 0),
          }
        }
        break
      case 'list_inventory_txns':
        {
          const inventoryTxns =
            (!params.subject_type ||
              inventoryTxn.subject_type === params.subject_type) &&
            (!params.subject_id ||
              inventoryTxn.subject_id === Number(params.subject_id)) &&
            (!params.product_sku_id ||
              inventoryTxn.product_sku_id === Number(params.product_sku_id)) &&
            matchesKeyword(
              inventoryTxn.id,
              inventoryTxn.txn_type,
              inventoryTxn.source_type,
              inventoryTxn.idempotency_key,
              inventoryTxn.note
            )
              ? [inventoryTxn]
              : []
          data = stylePaginatedRpcData(inventoryTxns, 'inventory_txns', params)
        }
        break
      default:
        data = unsupportedRpcMethod('inventory', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  const cloneWorkflowTask = (task) => JSON.parse(JSON.stringify(task))
  const workflowTasks = Array.isArray(context.workflowTaskFixtures)
    ? context.workflowTaskFixtures.map(cloneWorkflowTask)
    : []
  const workflowBusinessStates = []
  const workflowMutationReceipts = new Map()
  const workflowRoleTaskSnapshotByCursor = new Map()
  let workflowTaskID = Math.max(
    1,
    ...workflowTasks.map((task) => Number(task.id || 0) + 1)
  )
  const workflowMutationOperationByMethod = {
    complete_task_action: 'complete',
    block_task_action: 'block',
    reject_task_action: 'reject',
    resume_task_action: 'resume',
    urge_task: 'urge',
  }
  const resolveWorkflowMutationRequest = (method, params = {}) => {
    const operation = workflowMutationOperationByMethod[method] || ''
    let mutationParams
    try {
      mutationParams = requireWorkflowTaskMutationParams(operation, params, {
        requireIdempotencyKey: true,
      })
    } catch (error) {
      return {
        errorCode: 40010,
        errorMessage: error?.message || '页面已更新，请刷新后重新操作',
      }
    }
    const task = workflowTasks.find(
      (item) => item.id === mutationParams.task_id
    )
    if (!task) {
      return { errorCode: 40010, errorMessage: '任务不存在' }
    }
    if (!Number.isSafeInteger(task.version) || task.version <= 0) {
      return {
        errorCode: 40010,
        errorMessage: '任务版本信息无效，请刷新后重试',
      }
    }
    const receiptKey = `${task.id}:${mutationParams.idempotency_key}`
    const intent = workflowTaskMutationSignature(operation, mutationParams)
    const receipt = workflowMutationReceipts.get(receiptKey)
    if (receipt && receipt.intent !== intent) {
      return {
        errorCode: 40920,
        errorMessage: '重复请求内容与首次提交不一致，请刷新后重试',
      }
    }
    return {
      mutationParams,
      operation,
      receipt: receipt
        ? { task: cloneWorkflowTask(receipt.task) }
        : { intent, receiptKey },
      task,
    }
  }
  let businessDashboardStatsFailureServed = false
  let businessDashboardWorkflowFailureServed = false
  await page.route('**/rpc/business', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    let data = {}
    switch (method) {
      case 'dashboard_stats':
        if (
          page
            .url()
            .includes('__style_l1_business_dashboard_stats_unavailable=1') &&
          !businessDashboardStatsFailureServed
        ) {
          businessDashboardStatsFailureServed = true
          data = unsupportedRpcMethod(
            'business',
            'dashboard_stats temporarily unavailable'
          )
          break
        }
        data = {
          modules: [
            {
              module_key: 'customers',
              available: true,
              total: page
                .url()
                .includes('__style_l1_business_dashboard_large=1')
                ? 1_234_567
                : 60,
            },
            { module_key: 'suppliers', available: true, total: 60 },
            { module_key: 'products', available: true, total: 24 },
            { module_key: 'material-bom', available: true, total: 47 },
            { module_key: 'sales-orders', available: true, total: 45 },
            {
              module_key: 'accessories-purchase',
              available: true,
              total: 45,
            },
            { module_key: 'inbound', available: true, total: 0 },
            {
              module_key: 'quality-inspections',
              available: true,
              total: 0,
            },
            { module_key: 'inventory', available: true, total: 0 },
            { module_key: 'shipping-release', available: true, total: 0 },
            { module_key: 'outbound', available: true, total: 0 },
            {
              module_key: 'production-orders',
              available: true,
              total: 0,
            },
            {
              module_key: 'production-scheduling',
              available: true,
              total: 20,
            },
            {
              module_key: 'production-progress',
              available: true,
              total: 0,
            },
            {
              module_key: 'production-exceptions',
              available: true,
              total: 20,
            },
            {
              module_key: 'processing-contracts',
              available: true,
              total: 45,
            },
            { module_key: 'reconciliation', available: true, total: 0 },
            { module_key: 'payables', available: true, total: 0 },
            { module_key: 'receivables', available: true, total: 0 },
            { module_key: 'invoices', available: true, total: 0 },
          ],
        }
        break
      default:
        data = unsupportedRpcMethod('business', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    let data = {}
    let resultCode = 0
    let resultMessage = 'OK'
    const fail = (message, code = 40010) => {
      resultCode = code
      resultMessage = message
    }
    const isTerminalTask = (task) =>
      ['done', 'rejected', 'cancelled', 'closed'].includes(
        String(task?.task_status_key || '').trim()
      )
    switch (method) {
      case 'list_business_states':
        if (
          !workflowMockPermissionAllowed(
            adminProfile,
            effectiveSession,
            'workflow.task.read'
          )
        ) {
          fail('当前账号缺少查看协同任务权限')
        } else {
          const businessStates = workflowBusinessStates.filter(
            (item) =>
              !params.source_type || item.source_type === params.source_type
          )
          data = {
            business_states: businessStates,
            total: businessStates.length,
            limit: Number(params.limit || 50),
            offset: Number(params.offset || 0),
          }
        }
        break
      case 'list_tasks': {
        if (
          !workflowMockPermissionAllowed(
            adminProfile,
            effectiveSession,
            'workflow.task.read'
          )
        ) {
          fail('当前账号缺少查看协同任务权限')
          break
        }
        const listDelayMs = resolveDelayFromReferer(
          route.request(),
          '__style_l1_workflow_list_delay'
        )
        if (listDelayMs > 0) {
          await delay(listDelayMs)
        }
        const matchingTasks = workflowTasks.filter(
          (item) =>
            (!params.source_type || item.source_type === params.source_type) &&
            (!params.task_group || item.task_group === params.task_group) &&
            (!params.task_status_key ||
              item.task_status_key === params.task_status_key) &&
            (!params.owner_role_key ||
              item.owner_role_key === params.owner_role_key) &&
            (!params.source_id ||
              Number(item.source_id) === Number(params.source_id)) &&
            workflowMockCanViewTask(adminProfile, effectiveSession, item)
        )
        const limit = Math.min(Math.max(Number(params.limit || 50), 1), 200)
        const offset = Math.max(Number(params.offset || 0), 0)
        const tasks = matchingTasks.slice(offset, offset + limit)
        data = {
          tasks,
          total: matchingTasks.length,
          limit,
          offset,
        }
        break
      }
      case 'list_task_events': {
        const taskID = Number(params.task_id || 0)
        const task = workflowTasks.find((item) => Number(item.id) === taskID)
        if (
          !task ||
          !workflowMockCanViewTask(adminProfile, effectiveSession, task)
        ) {
          fail('当前账号不能查看该任务轨迹')
          break
        }
        data = {
          items: [
            {
              id: taskID * 10,
              task_id: taskID,
              event_type: 'created',
              from_status_key: '',
              to_status_key: task.task_status_key,
              actor_role_key: task.owner_role_key,
              reason: '等待审批人核对来源单据与放行条件',
              task_version: task.version,
              created_at: Number(task.created_at || nowUnix()),
            },
          ],
          total: 1,
          limit: Number(params.limit || 100),
          offset: 0,
        }
        break
      }
      case 'list_role_tasks': {
        if (
          !workflowMockPermissionAllowed(
            adminProfile,
            effectiveSession,
            'workflow.task.read'
          )
        ) {
          fail('当前账号缺少查看协同任务权限')
          break
        }
        const listDelayMs = resolveDelayFromReferer(
          route.request(),
          '__style_l1_workflow_list_delay'
        )
        if (listDelayMs > 0) {
          await delay(listDelayMs)
        }
        const roleKey = String(params.role_key || '').trim()
        const viewKey = String(params.view_key || '').trim()
        const limit = Math.min(Math.max(Number(params.limit || 50), 1), 100)
        const cursor = String(params.cursor || '').trim()
        const cursorSnapshotKey = `${viewKey}|${roleKey}|${cursor}`
        const snapshotAt = cursor
          ? workflowRoleTaskSnapshotByCursor.get(cursorSnapshotKey) ||
            Number(nowUnix())
          : Number(nowUnix())
        const beforeID = cursor ? Number(cursor) : 0
        const terminalStatuses = new Set([
          'done',
          'rejected',
          'cancelled',
          'closed',
        ])
        const isRiskTask = (task) =>
          task.task_status_key === 'blocked' ||
          (Number(task.due_at || 0) > 0 &&
            Number(task.due_at) < Number(nowUnix())) ||
          Number(task.priority || 0) >= 3 ||
          task.critical_path === true ||
          Number(task.urge_count || 0) > 0 ||
          Boolean(task.escalated_at) ||
          task.payload?.critical_path === true
        const crossRoleRisk =
          viewKey === 'risk' && ['pmc', 'boss'].includes(roleKey)
        const matchingTasks = workflowTasks
          .filter((task) => {
            const terminal = terminalStatuses.has(task.task_status_key)
            const assignedToCurrentAdmin =
              Number(task.assignee_id || 0) > 0 &&
              Number(task.assignee_id) === Number(adminProfile?.id || 0)
            const roleMatched =
              crossRoleRisk ||
              task.owner_role_key === roleKey ||
              assignedToCurrentAdmin
            const viewMatched =
              viewKey === 'history'
                ? terminal
                : viewKey === 'risk'
                  ? !terminal && isRiskTask(task)
                  : !terminal
            return (
              roleMatched &&
              viewMatched &&
              (!beforeID || task.id < beforeID) &&
              workflowMockCanViewTask(adminProfile, effectiveSession, task)
            )
          })
          .sort((left, right) => right.id - left.id)
        const items = matchingTasks.slice(0, limit)
        const hasMore = matchingTasks.length > limit
        const nextCursor =
          hasMore && items.length > 0 ? String(items[items.length - 1].id) : ''
        if (nextCursor) {
          workflowRoleTaskSnapshotByCursor.set(
            `${viewKey}|${roleKey}|${nextCursor}`,
            snapshotAt
          )
        }
        data = {
          items,
          next_cursor: nextCursor,
          has_more: hasMore,
          server_time: snapshotAt,
        }
        break
      }
      case 'get_task_board': {
        if (
          !workflowMockPermissionAllowed(
            adminProfile,
            effectiveSession,
            'workflow.task.read'
          )
        ) {
          fail('当前账号缺少查看协同任务权限')
          break
        }
        if (
          page
            .url()
            .includes('__style_l1_business_dashboard_workflow_unavailable=1') &&
          !businessDashboardWorkflowFailureServed
        ) {
          businessDashboardWorkflowFailureServed = true
          fail('协同概览暂不可用')
          break
        }
        if (Number(params.limit) === 1 && Number(params.offset || 0) === 0) {
          const counts = {
            actionable: 55,
            exception: 27,
            due: 66,
            finished: 32,
          }
          const representativeTasks = {
            actionable: {
              id: 91_001,
              version: 1,
              task_status_key: 'ready',
              task_name: '跟进销售订单',
              source_type: 'sales-orders',
              source_id: 101,
              source_no: 'STYLE-SO-001',
              payload: {},
            },
            exception: {
              id: 91_002,
              version: 1,
              task_status_key: 'blocked',
              task_name: '处理订单阻塞',
              source_type: 'sales-orders',
              source_id: 102,
              source_no: 'STYLE-SO-002',
              payload: {},
            },
            due: {
              id: 91_003,
              version: 1,
              task_status_key: 'ready',
              task_name: '确认到期事项',
              source_type: 'sales-orders',
              source_id: 103,
              source_no: 'STYLE-SO-003',
              payload: {},
            },
            finished: {
              id: 91_004,
              version: 1,
              task_status_key: 'done',
              task_name: '查看已结束事项',
              source_type: 'sales-orders',
              source_id: 104,
              source_no: 'STYLE-SO-004',
              payload: {},
            },
          }
          data = {
            snapshot_at: Number(nowUnix()),
            total: Object.values(counts).reduce((sum, count) => sum + count, 0),
            counts,
            lanes: Object.entries(counts).map(([key, total]) => ({
              key,
              total,
              limit: 1,
              offset: 0,
              tasks: [representativeTasks[key]],
            })),
            source_types: ['sales-orders'],
            owner_role_keys: ['sales'],
          }
          break
        }
        const visibleTasks = workflowTasks.filter((item) =>
          workflowMockCanViewTask(adminProfile, effectiveSession, item)
        )
        data = buildWorkflowTaskBoardMock({
          tasks: visibleTasks,
          params,
          snapshotAt: nowUnix(),
        })
        break
      }
      case 'create_task': {
        let createParams
        try {
          createParams = requireWorkflowTaskCreateParams(params)
        } catch (error) {
          fail(error?.message || 'create_task 参数无效')
          break
        }
        if (!workflowMockCanCreateTask(adminProfile, effectiveSession)) {
          fail('当前账号缺少创建协同任务权限')
          break
        }
        const task = {
          id: workflowTaskID++,
          task_code: createParams.task_code,
          task_group: createParams.task_group,
          task_name: createParams.task_name,
          source_type: createParams.source_type,
          source_id: createParams.source_id,
          source_no: createParams.source_no || '',
          business_status_key: createParams.business_status_key || '',
          task_status_key: createParams.task_status_key,
          owner_role_key: createParams.owner_role_key,
          assignee_id: createParams.assignee_id || '',
          priority: createParams.priority,
          due_at: createParams.due_at || null,
          blocked_reason: '',
          version: 1,
          payload: createParams.payload,
          created_at: nowUnix(),
          updated_at: nowUnix(),
        }
        workflowTasks.unshift(task)
        data = { task }
        break
      }
      case 'complete_task_action':
      case 'block_task_action':
      case 'reject_task_action':
      case 'resume_task_action': {
        const request = resolveWorkflowMutationRequest(method, params)
        const nextStatusKey =
          method === 'complete_task_action'
            ? 'done'
            : method === 'block_task_action'
              ? 'blocked'
              : method === 'reject_task_action'
                ? 'rejected'
                : 'ready'
        const actionKey =
          method === 'complete_task_action'
            ? 'complete'
            : method === 'block_task_action'
              ? 'block'
              : method === 'reject_task_action'
                ? 'reject'
                : 'resume'
        const decision = request.errorCode
          ? null
          : workflowMockActionDecision({
              actionKey,
              adminProfile,
              effectiveSession,
              task: request.task,
            })
        if (request.errorCode) {
          fail(request.errorMessage, request.errorCode)
        } else if (
          !decision.permissionAllowed ||
          !workflowMockCanAccessTaskForCapability(
            adminProfile,
            effectiveSession,
            request.task,
            decision.requiredPermission
          )
        ) {
          fail('当前账号无权查看或执行该任务动作')
        } else if (request.receipt.task) {
          data = { task: request.receipt.task }
        } else if (!decision.allowed) {
          fail(decision.reason)
        } else if (isTerminalTask(request.task)) {
          fail('任务已结束，不能再次变更状态')
        } else if (
          request.mutationParams.expected_version !== request.task.version
        ) {
          fail('任务已被其他人更新，请刷新后重试')
        } else {
          const { mutationParams, receipt, task } = request
          task.task_status_key = nextStatusKey
          task.payload = {
            ...(task.payload || {}),
            ...mutationParams.payload,
          }
          if (nextStatusKey === 'blocked') {
            task.payload.blocked_reason = mutationParams.reason
            delete task.payload.rejected_reason
          } else if (nextStatusKey === 'rejected') {
            task.payload.rejected_reason = mutationParams.reason
            delete task.payload.blocked_reason
          } else if (nextStatusKey === 'ready') {
            delete task.payload.blocked_reason
            delete task.payload.rejected_reason
            task.completed_at = null
          } else {
            delete task.payload.blocked_reason
            delete task.payload.rejected_reason
            task.completed_at = nowUnix()
          }
          task.blocked_reason =
            nextStatusKey === 'blocked' || nextStatusKey === 'rejected'
              ? mutationParams.reason
              : ''
          task.updated_at = nowUnix()
          task.version += 1
          workflowMutationReceipts.set(receipt.receiptKey, {
            intent: receipt.intent,
            task: cloneWorkflowTask(task),
          })
          data = { task }
        }
        break
      }
      case 'urge_task': {
        const request = resolveWorkflowMutationRequest(method, params)
        const decision = request.errorCode
          ? null
          : workflowMockActionDecision({
              actionKey: 'urge',
              adminProfile,
              effectiveSession,
              task: request.task,
            })
        if (request.errorCode) {
          fail(request.errorMessage, request.errorCode)
        } else if (
          !decision.permissionAllowed ||
          !workflowMockCanAccessTaskForCapability(
            adminProfile,
            effectiveSession,
            request.task,
            decision.requiredPermission
          )
        ) {
          fail('当前账号无权查看或执行该任务动作')
        } else if (request.receipt.task) {
          data = { task: request.receipt.task }
        } else if (!decision.allowed) {
          fail(decision.reason)
        } else if (isTerminalTask(request.task)) {
          fail('任务已结束，不能催办')
        } else if (
          request.mutationParams.expected_version !== request.task.version
        ) {
          fail('任务已被其他人更新，请刷新后重试')
        } else {
          const { mutationParams, receipt, task } = request
          const urgedAt = nowUnix()
          const actorRoleKey =
            String(
              adminProfile?.roles?.[0]?.role_key ||
                adminProfile?.roles?.[0]?.key ||
                ''
            ).trim() || 'system'
          const escalationTarget =
            mutationParams.action === 'escalate_to_boss'
              ? 'boss'
              : mutationParams.action === 'escalate_to_pmc'
                ? 'pmc'
                : ''
          task.urge_count = Number(task.urge_count || 0) + 1
          task.last_urged_at = urgedAt
          task.last_urged_by = Math.max(1, Number(adminProfile?.id || 0))
          task.last_urged_by_role_key = actorRoleKey
          if (escalationTarget) {
            task.escalated_at = urgedAt
            task.escalate_target_role_key = escalationTarget
          }
          task.payload = {
            ...(task.payload || {}),
            ...mutationParams.payload,
            urged: true,
            urge_count: task.urge_count,
            last_urge_action: mutationParams.action,
            last_urge_reason: mutationParams.reason,
          }
          task.updated_at = urgedAt
          task.version += 1
          workflowMutationReceipts.set(receipt.receiptKey, {
            intent: receipt.intent,
            task: cloneWorkflowTask(task),
          })
          data = { task }
        }
        break
      }
      case 'explain_action_access': {
        let requestParams
        try {
          requestParams = requireWorkflowTaskExplainParams(params, {
            allowActionKey: true,
          })
        } catch (error) {
          fail(error?.message || '任务动作权限查询参数无效')
          break
        }
        const { taskID, actionKey } = requestParams
        const task = workflowTasks.find((item) => item.id === taskID)
        if (!task) {
          fail('任务不存在')
          break
        }
        if (!workflowMockCanViewTask(adminProfile, effectiveSession, task)) {
          fail('当前账号无权查看该协同任务')
          break
        }
        const ownerRoleKey = task?.owner_role_key || ''
        const actions = ['complete', 'block', 'reject', 'resume', 'urge'].map(
          (actionKey) => {
            const decision = workflowMockActionDecision({
              actionKey,
              adminProfile,
              effectiveSession,
              task,
            })
            return {
              action_key: actionKey,
              allowed: decision.allowed,
              reason: decision.reason,
              reason_code: decision.reasonCode,
              required_permission: decision.requiredPermission,
              owner_role_key: ownerRoleKey,
              visible_owner_role_keys: decision.visibleOwnerRoleKeys,
              candidate_owner_role_keys: decision.visibleOwnerRoleKeys,
              owner_role_matched: decision.ownerRoleMatched,
              work_pool_role_matched: false,
              work_pool_entitlement_matched: false,
              work_pool_entitlement_scope_matched: false,
              domain_command_entry: {
                enabled: false,
                will_write_fact: false,
                source: 'style_l1_no_domain_command_contract',
                command_key: '',
                blocked_reasons: ['domain_command_contract_not_configured'],
                required_contract: [],
              },
              actor_role_key: decision.assignedToCurrentAdmin
                ? ownerRoleKey
                : decision.ownerRoleMatched
                  ? ownerRoleKey
                  : adminProfile?.is_super_admin === true &&
                      actionKey === 'urge'
                    ? 'admin'
                    : '',
              status_key: decision.statusKey,
            }
          }
        )
        data = actionKey
          ? { action: actions.find((item) => item.action_key === actionKey) }
          : { task_id: taskID, actions }
        break
      }
      default:
        fail(
          `workflow method ${String(method || '').trim() || '(empty)'} is not supported`
        )
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: resultCode,
          message: resultMessage,
          data,
        },
      }),
    })
  })
}
