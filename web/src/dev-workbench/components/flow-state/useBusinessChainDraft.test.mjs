import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'
import { buildBusinessChainDesignLibrary } from '../../config/devBusinessChainDesign.mjs'
import useBusinessChainDraft, { CHAIN_DESIGN_SAVED_KEY as savedKey, CHAIN_DESIGN_WORKING_KEY as workingKey } from './useBusinessChainDraft.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const canvas = (text) => ({ nodes: [{ id: 'node:sales_order', x: 32, y: 32 }], edges: [], ideas: [{ text }] })
const stored = () => JSON.parse(window.localStorage.getItem(savedKey))

async function setup(t, { saved, working, initialRange, startBlank } = {}) {
  const harness = await createReactTestHarness(t)
  if (saved) window.localStorage.setItem(savedKey, JSON.stringify(saved))
  if (working) window.sessionStorage.setItem(workingKey, JSON.stringify(working))
  let value
  function Probe() { value = useBusinessChainDraft(library, initialRange, startBlank); return null }
  await harness.render(h(Probe))
  return {
    get value() { return value },
    async run(action) {
      let result
      await harness.act(() => { result = action(value) })
      await harness.flush()
      return result
    },
    reload: () => harness.render(h(Probe, { key: 'reload' })),
  }
}

test('首次进入、空白新建和删除后的新视图使用泳道与正常主线', async (t) => {
  for (const options of [{}, { initialRange: 'all' }, { initialRange: 'sales_to_production' }, { startBlank: true }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const editor = await setup(t, options)
      assert.equal(editor.value.draft.presentation.layout, 'lanes')
      assert.equal(editor.value.draft.presentation.showBranches, false)
      assert.equal(editor.value.draft.presentation.mode, options.initialRange === 'all' ? 'overview' : 'mainline')
      assert.equal(editor.value.dirty, false)
      await editor.run((api) => api.open(null))
      assert.equal(editor.value.draft.presentation.layout, 'lanes')
      assert.equal(editor.value.draft.presentation.mode, 'mainline')
      assert.equal(editor.value.dirty, false)
    })
  }
})

test('已有阶段排布、泳道及未记录布局的视图原样恢复，暂存优先且不改写保存内容', async (t) => {
  for (const layout of ['flow', 'lanes', undefined]) {
    await t.test(layout || '未记录布局', async (t) => {
      const draft = { ...canvas('原有备注'), presentation: { mode: 'all', role: 'warehouse', ...(layout ? { layout } : {}), showBranches: true } }
      const entry = { id: 'saved-view', name: '原有视图', draft }
      const editor = await setup(t, { saved: [entry], initialRange: 'all' })
      assert.deepEqual(editor.value.draft, draft)
      assert.equal(editor.value.dirty, false)
      await editor.run((api) => api.changePresentation({ ...draft.presentation, role: 'finance' }))
      const working = editor.value.draft
      await editor.reload()
      assert.deepEqual(editor.value.draft, working)
      assert.deepEqual(stored(), [entry])
      await editor.run((api) => api.open(null))
      await editor.run((api) => api.open(entry.id))
      assert.deepEqual(editor.value.draft, draft)
    })
  }
})

