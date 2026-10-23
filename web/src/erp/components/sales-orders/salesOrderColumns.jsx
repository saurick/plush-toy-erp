import React from 'react'
import { Tag } from 'antd'
import BusinessCellStack from '../business-list/BusinessCellStack.jsx'
import BusinessCopyButton from '../business-list/BusinessCopyButton.jsx'
import {
  resolveBusinessTableCopyLabel,
  resolveBusinessTableCopyText,
} from '../../utils/businessTableCopy.mjs'
import DeliveryInfoCell from '../business-list/DeliveryInfoCell.jsx'

import {
  SALES_ORDER_ITEM_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  SALES_ORDER_STATUS_LABELS,
  formatUnixDate,
  salesOrderFreightTermsText,
  salesOrderTaxModeText,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
import { formatPaymentCondition } from '../../utils/paymentConditions.mjs'
import { deriveSalesOrderItemAmount } from '../../utils/sourceOrderAmounts.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import {
  compareNumeric20Scale6Values,
  formatNumeric20Scale6Summary,
} from '../../utils/numeric20Scale6.mjs'

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0)
}

function displayOptionalValue(value, fallback = '-') {
  const text = String(value ?? '').trim()
  return text === '' ? fallback : text
}

function displaySalesOrderItemAmount(record, fallback = '-') {
  return displayOptionalValue(deriveSalesOrderItemAmount(record, { allowSnapshotFallback: true }), fallback)
}

function contactText(snapshot = {}, fallback = '-') {
  const name = snapshot?.name || ''
  const phone = snapshot?.mobile || snapshot?.phone || ''
  return [name, phone].filter(Boolean).join(' ') || fallback
}

function moneyText(value, currency, fallback = '-') {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  return `${String(currency || '').trim()} ${formatNumeric20Scale6Summary(
    text,
    2
  )}`.trim()
}

function taxTermsText(record = {}, options = {}) {
  const mode = salesOrderTaxModeText(record.tax_mode, options)
  const rate = String(record.tax_rate ?? '').trim()
  return rate ? [mode, `${rate}%`].filter(Boolean).join(' ') : mode
}

function quotedFreightText(record = {}, fallback = '-') {
  const terms = String(record.freight_terms || '')
    .trim()
    .toUpperCase()
  if (terms === 'INCLUDED') return '已含在单价'
  return moneyText(record.quoted_freight_amount, record.currency, fallback)
}

function deliveryText(snapshot = {}, fallback = '-') {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {}
  return (
    [source.country_region, source.recipient, source.phone, source.address]
      .filter(Boolean)
      .join(' ') || fallback
  )
}

function salesOrderStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={SALES_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, SALES_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

function engineeringMaterialStatusLabel(value) {
  return (
    {
      SUBMITTED: '待老板审核',
      BOSS_APPROVED: '待财务审核',
      APPROVED: '已批准采购',
      REJECTED: '已退回工程',
    }[value] || '待工程提交'
  )
}

function lineStatusTag(status) {
  const key = String(status || '').trim()
  return <Tag>{statusText(key, SALES_ORDER_ITEM_STATUS_LABELS)}</Tag>
}

export function buildSalesOrderColumns() {
  return applyBusinessColumnSorters([
    {
      defaultPriority: 10,
      title: '订单号',
      exportTitle: '订单号',
      dataIndex: 'order_no',
      copyable: true,
      detailCopyable: true,
      width: 160,
      sorter: (a, b) => compareText(a?.order_no, b?.order_no),
    },
    {
      align: 'left',
      defaultPriority: 20,
      title: '客户',
      exportTitle: '客户',
      dataIndex: 'customer_snapshot',
      copyable: {
        resolveValue: (value) => value?.name || '',
      },
      width: 180,
      sorter: (a, b) =>
        compareText(a?.customer_snapshot?.name, b?.customer_snapshot?.name),
      render: (value, record) =>
        value?.name || (record.customer_id ? '客户已关联' : '-'),
      exportValue: (record) =>
        record?.customer_snapshot?.name ||
        (record?.customer_id ? '客户已关联' : ''),
    },
    {
      defaultPriority: 90,
      title: '客户订单号',
      exportTitle: '客户订单号',
      dataIndex: 'customer_order_no',
      copyable: true,
      detailCopyable: true,
      effectiveFieldKey: 'source_no',
      width: 150,
      sorter: (a, b) => compareText(a?.customer_order_no, b?.customer_order_no),
      render: (value) => value || '-',
    },
    {
      defaultPriority: 70,
      title: '业务员（跟单人）',
      exportTitle: '业务员（跟单人）',
      dataIndex: 'sales_owner',
      copyable: true,
      width: 140,
      sorter: (a, b) => compareText(a?.sales_owner, b?.sales_owner),
      render: (value) => value || '-',
    },
    {
      align: 'left',
      title: '联系人',
      exportTitle: '联系人',
      dataIndex: 'contact_snapshot',
      defaultPriority: 75,
      copyable: {
        resolveValue: (value) => contactText(value, ''),
      },
      width: 170,
      sorter: (a, b) =>
        compareText(
          contactText(a?.contact_snapshot),
          contactText(b?.contact_snapshot)
        ),
      render: (value) => (
        <BusinessCellStack
          primary={value?.name}
          secondary={value?.mobile || value?.phone}
        />
      ),
      exportValue: (record) => contactText(record?.contact_snapshot, ''),
    },
    {
      defaultPriority: 60,
      title: '币种',
      exportTitle: '币种',
      dataIndex: 'currency',
      width: 90,
      sorter: (a, b) => compareText(a?.currency, b?.currency),
      render: (value) => value || '-',
    },
    {
      align: 'right',
      title: '货款金额',
      exportTitle: '货款金额',
      dataIndex: 'goods_amount',
      defaultHidden: true,
      width: 140,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.goods_amount, b?.goods_amount),
      render: (value, record) => moneyText(value, record?.currency),
      exportValue: (record) =>
        moneyText(record?.goods_amount, record?.currency, ''),
    },
    {
      title: '计税信息',
      exportTitle: '计税信息',
      key: 'tax_terms',
      defaultHidden: true,
      width: 200,
      sorter: (a, b) => compareText(taxTermsText(a), taxTermsText(b)),
      render: (_, record) => taxTermsText(record),
      exportValue: (record) => taxTermsText(record, { emptyText: '' }),
    },
    {
      align: 'right',
      title: '税额',
      exportTitle: '税额',
      dataIndex: 'tax_amount',
      defaultHidden: true,
      width: 130,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.tax_amount, b?.tax_amount),
      render: (value, record) => moneyText(value, record?.currency),
      exportValue: (record) =>
        moneyText(record?.tax_amount, record?.currency, ''),
    },
    {
      align: 'right',
      defaultPriority: 50,
      title: '订单总额',
      exportTitle: '订单总额',
      dataIndex: 'order_total',
      width: 150,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.order_total, b?.order_total),
      render: (value, record) => moneyText(value, record?.currency),
      exportValue: (record) =>
        moneyText(record?.order_total, record?.currency, ''),
    },
    {
      align: 'left',
      title: '运费条件',
      exportTitle: '运费条件',
      dataIndex: 'freight_terms',
      defaultHidden: true,
      width: 150,
      sorter: (a, b) => compareText(a?.freight_terms, b?.freight_terms),
      render: salesOrderFreightTermsText,
      exportValue: (record) =>
        salesOrderFreightTermsText(record?.freight_terms, { emptyText: '' }),
    },
    {
      align: 'right',
      title: '报价运费',
      exportTitle: '报价运费',
      dataIndex: 'quoted_freight_amount',
      defaultHidden: true,
      width: 140,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(
          a?.quoted_freight_amount,
          b?.quoted_freight_amount
        ),
      render: (_, record) => quotedFreightText(record),
      exportValue: (record) => quotedFreightText(record, ''),
    },
    {
      align: 'left',
      title: '付款条件',
      exportTitle: '付款条件',
      dataIndex: 'payment_method',
      width: 170,
      sorter: (a, b) =>
        compareText(formatPaymentCondition(a), formatPaymentCondition(b)),
      render: (_, record) => formatPaymentCondition(record),
      exportValue: (record) => formatPaymentCondition(record, { emptyText: '' }),
    },
    {
      defaultPriority: 100,
      title: '下单日期',
      exportTitle: '下单日期',
      dataIndex: 'order_date',
      width: 120,
      sorter: (a, b) => compareNumber(a?.order_date, b?.order_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.order_date, { emptyText: '' }),
    },
    {
      defaultPriority: 40,
      title: '计划交付日期',
      exportTitle: '计划交付日期',
      dataIndex: 'planned_delivery_date',
      effectiveFieldKey: 'expected_ship_date',
      width: 150,
      sorter: (a, b) =>
        compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.planned_delivery_date, { emptyText: '' }),
    },
    {
      align: 'left',
      title: '收货信息',
      exportTitle: '收货信息',
      dataIndex: 'delivery_snapshot',
      defaultHidden: true,
      width: 360,
      sorter: (a, b) =>
        compareText(
          deliveryText(a?.delivery_snapshot),
          deliveryText(b?.delivery_snapshot)
        ),
      render: (value) => <DeliveryInfoCell snapshot={value} />,
      exportValue: (record) => deliveryText(record?.delivery_snapshot, ''),
    },
    {
      defaultPriority: 80,
      title: '用料审批',
      dataIndex: 'engineering_material_status',
      width: 150,
      render: engineeringMaterialStatusLabel,
      exportValue: (record) =>
        engineeringMaterialStatusLabel(record.engineering_material_status),
    },
    {
      defaultPriority: 30,
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'lifecycle_status',
      width: 120,
      sorter: (a, b) => compareText(a?.lifecycle_status, b?.lifecycle_status),
      render: salesOrderStatusTag,
      exportValue: (record) =>
        statusText(record?.lifecycle_status, SALES_ORDER_STATUS_LABELS, undefined, { emptyText: '' }),
    },
  ])
}

