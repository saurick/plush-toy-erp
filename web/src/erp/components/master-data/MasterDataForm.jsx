import React, { useState } from 'react'
import { AutoComplete, Form, Input, InputNumber, Select, Switch } from 'antd'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import DeliveryAddressFields from '../business-list/DeliveryAddressFields.jsx'
import { renderProductOption } from './ProductIdentity.jsx'
import MaterialStockFields from './MaterialStockFields.jsx'

import {
  PURCHASE_INVOICE_CATEGORY_OPTIONS,
  PURCHASE_INVOICE_REQUIRED_OPTIONS,
} from '../../utils/masterDataOrderView.mjs'
import { paymentConditionCompleteness } from '../../utils/paymentConditions.mjs'
import { normalizeNetWeightG } from '../../utils/shipmentWeight.mjs'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import MaterialSupplierSelect from './MaterialSupplierSelect.jsx'
import FieldWithUnitSuffix from '../business-list/FieldWithUnitSuffix.jsx'
import { productSKUParentFieldContract } from './productSKUParentField.mjs'

const PRODUCTION_ROUTE_OPERATION_OPTIONS = Object.freeze([
  Object.freeze({ value: 'FABRIC_PROCESSING', label: '布料加工（首道）' }),
  Object.freeze({ value: 'SEWING', label: '车缝' }),
  Object.freeze({ value: 'HANDWORK', label: '手工' }),
  Object.freeze({ value: 'PACKAGING', label: '包装' }),
])

function DefaultUnitSelect({
  form,
  required = false,
  requiredWhenWeightField,
  unitOptions,
  unitLoading,
}) {
  const rules = required
    ? [{ required: true, message: '请选择默认单位' }]
    : requiredWhenWeightField
      ? [
          {
            validator: async (_, value) => {
              const weight = form?.getFieldValue(requiredWhenWeightField)
              if (
                weight !== undefined &&
                weight !== null &&
                weight !== '' &&
                !value
              ) {
                throw new Error('填写 SKU 单重时必须选择 SKU 默认单位')
              }
            },
          },
        ]
      : undefined
  return (
    <Form.Item
      className="erp-business-action-form__field"
      dependencies={requiredWhenWeightField ? [requiredWhenWeightField] : []}
      label="默认单位"
      name="default_unit_id"
      rules={rules}
    >
      <Select
        allowClear={!required}
        showSearch
        loading={unitLoading}
        options={unitOptions}
        placeholder="请选择默认单位"
        optionFilterProp="searchText"
      />
    </Form.Item>
  )
}

function ProductUnitNetWeightField() {
  return (
    <Form.Item
      className="erp-business-action-form__field"
      extra="按当前默认单位记录；默认单位变更后需要重新确认。未知时可留空。"
      label="产品单重（净重）"
      name="unit_net_weight_g"
      rules={[
        {
          validator: async (_, value) => {
            if (value === undefined || value === null || value === '') {
              return
            }
            if (!normalizeNetWeightG(value)) {
              throw new Error('产品单重必须大于 0，且最多保留 6 位小数')
            }
          },
        },
      ]}
    >
      <FieldWithUnitSuffix
        control={<InputNumber stringMode style={{ width: '100%' }} />}
        unitText="克"
      />
    </Form.Item>
  )
}

function SKUUnitNetWeightField({ form, products, unitOptions }) {
  const productID = Form.useWatch('product_id', form)
  const selectedProduct = products.find(
    (product) => String(product?.id || '') === String(productID || '')
  )
  const productDefaultUnitLabel =
    unitOptions.find(
      (option) =>
        String(option?.value || '') ===
        String(selectedProduct?.default_unit_id || '')
    )?.label || '产品默认单位'

  return (
    <Form.Item
      className="erp-business-action-form__field"
      extra={`未知时可留空；出货仅在 SKU 未填单重且单位为${productDefaultUnitLabel}时回退产品单重。`}
      label="SKU 单重（净重）"
      name="unit_net_weight_g"
      dependencies={['default_unit_id']}
      rules={[
        {
          validator: async (_, value) => {
            if (value === undefined || value === null || value === '') {
              return
            }
            if (!form?.getFieldValue('default_unit_id')) {
              throw new Error('请先选择 SKU 默认单位')
            }
            if (!normalizeNetWeightG(value)) {
              throw new Error('SKU 单重必须大于 0，且最多保留 6 位小数')
            }
          },
        },
      ]}
    >
      <FieldWithUnitSuffix
        control={<InputNumber stringMode style={{ width: '100%' }} />}
        unitText="克"
      />
    </Form.Item>
  )
}

