import { useState } from 'react'
import { Form } from 'antd'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'

import { showPageLoadError } from '../PageLoadFeedback.jsx'

import { FinancePaymentStatus } from '../../../common/consts/statuses.generated.mjs'

import { useProcessSubmissionReceipt } from '../workflow/ProcessSubmissionReceipt.jsx'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  allocateFinancePayment,
  listFinancePaymentAllocationCandidates,
} from '../../api/operationalFactApi.mjs'
import {
  executeFinancePaymentPost,
  findExceptionProcessActiveNode,
  getFinancePaymentApprovalProcess,
  startFinancePaymentApprovalProcess,
} from '../../api/customerConfigApi.mjs'

import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'

import {
  validateFinanceAllocationDraft,
  financePaymentPostMatchesIntent,
  pendingFinanceAllocationAttempt,
} from '../../utils/financePaymentAllocation.mjs'

export default function useFinancePaymentAllocation({
  customerKey,
  currentPayment,
  setFinanceFacts,
  setLoading,
  setReferenceLoading,
  attemptsRef,
  rememberPayment,
  recoverPayment,
  loadReferences,
  allocationCandidates,
}) {
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const showProcessSubmissionReceipt = useProcessSubmissionReceipt()
  const [allocationOpen, setAllocationOpen] = useState(false)

  const [allocationForm] = Form.useForm()

  const ensurePaymentApprovalProcess = async () => {
    if (
      !currentPayment?.id ||
      currentPayment.status !== FinancePaymentStatus.DRAFT
    ) {
      return
    }
    setLoading(true)
    try {
      let processData = await getFinancePaymentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        finance_payment_id: currentPayment.id,
      })
      const alreadyStarted = Boolean(processData?.process_context)
      if (!alreadyStarted) {
        try {
          processData = await startFinancePaymentApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            finance_payment_id: currentPayment.id,
            idempotency_key: `finance-payment-approval/${currentPayment.id}`,
          })
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) throw error
          processData = await getFinancePaymentApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            finance_payment_id: currentPayment.id,
          })
          if (!processData?.process_context) throw error
        }
      }
      if (!processData?.process_context || !processData?.source_readback?.id) {
        throw Object.assign(new Error('收付款审批流结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      rememberPayment(processData.source_readback)
      await loadReferences()
      showProcessSubmissionReceipt({
        result: processData,
        record: processData.source_readback,
        title: alreadyStarted ? '收付款审批流已存在' : '收付款审批流已恢复发起',
      })
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对收付款审批流'))
    } finally {
      setLoading(false)
    }
  }

  const openAllocation = async () => {
    if (!currentPayment) return
    setReferenceLoading(true)
    try {
      const rows = await listFinancePaymentAllocationCandidates({
        id: currentPayment.id,
      })
      setFinanceFacts(rows)
      setAllocationOpen(true)
    } catch (error) {
      showPageLoadError(error, '加载可抵扣的应收应付')
    } finally {
      setReferenceLoading(false)
    }
  }

  const initializeAllocationForm = (visible) => {
    if (!visible) return
    allocationForm.resetFields()
    const pending = attemptsRef.current.peek(
      `finance-allocation:${currentPayment?.id}`
    )
    if (pending) {
      allocationForm.setFieldsValue({
        allocations: pending.params.allocations.map((item) => ({
          ...item,
          label:
            allocationCandidates.find(
              (fact) => fact.id === item.finance_fact_id
            )?.fact_no || '上次抵扣来源',
        })),
      })
      return
    }
    allocationForm.setFieldsValue({
      allocations: allocationCandidates.map((fact) => ({
        finance_fact_id: fact.id,
        label: `${fact.fact_no || '财务记录'} / 原金额 ${fact.amount || '-'} ${fact.currency || ''}`,
        outstanding_amount: fact.outstanding_amount,
        amount: '',
      })),
    })
  }

  const postPayment = async (cashOnly = false) => {
    const existingCash = currentPayment?.status === FinancePaymentStatus.POSTED
    let values
    try {
      values = cashOnly
        ? { allocations: [] }
        : await allocationForm.validateFields()
    } catch {
      return
    }
    const allocations = (values.allocations || [])
      .filter((item) => String(item.amount || '').trim())
      .map((item) => ({
        finance_fact_id: Number(item.finance_fact_id),
        amount: String(item.amount).trim(),
      }))
    const allocationScope = `finance-allocation:${currentPayment.id}`
    const allocationPayload = {
      id: currentPayment.id,
      expected_version: currentPayment.version,
      allocations,
      ...(customerKey ? { customer_key: customerKey } : {}),
    }
    let pendingAttempt
    try {
      pendingAttempt = existingCash
        ? pendingFinanceAllocationAttempt(
            attemptsRef.current,
            allocationScope,
            allocationPayload
          )
        : null
    } catch {
      message.warning(
        '上次抵扣结果尚未确认，请保留原抵扣内容并重新确认后再办理新的抵扣'
      )
      return
    }
    const allocationCheck = pendingAttempt
      ? { ok: true }
      : validateFinanceAllocationDraft({
          allocations,
          candidates: allocationCandidates,
          paymentAmount: existingCash
            ? currentPayment?.available_amount
            : currentPayment?.amount,
          allowPartial: existingCash,
        })
    if (!cashOnly && allocationCheck.reason === 'EMPTY') {
      message.warning('请至少填写一笔核销金额')
      return
    }
    if (!cashOnly && allocationCheck.reason === 'SOURCE_CHANGED') {
      message.error('核销来源或未核销金额已变化，请重新打开核销窗口')
      return
    }
    if (!cashOnly && allocationCheck.reason === 'EXCEEDS_OUTSTANDING') {
      message.warning(
        `${
          allocationCheck.financeFactNo || '财务记录'
        }的本次核销金额超过未核销金额`
      )
      return
    }
    if (!cashOnly && allocationCheck.reason === 'TOTAL_MISMATCH') {
      message.warning(
        existingCash
          ? `抵扣合计不能超过可用余额 ${currentPayment?.available_amount || '0'}`
          : `核销合计 ${allocationCheck.total || '0'} 必须等于本次收付款金额 ${currentPayment?.amount || '-'}`
      )
      return
    }
    setLoading(true)
    try {
      if (existingCash) {
        const scope = allocationScope
        const attempt =
          pendingAttempt ||
          attemptsRef.current.prepare(scope, allocationPayload)
        try {
          const payment = await allocateFinancePayment(attempt.params)
          attemptsRef.current.settle(scope, attempt, null)
          rememberPayment(payment)
          setAllocationOpen(false)
          reportBusinessResult('已抵扣应收应付，剩余款项继续保留', payment)
          await loadReferences()
          message.success('已抵扣应收应付，剩余款项继续保留')
        } catch (error) {
          attemptsRef.current.settle(scope, attempt, error)
          throw error
        }
        return
      }
      const processData = await getFinancePaymentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        finance_payment_id: currentPayment.id,
      })
      const node = findExceptionProcessActiveNode(
        processData,
        'post_finance_payment'
      )
      const execution = await executeFinancePaymentPost({
        ...(customerKey ? { customer_key: customerKey } : {}),
        process_instance_id: processData.process_context.process_instance.id,
        process_node_instance_id: node.id,
        expected_version: node.version,
        finance_payment_id: currentPayment.id,
        idempotency_key: `finance-payment-post/${currentPayment.id}/${node.id}`,
        allocations,
        ...(cashOnly ? { cash_only: true } : {}),
      })
      const payment = execution.source_readback
      rememberPayment(payment)
      setAllocationOpen(false)
      reportBusinessResult(cashOnly ? '实际收付已确认，款项余额已更新' : '收付款已过账并完成核销', payment)
      await loadReferences()
      message.success(
        cashOnly ? '实际收付已确认，款项余额已更新' : '收付款已过账并完成核销'
      )
    } catch (error) {
      if (!existingCash && isSourceBusinessActionResultUnknown(error)) {
        try {
          const processData = await getFinancePaymentApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            finance_payment_id: currentPayment.id,
          })
          const payment = processData.source_readback
          rememberPayment(payment)
          if (
            financePaymentPostMatchesIntent(
              payment,
              currentPayment,
              allocations
            )
          ) {
            setAllocationOpen(false)
            reportBusinessResult(cashOnly ? '已重新读取实际收付结果' : '已重新读取收付款过账与核销结果', payment)
            await loadReferences()
            message.success(
              cashOnly
                ? '已重新读取实际收付结果'
                : '已重新读取收付款过账与核销结果'
            )
            return
          }
        } catch {
          await recoverPayment(currentPayment.id, true)
        }
      } else {
        await recoverPayment(currentPayment.id, true)
      }
      message.error(
        getActionErrorMessage(
          error,
          existingCash
            ? '抵扣应收应付'
            : cashOnly
              ? '确认实际收付'
              : '过账并核销收付款'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  return {
    allocationOpen,
    setAllocationOpen,
    allocationForm,
    ensurePaymentApprovalProcess,
    openAllocation,
    initializeAllocationForm,
    postPayment,
  }
}
