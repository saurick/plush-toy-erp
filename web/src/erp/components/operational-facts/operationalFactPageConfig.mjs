import {
  cancelFinanceFact,
  cancelOutsourcingFact,
  cancelProductionFact,
  cancelShipment,
  listFinanceFacts,
  listOutsourcingFacts,
  listProductionFacts,
  listShipments,
  listStockReservations,
  postFinanceFact,
  postOutsourcingFact,
  postProductionFact,
  releaseStockReservation,
  settleFinanceFact,
  shipShipment,
} from '../../api/operationalFactApi.mjs'
import {
  formatUnixDate,
  V1_ROUTE_PATHS,
} from '../../utils/masterDataOrderView.mjs'
import { financeCancelAuditText as buildFinanceCancelAuditText } from '../../utils/financeCancellation.mjs'
import {
  financeCollectionTypeText,
  financeInvoiceCategoryText,
  financePaymentTermText,
} from '../../utils/financeFactDisplay.mjs'
import {
  ACTION_PERMISSIONS,
  FINANCE_COLLECTION_TYPE_LABELS,
  FINANCE_INVOICE_CATEGORY_LABELS,
  FINANCE_PAYMENT_TERM_LABELS,
  formatQuantity,
  businessSourceRouteFor,
  statusTag,
} from './OperationalFactForms.jsx'
import { compareOperationalFactDecimalValues } from './operationalFactDecimal.mjs'

export const DEFAULT_OPERATIONAL_FACT_PAGINATION = Object.freeze({
  current: 1,
  pageSize: 20,
})

export const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已过账', value: 'POSTED' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已结清', value: 'SETTLED' },
  { label: '生效中', value: 'ACTIVE' },
  { label: '已释放', value: 'RELEASED' },
  { label: '已消耗', value: 'CONSUMED' },
  { label: '已取消', value: 'CANCELLED' },
]

export const OCCURRED_DATE_FILTER_OPTIONS = [
  { label: '发生日期', value: 'occurred_at' },
]

const SHIPMENT_DATE_FILTER_OPTIONS = [
  { label: '计划出货日期', value: 'planned_ship_at' },
  { label: '实际出货日期', value: 'shipped_at' },
]

const RESERVED_DATE_FILTER_OPTIONS = [
  { label: '预留日期', value: 'reserved_at' },
]

export const DEFAULT_OPERATIONAL_FACT_SUMMARY =
  '统一处理生产、委外、出货、库存预留和财务记录。确认后系统会更新相应状态和库存；取消已确认记录时会保留原记录并作撤销调整。'
export const EMPTY_VIEW_OVERRIDES = Object.freeze({})

export const financeCancelAuditText = (record) =>
  buildFinanceCancelAuditText(record, formatUnixDate)

const FACT_TYPE_LABELS = Object.freeze({
  MATERIAL_ISSUE: '发料',
  FINISHED_GOODS_RECEIPT: '成品入库',
  REWORK: '返工',
  RETURN_RECEIPT: '回料',
  RECEIVABLE: '应收',
  PAYABLE: '应付',
  INVOICE: '发票',
  PAYMENT: '收付款',
  RECONCILIATION: '对账',
})

const SOURCE_TYPE_LABELS = Object.freeze({
  SHIPMENT: '出货单',
  PRODUCTION_FACT: '生产记录',
  OUTSOURCING_FACT: '委外记录',
  PURCHASE_RECEIPT: '采购入库',
  SALES_ORDER: '销售订单',
})

const COUNTERPARTY_TYPE_LABELS = Object.freeze({
  CUSTOMER: '客户',
  SUPPLIER: '供应商',
  OTHER: '其他',
})

const FINANCE_COLUMN_KEYS_BY_FACT_TYPE = Object.freeze({
  RECEIVABLE: Object.freeze([
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
    'collection_type',
    'payment_term',
  ]),
  PAYABLE: Object.freeze([
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
  ]),
  INVOICE: Object.freeze([
    'counterparty',
    'amount',
    'currency',
    'invoice_category',
  ]),
  RECONCILIATION: Object.freeze([
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
  ]),
})

const FINANCE_COUNTERPARTY_COLUMN_TITLES = Object.freeze({
  RECEIVABLE: '客户',
  PAYABLE: '供应商',
  INVOICE: '客户',
  RECONCILIATION: '往来方',
})

const FINANCE_SETTLEMENT_ACTIONS = Object.freeze({
  RECEIVABLE: Object.freeze({
    label: '结清',
    confirmTitle: '确认结清当前应收记录？',
  }),
  PAYABLE: Object.freeze({
    label: '结清',
    confirmTitle: '确认结清当前应付记录？',
  }),
  RECONCILIATION: Object.freeze({
    label: '完成核对',
    confirmTitle: '确认完成当前对账核对？',
  }),
})

