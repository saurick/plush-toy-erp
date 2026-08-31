#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const appDefinitions = {
  desktop: {
    title: '桌面后台',
    port: 5175,
    buildDir: 'build',
  },
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

const requestedAppId = process.env.APP_ID || 'desktop'
const app = appDefinitions[requestedAppId]

if (!app) {
  console.error(
    `未知 APP_ID=${requestedAppId}，可选值：${Object.keys(appDefinitions).join(', ')}`
  )
  process.exit(1)
}

const host = process.env.HOST || '0.0.0.0'
const port = resolvePort(process.env.PORT, app.port)
const staticRoot = path.resolve(
  process.env.STATIC_ROOT || path.join(appRoot, app.buildDir)
)
const apiOrigin = (process.env.API_ORIGIN || '').replace(/\/+$/, '')
const proxyPrefixes = (
  process.env.PROXY_PREFIXES ||
  '/rpc,/templates,/readyz/runtime-identity'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const proxyTimeoutMs = resolvePositiveInteger(
  process.env.PROXY_TIMEOUT_MS,
  30_000
)
const readinessTimeoutMs = resolvePositiveInteger(
  process.env.READINESS_TIMEOUT_MS,
  2_000
)
const shutdownTimeoutMs = resolvePositiveInteger(
  process.env.SHUTDOWN_TIMEOUT_MS,
  10_000
)
const httpAgent = new http.Agent({
  keepAlive: true,
  maxFreeSockets: 4,
  maxSockets: 32,
  timeout: proxyTimeoutMs,
})
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxFreeSockets: 4,
  maxSockets: 32,
  timeout: proxyTimeoutMs,
})

if (!fs.existsSync(path.join(staticRoot, 'index.html'))) {
  console.error(
    `未找到 ${app.title} 构建产物：${path.join(staticRoot, 'index.html')}`
  )
  process.exit(1)
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(`[web-static] ${request.method} ${request.url}`, error)
    if (!response.headersSent) {
      sendText(response, 500, 'Internal Server Error')
    } else {
      response.destroy()
    }
  })
})

server.headersTimeout = 15_000
server.requestTimeout = proxyTimeoutMs + 5_000
server.keepAliveTimeout = 5_000
server.maxRequestsPerSocket = 1_000
server.maxHeadersCount = 100

const activeUpstreamRequests = new Set()
let shutdownStarted = false
let shutdownForced = false

function requestShutdown(signal) {
  if (shutdownStarted) {
    shutdownForced = true
    server.closeAllConnections?.()
    return
  }
  shutdownStarted = true
  console.log(`[web-static] shutdown signal=${signal} status=running`)
  const forceTimer = setTimeout(() => {
    shutdownForced = true
    console.error(
      `[web-static] shutdown signal=${signal} status=forced timeoutMs=${shutdownTimeoutMs}`
    )
    for (const upstreamRequest of activeUpstreamRequests) {
      upstreamRequest.destroy(new Error('server shutdown'))
    }
    httpAgent.destroy()
    httpsAgent.destroy()
    server.closeAllConnections?.()
  }, shutdownTimeoutMs)
  forceTimer.unref()

  server.close((error) => {
    clearTimeout(forceTimer)
    httpAgent.destroy()
    httpsAgent.destroy()
    if (error) {
      console.error(
        `[web-static] shutdown signal=${signal} status=failed`,
        error
      )
      process.exitCode = 1
      return
    }
    process.exitCode = shutdownForced ? 1 : 0
    console.log(
      `[web-static] shutdown signal=${signal} status=${shutdownForced ? 'forced' : 'complete'}`
    )
  })
  server.closeIdleConnections?.()
}

process.on('SIGTERM', () => requestShutdown('SIGTERM'))
process.on('SIGINT', () => requestShutdown('SIGINT'))

server.listen(port, host, () => {
  console.log(
    `[web-static] ${app.title} app=${requestedAppId} root=${staticRoot} http://${host}:${port}`
  )
  if (apiOrigin) {
    console.log(
      `[web-static] API proxy ${proxyPrefixes.join(', ')} -> ${apiOrigin}`
    )
  }
})

