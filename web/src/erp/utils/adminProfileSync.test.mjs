import assert from 'node:assert/strict'
import test from 'node:test'

import { RpcErrorCode } from '../../common/consts/errorCodes.js'
import { getAdminProfileSyncErrorAction } from './adminProfileSync.mjs'

test('adminProfileSync: 当前管理员会话不可用时要求重新登录', () => {
  for (const code of [
    RpcErrorCode.HTTP_UNAUTHORIZED,
    RpcErrorCode.ADMIN_REQUIRED,
    RpcErrorCode.ADMIN_DISABLED,
    RpcErrorCode.ADMIN_NOT_FOUND,
    RpcErrorCode.AUTH_CURRENT_USER_FAILED,
  ]) {
    assert.equal(getAdminProfileSyncErrorAction({ code }), 'reauth')
  }
})

test('adminProfileSync: 有缓存 profile 时后台同步失败不打扰用户', () => {
  assert.equal(
    getAdminProfileSyncErrorAction(
      { code: RpcErrorCode.INTERNAL },
      { hasCachedProfile: true }
    ),
    'keep_cached'
  )
  assert.equal(
    getAdminProfileSyncErrorAction(
      { isNetworkError: true },
      { hasCachedProfile: true }
    ),
    'keep_cached'
  )
})

test('adminProfileSync: 没有缓存 profile 时普通失败最多提示一次', () => {
  assert.equal(
    getAdminProfileSyncErrorAction(
      { code: RpcErrorCode.INTERNAL },
      { hasCachedProfile: false, alreadyNotified: false }
    ),
    'notify'
  )
  assert.equal(
    getAdminProfileSyncErrorAction(
      { code: RpcErrorCode.INTERNAL },
      { hasCachedProfile: false, alreadyNotified: true }
    ),
    'silent'
  )
})
