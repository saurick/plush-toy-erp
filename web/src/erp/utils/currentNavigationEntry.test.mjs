import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_DESKTOP_ENTRY,
  resolveCurrentNavigationEntry,
} from './currentNavigationEntry.mjs'

const navigationSections = [
  {
    title: '看板',
    items: [
      {
        key: 'global-dashboard',
        path: '/erp/dashboard',
        label: '工作台',
      },
      {
        key: 'print-center',
        path: '/erp/print-center',
        label: '打印中心',
      },
    ],
  },
]

test('currentNavigationEntry: exact and child routes keep registered page key', () => {
  assert.deepEqual(
    resolveCurrentNavigationEntry({
      navigationSections,
      locationPath: '/erp/print-center',
    }),
    {
      entry: navigationSections[0].items[1],
      matched: true,
      matchType: 'exact',
      pageKey: 'print-center',
      menuPath: '/erp/print-center',
    }
  )

  assert.deepEqual(
    resolveCurrentNavigationEntry({
      navigationSections,
      locationPath: '/erp/print-center/material-purchase-contract',
    }),
    {
      entry: navigationSections[0].items[1],
      matched: true,
      matchType: 'prefix',
      pageKey: 'print-center',
      menuPath: '/erp/print-center',
    }
  )
})

test('currentNavigationEntry: unregistered URLs use display fallback without granting a page key', () => {
  const result = resolveCurrentNavigationEntry({
    navigationSections,
    locationPath: '/erp/not-a-registered-menu',
  })

  assert.equal(result.matched, false)
  assert.equal(result.matchType, 'fallback')
  assert.equal(result.pageKey, '')
  assert.equal(result.menuPath, '')
  assert.equal(result.entry.key, 'global-dashboard')
  assert.equal(result.entry.path, DEFAULT_DESKTOP_ENTRY.path)
})
