import React, { useEffect, useMemo } from 'react'
import { Alert, Card, Descriptions, Form, Input, Select } from 'antd'

import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

const TYPE_META = Object.freeze({
  CYCLE_COUNT: {
    createTitle: '登记库存盘点',
    editTitle: '编辑盘点草稿',
    createSubmit: '生成盘点作业',
    notice:
      '保存和过账时都会重新核对账面数量；盘点期间库存变化时，系统会按最新账面数量重新计算差异。',
  },
  TRANSFER: {
    createTitle: '登记库存调拨',
    editTitle: '编辑调拨草稿',
    createSubmit: '生成调拨作业',
    notice: '过账后系统会同时记录调出和调入，不会改写原库存记录。',
  },
  MANUAL_ADJUSTMENT: {
    createTitle: '登记人工库存调整',
    editTitle: '编辑人工调整草稿',
    createSubmit: '生成调整作业',
    notice:
      '人工调整启动审批后内容即冻结；审批不会改变库存，过账后才形成库存变动。',
  },
})

function isSignedNumeric20Scale6(value) {
  const text = String(value ?? '').trim()
  return /^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/u.test(text)
}

function selectedInventoryText(record, labels = {}) {
  const quantity = record?.quantity ?? record?.expected_quantity ?? '-'
  return [
    labels.subject || '存货已关联',
    labels.warehouse || '仓库已关联',
    labels.lot || '未分批次',
    labels.unit || '单位已关联',
    `账面数量 ${String(quantity)}`,
  ].join(' / ')
}

function draftItemValues(item = {}, operationType = '') {
  return {
    id: item.id || undefined,
    counted_quantity:
      operationType === 'CYCLE_COUNT'
        ? String(item.counted_quantity ?? '')
        : undefined,
    adjustment_quantity:
      operationType === 'CYCLE_COUNT'
        ? undefined
        : String(item.adjustment_quantity ?? ''),
    to_warehouse_id: item.to_warehouse_id || undefined,
    note: item.note || '',
  }
}

export default function InventoryOperationModal({
  open,
  mode = 'create',
  operation,
  operationType,
  sourceRecord,
  sourceLabels,
  resolveSourceLabels,
  warehouseOptions = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const isEdit = mode === 'edit'
  const effectiveType = operation?.operation_type || operationType
  const meta = TYPE_META[effectiveType] || TYPE_META.CYCLE_COUNT
  const sourceRows = useMemo(() => {
    if (isEdit) {
      return Array.isArray(operation?.items) ? operation.items : []
    }
    return sourceRecord ? [sourceRecord] : []
  }, [isEdit, operation?.items, sourceRecord])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      operation_no: isEdit ? operation?.operation_no || '' : '',
      reason: isEdit ? operation?.reason || '' : '',
      items: sourceRows.map((item) => draftItemValues(item, effectiveType)),
    })
  }, [effectiveType, form, isEdit, open, operation, sourceRows])

  const submit = async () => {
    try {
      await onSubmit?.(await form.validateFields())
    } catch (error) {
      if (!error?.errorFields) throw error
    }
  }

  return (
    <BusinessFormModal
      className="erp-inventory-operation-modal"
      title={isEdit ? meta.editTitle : meta.createTitle}
      description={
        isEdit
          ? '只可修改草稿中的业务内容，来源存货、仓库、批次和单位保持不变。'
          : '从当前选中的库存余额生成可核对、可恢复的作业草稿。'
      }
      open={open}
      width={880}
      okText={isEdit ? '保存草稿' : meta.createSubmit}
      cancelText="取消"
      confirmLoading={loading}
      closable={!loading}
      keyboard={!loading}
      destroyOnHidden
      forceRender
      onCancel={() => !loading && onCancel?.()}
      onOk={submit}
    >
      <Alert type="info" showIcon message={meta.notice} />
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
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

        <Form.List name="items">
          {(fields) =>
            fields.map(({ key, name }, index) => {
              const source = sourceRows[index] || {}
              const labels = isEdit
                ? resolveSourceLabels?.(source, index) || {}
                : sourceLabels || {}
              const fromWarehouseID =
                source.from_warehouse_id || source.warehouse_id
              const targetWarehouseOptions = warehouseOptions.filter(
                (option) =>
                  Number(option?.value || 0) !== Number(fromWarehouseID || 0)
              )

              return (
                <Card
                  key={key}
                  size="small"
                  title={`作业明细 ${index + 1}`}
                  style={{ marginBottom: 12 }}
                >
                  <Form.Item name={[name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      {
                        key: 'stock',
                        label: '来源库存',
                        children: selectedInventoryText(source, labels),
                      },
                    ]}
                  />
                  {effectiveType === 'CYCLE_COUNT' ? (
                    <Form.Item
                      name={[name, 'counted_quantity']}
                      label="实盘数量"
                      rules={[
                        { required: true, message: '请填写实盘数量' },
                        {
                          validator: (_, value) =>
                            numeric20Scale6Units(value) !== null
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error('实盘数量必须是非负数')
                                ),
                        },
                      ]}
                    >
                      <Input inputMode="decimal" autoComplete="off" />
                    </Form.Item>
                  ) : null}
                  {effectiveType === 'TRANSFER' ? (
                    <>
                      <Form.Item
                        name={[name, 'adjustment_quantity']}
                        label="调拨数量"
                        rules={[
                          { required: true, message: '请填写调拨数量' },
                          {
                            validator: (_, value) =>
                              isPositiveNumeric20Scale6Units(
                                numeric20Scale6Units(value)
                              )
                                ? Promise.resolve()
                                : Promise.reject(
                                    new Error('调拨数量必须大于 0')
                                  ),
                          },
                        ]}
                      >
                        <Input inputMode="decimal" autoComplete="off" />
                      </Form.Item>
                      <Form.Item
                        name={[name, 'to_warehouse_id']}
                        label="目标仓库"
                        rules={[{ required: true, message: '请选择目标仓库' }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={targetWarehouseOptions}
                        />
                      </Form.Item>
                    </>
                  ) : null}
                  {effectiveType === 'MANUAL_ADJUSTMENT' ? (
                    <Form.Item
                      name={[name, 'adjustment_quantity']}
                      label="调整数量（增加填正数，扣减填负数）"
                      rules={[
                        { required: true, message: '请填写调整数量' },
                        {
                          validator: (_, value) =>
                            isSignedNumeric20Scale6(value) &&
                            Number(value) !== 0
                              ? Promise.resolve()
                              : Promise.reject(new Error('调整数量不能为 0')),
                        },
                      ]}
                    >
                      <Input inputMode="decimal" autoComplete="off" />
                    </Form.Item>
                  ) : null}
                  <Form.Item name={[name, 'note']} label="明细备注">
                    <Input maxLength={255} />
                  </Form.Item>
                </Card>
              )
            })
          }
        </Form.List>
      </Form>
    </BusinessFormModal>
  )
}
