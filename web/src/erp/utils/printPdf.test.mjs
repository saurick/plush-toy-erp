import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { __TEST_ONLY__, openPdfPreviewWindowFromBlob } from './printPdf.mjs'

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toLowerCase()
    this.ownerDocument = ownerDocument
    this.attributes = new Map()
    this.children = []
    this.parentNode = null
    this.textContent = ''
    this.style = {}
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value))
  }

  getAttribute(name) {
    return this.attributes.has(String(name))
      ? this.attributes.get(String(name))
      : null
  }

  removeAttribute(name) {
    this.attributes.delete(String(name))
  }

  get classList() {
    const readClassNames = () =>
      String(this.attributes.get('class') || '')
        .split(/\s+/)
        .filter(Boolean)
    const writeClassNames = (classNames) => {
      if (classNames.length > 0) {
        this.attributes.set('class', classNames.join(' '))
      } else {
        this.attributes.delete('class')
      }
    }
    return {
      remove: (...classNames) => {
        const toRemove = new Set(
          classNames.map((className) => String(className))
        )
        writeClassNames(
          readClassNames().filter((className) => !toRemove.has(className))
        )
      },
    }
  }

  appendChild(child) {
    if (!child) {
      return null
    }
    child.parentNode = this
    this.children.push(child)
    return child
  }

  replaceChildren(...nextChildren) {
    this.children.forEach((child) => {
      child.parentNode = null
    })
    this.children = []
    nextChildren.forEach((child) => {
      if (!child) {
        return
      }
      child.parentNode = this
      this.children.push(child)
    })
  }

  remove() {
    if (!this.parentNode) {
      return
    }
    this.parentNode.children = this.parentNode.children.filter(
      (child) => child !== this
    )
    this.parentNode = null
  }

  contains(node) {
    if (node === this) {
      return true
    }
    return this.children.some((child) => child.contains(node))
  }

  cloneNode(deep = false) {
    return cloneFakeNodeForDocument(this, this.ownerDocument, deep)
  }

  matchesSelector(selector) {
    if (!selector) {
      return false
    }
    if (selector.startsWith('.')) {
      const className = selector.slice(1)
      const current = String(this.attributes.get('class') || '')
      return current.split(/\s+/).includes(className)
    }
    const attributeMatch = selector.match(/^\[([^=\]]+)="([^"]*)"\]$/)
    if (attributeMatch) {
      return this.attributes.get(attributeMatch[1]) === attributeMatch[2]
    }
    const attributeExistsMatch = selector.match(/^\[([^=\]]+)\]$/)
    if (attributeExistsMatch) {
      return this.attributes.has(attributeExistsMatch[1])
    }
    return this.tagName === selector.toLowerCase()
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matchesSelector(selector)) {
        return child
      }
      const nested = child.querySelector(selector)
      if (nested) {
        return nested
      }
    }
    return null
  }

  querySelectorAll(selector) {
    const matches = []
    for (const child of this.children) {
      if (child.matchesSelector(selector)) {
        matches.push(child)
      }
      matches.push(...child.querySelectorAll(selector))
    }
    return matches
  }

  get outerHTML() {
    const attributes = Array.from(this.attributes.entries())
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('')
    const childrenHTML = this.children.map((child) => child.outerHTML).join('')
    return `<${this.tagName}${attributes}>${this.textContent}${childrenHTML}</${this.tagName}>`
  }
}

function cloneFakeNodeForDocument(node, ownerDocument, deep = false) {
  const clone = new FakeNode(node.tagName, ownerDocument)
  clone.textContent = node.textContent
  node.attributes.forEach((value, name) => {
    clone.attributes.set(name, value)
  })
  if (deep) {
    node.children.forEach((child) => {
      clone.appendChild(cloneFakeNodeForDocument(child, ownerDocument, true))
    })
  }
  return clone
}

