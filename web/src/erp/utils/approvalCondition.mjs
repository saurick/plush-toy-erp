import { BUSINESS_CURRENCY_OPTIONS } from './businessCurrency.mjs'

export const AMOUNT_APPROVAL_KEYS = new Set(['sales_order', 'purchase_order'])
const AMOUNT_PATTERN = /^(0|[1-9]\d{0,13})(\.\d{1,6})?$/u
const ALL_APPROVAL = Object.freeze({ mode: 'all', amount: '', currency: '' })

export function normalizeApprovalCondition(approvalKey, condition) {
  if (condition == null) return { ...ALL_APPROVAL }
  if (typeof condition !== 'object' || Array.isArray(condition)) {
    throw new Error('审批条件无效，请重新设置')
  }
  const mode = condition.mode || 'all'
  if (mode === 'all') return { ...ALL_APPROVAL }
  if (mode !== 'amount' || !AMOUNT_APPROVAL_KEYS.has(approvalKey)) {
    throw new Error('该审批事项不支持此条件')
  }
  const raw = String(condition.amount ?? '').trim()
  if (!AMOUNT_PATTERN.test(raw)) {
    throw new Error('请输入非负金额，最多 14 位整数和 6 位小数')
  }
  const [integer, fraction = ''] = raw.split('.')
  const decimals = fraction.replace(/0+$/u, '')
  const amount = decimals ? `${integer}.${decimals}` : integer
  if (amount === '0') return { ...ALL_APPROVAL }
  const currency = String(condition.currency || '')
    .trim()
    .toUpperCase()
  if (!BUSINESS_CURRENCY_OPTIONS.some((option) => option.value === currency)) {
    throw new Error('请选择审批门槛的币种')
  }
  return { mode: 'amount', amount, currency }
}

export function approvalConditionSummary(approvalKey, condition) {
  const rule = normalizeApprovalCondition(approvalKey, condition)
  if (rule.mode === 'all') return '全部审批'
  const [integer, fraction] = rule.amount.split('.')
  const amount =
    integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ',') +
    (fraction ? `.${fraction}` : '')
  return `${rule.currency} ${amount} 起需审批`
}

export function orderSubmissionSuccessMessage(kind, result) {
  const label = kind === 'sales_order' ? '销售订单' : '采购订单'
  const node = result?.completed_node || result?.started_node
  return node?.outcome === `${kind}.submitted_without_approval`
    ? `${label}已提交，按规则免审并生效`
    : `${label}已提交，已进入审批流程`
}
