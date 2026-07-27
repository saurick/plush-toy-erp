import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  DEV_WORKBENCH_RECEIPT_GATES,
  getDevWorkbenchGitContext,
  validateDevWorkbenchReceipt,
} from '../scripts/qa/dev-workbench-receipt.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devQaCoveragePlugin.mjs'

export const DEV_WORKBENCH_RECEIPT_API_PATH = '/__dev/api/receipts'
export const MAX_DEV_WORKBENCH_RECEIPT_BYTES = 256 * 1024

export function resolveDevWorkbenchReceiptDirectory(projectRoot) {
  return path.join(
    path.resolve(projectRoot || process.cwd()),
    'output',
    'dev-workbench',
    'receipts'
  )
}

export function resolveDevWorkbenchReceiptPath(receiptDirectory, gate) {
  if (!DEV_WORKBENCH_RECEIPT_GATES.includes(gate)) {
    throw new Error(`unknown receipt gate: ${String(gate || '')}`)
  }
  return path.join(path.resolve(receiptDirectory), `${gate}-latest.json`)
}

export async function readDevWorkbenchReceipt(
  receiptPath,
  maxBytes = MAX_DEV_WORKBENCH_RECEIPT_BYTES
) {
  const noFollow = constants.O_NOFOLLOW || 0
  const handle = await open(receiptPath, constants.O_RDONLY + noFollow)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error('receipt is not a file')
    if (stats.size > maxBytes) throw new Error('receipt is too large')
    const content = await handle.readFile()
    if (content.byteLength > maxBytes) throw new Error('receipt is too large')
    return validateDevWorkbenchReceipt(JSON.parse(content.toString('utf8')))
  } finally {
    await handle.close()
  }
}

export function resolveReceiptFreshness(receipt, repository) {
  return receipt.gitCommit === repository.gitCommit &&
    receipt.treeState === repository.treeState
    ? 'current'
    : 'historical'
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

export function createDevWorkbenchReceiptMiddleware({
  projectRoot,
  maxReceiptBytes = MAX_DEV_WORKBENCH_RECEIPT_BYTES,
  readReceipt = readDevWorkbenchReceipt,
  readRepositoryState = getDevWorkbenchGitContext,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const receiptDirectory = resolveDevWorkbenchReceiptDirectory(root)

  return async (request, response, next) => {
    let requestPath = ''
    try {
      requestPath = new URL(request.url || '/', 'http://localhost').pathname
    } catch (_error) {
      next()
      return
    }
    if (requestPath !== DEV_WORKBENCH_RECEIPT_API_PATH) {
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
      const repository = await readRepositoryState(root)
      if (!/^[0-9a-f]{40}$/u.test(repository?.gitCommit || '')) {
        throw new Error('repository identity is unavailable')
      }
      const receipts = []
      const missingGates = []
      for (const gate of DEV_WORKBENCH_RECEIPT_GATES) {
        const receiptPath = resolveDevWorkbenchReceiptPath(
          receiptDirectory,
          gate
        )
        try {
          const receipt = await readReceipt(receiptPath, maxReceiptBytes)
          if (receipt.gate !== gate) {
            throw new Error('receipt gate does not match its fixed slot')
          }
          receipts.push({
            freshness: resolveReceiptFreshness(receipt, repository),
            receipt,
          })
        } catch (error) {
          if (error?.code === 'ENOENT') {
            missingGates.push(gate)
            continue
          }
          throw error
        }
      }
      if (receipts.length === 0) {
        sendJson(response, 200, {
          status: 'missing',
          message: '质量回执尚未生成',
          repository,
          receipts: [],
          missingGates,
        })
        return
      }
      sendJson(response, 200, {
        status: 'success',
        repository,
        receipts,
        missingGates,
      })
    } catch (_error) {
      sendJson(response, 500, {
        status: 'failed',
        message: '质量回执不可用，请重新执行正式门禁',
      })
    }
  }
}

export function createDevWorkbenchReceiptPlugin(options = {}) {
  return {
    name: 'plush-dev-workbench-receipts',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevWorkbenchReceiptMiddleware(options))
    },
  }
}
