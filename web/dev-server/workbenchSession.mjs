import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
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
const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

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

function loginPage(returnTo, error = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>登录 · 研发效能工作台</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px;background:#f4f6f9;color:#172a40;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}main{width:100%;max-width:420px;padding:40px;background:white;border:1px solid #e2e7ef;border-radius:16px;box-shadow:0 12px 40px #172a4008}.mark{display:grid;place-items:center;width:44px;height:44px;background:#e9f1ff;color:#2563b4;border-radius:12px;font-size:22px;font-weight:600}h1{font-size:24px;line-height:1.4;margin:24px 0 8px}p{margin:0 0 28px;color:#66758a}label{display:block;margin:18px 0 7px;font-weight:500}input,button{width:100%;font:inherit;border-radius:8px;min-height:44px}input{border:1px solid #bbc6d5;padding:9px 12px;color:#172a40;background:#fff}input:focus-visible,button:focus-visible{outline:3px solid #b8d5ff;outline-offset:2px}button{border:0;margin-top:26px;padding:10px 16px;background:#3275c7;color:#fff;font-weight:600;cursor:pointer}button:hover{background:#2465b2}.error{margin:18px 0 0;color:#b42318;background:#fef3f2;padding:10px 12px;border-radius:8px}.hint{font-size:14px;margin:22px 0 0;color:#718096}
</style></head><body><main><div class="mark" aria-hidden="true">&lt;/&gt;</div><h1>研发效能工作台</h1><p>登录后查看项目、验证与交付情况</p><form method="post" action="/__dev/auth/login"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><label for="username">运维账号</label><input id="username" name="username" autocomplete="username" maxlength="64" required autofocus><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}<button type="submit">登录工作台</button></form><p class="hint">请使用工作台专用账号</p></main></body></html>`
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
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        })
        response.end(loginPage(safeWorkbenchReturnTo(url.searchParams.get('returnTo'))))
      } else {
        response.writeHead(303, { location: `/__dev/login?returnTo=${encodeURIComponent(safeWorkbenchReturnTo(request.url))}` })
        response.end()
      }
      return
    }
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
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      })
      response.end(loginPage(safeWorkbenchReturnTo(returnTo), error))
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
