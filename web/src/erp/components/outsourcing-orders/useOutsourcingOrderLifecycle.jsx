import React, { useRef } from 'react'
import { Alert, Descriptions } from 'antd'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import SourceOrderLifecycleConfirmContent from '../business-list/SourceOrderLifecycleConfirmContent.jsx'
import { listBusinessAttachments } from '../../api/attachmentApi.mjs'
import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import {
  normalizeSourceOrderLifecycleReason,
  prepareSourceOrderLifecycleAttempt,
} from '../../utils/sourceOrderLifecycleAction.mjs'
import { buildOutsourcingContractConfirmationSummary } from '../../utils/outsourcingContractReadiness.mjs'

export function useOutsourcingOrderLifecycle({
  selectedRow,
  saving,
  setSaving,
  activeCustomerKey,
  setSelectedRow,
  loadOrders,
  loadWorkflowTasks,
  loadOrderItems,
  openEdit,
}) {
  const lifecycleInFlightRef = useRef(false)

  const lifecycleAttemptsRef = useRef(createSourceBusinessActionAttemptStore())

  const runLifecycleAction = async (action) => {
    if (!selectedRow || lifecycleInFlightRef.current || saving) return
    const execute = async (reason = '') => {
      lifecycleInFlightRef.current = true
      setSaving(true)
      let lifecycleAttempt = null
      try {
        lifecycleAttempt = prepareSourceOrderLifecycleAttempt({
          action,
          attemptStore: lifecycleAttemptsRef.current,
          customerKey: activeCustomerKey,
          reason,
          record: selectedRow,
        })
        const updated = await action.run(lifecycleAttempt.attempt.params)
        lifecycleAttemptsRef.current.settle(
          lifecycleAttempt.scope,
          lifecycleAttempt.attempt,
          null
        )
        setSelectedRow(updated)
        message.success(`${action.label}成功`)
        await Promise.all([loadOrders(), loadWorkflowTasks()])
      } catch (error) {
        const resultUnknown = lifecycleAttempt
          ? lifecycleAttemptsRef.current.settle(
              lifecycleAttempt.scope,
              lifecycleAttempt.attempt,
              error
            )
          : false
        if (resultUnknown) {
          message.warning(
            '暂时无法确认合同是否处理成功，请刷新核对最新状态；内容不变时可安全重试'
          )
        } else {
          message.error(getActionErrorMessage(error, `${action.label}失败`))
        }
      } finally {
        lifecycleInFlightRef.current = false
        setSaving(false)
      }
    }

    if (['submit', 'confirm'].includes(action.key)) {
      setSaving(true)
      let summary
      try {
        const [items, attachments] = await Promise.all([
          loadOrderItems(selectedRow),
          listBusinessAttachments({
            owner_type: 'outsourcing_order',
            owner_id: selectedRow.id,
          }),
        ])
        summary = buildOutsourcingContractConfirmationSummary(
          selectedRow,
          items,
          Array.isArray(attachments)
            ? attachments.filter((item) => !item?.withdrawn_at).length
            : 0
        )
      } catch (error) {
        message.error(getActionErrorMessage(error, '核对加工合同完整性'))
        return
      } finally {
        setSaving(false)
      }
      if (!summary.complete) {
        modal.warning({
          title: '加工合同信息尚未齐全',
          content: (
            <Alert
              showIcon
              type="warning"
              message="补齐以下内容后才能提交或确认下单"
              description={summary.missing.join('、')}
            />
          ),
          okText:
            selectedRow.lifecycle_status === 'draft' ? '返回补充' : '我知道了',
          onOk:
            selectedRow.lifecycle_status === 'draft'
              ? () => openEdit(selectedRow)
              : undefined,
        })
        return
      }
      modal.confirm({
        title: action.key === 'submit' ? '确认提交加工合同' : '确认下单',
        content: (
          <Descriptions
            bordered
            column={1}
            size="small"
            items={[
              {
                key: 'buyer',
                label: '甲方',
                children: summary.buyerName,
              },
              {
                key: 'supplier',
                label: '乙方',
                children: summary.supplierName,
              },
              {
                key: 'expected-return',
                label: '预计回货',
                children: formatUnixDate(summary.expectedReturnDate),
              },
              {
                key: 'lines',
                label: '加工明细',
                children: `${summary.lineCount} 条`,
              },
              {
                key: 'amount',
                label: '合同金额',
                children: summary.totalAmountText,
              },
              {
                key: 'attachments',
                label: '附件',
                children: `${summary.attachmentCount} 个`,
              },
            ]}
          />
        ),
        okText: action.key === 'submit' ? '确认提交' : '确认下单',
        cancelText: '返回核对',
        onOk: execute,
      })
      return
    }

    if (action.confirmTitle) {
      let reason = ''
      modal.confirm({
        title: action.confirmTitle,
        content: (
          <SourceOrderLifecycleConfirmContent
            action={action}
            onReasonChange={(value) => {
              reason = value
            }}
          />
        ),
        okText: action.okText || '确认',
        cancelText: '取消',
        okButtonProps: { danger: action.danger },
        onOk: (_close) => {
          try {
            normalizeSourceOrderLifecycleReason(action, reason)
          } catch (error) {
            message.warning(getActionErrorMessage(error, '校验业务原因'))
            return
          }
          return execute(reason)
        },
      })
      return
    }
    await execute()
  }
  return { runLifecycleAction }
}
