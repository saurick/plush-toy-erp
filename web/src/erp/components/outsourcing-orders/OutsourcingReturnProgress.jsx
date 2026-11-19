import React, { useEffect, useId, useState } from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Table from '@/common/components/table/AppTable.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { OperationalFactStatus, OutsourcingOrderStatus } from '../../../common/consts/statuses.generated.mjs'
import { listAllOutsourcingFacts } from '../../api/operationalFactApi.mjs'
import { formatUnixDate, formatUnixDateTime, OUTSOURCING_ORDER_STATUS_LABELS } from '../../utils/masterDataOrderView.mjs'
import { OUTSOURCING_SOURCE_ACTIONS } from '../../utils/outsourcingOrderFactAction.mjs'
import { OUTSOURCING_RETURN_QUALITY_GATE_STATES } from '../../utils/qualityInspectionSourceAction.mjs'
import { formatUnitQuantitySummary } from '../../utils/sourceOrderAmounts.mjs'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import BusinessRecordDetails from '../business-list/BusinessRecordDetails.jsx'
import { buildOutsourcingReturnProgress, outsourcingReturnProgressLines } from './outsourcingReturnProgress.mjs'
import './outsourcingReturnProgress.css'

const QUALITY_TONES = {
  [OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED]: 'green',
  [OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING]: 'gold',
  [OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED]: 'red',
}
const UNAVAILABLE_QUALITY_LABELS = {
  loading: '正在读取质检',
  restricted: '质检未授权',
  error: '质检读取失败',
}

function useReturnRecords(orderID, loadQuality, canReadQuality) {
  const [state, setState] = useState({ status: 'loading' })
  const [request, setRequest] = useState(0)
  const reload = () => setRequest((previous) => previous + 1)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function read() {
      setState({ status: 'loading' })
      let data
      try {
        data = await listAllOutsourcingFacts({
          source_type: 'OUTSOURCING_ORDER',
          source_id: orderID,
          fact_type: OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
          status: OperationalFactStatus.POSTED,
        }, { signal })
        if (typeof data.full_warehouse_scope !== 'boolean') {
          throw new Error('无法核对回货记录的仓库范围')
        }
      } catch (error) {
        if (!signal.aborted && !isRpcAbortError(error)) setState({ status: 'error', error })
        return
      }
      if (signal.aborted) return
      const facts = data.outsourcing_facts
      const receivesQuality = canReadQuality && facts.length > 0
      const records = {
        status: 'success',
        facts,
        fullWarehouseScope: data.full_warehouse_scope,
        qualityStatus: canReadQuality ? (receivesQuality ? 'loading' : 'success') : 'restricted',
      }
      setState(records)
      if (receivesQuality) {
        try {
          const qualityByFactID = await loadQuality(facts, { signal })
          if (!signal.aborted) setState({ ...records, qualityStatus: 'success', qualityByFactID })
        } catch (error) {
          if (!signal.aborted && !isRpcAbortError(error)) {
            setState({ ...records, qualityStatus: 'error', qualityError: error })
          }
        }
      }
    }
    read()
    return () => controller.abort()
  }, [orderID, loadQuality, canReadQuality, request])

  return { ...state, reload }
}

function BatchDetails({ batch, id, quantityLabel, close }) {
  const { fact, quality } = batch
  const inspection = quality?.inspection
  const fields = [
    { title: '回货记录号', dataIndex: 'fact_no' },
    { title: '回货入库确认', dataIndex: 'postedAt' },
    ...(fact.posted_by_name ? [{ title: '确认人', dataIndex: 'posted_by_name' }] : []),
    ...(Number(fact.returned_to_vendor_quantity) > 0 ? [
      { title: '原回货数量', dataIndex: 'originalQuantity' },
      { title: '已退回加工厂', dataIndex: 'returnedToVendor' },
    ] : []),
    ...(inspection ? [
      { title: '质检单号', dataIndex: 'inspectionNo' },
      { title: '质检状态', dataIndex: 'inspectionStatus' },
      ...(inspection.inspected_at ? [{ title: '质检时间', dataIndex: 'inspectedAt' }] : []),
      ...(inspection.inspector_name ? [{ title: '检验人', dataIndex: 'inspectorName' }] : []),
    ] : []),
  ]
  const record = {
    ...fact,
    postedAt: formatUnixDateTime(fact.posted_at),
    originalQuantity: quantityLabel(batch, 'quantity'),
    returnedToVendor: quantityLabel(batch, 'returned_to_vendor_quantity'),
    inspectionNo: inspection?.inspection_no,
    inspectionStatus: quality?.label,
    inspectedAt: formatUnixDateTime(inspection?.inspected_at),
    inspectorName: inspection?.inspector_name,
  }
  return (
    <section id={id} aria-label={`回货批次详情 ${fact.fact_no}`}>
      <BusinessRecordDetails columns={fields} record={record} />
      <div className="erp-outsourcing-return-progress__batch-actions">
        <Button size="small" onClick={close}>收起批次</Button>
      </div>
    </section>
  )
}

