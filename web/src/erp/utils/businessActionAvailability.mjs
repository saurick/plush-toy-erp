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
  if (!authorized) {
    return {
      visible: false,
      disabled: true,
      disabledReason: '',
    }
  }

  if (selected && (!relevant || completed)) {
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

export function resolveBusinessLifecycleActions({
  actions = [],
  selected = false,
  hasPermission = () => false,
  canRun = () => false,
  isPrimary = (action) => action?.danger !== true && action?.key !== 'cancel',
} = {}) {
  const authorizedActions = actions.filter((action) => hasPermission(action))
  const availableActions = selected
    ? authorizedActions.filter((action) => canRun(action))
    : []
  const primaryAction =
    availableActions.find((action) => isPrimary(action)) || null
  const potentialPrimaryAction =
    authorizedActions.find((action) => isPrimary(action)) || null
  const secondaryActions = availableActions.filter(
    (action) => action.key !== primaryAction?.key
  )

  return {
    hasCapability: authorizedActions.length > 0,
    showPrimarySlot: selected
      ? Boolean(primaryAction)
      : Boolean(potentialPrimaryAction),
    showMoreSlot: selected && secondaryActions.length > 0,
    authorizedActions,
    availableActions,
    primaryAction,
    secondaryActions,
  }
}

export function selectStableBusinessActionIndexes(descriptors = [], limit = 0) {
  return descriptors
    .filter((item) => item?.actionable)
    .sort(
      (left, right) =>
        Number(right?.score || 0) - Number(left?.score || 0) ||
        Number(left?.index || 0) - Number(right?.index || 0)
    )
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((item) => item.index)
}
