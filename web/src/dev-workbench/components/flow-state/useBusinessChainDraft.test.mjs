import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'
import { buildBusinessChainDesignLibrary } from '../../config/devBusinessChainDesign.mjs'
import useBusinessChainDraft, { CHAIN_DESIGN_WORKING_KEY as workingKey } from './useBusinessChainDraft.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const canvas = (x = 32) => ({ nodes: [{ id: 'node:sales_order', x, y: 32 }], edges: [] })
const legacyCollectionKey = 'plush-workbench:business-chain-design'

async function setup(t, { working, durable, initialRange, startBlank } = {}) {
  const harness = await createReactTestHarness(t)
  if (durable) window.localStorage.setItem(workingKey, JSON.stringify(durable))
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

test('首次进入和新建空白视图使用泳道与正常主线', async (t) => {
  for (const options of [{}, { initialRange: 'all' }, { initialRange: 'sales_to_production' }, { startBlank: true }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const editor = await setup(t, options)
      assert.equal(editor.value.draft.presentation.layout, 'lanes')
      assert.deepEqual(editor.value.draft.presentation.layers, ['normal'])
      assert.equal(editor.value.draft.presentation.mode, options.initialRange === 'all' ? 'overview' : 'mainline')
      assert.equal(editor.value.needsNewConfirmation, false)
      assert.equal(await editor.run((api) => api.startNew()), '')
      assert.equal(editor.value.draft.nodes.length, 0)
      assert.equal(editor.value.draft.presentation.mode, 'mainline')
      assert.equal(editor.value.needsNewConfirmation, false)
    })
  }
})

test('已有自动记录恢复布局和坐标，忽略旧备注与收藏标识', async (t) => {
  for (const layout of ['flow', 'lanes', undefined]) {
    await t.test(layout || '未记录布局', async (t) => {
      const draft = { ...canvas(), presentation: { mode: 'all', role: 'warehouse', ...(layout ? { layout } : {}), showBranches: true } }
      const editor = await setup(t, { durable: { currentId: 'previous-view', draft: { ...draft, ideas: [{ text: '旧备注' }] } }, initialRange: 'all' })
      const restored = { ...draft, presentation: { mode: 'all', highlightedRoles: ['warehouse'], ...(layout ? { layout } : {}), layers: ['normal', 'exception', 'correction', 'impact'] } }
      assert.deepEqual(editor.value.draft, restored)
      assert.equal(editor.value.needsNewConfirmation, true)
      assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)), { draft: restored })
      await editor.run((api) => api.changePresentation({ highlightedRoles: ['warehouse', 'finance'] }))
      const working = editor.value.draft
      await editor.reload()
      assert.deepEqual(editor.value.draft, working)
      assert.deepEqual(editor.value.draft.presentation.highlightedRoles, ['warehouse', 'finance'])
    })
  }
})

test('旧的单份工作草稿可恢复，损坏的收藏记录不参与加载或写入', async (t) => {
  const draft = canvas()
  const editor = await setup(t, { working: draft })
  window.localStorage.setItem(legacyCollectionKey, '{broken')
  await editor.reload()
  assert.deepEqual(editor.value.draft, draft)
  assert.equal(editor.value.issue, '')
  await editor.run((api) => api.startNew())
  assert.equal(window.localStorage.getItem(legacyCollectionKey), '{broken')
})

test('撤销重做按编辑顺序恢复，新编辑清空重做，刷新和新建重置历史', async (t) => {
  const original = canvas()
  const first = canvas(64)
  const second = canvas(96)
  const editor = await setup(t, { working: { draft: original } })
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
  assert.deepEqual(editor.value.draft, second, '相同内容保留重做记录')
  await editor.run((api) => api.undo())
  const revised = canvas(128)
  await editor.run((api) => api.change(revised))
  assert.equal(editor.value.future.length, 0)
  await editor.run((api) => api.redo())
  assert.deepEqual(editor.value.draft, revised)
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), { draft: revised })
  await editor.run((api) => api.undo())
  await editor.reload()
  assert.deepEqual(editor.value.draft, first)
  assert.deepEqual([editor.value.past.length, editor.value.future.length], [0, 0])
  await editor.run((api) => api.change(revised))
  await editor.run((api) => api.undo())
  await editor.run((api) => api.startNew())
  assert.deepEqual([editor.value.past.length, editor.value.future.length], [0, 0])
  await editor.run((api) => api.redo())
  assert.equal(editor.value.draft.nodes.length, 0)
})