async function handleRequest(request, response) {
  const requestUrl = new URL(
    request.url || '/',
    `http://${request.headers.host}`
  )

  if (requestUrl.pathname === '/healthz') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method Not Allowed', {
        allow: 'GET, HEAD',
      })
      return
    }
    sendJson(response, 200, {
      status: 'ok',
      appId: requestedAppId,
      title: app.title,
    })
    return
  }

  if (requestUrl.pathname === '/readyz') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method Not Allowed', {
        allow: 'GET, HEAD',
      })
      return
    }
    if (shutdownStarted) {
      sendJson(response, 503, { status: 'not_ready' })
      return
    }
    const ready = await isUpstreamReady()
    sendJson(response, ready ? 200 : 503, {
      status: ready ? 'ready' : 'not_ready',
      appId: requestedAppId,
      title: app.title,
    })
    return
  }

  if (shouldProxy(requestUrl.pathname)) {
    const bodyLimit = proxyBodyLimit(requestUrl.pathname)
    const contentLength = Number(request.headers['content-length'])
    if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
      sendText(response, 413, 'Request Entity Too Large', {
        connection: 'close',
      })
      request.resume()
      return
    }
    proxyRequest(request, response, requestUrl)
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed', {
      allow: 'GET, HEAD',
    })
    return
  }

  await serveStatic(request, response, requestUrl)
}

async function serveStatic(request, response, requestUrl) {
  const filePath = resolveStaticFilePath(requestUrl.pathname)

  if (!filePath) {
    sendText(response, 400, 'Bad Request')
    return
  }

  const resolvedPath = await resolveExistingFile(filePath, requestUrl.pathname)
  if (!resolvedPath) {
    sendText(response, 404, 'Not Found')
    return
  }

  const stat = await fsp.stat(resolvedPath)
  const extname = path.extname(resolvedPath).toLowerCase()
  const headers = {
    'content-length': stat.size,
    'content-type': contentTypes.get(extname) || 'application/octet-stream',
  }

  if (isImmutableAsset(resolvedPath)) {
    headers['cache-control'] = 'public, max-age=31536000, immutable'
  } else {
    headers['cache-control'] = 'no-cache'
  }

  response.writeHead(200, headers)

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  fs.createReadStream(resolvedPath).pipe(response)
}

async function resolveExistingFile(filePath, pathname) {
  try {
    const stat = await fsp.stat(filePath)
    if (stat.isDirectory()) {
      return resolveStaticFilePath(path.posix.join(pathname, 'index.html'))
    }
    if (stat.isFile()) {
      return filePath
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
      throw error
    }
  }

  if (shouldFallbackToIndex(pathname)) {
    return path.join(staticRoot, 'index.html')
  }

  return null
}

function resolveStaticFilePath(pathname) {
  let decodedPathname
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    return null
  }

  const normalizedPath = path
    .normalize(decodedPathname)
    .replace(/^(\.\.[/\\])+/, '')
  const filePath = path.resolve(staticRoot, `.${normalizedPath}`)
  if (
    filePath !== staticRoot &&
    !filePath.startsWith(`${staticRoot}${path.sep}`)
  ) {
    return null
  }

  return filePath
}

function shouldFallbackToIndex(pathname) {
  if (pathname.includes('.')) {
    return false
  }

  return true
}

function shouldProxy(pathname) {
  return proxyPrefixes.some((prefix) => {
    if (pathname === prefix) {
      return true
    }
    return pathname.startsWith(`${prefix}/`)
  })
}

function proxyBodyLimit(pathname) {
  if (pathname === '/rpc/attachment') return 7 * 1024 * 1024
  if (pathname === '/templates' || pathname.startsWith('/templates/')) {
    return 32 * 1024 * 1024
  }
  return 2 * 1024 * 1024
}

