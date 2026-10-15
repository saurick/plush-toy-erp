const AUDIT_ACTION_GROUPS = Object.freeze([
  Object.freeze({
    key: 'admin_manage',
    label: '系统管理',
    prefixes: Object.freeze(['admin_user.', 'role.']),
  }),
  Object.freeze({
    key: 'customer_config',
    label: '客户业务设置',
    prefixes: Object.freeze(['customer_config.']),
  }),
  Object.freeze({
    key: 'server_bootstrap',
    label: '系统准备',
    prefixes: Object.freeze(['admin_bootstrap.']),
  }),
  Object.freeze({
    key: 'workflow',
    label: '紧急任务处理',
    prefixes: Object.freeze(['workflow_task.']),
  }),
])

function actionGroup(actionKey) {
  return AUDIT_ACTION_GROUPS.find((group) =>
    group.prefixes.some((prefix) => actionKey.startsWith(prefix))
  )
}

export function buildAuditActionSelectOptions(actionMetaMap = {}) {
  const entries = Object.entries(actionMetaMap)
  const groupedEntries = new Map(
    AUDIT_ACTION_GROUPS.map((group) => [group.key, []])
  )
  for (const [value, meta] of entries) {
    const group = actionGroup(value)
    if (!group) {
      throw new Error(`audit action select is missing a group for ${value}`)
    }
    groupedEntries.get(group.key).push({ value, label: meta.label })
  }

  const groups = AUDIT_ACTION_GROUPS.flatMap((group) => {
    const options = groupedEntries.get(group.key)
    return options.length > 0 ? [{ label: group.label, options }] : []
  })
  const values = groups.flatMap((group) =>
    group.options.map((option) => option.value)
  )
  if (
    values.length !== entries.length ||
    new Set(values).size !== values.length
  ) {
    throw new Error('audit action select groups must exactly cover actions')
  }
  return [{ label: '全部操作', value: '' }, ...groups]
}
