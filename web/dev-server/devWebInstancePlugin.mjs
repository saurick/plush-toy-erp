import path from 'node:path'
import {
  DEV_WEB_INSTANCE_PATH,
  runtimeSourceSignature,
} from '../scripts/devWebInstance.mjs'
import { DEV_DATABASE_MIGRATION_ACTION_API_PATH } from '../src/dev-workbench/config/devDatabaseMigration.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..')
// Node caches these plugins across Vite config reloads. Only a new process may
// acknowledge changed control code as loaded and resume migration actions.
const LOADED_RUNTIME_SOURCE = runtimeSourceSignature(PROJECT_ROOT)

export function createDevWebInstancePlugin({
  isRecoveryActive,
  signature = process.env.ERP_DEV_START_SIGNATURE || '',
  loadedRuntimeSource = LOADED_RUNTIME_SOURCE,
  readRuntimeSource = () => runtimeSourceSignature(PROJECT_ROOT),
}) {
  return {
    name: 'plush-dev-web-instance',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let requestPath
        try {
          requestPath = new URL(request.url || '/', 'http://localhost').pathname
        } catch {
          return next()
        }
        if (
          request.method === 'POST' &&
          requestPath === DEV_DATABASE_MIGRATION_ACTION_API_PATH
        ) {
          let sourceCurrent = false
          try {
            sourceCurrent = readRuntimeSource() === loadedRuntimeSource
          } catch {
            // Unreadable control code cannot prove this process is current.
          }
          if (!sourceCurrent) {
            response.statusCode = 409
            response.setHeader('cache-control', 'no-store')
            response.setHeader(
              'content-type',
              'application/json; charset=utf-8'
            )
            response.end(
              JSON.stringify({
                status: 'failed',
                code: 'dev_runtime_source_changed',
                message:
                  '当前开发服务代码已更新或无法核对，请在原前端终端停止并重新运行启动命令，再刷新页面。本次未停止后端或执行迁移。',
              })
            )
            return
          }
        }
        if (request.url !== DEV_WEB_INSTANCE_PATH) return next()
        response.setHeader('cache-control', 'no-store')
        response.setHeader('content-type', 'application/json; charset=utf-8')
        if (
          request.method !== 'GET' ||
          !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
          !isLoopbackHostHeader(request.headers.host)
        ) {
          response.statusCode = 403
          response.end('{}')
          return
        }
        response.end(
          JSON.stringify({
            kind: 'plush-web-dev',
            pid: process.pid,
            signature,
            recovery: isRecoveryActive(),
          })
        )
      })
    },
  }
}
