import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockAdminSessionToken } from '../../../scripts/mockAdminSessionToken.mjs'
import { getPrintWorkspaceDraftScope } from './printWorkspaceScope.mjs'

import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  buildPrintCenterPath,
  buildPrintWorkspaceDraftStorageKey,
  buildPrintWorkspacePath,
  buildRestorablePrintWorkspaceURL,
  persistPrintWorkspaceDraftSnapshot,
  readPrintWorkspaceDraftSnapshot,
  readInitialPrintWorkspaceDraftFromWindowName,
  resolvePrintWorkspaceStateID,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceDraftMode,
  resolvePrintWorkspaceCustomerKey,
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

test('printWorkspace: 独立窗口优先使用 URL 明示的客户配置 key', () => {
  assert.equal(
    resolvePrintWorkspaceCustomerKey('?customer_key=yoyoosun', 'product_core'),
    'yoyoosun'
  )
  assert.equal(
    resolvePrintWorkspaceCustomerKey('', 'product_core'),
    'product_core'
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

test('printWorkspace: 可恢复工作台 URL 不保留 fresh 重置模式', () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:4173' },
  }

  try {
    assert.equal(
      buildRestorablePrintWorkspaceURL(
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        {
          draftMode: PRINT_WORKSPACE_DRAFT_MODE.FRESH,
          stateID: 'window-restore-1',
        }
      ),
      'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?state=window-restore-1'
    )
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: 业务打印窗口路径可携带 customer key', () => {
  assert.equal(
    buildPrintWorkspacePath(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
      customerKey: 'yoyoosun',
      entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
      stateID: 'window-1',
    }),
    '/erp/print-workspace/material-purchase-contract?source=business&customer_key=yoyoosun&state=window-1'
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

test('printWorkspace: 草稿 key 统一收口', () => {
  assert.equal(
    buildPrintWorkspaceDraftStorageKey(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      'window-3',
      {
        customerKey: 'yoyoosun',
        accountKey: '42',
        configRevision: 'revision-7',
      }
    ),
    '__plush_erp_print_workspace_draft__:v3:yoyoosun:42:revision-7:material-purchase-contract:window-3'
  )
})

test('printWorkspace: 草稿 key 按客户、账号、配置版本、模板和窗口隔离', () => {
  const firstAccountKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'window-scope',
    {
      customerKey: 'yoyoosun',
      accountKey: '10',
      configRevision: 'revision-1',
    }
  )
  const secondAccountKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'window-scope',
    {
      customerKey: 'yoyoosun',
      accountKey: '11',
      configRevision: 'revision-1',
    }
  )
  const secondCustomerKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'window-scope',
    {
      customerKey: 'reference-customer',
      accountKey: '10',
      configRevision: 'revision-1',
    }
  )
  const secondConfigRevisionKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'window-scope',
    {
      customerKey: 'yoyoosun',
      accountKey: '10',
      configRevision: 'revision-2',
    }
  )

  assert.notEqual(firstAccountKey, secondAccountKey)
  assert.notEqual(firstAccountKey, secondCustomerKey)
  assert.notEqual(firstAccountKey, secondConfigRevisionKey)
})

test('printWorkspace: 缺少已验证账号 ID 时不生成草稿 key 或写入持久化存储', () => {
  const writes = []
  const storage = {
    getItem(key) {
      return key === 'admin_user_id' ? '42' : null
    },
    setItem(key, value) {
      writes.push([key, value])
    },
  }
  const storageKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'missing-account-window',
    {
      customerKey: 'yoyoosun',
      configRevision: 'revision-1',
      windowLike: { localStorage: storage },
    }
  )

  assert.equal(storageKey, '')
  assert.equal(
    persistPrintWorkspaceDraftSnapshot(
      storageKey,
      { contractNo: 'CG-MISSING-ACCOUNT' },
      storage
    ),
    false
  )
  assert.deepEqual(writes, [])
})

test('printWorkspace: 草稿写入 localStorage 满额时不抛异常', () => {
  const storageLike = {
    setItem() {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    },
  }

  assert.equal(
    persistPrintWorkspaceDraftSnapshot(
      '__plush_erp_print_workspace_draft__:material-purchase-contract:quota',
      { contractNo: 'A26022832' },
      storageLike
    ),
    false
  )
})