class FakeDocument {
  constructor({ withRoot = false } = {}) {
    this.body = null
    this.head = null
    this.documentElement = null
    this.activeElement = null
    this.styleSheets = []
    this.implementation = {
      createHTMLDocument: () => new FakeDocument({ withRoot: true }),
    }

    if (withRoot) {
      this.documentElement = this.createElement('html')
      this.head = this.createElement('head')
      this.body = this.createElement('body')
      this.documentElement.appendChild(this.head)
      this.documentElement.appendChild(this.body)
    }
  }

  createElement(tagName) {
    return new FakeNode(tagName, this)
  }

  importNode(node, deep = false) {
    return cloneFakeNodeForDocument(node, this, deep)
  }
}

function createFakeSnapshotRoot() {
  const documentLike = new FakeDocument()
  documentLike.styleSheets = [
    {
      href: 'http://127.0.0.1:4173/assets/app.css',
      cssRules: [
        {
          cssText: '.erp-dashboard-card { color: red; }',
        },
        {
          cssText: '.erp-material-contract-paper { width: 210mm; }',
        },
        {
          cssText:
            '.erp-material-contract-table th { border: 1px solid #111827; }',
        },
        {
          cssText:
            '.erp-engineering-print-paper { box-sizing: border-box; width: 210mm; padding: 12mm 10mm; }',
        },
        {
          cssText: '.erp-material-detail-paper { padding: 10mm 2.5mm; }',
        },
        {
          cssText:
            '.erp-color-card-paper__sheet { grid-template-columns: minmax(0, 1fr) 5.5mm minmax(0, 1fr); }',
        },
        {
          cssText:
            '.erp-work-instruction-paper__sheet { width: 100%; table-layout: fixed; }',
        },
        {
          cssText:
            '@media print { .erp-material-contract-paper { box-shadow: none; } .erp-engineering-print-paper { margin: 0 auto; } .erp-sidebar-panel { display: none; } }',
          conditionText: 'print',
          cssRules: [
            {
              cssText: '.erp-material-contract-paper { box-shadow: none; }',
            },
            {
              cssText: '.erp-engineering-print-paper { margin: 0 auto; }',
            },
            {
              cssText: '.erp-sidebar-panel { display: none; }',
            },
          ],
        },
      ],
    },
  ]
  const root = documentLike.createElement('html')
  const head = documentLike.createElement('head')
  const body = documentLike.createElement('body')
  const stylesheet = documentLike.createElement('link')
  stylesheet.setAttribute('rel', 'stylesheet')
  stylesheet.setAttribute('crossorigin', '')
  stylesheet.setAttribute('href', '/assets/app.css')
  const modulePreload = documentLike.createElement('link')
  modulePreload.setAttribute('rel', 'modulepreload')
  modulePreload.setAttribute('crossorigin', '')
  modulePreload.setAttribute('href', '/assets/vendor.js')
  const toolbar = documentLike.createElement('div')
  toolbar.setAttribute('class', 'erp-print-shell__toolbar')
  toolbar.textContent = 'toolbar'
  const target = documentLike.createElement('div')
  target.setAttribute('data-server-pdf-root', 'true')
  target.setAttribute('class', 'erp-material-contract-paper')
  target.textContent = 'paper'
  const script = documentLike.createElement('script')
  script.textContent = 'console.log("preview")'
  head.appendChild(stylesheet)
  head.appendChild(modulePreload)
  body.appendChild(toolbar)
  body.appendChild(target)
  body.appendChild(script)
  root.appendChild(head)
  root.appendChild(body)
  documentLike.documentElement = root
  documentLike.head = head
  documentLike.body = body
  return { root, head, body }
}

function createFakeSourceDocumentForMinimalSnapshot() {
  const documentLike = new FakeDocument({ withRoot: true })
  documentLike.documentElement.setAttribute('lang', 'zh-CN')
  const toolbar = documentLike.createElement('div')
  toolbar.setAttribute('class', 'erp-print-shell__toolbar')
  toolbar.textContent = 'toolbar'
  const sidePanel = documentLike.createElement('aside')
  sidePanel.setAttribute('class', 'erp-print-shell__panel')
  sidePanel.textContent = 'record panel'
  const target = documentLike.createElement('section')
  target.setAttribute('class', 'erp-material-contract-paper')
  target.textContent = 'paper only'
  documentLike.body.appendChild(toolbar)
  documentLike.body.appendChild(sidePanel)
  documentLike.body.appendChild(target)
  return { documentLike, target }
}

