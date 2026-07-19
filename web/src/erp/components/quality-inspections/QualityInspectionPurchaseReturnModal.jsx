import React, { useEffect } from 'react'
import { Alert, Descriptions, Form, Input, Modal } from 'antd'

import {
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

function localDateTimeValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export default function QualityInspectionPurchaseReturnModal({
  open,
  inspection,
  sourceSummary = {},
  loading = false,
  referenceDataReady = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      return_no: sourceBusinessActionNo(
        'PUR-RET-QI',
        inspection?.inspection_no || 'QUALITY',
        sourceBusinessActionUUID()
      ),
      returned_at: localDateTimeValue(),
      reason: '来料质检不合格',
      note: '',
    })
  }, [form, inspection?.id, inspection?.inspection_no, open])

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
      className="erp-quality-purchase-return-modal"
      title="退供应商"
      open={open}
      width={720}
      okText="生成退货草稿"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: !referenceDataReady }}
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
        type="warning"
        showIcon
        message="供应商、材料、仓库、批次和单位会根据这次不合格检验自动带入。保存草稿时库存不变；确认退货后，相应批次的库存会同步扣减。"
      />
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          {
            key: 'inspection',
            label: '质检单号',
            children: inspection?.inspection_no || '质检单已关联',
          },
          {
            key: 'receipt',
            label: '采购入库',
            children: sourceSummary.receipt || '采购入库已关联',
          },
          {
            key: 'supplier',
            label: '供应商',
            children: sourceSummary.supplier || '供应商已关联',
          },
          {
            key: 'material',
            label: '材料',
            children: sourceSummary.material || '材料已关联',
          },
          {
            key: 'warehouse',
            label: '仓库',
            children: sourceSummary.warehouse || '仓库已关联',
          },
          {
            key: 'lot',
            label: '批次',
            children: sourceSummary.lot || '批次已关联',
          },
        ]}
      />
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={loading || !referenceDataReady}
      >
        <Form.Item
          name="return_no"
          label="退货单号（自动）"
          rules={[
            { required: true, whitespace: true, message: '请填写退货单号' },
          ]}
        >
          <Input maxLength={64} autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="本次退货数量"
          rules={[
            { required: true, message: '请填写退货数量' },
            {
              validator: (_, value) =>
                isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                  ? Promise.resolve()
                  : Promise.reject(new Error('退货数量必须大于 0')),
            },
          ]}
        >
          <Input inputMode="decimal" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="returned_at"
          label="退货时间"
          rules={[{ required: true, message: '请选择退货时间' }]}
        >
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item
          name="reason"
          label="退货原因"
          rules={[
            { required: true, whitespace: true, message: '请填写退货原因' },
          ]}
        >
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
