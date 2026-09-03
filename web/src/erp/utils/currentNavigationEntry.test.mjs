import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_DESKTOP_ENTRY,
  resolveCurrentNavigationEntry,
  resolveDesktopHomeEntry,
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

test('currentNavigationEntry: desktop home prefers workbench and falls back to the first visible page', () => {
  const reorderedSections = [
    {
      title: '系统管理',
      items: [
        navigationSections[0].items[1],
        navigationSections[0].items[0],
      ],
    },
  ]
  assert.equal(
    resolveDesktopHomeEntry({ navigationSections: reorderedSections }).path,
    DEFAULT_DESKTOP_ENTRY.path
  )

  const permissionCenter = {
    key: 'permission-center',
    path: '/erp/system/permissions',
    label: '权限管理',
  }
  assert.equal(
    resolveDesktopHomeEntry({
      navigationSections: [{ title: '系统管理', items: [permissionCenter] }],
    }),
    permissionCenter
  )
  assert.equal(resolveDesktopHomeEntry(), DEFAULT_DESKTOP_ENTRY)
})
