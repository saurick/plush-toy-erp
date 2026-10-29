import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Spin } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { ProductionExceptionStatus } from '../../../common/consts/statuses.generated.mjs'
import MaterialSupplierSelect from '../master-data/MaterialSupplierSelect.jsx'
import { useProcessSubmissionReceipt } from '../workflow/ProcessSubmissionReceipt.jsx'
import ProcessSubmissionRoute from '../workflow/ProcessSubmissionRoute.jsx'
import { unitQuantityRule } from '../../utils/unitQuantity.mjs'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import { getProductionExceptionContext, submitProductionException } from '../../api/operationalFactApi.mjs'
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
  const showProcessSubmissionReceipt = useProcessSubmissionReceipt()
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState(null)
  const [contextError, setContextError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const decisionType = Form.useWatch('decision_type', form)
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
      requested_quantity: '',
      reason: '生产在制品检验不合格',
    })
  }, [form, inspection?.inspection_no, open])
  useEffect(() => {
    if (!open || !inspection?.id) return undefined
    const controller = new AbortController()
    setContext(null)
    setContextError('')
    getProductionExceptionContext(inspection.id, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return
        if (value.production_wip_batch_id !== Number(inspection.production_wip_batch_id)) throw new Error('异常来源不一致，请重新打开')
        setContext(value)
        form.setFieldsValue({ requested_quantity: value.quantity })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setContextError(getActionErrorMessage(error, '读取异常来源'))
      })
    return () => controller.abort()
  }, [form, inspection?.id, inspection?.production_wip_batch_id, open, reloadKey])
  const submit = async () => {
    if (!context || loading) return
    let values
    try { values = await form.validateFields() } catch { return }
    const payload = {
      decision_no: values.decision_no.trim(),
      decision_type: values.decision_type,
      production_wip_batch_id: Number(inspection?.production_wip_batch_id || 0),
      quality_inspection_id: Number(inspection?.id || 0),
      requested_quantity: String(values.requested_quantity).trim(),
      reason: values.reason.trim(),
      ...(['REWORK_ORIGINAL', 'REWORK_SWITCH', 'REMAKE'].includes(values.decision_type) ? {
        target_operation_id: values.decision_type === 'REMAKE' ? context.fabric_operation_id : context.operation_id,
        ...(values.decision_type === 'REWORK_ORIGINAL'
          ? context.original_supplier_id ? { target_supplier_id: context.original_supplier_id } : {}
          : { target_supplier_id: values.target_supplier_id }),
      } : {}),
    }
    const attempt = attempts.current.prepare(
      `production-exception:${inspection?.id || 0}`,
      payload
    )
    setLoading(true)
    try {
      const created = await submitProductionException(attempt.params)
      if (!created?.id || created.status !== ProductionExceptionStatus.SUBMITTED) {
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
      showProcessSubmissionReceipt({ result: processData, record: next, title: '生产异常申请已提交' })
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
    <BusinessModal
      taskInline
      form={form}
      size="localAction"
      title="决定质量异常处理方案"
      open={open}
      confirmLoading={loading}
      maskClosable={!loading}
      okText="提交方案审批"
      okButtonProps={{ disabled: !context || Boolean(contextError) }}
      cancelText="返回"
      onCancel={() => !loading && onClose?.()}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message={context?.stock_disposition_required
          ? '此批已有成品收仓记录。审批后由仓库办理库存处置，再进入返工、补做或终止分支。'
          : '业务确定方案，审批后由生产安排执行。原检验结果、原加工厂和原批次保留追溯。'}
      />
      {contextError ? <Alert type="error" message={contextError} action={<Button onClick={() => setReloadKey((value) => value + 1)}>重新读取</Button>} /> : null}
      {!context && !contextError ? <Spin /> : null}
      {context ? <p>{context.batch_no} · {context.operation_name} · {context.quantity} {context.unit_name} · {context.original_supplier_name || '本厂加工'}</p> : null}
      <ProcessSubmissionRoute processKey="production_exception_approval" customerKey={customerKey} open={open} />
      <Form
        form={form}
        name="production-exception-request"
        layout="vertical"
        disabled={loading || !context}
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
          label="处理方案"
          rules={[{ required: true, message: '请选择处理方案' }]}
        >
          <Select
            placeholder="请选择处理方案"
            onChange={() => form.setFieldsValue({ target_supplier_id: undefined })}
            options={[
              { value: 'REWORK_ORIGINAL', label: context?.original_supplier_id ? '原厂返工（使用原货）' : '本厂返工（使用原货）' },
              { value: 'REWORK_SWITCH', label: '换厂返工（使用原货）' },
              { value: 'REMAKE', label: '补料重做（重新发布料）' },
              { value: 'SCRAP', label: '放弃本批（报废，不补做）' },
              { value: 'WIP_CONCESSION', label: '在制品让步' },
            ]}
          />
        </Form.Item>
        {['REWORK_SWITCH', 'REMAKE'].includes(decisionType) ? <Form.Item name="target_supplier_id" label={decisionType === 'REMAKE' ? '重新加工的厂商' : '接手返工的厂商'} rules={[{ required: true, message: '请选择加工厂' }, { validator: (_, value) => decisionType === 'REWORK_SWITCH' && value === context?.original_supplier_id ? Promise.reject(new Error('换厂返工请选择其他加工厂')) : Promise.resolve() }]}><MaterialSupplierSelect /></Form.Item> : null}
        {decisionType === 'REMAKE' ? <Alert type="info" message="原问题货终止流转，按冻结用料要求生成新一批裁片需求。新合同需重新发料，后续重新点数、质检。" /> : null}
        {decisionType === 'SCRAP' ? <Alert type="warning" message="本方案终止此批货，保留订单交付缺口；不会自动取消订单或生成补做数量。" /> : null}
        <Form.Item
          name="requested_quantity"
          label="异常批次数量"
          rules={[
            unitQuantityRule(context?.unit_precision, { positive: true }),
            { required: true },
          ]}
        >
          <Input inputMode="decimal" readOnly />
        </Form.Item>
        <Form.Item
          name="reason"
          label="申请原因"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </BusinessModal>
  )
}
