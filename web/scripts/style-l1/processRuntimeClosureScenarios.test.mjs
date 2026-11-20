import assert from 'node:assert/strict'
import test from 'node:test'
import { createProcessRuntimeClosureScenarios } from './processRuntimeClosureScenarios.mjs'
import { requireWorkflowProcessContext } from '../../src/erp/utils/processRuntimePresentation.mjs'

test('process closure browser fixtures preserve source and terminal runtime truth', () => {
  const scenarios = createProcessRuntimeClosureScenarios({
    assert,
    customerRuntimeEffectiveSession: {},
  })
  assert.equal(scenarios.length, 6)
  assert.equal(
    new Set(scenarios.map((scenario) => scenario.name)).size,
    scenarios.length
  )
  for (const scenario of scenarios) {
    const task = scenario.workflowTaskFixtures[0]
    const fixture = scenario.workflowProcessContextFixtures[0]
    const context = requireWorkflowProcessContext(fixture.processContext)
    assert.equal(fixture.taskID, task.id)
    assert.equal(context.source.type, task.source_type)
    assert.equal(context.source.id, task.source_id)
    assert.equal(context.process_instance.id, task.process_instance_id)
    assert.equal(context.linked_node.id, task.process_node_instance_id)
    assert.equal(context.current_nodes.length, 0)
    assert.equal(context.current_responsibilities.length, 0)
    assert.equal(scenario.adminProfile.id, 1)
    assert.deepEqual(scenario.adminProfile.permissions, [
      'workflow.task.read',
      `mobile.${task.owner_role_key}.access`,
    ])
    assert.deepEqual(scenario.adminProfile.menus[0].required_any, [
      'workflow.task.read',
    ])
    assert(scenario.effectiveSession.pages.includes('task-board'))
    assert.deepEqual(
      scenario.effectiveSession.workflow_visible_owner_role_keys_by_capability[
        'workflow.task.read'
      ],
      [task.owner_role_key]
    )
    if (task.task_status_key === 'withdrawn') {
      assert.equal(context.linked_node.status, 'withdrawn')
      assert.equal(context.completed_nodes.length, 1)
      if (context.process_instance.resolution_kind === 'compensated') {
        assert.equal(
          context.process_instance.process_key,
          'finance_payment_approval'
        )
      }
    }
  }
})
