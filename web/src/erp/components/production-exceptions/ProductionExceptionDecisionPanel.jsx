import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Space, Table, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

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
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'

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

export default function ProductionExceptionDecisionPanel({ adminProfile }) {
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState(null)
  const [selectedID, setSelectedID] = useState(null)
  const [reason, setReason] = useState('')
  const canRead = [
    'pmc.risk.read',
    'production.fact.read',
    'production.exception.submit',
    'production.exception.approve',
  ].some((permission) => hasActionPermission(adminProfile, permission))
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

  const load = useCallback(async () => {
    if (!canRead) {
      setRows([])
      return []
    }
    setLoading(true)
    try {
      const data = await listProductionExceptions({ limit: 100, offset: 0 })
      if (!Array.isArray(data?.production_exceptions)) {
        throw Object.assign(new Error('生产异常记录返回不完整'), {
          isInvalidResponse: true,
        })
      }
      let nextRows = data.production_exceptions
      if (
        Number.isSafeInteger(linkedProductionExceptionID) &&
        linkedProductionExceptionID > 0
      ) {
        if (
          !nextRows.some((item) => item.id === linkedProductionExceptionID)
        ) {
          const linked = await getProductionException({
            id: linkedProductionExceptionID,
          })
          if (linked?.id !== linkedProductionExceptionID) {
            throw Object.assign(new Error('关联生产异常返回不完整'), {
              isInvalidResponse: true,
            })
          }
          nextRows = [linked, ...nextRows]
        }
        setSelectedID(linkedProductionExceptionID)
      }
      setRows(nextRows)
      return nextRows
    } catch (error) {
      message.error(getActionErrorMessage(error, '读取生产异常办理记录'))
      return null
    } finally {
      setLoading(false)
    }
  }, [canRead, linkedProductionExceptionID])
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
        throw Object.assign(new Error('生产异常办理结果暂时无法确认'), {
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
          message.success('已重新读取生产异常办理结果')
          return
        }
        if (latest?.id) {
          await load()
          message.warning('生产异常状态已被其他操作更新，请核对后重试')
          return
        }
      }
      message.error(getActionErrorMessage(error, '办理生产异常'))
    } finally {
      setLoading(false)
    }
  }

  const columns = [
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
    {
      title: '办理',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          {record.status === 'SUBMITTED' &&
          canCancel &&
          Number(record.requested_by) === adminID ? (
            <Button
              size="small"
              disabled={loading}
              onClick={() => ensureApprovalProcess(record)}
            >
              核对审批流
            </Button>
          ) : null}
          {record.status === 'SUBMITTED' && canDecide ? (
            <Button size="small" type="primary" href="/erp/task-board">
              去任务中心审批
            </Button>
          ) : null}
          {record.status === 'SUBMITTED' &&
          canCancel &&
          Number(record.requested_by) === Number(adminProfile?.id) ? (
            <Button size="small" onClick={() => openCancellation(record)}>
              核对并撤回
            </Button>
          ) : null}
          {record.status === 'APPROVED' &&
          record.execution_status === 'PENDING' &&
          record.decision_type !== 'OVER_ISSUE' &&
          canExecute ? (
            <Button
              size="small"
              type="primary"
              onClick={() =>
                setAction({
                  record,
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
          ) : null}
          {record.execution_status === 'APPLIED' && canExecute ? (
            <Button
              size="small"
              danger
              onClick={() =>
                setAction({
                  record,
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
          ) : null}
          <ExceptionProcessRecoveryButton
            canRecover={canRecoverProcess}
            disabled={loading}
            loadProcess={() =>
              getProductionExceptionApprovalProcess({
                ...(customerKey ? { customer_key: customerKey } : {}),
                production_exception_id: record.id,
              })
            }
            onRecovered={load}
          />
          {record.status === 'APPROVED' &&
          record.decision_type === 'OVER_ISSUE' &&
          record.execution_status === 'PENDING' ? (
            <>
              <Tag color="blue">到生产领料按批准额度办理</Tag>
              {canExecute ? (
                <Button
                  size="small"
                  danger
                  onClick={() =>
                    setAction({
                      record,
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
              ) : null}
            </>
          ) : null}
        </Space>
      ),
    },
  ]

  if (!canRead) return null

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="审批只记录决定；报废和在制品让步须由生产岗位再次确认执行，超领仍在正式领料中按批准额度办理。"
      />
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedID ? [selectedID] : [],
          onChange: (keys) => setSelectedID(keys[0] || null),
        }}
        onRow={(record) => ({
          onClick: () => setSelectedID(record.id),
        })}
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: '暂无生产异常办理记录' }}
      />
      <Modal
        title="确认生产异常办理"
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
