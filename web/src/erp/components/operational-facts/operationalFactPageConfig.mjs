import {
  cancelFinanceFact,
  cancelOutsourcingFact,
  cancelProductionFact,
  cancelShipment,
  consumeStockReservation,
  createFinanceFact,
  createOutsourcingFact,
  createProductionFact,
  createShipment,
  createStockReservation,
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
import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import {
  ACTION_PERMISSIONS,
  FINANCE_COLLECTION_TYPE_LABELS,
  FINANCE_INVOICE_CATEGORY_LABELS,
  FINANCE_PAYMENT_TERM_LABELS,
  decimalNumber,
  buildFactParams,
  buildFinanceParams,
  buildShipmentParams,
  formatQuantity,
  sourceRouteFor,
  statusTag,
} from './OperationalFactForms.jsx'

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
  '统一承接生产、委外、出货、库存预留和财务事实的最小运行入口。页面只提交动作，库存流水、冲正和状态边界由后端 usecase 处理。'
export const EMPTY_VIEW_OVERRIDES = Object.freeze({})

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
  PRODUCTION_FACT: '生产事实',
  OUTSOURCING_FACT: '委外事实',
  PURCHASE_RECEIPT: '采购入库',
  SALES_ORDER: '销售订单',
})

const COUNTERPARTY_TYPE_LABELS = Object.freeze({
  CUSTOMER: '客户',
  SUPPLIER: '供应商',
  OTHER: '其他',
})

function readableRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `${label}已关联`
}

function factTypeLabel(value) {
  return FACT_TYPE_LABELS[value] || value || '-'
}

function sourceTypeLabel(value) {
  return SOURCE_TYPE_LABELS[value] || value || '来源'
}

function counterpartyTypeLabel(value) {
  return COUNTERPARTY_TYPE_LABELS[value] || value || '往来方'
}

export function buildOperationalFactViewConfigs() {
  return {
    production: {
      title: '生产事实',
      listKey: 'production_facts',
      createLabel: '登记生产事实',
      createPrefix: 'prod',
      draftNumberField: 'fact_no',
      draftNumberPrefix: 'PROD',
      list: listProductionFacts,
      create: createProductionFact,
      post: postProductionFact,
      cancel: cancelProductionFact,
      writePermissions: ACTION_PERMISSIONS.productionWrite,
      buildParams: buildFactParams,
      dateOptions: OCCURRED_DATE_FILTER_OPTIONS,
      defaultDateField: 'occurred_at',
      initialValues: {
        fact_type: 'MATERIAL_ISSUE',
        subject_type: 'MATERIAL',
      },
    },
    outsourcing: {
      title: '委外事实',
      listKey: 'outsourcing_facts',
      createLabel: '登记委外事实',
      createPrefix: 'outsource',
      draftNumberField: 'fact_no',
      draftNumberPrefix: 'OUTF',
      list: listOutsourcingFacts,
      create: createOutsourcingFact,
      post: postOutsourcingFact,
      cancel: cancelOutsourcingFact,
      writePermissions: ACTION_PERMISSIONS.outsourcingWrite,
      buildParams: buildFactParams,
      dateOptions: OCCURRED_DATE_FILTER_OPTIONS,
      defaultDateField: 'occurred_at',
      initialValues: {
        fact_type: 'MATERIAL_ISSUE',
        subject_type: 'MATERIAL',
      },
    },
    shipments: {
      title: '出货事实',
      listKey: 'shipments',
      createLabel: '登记出货单草稿',
      createPrefix: 'shipment',
      draftNumberField: 'shipment_no',
      draftNumberPrefix: 'SHIP',
      list: listShipments,
      create: createShipment,
      post: shipShipment,
      cancel: cancelShipment,
      writePermissions: ACTION_PERMISSIONS.shipmentWrite,
      confirmPermissions: ACTION_PERMISSIONS.shipmentConfirm,
      buildParams: buildShipmentParams,
      dateOptions: SHIPMENT_DATE_FILTER_OPTIONS,
      defaultDateField: 'planned_ship_at',
      initialValues: {},
    },
    reservations: {
      title: '库存预留',
      listKey: 'stock_reservations',
      createLabel: '登记库存预留',
      hideCreateAction: true,
      createPrefix: 'reserve',
      draftNumberField: 'reservation_no',
      draftNumberPrefix: 'RSV',
      list: listStockReservations,
      create: createStockReservation,
      release: releaseStockReservation,
      consume: consumeStockReservation,
      writePermissions: ACTION_PERMISSIONS.reservationWrite,
      confirmPermissions: ACTION_PERMISSIONS.shipmentConfirm,
      dateOptions: RESERVED_DATE_FILTER_OPTIONS,
      defaultDateField: 'reserved_at',
      initialValues: {},
    },
    finance: {
      title: '财务事实',
      listKey: 'finance_facts',
      createLabel: '登记财务事实',
      createPrefix: 'finance',
      draftNumberField: 'fact_no',
      draftNumberPrefix: 'FIN',
      list: listFinanceFacts,
      create: createFinanceFact,
      post: postFinanceFact,
      settle: settleFinanceFact,
      cancel: cancelFinanceFact,
      writePermissions: ACTION_PERMISSIONS.financeWrite,
      buildParams: buildFinanceParams,
      dateOptions: OCCURRED_DATE_FILTER_OPTIONS,
      defaultDateField: 'occurred_at',
      initialValues: {
        fact_type: 'RECEIVABLE',
        counterparty_type: 'CUSTOMER',
        currency: 'CNY',
        fee_amount: '0',
      },
    },
  }
}

