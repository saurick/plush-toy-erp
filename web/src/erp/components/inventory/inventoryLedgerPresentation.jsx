import React from 'react'
import { Tag } from 'antd'
import { InventoryLotStatus } from '../../../common/consts/statuses.generated.mjs'
import { materialStockCategoryLabel } from '../../utils/warehouseClassification.mjs'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import {
  formatUnixDate,
  formatUnixDateTime,
} from '../../utils/masterDataOrderView.mjs'
import { businessSourceRouteFor } from '../../utils/businessSourceNavigation.mjs'

export const VIEW_BALANCES = 'balances'

export const VIEW_LOTS = 'lots'

export const VIEW_TXNS = 'txns'

export const VIEW_ITEMS = [
  { key: VIEW_BALANCES, label: '库存余额', children: null },
  { key: VIEW_LOTS, label: '库存批次', children: null },
  { key: VIEW_TXNS, label: '库存变动记录', children: null },
]

export const VIEW_LABELS = Object.freeze({
  [VIEW_BALANCES]: '库存余额',
  [VIEW_LOTS]: '库存批次',
  [VIEW_TXNS]: '库存变动记录',
})

export const SUBJECT_TYPE_OPTIONS = [
  { label: '全部存货类型', value: '' },
  { label: '材料', value: 'MATERIAL' },
  { label: '成品', value: 'PRODUCT' },
]

export const LOT_STATUS_OPTIONS = [
  { label: '全部批次状态', value: '' },
  { label: '可用', value: InventoryLotStatus.ACTIVE },
  { label: '冻结', value: InventoryLotStatus.HOLD },
  { label: '不合格', value: InventoryLotStatus.REJECTED },
  { label: '停用', value: InventoryLotStatus.DISABLED },
]

export const TXN_TYPE_OPTIONS = [
  { label: '全部变动类型', value: '' },
  { label: '入库', value: 'IN' },
  { label: '出库', value: 'OUT' },
  { label: '调增', value: 'ADJUST_IN' },
  { label: '调减', value: 'ADJUST_OUT' },
  { label: '调拨入', value: 'TRANSFER_IN' },
  { label: '调拨出', value: 'TRANSFER_OUT' },
  { label: '撤销调整', value: 'REVERSAL' },
]

export const SOURCE_TYPE_OPTIONS = [
  { label: '全部来源', value: '' },
  { label: '采购入库', value: 'PURCHASE_RECEIPT' },
  { label: '采购退货', value: 'PURCHASE_RETURN' },
  { label: '入库调整', value: 'PURCHASE_RECEIPT_ADJUSTMENT' },
  { label: '出货单', value: 'SHIPMENT' },
  { label: '生产记录', value: 'PRODUCTION_FACT' },
  { label: '委外记录', value: 'OUTSOURCING_FACT' },
]

export const LOT_DATE_FILTER_OPTIONS = [
  { label: '接收日期', value: 'received_at' },
]

export const TXN_DATE_FILTER_OPTIONS = [
  { label: '发生时间', value: 'occurred_at' },
]

const SUBJECT_TYPE_LABELS = Object.freeze({
  MATERIAL: '材料',
  PRODUCT: '成品',
})

const LOT_STATUS_LABELS = Object.freeze({
  [InventoryLotStatus.ACTIVE]: '可用',
  [InventoryLotStatus.HOLD]: '冻结',
  [InventoryLotStatus.REJECTED]: '不合格',
  [InventoryLotStatus.DISABLED]: '停用',
})

const LOT_STATUS_COLORS = Object.freeze({
  [InventoryLotStatus.ACTIVE]: 'green',
  [InventoryLotStatus.HOLD]: 'gold',
  [InventoryLotStatus.REJECTED]: 'red',
  [InventoryLotStatus.DISABLED]: 'default',
})

