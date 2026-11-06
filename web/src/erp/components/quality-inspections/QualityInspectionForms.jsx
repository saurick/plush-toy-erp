import React from 'react'
import { Form, Input, InputNumber, Radio } from 'antd'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import RemoteReferenceSelect from '../RemoteReferenceSelect.jsx'
import Select from '@/common/components/select/AppSelect'
import { IncomingCheckItemsForm } from './IncomingCheckItems.jsx'
import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import FieldWithUnitSuffix from '../business-list/FieldWithUnitSuffix.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import FilterChip from '@/common/components/navigation/FilterChip'
import { QUALITY_CONCESSION_HELP, QUALITY_RESULT_OPTIONS } from './qualityInspectionResultOptions.mjs'
import {
  compactParams,
  trimOptional,
} from '../../utils/sourceDocumentValues.mjs'
import {
  buildQualityDefectRateParams,
  normalizeQualityDefectPercent,
  QUALITY_DEFECT_RATE_CUSTOM_SELECTION,
  QUALITY_DEFECT_RATE_PRESETS,
} from '../../utils/qualityDefectRate.mjs'
import BusinessForm from '../business-list/BusinessForm.jsx'

function QualityResultChoices({ value, onChange, allowConcession, disabled, ...fieldProps }) {
  return (
    <div {...fieldProps} className="erp-business-filter-choices" role="group" aria-label="判定结果">
      {QUALITY_RESULT_OPTIONS.filter((option) => option.value === 'PASS' || allowConcession && option.value === 'CONCESSION').map((option) => (
        <FilterChip
          key={option.value}
          selected={value === option.value}
          disabled={disabled}
          help={option.help ? (
            <BusinessHelpLabel iconOnly label={option.label} renderContent={() => <p>{option.help}</p>} />
          ) : null}
          helpLabel={option.label}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  )
}

export function positiveInt(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0
    ? Math.trunc(numeric)
    : undefined
}

export function buildInspectionParams(values = {}) {
  return compactParams({
    inspection_no: trimOptional(values.inspection_no),
    purchase_receipt_id: positiveInt(values.purchase_receipt_id),
    purchase_receipt_item_id: positiveInt(values.purchase_receipt_item_id),
    decision_note: trimOptional(values.decision_note),
  })
}

export function buildDecisionParams(inspectionID, values = {}, result = '') {
  const decisionResult = result || trimOptional(values.result)
  return compactParams({
    id: positiveInt(inspectionID),
    result: decisionResult,
    inspected_at: trimOptional(values.inspected_at),
    decision_note: trimOptional(values.decision_note),
    ...(decisionResult && values.check_items
      ? { check_items: values.check_items }
      : {}),
    ...(decisionResult
      ? buildQualityDefectRateParams(
          values.defect_rate_selection,
          values.defect_rate_custom_percent
        )
      : {}),
  })
}

export function QualityInspectionCreateForm({
  form,
  purchaseReceiptOptions,
  purchaseReceiptItemOptions,
  disabled = false,
  onReceiptChange,
}) {
  return (
    <BusinessForm
      form={form}
      layout="vertical"
      disabled={disabled}
      className="erp-business-action-form erp-business-action-form--grid"
    >
      <Form.Item
        className="erp-business-action-form__field"
        label="质检单号（自动）"
        name="inspection_no"
        rules={[{ required: true, message: '请填写或保留自动质检单号' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="采购入库单"
        name="purchase_receipt_id"
        rules={[{ required: true, message: '请选择采购入库单' }]}
      >
        <RemoteReferenceSelect
          referenceType="purchase_receipts"
          allowClear
          optionFilterProp="label"
          options={purchaseReceiptOptions}
          placeholder="请选择采购入库单"
          showSearch
          onChange={onReceiptChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="采购入库行"
        name="purchase_receipt_item_id"
        rules={[{ required: true, message: '请选择采购入库行' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={purchaseReceiptItemOptions}
          placeholder="请选择采购入库行"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="decision_note"
      >
        <BusinessTextArea maxLength={BusinessTextPolicy.noteMaxCharacters} showCount minRows={2} />
      </Form.Item>
    </BusinessForm>
  )
}

export function QualityInspectionDecisionForm({
  form,
  mode,
  allowConcession = true,
  disabled = false,
}) {
  const defectRateSelection = Form.useWatch('defect_rate_selection', form)
  const result = Form.useWatch('result', form)
  const reasonRequired = mode === 'reject' || (mode === 'pass' && result === 'CONCESSION')

  const handleDefectRateSelectionChange = (event) => {
    if (event?.target?.value !== QUALITY_DEFECT_RATE_CUSTOM_SELECTION) {
      form.setFieldValue('defect_rate_custom_percent', undefined)
    }
  }

  return (
    <BusinessForm
      form={form}
      layout="vertical"
      disabled={disabled}
      className="erp-business-action-form erp-business-action-form--grid"
    >
      {mode !== 'cancel' ? <IncomingCheckItemsForm /> : null}
      {mode === 'pass' ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="判定结果"
          name="result"
          rules={[{ required: true, message: '请选择判定结果' }]}
          extra={result === 'CONCESSION' ? QUALITY_CONCESSION_HELP : undefined}
        >
          <QualityResultChoices allowConcession={allowConcession} disabled={disabled} />
        </Form.Item>
      ) : null}
      {mode !== 'cancel' ? (
        <>
          <Form.Item
            className="erp-business-action-form__field"
            label="检验日期"
            name="inspected_at"
          >
            <DateInput />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field erp-business-action-form__field--full"
            label={
              <BusinessHelpLabel
                itemKey="defect-rate"
                label="估算不良比例"
                pageKey="quality-inspections"
              />
            }
            name="defect_rate_selection"
            rules={[{ required: true, message: '请选择估算不良比例' }]}
            extra="按当前来源单据估算，不需要逐件计数；该比例不会自动换算成退货数量。"
          >
            <Radio.Group
              aria-label="估算不良比例"
              options={QUALITY_DEFECT_RATE_PRESETS}
              onChange={handleDefectRateSelectionChange}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}
            />
          </Form.Item>
          {defectRateSelection === QUALITY_DEFECT_RATE_CUSTOM_SELECTION ? (
            <Form.Item
              className="erp-business-action-form__field erp-business-action-form__field--full"
              label="自定义不良比例"
              name="defect_rate_custom_percent"
              rules={[
                { required: true, message: '请填写自定义不良比例' },
                {
                  validator: (_, value) => {
                    try {
                      normalizeQualityDefectPercent(value)
                      return Promise.resolve()
                    } catch (error) {
                      return Promise.reject(error)
                    }
                  },
                },
              ]}
            >
              <FieldWithUnitSuffix
                unitText="%"
                control={
                  <InputNumber
                    aria-label="自定义不良比例"
                    controls={false}
                    step="0.01"
                    stringMode
                  />
                }
              />
            </Form.Item>
          ) : null}
        </>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="判定备注"
        name="decision_note"
        extra={reasonRequired ? result === 'CONCESSION' ? '说明已知偏差及本次同意接收的依据。' : '请填写不合格原因。' : undefined}
        rules={reasonRequired ? [{ required: true, whitespace: true, message: '请填写异常或让步理由' }] : []}
      >
        <BusinessTextArea maxLength={BusinessTextPolicy.noteMaxCharacters} showCount minRows={2} />
      </Form.Item>
    </BusinessForm>
  )
}
