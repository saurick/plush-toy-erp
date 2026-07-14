import React, { useMemo } from 'react'
import {
  Alert,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Typography,
} from 'antd'

import {
  buildProductionCompletionChoices,
  buildProductionCompletionLotOptions,
} from '../../utils/productionCompletionAction.mjs'
import {
  SOURCE_INBOUND_LOT_SELECTION,
  sourceInboundLotSelectionForOptions,
} from '../../utils/sourceInboundLotSelection.mjs'

const { Text } = Typography

function choiceByID(choices, value) {
  const id = Number(value || 0)
  return choices.find((item) => item.value === id) || null
}

function localDateTimeValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export default function ProductionCompletionModal({
  open,
  order,
  items = [],
  facts = [],
  warehouseOptions = [],
  lots = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const selectedItemID = Form.useWatch('production_order_item_id', form)
  const lotSelection = Form.useWatch('lot_selection', form)
  const choices = useMemo(
    () => buildProductionCompletionChoices(items, facts),
    [facts, items]
  )
  const selectedChoice = choiceByID(choices, selectedItemID)
  const lotOptions = useMemo(
    () => buildProductionCompletionLotOptions(selectedChoice?.item, lots),
    [lots, selectedChoice]
  )

  const initializeOpenForm = (visible) => {
    if (!visible) return
    const firstAvailable = choices.find((item) => !item.disabled)
    const firstLotOptions = buildProductionCompletionLotOptions(
      firstAvailable?.item,
      lots
    )
    const firstLotSelection =
      sourceInboundLotSelectionForOptions(firstLotOptions)
    form.resetFields()
    form.setFieldsValue({
      production_order_item_id: firstAvailable?.value,
      quantity: firstAvailable?.remaining || '',
      warehouse_id: warehouseOptions[0]?.value,
      lot_selection: firstLotSelection,
      lot_id:
        firstLotSelection === SOURCE_INBOUND_LOT_SELECTION.EXISTING
          ? firstLotOptions[0]?.value
          : undefined,
      new_lot_no: undefined,
      occurred_at: localDateTimeValue(),
    })
  }

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
      title="登记完工入库"
      open={open}
      okText="生成完工记录"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      afterOpenChange={initializeOpenForm}
      onCancel={onCancel}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message="完工数量、产品、规格和单位由生产订单明细校验；过账后才会写入库存。"
      />
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          { key: 'order', label: '生产订单', children: order?.order_no || '-' },
          {
            key: 'status',
            label: '来源状态',
            children: order?.status === 'RELEASED' ? '已发布' : '待核对',
          },
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="production_order_item_id"
          label="生产明细"
          rules={[{ required: true, message: '请选择要完工的生产明细' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={choices.map(({ value, label, disabled }) => ({
              value,
              label,
              disabled,
            }))}
            onChange={(value) => {
              const choice = choiceByID(choices, value)
              const nextLotOptions = buildProductionCompletionLotOptions(
                choice?.item,
                lots
              )
              const nextLotSelection =
                sourceInboundLotSelectionForOptions(nextLotOptions)
              form.setFieldsValue({
                quantity: choice?.remaining || '',
                lot_selection: nextLotSelection,
                lot_id:
                  nextLotSelection === SOURCE_INBOUND_LOT_SELECTION.EXISTING
                    ? nextLotOptions[0]?.value
                    : undefined,
                new_lot_no: undefined,
              })
            }}
          />
        </Form.Item>
        {selectedChoice ? (
          <Text type="secondary">
            计划 {selectedChoice.planned || '0'} / 已过账{' '}
            {selectedChoice.posted || '0'} / 草稿 {selectedChoice.draft || '0'}
          </Text>
        ) : null}
        <Form.Item
          name="quantity"
          label="本次完工数量"
          rules={[
            { required: true, message: '请填写本次完工数量' },
            {
              validator: (_, value) => {
                const quantity = Number(value)
                const remaining = Number(selectedChoice?.remaining || 0)
                if (!Number.isFinite(quantity) || quantity <= 0) {
                  return Promise.reject(new Error('完工数量必须大于 0'))
                }
                if (remaining > 0 && quantity > remaining) {
                  return Promise.reject(
                    new Error('本次数量不能超过剩余可完工数量')
                  )
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input inputMode="decimal" placeholder="例如：100" />
        </Form.Item>
        <Form.Item
          name="warehouse_id"
          label="入库仓库"
          rules={[{ required: true, message: '请选择入库仓库' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={warehouseOptions}
            placeholder="选择仓库"
          />
        </Form.Item>
        <Form.Item
          name="lot_selection"
          label="入库批次方式"
          rules={[{ required: true, message: '请选择入库批次方式' }]}
        >
          <Radio.Group
            options={[
              {
                label: '选择已有批次',
                value: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
              },
              {
                label: '填写新批次号',
                value: SOURCE_INBOUND_LOT_SELECTION.NEW,
              },
            ]}
            onChange={(event) => {
              const nextSelection = event.target.value
              form.setFieldsValue({
                lot_id:
                  nextSelection === SOURCE_INBOUND_LOT_SELECTION.EXISTING
                    ? lotOptions[0]?.value
                    : undefined,
                new_lot_no: undefined,
              })
            }}
          />
        </Form.Item>
        {lotSelection === SOURCE_INBOUND_LOT_SELECTION.EXISTING ? (
          <Form.Item
            name="lot_id"
            label="已有入库批次"
            rules={[{ required: true, message: '请选择已有入库批次' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={lotOptions}
              notFoundContent="暂无匹配的已有批次"
              placeholder="选择已有批次"
            />
          </Form.Item>
        ) : null}
        {lotSelection === SOURCE_INBOUND_LOT_SELECTION.NEW ? (
          <Form.Item
            name="new_lot_no"
            label="新批次号"
            rules={[
              { required: true, message: '请填写本次完工的新批次号' },
              { max: 64, message: '新批次号不能超过 64 个字符' },
            ]}
          >
            <Input maxLength={64} placeholder="填写本次完工的新批次号" />
          </Form.Item>
        ) : null}
        <Form.Item name="occurred_at" label="完工时间">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
