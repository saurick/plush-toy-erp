import React from 'react'
import { Tag } from 'antd'

import {
  PURCHASE_ORDER_STATUS_COLORS,
  PURCHASE_ORDER_STATUS_LABELS,
  formatPaymentCondition,
  formatUnixDate,
  purchaseInvoicePreferenceText,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0)
}

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={PURCHASE_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, PURCHASE_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

export function buildPurchaseOrderColumns({ resolveSupplierName }) {
  return applyBusinessColumnSorters([
    {
      title: '采购单号',
      exportTitle: '采购单号',
      dataIndex: 'purchase_order_no',
      width: 180,
      fixed: 'left',
      sorter: (a, b) => compareText(a?.purchase_order_no, b?.purchase_order_no),
    },
    {
      title: '供应商',
      exportTitle: '供应商',
      dataIndex: 'supplier_id',
      width: 160,
      sortValue: resolveSupplierName,
      render: (_value, record) => resolveSupplierName(record),
      exportValue: (record) => resolveSupplierName(record),
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'lifecycle_status',
      width: 110,
      sortValue: (record) =>
        statusText(record?.lifecycle_status, PURCHASE_ORDER_STATUS_LABELS),
      render: statusTag,
      exportValue: (record) =>
        statusText(record?.lifecycle_status, PURCHASE_ORDER_STATUS_LABELS),
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
      title: '付款条件',
      exportTitle: '付款条件',
      key: 'payment_condition',
      width: 180,
      sorter: (a, b) =>
        compareText(formatPaymentCondition(a), formatPaymentCondition(b)),
      render: (_, record) => formatPaymentCondition(record),
      exportValue: formatPaymentCondition,
    },
    {
      title: '发票要求',
      exportTitle: '发票要求',
      key: 'invoice_preference',
      width: 220,
      sorter: (a, b) =>
        compareText(
          purchaseInvoicePreferenceText(
            a?.invoice_required,
            a?.invoice_category
          ),
          purchaseInvoicePreferenceText(
            b?.invoice_required,
            b?.invoice_category
          )
        ),
      render: (_, record) =>
        purchaseInvoicePreferenceText(
          record?.invoice_required,
          record?.invoice_category
        ),
      exportValue: (record) =>
        purchaseInvoicePreferenceText(
          record?.invoice_required,
          record?.invoice_category
        ),
    },
    {
      title: '下单日期',
      exportTitle: '下单日期',
      dataIndex: 'purchase_date',
      width: 130,
      sorter: (a, b) => compareNumber(a?.purchase_date, b?.purchase_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.purchase_date),
    },
    {
      title: '预计到货日期',
      exportTitle: '预计到货日期',
      dataIndex: 'expected_arrival_date',
      width: 130,
      sorter: (a, b) =>
        compareNumber(a?.expected_arrival_date, b?.expected_arrival_date),
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.expected_arrival_date),
    },
    {
      title: '供应商确认到货日期',
      exportTitle: '供应商确认到货日期',
      dataIndex: 'supplier_confirmed_arrival_date',
      width: 170,
      sorter: (a, b) =>
        compareNumber(
          a?.supplier_confirmed_arrival_date,
          b?.supplier_confirmed_arrival_date
        ),
      render: formatUnixDate,
      exportValue: (record) =>
        formatUnixDate(record?.supplier_confirmed_arrival_date),
    },
    {
      title: '收货地址',
      exportTitle: '收货地址',
      dataIndex: 'delivery_address',
      width: 320,
      sorter: (a, b) => compareText(a?.delivery_address, b?.delivery_address),
      render: (value) => value || '-',
    },
  ])
}
