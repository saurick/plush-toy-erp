import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Modal, Table, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  cancelProductionException,
  getProductionException,
  listProductionExceptions,
  reverseProductionException,
} from '../../api/operationalFactApi.mjs'
import {
  executeProductionExceptionProcess,
  findExceptionProcessActiveNode,
  getProductionExceptionApprovalProcess,
  startProductionExceptionApprovalProcess,
} from '../../api/customerConfigApi.mjs'
import ExceptionProcessRecoveryButton from '../workflow/ExceptionProcessRecoveryButton.jsx'
import {
  BusinessActionTooltip,
  BusinessOperationPanel,
  SelectionActionBar,
  SelectionClearAction,
  SelectFilter,
} from '../business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../business-list/BusinessListToolbarActions.jsx'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { resolveProductionExceptionActionAvailability } from '../../utils/operationalActionAvailability.mjs'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'

const TYPE_LABELS = {
  SCRAP: '生产报废',
  OVER_ISSUE: '超领申请',
  WIP_CONCESSION: '在制品让步',
}
const STATUS_LABELS = {
  SUBMITTED: '待审批',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
}
const EXECUTION_LABELS = {
  PENDING: '待业务办理',
  APPLIED: '业务已执行',
  REVERSED: '业务已冲正',
}
const TYPE_FILTER_OPTIONS = [
  { label: '全部异常类型', value: '' },
  { label: TYPE_LABELS.SCRAP, value: 'SCRAP' },
  { label: TYPE_LABELS.OVER_ISSUE, value: 'OVER_ISSUE' },
  { label: TYPE_LABELS.WIP_CONCESSION, value: 'WIP_CONCESSION' },
]
const STATUS_FILTER_OPTIONS = [
  { label: '全部审批状态', value: '' },
  { label: STATUS_LABELS.SUBMITTED, value: 'SUBMITTED' },
  { label: STATUS_LABELS.APPROVED, value: 'APPROVED' },
  { label: STATUS_LABELS.REJECTED, value: 'REJECTED' },
  { label: STATUS_LABELS.CANCELLED, value: 'CANCELLED' },
]
const EXECUTION_FILTER_OPTIONS = [
  { label: '全部业务状态', value: '' },
  { label: '待办理 / 额度生效', value: 'PENDING' },
  { label: EXECUTION_LABELS.APPLIED, value: 'APPLIED' },
  { label: EXECUTION_LABELS.REVERSED, value: 'REVERSED' },
]
const READ_PERMISSIONS = Object.freeze([
  'pmc.risk.read',
  'production.fact.read',
  'production.exception.submit',
  'production.exception.approve',
])

export function canReadProductionExceptionDecisions(adminProfile) {
  return READ_PERMISSIONS.some((permission) =>
    hasActionPermission(adminProfile, permission)
  )
}

function mutationReceiptMatches(item, action, reason, actorID) {
  const record = action?.record
  if (
    !item?.id ||
    Number(item.id) !== Number(record?.id) ||
    Number(item.version) !== Number(record?.version) + 1
  ) {
    return false
  }
  if (action.targetStatus && item.status !== action.targetStatus) return false
  if (
    action.targetExecutionStatus &&
    item.execution_status !== action.targetExecutionStatus
  ) {
    return false
  }
  if (
    action.actorField &&
    Number(item[action.actorField]) !== Number(actorID)
  ) {
    return false
  }
  if (
    action.reasonField &&
    String(item[action.reasonField] || '').trim() !== reason
  ) {
    return false
  }
  return true
}

