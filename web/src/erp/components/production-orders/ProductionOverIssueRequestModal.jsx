import React, { useEffect, useRef, useState } from 'react'
import { Alert, Descriptions, Form, Input, Modal } from 'antd'
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
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

function requirementLabel(requirement) {
  return (
    [
      requirement?.material_code_snapshot,
      requirement?.material_name_snapshot,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ') || '物料需求已关联'
  )
}

export default function ProductionOverIssueRequestModal({
  open,
  order,
  requirement,
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
        'PROD-OVER',
        order?.order_no || 'ORDER',
        sourceBusinessActionUUID()
      ),
      requested_quantity: '',
      reason: '',
    })
  }, [form, open, order?.order_no, requirement?.id])

  const submit = async () => {
    const values = await form.validateFields()
    const payload = {
      customer_key: customerKey || undefined,
      decision_no: String(values.decision_no || '').trim(),
      decision_type: 'OVER_ISSUE',
      production_order_id: Number(order?.id || 0),
      production_order_item_id: Number(
        requirement?.production_order_item_id || 0
      ),
      production_material_requirement_id: Number(requirement?.id || 0),
      requested_quantity: String(values.requested_quantity || '').trim(),
      reason: String(values.reason || '').trim(),
    }
    const scope = `production-over-issue:${order?.id || 0}:${requirement?.id || 0}`
    const attempt = attempts.current.prepare(scope, payload)
    setLoading(true)
    try {
      const created = await submitProductionException(attempt.params)
      if (
        !created?.id ||
        created.decision_type !== 'OVER_ISSUE' ||
        created.status !== 'SUBMITTED'
      ) {
        throw Object.assign(new Error('超领申请结果暂时无法确认'), {
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
      attempts.current.settle(scope, attempt, null)
      message.success('超领申请已提交；批准额度须在正式领料时使用')
      onChanged?.(next)
      onClose?.()
    } catch (error) {
      const retained = attempts.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, '提交超领申请')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="申请生产超领"
      open={open}
      width={680}
      okText="提交申请"
      cancelText="返回"
      confirmLoading={loading}
      closable={!loading}
      maskClosable={!loading}
      onCancel={() => !loading && onClose?.()}
      onOk={submit}
    >
      <Alert
        type="warning"
        showIcon
        message="批准只增加该物料需求的可领额度，不会自动出库；实际库存变化仍须走正式领料并过账。"
      />
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'order',
            label: '生产订单',
            children: order?.order_no || '已关联生产订单',
          },
          {
            key: 'material',
            label: '需求物料',
            children: requirementLabel(requirement),
          },
          {
            key: 'planned',
            label: '计划需求',
            children: requirement?.planned_quantity || '0',
          },
          {
            key: 'approved-over-issue',
            label: '已批准超领',
            children: requirement?.approved_over_issue_quantity || '0',
          },
          {
            key: 'effective-limit',
            label: '当前可领上限',
            children: requirement?.effective_limit_quantity || '0',
          },
          {
            key: 'issued',
            label: '已过账领料',
            children: requirement?.issued_quantity || '0',
          },
        ]}
      />
      <Form
        form={form}
        layout="vertical"
        disabled={loading}
        preserve={false}
        style={{ marginTop: 12 }}
      >
        <Form.Item
          name="decision_no"
          label="申请单号"
          rules={[
            { required: true, whitespace: true, message: '请填写申请单号' },
          ]}
        >
          <Input maxLength={64} autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="requested_quantity"
          label="申请增加额度"
          rules={[
            { required: true, message: '请填写申请增加额度' },
            {
              validator: (_, value) =>
                isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                  ? Promise.resolve()
                  : Promise.reject(new Error('申请增加额度必须大于 0')),
            },
          ]}
        >
          <Input inputMode="decimal" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="reason"
          label="超领原因"
          rules={[
            { required: true, whitespace: true, message: '请填写超领原因' },
          ]}
        >
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
