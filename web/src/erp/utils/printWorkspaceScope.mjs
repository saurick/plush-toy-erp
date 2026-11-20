import { AUTH_SCOPE, getCurrentUser } from '../../common/auth/auth.js'
import { resolvePrintWorkspaceCustomerKey } from './printWorkspace.js'

// Standalone print routes have no ERP Outlet context. Use the current session
// for account isolation and retain the source window's config revision in its URL.
export function getPrintWorkspaceDraftScope(searchParamsLike) {
  const searchParams =
    typeof searchParamsLike === 'string'
      ? new URLSearchParams(searchParamsLike.replace(/^\?/, ''))
      : searchParamsLike
  return {
    accountKey: String(getCurrentUser(AUTH_SCOPE.ADMIN)?.id || ''),
    customerKey: resolvePrintWorkspaceCustomerKey(searchParams),
    configRevision: String(searchParams?.get?.('config_revision') || '').trim(),
  }
}
