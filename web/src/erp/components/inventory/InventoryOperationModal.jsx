import React, { useEffect } from 'react'
import { Alert, Descriptions, Form, Input, Modal, Select } from 'antd'

import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

const TYPE_META = Object.freeze({
  CYCLE_COUNT: {
    title: '登记库存盘点',
    submit: '生成盘点作业',
    notice: '过账时会再次核对账面数量；盘点期间库存变化会要求重新盘点。',
  },
  TRANSFER: {
    title: '登记库存调拨',
    submit: '生成调拨作业',
    notice: '过账后系统会同时记录调出和调入，不会改写原库存记录。',
  },
  MANUAL_ADJUSTMENT: {
    title: '登记人工库存调整',
    submit: '生成调整作业',
    notice: '人工调整必须填写审批依据；过账后保留不可变审计记录。',
  },
})

function isSignedNumeric20Scale6(value) {
  const text = String(value ?? '').trim()
  return /^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/u.test(text)
}

function selectedInventoryText(record, labels = {}) {
  return [
    labels.subject || '存货已关联',
    labels.warehouse || '仓库已关联',
    labels.lot || '未分批次',
    `账面数量 ${String(record?.quantity ?? '-')}`,
  ].join(' / ')
}

export default function InventoryOperationModal({
  open,
  operationType,
  sourceRecord,
  sourceLabels,
  warehouseOptions = [],
  lotOptions = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const meta = TYPE_META[operationType] || TYPE_META.CYCLE_COUNT

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      operation_no: '',
      reason: '',
      approval_ref: '',
      counted_quantity: '',
      adjustment_quantity: '',
      to_warehouse_id: undefined,
      to_lot_id: undefined,
      note: '',
    })
  }, [form, open, operationType, sourceRecord?.id])

  const submit = async () => {
    try {
      await onSubmit?.(await form.validateFields())
    } catch (error) {
      if (!error?.errorFields) throw error
    }
  }

  return (
    <Modal
      className="erp-inventory-operation-modal"
      title={meta.title}
      open={open}
      width={760}
      okText={meta.submit}
      cancelText="取消"
      confirmLoading={loading}
      closable={!loading}
      keyboard={!loading}
      maskClosable={!loading}
      destroyOnHidden
      forceRender
      onCancel={() => !loading && onCancel?.()}
      onOk={submit}
    >
      <Alert type="info" showIcon message={meta.notice} />
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'stock',
            label: '当前库存',
            children: selectedInventoryText(sourceRecord, sourceLabels),
          },
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="operation_no"
          label="作业单号"
          rules={[
            { required: true, whitespace: true, message: '请填写作业单号' },
          ]}
        >
          <Input maxLength={64} autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="reason"
          label="业务原因"
          rules={[
            { required: true, whitespace: true, message: '请填写业务原因' },
          ]}
        >
          <Input.TextArea rows={2} maxLength={255} showCount />
        </Form.Item>
        {operationType === 'CYCLE_COUNT' ? (
          <Form.Item
            name="counted_quantity"
            label="实盘数量"
            rules={[
              { required: true, message: '请填写实盘数量' },
              {
                validator: (_, value) =>
                  numeric20Scale6Units(value) !== null
                    ? Promise.resolve()
                    : Promise.reject(new Error('实盘数量必须是非负数')),
              },
            ]}
          >
            <Input inputMode="decimal" autoComplete="off" />
          </Form.Item>
        ) : null}
        {operationType === 'TRANSFER' ? (
          <>
            <Form.Item
              name="adjustment_quantity"
              label="调拨数量"
              rules={[
                { required: true, message: '请填写调拨数量' },
                {
                  validator: (_, value) =>
                    isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                      ? Promise.resolve()
                      : Promise.reject(new Error('调拨数量必须大于 0')),
                },
              ]}
            >
              <Input inputMode="decimal" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="to_warehouse_id"
              label="目标仓库"
              rules={[{ required: true, message: '请选择目标仓库' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={warehouseOptions}
              />
            </Form.Item>
            <Form.Item name="to_lot_id" label="目标批次（可选）">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={lotOptions}
              />
            </Form.Item>
          </>
        ) : null}
        {operationType === 'MANUAL_ADJUSTMENT' ? (
          <>
            <Form.Item
              name="adjustment_quantity"
              label="调整数量（增加填正数，扣减填负数）"
              rules={[
                { required: true, message: '请填写调整数量' },
                {
                  validator: (_, value) =>
                    isSignedNumeric20Scale6(value) && Number(value) !== 0
                      ? Promise.resolve()
                      : Promise.reject(new Error('调整数量不能为 0')),
                },
              ]}
            >
              <Input inputMode="decimal" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="approval_ref"
              label="审批依据"
              rules={[
                { required: true, whitespace: true, message: '请填写审批依据' },
              ]}
            >
              <Input maxLength={255} autoComplete="off" />
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="note" label="明细备注">
          <Input maxLength={255} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
