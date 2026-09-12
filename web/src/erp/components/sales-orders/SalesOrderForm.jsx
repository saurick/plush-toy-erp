import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CopyOutlined,
  DeleteOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import {
  AutoComplete,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import SalesOrderSourceEvidence from './SalesOrderSourceEvidence.jsx'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import BusinessFormSectionTitle from '../business-list/BusinessFormSectionTitle.jsx'
import FieldWithUnitSuffix, {
  isQuantityTextWithinUnitPrecision,
  singleUnitSuffixTextFromOptions,
  unitPrecisionErrorMessage,
  unitPrecisionFromOptions,
  unitSuffixTextFromOptions,
} from '../business-list/FieldWithUnitSuffix.jsx'
import BusinessLineItemOrderModal from '../business-list/BusinessLineItemOrderModal.jsx'
import BusinessLineItemsFooter from '../business-list/BusinessLineItemsFooter.jsx'
import BusinessLineItemsSummaryValue from '../business-list/BusinessLineItemsSummaryValue.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import {
  BUSINESS_CURRENCY_OPTIONS,
  SALES_ORDER_FREIGHT_TERMS_OPTIONS,
  SALES_ORDER_TAX_MODE_OPTIONS,
  unixToDateInputValue,
} from '../../utils/masterDataOrderView.mjs'
import { buildSalesOrderItemSourceValuesFromSKU } from '../../utils/sourceOrderLineValues.mjs'
import {
  SALES_ORDER_CATEGORY_OPTIONS,
  salesOrderProductionQuantity,
  salesOrderRequirementName,
} from '../../utils/salesOrderRequirements.mjs'
import { paymentConditionCompleteness } from '../../utils/paymentConditions.mjs'
import {
  calculateSalesOrderAmounts,
  deriveSalesOrderItemAmount,
  summarizeSalesOrderLines,
} from '../../utils/sourceOrderAmounts.mjs'
import {
  optionalContactEmailRule,
  optionalContactPhoneRule,
} from '../../utils/contactValidation.mjs'
import { createDuplicatedDraftLineItem } from '../../utils/businessLineItems.mjs'
import {
  formatNumeric20Scale6Summary,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'
import BusinessLineItemsTable, {
  BusinessLineItemRow,
} from '../business-list/BusinessLineItemsTable.jsx'

const SALES_ORDER_COLUMNS = [
  { label: '订货产品名称', width: 210 },
  { label: '订单数量', width: 284, required: true },
  { label: '单位', width: 120, required: true },
  { label: '单价', width: 125 },
  {
    label: (
      <BusinessHelpLabel
        itemKey="line-amount"
        label="金额"
        pageKey="sales-orders"
      />
    ),
    width: 112,
  },
  { label: '计划交付日期', width: 176 },
]

function skuLabel(sku = {}) {
  return (
    [sku.sku_code, sku.sku_name || sku.customer_sku || sku.barcode]
      .filter(Boolean)
      .join(' / ') || '规格已关联'
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

export function createBlankOrderLine(lineNo = 1, { unitID } = {}) {
  return {
    line_no: lineNo,
    requested_product_name: '',
    customer_product_no: '',
    order_category: 'NEW',
    pre_shipment_sample_quantity: '0',
    process_requirement: '',
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

function optionalFormValue(value) {
  return value === null || value === undefined ? '' : value
}

export function normalizeSalesOrderItemFormValue(item = {}) {
  const productSkuID = item.product_sku_id || item.product_sku?.id
  return {
    id: item.id,
    line_no: item.line_no,
    requested_product_name: item.requested_product_name || '',
    customer_product_no: item.customer_product_no || '',
    order_category: item.order_category || 'NEW',
    pre_shipment_sample_quantity:
      optionalFormValue(item.pre_shipment_sample_quantity) || '0',
    process_requirement: item.process_requirement || '',
    import_source: item.import_source || undefined,
    designer: item.designer || '',
    unshipped_quantity: item.unshipped_quantity ?? '',
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

export function salesOrderLineOrderLabel(item = {}, index = 0) {
  return (
    [
      item.product_code_snapshot,
      salesOrderRequirementName(item),
      item.color_snapshot,
    ]
      .filter(Boolean)
      .join(' / ') || `第 ${index + 1} 行（待填写需求）`
  )
}

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function setOrderLineSourceFromSKU(form, lineIndex, sku) {
  const currentLines = form.getFieldValue('items') || []
  const nextLines = [...currentLines]
  nextLines[lineIndex] = {
    ...(nextLines[lineIndex] || {}),
    ...buildSalesOrderItemSourceValuesFromSKU(sku),
    ...(!sku?.id ? { unit_id: nextLines[lineIndex]?.unit_id } : {}),
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

function optionalMoneyRule(label) {
  return {
    validator: async (_, value) => {
      if (value === undefined || value === null || value === '') return
      if (numeric20Scale6Units(value) === null) {
        throw new Error(`${label}必须为非负数，且最多保留 6 位小数`)
      }
    },
  }
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
  const taxMode = Form.useWatch('tax_mode', form)
  const freightTerms = Form.useWatch('freight_terms', form)
  const currency = Form.useWatch('currency', form)
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
      <BusinessFormSectionTitle>订单与客户</BusinessFormSectionTitle>
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
        label="币种"
        name="currency"
        rules={[{ required: true, message: '请选择币种' }]}
      >
        <Select options={BUSINESS_CURRENCY_OPTIONS} />
      </Form.Item>
      <BusinessFormSectionTitle>联系人与负责人</BusinessFormSectionTitle>
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
      <BusinessFormSectionTitle>结算条件</BusinessFormSectionTitle>
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
      <BusinessFormSectionTitle>税费与运费条件</BusinessFormSectionTitle>
      <Form.Item
        className="erp-business-action-form__field"
        label="计税方式"
        name="tax_mode"
      >
        <Select
          allowClear
          options={SALES_ORDER_TAX_MODE_OPTIONS}
          placeholder="草稿可暂缺，提交前补齐"
          onChange={(value) => {
            if (!value || value === 'NONE') {
              form.setFieldValue('tax_rate', undefined)
            }
          }}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['tax_mode']}
        label="税率"
        name="tax_rate"
        rules={[
          {
            validator: async (_, value) => {
              if (!taxMode || taxMode === 'NONE') return
              if (value === undefined || value === null || value === '') return
              const units = numeric20Scale6Units(value)
              if (
                units === null ||
                BigInt(units) <= BigInt(0) ||
                BigInt(units) > BigInt(100_000_000)
              ) {
                throw new Error(
                  '税率必须大于 0 且不超过 100%，最多保留 6 位小数'
                )
              }
            },
          },
        ]}
      >
        <FieldWithUnitSuffix
          control={
            <InputNumber
              disabled={!taxMode || taxMode === 'NONE'}
              max="100"
              min="0.000001"
              precision={6}
              stringMode
            />
          }
          unitText="%"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="报价是否含运费"
        name="freight_terms"
      >
        <Select
          allowClear
          options={SALES_ORDER_FREIGHT_TERMS_OPTIONS}
          placeholder="草稿可暂缺，提交前补齐"
          onChange={(value) => {
            if (value !== 'EXCLUDED') {
              form.setFieldValue('quoted_freight_amount', undefined)
            }
          }}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['freight_terms', 'currency']}
        extra={
          freightTerms === 'INCLUDED'
            ? '已包含在产品单价中，不重复计入订单总额'
            : '报价不含运费时填写另行向客户收取的金额；提交前需补齐'
        }
        label="报价运费"
        name="quoted_freight_amount"
        rules={[optionalMoneyRule('报价运费')]}
      >
        <FieldWithUnitSuffix
          control={
            <InputNumber
              disabled={freightTerms !== 'EXCLUDED'}
              min="0"
              precision={6}
              stringMode
              placeholder={
                freightTerms === 'EXCLUDED' ? '填写另计运费' : '已含在单价'
              }
            />
          }
          unitText={currency || '币种'}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="报价备注"
        name="price_condition_note"
      >
        <BusinessTextArea
          allowClear
          showCount
          maxLength={255}
          placeholder="账期影响报价时记录核对结论"
        />
      </Form.Item>
      <BusinessFormSectionTitle>交付与收货</BusinessFormSectionTitle>
      <Form.Item
        className="erp-business-action-form__field"
        label="下单日期"
        name="order_date"
        rules={[
          { required: true, message: '请选择下单日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('planned_delivery_date'),
            message: '下单日期不能晚于计划交付日期',
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
        label="国家 / 地区"
        name="delivery_country_region"
      >
        <Input allowClear autoComplete="off" maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="收货人"
        name="delivery_recipient"
      >
        <Input allowClear autoComplete="off" maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="收货电话"
        name="delivery_phone"
        rules={[optionalContactPhoneRule()]}
      >
        <Input allowClear autoComplete="off" maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        extra="从客户档案带出后可按本单调整；保存后固定为本单收货信息。"
        label="收货地址"
        name="delivery_address"
      >
        <BusinessTextArea
          allowClear
          maxLength={512}
          showCount
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
            message: '计划交付日期不能早于下单日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            orderDate ? disablePlannedDeliveryBeforeOrderDate : undefined
          }
        />
      </Form.Item>
      <BusinessFormSectionTitle>其他说明</BusinessFormSectionTitle>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <BusinessTextArea
          allowClear
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
  importImages = [],
  orderAttachments = [],
  orderID,
}) {
  const [lineOrderOpen, setLineOrderOpen] = useState(false)
  const [lineOrderItems, setLineOrderItems] = useState([])
  const orderDate = Form.useWatch('order_date', form)
  const watchedItems = Form.useWatch('items', form)
  const taxMode = Form.useWatch('tax_mode', form)
  const taxRate = Form.useWatch('tax_rate', form)
  const freightTerms = Form.useWatch('freight_terms', form)
  const quotedFreightAmount = Form.useWatch('quoted_freight_amount', form)
  const currency = Form.useWatch('currency', form)
  const commercialAmounts = useMemo(
    () =>
      calculateSalesOrderAmounts({
        items: watchedItems || [],
        taxMode,
        taxRate,
        freightTerms,
        quotedFreightAmount,
      }),
    [watchedItems, taxMode, taxRate, freightTerms, quotedFreightAmount]
  )
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
  const skuOptions = productSKUs.map((sku) => ({
    label: skuLabel(sku),
    value: sku.id,
    sku,
  }))

  return (
    <section className="erp-sales-order-lines-form">
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <>
            <div className="erp-sales-order-demand-toolbar">
              <strong className="erp-sales-order-demand-toolbar__title">
                订货明细
              </strong>
              {fields.length >= 2 ? (
                <Button
                  type="text"
                  className="erp-sales-order-demand-toolbar__reorder"
                  icon={<OrderedListOutlined aria-hidden="true" />}
                  disabled={!canCreateItem && !canUpdateItem}
                  onClick={() => {
                    const currentLines = form.getFieldValue('items') || []
                    setLineOrderItems([...currentLines])
                    setLineOrderOpen(true)
                  }}
                >
                  调整明细顺序
                </Button>
              ) : null}
            </div>
            <BusinessLineItemOrderModal
              getItemLabel={salesOrderLineOrderLabel}
              itemNoun="订货明细"
              items={lineOrderItems}
              onApply={(orderedItems) =>
                form.setFieldsValue({ items: orderedItems })
              }
              onClose={() => setLineOrderOpen(false)}
              open={lineOrderOpen}
              title="调整明细顺序"
            />
            {fields.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无订货明细，可先保存订单草稿"
              />
            ) : (
              <BusinessLineItemsTable
                columns={SALES_ORDER_COLUMNS}
                label="订货明细"
              >
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
                    <BusinessLineItemRow
                      key={field.key}
                      index={index}
                      rowRef={(node) => registerLineItemRow(index, node)}
                      status={isExistingLine ? '已保存' : '新增'}
                      detailsOpen={Boolean(watchedItems?.[field.name]?.import_source)}
                      detailsLabel="款号、船头版、工艺与原表资料"
                      actions={
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
                      }
                      hiddenFields={
                        <>
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
                            name={[field.name, 'color_snapshot']}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                        </>
                      }
                      cells={[
                        <Form.Item
                          className="erp-line-item-field erp-line-item-field--snapshot-name"
                          label="订货产品名称"
                          name={[field.name, 'requested_product_name']}
                          rules={[
                            {
                              validator: async (_, value) => {
                                if (
                                  String(value || '').trim() ||
                                  Number(
                                    form.getFieldValue([
                                      'items',
                                      field.name,
                                      'product_id',
                                    ])
                                  ) > 0
                                ) {
                                  return
                                }
                                throw new Error('请填写订货产品名称')
                              },
                            },
                          ]}
                        >
                          <BusinessTextArea
                            disabled={!canEditLine}
                            maxLength={255}
                            placeholder={
                              watchedItems?.[field.name]?.product_name_snapshot
                                ? salesOrderRequirementName(
                                    watchedItems[field.name]
                                  )
                                : '客户要订的产品，无需先建档'
                            }
                          />
                        </Form.Item>,
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
                        </Form.Item>,
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
                            placeholder="选择单位"
                            onChange={() => {
                              form
                                .validateFields([
                                  ['items', field.name, 'ordered_quantity'],
                                ])
                                .catch(() => {})
                            }}
                          />
                        </Form.Item>,
                        <Form.Item
                          className="erp-line-item-field erp-line-item-field--money"
                          label="单价"
                          name={[field.name, 'unit_price']}
                          rules={[optionalMoneyRule('单价')]}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                            placeholder="草稿可暂缺，提交前补齐"
                          />
                        </Form.Item>,
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
                        </Form.Item>,
                        <Form.Item
                          className="erp-line-item-field erp-line-item-field--date"
                          label="计划交付日期"
                          name={[field.name, 'planned_delivery_date']}
                          dependencies={['order_date']}
                          rules={[
                            dateInputNotBeforeRule({
                              getStartValue: () =>
                                form.getFieldValue('order_date'),
                              message: '明细交付日期不能早于下单日期',
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
                        </Form.Item>,
                      ]}
                    >
                      <Form.Item name={[field.name, 'import_source']} noStyle>
                        <SalesOrderSourceEvidence images={importImages} attachments={orderAttachments} ownerID={orderID} />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--snapshot-code"
                        label="客户款号"
                        name={[field.name, 'customer_product_no']}
                      >
                        <Input
                          disabled={!canEditLine}
                          maxLength={128}
                          placeholder="客户提供时填写"
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--snapshot-small"
                        label="类别"
                        name={[field.name, 'order_category']}
                      >
                        <Select
                          disabled={!canEditLine}
                          options={SALES_ORDER_CATEGORY_OPTIONS}
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--snapshot-small"
                        label="船头版数量"
                        name={[field.name, 'pre_shipment_sample_quantity']}
                        rules={[
                          {
                            validator: async (_, value) => {
                              if (
                                numeric20Scale6Units(value || '0') !== null &&
                                isQuantityTextWithinUnitPrecision(
                                  value || '0',
                                  unitPrecisionFromOptions(
                                    unitOptions,
                                    form.getFieldValue([
                                      'items',
                                      field.name,
                                      'unit_id',
                                    ])
                                  )
                                )
                              ) {
                                return
                              }
                              throw new Error('请填写符合单位精度的非负数量')
                            },
                          },
                        ]}
                      >
                        <Input disabled={!canEditLine} placeholder="0" />
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => (
                          <Form.Item
                            className="erp-line-item-field erp-line-item-field--snapshot-small"
                            label="生产数量"
                          >
                            <Input
                              value={salesOrderProductionQuantity(
                                getFieldValue(['items', field.name]) || {}
                              )}
                              readOnly
                              placeholder="订单数量＋船头版"
                            />
                          </Form.Item>
                        )}
                      </Form.Item>
                      {isExistingLine ? (
                        <>
                          <Form.Item label="未出货数" name={[field.name, 'unshipped_quantity']} className="erp-line-item-field erp-line-item-field--snapshot-small">
                            <Input readOnly placeholder="由出货记录计算" />
                          </Form.Item>
                          <Form.Item label="工程设计师" name={[field.name, 'designer']} className="erp-line-item-field erp-line-item-field--snapshot-small">
                            <Input readOnly placeholder="工程关联物料清单后显示" />
                          </Form.Item>
                        </>
                      ) : null}
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--note"
                        label="工艺要求"
                        name={[field.name, 'process_requirement']}
                      >
                        <BusinessTextArea
                          disabled={!canEditLine}
                          maxLength={255}
                          placeholder="客户要求或工艺说明"
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
                        label="备注"
                        name={[field.name, 'note']}
                      >
                        <BusinessTextArea
                          allowClear
                          showCount
                          maxLength={255}
                          disabled={!canEditLine}
                        />
                      </Form.Item>
                      <Form.Item
                        className="erp-line-item-field erp-line-item-field--source"
                        label="已有规格（选填）"
                        name={[field.name, 'product_sku_id']}
                      >
                        <Select
                          showSearch
                          allowClear
                          disabled={!canEditLine}
                          optionFilterProp="label"
                          options={skuOptions}
                          placeholder="工程可后续关联"
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
                          if (!hasProductSource) return null
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
                              label="已关联产品"
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
                    </BusinessLineItemRow>
                  )
                })}
              </BusinessLineItemsTable>
            )}
            <BusinessLineItemsFooter
              addLabel="添加订货明细"
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
                        formatNumeric20Scale6Summary(summary.quantity)
                      }
                    />
                  ),
                },
                {
                  key: 'goods-amount',
                  label: '货款金额',
                  value:
                    numeric20Scale6Units(commercialAmounts.goodsAmount) !== null
                      ? `${currency || ''} ${formatNumeric20Scale6Summary(
                          commercialAmounts.goodsAmount,
                          2
                        )}`.trim()
                      : '待补齐',
                },
                {
                  key: 'quoted-freight-amount',
                  label: '报价运费',
                  value:
                    freightTerms === 'INCLUDED'
                      ? '已含在单价'
                      : freightTerms === 'EXCLUDED' &&
                          numeric20Scale6Units(quotedFreightAmount) !== null
                        ? `${currency || ''} ${formatNumeric20Scale6Summary(
                            quotedFreightAmount,
                            2
                          )}`.trim()
                        : '待补齐',
                },
                {
                  key: 'tax-amount',
                  label: '税额',
                  value: commercialAmounts.complete
                    ? `${currency || ''} ${formatNumeric20Scale6Summary(
                        commercialAmounts.taxAmount,
                        2
                      )}`.trim()
                    : '待补齐',
                },
                {
                  key: 'order-total',
                  label: '订单总额',
                  value: commercialAmounts.complete
                    ? `${currency || ''} ${formatNumeric20Scale6Summary(
                        commercialAmounts.orderTotal,
                        2
                      )}`.trim()
                    : '待补齐',
                },
              ]}
            />
          </>
        )}
      </Form.List>
    </section>
  )
}
