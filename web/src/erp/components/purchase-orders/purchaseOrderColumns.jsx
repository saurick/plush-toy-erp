import React from 'react'
import { Tag } from 'antd'

import {
  PURCHASE_ORDER_STATUS_COLORS,
  PURCHASE_ORDER_STATUS_LABELS,
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
      effectiveFieldKey: 'supplier_snapshot',
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
  ])
}
