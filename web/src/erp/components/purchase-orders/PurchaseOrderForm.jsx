import React, { useCallback, useMemo, useState } from 'react'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Select } from 'antd'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import { unixToDateInputValue } from '../../utils/masterDataOrderView.mjs'

function decimalNumber(value) {
  const numeric = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(numeric) ? numeric : 0
}

function formatSummaryNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value) || value === 0) {
    return fractionDigits > 0 ? Number(0).toFixed(fractionDigits) : '0'
  }
  return fractionDigits > 0
    ? value.toFixed(fractionDigits)
    : String(Number(value.toFixed(4)))
}

function purchaseLineAmount(line = {}) {
  const explicitAmount = decimalNumber(line.amount)
  if (explicitAmount > 0) {
    return explicitAmount
  }
  return decimalNumber(line.purchased_quantity) * decimalNumber(line.unit_price)
}

function summarizePurchaseLines(lines = []) {
  const items = Array.isArray(lines) ? lines : []
  return items.reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.purchased_quantity),
      amount: summary.amount + purchaseLineAmount(line),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function supplierLabel(supplier = {}) {
  return [supplier.code, supplier.name].filter(Boolean).join(' / ')
}

function materialLabel(material = {}) {
  return [material.code, material.name].filter(Boolean).join(' / ')
}

export function createBlankPurchaseLine(lineNo = 1) {
  return {
    line_no: lineNo,
    material_id: undefined,
    unit_id: undefined,
    material_code_snapshot: '',
    material_name_snapshot: '',
    color_snapshot: '',
    purchased_quantity: '',
    unit_price: '',
    amount: '',
    expected_arrival_date: '',
    note: '',
  }
}

function createLineFromMaterial(material = {}, lineNo = 1) {
  return {
    ...createBlankPurchaseLine(lineNo),
    material_id: material.id,
    unit_id: material.default_unit_id,
    material_code_snapshot: material.code || '',
    material_name_snapshot: material.name || '',
    color_snapshot: material.color || '',
  }
}

