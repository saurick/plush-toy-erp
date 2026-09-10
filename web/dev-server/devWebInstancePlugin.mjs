import { DEV_WEB_INSTANCE_PATH } from '../scripts/devWebInstance.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'

export function createDevWebInstancePlugin({
  isRecoveryActive,
  signature = process.env.ERP_DEV_START_SIGNATURE || '',
}) {
  return {
    name: 'plush-dev-web-instance',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
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
