export function resolveBusinessActionAvailability({
  authorized = false,
  selected = false,
  relevant = true,
  completed = false,
  applicable = true,
  busy = false,
  selectionReason = '请先选择一条记录',
  unavailableReason = '当前记录状态暂不支持此操作',
  busyReason = '当前操作完成后可继续',
} = {}) {
  if (!authorized || (selected && (!relevant || completed))) {
    return {
      visible: false,
      disabled: true,
      disabledReason: '',
    }
  }

  if (!selected) {
    return {
      visible: true,
      disabled: true,
      disabledReason: selectionReason,
    }
  }

  if (!applicable) {
    return {
      visible: true,
      disabled: true,
      disabledReason: unavailableReason,
    }
  }

  if (busy) {
    return {
      visible: true,
      disabled: true,
      disabledReason: busyReason,
    }
  }

  return {
    visible: true,
    disabled: false,
    disabledReason: '',
  }
}

export function resolveContextualBusinessActionAvailability({
  authorized = false,
  selected = false,
  relevant = true,
  ...options
} = {}) {
  if (!authorized || !selected || !relevant) {
    return {
      visible: false,
      disabled: true,
      disabledReason: '',
    }
  }

  return resolveBusinessActionAvailability({
    ...options,
    authorized,
    selected,
    relevant,
  })
}

export function resolveBusinessLifecycleActions({
  actions = [],
  selected = false,
  busy = false,
  hasPermission = () => false,
  canRun = () => false,
  isPrimary = (action) => action?.danger !== true && action?.key !== 'cancel',
  selectionReason = '请先选择一条记录',
  busyReason = '当前操作完成后可继续办理',
  getUnavailableReason = (action) =>
    `当前记录状态不能${action?.label || '执行此操作'}`,
} = {}) {
  const authorizedActions = actions.filter((action) => hasPermission(action))
  const availableActions = selected
    ? authorizedActions.filter((action) => canRun(action))
    : []
  // Lifecycle predicates describe legal transitions, independently of transient loading.
  const visibleActions = selected ? availableActions : authorizedActions
  const primaryAction =
    visibleActions.find((action) => isPrimary(action)) || null
  const secondaryActions = visibleActions.filter(
    (action) => action.key !== primaryAction?.key
  )
  const actionStates = Object.fromEntries(
    authorizedActions.map((action) => {
      const available = selected && canRun(action)
      const unavailableReason =
        getUnavailableReason(action) ||
        `当前记录状态不能${action?.label || '执行此操作'}`
      const disabledReason = !selected
        ? selectionReason
        : !available
          ? unavailableReason
          : busy
            ? busyReason
            : ''
      return [
        action.key,
        {
          available,
          disabled: !available || busy,
          disabledReason,
        },
      ]
    })
  )

  return {
    hasCapability: authorizedActions.length > 0,
    showPrimarySlot: Boolean(primaryAction),
    authorizedActions,
    availableActions,
    primaryAction,
    secondaryActions,
    actionStates,
  }
}

export function selectStableBusinessActionIndexes(
  descriptors = [],
  { availableWidth = Infinity, moreWidth = 0, gap = 8, groupGap = gap, groupMinWidths = {} } = {}
) {
  const actions = descriptors.filter((item) => item?.actionable && item.width > 0)
  const grouped = new Set(actions.map((item) => item.group || '')).size > 1
  const widthOf = (items) => {
    const widths = new Map()
    for (const item of items) {
      const key = item.group || ''
      widths.set(key, (widths.has(key) ? widths.get(key) + gap : 0) + item.width)
    }
    return [...widths].reduce((total, [key, width]) => total +
      Math.max(width, grouped ? groupMinWidths[key] || 0 : 0), 0) +
      Math.max(0, widths.size - 1) * groupGap
  }
  if (widthOf(actions) <= availableWidth) return actions.map((item) => item.index)

  const selected = []
  return [...actions]
    .sort(
      (left, right) =>
        Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) ||
        Number(right?.score || 0) - Number(left?.score || 0) ||
        Number(left?.index || 0) - Number(right?.index || 0)
    )
    .filter((item) => {
      const nextWidth = widthOf([...selected, item]) + gap + moreWidth
      if (!item.pinned && nextWidth > availableWidth) return false
      selected.push(item)
      return true
    })
    .map((item) => item.index)
}
