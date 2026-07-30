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
  compareProductionCompletionQuantity,
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
  blockedItems = [],
  facts = [],
  wipAggregate = null,
  warehouseOptions = [],
  lots = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const selectedItemID = Form.useWatch('production_order_item_id', form)
  const selectedBatchID = Form.useWatch('production_wip_batch_id', form)
  const lotSelection = Form.useWatch('lot_selection', form)
  const choices = useMemo(
    () => buildProductionCompletionChoices(items, facts, wipAggregate),
    [facts, items, wipAggregate]
  )
  const selectedChoice = choiceByID(choices, selectedItemID)
  const selectedBatchChoice = choiceByID(
    selectedChoice?.batchChoices || [],
    selectedBatchID
  )
  const lotOptions = useMemo(
    () => buildProductionCompletionLotOptions(selectedChoice?.item, lots),
    [lots, selectedChoice]
  )

  React.useEffect(() => {
    if (!open || !selectedChoice?.requiresBatch || selectedBatchID) return
    const firstBatch = selectedChoice.batchChoices.find(
      (batch) => !batch.disabled
    )
    if (!firstBatch) return
    form.setFieldsValue({
      production_wip_batch_id: firstBatch.value,
      quantity: firstBatch.remaining,
    })
  }, [form, open, selectedBatchID, selectedChoice])

  const initializeOpenForm = (visible) => {
    if (!visible) return
    const firstAvailable = choices.find((item) => !item.disabled)
    const firstBatch = firstAvailable?.batchChoices?.find(
      (batch) => !batch.disabled
    )
    const firstLotOptions = buildProductionCompletionLotOptions(
      firstAvailable?.item,
      lots
    )
    const firstLotSelection =
      sourceInboundLotSelectionForOptions(firstLotOptions)
    form.resetFields()
    form.setFieldsValue({
      production_order_item_id: firstAvailable?.value,
      production_wip_batch_id: firstBatch?.value,
      quantity: firstBatch?.remaining || firstAvailable?.remaining || '',
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
      title={
        order?.status === 'CLOSED' ? '登记返工补完工' : '登记完工入库'
      }
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
        message={
          order?.status === 'CLOSED'
            ? '当前订单已关闭，只能按已完成包装验收的成品返工补制批次登记补完工；过账后才会更新库存。'
            : '系统会按生产订单明细和包装验收批次核对完工数量、产品、规格和单位；过账后才会更新库存。'
        }
      />
      {blockedItems.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="部分路线明细暂不可登记"
          description={blockedItems
            .slice(0, 3)
            .map(({ item, reason }) => {
              const line = item?.line_no ? `第 ${item.line_no} 行` : '生产明细'
              const product =
                [item?.product_name_snapshot, item?.sku_code_snapshot]
                  .map((value) => String(value || '').trim())
                  .filter(Boolean)
                  .join(' / ') || '产品已关联'
              return `${line} · ${product}：${reason}`
            })
            .join('；')}
        />
      ) : null}
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          { key: 'order', label: '生产订单', children: order?.order_no || '-' },
          {
            key: 'status',
            label: '来源状态',
            children:
              order?.status === 'RELEASED'
                ? '已发布'
                : order?.status === 'CLOSED'
                  ? '已关闭，仅登记返工补完工'
                  : '待核对',
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
              const nextBatch = choice?.batchChoices?.find(
                (batch) => !batch.disabled
              )
              const nextLotOptions = buildProductionCompletionLotOptions(
                choice?.item,
                lots
              )
              const nextLotSelection =
                sourceInboundLotSelectionForOptions(nextLotOptions)
              form.setFieldsValue({
                production_wip_batch_id: nextBatch?.value,
                quantity: nextBatch?.remaining || choice?.remaining || '',
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
        {selectedChoice?.requiresBatch ? (
          <Form.Item
            name="production_wip_batch_id"
            label="完工来源批次"
            rules={[{ required: true, message: '请选择对应的包装验收批次' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={selectedChoice.batchChoices.map(
                ({ value, label, disabled }) => ({
                  value,
                  label,
                  disabled,
                })
              )}
              placeholder="选择已完成包装验收的批次"
              onChange={(value) => {
                const batchChoice = choiceByID(
                  selectedChoice.batchChoices,
                  value
                )
                form.setFieldValue('quantity', batchChoice?.remaining || '')
              }}
            />
          </Form.Item>
        ) : null}
        {selectedChoice ? (
          <Text type="secondary">
            {selectedBatchChoice
              ? `所选批次 ${selectedBatchChoice.quantity || '0'} / 已过账 ${selectedBatchChoice.posted || '0'} / 草稿 ${selectedBatchChoice.draft || '0'} / 剩余 ${selectedBatchChoice.remaining || '0'}`
              : `计划 ${selectedChoice.planned || '0'} / 当前可完工上限 ${selectedChoice.acceptedPackaging || '0'} / 已过账 ${selectedChoice.posted || '0'} / 草稿 ${selectedChoice.draft || '0'}`}
          </Text>
        ) : null}
        <Form.Item
          name="quantity"
          label="本次完工数量"
          rules={[
            { required: true, message: '请填写本次完工数量' },
            {
              validator: (_, value) => {
                try {
                  if (
                    compareProductionCompletionQuantity(
                      value,
                      selectedBatchChoice?.remaining ||
                        selectedChoice?.remaining ||
                        '0'
                    ) > 0
                  ) {
                    return Promise.reject(
                      new Error(
                        '本次数量不能超过所选包装验收批次扣减已过账和草稿后的剩余数量'
                      )
                    )
                  }
                } catch {
                  return Promise.reject(new Error('完工数量必须大于 0'))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input inputMode="decimal" maxLength={21} placeholder="例如：100" />
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
