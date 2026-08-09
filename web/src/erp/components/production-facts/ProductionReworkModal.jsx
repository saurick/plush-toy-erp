import React, { useEffect } from 'react'
import { Alert, Descriptions, Form, Input, Modal } from 'antd'

import { formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import {
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'
import {
  localProductionReworkDateTimeInputValue,
  productionReworkQuantitySummary,
  suggestedProductionReworkNo,
} from '../../utils/productionReworkAction.mjs'

export default function ProductionReworkModal({
  open,
  mode = 'create',
  source,
  facts = [],
  initialValues,
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const editing = mode === 'edit'
  const summary = productionReworkQuantitySummary(source, facts)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      fact_no:
        initialValues?.fact_no || suggestedProductionReworkNo(source) || '',
      quantity: initialValues?.quantity || summary.remaining || '',
      occurred_at:
        initialValues?.occurred_at || localProductionReworkDateTimeInputValue(),
      reason: initialValues?.reason || '',
    })
  }, [
    form,
    initialValues?.fact_no,
    initialValues?.occurred_at,
    initialValues?.quantity,
    initialValues?.reason,
    open,
    source,
    summary.remaining,
  ])

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
      title={editing ? '编辑返工草稿' : '发起返工'}
      open={open}
      okText={editing ? '保存草稿' : '生成返工草稿'}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      forceRender
      width={680}
      onCancel={onCancel}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message={
          editing
            ? '返工产品、仓库、单位、批次和来源保持不变；可修正业务编号、数量、时间和原因。'
            : '返工产品、仓库、单位和批次由原完工记录确定；返工草稿过账后才会更新对应库存记录。'
        }
      />
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          {
            key: 'completion',
            label: editing ? '返工草稿' : '原完工记录',
            children: editing
              ? source?.source_no || `来源记录 #${source?.source_id || '-'}`
              : source?.fact_no || '-',
          },
          {
            key: 'status',
            label: '当前状态',
            children: editing ? '草稿' : '已过账',
          },
          {
            key: 'completed',
            label: editing ? '当前草稿数量' : '原完工数量',
            children: summary.completed,
          },
          ...(!editing
            ? [
                {
                  key: 'reworked',
                  label: '已过账返工',
                  children: summary.postedRework,
                },
                {
                  key: 'remaining',
                  label: '剩余可返工',
                  children: summary.remaining,
                },
              ]
            : []),
          {
            key: 'occurred',
            label: editing ? '当前发生日期' : '原完工日期',
            children: formatUnixDate(source?.occurred_at),
          },
        ]}
      />
      <Form
        form={form}
        name={editing ? 'production_rework_edit' : 'production_rework_create'}
        layout="vertical"
        preserve={false}
        disabled={loading}
      >
        <Form.Item
          name="fact_no"
          label="返工业务编号"
          rules={[
            { required: true, message: '请填写返工业务编号' },
            { max: 64, message: '返工业务编号不能超过 64 个字符' },
          ]}
        >
          <Input maxLength={64} placeholder="例如：RW-20260714-001" />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="本次返工数量"
          rules={[
            { required: true, message: '请填写返工数量' },
            {
              validator: (_, value) => {
                const quantity = numeric20Scale6Units(value)
                const remaining = numeric20Scale6Units(summary.remaining)
                if (!isPositiveNumeric20Scale6Units(quantity)) {
                  return Promise.reject(new Error('返工数量必须大于 0'))
                }
                if (
                  !editing &&
                  (remaining === null ||
                    compareNumeric20Scale6Units(quantity, remaining) > 0)
                ) {
                  return Promise.reject(
                    new Error('本次返工数量不能超过剩余可返工数量')
                  )
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input inputMode="decimal" placeholder="填写本次返工数量" />
        </Form.Item>
        <Form.Item
          name="occurred_at"
          label="发生时间"
          rules={[{ required: true, message: '请选择发生时间' }]}
        >
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item
          name="reason"
          label="返工原因"
          rules={[
            { required: true, whitespace: true, message: '请填写返工原因' },
            { max: 255, message: '返工原因不能超过 255 个字符' },
          ]}
        >
          <Input.TextArea
            rows={4}
            maxLength={255}
            showCount
            placeholder="请说明不合格现象、返工要求或处理依据"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