const TXN_TYPE_LABELS = Object.freeze({
  IN: '入库',
  OUT: '出库',
  ADJUST_IN: '调增',
  ADJUST_OUT: '调减',
  TRANSFER_IN: '调拨入',
  TRANSFER_OUT: '调拨出',
  REVERSAL: '撤销调整',
})

const TXN_TYPE_COLORS = Object.freeze({
  IN: 'green',
  OUT: 'red',
  ADJUST_IN: 'blue',
  ADJUST_OUT: 'orange',
  TRANSFER_IN: 'cyan',
  TRANSFER_OUT: 'purple',
  REVERSAL: 'default',
})

const SOURCE_TYPE_LABELS = Object.freeze(
  Object.fromEntries(
    SOURCE_TYPE_OPTIONS.filter((item) => item.value).map((item) => [
      item.value,
      item.label,
    ])
  )
)

function dash(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function subjectTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return <Tag>{SUBJECT_TYPE_LABELS[key] || '其他存货'}</Tag>
}

export function subjectTypeText(value) {
  const key = String(value || '').trim()
  return SUBJECT_TYPE_LABELS[key] || (key ? '其他存货' : '')
}

function lotStatusTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={LOT_STATUS_COLORS[key] || 'default'}>
      {LOT_STATUS_LABELS[key] || '批次状态'}
    </Tag>
  )
}

function lotStatusText(value) {
  const key = String(value || '').trim()
  return LOT_STATUS_LABELS[key] || (key ? '批次状态' : '')
}

function txnTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={TXN_TYPE_COLORS[key] || 'default'}>
      {TXN_TYPE_LABELS[key] || '库存变动'}
    </Tag>
  )
}

function txnTypeText(value) {
  const key = String(value || '').trim()
  return TXN_TYPE_LABELS[key] || (key ? '库存变动' : '')
}

export function sourceTypeText(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
  if (!key) return ''
  return SOURCE_TYPE_LABELS[key] || '其他来源'
}

function directionTag(value) {
  const direction = Number(value || 0)
  if (direction > 0) return <Tag color="green">增加</Tag>
  if (direction < 0) return <Tag color="red">扣减</Tag>
  return '-'
}

function directionText(value) {
  const direction = Number(value || 0)
  if (direction > 0) return '增加'
  if (direction < 0) return '扣减'
  return ''
}

function formatQuantity(value) {
  const text = String(value ?? '').trim()
  return text || '-'
}

export function linkedBusinessRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `${label}已关联`
}

function formatSourceDocumentRef(record = {}) {
  const sourceNo = String(
    record.source_no ||
      record.document_no ||
      record.order_no ||
      record.receipt_no ||
      record.shipment_no ||
      ''
  ).trim()
  if (sourceNo) return sourceNo
  return sourceTypeText(record.source_type) ? '未提供业务单号' : '-'
}

function relationRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `已关联${label}`
}

export function getRowsFromData(view, data) {
  if (view === VIEW_LOTS) {
    return data.inventory_lots
  }
  if (view === VIEW_TXNS) {
    return data.inventory_txns
  }
  return data.inventory_balances
}

export function selectedLabelFor(view, row) {
  if (!row) return '请先选择一条库存记录'
  if (view === VIEW_LOTS) {
    return `批次 ${row.lot_no || '已登记批次'} / ${
      lotStatusText(row.status) || '-'
    }`
  }
  if (view === VIEW_TXNS) {
    return `库存变动 ${sourceTypeText(row.source_type) || txnTypeText(row.txn_type) || '已记录'}`
  }
  return `库存项已登记 / 批次 ${row.lot_no || (row.lot_id ? '已关联批次' : '-')}`
}

export function canOpenSourceDocument(record = {}) {
  return Boolean(businessSourceRouteFor(record.source_type, record.source_id))
}

