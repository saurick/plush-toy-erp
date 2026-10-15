import net from 'node:net'

const TRUSTED_HTTPS_ORIGIN = Symbol('trusted-dev-https-origin')

export function normalizeDevHttpsOrigin(value) {
  if (value === undefined || value === '') return ''
  try {
    const origin = new URL(value)
    if (
      typeof value !== 'string' ||
      origin.protocol !== 'https:' ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(origin.hostname) ||
      !origin.hostname.includes('.') ||
      net.isIP(origin.hostname) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      throw new Error('invalid origin')
    }
    return origin.origin
  } catch {
    throw new Error('PLUSH_DEV_HTTPS_ORIGIN must be one HTTPS domain origin without credentials, path, query or fragment')
  }
}

export function createDevHttpsProxyMiddleware(value) {
  const origin = normalizeDevHttpsOrigin(value)
  const host = origin ? new URL(origin).host : ''
  return (request, response, next) => {
    delete request[TRUSTED_HTTPS_ORIGIN]
    // The configured local proxy must overwrite both headers and restrict its
    // clients to the private network. Remote callers cannot assert proxy trust.
    if (
      origin &&
      isLoopbackRemoteAddress(request.socket?.remoteAddress) &&
      isLoopbackRemoteAddress(request.socket?.localAddress) &&
      typeof request.headers?.host === 'string' &&
      request.headers.host.toLowerCase() === host &&
      request.headers?.['x-forwarded-proto'] === 'https' &&
      typeof request.headers?.['x-forwarded-for'] === 'string' &&
      privateIPv4Address(request.headers['x-forwarded-for']) &&
      hasSameOriginMetadata(request, origin)
    ) {
      request[TRUSTED_HTTPS_ORIGIN] = origin
    }
    return next()
  }
}

function isTrustedHttpsProxyRequest(request) {
  const origin = request[TRUSTED_HTTPS_ORIGIN]
  return Boolean(origin && hasSameOriginMetadata(request, origin))
}

export function isDevWorkbenchHttpsRequest(request) {
  return Boolean(
    request.socket?.encrypted || isTrustedHttpsProxyRequest(request)
  )
}

const isLoopbackIPv4 = (value) =>
  net.isIP(value) === 4 && Number(value.split('.')[0]) === 127

const isMappedLoopbackIPv4 = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const match = normalized.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f:.]+)$/u)
  if (!match) return false

  const mapped = match[1]
  if (isLoopbackIPv4(mapped)) return true

  const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u)
  if (!hexMatch) return false
  const highWord = Number.parseInt(hexMatch[1], 16)
  return Math.floor(highWord / 256) === 127
}

export function isLoopbackRemoteAddress(value) {
  const address = String(value || '')
    .trim()
    .toLowerCase()
  return (
    address === '::1' ||
    isLoopbackIPv4(address) ||
    isMappedLoopbackIPv4(address)
  )
}

const isValidPort = (value) => {
  if (value === undefined) return true
  if (!/^\d{1,5}$/u.test(value)) return false
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

export function isLoopbackHostHeader(value) {
  if (Array.isArray(value)) return false
  const host = String(value || '')
    .trim()
    .toLowerCase()
  if (!host || /[\s,/@#?]/u.test(host)) return false

  const ipv6Match = host.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/u)
  if (ipv6Match) {
    return ipv6Match[1] === '::1' && isValidPort(ipv6Match[2])
  }

  const match = host.match(/^([^:]+)(?::(\d{1,5}))?$/u)
  if (!match || !isValidPort(match[2])) return false
  return match[1] === 'localhost' || isLoopbackIPv4(match[1])
}

export function isSameOriginRequest(request) {
  const host = request.headers?.host
  const origin = request.headers?.origin
  const localNetwork =
    isLocalNetworkRequest(request) || isTrustedHttpsProxyRequest(request)
  if (
    Array.isArray(host) ||
    Array.isArray(origin) ||
    (!isLoopbackHostHeader(host) && !localNetwork) ||
    typeof origin !== 'string'
  ) {
    return false
  }
  try {
    const parsed = new URL(origin)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.host.toLowerCase() === String(host).toLowerCase() &&
      (isLoopbackHostHeader(parsed.host) || localNetwork) &&
      (!localNetwork ||
        parsed.protocol ===
          (isDevWorkbenchHttpsRequest(request) ? 'https:' : 'http:')) &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      (request.headers?.['sec-fetch-site'] === 'same-origin' ||
        (localNetwork && request.headers?.['sec-fetch-site'] === undefined))
    )
  } catch {
    return false
  }
}

function privateIPv4Address(value) {
  const address = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:::ffff:|0:0:0:0:0:ffff:)/u, '')
  if (net.isIP(address) !== 4) return ''
  const [first, second] = address.split('.').map(Number)
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
    ? address
    : ''
}

function isLocalNetworkRequest(request) {
  const host = request.headers?.host
  if (typeof host !== 'string') return false
  const match = host.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/u)
  if (!match || !isValidPort(match[2])) return false
  const localAddress = privateIPv4Address(request.socket?.localAddress)
  const protocol = request.socket?.encrypted ? 'https:' : 'http:'
  const port = Number(match[2] || (protocol === 'https:' ? 443 : 80))
  if (
    !localAddress ||
    match[1] !== localAddress ||
    port !== request.socket?.localPort ||
    (!isLoopbackRemoteAddress(request.socket?.remoteAddress) &&
      !privateIPv4Address(request.socket?.remoteAddress))
  ) {
    return false
  }
  return hasSameOriginMetadata(request, new URL(`${protocol}//${host}`).origin)
}

function hasSameOriginMetadata(request, expectedOrigin) {
  const fetchSite = request.headers?.['sec-fetch-site']
  if (fetchSite !== undefined && !['same-origin', 'none'].includes(fetchSite)) {
    return false
  }
  for (const name of ['origin', 'referer']) {
    const value = request.headers?.[name]
    if (value === undefined) continue
    if (typeof value !== 'string') return false
    try {
      const source = new URL(value)
      if (
        source.origin !== expectedOrigin ||
        source.username ||
        source.password ||
        (name === 'origin' &&
          (source.pathname !== '/' || source.search || source.hash))
      ) {
        return false
      }
    } catch {
      return false
    }
  }
  return true
}

export function isLocalNetworkReadRequest(request) {
  return (
    request.method === 'GET' &&
    (isLocalNetworkRequest(request) || isTrustedHttpsProxyRequest(request))
  )
}

export function isDevWorkbenchRequest(request) {
  return (
    (isLoopbackRemoteAddress(request.socket?.remoteAddress) &&
      isLoopbackHostHeader(request.headers?.host)) ||
    (['GET', 'POST'].includes(request.method) &&
      (isLocalNetworkRequest(request) || isTrustedHttpsProxyRequest(request)))
  )
}

export async function readJsonBody(request, { maxBytes, label = 'request' }) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > maxBytes) {
      throw new Error(`${label} body is too large`)
    }
    chunks.push(bytes)
  }
  if (size === 0) throw new Error(`${label} body is required`)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
