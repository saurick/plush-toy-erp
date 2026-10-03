import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { createDevQaTestingMiddleware } from './devQaTestingPlugin.mjs'
import { createDevQaCoverageMiddleware } from './devQaCoveragePlugin.mjs'
import { createDevQualityGateMiddleware } from './devQualityGatePlugin.mjs'
import { createDevDataPreparationMiddleware } from './devDataPreparationPlugin.mjs'
import { createDevDeliveryMiddleware } from './devDeliveryBridgePlugin.mjs'
import { createDevDatabaseMigrationMiddleware } from './devDatabaseMigrationPlugin.mjs'
import { createDevCustomerConfigMiddleware } from './devCustomerImportDryRunPlugin.mjs'
import { DEV_QUALITY_GATE_PROFILES } from '../src/dev-workbench/config/devQualityGates.mjs'
import { createDevOperatorAuthMiddleware } from './devOperatorAuthPlugin.mjs'
import { createDevHttpsProxyMiddleware } from './devServerSecurity.mjs'

const ID = '11111111-1111-4111-8111-111111111111'
const ORIGIN = 'http://192.168.0.133:15200'
const TOKEN = 'network-test-token'
const repository = { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) }
const cases = [
  {
    name: 'testing',
    make: createDevQaTestingMiddleware,
    base: '/__dev/api/qa/testing',
    read: '',
    action: {
      action: 'fast',
      payload: { idempotencyKey: `testing:fast:${ID}` },
    },
  },
  {
    name: 'coverage',
    make: createDevQaCoverageMiddleware,
    base: '/__dev/api/qa/coverage',
    read: '',
    action: {
      action: 'collect',
      payload: { idempotencyKey: `coverage:collect:baseline:${ID}` },
    },
  },
  {
    name: 'quality',
    make: createDevQualityGateMiddleware,
    base: '/__dev/api/qa/quality-gates',
    read: '',
    action: {
      action: 'run',
      payload: {
        profile: DEV_QUALITY_GATE_PROFILES[0],
        idempotencyKey: `quality-gate:${DEV_QUALITY_GATE_PROFILES[0]}:${ID}`,
      },
    },
  },
  {
    name: 'data',
    make: createDevDataPreparationMiddleware,
    base: '/__dev/api/data-preparation',
    read: '/summary',
    action: {
      action: 'prepare',
      payload: {
        profileKey: 'core-demo',
        targetKey: 'local-development',
        idempotencyKey: `data-preparation:prepare:core-demo:local-development:${ID}`,
      },
    },
  },
  {
    name: 'delivery',
    make: createDevDeliveryMiddleware,
    base: '/__dev/api/delivery',
    read: '/summary',
    action: {
      action: 'dispatch-release',
      payload: {
        gitSha: 'a'.repeat(40),
        version: 'v1.0.0',
        idempotencyKey: `version-center:release:${ID}`,
      },
    },
  },
  {
    name: 'migration',
    make: createDevDatabaseMigrationMiddleware,
    base: '/__dev/api/database-migration',
    read: '/summary',
    action: {
      action: 'prepare',
      idempotencyKey: `database-migration:prepare:${ID}`,
    },
  },
  {
    name: 'customer',
    make: createDevCustomerConfigMiddleware,
    base: '/__dev/api/customer-config',
    read: '/operations?customerKey=yoyoosun',
    write: '/__dev/api/customer-import/dry-run',
    action: {
      customerKey: 'yoyoosun',
      idempotencyKey: `customer-config:dry-run:yoyoosun:${ID}`,
    },
  },
]

async function invokeRaw(
  middleware,
  url,
  { method = 'GET', headers = {}, socket = {}, body } = {}
) {
  const request = Readable.from(body ? [JSON.stringify(body)] : [])
  request.url = url
  request.method = method
  request.headers = { host: '192.168.0.133:15200', ...headers }
  request.socket = {
    localAddress: '192.168.0.133',
    localPort: 15200,
    remoteAddress: '192.168.0.66',
    ...socket,
  }
  const response = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = this.headers['content-type']?.startsWith('text/plain')
        ? String(body)
        : JSON.parse(body)
    },
  }
  await middleware(request, response, () =>
    assert.fail('Unexpected unhandled endpoint')
  )
  return response
}

for (const transport of [
  { name: 'HTTP LAN', origin: ORIGIN, headers: {}, socket: {} },
  {
    name: 'HTTPS proxy',
    origin: 'https://dev.example.test',
    headers: {
      host: 'dev.example.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '192.168.0.66',
    },
    socket: { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' },
  },
]) {
  for (const item of cases) {
    test(`${item.name} supports ${transport.name} access with mandatory Origin and CSRF`, async () => {
      const invoke = (middleware, url, options = {}) =>
        invokeRaw(middleware, url, {
          ...options,
          headers: { ...transport.headers, ...options.headers },
          socket: { ...transport.socket, ...options.socket },
        })
      const writes = []
      const service = {
        summary: () => ({ status: 'success' }),
        operations: () => [],
        latestOperation: () => null,
        async act(...args) {
          writes.push(args)
          return {
            accepted: true,
            action: 'prepare',
            statusCode: 200,
            payload: { status: 'success' },
          }
        },
      }
      const operations = item.make({
        service,
        csrfToken: TOKEN,
        readReport: async () => ({ repository }),
        readRepositoryState: async () => repository,
      })
      const access = createDevOperatorAuthMiddleware({
        readAccessMode: () => 'private-network',
        readCredentials: () => null,
      })
      const proxy = createDevHttpsProxyMiddleware(
        transport.name === 'HTTPS proxy' ? transport.origin : ''
      )
      const middleware = (request, response, next) =>
        proxy(request, response, () =>
          access(request, response, () => operations(request, response, next))
        )
      const summary = await invoke(middleware, item.base + item.read)
      assert.equal(summary.statusCode, 200)
      assert.equal(summary.headers['cache-control'], 'no-store')
      const session = await invoke(middleware, `${item.base}/session`)
      assert.equal(session.statusCode, 200)
      assert.equal(session.body.csrfToken, TOKEN)
      const writePath = item.write || `${item.base}/actions`
      const headers = {
        origin: transport.origin,
        'x-csrf-token': TOKEN,
        'content-type': 'application/json',
      }
      for (const changed of [
        { origin: undefined },
        { origin: 'http://evil.example' },
        { 'x-csrf-token': undefined },
        { 'x-csrf-token': 'invalid' },
        { 'sec-fetch-site': 'cross-site' },
        { referer: 'http://evil.example/' },
      ]) {
        const denied = await invoke(middleware, writePath, {
          method: 'POST',
          headers: { ...headers, ...changed },
          body: item.action,
        })
        assert.equal(denied.statusCode, 403, JSON.stringify(changed))
      }
      assert.equal(writes.length, 0)
      // HTTP LAN browsers can omit Fetch Metadata; exact Origin and CSRF remain required.
      const accepted = await invoke(middleware, writePath, {
        method: 'POST',
        headers,
        body: item.action,
      })
      assert.ok([200, 202].includes(accepted.statusCode))
      assert.equal(writes.length, 1)
      for (const changed of [
        { headers: { host: 'evil.example:15200' } },
        { headers: { host: '192.168.0.133:15201' } },
        { socket: { remoteAddress: '8.8.8.8' } },
        { socket: { localAddress: '192.168.0.134' } },
        { headers: { origin: 'http://evil.example' } },
      ]) {
        const denied = await invoke(middleware, `${item.base}/session`, changed)
        assert.equal(denied.statusCode, 403)
        assert.equal(Object.hasOwn(denied.body, 'csrfToken'), false)
      }
    })
  }
}
