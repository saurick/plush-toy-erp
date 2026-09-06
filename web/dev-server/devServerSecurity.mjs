import net from 'node:net'

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
  if (
    Array.isArray(host) ||
    Array.isArray(origin) ||
    !isLoopbackHostHeader(host) ||
    typeof origin !== 'string'
  ) {
    return false
  }
  try {
    const parsed = new URL(origin)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.host.toLowerCase() === String(host).toLowerCase() &&
      isLoopbackHostHeader(parsed.host) &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      request.headers?.['sec-fetch-site'] === 'same-origin'
    )
  } catch {
    return false
  }
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
