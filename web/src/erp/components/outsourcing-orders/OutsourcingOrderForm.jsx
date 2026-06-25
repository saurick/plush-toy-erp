import React, { useCallback } from 'react'
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select, Space } from 'antd'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import FieldWithUnitSuffix, {
  isQuantityTextWithinUnitPrecision,
  unitPrecisionErrorMessage,
  unitPrecisionFromOptions,
  unitSuffixTextFromOptions,
} from '../business-list/FieldWithUnitSuffix.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import { unixToDateInputValue } from '../../utils/masterDataOrderView.mjs'
import { createDuplicatedDraftLineItem } from '../../utils/businessLineItems.mjs'

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

function quantityPrecisionRule({ form, fieldName, unitOptions }) {
  return {
    validator: async (_, value) => {
      const line = form.getFieldValue(['items', fieldName]) || {}
      const precision = unitPrecisionFromOptions(unitOptions, line.unit_id)
      if (!isQuantityTextWithinUnitPrecision(value, precision)) {
        throw new Error(unitPrecisionErrorMessage(precision))
      }
    },
  }
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
  attachmentPanel,
  onProductChange,
  onProcessChange,
  onUnitChange,
}) {
  const watchedItems = Form.useWatch('items', form) || []
  const orderDate = Form.useWatch('order_date', form)
  const expectedReturnDate = Form.useWatch('expected_return_date', form)
  const lineSummary = summarizeLines(watchedItems)
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll(watchedItems.length)
  const disableOrderDateAfterExpectedReturn = useCallback(
    (current) => isDateInputAfter(current, expectedReturnDate),
    [expectedReturnDate]
  )
  const disableExpectedReturnBeforeOrderDate = useCallback(
    (current) => isDateInputBefore(current, orderDate),
    [orderDate]
  )

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
        rules={[
          { required: true, message: '请选择下单日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('expected_return_date'),
            message: '下单日期不能晚于预计回货',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            expectedReturnDate ? disableOrderDateAfterExpectedReturn : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['order_date']}
        name="expected_return_date"
        label="预计回货"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('order_date'),
            message: '预计回货不能早于下单日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            orderDate ? disableExpectedReturnBeforeOrderDate : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
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
                    ref={(node) => registerLineItemRow(index, node)}
                  >
                    <div className="erp-sales-order-lines-form__row-head">
                      <strong>第 {index + 1} 行</strong>
                      <Space
                        className="erp-sales-order-lines-form__row-actions"
                        size={4}
                        wrap
                      >
                        <Button
                          aria-label={`复制第 ${index + 1} 行`}
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            const currentLines =
                              form.getFieldValue('items') || []
                            const sourceLine =
                              currentLines[field.name] ||
                              currentLines[index] ||
                              {}
                            add(
                              createDuplicatedDraftLineItem(sourceLine),
                              index + 1
                            )
                            requestLineItemScroll(index + 1)
                          }}
                        >
                          复制行
                        </Button>
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          disabled={fields.length <= 1}
                          onClick={() => remove(field.name)}
                        >
                          移除行
                        </Button>
                      </Space>
                    </div>
                    <div className="erp-sales-order-lines-form__grid">
                      <Form.Item name={[field.name, 'id']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'line_no']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--source"
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
                        className="erp-line-item-field erp-line-item-field--source"
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
                        className="erp-line-item-field erp-line-item-field--unit"
                        name={[field.name, 'unit_id']}
                        label="单位"
                        rules={[{ required: true, message: '请选择单位' }]}
                      >
                        <Select
                          showSearch
                          options={unitOptions}
                          optionFilterProp="searchText"
                          onChange={(value) => {
                            onUnitChange(field.name, value)
                            form
                              .validateFields([
                                ['items', field.name, 'outsourcing_quantity'],
                              ])
                              .catch(() => {})
                          }}
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
                        className="erp-line-item-field erp-line-item-field--quantity"
                        name={[field.name, 'outsourcing_quantity']}
                        label="加工数量"
                        rules={[
                          { required: true, message: '请输入加工数量' },
                          quantityPrecisionRule({
                            form,
                            fieldName: field.name,
                            unitOptions,
                          }),
                        ]}
                      >
                        <FieldWithUnitSuffix
                          control={<Input />}
                          unitText={unitSuffixTextFromOptions(
                            unitOptions,
                            watchedItems?.[field.name]?.unit_id,
                            watchedItems?.[field.name]?.unit_name_snapshot
                          )}
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--money"
                        name={[field.name, 'unit_price']}
                        label="单价"
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--money"
                        name={[field.name, 'amount']}
                        label="金额"
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--date"
                        name={[field.name, 'expected_return_date']}
                        label="行预计回货"
                        dependencies={['order_date']}
                        rules={[
                          dateInputNotBeforeRule({
                            getStartValue: () =>
                              form.getFieldValue('order_date'),
                            message: '行预计回货不能早于下单日期',
                          }),
                        ]}
                      >
                        <DateInput
                          disabledDate={
                            orderDate
                              ? disableExpectedReturnBeforeOrderDate
                              : undefined
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
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
                      requestLineItemScroll(currentLines.length)
                      add(
                        createBlankOutsourcingLine(getNextLineNo(currentLines))
                      )
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
