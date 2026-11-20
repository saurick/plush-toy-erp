import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ADMIN_TOKEN_AUDIENCE,
  ADMIN_TOKEN_ISSUER,
  ADMIN_TOKEN_SUBJECT,
  isValidAdminSessionClaims,
} from '../src/common/auth/adminTokenContract.mjs'
import { createMockAdminSessionToken } from './mockAdminSessionToken.mjs'

test('mock admin session token follows the production claim contract', () => {
  const token = createMockAdminSessionToken({
    userID: 7,
    sessionKey: 'style-session-7',
    issuedAt: 100,
    expiresAt: 200,
  })
  const claims = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
  )

  assert.equal(isValidAdminSessionClaims(claims), true)
  assert.equal(claims.uid, 7)
  assert.equal(claims.sid, 'style-session-7')
  assert.equal('uname' in claims, false)
  assert.equal('role' in claims, false)
})

test('browser admin token constants stay aligned with the Go JWT source', () => {
  const goSource = readFileSync(
    new URL('../../server/pkg/jwt/jwt.go', import.meta.url),
    'utf8'
  )
  const readGoConstant = (name) =>
    goSource.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'u'))?.[1]

  assert.equal(readGoConstant('adminTokenIssuer'), ADMIN_TOKEN_ISSUER)
  assert.equal(readGoConstant('adminTokenAudience'), ADMIN_TOKEN_AUDIENCE)
  assert.equal(readGoConstant('adminTokenSubject'), ADMIN_TOKEN_SUBJECT)
  assert.match(goSource, /UserID\s+int\s+`json:"uid"`/u)
  assert.match(goSource, /SessionKey\s+string\s+`json:"sid"`/u)
  assert.match(goSource, /AuthVersion\s+int64\s+`json:"auth_version"`/u)
})
