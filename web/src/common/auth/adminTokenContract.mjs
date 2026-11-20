export const ADMIN_TOKEN_ISSUER = 'plush-toy-erp'
export const ADMIN_TOKEN_AUDIENCE = 'plush-toy-erp-admin'
export const ADMIN_TOKEN_SUBJECT = 'admin_access_token'

function hasAdminTokenAudience(audience) {
  return Array.isArray(audience)
    ? audience.includes(ADMIN_TOKEN_AUDIENCE)
    : audience === ADMIN_TOKEN_AUDIENCE
}

export function isValidAdminSessionClaims(claims) {
  const userID = Number(claims?.uid)
  const authVersion = Number(claims?.auth_version)
  const issuedAt = Number(claims?.iat)
  const expiresAt = Number(claims?.exp)
  const sessionKey = String(claims?.sid || '').trim()

  return (
    Number.isInteger(userID) &&
    userID > 0 &&
    Number.isInteger(authVersion) &&
    authVersion > 0 &&
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > issuedAt &&
    sessionKey !== '' &&
    claims?.jti === sessionKey &&
    claims?.iss === ADMIN_TOKEN_ISSUER &&
    claims?.sub === ADMIN_TOKEN_SUBJECT &&
    hasAdminTokenAudience(claims?.aud)
  )
}
