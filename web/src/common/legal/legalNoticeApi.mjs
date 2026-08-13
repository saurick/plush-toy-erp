import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const adminRpc = new JsonRpc({
  url: 'admin',
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
    'legal_notice_status',
    legalNoticeParams(identity),
    options
  )
  return result?.data || {}
}

export async function acknowledgeLegalNotice(identity, options = {}) {
  const result = await adminRpc.call(
    'acknowledge_legal_notice',
    legalNoticeParams(identity),
    options
  )
  return result?.data || {}
}
