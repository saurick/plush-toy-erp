import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONTRACT_CLAUSES_PER_GROUP_MAX,
  CONTRACT_CLAUSE_GROUPS_MAX,
  editContractClauseGroup,
  editContractClauseGroups,
  normalizeContractClauseGroups,
  getContractClauseLimitProblems,
  visibleContractClauseGroups,
} from './contractClauseEditor.mjs'
import { buildMaterialPurchaseContractDraft } from './materialPurchaseContractEditor.mjs'
import { normalizeProcessingContractDraft } from '../data/processingContractTemplate.mjs'

const initial = () =>
  normalizeContractClauseGroups({
    delivery: ['甲', '乙', '丙'],
    contract: ['约定'],
    settlement: ['结算'],
  })
const items = (clauses, key) => clauses.find((group) => group.key === key).items

test('新增条目只插入空值，前后位置明确，来源数组不被改写', () => {
  const source = initial()
  const result = editContractClauseGroup(source, {
    groupKey: 'delivery',
    index: 1,
    action: 'insert',
    position: 'before',
  })
  assert.equal(result.ok, true)
  assert.deepEqual(items(result.clauses, 'delivery'), ['甲', '', '乙', '丙'])
  assert.equal(result.selectedIndex, 1)
  assert.deepEqual(items(source, 'delivery'), ['甲', '乙', '丙'])
  const after = editContractClauseGroup(source, {
    groupKey: 'delivery',
    index: 1,
    action: 'insert',
  })
  assert.deepEqual(items(after.clauses, 'delivery'), ['甲', '乙', '', '丙'])
})

test('清空保留条目，删除移除条目并选择相邻位置', () => {
  const source = initial()
  const cleared = editContractClauseGroup(source, {
    groupKey: 'delivery',
    index: 1,
    action: 'clear',
  })
  assert.deepEqual(items(cleared.clauses, 'delivery'), ['甲', '', '丙'])
  const removed = editContractClauseGroup(cleared.clauses, {
    groupKey: 'delivery',
    index: 1,
    action: 'remove',
  })
  assert.deepEqual(items(removed.clauses, 'delivery'), ['甲', '丙'])
  assert.equal(removed.selectedIndex, 1)
})

test('上下调序保留全部条目和空值，边界操作不改变内容', () => {
  const source = initial()
  source[0].items = ['甲', '', '丙']
  const up = editContractClauseGroup(source, {
    groupKey: 'delivery',
    index: 2,
    action: 'up',
  })
  assert.deepEqual(items(up.clauses, 'delivery'), ['甲', '丙', ''])
  assert.equal(up.selectedIndex, 1)
  const down = editContractClauseGroup(up.clauses, {
    groupKey: 'delivery',
    index: 1,
    action: 'down',
  })
  assert.deepEqual(items(down.clauses, 'delivery'), items(source, 'delivery'))
  for (const [index, action] of [
    [0, 'up'],
    [2, 'down'],
  ]) {
    const result = editContractClauseGroup(source, {
      groupKey: 'delivery',
      index,
      action,
    })
    assert.equal(result.ok, false)
    assert.equal(result.clauses, source)
  }
})

test('整组可删到零，隐藏标题；新增后恢复，明确空组不会被草稿归一化补回', () => {
  const removed = editContractClauseGroup(initial(), {
    groupKey: 'contract',
    index: 0,
    action: 'remove',
  })
  assert.deepEqual(items(removed.clauses, 'contract'), [])
  assert.equal(removed.selectedIndex, null)
  assert.deepEqual(
    visibleContractClauseGroups(removed.clauses).map(({ title }) => title),
    ['一、来货要求', '二、结算方式']
  )
  for (const normalize of [
    buildMaterialPurchaseContractDraft,
    normalizeProcessingContractDraft,
  ]) {
    const draft = normalize({ clauses: removed.clauses })
    assert.deepEqual(draft.clauses, removed.clauses)
  }
  const added = editContractClauseGroup(removed.clauses, {
    groupKey: 'contract',
    index: null,
    action: 'insert',
  })
  assert.deepEqual(items(added.clauses, 'contract'), [''])
  assert.equal(visibleContractClauseGroups(added.clauses).length, 3)
})

test('全空条目仍输出编号和分组，所有组均删除时没有输出分组', () => {
  assert.equal(
    visibleContractClauseGroups({
      delivery: [''],
      contract: [],
      settlement: [],
    }).length,
    1
  )
  assert.deepEqual(
    visibleContractClauseGroups({ delivery: [], contract: [], settlement: [] }),
    []
  )
})

test('新增达到上限时拒绝且不截断存量内容，非法目标不触碰其他组', () => {
  const source = initial()
  source[0].items = Array(CONTRACT_CLAUSES_PER_GROUP_MAX).fill('条款')
  assert.equal(
    editContractClauseGroup(source, {
      groupKey: 'delivery',
      index: 0,
      action: 'insert',
    }).ok,
    false
  )
  assert.equal(items(source, 'delivery').length, CONTRACT_CLAUSES_PER_GROUP_MAX)
  const overLimit = structuredClone(source)
  overLimit[0].items.push('保留的超限条目')
  assert.equal(getContractClauseLimitProblems(overLimit).length, 1)
  assert.equal(
    items(overLimit, 'delivery').length,
    CONTRACT_CLAUSES_PER_GROUP_MAX + 1
  )
  for (const request of [
    { groupKey: 'unknown', index: 0, action: 'remove' },
    { groupKey: 'delivery', index: -1, action: 'clear' },
    { groupKey: 'delivery', index: 0, action: 'unknown' },
  ]) {
    const result = editContractClauseGroup(source, request)
    assert.equal(result.ok, false)
    assert.equal(result.clauses, source)
  }
})

