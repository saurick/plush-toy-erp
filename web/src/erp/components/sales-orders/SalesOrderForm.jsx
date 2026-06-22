import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  AutoComplete,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
} from 'antd'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import {
  deriveSalesOrderItemAmount,
  paymentConditionCompleteness,
  unixToDateInputValue,
} from '../../utils/masterDataOrderView.mjs'

const EMPTY_ORDER_LINES = []

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

function summarizeSalesOrderLines(lines = []) {
  const items = Array.isArray(lines) ? lines : []
  return items.reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.ordered_quantity),
      amount:
        summary.amount + decimalNumber(deriveSalesOrderItemAmount(line) || 0),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

function skuLabel(sku = {}) {
  return [sku.sku_code, sku.sku_name || sku.customer_sku || sku.barcode]
    .filter(Boolean)
    .join(' / ')
}

export function createBlankOrderLine(lineNo = 1) {
  return {
    line_no: lineNo,
    product_sku_id: undefined,
    product_id: undefined,
    unit_id: undefined,
    product_code_snapshot: '',
    product_name_snapshot: '',
    color_snapshot: '',
    ordered_quantity: '',
    unit_price: '',
    amount: '',
    planned_delivery_date: '',
    note: '',
  }
}

function createOrderLineFromSKU(sku = {}, lineNo = 1) {
  return {
    ...createBlankOrderLine(lineNo),
    product_sku_id: sku.id,
    product_id: sku.product_id,
    unit_id: sku.default_unit_id,
    product_code_snapshot: sku.sku_code || '',
    product_name_snapshot:
      sku.sku_name || sku.customer_sku || sku.barcode || '',
    color_snapshot: sku.color || '',
  }
}

export function normalizeSalesOrderItemFormValue(item = {}) {
  const productSkuID = item.product_sku_id || item.product_sku?.id
  return {
    id: item.id,
    line_no: item.line_no,
    product_sku_id: productSkuID,
    product_id: item.product_id,
    unit_id: item.unit_id,
    product_code_snapshot: item.product_code_snapshot || '',
    product_name_snapshot: item.product_name_snapshot || '',
    color_snapshot: item.color_snapshot || '',
    ordered_quantity: item.ordered_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    planned_delivery_date: unixToDateInputValue(item.planned_delivery_date),
    note: item.note || '',
  }
}

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function findOrderLineSKU(line = {}, productSKUs = []) {
  if (line.product_sku_id) {
    return productSKUs.find((sku) => sku.id === line.product_sku_id)
  }
  const productID = Number(line.product_id || 0)
  const unitID = Number(line.unit_id || 0)
  const code = String(line.product_code_snapshot || '').trim()
  const color = String(line.color_snapshot || '').trim()
  return productSKUs.find((sku) => {
    if (productID <= 0 || unitID <= 0) return false
    if (sku.product_id !== productID) return false
    if (sku.default_unit_id !== unitID) return false
    if (code && sku.sku_code !== code) return false
    if (color && sku.color !== color) return false
    return true
  })
}

function buildOrderLineSourceValues(sku = {}) {
  if (!sku?.id) {
    return {
      product_sku_id: undefined,
      product_id: undefined,
      unit_id: undefined,
      product_code_snapshot: '',
      product_name_snapshot: '',
      color_snapshot: '',
    }
  }
  return {
    product_sku_id: sku.id,
    product_id: sku.product_id,
    unit_id: sku.default_unit_id,
    product_code_snapshot: sku.sku_code || '',
    product_name_snapshot:
      sku.sku_name || sku.customer_sku || sku.barcode || '',
    color_snapshot: sku.color || '',
  }
}

function setOrderLineSourceFromSKU(form, lineIndex, sku) {
  const currentLines = form.getFieldValue('items') || []
  const nextLines = [...currentLines]
  nextLines[lineIndex] = {
    ...(nextLines[lineIndex] || {}),
    ...buildOrderLineSourceValues(sku),
  }
  form.setFieldsValue({ items: nextLines })
}

function paymentConditionRule({ form, methodField, termDaysField, field }) {
  return {
    validator: async (_, value) => {
      if (!form) {
        return
      }
      const completeness = paymentConditionCompleteness({
        method: field === 'method' ? value : form.getFieldValue(methodField),
        termDays:
          field === 'termDays' ? value : form.getFieldValue(termDaysField),
      })
      if (field === 'method' && completeness.methodRequired) {
        throw new Error('请填写付款方式')
      }
      if (field === 'termDays' && completeness.termDaysRequired) {
        throw new Error('请填写付款周期(天)')
      }
    },
  }
}

