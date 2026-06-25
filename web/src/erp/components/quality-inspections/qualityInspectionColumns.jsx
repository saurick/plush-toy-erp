import React from 'react'
import { Space, Tag, Typography } from 'antd'

import {
  formatUnixDate,
  formatUnixDateTime,
} from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

const { Text } = Typography

export const QUALITY_INSPECTIONS_MODULE_KEY = 'quality-inspections'

export const QUALITY_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已提交', value: 'SUBMITTED' },
  { label: '合格', value: 'PASSED' },
  { label: '不合格', value: 'REJECTED' },
  { label: '已取消', value: 'CANCELLED' },
]

export const QUALITY_RESULT_FILTER_OPTIONS = [
  { label: '全部结果', value: '' },
  { label: '合格', value: 'PASS' },
  { label: '让步接收', value: 'CONCESSION' },
  { label: '不合格', value: 'REJECT' },
]

export const QUALITY_DATE_FILTER_OPTIONS = [
  { label: '质检日期', value: 'inspected_at' },
]

export const QUALITY_STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  PASSED: '合格',
  REJECTED: '不合格',
  CANCELLED: '已取消',
})

const QUALITY_STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  SUBMITTED: 'gold',
  PASSED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
})

const QUALITY_RESULT_LABELS = Object.freeze({
  PASS: '合格',
  CONCESSION: '让步接收',
  REJECT: '不合格',
})

const QUALITY_RESULT_COLORS = Object.freeze({
  PASS: 'green',
  CONCESSION: 'blue',
  REJECT: 'red',
})

function qualityStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={QUALITY_STATUS_COLORS[key] || 'default'}>
      {QUALITY_STATUS_LABELS[key] || key || '-'}
    </Tag>
  )
}

function qualityResultTag(result) {
  const key = String(result || '').trim()
  if (!key) return '-'
  return (
    <Tag color={QUALITY_RESULT_COLORS[key] || 'default'}>
      {QUALITY_RESULT_LABELS[key] || key}
    </Tag>
  )
}

function renderStackCell(primary, secondaryItems = []) {
  const secondary = secondaryItems
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return (
    <Space direction="vertical" size={0}>
      <span>{primary || '-'}</span>
      {secondary.map((item) => (
        <Text type="secondary" key={item}>
          {item}
        </Text>
      ))}
    </Space>
  )
}

function inspectorLabel(inspectorID) {
  return inspectorID ? '管理员已关联' : '-'
}

export function buildQualityInspectionExportColumns({
  allPurchaseReceiptItemOptions = [],
  inventoryLotOptions = [],
  materialOptions = [],
  purchaseReceiptOptions = [],
  warehouseOptions = [],
}) {
  return [
    {
      title: '质检单号',
      exportTitle: '质检单号',
      dataIndex: 'inspection_no',
      width: 170,
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'status',
      width: 110,
      exportValue: (record) =>
        QUALITY_STATUS_LABELS[record?.status] || record?.status,
      render: qualityStatusTag,
    },
    {
      title: '判定',
      exportTitle: '判定',
      dataIndex: 'result',
      width: 120,
      exportValue: (record) =>
        QUALITY_RESULT_LABELS[record?.result] || record?.result,
      render: qualityResultTag,
    },
    {
      title: '采购入库单',
      exportTitle: '采购入库单',
      dataIndex: 'purchase_receipt_id',
      width: 120,
      sortType: 'number',
      render: (value) =>
        referenceLabel(purchaseReceiptOptions, value, '入库单'),
      exportValue: (record) =>
        referenceLabel(
          purchaseReceiptOptions,
          record?.purchase_receipt_id,
          '入库单'
        ),
    },
    {
      title: '入库行',
      exportTitle: '入库行',
      dataIndex: 'purchase_receipt_item_id',
      width: 110,
      sortType: 'number',
      render: (value) =>
        referenceLabel(allPurchaseReceiptItemOptions, value, '入库行'),
      exportValue: (record) =>
        referenceLabel(
          allPurchaseReceiptItemOptions,
          record?.purchase_receipt_item_id,
          '入库行'
        ),
    },
    {
      title: '材料',
      exportTitle: '材料',
      dataIndex: 'material_id',
      width: 180,
      sortType: 'number',
      render: (value) => referenceLabel(materialOptions, value, '材料'),
      exportValue: (record) =>
        referenceLabel(materialOptions, record?.material_id, '材料'),
    },
    {
      title: '仓库',
      exportTitle: '仓库',
      dataIndex: 'warehouse_id',
      width: 110,
      sortType: 'number',
      render: (value) => referenceLabel(warehouseOptions, value, '仓库'),
      exportValue: (record) =>
        referenceLabel(warehouseOptions, record?.warehouse_id, '仓库'),
    },
    {
      title: '批次',
      exportTitle: '批次',
      dataIndex: 'inventory_lot_id',
      width: 150,
      sortType: 'number',
      render: (value) => referenceLabel(inventoryLotOptions, value, '批次'),
      exportValue: (record) =>
        referenceLabel(inventoryLotOptions, record?.inventory_lot_id, '批次'),
    },
    {
      title: '原批次状态',
      exportTitle: '原批次状态',
      dataIndex: 'original_lot_status',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '检验时间',
      exportTitle: '检验时间',
      dataIndex: 'inspected_at',
      width: 150,
      sortType: 'date',
      render: formatUnixDate,
      exportValue: (record) => formatUnixDate(record?.inspected_at),
    },
    {
      title: '检验员',
      exportTitle: '检验员',
      dataIndex: 'inspector_id',
      width: 100,
      sortType: 'number',
      render: inspectorLabel,
      exportValue: (record) => inspectorLabel(record?.inspector_id),
    },
    {
      title: '创建时间',
      exportTitle: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      sortType: 'date',
      render: formatUnixDateTime,
      exportValue: (record) => formatUnixDateTime(record?.created_at),
    },
    {
      title: '更新时间',
      exportTitle: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
      sortType: 'date',
      render: formatUnixDateTime,
      exportValue: (record) => formatUnixDateTime(record?.updated_at),
    },
    {
      title: '判定备注',
      exportTitle: '判定备注',
      dataIndex: 'decision_note',
      width: 300,
    },
  ]
}

