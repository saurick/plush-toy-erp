import React, { useEffect } from 'react'
import { Alert, Descriptions, Form, Input, Modal } from 'antd'

import {
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'
import { outsourcingFactProductSKUText } from '../../utils/outsourcingFactDisplay.mjs'

function formattedDateTime(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000))
}

export default function OutsourcingReturnQualityInspectionModal({
  open,
  order,
  fact,
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      inspection_no: sourceBusinessActionNo(
        'QI-OUT',
        fact?.fact_no || 'RETURN',
        sourceBusinessActionUUID()
      ),
      note: '',
    })
  }, [fact?.fact_no, fact?.id, form, open])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      await onSubmit?.(values)
    } catch (error) {
      if (!error?.errorFields) throw error
    }
  }

  return (
    <Modal
      className="erp-outsourcing-return-quality-modal"
      title="发起委外回货质检"
      open={open}
      width={680}
      okText="生成质检草稿"
      cancelText="取消"
      confirmLoading={loading}
      closable={!loading}
      destroyOnHidden
      forceRender
      keyboard={!loading}
      maskClosable={!loading}
      onCancel={() => {
        if (!loading) onCancel?.()
      }}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message="产品、仓库、批次和委外来源由已过账回货记录确定；质检判定不会改写委外订单。"
      />
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          {
            key: 'order',
            label: '委外订单',
            children: order?.outsourcing_order_no || '委外订单已关联',
          },
          {
            key: 'return',
            label: '回货单号',
            children: fact?.fact_no || '回货记录已关联',
          },
          { key: 'status', label: '回货状态', children: '已过账' },
          {
            key: 'quantity',
            label: '回货数量',
            children: String(fact?.quantity || '-'),
          },
          {
            key: 'product_sku',
            label: '产品规格',
            children: outsourcingFactProductSKUText(fact),
          },
          {
            key: 'occurred_at',
            label: '回货时间',
            children: formattedDateTime(fact?.occurred_at),
          },
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="inspection_no"
          label="质检单号（自动）"
          rules={[
            { required: true, whitespace: true, message: '请填写质检单号' },
          ]}
        >
          <Input maxLength={64} autoComplete="off" />
        </Form.Item>
        <Form.Item name="note" label="送检备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
