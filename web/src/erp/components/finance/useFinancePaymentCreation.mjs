import { useMemo, useState } from 'react'
import { Form } from 'antd'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'

import {
  FinancePaymentKind,
  FinancePaymentStatus,
} from '../../../common/consts/statuses.generated.mjs'

import { showProcessSubmissionReceipt } from '../workflow/ProcessSubmissionReceipt.jsx'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import { createFinancePayment } from '../../api/operationalFactApi.mjs'
import {
  getFinancePaymentApprovalProcess,
  startFinancePaymentApprovalProcess,
} from '../../api/customerConfigApi.mjs'

import { trimOptional } from '../../utils/sourceDocumentValues.mjs'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'

import { partyOption } from './financePaymentPresentation.jsx'

export default function useFinancePaymentCreation({
  customerKey,
  currentPayment,
  customers,
  suppliers,
  setLoading,
  attemptsRef,
  rememberPayment,
  loadReferences,
  sourceContext = null,
}) {
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const [paymentOpen, setPaymentOpen] = useState(false)

  const [refundSource, setRefundSource] = useState(null)

  const [paymentForm] = Form.useForm()

  const direction = Form.useWatch('direction', paymentForm)

  const paymentKind = Form.useWatch('kind', paymentForm)

  const partyIsCustomer =
    paymentKind === FinancePaymentKind.REFUND
      ? direction === 'DISBURSEMENT'
      : direction === 'RECEIPT'

  const partyOptions = useMemo(() => {
    const options = partyIsCustomer
      ? customers.map((item) => partyOption(item, '客户已关联'))
      : suppliers.map((item) => partyOption(item, '供应商已关联'))
    if (
      refundSource &&
      !options.some(
        (item) => Number(item.value) === Number(refundSource.counterparty_id)
      )
    ) {
      options.push({
        value: refundSource.counterparty_id,
        label: partyIsCustomer ? '原收款关联的客户' : '原付款关联的供应商',
      })
    }
    return options
  }, [customers, partyIsCustomer, suppliers, refundSource])

  const openPayment = () => {
    paymentForm.resetFields()
    setRefundSource(null)
    paymentForm.setFieldsValue({
      kind: FinancePaymentKind.SETTLEMENT,
      direction: 'RECEIPT',
      currency: 'CNY',
      ...(sourceContext?.values || {}),
    })
    setPaymentOpen(true)
  }

  const createPayment = async () => {
    let values
    try {
      values = await paymentForm.validateFields()
    } catch {
      return
    }
    const payload = {
      ...(customerKey ? { customer_key: customerKey } : {}),
      payment_no: trimOptional(values.payment_no),
      direction: values.direction,
      kind: values.kind,
      ...(values.kind === FinancePaymentKind.ADVANCE
        ? {
            source_type: values.source_type,
            source_id: Number(values.source_id),
          }
        : {}),
      ...(values.kind === FinancePaymentKind.REFUND
        ? { refund_of_payment_id: refundSource?.id }
        : {}),
      purpose_note: trimOptional(values.purpose_note),
      counterparty_type: partyIsCustomer ? 'CUSTOMER' : 'SUPPLIER',
      counterparty_id: Number(values.counterparty_id),
      amount: String(values.amount).trim(),
      currency: values.currency,
      account_ref: trimOptional(values.account_ref),
      evidence_ref: trimOptional(values.evidence_ref),
      ...(values.occurred_at
        ? { occurred_at: new Date(values.occurred_at).toISOString() }
        : {}),
    }
    const scope = `finance-payment:${payload.direction}:${payload.counterparty_id}`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setLoading(true)
    try {
      const created = await createFinancePayment(attempt.params)
      if (!created?.id || created.status !== FinancePaymentStatus.DRAFT) {
        throw Object.assign(new Error('收付款结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      let processData
      try {
        processData = await startFinancePaymentApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          finance_payment_id: created.id,
          idempotency_key: `finance-payment-approval/${created.id}`,
        })
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) throw error
        processData = await getFinancePaymentApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          finance_payment_id: created.id,
        })
        if (!processData?.process_context) throw error
      }
      const payment = processData.source_readback
      attemptsRef.current.settle(scope, attempt, null)
      rememberPayment(payment)
      setPaymentOpen(false)
      reportBusinessResult('收付款记录已创建并提交审批，尚未确认实际收付', payment)
      await loadReferences()
      showProcessSubmissionReceipt({
        result: processData,
        title:
          values.kind === FinancePaymentKind.SETTLEMENT
            ? '收付款记录已创建，审批通过后可选择应收或应付核销'
            : '收付款记录已创建，审批通过后由财务确认实际收付',
      })
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '提交结果暂时无法确认，请保持填写内容不变后重试'
          : getActionErrorMessage(error, '创建收付款记录')
      )
    } finally {
      setLoading(false)
    }
  }

  const openRefund = () => {
    if (!currentPayment || currentPayment.kind === FinancePaymentKind.REFUND) {
      return
    }
    setRefundSource(currentPayment)
    paymentForm.resetFields()
    paymentForm.setFieldsValue({
      kind: FinancePaymentKind.REFUND,
      direction:
        currentPayment.direction === 'RECEIPT' ? 'DISBURSEMENT' : 'RECEIPT',
      counterparty_id: currentPayment.counterparty_id,
      currency: currentPayment.currency,
    })
    setPaymentOpen(true)
  }

  return {
    paymentOpen,
    setPaymentOpen,
    refundSource,
    paymentForm,
    paymentKind,
    partyIsCustomer,
    partyOptions,
    openPayment,
    createPayment,
    openRefund,
  }
}
