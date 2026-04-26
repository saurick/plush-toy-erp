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
  'mobile-boss': {
    title: '老板移动端',
    port: 5186,
    buildDir: 'build/mobile-boss',
  },
  'mobile-business': {
    title: '业务移动端',
    port: 5187,
    buildDir: 'build/mobile-business',
  },
  'mobile-purchasing': {
    title: '采购移动端',
    port: 5188,
    buildDir: 'build/mobile-purchasing',
  },
  'mobile-production': {
    title: '生产移动端',
    port: 5189,
    buildDir: 'build/mobile-production',
  },
  'mobile-warehouse': {
    title: '仓库移动端',
    port: 5190,
    buildDir: 'build/mobile-warehouse',
  },
  'mobile-finance': {
    title: '财务移动端',
    port: 5191,
    buildDir: 'build/mobile-finance',
  },
  'mobile-pmc': {
    title: 'PMC 移动端',
    port: 5192,
    buildDir: 'build/mobile-pmc',
  },
  'mobile-quality': {
    title: '品质移动端',
    port: 5193,
    buildDir: 'build/mobile-quality',
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
const proxyPrefixes = (process.env.PROXY_PREFIXES || '/rpc,/templates')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const proxyTimeoutMs = resolvePositiveInteger(
  process.env.PROXY_TIMEOUT_MS,
  30_000
)

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

  if (requestUrl.pathname === '/healthz' || requestUrl.pathname === '/readyz') {
    sendJson(response, 200, {
      status: 'ok',
      appId,
      title: app.title,
    })
    return
  }

  if (shouldProxy(requestUrl.pathname)) {
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
  const headers = {
    ...request.headers,
    host: targetUrl.host,
    'x-forwarded-host': request.headers.host || '',
    'x-forwarded-proto': 'http',
  }

  delete headers.connection
  delete headers['keep-alive']
  delete headers['proxy-connection']
  delete headers['transfer-encoding']

  const proxy = client.request(
    targetUrl,
    {
      method: request.method,
      headers,
      timeout: proxyTimeoutMs,
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
      proxyResponse.pipe(response)
    }
  )

  proxy.on('timeout', () => {
    proxy.destroy(new Error('proxy timeout'))
  })

  proxy.on('error', (error) => {
    console.error(
      `[web-static] proxy ${request.method} ${targetUrl.href}`,
      error
    )
    if (!response.headersSent) {
      sendText(response, 502, 'Bad Gateway')
    } else {
      response.destroy()
    }
  })

  request.pipe(proxy)
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
