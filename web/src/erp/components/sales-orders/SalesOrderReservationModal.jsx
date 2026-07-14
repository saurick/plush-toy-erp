import React, { useEffect, useMemo } from 'react'
import {
  Alert,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Typography,
} from 'antd'

import {
  buildReservationBalanceChoices,
  buildSalesOrderReservationItemChoices,
  defaultSalesOrderReservationQuantity,
} from '../../utils/salesOrderReservationAction.mjs'

const { Text } = Typography

function readableSourceText(values = [], fallback = '-') {
  const text = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' / ')
  return text || fallback
}

function localDateTimeValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export default function SalesOrderReservationModal({
  open,
  order,
  items = [],
  reservations = [],
  shipments = [],
  balances = [],
  loading = false,
  onItemChange,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const selectedItemID = Form.useWatch('sales_order_item_id', form)
  const itemChoices = useMemo(
    () => buildSalesOrderReservationItemChoices(items, reservations, shipments),
    [items, reservations, shipments]
  )
  const selectedChoice = itemChoices.find(
    (item) => item.value === Number(selectedItemID || 0)
  )
  const balanceChoices = useMemo(
    () =>
      buildReservationBalanceChoices(balances, {
        productID: selectedChoice?.item?.product_id,
        productSkuID: selectedChoice?.item?.product_sku_id,
      }),
    [balances, selectedChoice]
  )
  const selectedBalanceID = Form.useWatch('balance_id', form)
  const selectedBalance = balanceChoices.find(
    (item) => item.value === Number(selectedBalanceID || 0)
  )
  const selectedItem = selectedChoice?.item
  const sourceProductText = readableSourceText(
    [selectedItem?.product_code_snapshot, selectedItem?.product_name_snapshot],
    '产品已关联'
  )
  const sourceSpecificationText = readableSourceText(
    [selectedItem?.sku_code_snapshot, selectedItem?.color_snapshot],
    '未填写规格'
  )
  const sourceUnitText = readableSourceText(
    [selectedItem?.unit_name_snapshot, selectedItem?.unit_snapshot?.name],
    '单位已关联'
  )

  const initializeOpenForm = (visible) => {
    if (!visible) return
    const firstItem = itemChoices.find((item) => !item.disabled)
    const firstBalance = balanceChoices.find((item) => !item.disabled)
    form.resetFields()
    form.setFieldsValue({
      sales_order_item_id: firstItem?.value,
      balance_id: firstBalance?.value,
      quantity: defaultSalesOrderReservationQuantity(firstItem, firstBalance),
      reserved_at: localDateTimeValue(),
    })
    if (firstItem?.value) {
      onItemChange?.(firstItem.item)
    }
  }

  useEffect(() => {
    if (!open) return
    const firstBalance = balanceChoices.find((item) => !item.disabled)
    form.setFieldsValue({
      balance_id: firstBalance?.value,
      quantity: defaultSalesOrderReservationQuantity(
        selectedChoice,
        firstBalance
      ),
    })
  }, [balanceChoices, form, open, selectedChoice])

  const submit = async () => {
    const values = await form.validateFields()
    await onSubmit?.(values)
  }

  return (
    <Modal
      title="预留销售订单库存"
      open={open}
      okText="确认预留"
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
        message="预留只锁定可用库存，不写出库流水；确认发货时才会消耗匹配预留并出库。"
      />
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          { key: 'order', label: '销售订单', children: order?.order_no || '-' },
          {
            key: 'status',
            label: '来源状态',
            children:
              String(order?.lifecycle_status || '').toLowerCase() === 'active'
                ? '履约中'
                : '待核对',
          },
          ...(selectedChoice
            ? [
                {
                  key: 'product',
                  label: '产品',
                  children: sourceProductText,
                },
                {
                  key: 'specification',
                  label: 'SKU / 规格',
                  children: sourceSpecificationText,
                },
                {
                  key: 'unit',
                  label: '单位',
                  children: sourceUnitText,
                },
              ]
            : []),
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="sales_order_item_id"
          label="销售订单明细"
          rules={[{ required: true, message: '请选择要预留的订单明细' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={itemChoices.map(({ value, label, disabled }) => ({
              value,
              label,
              disabled,
            }))}
            onChange={(value) => {
              const choice = itemChoices.find((item) => item.value === value)
              form.setFieldsValue({ balance_id: undefined, quantity: '' })
              onItemChange?.(choice?.item)
            }}
          />
        </Form.Item>
        {selectedChoice ? (
          <Text type="secondary">
            订单 {selectedChoice.ordered || '0'} / 当前生效预留{' '}
            {selectedChoice.activeReserved || '0'} / 已出货{' '}
            {selectedChoice.shipped || '0'} / 可预留{' '}
            {selectedChoice.reservable || '0'}
          </Text>
        ) : null}
        <Form.Item
          name="balance_id"
          label="可用库存"
          rules={[{ required: true, message: '请选择仓库与批次' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={balanceChoices.map(({ value, label, disabled }) => ({
              value,
              label,
              disabled,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="本次预留数量"
          rules={[
            { required: true, message: '请填写预留数量' },
            {
              validator: (_, value) => {
                const quantity = Number(value)
                const available = Number(selectedBalance?.available || 0)
                if (!Number.isFinite(quantity) || quantity <= 0) {
                  return Promise.reject(new Error('预留数量必须大于 0'))
                }
                if (available > 0 && quantity > available) {
                  return Promise.reject(new Error('预留数量不能超过可用库存'))
                }
                const reservable = Number(selectedChoice?.reservable || 0)
                if (reservable <= 0 || quantity > reservable) {
                  return Promise.reject(
                    new Error('预留数量不能超过订单剩余可预留数量')
                  )
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input inputMode="decimal" placeholder="例如：100" />
        </Form.Item>
        <Form.Item name="reserved_at" label="预留时间">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