export function normalizePurchaseLineFormValue(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    material_id: item.material_id,
    unit_id: item.unit_id,
    material_code_snapshot: item.material_code_snapshot || '',
    material_name_snapshot: item.material_name_snapshot || '',
    color_snapshot: item.color_snapshot || '',
    purchased_quantity: item.purchased_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    expected_arrival_date: unixToDateInputValue(item.expected_arrival_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

export function PurchaseOrderFormFields({
  form,
  suppliers,
  materials,
  unitOptions,
  attachmentPanel,
  onSupplierChange,
  onMaterialChange,
}) {
  const [materialImportOpen, setMaterialImportOpen] = useState(false)
  const watchedItems = Form.useWatch('items', form) || []
  const purchaseDate = Form.useWatch('purchase_date', form)
  const expectedArrivalDate = Form.useWatch('expected_arrival_date', form)
  const lineSummary = summarizePurchaseLines(watchedItems)
  const disablePurchaseDateAfterExpectedArrival = useCallback(
    (current) => isDateInputAfter(current, expectedArrivalDate),
    [expectedArrivalDate]
  )
  const disableExpectedArrivalBeforePurchaseDate = useCallback(
    (current) => isDateInputBefore(current, purchaseDate),
    [purchaseDate]
  )
  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )
  const materialOptions = useMemo(
    () =>
      materials.map((item) => ({
        value: item.id,
        label: materialLabel(item),
        item,
      })),
    [materials]
  )
  const materialImportColumns = useMemo(
    () => [
      {
        title: '材料编码',
        dataIndex: 'code',
        width: 150,
        searchText: (material) => materialLabel(material),
      },
      {
        title: '材料名称',
        dataIndex: 'name',
        width: 190,
        searchText: (material) => materialLabel(material),
      },
      { title: '分类', dataIndex: 'category', width: 120 },
      { title: '规格', dataIndex: 'spec', width: 170 },
      { title: '颜色', dataIndex: 'color', width: 110 },
      { title: '默认单位', dataIndex: 'default_unit_id', width: 100 },
    ],
    []
  )

  return (
    <Form
      form={form}
      layout="vertical"
      preserve={false}
      className="erp-business-action-form"
    >
      <Form.Item name="supplier_snapshot" hidden>
        <Input />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="purchase_order_no"
        label="采购单号（自动）"
        rules={[{ required: true, message: '请输入或保留自动采购单号' }]}
      >
        <Input maxLength={64} placeholder="自动生成，可按需要调整" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="supplier_id"
        label="供应商"
        rules={[{ required: true, message: '请选择供应商' }]}
      >
        <Select
          showSearch
          options={supplierOptions}
          optionFilterProp="label"
          onChange={onSupplierChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="supplier_purchase_order_no"
        label="供应商单号"
      >
        <Input maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="purchase_date"
        label="采购日期"
        rules={[
          { required: true, message: '请选择采购日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('expected_arrival_date'),
            message: '采购日期不能晚于预计到货',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            expectedArrivalDate
              ? disablePurchaseDateAfterExpectedArrival
              : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['purchase_date']}
        name="expected_arrival_date"
        label="预计到货"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('purchase_date'),
            message: '预计到货不能早于采购日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            purchaseDate ? disableExpectedArrivalBeforePurchaseDate : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="note"
        label="备注"
      >
        <Input.TextArea allowClear rows={2} showCount maxLength={255} />
      </Form.Item>
      {attachmentPanel}

      <section className="erp-sales-order-lines-form">
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              <div className="erp-line-items-form__import-row">
                <div className="erp-line-items-form__import-copy">
                  <strong>导入材料</strong>
                  <span>
                    从来源选择器导入；数量、单价和预计到货回到采购明细维护。
                  </span>
                </div>
                <Button
                  className="erp-line-items-form__import-button"
                  onClick={() => setMaterialImportOpen(true)}
                >
                  从材料库导入
                </Button>
              </div>
              <SourceImportPickerModal
                open={materialImportOpen}
                title="从材料库导入采购明细"
                description="这里只选择材料来源；数量、单价和预计到货仍在主弹窗采购明细里维护。"
                rows={materials}
                columns={materialImportColumns}
                getSelectedLabel={(material) =>
                  material?.material_no ||
                  material?.code ||
                  material?.name ||
                  material?.id ||
                  '-'
                }
                searchPlaceholder="搜索材料编码、名称、分类、规格或颜色"
                emptyDescription="暂无可导入材料"
                onCancel={() => setMaterialImportOpen(false)}
                onImport={(selectedMaterials) => {
                  let nextLineNo = getNextLineNo(
                    form.getFieldValue('items') || []
                  )
                  selectedMaterials.forEach((material) => {
                    add(createLineFromMaterial(material, nextLineNo))
                    nextLineNo += 1
                  })
                  setMaterialImportOpen(false)
                }}
              />
              <div className="erp-sales-order-lines-form__head">
                <div>
                  <strong>采购明细</strong>
                  <span>同一个采购订单内维护多条供应商承诺明细。</span>
                </div>
              </div>
              <div className="erp-sales-order-lines-form__list">
                {fields.map((field, index) => (
                  <div
                    className="erp-sales-order-lines-form__row"
                    key={field.key}
                  >
                    <div className="erp-sales-order-lines-form__row-head">
                      <strong>第 {index + 1} 行</strong>
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        disabled={fields.length <= 1}
                        onClick={() => remove(field.name)}
                      >
                        移除行
                      </Button>
                    </div>
                    <div className="erp-sales-order-lines-form__grid">
                      <Form.Item name={[field.name, 'id']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'line_no']}
                        label="行号"
                        rules={[{ required: true, message: '请输入行号' }]}
                      >
                        <InputNumber
                          min={1}
                          precision={0}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'material_id']}
                        label="材料"
                        rules={[{ required: true, message: '请选择材料' }]}
                      >
                        <Select
                          showSearch
                          options={materialOptions}
                          optionFilterProp="label"
                          onChange={(value) =>
                            onMaterialChange(field.name, value)
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'unit_id']}
                        label="单位"
                        rules={[{ required: true, message: '请选择单位' }]}
                      >
                        <Select
                          allowClear
                          optionFilterProp="label"
                          options={unitOptions}
                          placeholder="请选择单位"
                          showSearch
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'material_code_snapshot']}
                        label="材料编码快照"
                      >
                        <Input maxLength={64} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'material_name_snapshot']}
                        label="材料名称快照"
                      >
                        <Input maxLength={255} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'color_snapshot']}
                        label="颜色快照"
                      >
                        <Input maxLength={64} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'purchased_quantity']}
                        label="采购数量"
                        rules={[{ required: true, message: '请输入采购数量' }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'unit_price']} label="单价">
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'amount']} label="金额">
                        <Input placeholder="留空时按数量和单价派生" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'expected_arrival_date']}
                        label="预计到货"
                        dependencies={['purchase_date']}
                        rules={[
                          dateInputNotBeforeRule({
                            getStartValue: () =>
                              form.getFieldValue('purchase_date'),
                            message: '明细预计到货不能早于采购日期',
                          }),
                        ]}
                      >
                        <DateInput
                          disabledDate={
                            purchaseDate
                              ? disableExpectedArrivalBeforePurchaseDate
                              : undefined
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-sales-order-lines-form__field--full"
                        name={[field.name, 'note']}
                        label="备注"
                      >
                        <Input.TextArea
                          allowClear
                          rows={2}
                          showCount
                          maxLength={255}
                        />
                      </Form.Item>
                    </div>
                  </div>
                ))}
              </div>
              <div className="erp-line-items-form__footer">
                <div className="erp-line-items-form__footer-actions">
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const currentLines = form.getFieldValue('items') || []
                      add(createBlankPurchaseLine(getNextLineNo(currentLines)))
                    }}
                  >
                    添加条目
                  </Button>
                </div>
                <div className="erp-line-items-form__stats">
                  <span className="erp-line-items-form__stat">
                    已录入
                    <strong className="erp-line-items-form__stat-value">
                      {lineSummary.count}
                    </strong>
                    条
                  </span>
                  <span className="erp-line-items-form__stat">
                    数量合计
                    <strong className="erp-line-items-form__stat-value">
                      {formatSummaryNumber(lineSummary.quantity)}
                    </strong>
                  </span>
                  <span className="erp-line-items-form__stat">
                    金额合计
                    <strong className="erp-line-items-form__stat-value">
                      {formatSummaryNumber(lineSummary.amount, 2)}
                    </strong>
                  </span>
                </div>
              </div>
            </>
          )}
        </Form.List>
      </section>
    </Form>
  )
}
