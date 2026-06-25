import React from 'react'
import { Tag } from 'antd'

import {
  OUTSOURCING_ORDER_STATUS_COLORS,
  OUTSOURCING_ORDER_STATUS_LABELS,
  formatUnixDate,
  formatUnixDateTime,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'

export function renderOutsourcingOrderStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={OUTSOURCING_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, OUTSOURCING_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

export function buildOutsourcingOrderColumns({ resolveSupplierName }) {
  return applyBusinessColumnSorters([
    {
      title: '加工合同号',
      exportTitle: '加工合同号',
      dataIndex: 'outsourcing_order_no',
      width: 180,
      fixed: 'left',
      sortType: 'text',
    },
    {
      title: '加工厂',
      exportTitle: '加工厂',
      dataIndex: 'supplier_id',
      width: 180,
      sortValue: resolveSupplierName,
      render: (_, record) => resolveSupplierName(record),
      exportValue: resolveSupplierName,
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'lifecycle_status',
      width: 110,
      sortValue: (record) =>
        statusText(record?.lifecycle_status, OUTSOURCING_ORDER_STATUS_LABELS),
      render: renderOutsourcingOrderStatusTag,
      exportValue: (record) =>
        statusText(record?.lifecycle_status, OUTSOURCING_ORDER_STATUS_LABELS),
    },
    {
      title: '来源订单',
      exportTitle: '来源订单',
      dataIndex: 'source_order_no',
      width: 160,
      sortType: 'text',
      render: (value) => value || '-',
      exportValue: (record) => record?.source_order_no || '',
    },
    {
      title: '下单日期',
      exportTitle: '下单日期',
      dataIndex: 'order_date',
      width: 140,
      render: formatUnixDate,
      sortType: 'number',
      exportValue: (record) => formatUnixDate(record?.order_date),
    },
    {
      title: '预计回货',
      exportTitle: '预计回货',
      dataIndex: 'expected_return_date',
      width: 140,
      render: formatUnixDate,
      sortType: 'number',
      exportValue: (record) => formatUnixDate(record?.expected_return_date),
    },
    {
      title: '备注',
      exportTitle: '备注',
      dataIndex: 'note',
      width: 220,
      render: (value) => value || '-',
      exportValue: (record) => record?.note || '',
    },
    {
      title: '更新时间',
      exportTitle: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
      render: formatUnixDateTime,
      sortType: 'number',
      exportValue: (record) => formatUnixDateTime(record?.updated_at),
    },
  ])
}
