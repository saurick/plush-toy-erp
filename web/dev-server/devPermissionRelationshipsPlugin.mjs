import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { readLocalRuntimeEnvironment } from '../../scripts/local-runtime-bundle.mjs'
import {
  configuredDatabaseURL,
  readLocalDatabaseRoles,
  verifyAuditRole,
} from '../../scripts/local-database-roles.mjs'
import {
  DEV_PERMISSION_RELATIONSHIPS_API,
  validatePermissionRelationshipSnapshot,
} from '../src/dev-workbench/config/devPermissionRelationshipApi.mjs'
import {
  isDevWorkbenchRequest,
  isSameOriginRequest,
} from './devServerSecurity.mjs'

const exec = promisify(execFile)

async function resolveLocalAuditDSN(projectRoot) {
  const configured = await configuredDatabaseURL(projectRoot)
  const roles = readLocalDatabaseRoles(projectRoot, configured)
  await verifyAuditRole(roles.audit)
  return roles.audit
}

export async function readLocalPermissionRelationships(
  projectRoot,
  {
    run = exec,
    readEnvironment = readLocalRuntimeEnvironment,
    resolveAuditDSN = resolveLocalAuditDSN,
  } = {}
) {
  const environment = readEnvironment(projectRoot)
  const dsn = await resolveAuditDSN(projectRoot)
  const options = {
    cwd: path.join(projectRoot, 'server'),
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024,
  }
  // Resolve the same local configuration as the development lifecycle. Secrets
  // remain in the server process; neither requests nor responses carry a DSN.
  const result = await run(
    'go',
    ['run', './cmd/dev-permission-relationships'],
    {
      ...options,
      env: {
        ...options.env,
        POSTGRES_DSN: dsn,
        ERP_CUSTOMER_KEY: environment.ERP_CUSTOMER_KEY,
      },
    }
  )
  return validatePermissionRelationshipSnapshot(JSON.parse(result.stdout))
}

export function createDevPermissionRelationshipsPlugin({
  projectRoot,
  readSnapshot = () => readLocalPermissionRelationships(projectRoot),
} = {}) {
  return {
    name: 'plush-dev-permission-relationships',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost')
        if (url.pathname !== DEV_PERMISSION_RELATIONSHIPS_API) return next()
        const reply = (status, value) => {
          response.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          })
          response.end(JSON.stringify(value))
        }
        if (
          !isDevWorkbenchRequest(request) ||
          (request.headers.origin && !isSameOriginRequest(request)) ||
          (request.headers['sec-fetch-site'] &&
            !['same-origin', 'none'].includes(
              request.headers['sec-fetch-site']
            ))
        ) {
          reply(403, { message: '请从受控的开发工作台入口读取权限关系' })
          return
        }
        if (request.method !== 'GET') {
          response.setHeader('allow', 'GET')
          reply(405, { message: '权限关系仅支持只读查询' })
          return
        }
        if (
          url.search ||
          request.headers['transfer-encoding'] ||
          (request.headers['content-length'] &&
            request.headers['content-length'] !== '0')
        ) {
          reply(400, { message: '权限关系查询不接受目标或操作参数' })
          return
        }
        try {
          reply(
            200,
            validatePermissionRelationshipSnapshot(await readSnapshot())
          )
        } catch {
          reply(503, {
            message: '本地开发权限数据暂不可用，请检查开发服务与数据库后重试',
          })
        }
      })
    },
  }
}
