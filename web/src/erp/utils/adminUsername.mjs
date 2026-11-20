export const ADMIN_USERNAME_MIN_LENGTH = 3
export const ADMIN_USERNAME_MAX_LENGTH = 64
export const ADMIN_USERNAME_RULE_TEXT =
  '只允许英文字母、数字和下划线，长度为 3 到 64 个字符'

const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9_]+$/u

export function getAdminUsernameValidationMessage(value) {
  const username = String(value || '').trim()
  if (!username) return '请输入员工账号'
  if (username.length < ADMIN_USERNAME_MIN_LENGTH) {
    return `员工账号至少需要 ${ADMIN_USERNAME_MIN_LENGTH} 个字符`
  }
  if (username.length > ADMIN_USERNAME_MAX_LENGTH) {
    return `员工账号不能超过 ${ADMIN_USERNAME_MAX_LENGTH} 个字符`
  }
  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    return '员工账号只能包含英文字母、数字和下划线'
  }
  return ''
}
