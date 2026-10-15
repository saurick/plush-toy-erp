import assert from 'node:assert/strict'
import test from 'node:test'
import {
  availableProductionRecordViews,
  productionRecordViewPath,
  resolveProductionRecordView,
} from './productionRecordViews.mjs'

const records = '/erp/production/progress'
const exceptions = '/erp/production/exceptions'
const allViews = ['records', 'process', 'decisions', 'tasks']
const params = (value = '') => new URLSearchParams(value)
const profile = (
  actions,
  pages = ['production-progress', 'production-exceptions']
) => ({
  permissions: actions,
  effective_session: { actions, pages },
})

test('production views require both page access and their existing action permissions', () => {
  const all = profile([
    'production.fact.read',
    'production.wip.read',
    'workflow.task.read',
  ])
  assert.deepEqual(
    availableProductionRecordViews(all, [records, exceptions]),
    allViews
  )
  assert.deepEqual(availableProductionRecordViews(all, [records]), [
    'records',
    'process',
  ])
  assert.deepEqual(
    availableProductionRecordViews(profile(['production.fact.read']), [
      records,
      exceptions,
    ]),
    ['records', 'decisions']
  )
  assert.deepEqual(
    availableProductionRecordViews(
      profile(['workflow.task.read'], ['production-exceptions']),
      [exceptions]
    ),
    ['tasks']
  )
  assert.deepEqual(availableProductionRecordViews(profile([]), []), [])
})

test('the URL selects record views immediately, including backwards navigation and denied process access', () => {
  assert.equal(
    resolveProductionRecordView(records, params('display=process'), allViews),
    'process'
  )
  assert.equal(
    resolveProductionRecordView(records, params(), allViews),
    'records'
  )
  assert.equal(
    resolveProductionRecordView(records, params('display=process'), [
      'records',
    ]),
    'records'
  )
  assert.equal(
    resolveProductionRecordView(exceptions, params('view=tasks'), allViews),
    'tasks'
  )
  assert.equal(
    resolveProductionRecordView(exceptions, params(), allViews),
    'decisions'
  )
  assert.equal(
    resolveProductionRecordView(exceptions, params('view=decisions'), [
      'tasks',
    ]),
    'tasks'
  )
})

test('exact exception and linked task entries keep their original target precedence', () => {
  assert.equal(
    resolveProductionRecordView(
      exceptions,
      params('view=tasks&production_exception_id=12'),
      allViews
    ),
    'decisions'
  )
  assert.equal(
    resolveProductionRecordView(
      exceptions,
      params('view=decisions&link_keyword=MO-001'),
      allViews
    ),
    'tasks'
  )
  const target = productionRecordViewPath(
    exceptions,
    params(
      'view=tasks&link_keyword=MO-001&link_source=board&link_fields=order_no'
    ),
    'decisions'
  )
  assert.equal(target, `${exceptions}?view=decisions`)
})

test('record and process views retain current query context without mutating it', () => {
  const source = params('source_type=PRODUCTION_ORDER&source_id=7&fact_id=8')
  const target = productionRecordViewPath(records, source, 'process')
  assert.equal(
    target,
    `${records}?source_type=PRODUCTION_ORDER&source_id=7&fact_id=8&display=process`
  )
  assert.equal(source.has('display'), false)
  assert.equal(
    productionRecordViewPath(records, params(target.split('?')[1]), 'records'),
    `${records}?${source}`
  )
})

test('a production order can round-trip through exception decisions and process view', () => {
  assert.equal(
    productionRecordViewPath(
      records,
      params('source_type=PRODUCTION_ORDER&source_id=7'),
      'decisions'
    ),
    `${exceptions}?view=decisions&production_order_id=7`
  )
  assert.equal(
    productionRecordViewPath(
      exceptions,
      params('view=decisions&production_order_id=7'),
      'process'
    ),
    `${records}?display=process&source_type=PRODUCTION_ORDER&source_id=7`
  )
  assert.equal(
    productionRecordViewPath(
      exceptions,
      params('view=decisions&production_order_id=7&production_exception_id=8'),
      'tasks'
    ),
    `${exceptions}?view=tasks`
  )
})

test('unrelated sources and invalid order references are never converted into production orders', () => {
  for (const query of [
    'source_type=SALES_ORDER&source_id=7',
    'source_type=PRODUCTION_ORDER&source_id=-1',
    'source_type=PRODUCTION_ORDER&source_id=NaN',
    'source_type=PRODUCTION_ORDER&source_id=2.5',
  ]) {
    assert.equal(
      productionRecordViewPath(records, params(query), 'decisions'),
      `${exceptions}?view=decisions`
    )
  }
  assert.equal(
    productionRecordViewPath(
      exceptions,
      params('production_order_id=-1'),
      'records'
    ),
    records
  )
})
