import { createHash } from 'node:crypto'

export const FINANCE_FIELD_CONTRACT_TYPES = Object.freeze([
  'RECEIVABLE',
  'PAYABLE',
  'INVOICE',
  'RECONCILIATION',
])

export const FINANCE_INVOICE_CATEGORIES = Object.freeze([
  'NONE',
  'EXPORT_GENERAL',
  'VAT_GENERAL_1',
  'VAT_SPECIAL_3',
  'VAT_SPECIAL_13',
])

const STANDARD_PAYMENT_TERMS = Object.freeze({
  0: 'CASH_ON_SHIPMENT',
  30: 'EOM_30',
  45: 'EOM_45',
})

function text(value) {
  return String(value ?? '').trim()
}

function field(record, snake, camel) {
  return record?.[snake] ?? record?.[camel]
}

function nullableText(record, snake, camel) {
  const value = text(field(record, snake, camel))
  return value || null
}

function nullableInteger(record, snake, camel) {
  const value = field(record, snake, camel)
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN
}

function recordIdentity(record, index) {
  return (
    text(field(record, 'fact_no', 'factNo')) ||
    text(record?.id) ||
    `finance-record-${index + 1}`
  )
}

function normalizeRecord(record, index) {
  return {
    id: field(record, 'id', 'id') ?? null,
    factNo: recordIdentity(record, index),
    factType: text(field(record, 'fact_type', 'factType')).toUpperCase(),
    status: text(record?.status).toUpperCase(),
    collectionType: nullableText(
      record,
      'collection_type',
      'collectionType'
    ),
    paymentTerm: nullableText(record, 'payment_term', 'paymentTerm'),
    paymentTermDays: nullableInteger(
      record,
      'payment_term_days',
      'paymentTermDays'
    ),
    invoiceCategory: nullableText(
      record,
      'invoice_category',
      'invoiceCategory'
    ),
    cancelledAt: field(record, 'cancelled_at', 'cancelledAt') ?? null,
    cancelledByName: nullableText(
      record,
      'cancelled_by_name',
      'cancelledByName'
    ),
    cancelReason: nullableText(record, 'cancel_reason', 'cancelReason'),
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function violation(target, record, fieldName, message) {
  target.push({
    factNo: record.factNo,
    factType: record.factType,
    field: fieldName,
    message,
  })
}

function inspectBusinessFields(record, violations) {
  switch (record.factType) {
    case 'RECEIVABLE': {
      if (record.collectionType !== 'ACCOUNTS_RECEIVABLE') {
        violation(
          violations,
          record,
          'collection_type',
          '应收必须冻结为应收款'
        )
      }
      if (
        !Number.isSafeInteger(record.paymentTermDays) ||
        record.paymentTermDays < 0
      ) {
        violation(
          violations,
          record,
          'payment_term_days',
          '应收必须冻结销售订单的非负账期天数'
        )
      } else {
        const expectedTerm = STANDARD_PAYMENT_TERMS[record.paymentTermDays]
        if (expectedTerm && record.paymentTerm !== expectedTerm) {
          violation(
            violations,
            record,
            'payment_term',
            `标准账期 ${record.paymentTermDays} 天必须使用 ${expectedTerm}`
          )
        }
        if (!expectedTerm && record.paymentTerm !== null) {
          violation(
            violations,
            record,
            'payment_term',
            '非标准账期只保留精确天数，不得猜测枚举'
          )
        }
      }
      if (record.invoiceCategory !== null) {
        violation(
          violations,
          record,
          'invoice_category',
          '发票类别不属于应收记录'
        )
      }
      return
    }
    case 'PAYABLE':
    case 'RECONCILIATION':
      for (const [fieldName, value] of [
        ['collection_type', record.collectionType],
        ['payment_term', record.paymentTerm],
        ['payment_term_days', record.paymentTermDays],
        ['invoice_category', record.invoiceCategory],
      ]) {
        if (value !== null) {
          violation(
            violations,
            record,
            fieldName,
            '当前来源没有该字段真源，必须保持为空'
          )
        }
      }
      return
    case 'INVOICE':
      if (!FINANCE_INVOICE_CATEGORIES.includes(record.invoiceCategory)) {
        violation(
          violations,
          record,
          'invoice_category',
          '发票记录必须有合法发票类别'
        )
      }
      for (const [fieldName, value] of [
        ['collection_type', record.collectionType],
        ['payment_term', record.paymentTerm],
        ['payment_term_days', record.paymentTermDays],
      ]) {
        if (value !== null) {
          violation(
            violations,
            record,
            fieldName,
            '该字段不属于发票记录'
          )
        }
      }
      return
    default:
      violation(
        violations,
        record,
        'fact_type',
        '财务字段合同不支持该类型'
      )
  }
}

function inspectCancellation(record, violations) {
  const audit = [
    ['cancelled_at', record.cancelledAt],
    ['cancelled_by_name', record.cancelledByName],
    ['cancel_reason', record.cancelReason],
  ]
  if (record.status === 'CANCELLED') {
    for (const [fieldName, value] of audit) {
      if (!hasValue(value)) {
        violation(
          violations,
          record,
          fieldName,
          '已取消记录的取消审计必须成组完整'
        )
      }
    }
    return
  }
  for (const [fieldName, value] of audit) {
    if (hasValue(value)) {
      violation(
        violations,
        record,
        fieldName,
        '非取消记录不得带取消审计'
      )
    }
  }
}

function representativeRecord(record) {
  return {
    id: record.id,
    factNo: record.factNo,
    factType: record.factType,
    status: record.status,
    collectionType: record.collectionType,
    paymentTerm: record.paymentTerm,
    paymentTermDays: record.paymentTermDays,
    invoiceCategory: record.invoiceCategory,
    cancelledAt: record.cancelledAt,
    cancelledByName: record.cancelledByName,
    cancelReason: record.cancelReason,
  }
}

export function financeInvoiceCategoryForKey(value) {
  const source = text(value)
  let checksum = 0
  for (const character of source) checksum += character.codePointAt(0) || 0
  return FINANCE_INVOICE_CATEGORIES[checksum % FINANCE_INVOICE_CATEGORIES.length]
}

export function inspectFinanceFieldContract(records = []) {
  const normalized = (Array.isArray(records) ? records : [])
    .map(normalizeRecord)
    .sort((left, right) => left.factNo.localeCompare(right.factNo, 'zh-CN'))
  const violations = []
  const validFactNos = new Set()
  const byType = Object.fromEntries(
    FINANCE_FIELD_CONTRACT_TYPES.map((factType) => [
      factType,
      { total: 0, valid: 0, coveragePercent: 0 },
    ])
  )

  for (const record of normalized) {
    const start = violations.length
    inspectBusinessFields(record, violations)
    inspectCancellation(record, violations)
    if (byType[record.factType]) byType[record.factType].total += 1
    if (violations.length === start) {
      validFactNos.add(record.factNo)
      if (byType[record.factType]) byType[record.factType].valid += 1
    }
  }

  for (const stats of Object.values(byType)) {
    stats.coveragePercent =
      stats.total === 0 ? 0 : Number(((stats.valid / stats.total) * 100).toFixed(2))
  }

  const representatives = Object.fromEntries(
    FINANCE_FIELD_CONTRACT_TYPES.map((factType) => {
      const typed = normalized.filter(
        (record) => record.factType === factType && validFactNos.has(record.factNo)
      )
      return [
        factType,
        {
          value: typed[0] ? representativeRecord(typed[0]) : null,
          active: typed.find((record) => record.status !== 'CANCELLED')
            ? representativeRecord(
                typed.find((record) => record.status !== 'CANCELLED')
              )
            : null,
          cancelled: typed.find((record) => record.status === 'CANCELLED')
            ? representativeRecord(
                typed.find((record) => record.status === 'CANCELLED')
              )
            : null,
        },
      ]
    })
  )
  const digest = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
  const total = normalized.length
  const valid = validFactNos.size

  return {
    complete: total > 0 && violations.length === 0,
    total,
    valid,
    coveragePercent:
      total === 0 ? 0 : Number(((valid / total) * 100).toFixed(2)),
    byType,
    representatives,
    violations,
    digest,
  }
}
