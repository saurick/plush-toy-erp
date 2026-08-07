import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDevFlowDefinitionSearchGroups,
  createDevFlowDefinitionOptionFilter,
  normalizeDevFlowDefinitionSearchText,
} from './devFlowDefinitionSearch.mjs'

const catalog = {
  businessChains: [
    {
      key: 'sales_to_production',
      label: '销售受理到生产准备',
      summary: '销售订单完成受理后进入生产准备。',
      nodes: [
        {
          key: 'sales_order',
          label: '销售订单与订单行',
          machineKeys: ['source.sales_order'],
          processDefinitionKeys: [
            'sales_order_acceptance/approval_engineering_pmc',
          ],
        },
      ],
    },
    {
      key: 'production_to_inventory',
      label: '生产执行到成品入库',
      summary: '生产完成后形成成品入库事实。',
      nodes: [
        {
          key: 'finished_goods_inbound',
          label: '成品入库',
          factKeys: ['fact.finished_goods_inbound'],
        },
      ],
    },
  ],
  flows: [
    {
      key: 'source.sales_order',
      scopeKey: 'source_document',
      label: '销售订单',
      summary: '销售承诺从草稿到生效。',
      states: [
        { key: 'draft', label: '草稿' },
        { key: 'submitted', label: '已提交' },
      ],
    },
    {
      key: 'workflow.task',
      scopeKey: 'workflow_task',
      label: 'Workflow 协同任务',
      summary: '岗位协同任务。',
      states: [{ key: 'blocked', label: '阻塞' }],
    },
    {
      key: 'source.outsourcing_order',
      scopeKey: 'source_document',
      label: '委外订单',
      summary: '委外加工承诺。',
      states: [{ key: 'submitted', label: '已提交' }],
    },
  ],
  processDefinitions: [
    {
      key: 'sales_order_acceptance/approval_engineering_pmc',
      processKey: 'sales_order_acceptance',
      variantKey: 'approval_engineering_pmc',
      businessRefType: 'sales_order',
      label: '销售订单受理（审批 + 工程 + PMC）',
      nodes: [{ key: 'pmc_review', label: 'PMC 评审' }],
    },
  ],
  factDefinitions: [
    {
      factKey: 'fact.shipment',
      machineKey: 'fact.shipment',
      label: '出货事实',
      sourceDocument: '销售订单与出货单',
      businessImpact: '正式确认出货结果。',
    },
    {
      factKey: 'fact.finished_goods_inbound',
      machineKey: 'fact.finished_goods_inbound',
      label: '成品入库事实',
      sourceDocument: '生产订单',
      businessImpact: '正式增加成品库存。',
    },
  ],
}

function group(groups, key) {
  return groups.find((item) => item.key === key)?.items || []
}

test('definition search normalizes copied whitespace and full-width text', () => {
  assert.equal(
    normalizeDevFlowDefinitionSearchText('  ＳＡＬＥＳ\n\tＯＲＤＥＲ  '),
    'sales order'
  )
})

test('definition search recognizes business names inside a copied backend row', () => {
  const groups = buildDevFlowDefinitionSearchGroups(
    catalog,
    '销售订单  SO-20260806-001  客户：示例公司'
  )

  assert.equal(groups.length, 5)
  assert.deepEqual(
    group(groups, 'chains').map((item) => [item.key, item.nodeKey]),
    [['sales_to_production', 'sales_order']]
  )
  assert.deepEqual(
    group(groups, 'runtime').map((item) => item.key),
    ['sales_order_acceptance/approval_engineering_pmc']
  )
  assert.deepEqual(
    group(groups, 'states').map((item) => item.key),
    ['source.sales_order']
  )

  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(catalog, '销售订单 SO-20260806-001'),
      'states'
    ).map((item) => item.key),
    ['source.sales_order']
  )
})

test('definition search recognizes nested state, process node, fact copy, and stable key', () => {
  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(catalog, '当前状态：已提交'),
      'states'
    )
      .map((item) => item.key)
      .sort(),
    ['source.outsourcing_order', 'source.sales_order']
  )
  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(catalog, '等待 PMC 评审'),
      'runtime'
    ).map((item) => item.key),
    ['sales_order_acceptance/approval_engineering_pmc']
  )
  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(
        catalog,
        '业务影响：正式确认出货结果。'
      ),
      'facts'
    ).map((item) => item.key),
    ['fact.shipment']
  )
  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(
        catalog,
        'process=sales_order_acceptance/approval_engineering_pmc'
      ),
      'runtime'
    ).map((item) => item.key),
    ['sales_order_acceptance/approval_engineering_pmc']
  )
})

test('definition search supports combined business keywords and controlled aliases', () => {
  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(catalog, '销售 PMC'),
      'runtime'
    ).map((item) => item.key),
    ['sales_order_acceptance/approval_engineering_pmc']
  )
  assert.deepEqual(
    group(
      buildDevFlowDefinitionSearchGroups(catalog, '生产 入库'),
      'chains'
    ).map((item) => item.key),
    ['production_to_inventory']
  )
  assert.deepEqual(
    group(buildDevFlowDefinitionSearchGroups(catalog, '待出货'), 'facts').map(
      (item) => item.key
    ),
    ['fact.shipment']
  )
})

test('definition select filters reuse the same nested and combined keyword contract', () => {
  const runtimeFilter = createDevFlowDefinitionOptionFilter(catalog, 'runtime')
  assert.equal(
    runtimeFilter('销售 PMC', {
      value: 'sales_order_acceptance/approval_engineering_pmc',
    }),
    true
  )
  assert.equal(
    runtimeFilter('采购 PMC', {
      value: 'sales_order_acceptance/approval_engineering_pmc',
    }),
    false
  )

  const chainFilter = createDevFlowDefinitionOptionFilter(catalog, 'chains')
  assert.equal(
    chainFilter('生产 入库', { value: 'production_to_inventory' }),
    true
  )

  const factFilter = createDevFlowDefinitionOptionFilter(catalog, 'facts')
  assert.equal(factFilter('待出货', { value: 'fact.shipment' }), true)

  const stateFilter = createDevFlowDefinitionOptionFilter(
    catalog,
    'stateOptions'
  )
  assert.equal(
    stateFilter('销售 已提交', { value: 'source.sales_order' }),
    true
  )
  assert.equal(stateFilter('', { value: 'source.sales_order' }), true)
})

test('definition search does not treat a database id as a definition lookup key', () => {
  const groups = buildDevFlowDefinitionSearchGroups(catalog, '数据库 ID：1818')
  assert.equal(
    groups.reduce((count, item) => count + item.items.length, 0),
    0
  )
})
