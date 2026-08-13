import assert from 'node:assert/strict'
import test from 'node:test'

import { HISTORY_RECORD_SOURCES } from './historyRecordCatalog.mjs'
import { buildHistorySourceSelectOptions } from './historySourceSelectOptions.mjs'

function flattenOptions(groups) {
  return groups.flatMap((group) => group.options)
}

test('history source select groups master data and operational entries with exact coverage', () => {
  const groups = buildHistorySourceSelectOptions(HISTORY_RECORD_SOURCES)

  assert.deepEqual(
    groups.map((group) => group.label),
    ['基础资料', '业务单据与版本']
  )
  assert.deepEqual(
    flattenOptions(groups).map((option) => option.value),
    HISTORY_RECORD_SOURCES.map((source) => source.key)
  )
})

test('history source select rejects uncategorized sources', () => {
  assert.throws(
    () =>
      buildHistorySourceSelectOptions([
        { key: 'unknown', label: '未分类', kind: 'other' },
      ]),
    /unknown kind/u
  )
})
