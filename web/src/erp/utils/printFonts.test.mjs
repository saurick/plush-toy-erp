import assert from 'node:assert/strict'
import test from 'node:test'
import { preparePrintFonts, PRINT_FONT_LIMITS } from './printFonts.mjs'

function paperWithFont(
  fetch,
  source = 'https://erp.example/assets/font.woff2'
) {
  const properties = {
    'font-family': '"Noto Serif SC Variable"',
    src: `url("${source}")`,
  }
  return {
    textContent: '打印中文',
    querySelectorAll: () => [],
    ownerDocument: {
      baseURI: 'https://erp.example/',
      fonts: { load: async () => [] },
      styleSheets: [
        {
          cssRules: [
            {
              type: 5,
              style: { getPropertyValue: (key) => properties[key] || '' },
              cssText: `@font-face { font-family: "Noto Serif SC Variable"; src: url("${source}"); }`,
            },
          ],
        },
      ],
      defaultView: {
        fetch,
        btoa: (binary) => Buffer.from(binary, 'binary').toString('base64'),
        getComputedStyle: () => ({
          fontFamily: '"Noto Serif SC Variable", serif',
        }),
      },
    },
  }
}

test('PDF freezes bundled font bytes and rejects cross-origin font sources before fetching', async () => {
  let requests = 0
  const bytes = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(44)])
  const fetch = async () => {
    requests += 1
    return new Response(bytes)
  }
  const css = await preparePrintFonts(paperWithFont(fetch))
  assert.match(css, /data:font\/woff2;base64,/)
  assert.equal(requests, 1)
  await assert.rejects(
    preparePrintFonts(
      paperWithFont(fetch, 'https://external.example/font.woff2')
    ),
    /来源无效/
  )
  assert.equal(requests, 1)
})

test('font body size is bounded even when the server omits Content-Length', async () => {
  let cancelled = false
  const fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(PRINT_FONT_LIMITS.eachBytes + 1))
        },
        cancel() {
          cancelled = true
        },
      })
    )
  await assert.rejects(preparePrintFonts(paperWithFont(fetch)), /大小限制/)
  assert.equal(cancelled, true)
})
