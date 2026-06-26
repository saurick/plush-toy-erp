import React from 'react'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Space, Tag } from 'antd'

import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

export const BOM_MODULE_KEY = 'material-bom'

export const BOM_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已激活', value: 'ACTIVE' },
  { label: '历史版本', value: 'ARCHIVED' },
  { label: '已停用', value: 'DISABLED' },
]

export const BOM_STATUS_LABELS = {
  DRAFT: '草稿',
  ACTIVE: '已激活',
  ARCHIVED: '历史版本',
  DISABLED: '已停用',
}

const BOM_STATUS_COLORS = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  ARCHIVED: 'default',
  DISABLED: 'red',
}

function bomStatusTag(status) {
  const key = String(status || '')
    .trim()
    .toUpperCase()
  return (
    <Tag color={BOM_STATUS_COLORS[key] || 'default'}>
      {BOM_STATUS_LABELS[key] || key || '-'}
    </Tag>
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
      sortValue: (record) => BOM_STATUS_LABELS[record.status] || record.status,
      render: bomStatusTag,
      exportValue: (record) =>
        BOM_STATUS_LABELS[record.status] || record.status,
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

export function buildBOMItemColumns({
  activeActionCanEdit = false,
  materialOptions = [],
  onEditItem,
  onRemoveItem,
  unitOptions = [],
}) {
  return [
    {
      title: '材料',
      dataIndex: 'material_id',
      width: 180,
      render: (value) => referenceLabel(materialOptions, value, '材料'),
    },
    { title: '用量', dataIndex: 'quantity', width: 110 },
    {
      title: '单位',
      dataIndex: 'unit_id',
      width: 100,
      render: (value) => referenceLabel(unitOptions, value, '单位'),
    },
    { title: '损耗率', dataIndex: 'loss_rate', width: 110 },
    {
      title: '部位',
      dataIndex: 'position',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '备注',
      dataIndex: 'note',
      width: 180,
      render: (value) => value || '-',
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, item) =>
        activeActionCanEdit ? (
          <Space size={8}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditItem(item)}
            >
              编辑
            </Button>
            <Popconfirm
              title="移除这条 BOM 明细？"
              okText="移除"
              cancelText="取消"
              onConfirm={() => onRemoveItem(item)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                移除
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Tag>只读</Tag>
        ),
    },
  ]
}
