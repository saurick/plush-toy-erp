export function parseWorkbenchSession(value) {
  if (!value || typeof value.username !== 'string' || !value.username ||
    typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new Error('工作台登录状态无效，请重新登录')
  }
  return { username: value.username, expiresAt: value.expiresAt }
}
