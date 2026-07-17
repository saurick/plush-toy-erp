import React from 'react'
import { Space, Tag, Typography } from 'antd'

import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import { formatQualityDefectRate } from '../../utils/qualityDefectRate.mjs'
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

export const QUALITY_INSPECTION_TYPE_FILTER_OPTIONS = [
  { label: '全部检验类型', value: '' },
  { label: '采购来料', value: 'INCOMING' },
  { label: '委外回货', value: 'OUTSOURCING_RETURN' },
  { label: '成品检验', value: 'FINISHED_GOODS' },
  { label: '生产分段质检', value: 'PRODUCTION_STAGE' },
]

export const QUALITY_INSPECTION_TYPE_LABELS = Object.freeze({
  INCOMING: '采购来料',
  OUTSOURCING_RETURN: '委外回货',
  FINISHED_GOODS: '成品检验',
  PRODUCTION_STAGE: '生产分段质检',
})

export const QUALITY_PRODUCTION_GATE_LABELS = Object.freeze({
  CUT_PIECE: '裁片检验',
  SHELL: '皮套检验',
  FINISHED_GOODS: '成品检验',
  NEEDLE: '针检',
  SAMPLING: '抽检',
  CUSTOMER_ACCEPTANCE: '客户验货',
})

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

const LOT_STATUS_LABELS = Object.freeze({
  ACTIVE: '可用',
  HOLD: '冻结',
  REJECTED: '不合格',
  DISABLED: '停用',
})

function lotStatusText(status) {
  const key = String(status || '').trim()
  return LOT_STATUS_LABELS[key] || (key ? '批次状态' : '')
}

function qualityStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={QUALITY_STATUS_COLORS[key] || 'default'}>
      {QUALITY_STATUS_LABELS[key] || (key ? '质检状态' : '-')}
    </Tag>
  )
}

