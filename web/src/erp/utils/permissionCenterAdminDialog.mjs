export const PERMISSION_CENTER_ADMIN_DIALOG = Object.freeze({
  CREATE: 'create',
  EDIT_ROLES: 'edit_roles',
  EDIT_PHONE: 'edit_phone',
  RESET_PASSWORD: 'reset_password',
  CHANGE_STATUS: 'change_status',
  REVOKE: 'revoke',
})

const supportedDialogKinds = new Set(
  Object.values(PERMISSION_CENTER_ADMIN_DIALOG)
)

export function createPermissionCenterAdminDialogState() {
  return {
    admin: null,
    kind: '',
    phone: '',
    statusDisabled: false,
  }
}

export function permissionCenterAdminDialogReducer(state, action) {
  const currentState = state || createPermissionCenterAdminDialogState()
  switch (action?.type) {
    case 'open': {
      if (!supportedDialogKinds.has(action.kind)) return currentState
      return {
        admin: action.admin || null,
        kind: action.kind,
        phone:
          action.kind === PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PHONE
            ? String(action.phone || '')
            : '',
        statusDisabled:
          action.kind === PERMISSION_CENTER_ADMIN_DIALOG.CHANGE_STATUS
            ? Boolean(action.statusDisabled)
            : false,
      }
    }
    case 'set_phone':
      if (currentState.kind !== PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PHONE) {
        return currentState
      }
      return { ...currentState, phone: String(action.phone || '') }
    case 'close':
      return createPermissionCenterAdminDialogState()
    default:
      return currentState
  }
}

export function nextPermissionCenterAdminPagination(pagination, mutationKind) {
  if (mutationKind !== 'create') return pagination
  return { ...pagination, current: 1 }
}
