import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  buildPrintCenterPath,
  buildPrintWorkspaceDraftStorageKey,
  buildPrintWorkspacePath,
  buildPrintWorkspaceShellURL,
  buildPrintWorkspaceWindowStateStorageKey,
  persistPrintWorkspaceWindowHTML,
  persistPrintWorkspaceWindowState,
  readPrintWorkspaceWindowState,
  resolvePrintWorkspaceStateID,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceDraftMode,
  openPrintWorkspaceWindow,
} from './printWorkspace.js'

test('printWorkspace: 模板打印中心路径可携带模板和 fresh 模式', () => {
  assert.equal(
    buildPrintCenterPath(PROCESSING_CONTRACT_TEMPLATE_KEY, {
      draftMode: PRINT_WORKSPACE_DRAFT_MODE.FRESH,
    }),
    '/erp/print-center?draft=fresh&template=processing-contract'
  )
  assert.equal(
    buildPrintCenterPath(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
      entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
    }),
    '/erp/print-center?source=business&template=material-purchase-contract'
  )
})

test('printWorkspace: 工作台路径可携带 fresh 模式', () => {
  assert.equal(
    buildPrintWorkspacePath(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
      draftMode: PRINT_WORKSPACE_DRAFT_MODE.FRESH,
      stateID: 'window-1',
    }),
    '/erp/print-workspace/material-purchase-contract?draft=fresh&state=window-1'
  )
})

test('printWorkspace: 未显式声明时默认恢复草稿模式，业务入口可单独识别', () => {
  assert.equal(
    resolvePrintWorkspaceDraftMode('?template=processing-contract'),
    PRINT_WORKSPACE_DRAFT_MODE.RESTORE
  )
  assert.equal(
    resolvePrintWorkspaceDraftMode('?draft=fresh'),
    PRINT_WORKSPACE_DRAFT_MODE.FRESH
  )
  assert.equal(
    resolvePrintWorkspaceEntrySource('?template=processing-contract'),
    PRINT_WORKSPACE_ENTRY_SOURCE.MENU
  )
  assert.equal(
    resolvePrintWorkspaceEntrySource(
      '?source=business&template=processing-contract'
    ),
    PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
  )
  assert.equal(
    resolvePrintWorkspaceStateID(
      '?state=window-2&template=processing-contract'
    ),
    'window-2'
  )
})

test('printWorkspace: 壳页 URL、窗口状态 key 与草稿 key 统一收口', () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:4173' },
  }

  try {
    assert.equal(
      buildPrintWorkspaceShellURL('window-3'),
      'http://127.0.0.1:4173/print-window-shell.html?state=window-3'
    )
  } finally {
    globalThis.window = originalWindow
  }

  assert.equal(
    buildPrintWorkspaceWindowStateStorageKey('window-3'),
    '__plush_erp_print_window_state__:window-3'
  )
  assert.equal(
    buildPrintWorkspaceDraftStorageKey(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      'window-3'
    ),
    '__plush_erp_print_workspace_draft__:material-purchase-contract:window-3'
  )
})