export function SalesOrderFormFields({
  form,
  customers,
  paymentConditionOptions = [],
  onCustomerChange,
  onPaymentMethodChange,
  onPaymentConditionBlur,
}) {
  const orderDate = Form.useWatch('order_date', form)
  const plannedDeliveryDate = Form.useWatch('planned_delivery_date', form)
  const disableOrderDateAfterPlannedDelivery = useCallback(
    (current) => isDateInputAfter(current, plannedDeliveryDate),
    [plannedDeliveryDate]
  )
  const disablePlannedDeliveryBeforeOrderDate = useCallback(
    (current) => isDateInputBefore(current, orderDate),
    [orderDate]
  )

  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="订单号（自动）"
        name="order_no"
        rules={[{ required: true, message: '请填写或保留自动订单号' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="客户"
        name="customer_id"
        rules={[{ required: true, message: '请选择客户' }]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          options={customers.map((customer) => ({
            label: `${customer.code || customer.id} - ${customer.name}`,
            value: customer.id,
          }))}
          onChange={onCustomerChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="客户订单号"
        name="customer_order_no"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['payment_term_days']}
        label="付款方式"
        name="payment_method"
        rules={[
          paymentConditionRule({
            form,
            methodField: 'payment_method',
            termDaysField: 'payment_term_days',
            field: 'method',
          }),
        ]}
      >
        <AutoComplete
          allowClear
          autoComplete="off"
          filterOption={(inputValue, option) =>
            String(option?.value || '')
              .toLowerCase()
              .includes(String(inputValue || '').toLowerCase())
          }
          options={paymentConditionOptions}
          placeholder="选择或输入本单付款方式"
          onBlur={onPaymentConditionBlur}
          onChange={onPaymentMethodChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['payment_method']}
        label="付款周期(天)"
        name="payment_term_days"
        rules={[
          paymentConditionRule({
            form,
            methodField: 'payment_method',
            termDaysField: 'payment_term_days',
            field: 'termDays',
          }),
        ]}
      >
        <InputNumber
          min={0}
          precision={0}
          style={{ width: '100%' }}
          onBlur={onPaymentConditionBlur}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="价格条件说明"
        name="price_condition_note"
      >
        <Input.TextArea
          allowClear
          rows={2}
          showCount
          maxLength={255}
          placeholder="如因账期调整需重新报价，可记录本单价格条件"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="订单日期"
        name="order_date"
        rules={[
          { required: true, message: '请选择订单日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('planned_delivery_date'),
            message: '订单日期不能晚于计划交付日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            plannedDeliveryDate
              ? disableOrderDateAfterPlannedDelivery
              : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['order_date']}
        label="计划交付日期"
        name="planned_delivery_date"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('order_date'),
            message: '计划交付日期不能早于订单日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            orderDate ? disablePlannedDeliveryBeforeOrderDate : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

export function SalesOrderItemsFormSection({
  form,
  canCreateItem,
  canUpdateItem,
  canCancelItem,
  productSKUs,
}) {
  const [skuImportOpen, setSkuImportOpen] = useState(false)
  const watchedItems = Form.useWatch('items', form) || EMPTY_ORDER_LINES
  const orderDate = Form.useWatch('order_date', form)
  const lineSummary = summarizeSalesOrderLines(watchedItems)
  const skuByID = useMemo(
    () => new Map(productSKUs.map((sku) => [sku.id, sku])),
    [productSKUs]
  )
  const disablePlannedDeliveryBeforeOrderDate = useCallback(
    (current) => isDateInputBefore(current, orderDate),
    [orderDate]
  )
  useEffect(() => {
    const currentLines = form.getFieldValue('items') || []
    let changed = false
    const nextLines = currentLines.map((line) => {
      if (line?.product_sku_id) return line
      const matchedSKU = findOrderLineSKU(line, productSKUs)
      if (!matchedSKU) return line
      changed = true
      return {
        ...line,
        product_sku_id: matchedSKU.id,
      }
    })
    if (changed) {
      form.setFieldsValue({ items: nextLines })
    }
  }, [form, productSKUs, watchedItems])
  const skuOptions = productSKUs.map((sku) => ({
    label: skuLabel(sku),
    value: sku.id,
    sku,
  }))
  const skuImportColumns = [
    {
      title: 'SKU 编码',
      dataIndex: 'sku_code',
      width: 150,
      searchText: (sku) => skuLabel(sku),
    },
    {
      title: '产品名称',
      width: 190,
      render: (_, sku) =>
        sku.sku_name || sku.customer_sku || sku.barcode || '-',
      searchText: (sku) => skuLabel(sku),
    },
    { title: '颜色', dataIndex: 'color', width: 110 },
    {
      title: '规格 / 包装',
      width: 170,
      render: (_, sku) =>
        [sku.size, sku.packaging_version].filter(Boolean).join(' / ') || '-',
    },
    { title: '默认单位', dataIndex: 'default_unit_id', width: 100 },
  ]

  return (
    <section className="erp-sales-order-lines-form">
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <>
            <div className="erp-line-items-form__import-row">
              <div className="erp-line-items-form__import-copy">
                <strong>从 SKU 添加明细</strong>
                <span>从来源选择器导入；数量、单价和交期回到订单行维护。</span>
              </div>
              <Button
                className="erp-line-items-form__import-button"
                disabled={!canCreateItem}
                onClick={() => setSkuImportOpen(true)}
              >
                从 SKU 库导入
              </Button>
            </div>
            <SourceImportPickerModal
              open={skuImportOpen}
              title="从 SKU 库导入订单行"
              description="这里只选择来源记录；数量、单价和交期仍在主弹窗订单行里维护。"
              rows={productSKUs}
              columns={skuImportColumns}
              getSelectedLabel={(sku) =>
                sku?.sku_code || sku?.product_no || sku?.id || '-'
              }
              searchPlaceholder="搜索 SKU 编码、名称、颜色或包装"
              emptyDescription="暂无可导入 SKU"
              onCancel={() => setSkuImportOpen(false)}
              onImport={(selectedSKUs) => {
                let nextLineNo = getNextLineNo(
                  form.getFieldValue('items') || []
                )
                selectedSKUs.forEach((sku) => {
                  add(createOrderLineFromSKU(sku, nextLineNo))
                  nextLineNo += 1
                })
                setSkuImportOpen(false)
              }}
            />
            <div className="erp-sales-order-lines-form__head">
              <div>
                <strong>订单行</strong>
                <span>同一个销售订单内维护多条客户承诺明细。</span>
              </div>
            </div>
            {fields.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无订单行，可在同一表单内新增"
              />
            ) : (
              <div className="erp-sales-order-lines-form__list">
                {fields.map((field, index) => {
                  const lineId = form.getFieldValue(['items', field.name, 'id'])
                  const isExistingLine = Boolean(lineId)
                  const canEditLine = isExistingLine
                    ? canUpdateItem
                    : canCreateItem
                  const canRemoveLine = isExistingLine
                    ? canCancelItem
                    : canCreateItem

                  return (
                    <div
                      key={field.key}
                      className="erp-sales-order-lines-form__row"
                    >
                      <div className="erp-sales-order-lines-form__row-head">
                        <Space wrap size={8}>
                          <strong>第 {index + 1} 行</strong>
                          {isExistingLine ? <Tag>已保存</Tag> : <Tag>新增</Tag>}
                        </Space>
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          disabled={!canRemoveLine}
                          onClick={() => remove(field.name)}
                        >
                          移除
                        </Button>
                      </div>
                      <div className="erp-sales-order-lines-form__grid">
                        <Form.Item name={[field.name, 'id']} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item name={[field.name, 'product_id']} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item name={[field.name, 'unit_id']} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item
                          label="行号"
                          name={[field.name, 'line_no']}
                          rules={[{ required: true, message: '请填写行号' }]}
                        >
                          <InputNumber
                            min={1}
                            precision={0}
                            disabled={!canEditLine}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                        <Form.Item
                          label="SKU / 产品来源"
                          name={[field.name, 'product_sku_id']}
                          rules={[
                            {
                              validator: async () => {
                                const line =
                                  form.getFieldValue(['items', field.name]) ||
                                  {}
                                if (
                                  Number(line.product_id || 0) > 0 &&
                                  Number(line.unit_id || 0) > 0
                                ) {
                                  return
                                }
                                throw new Error('请选择 SKU / 产品来源')
                              },
                            },
                          ]}
                        >
                          <Select
                            showSearch
                            allowClear
                            disabled={!canEditLine}
                            optionFilterProp="label"
                            options={skuOptions}
                            placeholder="选择 SKU 后自动带出产品和单位"
                            onChange={(value, option) => {
                              const sku =
                                option?.sku ||
                                skuByID.get(value) ||
                                productSKUs.find((item) => item.id === value)
                              setOrderLineSourceFromSKU(form, field.name, sku)
                            }}
                          />
                        </Form.Item>
                        <Form.Item
                          noStyle
                          shouldUpdate={(previous, current) =>
                            previous?.items?.[field.name]?.product_id !==
                              current?.items?.[field.name]?.product_id ||
                            previous?.items?.[field.name]?.unit_id !==
                              current?.items?.[field.name]?.unit_id ||
                            previous?.items?.[field.name]
                              ?.product_code_snapshot !==
                              current?.items?.[field.name]
                                ?.product_code_snapshot ||
                            previous?.items?.[field.name]
                              ?.product_name_snapshot !==
                              current?.items?.[field.name]
                                ?.product_name_snapshot
                          }
                        >
                          {({ getFieldValue }) => {
                            const line = getFieldValue(['items', field.name])
                            const sourceText = [
                              line?.product_code_snapshot ||
                                (line?.product_id
                                  ? `产品 #${line.product_id}`
                                  : ''),
                              line?.product_name_snapshot,
                              line?.unit_id ? `单位 #${line.unit_id}` : '',
                            ]
                              .filter(Boolean)
                              .join(' / ')
                            return (
                              <Form.Item label="带出产品 / 单位">
                                <Input
                                  value={sourceText}
                                  disabled
                                  readOnly
                                  placeholder="选择 SKU 后自动带出"
                                />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                        <Form.Item
                          label="产品编号快照"
                          name={[field.name, 'product_code_snapshot']}
                        >
                          <Input autoComplete="off" disabled readOnly />
                        </Form.Item>
                        <Form.Item
                          label="产品名称快照"
                          name={[field.name, 'product_name_snapshot']}
                          rules={[
                            {
                              required: true,
                              message: '请填写产品名称快照',
                            },
                          ]}
                        >
                          <Input autoComplete="off" disabled readOnly />
                        </Form.Item>
                        <Form.Item
                          label="颜色快照"
                          name={[field.name, 'color_snapshot']}
                        >
                          <Input autoComplete="off" disabled readOnly />
                        </Form.Item>
                        <Form.Item
                          label="订单数量"
                          name={[field.name, 'ordered_quantity']}
                          rules={[
                            { required: true, message: '请填写订单数量' },
                          ]}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                            placeholder="decimal，如 120.5"
                          />
                        </Form.Item>
                        <Form.Item
                          label="单价"
                          name={[field.name, 'unit_price']}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                        <Form.Item
                          noStyle
                          shouldUpdate={(previous, current) =>
                            previous?.items?.[field.name]?.ordered_quantity !==
                              current?.items?.[field.name]?.ordered_quantity ||
                            previous?.items?.[field.name]?.unit_price !==
                              current?.items?.[field.name]?.unit_price ||
                            previous?.items?.[field.name]?.amount !==
                              current?.items?.[field.name]?.amount
                          }
                        >
                          {({ getFieldValue }) => {
                            const line = getFieldValue(['items', field.name])
                            return (
                              <Form.Item label="金额">
                                <Input
                                  value={deriveSalesOrderItemAmount(line) || ''}
                                  disabled
                                  readOnly
                                  placeholder="数量 × 单价自动计算"
                                />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                        <Form.Item
                          label="计划交付日期"
                          name={[field.name, 'planned_delivery_date']}
                          dependencies={['order_date']}
                          rules={[
                            dateInputNotBeforeRule({
                              getStartValue: () =>
                                form.getFieldValue('order_date'),
                              message: '订单行计划交付不能早于订单日期',
                            }),
                          ]}
                        >
                          <DateInput
                            disabled={!canEditLine}
                            disabledDate={
                              orderDate
                                ? disablePlannedDeliveryBeforeOrderDate
                                : undefined
                            }
                          />
                        </Form.Item>
                        <Form.Item
                          className="erp-sales-order-lines-form__field--full"
                          label="备注"
                          name={[field.name, 'note']}
                        >
                          <Input.TextArea
                            allowClear
                            rows={2}
                            showCount
                            maxLength={300}
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="erp-line-items-form__footer">
              <div className="erp-line-items-form__footer-actions">
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  disabled={!canCreateItem}
                  onClick={() => {
                    const currentLines = form.getFieldValue('items') || []
                    add(createBlankOrderLine(getNextLineNo(currentLines)))
                  }}
                >
                  添加待选行
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
  )
}