test('printPdf: 预览壳页在未生成 PDF 时展示加载状态', () => {
  const html = __TEST_ONLY__.buildPdfPreviewWindowHTML({
    title: '采购合同 PDF 预览',
  })

  assert.match(html, /采购合同 PDF 预览/)
  assert.match(html, /正在生成 PDF 预览/)
  assert.doesNotMatch(html, /<iframe/)
})

test('printPdf: 预览壳页在生成 PDF 后切换为 iframe 预览', () => {
  const html = __TEST_ONLY__.buildPdfPreviewWindowHTML({
    title: '加工合同 PDF 预览',
    pdfURL: 'blob:processing-preview',
  })

  assert.match(html, /加工合同 PDF 预览/)
  assert.match(html, /blob:processing-preview/)
  assert.match(html, /<iframe/)
})

test('printPdf: 服务端 PDF 请求参数默认收口到统一格式', () => {
  const normalized = __TEST_ONLY__.normalizeServerPdfRequestOptions({
    title: '加工合同 PDF 预览',
    templateKey: 'processing-contract',
  })

  assert.deepEqual(normalized, {
    title: '加工合同 PDF 预览',
    fileName: 'print-template.pdf',
    templateKey: 'processing-contract',
    customerKey: '',
    timeoutMs: 45_000,
  })
})

test('printPdf: 服务端 PDF 请求参数携带客户配置 key', () => {
  const normalized = __TEST_ONLY__.normalizeServerPdfRequestOptions({
    title: '采购合同 PDF 预览',
    fileName: 'PO-001.pdf',
    templateKey: 'material-purchase-contract',
    customerKey: 'yoyoosun',
  })

  assert.equal(normalized.title, '采购合同 PDF 预览')
  assert.equal(normalized.fileName, 'PO-001.pdf')
  assert.equal(normalized.templateKey, 'material-purchase-contract')
  assert.equal(normalized.customerKey, 'yoyoosun')
})

test('printPdf: 服务端 PDF 错误按状态码生成用户可读文案', () => {
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 401 }),
    '登录已失效，请刷新页面后重试。'
  )
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 403 }),
    '当前账号不能生成 PDF，请联系管理员。'
  )
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 408 }),
    '服务器生成 PDF 超时，请稍后重试。'
  )
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 504 }),
    '服务器生成 PDF 超时，请稍后重试。'
  )
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 413 }),
    '打印内容过大，请减少图片或附件后重试。'
  )
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 429 }),
    'PDF 生成请求过多，请稍后重试。'
  )
  assert.equal(
    __TEST_ONLY__.getServerPdfErrorMessage({ status: 500 }),
    '服务器生成 PDF 失败，请稍后重试。'
  )
})

test('printPdf: 服务端 PDF 错误不会透传 JSON 或文本正文', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  let jsonReadCount = 0
  let textReadCount = 0

  globalThis.localStorage = {
    getItem: (key) =>
      String(key) === 'admin_access_token' ? 'admin-token-for-test' : '',
  }
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  }
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    headers: {
      get: () => 'application/json',
    },
    json: async () => {
      jsonReadCount += 1
      return {
        message:
          'template_key invalid: material-purchase-contract owner_role_key=warehouse',
      }
    },
    text: async () => {
      textReadCount += 1
      return 'pq: relation customer_config_revisions does not exist'
    },
  })

  try {
    await assert.rejects(
      () =>
        __TEST_ONLY__.requestServerPdfBlob('<html>PDF</html>', {
          title: '采购合同 PDF 预览',
          templateKey: 'material-purchase-contract',
        }),
      (error) => {
        assert.equal(error?.message, '服务器生成 PDF 失败，请稍后重试。')
        assert.doesNotMatch(error?.message || '', /template_key|owner_role_key/)
        assert.doesNotMatch(error?.message || '', /customer_config_revisions/)
        return true
      }
    )
    assert.equal(jsonReadCount, 0)
    assert.equal(textReadCount, 0)
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
    if (typeof originalFetch === 'undefined') {
      delete globalThis.fetch
    } else {
      globalThis.fetch = originalFetch
    }
    if (typeof originalLocalStorage === 'undefined') {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = originalLocalStorage
    }
  }
})

