export const ADMIN_PASSWORD_MIN_CHARACTERS = 8
export const ADMIN_PASSWORD_MAX_BYTES = 72

export function getAdminPasswordPolicyError(password) {
  const value = typeof password === 'string' ? password : ''
  if (!value) return ''
  if ([...value].length < ADMIN_PASSWORD_MIN_CHARACTERS) {
    return `密码至少 ${ADMIN_PASSWORD_MIN_CHARACTERS} 位`
  }
  if (new TextEncoder().encode(value).byteLength > ADMIN_PASSWORD_MAX_BYTES) {
    return `密码不能超过 ${ADMIN_PASSWORD_MAX_BYTES} 字节`
  }
  return ''
}

export function adminPasswordPolicyRule() {
  return {
    validator: (_, value) => {
      const message = getAdminPasswordPolicyError(value)
      return message
        ? Promise.reject(new Error(message))
        : Promise.resolve()
    },
  }
}