const SUBJECT_TYPE_LABELS = Object.freeze({
  MATERIAL: '物料',
  PRODUCT: '产品',
  PRODUCT_SKU: '产品规格',
  PROCESS: '工序',
  OTHER: '其他业务',
})

function readableRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `${label}已关联`
}

function safeRefText(label, value) {
  return readableRef(label, value)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function sourceDocumentRef(record = {}) {
  const sourceNo =
    normalizeText(record.source_no) ||
    normalizeText(record.source_document_no) ||
    normalizeText(record.document_no)
  return sourceNo || '来源单据已关联'
}

function sourceColumnText(record = {}) {
  if (!record.source_type) return ''
  return `${sourceTypeLabel(record.source_type)} / ${sourceDocumentRef(record)}`
}

function subjectColumnText(record = {}) {
  return safeRefText(
    SUBJECT_TYPE_LABELS[record.subject_type] || '业务记录',
    record.subject_id || record.product_id
  )
}

function stockContextText(record = {}) {
  return [
    safeRefText('仓库', record.warehouse_id),
    safeRefText('批次', record.lot_id),
    safeRefText('单位', record.unit_id),
  ].join(' / ')
}

function supplierColumnText(record = {}) {
  return record.supplier_name || safeRefText('供应商', record.supplier_id)
}

function customerColumnText(record = {}) {
  return record.customer_snapshot || safeRefText('客户', record.customer_id)
}

function counterpartyColumnText(record = {}) {
  if (!record.counterparty_type) return '-'
  const fallback = safeRefText('往来方', record.counterparty_id)
  if (fallback === '-') return fallback
  const label = counterpartyTypeLabel(record.counterparty_type)
  return label === '往来方' ? fallback : `${label}已关联`
}

function factTypeLabel(value) {
  return FACT_TYPE_LABELS[value] || (value ? '业务记录' : '-')
}

export function sourceTypeLabel(value) {
  return SOURCE_TYPE_LABELS[value] || '来源'
}

function counterpartyTypeLabel(value) {
  return COUNTERPARTY_TYPE_LABELS[value] || '往来方'
}

function normalizeFinanceFactType(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

export function financeSettlementActionFor(factType) {
  return FINANCE_SETTLEMENT_ACTIONS[normalizeFinanceFactType(factType)] || null
}

export function buildOperationalFactViewConfigs() {
  return {
    production: {
      title: '生产记录',
      listKey: 'production_facts',
      list: listProductionFacts,
      post: postProductionFact,
      cancel: cancelProductionFact,
      postPermissions: ACTION_PERMISSIONS.productionPost,
      cancelPermissions: ACTION_PERMISSIONS.productionCancel,
      dateOptions: OCCURRED_DATE_FILTER_OPTIONS,
      defaultDateField: 'occurred_at',
    },
    outsourcing: {
      title: '委外记录',
      listKey: 'outsourcing_facts',
      list: listOutsourcingFacts,
      post: postOutsourcingFact,
      cancel: cancelOutsourcingFact,
      readPermissions: ACTION_PERMISSIONS.outsourcingRead,
      postPermissions: ACTION_PERMISSIONS.outsourcingPost,
      cancelPermissions: ACTION_PERMISSIONS.outsourcingCancel,
      dateOptions: OCCURRED_DATE_FILTER_OPTIONS,
      defaultDateField: 'occurred_at',
    },
    shipments: {
      title: '出货记录',
      listKey: 'shipments',
      list: listShipments,
      post: shipShipment,
      cancel: cancelShipment,
      writePermissions: ACTION_PERMISSIONS.shipmentWrite,
      postPermissions: ACTION_PERMISSIONS.shipmentPost,
      cancelPermissions: ACTION_PERMISSIONS.shipmentCancel,
      dateOptions: SHIPMENT_DATE_FILTER_OPTIONS,
      defaultDateField: 'planned_ship_at',
    },
    reservations: {
      title: '库存预留',
      listKey: 'stock_reservations',
      list: listStockReservations,
      release: releaseStockReservation,
      releasePermissions: ACTION_PERMISSIONS.reservationRelease,
      dateOptions: RESERVED_DATE_FILTER_OPTIONS,
      defaultDateField: 'reserved_at',
    },
    finance: {
      title: '财务记录',
      listKey: 'finance_facts',
      list: listFinanceFacts,
      post: postFinanceFact,
      settle: settleFinanceFact,
      cancel: cancelFinanceFact,
      dateOptions: OCCURRED_DATE_FILTER_OPTIONS,
      defaultDateField: 'occurred_at',
    },
  }
}

export function buildOperationalFactColumns(activeKey, financeFactType = '') {
  const baseColumns = [
    {
      title: '单号',
      dataIndex:
        activeKey === 'shipments'
          ? 'shipment_no'
          : activeKey === 'reservations'
            ? 'reservation_no'
            : 'fact_no',
      width: 260,
      sortType: 'text',
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'status',
      width: 110,
      sortType: 'text',
      render: statusTag,
    },
  ]

  const quantityColumns = [
    {
      title: '产品 / 材料',
      exportTitle: '产品 / 材料',
      width: 150,
      sortValue: subjectColumnText,
      render: (_, record) => subjectColumnText(record),
      exportValue: subjectColumnText,
    },
    {
      title: '仓库 / 批次 / 单位',
      exportTitle: '仓库 / 批次 / 单位',
      width: 220,
      sortValue: stockContextText,
      render: (_, record) => stockContextText(record),
      exportValue: stockContextText,
    },
    {
      title: '数量',
      exportTitle: '数量',
      dataIndex: 'quantity',
      width: 120,
      sorter: (left, right) =>
        compareOperationalFactDecimalValues(left?.quantity, right?.quantity),
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.quantity),
    },
  ]

  const sourceColumns = [
    {
      title: '来源',
      exportTitle: '来源',
      width: 240,
      sortValue: sourceColumnText,
      render: (_, record) => sourceColumnText(record) || '-',
      exportValue: sourceColumnText,
    },
    {
      title: '日期',
      exportTitle: '日期',
      width: 120,
      sortValue: (record) =>
        Number(
          record.occurred_at ||
            record.planned_ship_at ||
            record.reserved_at ||
            0
        ),
      render: (_, record) =>
        formatUnixDate(
          record.occurred_at || record.planned_ship_at || record.reserved_at
        ),
      exportValue: (record) =>
        formatUnixDate(
          record.occurred_at || record.planned_ship_at || record.reserved_at
        ),
    },
    {
      title: '备注',
      dataIndex: 'note',
      width: 300,
      sortable: false,
    },
  ]

  const normalizedFinanceFactType = normalizeFinanceFactType(financeFactType)
  const financeColumnByKey = {
    counterparty: {
      key: 'counterparty',
      title:
        FINANCE_COUNTERPARTY_COLUMN_TITLES[normalizedFinanceFactType] ||
        '往来方',
      width: 170,
      sortValue: counterpartyColumnText,
      render: (_, record) => counterpartyColumnText(record),
      exportValue: counterpartyColumnText,
    },
    amount: {
      title: '金额',
      exportTitle: '金额',
      dataIndex: 'amount',
      width: 120,
      sorter: (left, right) =>
        compareOperationalFactDecimalValues(left?.amount, right?.amount),
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.amount),
    },
    fee_amount: {
      title: '手续费',
      exportTitle: '手续费',
      dataIndex: 'fee_amount',
      width: 120,
      sorter: (left, right) =>
        compareOperationalFactDecimalValues(
          left?.fee_amount,
          right?.fee_amount
        ),
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.fee_amount),
    },
    currency: {
      title: '币种',
      dataIndex: 'currency',
      width: 90,
      sortType: 'text',
    },
    collection_type: {
      title: '收款分类',
      dataIndex: 'collection_type',
      width: 130,
      sortType: 'text',
      render: (value) =>
        financeCollectionTypeText(value, FINANCE_COLLECTION_TYPE_LABELS),
      exportValue: (record) =>
        financeCollectionTypeText(
          record?.collection_type,
          FINANCE_COLLECTION_TYPE_LABELS
        ),
    },
    payment_term: {
      title: '账期',
      dataIndex: 'payment_term',
      width: 150,
      sortType: 'text',
      render: (_, record) =>
        financePaymentTermText(record, FINANCE_PAYMENT_TERM_LABELS),
      exportValue: (record) =>
        financePaymentTermText(record, FINANCE_PAYMENT_TERM_LABELS),
    },
    invoice_category: {
      title: '发票类别',
      dataIndex: 'invoice_category',
      width: 130,
      sortType: 'text',
      render: (value) =>
        financeInvoiceCategoryText(value, FINANCE_INVOICE_CATEGORY_LABELS),
      exportValue: (record) =>
        financeInvoiceCategoryText(
          record?.invoice_category,
          FINANCE_INVOICE_CATEGORY_LABELS
        ),
    },
  }
  const financeColumnKeys =
    FINANCE_COLUMN_KEYS_BY_FACT_TYPE[normalizedFinanceFactType] ||
    Object.keys(financeColumnByKey)
  const financeColumns = [
    ...baseColumns,
    ...(FINANCE_COLUMN_KEYS_BY_FACT_TYPE[normalizedFinanceFactType]
      ? []
      : [
          {
            title: '类型',
            dataIndex: 'fact_type',
            width: 150,
            sortType: 'text',
            render: factTypeLabel,
            exportValue: (record) => factTypeLabel(record?.fact_type),
          },
        ]),
    ...financeColumnKeys.map((key) => financeColumnByKey[key]),
    {
      title: '取消记录',
      key: 'cancellation',
      width: 320,
      sortable: false,
      render: (_, record) => financeCancelAuditText(record),
      exportValue: financeCancelAuditText,
    },
    ...sourceColumns,
  ]

  const columnsByKey = {
    production: [
      ...baseColumns,
      {
        title: '类型',
        dataIndex: 'fact_type',
        width: 170,
        sortType: 'text',
        render: factTypeLabel,
        exportValue: (record) => factTypeLabel(record?.fact_type),
      },
      ...quantityColumns,
      ...sourceColumns,
    ],
    outsourcing: [
      ...baseColumns,
      {
        title: '类型',
        dataIndex: 'fact_type',
        width: 160,
        sortType: 'text',
        render: factTypeLabel,
        exportValue: (record) => factTypeLabel(record?.fact_type),
      },
      {
        title: '供应商',
        width: 220,
        sortValue: supplierColumnText,
        render: (_, record) => supplierColumnText(record),
        exportValue: supplierColumnText,
      },
      ...quantityColumns,
      ...sourceColumns,
    ],
    shipments: [
      ...baseColumns,
      {
        title: '销售订单',
        dataIndex: 'sales_order_id',
        width: 150,
        sortType: 'number',
        render: (value) => (value ? '销售订单已关联' : '-'),
        exportValue: (record) =>
          record?.sales_order_id ? '销售订单已关联' : '',
      },
      {
        title: '客户',
        dataIndex: 'customer_id',
        width: 240,
        sortValue: customerColumnText,
        render: (_, record) => customerColumnText(record),
        exportValue: customerColumnText,
      },
      {
        title: '行数',
        width: 90,
        sortValue: (record) => record.items?.length || 0,
        render: (_, record) => record.items?.length || 0,
      },
      ...sourceColumns,
    ],
    reservations: [
      ...baseColumns,
      {
        title: '销售订单',
        dataIndex: 'sales_order_id',
        width: 150,
        sortType: 'number',
        render: (value) => (value ? '销售订单已关联' : '-'),
        exportValue: (record) =>
          record?.sales_order_id ? '销售订单已关联' : '',
      },
      ...quantityColumns,
      ...sourceColumns,
    ],
    finance: financeColumns,
  }

  return columnsByKey[activeKey] || []
}

