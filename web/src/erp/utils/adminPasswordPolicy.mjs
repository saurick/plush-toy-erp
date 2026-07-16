export const ADMIN_PASSWORD_MIN_CHARACTERS = 8
export const ADMIN_PASSWORD_MAX_CHARACTERS = 20
export const ADMIN_PASSWORD_MAX_BYTES = 72

export function getAdminPasswordPolicyError(password) {
  const value = typeof password === 'string' ? password : ''
  if (!value) return ''
  if ([...value].length < ADMIN_PASSWORD_MIN_CHARACTERS) {
    return `密码应为 ${ADMIN_PASSWORD_MIN_CHARACTERS} 到 ${ADMIN_PASSWORD_MAX_CHARACTERS} 位`
  }
  if ([...value].length > ADMIN_PASSWORD_MAX_CHARACTERS) {
    return `密码应为 ${ADMIN_PASSWORD_MIN_CHARACTERS} 到 ${ADMIN_PASSWORD_MAX_CHARACTERS} 位`
  }
  if (new TextEncoder().encode(value).byteLength > ADMIN_PASSWORD_MAX_BYTES) {
    return '密码过长，请减少字符后重试'
  }
  return ''
}

export function adminPasswordPolicyRule() {
  return {
    validator: (_, value) => {
      const message = getAdminPasswordPolicyError(value)
      return message ? Promise.reject(new Error(message)) : Promise.resolve()
    },
  }
}