function ReturnRecords({ order, lines, unitOptions, canReadQuality, loadQuality, hasStageLines }) {
  const data = useReturnRecords(order.id, loadQuality, canReadQuality)
  const [expanded, setExpanded] = useState(null)
  const tableID = useId()

  if (data.status === 'loading') {
    return <div className="erp-outsourcing-return-progress__loading" role="status"><Spin size="small" /> 正在读取回货进度…</div>
  }
  if (data.status === 'error') {
    return <Alert
      type="error"
      showIcon
      message={getActionErrorMessage(data.error, '读取回货进度失败')}
      action={<Button size="small" onClick={data.reload}>重试</Button>}
    />
  }
  const progress = buildOutsourcingReturnProgress(order, lines, data.facts, {
    fullWarehouseScope: data.fullWarehouseScope,
    qualityByFactID: data.qualityByFactID,
    unitOptions,
  })
  const quantityLabel = (batch, field) => formatUnitQuantitySummary([{
    ...batch.fact,
    unit_name_snapshot: batch.unit_name_snapshot,
    effective: batch.effective,
  }], field, unitOptions)
  const batchButtonID = (factID) => `${tableID}-batch-${factID}`
  const batchDetailID = (factID) => `${tableID}-detail-${factID}`
  const focusBatch = (factID) => document.getElementById(batchButtonID(factID))?.focus()
  const columns = [
    {
      title: '回货批次号',
      key: 'batch',
      width: 165,
      render: (_, { fact }) => {
        const label = fact.lot_no || fact.fact_no
        const isExpanded = expanded === fact.id
        return (
          <>
            <Button
              id={batchButtonID(fact.id)}
              type="link"
              size="small"
              aria-expanded={isExpanded}
              aria-controls={isExpanded ? batchDetailID(fact.id) : undefined}
              onClick={() => setExpanded(isExpanded ? null : fact.id)}
            >
              {label}
            </Button>
            {!fact.lot_no && <div className="erp-outsourcing-return-progress__note">批次号未记录</div>}
          </>
        )
      },
    },
    {
      title: '回货日期',
      key: 'date',
      width: 105,
      render: (_, { fact }) => formatUnixDate(fact.occurred_at),
    },
    {
      title: '已回货',
      key: 'returned',
      width: 105,
      align: 'right',
      render: (_, batch) => quantityLabel(batch, 'effective'),
    },
    {
      title: '质检状态',
      key: 'quality',
      width: 125,
      render: (_, { quality }) => quality
        ? <Tag color={QUALITY_TONES[quality.state]}>{quality.label}</Tag>
        : UNAVAILABLE_QUALITY_LABELS[data.qualityStatus],
    },
  ]
  const hasLineDates = lines.some((line) => line.expected_return_date && line.expected_return_date !== order.expected_return_date)
  const { attention } = progress
  const renderExpandedRow = (batch) => (
    <BatchDetails
      batch={batch}
      id={batchDetailID(batch.fact.id)}
      quantityLabel={quantityLabel}
      close={() => {
        setExpanded(null)
        focusBatch(batch.fact.id)
      }}
    />
  )
  const attentionAction = attention && (
    <Button
      type="link"
      size="small"
      onClick={() => {
        setExpanded(attention.fact.id)
        focusBatch(attention.fact.id)
      }}
    >
      查看批次 {attention.fact.lot_no || attention.fact.fact_no}
    </Button>
  )
  return (
    <>
      <dl className="erp-outsourcing-return-progress__metrics">
        <div>
          <dt>预计回货日期</dt>
          <dd>{formatUnixDate(order.expected_return_date, { emptyText: '未设置' })}</dd>
          {hasLineDates && <div className="erp-outsourcing-return-progress__note">部分明细另有回货日期</div>}
        </div>
        <div>
          <dt>{data.fullWarehouseScope ? '已回货' : '可查看已回货'}</dt>
          <dd>{progress.returned}</dd>
          <div className="erp-outsourcing-return-progress__note">合同数量 {progress.planned}</div>
        </div>
        <div>
          <dt>待回货</dt>
          <dd>{progress.remaining}</dd>
          {!data.fullWarehouseScope && <div className="erp-outsourcing-return-progress__note">按仓库权限查看批次</div>}
        </div>
      </dl>

      {attention && (
        <Alert
          type="warning"
          showIcon
          message={`${attention.quality.label} · ${quantityLabel(attention, 'effective')}`}
          description={progress.qualityIssueCount > 1 ? `共有 ${progress.qualityIssueCount} 批需核对质检` : undefined}
          action={attentionAction}
        />
      )}
      {data.qualityStatus === 'error' && (
        <Alert
          type="warning"
          showIcon
          message={getActionErrorMessage(data.qualityError, '读取回货质检失败')}
          action={<Button size="small" onClick={data.reload}>重试</Button>}
        />
      )}
      {data.qualityStatus === 'restricted' && progress.batches.length > 0 &&
        <p className="erp-outsourcing-return-progress__note">当前账号没有查看质检结果的权限</p>}
      {!progress.canReconcile &&
        <p className="erp-outsourcing-return-progress__note">有回货记录与合同明细未匹配，待回数量需核对</p>}
      {hasStageLines &&
        <p className="erp-outsourcing-return-progress__note">此处展示普通回货，工序回货可在生产执行中查看</p>}
      {!attention && order.lifecycle_status !== OutsourcingOrderStatus.CONFIRMED &&
        <p className="erp-outsourcing-return-progress__note">{OUTSOURCING_ORDER_STATUS_LABELS[order.lifecycle_status]}</p>}
      {!attention && progress.hasPendingReturns &&
        <p className="erp-outsourcing-return-progress__note">待加工厂回货 {progress.remaining}</p>}

      {progress.batches.length ? (
        <div aria-label="回货批次" role="region">
          <Table
            columns={columns}
            dataSource={progress.batches}
            size="small"
            rowKey={(batch) => batch.fact.id}
            pagination={false}
            scroll={{ x: 495 }}
            expandable={{
              showExpandColumn: false,
              expandedRowKeys: expanded === null ? [] : [expanded],
              expandedRowRender: renderExpandedRow,
            }}
          />
        </div>
      ) : <Empty description={data.fullWarehouseScope ? '暂无已确认回货批次' : '暂无可查看的回货批次'} />}
    </>
  )
}

