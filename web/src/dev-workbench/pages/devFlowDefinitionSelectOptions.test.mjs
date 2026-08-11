import assert from 'node:assert/strict'
import test from 'node:test'

import { DEV_FLOW_STATE_CATALOG } from '../config/devFlowStateCatalog.mjs'
import {
  buildBusinessChainSelectOptions,
  buildFactDefinitionSelectOptions,
  buildProcessDefinitionSelectOptions,
  buildStateDefinitionSelectOptions,
} from './devFlowDefinitionSelectOptions.mjs'

function flattenOptions(options) {
  return options.flatMap((option) => option.options || [option])
}

test('business chain select pins the overview and follows the existing overview lanes', () => {
  const options = buildBusinessChainSelectOptions(DEV_FLOW_STATE_CATALOG)

  assert.equal(options[0].value, 'all')
  assert.equal(options[0].label, '全部业务链（设计总图）')
  assert.deepEqual(
    options.slice(1).map((group) => group.label),
    ['履约主链 · 3', '供给与库存支撑 · 3', '异常与返工 · 3', '冲正与纠正 · 2']
  )
  assert.deepEqual(
    flattenOptions(options.slice(1)).map((option) => option.value),
    DEV_FLOW_STATE_CATALOG.businessChainOverview.lanes.flatMap(
      (lane) => lane.chainKeys
    )
  )
  assert(
    flattenOptions(options.slice(1)).every(
      (option) => !option.label.includes('业务主链') && !option.machineKey
    )
  )
})

test('fact definition select uses four explicit navigation groups with exact coverage', () => {
  const options = buildFactDefinitionSelectOptions(DEV_FLOW_STATE_CATALOG)

  assert.deepEqual(
    options.map((group) => group.label),
    ['采购与质量 · 5', '生产与库存 · 6', '委外与返工 · 2', '出货与财务 · 6']
  )
  const items = flattenOptions(options)
  assert.deepEqual(
    new Set(items.map((option) => option.value)),
    new Set(
      DEV_FLOW_STATE_CATALOG.factDefinitions.map(
        (definition) => definition.factKey
      )
    )
  )
  assert.equal(items.length, DEV_FLOW_STATE_CATALOG.factDefinitions.length)
  assert(
    items.every(
      (option) =>
        option.machineKey === option.value &&
        option.label === `${option.businessLabel} · ${option.machineKey}`
    )
  )
})

test('process definition select groups variants by stable process key with exact coverage', () => {
  const options = buildProcessDefinitionSelectOptions(DEV_FLOW_STATE_CATALOG)

  assert.deepEqual(
    options.map((group) => group.label),
    [
      '销售订单受理 · 2',
      '物料供应 · 1',
      '成品交付 · 1',
      '收付款审批 · 1',
      '人工库存调整 · 1',
      '生产异常决策 · 1',
    ]
  )
  const items = flattenOptions(options)
  assert.deepEqual(
    items.map((option) => option.value),
    DEV_FLOW_STATE_CATALOG.processDefinitions.map(
      (definition) => definition.key
    )
  )
  assert(items.every((option) => option.machineKey === option.value))
})

test('state definition select keeps scope boundaries and splits the long Fact group by domain', () => {
  const options = buildStateDefinitionSelectOptions(DEV_FLOW_STATE_CATALOG)

  assert.deepEqual(
    options.map((group) => group.label),
    [
      '源单生命周期 · 7',
      'MasterData 生命周期 · 2',
      'Workflow 协同任务 · 1',
      '业务进度投影 · 1',
      'ProcessRuntime · 2',
      'Fact / Ledger · 采购与质量 · 5',
      'Fact / Ledger · 生产与库存 · 6',
      'Fact / Ledger · 委外与返工 · 2',
      'Fact / Ledger · 出货与财务 · 6',
      '客户配置控制面 · 1',
    ]
  )
  const items = flattenOptions(options)
  assert.equal(items.length, DEV_FLOW_STATE_CATALOG.flows.length)
  assert.deepEqual(
    new Set(items.map((option) => option.value)),
    new Set(DEV_FLOW_STATE_CATALOG.flows.map((flow) => flow.key))
  )
  assert(items.every((option) => option.machineKey === option.value))
})

test('definition select grouping fails closed when Fact group metadata is missing', () => {
  assert.throws(
    () =>
      buildFactDefinitionSelectOptions({
        ...DEV_FLOW_STATE_CATALOG,
        factDefinitionGroups: [],
      }),
    /do not exactly cover/u
  )
})
