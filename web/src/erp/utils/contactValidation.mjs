export function normalizeOptionalContactText(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || ''
}

export function isValidContactEmail(value) {
  const text = normalizeOptionalContactText(value)
  if (!text || /[\s<>]/.test(text)) {
    return false
  }
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text)
}

export function isValidContactPhone(value) {
  const text = normalizeOptionalContactText(value)
  if (!text) {
    return false
  }
  const digits = text.match(/\d/g) || []
  const plusMatches = text.match(/\+/g) || []
  if (digits.length < 6 || digits.length > 20 || plusMatches.length > 1) {
    return false
  }
  if (plusMatches.length === 1 && !/^\s*\+/.test(value)) {
    return false
  }
  return /^[+\d\s()./xX-]+$/.test(text)
}

export function normalizeMainlandMobilePhone(value) {
  const text = normalizeOptionalContactText(value)
  if (!text) {
    return ''
  }
  let phone = text.replace(/[\s\-()]/g, '')
  if (phone.startsWith('+86')) {
    phone = phone.slice(3)
  } else if (phone.startsWith('86') && phone.length === 13) {
    phone = phone.slice(2)
  }
  return phone
}

export function isValidMainlandMobilePhone(value) {
  return /^1[3-9]\d{9}$/.test(normalizeMainlandMobilePhone(value))
}

export function optionalContactEmailRule(message = '请输入有效邮箱') {
  return {
    validator: async (_, value) => {
      const text = normalizeOptionalContactText(value)
      if (!text || isValidContactEmail(text)) {
        return
      }
      throw new Error(message)
    },
  }
}

export function optionalContactPhoneRule(message = '请输入有效联系电话') {
  return {
    validator: async (_, value) => {
      const text = normalizeOptionalContactText(value)
      if (!text || isValidContactPhone(text)) {
        return
      }
      throw new Error(message)
    },
  }
}

export function optionalMainlandMobilePhoneRule(message = '请输入有效手机号') {
  return {
    validator: async (_, value) => {
      const text = normalizeOptionalContactText(value)
      if (!text || isValidMainlandMobilePhone(text)) {
        return
      }
      throw new Error(message)
    },
  }
}
