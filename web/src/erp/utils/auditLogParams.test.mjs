import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAuditLogParams } from './auditLogParams.mjs'

test('auditLogParams: omits empty optional filters from JSON-RPC payload', () => {
  assert.deepEqual(
    buildAuditLogParams({
      source: '',
      eventKey: '',
      keyword: '   ',
      createdFrom: '',
      createdTo: '',
      pageSize: 20,
      offset: 0,
    }),
    { limit: 20, offset: 0 }
  )
})

test('auditLogParams: uses complete business days for date-only filters', () => {
  assert.deepEqual(
    buildAuditLogParams({
      source: ' admin_manage ',
      eventKey: 'admin_user.password.reset',
      keyword: ' password ',
      createdFrom: '2026-06-01',
      createdTo: '2026-06-30',
      pageSize: 50,
      offset: 100,
    }),
    {
      source: 'admin_manage',
      event_key: 'admin_user.password.reset',
      keyword: 'password',
      created_from: '2026-06-01T00:00:00+08:00',
      created_to: '2026-06-30T23:59:59.999999999+08:00',
      limit: 50,
      offset: 100,
    }
  )
})

test('auditLogParams: preserves explicit timestamps without adding day boundaries', () => {
  const params = buildAuditLogParams({
    createdFrom: '2026-09-26T09:30:00+08:00',
    createdTo: '2026-09-26T10:30:00+08:00',
  })
  assert.equal(params.created_from, '2026-09-26T09:30:00+08:00')
  assert.equal(params.created_to, '2026-09-26T10:30:00+08:00')
})
