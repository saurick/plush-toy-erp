import React, { useCallback } from 'react'
import { Button, Form, Input, Select, Space } from 'antd'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'

export function unixToDateInputValue(value) {
  if (!value) return ''
  const date = new Date(Number(value) * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dateInputToParam(value) {
  return value ? String(value) : undefined
}

export function buildHeaderParams(values = {}, extra = {}) {
  return {
    ...extra,
    product_id: Number(values.product_id || extra.product_id || 0),
    version: String(values.version || '').trim(),
    effective_from: dateInputToParam(values.effective_from),
    effective_to: dateInputToParam(values.effective_to),
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
    note: values.note ? String(values.note).trim() : undefined,
  }
}

export function BOMHeaderFormFields({
  form,
  includeProduct = true,
  disabled = false,
  productOptions = [],
  versionSuggestion = '',
  versionSuggestionLoading = false,
  onUseVersionSuggestion,
}) {
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
  let versionHint = null
  if (!disabled) {
    if (versionSuggestionLoading) {
      versionHint = '正在读取同产品已有 BOM 版本...'
    } else if (versionSuggestion) {
      versionHint = (
        <Space size={4} wrap>
          <span>建议使用下一个版本号</span>
          <Button size="small" type="link" onClick={onUseVersionSuggestion}>
            {versionSuggestion}
          </Button>
          <span>，也可手动填写。</span>
        </Space>
      )
    } else {
      versionHint =
        '先选择产品，系统会建议下一个版本号；也可手动填写打样版 A 等自定义版本。'
    }
  }

  return (
    <>
      {includeProduct ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="产品"
          name="product_id"
          rules={[{ required: true, message: '请选择产品' }]}
        >
          <Select
            allowClear
            disabled={disabled}
            optionFilterProp="label"
            options={productOptions}
            placeholder="请选择产品"
            showSearch
          />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="BOM 版本"
        name="version"
        rules={[{ required: true, message: '请填写 BOM 版本' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 V1、V2、打样版 A"
        />
      </Form.Item>
      {versionHint ? (
        <div className="erp-business-action-form__field erp-business-action-form__field--full">
          <span className="erp-business-selection-action-bar__hint">
            {versionHint}
          </span>
        </div>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="生效开始"
        name="effective_from"
        rules={[
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('effective_to'),
            message: '生效开始必须早于生效结束',
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
        label="生效结束"
        name="effective_to"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('effective_from'),
            message: '生效结束必须晚于生效开始',
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
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea
          allowClear
          disabled={disabled}
          rows={3}
          showCount
          maxLength={300}
        />
      </Form.Item>
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
        label="材料用量"
        name="quantity"
        rules={[{ required: true, message: '请填写材料用量' }]}
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
          optionFilterProp="label"
          options={unitOptions}
          placeholder="请选择单位"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="损耗率"
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
        <Input allowClear autoComplete="off" />
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
