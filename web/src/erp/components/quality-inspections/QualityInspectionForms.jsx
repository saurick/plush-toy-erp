import React from 'react'
import { Form, Input, Select } from 'antd'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import {
  compactParams,
  trimOptional,
} from '../../utils/masterDataOrderView.mjs'

const RESULT_DECISION_OPTIONS = [
  { label: '合格', value: 'PASS' },
  { label: '让步接收', value: 'CONCESSION' },
]

export function positiveInt(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0
    ? Math.trunc(numeric)
    : undefined
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

export function buildInspectionParams(values = {}) {
  return compactParams({
    inspection_no: trimOptional(values.inspection_no),
    purchase_receipt_id: positiveInt(values.purchase_receipt_id),
    purchase_receipt_item_id: positiveInt(values.purchase_receipt_item_id),
    inventory_lot_id: positiveInt(values.inventory_lot_id),
    material_id: positiveInt(values.material_id),
    warehouse_id: positiveInt(values.warehouse_id),
    inspector_id: positiveInt(values.inspector_id),
    decision_note: trimOptional(values.decision_note),
  })
}

export function buildDecisionParams(inspectionID, values = {}, result = '') {
  return compactParams({
    id: positiveInt(inspectionID),
    result: result || trimOptional(values.result),
    inspected_at: trimOptional(values.inspected_at),
    inspector_id: positiveInt(values.inspector_id),
    decision_note: trimOptional(values.decision_note),
  })
}

export function QualityInspectionCreateForm({
  form,
  purchaseReceiptOptions,
  purchaseReceiptItemOptions,
  inventoryLotOptions,
  materialOptions,
  warehouseOptions,
  onReceiptChange,
  onReceiptItemChange,
  onInventoryLotChange,
}) {
  return (
    <Form
      form={form}
      layout="vertical"
      className="erp-business-action-form erp-business-action-form--grid"
    >
      <Form.Item
        className="erp-business-action-form__field"
        label="质检单号（自动）"
        name="inspection_no"
        rules={[{ required: true, message: '请填写或保留自动质检单号' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="采购入库单"
        name="purchase_receipt_id"
        rules={[{ required: true, message: '请选择采购入库单' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={purchaseReceiptOptions}
          placeholder="请选择采购入库单"
          showSearch
          onChange={onReceiptChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="采购入库行"
        name="purchase_receipt_item_id"
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={purchaseReceiptItemOptions}
          placeholder="请选择采购入库行"
          showSearch
          onChange={onReceiptItemChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次"
        name="inventory_lot_id"
        rules={[{ required: true, message: '请选择批次' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={inventoryLotOptions}
          placeholder="请选择批次"
          showSearch
          onChange={onInventoryLotChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料"
        name="material_id"
        rules={[{ required: true, message: '请选择材料' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={materialOptions}
          placeholder="请选择材料"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="仓库"
        name="warehouse_id"
        rules={[{ required: true, message: '请选择仓库' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={warehouseOptions}
          placeholder="请选择仓库"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="decision_note"
      >
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
      </Form.Item>
    </Form>
  )
}

export function QualityInspectionDecisionForm({ form, mode }) {
  return (
    <Form
      form={form}
      layout="vertical"
      className="erp-business-action-form erp-business-action-form--grid"
    >
      {mode === 'pass' ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="判定结果"
          name="result"
          rules={[{ required: true, message: '请选择判定结果' }]}
        >
          <Select options={RESULT_DECISION_OPTIONS} />
        </Form.Item>
      ) : null}
      {mode !== 'cancel' ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="检验日期"
          name="inspected_at"
        >
          <DateInput />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="判定备注"
        name="decision_note"
      >
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
      </Form.Item>
    </Form>
  )
}