export function buildOperationalFactStats({
  activeRows = [],
  activeTotal = 0,
}) {
  const activeDraftCount = activeRows.filter(
    (item) => item.status === 'DRAFT'
  ).length
  const postedCount = activeRows.filter((item) =>
    ['POSTED', 'SHIPPED', 'SETTLED', 'CONSUMED'].includes(item.status)
  ).length

  return [
    { key: 'total', label: '总记录', value: activeTotal },
    { key: 'current', label: '本页显示', value: activeRows.length },
    { key: 'draft', label: '草稿', value: activeDraftCount },
    { key: 'posted', label: '已生效', value: postedCount },
  ]
}

export function getOperationalFactAttachmentOwnerType(activeKey) {
  return (
    {
      production: 'production_fact',
      outsourcing: 'outsourcing_fact',
      finance: 'finance_fact',
      shipments: 'shipment',
    }[activeKey] || ''
  )
}

export function buildOperationalFactRelatedMenuItems({
  activeKey,
  activeSelectedRow,
  canOpenPath = () => true,
}) {
  if (!activeSelectedRow) return []
  const items = []
  if (
    ['shipments', 'reservations'].includes(activeKey) &&
    activeSelectedRow.sales_order_id &&
    canOpenPath(V1_ROUTE_PATHS.salesOrders)
  ) {
    items.push({ key: 'sales-order', label: '销售订单' })
  }
  if (
    ['production', 'outsourcing', 'shipments'].includes(activeKey) &&
    canOpenPath(V1_ROUTE_PATHS.inventory)
  ) {
    items.push({ key: 'inventory', label: '库存台账' })
  }
  if (activeKey === 'shipments' && canOpenPath(V1_ROUTE_PATHS.receivables)) {
    items.push({ key: 'receivables', label: '应收管理' })
  }
  if (activeKey === 'shipments' && canOpenPath(V1_ROUTE_PATHS.invoices)) {
    items.push({ key: 'invoices', label: '发票管理' })
  }
  const sourceRoute = businessSourceRouteFor(
    activeSelectedRow.source_type,
    activeSelectedRow.source_id
  )
  if (
    ['production', 'outsourcing', 'finance'].includes(activeKey) &&
    sourceRoute &&
    canOpenPath(sourceRoute)
  ) {
    items.push({ key: 'source', label: '来源单据' })
  }
  return items
}