export default function ProductionExceptionDecisionPanel({
  adminProfile,
  onRefreshReady,
  onSummaryChange,
  tableHeader,
}) {
  const [searchParams] = useSearchParams()
  const beginLatestRequest = useLatestRequestCoordinator()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState(null)
  const [selectedID, setSelectedID] = useState(null)
  const [reason, setReason] = useState('')
  const [decisionTypeFilter, setDecisionTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [executionStatusFilter, setExecutionStatusFilter] = useState('')
  const canRead = canReadProductionExceptionDecisions(adminProfile)
  const canDecide = hasActionPermission(
    adminProfile,
    'production.exception.approve'
  )
  const canCancel = hasActionPermission(
    adminProfile,
    'production.exception.submit'
  )
  const canExecute = hasActionPermission(adminProfile, 'production.fact.post')
  const canRecoverProcess = hasActionPermission(
    adminProfile,
    'process_runtime.recover'
  )
  const adminID = Number(adminProfile?.id || 0)
  const customerKey =
    adminProfile?.effective_session?.customer?.key || undefined
  const linkedProductionExceptionID = Number(
    searchParams.get('production_exception_id') || 0
  )
  const hasActiveFilters = Boolean(
    decisionTypeFilter || statusFilter || executionStatusFilter
  )

  const load = useCallback(async () => {
    const request = beginLatestRequest('production-exception-decisions')
    if (!canRead) {
      if (request.isCurrent()) {
        setRows([])
        setSelectedID(null)
        setLoading(false)
        onSummaryChange?.({ total: 0, pageCount: 0 })
        request.finish()
      }
      return []
    }
    setLoading(true)
    try {
      const data = await listProductionExceptions(
        {
          ...(decisionTypeFilter
            ? { decision_type: decisionTypeFilter }
            : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(executionStatusFilter
            ? { execution_status: executionStatusFilter }
            : {}),
          limit: 100,
          offset: 0,
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return null
      if (!Array.isArray(data?.production_exceptions)) {
        throw Object.assign(new Error('生产异常记录返回不完整'), {
          isInvalidResponse: true,
        })
      }
      let nextRows = data.production_exceptions
      if (
        !hasActiveFilters &&
        Number.isSafeInteger(linkedProductionExceptionID) &&
        linkedProductionExceptionID > 0
      ) {
        if (!nextRows.some((item) => item.id === linkedProductionExceptionID)) {
          const linked = await getProductionException(
            {
              id: linkedProductionExceptionID,
            },
            { signal: request.signal }
          )
          if (!request.isCurrent()) return null
          if (linked?.id !== linkedProductionExceptionID) {
            throw Object.assign(new Error('关联生产异常返回不完整'), {
              isInvalidResponse: true,
            })
          }
          nextRows = [linked, ...nextRows]
        }
      }
      setRows(nextRows)
      setSelectedID((current) => {
        if (
          !hasActiveFilters &&
          Number.isSafeInteger(linkedProductionExceptionID) &&
          linkedProductionExceptionID > 0
        ) {
          return linkedProductionExceptionID
        }
        return nextRows.some((item) => item.id === current) ? current : null
      })
      const total = Number(data?.total)
      onSummaryChange?.({
        total:
          Number.isSafeInteger(total) && total >= 0
            ? Math.max(total, nextRows.length)
            : nextRows.length,
        pageCount: nextRows.length,
      })
      return nextRows
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return null
      message.error(getActionErrorMessage(error, '读取生产异常处置申请'))
      return null
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    canRead,
    decisionTypeFilter,
    executionStatusFilter,
    hasActiveFilters,
    linkedProductionExceptionID,
    onSummaryChange,
    statusFilter,
  ])
  useEffect(() => {
    onRefreshReady?.(load)
    return () => onRefreshReady?.(null)
  }, [load, onRefreshReady])
  useEffect(() => {
    load()
  }, [load])

  const openCancellation = async (record) => {
    setLoading(true)
    try {
      const processData = await getProductionExceptionApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        production_exception_id: record.id,
      })
      const latest = processData.source_readback
      if (
        latest?.status !== 'SUBMITTED' ||
        (processData.process_context &&
          processData.process_context.process_instance.status !== 'blocked')
      ) {
        message.warning(
          latest?.status === 'SUBMITTED'
            ? '该异常审批仍在办理，请先在任务中心驳回或阻塞流程'
            : '当前状态不能撤回生产异常申请'
        )
        await load()
        return
      }
      setAction({
        record: latest,
        kind: 'cancel',
        run: cancelProductionException,
        success: '生产异常申请已取消',
        targetStatus: 'CANCELLED',
        actorField: 'decided_by',
        reasonField: 'decision_reason',
      })
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对生产异常撤回条件'))
    } finally {
      setLoading(false)
    }
  }

  const ensureApprovalProcess = async (record) => {
    if (
      !record?.id ||
      record.status !== 'SUBMITTED' ||
      Number(record.requested_by) !== adminID
    ) {
      return
    }
    setLoading(true)
    try {
      let processData = await getProductionExceptionApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        production_exception_id: record.id,
      })
      const alreadyStarted = Boolean(processData?.process_context)
      if (!alreadyStarted) {
        try {
          processData = await startProductionExceptionApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            production_exception_id: record.id,
            idempotency_key: `production-exception-approval/${record.id}`,
          })
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) throw error
          processData = await getProductionExceptionApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            production_exception_id: record.id,
          })
          if (!processData?.process_context) throw error
        }
      }
      if (!processData?.process_context || !processData?.source_readback?.id) {
        throw Object.assign(new Error('生产异常审批流结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      await load()
      message[alreadyStarted ? 'info' : 'success'](
        alreadyStarted
          ? '生产异常审批流已存在，请到任务中心继续办理'
          : '生产异常审批流已恢复发起'
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对生产异常审批流'))
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    const text = reason.trim()
    if (!text || !action?.record?.id) return
    setLoading(true)
    try {
      const params = {
        id: action.record.id,
        expected_version: action.record.version,
        reason: text,
      }
      let next
      if (action.kind === 'execute') {
        const processData = await getProductionExceptionApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          production_exception_id: action.record.id,
        })
        const node = findExceptionProcessActiveNode(
          processData,
          'execute_production_exception'
        )
        const execution = await executeProductionExceptionProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          process_instance_id: processData.process_context.process_instance.id,
          process_node_instance_id: node.id,
          expected_version: node.version,
          production_exception_id: action.record.id,
          idempotency_key: `production-exception-execute/${action.record.id}/${node.id}`,
          reason: text,
        })
        next = execution.source_readback
      } else {
        next = await action.run(params)
      }
      if (!mutationReceiptMatches(next, action, text, adminID)) {
        throw Object.assign(new Error('生产异常处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      setAction(null)
      setReason('')
      await load()
      message.success(action.success)
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        let latest = null
        if (action?.kind === 'execute') {
          latest = await getProductionExceptionApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            production_exception_id: action.record.id,
          })
            .then((data) => data.source_readback)
            .catch(() => null)
        }
        if (!latest) {
          latest = await getProductionException({
            id: action?.record?.id,
          }).catch(() => null)
        }
        if (mutationReceiptMatches(latest, action, text, adminID)) {
          setAction(null)
          setReason('')
          await load()
          message.success('已重新读取生产异常处置结果')
          return
        }
        if (latest?.id) {
          await load()
          message.warning('生产异常状态已被其他操作更新，请核对后重试')
          return
        }
      }
      message.error(getActionErrorMessage(error, '办理生产异常处置'))
    } finally {
      setLoading(false)
    }
  }

  const columns = useMemo(
    () => [
      { title: '异常单号', dataIndex: 'decision_no' },
      {
        title: '异常类型',
        dataIndex: 'decision_type',
        render: (value) => TYPE_LABELS[value] || '生产异常',
      },
      { title: '申请数量', dataIndex: 'requested_quantity' },
      {
        title: '审批状态',
        dataIndex: 'status',
        render: (value) => <Tag>{STATUS_LABELS[value] || '状态待确认'}</Tag>,
      },
      {
        title: '业务状态',
        dataIndex: 'execution_status',
        render: (value, record) => (
          <Tag>
            {record.decision_type === 'OVER_ISSUE' &&
            record.status === 'APPROVED' &&
            value === 'PENDING'
              ? '超领额度生效'
              : EXECUTION_LABELS[value] || '待业务办理'}
          </Tag>
        ),
      },
      { title: '原因', dataIndex: 'reason' },
    ],
    []
  )
  const { tableColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: 'production-exceptions-decisions',
      moduleTitle: '生产异常处置申请',
      columns,
    })

  if (!canRead) return null

  const selectedRecord =
    rows.find((item) => item.id === selectedID) || null
  const selectedRequesterOwned = Boolean(
    selectedRecord &&
      Number(selectedRecord.requested_by) === adminID
  )
  const actionAvailability = {
    approval: resolveProductionExceptionActionAvailability({
      action: 'approval',
      authorized: canCancel,
      productionException: selectedRecord,
      requesterOwned: selectedRequesterOwned,
      busy: loading,
    }),
    decide: resolveProductionExceptionActionAvailability({
      action: 'decide',
      authorized: canDecide,
      productionException: selectedRecord,
      busy: loading,
    }),
    withdraw: resolveProductionExceptionActionAvailability({
      action: 'withdraw',
      authorized: canCancel,
      productionException: selectedRecord,
      requesterOwned: selectedRequesterOwned,
      busy: loading,
    }),
    execute: resolveProductionExceptionActionAvailability({
      action: 'execute',
      authorized: canExecute,
      productionException: selectedRecord,
      busy: loading,
    }),
    reverse: resolveProductionExceptionActionAvailability({
      action: 'reverse',
      authorized: canExecute,
      productionException: selectedRecord,
      busy: loading,
    }),
    revokeQuota: resolveProductionExceptionActionAvailability({
      action: 'revokeQuota',
      authorized: canExecute,
      productionException: selectedRecord,
      busy: loading,
    }),
  }
  const clearFilters = () => {
    setDecisionTypeFilter('')
    setStatusFilter('')
    setExecutionStatusFilter('')
    setSelectedID(null)
  }

  return (
    <>
      <BusinessOperationPanel
        compact
        filters={
          <>
            <SelectFilter
              aria-label="异常类型"
              value={decisionTypeFilter}
              options={TYPE_FILTER_OPTIONS}
              onChange={(value) => {
                setDecisionTypeFilter(value || '')
                setSelectedID(null)
              }}
            />
            <SelectFilter
              aria-label="审批状态"
              value={statusFilter}
              options={STATUS_FILTER_OPTIONS}
              onChange={(value) => {
                setStatusFilter(value || '')
                setSelectedID(null)
              }}
            />
            <SelectFilter
              aria-label="业务状态"
              value={executionStatusFilter}
              options={EXECUTION_FILTER_OPTIONS}
              onChange={(value) => {
                setExecutionStatusFilter(value || '')
                setSelectedID(null)
              }}
            />
          </>
        }
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        actions={
          <BusinessListToolbarActions
            showExport={false}
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRecord ? 1 : 0}
          selectedLabel={
            selectedRecord?.decision_no || '请选择生产异常处置申请'
          }
        >
          <SelectionClearAction
            selectedCount={selectedRecord ? 1 : 0}
            selectionLabel="生产异常处置申请"
            onClear={() => setSelectedID(null)}
          />
          {actionAvailability.approval.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.approval.disabled}
              disabledReason={actionAvailability.approval.disabledReason}
            >
              <Button
                size="small"
                data-business-action-key="production-exception-approval"
                disabled={actionAvailability.approval.disabled}
                onClick={() => ensureApprovalProcess(selectedRecord)}
              >
                核对审批流
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.decide.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.decide.disabled}
              disabledReason={actionAvailability.decide.disabledReason}
            >
              <Button
                size="small"
                type="primary"
                data-business-action-key="production-exception-decide"
                href="/erp/task-board"
                disabled={actionAvailability.decide.disabled}
              >
                去任务中心审批
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.withdraw.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.withdraw.disabled}
              disabledReason={actionAvailability.withdraw.disabledReason}
            >
              <Button
                size="small"
                danger
                data-business-action-key="production-exception-withdraw"
                disabled={actionAvailability.withdraw.disabled}
                onClick={() => openCancellation(selectedRecord)}
              >
                核对并撤回
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.execute.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.execute.disabled}
              disabledReason={actionAvailability.execute.disabledReason}
            >
              <Button
                size="small"
                type="primary"
                data-business-action-key="production-exception-execute"
                disabled={actionAvailability.execute.disabled}
                onClick={() =>
                  setAction({
                    record: selectedRecord,
                    kind: 'execute',
                    success: '生产异常已执行',
                    targetExecutionStatus: 'APPLIED',
                    actorField: 'executed_by',
                    reasonField: 'execution_reason',
                  })
                }
              >
                确认执行
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.reverse.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.reverse.disabled}
              disabledReason={actionAvailability.reverse.disabledReason}
            >
              <Button
                size="small"
                danger
                data-business-action-key="production-exception-reverse"
                disabled={actionAvailability.reverse.disabled}
                onClick={() =>
                  setAction({
                    record: selectedRecord,
                    run: reverseProductionException,
                    success: '生产异常已冲正',
                    targetExecutionStatus: 'REVERSED',
                    actorField: 'reversed_by',
                    reasonField: 'reverse_reason',
                  })
                }
              >
                确认冲正
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.revokeQuota.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.revokeQuota.disabled}
              disabledReason={actionAvailability.revokeQuota.disabledReason}
            >
              <Button
                size="small"
                danger
                data-business-action-key="production-exception-revoke-quota"
                disabled={actionAvailability.revokeQuota.disabled}
                onClick={() =>
                  setAction({
                    record: selectedRecord,
                    run: reverseProductionException,
                    success: '未使用的超领额度已撤销',
                    targetExecutionStatus: 'REVERSED',
                    actorField: 'reversed_by',
                    reasonField: 'reverse_reason',
                  })
                }
              >
                撤销额度
              </Button>
            </BusinessActionTooltip>
          ) : null}
          <ExceptionProcessRecoveryButton
            canRecover={canRecoverProcess}
            disabled={!selectedRecord || loading}
            disabledReason="请先选择一条生产异常处置申请"
            loadProcess={() =>
              getProductionExceptionApprovalProcess({
                ...(customerKey ? { customer_key: customerKey } : {}),
                production_exception_id: selectedRecord.id,
              })
            }
            onRecovered={load}
          />
        </SelectionActionBar>
      </BusinessOperationPanel>
      <Card className="erp-business-data-table-card erp-business-module-table-card">
        {tableHeader}
        <Alert
          type="info"
          showIcon
          message="审批只记录决定；报废和在制品让步须由生产岗位再次确认执行，超领仍在正式领料中按批准额度办理。"
        />
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          loading={loading}
          columns={tableColumns}
          dataSource={rows}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedID ? [selectedID] : [],
            onChange: (keys) => setSelectedID(keys[0] || null),
          }}
          onRow={(record) => ({
            onClick: () => setSelectedID(record.id),
          })}
          rowClassName={(record) =>
            record.id === selectedID ? 'ant-table-row-selected' : ''
          }
          pagination={false}
          scroll={{ x: 960 }}
          locale={{ emptyText: '暂无生产异常处置申请' }}
        />
      </Card>
      {columnOrderModal}
      <Modal
        title="确认生产异常处置"
        open={Boolean(action)}
        confirmLoading={loading}
        okText="确认办理"
        cancelText="返回"
        onCancel={() => {
          if (!loading) {
            setAction(null)
            setReason('')
          }
        }}
        onOk={submit}
      >
        <Input.TextArea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={255}
          showCount
          placeholder="填写审批、执行或冲正原因"
        />
      </Modal>
    </>
  )
}
