import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Modal, Select, Space, Table, Tag } from 'antd'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listInventoryOperations } from '../../api/inventoryApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'

const TYPE_LABELS = Object.freeze({
  CYCLE_COUNT: '库存盘点',
  TRANSFER: '库存调拨',
  MANUAL_ADJUSTMENT: '人工调整',
})

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  SUBMITTED: '待审批',
  APPROVED: '已批准待过账',
  REJECTED: '已驳回',
  POSTED: '已过账',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  SUBMITTED: 'gold',
  APPROVED: 'cyan',
  REJECTED: 'red',
  POSTED: 'blue',
  CANCELLED: 'default',
})

const TYPE_OPTIONS = [
  { label: '全部作业类型', value: '' },
  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

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

function itemSummary(record) {
  const items = Array.isArray(record?.items) ? record.items : []
  if (items.length === 0) return '暂无明细'
  return `${items.length} 行来源库存`
}

function statusTag(value) {
  const status = String(value || '').toUpperCase()
  return (
    <Tag color={STATUS_COLORS[status] || 'default'}>
      {STATUS_LABELS[status] || '状态待核对'}
    </Tag>
  )
}

export default function InventoryOperationRecordsModal({
  open,
  currentAdminID = 0,
  canCreate = false,
  onCancel,
  onSelect,
  onEdit,
}) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [operationType, setOperationType] = useState('')
  const [status, setStatus] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [actionKey, setActionKey] = useState('')
  const beginLatestRequest = useLatestRequestCoordinator()
  const { current: currentPage, pageSize } = pagination

  const loadRecords = useCallback(async () => {
    if (!open) return
    const request = beginLatestRequest('inventory-operation-records')
    setLoading(true)
    try {
      const result = await listInventoryOperations(
        {
          operation_type: operationType || undefined,
          status: status || undefined,
          created_by:
            onlyMine && Number(currentAdminID) > 0
              ? Number(currentAdminID)
              : undefined,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      setRows(
        Array.isArray(result?.inventory_operations)
          ? result.inventory_operations
          : []
      )
      setTotal(Number(result?.total || 0))
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return
      message.error(getActionErrorMessage(error, '读取库存作业记录'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    currentAdminID,
    onlyMine,
    open,
    operationType,
    currentPage,
    pageSize,
    status,
  ])

  useEffect(() => {
    if (!open) {
      const request = beginLatestRequest('inventory-operation-records')
      request.finish()
      setLoading(false)
      setActionKey('')
      return
    }
    loadRecords()
  }, [beginLatestRequest, loadRecords, open])

  const runRecordAction = useCallback(async (kind, record, action) => {
    if (!record?.id || !action) return
    const key = `${kind}:${record.id}`
    setActionKey(key)
    try {
      await action(record)
    } finally {
      setActionKey('')
    }
  }, [])

  const columns = useMemo(
    () => [
      {
        title: '作业单号',
        dataIndex: 'operation_no',
        width: 180,
        render: (value) => value || '已登记作业',
      },
      {
        title: '作业类型',
        dataIndex: 'operation_type',
        width: 120,
        render: (value) => TYPE_LABELS[value] || '库存作业',
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: statusTag,
      },
      {
        title: '业务原因',
        dataIndex: 'reason',
        render: (value) => value || '-',
      },
      {
        title: '作业明细',
        key: 'items',
        width: 130,
        render: (_, record) => itemSummary(record),
      },
      {
        title: '最近更新',
        dataIndex: 'updated_at',
        width: 170,
        render: formatDateTime,
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 160,
        render: (_, record) => {
          const canEdit =
            canCreate &&
            record?.status === 'DRAFT' &&
            Number(record?.created_by || 0) === Number(currentAdminID || 0)
          return (
            <Space size="small">
              <Button
                size="small"
                loading={actionKey === `select:${record.id}`}
                disabled={Boolean(actionKey)}
                onClick={() => runRecordAction('select', record, onSelect)}
              >
                核对
              </Button>
              {canEdit ? (
                <Button
                  type="primary"
                  size="small"
                  loading={actionKey === `edit:${record.id}`}
                  disabled={Boolean(actionKey)}
                  onClick={() => runRecordAction('edit', record, onEdit)}
                >
                  编辑草稿
                </Button>
              ) : null}
            </Space>
          )
        },
      },
    ],
    [actionKey, canCreate, currentAdminID, onEdit, onSelect, runRecordAction]
  )

  return (
    <Modal
      className="erp-inventory-operation-records-modal"
      title="库存作业记录"
      open={open}
      width={1120}
      footer={null}
      destroyOnHidden
      onCancel={onCancel}
    >
      <Alert
        type="info"
        showIcon
        message="库存作业是可恢复的业务记录；草稿可由创建人继续编辑，已提交、已批准或已过账内容保持只读。"
      />
      <Space wrap style={{ margin: '16px 0' }}>
        <Select
          aria-label="作业类型"
          value={operationType}
          options={TYPE_OPTIONS}
          style={{ width: 180 }}
          onChange={(value) => {
            setOperationType(value)
            setPagination((current) => ({ ...current, current: 1 }))
          }}
        />
        <Select
          aria-label="作业状态"
          value={status}
          options={STATUS_OPTIONS}
          style={{ width: 180 }}
          onChange={(value) => {
            setStatus(value)
            setPagination((current) => ({ ...current, current: 1 }))
          }}
        />
        <Checkbox
          checked={onlyMine}
          onChange={(event) => {
            setOnlyMine(event.target.checked)
            setPagination((current) => ({ ...current, current: 1 }))
          }}
        >
          仅看我创建
        </Checkbox>
        <Button disabled={loading} onClick={loadRecords}>
          刷新
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        scroll={{ x: 980 }}
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          ...pagination,
          total,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
        }}
        onChange={(next) =>
          setPagination({
            current: next.current || 1,
            pageSize: next.pageSize || 20,
          })
        }
      />
    </Modal>
  )
}