export default function OutsourcingReturnProgress({
  order, lineItemsState, unitOptions, canReadQuality, loadQuality, onViewStage,
}) {
  const { status, items } = lineItemsState
  const stageLine = items.find((item) => item.production_wip_batch_id)
  const hasStageLines = Boolean(order.source_wip_batch_id || stageLine)
  const lines = outsourcingReturnProgressLines(order, items)
  if (status === 'success' && !lines.length && !hasStageLines) return null

  return (
    <BusinessFormSection title="回货进度" layout="content">
      <div className="erp-outsourcing-return-progress__body">
        {status === 'error' ? (
          <p className="erp-outsourcing-return-progress__note">请先重试读取合同明细，再核对回货进度</p>
        ) : status !== 'success' ? (
          <div className="erp-outsourcing-return-progress__loading" role="status"><Spin size="small" /> 正在读取合同明细…</div>
        ) : lines.length ? (
          <ReturnRecords
            order={order}
            lines={lines}
            unitOptions={unitOptions}
            canReadQuality={canReadQuality}
            loadQuality={loadQuality}
            hasStageLines={hasStageLines}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="工序委外的回货和质检在对应生产订单的工序中查看"
            action={onViewStage && <Button size="small" onClick={() => onViewStage(stageLine)}>查看生产订单</Button>}
          />
        )}
      </div>
    </BusinessFormSection>
  )
}
