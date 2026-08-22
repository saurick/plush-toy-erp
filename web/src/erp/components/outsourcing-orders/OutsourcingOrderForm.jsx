import React, { useCallback, useState } from 'react'
import {
  CopyOutlined,
  DeleteOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import {
  AutoComplete,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import BusinessFormSectionTitle from '../business-list/BusinessFormSectionTitle.jsx'
import BusinessLineItemsSection from '../business-list/BusinessLineItemsSection.jsx'
import BusinessLineItemOrderModal from '../business-list/BusinessLineItemOrderModal.jsx'
import BusinessLineItemsSummaryValue from '../business-list/BusinessLineItemsSummaryValue.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
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
import {
  BUSINESS_CURRENCY_OPTIONS,
  OUTSOURCING_ORDER_SUBJECT_TYPES,
  createBlankOutsourcingLine,
  deriveOutsourcingOrderItemAmount,
  summarizeOutsourcingOrderLines,
} from '../../utils/masterDataOrderView.mjs'
import { createDuplicatedDraftLineItem } from '../../utils/businessLineItems.mjs'
import { formatNumeric20Scale6Summary } from '../../utils/numeric20Scale6.mjs'

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

export function supplierLabel(supplier = {}) {
  return (
    [supplier.code, supplier.short_name || supplier.name]
      .filter(Boolean)
      .join(' / ') || '供应商已关联'
  )
}

export function productLabel(product = {}) {
  return (
    [product.code, product.name].filter(Boolean).join(' / ') || '产品已关联'
  )
}

export function productSKULabel(productSKU = {}) {
  return (
    [
      productSKU.sku_code,
      productSKU.color,
      productSKU.size,
      productSKU.customer_sku,
    ]
      .filter(Boolean)
      .join(' / ') || '产品规格已关联'
  )
}

export function materialLabel(material = {}) {
  return (
    [material.code, material.name].filter(Boolean).join(' / ') || '材料已关联'
  )
}

export function processLabel(process = {}) {
  return (
    [process.code, process.name, process.category]
      .filter(Boolean)
      .join(' / ') || '工序已关联'
  )
}

export function unitLabel(unit = {}) {
  return [unit.code, unit.name].filter(Boolean).join(' / ') || '单位已关联'
}

export function outsourcingOrderLineOrderLabel(item = {}, index = 0) {
  const subjectLabel =
    item.subject_type === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
      ? [item.material_code_snapshot, item.material_name_snapshot]
          .filter(Boolean)
          .join(' / ')
      : [
          item.product_no_snapshot,
          item.sku_code_snapshot,
          item.product_name_snapshot,
        ]
          .filter(Boolean)
          .join(' / ')
  return (
    [subjectLabel, item.processing_item, item.process_name_snapshot]
      .filter(Boolean)
      .join(' / ') || `第 ${index + 1} 行（未选择加工对象）`
  )
}

export default function OutsourcingOrderForm({
  form,
  supplierOptions,
  onSupplierChange,
  supplierContacts = [],
  supplierContactsLoading = false,
  onSupplierContactNameChange,
  onSupplierContactSelect,
  productOptions,
  productSKUs = [],
  materialOptions,
  processOptions,
  unitOptions,
  attachmentPanel,
  onSubjectTypeChange,
  onProductChange,
  onProductSKUChange,
  onMaterialChange,
  onProcessChange,
  onUnitChange,
}) {
  const [lineOrderOpen, setLineOrderOpen] = useState(false)
  const [lineOrderItems, setLineOrderItems] = useState([])
  const orderDate = Form.useWatch('order_date', form)
  const expectedReturnDate = Form.useWatch('expected_return_date', form)
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
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
      <BusinessFormSectionTitle>合同与加工厂</BusinessFormSectionTitle>
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
        label="加工厂（乙方）"
        rules={[{ required: true, message: '请选择加工厂' }]}
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
        name="source_order_no"
        label="来源订单号"
      >
        <Input maxLength={128} placeholder="如产品订单编号 / 销售订单号" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="currency"
        label="币种"
        rules={[{ required: true, message: '请选择币种' }]}
      >
        <Select options={BUSINESS_CURRENCY_OPTIONS} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        extra="保存后冻结为本单付款条件，不随加工厂档案后续调整。"
        name="payment_term_days"
        label="付款周期（天）"
        rules={[
          { required: true, message: '请填写付款周期' },
          {
            type: 'integer',
            min: 0,
            message: '付款周期必须为不小于 0 的整数',
          },
        ]}
      >
        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="order_date"
        label="下单日期"
        rules={[
          { required: true, message: '请选择下单日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('expected_return_date'),
            message: '下单日期不能晚于预计回货日期',
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
        label="预计回货日期"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('order_date'),
            message: '预计回货日期不能早于下单日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            orderDate ? disableExpectedReturnBeforeOrderDate : undefined
          }
        />
      </Form.Item>
      <BusinessFormSectionTitle>合同委托方信息</BusinessFormSectionTitle>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerCompany']}
        label="委托单位"
      >
        <Input maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerContact']}
        label="委托人"
      >
        <Input maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerPhone']}
        label="委托方电话"
      >
        <Input maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerAddress']}
        label="公司地址"
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerSigner']}
        label="委托方签字人"
      >
        <Input maxLength={64} />
      </Form.Item>
      <BusinessFormSectionTitle>合同乙方信息</BusinessFormSectionTitle>
      <Form.Item name={['supplier_snapshot', 'id']} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={['supplier_snapshot', 'code']} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={['supplier_snapshot', 'short_name']} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={['supplier_snapshot', 'contact_id']} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={['supplier_snapshot', 'contact_mobile']} hidden>
        <Input />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['supplier_snapshot', 'name']}
        label="乙方单位"
        extra="单位名称随所选加工厂带入并冻结在当前合同中。"
      >
        <Input readOnly />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['supplier_snapshot', 'contact_name']}
        label="乙方联系人"
        extra="可从加工厂联系人中选择，也可按本合同直接填写。"
      >
        <AutoComplete
          allowClear
          autoComplete="off"
          loading={supplierContactsLoading}
          maxLength={128}
          options={supplierContacts.map((contact) => ({
            value: contact.name,
            label: [
              contact.name,
              contact.title,
              contact.mobile || contact.phone,
            ]
              .filter(Boolean)
              .join(' / '),
            contact,
          }))}
          onChange={onSupplierContactNameChange}
          onSelect={(_value, option) =>
            onSupplierContactSelect?.(option?.contact)
          }
          placeholder="选择或填写乙方联系人"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['supplier_snapshot', 'contact_phone']}
        label="乙方联系电话"
      >
        <Input maxLength={64} placeholder="座机或手机" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['supplier_snapshot', 'address']}
        label="乙方地址"
      >
        <Input maxLength={512} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['supplier_snapshot', 'signer_name']}
        label="乙方签约人"
      >
        <Input maxLength={64} />
      </Form.Item>
      <BusinessFormSectionTitle>备注与附件</BusinessFormSectionTitle>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        name="note"
        label="备注"
      >
        <Input.TextArea
          allowClear
          autoSize={{ minRows: 1, maxRows: 3 }}
          showCount
          maxLength={255}
        />
      </Form.Item>
      {attachmentPanel}

      <BusinessLineItemsSection
        title="加工明细"
        description="同一份加工合同内维护产品、工序、数量、单价和预计回货。加工布料等材料时，请在“加工品类”中选择“材料”。"
        emptyDescription="暂无加工明细"
        renderBeforeHeader={({ fields }) => (
          <>
            <div className="erp-line-items-form__import-row">
              <div className="erp-line-items-form__import-copy">
                <strong>调整加工明细顺序</strong>
                <span>按合同展示和后续选单需要调整，不改变原明细身份。</span>
              </div>
              <Button
                className="erp-line-items-form__import-button"
                disabled={fields.length < 2}
                icon={<OrderedListOutlined />}
                onClick={() => {
                  const currentLines = form.getFieldValue('items') || []
                  setLineOrderItems([...currentLines])
                  setLineOrderOpen(true)
                }}
              >
                明细顺序
              </Button>
            </div>
            <BusinessLineItemOrderModal
              getItemLabel={outsourcingOrderLineOrderLabel}
              itemNoun="加工明细"
              items={lineOrderItems}
              onApply={(orderedItems) =>
                form.setFieldsValue({ items: orderedItems })
              }
              onClose={() => setLineOrderOpen(false)}
              open={lineOrderOpen}
              title="调整加工明细顺序"
            />
          </>
        )}
        renderRow={({ add, field, fields, index, remove }) => (
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
                    const currentLines = form.getFieldValue('items') || []
                    const sourceLine =
                      currentLines[field.name] || currentLines[index] || {}
                    add(createDuplicatedDraftLineItem(sourceLine), index + 1)
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
                name={[field.name, 'subject_type']}
                label="加工品类"
                rules={[{ required: true, message: '请选择加工品类' }]}
              >
                <Select
                  options={[
                    {
                      value: OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT,
                      label: '产品 / 半成品（车缝、手工等）',
                    },
                    {
                      value: OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL,
                      label: '材料（布料加工等）',
                    },
                  ]}
                  onChange={(value) => onSubjectTypeChange(field.name, value)}
                />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous, current) =>
                  previous?.items?.[field.name]?.subject_type !==
                  current?.items?.[field.name]?.subject_type
                }
              >
                {({ getFieldValue }) => {
                  const subjectType = getFieldValue([
                    'items',
                    field.name,
                    'subject_type',
                  ])
                  if (
                    subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
                  ) {
                    return (
                      <Form.Item
                        key="material-source"
                        className="erp-line-item-field erp-line-item-field--source"
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
                    )
                  }
                  return (
                    <Form.Item
                      key="product-source"
                      className="erp-line-item-field erp-line-item-field--source"
                      name={[field.name, 'product_id']}
                      label="产品 / 半成品"
                      rules={[
                        { required: true, message: '请选择产品或半成品' },
                      ]}
                    >
                      <Select
                        showSearch
                        options={productOptions}
                        optionFilterProp="label"
                        onChange={(value) => onProductChange(field.name, value)}
                      />
                    </Form.Item>
                  )
                }}
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous, current) =>
                  previous?.items?.[field.name]?.subject_type !==
                    current?.items?.[field.name]?.subject_type ||
                  previous?.items?.[field.name]?.product_id !==
                    current?.items?.[field.name]?.product_id ||
                  previous?.items?.[field.name]?.product_sku_id !==
                    current?.items?.[field.name]?.product_sku_id
                }
              >
                {({ getFieldValue }) => {
                  const line = getFieldValue(['items', field.name]) || {}
                  if (
                    line.subject_type !==
                    OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
                  ) {
                    return null
                  }
                  const productID = Number(line.product_id || 0)
                  const currentSKUID = Number(line.product_sku_id || 0)
                  const options = productSKUs
                    .filter(
                      (item) => Number(item?.product_id || 0) === productID
                    )
                    .map((item) => ({
                      value: item.id,
                      label: productSKULabel(item),
                      disabled:
                        item.is_active === false ||
                        Number(item.default_unit_id || 0) <= 0,
                    }))
                  if (
                    currentSKUID > 0 &&
                    !options.some(
                      (option) => Number(option.value) === currentSKUID
                    )
                  ) {
                    options.push({
                      value: currentSKUID,
                      label: line.sku_code_snapshot || '原产品规格已不可用',
                      disabled: true,
                    })
                  }
                  return (
                    <Form.Item
                      className="erp-line-item-field erp-line-item-field--source"
                      name={[field.name, 'product_sku_id']}
                      label="产品规格"
                      extra="可选；选择后单位按产品规格默认单位带出，回货批次和库存按该规格独立记录。"
                    >
                      <Select
                        allowClear
                        showSearch
                        disabled={!productID}
                        options={options}
                        optionFilterProp="label"
                        onChange={(value) =>
                          onProductSKUChange(field.name, value)
                        }
                      />
                    </Form.Item>
                  )
                }}
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--source"
                name={[field.name, 'product_order_no_snapshot']}
                label="来源产品订单编号"
                extra="产品或材料加工都可保留来源产品订单编号，用于合同逐行追溯。"
              >
                <Input
                  allowClear
                  maxLength={128}
                  placeholder="如 SO-YOYO-TRIAL-001"
                />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--source"
                name={[field.name, 'processing_item']}
                label="加工项目"
                extra="填写本行具体加工部位或内容，如“脸*1”“耳*2”；不要与工序混填。"
              >
                <Input allowClear maxLength={255} placeholder="如 脸*1" />
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
                  onChange={(value) => onProcessChange(field.name, value)}
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
              <Form.Item name={[field.name, 'product_no_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'sku_code_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'product_name_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'material_code_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'material_name_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'process_name_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item
                name={[field.name, 'process_category_snapshot']}
                hidden
              >
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'unit_name_snapshot']} hidden>
                <Input />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous, current) =>
                  previous?.items?.[field.name]?.unit_id !==
                    current?.items?.[field.name]?.unit_id ||
                  previous?.items?.[field.name]?.unit_name_snapshot !==
                    current?.items?.[field.name]?.unit_name_snapshot
                }
              >
                {({ getFieldValue }) => (
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
                        getFieldValue(['items', field.name, 'unit_id']),
                        getFieldValue([
                          'items',
                          field.name,
                          'unit_name_snapshot',
                        ])
                      )}
                    />
                  </Form.Item>
                )}
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--money"
                name={[field.name, 'unit_price']}
                label="单价"
              >
                <Input />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous, current) =>
                  previous?.items?.[field.name]?.outsourcing_quantity !==
                    current?.items?.[field.name]?.outsourcing_quantity ||
                  previous?.items?.[field.name]?.unit_price !==
                    current?.items?.[field.name]?.unit_price
                }
              >
                {({ getFieldValue }) => (
                  <Form.Item
                    className="erp-line-item-field erp-line-item-field--money"
                    label={
                      <BusinessHelpLabel
                        itemKey="outsourcing-line-amount"
                        label="金额预览"
                        pageKey="processing-contracts"
                      />
                    }
                    extra="仅供录入核对，保存时由系统按数量和单价核算。"
                  >
                    <Input
                      readOnly
                      value={
                        deriveOutsourcingOrderItemAmount(
                          getFieldValue(['items', field.name]) || {}
                        ) || ''
                      }
                    />
                  </Form.Item>
                )}
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--date"
                name={[field.name, 'expected_return_date']}
                label="行预计回货日期"
                dependencies={['order_date']}
                rules={[
                  dateInputNotBeforeRule({
                    getStartValue: () => form.getFieldValue('order_date'),
                    message: '行预计回货日期不能早于下单日期',
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
                className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
                name={[field.name, 'note']}
                label="备注"
              >
                <Input.TextArea
                  allowClear
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  showCount
                  maxLength={255}
                />
              </Form.Item>
            </div>
          </div>
        )}
        footerProps={({ add, fields }) => ({
          addLabel: '添加条目',
          onAdd: () => {
            const currentLines = form.getFieldValue('items') || []
            add(createBlankOutsourcingLine(getNextLineNo(currentLines)))
            requestLineItemScroll(currentLines.length)
          },
          stats: [
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
                  summarize={summarizeOutsourcingOrderLines}
                  select={(summary) =>
                    formatNumeric20Scale6Summary(summary.quantity, 3)
                  }
                />
              ),
            },
            {
              key: 'amount',
              label: '金额合计',
              value: (
                <BusinessLineItemsSummaryValue
                  summarize={summarizeOutsourcingOrderLines}
                  select={(summary) =>
                    formatNumeric20Scale6Summary(summary.amount, 2)
                  }
                />
              ),
            },
          ],
        })}
      />
    </Form>
  )
}
