import { AUTH_SCOPE, getToken } from '../../common/auth/auth.js'

const DEFAULT_PDF_FILE_NAME = 'print-template.pdf'
const DEFAULT_PDF_PREVIEW_TITLE = 'PDF 预览'
const DEFAULT_PDF_PREVIEW_WINDOW_FEATURES = 'width=1120,height=820'
const DEFAULT_PDF_TEMPLATE_KEY = 'print-template'
const PDF_PREVIEW_URL_REVOKE_DELAY_MS = 60_000
const PDF_DOWNLOAD_URL_REVOKE_DELAY_MS = 1_000
const PDF_PREVIEW_SHELL_PATH = '/pdf-preview-shell.html'
const PDF_PREVIEW_STATE_STORAGE_KEY_PREFIX = '__plush_erp_pdf_preview_state__'
const PDF_PREVIEW_SHELL_RESTORE_FUNCTION_NAME = 'restorePlushErpPdfPreviewShell'
const SERVER_PDF_RENDER_ROUTE = '/templates/render-pdf'
const SERVER_PDF_REQUEST_TIMEOUT_MS = 30_000
const SERVER_PDF_SELECTION_CLASS_NAMES = [
  'erp-material-contract-table__row-selected',
  'erp-processing-contract-table__row--selected',
]

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
  const timeoutMs = Number(normalizedOptions.timeoutMs)

  return {
    title,
    fileName,
    templateKey,
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

function buildPdfPreviewShellURL(stateID = '') {
  const url = new URL(PDF_PREVIEW_SHELL_PATH, window.location.origin)
  const normalizedStateID = String(stateID || '').trim()
  if (normalizedStateID) {
    url.searchParams.set('state', normalizedStateID)
  }
  return url.toString()
}

function persistPdfPreviewHTML(stateID, html) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false
  }

  const normalizedStateID = String(stateID || '').trim()
  if (!normalizedStateID || !String(html || '').trim()) {
    return false
  }

  try {
    window.localStorage.setItem(
      buildPdfPreviewStateStorageKey(normalizedStateID),
      JSON.stringify({
        html,
        updatedAt: Date.now(),
      })
    )
    return true
  } catch (error) {
    return false
  }
}

function waitForSnapshotCommit(win) {
  return new Promise((resolve) => {
    if (!win || typeof win.requestAnimationFrame !== 'function') {
      window.setTimeout(resolve, 16)
      return
    }
    win.requestAnimationFrame(() => resolve())
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

function normalizeServerPdfSnapshotRuntimeState(clonedRoot) {
  clonedRoot.querySelectorAll('script').forEach((node) => {
    node.remove()
  })

  SERVER_PDF_SELECTION_CLASS_NAMES.forEach((className) => {
    clonedRoot.querySelectorAll(`.${className}`).forEach((element) => {
      element.classList.remove(className)
    })
  })
}

async function buildServerPdfSnapshotHTMLFromElement(element) {
  if (!element || !element.ownerDocument) {
    throw new Error('未找到可导出的打印区域。')
  }

  const doc = element.ownerDocument
  await flushActiveEditorBeforeOutput(doc)

  const clonedRoot = doc.documentElement.cloneNode(true)
  normalizeServerPdfSnapshotRuntimeState(clonedRoot)
  return `<!doctype html>${clonedRoot.outerHTML}`
}

async function readServerErrorMessage(response) {
  const contentType = String(
    response?.headers?.get?.('content-type') || ''
  ).toLowerCase()

  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json()
      if (payload && payload.message) {
        return String(payload.message)
      }
    } catch (error) {
      // JSON 解析失败时降级到文本正文。
    }
  }

  try {
    return String((await response.text()) || '').trim()
  } catch (error) {
    return ''
  }
}

async function requestServerPdfBlob(snapshotHTML, options = {}) {
  const { title, fileName, templateKey, timeoutMs } =
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
        html: snapshotHTML,
        base_url: window.location.origin,
      }),
      signal: controller?.signal,
    })

    if (!response.ok) {
      const message = await readServerErrorMessage(response)
      throw new Error(message || '服务器生成 PDF 失败，请稍后重试。')
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
  const previewWindow = window.open(previewShellURL, '_blank', features)
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
    const persisted = persistPdfPreviewHTML(previewStateID, previewHTML)

    if (!previewWindow.closed) {
      if (persisted) {
        const restoreFromShell =
          previewWindow[PDF_PREVIEW_SHELL_RESTORE_FUNCTION_NAME]
        if (typeof restoreFromShell === 'function') {
          restoreFromShell()
        } else if (previewWindow.location) {
          previewWindow.location.replace(previewShellURL)
        }
      } else {
        previewWindow.document.open()
        previewWindow.document.write(previewHTML)
        previewWindow.document.close()
      }
      previewWindow.focus()
    }

    window.setTimeout(() => {
      URL.revokeObjectURL(previewURL)
    }, PDF_PREVIEW_URL_REVOKE_DELAY_MS)

    return { blob, previewURL, previewWindow }
  } catch (error) {
    try {
      if (!previewWindow.closed) {
        previewWindow.close()
      }
    } catch (closeError) {
      // 关闭失败不影响主错误上抛。
    }
    throw error
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
  const snapshotHTML = await buildServerPdfSnapshotHTMLFromElement(element)
  return requestServerPdfBlob(snapshotHTML, options)
}

export const openPdfPreviewFromElement = async (element, options = {}) => {
  const { title } = normalizeServerPdfRequestOptions(options)
  const { blob, previewURL } = await openPdfPreviewWindowFromBlob(
    () => createServerPdfBlobFromElement(element, options),
    { title }
  )
  return { blob, previewURL }
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
  normalizeServerPdfRequestOptions,
}
