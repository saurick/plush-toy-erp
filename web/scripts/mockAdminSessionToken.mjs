import { Buffer } from 'node:buffer'

import {
  ADMIN_TOKEN_AUDIENCE,
  ADMIN_TOKEN_ISSUER,
  ADMIN_TOKEN_SUBJECT,
} from '../src/common/auth/adminTokenContract.mjs'

export function createMockAdminSessionToken({
  userID = 1,
  sessionKey = 'mock-admin-session',
  authVersion = 1,
  issuedAt = Math.floor(Date.now() / 1000),
  expiresAt = issuedAt + 3600,
} = {}) {
  const header = encodeBase64URL({ alg: 'none', typ: 'JWT' })
  const payload = encodeBase64URL({
    uid: userID,
    sid: sessionKey,
    auth_version: authVersion,
    iss: ADMIN_TOKEN_ISSUER,
    aud: [ADMIN_TOKEN_AUDIENCE],
    sub: ADMIN_TOKEN_SUBJECT,
    jti: sessionKey,
    iat: issuedAt,
    exp: expiresAt,
  })
  return `${header}.${payload}.mock-signature`
}

function encodeBase64URL(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
