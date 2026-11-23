import { useState } from 'react'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'
import { matchesOperationalFactLifecycleResult } from '../../utils/operationalFactLifecycle.mjs'
import { operationalFactActionPresentation } from '../../utils/businessFactActionPresentation.mjs'

export function useOperationalFactMutations({
  adminProfile,
  currentActiveKey,
  loadRows,
  activeSelectedRow,
  activeConfig,
}) {
  const reportBusinessResult = useWorkflowTaskBusinessResult()
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
    let confirmedRecord
    let resultUnknown = false
    try {
      setSaving(true)
      confirmedRecord = await action(attempt)
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
      confirmedRecord = refreshedRows?.find((record) =>
        matchesOperationalFactLifecycleResult(record, attempt, targetStatus)
      )
      if (!confirmedRecord) {
        message.warning(
          '暂时无法确认操作结果，已清除当前选择；请刷新核对后再决定是否重试'
        )
        setSaving(false)
        return false
      }
    }
    const successText = ['production', 'outsourcing', 'finance'].includes(currentActiveKey) && ['post', 'cancel'].includes(actionKey)
      ? operationalFactActionPresentation(currentActiveKey, row, actionKey).success
      : `${actionLabel}已完成`
    if (currentActiveKey === 'production' || currentActiveKey === 'finance') await reportBusinessResult(successText, confirmedRecord)
    message.success(resultUnknown ? `已重新读取并确认：${successText}` : successText)
    if (!refreshedRows) {
      message.warning(`${successText}，请稍后刷新查看最新结果`)
    }
    setSaving(false)
    return true
  }

  const confirmFinanceCancellation = async () => {
    const reason = financeCancelReason.trim()
    if (!reason) {
      message.error('请填写业务原因')
      return
    }
    if ([...reason].length > 255) {
      message.error('业务原因不能超过 255 个字')
      return
    }
    const actionLabel = operationalFactActionPresentation(currentActiveKey, activeSelectedRow, 'cancel').label
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
