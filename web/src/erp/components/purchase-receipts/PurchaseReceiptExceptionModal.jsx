import React, { useEffect, useMemo } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'

import { PURCHASE_RECEIPT_ADJUSTMENT_OPTIONS } from '../../utils/purchaseReceiptExceptionAction.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

function receiptItemLabel(item, materialOptions = []) {
  const material = materialOptions.find(
    (option) => Number(option?.value) === Number(item?.material_id)
  )
  const sourceLine = String(item?.source_line_no || '').trim()
  const quantity = String(item?.quantity || '').trim()
  return [
    material?.label || '材料已关联',
    sourceLine ? `来源行 ${sourceLine}` : '',
    quantity ? `入库 ${quantity}` : '',
  ]
    .filter(Boolean)
    .join(' / ')
}

function localDateTimeValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export default function PurchaseReceiptExceptionModal({
  open,
  mode,
  receipt,
  materialOptions = [],
  warehouseOptions = [],
  lotOptions = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const isReturn = mode === 'return'
  const itemOptions = useMemo(
    () =>
      (Array.isArray(receipt?.items) ? receipt.items : []).map((item) => ({
        value: Number(item.id),
        label: receiptItemLabel(item, materialOptions),
      })),
    [materialOptions, receipt?.items]
  )

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      [isReturn ? 'returned_at' : 'adjusted_at']: localDateTimeValue(),
      items: [
        {
          purchase_receipt_item_id: itemOptions[0]?.value,
          ...(isReturn ? {} : { adjust_type: 'QUANTITY_DECREASE' }),
        },
      ],
    })
  }, [form, isReturn, itemOptions, open, receipt?.id])

  const submit = async () => {
    const values = await form.validateFields()
    await onSubmit?.(values)
  }

  return (
    <Modal
      title={isReturn ? '从入库单生成采购退货' : '登记采购入库调整'}
      open={open}
      width={820}
      okText={isReturn ? '生成退货草稿' : '生成调整草稿'}
      cancelText="取消"
      confirmLoading={loading}
      closable={!loading}
      destroyOnHidden
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
        message={
          isReturn
            ? '系统会根据已确认的采购入库自动带入供应商、材料、仓库、批次和单位；确认退货后，相应批次的库存会同步扣减。'
            : '调整会保留原入库记录并生成差额调整记录，不会改写原入库明细。'
        }
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Space size={16} style={{ width: '100%' }} align="start">
          <Form.Item
            name={isReturn ? 'returned_at' : 'adjusted_at'}
            label={isReturn ? '退货时间' : '调整时间'}
          >
            <Input type="datetime-local" />
          </Form.Item>
          {!isReturn ? (
            <Form.Item
              name="reason"
              label="调整原因"
              rules={[
                { required: true, whitespace: true, message: '请填写调整原因' },
              ]}
            >
              <Input maxLength={255} />
            </Form.Item>
          ) : null}
        </Space>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field, index) => (
                <Space
                  key={field.key}
                  align="start"
                  wrap
                  style={{ display: 'flex', marginBottom: 8 }}
                >
                  <Form.Item
                    {...field}
                    name={[field.name, 'purchase_receipt_item_id']}
                    label={`来源明细 ${index + 1}`}
                    rules={[{ required: true, message: '请选择入库明细' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={itemOptions}
                      style={{ minWidth: 260 }}
                    />
                  </Form.Item>
                  {!isReturn ? (
                    <Form.Item
                      {...field}
                      name={[field.name, 'adjust_type']}
                      label="调整方式"
                      rules={[{ required: true, message: '请选择调整方式' }]}
                    >
                      <Select
                        options={PURCHASE_RECEIPT_ADJUSTMENT_OPTIONS}
                        style={{ minWidth: 170 }}
                      />
                    </Form.Item>
                  ) : null}
                  <Form.Item
                    {...field}
                    name={[field.name, 'quantity']}
                    label={isReturn ? '退货数量' : '调整数量'}
                    rules={[
                      { required: true, message: '请填写数量' },
                      {
                        validator: (_, value) =>
                          isPositiveNumeric20Scale6Units(
                            numeric20Scale6Units(value)
                          )
                            ? Promise.resolve()
                            : Promise.reject(new Error('数量必须大于 0')),
                      },
                    ]}
                  >
                    <Input inputMode="decimal" style={{ width: 120 }} />
                  </Form.Item>
                  {!isReturn ? (
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) => {
                        const adjustType = getFieldValue([
                          'items',
                          field.name,
                          'adjust_type',
                        ])
                        if (adjustType === 'LOT_CORRECTION') {
                          return (
                            <Form.Item
                              name={[field.name, 'lot_id']}
                              label="目标批次"
                              rules={[
                                { required: true, message: '请选择目标批次' },
                              ]}
                            >
                              <Select
                                showSearch
                                optionFilterProp="label"
                                options={lotOptions}
                                style={{ minWidth: 180 }}
                              />
                            </Form.Item>
                          )
                        }
                        if (adjustType === 'WAREHOUSE_CORRECTION') {
                          return (
                            <Form.Item
                              name={[field.name, 'warehouse_id']}
                              label="目标仓库"
                              rules={[
                                { required: true, message: '请选择目标仓库' },
                              ]}
                            >
                              <Select
                                showSearch
                                optionFilterProp="label"
                                options={warehouseOptions}
                                style={{ minWidth: 180 }}
                              />
                            </Form.Item>
                          )
                        }
                        return null
                      }}
                    </Form.Item>
                  ) : null}
                  <Form.Item
                    {...field}
                    name={[field.name, 'note']}
                    label="明细备注"
                  >
                    <Input maxLength={255} style={{ width: 180 }} />
                  </Form.Item>
                  {fields.length > 1 ? (
                    <Button
                      type="text"
                      danger
                      aria-label={`移除明细 ${index + 1}`}
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  ) : null}
                </Space>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add()}
              >
                添加明细
              </Button>
            </>
          )}
        </Form.List>
        <Form.Item name="note" label="整单备注" style={{ marginTop: 16 }}>
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
