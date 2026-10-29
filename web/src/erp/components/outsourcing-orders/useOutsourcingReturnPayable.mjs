import { useCallback, useMemo, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { createPayableFromOutsourcingReturn, createPayableFromOutsourcingOrder } from '../../api/operationalFactApi.mjs'
import { BUSINESS_ROUTE_PATHS } from '../../utils/masterDataOrderView.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import {
  buildFinanceBusinessSourcePayload,
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  financeBusinessSourceFormValuesFromRequest,
} from '../../utils/financeBusinessSourceAction.mjs'
import {
  isPostedOutsourcingReturn,
  OUTSOURCING_RETURN_QUALITY_GATE_STATES,
  resolveOutsourcingReturnQualityGate,
} from '../../utils/qualityInspectionSourceAction.mjs'
import { relatedDocumentRoute } from '../../utils/relatedDocumentNavigation.mjs'

export function useOutsourcingReturnPayable({
  canCreatePayable,
  canCreateStagePayable,
  qualityInspectionByFactID,
  setReturnRecordsOpen,
  setReturnRecordsOrder,
  setRelatedReturnFacts,
  activeCustomerKey,
  canViewPayable,
  navigate,
}) {
  const [financeSourceFact, setFinanceSourceFact] = useState(null)
  const [financeSourceAction, setFinanceSourceAction] = useState(FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE)
  const stagePayable = financeSourceAction === FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_ORDER_PAYABLE
  const canCreateCurrentPayable = stagePayable ? canCreateStagePayable : canCreatePayable

  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)

  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )

  const financeSourceInFlightRef = useRef(false)

  const financeSourceScope = financeSourceFact?.id
    ? `${financeSourceAction}:${financeSourceFact.id}`
    : ''

  const financeSourceInitialValues = useMemo(() => {
    if (!financeSourceScope) return undefined
    const retained = financeSourceAttemptsRef.current.peek(financeSourceScope)
    return retained
      ? financeBusinessSourceFormValuesFromRequest(retained.params)
      : undefined
  }, [financeSourceScope])

  const openOutsourcingReturnPayable = useCallback(
    (fact) => {
      if (!canCreatePayable || !isPostedOutsourcingReturn(fact)) {
        message.warning('请先选择已过账的委外回货记录')
        return
      }
      const qualityGate = resolveOutsourcingReturnQualityGate(
        qualityInspectionByFactID?.[fact.id] || []
      )
      if (
        qualityGate.state !== OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED
      ) {
        message.warning(
          qualityGate.state === OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED
            ? '该委外回货质检不合格，请先完成返工、退回等质量处置'
            : '该委外回货尚未完成合格或让步接收判定，不能生成应付'
        )
        return
      }
      setReturnRecordsOpen(false)
      setReturnRecordsOrder(null)
      setRelatedReturnFacts([])
      setFinanceSourceAction(FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE)
      setFinanceSourceFact(fact)
    },
    [
      canCreatePayable,
      qualityInspectionByFactID,
      setRelatedReturnFacts,
      setReturnRecordsOpen,
      setReturnRecordsOrder,
    ]
  )

  const openOutsourcingOrderPayable = useCallback((order) => {
    if (!canCreateStagePayable) return
    setFinanceSourceAction(FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_ORDER_PAYABLE)
    setFinanceSourceFact(order)
  }, [canCreateStagePayable])

  const closeOutsourcingReturnPayable = useCallback(() => {
    if (financeSourceInFlightRef.current) return
    setFinanceSourceFact(null)
  }, [])

  const submitOutsourcingReturnPayable = useCallback(
    async (values) => {
      const fact = financeSourceFact
      if (financeSourceInFlightRef.current || !canCreateCurrentPayable || !fact?.id) {
        return
      }
      const scope = `${financeSourceAction}:${fact.id}`
      let attempt
      try {
        const payload = {
          ...buildFinanceBusinessSourcePayload(financeSourceAction, values, fact),
          customer_key: activeCustomerKey || undefined,
        }
        attempt = financeSourceAttemptsRef.current.prepare(scope, payload)
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备应付草稿'))
        return
      }

      financeSourceInFlightRef.current = true
      setFinanceSourceLoading(true)
      try {
        await (stagePayable ? createPayableFromOutsourcingOrder : createPayableFromOutsourcingReturn)(attempt.params)
        financeSourceAttemptsRef.current.settle(scope, attempt, null)
        setFinanceSourceFact(null)
        message.success('应付草稿已生成，请到应付管理核对并确认')
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
          message.error(getActionErrorMessage(error, '生成应付'))
        }
      } finally {
        financeSourceInFlightRef.current = false
        setFinanceSourceLoading(false)
      }
    },
    [activeCustomerKey, canCreateCurrentPayable, financeSourceFact, financeSourceAction, stagePayable]
  )

  const viewOutsourcingReturnPayable = useCallback(
    (fact) => {
      if (!fact?.id || !canViewPayable) return
      navigate(
        relatedDocumentRoute(
          BUSINESS_ROUTE_PATHS.payables,
          { source_type: 'OUTSOURCING_FACT', source_id: fact.id },
          {
            keyword: fact.fact_no,
            source: 'outsourcing-order',
            fields: ['source_no'],
          }
        )
      )
    },
    [canViewPayable, navigate]
  )
  return {
    financeSourceAction,
    openOutsourcingOrderPayable,
    financeSourceFact,
    financeSourceLoading,
    financeSourceInFlightRef,
    financeSourceInitialValues,
    openOutsourcingReturnPayable,
    closeOutsourcingReturnPayable,
    submitOutsourcingReturnPayable,
    viewOutsourcingReturnPayable,
  }
}
