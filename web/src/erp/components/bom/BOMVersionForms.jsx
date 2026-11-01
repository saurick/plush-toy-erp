import React, { useCallback } from 'react'
import { Form, Input } from 'antd'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import RemoteReferenceSelect from '../RemoteReferenceSelect.jsx'
import Select from '@/common/components/select/AppSelect'
import { parseBOMSourceNumber } from '../../utils/bomSourceValues.mjs'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessCopyButton from '../business-list/BusinessCopyButton.jsx'
import ProductIdentity, {
  renderProductOption,
} from '../master-data/ProductIdentity.jsx'

import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import { unixSecondsToBusinessDate } from '../../utils/businessDate.mjs'

export function unixToDateInputValue(value) {
  if (!value) return ''
  return unixSecondsToBusinessDate(value)
}

function dateInputToParam(value) {
  return value ? String(value) : undefined
}

export function buildHeaderParams(values = {}, extra = {}) {
  return {
    ...extra,
    product_id: Number(values.product_id || extra.product_id || 0),
    effective_from: dateInputToParam(values.effective_from),
    effective_to: dateInputToParam(values.effective_to),
    source_order_no: values.source_order_no
      ? String(values.source_order_no).trim()
      : undefined,
    quantity_text: values.quantity_text
      ? String(values.quantity_text).trim()
      : undefined,
    spare_text: values.spare_text
      ? String(values.spare_text).trim()
      : undefined,
    print_date: dateInputToParam(values.print_date),
    designer: values.designer ? String(values.designer).trim() : undefined,
    maker: values.maker ? String(values.maker).trim() : undefined,
    auditor: values.auditor ? String(values.auditor).trim() : undefined,
    hair_direction: values.hair_direction
      ? String(values.hair_direction).trim()
      : undefined,
    note: values.note ? String(values.note).trim() : undefined,
  }
}

export function buildItemParams(values = {}, extra = {}) {
  return {
    ...extra,
    bom_header_id: Number(values.bom_header_id || extra.bom_header_id || 0),
    material_id: Number(values.material_id || 0),
    quantity: String(values.quantity || '').trim(),
    unit_id: Number(values.unit_id || 0),
    loss_rate: String(values.loss_rate ?? '0').trim(),
    position: values.position ? String(values.position).trim() : undefined,
    piece_count: values.piece_count
      ? String(values.piece_count).trim()
      : undefined,
    total_usage_snapshot: values.total_usage_snapshot
      ? String(values.total_usage_snapshot).trim()
      : undefined,
    source_snapshot: values.source_snapshot || undefined,
    process_base: values.process_base
      ? String(values.process_base).trim()
      : undefined,
    process_method: values.process_method
      ? String(values.process_method).trim()
      : undefined,
    note: values.note ? String(values.note).trim() : undefined,
  }
}

