import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createPermissionCenterAdminDialogState,
  nextPermissionCenterAdminPagination,
  PERMISSION_CENTER_ADMIN_DIALOG,
  permissionCenterAdminDialogReducer,
} from './permissionCenterAdminDialog.mjs'

test('permission-center admin dialogs keep exactly one active account action', () => {
  const firstAdmin = { id: 1, username: 'first' }
  const secondAdmin = {
    id: 2,
    username: 'second',
    display_name: '张三',
    phone: '13800138000',
  }

  const editRoles = permissionCenterAdminDialogReducer(
    createPermissionCenterAdminDialogState(),
    {
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_ROLES,
      admin: firstAdmin,
    }
  )
  const editProfile = permissionCenterAdminDialogReducer(editRoles, {
    type: 'open',
    kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PROFILE,
    admin: secondAdmin,
    displayName: secondAdmin.display_name,
    phone: secondAdmin.phone,
  })

  assert.equal(editProfile.kind, PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PROFILE)
  assert.equal(editProfile.admin, secondAdmin)
  assert.equal(editProfile.displayName, '张三')
  assert.equal(editProfile.phone, '13800138000')
  assert.equal(editProfile.statusDisabled, false)
})

test('permission-center admin dialog close clears the previous account context', () => {
  const statusDialog = permissionCenterAdminDialogReducer(
    createPermissionCenterAdminDialogState(),
    {
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.CHANGE_STATUS,
      admin: { id: 3, username: 'status-admin' },
      statusDisabled: true,
    }
  )
  assert.equal(statusDialog.statusDisabled, true)

  const closed = permissionCenterAdminDialogReducer(statusDialog, {
    type: 'close',
  })
  assert.deepEqual(closed, createPermissionCenterAdminDialogState())
})

test('permission-center profile edits only update the profile dialog', () => {
  const initial = createPermissionCenterAdminDialogState()
  assert.equal(
    permissionCenterAdminDialogReducer(initial, {
      type: 'set_phone',
      phone: '13900139000',
    }),
    initial
  )

  const profileDialog = permissionCenterAdminDialogReducer(initial, {
    type: 'open',
    kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PROFILE,
    admin: { id: 4 },
  })
  const withName = permissionCenterAdminDialogReducer(profileDialog, {
    type: 'set_display_name',
    displayName: '李四',
  })
  const edited = permissionCenterAdminDialogReducer(withName, {
    type: 'set_phone',
    phone: '13900139000',
  })
  assert.equal(edited.displayName, '李四')
  assert.equal(edited.phone, '13900139000')
})

test('permission-center create returns to page one while row edits keep the page', () => {
  const current = { current: 4, pageSize: 20 }
  assert.deepEqual(nextPermissionCenterAdminPagination(current, 'create'), {
    current: 1,
    pageSize: 20,
  })
  assert.equal(nextPermissionCenterAdminPagination(current, 'edit'), current)
})
