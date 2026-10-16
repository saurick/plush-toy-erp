import { useState } from 'react'
import { Form } from 'antd'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'

import {
  buildFinanceCreditCommand,
  executeFinanceCreditCommand,
} from '../../utils/financeCreditSubmission.mjs'

export default function useFinanceCreditActions({
  customerKey,
  currentCredit,
  setCurrentCredit,
  financeFacts,
  setLoading,
  attemptsRef,
  loadFinanceFactReferences,
  loadReferences,
}) {
  const [creditOpen, setCreditOpen] = useState(false)

  const [creditForm] = Form.useForm()

  const submitCredit = async (reverse = false) => {
    let values
    try {
      values = await creditForm.validateFields()
    } catch {
      return
    }
    const source = financeFacts.find(
      (fact) => Number(fact.id) === Number(values.finance_fact_id)
    )
    let command
    try {
      command = buildFinanceCreditCommand({
        reverse,
        values,
        source,
        currentCredit,
        customerKey,
      })
    } catch (error) {
      message[error.isCreditAmountWarning ? 'warning' : 'error'](
        getActionErrorMessage(error, '准备红冲记录')
      )
      return
    }
    setLoading(true)
    try {
      const result = await executeFinanceCreditCommand({
        command,
        attemptStore: attemptsRef.current,
      })
      if (result.outcome === 'unconfirmed') {
        message[result.retained ? 'warning' : 'error'](
          result.retained
            ? '红冲结果暂时无法确认，请保持内容不变后重试'
            : getActionErrorMessage(
                result.error,
                reverse ? '冲销红冲记录' : '登记红冲'
              )
        )
        return
      }
      setCurrentCredit({
        ...result.credit,
        source_no: source?.fact_no || currentCredit?.source_no,
      })
      setCreditOpen(false)
      await loadReferences()
      message.success(
        result.recovered
          ? '已重新读取红冲冲销结果'
          : reverse
            ? '红冲记录已冲销'
            : '红冲已登记'
      )
    } catch (error) {
      message.error(
        getActionErrorMessage(error, reverse ? '冲销红冲记录' : '登记红冲')
      )
    } finally {
      setLoading(false)
    }
  }

  const openCredit = async (reverse = false) => {
    if (!reverse) {
      const rows = await loadFinanceFactReferences()
      if (rows === null) return
    }
    creditForm.resetFields()
    creditForm.setFieldsValue({
      credit_note_no: sourceBusinessActionNo(
        reverse ? 'CR-REV' : 'CR',
        currentCredit?.credit_note_no || 'FINANCE',
        sourceBusinessActionUUID()
      ),
      reason: '',
    })
    setCreditOpen(reverse ? 'reverse' : 'create')
  }

  return { creditOpen, setCreditOpen, creditForm, submitCredit, openCredit }
}
