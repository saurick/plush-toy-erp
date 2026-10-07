import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { readRepositoryIdentity } from '../../scripts/qa/lib/repository-identity.mjs'
import {
  CHAIN_AUDIT_BATCH_PATTERN,
  DEV_CHAIN_AUDIT_API,
  chainAuditFreshness,
  validateBusinessChainReport,
} from '../src/dev-workbench/config/devBusinessChainAudit.mjs'
import { isDevWorkbenchRequest } from './devServerSecurity.mjs'
import {
  buildManualAcceptanceBusinessChainContract,
  compareBusinessChainReportDefinition,
  validateBusinessChainDefinitionSnapshot,
  buildBusinessChainReportDiagram,
} from '../../scripts/qa/manual-acceptance-business-chain-contract.mjs'

const REPORT_DIRECTORY = 'output/qa/business-chain-audit'
const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
const CONTENT_TYPES = Object.freeze({
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
})

function invalid(
  message = '报告文件不完整或已变化，请核对原始批次',
  statusCode = 422
) {
  return Object.assign(new Error(message), { statusCode })
}
function safeRelative(value) {
  return (
    typeof value === 'string' &&
    value.length <= 1024 &&
    !/[\\:%?#]/u.test(value) &&
    !Array.from(value).some(
      (char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127
    ) &&
    value.split('/').every((part) => part && !part.startsWith('.'))
  )
}
async function checkedPath(root, relative, directory = false) {
  if (!safeRelative(relative)) throw invalid('证据路径无效', 400)
  let candidate = root
  const parts = relative.split('/')
  for (let i = 0; i < parts.length; i += 1) {
    candidate = path.join(candidate, parts[i])
    const info = await lstat(candidate)
    if (
      info.isSymbolicLink() ||
      (i < parts.length - 1 || directory ? !info.isDirectory() : !info.isFile())
    ) {
      throw invalid()
    }
  }
  if ((await realpath(candidate)) !== candidate) throw invalid()
  return candidate
}
async function readFile(root, relative, maxBytes = MAX_JSON_BYTES) {
  const file = await checkedPath(root, relative)
  const before = await lstat(file)
  if (before.size > maxBytes) throw invalid('证据文件超过读取上限', 413)
  const handle = await open(
    file,
    constants.O_RDONLY + (constants.O_NOFOLLOW || 0) + constants.O_NONBLOCK
  )
  try {
    const info = await handle.stat()
    if (
      !info.isFile() ||
      info.ino !== before.ino ||
      info.dev !== before.dev ||
      info.size !== before.size
    ) {
      throw invalid()
    }
    const buffer = Buffer.alloc(info.size + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size,
        null
      )
      if (!bytesRead) break
      size += bytesRead
    }
    const after = await handle.stat()
    if (
      size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      after.size !== info.size ||
      (await realpath(file)) !== file
    ) {
      throw invalid()
    }
    return buffer.subarray(0, size)
  } finally {
    await handle.close()
  }
}
async function readJson(root, relative) {
  return JSON.parse((await readFile(root, relative)).toString('utf8'))
}
function verifyBytes(bytes, entry) {
  if (
    bytes.length !== entry.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== entry.sha256
  ) {
    throw invalid()
  }
}
function artifactEntry(entry) {
  return (
    safeRelative(entry?.path) &&
    Object.hasOwn(CONTENT_TYPES, path.extname(entry.path)) &&
    Number.isSafeInteger(entry.bytes) &&
    entry.bytes >= 0 &&
    entry.bytes <= MAX_ARTIFACT_BYTES &&
    /^[a-f0-9]{64}$/u.test(entry.sha256 || '')
  )
}
async function batchDirectory(root, batch) {
  if (!CHAIN_AUDIT_BATCH_PATTERN.test(batch || '')) {
    throw invalid('批次标识无效', 400)
  }
  return checkedPath(root, `${REPORT_DIRECTORY}/${batch}`, true)
}
async function readBatch(root, batch) {
  const directory = await batchDirectory(root, batch)
  const manifest = await readJson(directory, 'artifact-manifest.json')
  if (!Array.isArray(manifest.files) || manifest.files.length > 3000) {
    throw invalid()
  }
  const files = manifest.files
    .filter(artifactEntry)
    .map(({ path: file, bytes, sha256 }) => ({ path: file, bytes, sha256 }))
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw invalid()
  }
  const reportEntry = files.find((file) => file.path === 'report.json')
  if (!reportEntry) throw invalid()
  const bytes = await readFile(directory, 'report.json')
  verifyBytes(bytes, reportEntry)
  const report = validateBusinessChainReport(JSON.parse(bytes.toString('utf8')))
  if (Object.hasOwn(report, 'definitionSnapshot')) {
    validateBusinessChainDefinitionSnapshot(
      report.definitionSnapshot,
      report.chains
    )
  }
  // The archive receipt lives beside the archive so it can bind the completed ZIP.
  try {
    const bundle = await readJson(directory, 'bundle-receipt.json')
    const entry = {
      path: bundle.archive,
      bytes: bundle.bytes,
      sha256: bundle.sha256,
    }
    if (
      artifactEntry(entry) &&
      path.extname(entry.path) === '.zip' &&
      !files.some((file) => file.path === entry.path)
    ) {
      files.push(entry)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return { directory, report, files }
}

export function createDevBusinessChainAuditService({
  projectRoot,
  readIdentity = readRepositoryIdentity,
} = {}) {
  const root = () => realpath(path.resolve(projectRoot || process.cwd()))
  return {
    async list() {
      const project = await root()
      let directory
      try {
        directory = await checkedPath(project, REPORT_DIRECTORY, true)
      } catch (error) {
        if (error.code === 'ENOENT') return { batches: [] }
        throw error
      }
      const entries = await readdir(directory, { withFileTypes: true })
      const batches = []
      const candidates = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          CHAIN_AUDIT_BATCH_PATTERN.test(entry.name)
      )
      if (candidates.length > 200) {
        throw invalid('报告批次超过读取上限，请归档历史批次', 413)
      }
      for (const entry of candidates) {
        try {
          const { report } = await readBatch(project, entry.name)
          batches.push({
            id: entry.name,
            status: 'ready',
            title: report.title,
            generatedAt: report.generatedAt,
            sourceCommit: report.scope.sourceCommit,
          })
        } catch {
          batches.push({
            id: entry.name,
            status: 'invalid',
            message: '报告缺失、损坏或证据摘要不匹配',
          })
        }
      }
      batches.sort((a, b) =>
        String(b.generatedAt || b.id).localeCompare(
          String(a.generatedAt || a.id)
        )
      )
      return { batches }
    },
    async report(batch) {
      const project = await root()
      const { report, files } = await readBatch(project, batch)
      const currentRepository = await readIdentity(project).catch(() => null)
      const currentDefinition =
        buildManualAcceptanceBusinessChainContract().definitionSnapshot
      const { git: _git, scope, ...observations } = report
      const {
        frozenCopy: _frozenCopy,
        sourceWorkspace: _sourceWorkspace,
        ...publicScope
      } = scope
      return {
        batch,
        report: { ...observations, scope: publicScope },
        files,
        currentRepository,
        freshness: chainAuditFreshness(report, currentRepository),
        definitionComparison: compareBusinessChainReportDefinition(
          report,
          currentDefinition
        ),
        definitionDiagram: buildBusinessChainReportDiagram(report),
      }
    },
    async artifact(batch, file) {
      const project = await root()
      if (!safeRelative(file)) throw invalid('证据路径无效', 400)
      const { directory, files } = await readBatch(project, batch)
      const entry = files.find((item) => item.path === file)
      if (!entry) throw invalid('该文件不在报告证据清单中', 404)
      const bytes = await readFile(directory, entry.path, MAX_ARTIFACT_BYTES)
      verifyBytes(bytes, entry)
      return {
        bytes,
        contentType: CONTENT_TYPES[path.extname(file)],
        filename: path.basename(file),
      }
    },
  }
}

function sendJson(response, statusCode, value) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(value))
}