test('printWorkspace: 草稿只读取当前版本且超过 24 小时自动失效', () => {
  const storage = new Map()
  const originalNow = Date.now
  const storageLike = {
    setItem(key, value) {
      storage.set(key, value)
    },
    getItem(key) {
      return storage.get(key) || null
    },
    removeItem(key) {
      storage.delete(key)
    },
  }
  const storageKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'draft-ttl',
    { customerKey: 'yoyoosun', accountKey: '42' }
  )

  Date.now = () => 1_000
  try {
    assert.equal(
      persistPrintWorkspaceDraftSnapshot(
        storageKey,
        { contractNo: 'CG-001' },
        storageLike
      ),
      true
    )
    assert.deepEqual(readPrintWorkspaceDraftSnapshot(storageKey, storageLike), {
      contractNo: 'CG-001',
    })

    Date.now = () => 24 * 60 * 60 * 1000 + 1_001
    assert.equal(readPrintWorkspaceDraftSnapshot(storageKey, storageLike), null)
    assert.equal(storage.has(storageKey), false)

    storage.set(storageKey, JSON.stringify({ contractNo: 'legacy-draft' }))
    assert.equal(readPrintWorkspaceDraftSnapshot(storageKey, storageLike), null)
    assert.equal(storage.has(storageKey), false)
  } finally {
    Date.now = originalNow
  }
})

test('printWorkspace: 从打印中心打开时直达可恢复工作台 URL，且不保存无作用域窗口快照', () => {
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
      'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?state=window-5'
    )
    assert.equal(storage.size, 0)
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
      customerKey: 'yoyoosun',
      accountKey: '42',
      configRevision: 'revision-7',
    })

    assert.equal(
      popup.openedURL,
      'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?source=business&customer_key=yoyoosun&config_revision=revision-7&state=business-window-1'
    )
    const draftStorageKey = buildPrintWorkspaceDraftStorageKey(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      'business-window-1',
      {
        customerKey: 'yoyoosun',
        accountKey: '42',
        configRevision: 'revision-7',
        windowLike: globalThis.window,
      }
    )
    assert.deepEqual(
      readPrintWorkspaceDraftSnapshot(
        draftStorageKey,
        globalThis.window.localStorage
      ),
      initialDraft
    )
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: localStorage 无法写草稿时使用当前弹窗一次性草稿通道', () => {
  const popup = {
    name: '',
    openedURL: '',
    focusCalled: false,
    location: {
      replace(url) {
        popup.openedURL = url
      },
    },
    focus() {
      this.focusCalled = true
    },
  }
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:4173' },
    crypto: {
      randomUUID() {
        return 'business-window-fallback'
      },
    },
    localStorage: {
      setItem() {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
      getItem() {
        throw new DOMException('storage blocked', 'SecurityError')
      },
      removeItem() {},
    },
    open(url) {
      popup.openedInitialURL = url
      return popup
    },
  }

  const initialDraft = {
    contractNo: 'CG202604240004',
    lines: [{ materialName: '白色毛绒布' }],
  }

  try {
    const openedPopup = openPrintWorkspaceWindow(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        accountKey: '42',
      }
    )

    assert.equal(openedPopup, popup)
    assert.equal(popup.openedInitialURL, 'about:blank')
    assert.equal(popup.focusCalled, true)
    assert.equal(
      popup.openedURL,
      'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?source=business&state=business-window-fallback'
    )
    assert.deepEqual(
      readInitialPrintWorkspaceDraftFromWindowName(
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        'business-window-fallback',
        popup,
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'business-window-fallback',
          { accountKey: '42' }
        )
      ),
      initialDraft
    )
    assert.equal(popup.name, '')
    assert.deepEqual(
      readInitialPrintWorkspaceDraftFromWindowName(
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        'business-window-fallback',
        popup,
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'business-window-fallback',
          { accountKey: '42' }
        )
      ),
      initialDraft,
      'React 初始化和挂载 effect 重复读取时必须保留同一窗口草稿'
    )
    assert.equal(
      persistPrintWorkspaceDraftSnapshot(
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'business-window-fallback',
          { accountKey: '42' }
        ),
        initialDraft,
        {
          setItem() {
            throw new DOMException('quota exceeded', 'QuotaExceededError')
          },
        },
        popup
      ),
      false
    )
    assert.deepEqual(
      readInitialPrintWorkspaceDraftFromWindowName(
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        'business-window-fallback',
        popup,
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'business-window-fallback',
          { accountKey: '42' }
        )
      ),
      initialDraft,
      '持久化仍失败时必须保留初始化桥接缓存'
    )

    const persistedDraft = {
      contractNo: 'CG202604240004-EDITED',
      lines: [{ materialName: '编辑后面料' }],
    }
    const persistedStorage = new Map()
    assert.equal(
      persistPrintWorkspaceDraftSnapshot(
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'business-window-fallback',
          { accountKey: '42' }
        ),
        persistedDraft,
        {
          setItem(key, value) {
            persistedStorage.set(key, value)
          },
        },
        popup
      ),
      true
    )
    assert.equal(
      readInitialPrintWorkspaceDraftFromWindowName(
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        'business-window-fallback',
        popup,
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'business-window-fallback',
          { accountKey: '42' }
        )
      ),
      null,
      '当前草稿成功持久化后，初始化桥接缓存不得遮挡新草稿'
    )
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: 一次性草稿只匹配当前模板和窗口 state', () => {
  const windowLike = {
    name: `__plush_erp_print_initial_draft__:${JSON.stringify({
      version: 1,
      templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      stateID: 'window-name-1',
      draft: { contractNo: 'CG202604240005' },
    })}`,
  }

  assert.equal(
    readInitialPrintWorkspaceDraftFromWindowName(
      PROCESSING_CONTRACT_TEMPLATE_KEY,
      'window-name-1',
      windowLike,
      'account:42'
    ),
    null
  )
  assert.equal(windowLike.name, '')
})

