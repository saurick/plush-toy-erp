export const CONTRACT_CLAUSE_GROUPS = Object.freeze([
  { key: 'delivery', label: '来货要求' },
  { key: 'contract', label: '合同约定' },
  { key: 'settlement', label: '结算方式' },
])

export const CONTRACT_CLAUSE_GROUPS_MAX = 20
export const CONTRACT_CLAUSES_PER_GROUP_MAX = 100
const text = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .trim()

export function normalizeContractClauseGroups(clauses, defaults = {}) {
  // 业务来源的三类条款与已有窗口草稿在入口转为同一种有序分组。
  const groups = Array.isArray(clauses)
    ? clauses
    : CONTRACT_CLAUSE_GROUPS.map((group) => ({
        ...group,
        items: Array.isArray(clauses?.[group.key])
          ? clauses[group.key]
          : defaults[group.key] || [],
      }))
  const keys = new Set()
  return groups.map((group, index) => {
    let key = text(group?.key) || `group-${index + 1}`
    if (keys.has(key)) {
      const base = `group-${index + 1}`
      key = base
      let suffix = 2
      while (keys.has(key)) key = `${base}-${suffix++}`
    }
    keys.add(key)
    return {
      key,
      label: text(group?.label),
      items: Array.isArray(group?.items) ? group.items.map(text) : [],
    }
  })
}

function groupNumber(value) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (value < 10) return digits[value]
  if (value < 100) {
    const tens = Math.floor(value / 10)
    return `${tens === 1 ? '' : digits[tens]}十${value % 10 ? digits[value % 10] : ''}`
  }
  return String(value)
}

export function visibleContractClauseGroups(clauses) {
  return normalizeContractClauseGroups(clauses)
    .filter(({ items }) => items.length > 0)
    .map((group, index) => ({
      ...group,
      number: groupNumber(index + 1),
      title: `${groupNumber(index + 1)}、${group.label}`,
    }))
}

export function editContractClauseGroups(
  clauses,
  { groupKey, action, label = '', newGroupKey }
) {
  if (!Array.isArray(clauses)) {
    return { ok: false, clauses, message: '请选择有效的条款分组。' }
  }
  const index = clauses.findIndex(({ key }) => key === groupKey)
  const next = [...clauses]
  let selectedIndex = index
  let message
  if (action === 'insert') {
    if (next.length >= CONTRACT_CLAUSE_GROUPS_MAX) {
      return {
        ok: false,
        clauses,
        message: `最多支持 ${CONTRACT_CLAUSE_GROUPS_MAX} 个分组，请先删减后再新增。`,
      }
    }
    if (!text(newGroupKey) || next.some(({ key }) => key === newGroupKey)) {
      return { ok: false, clauses, message: '分组未能新增，请重新操作。' }
    }
    selectedIndex = index < 0 ? next.length : index + 1
    next.splice(selectedIndex, 0, { key: newGroupKey, label, items: [''] })
    message = '已新增分组，请填写分组名称和条目。'
  } else {
    if (index < 0) {
      return { ok: false, clauses, message: '请选择要编辑的分组。' }
    }
    switch (action) {
      case 'rename':
        next[index] = {
          ...next[index],
          label: String(label ?? '').replaceAll('\r', ''),
        }
        message = '分组名称已更新。'
        break
      case 'remove':
        message = `已删除“${next[index].label || '未命名分组'}”及其中 ${next[index].items.length} 条条目，编号已更新。`
        next.splice(index, 1)
        selectedIndex = next.length ? Math.min(index, next.length - 1) : -1
        break
      case 'up':
      case 'down': {
        selectedIndex = index + (action === 'up' ? -1 : 1)
        if (selectedIndex < 0 || selectedIndex >= next.length) {
          return { ok: false, clauses, message: '当前分组已在边界。' }
        }
        const group = next[index]
        next[index] = next[selectedIndex]
        next[selectedIndex] = group
        message = '分组顺序已调整，编号已更新。'
        break
      }
      default:
        return { ok: false, clauses, message: '请选择有效的分组操作。' }
    }
  }
  return {
    ok: true,
    clauses: next,
    selectedGroupKey: next[selectedIndex]?.key || '',
    message,
  }
}

export function editContractClauseGroup(
  clauses,
  { groupKey, index, action, position = 'after', value }
) {
  const groupIndex = Array.isArray(clauses)
    ? clauses.findIndex(({ key }) => key === groupKey)
    : -1
  const group = clauses?.[groupIndex]
  if (!group) return { ok: false, clauses, message: '请选择要编辑的条款分组。' }
  const { items } = group
  const selected = Number.isInteger(index) && index >= 0 && index < items.length
  if (action !== 'insert' && !selected) {
    return { ok: false, clauses, message: '请选择要编辑的条目。' }
  }
  const next = [...items]
  let selectedIndex = index
  let message
  switch (action) {
    case 'insert': {
      if (items.length >= CONTRACT_CLAUSES_PER_GROUP_MAX) {
        return {
          ok: false,
          clauses,
          message: `每组最多支持 ${CONTRACT_CLAUSES_PER_GROUP_MAX} 条，请先删减后再新增。`,
        }
      }
      selectedIndex = selected
        ? index + (position === 'before' ? 0 : 1)
        : next.length
      next.splice(selectedIndex, 0, '')
      message = `已在“${group.label || '未命名分组'}”新增第 ${selectedIndex + 1} 条。`
      break
    }
    case 'update':
      next[index] = text(value)
      message = '条目已更新。'
      break
    case 'remove':
      next.splice(index, 1)
      selectedIndex = next.length ? Math.min(index, next.length - 1) : null
      message = next.length
        ? '已删除当前条目，编号已更新。'
        : '该组条目已全部删除，输出时隐藏标题。'
      break
    case 'clear':
      next[index] = ''
      message = '已清空当前条目，编号和条目位置保留。'
      break
    case 'up':
    case 'down': {
      selectedIndex = index + (action === 'up' ? -1 : 1)
      if (selectedIndex < 0 || selectedIndex >= next.length) {
        return { ok: false, clauses, message: '当前条目已在分组边界。' }
      }
      const item = next[index]
      next[index] = next[selectedIndex]
      next[selectedIndex] = item
      message = '已调整条目顺序，编号已更新。'
      break
    }
    default:
      return { ok: false, clauses, message: '请选择有效的条目操作。' }
  }
  return {
    ok: true,
    clauses: clauses.map((item, itemIndex) =>
      itemIndex === groupIndex ? { ...group, items: next } : item
    ),
    selectedIndex,
    message,
  }
}

export function getContractClauseLimitProblems(clauses) {
  const groups = normalizeContractClauseGroups(clauses)
  return [
    ...(groups.length > CONTRACT_CLAUSE_GROUPS_MAX
      ? [`合同条款超过 ${CONTRACT_CLAUSE_GROUPS_MAX} 个分组`]
      : []),
    ...groups
      .filter(({ items }) => items.length > CONTRACT_CLAUSES_PER_GROUP_MAX)
      .map(
        ({ label }) =>
          `“${label || '未命名分组'}”超过 ${CONTRACT_CLAUSES_PER_GROUP_MAX} 条`
      ),
  ]
}
