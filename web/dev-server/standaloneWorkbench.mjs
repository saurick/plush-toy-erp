import http from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createDevWorkbenchServePlugins } from './devWorkbenchPlugins.mjs'
import { DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME } from './devDatabaseMigrationRecoveryPlugin.mjs'
import { createDevHttpsProxyMiddleware, isSameOriginRequest, normalizeDevHttpsOrigin } from './devServerSecurity.mjs'
import { createWorkbenchSessionMiddleware } from './workbenchSession.mjs'
import { getDeploymentTarget } from '../../scripts/deploy/deployment-targets.mjs'
import target from '../../server/deploy/workbench/target.json' with { type: 'json' }
import { createDevPermissionRelationshipsPlugin, readStandalonePermissionRelationships } from './devPermissionRelationshipsPlugin.mjs'

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.ico', 'image/x-icon'], ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'], ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'], ['.txt', 'text/plain; charset=utf-8'],
])

export function createStandaloneWorkbenchPlugins(projectRoot, apiOrigin, writeEvent = () => {}) {
  // Local startup/recovery and Basic authentication belong to the local Vite
  // lifecycle. The standalone host has its own readiness and session boundary.
  const excluded = new Set([
    'plush-dev-operator-auth', 'plush-dev-web-instance',
    'plush-dev-permission-relationships',
    DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME,
  ])
  return [...createDevWorkbenchServePlugins({
    command: 'serve', mode: 'development', projectRoot, apiOrigin,
  }).filter((plugin) => !excluded.has(plugin.name)), createDevPermissionRelationshipsPlugin({
    projectRoot,
    readSnapshot: () => readStandalonePermissionRelationships(projectRoot),
    onDiagnostic: writeEvent,
  })]
}

