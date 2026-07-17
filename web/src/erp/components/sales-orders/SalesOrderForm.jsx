import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
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
import FieldWithUnitSuffix, {
  isQuantityTextWithinUnitPrecision,
  singleUnitSuffixTextFromOptions,
  unitPrecisionErrorMessage,
  unitPrecisionFromOptions,
  unitSuffixTextFromOptions,
} from '../business-list/FieldWithUnitSuffix.jsx'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import BusinessLineItemsFooter from '../business-list/BusinessLineItemsFooter.jsx'
import BusinessLineItemsSummaryValue from '../business-list/BusinessLineItemsSummaryValue.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import {
  buildSalesOrderItemSourceValuesFromSKU,
  deriveSalesOrderItemAmount,
  paymentConditionCompleteness,
  summarizeSalesOrderLines,
  unixToDateInputValue,
} from '../../utils/masterDataOrderView.mjs'
import {
  optionalContactEmailRule,
  optionalContactPhoneRule,
} from '../../utils/contactValidation.mjs'
import { createDuplicatedDraftLineItem } from '../../utils/businessLineItems.mjs'
import {
  CATALOG_FILL_DUPLICATE_POLICIES,
  CATALOG_FILL_MODES,
  buildCatalogFillRowsPlan,
} from '../../utils/catalogFillRows.mjs'

function formatSummaryNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value) || value === 0) {
    return fractionDigits > 0 ? Number(0).toFixed(fractionDigits) : '0'
  }
  return fractionDigits > 0
    ? value.toFixed(fractionDigits)
    : String(Number(value.toFixed(4)))
}

function skuLabel(sku = {}) {
  return (
    [sku.sku_code, sku.sku_name || sku.customer_sku || sku.barcode]
      .filter(Boolean)
      .join(' / ') || 'SKU 已关联'
  )
}

function contactOptionLabel(contact = {}) {
  return (
    [contact.name, contact.title, contactPhoneText(contact)]
      .filter(Boolean)
      .join(' / ') || '联系人已关联'
  )
}

function contactPhoneText(contact = {}) {
  return contact.mobile || contact.phone || ''
}

function sourceDefaultUnitText(unitOptions, unitID) {
  const normalizedID = Number(unitID || 0)
  if (!Number.isFinite(normalizedID) || normalizedID <= 0) {
    return '-'
  }
  return (
    unitSuffixTextFromOptions(unitOptions, normalizedID, '单位已关联') ||
    '单位已关联'
  )
}

export function createBlankOrderLine(lineNo = 1, { unitID } = {}) {
  return {
    line_no: lineNo,
    product_sku_id: undefined,
    product_id: undefined,
    unit_id: unitID,
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
    ...buildSalesOrderItemSourceValuesFromSKU(sku),
  }
}

