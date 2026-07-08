import { AUTH_SCOPE, getToken } from '../../common/auth/auth.js'
import { getActionErrorMessage } from '../../common/utils/errorMessage.js'

const DEFAULT_PDF_FILE_NAME = 'print-template.pdf'
const DEFAULT_PDF_PREVIEW_TITLE = 'PDF 预览'
const DEFAULT_PDF_PREVIEW_WINDOW_FEATURES = ''
const DEFAULT_PDF_TEMPLATE_KEY = 'print-template'
const PDF_PREVIEW_URL_REVOKE_DELAY_MS = 60_000
const PDF_DOWNLOAD_URL_REVOKE_DELAY_MS = 1_000
const PDF_PREVIEW_AUTO_PRELOAD_DELAY_MS = 250
const PDF_PREVIEW_AUTO_PRELOAD_IDLE_TIMEOUT_MS = 750
const PDF_SNAPSHOT_COMMIT_FALLBACK_TIMEOUT_MS = 80
const PDF_PREVIEW_SHELL_PATH = '/pdf-preview-shell.html'
const PDF_PREVIEW_STATE_STORAGE_KEY_PREFIX = '__plush_erp_pdf_preview_state__'
const PDF_PREVIEW_STATE_VERSION = 1
const PDF_PREVIEW_STATE_DB_NAME = '__plush_erp_pdf_preview_state_db__'
const PDF_PREVIEW_STATE_DB_VERSION = 1
const PDF_PREVIEW_STATE_DB_STORE_NAME = 'states'
const PDF_PREVIEW_SHELL_RESTORE_FUNCTION_NAME = 'restorePlushErpPdfPreviewShell'
const PDF_PREVIEW_BLOB_CACHE_MAX_ENTRIES = 4
const PDF_PREVIEW_BLOB_CACHE_TTL_MS = 5 * 60_000
const SERVER_PDF_RENDER_ROUTE = '/templates/render-pdf'
// 前端等待预算必须覆盖服务端队列等待和 Chromium 渲染，否则客户端会先把仍在执行的请求 abort 掉。
const SERVER_PDF_RENDER_TIMEOUT_MS = 30_000
const SERVER_PDF_QUEUE_WAIT_TIMEOUT_MS = 15_000
const SERVER_PDF_REQUEST_TIMEOUT_MS =
  SERVER_PDF_RENDER_TIMEOUT_MS + SERVER_PDF_QUEUE_WAIT_TIMEOUT_MS
export const PDF_ACTION_UI_STALE_TIMEOUT_MS =
  SERVER_PDF_REQUEST_TIMEOUT_MS + 5_000
const SERVER_PDF_TARGET_ATTRIBUTE = 'data-server-pdf-root'
const SERVER_PDF_PREVIEW_SNAPSHOT_MODE = 'preview'
const PREVIEW_SNAPSHOT_IMAGE_INLINE_TIMEOUT_MS = 8_000
const PREVIEW_SNAPSHOT_IMAGE_MAX_DIMENSION_PX = 960
const PREVIEW_SNAPSHOT_IMAGE_JPEG_QUALITY = 0.72
const PREVIEW_SNAPSHOT_IMAGE_MIN_DATA_URL_LENGTH = 180_000
const SERVER_PDF_SELECTION_CLASS_NAMES = [
  'erp-material-contract-table__row-selected',
  'erp-processing-contract-table__row--selected',
]
const SERVER_PDF_PRINT_PREPARING_CLASS_NAMES = ['erp-print-shell--preparing']
const SERVER_PDF_STYLESHEET_RULE_TOKENS = [
  'data-server-pdf-root',
  'erp-color-card',
  'erp-engineering-print',
  'erp-contract-table',
  'erp-material-contract',
  'erp-material-detail',
  'erp-print-clauses',
  'erp-print-meta-grid',
  'erp-print-paper',
  'erp-print-shell',
  'erp-print-signature',
  'erp-print-table',
  'erp-processing-contract',
  'erp-production-report',
  'erp-summary-sheet',
  'erp-work-instruction',
]
const SERVER_PDF_BASE_STYLE_SELECTORS = new Set([
  'html',
  'body',
  'html, body',
  'body, html',
])

