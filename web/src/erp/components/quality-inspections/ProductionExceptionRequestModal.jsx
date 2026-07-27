import React, { useEffect, useRef, useState } from 'react'
import { Alert, Form, Input, Modal, Select } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import { submitProductionException } from '../../api/operationalFactApi.mjs'
import {
  getProductionExceptionApprovalProcess,
  startProductionExceptionApprovalProcess,
} from '../../api/customerConfigApi.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'

export default function ProductionExceptionRequestModal({
  open,
  inspection,
  customerKey,
  onClose,
  onChanged,
}) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const attempts = useRef(createSourceBusinessActionAttemptStore())
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      decision_no: sourceBusinessActionNo(
        'PROD-EX',
        inspection?.inspection_no || 'QUALITY',
        sourceBusinessActionUUID()
      ),
      decision_type: 'WIP_CONCESSION',
      requested_quantity: '',
      reason: '生产在制品检验不合格',
    })
  }, [form, inspection?.inspection_no, open])
  const submit = async () => {
    const values = await form.validateFields()
    const payload = {
      decision_no: values.decision_no.trim(),
      decision_type: values.decision_type,
      production_wip_batch_id: Number(inspection?.production_wip_batch_id || 0),
      quality_inspection_id: Number(inspection?.id || 0),
      requested_quantity: String(values.requested_quantity).trim(),
      reason: values.reason.trim(),
    }
    const attempt = attempts.current.prepare(
      `production-exception:${inspection?.id || 0}`,
      payload
    )
    setLoading(true)
    try {
      const created = await submitProductionException(attempt.params)
      if (!created?.id || created.status !== 'SUBMITTED') {
        throw Object.assign(new Error('生产异常申请结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      let processData
      try {
        processData = await startProductionExceptionApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          production_exception_id: created.id,
          idempotency_key: `production-exception-approval/${created.id}`,
        })
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) throw error
        processData = await getProductionExceptionApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          production_exception_id: created.id,
        })
        if (!processData?.process_context) throw error
      }
      const next = processData.source_readback
      attempts.current.settle(
        `production-exception:${inspection.id}`,
        attempt,
        null
      )
      message.success('生产异常申请已提交，请到任务中心审批')
      onChanged?.(next)
      onClose?.()
    } catch (error) {
      const retained = attempts.current.settle(
        `production-exception:${inspection?.id || 0}`,
        attempt,
        error
      )
      message[retained ? 'warning' : 'error'](
        retained
          ? '结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, '提交生产异常申请')
      )
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal
      title="提交生产异常申请"
      open={open}
      confirmLoading={loading}
      okText="提交申请"
      cancelText="返回"
      onCancel={() => !loading && onClose?.()}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message="这里只提交报废或让步申请；审批完成后仍须由生产岗位确认执行。"
      />
      <Form
        form={form}
        layout="vertical"
        disabled={loading}
        style={{ marginTop: 12 }}
      >
        <Form.Item
          name="decision_no"
          label="异常单号"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          name="decision_type"
          label="申请类型"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: 'WIP_CONCESSION', label: '在制品让步' },
              { value: 'SCRAP', label: '在制品报废' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="requested_quantity"
          label="申请数量"
          rules={[{ required: true }]}
        >
          <Input inputMode="decimal" />
        </Form.Item>
        <Form.Item
          name="reason"
          label="申请原因"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
