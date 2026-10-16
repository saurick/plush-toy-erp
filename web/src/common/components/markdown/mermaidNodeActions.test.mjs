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
