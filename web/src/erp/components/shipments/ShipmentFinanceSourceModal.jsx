import React, { useEffect } from 'react'
import { Alert, Descriptions, Form, Input, Modal, Select } from 'antd'

import {
  localDateTimeInputValue,
  SHIPMENT_FINANCE_INVOICE_CATEGORY_OPTIONS,
  shipmentFinanceSourceActionConfig,
} from '../../utils/shipmentFinanceSourceAction.mjs'

function shipmentCustomerText(shipment = {}) {
  const snapshot = shipment?.customer_snapshot
  if (typeof snapshot === 'string' && snapshot.trim()) return snapshot.trim()
  if (snapshot?.name) return String(snapshot.name).trim()
  return shipment?.customer_id ? '客户已关联' : '客户待核对'
}

export default function ShipmentFinanceSourceModal({
  action,
  open,
  shipment,
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const config = shipmentFinanceSourceActionConfig(action || 'receivable')

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({ occurred_at: localDateTimeInputValue() })
  }, [action, form, open, shipment?.id])

  const submit = async () => {
    const values = await form.validateFields()
    await onSubmit?.(values)
  }

  return (
    <Modal
      title={config.title}
      open={open}
      okText={config.okText}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      onCancel={onCancel}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message="客户、金额和应收账期由来源单据确定；提交后只生成待确认草稿。"
      />
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          {
            key: 'shipment',
            label: '出货单',
            children: shipment?.shipment_no || '出货单待核对',
          },
          {
            key: 'customer',
            label: '客户',
            children: shipmentCustomerText(shipment),
          },
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        {config.requiresInvoiceCategory ? (
          <Form.Item
            name="invoice_category"
            label="发票类别"
            rules={[{ required: true, message: '请选择发票类别' }]}
          >
            <Select
              placeholder="请选择发票类别"
              options={SHIPMENT_FINANCE_INVOICE_CATEGORY_OPTIONS}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="occurred_at" label="发生时间">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