export function buildOperationalFactColumns(activeKey) {
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
      title: '对象',
      exportTitle: '对象',
      width: 150,
      sortValue: (record) =>
        `${record.subject_type || 'PRODUCT'}-${
          record.subject_id || record.product_id || ''
        }`,
      render: (_, record) =>
        readableRef(
          record.subject_type || '产品',
          record.subject_id || record.product_id
        ),
      exportValue: (record) =>
        readableRef(
          record.subject_type || '产品',
          record.subject_id || record.product_id
        ),
    },
    {
      title: '仓库 / 批次 / 单位',
      exportTitle: '仓库 / 批次 / 单位',
      width: 220,
      sortValue: (record) =>
        `${record.warehouse_id || ''}-${record.lot_id || ''}-${
          record.unit_id || ''
        }`,
      render: (_, record) =>
        [
          readableRef('仓库', record.warehouse_id),
          readableRef('批次', record.lot_id),
          readableRef('单位', record.unit_id),
        ].join(' / '),
      exportValue: (record) =>
        [
          readableRef('仓库', record.warehouse_id),
          readableRef('批次', record.lot_id),
          readableRef('单位', record.unit_id),
        ].join(' / '),
    },
    {
      title: '数量',
      exportTitle: '数量',
      dataIndex: 'quantity',
      width: 120,
      sortValue: (record) => decimalNumber(record?.quantity),
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.quantity),
    },
  ]

  const sourceColumns = [
    {
      title: '来源',
      exportTitle: '来源',
      width: 240,
      sortValue: (record) =>
        `${record.source_type || ''}-${record.source_id || ''}`,
      render: (_, record) =>
        record.source_type
          ? `${sourceTypeLabel(record.source_type)} / ${readableRef('来源', record.source_id)}`
          : '-',
      exportValue: (record) =>
        record.source_type
          ? `${sourceTypeLabel(record.source_type)} / ${readableRef('来源', record.source_id)}`
          : '',
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
        sortValue: (record) => record.supplier_name || record.supplier_id || '',
        render: (_, record) =>
          record.supplier_name ||
          (record.supplier_id
            ? readableRef('供应商', record.supplier_id)
            : '-'),
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
        sortValue: (record) =>
          record.customer_snapshot || record.customer_id || '',
        render: (_, record) =>
          record.customer_snapshot || (record.customer_id ? '客户已关联' : '-'),
        exportValue: (record) =>
          record?.customer_snapshot ||
          (record?.customer_id ? '客户已关联' : ''),
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
    finance: [
      ...baseColumns,
      {
        title: '类型',
        dataIndex: 'fact_type',
        width: 150,
        sortType: 'text',
        render: factTypeLabel,
        exportValue: (record) => factTypeLabel(record?.fact_type),
      },
      {
        title: '往来方',
        width: 170,
        sortValue: (record) =>
          `${record.counterparty_type || ''}-${record.counterparty_id || ''}`,
        render: (_, record) =>
          record.counterparty_type
            ? `${counterpartyTypeLabel(record.counterparty_type)} / ${readableRef('往来方', record.counterparty_id)}`
            : '-',
      },
      {
        title: '金额',
        dataIndex: 'amount',
        width: 120,
        sortValue: (record) => decimalNumber(record?.amount),
      },
      {
        title: '手续费',
        dataIndex: 'fee_amount',
        width: 120,
        sortValue: (record) => decimalNumber(record?.fee_amount),
      },
      { title: '币种', dataIndex: 'currency', width: 90, sortType: 'text' },
      {
        title: '收款分类',
        dataIndex: 'collection_type',
        width: 130,
        sortType: 'text',
        render: (value) =>
          FINANCE_COLLECTION_TYPE_LABELS[value] || value || '-',
      },
      {
        title: '账期',
        dataIndex: 'payment_term',
        width: 150,
        sortType: 'text',
        render: (value, record) => {
          const label = FINANCE_PAYMENT_TERM_LABELS[value] || value || '-'
          return record?.payment_term_days === null ||
            record?.payment_term_days === undefined
            ? label
            : `${label} / ${record.payment_term_days} 天`
        },
      },
      {
        title: '发票类别',
        dataIndex: 'invoice_category',
        width: 130,
        sortType: 'text',
        render: (value) =>
          FINANCE_INVOICE_CATEGORY_LABELS[value] || value || '-',
      },
      ...sourceColumns,
    ],
  }

  return columnsByKey[activeKey] || []
}

