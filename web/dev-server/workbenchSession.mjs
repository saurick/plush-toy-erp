import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { renderWorkbenchLoginPage, WORKBENCH_LOGIN_CONTENT_SECURITY_POLICY } from './workbenchLoginPage.mjs'
import {
  isDevWorkbenchHttpsRequest,
  isDevWorkbenchProxyTransportRequest,
  isDevWorkbenchRequest,
  isSameOriginRequest,
  readJsonBody,
} from './devServerSecurity.mjs'

const deriveKey = promisify(scrypt)
export const WORKBENCH_SESSION_COOKIE = '__Host-plush-workbench-session'
export const WORKBENCH_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const digest = (value) => createHash('sha256').update(value).digest('hex')

export function safeWorkbenchReturnTo(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\r\n]/u.test(value)) return '/__dev'
  try {
    const url = new URL(value, 'https://workbench.invalid')
    const decoded = decodeURIComponent(url.pathname)
    if (url.origin !== 'https://workbench.invalid' ||
      !/^\/__dev(?:\/|$)/u.test(decoded) ||
      /^\/__dev\/(?:login|auth|api)(?:\/|$)/u.test(decoded) ||
      /[\\\r\n]/u.test(decoded)) return '/__dev'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/__dev'
  }
}

export async function hashWorkbenchPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 24 || password.length > 1024) {
    throw new Error('Workbench password must contain 24 to 1024 characters')
  }
  const key = await deriveKey(password, salt, 64)
  return `scrypt:${salt}:${key.toString('hex')}`
}