test('printWorkspace: 一次性草稿及初始化缓存不能跨账号恢复', () => {
  const draft = { contractNo: 'account-A-private-contract' }
  const windowLike = {
    name: `__plush_erp_print_initial_draft__:${JSON.stringify({
      version: 1,
      templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      stateID: 'account-isolation',
      storageKey: 'account-A',
      draft,
    })}`,
  }
  assert.equal(
    readInitialPrintWorkspaceDraftFromWindowName(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      'account-isolation',
      windowLike,
      'account-B'
    ),
    null
  )
  assert.equal(windowLike.name, '')
  windowLike.name = `__plush_erp_print_initial_draft__:${JSON.stringify({
    version: 1,
    templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    stateID: 'account-isolation',
    storageKey: 'account-A',
    draft,
  })}`
  assert.deepEqual(
    readInitialPrintWorkspaceDraftFromWindowName(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      'account-isolation',
      windowLike,
      'account-A'
    ),
    draft
  )
  assert.equal(
    readInitialPrintWorkspaceDraftFromWindowName(
      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      'account-isolation',
      windowLike,
      'account-B'
    ),
    null
  )
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
          accountKey: '42',
        }),
      /浏览器拦截了弹窗/
    )
    assert.equal(
      storage.has(
        buildPrintWorkspaceDraftStorageKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
          'blocked-window-1',
          { accountKey: '42' }
        )
      ),
      false
    )
  } finally {
    globalThis.window = originalWindow
  }
})

test('printWorkspace: 独立窗口保留来源配置版本并只使用当前会话账号恢复草稿', () => {
  const previousWindow = globalThis.window
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  )
  const store = new Map([
    ['admin_access_token', createMockAdminSessionToken({ userID: 42 })],
    ['admin_user_id', '999'],
  ])
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  globalThis.window = {
    location: { origin: 'http://127.0.0.1' },
    localStorage: storage,
  }
  try {
    const scope = {
      customerKey: 'yoyoosun',
      accountKey: '42',
      configRevision: 'revision-7',
    }
    const templateKey = MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
    const stateID = 'scope-window'
    const url = new URL(
      buildRestorablePrintWorkspaceURL(templateKey, { ...scope, stateID })
    )
    const restored = getPrintWorkspaceDraftScope(url.searchParams)
    assert.deepEqual(restored, scope)
    const sourceKey = buildPrintWorkspaceDraftStorageKey(
      templateKey,
      stateID,
      scope
    )
    const restoredKey = buildPrintWorkspaceDraftStorageKey(
      templateKey,
      stateID,
      restored
    )
    assert.equal(sourceKey, restoredKey)
    persistPrintWorkspaceDraftSnapshot(
      sourceKey,
      { contractNo: 'source-order' },
      storage
    )
    assert.deepEqual(readPrintWorkspaceDraftSnapshot(restoredKey, storage), {
      contractNo: 'source-order',
    })

    store.set('admin_access_token', createMockAdminSessionToken({ userID: 43 }))
    const nextAccount = getPrintWorkspaceDraftScope(url.searchParams)
    assert.equal(nextAccount.accountKey, '43')
    assert.equal(
      readPrintWorkspaceDraftSnapshot(
        buildPrintWorkspaceDraftStorageKey(templateKey, stateID, nextAccount),
        storage
      ),
      null
    )

    store.delete('admin_access_token')
    url.searchParams.set('account_key', '42')
    const anonymous = getPrintWorkspaceDraftScope(url.searchParams)
    assert.equal(anonymous.accountKey, '')
    assert.equal(
      buildPrintWorkspaceDraftStorageKey(templateKey, stateID, anonymous),
      ''
    )
  } finally {
    globalThis.window = previousWindow
    if (previousStorage) {
      Object.defineProperty(globalThis, 'localStorage', previousStorage)
    } else {
      delete globalThis.localStorage
    }
  }
})