function TextSuggestionInput({
  className = '',
  options = [],
  placeholder = '',
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const hasOptions = options.length > 0
  const popupClassName = className ? `${className}__popup` : ''
  return (
    <AutoComplete
      allowClear
      className={className}
      classNames={
        popupClassName
          ? {
              popup: {
                root: popupClassName,
              },
            }
          : undefined
      }
      filterOption={(inputValue, option) =>
        String(option?.value || '')
          .toLowerCase()
          .includes(String(inputValue || '').toLowerCase())
      }
      onBlur={() => setOpen(false)}
      onChange={onChange}
      onFocus={() => setOpen(true)}
      onOpenChange={setOpen}
      open={open && hasOptions}
      options={options}
      placeholder={placeholder}
      value={value}
    />
  )
}

export function mergeTextSuggestionOptions(
  defaultValues = [],
  existingOptions = []
) {
  const seen = new Set()
  return [...defaultValues.map((value) => ({ value })), ...existingOptions]
    .map((option) => ({
      ...option,
      value: String(option?.value || '').trim(),
    }))
    .filter((option) => {
      if (!option.value || seen.has(option.value)) {
        return false
      }
      seen.add(option.value)
      return true
    })
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

export function MasterDataFormFields({
  form,
  type,
  isEditing = false,
  products = [],
  productOptions = [],
  unitOptions = [],
  unitLoading = false,
  materialCategoryOptions = [],
  materialColorOptions = [],
  processNameOptions = [],
  processCategoryOptions = [],
  supplierProcessOptions = [],
  canEditSupplierProcesses = true,
  supplierTypeOptions = [],
  customerPaymentConditionOptions = [],
  onCustomerPaymentMethodChange,
  contactSection,
}) {
  const productSKUParentField = productSKUParentFieldContract(isEditing)
  const defaultInvoiceRequired = Form.useWatch('default_invoice_required', form)

  if (type === 'products') {
    return (
      <>
        <BusinessFormSection title="基本资料">
          <Form.Item
            className="erp-business-action-form__field"
            label="产品编号（自动）"
            name="code"
            rules={[{ required: true, message: '请填写或保留自动产品编号' }]}
          >
            <Input
              allowClear
              autoComplete="off"
              placeholder="自动生成，可按需要调整"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="产品名称"
            name="name"
            rules={[{ required: true, message: '请填写产品名称' }]}
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="内部款号"
            name="style_no"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="客户款号"
            name="customer_style_no"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection title="外贸信息">
          <Form.Item
            className="erp-business-action-form__field"
            label="英文品名"
            name="english_name"
          >
            <Input
              allowClear
              autoComplete="off"
              maxLength={255}
              placeholder="用于外贸单据，未知时可留空"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="海关编码（HS Code）"
            name="hs_code"
          >
            <Input
              allowClear
              autoComplete="off"
              maxLength={32}
              placeholder="按实际报关编码填写"
            />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection title="计量信息">
          <DefaultUnitSelect
            form={form}
            required
            unitOptions={unitOptions}
            unitLoading={unitLoading}
          />
          <ProductUnitNetWeightField />
        </BusinessFormSection>
      </>
    )
  }

  if (type === 'product_skus') {
    return (
      <>
        <BusinessFormSection title="归属与编号">
          <Form.Item
            className="erp-business-action-form__field"
            extra={productSKUParentField.helpText}
            label="所属产品"
            name="product_id"
            rules={[{ required: true, message: '请选择产品' }]}
          >
            <Select
              allowClear={productSKUParentField.allowClear}
              disabled={productSKUParentField.disabled}
              optionFilterProp="label"
              options={productOptions}
              listItemHeight={48}
              optionRender={renderProductOption}
              placeholder="请选择产品"
              showSearch
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="SKU 编号（自动）"
            name="sku_code"
            rules={[{ required: true, message: '请填写或保留自动 SKU 编号' }]}
          >
            <Input
              allowClear
              autoComplete="off"
              placeholder="自动生成，可按需要调整"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="SKU 名称"
            name="sku_name"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="条码"
            name="barcode"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="客户 SKU"
            name="customer_sku"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection title="规格属性">
          <Form.Item
            className="erp-business-action-form__field"
            label="颜色"
            name="color"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="色号"
            name="color_no"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="尺码"
            name="size"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="包装版本"
            name="packaging_version"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection title="计量信息">
          <DefaultUnitSelect
            form={form}
            requiredWhenWeightField="unit_net_weight_g"
            unitOptions={unitOptions}
            unitLoading={unitLoading}
          />
          <SKUUnitNetWeightField
            form={form}
            products={products}
            unitOptions={unitOptions}
          />
        </BusinessFormSection>
      </>
    )
  }

  if (type === 'processes') {
    return (
      <>
        <BusinessFormSection title="基本资料">
          <Form.Item
            className="erp-business-action-form__field"
            label="环节编号（自动）"
            name="code"
            rules={[{ required: true, message: '请填写或保留自动环节编号' }]}
          >
            <Input
              allowClear
              autoComplete="off"
              placeholder="自动生成，可按需要调整"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="环节名称"
            name="name"
            rules={[{ required: true, message: '请填写环节名称' }]}
          >
            <TextSuggestionInput
              className="erp-process-name-suggested-input"
              options={processNameOptions}
              placeholder="如查货、车缝、手工、包装，也可直接输入新环节"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="环节类别"
            name="category"
          >
            <TextSuggestionInput
              className="erp-process-category-suggested-input"
              options={processCategoryOptions}
              placeholder="从行业默认类别选择，或直接输入新类别"
            />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection title="路线与加工能力">
          <Form.Item
            className="erp-business-action-form__field"
            label="标准生产路线位置"
            name="production_route_operation_code"
            extra="仅用于把这条工序明确绑定到固定生产路线；每个位置只能绑定一条启用工序，不能根据名称、类别或排序自动推断。"
          >
            <Select
              allowClear
              options={PRODUCTION_ROUTE_OPERATION_OPTIONS}
              placeholder="不参与标准生产路线"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            extra="可与“可内制”同时开启；这里只记录工序能力，具体订单仍由生产经理另行决定。"
            label="可委外"
            name="outsourcing_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="可内制"
            name="inhouse_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection title="补充资料">
          <Form.Item
            className="erp-business-action-form__field"
            label="质检参考"
            name="quality_required"
            extra="仅供查阅该工序通常是否需要检验；不会生成质检任务，也不代替实际检验结果。"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field erp-business-action-form__field--full"
            label="备注"
            name="note"
          >
            <BusinessTextArea allowClear showCount maxLength={300} />
          </Form.Item>
        </BusinessFormSection>
      </>
    )
  }

  return (
    <>
      <BusinessFormSection title="基本资料">
        <Form.Item
          className="erp-business-action-form__field"
          label={type === 'materials' ? '系统物料编号（自动）' : '编号（自动）'}
          name="code"
          rules={[{ required: true, message: '请填写或保留自动编号' }]}
        >
          <Input
            allowClear
            autoComplete="off"
            placeholder="自动生成，可按需要调整"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="名称"
          name="name"
          rules={[{ required: true, message: '请填写名称' }]}
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        {type === 'materials' ? null : (
          <Form.Item
            className="erp-business-action-form__field"
            label="简称"
            name="short_name"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
        )}

        {type === 'suppliers' ? (
          <>
            <Form.Item
              className="erp-business-action-form__field"
              label="供应商类型"
              name="supplier_type"
            >
              <Select
                allowClear
                options={supplierTypeOptions}
                placeholder="请选择供应商类型"
              />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="税号"
              name="tax_no"
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field erp-supplier-address-field"
              label="经营 / 加工地址"
              name="address"
            >
              <BusinessTextArea
                allowClear
                maxLength={512}
                placeholder="填写合同中需要带出的加工厂或供应商地址"
                showCount
              />
            </Form.Item>
          </>
        ) : type === 'materials' ? (
          <>
            <Form.Item
              className="erp-business-action-form__field"
              label="细分分类"
              name="category"
            >
              <TextSuggestionInput
                className="erp-material-category-suggested-input"
                options={materialCategoryOptions}
                placeholder="从已有分类选择，或直接输入新分类"
              />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="规格"
              name="spec"
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="颜色"
              name="color"
            >
              <TextSuggestionInput
                className="erp-material-color-suggested-input"
                options={materialColorOptions}
                placeholder="从已有颜色选择，或直接输入新颜色"
              />
            </Form.Item>
            <DefaultUnitSelect
              required
              unitOptions={unitOptions}
              unitLoading={unitLoading}
            />
          </>
        ) : (
          <Form.Item
            className="erp-business-action-form__field"
            label="税号"
            name="tax_no"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
        )}
      </BusinessFormSection>
      {contactSection}
      {type === 'suppliers' ? (
        <>
          <BusinessFormSection title="结算与发票">
            <Form.Item
              className="erp-business-action-form__field"
              extra="仅作为新建采购订单的默认值，订单保存后不再随档案变化。"
              label="默认付款方式"
              name="default_payment_method"
            >
              <Input
                allowClear
                autoComplete="off"
                maxLength={128}
                placeholder="如银行转账、月结"
              />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              extra="仅作为新建采购或委外订单的默认值；订单保存后不会随供应商档案变化。"
              label="默认付款周期（天）"
              name="default_payment_term_days"
              rules={[
                { required: true, message: '请填写默认付款周期' },
                {
                  type: 'integer',
                  min: 0,
                  message: '默认付款周期必须为不小于 0 的整数',
                },
              ]}
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              extra="历史资料可不设置；新建采购订单时会带出本项。"
              label="默认是否需要发票"
              name="default_invoice_required"
            >
              <Select
                allowClear
                options={PURCHASE_INVOICE_REQUIRED_OPTIONS}
                placeholder="请选择"
                onChange={(value) => {
                  if (value !== true) {
                    form?.setFieldValue('default_invoice_category', undefined)
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              dependencies={['default_invoice_required']}
              label="默认发票类别"
              name="default_invoice_category"
              rules={[
                {
                  required: defaultInvoiceRequired === true,
                  message: '请选择默认发票类别',
                },
              ]}
            >
              <Select
                allowClear
                disabled={defaultInvoiceRequired !== true}
                options={PURCHASE_INVOICE_CATEGORY_OPTIONS}
                placeholder="请先选择需要发票"
              />
            </Form.Item>
          </BusinessFormSection>
          <BusinessFormSection title="加工能力">
            <Form.Item
              className="erp-business-action-form__field erp-business-action-form__field--full"
              extra="记录该加工厂声明可承接的工序，用于资料查询；具体订单仍需逐行选择工序。"
              label="可加工工序"
              name="process_ids"
            >
              <Select
                allowClear
                disabled={!canEditSupplierProcesses}
                mode="multiple"
                options={supplierProcessOptions}
                optionFilterProp="label"
                placeholder="请选择可承接的加工工序"
                showSearch
              />
            </Form.Item>
          </BusinessFormSection>
        </>
      ) : null}
      {type === 'customers' ? (
        <>
          <BusinessFormSection title="默认收货信息">
            <DeliveryAddressFields
              form={form}
              customer
              extra="新建销售订单时带出，可在订单中单独修改。"
            />
          </BusinessFormSection>
          <BusinessFormSection title="结算方式">
            <Form.Item
              className="erp-business-action-form__field"
              dependencies={['default_payment_term_days']}
              label="付款方式"
              name="default_payment_method"
              rules={[
                paymentConditionRule({
                  form,
                  methodField: 'default_payment_method',
                  termDaysField: 'default_payment_term_days',
                  field: 'method',
                }),
              ]}
            >
              <TextSuggestionInput
                className="erp-customer-payment-method-suggested-input"
                options={customerPaymentConditionOptions}
                placeholder="如现结、30天月结，也可直接输入"
                onChange={onCustomerPaymentMethodChange}
              />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              dependencies={['default_payment_method']}
              label="付款周期(天)"
              name="default_payment_term_days"
              rules={[
                paymentConditionRule({
                  form,
                  methodField: 'default_payment_method',
                  termDaysField: 'default_payment_term_days',
                  field: 'termDays',
                }),
              ]}
            >
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </BusinessFormSection>
        </>
      ) : null}
      {type === 'materials' ? (
        <BusinessFormSection title="采购与库存">
          <MaterialStockFields form={form} />
          <Form.Item
            className="erp-business-action-form__field"
            label="厂商"
            name="supplier_id"
          >
            <MaterialSupplierSelect />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="厂商料号"
            name="supplier_item_no"
            rules={[{ max: 255, message: '厂商料号不能超过 255 个字符' }]}
          >
            <Input
              allowClear
              autoComplete="off"
              maxLength={255}
              placeholder="填写料号，厂商在左侧选择"
            />
          </Form.Item>
        </BusinessFormSection>
      ) : null}
      <BusinessFormSection title="备注">
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--full"
          label="备注"
          name="note"
        >
          <BusinessTextArea allowClear showCount maxLength={300} />
        </Form.Item>
      </BusinessFormSection>
    </>
  )
}

export { default as ContactFormList } from './ContactFormList.jsx'
export {
  createEmptyContactRow,
  contactRowsForForm,
  normalizeContactRows,
} from './contactFormRows.mjs'