export function buildQualityInspectionDataColumns({
  allPurchaseReceiptItemOptions = [],
  inventoryLotOptions = [],
  materialOptions = [],
  purchaseReceiptOptions = [],
  warehouseOptions = [],
}) {
  return applyBusinessColumnSorters([
    {
      title: '质检单号',
      exportTitle: '质检单号',
      dataIndex: 'inspection_no',
      width: 170,
    },
    {
      title: '状态',
      exportTitle: '状态',
      dataIndex: 'status',
      width: 110,
      exportValue: (record) =>
        QUALITY_STATUS_LABELS[record?.status] || record?.status,
      render: qualityStatusTag,
    },
    {
      title: '判定',
      exportTitle: '判定',
      dataIndex: 'result',
      width: 120,
      exportValue: (record) =>
        QUALITY_RESULT_LABELS[record?.result] || record?.result,
      render: qualityResultTag,
    },
    {
      title: '采购来源',
      exportTitle: '采购来源',
      dataIndex: 'purchase_receipt_id',
      width: 210,
      sortType: 'number',
      render: (_value, record) =>
        renderStackCell(
          referenceLabel(
            purchaseReceiptOptions,
            record?.purchase_receipt_id,
            '入库单'
          ),
          [
            referenceLabel(
              allPurchaseReceiptItemOptions,
              record?.purchase_receipt_item_id,
              '入库行'
            ),
          ]
        ),
      exportValue: (record) =>
        [
          referenceLabel(
            purchaseReceiptOptions,
            record?.purchase_receipt_id,
            '入库单'
          ),
          referenceLabel(
            allPurchaseReceiptItemOptions,
            record?.purchase_receipt_item_id,
            '入库行'
          ),
        ].join(' / '),
    },
    {
      title: '物料批次',
      exportTitle: '物料批次',
      dataIndex: 'inventory_lot_id',
      width: 260,
      sortType: 'number',
      render: (_value, record) =>
        renderStackCell(
          referenceLabel(materialOptions, record?.material_id, '材料'),
          [
            referenceLabel(
              inventoryLotOptions,
              record?.inventory_lot_id,
              '批次'
            ),
            referenceLabel(warehouseOptions, record?.warehouse_id, '仓库'),
            record?.original_lot_status
              ? `原批次状态 ${record.original_lot_status}`
              : '',
          ]
        ),
      exportValue: (record) =>
        [
          referenceLabel(materialOptions, record?.material_id, '材料'),
          referenceLabel(inventoryLotOptions, record?.inventory_lot_id, '批次'),
          referenceLabel(warehouseOptions, record?.warehouse_id, '仓库'),
          record?.original_lot_status
            ? `原批次状态 ${record.original_lot_status}`
            : '',
        ]
          .filter(Boolean)
          .join(' / '),
    },
    {
      title: '检验信息',
      exportTitle: '检验信息',
      dataIndex: 'inspected_at',
      width: 180,
      sortType: 'date',
      render: (_value, record) =>
        renderStackCell(formatUnixDate(record?.inspected_at), [
          record?.inspector_id ? inspectorLabel(record.inspector_id) : '',
        ]),
      exportValue: (record) =>
        [
          formatUnixDate(record?.inspected_at),
          inspectorLabel(record?.inspector_id),
        ]
          .filter(Boolean)
          .join(' / '),
    },
    {
      title: '更新时间',
      exportTitle: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
      sortType: 'date',
      render: formatUnixDateTime,
      exportValue: (record) => formatUnixDateTime(record?.updated_at),
    },
    {
      title: '判定备注',
      exportTitle: '判定备注',
      dataIndex: 'decision_note',
      width: 300,
    },
  ])
}