function proxyRequest(request, response, requestUrl) {
  if (!apiOrigin) {
    sendText(response, 502, 'API_ORIGIN is not configured')
    return
  }

  const targetUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    apiOrigin
  )
  const client = targetUrl.protocol === 'https:' ? https : http
  const forwardedFor = [
    request.headers['x-forwarded-for'],
    request.socket.remoteAddress,
  ]
    .filter(Boolean)
    .join(', ')
  const headers = {
    ...stripHopByHopHeaders(request.headers),
    host: targetUrl.host,
    'x-forwarded-host': request.headers.host || '',
    'x-forwarded-proto': request.socket.encrypted ? 'https' : 'http',
  }
  if (forwardedFor) {
    headers['x-forwarded-for'] = forwardedFor
  }

  let timedOut = false
  let bodyTooLarge = false
  const bodyLimit = proxyBodyLimit(requestUrl.pathname)
  const proxy = client.request(
    targetUrl,
    {
      method: request.method,
      headers,
      timeout: proxyTimeoutMs,
      agent: targetUrl.protocol === 'https:' ? httpsAgent : httpAgent,
    },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode || 502,
        stripHopByHopHeaders(proxyResponse.headers)
      )
      proxyResponse.on('aborted', () => response.destroy())
      proxyResponse.pipe(response)
    }
  )
  activeUpstreamRequests.add(proxy)
  const proxyDeadline = setTimeout(() => {
    timedOut = true
    proxy.destroy(new Error('proxy deadline exceeded'))
  }, proxyTimeoutMs)
  proxyDeadline.unref()
  proxy.once('close', () => {
    clearTimeout(proxyDeadline)
    activeUpstreamRequests.delete(proxy)
  })

  proxy.on('timeout', () => {
    timedOut = true
    proxy.destroy(new Error('proxy timeout'))
  })

  proxy.on('error', (error) => {
    if (bodyTooLarge) {
      return
    }
    console.error(
      `[web-static] proxy ${request.method} ${targetUrl.href}`,
      error
    )
    if (!response.headersSent) {
      sendText(
        response,
        timedOut ? 504 : 502,
        timedOut ? 'Gateway Timeout' : 'Bad Gateway'
      )
    } else {
      response.destroy()
    }
  })

  request.on('aborted', () => proxy.destroy(new Error('client aborted')))
  let receivedBytes = 0
  request.on('data', (chunk) => {
    receivedBytes += chunk.length
    if (!bodyTooLarge && receivedBytes > bodyLimit) {
      bodyTooLarge = true
      request.unpipe(proxy)
      if (!response.headersSent) {
        sendText(response, 413, 'Request Entity Too Large', {
          connection: 'close',
        })
      }
      proxy.destroy(new Error('request body too large'))
    }
  })
  response.on('close', () => {
    if (!response.writableEnded) {
      proxy.destroy(new Error('client disconnected'))
    }
  })
  request.pipe(proxy)
}

function isUpstreamReady() {
  if (!apiOrigin) {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const targetUrl = new URL('/readyz', apiOrigin)
    const client = targetUrl.protocol === 'https:' ? https : http
    let settled = false
    let readinessDeadline
    const finish = (ready) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(readinessDeadline)
      resolve(ready)
    }
    const upstreamRequest = client.request(
      targetUrl,
      {
        method: 'GET',
        headers: { accept: 'text/plain' },
        timeout: readinessTimeoutMs,
        agent: targetUrl.protocol === 'https:' ? httpsAgent : httpAgent,
      },
      (upstreamResponse) => {
        const ready =
          upstreamResponse.statusCode >= 200 &&
          upstreamResponse.statusCode < 300
        upstreamResponse.resume()
        upstreamResponse.once('end', () => finish(ready))
        upstreamResponse.once('aborted', () => finish(false))
      }
    )
    activeUpstreamRequests.add(upstreamRequest)
    readinessDeadline = setTimeout(() => {
      upstreamRequest.destroy(new Error('readiness deadline exceeded'))
    }, readinessTimeoutMs)
    readinessDeadline.unref()
    upstreamRequest.once('close', () => {
      clearTimeout(readinessDeadline)
      activeUpstreamRequests.delete(upstreamRequest)
      finish(false)
    })
    upstreamRequest.once('timeout', () => {
      upstreamRequest.destroy(new Error('readiness timeout'))
    })
    upstreamRequest.once('error', () => finish(false))
    upstreamRequest.end()
  })
}

const hopByHopHeaderNames = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function stripHopByHopHeaders(headers) {
  const connectionTokens = String(headers.connection || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const excluded = new Set([...hopByHopHeaderNames, ...connectionTokens])
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) =>
        value !== undefined && !excluded.has(name.toLowerCase())
    )
  )
}

function isImmutableAsset(filePath) {
  const relativePath = path.relative(staticRoot, filePath)
  return relativePath.startsWith(`assets${path.sep}`)
}

function sendText(response, statusCode, text, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'cache-control': 'no-cache',
    'content-type': 'text/plain; charset=utf-8',
    ...extraHeaders,
  })
  response.end(text)
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'cache-control': 'no-cache',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function resolvePort(value, fallback) {
  if (!value) {
    return fallback
  }

  const portValue = Number(value)
  if (!Number.isInteger(portValue) || portValue <= 0 || portValue > 65_535) {
    console.error(`非法 PORT=${value}`)
    process.exit(1)
  }

  return portValue
}

function resolvePositiveInteger(value, fallback) {
  if (!value) {
    return fallback
  }

  const parsedValue = Number(value)
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback
  }

  return parsedValue
}
