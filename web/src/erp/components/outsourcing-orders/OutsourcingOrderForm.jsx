import React from 'react'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Select } from 'antd'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
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

function lineAmount(line = {}) {
  const explicitAmount = decimalNumber(line.amount)
  if (explicitAmount > 0) return explicitAmount
  return (
    decimalNumber(line.outsourcing_quantity) * decimalNumber(line.unit_price)
  )
}

function summarizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.outsourcing_quantity),
      amount: summary.amount + lineAmount(line),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

function getNextLineNo(lines = []) {
  return (
    lines.reduce((maxValue, line) => {
      const lineNo = Number(line?.line_no || 0)
      return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
    }, 0) + 1
  )
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

export function createBlankOutsourcingLine(lineNo = 1) {
  return {
    line_no: lineNo,
    product_id: undefined,
    process_id: undefined,
    unit_id: undefined,
    product_no_snapshot: '',
    product_name_snapshot: '',
    process_name_snapshot: '',
    process_category_snapshot: '',
    unit_name_snapshot: '',
    outsourcing_quantity: '',
    unit_price: '',
    amount: '',
    expected_return_date: '',
    note: '',
  }
}

export function normalizeOutsourcingLineFormValue(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    product_id: item.product_id,
    process_id: item.process_id,
    unit_id: item.unit_id,
    product_no_snapshot: item.product_no_snapshot || '',
    product_name_snapshot: item.product_name_snapshot || '',
    process_name_snapshot: item.process_name_snapshot || '',
    process_category_snapshot: item.process_category_snapshot || '',
    unit_name_snapshot: item.unit_name_snapshot || '',
    outsourcing_quantity: item.outsourcing_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    expected_return_date: unixToDateInputValue(item.expected_return_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

export function supplierLabel(supplier = {}) {
  return [supplier.code, supplier.short_name || supplier.name]
    .filter(Boolean)
    .join(' / ')
}

export function productLabel(product = {}) {
  return [product.code, product.name].filter(Boolean).join(' / ')
}

export function processLabel(process = {}) {
  return [process.code, process.name, process.category]
    .filter(Boolean)
    .join(' / ')
}

export function unitLabel(unit = {}) {
  return [unit.code, unit.name].filter(Boolean).join(' / ')
}

export default function OutsourcingOrderForm({
  form,
  supplierOptions,
  productOptions,
  processOptions,
  unitOptions,
  onProductChange,
  onProcessChange,
  onUnitChange,
}) {
  const watchedItems = Form.useWatch('items', form) || []
  const lineSummary = summarizeLines(watchedItems)

  return (
    <Form
      form={form}
      layout="vertical"
      preserve={false}
      className="erp-business-action-form"
    >
      <Form.Item
        className="erp-business-action-form__field"
        name="outsourcing_order_no"
        label="加工合同号（自动）"
        rules={[{ required: true, message: '请输入或保留自动加工合同号' }]}
      >
        <Input maxLength={64} placeholder="自动生成，可按需要调整" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="supplier_id"
        label="加工厂"
        rules={[{ required: true, message: '请选择加工厂' }]}
      >
        <Select showSearch options={supplierOptions} optionFilterProp="label" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="source_order_no"
        label="来源订单号"
      >
        <Input maxLength={128} placeholder="如产品订单编号 / 销售订单号" />
      </Form.Item>
      <Form.Item name="source_sales_order_id" hidden>
        <Input />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="order_date"
        label="下单日期"
        rules={[{ required: true, message: '请选择下单日期' }]}
      >
        <DateInput />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="expected_return_date"
        label="预计回货"
      >
        <DateInput />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        name="note"
        label="备注"
      >
        <Input maxLength={255} />
      </Form.Item>

      <section className="erp-sales-order-lines-form">
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              <div className="erp-sales-order-lines-form__head">
                <div>
                  <strong>加工明细</strong>
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
                        删除行
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
                        name={[field.name, 'product_id']}
                        label="产品"
                        rules={[{ required: true, message: '请选择产品' }]}
                      >
                        <Select
                          showSearch
                          options={productOptions}
                          optionFilterProp="label"
                          onChange={(value) =>
                            onProductChange(field.name, value)
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'process_id']}
                        label="工序"
                        extra="查货只表示加工环节；合格、不合格、让步、返工等结果不在加工合同里维护。"
                        rules={[{ required: true, message: '请选择工序' }]}
                      >
                        <Select
                          showSearch
                          options={processOptions}
                          optionFilterProp="label"
                          onChange={(value) =>
                            onProcessChange(field.name, value)
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'unit_id']}
                        label="单位"
                        rules={[{ required: true, message: '请选择单位' }]}
                      >
                        <Select
                          showSearch
                          options={unitOptions}
                          optionFilterProp="label"
                          onChange={(value) => onUnitChange(field.name, value)}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'product_no_snapshot']}
                        hidden
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'product_name_snapshot']}
                        hidden
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'process_name_snapshot']}
                        hidden
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'process_category_snapshot']}
                        hidden
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'unit_name_snapshot']}
                        hidden
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'outsourcing_quantity']}
                        label="加工数量"
                        rules={[{ required: true, message: '请输入加工数量' }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'unit_price']} label="单价">
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'amount']} label="金额">
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'expected_return_date']}
                        label="行预计回货"
                      >
                        <DateInput />
                      </Form.Item>
                      <Form.Item name={[field.name, 'note']} label="备注">
                        <Input maxLength={255} />
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
                    onClick={() =>
                      add(
                        createBlankOutsourcingLine(
                          getNextLineNo(form.getFieldValue('items') || [])
                        )
                      )
                    }
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
                      {formatSummaryNumber(lineSummary.quantity, 3)}
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