test('有序分组保留自定义名称、顺序、留白和明确空列表；入口不修改来源', () => {
  const source = [
    { key: 'inspection', label: ' 验收要求 ', items: ['第一条', '', '第三条'] },
    { key: 'empty', label: '', items: [] },
    { key: 'packaging', label: '包装要求', items: [''] },
  ]
  const before = structuredClone(source)
  for (const normalize of [
    buildMaterialPurchaseContractDraft,
    normalizeProcessingContractDraft,
  ]) {
    const draft = normalize({ clauses: source })
    assert.deepEqual(draft.clauses, [
      { key: 'inspection', label: '验收要求', items: ['第一条', '', '第三条'] },
      { key: 'empty', label: '', items: [] },
      { key: 'packaging', label: '包装要求', items: [''] },
    ])
    assert.deepEqual(normalize(draft).clauses, draft.clauses)
    assert.deepEqual(normalize({ clauses: [] }).clauses, [])
  }
  assert.deepEqual(source, before)
})

test('新增分组在当前组之后插入并带一个空条目，改名与整组调序保留身份和内容', () => {
  const source = initial()
  const added = editContractClauseGroups(source, {
    action: 'insert',
    groupKey: 'delivery',
    newGroupKey: 'custom',
  })
  assert.equal(added.selectedGroupKey, 'custom')
  assert.deepEqual(added.clauses[1], { key: 'custom', label: '', items: [''] })
  assert.deepEqual(source, initial())
  const renamed = editContractClauseGroups(added.clauses, {
    action: 'rename',
    groupKey: 'custom',
    label: '包装要求',
  })
  const edited = editContractClauseGroup(renamed.clauses, {
    action: 'update',
    groupKey: 'custom',
    index: 0,
    value: '保留内容',
  })
  const moved = editContractClauseGroups(edited.clauses, {
    action: 'up',
    groupKey: 'custom',
  })
  assert.deepEqual(moved.clauses[0], {
    key: 'custom',
    label: '包装要求',
    items: ['保留内容'],
  })
  assert.deepEqual(
    visibleContractClauseGroups(moved.clauses).map(({ title }) => title),
    ['一、包装要求', '二、来货要求', '三、合同约定', '四、结算方式']
  )
  assert.deepEqual(
    editContractClauseGroups(moved.clauses, {
      action: 'down',
      groupKey: 'custom',
    }).clauses,
    edited.clauses
  )
})

test('删除整组移除其条目并选择相邻组，最后一组可删空且可重新新增', () => {
  const source = initial()
  const removed = editContractClauseGroups(source, {
    action: 'remove',
    groupKey: 'contract',
  })
  assert.equal(removed.selectedGroupKey, 'settlement')
  assert.deepEqual(
    removed.clauses.map(({ key }) => key),
    ['delivery', 'settlement']
  )
  assert.deepEqual(
    visibleContractClauseGroups(removed.clauses).map(({ title }) => title),
    ['一、来货要求', '二、结算方式']
  )
  const empty = editContractClauseGroups([source[0]], {
    action: 'remove',
    groupKey: 'delivery',
  })
  assert.deepEqual(empty.clauses, [])
  assert.equal(empty.selectedGroupKey, '')
  const restored = editContractClauseGroups(empty.clauses, {
    action: 'insert',
    newGroupKey: 'new',
  })
  assert.deepEqual(restored.clauses, [{ key: 'new', label: '', items: [''] }])
})

test('分组数有界，已有超限内容保留；首尾、重复身份和失效目标不改写草稿', () => {
  const source = Array.from(
    { length: CONTRACT_CLAUSE_GROUPS_MAX },
    (_, index) => ({
      key: `g-${index}`,
      label: `分组${index}`,
      items: ['保留'],
    })
  )
  const before = structuredClone(source)
  for (const request of [
    { action: 'insert', newGroupKey: 'extra' },
    { action: 'up', groupKey: 'g-0' },
    { action: 'down', groupKey: 'g-19' },
    { action: 'remove', groupKey: 'missing' },
    { action: 'invalid', groupKey: 'g-0' },
  ]) {
    const result = editContractClauseGroups(source, request)
    assert.equal(result.ok, false)
    assert.equal(result.clauses, source)
  }
  assert.equal(
    editContractClauseGroups(initial(), {
      action: 'insert',
      newGroupKey: 'delivery',
    }).ok,
    false
  )
  assert.deepEqual(source, before)
  const overflow = [
    ...source,
    { key: 'overflow', label: '额外组', items: ['保留'] },
  ]
  assert.equal(
    normalizeContractClauseGroups(overflow).length,
    CONTRACT_CLAUSE_GROUPS_MAX + 1
  )
  assert.match(
    getContractClauseLimitProblems(overflow).join(''),
    /超过 20 个分组/u
  )
  assert.equal(visibleContractClauseGroups(source).at(-1).title, '二十、分组19')
})

test('缺失和重复的分组身份在入口确定为唯一值，恢复后保持稳定', () => {
  const groups = normalizeContractClauseGroups([
    { key: 'same', label: '同名', items: ['甲'] },
    { key: 'same', label: '同名', items: ['乙'] },
    { label: '', items: [] },
  ])
  assert.equal(new Set(groups.map(({ key }) => key)).size, 3)
  assert.deepEqual(
    groups.map(({ items: values }) => values),
    [['甲'], ['乙'], []]
  )
  assert.deepEqual(normalizeContractClauseGroups(groups), groups)
})
