import React from 'react'
import { Form, Input, InputNumber, Radio, Select } from 'antd'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import FieldWithUnitSuffix from '../business-list/FieldWithUnitSuffix.jsx'
import {
  compactParams,
  trimOptional,
} from '../../utils/masterDataOrderView.mjs'
import {
  buildQualityDefectRateParams,
  normalizeQualityDefectPercent,
  QUALITY_DEFECT_RATE_CUSTOM_SELECTION,
  QUALITY_DEFECT_RATE_PRESETS,
} from '../../utils/qualityDefectRate.mjs'

const RESULT_DECISION_OPTIONS = [
  { label: '合格', value: 'PASS' },
  { label: '让步接收', value: 'CONCESSION' },
]

const STRICT_RESULT_DECISION_OPTIONS = [{ label: '合格', value: 'PASS' }]

export function positiveInt(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0
    ? Math.trunc(numeric)
    : undefined
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
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
    inspector_id: positiveInt(values.inspector_id),
    decision_note: trimOptional(values.decision_note),
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
    <Form
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
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="采购入库单"
        name="purchase_receipt_id"
        rules={[{ required: true, message: '请选择采购入库单' }]}
      >
        <Select
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
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
      </Form.Item>
    </Form>
  )
}

export function QualityInspectionDecisionForm({
  form,
  mode,
  allowConcession = true,
}) {
  const defectRateSelection = Form.useWatch('defect_rate_selection', form)

  const handleDefectRateSelectionChange = (event) => {
    if (event?.target?.value !== QUALITY_DEFECT_RATE_CUSTOM_SELECTION) {
      form.setFieldValue('defect_rate_custom_percent', undefined)
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      className="erp-business-action-form erp-business-action-form--grid"
    >
      {mode === 'pass' ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="判定结果"
          name="result"
          rules={[{ required: true, message: '请选择判定结果' }]}
        >
          <Select
            options={
              allowConcession
                ? RESULT_DECISION_OPTIONS
                : STRICT_RESULT_DECISION_OPTIONS
            }
          />
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
            label="估算不良比例"
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
                    max={100}
                    min={0}
                    precision={2}
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
      >
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
      </Form.Item>
    </Form>
  )
}
