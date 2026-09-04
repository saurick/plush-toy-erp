import React from 'react'
import { Tag } from 'antd'

import {
  SALES_ORDER_ITEM_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  SALES_ORDER_STATUS_LABELS,
  deriveSalesOrderItemAmount,
  formatPaymentCondition,
  formatUnixDate,
  salesOrderFreightTermsText,
  salesOrderTaxModeText,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
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
  return displayOptionalValue(deriveSalesOrderItemAmount(record), fallback)
}

function contactText(snapshot = {}, fallback = '-') {
  const name = snapshot?.name || ''
  const phone = snapshot?.mobile || snapshot?.phone || ''
  return [name, phone].filter(Boolean).join(' / ') || fallback
}

function moneyText(value, currency, fallback = '-') {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  return `${String(currency || '').trim()} ${formatNumeric20Scale6Summary(
    text,
    2
  )}`.trim()
}

function taxTermsText(record = {}) {
  const mode = salesOrderTaxModeText(record.tax_mode)
  const rate = String(record.tax_rate ?? '').trim()
  return rate ? `${mode} / ${rate}%` : mode
}

function quotedFreightText(record = {}, fallback = '-') {
  const terms = String(record.freight_terms || '')
    .trim()
    .toUpperCase()
  if (terms === 'INCLUDED') return '已含在单价'
  return moneyText(record.quoted_freight_amount, record.currency, fallback)
}

function deliveryText(snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {}
  return (
    [source.country_region, source.recipient, source.phone, source.address]
      .filter(Boolean)
      .join(' / ') || '-'
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

function lineStatusTag(status) {
  const key = String(status || '').trim()
  return <Tag>{statusText(key, SALES_ORDER_ITEM_STATUS_LABELS)}</Tag>
}

export function buildSalesOrderColumns() {
  return applyBusinessColumnSorters([
    {
      title: '订单号',
      exportTitle: '订单号',
      dataIndex: 'order_no',
      copyable: true,
      width: 160,
      sorter: (a, b) => compareText(a?.order_no, b?.order_no),
    },
    {
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
      title: '客户订单号',
      exportTitle: '客户订单号',
      dataIndex: 'customer_order_no',
      copyable: true,
      effectiveFieldKey: 'source_no',
      width: 150,
      sorter: (a, b) => compareText(a?.customer_order_no, b?.customer_order_no),
      render: (value) => value || '-',
    },
    {
      title: '业务员 / 跟单人',
      exportTitle: '业务员 / 跟单人',
      dataIndex: 'sales_owner',
      copyable: true,
      width: 140,
      sorter: (a, b) => compareText(a?.sales_owner, b?.sales_owner),
      render: (value) => value || '-',
    },
    {
      title: '联系人',
      exportTitle: '联系人',
      dataIndex: 'contact_snapshot',
      copyable: {
        resolveValue: (value) => contactText(value, ''),
      },
      width: 170,
      sorter: (a, b) =>
        compareText(
          contactText(a?.contact_snapshot),
          contactText(b?.contact_snapshot)
        ),
      render: (value) => contactText(value),
      exportValue: (record) => contactText(record?.contact_snapshot),
    },
    {
      title: '币种',
      exportTitle: '币种',
      dataIndex: 'currency',
      width: 90,
      sorter: (a, b) => compareText(a?.currency, b?.currency),
      render: (value) => value || '-',
    },
    {
      title: '货款金额',
      exportTitle: '货款金额',
      dataIndex: 'goods_amount',
      width: 140,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.goods_amount, b?.goods_amount),
      render: (value, record) => moneyText(value, record?.currency),
      exportValue: (record) =>
        moneyText(record?.goods_amount, record?.currency, ''),
    },
    {
      title: '计税方式 / 税率',
      exportTitle: '计税方式 / 税率',
      key: 'tax_terms',
      width: 200,
      sorter: (a, b) => compareText(taxTermsText(a), taxTermsText(b)),
      render: (_, record) => taxTermsText(record),
      exportValue: taxTermsText,
    },
    {
      title: '税额',
      exportTitle: '税额',
      dataIndex: 'tax_amount',
      width: 130,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.tax_amount, b?.tax_amount),
      render: (value, record) => moneyText(value, record?.currency),
      exportValue: (record) =>
        moneyText(record?.tax_amount, record?.currency, ''),
    },
    {
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
      title: '运费条件',
      exportTitle: '运费条件',
      dataIndex: 'freight_terms',
      width: 150,
      sorter: (a, b) => compareText(a?.freight_terms, b?.freight_terms),
      render: salesOrderFreightTermsText,
      exportValue: (record) =>
        salesOrderFreightTermsText(record?.freight_terms),
    },
    {
      title: '报价运费',
      exportTitle: '报价运费',
      dataIndex: 'quoted_freight_amount',
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
      title: '付款条件',
      exportTitle: '付款条件',
      dataIndex: 'payment_method',
      width: 170,
      sorter: (a, b) =>
        compareText(formatPaymentCondition(a), formatPaymentCondition(b)),
      render: (_, record) => formatPaymentCondition(record),
      exportValue: formatPaymentCondition,
    },
    {
      title: '签约日期',
      exportTitle: '签约日期',
      dataIndex: 'order_date',
      width: 120,
      sorter: (a, b) => compareNumber(a?.order_date, b?.order_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.order_date),
    },
    {
      title: '计划交付日期',
      exportTitle: '计划交付日期',
      dataIndex: 'planned_delivery_date',
      effectiveFieldKey: 'expected_ship_date',
      width: 150,
      sorter: (a, b) =>
        compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
    },
    {
      title: '收货信息',
      exportTitle: '收货信息',
      dataIndex: 'delivery_snapshot',
      width: 360,
      sorter: (a, b) =>
        compareText(
          deliveryText(a?.delivery_snapshot),
          deliveryText(b?.delivery_snapshot)
        ),
      render: deliveryText,
      exportValue: (record) => deliveryText(record?.delivery_snapshot),
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'lifecycle_status',
      width: 120,
      sorter: (a, b) => compareText(a?.lifecycle_status, b?.lifecycle_status),
      render: salesOrderStatusTag,
      exportValue: (record) =>
        statusText(record?.lifecycle_status, SALES_ORDER_STATUS_LABELS),
    },
  ])
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
      title: '订单数量',
      exportTitle: '订单数量',
      dataIndex: 'ordered_quantity',
      width: 120,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.ordered_quantity, b?.ordered_quantity),
    },
    {
      title: '单价',
      exportTitle: '单价',
      dataIndex: 'unit_price',
      width: 100,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(a?.unit_price, b?.unit_price),
      render: (value) => displayOptionalValue(value),
    },
    {
      title: '金额',
      exportTitle: '金额',
      dataIndex: 'amount',
      width: 100,
      sorter: (a, b) =>
        compareNumeric20Scale6Values(
          deriveSalesOrderItemAmount(a),
          deriveSalesOrderItemAmount(b)
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
      exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
    },
    {
      title: '行状态',
      exportTitle: '行状态',
      dataIndex: 'line_status',
      width: 100,
      sorter: (a, b) => compareText(a?.line_status, b?.line_status),
      render: lineStatusTag,
      exportValue: (record) =>
        statusText(record?.line_status, SALES_ORDER_ITEM_STATUS_LABELS),
    },
  ]
}
