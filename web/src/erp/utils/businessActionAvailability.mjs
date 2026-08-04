export function resolveBusinessActionAvailability({
  authorized = false,
  selected = false,
  relevant = true,
  completed = false,
  applicable = true,
  busy = false,
  selectionReason = '请先选择一条记录',
  unavailableReason = '当前记录状态暂不支持此操作',
  irrelevantReason = unavailableReason,
  completedReason = '当前记录已完成此操作',
  busyReason = '当前操作完成后可继续',
} = {}) {
  if (!authorized) {
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

  if (completed) {
    return {
      visible: true,
      disabled: true,
      disabledReason: completedReason || '当前记录已完成此操作',
    }
  }

  if (!relevant) {
    return {
      visible: true,
      disabled: true,
      disabledReason:
        irrelevantReason || unavailableReason || '当前记录不适用此操作',
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
  const primaryAction =
    authorizedActions.find((action) => isPrimary(action)) || null
  const secondaryActions = authorizedActions.filter(
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
    showMoreSlot: secondaryActions.length > 0,
    authorizedActions,
    availableActions,
    primaryAction,
    secondaryActions,
    actionStates,
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
