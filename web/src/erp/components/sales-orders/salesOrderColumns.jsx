import React from 'react'
import { Tag } from 'antd'

import {
  SALES_ORDER_ITEM_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  SALES_ORDER_STATUS_LABELS,
  deriveSalesOrderItemAmount,
  formatPaymentCondition,
  formatUnixDate,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0)
}

function contactText(snapshot = {}) {
  const name = snapshot?.name || ''
  const phone = snapshot?.mobile || snapshot?.phone || ''
  return [name, phone].filter(Boolean).join(' / ') || '-'
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
      width: 160,
      sorter: (a, b) => compareText(a?.order_no, b?.order_no),
    },
    {
      title: '客户',
      exportTitle: '客户',
      dataIndex: 'customer_snapshot',
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
      width: 150,
      sorter: (a, b) => compareText(a?.customer_order_no, b?.customer_order_no),
      render: (value) => value || '-',
    },
    {
      title: '业务员 / 跟单人',
      exportTitle: '业务员 / 跟单人',
      dataIndex: 'sales_owner',
      width: 140,
      sorter: (a, b) => compareText(a?.sales_owner, b?.sales_owner),
      render: (value) => value || '-',
    },
    {
      title: '联系人',
      exportTitle: '联系人',
      dataIndex: 'contact_snapshot',
      width: 170,
      sorter: (a, b) =>
        compareText(
          contactText(a?.contact_snapshot),
          contactText(b?.contact_snapshot)
        ),
      render: contactText,
      exportValue: (record) => contactText(record?.contact_snapshot),
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
      width: 120,
      sorter: (a, b) =>
        compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
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
      sorter: (a, b) => compareNumber(a?.ordered_quantity, b?.ordered_quantity),
    },
    {
      title: '单价',
      exportTitle: '单价',
      dataIndex: 'unit_price',
      width: 100,
      sorter: (a, b) => compareNumber(a?.unit_price, b?.unit_price),
      render: (value) => value || '-',
    },
    {
      title: '金额',
      exportTitle: '金额',
      dataIndex: 'amount',
      width: 100,
      sorter: (a, b) => compareNumber(a?.amount, b?.amount),
      render: (value, record) => deriveSalesOrderItemAmount(record) || '-',
      exportValue: (record) => deriveSalesOrderItemAmount(record) || '',
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