test('printPdf: 服务端 PDF payload 不允许客户端选择客户或资源基址', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  let payload = null

  globalThis.localStorage = {
    getItem: (key) =>
      String(key) === 'admin_access_token' ? 'admin-token-for-test' : '',
  }
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  }
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(String(options?.body || '{}'))
    return {
      ok: true,
      blob: async () => new Blob(['pdf']),
    }
  }

  try {
    const blob = await __TEST_ONLY__.requestServerPdfBlob('<html>PDF</html>', {
      title: '采购合同 PDF 预览',
      fileName: 'PO-001.pdf',
      templateKey: 'material-purchase-contract',
      customerKey: 'yoyoosun',
    })

    assert.equal(blob.size, 3)
    assert.equal(Object.hasOwn(payload, 'customer_key'), false)
    assert.equal(Object.hasOwn(payload, 'base_url'), false)
    assert.equal(payload?.template_key, 'material-purchase-contract')
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
    if (typeof originalFetch === 'undefined') {
      delete globalThis.fetch
    } else {
      globalThis.fetch = originalFetch
    }
    if (typeof originalLocalStorage === 'undefined') {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = originalLocalStorage
    }
  }
})

test('printPdf: 预览壳页 URL 与本地状态 key 统一收口', () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
  }

  try {
    assert.equal(
      __TEST_ONLY__.buildPdfPreviewStateStorageKey('preview-1'),
      '__plush_erp_pdf_preview_state__preview-1'
    )
    assert.equal(
      __TEST_ONLY__.buildPdfPreviewShellURL('preview-1'),
      'http://127.0.0.1:4173/pdf-preview-shell.html?state=preview-1'
    )
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: PDF 预览状态优先落 IndexedDB，localStorage 满额时仍可恢复', async () => {
  const originalWindow = globalThis.window
  const records = new Map()
  const fakeDatabase = {
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore: () => {},
    close: () => {},
    transaction: () => {
      const transaction = {
        objectStore: () => ({
          put: (record) => {
            const request = {}
            queueMicrotask(() => {
              records.set(record.stateID, record)
              request.onsuccess?.()
              transaction.oncomplete?.()
            })
            return request
          },
        }),
      }
      return transaction
    },
  }

  globalThis.window = {
    indexedDB: {
      open: () => {
        const request = {
          result: fakeDatabase,
        }
        queueMicrotask(() => {
          request.onsuccess?.()
        })
        return request
      },
    },
    localStorage: {
      setItem: () => {
        throw new Error('quota exceeded')
      },
    },
  }

  try {
    const saved = await __TEST_ONLY__.persistPdfPreviewHTML(
      'preview-idb-1',
      '<!doctype html><html><body>PDF</body></html>'
    )

    assert.equal(saved, true)
    assert.equal(records.size, 1)
    assert.equal(records.get('preview-idb-1')?.version, 1)
    assert.match(records.get('preview-idb-1')?.html || '', /PDF/)
  } finally {
    __TEST_ONLY__.resetPdfPreviewStateDatabaseForTest()
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: PDF 预览结果会先同步写入 localStorage，避免壳页一直等待 IndexedDB', () => {
  const originalWindow = globalThis.window
  const storage = new Map()

  globalThis.window = {
    indexedDB: {
      open: () => ({}),
    },
    localStorage: {
      setItem: (key, value) => {
        storage.set(String(key), String(value))
      },
    },
  }

  try {
    __TEST_ONLY__
      .persistPdfPreviewHTML(
        'preview-local-first',
        '<!doctype html><html><body>PDF 已生成</body></html>'
      )
      .catch(() => {})

    assert.equal(storage.size, 1)
    const payload = JSON.parse(Array.from(storage.values())[0])
    assert.equal(payload.stateID, 'preview-local-first')
    assert.match(payload.html, /PDF 已生成/)
  } finally {
    __TEST_ONLY__.resetPdfPreviewStateDatabaseForTest()
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: PDF 预览壳页恢复时优先读取 localStorage，再回退 IndexedDB', async () => {
  const shellHTML = await readFile(
    new URL('../../../public/pdf-preview-shell.html', import.meta.url),
    'utf8'
  )
  const storageReadIndex = shellHTML.indexOf(
    'const storageHTML = readPersistedHTMLFromStorage()'
  )
  const indexedDBReadIndex = shellHTML.indexOf(
    'return readPersistedHTMLFromIndexedDB()'
  )

  assert.ok(storageReadIndex > 0)
  assert.ok(indexedDBReadIndex > storageReadIndex)
})

test('printPdf: PDF 生成完成后直接写入已打开的预览标签', async () => {
  const originalWindow = globalThis.window
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const storage = new Map()
  const writes = []
  const replacements = []
  let openArgs = []
  let restoreCalls = 0
  let focusCalls = 0
  const previewWindow = {
    closed: false,
    restorePlushErpPdfPreviewShell: () => {
      restoreCalls += 1
    },
    focus: () => {
      focusCalls += 1
    },
    document: {
      open: () => {
        writes.push('open')
      },
      write: (html) => {
        writes.push(String(html))
      },
      close: () => {
        writes.push('close')
      },
    },
    location: {
      replace: (url) => {
        replacements.push(String(url))
      },
    },
  }

  URL.createObjectURL = () => 'blob:preview-direct'
  URL.revokeObjectURL = () => {}
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
    indexedDB: {
      open: () => ({}),
    },
    localStorage: {
      setItem: (key, value) => {
        storage.set(String(key), String(value))
      },
      getItem: (key) => storage.get(String(key)) || null,
    },
    open: (...args) => {
      openArgs = args
      return previewWindow
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  }

  try {
    await Promise.race([
      openPdfPreviewWindowFromBlob(async () => new Blob(['preview']), {
        title: '加工合同 PDF 预览',
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('预览壳页恢复不应等待 IndexedDB 持久化'))
        }, 50)
      }),
    ])

    assert.equal(restoreCalls, 0)
    assert.equal(focusCalls, 1)
    assert.equal(openArgs.length, 2)
    assert.match(openArgs[0], /\/pdf-preview-shell\.html\?state=/)
    assert.equal(openArgs[1], '_blank')
    assert.equal(writes.length, 3)
    assert.equal(writes[0], 'open')
    assert.match(writes[1], /加工合同 PDF 预览/)
    assert.match(writes[1], /blob:preview-direct/)
    assert.equal(writes[2], 'close')
    assert.equal(replacements.length, 0)
    assert.equal(storage.size, 0)
  } finally {
    __TEST_ONLY__.resetPdfPreviewStateDatabaseForTest()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: 快照提交等待在预览弹窗聚焦后不会永久等待 rAF', async () => {
  const timers = []
  let animationFrameRequested = false
  let resolved = false
  const throttledWindow = {
    requestAnimationFrame: () => {
      animationFrameRequested = true
    },
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms })
      return timers.length
    },
    clearTimeout: () => {},
  }

  const waitPromise = __TEST_ONLY__
    .waitForSnapshotCommit(throttledWindow)
    .then(() => {
      resolved = true
    })

  await Promise.resolve()
  assert.equal(animationFrameRequested, true)
  assert.equal(resolved, false)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 80)

  timers[0].callback()
  await waitPromise
  assert.equal(resolved, true)
})