export function createWorkbenchSessionMiddleware({
  username = process.env.PLUSH_WORKBENCH_USERNAME,
  passwordHash = process.env.PLUSH_WORKBENCH_PASSWORD_HASH,
  now = Date.now,
  sessionTtlMs = WORKBENCH_SESSION_TTL_MS,
  onEvent = () => {},
} = {}) {
  const hashParts = typeof passwordHash === 'string'
    ? passwordHash.match(/^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/u) : null
  if (typeof username !== 'string' || !/^[A-Za-z0-9_.@-]{1,64}$/u.test(username) || !hashParts) {
    throw new Error('Workbench operator identity is missing or invalid')
  }
  const sessions = new Map()
  const failures = new Map()
  let globalAttempts = { count: 0, until: 0 }
  const cookie = (value, maxAge) => `${WORKBENCH_SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`

  return async (request, response, next) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('referrer-policy', 'same-origin')
    response.setHeader('x-frame-options', 'DENY')
    response.setHeader('x-robots-tag', 'noindex, nofollow')
    const url = new URL(request.url, 'https://workbench.invalid')
    // Cross-site document links may only open the public login page. They
    // cannot read a session, assets or tool APIs, even with a supplied cookie.
    const externalNavigation = request.method === 'GET' &&
      ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site']) &&
      request.headers['sec-fetch-mode'] === 'navigate' &&
      request.headers['sec-fetch-dest'] === 'document' &&
      String(request.headers.accept || '').includes('text/html') &&
      (url.pathname === '/' || /^\/__dev(?:\/|$)/u.test(url.pathname)) &&
      !/^\/__dev\/(?:api|auth)(?:\/|$)/u.test(url.pathname)
    if (externalNavigation && isDevWorkbenchProxyTransportRequest(request)) {
      if (url.pathname === '/__dev/login') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': WORKBENCH_LOGIN_CONTENT_SECURITY_POLICY,
        })
        response.end(renderWorkbenchLoginPage(safeWorkbenchReturnTo(url.searchParams.get('returnTo'))))
      } else {
        response.writeHead(303, { location: `/__dev/login?returnTo=${encodeURIComponent(safeWorkbenchReturnTo(request.url))}` })
        response.end()
      }
      return
    }
    // The login page uses this public brand asset; all tool resources still
    // require a session and every request retains the HTTPS/proxy boundary.
    if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/favicon-dev.svg' &&
      isDevWorkbenchProxyTransportRequest(request) && isDevWorkbenchHttpsRequest(request)) return next()
    if (!isDevWorkbenchRequest(request) || !isDevWorkbenchHttpsRequest(request)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('请通过工作台 HTTPS 域名访问')
      return
    }
    const time = now()
    for (const [key, session] of sessions) if (session.expiresAt <= time) sessions.delete(key)
    for (const [key, attempt] of failures) if (attempt.until <= time) failures.delete(key)
    const suppliedCookie = String(request.headers.cookie || '').split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${WORKBENCH_SESSION_COOKIE}=`))
    const sessionId = suppliedCookie.length === 1 ? suppliedCookie[0].slice(WORKBENCH_SESSION_COOKIE.length + 1) : ''
    const sessionKey = /^[a-f0-9]{64}$/u.test(sessionId) ? digest(sessionId) : ''
    const session = sessions.get(sessionKey)
    const html = (status, error = '', returnTo = url.searchParams.get('returnTo')) => {
      response.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': WORKBENCH_LOGIN_CONTENT_SECURITY_POLICY,
      })
      response.end(renderWorkbenchLoginPage(safeWorkbenchReturnTo(returnTo), error))
    }
    const redirect = (location) => {
      response.writeHead(303, { location })
      response.end()
    }
    if (url.pathname === '/__dev/login' && request.method === 'GET') {
      if (session) redirect(safeWorkbenchReturnTo(url.searchParams.get('returnTo')))
      else html(200)
      return
    }
    if (url.pathname === '/__dev/auth/login' && request.method === 'POST') {
      if (!isSameOriginRequest(request)) {
        response.writeHead(403); response.end('请从工作台登录页重试'); return
      }
      const address = request.headers['x-forwarded-for'] || request.socket.remoteAddress
      const attempt = failures.get(address) || { count: 0, until: time + LOGIN_WINDOW_MS }
      if (globalAttempts.until <= time) globalAttempts = { count: 0, until: time + LOGIN_WINDOW_MS }
      if (attempt.count >= 5 || globalAttempts.count >= 60 || (!failures.has(address) && failures.size >= 1024)) {
        response.setHeader('retry-after', '900')
        html(429, '登录尝试过多，请稍后再试'); return
      }
      attempt.count++; globalAttempts.count++; failures.set(address, attempt)
      let input
      try {
        if (String(request.headers['content-type'] || '').split(';')[0] === 'application/json') {
          input = await readJsonBody(request, { maxBytes: 8192, label: 'login' })
        } else if (String(request.headers['content-type'] || '').split(';')[0] === 'application/x-www-form-urlencoded') {
          let size = 0
          const chunks = []
          for await (const chunk of request) {
            size += chunk.length
            if (size > 8192) throw new Error('body too large')
            chunks.push(chunk)
          }
          const values = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
          if (['username', 'password', 'returnTo'].some((key) => values.getAll(key).length > 1)) throw new Error('duplicate field')
          input = Object.fromEntries(values)
        } else throw new Error('invalid content type')
      } catch {
        html(400, '登录信息无效，请重新填写'); return
      }
      const password = typeof input?.password === 'string' && input.password.length <= 1024 ? input.password : ''
      const suppliedKey = await deriveKey(password, hashParts[1], 64)
      const userMatches = timingSafeEqual(Buffer.from(digest(String(input?.username || ''))), Buffer.from(digest(username)))
      if (!timingSafeEqual(suppliedKey, Buffer.from(hashParts[2], 'hex')) || !userMatches) {
        onEvent('login_failed')
        html(401, '账号或密码不正确', input.returnTo); return
      }
      failures.delete(address)
      if (sessionKey) sessions.delete(sessionKey)
      if (sessions.size >= 1000) {
        html(503, '当前登录人数较多，请稍后再试'); return
      }
      const token = randomBytes(32).toString('hex')
      sessions.set(digest(token), { expiresAt: time + sessionTtlMs })
      response.setHeader('set-cookie', cookie(token, Math.ceil(sessionTtlMs / 1000)))
      onEvent('login_succeeded')
      redirect(safeWorkbenchReturnTo(input.returnTo))
      return
    }
    if (url.pathname === '/__dev/auth/logout' && request.method === 'POST') {
      if (!isSameOriginRequest(request)) {
        response.writeHead(403); response.end('请从工作台退出登录'); return
      }
      sessions.delete(sessionKey)
      response.setHeader('set-cookie', cookie('', 0))
      onEvent('logout')
      redirect('/__dev/login')
      return
    }
    if (!session) {
      if (sessionId) response.setHeader('set-cookie', cookie('', 0))
      const navigation = request.method === 'GET' && !url.pathname.startsWith('/__dev/api/') &&
        !url.pathname.startsWith('/__dev/auth/') && String(request.headers.accept || '').includes('text/html')
      if (navigation) redirect(`/__dev/login?returnTo=${encodeURIComponent(safeWorkbenchReturnTo(request.url))}`)
      else {
        response.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'x-plush-workbench-auth': 'required' })
        response.end(JSON.stringify({ code: 'workbench_login_required', message: '请登录研发效能工作台' }))
      }
      return
    }
    if (url.pathname === '/__dev/auth/session' && request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ username, expiresAt: new Date(session.expiresAt).toISOString() }))
      return
    }
    return next()
  }
}