test('printWorkspace: 窗口状态持久化后可按 TTL 读取，过期时自动失效', () => {
  const storage = new Map()
  const originalWindow = globalThis.window
  const originalNow = Date.now
  const fakeWindow = {
    localStorage: {
      setItem(key, value) {
        storage.set(key, value)
      },
      getItem(key) {
        return storage.get(key) || null
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
  }

  globalThis.window = fakeWindow
  Date.now = () => 1_000

  try {
    assert.equal(
      persistPrintWorkspaceWindowState('window-4', {
        workspaceURL:
          'http://127.0.0.1:4173/erp/print-workspace/processing-contract?state=window-4',
      }),
      true
    )

    assert.deepEqual(readPrintWorkspaceWindowState('window-4'), {
      version: 1,
      updatedAt: 1_000,
      workspaceURL:
        'http://127.0.0.1:4173/erp/print-workspace/processing-contract?state=window-4',
    })

    Date.now = () => 24 * 60 * 60 * 1000 + 1_001
    assert.equal(readPrintWorkspaceWindowState('window-4'), null)
    assert.equal(
      storage.has(buildPrintWorkspaceWindowStateStorageKey('window-4')),
      false
    )
  } finally {
    Date.now = originalNow
    globalThis.window = originalWindow
  }
})

test('FL_print_workspace_window_snapshot__persists_current_html_snapshot printWorkspace: 工作台可把整窗 HTML 快照落到窗口状态里', async () => {
  const storage = new Map()
  const originalWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      setItem(key, value) {
        storage.set(key, value)
      },
      getItem(key) {
        return storage.get(key) || null
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
  }

  try {
    const saved = await persistPrintWorkspaceWindowHTML('window-6', {
      templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
      workspaceURL:
        'http://127.0.0.1:4173/erp/print-workspace/processing-contract?state=window-6',
      windowHTML: '<!doctype html><html><body>snapshot</body></html>',
    })

    assert.equal(saved, true)
    const payload = readPrintWorkspaceWindowState('window-6')
    assert.equal(payload?.templateKey, PROCESSING_CONTRACT_TEMPLATE_KEY)
    assert.equal(
      payload?.windowHTML,
      '<!doctype html><html><body>snapshot</body></html>'
    )
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: 从打印中心打开时优先走壳页 URL，并落当前窗口状态', () => {
  const storage = new Map()
  const popup = {
    focusCalled: false,
    focus() {
      this.focusCalled = true
    },
  }
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:4173' },
    crypto: {
      randomUUID() {
        return 'window-5'
      },
    },
    localStorage: {
      setItem(key, value) {
        storage.set(key, value)
      },
      getItem(key) {
        return storage.get(key) || null
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
    open(url) {
      popup.openedURL = url
      return popup
    },
  }

  try {
    const openedPopup = openPrintWorkspaceWindow(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      {
        draftMode: PRINT_WORKSPACE_DRAFT_MODE.FRESH,
      }
    )

    assert.equal(openedPopup, popup)
    assert.equal(popup.focusCalled, true)
    assert.equal(
      popup.openedURL,
      'http://127.0.0.1:4173/print-window-shell.html?state=window-5'
    )
    const payload = readPrintWorkspaceWindowState('window-5')
    assert.equal(payload?.version, 1)
    assert.equal(payload?.templateKey, 'material-purchase-contract')
    assert.equal(
      payload?.workspaceURL,
      'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?draft=fresh&state=window-5'
    )
    assert.equal(Number.isFinite(Number(payload?.updatedAt)), true)
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: 业务页打开时会先写入当前窗口专属打印草稿', () => {
  const storage = new Map()
  const popup = {
    focus() {},
  }
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:4173' },
    crypto: {
      randomUUID() {
        return 'business-window-1'
      },
    },
    localStorage: {
      setItem(key, value) {
        storage.set(key, value)
      },
      getItem(key) {
        return storage.get(key) || null
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
    open(url) {
      popup.openedURL = url
      return popup
    },
  }

  const initialDraft = {
    contractNo: 'CG202604240001',
    lines: [{ materialName: '黑色发箍头胶套' }],
  }

  try {
    openPrintWorkspaceWindow(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
      entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
      initialDraft,
    })

    assert.equal(
      popup.openedURL,
      'http://127.0.0.1:4173/print-window-shell.html?state=business-window-1'
    )
    assert.deepEqual(
      JSON.parse(
        storage.get(
          buildPrintWorkspaceDraftStorageKey(
            MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
            'business-window-1'
          )
        )
      ),
      initialDraft
    )
    assert.equal(
      readPrintWorkspaceWindowState('business-window-1')?.workspaceURL,
      'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?source=business&state=business-window-1'
    )
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: 业务页弹窗被拦截时会清理本次临时打印草稿', () => {
  const storage = new Map()
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:4173' },
    crypto: {
      randomUUID() {
        return 'blocked-window-1'
      },
    },
    localStorage: {
      setItem(key, value) {
        storage.set(key, value)
      },
      getItem(key) {
        return storage.get(key) || null
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
    open() {
      return null
    },
  }

  try {
    assert.throws(
      () =>
        openPrintWorkspaceWindow(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
          entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
          initialDraft: { contractNo: 'CG202604240003' },
        }),
      /浏览器拦截了弹窗/
    )
    assert.equal(
      storage.has(
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'blocked-window-1'
        )
      ),
      false
    )
  } finally {
    globalThis.window = originalWindow
  }
})
