import React from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { taskBusinessActionNode } from './taskBusinessActions.mjs'

test('task action filtering preserves wrappers and guards while removing unrelated callbacks', () => {
  const create = React.createElement
  const run = () => {}
  const allowed = create('span', { 'data-tooltip': 'source limit' }, create('button', { disabled: true, 'data-business-action-key': 'post', onClick: run }, '确认入库'))
  const node = taskBusinessActionNode(allowed, { actionKeys: ['post'] })
  assert.equal(node.props['data-tooltip'], 'source limit')
  assert.equal(node.props.children[0].props.disabled, true)
  assert.equal(node.props.children[0].props.onClick, run)
  for (const key of ['cancel', 'print', 'purchase-edit']) {
    assert.equal(taskBusinessActionNode(create('button', { 'data-business-action-key': key, onClick: run }, key), { actionKeys: ['post'] }), null)
  }
  assert.equal(taskBusinessActionNode(create('button', { onClick: run }, 'unregistered'), { actionKeys: ['post'] }), null)
})
