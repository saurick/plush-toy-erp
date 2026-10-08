import test from 'node:test'
import assert from 'node:assert/strict'
import { readMobileTrackingState, normalizeMobileTrackingQuery, mergeMobileTrackingItems } from './mobileWorkflowTracking.mjs'

test('tracking history cannot cross account or permission scopes', () => {
  const saved = { mobileWorkflowTracking: { accessScope: 'alice|read', scope: 'participated', selection: { kind: 'process', id: 23 }, detailEntry: true, scopes: { participated: { query: { keyword: '订单 A', status: 'active' }, scrollTop: 850, loadedCount: 80 } } } }
  const own = readMobileTrackingState(saved, 'alice|read')
  assert.equal(own.scope, 'participated')
  assert.equal(own.scopes.participated.scrollTop, 850)
  assert.equal(own.scopes.participated.loadedCount, 80)
  assert.equal(own.scopes.started.query.keyword, '')
  assert.deepEqual(own.selection, { kind: 'process', id: 23 })
  for (const scope of ['bob|read', 'alice|none', '']) {
    const other = readMobileTrackingState(saved, scope)
    assert.equal(other.scope, 'started')
    assert.equal(other.selection, null)
    assert.equal(other.detailEntry, false)
    assert.equal(other.scopes.participated.query.keyword, '')
  }
})

test('mobile filters restore only supported visible controls', () => {
  assert.deepEqual(normalizeMobileTrackingQuery({ keyword: ' SO-01 ', status: 'active', owner_role_key: 'not-a-role', attention: 'overdue', source_type: 'sales_order', date_from: '2026-01-01' }), {
    keyword: 'SO-01', status: 'active', owner_role_key: '', attention: 'overdue', source_type: 'sales_order',
  })
  const value = readMobileTrackingState({ mobileWorkflowTracking: { accessScope: 'a', scope: 'visible', selection: { kind: 'raw', id: -1 }, scopes: { started: { loadedCount: 100000, scrollTop: -20 } } } }, 'a')
  assert.equal(value.scope, 'started')
  assert.equal(value.selection, null)
  assert.equal(value.scopes.started.loadedCount, 1000)
  assert.equal(value.scopes.started.scrollTop, 0)
  const invalid = readMobileTrackingState({ mobileWorkflowTracking: { accessScope: 'a', detailEntry: true, selection: { kind: 'task', id: 0 }, scopes: { started: { query: null, scrollTop: Infinity } } } }, 'a')
  assert.equal(invalid.detailEntry, false)
  assert.equal(invalid.scopes.started.scrollTop, 0)
  assert.deepEqual(invalid.scopes.started.query, normalizeMobileTrackingQuery())
})

test('continuous batches distinguish task and process ids and refresh repeated rows', () => {
  assert.deepEqual(mergeMobileTrackingItems([{ kind: 'task', id: 1, status: 'ready' }, { kind: 'process', id: 1, status: 'active' }], [{ kind: 'task', id: 1, status: 'done' }, { kind: 'task', id: 2, status: 'ready' }]), [{ kind: 'task', id: 1, status: 'done' }, { kind: 'process', id: 1, status: 'active' }, { kind: 'task', id: 2, status: 'ready' }])
})