const SALES_ORDER_COLUMN_GROUPS = [
  { keys: ['order_no', 'customer_order_no'], title: '订单编号', width: 220, labels: ['', '客户单号'] },
  { keys: ['customer_snapshot', 'sales_owner'], title: '客户与跟单', width: 200, labels: ['', '跟单'] },
  { keys: ['lifecycle_status', 'engineering_material_status'], title: '订单与用料', width: 190, labels: ['订单', '用料'] },
  { keys: ['order_total', 'currency'], title: '订单总额', width: 150, inline: true },
]

function renderSalesOrderGroupedField(column, record, label) {
  const value = record?.[column.dataIndex]
  const text = String(column.exportValue?.(record) ?? value ?? '').trim()
  if (!text || text === '-' || text === '—') return null
  const content = <>{label ? `${label}：` : ''}{column.render ? column.render(value, record) : value}</>
  const copyText = column.copyable ? resolveBusinessTableCopyText(column, value, record) : ''
  if (!copyText) return content
  return (
    <span className="erp-business-table-copyable-cell" data-copyable-column={column.dataIndex} data-align="left">
      <span className="erp-business-table-copyable-cell__content" title={copyText}>{content}</span>
      <BusinessCopyButton
        className="erp-business-table-copyable-cell__button"
        label={resolveBusinessTableCopyLabel(column)}
        value={copyText}
      />
    </span>
  )
}

// Compose only fields that survived the effective-field policy. The original
// columns remain the source for details, export and per-field copy values.
export function buildSalesOrderListColumns(columns) {
  const groups = SALES_ORDER_COLUMN_GROUPS.map((group) => ({
    ...group,
    members: group.keys.map((key) => columns.find((column) => column.dataIndex === key)).filter(Boolean),
  }))
  return columns.flatMap((column) => {
    const group = groups.find(({ members }) => members.includes(column))
    if (!group || group.members.length < 2) return [column]
    if (column !== group.members[0]) return []
    const [primary, secondary] = group.members
    return [{
      ...primary,
      title: group.title,
      exportTitle: group.title,
      width: group.width,
      sourceColumnKeys: group.members.map((member) => member.dataIndex),
      ...(group.inline ? {} : {
        align: 'left',
        copyable: false,
        render: (_value, record) => (
          <BusinessCellStack
            primary={renderSalesOrderGroupedField(primary, record, group.labels[0])}
            secondary={renderSalesOrderGroupedField(secondary, record, group.labels[1])}
          />
        ),
      }),
      sorter: (left, right, order) => {
        for (const member of group.members) {
          const result = member.sorter?.(left, right, order) || 0
          if (result) return result
        }
        return 0
      },
    }]
  })
}

