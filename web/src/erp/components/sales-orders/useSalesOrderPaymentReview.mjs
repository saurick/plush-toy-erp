import { useCallback, useRef } from 'react'

import { modal } from '@/common/utils/antdApp'
import { normalizeOptionalNonNegativeInteger } from '../../utils/sourceDocumentValues.mjs'

export function useSalesOrderPaymentReview({
  customers = [],
  form,
}) {
  const paymentConditionSnapshotRef = useRef({
    method: '',
    termDays: undefined,
  })

  const readPaymentCondition = useCallback(() => {
    const values = form.getFieldsValue(['payment_method', 'payment_term_days'])
    return {
      method: String(values.payment_method || '').trim(),
      termDays: normalizeOptionalNonNegativeInteger(values.payment_term_days),
    }
  }, [form])

  const rememberPaymentCondition = useCallback((values = {}) => {
    paymentConditionSnapshotRef.current = {
      method: String(values.payment_method || '').trim(),
      termDays: normalizeOptionalNonNegativeInteger(values.payment_term_days),
    }
  }, [])

  const hasPricedOrderLines = useCallback(() => {
    const lines = form.getFieldValue('items')
    return (Array.isArray(lines) ? lines : []).some((line) =>
      ['unit_price', 'amount'].some((field) =>
        String(line?.[field] ?? '').trim()
      )
    )
  }, [form])

  const clearOrderLinePrices = useCallback(() => {
    const lines = form.getFieldValue('items')
    form.setFieldValue(
      'items',
      (Array.isArray(lines) ? lines : []).map((line) => ({
        ...line,
        unit_price: '',
        amount: '',
      }))
    )
  }, [form])

  const requestPaymentConditionPriceReview = useCallback(() => {
    const current = readPaymentCondition()
    const previous = paymentConditionSnapshotRef.current
    if (
      current.method === previous.method &&
      current.termDays === previous.termDays
    ) {
      return
    }
    paymentConditionSnapshotRef.current = current
    if (!hasPricedOrderLines()) {
      return
    }
    modal.confirm({
      maskClosable: true,
      centered: true,
      title: '付款条件已变化，请核对单价',
      content:
        '付款方式或账期会影响本单成交价。系统不会自动重算单价，请选择保留当前单价或清空明细单价后重新报价。',
      okText: '清空单价重新报价',
      cancelText: '保留当前单价',
      onOk: clearOrderLinePrices,
    })
  }, [clearOrderLinePrices, hasPricedOrderLines, readPaymentCondition])

  const applyCustomerPaymentDefaults = useCallback(
    (customerID) => {
      const customer = customers.find((item) => item.id === customerID)
      const termDays = normalizeOptionalNonNegativeInteger(
        customer?.default_payment_term_days
      )
      form.setFieldsValue({
        payment_method: customer?.default_payment_method || undefined,
        payment_term_days: termDays,
      })
      requestPaymentConditionPriceReview()
    },
    [customers, form, requestPaymentConditionPriceReview]
  )

  return {
    applyCustomerPaymentDefaults,
    rememberPaymentCondition,
    requestPaymentConditionPriceReview,
  }
}
