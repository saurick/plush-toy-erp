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

export function optionalContactEmailError(value, message = '请输入有效邮箱') {
  const text = normalizeOptionalContactText(value)
  return text && !isValidContactEmail(text) ? message : null
}

export function optionalContactPhoneError(value, message = '请输入有效联系电话') {
  const text = normalizeOptionalContactText(value)
  return text && !isValidContactPhone(text) ? message : null
}

export function optionalContactEmailRule(message) {
  return {
    validator: async (_, value) => {
      const error = optionalContactEmailError(value, message)
      if (error !== null) throw new Error(error)
    },
  }
}

export function optionalContactPhoneRule(message) {
  return {
    validator: async (_, value) => {
      const error = optionalContactPhoneError(value, message)
      if (error !== null) throw new Error(error)
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
