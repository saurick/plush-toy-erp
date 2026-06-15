import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBusinessModuleQuery,
  parseBusinessModuleQuery,
} from './businessModuleNavigation.mjs'
import {
  getBusinessModule,
  getFormalBusinessShellModules,
  getFormalShellFormFieldLabels,
} from '../config/businessModules.mjs'

test('businessModuleNavigation: 单状态钻取使用兼容查询参数', () => {
  const query = buildBusinessModuleQuery({
    businessStatusKeys: ['project_pending'],
  })

  assert.equal(query, 'business_status_key=project_pending')
  assert.deepEqual(parseBusinessModuleQuery(query).businessStatusKeys, [
    'project_pending',
  ])
})

test('businessModuleNavigation: 多状态钻取收口为业务页筛选参数', () => {
  const query = buildBusinessModuleQuery({
    businessStatusKeys: [
      'material_preparing',
      'production_ready',
      'material_preparing',
      'invalid-status',
    ],
  })

  assert.equal(
    query,
    'business_status_keys=material_preparing%2Cproduction_ready'
  )
  assert.deepEqual(parseBusinessModuleQuery(query).businessStatusKeys, [
    'material_preparing',
    'production_ready',
  ])
})

test('formal business shell: 表单字段按产品核心模块区分', () => {
  const formalShellModules = getFormalBusinessShellModules()

  assert.ok(formalShellModules.length > 0)
  for (const moduleItem of formalShellModules) {
    assert.ok(
      getFormalShellFormFieldLabels(moduleItem.key).length >= 6,
      `${moduleItem.key} should declare product-core fields`
    )
  }

  assert.deepEqual(getFormalShellFormFieldLabels('material-bom').slice(0, 4), [
    '产品',
    'BOM 版本',
    '材料',
    '材料用量',
  ])
  assert.ok(getFormalShellFormFieldLabels('inventory').includes('当前余额'))
  assert.ok(getFormalShellFormFieldLabels('inventory').includes('可用量'))
  assert.ok(getFormalShellFormFieldLabels('receivables').includes('来源出货'))
  assert.ok(getFormalShellFormFieldLabels('receivables').includes('应收金额'))
  assert.equal(getBusinessModule('materials')?.pageKind, 'formal-v1')
  assert.deepEqual(getFormalShellFormFieldLabels('materials'), [])
})