function optionalFormValue(value) {
  return value === null || value === undefined ? '' : value
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
    ordered_quantity: optionalFormValue(item.ordered_quantity),
    unit_price: optionalFormValue(item.unit_price),
    amount: optionalFormValue(item.amount),
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

function setOrderLineSourceFromSKU(form, lineIndex, sku) {
  const currentLines = form.getFieldValue('items') || []
  const nextLines = [...currentLines]
  nextLines[lineIndex] = {
    ...(nextLines[lineIndex] || {}),
    ...buildSalesOrderItemSourceValuesFromSKU(sku),
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

function isOrderLineQuantityValidForUnit(line, quantityField, unitOptions) {
  return isQuantityTextWithinUnitPrecision(
    line?.[quantityField],
    unitPrecisionFromOptions(unitOptions, line?.unit_id)
  )
}

export function SalesOrderFormFields({
  form,
  customers,
  contactOptions = [],
  salesOwnerOptions = [],
  paymentConditionOptions = [],
  onCustomerChange,
  onContactSelect,
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
          allowClear
          showSearch
          optionFilterProp="label"
          options={customers.map((customer) => {
            const customerCode = String(customer.code || '').trim()
            const customerName = String(customer.name || '').trim()
            return {
              label: customerCode
                ? `${customerCode} - ${customerName || '未命名客户'}`
                : customerName || '客户已关联',
              value: customer.id,
            }
          })}
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
        label="业务员 / 跟单人"
        name="sales_owner"
      >
        <AutoComplete
          allowClear
          autoComplete="off"
          filterOption={(inputValue, option) =>
            String(option?.value || '')
              .toLowerCase()
              .includes(String(inputValue || '').toLowerCase())
          }
          options={salesOwnerOptions}
          placeholder="录入本单负责人"
          maxLength={128}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="联系人"
        name="contact_name"
      >
        <AutoComplete
          allowClear
          autoComplete="off"
          filterOption={(inputValue, option) =>
            String(option?.label || option?.value || '')
              .toLowerCase()
              .includes(String(inputValue || '').toLowerCase())
          }
          options={contactOptions
            .map((contact) => ({
              value: contact.name,
              label: contactOptionLabel(contact),
              contact,
            }))
            .filter((option) => option.value)}
          placeholder="选择客户联系人或手动录入"
          maxLength={128}
          onChange={(value) => {
            if (!value) {
              form.setFieldsValue({
                contact_phone: '',
                contact_mobile: '',
                contact_email: '',
                contact_title: '',
              })
            }
          }}
          onSelect={(_, option) => onContactSelect?.(option?.contact)}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="联系电话"
        name="contact_phone"
        rules={[optionalContactPhoneRule()]}
      >
        <Input allowClear autoComplete="off" maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="联系邮箱"
        name="contact_email"
        rules={[optionalContactEmailRule()]}
      >
        <Input allowClear autoComplete="off" maxLength={128} />
      </Form.Item>
      <Form.Item name="contact_mobile" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="contact_title" hidden>
        <Input />
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
        label="报价备注"
        name="price_condition_note"
      >
        <Input.TextArea
          allowClear
          autoSize={{ minRows: 1, maxRows: 3 }}
          showCount
          maxLength={255}
          placeholder="账期影响报价时记录核对结论"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="签约日期"
        name="order_date"
        rules={[
          { required: true, message: '请选择签约日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('planned_delivery_date'),
            message: '签约日期不能晚于计划交付日期',
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
            message: '计划交付日期不能早于签约日期',
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
        <Input.TextArea
          allowClear
          autoSize={{ minRows: 1, maxRows: 3 }}
          showCount
          maxLength={300}
        />
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
  unitOptions = [],
}) {
  const [skuImportOpen, setSkuImportOpen] = useState(false)
  const orderDate = Form.useWatch('order_date', form)
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  const skuByID = useMemo(
    () => new Map(productSKUs.map((sku) => [sku.id, sku])),
    [productSKUs]
  )
  const defaultUnitID = useMemo(
    () => (unitOptions.length === 1 ? unitOptions[0].value : undefined),
    [unitOptions]
  )
  const disablePlannedDeliveryBeforeOrderDate = useCallback(
    (current) => isDateInputBefore(current, orderDate),
    [orderDate]
  )
  useEffect(() => {
    if (!defaultUnitID) return
    const currentLines = form.getFieldValue('items') || []
    let changed = false
    const nextLines = currentLines.map((line) => {
      if (Number(line?.unit_id || 0) > 0) return line
      changed = true
      return {
        ...line,
        unit_id: defaultUnitID,
      }
    })
    if (changed) {
      form.setFieldsValue({ items: nextLines })
    }
  }, [defaultUnitID, form])
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
  }, [form, productSKUs])
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
    {
      title: '默认单位',
      key: 'default_unit',
      width: 100,
      render: (_, sku) =>
        sourceDefaultUnitText(unitOptions, sku.default_unit_id),
    },
  ]

  return (
    <section className="erp-sales-order-lines-form">
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <>
            <div className="erp-line-items-form__import-row">
              <div className="erp-line-items-form__import-copy">
                <strong>从 SKU 添加明细</strong>
                <span>从 SKU 库添加；数量、单价和交期回到订单行维护。</span>
              </div>
              <Button
                className="erp-line-items-form__import-button"
                disabled={!canCreateItem}
                onClick={() => setSkuImportOpen(true)}
              >
                从 SKU 库添加
              </Button>
            </div>
            <SourceImportPickerModal
              open={skuImportOpen}
              title="选择 SKU 添加订单行"
              description="这里只选择 SKU 档案；数量、单价和交期仍在主弹窗订单行里维护。"
              rows={productSKUs}
              columns={skuImportColumns}
              getSelectedLabel={skuLabel}
              searchPlaceholder="搜索 SKU"
              searchHint="可搜索：SKU 编码、名称、颜色、包装"
              importText="添加到订单行"
              selectedNoun="SKU"
              emptyDescription="暂无可选 SKU"
              onCancel={() => setSkuImportOpen(false)}
              onImport={(selectedSKUs) => {
                const currentLines = form.getFieldValue('items') || []
                const nextLineNo = getNextLineNo(currentLines)
                const startIndex = currentLines.length
                const { rowsToAdd: importedLines } = buildCatalogFillRowsPlan({
                  currentRows: currentLines,
                  selectedRows: selectedSKUs,
                  mode: CATALOG_FILL_MODES.APPEND,
                  // 同一 SKU 可因交期、价格或客户要求拆成多行。
                  duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.ALLOW,
                  getCurrentSourceKey: (line) => line.product_sku_id,
                  getSelectedSourceKey: (sku) => sku.id,
                  mapSelectedRow: (sku, { acceptedIndex }) =>
                    createOrderLineFromSKU(sku, nextLineNo + acceptedIndex),
                })
                importedLines.forEach(() => {
                  add()
                })
                requestLineItemScroll(startIndex)
                window.setTimeout(() => {
                  form.setFields(
                    importedLines.flatMap((line, index) =>
                      Object.entries(line).map(([key, value]) => ({
                        name: ['items', startIndex + index, key],
                        value,
                      }))
                    )
                  )
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
                      ref={(node) => registerLineItemRow(index, node)}
                    >
                      <div className="erp-sales-order-lines-form__row-head">
                        <Space wrap size={8}>
                          <strong>第 {index + 1} 行</strong>
                          {isExistingLine ? <Tag>已保存</Tag> : <Tag>新增</Tag>}
                        </Space>
                        <Space
                          className="erp-sales-order-lines-form__row-actions"
                          size={4}
                          wrap
                        >
                          <Button
                            aria-label={`复制第 ${index + 1} 行`}
                            size="small"
                            type="text"
                            icon={<CopyOutlined />}
                            disabled={!canCreateItem}
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
                            size="small"
                            icon={<DeleteOutlined />}
                            disabled={!canRemoveLine}
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
                        <Form.Item name={[field.name, 'product_id']} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item
                          className="erp-line-item-field erp-line-item-field--source"
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
                            placeholder="选择 SKU"
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
                                ?.product_name_snapshot ||
                            previous?.items?.[field.name]?.color_snapshot !==
                              current?.items?.[field.name]?.color_snapshot
                          }
                        >
                          {({ getFieldValue }) => {
                            const line = getFieldValue(['items', field.name])
                            const unitText = unitSuffixTextFromOptions(
                              unitOptions,
                              line?.unit_id
                            )
                            const hasProductSource = Boolean(
                              line?.product_id ||
                                line?.product_code_snapshot ||
                                line?.product_name_snapshot
                            )
                            const sourceText = [
                              line?.product_code_snapshot ||
                                (line?.product_id ? '产品已关联' : ''),
                              line?.product_name_snapshot,
                              line?.color_snapshot,
                              hasProductSource ? unitText : '',
                            ]
                              .filter(Boolean)
                              .join(' / ')
                            return (
                              <Form.Item
                                className="erp-line-item-field erp-line-item-field--source-summary"
                                label="带出产品 / 单位"
                              >
                                <Input
                                  title={sourceText}
                                  value={sourceText}
                                  disabled
                                  readOnly
                                  placeholder="自动带出"
                                />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'product_code_snapshot']}
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
                          className="erp-line-item-field erp-line-item-field--unit"
                          label="单位"
                          name={[field.name, 'unit_id']}
                          rules={[{ required: true, message: '请选择单位' }]}
                        >
                          <Select
                            allowClear
                            showSearch
                            disabled={!canEditLine}
                            optionFilterProp="searchText"
                            options={unitOptions}
                            placeholder="自动带出，可调整"
                            onChange={() => {
                              form
                                .validateFields([
                                  ['items', field.name, 'ordered_quantity'],
                                ])
                                .catch(() => {})
                            }}
                          />
                        </Form.Item>
                        <Form.Item name={[field.name, 'color_snapshot']} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          noStyle
                          shouldUpdate={(previous, current) =>
                            previous?.items?.[field.name]?.unit_id !==
                            current?.items?.[field.name]?.unit_id
                          }
                        >
                          {({ getFieldValue }) => (
                            <Form.Item
                              className="erp-line-item-field erp-line-item-field--quantity"
                              label="订单数量"
                              name={[field.name, 'ordered_quantity']}
                              rules={[
                                {
                                  required: true,
                                  message: '请填写订单数量',
                                },
                                quantityPrecisionRule({
                                  form,
                                  fieldName: field.name,
                                  unitOptions,
                                }),
                              ]}
                            >
                              <FieldWithUnitSuffix
                                control={
                                  <Input
                                    allowClear
                                    autoComplete="off"
                                    disabled={!canEditLine}
                                    placeholder="输入数量"
                                  />
                                }
                                unitText={unitSuffixTextFromOptions(
                                  unitOptions,
                                  getFieldValue([
                                    'items',
                                    field.name,
                                    'unit_id',
                                  ]),
                                  singleUnitSuffixTextFromOptions(unitOptions)
                                )}
                              />
                            </Form.Item>
                          )}
                        </Form.Item>
                        <Form.Item
                          className="erp-line-item-field erp-line-item-field--money"
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
                            previous?.items?.[field.name]?.unit_id !==
                              current?.items?.[field.name]?.unit_id ||
                            previous?.items?.[field.name]?.amount !==
                              current?.items?.[field.name]?.amount
                          }
                        >
                          {({ getFieldValue }) => {
                            const line = getFieldValue(['items', field.name])
                            const quantityValid =
                              isOrderLineQuantityValidForUnit(
                                line,
                                'ordered_quantity',
                                unitOptions
                              )
                            return (
                              <Form.Item
                                className="erp-line-item-field erp-line-item-field--money"
                                label="金额"
                              >
                                <Input
                                  value={
                                    quantityValid
                                      ? deriveSalesOrderItemAmount(line) || ''
                                      : ''
                                  }
                                  disabled
                                  readOnly
                                  placeholder={
                                    quantityValid
                                      ? '自动计算'
                                      : unitPrecisionErrorMessage(
                                          unitPrecisionFromOptions(
                                            unitOptions,
                                            line?.unit_id
                                          )
                                        )
                                  }
                                />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                        <Form.Item
                          className="erp-line-item-field erp-line-item-field--date"
                          label="计划交付日期"
                          name={[field.name, 'planned_delivery_date']}
                          dependencies={['order_date']}
                          rules={[
                            dateInputNotBeforeRule({
                              getStartValue: () =>
                                form.getFieldValue('order_date'),
                              message: '订单行计划交付日期不能早于签约日期',
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
                          className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
                          label="备注"
                          name={[field.name, 'note']}
                        >
                          <Input.TextArea
                            allowClear
                            autoSize={{ minRows: 1, maxRows: 3 }}
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
            <BusinessLineItemsFooter
              addLabel="添加条目"
              addDisabled={!canCreateItem}
              onAdd={() => {
                const currentLines = form.getFieldValue('items') || []
                add(
                  createBlankOrderLine(getNextLineNo(currentLines), {
                    unitID: defaultUnitID,
                  })
                )
                requestLineItemScroll(currentLines.length)
              }}
              stats={[
                {
                  key: 'count',
                  label: '已录入',
                  value: fields.length,
                  suffix: '条',
                },
                {
                  key: 'quantity',
                  label: '数量合计',
                  value: (
                    <BusinessLineItemsSummaryValue
                      summarize={summarizeSalesOrderLines}
                      select={(summary) =>
                        formatSummaryNumber(summary.quantity)
                      }
                    />
                  ),
                },
                {
                  key: 'amount',
                  label: '金额合计',
                  value: (
                    <BusinessLineItemsSummaryValue
                      summarize={summarizeSalesOrderLines}
                      select={(summary) =>
                        formatSummaryNumber(summary.amount, 2)
                      }
                    />
                  ),
                },
              ]}
            />
          </>
        )}
      </Form.List>
    </section>
  )
}
