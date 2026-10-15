export const DEV_PERMISSION_RELATIONSHIPS_API =
  '/__dev/api/permission-relationships'

export function validatePermissionRelationshipSnapshot(value) {
  if (
    !value ||
    value.source !== 'local_development_read_only' ||
    !value.customer_key ||
    !Number.isFinite(Date.parse(value.read_at)) ||
    !['accounts', 'roles', 'permissions', 'warehouse_options'].every((key) =>
      Array.isArray(value[key])
    ) ||
    !value.access_by_role_key ||
    Array.isArray(value.access_by_role_key) ||
    typeof value.access_by_role_key !== 'object' ||
    !Array.isArray(value.approval_settings?.items)
  ) {
    throw new Error('权限关系读取结果不完整，请重新读取')
  }
  return value
}

export async function readPermissionRelationshipSnapshot({
  signal,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(DEV_PERMISSION_RELATIONSHIPS_API, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? '当前连接未通过开发工作台访问检查，请从受控的本地或内网入口打开'
        : '本地开发权限数据暂不可用，请检查开发服务与数据库后重试'
    throw Object.assign(new Error(message), { userMessage: message })
  }
  return validatePermissionRelationshipSnapshot(await response.json())
}