function qualityResultTag(result) {
  const key = String(result || '').trim()
  if (!key) return '-'
  return (
    <Tag color={QUALITY_RESULT_COLORS[key] || 'default'}>
      {QUALITY_RESULT_LABELS[key] || '质检结果'}
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

function inspectionTypeLabel(record) {
  const key = String(record?.inspection_type || '').toUpperCase()
  return QUALITY_INSPECTION_TYPE_LABELS[key] || '质量检验'
}

function visibleBusinessText(value) {
  if (value === undefined || value === null) return '—'
  return String(value).trim() || '—'
}

export function productionQualityGateLabel(gateCode) {
  const key = String(gateCode || '')
    .trim()
    .toUpperCase()
  return QUALITY_PRODUCTION_GATE_LABELS[key] || '—'
}

export function isProductionStageQualityInspection(record) {
  return (
    String(record?.inspection_type || '').toUpperCase() ===
      'PRODUCTION_STAGE' ||
    String(record?.source_type || '').toUpperCase() === 'PRODUCTION_WIP'
  )
}

function productionWipProductLabel(record) {
  return `${visibleBusinessText(record?.product_code)} / ${visibleBusinessText(
    record?.product_name
  )}`
}

function productionWipSourceParts(record) {
  return [
    `生产订单：${visibleBusinessText(record?.production_order_no)}`,
    `生产工序：${visibleBusinessText(record?.operation_name)}`,
    `质量关口：${productionQualityGateLabel(record?.gate_code)}`,
  ]
}

function productionWipSubjectParts(record) {
  return [
    productionWipProductLabel(record),
    `在制批次：${visibleBusinessText(record?.wip_batch_no)}`,
    `批次数量：${visibleBusinessText(record?.batch_quantity)}`,
  ]
}

function qualityDefectRateText(record) {
  return formatQualityDefectRate(record)
}

function qualityInspectorText(record) {
  return inspectorLabel(record?.inspector_id)
}

function qualityRemarkText(record) {
  return visibleBusinessText(record?.decision_note)
}

function sourceParts(
  record,
  purchaseReceiptOptions,
  allPurchaseReceiptItemOptions
) {
  const sourceType = String(record?.source_type || '').toUpperCase()
  const sourceNo = String(record?.source_no || '').trim()
  if (isProductionStageQualityInspection(record)) {
    return productionWipSourceParts(record)
  }
  if (sourceType === 'PURCHASE_RECEIPT') {
    return [
      sourceNo ||
        referenceLabel(
          purchaseReceiptOptions,
          record?.purchase_receipt_id,
          '采购入库'
        ),
      referenceLabel(
        allPurchaseReceiptItemOptions,
        record?.purchase_receipt_item_id,
        '入库行'
      ),
    ]
  }
  if (sourceNo) return [sourceNo]
  if (sourceType === 'OUTSOURCING_FACT') {
    return ['委外回货记录已关联']
  }
  if (sourceType === 'SHIPMENT') {
    return ['出货记录已关联']
  }
  return ['业务来源已关联']
}

function subjectLabel(record, materialOptions, productOptions) {
  if (isProductionStageQualityInspection(record)) {
    return productionWipProductLabel(record)
  }
  const subjectType = String(record?.subject_type || '').toUpperCase()
  if (subjectType === 'PRODUCT') {
    return referenceLabel(productOptions, record?.subject_id, '产品')
  }
  return referenceLabel(
    materialOptions,
    record?.material_id || record?.subject_id,
    '材料'
  )
}

function subjectParts(
  record,
  inventoryLotOptions,
  materialOptions,
  productOptions,
  warehouseOptions
) {
  if (isProductionStageQualityInspection(record)) {
    return productionWipSubjectParts(record)
  }
  return [
    subjectLabel(record, materialOptions, productOptions),
    referenceLabel(inventoryLotOptions, record?.inventory_lot_id, '批次'),
    referenceLabel(warehouseOptions, record?.warehouse_id, '仓库'),
    record?.original_lot_status
      ? `原批次状态 ${lotStatusText(record.original_lot_status)}`
      : '',
  ]
}

export function buildQualityInspectionExportColumns({
  allPurchaseReceiptItemOptions = [],
  inventoryLotOptions = [],
  materialOptions = [],
  productOptions = [],
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
        QUALITY_STATUS_LABELS[record?.status] ||
        (record?.status ? '质检状态' : ''),
      render: qualityStatusTag,
    },
    {
      title: '判定',
      exportTitle: '判定',
      dataIndex: 'result',
      width: 120,
      exportValue: (record) =>
        QUALITY_RESULT_LABELS[record?.result] ||
        (record?.result ? '质检结果' : ''),
      render: qualityResultTag,
    },
    {
      title: '估算不良比例',
      exportTitle: '估算不良比例',
      dataIndex: 'defect_rate_percent',
      width: 140,
      sortable: false,
      exportValue: qualityDefectRateText,
      render: (_value, record) => qualityDefectRateText(record),
    },
    {
      title: '检验来源',
      exportTitle: '检验来源',
      dataIndex: 'inspection_type',
      width: 240,
      exportValue: (record) =>
        [
          inspectionTypeLabel(record),
          ...sourceParts(
            record,
            purchaseReceiptOptions,
            allPurchaseReceiptItemOptions
          ),
        ].join(' / '),
    },
    {
      title: '产品 / 材料 / 在制品',
      exportTitle: '产品 / 材料 / 在制品',
      dataIndex: 'subject_type',
      width: 220,
      exportValue: (record) =>
        subjectLabel(record, materialOptions, productOptions),
    },
    {
      title: '仓库',
      exportTitle: '仓库',
      dataIndex: 'warehouse_id',
      width: 110,
      sortType: 'number',
      render: (value, record) =>
        isProductionStageQualityInspection(record)
          ? '—'
          : referenceLabel(warehouseOptions, value, '仓库'),
      exportValue: (record) =>
        isProductionStageQualityInspection(record)
          ? '—'
          : referenceLabel(warehouseOptions, record?.warehouse_id, '仓库'),
    },
    {
      title: '批次',
      exportTitle: '批次',
      dataIndex: 'inventory_lot_id',
      width: 150,
      sortType: 'number',
      render: (value, record) =>
        isProductionStageQualityInspection(record)
          ? '—'
          : referenceLabel(inventoryLotOptions, value, '批次'),
      exportValue: (record) =>
        isProductionStageQualityInspection(record)
          ? '—'
          : referenceLabel(
              inventoryLotOptions,
              record?.inventory_lot_id,
              '批次'
            ),
    },
    {
      title: '原批次状态',
      exportTitle: '原批次状态',
      dataIndex: 'original_lot_status',
      width: 120,
      render: (value, record) =>
        isProductionStageQualityInspection(record)
          ? '—'
          : lotStatusText(value) || '-',
      exportValue: (record) =>
        isProductionStageQualityInspection(record)
          ? '—'
          : lotStatusText(record?.original_lot_status),
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
      render: (_value, record) => qualityInspectorText(record),
      exportValue: qualityInspectorText,
    },
    {
      title: '判定备注',
      exportTitle: '判定备注',
      dataIndex: 'decision_note',
      width: 300,
      render: (_value, record) => qualityRemarkText(record),
      exportValue: qualityRemarkText,
    },
  ]
}

export function buildQualityInspectionDataColumns({
  allPurchaseReceiptItemOptions = [],
  inventoryLotOptions = [],
  materialOptions = [],
  productOptions = [],
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
        QUALITY_STATUS_LABELS[record?.status] ||
        (record?.status ? '质检状态' : ''),
      render: qualityStatusTag,
    },
    {
      title: '判定',
      exportTitle: '判定',
      dataIndex: 'result',
      width: 120,
      exportValue: (record) =>
        QUALITY_RESULT_LABELS[record?.result] ||
        (record?.result ? '质检结果' : ''),
      render: qualityResultTag,
    },
    {
      title: '估算不良比例',
      exportTitle: '估算不良比例',
      dataIndex: 'defect_rate_percent',
      width: 140,
      sortable: false,
      exportValue: qualityDefectRateText,
      render: (_value, record) => qualityDefectRateText(record),
    },
    {
      title: '检验来源',
      exportTitle: '检验来源',
      dataIndex: 'inspection_type',
      width: 240,
      render: (_value, record) =>
        renderStackCell(
          inspectionTypeLabel(record),
          sourceParts(
            record,
            purchaseReceiptOptions,
            allPurchaseReceiptItemOptions
          )
        ),
      exportValue: (record) =>
        [
          inspectionTypeLabel(record),
          ...sourceParts(
            record,
            purchaseReceiptOptions,
            allPurchaseReceiptItemOptions
          ),
        ].join(' / '),
    },
    {
      title: '产品 / 材料 / 在制品',
      exportTitle: '产品 / 材料 / 在制品',
      dataIndex: 'subject_type',
      width: 260,
      render: (_value, record) => {
        const [subject, ...secondary] = subjectParts(
          record,
          inventoryLotOptions,
          materialOptions,
          productOptions,
          warehouseOptions
        )
        return renderStackCell(subject, secondary)
      },
      exportValue: (record) =>
        subjectParts(
          record,
          inventoryLotOptions,
          materialOptions,
          productOptions,
          warehouseOptions
        )
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
          qualityInspectorText(record),
        ]),
      exportValue: (record) =>
        [formatUnixDate(record?.inspected_at), qualityInspectorText(record)]
          .filter(Boolean)
          .join(' / '),
    },
    {
      title: '判定备注',
      exportTitle: '判定备注',
      dataIndex: 'decision_note',
      width: 300,
      render: (_value, record) => qualityRemarkText(record),
      exportValue: qualityRemarkText,
    },
  ])
}