test('printPdf: 预览 PDF 缓存只命中完全相同快照', () => {
  const originalWindow = globalThis.window
  __TEST_ONLY__.resetPdfPreviewBlobCacheForTest()
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
  }

  try {
    const snapshotHTML = '<!doctype html><html><body>加工合同</body></html>'
    const changedSnapshotHTML =
      '<!doctype html><html><body>加工合同-已修改</body></html>'
    const options = {
      title: '加工合同 PDF 预览',
      fileName: 'processing-contract.pdf',
      templateKey: 'processing-contract',
    }
    const cacheKey = __TEST_ONLY__.buildPdfPreviewBlobCacheKey(
      snapshotHTML,
      options
    )
    const changedCacheKey = __TEST_ONLY__.buildPdfPreviewBlobCacheKey(
      changedSnapshotHTML,
      options
    )
    const nextFileNameCacheKey = __TEST_ONLY__.buildPdfPreviewBlobCacheKey(
      snapshotHTML,
      {
        ...options,
        fileName: 'processing-contract_next.pdf',
      }
    )
    const nextCustomerCacheKey = __TEST_ONLY__.buildPdfPreviewBlobCacheKey(
      snapshotHTML,
      {
        ...options,
        customerKey: 'yoyoosun',
      }
    )
    const blob = new Blob(['pdf'])

    __TEST_ONLY__.writeCachedPdfPreviewBlob(cacheKey, snapshotHTML, blob)

    assert.equal(
      __TEST_ONLY__.readCachedPdfPreviewBlob(cacheKey, snapshotHTML),
      blob
    )
    assert.equal(cacheKey, nextFileNameCacheKey)
    assert.notEqual(cacheKey, nextCustomerCacheKey)
    assert.notEqual(cacheKey, changedCacheKey)
    assert.equal(
      __TEST_ONLY__.readCachedPdfPreviewBlob(cacheKey, changedSnapshotHTML),
      null
    )
  } finally {
    __TEST_ONLY__.resetPdfPreviewBlobCacheForTest()
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: 相同预览快照的并发请求复用同一个渲染结果', async () => {
  const originalWindow = globalThis.window
  __TEST_ONLY__.resetPdfPreviewBlobCacheForTest()
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
  }

  try {
    const snapshotHTML = '<!doctype html><html><body>采购合同</body></html>'
    const options = {
      title: '采购合同 PDF 预览',
      templateKey: 'material-purchase-contract',
    }
    let requestCount = 0
    const requestBlob = async () => {
      requestCount += 1
      await new Promise((resolve) => {
        setTimeout(resolve, 5)
      })
      return new Blob(['pdf'])
    }

    const [firstBlob, secondBlob] = await Promise.all([
      __TEST_ONLY__.requestPdfPreviewBlobWithCache(
        snapshotHTML,
        options,
        requestBlob
      ),
      __TEST_ONLY__.requestPdfPreviewBlobWithCache(
        snapshotHTML,
        options,
        requestBlob
      ),
    ])
    const cachedBlob = await __TEST_ONLY__.requestPdfPreviewBlobWithCache(
      snapshotHTML,
      options,
      requestBlob
    )

    assert.equal(requestCount, 1)
    assert.equal(firstBlob, secondBlob)
    assert.equal(cachedBlob, firstBlob)
  } finally {
    __TEST_ONLY__.resetPdfPreviewBlobCacheForTest()
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: 仅预览模式会对大图快照开启降载', () => {
  assert.deepEqual(__TEST_ONLY__.normalizeServerPdfSnapshotOptions(), {
    snapshotMode: '',
  })
  assert.deepEqual(
    __TEST_ONLY__.normalizeServerPdfSnapshotOptions({
      snapshotMode: 'preview',
    }),
    { snapshotMode: 'preview' }
  )

  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource(
      `data:image/jpeg;base64,${'a'.repeat(200_000)}`,
      {
        snapshotMode: 'preview',
      }
    ),
    true
  )
  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource(
      `data:image/jpeg;base64,${'a'.repeat(200_000)}`,
      {
        snapshotMode: 'download',
      }
    ),
    false
  )
})

