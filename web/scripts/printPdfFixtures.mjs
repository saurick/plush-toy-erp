import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'
import {
  createMockAdminToken,
  installAdminRpcMocks,
} from './style-l1/adminRpcMocks.mjs'
import { printTemplateCatalog } from '../src/erp/config/printTemplates.mjs'

const allowed = new Set(
  printTemplateCatalog
    .filter((template) => template.runtime?.workspace)
    .map((template) => template.key)
)
const [staticRoot, outputDirectory, selected = Array.from(allowed).join(',')] =
  process.argv.slice(2)
if (!staticRoot || !outputDirectory)
  throw new Error(
    'usage: printPdfFixtures.mjs STATIC_ROOT OUTPUT_DIR [TEMPLATE_KEYS]'
  )
const keys = selected.split(',').filter(Boolean)
assert(
  keys.length > 0 && keys.every((key) => allowed.has(key)),
  'select known print templates'
)
await mkdir(outputDirectory, { recursive: true })
const reservation = createServer()
await new Promise((resolve, reject) => {
  reservation.once('error', reject)
  reservation.listen(0, '127.0.0.1', resolve)
})
const port = reservation.address().port
await new Promise((resolve) => reservation.close(resolve))
const server = spawn(
  process.execPath,
  [path.join(import.meta.dirname, 'serveStaticApp.mjs')],
  {
    env: {
      ...process.env,
      APP_ID: 'desktop',
      HOST: '127.0.0.1',
      PORT: String(port),
      STATIC_ROOT: path.resolve(staticRoot),
      API_ORIGIN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
)
let browser
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('static fixture server did not start')),
      10000
    )
    server.once('exit', () => {
      clearTimeout(timer)
      reject(new Error('static fixture server exited'))
    })
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes(`:${port}`)) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: process.platform === 'linux',
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  await context.addInitScript((token) => {
    localStorage.setItem('admin_access_token', token)
    localStorage.setItem('admin_is_super_admin', 'true')
    localStorage.setItem('admin_roles', '[]')
    localStorage.setItem('admin_permissions', '[]')
    localStorage.setItem('admin_menus', '[]')
    localStorage.setItem('erp:last_entry_target', 'desktop')
  }, createMockAdminToken())
  const baseURL = `http://127.0.0.1:${port}`
  for (const key of keys) {
    const page = await context.newPage()
    await installAdminRpcMocks(page, { baseURL })
    let snapshot
    await page.route('**/templates/render-pdf', async (route) => {
      const payload = route.request().postDataJSON()
      assert.equal(payload.template_key, key)
      snapshot = payload.html
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF\n',
      })
    })
    await page.goto(
      `${baseURL}/erp/print-workspace/${key}?draft=fresh&state=pdf-fixture-${key}`,
      { waitUntil: 'networkidle' }
    )
    await page
      .locator('[data-print-draft-save-status="saved"]')
      .waitFor({ state: 'visible', timeout: 20000 })
    const captured = page.waitForRequest(
      (request) => request.url().endsWith('/templates/render-pdf'),
      { timeout: 20000 }
    )
    const downloaded = page.waitForEvent('download', { timeout: 20000 })
    await page.getByRole('button', { name: '下载 PDF', exact: true }).click()
    await captured
    await downloaded
    assert(
      snapshot?.includes('data:font/woff2;base64,'),
      'snapshot must carry versioned fonts'
    )
    const controlsInSnapshot = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      return Boolean(
        document.body.querySelector(
          '.erp-print-shell__panel, .erp-print-shell__view-bar, [data-print-edit-mode]'
        )
      )
    }, snapshot)
    assert(!controlsInSnapshot, 'editor controls must stay outside the PDF')
    await writeFile(
      path.join(outputDirectory, `print-snapshot-${key}.html`),
      snapshot
    )
    await page
      .locator('.erp-print-shell__stage-wrap')
      .screenshot({ path: path.join(outputDirectory, `${key}.png`) })
    console.log(
      `[pdf-fixture] ${key}: ${Buffer.byteLength(snapshot)} HTML bytes from built application`
    )
    await page.close()
  }
  await context.close()
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
