import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { once } from 'node:events'
import { randomUUID, createHash, X509Certificate } from 'node:crypto'
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createStandaloneWorkbenchServer } from '../dev-server/standaloneWorkbench.mjs'
import { hashWorkbenchPassword } from '../dev-server/workbenchSession.mjs'
import { createQualityGateStyleSummary } from './style-l1/devQualityGateScenarios.mjs'
import {
  assertRepositoryIdentityEqual,
  readRepositoryIdentity,
} from '../../scripts/qa/lib/repository-identity.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const staticRoot = path.join(root, 'web/build-workbench')
const output =
  process.env.WORKBENCH_SMOKE_OUTPUT_DIR ||
  path.join(root, 'output/qa/workbench-artifact-browser')
const buildBytes = await readFile(path.join(staticRoot, 'workbench-build.json'))
const build = JSON.parse(buildBytes)
assertRepositoryIdentityEqual(
  build.repository,
  await readRepositoryIdentity(root)
)
assert.doesNotMatch(
  await readFile(path.join(staticRoot, 'workbench.html'), 'utf8'),
  /src\/dev-workbench\/standalone/u
)
await mkdir(output, { recursive: true })
const password = `fixture-${randomUUID()}`
let time = Date.now()
let writes = 0
const requests = []
const checks = []
const certificateRoot = await mkdtemp(
  path.join(os.tmpdir(), 'workbench-browser-tls-')
)
let server
let proxy
let browser
try {
  const keyPath = path.join(certificateRoot, 'key.pem')
  const certPath = path.join(certificateRoot, 'cert.pem')
  const configPath = path.join(certificateRoot, 'openssl.cnf')
  await writeFile(
    configPath,
    '[req]\ndistinguished_name=dn\nx509_extensions=v3\n[dn]\n[v3]\nsubjectAltName=DNS:workbench.localhost\n'
  )
  await promisify(execFile)(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=workbench.localhost',
      '-config',
      configPath,
    ],
    { timeout: 15000 }
  )
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)])
  const spki = createHash('sha256')
    .update(
      new X509Certificate(cert).publicKey.export({
        type: 'spki',
        format: 'der',
      })
    )
    .digest('base64')
  // Only this ephemeral test certificate is trusted by this fresh browser process.
  // TLS verification elsewhere and the user's trust store are unchanged.
  proxy = https.createServer({ key, cert }, (request, response) => {
    const outgoing = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: request.url,
        method: request.method,
        timeout: 10000,
        headers: {
          ...request.headers,
          'x-forwarded-proto': 'https',
          'x-forwarded-for': '203.0.113.42',
        },
      },
      (incoming) => {
        response.writeHead(incoming.statusCode, incoming.headers)
        incoming.pipe(response)
      }
    )
    outgoing.on('timeout', () =>
      outgoing.destroy(new Error('fixture proxy timeout'))
    )
    outgoing.on('error', () => {
      response.writeHead(502)
      response.end('fixture proxy unavailable')
    })
    request.pipe(outgoing)
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  const origin = `https://workbench.localhost:${proxy.address().port}`
  server = await createStandaloneWorkbenchServer({
    projectRoot: root,
    staticRoot,
    httpsOrigin: origin,
    maintenanceFile: path.join(output, 'unused-release.lock'),
    credentials: {
      username: 'operator',
      passwordHash: await hashWorkbenchPassword(password),
      now: () => time,
    },
    writeEvent: () => {},
    plugins: [
      {
        configureServer: ({ middlewares }) =>
          middlewares.use((request, response, next) => {
            const { pathname } = new URL(request.url, origin)
            if (
              !pathname.startsWith('/__dev/api/') &&
              !pathname.startsWith('/rpc') &&
              !pathname.startsWith('/templates')
            ) {
              return next()
            }
            if (request.method !== 'GET') {
              writes++
              response.writeHead(409)
              response.end('{}')
              return
            }
            const quality = pathname === '/__dev/api/qa/quality-gates'
            response.writeHead(quality ? 200 : 503, {
              'content-type': 'application/json',
            })
            response.end(
              JSON.stringify(
                quality
                  ? createQualityGateStyleSummary('passed')
                  : { message: '隔离验收中未提供该数据' }
              )
            )
          }),
      },
    ],
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  browser = await chromium.launch({
    headless: true,
    args: [
      `--ignore-certificate-errors-spki-list=${spki}`,
      '--no-proxy-server',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    assert.equal(
      url.origin,
      origin,
      `unexpected outbound request: ${url.origin}`
    )
    requests.push({ method: request.method(), path: url.pathname })
    await route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = async () => {
    await page.getByLabel('运维账号', { exact: true }).fill('operator')
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录工作台', exact: true }).click()
  }
  await page.goto(`${origin}/__dev/quality-gates?view=run`)
  await page
    .getByRole('heading', { name: '研发效能工作台', exact: true })
    .waitFor()
  await login()
  await page.getByRole('heading', { name: '质量门禁', exact: true }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('view'), 'run')
  await page.getByRole('tab', { name: '服务端检查', exact: true }).waitFor()
  await page.getByRole('tab', { name: '诊断历史', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: /运行本机/u }).count(), 0)
  checks.push(
    'login restores deep link and the built standalone diagnostic branch'
  )

  await page.goto(`${origin}/__dev/testing?view=server`)
  await page
    .getByRole('region', { name: 'GitLab CI 记录', exact: true })
    .getByText('完整 CI 通过', { exact: true })
    .waitFor()
  await page
    .getByText('目标服务器状态读取失败，请重新读取。', { exact: true })
    .waitFor()
  assert.equal(
    await page
      .getByRole('table', { name: '目标服务器验证结果', exact: true })
      .locator('tbody tr')
      .count(),
    3
  )
  for (const width of [1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1080 })
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    assert(
      dimensions.scrollWidth <= dimensions.width + 1,
      JSON.stringify(dimensions)
    )
  }
  await page.screenshot({
    path: path.join(output, 'standalone-server-verification.png'),
  })
  checks.push(
    'built verification preserves CI on target failure at three desktop widths'
  )
  await page.goto(`${origin}/__dev/testing?view=coverage`)
  await page.getByRole('heading', { name: '测试执行', exact: true }).waitFor()
  await page.locator('[aria-label="测试覆盖状态"]').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('view'), 'coverage')
  assert.equal(
    await page
      .getByRole('button', { name: '采集本地覆盖基线', exact: true })
      .count(),
    0
  )
  for (const endpoint of [
    '/__dev/api/qa/quality-gates/actions',
    '/__dev/api/qa/coverage/actions',
  ]) {
    const status = await page.evaluate(
      async (url) => (await fetch(url, { method: 'POST' })).status,
      endpoint
    )
    assert.equal(status, 403)
  }
  assert.equal(
    writes,
    0,
    'blocked generic actions must not reach a tool plugin'
  )
  checks.push(
    'local actions stay absent and the actual standalone server denies direct writes'
  )

  await page.goto(`${origin}/__dev/quality-gates?view=run`)
  await page.getByRole('tab', { name: '诊断历史', exact: true }).waitFor()
  time += 2 * 60 * 60 * 1000
  await page.getByRole('button', { name: /刷新状态/u }).click()
  await page.getByRole('button', { name: '登录工作台', exact: true }).waitFor()
  assert.match(
    new URL(page.url()).searchParams.get('returnTo'),
    /quality-gates\?view=run/u
  )
  await login()
  await page.getByRole('tab', { name: '诊断历史', exact: true }).waitFor()
  await page.getByRole('button', { name: '页面工具', exact: true }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.getByRole('button', { name: '登录工作台', exact: true }).waitFor()
  checks.push(
    'expired API sessions return to login, restore the view, and logout clears access'
  )
  assert.deepEqual(errors, [])
  assert(
    requests.some(
      ({ path }) => path.startsWith('/assets/') && path.endsWith('.js')
    )
  )
  assert(
    !requests.some(
      ({ path }) => path.startsWith('/src/') || path.startsWith('/@vite')
    )
  )
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        checks,
        buildIdentitySha256: createHash('sha256')
          .update(buildBytes)
          .digest('hex'),
        repository: build.repository,
        source: 'built-standalone-artifact',
        transport:
          'loopback HTTPS fixture proxy with ephemeral certificate pin',
        toolWrites: writes,
        requestCount: requests.length,
        dimensions: [1024, 1280, 1920],
      },
      null,
      2
    )
  )
  console.log(
    `[workbench:browser] passed ${checks.length} task paths; built artifact, no target connections`
  )
} catch (error) {
  await writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ checks, requests, error: error.message }, null, 2)
  )
  throw error
} finally {
  await browser?.close()
  for (const listener of [proxy, server]) {
    listener?.closeAllConnections()
    if (listener?.listening) {
      await new Promise((resolve) => listener.close(resolve))
    }
  }
  await rm(certificateRoot, { recursive: true, force: true })
}
