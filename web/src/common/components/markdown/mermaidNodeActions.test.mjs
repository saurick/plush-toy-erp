import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { bindMermaidNodeActions } from './mermaidNodeActions.mjs'

test('only caller-declared diagram nodes receive click and keyboard actions', async () => {
  const window = new Window()
  try {
    const canvas = window.document.createElement('div')
    canvas.innerHTML = '<svg><g class="node" id="diagram-flowchart-N0-0"><rect class="label-container" style="fill: white"/><text>节点</text></g><g class="node" id="diagram-flowchart-N1-1"></g><g class="edgePath" id="diagram-flowchart-N0-2"></g></svg>'
    const selected = []
    const node = canvas.querySelector('g.node')
    const cleanup = bindMermaidNodeActions(canvas, [{ id: 'N0', label: '查看办理条件' }], (id) => selected.push(id), 'N0')
    assert.equal(node.getAttribute('role'), 'button')
    assert.equal(node.getAttribute('tabindex'), '0')
    assert.equal(node.getAttribute('aria-label'), '查看办理条件')
    assert.equal(node.getAttribute('aria-pressed'), 'true')
    assert.equal(node.querySelector('rect').style.stroke, 'var(--erp-primary)')
    node.querySelector('text').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    for (const key of ['Enter', ' ']) {
      const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      node.dispatchEvent(event)
      assert(event.defaultPrevented)
    }
    node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    canvas.querySelectorAll('g')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    canvas.querySelectorAll('g')[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    assert.deepEqual(selected, ['N0', 'N0', 'N0'])
    cleanup()
    assert.equal(node.hasAttribute('role'), false)
    assert.equal(node.querySelector('rect').getAttribute('style'), 'fill: white')
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    assert.equal(selected.length, 3, '卸载后不能残留节点处理器')
  } finally { await window.happyDOM.close() }
})

test('ordinary Mermaid without explicit actions stays noninteractive', async () => {
  const window = new Window()
  try {
    const canvas = window.document.createElement('div')
    canvas.innerHTML = '<svg><g class="node" id="diagram-flowchart-N0-0"></g></svg>'
    bindMermaidNodeActions(canvas, undefined, () => { throw new Error('unexpected action') })()
    assert.equal(canvas.querySelector('[role="button"]'), null)
  } finally { await window.happyDOM.close() }
})

test('read-only graph descriptors expose identities without tab stops or screen highlight styles', async () => {
  const window = new Window()
  try {
    const canvas = window.document.createElement('div')
    canvas.innerHTML = '<svg><g class="node" id="diagram-flowchart-N0-0"><rect class="label-container"/></g></svg>'
    const cleanup = bindMermaidNodeActions(canvas, [{ id: 'N0', label: '打印对象', data: { 'graph-node': 'source', 'role-match': true } }], undefined, 'N0')
    const node = canvas.querySelector('g')
    assert.equal(node.getAttribute('data-graph-node'), 'source')
    assert.equal(node.hasAttribute('tabindex'), false)
    assert.equal(node.querySelector('rect').hasAttribute('style'), false)
    cleanup()
    assert.equal(node.hasAttribute('data-graph-node'), false)
  } finally { await window.happyDOM.close() }
})

test('rebinding a connected SVG node preserves focus without replaying inspection', async () => {
  const window = new Window()
  try {
    const canvas = window.document.createElement('div')
    canvas.innerHTML = '<svg><g class="node" id="diagram-flowchart-N0-0"><rect class="label-container"/></g></svg>'
    window.document.body.append(canvas)
    const nodes = [{ id: 'N0', label: '订单', description: '说明' }]
    let inspected = 0
    let cleanup = bindMermaidNodeActions(canvas, nodes, () => {}, 'N0', { onInspect: () => { inspected += 1 } })
    const node = canvas.querySelector('g')
    node.focus()
    assert.equal(window.document.activeElement === node, true)
    cleanup()
    cleanup = bindMermaidNodeActions(canvas, nodes, () => {}, '', { onInspect: () => { inspected += 1 } })
    assert.equal(window.document.activeElement === node, true)
    assert.equal(inspected, 1)
    assert.equal(node.getAttribute('aria-pressed'), 'false')
    cleanup()
    node.blur()
    assert.equal(node.hasAttribute('tabindex'), false)
  } finally { await window.happyDOM.close() }
})

test('node and edge inspection supports focus, pointer, touch-style click, Escape and cleanup', async () => {
  const window = new Window()
  try {
    const canvas = window.document.createElement('div')
    canvas.innerHTML = '<svg><g class="node" id="diagram-flowchart-N0-0"><rect class="label-container"/></g><path id="diagram-E0" data-id="E0"/><g class="edgeLabel" data-id="E0"><text>批准</text></g></svg>'
    const inspected = []
    const selected = []
    const cleanup = bindMermaidNodeActions(canvas, [{ id: 'N0', label: '待审核', description: '同源说明', data: { 'graph-node': 'submitted' }, expanded: true, controls: 'rules' }], (id) => selected.push(id), 'N0', {
      edges: [{ id: 'E0', label: '查看批准条件', description: '必须具备审核权限', key: 'approve', selectId: 'N0', data: { 'graph-edge': 'approve', from: 'submitted', to: 'approved' } }],
      onInspect: (item) => inspected.push(item?.description ?? null),
    })
    const node = canvas.querySelector('g.node')
    assert.equal(node.getAttribute('data-graph-node'), 'submitted')
    assert.equal(node.getAttribute('aria-controls'), 'rules')
    const edge = canvas.querySelector('.edgeLabel')
    for (const type of ['pointerenter', 'focus', 'click']) edge.dispatchEvent(new window.Event(type, { bubbles: true }))
    edge.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.deepEqual(inspected, ['必须具备审核权限', '必须具备审核权限', '必须具备审核权限', null])
    assert.deepEqual(selected, ['N0'])
    assert.equal(canvas.querySelector('path').getAttribute('data-graph-wire'), 'approve')
    cleanup()
    assert.equal(node.hasAttribute('data-graph-node'), false)
    assert.equal(edge.hasAttribute('role'), false)
    edge.dispatchEvent(new window.Event('click'))
    assert.equal(selected.length, 1)
  } finally { await window.happyDOM.close() }
})
