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
  const secondAdmin = { id: 2, username: 'second', phone: '13800138000' }

  const editRoles = permissionCenterAdminDialogReducer(
    createPermissionCenterAdminDialogState(),
    {
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_ROLES,
      admin: firstAdmin,
    }
  )
  const editPhone = permissionCenterAdminDialogReducer(editRoles, {
    type: 'open',
    kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PHONE,
    admin: secondAdmin,
    phone: secondAdmin.phone,
  })

  assert.equal(editPhone.kind, PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PHONE)
  assert.equal(editPhone.admin, secondAdmin)
  assert.equal(editPhone.phone, '13800138000')
  assert.equal(editPhone.statusDisabled, false)
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

test('permission-center phone edits only update the phone dialog', () => {
  const initial = createPermissionCenterAdminDialogState()
  assert.equal(
    permissionCenterAdminDialogReducer(initial, {
      type: 'set_phone',
      phone: '13900139000',
    }),
    initial
  )

  const phoneDialog = permissionCenterAdminDialogReducer(initial, {
    type: 'open',
    kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PHONE,
    admin: { id: 4 },
  })
  const edited = permissionCenterAdminDialogReducer(phoneDialog, {
    type: 'set_phone',
    phone: '13900139000',
  })
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
