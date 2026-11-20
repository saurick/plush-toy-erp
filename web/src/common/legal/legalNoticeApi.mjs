import { RpcDomain, RpcMethod } from '../consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const adminRpc = new JsonRpc({
  url: RpcDomain.ADMIN,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function legalNoticeParams(identity) {
  return {
    notice_version: String(identity?.noticeVersion || '').trim(),
    content_fingerprint: String(identity?.contentFingerprint || '').trim(),
  }
}

export async function getLegalNoticeStatus(identity, options = {}) {
  const result = await adminRpc.call(
    RpcMethod.admin.LEGAL_NOTICE_STATUS,
    legalNoticeParams(identity),
    options
  )
  return result?.data || {}
}

export async function acknowledgeLegalNotice(identity, options = {}) {
  const result = await adminRpc.call(
    RpcMethod.admin.ACKNOWLEDGE_LEGAL_NOTICE,
    legalNoticeParams(identity),
    options
  )
  return result?.data || {}
}