test('printPdf: SVG 与外链图片始终先本地栅格化，小型内嵌位图保持原样', () => {
  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource(
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      {
        snapshotMode: 'preview',
      }
    ),
    true
  )
  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource(
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      {
        snapshotMode: 'download',
      }
    ),
    true
  )
  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource(
      `data:image/jpeg;base64,${'a'.repeat(120_000)}`,
      {
        snapshotMode: 'preview',
      }
    ),
    false
  )
  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource('/uploads/paper.jpg', {
      snapshotMode: 'download',
    }),
    true
  )
})

test('printPdf: 服务端 PDF 快照会收口到纸面主区域并追加打印态覆盖', () => {
  const { root, head, body } = createFakeSnapshotRoot()

  assert.equal(
    __TEST_ONLY__.buildServerPdfTargetSelector(),
    '[data-server-pdf-root="true"]'
  )
  assert.equal(__TEST_ONLY__.isolateServerPdfSnapshotToTarget(root), true)
  __TEST_ONLY__.applyServerPdfLayoutOverrides(root)

  assert.equal(
    body.outerHTML,
    '<body><div data-server-pdf-root="true" class="erp-material-contract-paper">paper</div></body>'
  )
  assert.doesNotMatch(body.outerHTML, /toolbar/)
  assert.match(head.outerHTML, /data-server-pdf-style="true"/)
  assert.match(head.outerHTML, /\.erp-material-contract-paper/)
  assert.match(head.outerHTML, /width: 210mm !important/)
  assert.match(head.outerHTML, /max-width: 210mm !important/)
  assert.match(head.outerHTML, /margin: 0 !important/)
  assert.doesNotMatch(head.outerHTML, /margin: 0 auto !important/)
})