export function buildOperationalFactStats({
  activeRows = [],
  activeSelectedRow,
  activeTotal = 0,
}) {
  const activeDraftCount = activeRows.filter(
    (item) => item.status === 'DRAFT'
  ).length
  const postedCount = activeRows.filter((item) =>
    ['POSTED', 'SHIPPED', 'SETTLED', 'CONSUMED'].includes(item.status)
  ).length
  const activeCancelledCount = activeRows.filter((item) =>
    ['CANCELLED', 'RELEASED'].includes(item.status)
  ).length

  return [
    { key: 'total', label: '总记录', value: activeTotal },
    { key: 'current', label: '当前结果', value: activeRows.length },
    { key: 'draft', label: '草稿', value: activeDraftCount },
    { key: 'posted', label: '已生效', value: postedCount },
    { key: 'closed', label: '已取消/释放', value: activeCancelledCount },
    { key: 'selected', label: '已选记录', value: activeSelectedRow ? 1 : 0 },
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
}) {
  if (!activeSelectedRow) return []
  const items = []
  if (
    ['shipments', 'reservations'].includes(activeKey) &&
    activeSelectedRow.sales_order_id
  ) {
    items.push({ key: 'sales-order', label: '销售订单' })
  }
  if (
    ['production', 'outsourcing', 'shipments', 'reservations'].includes(
      activeKey
    )
  ) {
    items.push({ key: 'inventory', label: '库存台账' })
  }
  if (activeKey === 'shipments') {
    items.push({ key: 'receivables', label: '应收管理' })
    items.push({ key: 'invoices', label: '发票管理' })
  }
  if (
    activeKey === 'finance' &&
    sourceRouteFor(activeSelectedRow.source_type)
  ) {
    items.push({ key: 'source', label: '来源单据' })
  }
  return items
}
