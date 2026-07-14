import React from 'react'
import { Tag } from 'antd'

import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

export const BOM_MODULE_KEY = 'material-bom'

export const BOM_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已激活', value: 'ACTIVE' },
  { label: '历史版本', value: 'ARCHIVED' },
]

export const BOM_STATUS_LABELS = {
  DRAFT: '草稿',
  ACTIVE: '已激活',
  ARCHIVED: '历史版本',
}

const BOM_STATUS_COLORS = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  ARCHIVED: 'default',
}

export function bomStatusText(status) {
  const key = String(status || '')
    .trim()
    .toUpperCase()
  return BOM_STATUS_LABELS[key] || (key ? 'BOM 状态' : '-')
}

function bomStatusTag(status) {
  const key = String(status || '')
    .trim()
    .toUpperCase()
  return (
    <Tag color={BOM_STATUS_COLORS[key] || 'default'}>{bomStatusText(key)}</Tag>
  )
}

export function buildBOMVersionColumns({ productOptions = [] }) {
  return applyBusinessColumnSorters([
    {
      title: '产品',
      exportTitle: '产品',
      dataIndex: 'product_id',
      width: 180,
      sortType: 'number',
      sorter: (a, b) => Number(a?.product_id || 0) - Number(b?.product_id || 0),
      render: (value) => referenceLabel(productOptions, value, '产品'),
      exportValue: (record) =>
        referenceLabel(productOptions, record?.product_id, '产品'),
    },
    {
      title: 'BOM 版本',
      exportTitle: 'BOM 版本',
      dataIndex: 'version',
      width: 180,
      sorter: (a, b) =>
        String(a?.version || '').localeCompare(String(b?.version || '')),
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'status',
      width: 110,
      sortValue: (record) => bomStatusText(record.status),
      render: bomStatusTag,
      exportValue: (record) => bomStatusText(record.status),
    },
    {
      title: '来源订单号',
      exportTitle: '来源订单号',
      dataIndex: 'source_order_no',
      width: 150,
      sorter: (a, b) =>
        String(a?.source_order_no || '').localeCompare(
          String(b?.source_order_no || '')
        ),
      render: (value) => value || '-',
    },
    {
      title: '设计师',
      exportTitle: '设计师',
      dataIndex: 'designer',
      width: 110,
      sorter: (a, b) =>
        String(a?.designer || '').localeCompare(String(b?.designer || '')),
      render: (value) => value || '-',
    },
    {
      title: '制表日期',
      exportTitle: '制表日期',
      dataIndex: 'print_date',
      width: 130,
      sortType: 'date',
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record.print_date),
    },
    {
      title: '生效开始',
      exportTitle: '生效开始',
      dataIndex: 'effective_from',
      width: 130,
      sortType: 'date',
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record.effective_from),
    },
    {
      title: '生效结束',
      exportTitle: '生效结束',
      dataIndex: 'effective_to',
      width: 130,
      sortType: 'date',
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record.effective_to),
    },
    {
      title: '备注',
      exportTitle: '备注',
      dataIndex: 'note',
      width: 220,
      sortable: false,
      render: (value) => value || '-',
    },
  ])
}