export function BOMHeaderFormFields({
  form,
  children,
  attachmentPanel,
  includeProduct = true,
  disabled = false,
  productDisabled = false,
  productOptions = [],
  productActions,
}) {
  const productID = Form.useWatch('product_id', form)
  const version = Form.useWatch('version', form)
  const sourceOrderNo = Form.useWatch('source_order_no', form)
  const selectedProduct = productOptions.find(
    (option) => Number(option.value) === Number(productID)
  )
  const effectiveFrom = Form.useWatch('effective_from', form)
  const effectiveTo = Form.useWatch('effective_to', form)
  const disableEffectiveFromOnOrAfterEnd = useCallback(
    (current) =>
      isDateInputAfter(current, effectiveTo, {
        allowSameDay: false,
      }),
    [effectiveTo]
  )
  const disableEffectiveToOnOrBeforeStart = useCallback(
    (current) =>
      isDateInputBefore(current, effectiveFrom, {
        allowSameDay: false,
      }),
    [effectiveFrom]
  )

  return (
    <>
      <BusinessFormSection title="版本信息" className="erp-bom-header-primary">
        {includeProduct ? (
          <Form.Item
            className="erp-business-action-form__field"
            label="产品"
            extra={
              <>
                {productID ? (
                  <ProductIdentity
                    productId={productID}
                    name={selectedProduct?.label || '当前产品'}
                    compact
                  />
                ) : null}
                {productActions}
              </>
            }
            name="product_id"
            rules={[{ required: true, message: '请选择产品' }]}
          >
            <RemoteReferenceSelect
              referenceType="products"
              params={{ active_only: false }}
              allowClear
              disabled={disabled || productDisabled}
              optionFilterProp="label"
              options={productOptions}
              listItemHeight={48}
              optionRender={renderProductOption}
              placeholder="请选择产品"
              showSearch
            />
          </Form.Item>
        ) : null}
        <Form.Item
          className="erp-business-action-form__field"
          label="BOM 版本"
          name="version"
        >
          <Input
            className="erp-bom-version"
            autoComplete="off"
            disabled
            suffix={
              <BusinessCopyButton
                label="BOM 版本"
                value={version}
              />
            }
            placeholder="保存后自动生成"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="订单数量"
          name="quantity_text"
        >
          <Input
            allowClear
            autoComplete="off"
            disabled={disabled}
            placeholder="例如 3030"
          />
        </Form.Item>
      </BusinessFormSection>
      {children}
      <BusinessFormSection title="订单与制表资料">
        <Form.Item
          className="erp-business-action-form__field"
          label={<BusinessHelpLabel label="参考适用开始" description="仅供人工查阅；BOM 是否可选仍由启用状态决定，不会按日期自动启用或停用。" />}
          name="effective_from"
          rules={[
            dateInputNotAfterRule({
              getEndValue: () => form.getFieldValue('effective_to'),
              message: '参考适用开始必须早于参考适用结束',
              allowSameDay: false,
            }),
          ]}
        >
          <DateInput
            disabled={disabled}
            disabledDate={
              effectiveTo ? disableEffectiveFromOnOrAfterEnd : undefined
            }
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          dependencies={['effective_from']}
          label="参考适用结束"
          name="effective_to"
          rules={[
            dateInputNotBeforeRule({
              getStartValue: () => form.getFieldValue('effective_from'),
              message: '参考适用结束必须晚于参考适用开始',
              allowSameDay: false,
            }),
          ]}
        >
          <DateInput
            disabled={disabled}
            disabledDate={
              effectiveFrom ? disableEffectiveToOnOrBeforeStart : undefined
            }
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="来源订单号"
          name="source_order_no"
        >
          <Input
            allowClear
            autoComplete="off"
            disabled={disabled}
            suffix={
              <BusinessCopyButton
                label="来源订单号"
                value={disabled ? sourceOrderNo : ''}
              />
            }
            placeholder="例如 WL260102"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="备品"
          name="spare_text"
        >
          <Input allowClear autoComplete="off" disabled={disabled} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="制表日期"
          name="print_date"
        >
          <DateInput disabled={disabled} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="设计师"
          name="designer"
        >
          <Input allowClear autoComplete="off" disabled={disabled} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="制表人"
          name="maker"
        >
          <Input allowClear autoComplete="off" disabled={disabled} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="审核人"
          name="auditor"
        >
          <Input allowClear autoComplete="off" disabled={disabled} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="毛向"
          name="hair_direction"
        >
          <Input allowClear autoComplete="off" disabled={disabled} />
        </Form.Item>
      </BusinessFormSection>
      <BusinessFormSection title="备注与附件">
        <Form.Item
          className="erp-business-action-form__field erp-bom-header-note"
          label="备注"
          name="note"
        >
          <BusinessTextArea showCount minRows={2} allowClear disabled={disabled} maxLength={BusinessTextPolicy.noteMaxCharacters} />
        </Form.Item>
        {attachmentPanel}
      </BusinessFormSection>
    </>
  )
}

export function BOMItemFormFields({ materialOptions = [], unitOptions = [] }) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料"
        name="material_id"
        rules={[{ required: true, message: '请选择材料' }]}
      >
        <RemoteReferenceSelect
          referenceType="materials"
          params={{ active_only: false }}
          allowClear
          optionFilterProp="label"
          options={materialOptions}
          placeholder="请选择材料"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料用量"
        name="quantity"
        rules={[
          { required: true, message: '请填写材料用量' },
          { validator: async (_, value) => { if (!parseBOMSourceNumber(value)?.units) throw new Error('填写有效正数用量') } },
        ]}
      >
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单位"
        name="unit_id"
        rules={[{ required: true, message: '请选择单位' }]}
      >
        <Select
          allowClear
          optionFilterProp="searchText"
          options={unitOptions}
          placeholder="请选择单位"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label={
          <BusinessHelpLabel
            itemKey="loss-rate"
            label="损耗率"
            pageKey="material-bom"
          />
        }
        name="loss_rate"
        rules={[{ required: true, message: '请填写损耗率' }]}
      >
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="部位"
        name="position"
      >
        <BusinessTextArea minRows={1} allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="片数"
        name="piece_count"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="总用量"
        name="total_usage_snapshot"
      >
        <Input allowClear autoComplete="off" placeholder="含损耗总用量" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="加工基础"
        name="process_base"
      >
        <BusinessTextArea minRows={1} allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="加工方式"
        name="process_method"
      >
        <BusinessTextArea minRows={1} allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <BusinessTextArea minRows={2} allowClear showCount maxLength={BusinessTextPolicy.noteMaxCharacters} />
      </Form.Item>
    </>
  )
}
