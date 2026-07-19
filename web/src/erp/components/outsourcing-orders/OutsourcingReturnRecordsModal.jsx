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

const FACT_TYPE_LABELS = Object.freeze({
  MATERIAL_ISSUE: '委外发料',
  RETURN_RECEIPT: '委外回货',
})

const OUTSOURCING_FACT_TYPES = new Set(Object.keys(FACT_TYPE_LABELS))

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

function normalizedFactType(fact) {
  return String(fact?.fact_type || '').toUpperCase()
}

function normalizedFactStatus(fact) {
  return String(fact?.status || '').toUpperCase()
}

function isPostedReturnReceipt(fact) {
  return (
    normalizedFactType(fact) === 'RETURN_RECEIPT' &&
    normalizedFactStatus(fact) === 'POSTED'
  )
}

export default function OutsourcingReturnRecordsModal({
  open,
  order,
  facts = [],
  loading = false,
  actionLoading = '',
  canPostFact = false,
  canCancelFact = false,
  canCreatePayable = false,
  canViewPayable = false,
  canCreateQualityInspection = false,
  canViewQualityInspection = false,
  qualityInspectionByFactID = {},
  onCancel,
  onPostFact,
  onCancelFact,
  onCreateQualityInspection,
  onViewQualityInspection,
  onGeneratePayable,
  onViewPayable,
}) {
  const [selected, setSelected] = useState(null)
  const orderFacts = useMemo(
    () =>
      (Array.isArray(facts) ? facts : []).filter(
        (fact) => OUTSOURCING_FACT_TYPES.has(normalizedFactType(fact))
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
        ? orderFacts.find((fact) => fact.id === current.id) || null
        : null
    )
  }, [open, order?.id, orderFacts])

  const selectedStatus = normalizedFactStatus(selected)
  const selectedDraft = selectedStatus === 'DRAFT'
  const selectedPosted = selectedStatus === 'POSTED'
  const selectedPostedReturn = isPostedReturnReceipt(selected)
  const selectedQualityInspections = selectedPostedReturn && selected?.id
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
    selectedPostedReturn &&
    selectedQualityGate.state ===
      OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED
  const actionBusy = Boolean(actionLoading)
  const columns = [
    {
      title: '事实单号',
      dataIndex: 'fact_no',
      width: 180,
    },
    {
      title: '业务类型',
      dataIndex: 'fact_type',
      width: 110,
      render: (value) => FACT_TYPE_LABELS[String(value || '').toUpperCase()] || '-',
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
      render: (_value, fact) => {
        if (!isPostedReturnReceipt(fact)) return <Tag>不适用</Tag>
        return qualityGateTag(
          resolveOutsourcingReturnQualityGate(
            qualityInspectionsForFact(qualityInspectionByFactID, fact?.id)
          )
        )
      },
    },
    {
      title: '数量',
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
      title={`委外记录 · ${order?.outsourcing_order_no || '当前委外订单'}`}
      open={open}
      width={980}
      footer={
        <Space wrap>
          {selectedDraft && canPostFact ? (
            <Button
              type="primary"
              loading={actionLoading === `post:${selected.id}`}
              disabled={loading || actionBusy}
              onClick={() => onPostFact?.(selected)}
            >
              过账
            </Button>
          ) : null}
          {selectedDraft && canCancelFact ? (
            <Button
              danger
              loading={actionLoading === `cancel:${selected.id}`}
              disabled={loading || actionBusy}
              onClick={() => onCancelFact?.(selected)}
            >
              作废草稿（库存零变动）
            </Button>
          ) : null}
          {selectedPosted && canCancelFact ? (
            <Button
              danger
              loading={actionLoading === `cancel:${selected.id}`}
              disabled={loading || actionBusy}
              onClick={() => onCancelFact?.(selected)}
            >
              取消过账（恢复至过账前库存）
            </Button>
          ) : null}
          {canCreateQualityInspection ? (
            <Button
              disabled={
                !selectedPostedReturn ||
                hasActiveQualityInspection ||
                loading ||
                actionBusy
              }
              onClick={() => onCreateQualityInspection?.(selected)}
            >
              {hasActiveQualityInspection ? '已发起质检' : '发起质检'}
            </Button>
          ) : null}
          {canViewQualityInspection &&
          selectedPostedReturn &&
          selectedQualityInspection ? (
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
              disabled={!selectedPostedReturn || loading || actionBusy}
              onClick={() => onViewPayable?.(selected)}
            >
              查看应付
            </Button>
          ) : null}
          {canCreatePayable ? (
            <Button
              type="primary"
              disabled={!selectedPayableEligible || loading || actionBusy}
              onClick={() => onGeneratePayable?.(selected)}
            >
              生成应付
            </Button>
          ) : null}
          <Button disabled={actionBusy} onClick={onCancel}>
            关闭
          </Button>
        </Space>
      }
      destroyOnHidden
      onCancel={onCancel}
    >
      <Alert
        type="info"
        showIcon
        message="草稿可过账或作废，作废草稿不会改变库存；已过账记录取消后恢复至过账前库存。只有已过账的委外回货可发起质检，并在判定合格或让步接收后生成应付。"
        style={{ marginBottom: 12 }}
      />
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={orderFacts}
        loading={loading}
        pagination={false}
        scroll={{ x: 1220 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_keys, rows) => setSelected(rows[0] || null),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        locale={{ emptyText: '暂无委外记录' }}
      />
    </Modal>
  )
}
