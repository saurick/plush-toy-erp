import { useState } from 'react'
import { Form } from 'antd'

import {
  FinancePaymentStatus,
  ProcessStatus,
} from '../../../common/consts/statuses.generated.mjs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  reverseFinanceAllocation,
  cancelFinancePayment,
  reverseFinancePayment,
} from '../../api/operationalFactApi.mjs'
import { getFinancePaymentApprovalProcess } from '../../api/customerConfigApi.mjs'

import { trimOptional } from '../../utils/sourceDocumentValues.mjs'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'

export default function useFinancePaymentAdjustments({
  customerKey,
  currentPayment,
  setLoading,
  rememberPayment,
  recoverPayment,
  loadReferences,
}) {
  const [unallocateOpen, setUnallocateOpen] = useState(false)

  const [unallocateForm] = Form.useForm()

  const [cancelOpen, setCancelOpen] = useState(false)

  const [reverseOpen, setReverseOpen] = useState(false)

  const [cancelForm] = Form.useForm()

  const [reverseForm] = Form.useForm()

  const reverseAllocation = async () => {
    let values
    try {
      values = await unallocateForm.validateFields()
    } catch {
      return
    }
    setLoading(true)
    try {
      const payment = await reverseFinanceAllocation({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: currentPayment.id,
        expected_version: currentPayment.version,
        allocation_id: Number(values.allocation_id),
        reason: values.reason.trim(),
      })
      rememberPayment(payment)
      setUnallocateOpen(false)
      await loadReferences()
      message.success('抵扣已撤销，款项保留，可重新抵扣或按审批办理退款')
    } catch (error) {
      await recoverPayment(currentPayment.id, true)
      message.error(getActionErrorMessage(error, '撤销抵扣'))
    } finally {
      setLoading(false)
    }
  }

  const openCancel = async () => {
    if (!currentPayment?.id) return
    setLoading(true)
    try {
      const processData = await getFinancePaymentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        finance_payment_id: currentPayment.id,
      })
      const payment = processData.source_readback
      rememberPayment(payment)
      const processStatus =
        processData.process_context?.process_instance?.status || ''
      const allowed =
        (payment.status === FinancePaymentStatus.DRAFT &&
          !processData.process_context) ||
        (payment.status === FinancePaymentStatus.APPROVED &&
          processStatus === ProcessStatus.BLOCKED)
      if (!allowed) {
        message.warning(
          payment.status === FinancePaymentStatus.DRAFT
            ? '该收付款已进入审批，请先在任务中心驳回或阻塞流程'
            : payment.status === FinancePaymentStatus.APPROVED
              ? '只有流程受阻且尚未过账的收付款可以取消'
              : '当前状态不能取消收付款'
        )
        return
      }
      cancelForm.resetFields()
      setCancelOpen(true)
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对收付款取消条件'))
    } finally {
      setLoading(false)
    }
  }

  const cancelPayment = async () => {
    let values
    try {
      values = await cancelForm.validateFields(['reason'])
    } catch {
      return
    }
    setLoading(true)
    try {
      const payment = await cancelFinancePayment({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: currentPayment.id,
        expected_version: currentPayment.version,
        reason: trimOptional(values.reason),
      })
      rememberPayment(payment)
      setCancelOpen(false)
      await loadReferences()
      message.success(
        '收付款已取消；如流程已有审批效果，系统会保留恢复记录，供管理员继续核对处理'
      )
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        const recovered = await recoverPayment(currentPayment.id, true)
        if (recovered?.status === FinancePaymentStatus.CANCELLED) {
          setCancelOpen(false)
          message.success('已重新读取收付款取消结果')
          return
        }
      }
      message.error(getActionErrorMessage(error, '取消收付款'))
    } finally {
      setLoading(false)
    }
  }

  const reversePayment = async () => {
    let values
    try {
      values = await reverseForm.validateFields(['reason'])
    } catch {
      return
    }
    setLoading(true)
    try {
      const payment = await reverseFinancePayment({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: currentPayment.id,
        expected_version: currentPayment.version,
        reason: trimOptional(values.reason),
      })
      rememberPayment(payment)
      setReverseOpen(false)
      await loadReferences()
      message.success('收付款已冲销，原核销金额已恢复')
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        const recovered = await recoverPayment(currentPayment.id, true)
        if (recovered?.status === FinancePaymentStatus.REVERSED) {
          setReverseOpen(false)
          message.success('已重新读取收付款冲销结果')
          return
        }
      }
      message.error(getActionErrorMessage(error, '冲销收付款'))
    } finally {
      setLoading(false)
    }
  }

  return {
    unallocateOpen,
    setUnallocateOpen,
    unallocateForm,
    cancelOpen,
    setCancelOpen,
    reverseOpen,
    setReverseOpen,
    cancelForm,
    reverseForm,
    reverseAllocation,
    openCancel,
    cancelPayment,
    reversePayment,
  }
}
