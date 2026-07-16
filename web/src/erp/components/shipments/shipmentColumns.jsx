import React from 'react'
import { Tag } from 'antd'

import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import { hasFinalShipmentWeight } from '../../utils/shipmentWeight.mjs'

export const SHIPMENTS_MODULE_KEY = 'shipments'

export const SHIPMENT_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已出货', value: 'SHIPPED' },
  { label: '已取消', value: 'CANCELLED' },
]

export const SHIPMENT_DATE_FILTER_OPTIONS = [
  { label: '计划出货日期', value: 'planned_ship_at' },
  { label: '实际出货日期', value: 'shipped_at' },
]

export const SHIPMENT_STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  SHIPPED: '已出货',
  CANCELLED: '已取消',
})

const SHIPMENT_STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  SHIPPED: 'blue',
  CANCELLED: 'red',
})

export function shipmentStatusText(status) {
  const key = String(status || '').trim()
  return SHIPMENT_STATUS_LABELS[key] || (key ? '出货状态' : '-')
}

export function shipmentStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={SHIPMENT_STATUS_COLORS[key] || 'default'}>
      {shipmentStatusText(key)}
    </Tag>
  )
}

export function buildShipmentColumns({ salesOrdersByID }) {
  return applyBusinessColumnSorters([
    {
      title: '出货单号',
      exportTitle: '出货单号',
      dataIndex: 'shipment_no',
      width: 280,
      sortType: 'text',
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'status',
      width: 110,
      sortValue: (record) => shipmentStatusText(record.status),
      render: shipmentStatusTag,
      exportValue: (record) => shipmentStatusText(record?.status),
    },
    {
      title: '销售订单',
      exportTitle: '销售订单',
      dataIndex: 'sales_order_id',
      width: 120,
      sortType: 'number',
      render: (value) => {
        const order = salesOrdersByID.get(Number(value || 0))
        return (
          order?.order_no ||
          order?.customer_order_no ||
          (value ? '已关联订单' : '-')
        )
      },
      exportValue: (record) => {
        const order = salesOrdersByID.get(Number(record?.sales_order_id || 0))
        return (
          order?.order_no ||
          order?.customer_order_no ||
          (record?.sales_order_id ? '已关联订单' : '')
        )
      },
    },
    {
      title: '客户',
      exportTitle: '客户',
      width: 260,
      sortValue: (record) =>
        record.customer_snapshot || (record.customer_id ? '客户已关联' : ''),
      render: (_, record) =>
        record.customer_snapshot || (record.customer_id ? '客户已关联' : '-'),
      exportValue: (record) =>
        record.customer_snapshot || (record.customer_id ? '客户已关联' : ''),
    },
    {
      title: '明细行',
      exportTitle: '明细行',
      hidden: true,
      width: 90,
      sortValue: (record) => record.items?.length || 0,
      render: (_, record) => record.items?.length || 0,
      exportValue: (record) => record.items?.length || 0,
    },
    {
      title: '实际 / 最终总净重（克）',
      exportTitle: '总净重（克）',
      dataIndex: 'total_net_weight_g',
      width: 190,
      sortable: false,
      render: (value, record) => {
        const weight = String(value ?? '').trim()
        if (!weight) {
          if (record?.status === 'DRAFT') return '待确认'
          if (hasFinalShipmentWeight(record?.status)) return '未记录'
          return '-'
        }
        if (hasFinalShipmentWeight(record?.status)) return `最终 ${weight} 克`
        if (record?.status === 'DRAFT') return `实际 ${weight} 克`
        return `${weight} 克`
      },
      exportValue: (record) => String(record?.total_net_weight_g ?? '').trim(),
    },
    {
      title: '计划出货日期 / 实际出货日期',
      exportTitle: '计划出货日期 / 实际出货日期',
      width: 180,
      sortValue: (record) => record.shipped_at || record.planned_ship_at,
      sortType: 'date',
      render: (_, record) =>
        `${formatUnixDate(record.planned_ship_at)} / ${formatUnixDate(
          record.shipped_at
        )}`,
      exportValue: (record) =>
        `${formatUnixDate(record.planned_ship_at)} / ${formatUnixDate(
          record.shipped_at
        )}`,
    },
    {
      title: '备注',
      exportTitle: '备注',
      dataIndex: 'note',
      width: 320,
      sortable: false,
    },
  ])
}