test('printPdf: 服务端 PDF 最小快照只克隆纸面目标区域', () => {
  const { target } = createFakeSourceDocumentForMinimalSnapshot()

  const root = __TEST_ONLY__.createMinimalServerPdfSnapshotRoot(target)

  assert.ok(root)
  assert.match(root.outerHTML, /lang="zh-CN"/)
  assert.match(root.outerHTML, /paper only/)
  assert.match(root.outerHTML, /data-server-pdf-root="true"/)
  assert.doesNotMatch(root.outerHTML, /toolbar/)
  assert.doesNotMatch(root.outerHTML, /record panel/)
})

test('printPdf: 服务端 PDF 快照固定为浅色纸面口径', () => {
  const { root, head, body } = createFakeSnapshotRoot()
  const target = body.querySelector('[data-server-pdf-root="true"]')
  root.setAttribute('data-erp-theme', 'dark')
  root.setAttribute('data-erp-theme-mode', 'system')
  body.setAttribute('data-erp-theme', 'dark')
  target.setAttribute(
    'class',
    'erp-material-contract-paper erp-print-shell--preparing erp-material-contract-table__row-selected'
  )
  target.setAttribute('contenteditable', 'true')
  target.setAttribute('spellcheck', 'false')
  target.setAttribute('tabindex', '0')
  const editor = root.ownerDocument.createElement('input')
  editor.setAttribute('accept', 'image/*')
  editor.setAttribute('autocomplete', 'off')
  editor.setAttribute('inputmode', 'decimal')
  target.appendChild(editor)

  assert.equal(
    __TEST_ONLY__.inlineServerPdfStylesheets(root, root.ownerDocument),
    true
  )
  const inlineStyle = head.querySelector(
    '[data-server-pdf-inline-styles="true"]'
  )
  assert.match(inlineStyle.textContent, /width: 210mm/)
  assert.match(inlineStyle.textContent, /erp-engineering-print-paper/)
  assert.match(inlineStyle.textContent, /box-sizing: border-box/)
  assert.match(inlineStyle.textContent, /erp-material-detail-paper/)
  assert.match(inlineStyle.textContent, /erp-color-card-paper__sheet/)
  assert.match(inlineStyle.textContent, /erp-work-instruction-paper__sheet/)
  assert.match(inlineStyle.textContent, /border: 1px solid #111827/)
  assert.match(inlineStyle.textContent, /@media print/)
  assert.match(inlineStyle.textContent, /box-shadow: none/)
  assert.match(inlineStyle.textContent, /margin: 0 auto/)
  assert.doesNotMatch(inlineStyle.textContent, /erp-dashboard-card/)
  assert.doesNotMatch(inlineStyle.textContent, /erp-sidebar-panel/)
  assert.doesNotMatch(inlineStyle.textContent, /127\.0\.0\.1|https?:/)

  __TEST_ONLY__.normalizeServerPdfSnapshotRuntimeState(root)
  assert.equal(root.getAttribute('data-erp-theme'), 'light')
  assert.equal(root.getAttribute('data-erp-theme-mode'), 'light')
  assert.equal(root.style.colorScheme, 'light')
  assert.equal(body.getAttribute('data-erp-theme'), 'light')
  assert.equal(target.getAttribute('class'), 'erp-material-contract-paper')
  assert.equal(target.getAttribute('contenteditable'), null)
  assert.equal(target.getAttribute('spellcheck'), null)
  assert.equal(target.getAttribute('tabindex'), null)
  assert.equal(editor.getAttribute('accept'), null)
  assert.equal(editor.getAttribute('autocomplete'), null)
  assert.equal(editor.getAttribute('inputmode'), null)
  assert.equal(head.querySelector('link'), null)
  assert.doesNotMatch(head.outerHTML, /modulepreload/)

  assert.equal(__TEST_ONLY__.isolateServerPdfSnapshotToTarget(root), true)
  __TEST_ONLY__.applyServerPdfLayoutOverrides(root)

  assert.match(head.outerHTML, /color-scheme: light !important/)
  assert.match(head.outerHTML, /background: #fff !important/)
  assert.match(head.outerHTML, /overflow: visible !important/)
  assert.match(head.outerHTML, /\[data-server-pdf-root="true"\] \{/)
  assert.match(
    head.outerHTML,
    /margin:\s+0 !important;\n\s{2}width:\s+210mm !important;/
  )
  assert.match(head.outerHTML, /visibility: visible !important/)
  assert.doesNotMatch(body.outerHTML, /erp-print-shell--preparing/)
})

test('printPdf: 预览窗口被拦截时返回统一错误文案', async () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
    open: () => null,
  }

  try {
    await assert.rejects(
      () =>
        openPdfPreviewWindowFromBlob(async () => new Blob(['preview']), {
          title: '测试 PDF 预览',
        }),
      /浏览器拦截了 PDF 预览弹窗，请允许弹窗后重试/
    )
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})

test('printPdf: 预览生成失败时在线预览页展示可执行提示', async () => {
  const originalWindow = globalThis.window
  const storage = new Map()
  let restoreCalls = 0
  let focusCalls = 0
  const previewWindow = {
    closed: false,
    restorePlushErpPdfPreviewShell: () => {
      restoreCalls += 1
    },
    focus: () => {
      focusCalls += 1
    },
    document: {
      open: () => {
        throw new Error('persisted 预览不应直接写入 document')
      },
      write: () => {},
      close: () => {},
    },
    location: {
      replace: () => {},
    },
  }

  globalThis.window = {
    location: {
      origin: 'http://127.0.0.1:4173',
    },
    localStorage: {
      setItem: (key, value) => {
        storage.set(String(key), String(value))
      },
      getItem: (key) => storage.get(String(key)) || null,
    },
    open: () => previewWindow,
    setTimeout: () => 1,
    clearTimeout: () => {},
  }

  try {
    await assert.rejects(
      () =>
        openPdfPreviewWindowFromBlob(
          async () => {
            throw new Error('服务器生成 PDF 超时，请稍后重试。')
          },
          {
            title: '采购合同 PDF 预览',
          }
        ),
      /服务器生成 PDF 超时，请稍后重试。/
    )

    assert.equal(storage.size, 1)
    assert.equal(restoreCalls, 1)
    assert.equal(focusCalls, 1)

    const payload = JSON.parse(Array.from(storage.values())[0])
    assert.match(payload.html, /采购合同 PDF 预览/)
    assert.match(payload.html, /生成 PDF 预览失败，请稍后重试/)
    assert.doesNotMatch(payload.html, /服务器生成 PDF 超时/u)
    assert.doesNotMatch(payload.html, /<iframe/)
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})
