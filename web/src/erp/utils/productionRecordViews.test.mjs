import assert from 'node:assert/strict'
import test from 'node:test'
import { canReadProductionProcess, canReadProductionExceptionDecisions, productionFactSummary, productionExceptionSummary } from './productionRecordViews.mjs'

const profile = (actions) => ({ permissions: actions, effective_session: { actions, pages: [] } })
test('production execution requires both fact and WIP read permissions', () => {
  assert.equal(canReadProductionProcess(profile(['production.fact.read', 'production.wip.read'])), true)
  for (const actions of [[], ['production.fact.read'], ['production.wip.read']]) {
    assert.equal(canReadProductionProcess(profile(actions)), false)
  }
})
test('exception disposition preserves the existing read, submit and approval capabilities', () => {
  for (const action of ['pmc.risk.read', 'production.fact.read', 'production.exception.submit', 'production.over_issue.submit', 'production.exception.approve']) {
    assert.equal(canReadProductionExceptionDecisions(profile([action])), true)
  }
  assert.equal(canReadProductionExceptionDecisions(profile(['workflow.task.read'])), false)
  assert.equal(canReadProductionExceptionDecisions(profile([])), false)
})

test('finished-goods drafts explain the warehouse confirmation before inventory changes', () => {
  const draft = productionFactSummary({ fact_type: 'FINISHED_GOODS_RECEIPT', status: 'DRAFT' })
  assert.equal(draft.title, '待仓库确认成品入库')
  assert.match(draft.next, /确认成功才增加成品库存/u)
  const posted = productionFactSummary({ fact_type: 'FINISHED_GOODS_RECEIPT', status: 'POSTED' })
  assert.match(posted.next, /检验、查货与包装.*仍需/u)
})

test('material and rework drafts do not claim posted results', () => {
  for (const fact_type of ['MATERIAL_ISSUE', 'REWORK']) {
    assert.match(productionFactSummary({ fact_type, status: 'DRAFT' }).next, /草稿尚未影响库存/u)
  }
  assert.equal(productionFactSummary({ status: 'CANCELLED' }).title, '生产记录已取消')
  assert.match(productionFactSummary({ status: 'POSTED' }).title, /已过账/u)
  assert.match(productionFactSummary({ status: 'UNKNOWN' }).title, /待核对/u)
})

test('exception approval, production execution and quota usage remain distinct', () => {
  assert.match(productionExceptionSummary({ status: 'SUBMITTED' }).next, /在任务管理处理审批/u)
  const pending = { status: 'APPROVED', execution_status: 'PENDING', decision_type: 'SCRAP' }
  assert.match(productionExceptionSummary(pending).next, /不代表.*已经执行/u)
  const quota = productionExceptionSummary({ ...pending, decision_type: 'OVER_ISSUE' })
  assert.equal(quota.title, '超领额度已生效')
  assert.match(quota.next, /正式领料.*不会直接扣减库存/u)
  assert.equal(productionExceptionSummary({ ...pending, execution_status: 'APPLIED' }).title, '异常处置已执行')
})

test('cancelled, rejected and reversed exceptions do not offer ongoing execution', () => {
  assert.equal(productionExceptionSummary({ status: 'CANCELLED' }).title, '异常申请已撤回')
  assert.equal(productionExceptionSummary({ status: 'REJECTED' }).title, '异常申请未获批准')
  assert.equal(productionExceptionSummary({ status: 'APPROVED', execution_status: 'REVERSED' }).title, '异常处置已冲正')
  assert.equal(productionExceptionSummary({ status: 'APPROVED', decision_type: 'OVER_ISSUE', execution_status: 'REVERSED' }).title, '超领额度已撤销')
  assert.match(productionExceptionSummary({ status: 'UNKNOWN' }).title, /待核对/u)
  assert.match(productionExceptionSummary({ status: 'APPROVED', execution_status: 'UNKNOWN' }).title, /待核对/u)
})
