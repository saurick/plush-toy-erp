import assert from 'node:assert/strict'
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
    const clone = new FakeNode(this.tagName, this.ownerDocument)
    clone.textContent = this.textContent
    this.attributes.forEach((value, name) => {
      clone.attributes.set(name, value)
    })
    if (deep) {
      this.children.forEach((child) => {
        clone.appendChild(child.cloneNode(true))
      })
    }
    return clone
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

class FakeDocument {
  constructor() {
    this.body = null
    this.activeElement = null
  }

  createElement(tagName) {
    return new FakeNode(tagName, this)
  }
}

function createFakeSnapshotRoot() {
  const documentLike = new FakeDocument()
  const root = documentLike.createElement('html')
  const head = documentLike.createElement('head')
  const body = documentLike.createElement('body')
  const toolbar = documentLike.createElement('div')
  toolbar.setAttribute('class', 'erp-print-shell__toolbar')
  toolbar.textContent = 'toolbar'
  const target = documentLike.createElement('div')
  target.setAttribute('data-server-pdf-root', 'true')
  target.setAttribute('class', 'erp-material-contract-paper')
  target.textContent = 'paper'
  const script = documentLike.createElement('script')
  script.textContent = 'console.log("preview")'
  body.appendChild(toolbar)
  body.appendChild(target)
  body.appendChild(script)
  root.appendChild(head)
  root.appendChild(body)
  return { root, head, body }
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
    timeoutMs: 45_000,
  })
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

test('printPdf: PDF 生成完成后直接写入当前预览窗口', async () => {
  const originalWindow = globalThis.window
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const storage = new Map()
  const writes = []
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
      replace: () => {},
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
    open: () => previewWindow,
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
          reject(new Error('直接写入预览窗口不应等待 IndexedDB 持久化'))
        }, 50)
      }),
    ])

    assert.equal(restoreCalls, 0)
    assert.equal(focusCalls, 1)
    assert.equal(writes[0], 'open')
    assert.match(writes[1], /加工合同 PDF 预览/)
    assert.match(writes[1], /blob:preview-direct/)
    assert.equal(writes[2], 'close')
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
    const blob = new Blob(['pdf'])

    __TEST_ONLY__.writeCachedPdfPreviewBlob(cacheKey, snapshotHTML, blob)

    assert.equal(
      __TEST_ONLY__.readCachedPdfPreviewBlob(cacheKey, snapshotHTML),
      blob
    )
    assert.equal(cacheKey, nextFileNameCacheKey)
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

test('printPdf: 活跃编辑节点存在时跳过后台预热', () => {
  const documentLike = new FakeDocument()
  const body = documentLike.createElement('body')
  const root = documentLike.createElement('div')
  const input = documentLike.createElement('input')
  const contentEditable = documentLike.createElement('span')
  const button = documentLike.createElement('button')
  contentEditable.setAttribute('contenteditable', 'true')
  root.appendChild(input)
  root.appendChild(contentEditable)
  root.appendChild(button)
  body.appendChild(root)
  documentLike.body = body

  documentLike.activeElement = input
  assert.equal(__TEST_ONLY__.shouldSkipPdfPreviewWarmup(root), true)

  documentLike.activeElement = contentEditable
  assert.equal(__TEST_ONLY__.shouldSkipPdfPreviewWarmup(root), true)

  documentLike.activeElement = button
  assert.equal(__TEST_ONLY__.shouldSkipPdfPreviewWarmup(root), false)

  documentLike.activeElement = body
  assert.equal(__TEST_ONLY__.shouldSkipPdfPreviewWarmup(root), false)
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

test('printPdf: SVG 和小图快照不会被误压缩', () => {
  assert.equal(
    __TEST_ONLY__.shouldOptimizeServerPdfImageSource(
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      {
        snapshotMode: 'preview',
      }
    ),
    false
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
      snapshotMode: 'preview',
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

test('printPdf: 预览生成失败时在线预览页展示真实错误', async () => {
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
    assert.match(payload.html, /服务器生成 PDF 超时，请稍后重试。/)
    assert.doesNotMatch(payload.html, /<iframe/)
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})
