import { useMemo, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { createReconciliationFromFinanceFact } from '../../api/operationalFactApi.mjs'
import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  buildFinanceBusinessSourcePayload,
  financeBusinessSourceActionConfig,
  financeBusinessSourceFormValuesFromRequest,
  isSingleFactReconciliationSource,
} from '../../utils/financeBusinessSourceAction.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'

export function useFinanceReconciliationAction({
  adminProfile,
  activeCustomerKey,
  resetPaginationForKey,
  currentActiveKey,
}) {
  const [financeSourceContext, setFinanceSourceContext] = useState(null)

  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)

  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )

  const financeSourceInFlightRef = useRef(false)

  const financeSourceScope = financeSourceContext?.source?.id
    ? `${financeSourceContext.action}:${financeSourceContext.source.id}`
    : ''

  const financeSourceInitialValues = useMemo(() => {
    if (!financeSourceScope) return undefined
    const retained = financeSourceAttemptsRef.current.peek(financeSourceScope)
    return retained
      ? financeBusinessSourceFormValuesFromRequest(retained.params)
      : undefined
  }, [financeSourceScope])

  const openFinanceSourceAction = (action, source) => {
    const canRun =
      action === FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION &&
      hasActionPermission(adminProfile, 'finance.reconciliation.confirm') &&
      isSingleFactReconciliationSource(source)
    if (!canRun) {
      message.warning('当前记录状态或权限已变化，请刷新后重试')
      return
    }
    setFinanceSourceContext({ action, source })
  }

  const closeFinanceSourceAction = () => {
    if (financeSourceInFlightRef.current) return
    setFinanceSourceContext(null)
  }

  const submitFinanceSourceAction = async (values) => {
    const action = financeSourceContext?.action
    const source = financeSourceContext?.source
    if (financeSourceInFlightRef.current || !action || !source?.id) return

    const config = financeBusinessSourceActionConfig(action)
    const scope = `${action}:${source.id}`
    let attempt
    try {
      const payload = {
        ...buildFinanceBusinessSourcePayload(action, values, source),
        customer_key: activeCustomerKey || undefined,
      }
      attempt = financeSourceAttemptsRef.current.prepare(scope, payload)
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备财务记录'))
      return
    }

    financeSourceInFlightRef.current = true
    setFinanceSourceLoading(true)
    try {
      await createReconciliationFromFinanceFact(attempt.params)
      financeSourceAttemptsRef.current.settle(scope, attempt, null)
      setFinanceSourceContext(null)
      message.success(config.successMessage)
      resetPaginationForKey(currentActiveKey)
    } catch (error) {
      const retained = financeSourceAttemptsRef.current.settle(
        scope,
        attempt,
        error
      )
      if (retained) {
        message.warning(
          '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
        )
      } else {
        message.error(getActionErrorMessage(error, config.title))
      }
    } finally {
      financeSourceInFlightRef.current = false
      setFinanceSourceLoading(false)
    }
  }
  return {
    financeSourceContext,
    financeSourceLoading,
    financeSourceInitialValues,
    openFinanceSourceAction,
    closeFinanceSourceAction,
    submitFinanceSourceAction,
  }
}
