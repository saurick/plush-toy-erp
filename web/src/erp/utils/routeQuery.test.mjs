import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  searchParamPositiveInt,
  searchParamPositiveIntText,
} from './routeQuery.mjs'

test('positive route ids have separate display and JSON request forms', () => {
  const params = new URLSearchParams('source_id=42')
  assert.equal(searchParamPositiveIntText(params, 'source_id'), '42')
  assert.equal(searchParamPositiveInt(params, 'source_id'), 42)
  assert.equal(typeof searchParamPositiveInt(params, 'source_id'), 'number')
})

test('positive route id parsing rejects missing and invalid values', () => {
  for (const query of [
    '',
    'source_id=0',
    'source_id=-1',
    'source_id=1.5',
    'source_id=1e3',
    'source_id=9007199254740992',
    'source_id=invalid',
  ]) {
    assert.equal(
      searchParamPositiveInt(new URLSearchParams(query), 'source_id'),
      0
    )
  }
})

test('business pages use numeric route ids at JSON request boundaries', () => {
  const pagesDirectory = new URL('../pages/', import.meta.url)
  const offenders = readdirSync(pagesDirectory)
    .filter((name) => name.endsWith('.jsx') || name.endsWith('.mjs'))
    .filter((name) =>
      readFileSync(new URL(name, pagesDirectory), 'utf8').includes(
        'searchParamPositiveIntText'
      )
    )
  assert.deepEqual(offenders, [])
})
