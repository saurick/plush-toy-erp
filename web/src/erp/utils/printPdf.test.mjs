import assert from 'node:assert/strict'
import test from 'node:test'
import { __TEST_ONLY__, openPdfPreviewWindowFromBlob } from './printPdf.mjs'

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
    timeoutMs: 30_000,
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
