import test from 'node:test'
import assert from 'node:assert/strict'
import { readMobileTrackingSource, readMobileTrackingState, normalizeMobileTrackingQuery, mergeMobileTrackingItems } from './mobileWorkflowTracking.mjs'

test('business source links keep exact source and separate their history from personal tracking', () => {
  const source = readMobileTrackingSource('?tracking=visible&track_source_type=sales_order&track_source_id=7')
  assert.deepEqual(source, { source_type: 'sales_order', source_id: 7 })
  const state = readMobileTrackingState({}, 'a|source:sales_order:7', source)
  assert.equal(state.scope, 'visible')
  assert.equal(state.scopes.visible.query.keyword, '')
  assert.equal(readMobileTrackingState({ mobileWorkflowTracking: state }, 'a').scope, 'visible')
  for (const id of ['0', '-1', '1.5', 'x', '9007199254740992']) {
    assert.equal(readMobileTrackingSource(`?tracking=visible&track_source_type=sales_order&track_source_id=${id}`), null)
  }
  assert.equal(readMobileTrackingSource('?tracking=visible&track_source_type=unregistered&track_source_id=7'), null)
})

test('tracking history cannot cross account or permission scopes', () => {
  const saved = { mobileWorkflowTracking: { accessScope: 'alice|read', scope: 'participated', selection: { kind: 'process', id: 23 }, detailEntry: true, scopes: { participated: { query: { keyword: '订单 A', status: 'active' }, scrollTop: 850, loadedCount: 80 } } } }
  const own = readMobileTrackingState(saved, 'alice|read')
  assert.equal(own.scope, 'participated')
  assert.equal(own.scopes.participated.scrollTop, 850)
  assert.equal(own.scopes.participated.loadedCount, 80)
  assert.equal(own.scopes.started.query.keyword, '')
  assert.equal(own.scopes.visible.query.keyword, '')
  const visible = readMobileTrackingState({ mobileWorkflowTracking: { ...saved.mobileWorkflowTracking, scope: 'visible', scopes: { visible: { query: { keyword: 'PO-MR-25-221' } } } } }, 'alice|read')
  assert.equal(visible.scope, 'visible')
  assert.equal(visible.scopes.visible.query.keyword, 'PO-MR-25-221')
  assert.equal(visible.scopes.participated.query.keyword, '')
  assert.deepEqual(own.selection, { kind: 'process', id: 23 })
  for (const scope of ['bob|read', 'alice|none', '']) {
    const other = readMobileTrackingState(saved, scope)
    assert.equal(other.scope, 'visible')
    assert.equal(other.selection, null)
    assert.equal(other.detailEntry, false)
    assert.equal(other.scopes.participated.query.keyword, '')
  }
})

test('mobile filters restore only supported visible controls', () => {
  assert.deepEqual(normalizeMobileTrackingQuery({ keyword: ' SO-01 ', status: 'active', owner_role_key: 'not-a-role', attention: 'overdue', source_type: 'sales_order', date_from: '2026-01-01' }), {
    keyword: 'SO-01', status: 'active', owner_role_key: '', attention: 'overdue', source_type: 'sales_order',
  })
  const value = readMobileTrackingState({ mobileWorkflowTracking: { accessScope: 'a', scope: 'invalid', selection: { kind: 'raw', id: -1 }, scopes: { started: { loadedCount: 100000, scrollTop: -20 } } } }, 'a')
  assert.equal(value.scope, 'visible')
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

test('手机结束状态清除当前岗位和关注条件，保留搜索及单据类型', () => {
  const query = normalizeMobileTrackingQuery({ status: 'completed', owner_role_key: 'boss', attention: 'blocked', keyword: '小熊', source_type: 'sales_order' })
  assert.deepEqual(query, { status: 'completed', owner_role_key: '', attention: '', keyword: '小熊', source_type: 'sales_order' })
  const saved = { mobileWorkflowTracking: { accessScope: 'alice', scopes: { started: { query: { ...query, attention: 'overdue', owner_role_key: 'engineering' } } } } }
  assert.deepEqual(readMobileTrackingState(saved, 'alice').scopes.started.query, query)
})
