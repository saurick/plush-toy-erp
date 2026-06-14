import { isAdminSessionUnavailableCode } from '../../common/consts/errorCodes.js'

export function getAdminProfileSyncErrorAction(
  error,
  { hasCachedProfile = false, alreadyNotified = false } = {}
) {
  if (isAdminSessionUnavailableCode(error?.code)) {
    return 'reauth'
  }
  if (hasCachedProfile) {
    return 'keep_cached'
  }
  if (alreadyNotified) {
    return 'silent'
  }
  return 'notify'
}
