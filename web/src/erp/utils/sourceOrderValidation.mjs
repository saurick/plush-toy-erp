import { numeric20Scale6Units } from './numeric20Scale6.mjs'
import {
  SALES_ORDER_TAX_MODE_OPTIONS,
  SALES_ORDER_FREIGHT_TERMS_OPTIONS,
} from './masterDataOrderView.mjs'

const isEmpty = (value) => value == null || String(value).trim() === ''

export function optionalMoneyError(value, label) {
  if (isEmpty(value)) return ''
  return numeric20Scale6Units(value) === null || String(value).includes(',')
    ? `${label}必须为非负数，且最多保留 6 位小数`
    : ''
}

export function optionalMoneyRule(label) {
  return {
    validator: async (_, value) => {
      const error = optionalMoneyError(value, label)
      if (error) throw new Error(error)
    },
  }
}

// Both the editor and batch import must reject incomplete pricing choices.
export function salesOrderCommercialIssues(values) {
  const issues = []
  const add = (name, message) =>
    issues.push({ name: [name], errors: [message] })
  if (
    !SALES_ORDER_TAX_MODE_OPTIONS.some(({ value }) => value === values.tax_mode)
  ) {
    add('tax_mode', '请选择计税方式')
  } else if (values.tax_mode !== 'NONE') {
    const rate = numeric20Scale6Units(values.tax_rate)
    if (isEmpty(values.tax_rate)) {
      add('tax_rate', '选择含税或未税计价后，请填写税率')
    } else if (
      rate === null ||
      String(values.tax_rate).includes(',') ||
      BigInt(rate) <= BigInt(0) ||
      BigInt(rate) > BigInt(100_000_000)
    ) {
      add('tax_rate', '税率必须大于 0 且不超过 100%，最多保留 6 位小数')
    }
  }
  if (
    !SALES_ORDER_FREIGHT_TERMS_OPTIONS.some(
      ({ value }) => value === values.freight_terms
    )
  ) {
    add('freight_terms', '请选择报价是否含运费')
  } else if (values.freight_terms === 'EXCLUDED') {
    const error = isEmpty(values.quoted_freight_amount)
      ? '请填写报价运费，无另计运费时填写 0'
      : optionalMoneyError(values.quoted_freight_amount, '报价运费')
    if (error) add('quoted_freight_amount', error)
  }
  return issues
}

export function salesOrderCommercialRule(form, field) {
  return {
    validator: async (_, value) => {
      const issue = salesOrderCommercialIssues({
        ...form.getFieldsValue(true),
        [field]: value,
      }).find(({ name }) => name[0] === field)
      if (issue) throw new Error(issue.errors[0])
    },
  }
}
