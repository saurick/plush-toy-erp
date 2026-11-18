import {
  ReloadOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Popconfirm, Space, Tag } from 'antd'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import Table from '@/common/components/table/AppTable'
import Tabs from '@/common/components/navigation/SlidingTabs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  cancelPurchaseReceiptAdjustment,
  cancelPurchaseReturn,
  listAllPurchaseReceiptAdjustments,
  listAllPurchaseReturns,
  postPurchaseReceiptAdjustment,
  postPurchaseReturn,
} from '../../api/purchaseApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { formatPurchaseReceiptQuantityTotal } from '../../utils/purchaseReceiptDecimal.mjs'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'

import { purchaseFactActionPresentation } from '../../utils/businessFactActionPresentation.mjs'

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
  const status = String(value || '')
    .trim()
    .toUpperCase()
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

function lineSummary(record, quantityLabel) {
  const items = Array.isArray(record?.items) ? record.items : []
  const total = formatPurchaseReceiptQuantityTotal(items)
  return `${items.length} 行 / ${quantityLabel} ${total}`
}

export default function PurchaseReceiptExceptionRecordsModal({
  open,
  receipt,
  customerKey = '',
  canReadReturns = false,
  canReadAdjustments = false,
  canPostReturns = false,
  canCancelReturns = false,
  canPostAdjustments = false,
  canCancelAdjustments = false,
  onCancel,
  onChanged,
}) {
  const [activeKey, setActiveKey] = useState(
    canReadReturns ? 'returns' : 'adjustments'
  )
  const [returns, setReturns] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const actionInFlightRef = useRef(false)
  const beginLatestRequest = useLatestRequestCoordinator()

  const loadRecords = useCallback(async () => {
    if (!open || !receipt?.id) return
    const request = beginLatestRequest('purchase-exception-records')
    setLoading(true)
    try {
      const [returnResult, adjustmentResult] = await Promise.all([
        canReadReturns
          ? listAllPurchaseReturns(
              {
                purchase_receipt_id: receipt.id,
              },
              { signal: request.signal }
            )
          : Promise.resolve({ purchase_returns: [] }),
        canReadAdjustments
          ? listAllPurchaseReceiptAdjustments(
              {
                purchase_receipt_id: receipt.id,
              },
              { signal: request.signal }
            )
          : Promise.resolve({ purchase_receipt_adjustments: [] }),
      ])
      if (!request.isCurrent()) return
      setReturns(
        Array.isArray(returnResult?.purchase_returns)
          ? returnResult.purchase_returns
          : []
      )
      setAdjustments(
        Array.isArray(adjustmentResult?.purchase_receipt_adjustments)
          ? adjustmentResult.purchase_receipt_adjustments
          : []
      )
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return
      message.error(getActionErrorMessage(error, '读取退货与调整记录'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    canReadAdjustments,
    canReadReturns,
    open,
    receipt?.id,
  ])

  useEffect(() => {
    if (!open || !receipt?.id) {
      const request = beginLatestRequest('purchase-exception-records')
      request.finish()
      setReturns([])
      setAdjustments([])
      setLoading(false)
      return
    }
    setReturns([])
    setAdjustments([])
    setActiveKey(canReadReturns ? 'returns' : 'adjustments')
    loadRecords()
  }, [beginLatestRequest, canReadReturns, loadRecords, open, receipt?.id])

  const runAction = useCallback(
    async ({ kind, action, record }) => {
      if (!record?.id || actionInFlightRef.current) return
      const key = `${kind}:${action}:${record.id}`
      const presentation = purchaseFactActionPresentation(kind, record, action)
      const params = {
        id: record.id,
        customer_key: customerKey || undefined,
      }
      actionInFlightRef.current = true
      setSavingKey(key)
      try {
        let nextRecord
        if (kind === 'return') {
          nextRecord = await (action === 'post'
            ? postPurchaseReturn(params)
            : cancelPurchaseReturn(params))
        } else {
          nextRecord = await (action === 'post'
            ? postPurchaseReceiptAdjustment(params)
            : cancelPurchaseReceiptAdjustment(params))
        }
        const expectedStatus = action === 'post' ? 'POSTED' : 'CANCELLED'
        if (
          Number(nextRecord?.id || 0) !== Number(record.id) ||
          String(nextRecord?.status || '').toUpperCase() !== expectedStatus
        ) {
          const error = new Error('业务记录返回结果无法确认')
          error.isInvalidResponse = true
          throw error
        }
        message.success(presentation.success)
        await loadRecords()
        await onChanged?.()
      } catch (error) {
        if (isSourceBusinessActionResultUnknown(error)) {
          message.warning(
            '操作结果暂时无法确认，系统将重新读取记录；请核对当前状态后再继续。'
          )
        } else {
          message.error(
            getActionErrorMessage(
              error,
              presentation.label
            )
          )
        }
        await loadRecords()
        await onChanged?.()
      } finally {
        actionInFlightRef.current = false
        setSavingKey('')
      }
    },
    [customerKey, loadRecords, onChanged]
  )

  const actionColumn = useCallback(
    (kind, permissions) => ({
      align: 'center',
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => {
        const postPresentation = purchaseFactActionPresentation(kind, record)
        const cancelPresentation = purchaseFactActionPresentation(kind, record, 'cancel')
        if (record?.status === 'DRAFT') {
          if (!permissions.post && !permissions.cancel) {
            return <span>待确认</span>
          }
          return (
            <Space size="small">
              {permissions.post ? (
                <Popconfirm
                  title={postPresentation.title}
                  description={postPresentation.description}
                  okText={postPresentation.label}
                  cancelText="返回"
                  onConfirm={() => runAction({ kind, action: 'post', record })}
                >
                  <Button
                    size="small"
                    type="primary"
                    loading={savingKey === `${kind}:post:${record.id}`}
                    disabled={Boolean(savingKey)}
                  >
                    {postPresentation.label}
                  </Button>
                </Popconfirm>
              ) : null}
              {permissions.cancel ? (
                <Popconfirm
                  title={cancelPresentation.title}
                  description={cancelPresentation.description}
                  okText={cancelPresentation.label}
                  cancelText="返回"
                  onConfirm={() =>
                    runAction({ kind, action: 'cancel', record })
                  }
                >
                  <Button
                    icon={<StopOutlined aria-hidden="true" />}
                    className="erp-action-button"
                    size="small"
                    danger
                    loading={savingKey === `${kind}:cancel:${record.id}`}
                    disabled={Boolean(savingKey)}
                  >
                    {cancelPresentation.label}
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          )
        }
        if (record?.status === 'POSTED') {
          if (!permissions.cancel) return <span>已确认</span>
          return (
            <Popconfirm
              title={cancelPresentation.title}
              description={cancelPresentation.description}
              okText={cancelPresentation.label}
              cancelText="返回"
              onConfirm={() => runAction({ kind, action: 'cancel', record })}
            >
              <Button
                icon={<RollbackOutlined aria-hidden="true" />}
                className="erp-action-button"
                size="small"
                danger
                loading={savingKey === `${kind}:cancel:${record.id}`}
                disabled={Boolean(savingKey)}
              >
                {cancelPresentation.label}
              </Button>
            </Popconfirm>
          )
        }
        return <span>已结束</span>
      },
    }),
    [runAction, savingKey]
  )

  const returnColumns = useMemo(
    () => [
      { title: '退货单号', dataIndex: 'return_no', width: 180 },
      { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
      {
        title: '退货时间',
        dataIndex: 'returned_at',
        width: 170,
        render: formatDateTime,
      },
      {
        align: 'left',
        title: '退货明细',
        key: 'items',
        render: (_, record) => lineSummary(record, '合计'),
      },
      {
        align: 'left',
        title: '备注',
        dataIndex: 'note',
        render: (value) => value || '-',
      },
      actionColumn('return', {
        post: canPostReturns,
        cancel: canCancelReturns,
      }),
    ],
    [actionColumn, canCancelReturns, canPostReturns]
  )

  const adjustmentColumns = useMemo(
    () => [
      { title: '调整单号', dataIndex: 'adjustment_no', width: 180 },
      { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
      {
        title: '调整时间',
        dataIndex: 'adjusted_at',
        width: 170,
        render: formatDateTime,
      },
      {
        align: 'left',
        title: '调整明细',
        key: 'items',
        render: (_, record) => lineSummary(record, '数量'),
      },
      {
        align: 'left',
        title: '调整原因',
        dataIndex: 'reason',
        render: (value) => value || '-',
      },
      actionColumn('adjustment', {
        post: canPostAdjustments,
        cancel: canCancelAdjustments,
      }),
    ],
    [actionColumn, canCancelAdjustments, canPostAdjustments]
  )

  const tabItems = []
  if (canReadReturns) {
    tabItems.push({
      key: 'returns',
      label: `采购退货（${returns.length}）`,
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={returns}
          columns={returnColumns}
          pagination={false}
          scroll={{ x: 960 }}
          locale={{ emptyText: '暂无采购退货记录' }}
        />
      ),
    })
  }
  if (canReadAdjustments) {
    tabItems.push({
      key: 'adjustments',
      label: `入库调整（${adjustments.length}）`,
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={adjustments}
          columns={adjustmentColumns}
          pagination={false}
          scroll={{ x: 960 }}
          locale={{ emptyText: '暂无入库调整记录' }}
        />
      ),
    })
  }

  return (
    <BusinessModal
      title={`退货与调整记录 · ${receipt?.receipt_no || '采购入库单'}`}
      open={open}
      size="lineItems"
      footer={
        <Space>
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            className="erp-action-button"
            onClick={loadRecords}
            loading={loading}
            disabled={Boolean(savingKey)}
          >
            刷新
          </Button>
          <Button
            type="primary"
            disabled={Boolean(savingKey)}
            onClick={onCancel}
          >
            关闭
          </Button>
        </Space>
      }
      closable={!savingKey}
      destroyOnHidden
      keyboard={!savingKey}
      maskClosable={!savingKey}
      onCancel={() => {
        if (!savingKey) onCancel?.()
      }}
    >
      <Alert
        type="info"
        showIcon
        message="草稿可直接作废且不更新库存；确认草稿后库存会同步更新；取消已确认记录时会保留原记录，并将库存恢复到操作前。"
      />
      {tabItems.length > 0 ? (
        <Tabs activeKey={activeKey} items={tabItems} onChange={setActiveKey} />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="当前岗位无权查看退货或调整记录。"
        />
      )}
    </BusinessModal>
  )
}