test('多份视图独立保存、另存、切换、重命名和删除，重命名不偷存画布修改', async (t) => {
  const editor = await setup(t)
  await editor.run((api) => api.change(canvas('采购方案')))
  assert.equal((await editor.run((api) => api.save('  采购  '))).ok, true)
  const first = editor.value.currentId
  await editor.run((api) => api.change(canvas('销售方案')))
  assert.equal((await editor.run((api) => api.save('销售', true))).ok, true)
  const second = editor.value.currentId
  assert.notEqual(first, second)
  assert.equal(stored().find((item) => item.id === first).draft.ideas[0].text, '采购方案')
  await editor.run((api) => api.change(canvas('销售方案修改')))
  assert.equal((await editor.run((api) => api.rename('销售备选'))).ok, true)
  assert.equal(editor.value.dirty, true)
  assert.equal(stored().find((item) => item.id === second).draft.ideas[0].text, '销售方案')
  assert.equal((await editor.run((api) => api.save())).ok, true)
  assert.equal(editor.value.dirty, false)
  await editor.run((api) => api.open(first))
  assert.equal(editor.value.saved.name, '采购')
  assert.equal(editor.value.draft.ideas[0].text, '采购方案')
  assert.equal(editor.value.past.length, 0)
  await editor.run((api) => api.remove())
  assert.deepEqual(stored().map((item) => item.id), [second])
  assert.equal(editor.value.currentId, null)
  await editor.run((api) => api.open(second))
  await editor.run((api) => api.remove())
  await editor.reload()
  assert.deepEqual(stored(), [])
  assert.equal(editor.value.draft.nodes.length, 0)
  assert.equal(editor.value.draft.presentation.layout, 'lanes')
  assert.equal(editor.value.dirty, false)
})

test('原有单份视图及未保存编辑保留，首次另存时转换且不覆盖原稿', async (t) => {
  const original = canvas('原来保存的方案')
  const working = canvas('原稿未保存修改')
  const editor = await setup(t, { saved: original, working })
  assert.equal(editor.value.saved.name, '原有视图')
  assert.equal(editor.value.dirty, true)
  assert.deepEqual(stored(), original)
  assert.deepEqual(editor.value.draft, working)
  await editor.run((api) => api.save('另一种方案', true))
  assert.equal(stored().length, 2)
  assert.deepEqual(stored().find((item) => item.name === '原有视图').draft, original)
  const id = editor.value.currentId
  await editor.run((api) => api.change(canvas('还没保存')))
  await editor.reload()
  assert.equal(editor.value.currentId, id)
  assert.equal(editor.value.draft.ideas[0].text, '还没保存')
  assert.equal(editor.value.dirty, true)
})

test('新建和切换暂存失败时保留当前草稿、身份和撤销历史', async (t) => {
  const editor = await setup(t, { saved: [
    { id: 'one', name: '原稿', draft: canvas('原稿') },
    { id: 'two', name: '其他视图', draft: canvas('其他内容') },
  ] })
  await editor.run((api) => api.change(canvas('未保存内容')))
  const before = { draft: editor.value.draft, past: editor.value.past, working: window.sessionStorage.getItem(workingKey), saved: window.localStorage.getItem(savedKey) }
  const storage = window.sessionStorage
  const original = storage.setItem
  const restore = () => Object.defineProperty(storage, 'setItem', { configurable: true, value: original })
  Object.defineProperty(storage, 'setItem', { configurable: true, value: () => { throw new Error('quota') } })
  t.after(restore)
  for (const id of [null, 'two']) {
    const result = await editor.run((api) => api.open(id))
    assert.equal(result.ok, false)
    assert.match(result.error, /暂存失败/u)
    assert.equal(editor.value.currentId, 'one')
    assert.deepEqual(editor.value.draft, before.draft)
    assert.deepEqual(editor.value.past, before.past)
    assert.equal(window.sessionStorage.getItem(workingKey), before.working)
    assert.equal(window.localStorage.getItem(savedKey), before.saved)
  }
  restore()
  assert.equal((await editor.run((api) => api.open(null))).ok, true)
  assert.equal(editor.value.draft.nodes.length, 0)
  assert.equal(editor.value.draft.presentation.layout, 'lanes')
  assert.equal(editor.value.dirty, false)
})

