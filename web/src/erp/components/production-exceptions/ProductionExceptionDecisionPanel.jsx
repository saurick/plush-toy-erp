import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Space, Table, Tag } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  approveProductionException,
  cancelProductionException,
  executeProductionException,
  listProductionExceptions,
  rejectProductionException,
  reverseProductionException,
} from '../../api/operationalFactApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'

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

export default function ProductionExceptionDecisionPanel({ adminProfile }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState(null)
  const [reason, setReason] = useState('')
  const [approvedQuantity, setApprovedQuantity] = useState('')
  const canRead = [
    'pmc.risk.read',
    'production.fact.read',
    'quality.exception.handle',
  ].some((permission) => hasActionPermission(adminProfile, permission))
  const canDecide = hasActionPermission(
    adminProfile,
    'quality.exception.handle'
  )
  const canExecute = hasActionPermission(adminProfile, 'production.fact.post')

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
      setRows(data.production_exceptions)
      return data.production_exceptions
    } catch (error) {
      message.error(getActionErrorMessage(error, '读取生产异常办理记录'))
      return null
    } finally {
      setLoading(false)
    }
  }, [canRead])
  useEffect(() => {
    load()
  }, [load])

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
      if (action.allowApprovedQuantity && approvedQuantity.trim()) {
        params.approved_quantity = approvedQuantity.trim()
      }
      const next = await action.run(params)
      if (
        !next?.id ||
        Number(next.id) !== Number(action.record.id) ||
        Number(next.version) <= Number(action.record.version)
      ) {
        throw Object.assign(new Error('生产异常办理结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      setAction(null)
      setReason('')
      setApprovedQuantity('')
      await load()
      message.success(action.success)
    } catch (error) {
      const refreshed = await load()
      const latest = refreshed?.find(
        (item) => Number(item.id) === Number(action?.record?.id)
      )
      if (latest && action?.isApplied?.(latest)) {
        setAction(null)
        setReason('')
        setApprovedQuantity('')
        message.success('已重新读取生产异常办理结果')
        return
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
      render: (value) => <Tag>{EXECUTION_LABELS[value] || '待业务办理'}</Tag>,
    },
    { title: '原因', dataIndex: 'reason' },
    {
      title: '办理',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          {record.status === 'SUBMITTED' && canDecide ? (
            <>
              <Button
                size="small"
                type="primary"
                onClick={() =>
                  setAction({
                    record,
                    run: approveProductionException,
                    success: '生产异常已批准',
                    allowApprovedQuantity: true,
                    isApplied: (item) => item.status === 'APPROVED',
                  })
                }
              >
                批准
              </Button>
              <Button
                size="small"
                danger
                onClick={() =>
                  setAction({
                    record,
                    run: rejectProductionException,
                    success: '生产异常已拒绝',
                    isApplied: (item) => item.status === 'REJECTED',
                  })
                }
              >
                拒绝
              </Button>
              <Button
                size="small"
                onClick={() =>
                  setAction({
                    record,
                    run: cancelProductionException,
                    success: '生产异常申请已取消',
                    isApplied: (item) => item.status === 'CANCELLED',
                  })
                }
              >
                取消申请
              </Button>
            </>
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
                  run: executeProductionException,
                  success: '生产异常已执行',
                  isApplied: (item) => item.execution_status === 'APPLIED',
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
                  isApplied: (item) => item.execution_status === 'REVERSED',
                })
              }
            >
              确认冲正
            </Button>
          ) : null}
          {record.status === 'APPROVED' &&
          record.decision_type === 'OVER_ISSUE' ? (
            <Tag color="blue">到生产领料按批准额度办理</Tag>
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
            setApprovedQuantity('')
          }
        }}
        onOk={submit}
      >
        {action?.allowApprovedQuantity ? (
          <Input
            value={approvedQuantity}
            onChange={(event) => setApprovedQuantity(event.target.value)}
            inputMode="decimal"
            placeholder={`批准数量（不填则按申请数量 ${action.record.requested_quantity}）`}
            style={{ marginBottom: 12 }}
          />
        ) : null}
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
