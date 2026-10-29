import assert from 'node:assert/strict'
import test from 'node:test'
import { createMaterialSummaryScenarios, summaryFixture } from './materialSummaryScenarios.mjs'
import { getEngineeringMaterialTaskContext } from '../../src/erp/utils/engineeringMaterialTask.mjs'
import { buildEngineeringMaterialStageModel } from '../../src/erp/utils/workflowTaskHandlingChain.mjs'

for (const scenario of createMaterialSummaryScenarios({
  assert,
  outputDir: 'unused',
  customerRuntimeEffectiveSession: {},
})) {
  test(`${scenario.name} uses a valid review task and matching submitted source`, () => {
    const task = scenario.workflowTaskFixtures[0]
    const request = summaryFixture()
    assert.deepEqual(getEngineeringMaterialTaskContext(task), {
      orderID: request.sales_order_id,
      requestID: request.id,
    })
    const model = buildEngineeringMaterialStageModel(task, request)
    assert.ok(model, '审批状态与提交证据必须符合正式处理链合同')
    assert.ok(model.items.some((item) => item.linked && item.current))
    assert.ok(scenario.effectiveSession.workflow_visible_owner_role_keys_by_capability['workflow.task.read'].includes(task.owner_role_key))
  })
}
