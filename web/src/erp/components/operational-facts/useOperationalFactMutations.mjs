import { useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'
import { matchesOperationalFactLifecycleResult } from '../../utils/operationalFactLifecycle.mjs'
import { isFinishedGoodsReceipt } from './OperationalFactForms.jsx'

export function useOperationalFactMutations({
  adminProfile,
  currentActiveKey,
  loadRows,
  activeSelectedRow,
  activeConfig,
}) {
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''

  const [saving, setSaving] = useState(false)

  const [financeCancelOpen, setFinanceCancelOpen] = useState(false)

  const [financeCancelReason, setFinanceCancelReason] = useState('')

  const runRowAction = async (
    config,
    row,
    actionKey,
    actionLabel,
    extraParams = {}
  ) => {
    const action = config[actionKey]
    if (!action || !row?.id) {
      return false
    }
    const usesStrictFactLifecycle =
      ['production', 'outsourcing', 'finance'].includes(currentActiveKey) &&
      ['post', 'settle', 'cancel'].includes(actionKey)
    const targetStatus = usesStrictFactLifecycle
      ? {
          post: 'POSTED',
          settle: 'SETTLED',
          cancel: 'CANCELLED',
        }[actionKey]
      : ''
    const attempt = Object.freeze({
      id: row.id,
      ...(usesStrictFactLifecycle
        ? {
            expected_version: row.version,
            ...(activeCustomerKey ? { customer_key: activeCustomerKey } : {}),
          }
        : currentActiveKey === 'outsourcing' && activeCustomerKey
          ? { customer_key: activeCustomerKey }
          : {}),
      ...extraParams,
    })
    let resultUnknown = false
    try {
      setSaving(true)
      await action(attempt)
    } catch (error) {
      if (
        !usesStrictFactLifecycle ||
        !isSourceBusinessActionResultUnknown(error) ||
        !targetStatus
      ) {
        message.error(getActionErrorMessage(error, actionLabel))
        setSaving(false)
        return false
      }
      resultUnknown = true
    }
    const refreshedRows = await loadRows(currentActiveKey)
    if (resultUnknown) {
      const confirmed = refreshedRows?.find((record) =>
        matchesOperationalFactLifecycleResult(record, attempt, targetStatus)
      )
      if (!confirmed) {
        message.warning(
          '暂时无法确认操作结果，已清除当前选择；请刷新核对后再决定是否重试'
        )
        setSaving(false)
        return false
      }
    }
    message.success(
      currentActiveKey === 'production' &&
        actionKey === 'post' &&
        String(row.fact_type || '')
          .trim()
          .toUpperCase() === 'REWORK'
        ? '返工记录已过账，返工补制批次和生产异常任务已生成'
        : resultUnknown
          ? `已重新读取并确认${actionLabel}完成`
          : `${actionLabel}已完成`
    )
    if (!refreshedRows) {
      message.warning(`${actionLabel}已完成，请稍后刷新查看最新结果`)
    }
    setSaving(false)
    return true
  }

  const confirmFinanceCancellation = async () => {
    const reason = financeCancelReason.trim()
    if (!reason) {
      message.error('请填写取消原因')
      return
    }
    if ([...reason].length > 255) {
      message.error('取消原因不能超过 255 个字')
      return
    }
    const actionLabel =
      currentActiveKey === 'finance'
        ? activeSelectedRow?.status === 'DRAFT'
          ? '作废财务草稿'
          : '取消财务记录'
        : currentActiveKey === 'production' &&
            isFinishedGoodsReceipt(activeSelectedRow)
          ? activeSelectedRow?.status === 'DRAFT'
            ? '作废生产完工报告'
            : '撤销成品入库'
          : activeSelectedRow?.status === 'DRAFT'
            ? '作废业务草稿'
            : '取消业务记录'
    const succeeded = await runRowAction(
      activeConfig,
      activeSelectedRow,
      'cancel',
      actionLabel,
      { reason }
    )
    if (succeeded) {
      setFinanceCancelOpen(false)
      setFinanceCancelReason('')
    }
  }
  return {
    activeCustomerKey,
    saving,
    financeCancelOpen,
    setFinanceCancelOpen,
    financeCancelReason,
    setFinanceCancelReason,
    runRowAction,
    confirmFinanceCancellation,
  }
}
