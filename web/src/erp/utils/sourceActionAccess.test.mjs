import assert from 'node:assert/strict'
import test from 'node:test'
import { PermissionCode as P } from '../../common/consts/permissions.generated.mjs'
import { PurchaseSourceActions } from '../../common/consts/purchaseSourceActions.mjs'
import { sourceActionAccess, isSourceActionPermissionDenied } from './sourceActionAccess.mjs'
import { RpcErrorCode } from '../../common/consts/errorCodes.generated.js'

const profile = (permissions) => ({ permissions, effective_session: { actions: permissions } })
const required = (action) => [action.permission, ...action.sourcePermissions, ...action.preparationPermissions, ...action.sensitivePermissions]

test('采购带入权限同时检查本岗、来源和敏感字段，读取不授予写入', () => {
  for (const action of Object.values(PurchaseSourceActions)) {
    const permissions = required(action)
    assert(sourceActionAccess(profile(permissions), action).allowed)
    for (const omitted of permissions) {
      const access = sourceActionAccess(profile(permissions.filter((key) => key !== omitted)), action)
      assert.equal(access.allowed, false, omitted)
      assert.equal(access.blocked, omitted !== action.permission)
      if (access.blocked) {
        assert(access.missing.includes(omitted))
        assert.match(access.reason, /请联系管理员/u)
        assert.doesNotMatch(access.reason, /undefined|purchase\.|finance\.|field\./u)
      }
    }
  }
  const warehouse = profile(required(PurchaseSourceActions.receipt))
  assert(!warehouse.permissions.includes(P.FIELD_PROCUREMENT_COMMERCIAL_READ))
  assert(!warehouse.permissions.includes(P.PURCHASE_ORDER_UPDATE))
  assert(!sourceActionAccess(warehouse, PurchaseSourceActions.payable).authorized)
  const quality = profile(required(PurchaseSourceActions.quality))
  assert(!quality.permissions.includes(P.FIELD_PROCUREMENT_COMMERCIAL_READ))
  assert(!sourceActionAccess(quality, PurchaseSourceActions.receipt).authorized)
})

test('采购来源撤权按当前有效会话收紧，超级管理员也不能绕过客户动作限制', () => {
  const action = PurchaseSourceActions.receipt
  const admin = profile(required(action))
  assert(sourceActionAccess(admin, action).allowed)
  admin.effective_session.actions = admin.effective_session.actions.filter((key) => key !== P.PURCHASE_ORDER_READ)
  assert.equal(sourceActionAccess(admin, action).allowed, false)
  admin.is_super_admin = true
  assert.equal(sourceActionAccess(admin, action).allowed, false)
  assert.equal(sourceActionAccess({ permissions: required(action) }, action).allowed, false)
  assert(isSourceActionPermissionDenied({ code: RpcErrorCode.PERMISSION_DENIED }))
  assert(isSourceActionPermissionDenied({ httpStatus: 403 }))
  assert(!isSourceActionPermissionDenied({ isNetworkError: true, httpStatus: 503 }))
})

test('采购退货调整与两类不合格处置分别检查来源，准备资料不能扩大办理权限', () => {
  for (const key of ['receiptReturn', 'receiptAdjustment', 'qualityReturn', 'rejectionDisposition']) {
    const action = PurchaseSourceActions[key]
    const permissions = required(action)
    assert(action.sourcePermissions.includes(P.PURCHASE_RECEIPT_READ))
    assert.deepEqual(action.sensitivePermissions, [])
    assert(sourceActionAccess(profile(permissions), action).allowed)
    const readOnly = profile(permissions.filter((permission) => permission !== action.permission))
    assert.equal(sourceActionAccess(readOnly, action).authorized, false)
    assert.equal(sourceActionAccess(readOnly, action).blocked, false)
    for (const permission of [...action.sourcePermissions, ...action.preparationPermissions]) {
      assert(sourceActionAccess(profile(permissions.filter((value) => value !== permission)), action).blocked)
    }
  }
  assert.deepEqual(PurchaseSourceActions.qualityReturn.sourcePermissions, [P.QUALITY_INSPECTION_READ, P.PURCHASE_RECEIPT_READ])
  assert.deepEqual(PurchaseSourceActions.qualityReturn.preparationPermissions, [P.PURCHASE_RETURN_READ])
  assert.deepEqual(PurchaseSourceActions.rejectionDisposition.preparationPermissions, [P.PURCHASE_RETURN_READ])
})
