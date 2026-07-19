import React, { useMemo } from 'react'
import { Alert, Descriptions, Form, Input, Modal, Radio, Select } from 'antd'

import {
  inventoryLotOption,
  warehouseOptionFromRecord,
} from '../../utils/referenceSelectOptions.mjs'
import {
  OUTSOURCING_SOURCE_ACTIONS,
  outsourcingSourceActionQuantitySummary,
} from '../../utils/outsourcingOrderFactAction.mjs'
import {
  SOURCE_INBOUND_LOT_SELECTION,
  sourceInboundLotSelectionForOptions,
} from '../../utils/sourceInboundLotSelection.mjs'
import {
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

function localDateTimeValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

function readableText(values = [], fallback = '-') {
  const text = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' / ')
  return text || fallback
}

function actionCopy(actionType) {
  return actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
    ? {
        title: '委外发料',
        alert: '发料记录创建为草稿，确认过账后才会更新库存出库记录。',
      }
    : {
        title: '登记回货',
        alert:
          '选择已有产品批次或填写本次回货的新批次号；记录创建为草稿，确认过账后才会更新库存入库记录。',
      }
}

export default function OutsourcingOrderSourceFactModal({
  open,
  actionType,
  order,
  item,
  warehouses = [],
  lots = [],
  facts = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const lotSelection = Form.useWatch('lot_selection', form)
  const copy = actionCopy(actionType)
  const returnReceipt = actionType === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
  const warehouseOptions = useMemo(
    () =>
      (Array.isArray(warehouses) ? warehouses : [])
        .map(warehouseOptionFromRecord)
        .filter(Boolean),
    [warehouses]
  )
  const lotOptions = useMemo(
    () =>
      (Array.isArray(lots) ? lots : []).map(inventoryLotOption).filter(Boolean),
    [lots]
  )
  const quantitySummary = outsourcingSourceActionQuantitySummary(
    actionType,
    order,
    item,
    facts
  )
  const sourceObject =
    String(item?.subject_type || '').toUpperCase() === 'MATERIAL'
      ? readableText(
          [item?.material_code_snapshot, item?.material_name_snapshot],
          '材料已关联'
        )
      : readableText(
          [
            item?.product_no_snapshot,
            item?.sku_code_snapshot,
            item?.product_name_snapshot,
          ],
          '产品已关联'
        )
  const supplierText = readableText(
    [order?.supplier_snapshot?.code, order?.supplier_snapshot?.name],
    '加工厂已关联'
  )

  const initializeOpenForm = (visible) => {
    if (!visible) return
    const initialLotSelection = returnReceipt
      ? sourceInboundLotSelectionForOptions(lotOptions)
      : SOURCE_INBOUND_LOT_SELECTION.EXISTING
    form.resetFields()
    form.setFieldsValue({
      warehouse_id: warehouseOptions[0]?.value,
      lot_selection: initialLotSelection,
      lot_id:
        initialLotSelection === SOURCE_INBOUND_LOT_SELECTION.EXISTING
          ? lotOptions[0]?.value
          : undefined,
      new_lot_no: undefined,
      quantity:
        isPositiveNumeric20Scale6Units(
          numeric20Scale6Units(quantitySummary.remaining)
        )
          ? quantitySummary.remaining
          : '',
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
      className="erp-outsourcing-source-fact-modal"
      title={copy.title}
      open={open}
      okText={`确认${copy.title}`}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      width={720}
      afterOpenChange={initializeOpenForm}
      onCancel={onCancel}
      onOk={submit}
    >
      <Alert type="info" showIcon message={copy.alert} />
      {lotOptions.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message={
            returnReceipt ? '暂无匹配的已有产品批次' : '暂无可用材料批次'
          }
          description={
            returnReceipt
              ? '可以填写本次委外回货的新批次号，系统将在创建回货草稿时一并准备该批次。'
              : '委外发料只能选择与来源材料匹配的可用批次，请先核对库存与批次状态。'
          }
        />
      ) : null}
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          {
            key: 'order',
            label: '委外订单',
            children: order?.outsourcing_order_no || '-',
          },
          { key: 'supplier', label: '加工厂', children: supplierText },
          { key: 'subject', label: '产品 / 材料', children: sourceObject },
          {
            key: 'process',
            label: '工序',
            children: readableText(
              [item?.process_name_snapshot, item?.process_category_snapshot],
              '工序已关联'
            ),
          },
          {
            key: 'unit',
            label: '单位',
            children: item?.unit_name_snapshot || '单位已关联',
          },
          {
            key: 'planned',
            label: '计划数量',
            children: quantitySummary.planned,
          },
          {
            key: 'processed',
            label: '已登记量',
            children: quantitySummary.processed,
          },
          {
            key: 'remaining',
            label: '剩余可登记',
            children: quantitySummary.remaining,
          },
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="warehouse_id"
          label="仓库"
          rules={[{ required: true, message: '请选择办理仓库' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={warehouseOptions}
            placeholder="选择仓库"
          />
        </Form.Item>
        {returnReceipt ? (
          <Form.Item
            name="lot_selection"
            label="回货批次方式"
            rules={[{ required: true, message: '请选择回货批次方式' }]}
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
        ) : null}
        {!returnReceipt ||
        lotSelection === SOURCE_INBOUND_LOT_SELECTION.EXISTING ? (
          <Form.Item
            name="lot_id"
            label={returnReceipt ? '已有产品批次' : '材料批次'}
            rules={[
              {
                required: true,
                message: returnReceipt
                  ? '请选择已有产品批次'
                  : '请选择已有材料批次',
              },
            ]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={lotOptions}
              notFoundContent={
                returnReceipt ? '暂无匹配的已有产品批次' : '暂无可用材料批次'
              }
              placeholder={returnReceipt ? '选择已有产品批次' : '选择材料批次'}
            />
          </Form.Item>
        ) : null}
        {returnReceipt && lotSelection === SOURCE_INBOUND_LOT_SELECTION.NEW ? (
          <Form.Item
            name="new_lot_no"
            label="新批次号"
            rules={[
              { required: true, message: '请填写本次回货的新批次号' },
              { max: 64, message: '新批次号不能超过 64 个字符' },
            ]}
          >
            <Input maxLength={64} placeholder="填写本次回货的新批次号" />
          </Form.Item>
        ) : null}
        <Form.Item
          name="quantity"
          label="本次办理数量"
          rules={[
            { required: true, message: '请填写办理数量' },
            {
              validator: (_, value) => {
                const quantity = numeric20Scale6Units(value)
                const remaining = numeric20Scale6Units(
                  quantitySummary.remaining
                )
                if (!isPositiveNumeric20Scale6Units(quantity)) {
                  return Promise.reject(new Error('办理数量必须大于 0'))
                }
                if (
                  remaining === null ||
                  compareNumeric20Scale6Units(quantity, remaining) > 0
                ) {
                  return Promise.reject(
                    new Error('办理数量不能超过当前剩余数量')
                  )
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input inputMode="decimal" placeholder="填写本次办理数量" />
        </Form.Item>
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