test('空名、重名和超长名称拒绝写入，保存失败不丢当前内容或其他视图', async (t) => {
  const editor = await setup(t)
  await editor.run((api) => api.change(canvas('保留内容')))
  for (const name of ['', '   ', '长'.repeat(61)]) {
    assert.equal((await editor.run((api) => api.save(name))).ok, false)
  }
  await editor.run((api) => api.save('方案'))
  const before = window.localStorage.getItem(savedKey)
  assert.equal((await editor.run((api) => api.save(' 方案 ', true))).ok, false)
  const storage = window.localStorage
  const original = storage.setItem
  Object.defineProperty(storage, 'setItem', { configurable: true, value: () => { throw new Error('quota') } })
  t.after(() => Object.defineProperty(storage, 'setItem', { configurable: true, value: original }))
  await editor.run((api) => api.change(canvas('需要保留的修改')))
  for (const operation of [(api) => api.save(), (api) => api.save('副本', true), (api) => api.rename('改名'), (api) => api.remove()]) {
    const result = await editor.run(operation)
    assert.equal(result.ok, false)
    assert.match(result.error, /保存失败/u)
    assert.equal(window.localStorage.getItem(savedKey), before)
    assert.equal(editor.value.draft.ideas[0].text, '需要保留的修改')
    assert.equal(editor.value.saved.name, '方案')
  }
})

test('写前读取列表保留其他标签页的视图，同一视图发生冲突时要求恢复或另存', async (t) => {
  const editor = await setup(t)
  await editor.run((api) => api.change(canvas('本页方案')))
  await editor.run((api) => api.save('本页'))
  const first = editor.value.currentId
  window.localStorage.setItem(savedKey, JSON.stringify([...stored(), { id: 'other', name: '其他标签页', draft: canvas('外部方案') }]))
  await editor.run((api) => api.change(canvas('本页修改')))
  assert.equal((await editor.run((api) => api.save())).ok, true)
  assert.equal(stored().length, 2)
  window.localStorage.setItem(savedKey, JSON.stringify(stored().map((item) => item.id === first ? { ...item, name: '外部重命名' } : item)))
  assert.equal((await editor.run((api) => api.save())).ok, false)
  assert.equal((await editor.run((api) => api.remove())).ok, false)
  assert.match(editor.value.issue, /其他标签页/u)
  assert.equal((await editor.run((api) => api.save('保留本页副本', true))).ok, true)
  assert.deepEqual(stored().map((item) => item.name), ['保留本页副本', '外部重命名', '其他标签页'])
})

test('损坏列表不被另存覆盖，失效视图不妨碍选择其他有效视图', async (t) => {
  const editor = await setup(t, { saved: [
    { id: 'invalid', name: '过期视图', draft: { nodes: [], edges: [], ideas: null } },
    { id: 'valid', name: '有效视图', draft: canvas('可用') },
  ] })
  assert.match(editor.value.issue, /无法读取/u)
  assert.equal((await editor.run((api) => api.open('valid'))).ok, true)
  const current = editor.value.draft
  assert.equal((await editor.run((api) => api.open('invalid'))).ok, false)
  assert.deepEqual(editor.value.draft, current)
  window.localStorage.setItem(savedKey, '{broken')
  assert.equal((await editor.run((api) => api.save('新视图', true))).ok, false)
  assert.equal(window.localStorage.getItem(savedKey), '{broken')
  assert.deepEqual(editor.value.draft, current)
})

test('撤销重做按编辑顺序恢复，新编辑清空重做且不覆盖已保存视图', async (t) => {
  const original = canvas('已保存')
  const first = canvas('第一次编辑')
  const second = canvas('第二次编辑')
  const editor = await setup(t, { saved: [{ id: 'one', name: '原稿', draft: original }] })
  const savedBefore = window.localStorage.getItem(savedKey)
  await editor.run((api) => api.change(first))
  await editor.run((api) => api.change(second))
  for (const expected of [first, original, original]) {
    await editor.run((api) => api.undo())
    assert.deepEqual(editor.value.draft, expected)
  }
  for (const expected of [first, second, second]) {
    await editor.run((api) => api.redo())
    assert.deepEqual(editor.value.draft, expected)
  }
  await editor.run((api) => api.undo())
  await editor.run((api) => api.change(structuredClone(first)))
  await editor.run((api) => api.redo())
  assert.deepEqual(editor.value.draft, second, '内容未改变时保留重做记录')
  await editor.run((api) => api.undo())
  const revised = canvas('改用新方案')
  await editor.run((api) => api.change(revised))
  assert.equal(editor.value.future.length, 0)
  await editor.run((api) => api.redo())
  assert.deepEqual(editor.value.draft, revised, '新编辑后不能重做旧分支')
  assert.equal(window.localStorage.getItem(savedKey), savedBefore)
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), { currentId: 'one', draft: revised }, '仅暂存当前视图，不持久化历史')
  await editor.run((api) => api.undo())
  await editor.run((api) => api.save())
  await editor.run((api) => api.redo())
  assert.deepEqual(editor.value.draft, revised, '保存当前不丢重做记录')
  assert.equal(editor.value.dirty, true)
  assert.deepEqual(stored()[0].draft, first, '重做不自动覆盖保存内容')
})

