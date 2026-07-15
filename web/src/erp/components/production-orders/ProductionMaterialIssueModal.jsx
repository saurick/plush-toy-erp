import React, { useEffect, useMemo, useRef } from 'react'
import { Alert, Descriptions, Form, Input, Modal, Select } from 'antd'

import { inventoryLotOption } from '../../utils/referenceSelectOptions.mjs'

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

export default function ProductionMaterialIssueModal({
  open,
  order,
  orderItem,
  requirement,
  warehouseOptions = [],
  lots = [],
  loading = false,
  lotsLoading = false,
  onWarehouseChange,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const formConnectedRef = useRef(false)
  const lotOptions = useMemo(
    () =>
      (Array.isArray(lots) ? lots : []).map(inventoryLotOption).filter(Boolean),
    [lots]
  )

  const initializeOpenForm = (visible) => {
    formConnectedRef.current = visible
    if (!visible) return
    form.resetFields()
    form.setFieldsValue({
      warehouse_id: warehouseOptions[0]?.value,
      lot_id: lotOptions[0]?.value,
      quantity: requirement?.remaining_quantity || '',
      occurred_at: localDateTimeValue(),
    })
  }

  useEffect(() => {
    if (!open || !formConnectedRef.current) return
    const currentLotID = Number(form.getFieldValue('lot_id') || 0)
    if (!lotOptions.some((option) => option.value === currentLotID)) {
      form.setFieldValue('lot_id', lotOptions[0]?.value)
    }
  }, [form, lotOptions, open])

  const submit = async () => {
    const values = await form.validateFields()
    await onSubmit?.(values)
  }

  return (
    <Modal
      className="erp-production-material-issue-modal"
      title="生产领料"
      open={open}
      width={720}
      okText="生成领料记录"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{
        disabled: loading || lotsLoading || lotOptions.length === 0,
      }}
      destroyOnHidden
      afterOpenChange={initializeOpenForm}
      onCancel={onCancel}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message="领用材料和单位来自已发布的物料需求；记录先生成草稿，核对并过账后才会更新库存出库记录。"
      />
      {lotOptions.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message={lotsLoading ? '正在读取可用材料批次' : '暂无可用材料批次'}
          description={
            lotsLoading
              ? '请稍候，批次读取完成后再继续。'
              : '当前仓库没有与该物料匹配的可用批次，请先核对库存与批次状态。'
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
            label: '生产订单',
            children: order?.order_no || '-',
          },
          {
            key: 'line',
            label: '生产明细',
            children: orderItem?.line_no
              ? `第 ${orderItem.line_no} 行`
              : '生产明细已关联',
          },
          {
            key: 'product',
            label: '生产产品',
            children: readableText(
              [
                orderItem?.product_code_snapshot,
                orderItem?.product_name_snapshot,
                orderItem?.sku_code_snapshot,
              ],
              '产品已关联'
            ),
          },
          {
            key: 'material',
            label: '需求物料',
            children: readableText(
              [
                requirement?.material_code_snapshot,
                requirement?.material_name_snapshot,
              ],
              '物料已关联'
            ),
          },
          {
            key: 'unit',
            label: '单位',
            children: readableText(
              [
                requirement?.unit_name_snapshot,
                requirement?.unit_code_snapshot,
              ],
              '单位已关联'
            ),
          },
          {
            key: 'planned',
            label: '计划需求',
            children: requirement?.planned_quantity || '0',
          },
          {
            key: 'issued',
            label: '已过账领料',
            children: requirement?.issued_quantity || '0',
          },
          {
            key: 'remaining',
            label: '剩余可领',
            children: requirement?.remaining_quantity || '0',
          },
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="warehouse_id"
          label="领料仓库"
          rules={[{ required: true, message: '请选择领料仓库' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={warehouseOptions}
            placeholder="选择仓库"
            onChange={(value) => {
              form.setFieldValue('lot_id', undefined)
              onWarehouseChange?.(value)
            }}
          />
        </Form.Item>
        <Form.Item
          name="lot_id"
          label="材料批次"
          rules={[{ required: true, message: '请选择匹配的材料批次' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={lotOptions}
            loading={lotsLoading}
            notFoundContent={
              lotsLoading ? '正在读取材料批次' : '暂无匹配的可用批次'
            }
            placeholder="选择可用材料批次"
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="本次领料数量"
          rules={[
            { required: true, message: '请填写本次领料数量' },
            {
              validator: (_, value) => {
                const quantity = Number(value)
                const remaining = Number(requirement?.remaining_quantity || 0)
                if (!Number.isFinite(quantity) || quantity <= 0) {
                  return Promise.reject(new Error('领料数量必须大于 0'))
                }
                if (remaining >= 0 && quantity > remaining) {
                  return Promise.reject(
                    new Error('领料数量不能超过当前剩余需求')
                  )
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input inputMode="decimal" placeholder="填写本次领料数量" />
        </Form.Item>
        <Form.Item name="occurred_at" label="领料时间">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