export function buildSalesOrderExportColumns(listColumns, sourceColumns) {
  return listColumns.flatMap((column) => (column.sourceColumnKeys || [column.dataIndex || column.key])
    .map((key) => sourceColumns.find((source) => (source.dataIndex || source.key) === key))
    .filter(Boolean))
}

export function buildSalesOrderColumnProfile(adminProfile, listColumns) {
  const preferences = adminProfile?.erp_preferences
  const savedOrder = preferences?.column_orders?.['sales-orders']
  if (!Array.isArray(savedOrder) || !savedOrder.length) return adminProfile
  const savedHidden = preferences?.hidden_columns?.['sales-orders'] || []
  const keys = new Map()
  const hidden = []
  for (const column of listColumns) {
    const key = column.dataIndex || column.key
    const members = column.sourceColumnKeys || [key]
    for (const member of members) keys.set(member, key)
    const savedMembers = members.filter((member) => savedOrder.includes(member))
    if (savedMembers.length && savedMembers.every((member) => savedHidden.includes(member))) { hidden.push(key) }
  }
  const order = [...new Set(savedOrder.map((key) => keys.get(key)).filter(Boolean))]
  return {
    ...adminProfile,
    erp_preferences: {
      ...preferences,
      column_orders: { ...preferences.column_orders, 'sales-orders': order },
      hidden_columns: { ...preferences.hidden_columns, 'sales-orders': hidden },
    },
  }
}

export function buildSalesOrderItemColumns() {
  return [
    {
      title: '行号',
      exportTitle: '行号',
      dataIndex: 'line_no',
      width: 80,
      sorter: (a, b) => compareNumber(a?.line_no, b?.line_no),
    },
    {
      title: '产品编号',
      exportTitle: '产品编号',
      dataIndex: 'product_code_snapshot',
      width: 140,
      sorter: (a, b) =>
        compareText(a?.product_code_snapshot, b?.product_code_snapshot),
      render: (value) => value || '-',
    },
    {
      align: 'left',
      title: '产品名称',
      exportTitle: '产品名称',
      dataIndex: 'product_name_snapshot',
      width: 180,
      sorter: (a, b) =>
        compareText(a?.product_name_snapshot, b?.product_name_snapshot),
      render: (value) => value || '-',
    },
    {
      title: '颜色',
      exportTitle: '颜色',
      dataIndex: 'color_snapshot',
      width: 100,
      sorter: (a, b) => compareText(a?.color_snapshot, b?.color_snapshot),
      render: (value) => value || '-',
    },
    {
      align: 'right',
      title: '订单数量',
      exportTitle: '订单数量',
      dataIndex: 'ordered_quantity',
      width: 120,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.ordered_quantity, b?.ordered_quantity),
    },
    {
      align: 'right',
      title: '单价',
      exportTitle: '单价',
      dataIndex: 'unit_price',
      width: 100,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.unit_price, b?.unit_price),
      render: (value) => displayOptionalValue(value),
    },
    {
      align: 'right',
      title: '金额',
      exportTitle: '金额',
      dataIndex: 'amount',
      width: 100,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(
          deriveSalesOrderItemAmount(a, { allowSnapshotFallback: true }),
          deriveSalesOrderItemAmount(b, { allowSnapshotFallback: true })
        ),
      render: (value, record) => displaySalesOrderItemAmount(record),
      exportValue: (record) => displaySalesOrderItemAmount(record, ''),
    },
    {
      title: '计划交付日期',
      exportTitle: '计划交付日期',
      dataIndex: 'planned_delivery_date',
      width: 120,
      sorter: (a, b) =>
        compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.planned_delivery_date, { emptyText: '' }),
    },
    {
      title: '行状态',
      exportTitle: '行状态',
      dataIndex: 'line_status',
      width: 100,
      sorter: (a, b) => compareText(a?.line_status, b?.line_status),
      render: lineStatusTag,
      exportValue: (record) =>
        statusText(record?.line_status, SALES_ORDER_ITEM_STATUS_LABELS, undefined, { emptyText: '' }),
    },
  ]
}
