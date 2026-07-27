import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowProcessDecision,
  getWorkflowProcessDecisionApprovalForm,
  getWorkflowProcessDecisionApprovedQuantityError,
  requireWorkflowProcessDecisionSubmission,
  workflowProcessDecisionAllowsApprovedQuantity,
} from './workflowProcessDecision.mjs'

const PROFILE_BY_CAPABILITY = Object.freeze({
  'sales_return.approve': 'sales_return_approval',
  'finance.payment.approve': 'finance_payment_approval',
  'warehouse.adjustment.approve': 'inventory_adjustment_approval',
  'production.exception.approve': 'production_exception_approval',
})

function task(capability) {
  return {
    id: 42,
    process_instance_id: 7,
    required_capability_key: capability,
  }
}

function context(profile) {
  return {
    approval_form: {
      profile_key: profile,
      reason_required: true,
      ...(profile === 'production_exception_approval'
        ? {
            approved_quantity: {
              required: false,
              precision: 20,
              scale: 6,
            },
          }
        : {}),
    },
  }
}

test('process decision contract binds all four approvals to the authoritative runtime form', () => {
  for (const [capability, profile] of Object.entries(PROFILE_BY_CAPABILITY)) {
    const approvalTask = task(capability)
    const processContext = context(profile)
    assert.equal(
      getWorkflowProcessDecisionApprovalForm(approvalTask, processContext),
      processContext.approval_form
    )
    assert.deepEqual(
      buildWorkflowProcessDecision({
        task: approvalTask,
        processContext,
        reason: '  已核对原始申请与当前事实  ',
      }),
      { reason: '已核对原始申请与当前事实' }
    )
  }
})

test('process decision contract fails closed on missing or mismatched runtime forms', () => {
  const approvalTask = task('warehouse.adjustment.approve')
  for (const processContext of [
    null,
    {},
    context('finance_payment_approval'),
    {
      approval_form: {
        profile_key: 'inventory_adjustment_approval',
        reason_required: false,
      },
    },
  ]) {
    assert.equal(
      getWorkflowProcessDecisionApprovalForm(approvalTask, processContext),
      null
    )
    assert.throws(
      () =>
        buildWorkflowProcessDecision({
          task: approvalTask,
          processContext,
          reason: '同意',
        }),
      /审批表单与当前流程节点不一致/u
    )
  }
})

test('approved quantity is accepted only from the production form and stays exact', () => {
  const approvalTask = task('production.exception.approve')
  const processContext = context('production_exception_approval')
  assert.equal(
    workflowProcessDecisionAllowsApprovedQuantity(processContext.approval_form),
    true
  )
  assert.equal(
    getWorkflowProcessDecisionApprovedQuantityError(
      processContext.approval_form,
      '99999999999999.999999'
    ),
    ''
  )
  assert.deepEqual(
    buildWorkflowProcessDecision({
      task: approvalTask,
      processContext,
      reason: '批准返工',
      approvedQuantity: '0008.250000',
    }),
    {
      reason: '批准返工',
      approved_quantity: '8.25',
    }
  )

  for (const invalidQuantity of ['0', '-1', '1.0000001', '1e2']) {
    assert.match(
      getWorkflowProcessDecisionApprovedQuantityError(
        processContext.approval_form,
        invalidQuantity
      ),
      /批准数量必须大于 0/u
    )
  }
  assert.throws(
    () =>
      buildWorkflowProcessDecision({
        task: task('sales_return.approve'),
        processContext: context('sales_return_approval'),
        reason: '同意退货',
        approvedQuantity: '1',
      }),
    /批准数量必须大于 0/u
  )
})

test('submission guard rejects missing, drifted and non-canonical decisions without inventing defaults', () => {
  const approvalTask = task('production.exception.approve')
  assert.deepEqual(
    requireWorkflowProcessDecisionSubmission(
      approvalTask,
      {
        reason: '批准返工',
        approved_quantity: '8.250000',
      },
      { reason: '批准返工' }
    ),
    {
      reason: '批准返工',
      approved_quantity: '8.25',
    }
  )
  assert.throws(
    () =>
      requireWorkflowProcessDecisionSubmission(
        approvalTask,
        { reason: '另一条意见' },
        { reason: '批准返工' }
      ),
    /审批意见为必填项/u
  )
  assert.throws(
    () =>
      requireWorkflowProcessDecisionSubmission(
        task('sales_return.approve'),
        { reason: '同意退货', approved_quantity: '1' },
        { reason: '同意退货' }
      ),
    /审批表单与当前流程节点不一致/u
  )
  assert.throws(
    () =>
      requireWorkflowProcessDecisionSubmission(
        { required_capability_key: 'workflow.task.complete' },
        { reason: '不应提交' },
        { reason: '不应提交' }
      ),
    /当前任务不接受流程审批决策/u
  )
})