export function createDevBusinessChainAuditMiddleware(options) {
  const service = createDevBusinessChainAuditService(options)
  return async (request, response, next) => {
    const url = new URL(request.url || '/', 'http://localhost')
    if (
      url.pathname !== DEV_CHAIN_AUDIT_API &&
      !url.pathname.startsWith(`${DEV_CHAIN_AUDIT_API}/`)
    ) {
      return next()
    }
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('referrer-policy', 'no-referrer')
    if (
      !isDevWorkbenchRequest(request) ||
      (request.headers?.['sec-fetch-site'] &&
        !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))
    ) {
      return sendJson(response, 403, {
        message: '请通过开发工作台的受控连接访问',
      })
    }
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET')
      return sendJson(response, 405, { message: '链路报告仅支持读取' })
    }
    try {
      const allowed = url.pathname.endsWith('/artifact')
        ? ['batch', 'file']
        : url.pathname.endsWith('/report')
          ? ['batch']
          : []
      if (
        [...url.searchParams.keys()].some(
          (key) =>
            !allowed.includes(key) || url.searchParams.getAll(key).length !== 1
        )
      ) {
        throw invalid('查询参数无效', 400)
      }
      if (url.pathname === DEV_CHAIN_AUDIT_API) {
        return sendJson(response, 200, await service.list())
      }
      if (url.pathname === `${DEV_CHAIN_AUDIT_API}/report`) {
        return sendJson(
          response,
          200,
          await service.report(url.searchParams.get('batch'))
        )
      }
      if (url.pathname === `${DEV_CHAIN_AUDIT_API}/artifact`) {
        const artifact = await service.artifact(
          url.searchParams.get('batch'),
          url.searchParams.get('file')
        )
        response.statusCode = 200
        response.setHeader('content-type', artifact.contentType)
        response.setHeader('content-length', artifact.bytes.length)
        response.setHeader(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename).replace(/'/gu, '%27')}`
        )
        response.setHeader(
          'content-security-policy',
          "sandbox; default-src 'none'"
        )
        return response.end(artifact.bytes)
      }
      return sendJson(response, 404, { message: '报告入口不存在' })
    } catch (error) {
      const missing = error.code === 'ENOENT'
      return sendJson(response, missing ? 404 : error.statusCode || 422, {
        message: missing
          ? '报告或证据文件不存在'
          : error.statusCode
            ? error.message
            : '报告读取失败，请核对批次格式与证据清单',
      })
    }
  }
}

export function createDevBusinessChainAuditPlugin(options) {
  return {
    name: 'plush-dev-business-chain-audit',
    configureServer(server) {
      server.middlewares.use(createDevBusinessChainAuditMiddleware(options))
    },
  }
}