test('重做沿用最近 40 次编辑的撤销上限', async (t) => {
  const editor = await setup(t)
  for (let index = 1; index <= 45; index++) await editor.run((api) => api.change(canvas(index)))
  assert.equal(editor.value.past.length, 40)
  for (let index = 0; index < 41; index++) await editor.run((api) => api.undo())
  assert.deepEqual(editor.value.draft, canvas(5))
  assert.equal(editor.value.future.length, 40)
  for (let index = 0; index < 41; index++) await editor.run((api) => api.redo())
  assert.deepEqual(editor.value.draft, canvas(45))
  assert.equal(editor.value.past.length, 40)
  assert.equal(editor.value.future.length, 0)
})

test('关闭标签页后从本浏览器恢复最近一次探索', async (t) => {
  const editor = await setup(t)
  const draft = canvas(64)
  await editor.run((api) => api.change(draft))
  assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)), { draft })
  window.sessionStorage.clear()
  await editor.reload()
  assert.deepEqual(editor.value.draft, draft)
})

test('标签页自己的探索优先于其他标签页最近的自动记录', async (t) => {
  const own = { draft: canvas(32) }
  const editor = await setup(t, { working: own })
  window.localStorage.setItem(workingKey, JSON.stringify({ draft: canvas(64) }))
  await editor.reload()
  assert.deepEqual(editor.value.draft, own.draft)
})

test('本地自动记录失败回滚标签页缓存，重试保留最新编辑且新建失败不替换现场', async (t) => {
  const editor = await setup(t, { working: { draft: canvas(32) } })
  const previous = window.localStorage.getItem(workingKey)
  const storage = window.localStorage
  const original = storage.setItem
  const restore = () => Object.defineProperty(storage, 'setItem', { configurable: true, value: original })
  Object.defineProperty(storage, 'setItem', { configurable: true, value: function setItem(key, value) { if (key === workingKey) throw new Error('quota'); return original.call(this, key, value) } })
  t.after(restore)
  await editor.run((api) => api.change(canvas(96)))
  assert.match(editor.value.issue, /自动保留失败/u)
  assert.deepEqual(editor.value.draft, canvas(96))
  assert.equal(window.localStorage.getItem(workingKey), previous)
  assert.equal(window.sessionStorage.getItem(workingKey), previous)
  const history = [...editor.value.past]
  assert.match(await editor.run((api) => api.startNew()), /自动保留失败/u)
  assert.deepEqual(editor.value.past, history)
  assert.deepEqual(editor.value.draft, canvas(96))
  restore()
  await editor.run((api) => api.retryPersistence())
  assert.equal(editor.value.issue, '')
  assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)).draft, editor.value.draft)
})

test('岗位、显示范围和方向随视图保存，切换方向保留布局编辑的撤销及重做', async (t) => {
  const editor = await setup(t)
  await editor.run((api) => api.change({ ...canvas(), presentation: { ...api.draft.presentation, layout: 'lanes' } }))
  await editor.run((api) => api.change({ ...api.draft, nodes: [{ ...api.draft.nodes[0], x: 600 }], presentation: { ...api.draft.presentation, layout: 'flow' } }))
  await editor.run((api) => api.undo())
  const history = [editor.value.past.length, editor.value.future.length]
  await editor.run((api) => api.changePresentation({ mode: 'all', highlightedRoles: ['quality', 'warehouse'], direction: 'TB' }))
  assert.deepEqual([editor.value.past.length, editor.value.future.length], history)
  assert.equal(editor.value.draft.presentation.layout, 'lanes')
  await editor.run((api) => api.redo())
  assert.equal(editor.value.draft.nodes[0].x, 600)
  assert.equal(editor.value.draft.presentation.layout, 'flow')
  assert.equal(editor.value.draft.presentation.direction, 'TB')
  assert.deepEqual(editor.value.draft.presentation.highlightedRoles, ['quality', 'warehouse'])
  const working = editor.value.draft
  await editor.reload()
  assert.deepEqual(editor.value.draft, working)
})
