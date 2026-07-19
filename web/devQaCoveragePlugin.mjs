import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

import {
  buildRepositoryFingerprint,
  readRepositoryIdentity,
} from '../scripts/qa/lib/repository-identity.mjs'

export { buildRepositoryFingerprint }

export const DEV_QA_COVERAGE_API_PATH = '/__dev/api/qa/coverage'
export const QA_COVERAGE_REPORT_SCHEMA = 'plush-test-coverage-report/v1'
export const MAX_QA_COVERAGE_REPORT_BYTES = 2 * 1024 * 1024

const FORBIDDEN_REPORT_KEYS = new Set([
  'accesstoken',
  'authorization',
  'cookie',
  'generatedby',
  'gitremote',
  'overallcoverage',
  'overallpercent',
  'password',
  'refreshtoken',
  'remote',
  'remoteaddress',
  'remoteurl',
  'reporoot',
  'repositoryurl',
  'token',
  'totalcoveragepercent',
  'username',
])

const normalizeKey = (value) =>
  String(value || '')
    .replace(/[^a-z0-9]/giu, '')
    .toLowerCase()

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

export function resolveDevQaCoverageReportPath(projectRoot) {
  return path.join(
    path.resolve(projectRoot || process.cwd()),
    'output',
    'qa',
    'coverage',
    'latest.json'
  )
}

export async function readCurrentRepositoryState(projectRoot) {
  return readRepositoryIdentity(path.resolve(projectRoot || process.cwd()))
}

export function resolveCoverageFreshness(report, currentRepository) {
  const repository = report?.repository
  return repository?.commit === currentRepository?.commit &&
    repository?.dirty === currentRepository?.dirty &&
    repository?.fingerprint === currentRepository?.fingerprint
    ? 'current'
    : 'stale'
}

const containsSensitiveString = (value) => {
  const text = String(value || '')
  if (
    /(?:^|[\s"'=])(Bearer\s+|ghp_|github_pat_|sk-[A-Za-z0-9]|xox[baprs]-)/iu.test(
      text
    )
  ) {
    return true
  }
  if (/(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\)/u.test(text)) return true
  if (path.isAbsolute(text)) return true
  if (/(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)(?:\/|$)/u.test(text)) {
    return true
  }

  if (/(?:^|[\s"'=])[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return true
  if (/(?:^|[\s"'=])[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:.+/u.test(text)) {
    return true
  }
  return false
}

const assertSafeReportValue = (value, key = '', depth = 0) => {
  if (depth > 64) throw new Error('report nesting exceeds limit')
  if (typeof value === 'string') {
    if (containsSensitiveString(value)) {
      throw new Error('report contains restricted data')
    }
    return
  }
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeReportValue(item, key, depth + 1))
    return
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.has(normalizeKey(childKey))) {
      throw new Error('report contains restricted data')
    }
    assertSafeReportValue(childValue, childKey, depth + 1)
  }
}

export function validateQaCoverageReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('report must be an object')
  }
  if (report.schemaVersion !== QA_COVERAGE_REPORT_SCHEMA) {
    throw new Error('report schema is unsupported')
  }
  const { repository } = report
  if (
    !repository ||
    typeof repository !== 'object' ||
    Array.isArray(repository) ||
    !/^[0-9a-f]{40,64}$/u.test(repository.commit || '') ||
    typeof repository.dirty !== 'boolean' ||
    !/^[0-9a-f]{64}$/u.test(repository.fingerprint || '')
  ) {
    throw new Error('report repository state is invalid')
  }
  assertSafeReportValue(report)
  return report
}

export async function readQaCoverageReport(
  reportPath,
  maxBytes = MAX_QA_COVERAGE_REPORT_BYTES
) {
  const noFollow = constants.O_NOFOLLOW || 0
  const handle = await open(reportPath, constants.O_RDONLY + noFollow)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error('coverage report is not a file')
    if (stats.size > maxBytes) throw new Error('coverage report is too large')
    const content = await handle.readFile()
    if (content.byteLength > maxBytes) {
      throw new Error('coverage report is too large')
    }
    return validateQaCoverageReport(JSON.parse(content.toString('utf8')))
  } finally {
    await handle.close()
  }
}

const sendJson = (response, statusCode, payload, extraHeaders = {}) => {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('x-content-type-options', 'nosniff')
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value)
  }
  response.end(JSON.stringify(payload))
}

export function createDevQaCoverageMiddleware({
  projectRoot,
  maxReportBytes = MAX_QA_COVERAGE_REPORT_BYTES,
  readReport = readQaCoverageReport,
  readRepositoryState = readCurrentRepositoryState,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const reportPath = resolveDevQaCoverageReportPath(root)

  return async (request, response, next) => {
    let requestPath = ''
    try {
      requestPath = new URL(request.url || '/', 'http://localhost').pathname
    } catch (_error) {
      next()
      return
    }
    if (requestPath !== DEV_QA_COVERAGE_API_PATH) {
      next()
      return
    }

    if (
      !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
      !isLoopbackHostHeader(request.headers?.host)
    ) {
      sendJson(response, 403, {
        status: 'failed',
        message: '该开发接口仅允许本机访问',
      })
      return
    }
    if (request.method !== 'GET') {
      sendJson(
        response,
        405,
        { status: 'failed', message: '该开发接口仅支持 GET' },
        { allow: 'GET' }
      )
      return
    }

    try {
      const report = await readReport(reportPath, maxReportBytes)
      const currentRepository = await readRepositoryState(root)
      sendJson(response, 200, {
        status: resolveCoverageFreshness(report, currentRepository),
        report,
      })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        sendJson(response, 404, {
          status: 'missing',
          message: '覆盖率报告尚未生成',
        })
        return
      }
      sendJson(response, 500, {
        status: 'failed',
        message: '覆盖率报告不可用，请重新生成',
      })
    }
  }
}

export function createDevQaCoveragePlugin(options = {}) {
  return {
    name: 'plush-dev-qa-coverage',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevQaCoverageMiddleware(options))
    },
  }
}
