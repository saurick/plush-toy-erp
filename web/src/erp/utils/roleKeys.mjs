export const SALES_ROLE_KEY = 'sales'
export const PURCHASE_ROLE_KEY = 'purchase'
export const BUSINESS_ROLE_KEY = SALES_ROLE_KEY

export const ROLE_DISPLAY_NAMES = Object.freeze({
  boss: '老板',
  sales: '业务',
  purchase: '采购',
  pmc: 'PMC',
  production: '生产经理',
  warehouse: '仓库',
  quality: '品质',
  finance: '财务',
  engineering: '工程',
})

const ROLE_PAYLOAD_KEYS = Object.freeze([
  'owner_role_key',
  'confirm_role_key',
  'actor_role_key',
  'last_urge_actor_role_key',
  'escalate_target_role_key',
])

export function normalizeRoleKey(roleKey = '') {
  return String(roleKey || '').trim()
}

export function isRoleKeyMatch(actual, expected) {
  const actualKey = normalizeRoleKey(actual)
  const expectedKey = normalizeRoleKey(expected)
  return Boolean(actualKey && expectedKey && actualKey === expectedKey)
}

export function getRoleDisplayName(roleKey, fallback = '') {
  const normalized = normalizeRoleKey(roleKey)
  return ROLE_DISPLAY_NAMES[normalized] || fallback || normalized
}

export function normalizeRolePayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {}
  const normalizedPayload = { ...payload }
  ROLE_PAYLOAD_KEYS.forEach((key) => {
    if (normalizedPayload[key] !== undefined) {
      normalizedPayload[key] = normalizeRoleKey(normalizedPayload[key])
    }
  })
  return normalizedPayload
}
