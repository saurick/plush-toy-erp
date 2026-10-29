import React, { useEffect, useRef, useState } from 'react'
import { Alert, Form, Input } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'

import BusinessModal from '../business-list/BusinessModal.jsx'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import { correctQualityInspectionResult } from '../../api/qualityApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message, modal } from '@/common/utils/antdApp'
import { isSourceBusinessActionResultUnknown, sourceBusinessActionNo, sourceBusinessActionUUID } from '../../utils/sourceBusinessAction.mjs'

export default function QualityInspectionCorrectionModal({ inspection, customerKey, onClose, onCreated }) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(null)
  const outlet = useBusinessPageContext()
  const stateRef = useRef({ dirty: false, saved: false, loading: false })
  stateRef.current.loading = loading
  const pendingRef = useRef(null)
  const sourceRef = useRef(inspection?.id)
  sourceRef.current = inspection?.id
  const activeRef = useRef(false)
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false } }, [])
  useEffect(() => {
    if (!inspection?.id) return
    const retained = pendingRef.current?.id === inspection.id ? pendingRef.current : null
    pendingRef.current = retained
    stateRef.current.dirty = false
    stateRef.current.saved = false
    setPending(retained)
    form.resetFields()
    form.setFieldsValue(retained || { correction_inspection_no: sourceBusinessActionNo('QI-RECHECK', 'QUALITY', sourceBusinessActionUUID()), reason: '' })
  }, [inspection?.id, inspection?.inspection_no, form])
  const confirmLeave = React.useCallback(async () => {
    if (stateRef.current.saved) return true
    if (stateRef.current.loading || pendingRef.current) {
      message.warning('请先确认本次复检结果，再离开办理。')
      return false
    }
    if (!stateRef.current.dirty) return true
    return new Promise((resolve) => modal.confirm({
      maskClosable: true,
      title: '放弃未保存的修改？',
      content: '本次复检单号和纠正原因尚未保存。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }))
  }, [])
  const registerLeave = outlet?.registerPageLeaveGuard
  useEffect(() => {
    if (!inspection) return undefined
    return registerLeave?.(confirmLeave)
  }, [inspection, registerLeave, confirmLeave])
  const create = async () => {
    if (!inspection?.id || loading) return
    const values = await form.validateFields()
    const request = pendingRef.current || { ...(customerKey ? { customer_key: customerKey } : {}), id: inspection.id, correction_inspection_no: values.correction_inspection_no.trim(), reason: values.reason.trim() }
    setLoading(true)
    try {
      const result = await correctQualityInspectionResult(request)
      if (!activeRef.current || sourceRef.current !== request.id) return
      pendingRef.current = null
      setPending(null)
      stateRef.current.dirty = false
      stateRef.current.saved = true
      await onCreated(result)
    } catch (error) {
      if (!activeRef.current || sourceRef.current !== request.id) return
      const unknown = isSourceBusinessActionResultUnknown(error)
      pendingRef.current = unknown ? request : null
      setPending(pendingRef.current)
      if (!unknown) message.error(getActionErrorMessage(error, '发起纠正复检'))
    } finally {
      if (activeRef.current) setLoading(false)
    }
  }
  return (
    <BusinessModal title="发起纠正复检" open={Boolean(inspection)} form={form} confirmLoading={loading} onCancel={async () => { if (await confirmLeave()) onClose() }} onOk={create} okText={pending ? '确认原复检结果' : '发起复检'} cancelText="返回办理" cancelButtonProps={{ disabled: Boolean(pending) }} closable={!pending} keyboard={!pending} maskClosable={!pending}>
      <p>原质检单：{inspection?.inspection_no}</p>
      <p>原判定或依据有误时保留原证据并生成待检单；已有生效下游业务时不能纠正，正常不合格按原处置流程办理。</p>
      {pending ? <Alert type="warning" showIcon message="结果暂时无法确认，已保留原内容；请重试确认，避免重复发起。" /> : null}
      <Form form={form} name="quality-correction" layout="vertical" disabled={loading || Boolean(pending)} onValuesChange={() => { stateRef.current.dirty = true }}>
        <Form.Item name="correction_inspection_no" label="复检单号" rules={[{ required: true, whitespace: true, message: '请填写复检单号' }]}><Input maxLength={64} /></Form.Item>
        <Form.Item name="reason" label="纠正原因" rules={[{ required: true, whitespace: true, message: '请填写纠正原因' }, { max: 255, message: '纠正原因不能超过 255 个字符' }]}><BusinessTextArea maxLength={255} minRows={3} /></Form.Item>
      </Form>
    </BusinessModal>
  )
}
