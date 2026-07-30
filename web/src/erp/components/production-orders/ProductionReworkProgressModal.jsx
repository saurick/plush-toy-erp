import React, { useMemo } from 'react'
import { Alert, Button, Empty, Space, Spin, Table, Tag, Typography } from 'antd'
import { BranchesOutlined } from '@ant-design/icons'

import {
  currentProductionWipOperation,
  positiveSafeInteger,
  productionWipOperationLabel,
  productionWipOrderItem,
  productionWipStatusMeta,
} from '../../utils/productionWipModel.mjs'
import {
  compareNumeric20Scale6Values,
  sumNumeric20Scale6Values,
} from '../../utils/numeric20Scale6.mjs'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'

const { Text } = Typography

function factType(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function completionTotals(facts, batchIDs) {
  const matchingFacts = facts.filter(
    (fact) =>
      factType(fact?.fact_type) === 'FINISHED_GOODS_RECEIPT' &&
      batchIDs.has(Number(fact?.production_wip_batch_id || 0))
  )
  return {
    posted: sumNumeric20Scale6Values(
      matchingFacts
        .filter((fact) => factType(fact?.status) === 'POSTED')
        .map((fact) => fact.quantity)
    ),
    draft: sumNumeric20Scale6Values(
      matchingFacts
        .filter((fact) => factType(fact?.status) === 'DRAFT')
        .map((fact) => fact.quantity)
    ),
  }
}

function progressMeta({
  root,
  activeBatch,
  activeOperation,
  acceptedPackagingQuantity,
  postedQuantity,
  draftQuantity,
}) {
  if (root.status === 'CANCELLED') {
    return {
      key: 'cancelled',
      label: '已撤销',
      color: 'default',
      description: '该笔成品返工尚未开工，已从返工记录办理撤销。',
      pending: false,
    }
  }
  if (
    compareNumeric20Scale6Values(acceptedPackagingQuantity, '0') > 0 &&
    compareNumeric20Scale6Values(
      postedQuantity,
      acceptedPackagingQuantity
    ) >= 0
  ) {
    return {
      key: 'completed',
      label: '补完工已过账',
      color: 'green',
      description: '包装验收批次已全部登记补完工，库存已按完工记录更新。',
      pending: false,
    }
  }
  if (compareNumeric20Scale6Values(postedQuantity, '0') > 0) {
    return {
      key: 'partially-completed',
      label: '部分补完工已过账',
      color: 'blue',
      description: '已有包装验收批次完成过账，其余返工数量仍待继续处理。',
      pending: true,
    }
  }
  if (compareNumeric20Scale6Values(draftQuantity, '0') > 0) {
    return {
      key: 'completion-draft',
      label: '补完工草稿待过账',
      color: 'gold',
      description: '补完工草稿已生成，待业务核对并过账。',
      pending: true,
    }
  }
  if (compareNumeric20Scale6Values(acceptedPackagingQuantity, '0') > 0) {
    return {
      key: 'ready-for-completion',
      label: '待登记补完工',
      color: 'purple',
      description: '包装和质量关口已完成，可按包装验收批次登记补完工。',
      pending: true,
    }
  }

  const status = String(activeBatch?.status || '').trim()
  const operationLabel = productionWipOperationLabel(activeOperation)
  const statusMeta = productionWipStatusMeta(status)
  const descriptionByStatus = {
    PLANNED: `待安排${operationLabel}补制。`,
    IN_PROGRESS: `${operationLabel}正在本厂生产。`,
    OUTSOURCED: `${operationLabel}正在外发加工。`,
    WAITING_QUALITY: `${operationLabel}已完工，待品质检验。`,
    ACCEPTED: `${operationLabel}已检验合格，待转入下道工序。`,
    REJECTED: `${operationLabel}检验不合格，待办理工序返工。`,
    SPLIT: '返工数量已拆分，待继续办理子批次。',
  }
  return {
    key: status.toLowerCase() || 'pending',
    label: statusMeta.label,
    color: statusMeta.color,
    description:
      descriptionByStatus[status] || '返工进度待重新读取后确认。',
    pending: true,
  }
}

export function buildProductionReworkProgressItems({
  aggregate = null,
  facts = [],
  focusReworkFactID = 0,
} = {}) {
  const batches = Array.isArray(aggregate?.batches) ? aggregate.batches : []
  const operations = Array.isArray(aggregate?.operations)
    ? aggregate.operations
    : []
  const factRows = Array.isArray(facts) ? facts : []
  const operationByID = new Map(
    operations.map((operation) => [operation.id, operation])
  )
  const roots = batches.filter(
    (batch) =>
      positiveSafeInteger(batch.origin_rework_fact_id) &&
      !positiveSafeInteger(batch.source_batch_id)
  )

  return roots
    .map((root, index) => {
      const originFactID = root.origin_rework_fact_id
      const lineage = batches.filter(
        (batch) => batch.origin_rework_fact_id === originFactID
      )
      const activeBatch =
        [...lineage]
          .reverse()
          .find(
            (batch) => !['SPLIT', 'CANCELLED'].includes(batch.status)
          ) || root
      const activeOperation =
        operationByID.get(activeBatch.production_order_operation_id) ||
        currentProductionWipOperation(aggregate, activeBatch)
      const acceptedPackagingBatches = lineage.filter((batch) => {
        const operation = operationByID.get(
          batch.production_order_operation_id
        )
        return (
          operation?.operation_code === 'PACKAGING' &&
          batch.status === 'ACCEPTED'
        )
      })
      const acceptedPackagingQuantity = sumNumeric20Scale6Values(
        acceptedPackagingBatches.map((batch) => batch.quantity)
      )
      const totals = completionTotals(
        factRows,
        new Set(acceptedPackagingBatches.map((batch) => batch.id))
      )
      const progress = progressMeta({
        root,
        activeBatch,
        activeOperation,
        acceptedPackagingQuantity,
        postedQuantity: totals.posted,
        draftQuantity: totals.draft,
      })
      const reworkFact = factRows.find(
        (fact) =>
          Number(fact?.id || 0) === originFactID &&
          factType(fact?.fact_type) === 'REWORK'
      )
      const item = productionWipOrderItem(aggregate, root)
      const product =
        [
          item?.product_code_snapshot,
          item?.product_name_snapshot,
          item?.sku_code_snapshot,
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .join(' / ') || '生产产品'
      return Object.freeze({
        key: originFactID,
        focus: originFactID === Number(focusReworkFactID || 0),
        recordLabel:
          String(reworkFact?.fact_no || '').trim() ||
          `第 ${roots.length - index} 笔成品返工`,
        product,
        quantity: root.quantity,
        unit: String(item?.unit_name_snapshot || '').trim(),
        reason:
          String(root.rework_reason || reworkFact?.note || '').trim() ||
          '返工原因待核对',
        operation: productionWipOperationLabel(activeOperation),
        acceptedPackagingQuantity,
        postedQuantity: totals.posted,
        draftQuantity: totals.draft,
        ...progress,
      })
    })
    .sort((left, right) => {
      if (left.focus !== right.focus) return left.focus ? -1 : 1
      return right.key - left.key
    })
}

export default function ProductionReworkProgressModal({
  open,
  order,
  aggregate = null,
  facts = [],
  focusReworkFactID = 0,
  loading = false,
  onCancel,
  onContinue,
}) {
  const progressItems = useMemo(
    () =>
      buildProductionReworkProgressItems({
        aggregate,
        facts,
        focusReworkFactID,
      }),
    [aggregate, facts, focusReworkFactID]
  )
  const hasPending = progressItems.some((item) => item.pending)
  const columns = [
    {
      title: '返工记录',
      dataIndex: 'recordLabel',
      width: 190,
      render: (value, item) => (
        <Space size={4} wrap>
          <span>{value}</span>
          {item.focus ? <Tag color="blue">当前记录</Tag> : null}
        </Space>
      ),
    },
    {
      title: '产品与返工数量',
      key: 'product',
      width: 260,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <span>{item.product}</span>
          <Text type="secondary">
            {item.quantity}
            {item.unit ? ` ${item.unit}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: '当前环节',
      dataIndex: 'operation',
      width: 130,
    },
    {
      title: '进度',
      key: 'progress',
      width: 320,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Tag color={item.color}>{item.label}</Tag>
          <Text type="secondary">{item.description}</Text>
        </Space>
      ),
    },
    {
      title: '返工原因',
      dataIndex: 'reason',
      width: 220,
    },
  ]

  return (
    <BusinessFormModal
      open={open}
      width="min(1160px, calc(100vw - 48px))"
      title="成品返工进度"
      description="从返工记录追踪手工补制、质量关口、包装验收到补完工过账。"
      icon={<BranchesOutlined />}
      footer={
        <Space wrap>
          {hasPending && onContinue ? (
            <Button type="primary" onClick={onContinue}>
              继续办理返工工序
            </Button>
          ) : null}
          <Button onClick={onCancel}>关闭</Button>
        </Space>
      }
      onCancel={onCancel}
      destroyOnHidden
    >
      <Alert
        showIcon
        type="info"
        message={`生产订单 ${order?.order_no || '待核对'} 的成品返工补制独立于原生产批次；订单关闭后仍可继续完成返工工序和补完工。`}
      />
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : progressItems.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前生产订单暂无成品返工进度"
        />
      ) : (
        <Table
          style={{ marginTop: 16 }}
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={progressItems}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      )}
    </BusinessFormModal>
  )
}
