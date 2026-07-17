import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, Space, Table, Tag } from 'antd'

import {
  OUTSOURCING_RETURN_QUALITY_GATE_STATES,
  resolveOutsourcingReturnQualityGate,
} from '../../utils/qualityInspectionSourceAction.mjs'
import { outsourcingFactProductSKUText } from '../../utils/outsourcingFactDisplay.mjs'

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  POSTED: 'blue',
  CANCELLED: 'red',
})

function statusTag(value) {
  const status = String(value || '').toUpperCase()
  return (
    <Tag color={STATUS_COLORS[status] || 'default'}>
      {STATUS_LABELS[status] || '业务状态'}
    </Tag>
  )
}

function formatDateTime(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000))
}

function qualityInspectionsForFact(qualityInspectionByFactID, factID) {
  const value =
    qualityInspectionByFactID?.[String(factID)] ||
    qualityInspectionByFactID?.[factID]
  return Array.isArray(value) ? value : value ? [value] : []
}

function qualityGateTag(gate) {
  const colors = {
    [OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED]: 'green',
    [OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING]: 'gold',
    [OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED]: 'red',
  }
  return <Tag color={colors[gate.state] || 'default'}>{gate.label}</Tag>
}

export default function OutsourcingReturnRecordsModal({
  open,
  order,
  facts = [],
  loading = false,
  canCreatePayable = false,
  canViewPayable = false,
  canCreateQualityInspection = false,
  canViewQualityInspection = false,
  qualityInspectionByFactID = {},
  onCancel,
  onCreateQualityInspection,
  onViewQualityInspection,
  onGeneratePayable,
  onViewPayable,
}) {
  const [selected, setSelected] = useState(null)
  const returnFacts = useMemo(
    () =>
      (Array.isArray(facts) ? facts : []).filter(
        (fact) =>
          String(fact?.fact_type || '').toUpperCase() === 'RETURN_RECEIPT'
      ),
    [facts]
  )

  useEffect(() => {
    if (!open) {
      setSelected(null)
      return
    }
    setSelected((current) =>
      current?.id
        ? returnFacts.find((fact) => fact.id === current.id) || null
        : null
    )
  }, [open, order?.id, returnFacts])

  const selectedPosted =
    String(selected?.status || '').toUpperCase() === 'POSTED'
  const selectedQualityInspections = selected?.id
    ? qualityInspectionsForFact(qualityInspectionByFactID, selected.id)
    : []
  const hasActiveQualityInspection = selectedQualityInspections.some(
    (inspection) =>
      String(inspection?.status || '').toUpperCase() !== 'CANCELLED'
  )
  const selectedQualityInspection =
    selectedQualityInspections.find(
      (inspection) =>
        String(inspection?.status || '').toUpperCase() !== 'CANCELLED'
    ) || selectedQualityInspections[0]
  const selectedQualityGate = resolveOutsourcingReturnQualityGate(
    selectedQualityInspections
  )
  const selectedPayableEligible =
    selectedPosted &&
    selectedQualityGate.state ===
      OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED
  const columns = [
    {
      title: '回货单号',
      dataIndex: 'fact_no',
      width: 180,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: statusTag,
    },
    {
      title: '质检状态',
      key: 'quality_gate',
      width: 120,
      render: (_value, fact) =>
        qualityGateTag(
          resolveOutsourcingReturnQualityGate(
            qualityInspectionsForFact(qualityInspectionByFactID, fact?.id)
          )
        ),
    },
    {
      title: '回货数量',
      dataIndex: 'quantity',
      width: 120,
    },
    {
      title: '产品规格',
      key: 'product_sku',
      width: 180,
      render: (_value, fact) => outsourcingFactProductSKUText(fact),
    },
    {
      title: '发生时间',
      dataIndex: 'occurred_at',
      width: 170,
      render: formatDateTime,
    },
    {
      title: '备注',
      dataIndex: 'note',
      width: 240,
    },
  ]

  return (
    <Modal
      title={`相关回货记录 · ${order?.outsourcing_order_no || '当前委外订单'}`}
      open={open}
      width={900}
      footer={
        <Space wrap>
          {canCreateQualityInspection ? (
            <Button
              disabled={
                !selectedPosted || hasActiveQualityInspection || loading
              }
              onClick={() => onCreateQualityInspection?.(selected)}
            >
              {hasActiveQualityInspection ? '已发起质检' : '发起质检'}
            </Button>
          ) : null}
          {canViewQualityInspection && selectedQualityInspection ? (
            <Button
              onClick={() =>
                onViewQualityInspection?.(selectedQualityInspection)
              }
            >
              {['DRAFT', 'SUBMITTED'].includes(
                String(selectedQualityInspection.status || '').toUpperCase()
              )
                ? '继续质检'
                : '查看质检'}
            </Button>
          ) : null}
          {canViewPayable ? (
            <Button
              disabled={!selectedPosted}
              onClick={() => onViewPayable?.(selected)}
            >
              查看应付
            </Button>
          ) : null}
          {canCreatePayable ? (
            <Button
              type="primary"
              disabled={!selectedPayableEligible || loading}
              onClick={() => onGeneratePayable?.(selected)}
            >
              生成应付
            </Button>
          ) : null}
          <Button onClick={onCancel}>关闭</Button>
        </Space>
      }
      destroyOnHidden
      onCancel={onCancel}
    >
      <Alert
        type="info"
        showIcon
        message="已过账回货需先完成质检，判定合格或让步接收后才能生成应付；待检产品或材料、仓库、批次，以及应付供应商、金额和币种，均由系统根据本次回货确定。"
        style={{ marginBottom: 12 }}
      />
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={returnFacts}
        loading={loading}
        pagination={false}
        scroll={{ x: 1110 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_keys, rows) => setSelected(rows[0] || null),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        locale={{ emptyText: '暂无委外回货记录' }}
      />
    </Modal>
  )
}
