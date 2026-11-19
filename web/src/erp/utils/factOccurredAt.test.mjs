import assert from 'node:assert/strict'
import test from 'node:test'
import { optionalOccurredAt, optionalOccurredAtFromForm } from './factOccurredAt.mjs'

test('fact occurrence dates preserve absent, blank, invalid and local time contracts', () => {
  const invalid = new Error('业务内容不完整')
  const strict = (value) => optionalOccurredAt(value, () => invalid)
  for (const read of [strict, optionalOccurredAtFromForm]) {
    for (const value of [undefined, null, '']) assert.equal(read(value), undefined)
    const local = '2026-11-19T08:15'
    assert.equal(read(local), new Date(local).toISOString())
  }
  for (const value of [' ', 'no date', 42]) assert.throws(() => strict(value), (err) => err === invalid)
  assert.equal(optionalOccurredAtFromForm('  '), undefined)
  assert.throws(() => optionalOccurredAtFromForm('no date'), /发生时间无效/u)
})
