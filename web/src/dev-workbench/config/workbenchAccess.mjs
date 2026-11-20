export const WORKBENCH_ROLES = Object.freeze({ operator: 'operator', viewer: 'viewer' })
export const WORKBENCH_READ_ONLY_CODE = 'workbench_read_only'
export const WORKBENCH_READ_ONLY_MESSAGE = '当前账号仅可查看，不能执行任务或修改配置'

export function parseWorkbenchSession(value) {
  if (!value || !Object.values(WORKBENCH_ROLES).includes(value.role) ||
    typeof value.username !== 'string' || !value.username || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new Error('工作台登录状态无效，请重新登录')
  }
  return { username: value.username, role: value.role, expiresAt: value.expiresAt }
}