export async function createStandaloneWorkbenchServer({
  projectRoot = path.resolve(import.meta.dirname, '../..'),
  staticRoot = path.join(projectRoot, 'web/build-workbench'),
  httpsOrigin = process.env.PLUSH_WORKBENCH_ORIGIN,
  trustedProxyAddress = target.trustedProxyAddress,
  credentials = {},
  plugins,
  maintenanceFile = path.join(target.root, 'runtime/release.lock'),
  writeEvent = (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
} = {}) {
  const origin = normalizeDevHttpsOrigin(httpsOrigin)
  if (!origin) throw new Error('PLUSH_WORKBENCH_ORIGIN must be configured')
  const publicRoot = await realpath(staticRoot)
  const artifactFile = path.join(publicRoot, '.workbench-artifact.json')
  const artifact = existsSync(artifactFile) ? JSON.parse(await readFile(artifactFile, 'utf8')) : null
  let activeWrites = 0
  const entry = path.join(publicRoot, 'workbench.html')
  if (!(await lstat(entry)).isFile()) throw new Error('Workbench artifact is missing')
  const proxy = createDevHttpsProxyMiddleware(origin, { allowPublicClients: true, trustedProxyAddress })
  const authenticate = createWorkbenchSessionMiddleware({
    ...credentials,
    onEvent: (outcome) => writeEvent({ event: 'workbench_auth', outcome, at: new Date().toISOString() }),
  })
  const apiOrigin = getDeploymentTarget(target.businessTarget).endpoints.server
  const middlewares = []
  middlewares.push((request, response, next) => {
    if (request.method === 'POST' && new URL(request.url, origin).pathname.startsWith('/__dev/api/') && existsSync(maintenanceFile)) {
      response.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ message: '工作台正在升级，请稍后重新核对状态；本次操作未开始' }))
      return
    }
    return next()
  })
  // Generic CI is owned by GitLab. Keep reads, cancellation and project actions.
  middlewares.push((request, response, next) => {
    const { pathname } = new URL(request.url, origin)
    if (request.method === 'POST' && ['/__dev/api/qa/quality-gates/actions', '/__dev/api/qa/coverage/actions'].includes(pathname)) {
      response.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ status: 'blocked', message: '完整测试与代码覆盖由 GitLab CI 执行；本地诊断请使用开发机工作台。' }))
      return
    }
    return next()
  })
  const bridge = { middlewares: { use: (middleware) => middlewares.push(middleware) } }
  for (const plugin of plugins ?? createStandaloneWorkbenchPlugins(projectRoot, apiOrigin, writeEvent)) {
    plugin.configureServer(bridge)
  }

  const serveStatic = async (request, response) => {
    const requestedUrl = new URL(request.url, origin)
    const upstreamUrl = new URL(apiOrigin)
    upstreamUrl.pathname = requestedUrl.pathname
    upstreamUrl.search = requestedUrl.search
    if (/^\/(?:rpc|templates)(?:\/|$)/u.test(upstreamUrl.pathname)) {
      if (!['GET', 'POST'].includes(request.method) || (request.method === 'POST' && !isSameOriginRequest(request))) {
        response.writeHead(403); response.end(); return
      }
      const upstream = http.request(upstreamUrl, {
        method: request.method,
        headers: {
          ...(request.headers['content-type'] ? { 'content-type': request.headers['content-type'] } : {}),
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
          'x-request-id': response.getHeader('x-request-id'),
        },
        timeout: 30_000,
      }, (result) => {
        response.writeHead(result.statusCode, {
          'content-type': result.headers['content-type'] || 'application/octet-stream',
          'cache-control': 'no-store',
        })
        result.on('error', () => response.destroy()).pipe(response)
      })
      const failProxy = () => {
        if (response.headersSent) response.destroy()
        else { response.writeHead(502); response.end('测试服务暂时不可用') }
      }
      upstream.on('timeout', () => upstream.destroy())
      upstream.on('error', failProxy)
      request.on('aborted', () => upstream.destroy())
      request.pipe(upstream)
      return
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return
    }
    const url = new URL(request.url, origin)
    let pathname
    try { pathname = decodeURIComponent(url.pathname) } catch {
      response.writeHead(400); response.end(); return
    }
    if (pathname.startsWith('/__dev/api/') || pathname.startsWith('/__dev/auth/')) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ message: '工作台入口不存在' })); return
    }
    if (pathname === '/') {
      response.writeHead(302, { location: '/__dev' }); response.end(); return
    }
    const isPage = /^\/__dev(?:\/|$)/u.test(pathname)
    const file = isPage ? entry : path.resolve(publicRoot, `.${pathname}`)
    if ((!isPage && !file.startsWith(`${publicRoot}${path.sep}`)) ||
      pathname.includes('\\') || pathname.split('/').some((part) => part.startsWith('.')) ||
      !MIME_TYPES.has(path.extname(file))) {
      response.writeHead(404); response.end(); return
    }
    try {
      const stat = await lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink() || !(await realpath(file)).startsWith(`${publicRoot}${path.sep}`)) {
        response.writeHead(404); response.end(); return
      }
      response.writeHead(200, {
        'content-type': MIME_TYPES.get(path.extname(file)),
        'content-length': stat.size,
      })
      if (request.method === 'HEAD') response.end()
      else createReadStream(file).on('error', () => response.destroy()).pipe(response)
    } catch {
      response.writeHead(404); response.end()
    }
  }

  return http.createServer({ requestTimeout: 30_000, headersTimeout: 15_000, maxHeaderSize: 16_384 }, (request, response) => {
    const requestId = randomUUID()
    response.setHeader('x-request-id', requestId)
    const started = performance.now()
    response.once('finish', () => writeEvent({
      event: 'workbench_http',
      requestId,
      method: request.method,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - started),
      at: new Date().toISOString(),
    }))
    const fail = () => {
      if (response.headersSent) response.destroy()
      else {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        response.end(JSON.stringify({ message: '工作台暂时不可用，请稍后重试', requestId }))
      }
    }
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) {
      response.writeHead(400); response.end(); return
    }
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify({
        status: 'ok',
        service: 'engineering-workbench',
        maintenance: existsSync(maintenanceFile),
        activeWrites,
        artifactId: artifact?.artifactId || null,
        sourceSha: artifact?.repository?.commit || null,
        nodeVersion: process.versions.node,
      })); return
    }
    if (request.method === 'POST' && request.url.startsWith('/__dev/api/')) {
      activeWrites += 1
      let finished = false
      const finishWrite = () => { if (!finished) { finished = true; activeWrites -= 1 } }
      response.once('finish', finishWrite)
      response.once('close', finishWrite)
    }
    let index = 0
    const next = () => {
      const middleware = middlewares[index++]
      return Promise.resolve(middleware ? middleware(request, response, next) : serveStatic(request, response)).catch(fail)
    }
    try {
      proxy(request, response, () => {
        Promise.resolve(authenticate(request, response, next)).catch(fail)
      })
    } catch { fail() }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = target
  if (process.env.PLUSH_WORKBENCH_ORIGIN !== target.httpsOrigin) throw new Error('Workbench deployment origin does not match target')
  const server = await createStandaloneWorkbenchServer()
  server.listen(port, target.bindAddress, () => {
    process.stdout.write(`${JSON.stringify({ event: 'workbench_ready', port })}\n`)
  })
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      server.close(() => process.exit(0))
      setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 10_000).unref()
    })
  }
}
