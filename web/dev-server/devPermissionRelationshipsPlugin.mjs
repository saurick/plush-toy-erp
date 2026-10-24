import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { readLocalRuntimeEnvironment } from '../../scripts/local-runtime-bundle.mjs'
import {
  configuredDatabaseURL,
  assertRegisteredDatabase,
  DEVELOPMENT_TARGETS,
  LOCAL_DATABASE_ROLE_PREFIX,
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

export async function readStandalonePermissionRelationships(projectRoot, {
  env = process.env,
  run = exec,
  verifyRole = verifyAuditRole,
} = {}) {
  const file = env.PLUSH_WORKBENCH_PERMISSION_AUDIT_DSN_FILE
  if (!file || !path.isAbsolute(file)) throw new Error('permission audit credential is not configured')
  const handle = await open(file, constants.O_RDONLY + constants.O_NOFOLLOW)
  let dsn
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || ![0o400, 0o600].includes(stat.mode % 0o1000) ||
        stat.uid !== process.getuid() || stat.size > 4096) {
      throw new Error('permission audit credential is not a private regular file')
    }
    dsn = (await handle.readFile('utf8')).trim()
  } finally {
    await handle.close()
  }
  const url = assertRegisteredDatabase(dsn)
  // The standalone workbench reads the registered shared development database,
  // never a customer test/production database or an application credential.
  if (url.hostname !== DEVELOPMENT_TARGETS.shared.host || decodeURIComponent(url.username) !== `${LOCAL_DATABASE_ROLE_PREFIX}_backup`) {
    throw new Error('permission audit credential does not identify the registered reader')
  }
  await verifyRole(dsn)
  const binary = path.join(projectRoot, 'toolchain/bin/dev-permission-relationships')
  const binaryStat = await lstat(binary)
  if (!binaryStat.isFile() || binaryStat.isSymbolicLink()) throw new Error('permission reader artifact is unavailable')
  const result = await run(binary, [], {
    cwd: path.join(projectRoot, 'server'),
    env: { PATH: env.PATH, POSTGRES_DSN: dsn, ERP_CUSTOMER_KEY: readLocalRuntimeEnvironment(projectRoot, env).ERP_CUSTOMER_KEY, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8',
    timeout: 40_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return validatePermissionRelationshipSnapshot(JSON.parse(result.stdout))
}

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
  onDiagnostic = () => {},
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
          onDiagnostic({ event: 'permission_relationships', outcome: 'unavailable', requestId: response.getHeader?.('x-request-id') || null })
          reply(503, {
            message: '登记开发库的权限数据暂不可用，请检查只读查询配置后重试',
          })
        }
      })
    },
  }
}
