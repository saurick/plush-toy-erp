import assert from 'node:assert/strict'
import test from 'node:test'
import { outsourcingTaskFactMatches, outsourcingTaskScope } from './outsourcingTaskScope.mjs'

test('outsourcing tasks separate issue, return, inspection request and posting without widening to other facts', () => {
  for (const [group, expected] of [
    ['handoff_outsourcing_issue', ['MATERIAL_ISSUE', true, true, false]],
    ['handoff_outsourcing_return', ['RETURN_RECEIPT', true, true, false]],
    ['handoff_outsourcing_quality_request', ['RETURN_RECEIPT', false, false, true]],
    ['handoff_outsourcing_inbound', ['RETURN_RECEIPT', false, true, false]],
  ]) {
    const scope = outsourcingTaskScope({ task: { task_group: group, source_type: 'outsourcing_fact', source_id: 12 } })
    assert.deepEqual([scope.factType, scope.create, scope.post, scope.quality], expected)
    assert.equal(outsourcingTaskFactMatches(scope, { id: 12, fact_type: scope.factType }), true)
    assert.equal(outsourcingTaskFactMatches(scope, { id: 13, fact_type: scope.factType }), false)
    assert.equal(outsourcingTaskFactMatches(scope, { id: 12, fact_type: 'OTHER' }), false)
    assert.equal(outsourcingTaskScope({ readOnly: true, task: { task_group: group } }).writable, false)
  }
  assert.equal(outsourcingTaskScope(null), null)
  assert.equal(outsourcingTaskFactMatches(outsourcingTaskScope({ task: { task_group: 'other' } }), { id: 12, fact_type: 'RETURN_RECEIPT' }), false)
})