const escapePreviewHTML = (raw) =>
  String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const buildPdfPreviewWindowHTML = ({
  title = DEFAULT_PDF_PREVIEW_TITLE,
  pdfURL = '',
  statusText = '正在生成 PDF 预览...',
} = {}) => {
  const resolvedTitle = String(title || '').trim() || DEFAULT_PDF_PREVIEW_TITLE
  const resolvedPDFURL = String(pdfURL || '').trim()
  const escapedTitle = escapePreviewHTML(resolvedTitle)
  const escapedStatusText = escapePreviewHTML(statusText)

  return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #f5f7fa;
      }

      body {
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .pdf-preview-shell {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
      }

      .pdf-preview-status {
        color: #475569;
        font-size: 14px;
        line-height: 1.6;
        letter-spacing: 0.02em;
      }

      .pdf-preview-frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    ${
      resolvedPDFURL
        ? `<iframe class="pdf-preview-frame" title="${escapedTitle}" src="${escapePreviewHTML(
            resolvedPDFURL
          )}"></iframe>`
        : `<div class="pdf-preview-shell"><div class="pdf-preview-status">${escapedStatusText}</div></div>`
    }
  </body>
</html>
`
}

function normalizeServerPdfRequestOptions(options = {}) {
  const normalizedOptions =
    options && typeof options === 'object' ? options : { fileName: options }

  const title =
    String(normalizedOptions.title || '').trim() || DEFAULT_PDF_PREVIEW_TITLE
  const fileName =
    String(normalizedOptions.fileName || '').trim() || DEFAULT_PDF_FILE_NAME
  const templateKey =
    String(normalizedOptions.templateKey || '').trim() ||
    DEFAULT_PDF_TEMPLATE_KEY
  const customerKey = String(normalizedOptions.customerKey || '').trim()
  const timeoutMs = Number(normalizedOptions.timeoutMs)

  return {
    title,
    fileName,
    templateKey,
    customerKey,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : SERVER_PDF_REQUEST_TIMEOUT_MS,
  }
}

function createPdfPreviewStateID() {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID()
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function buildPdfPreviewStateStorageKey(stateID = '') {
  return `${PDF_PREVIEW_STATE_STORAGE_KEY_PREFIX}${String(stateID || '').trim()}`
}

function buildPdfPreviewStateRecord(stateID, html) {
  const normalizedStateID = String(stateID || '').trim()
  const normalizedHTML = String(html || '')
  if (!normalizedStateID || !normalizedHTML.trim()) {
    return null
  }

  return {
    version: PDF_PREVIEW_STATE_VERSION,
    stateID: normalizedStateID,
    updatedAt: Date.now(),
    html: normalizedHTML,
  }
}

function normalizeServerPdfSnapshotOptions(options = {}) {
  return {
    snapshotMode:
      String(options?.snapshotMode || '').trim() ===
      SERVER_PDF_PREVIEW_SNAPSHOT_MODE
        ? SERVER_PDF_PREVIEW_SNAPSHOT_MODE
        : '',
  }
}

function buildPdfPreviewShellURL(stateID = '') {
  const url = new URL(PDF_PREVIEW_SHELL_PATH, window.location.origin)
  const normalizedStateID = String(stateID || '').trim()
  if (normalizedStateID) {
    url.searchParams.set('state', normalizedStateID)
  }
  return url.toString()
}

let pdfPreviewStateDatabasePromise = null
const pdfPreviewBlobCache = new Map()
const pdfPreviewBlobRequestCache = new Map()

function openPdfPreviewStateDatabase(indexedDBLike) {
  const indexedDB =
    indexedDBLike || (typeof window !== 'undefined' ? window.indexedDB : null)
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    return Promise.resolve(null)
  }
  if (pdfPreviewStateDatabasePromise) {
    return pdfPreviewStateDatabasePromise
  }

  pdfPreviewStateDatabasePromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(
        PDF_PREVIEW_STATE_DB_NAME,
        PDF_PREVIEW_STATE_DB_VERSION
      )
      request.onupgradeneeded = () => {
        const database = request.result
        if (
          !database.objectStoreNames.contains(PDF_PREVIEW_STATE_DB_STORE_NAME)
        ) {
          database.createObjectStore(PDF_PREVIEW_STATE_DB_STORE_NAME, {
            keyPath: 'stateID',
          })
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          try {
            database.close()
          } catch {
            // IndexedDB 关闭失败不影响 localStorage 兜底。
          }
        }
        resolve(database)
      }
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return pdfPreviewStateDatabasePromise
}

function persistPdfPreviewHTMLToStorage(record) {
  if (typeof window === 'undefined' || !window.localStorage || !record) {
    return false
  }

  try {
    window.localStorage.setItem(
      buildPdfPreviewStateStorageKey(record.stateID),
      JSON.stringify(record)
    )
    return true
  } catch {
    return false
  }
}

async function persistPdfPreviewHTMLToIndexedDB(record, indexedDBLike) {
  if (!record) {
    return false
  }
  const database = await openPdfPreviewStateDatabase(indexedDBLike)
  if (!database) {
    return false
  }

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(
        PDF_PREVIEW_STATE_DB_STORE_NAME,
        'readwrite'
      )
      const request = transaction
        .objectStore(PDF_PREVIEW_STATE_DB_STORE_NAME)
        .put(record)
      let settled = false
      const finalize = (saved) => {
        if (settled) {
          return
        }
        settled = true
        resolve(saved)
      }
      request.onsuccess = () => finalize(true)
      request.onerror = () => finalize(false)
      transaction.oncomplete = () => finalize(true)
      transaction.onerror = () => finalize(false)
      transaction.onabort = () => finalize(false)
    } catch {
      resolve(false)
    }
  })
}

async function persistPdfPreviewHTML(stateID, html) {
  const record = buildPdfPreviewStateRecord(stateID, html)
  if (!record) {
    return false
  }

  const savedToStorage = persistPdfPreviewHTMLToStorage(record)
  if (savedToStorage) {
    persistPdfPreviewHTMLToIndexedDB(record).catch(() => {})
    return true
  }

  return persistPdfPreviewHTMLToIndexedDB(record)
}

function resetPdfPreviewStateDatabaseForTest() {
  pdfPreviewStateDatabasePromise = null
}

function restorePdfPreviewShellWindow(previewWindow, previewShellURL) {
  if (!previewWindow || previewWindow.closed) {
    return
  }

  const restoreFromShell =
    previewWindow[PDF_PREVIEW_SHELL_RESTORE_FUNCTION_NAME]
  if (typeof restoreFromShell === 'function') {
    restoreFromShell()
  }
  if (previewWindow.location?.replace) {
    previewWindow.location.replace(previewShellURL)
  } else if (previewWindow.location) {
    previewWindow.location.href = previewShellURL
  }

  previewWindow.focus()
}

function openPdfPreviewShellWindow(previewShellURL, features) {
  const normalizedFeatures = String(features || '').trim()
  if (normalizedFeatures) {
    return window.open(previewShellURL, '_blank', normalizedFeatures)
  }
  return window.open(previewShellURL, '_blank')
}

function writePdfPreviewWindowHTML(previewWindow, html) {
  if (!previewWindow || previewWindow.closed) {
    return false
  }

  try {
    previewWindow.document.open()
    previewWindow.document.write(html)
    previewWindow.document.close()
    previewWindow.focus()
    return true
  } catch {
    return false
  }
}

async function restorePdfPreviewWindowWithPersistence(
  previewWindow,
  previewShellURL,
  previewStateID,
  previewHTML
) {
  if (!previewWindow || previewWindow.closed) {
    return
  }

  const persisted = await persistPdfPreviewHTML(previewStateID, previewHTML)
  if (!persisted) {
    throw new Error('PDF 预览初始化失败，请关闭后重试。')
  }
  restorePdfPreviewShellWindow(previewWindow, previewShellURL)
}

function hashPdfPreviewSnapshotHTML(snapshotHTML) {
  const normalizedHTML = String(snapshotHTML || '')
  const modulus = 4_294_967_296
  let hash = 5381
  for (let index = 0; index < normalizedHTML.length; index += 1) {
    hash = (hash * 33 + normalizedHTML.charCodeAt(index)) % modulus
  }
  return hash.toString(36)
}

function buildPdfPreviewBlobCacheKey(snapshotHTML, options = {}) {
  const { title, templateKey, customerKey } =
    normalizeServerPdfRequestOptions(options)
  const baseURL =
    typeof window !== 'undefined' && window.location
      ? String(window.location.origin || '')
      : ''
  return [
    templateKey,
    title,
    customerKey,
    baseURL,
    String(snapshotHTML || '').length,
    hashPdfPreviewSnapshotHTML(snapshotHTML),
  ].join('\u0001')
}

function readCachedPdfPreviewBlob(cacheKey, snapshotHTML) {
  const entry = pdfPreviewBlobCache.get(cacheKey)
  if (!entry) {
    return null
  }

  const expired = Date.now() - entry.createdAt > PDF_PREVIEW_BLOB_CACHE_TTL_MS
  const snapshotChanged = entry.snapshotHTML !== snapshotHTML
  if (expired || snapshotChanged || !(entry.blob instanceof Blob)) {
    pdfPreviewBlobCache.delete(cacheKey)
    return null
  }

  pdfPreviewBlobCache.delete(cacheKey)
  pdfPreviewBlobCache.set(cacheKey, entry)
  return entry.blob
}

async function requestPdfPreviewBlobWithCache(
  snapshotHTML,
  options = {},
  requestBlob = requestServerPdfBlob
) {
  const cacheKey = buildPdfPreviewBlobCacheKey(snapshotHTML, options)
  const cachedBlob = readCachedPdfPreviewBlob(cacheKey, snapshotHTML)
  if (cachedBlob) {
    return cachedBlob
  }

  const pendingRequest = pdfPreviewBlobRequestCache.get(cacheKey)
  if (pendingRequest?.snapshotHTML === snapshotHTML) {
    return pendingRequest.promise
  }

  const promise = Promise.resolve()
    .then(() => requestBlob(snapshotHTML, options))
    .then((blob) => {
      writeCachedPdfPreviewBlob(cacheKey, snapshotHTML, blob)
      return blob
    })
    .finally(() => {
      if (pdfPreviewBlobRequestCache.get(cacheKey)?.promise === promise) {
        pdfPreviewBlobRequestCache.delete(cacheKey)
      }
    })

  pdfPreviewBlobRequestCache.set(cacheKey, {
    promise,
    snapshotHTML,
  })
  return promise
}

function writeCachedPdfPreviewBlob(cacheKey, snapshotHTML, blob) {
  if (!cacheKey || !snapshotHTML || !(blob instanceof Blob)) {
    return
  }

  pdfPreviewBlobCache.set(cacheKey, {
    blob,
    createdAt: Date.now(),
    snapshotHTML,
  })

  while (pdfPreviewBlobCache.size > PDF_PREVIEW_BLOB_CACHE_MAX_ENTRIES) {
    const oldestKey = pdfPreviewBlobCache.keys().next().value
    pdfPreviewBlobCache.delete(oldestKey)
  }
}

function resetPdfPreviewBlobCacheForTest() {
  pdfPreviewBlobCache.clear()
  pdfPreviewBlobRequestCache.clear()
}

function waitForSnapshotCommit(win) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }
    const timeoutOwner =
      win && typeof win.setTimeout === 'function' ? win : window
    const fallbackTimer = timeoutOwner.setTimeout(
      finish,
      PDF_SNAPSHOT_COMMIT_FALLBACK_TIMEOUT_MS
    )
    const finishAndClear = () => {
      if (!settled && typeof timeoutOwner.clearTimeout === 'function') {
        timeoutOwner.clearTimeout(fallbackTimer)
      }
      finish()
    }

    if (!win || typeof win.requestAnimationFrame !== 'function') {
      finishAndClear()
      return
    }
    win.requestAnimationFrame(finishAndClear)
  })
}

async function flushActiveEditorBeforeOutput(doc) {
  if (!doc) {
    return
  }

  const { activeElement } = doc
  if (
    !activeElement ||
    activeElement === doc.body ||
    typeof activeElement.blur !== 'function'
  ) {
    return
  }

  activeElement.blur()
  const win = doc.defaultView
  await waitForSnapshotCommit(win)
  await waitForSnapshotCommit(win)
}

function shouldOptimizeServerPdfImageSource(src, options = {}) {
  const normalizedSrc = String(src || '').trim()
  if (!normalizedSrc) {
    return false
  }

  if (
    normalizeServerPdfSnapshotOptions(options).snapshotMode !==
    SERVER_PDF_PREVIEW_SNAPSHOT_MODE
  ) {
    return false
  }

  const lowerSrc = normalizedSrc.toLowerCase()
  if (lowerSrc.startsWith('data:image/svg+xml')) {
    return false
  }
  if (lowerSrc.startsWith('data:')) {
    return normalizedSrc.length >= PREVIEW_SNAPSHOT_IMAGE_MIN_DATA_URL_LENGTH
  }
  return true
}

function buildSnapshotAssetTimeoutError(scene = '请求资源') {
  return new Error(`${scene}超时，请稍后重试。`)
}

async function fetchSnapshotAssetWithTimeout(url, timeoutMs) {
  const normalizedTimeoutMs = Number(timeoutMs)
  if (!Number.isFinite(normalizedTimeoutMs) || normalizedTimeoutMs <= 0) {
    return fetch(url, { credentials: 'include' })
  }

  if (typeof AbortController === 'function') {
    const controller = new AbortController()
    const timer = window.setTimeout(
      () => controller.abort(),
      normalizedTimeoutMs
    )
    try {
      return await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw buildSnapshotAssetTimeoutError('模板图片加载')
      }
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }

  return Promise.race([
    fetch(url, { credentials: 'include' }),
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(buildSnapshotAssetTimeoutError('模板图片加载'))
      }, normalizedTimeoutMs)
    }),
  ])
}

function resolveSnapshotAssetURL(raw, baseURL) {
  try {
    return String(new URL(String(raw || ''), baseURL || window.location.origin))
  } catch {
    return String(raw || '').trim()
  }
}

function readBlobAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'function') {
      reject(new Error('当前环境不支持读取图片。'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败。'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

function loadImageFromURL(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      reject(new Error('当前环境不支持图片预处理。'))
      return
    }

    const image = new Image()
    image.onerror = () => reject(new Error('图片无法识别。'))
    image.onload = () => resolve(image)
    image.src = src
  })
}

async function compressSnapshotRasterImage(src, snapshotDocument) {
  if (!src || !snapshotDocument?.createElement) {
    return src
  }

  const image = await loadImageFromURL(src)
  const width = Number(image.naturalWidth || image.width || 0)
  const height = Number(image.naturalHeight || image.height || 0)
  if (width <= 0 || height <= 0) {
    return src
  }

  const scale = Math.min(
    1,
    PREVIEW_SNAPSHOT_IMAGE_MAX_DIMENSION_PX / Math.max(width, height)
  )
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = snapshotDocument.createElement('canvas')
  const context = canvas?.getContext?.('2d')
  if (!context) {
    return src
  }

  canvas.width = targetWidth
  canvas.height = targetHeight
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(image, 0, 0, targetWidth, targetHeight)
  return canvas.toDataURL('image/jpeg', PREVIEW_SNAPSHOT_IMAGE_JPEG_QUALITY)
}

async function optimizeServerPdfSnapshotImages(clonedRoot, options = {}) {
  if (
    !clonedRoot?.querySelectorAll ||
    normalizeServerPdfSnapshotOptions(options).snapshotMode !==
      SERVER_PDF_PREVIEW_SNAPSHOT_MODE
  ) {
    return
  }

  const snapshotDocument = clonedRoot.ownerDocument
  const baseURL =
    clonedRoot.baseURI || snapshotDocument?.baseURI || window.location.origin
  const imageElements = Array.from(clonedRoot.querySelectorAll('img[src]'))

  await Promise.all(
    imageElements.map(async (imageElement) => {
      const rawSrc = String(imageElement.getAttribute('src') || '').trim()
      if (!shouldOptimizeServerPdfImageSource(rawSrc, options)) {
        return
      }

      let sourceToCompress = rawSrc
      try {
        if (!rawSrc.toLowerCase().startsWith('data:')) {
          const response = await fetchSnapshotAssetWithTimeout(
            resolveSnapshotAssetURL(rawSrc, baseURL),
            PREVIEW_SNAPSHOT_IMAGE_INLINE_TIMEOUT_MS
          )
          if (!response.ok) {
            return
          }
          const blob = await response.blob()
          if (
            !String(blob?.type || '')
              .toLowerCase()
              .startsWith('image/')
          ) {
            return
          }
          sourceToCompress = await readBlobAsDataURL(blob)
        }

        const lowerSource = sourceToCompress.toLowerCase()
        if (lowerSource.startsWith('data:image/svg+xml')) {
          if (sourceToCompress !== rawSrc) {
            imageElement.setAttribute('src', sourceToCompress)
          }
          return
        }

        const optimizedSource = await compressSnapshotRasterImage(
          sourceToCompress,
          snapshotDocument
        )
        if (optimizedSource) {
          imageElement.setAttribute('src', optimizedSource)
        }
      } catch {
        // 图片降载失败时保留原图，不阻断 PDF 预览主链路。
      }
    })
  )
}

function normalizeServerPdfSnapshotRuntimeState(clonedRoot) {
  clonedRoot.setAttribute('data-erp-theme', 'light')
  clonedRoot.setAttribute('data-erp-theme-mode', 'light')
  if (clonedRoot.style) {
    clonedRoot.style.colorScheme = 'light'
  }
  clonedRoot.querySelectorAll('[data-erp-theme]').forEach((element) => {
    element.setAttribute('data-erp-theme', 'light')
  })
  clonedRoot.querySelectorAll('[data-erp-theme-mode]').forEach((element) => {
    element.setAttribute('data-erp-theme-mode', 'light')
  })

  clonedRoot.querySelectorAll('script').forEach((node) => {
    node.remove()
  })
  clonedRoot.querySelectorAll('link').forEach((node) => {
    const rel = String(node.getAttribute('rel') || '').toLowerCase()
    if (rel === 'stylesheet' || rel === 'modulepreload' || rel === 'preload') {
      node.remove()
    }
  })

  const classNamesToClear = [
    ...SERVER_PDF_SELECTION_CLASS_NAMES,
    ...SERVER_PDF_PRINT_PREPARING_CLASS_NAMES,
  ]
  classNamesToClear.forEach((className) => {
    clonedRoot.querySelectorAll(`.${className}`).forEach((element) => {
      element.classList.remove(className)
    })
  })
}

function readServerPdfStylesheetText(sourceDocument) {
  const styleSheets = Array.from(sourceDocument?.styleSheets || [])
  const chunks = []

  styleSheets.forEach((styleSheet) => {
    let cssRules
    try {
      cssRules = Array.from(styleSheet.cssRules || [])
    } catch {
      return
    }
    if (cssRules.length === 0) {
      return
    }

    const cssText = cssRules
      .map((rule) => serializeServerPdfCssRule(rule))
      .filter(Boolean)
      .join('\n')
    if (!cssText) {
      return
    }

    const href = String(styleSheet.href || '').trim()
    chunks.push(href ? `/* ${href} */\n${cssText}` : cssText)
  })

  return chunks.join('\n\n')
}

function getNestedCssRules(rule) {
  try {
    return Array.from(rule?.cssRules || [])
  } catch {
    return []
  }
}

function getCssAtRuleHeader(rule, fallbackText = '') {
  const cssText = String(rule?.cssText || fallbackText || '').trim()
  const header = cssText.match(/^([^{}]+)\{/)?.[1]?.trim()
  if (header) {
    return header
  }

  const conditionText =
    String(rule?.conditionText || '').trim() ||
    String(rule?.media?.mediaText || '').trim()
  const name = cssText.match(/^@[-\w]+/)?.[0] || ''
  if (name && conditionText) {
    return `${name} ${conditionText}`
  }
  return ''
}

function isServerPdfBaseStyleRule(rule) {
  const selectorText = String(rule?.selectorText || '')
    .trim()
    .toLowerCase()
  return SERVER_PDF_BASE_STYLE_SELECTORS.has(selectorText)
}

function isServerPdfRelevantStyleRule(rule) {
  if (isServerPdfBaseStyleRule(rule)) {
    return true
  }

  const ruleText = [
    String(rule?.selectorText || ''),
    String(rule?.cssText || ''),
  ].join('\n')
  return SERVER_PDF_STYLESHEET_RULE_TOKENS.some((token) =>
    ruleText.includes(token)
  )
}

function serializeServerPdfCssRule(rule) {
  const cssText = String(rule?.cssText || '').trim()
  if (!cssText) {
    return ''
  }

  if (/^@page\b/i.test(cssText)) {
    return cssText
  }

  const nestedRules = getNestedCssRules(rule)
  if (nestedRules.length > 0) {
    const nestedCssText = nestedRules
      .map((nestedRule) => serializeServerPdfCssRule(nestedRule))
      .filter(Boolean)
      .join('\n')
    if (!nestedCssText) {
      return ''
    }

    const header = getCssAtRuleHeader(rule, cssText)
    return header ? `${header} {\n${nestedCssText}\n}` : nestedCssText
  }

  if (cssText.startsWith('@')) {
    return ''
  }

  return isServerPdfRelevantStyleRule(rule) ? cssText : ''
}

function inlineServerPdfStylesheets(clonedRoot, sourceDocument) {
  const head = clonedRoot?.querySelector?.('head')
  const snapshotDocument = clonedRoot?.ownerDocument
  if (!head || !snapshotDocument?.createElement) {
    return false
  }

  const cssText = readServerPdfStylesheetText(sourceDocument)
  if (!cssText.trim()) {
    return false
  }

  const style = snapshotDocument.createElement('style')
  style.setAttribute('data-server-pdf-inline-styles', 'true')
  style.textContent = cssText
  head.appendChild(style)
  return true
}

function createMinimalServerPdfSnapshotRoot(element) {
  const sourceDocument = element?.ownerDocument
  if (
    !sourceDocument?.implementation?.createHTMLDocument ||
    typeof element.cloneNode !== 'function'
  ) {
    return null
  }

  const snapshotDocument = sourceDocument.implementation.createHTMLDocument('')
  const snapshotRoot = snapshotDocument.documentElement
  const sourceLang =
    sourceDocument.documentElement?.getAttribute?.('lang') || 'zh-CN'
  if (sourceLang) {
    snapshotRoot.setAttribute('lang', sourceLang)
  }

  const metaCharset = snapshotDocument.createElement('meta')
  metaCharset.setAttribute('charset', 'utf-8')
  snapshotDocument.head.appendChild(metaCharset)

  const metaViewport = snapshotDocument.createElement('meta')
  metaViewport.setAttribute('name', 'viewport')
  metaViewport.setAttribute('content', 'width=device-width, initial-scale=1')
  snapshotDocument.head.appendChild(metaViewport)

  const targetClone =
    typeof snapshotDocument.importNode === 'function'
      ? snapshotDocument.importNode(element, true)
      : element.cloneNode(true)
  targetClone.setAttribute(SERVER_PDF_TARGET_ATTRIBUTE, 'true')
  snapshotDocument.body.replaceChildren(targetClone)
  return snapshotRoot
}

function createLegacyServerPdfSnapshotRoot(element) {
  const sourceDocument = element?.ownerDocument
  if (!sourceDocument?.documentElement) {
    return null
  }

  element.setAttribute(SERVER_PDF_TARGET_ATTRIBUTE, 'true')
  try {
    return sourceDocument.documentElement.cloneNode(true)
  } finally {
    element.removeAttribute(SERVER_PDF_TARGET_ATTRIBUTE)
  }
}

function buildServerPdfTargetSelector() {
  return `[${SERVER_PDF_TARGET_ATTRIBUTE}="true"]`
}

function applyServerPdfLayoutOverrides(clonedRoot) {
  const head = clonedRoot.querySelector('head')
  const snapshotDocument = clonedRoot?.ownerDocument
  if (!head || !snapshotDocument?.createElement) {
    return
  }

  const style = snapshotDocument.createElement('style')
  style.setAttribute('data-server-pdf-style', 'true')
  style.textContent = [
    'html, body {',
    '  margin: 0 !important;',
    '  padding: 0 !important;',
    '  width: 210mm !important;',
    '  max-width: 210mm !important;',
    '  min-width: 0 !important;',
    '  background: #fff !important;',
    '  color: #111827 !important;',
    '  color-scheme: light !important;',
    '  overflow: visible !important;',
    '}',
    'body {',
    '  min-height: 0 !important;',
    '}',
    `${buildServerPdfTargetSelector()} {`,
    '  margin: 0 !important;',
    '  width: 210mm !important;',
    '  max-width: 210mm !important;',
    '  box-shadow: none !important;',
    '  border-radius: 0 !important;',
    '  background: #fff !important;',
    '  color: #111827 !important;',
    '  opacity: 1 !important;',
    '  visibility: visible !important;',
    '}',
    '.erp-material-contract-paper,',
    '.erp-processing-contract-paper {',
    '  margin: 0 !important;',
    '  width: 210mm !important;',
    '  max-width: 210mm !important;',
    '  box-shadow: none !important;',
    '  border-radius: 0 !important;',
    '  background: #fff !important;',
    '  color: #111827 !important;',
    '  opacity: 1 !important;',
    '  visibility: visible !important;',
    '}',
  ].join('\n')
  head.appendChild(style)
}

function isolateServerPdfSnapshotToTarget(clonedRoot) {
  const body = clonedRoot.querySelector('body')
  if (!body || typeof body.replaceChildren !== 'function') {
    return false
  }

  const target = clonedRoot.querySelector(buildServerPdfTargetSelector())
  if (!target) {
    return false
  }

  body.replaceChildren(target)
  return true
}

async function buildServerPdfSnapshotHTMLFromElement(element, options = {}) {
  if (!element || !element.ownerDocument) {
    throw new Error('未找到可导出的打印区域。')
  }

  const doc = element.ownerDocument
  await flushActiveEditorBeforeOutput(doc)

  const clonedRoot =
    createMinimalServerPdfSnapshotRoot(element) ||
    createLegacyServerPdfSnapshotRoot(element)
  if (!clonedRoot) {
    throw new Error('未找到可导出的打印区域。')
  }

  inlineServerPdfStylesheets(clonedRoot, doc)
  normalizeServerPdfSnapshotRuntimeState(clonedRoot)
  if (isolateServerPdfSnapshotToTarget(clonedRoot)) {
    applyServerPdfLayoutOverrides(clonedRoot)
  }
  await optimizeServerPdfSnapshotImages(clonedRoot, options)
  return `<!doctype html>${clonedRoot.outerHTML}`
}

function getServerPdfErrorMessage(response) {
  const status = Number(response?.status)
  if (status === 401) {
    return '登录已失效，请刷新页面后重试。'
  }
  if (status === 403) {
    return '当前账号不能生成 PDF，请联系管理员。'
  }
  if (status === 408 || status === 504) {
    return '服务器生成 PDF 超时，请稍后重试。'
  }
  if (status === 413) {
    return '打印内容过大，请减少图片或附件后重试。'
  }
  if (status === 429) {
    return 'PDF 生成请求过多，请稍后重试。'
  }
  return '服务器生成 PDF 失败，请稍后重试。'
}

async function requestServerPdfBlob(snapshotHTML, options = {}) {
  const { title, fileName, templateKey, customerKey, timeoutMs } =
    normalizeServerPdfRequestOptions(options)

  const adminToken = getToken(AUTH_SCOPE.ADMIN)
  if (!adminToken) {
    throw new Error('登录已失效，请刷新页面后重试。')
  }

  const controller =
    typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId =
    controller && typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null

  try {
    const response = await fetch(SERVER_PDF_RENDER_ROUTE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title,
        file_name: fileName,
        template_key: templateKey,
        customer_key: customerKey || undefined,
        html: snapshotHTML,
        base_url: window.location.origin,
      }),
      signal: controller?.signal,
    })

    if (!response.ok) {
      throw new Error(getServerPdfErrorMessage(response))
    }

    const blob = await response.blob()
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error('服务器返回空 PDF，请稍后重试。')
    }

    return blob
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('服务器生成 PDF 超时，请稍后重试。')
    }
    throw error
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }
  }
}

export const openPdfPreviewWindowFromBlob = async (
  createBlob,
  {
    title = DEFAULT_PDF_PREVIEW_TITLE,
    features = DEFAULT_PDF_PREVIEW_WINDOW_FEATURES,
  } = {}
) => {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    throw new Error('当前环境不支持打开 PDF 预览窗口。')
  }
  if (typeof createBlob !== 'function') {
    throw new Error('未提供 PDF 预览生成函数。')
  }

  const previewStateID = createPdfPreviewStateID()
  const previewShellURL = buildPdfPreviewShellURL(previewStateID)
  const previewWindow = openPdfPreviewShellWindow(previewShellURL, features)
  if (!previewWindow) {
    throw new Error('浏览器拦截了 PDF 预览弹窗，请允许弹窗后重试')
  }

  try {
    const blob = await createBlob()
    if (!(blob instanceof Blob)) {
      throw new Error('生成 PDF 预览失败，请稍后重试。')
    }
    const previewURL = URL.createObjectURL(blob)
    const previewHTML = buildPdfPreviewWindowHTML({
      title,
      pdfURL: previewURL,
    })
    const wrotePreview = writePdfPreviewWindowHTML(previewWindow, previewHTML)
    if (!wrotePreview) {
      await restorePdfPreviewWindowWithPersistence(
        previewWindow,
        previewShellURL,
        previewStateID,
        previewHTML
      )
    }

    window.setTimeout(() => {
      URL.revokeObjectURL(previewURL)
    }, PDF_PREVIEW_URL_REVOKE_DELAY_MS)

    return { blob, previewURL, previewWindow }
  } catch (error) {
    const errorMessage = getActionErrorMessage(error, '生成 PDF 预览')
    const previewHTML = buildPdfPreviewWindowHTML({
      title,
      statusText: errorMessage,
    })
    await restorePdfPreviewWindowWithPersistence(
      previewWindow,
      previewShellURL,
      previewStateID,
      previewHTML
    )
    throw error instanceof Error ? error : new Error(errorMessage)
  }
}

export const downloadPdfFromBlob = async (
  createBlob,
  fileName = DEFAULT_PDF_FILE_NAME
) => {
  if (typeof createBlob !== 'function') {
    throw new Error('未提供 PDF 下载生成函数。')
  }

  const blob = await createBlob()
  if (!(blob instanceof Blob)) {
    throw new Error('生成 PDF 下载失败，请稍后重试。')
  }

  const blobURL = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobURL
  link.download = fileName || DEFAULT_PDF_FILE_NAME
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => {
    URL.revokeObjectURL(blobURL)
  }, PDF_DOWNLOAD_URL_REVOKE_DELAY_MS)

  return { blob, blobURL }
}

export const createServerPdfBlobFromElement = async (element, options = {}) => {
  const snapshotHTML = await buildServerPdfSnapshotHTMLFromElement(
    element,
    options
  )
  if (
    normalizeServerPdfSnapshotOptions(options).snapshotMode ===
    SERVER_PDF_PREVIEW_SNAPSHOT_MODE
  ) {
    return requestPdfPreviewBlobWithCache(snapshotHTML, options)
  }

  return requestServerPdfBlob(snapshotHTML, options)
}

export const openPdfPreviewFromElement = async (element, options = {}) => {
  const { title } = normalizeServerPdfRequestOptions(options)
  const { blob, previewURL } = await openPdfPreviewWindowFromBlob(
    () =>
      createServerPdfBlobFromElement(element, {
        ...options,
        snapshotMode: SERVER_PDF_PREVIEW_SNAPSHOT_MODE,
      }),
    { title }
  )
  return { blob, previewURL }
}

export const preloadPdfPreviewFromElement = async (element, options = {}) => {
  return createServerPdfBlobFromElement(element, {
    ...options,
    snapshotMode: SERVER_PDF_PREVIEW_SNAPSHOT_MODE,
  })
}

export const schedulePdfPreviewWarmup = (callback, options = {}) => {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {}
  }

  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : PDF_PREVIEW_AUTO_PRELOAD_DELAY_MS
  const idleTimeoutMs = Number.isFinite(Number(options.idleTimeoutMs))
    ? Math.max(0, Number(options.idleTimeoutMs))
    : PDF_PREVIEW_AUTO_PRELOAD_IDLE_TIMEOUT_MS
  let cancelled = false
  let idleID = 0
  let delayID = window.setTimeout(() => {
    delayID = 0
    const runWarmup = () => {
      if (!cancelled) {
        callback()
      }
    }

    if (typeof window.requestIdleCallback === 'function') {
      idleID = window.requestIdleCallback(runWarmup, {
        timeout: idleTimeoutMs,
      })
      return
    }

    runWarmup()
  }, delayMs)

  return () => {
    cancelled = true
    if (delayID) {
      window.clearTimeout(delayID)
    }
    if (idleID && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleID)
    }
  }
}

export const downloadPdfFromElement = async (element, options = {}) => {
  const { fileName } = normalizeServerPdfRequestOptions(options)
  return downloadPdfFromBlob(
    () => createServerPdfBlobFromElement(element, options),
    fileName
  )
}

export const __TEST_ONLY__ = {
  buildPdfPreviewWindowHTML,
  buildPdfPreviewShellURL,
  buildPdfPreviewStateStorageKey,
  persistPdfPreviewHTML,
  resetPdfPreviewStateDatabaseForTest,
  buildPdfPreviewBlobCacheKey,
  readCachedPdfPreviewBlob,
  writeCachedPdfPreviewBlob,
  requestPdfPreviewBlobWithCache,
  resetPdfPreviewBlobCacheForTest,
  waitForSnapshotCommit,
  buildServerPdfTargetSelector,
  isolateServerPdfSnapshotToTarget,
  normalizeServerPdfSnapshotRuntimeState,
  normalizeServerPdfSnapshotOptions,
  createMinimalServerPdfSnapshotRoot,
  inlineServerPdfStylesheets,
  shouldOptimizeServerPdfImageSource,
  applyServerPdfLayoutOverrides,
  normalizeServerPdfRequestOptions,
  getServerPdfErrorMessage,
  requestServerPdfBlob,
}
