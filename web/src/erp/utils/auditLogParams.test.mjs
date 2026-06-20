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

test('auditLogParams: keeps non-empty filters and date-only values', () => {
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
      created_from: '2026-06-01',
      created_to: '2026-06-30',
      limit: 50,
      offset: 100,
    }
  )
})