test('切换、恢复、另存、新建、删除和刷新不沿用其他编辑会话的重做历史', async (t) => {
  const original = canvas('原稿')
  const editor = await setup(t, { saved: [
    { id: 'one', name: '原稿', draft: original },
    { id: 'two', name: '另稿', draft: canvas('另稿') },
  ] })
  const boundaries = [
    ['切换', (api) => api.open('two')],
    ['恢复', (api) => api.open('one')],
    ['另存', (api) => api.save('副本', true)],
    ['新建', (api) => api.open(null)],
    ['刷新', null],
    ['删除', (api) => api.remove()],
  ]
  for (const [name, action] of boundaries) {
    await editor.run((api) => api.open('one'))
    await editor.run((api) => api.change(canvas('编辑一')))
    await editor.run((api) => api.change(canvas('编辑二')))
    await editor.run((api) => api.undo())
    assert.equal(editor.value.future.length, 1)
    if (action) assert.equal((await editor.run(action)).ok, true, name)
    else await editor.reload()
    const current = structuredClone(editor.value.draft)
    const savedBefore = window.localStorage.getItem(savedKey)
    assert.equal(editor.value.past.length, 0, name)
    assert.equal(editor.value.future.length, 0, name)
    await editor.run((api) => api.redo())
    await editor.run((api) => api.undo())
    assert.deepEqual(editor.value.draft, current, name)
    assert.equal(window.localStorage.getItem(savedKey), savedBefore, name)
  }
})

test('重做沿用最近 40 次编辑的撤销上限', async (t) => {
  const editor = await setup(t)
  for (let index = 1; index <= 45; index++) await editor.run((api) => api.change(canvas(`编辑 ${index}`)))
  assert.equal(editor.value.past.length, 40)
  for (let index = 0; index < 41; index++) await editor.run((api) => api.undo())
  assert.deepEqual(editor.value.draft, canvas('编辑 5'))
  assert.equal(editor.value.future.length, 40)
  for (let index = 0; index < 41; index++) await editor.run((api) => api.redo())
  assert.deepEqual(editor.value.draft, canvas('编辑 45'))
  assert.equal(editor.value.past.length, 40)
  assert.equal(editor.value.future.length, 0)
})

test('岗位和显示范围随视图保存，切换阅读选项保留布局撤销及重做', async (t) => {
  const editor = await setup(t)
  await editor.run((api) => api.change(canvas('初始')))
  await editor.run((api) => api.save('岗位视图'))
  await editor.run((api) => api.change({ ...api.draft, nodes: [{ ...api.draft.nodes[0], x: 600 }] }))
  await editor.run((api) => api.undo())
  const history = [editor.value.past.length, editor.value.future.length]
  await editor.run((api) => api.changePresentation({ mode: 'all', role: 'quality' }))
  assert.deepEqual([editor.value.past.length, editor.value.future.length], history)
  await editor.run((api) => api.redo())
  assert.equal(editor.value.draft.nodes[0].x, 600)
  assert.deepEqual(editor.value.draft.presentation, { mode: 'all', role: 'quality' })
  await editor.run((api) => api.save())
  await editor.reload()
  assert.equal(editor.value.draft.nodes[0].x, 600)
  assert.deepEqual(editor.value.draft.presentation, { mode: 'all', role: 'quality' })
})
