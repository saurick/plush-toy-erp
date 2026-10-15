import { createHash, timingSafeEqual } from 'node:crypto'
import {
  createDevHttpsProxyMiddleware,
  isDevWorkbenchHttpsRequest,
  isDevWorkbenchRequest,
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'
import { DEV_WEB_INSTANCE_PATH } from '../scripts/devWebInstance.mjs'
import { DEV_RUNTIME_STATUS_API_PATH } from '../src/dev-workbench/config/devRuntimeRecovery.mjs'

function credentialDigest(username, password) {
  return createHash('sha256').update(`${username}\0${password}`).digest()
}

function operatorCredentials() {
  return {
    username: process.env.PLUSH_DEV_OPERATOR_USERNAME,
    password: process.env.PLUSH_DEV_OPERATOR_PASSWORD,
  }
}

export function createDevOperatorAuthMiddleware({
  readCredentials = operatorCredentials,
  readAccessMode = () => process.env.PLUSH_DEV_WORKBENCH_ACCESS ?? 'operator',
} = {}) {
  return (request, response, next) => {
    let pathname
    try {
      pathname = new URL(
        decodeURIComponent((request.url || '/').split(/[?#]/u)[0]),
        'http://localhost'
      ).pathname
    } catch {
      response.statusCode = 400
      response.end('请求路径无效')
      return
    }
    if (pathname !== '/__dev' && !pathname.startsWith('/__dev/')) {
      return next()
    }
    // These readiness endpoints expose no operations or CSRF session. Their
    // own method/network checks remain responsible for startup and recovery.
    if ([DEV_WEB_INSTANCE_PATH, DEV_RUNTIME_STATUS_API_PATH].includes(pathname)) {
      return next()
    }
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'text/plain; charset=utf-8')
    if (
      !isDevWorkbenchRequest(request) ||
      (request.headers?.['sec-fetch-site'] !== undefined &&
        !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))
    ) {
      response.statusCode = 403
      response.end('请通过受控的安全连接访问开发工作台')
      return
    }
    const accessMode = readAccessMode()
    // Personal development can explicitly trust the checked private network;
    // each operation still enforces its own Origin, CSRF and confirmation.
    if (accessMode === 'private-network') return next()
    if (accessMode !== 'operator') {
      response.statusCode = 503
      response.end('开发工作台访问方式配置无效')
      return
    }
    const loopback =
      isLoopbackRemoteAddress(request.socket?.remoteAddress) &&
      isLoopbackHostHeader(request.headers?.host)
    if (!loopback && !isDevWorkbenchHttpsRequest(request)) {
      response.statusCode = 403
      response.end('请通过受控的安全连接访问开发工作台')
      return
    }
    const { username, password } = readCredentials() || {}
    if (
      typeof username !== 'string' ||
      !/^[A-Za-z0-9_.@-]{1,64}$/u.test(username) ||
      typeof password !== 'string' ||
      password.length < 24 ||
      password.length > 1024
    ) {
      response.statusCode = 503
      response.end('开发工作台运维身份尚未配置')
      return
    }
    const header = request.headers?.authorization
    let suppliedUsername = ''
    let suppliedPassword = ''
    if (
      typeof header === 'string' &&
      header.length <= 8192 &&
      /^Basic [A-Za-z0-9+/]+={0,2}$/iu.test(header)
    ) {
      const value = Buffer.from(header.slice(6), 'base64').toString('utf8')
      const separator = value.indexOf(':')
      if (separator > 0) {
        suppliedUsername = value.slice(0, separator)
        suppliedPassword = value.slice(separator + 1)
      }
    }
    if (
      !timingSafeEqual(
        credentialDigest(username, password),
        credentialDigest(suppliedUsername, suppliedPassword)
      )
    ) {
      response.statusCode = 401
      response.setHeader(
        'www-authenticate',
        'Basic realm="Plush development operations", charset="UTF-8"'
      )
      response.end('请使用独立运维身份登录开发工作台')
      return
    }
    next()
  }
}

export function createDevOperatorAuthPlugin(options = {}) {
  const proxy = options.httpsOrigin
    ? createDevHttpsProxyMiddleware(options.httpsOrigin)
    : null
  return {
    name: 'plush-dev-operator-auth',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      if (proxy) server.middlewares.use(proxy)
      server.middlewares.use(createDevOperatorAuthMiddleware(options))
    },
  }
}