export function createInventoryLedgerColumns({
  activeView,
  renderLotReference,
  renderProductSKUReference,
  renderSubjectReference,
  renderSubjectIdentity,
  renderUnitReference,
  renderWarehouseReference,
}) {
  if (activeView === VIEW_LOTS) {
    return [
      {
        defaultPriority: 10,
        title: '批次号',
        dataIndex: 'lot_no',
        copyable: { label: '批次号' },
        detailCopyable: true,
        width: 180,
        render: (value, record) => value || (record.id ? '已登记批次' : '-'),
      },
      {
        defaultPriority: 50,
        title: '存货类型',
        exportTitle: '存货类型',
        dataIndex: 'subject_type',
        width: 110,
        render: (value, record) =>
          value === 'MATERIAL'
            ? materialStockCategoryLabel(record.stock_category)
            : subjectTypeTag(value),
        exportValue: (record) =>
          record?.subject_type === 'MATERIAL'
            ? materialStockCategoryLabel(record.stock_category)
            : subjectTypeText(record?.subject_type),
      },
      {
        align: 'left',
        defaultPriority: 30,
        title: '材料 / 产品',
        dataIndex: 'subject_id',
        copyable: {
          label: '材料或产品',
          resolveValue: (_value, record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        width: 300,
        className: 'erp-product-identity-cell',
        render: renderSubjectIdentity,
        detailValue: (record) =>
          renderSubjectIdentity(record.subject_id, record),
        exportValue: (record) =>
          renderSubjectReference(record?.subject_id, record),
      },
      {
        align: 'left',
        defaultPriority: 40,
        title: '产品规格',
        dataIndex: 'product_sku_id',
        copyable: {
          label: '产品规格',
          resolveValue: (_value, record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        width: 220,
        render: renderProductSKUReference,
        exportValue: (record) =>
          renderProductSKUReference(record?.product_sku_id, record),
      },
      {
        title: '供应商批次',
        dataIndex: 'supplier_lot_no',
        copyable: { label: '供应商批次' },
        detailCopyable: true,
        width: 150,
        render: dash,
      },
      {
        title: '色号',
        dataIndex: 'color_no',
        copyable: { label: '色号' },
        detailCopyable: true,
        width: 110,
        render: dash,
      },
      {
        title: '缸号',
        dataIndex: 'dye_lot_no',
        copyable: { label: '缸号' },
        detailCopyable: true,
        width: 110,
        render: dash,
      },
      {
        title: '生产批次',
        dataIndex: 'production_lot_no',
        copyable: { label: '生产批次' },
        detailCopyable: true,
        width: 140,
        render: dash,
      },
      {
        defaultPriority: 20,
        title: '状态',
        exportTitle: '状态',
        dataIndex: 'status',
        width: 110,
        render: lotStatusTag,
        exportValue: (record) => lotStatusText(record?.status),
      },
      {
        defaultPriority: 60,
        title: '接收日期',
        exportTitle: '接收日期',
        dataIndex: 'received_at',
        width: 140,
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.received_at),
      },
    ]
  }

  if (activeView === VIEW_TXNS) {
    return [
      {
        defaultPriority: 150,
        title: '变动记录',
        dataIndex: 'id',
        width: 130,
        render: (value) => (value ? '已记录' : '-'),
        exportValue: (record) => (record?.id ? '已记录' : ''),
      },
      {
        defaultPriority: 90,
        title: '类型',
        exportTitle: '类型',
        dataIndex: 'txn_type',
        width: 120,
        render: txnTypeTag,
        exportValue: (record) => txnTypeText(record?.txn_type),
      },
      {
        defaultPriority: 40,
        title: '方向',
        exportTitle: '方向',
        dataIndex: 'direction',
        width: 100,
        render: directionTag,
        exportValue: (record) => directionText(record?.direction),
      },
      {
        defaultPriority: 100,
        title: '存货类型',
        exportTitle: '存货类型',
        dataIndex: 'subject_type',
        width: 110,
        render: (value, record) =>
          value === 'MATERIAL'
            ? materialStockCategoryLabel(record.stock_category)
            : subjectTypeTag(value),
        exportValue: (record) =>
          record?.subject_type === 'MATERIAL'
            ? materialStockCategoryLabel(record.stock_category)
            : subjectTypeText(record?.subject_type),
      },
      {
        align: 'left',
        defaultPriority: 20,
        title: '材料 / 产品',
        dataIndex: 'subject_id',
        copyable: {
          label: '材料或产品',
          resolveValue: (_value, record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        width: 300,
        className: 'erp-product-identity-cell',
        render: renderSubjectIdentity,
        detailValue: (record) =>
          renderSubjectIdentity(record.subject_id, record),
        exportValue: (record) =>
          renderSubjectReference(record?.subject_id, record),
      },
      {
        align: 'left',
        defaultPriority: 30,
        title: '产品规格',
        dataIndex: 'product_sku_id',
        copyable: {
          label: '产品规格',
          resolveValue: (_value, record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        width: 220,
        render: renderProductSKUReference,
        exportValue: (record) =>
          renderProductSKUReference(record?.product_sku_id, record),
      },
      {
        defaultPriority: 70,
        title: '仓库',
        dataIndex: 'warehouse_id',
        copyable: {
          label: '仓库',
          resolveValue: (_value, record) =>
            renderWarehouseReference(record?.warehouse_id),
        },
        width: 180,
        render: renderWarehouseReference,
        exportValue: (record) => renderWarehouseReference(record?.warehouse_id),
      },
      {
        defaultPriority: 80,
        title: '批次',
        dataIndex: 'lot_id',
        copyable: {
          label: '批次',
          resolveValue: (_value, record) => renderLotReference(record?.lot_id),
        },
        detailCopyable: true,
        width: 180,
        render: renderLotReference,
        exportValue: (record) => renderLotReference(record?.lot_id),
      },
      {
        align: 'right',
        defaultPriority: 50,
        title: '数量',
        exportTitle: '数量',
        dataIndex: 'quantity',
        width: 120,
        render: formatQuantity,
        exportValue: (record) => formatQuantity(record?.quantity),
      },
      {
        defaultPriority: 60,
        title: '单位',
        dataIndex: 'unit_id',
        width: 130,
        render: renderUnitReference,
        exportValue: (record) => renderUnitReference(record?.unit_id),
      },
      {
        align: 'left',
        defaultPriority: 110,
        title: '来源',
        exportTitle: '来源',
        key: 'source_type_label',
        width: 170,
        render: (_, record) => sourceTypeText(record?.source_type) || '-',
        exportValue: (record) => sourceTypeText(record?.source_type),
      },
      {
        align: 'left',
        defaultPriority: 120,
        title: '来源单据',
        key: 'source_document',
        copyable: {
          label: '来源单据',
          resolveValue: (_value, record) =>
            record?.source_no ||
            record?.source_document_no ||
            record?.document_no ||
            '',
        },
        detailCopyable: true,
        width: 120,
        render: (_, record) => formatSourceDocumentRef(record),
        exportValue: formatSourceDocumentRef,
      },
      {
        defaultPriority: 130,
        title: '来源明细',
        dataIndex: 'source_line_id',
        width: 130,
        render: (value) => relationRef('来源明细', value),
        exportValue: (record) =>
          relationRef('来源明细', record?.source_line_id),
      },
      {
        defaultPriority: 140,
        title: '原库存变动记录',
        dataIndex: 'reversal_of_txn_id',
        width: 130,
        render: (value) => relationRef('原库存变动记录', value),
        exportValue: (record) =>
          relationRef('原库存变动记录', record?.reversal_of_txn_id),
      },
      {
        defaultPriority: 10,
        title: '发生时间',
        exportTitle: '发生时间',
        dataIndex: 'occurred_at',
        width: 170,
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.occurred_at),
      },
      { align: 'left', title: '备注', dataIndex: 'note', width: 300 },
    ]
  }

  return [
    {
      align: 'left',
      defaultPriority: 90,
      title: '库存项',
      dataIndex: 'id',
      width: 130,
      render: (value) => (value ? '已登记库存' : '-'),
      exportValue: (record) => (record?.id ? '已登记库存' : ''),
    },
    {
      defaultPriority: 80,
      title: '存货类型',
      exportTitle: '存货类型',
      dataIndex: 'subject_type',
      width: 110,
      render: (value, record) =>
        value === 'MATERIAL'
          ? materialStockCategoryLabel(record.stock_category)
          : subjectTypeTag(value),
      exportValue: (record) =>
        record?.subject_type === 'MATERIAL'
          ? materialStockCategoryLabel(record.stock_category)
          : subjectTypeText(record?.subject_type),
    },
    {
      align: 'left',
      defaultPriority: 10,
      title: '材料 / 产品',
      dataIndex: 'subject_id',
      copyable: {
        label: '材料或产品',
        resolveValue: (_value, record) =>
          renderSubjectReference(record?.subject_id, record),
      },
      width: 300,
      className: 'erp-product-identity-cell',
      render: renderSubjectIdentity,
      detailValue: (record) => renderSubjectIdentity(record.subject_id, record),
      exportValue: (record) =>
        renderSubjectReference(record?.subject_id, record),
    },
    {
      align: 'left',
      defaultPriority: 20,
      title: '产品规格',
      dataIndex: 'product_sku_id',
      copyable: {
        label: '产品规格',
        resolveValue: (_value, record) =>
          renderProductSKUReference(record?.product_sku_id, record),
      },
      width: 220,
      render: renderProductSKUReference,
      exportValue: (record) =>
        renderProductSKUReference(record?.product_sku_id, record),
    },
    {
      defaultPriority: 30,
      title: '仓库',
      dataIndex: 'warehouse_id',
      copyable: {
        label: '仓库',
        resolveValue: (_value, record) =>
          renderWarehouseReference(record?.warehouse_id),
      },
      width: 180,
      render: renderWarehouseReference,
      exportValue: (record) => renderWarehouseReference(record?.warehouse_id),
    },
    {
      defaultPriority: 70,
      title: '批次',
      dataIndex: 'lot_id',
      copyable: {
        label: '批次',
        resolveValue: (_value, record) => renderLotReference(record?.lot_id),
      },
      detailCopyable: true,
      width: 180,
      render: renderLotReference,
      exportValue: (record) => renderLotReference(record?.lot_id),
    },
    {
      defaultPriority: 45,
      title: '单位',
      dataIndex: 'unit_id',
      width: 130,
      render: renderUnitReference,
      exportValue: (record) => renderUnitReference(record?.unit_id),
    },
    {
      align: 'right',
      defaultPriority: 50,
      title: '当前数量',
      exportTitle: '当前数量',
      dataIndex: 'quantity',
      width: 130,
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.quantity),
    },
    {
      align: 'right',
      defaultPriority: 60,
      title: '已预留',
      exportTitle: '已预留',
      dataIndex: 'active_reserved_quantity',
      width: 130,
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.active_reserved_quantity),
    },
    {
      align: 'right',
      defaultPriority: 40,
      title: (
        <BusinessHelpLabel
          itemKey="available-quantity"
          label="可用量"
          pageKey="inventory"
        />
      ),
      exportTitle: '可用量',
      dataIndex: 'available_quantity',
      width: 130,
      render: formatQuantity,
      exportValue: (record) => formatQuantity(record?.available_quantity),
    },
    ...[
      ['pending_inspection_quantity', '待成品检验'],
      ['pending_packaging_quantity', '待查货包装'],
      ['ready_to_ship_quantity', '可发货数量'],
    ].map(([key, title]) => ({
      title,
      exportTitle: title,
      dataIndex: key,
      width: 130,
      align: 'right',
      defaultPriority: 45,
      render: (value, record) =>
        record.subject_type === 'PRODUCT' ? formatQuantity(value) : '—',
      exportValue: (record) =>
        record.subject_type === 'PRODUCT' ? formatQuantity(record[key]) : '',
    })),
  ]
}
