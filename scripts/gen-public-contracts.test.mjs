import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadCatalog, renderCatalog, renderRPCDocumentation, syncOutputs, syncRPCDocumentation, syncTaskDesignCatalog } from './gen-public-contracts.mjs'
import { checkConsumerSource, checkConsumers, checkScriptConsumerSource, checkScriptConsumers } from './qa/public-contract-consumers.mjs'
import { RpcMethod } from '../web/src/common/consts/rpcMethods.generated.mjs'
import { readIntegrationCallDetails } from '../web/src/dev-workbench/config/devIntegration.mjs'

test('public contracts: extraction rejects unsupported declarations and matches runtime registries', () => {
  const output = execFileSync('go', ['test', './cmd/public-contracts'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8', timeout: 120_000,
  })
  assert.match(output, /ok\s+server\/cmd\/public-contracts/u)
})

test('public contracts: all generated files agree with current backend declarations', () => {
  const catalog = loadCatalog()
  assert.equal(catalog.permissions.SHIPMENT_READ, 'shipment.read')
  assert.equal(catalog.rpc.customer_config.GET_EFFECTIVE_SESSION, 'get_effective_session')
  assert.equal(catalog.rpc.customer_config.PUBLISH_APPROVAL_SETTINGS, 'publish_approval_settings')
  assert.deepEqual(catalog.rpcTransport, { method: 'POST', path: '/rpc/{url}', documentation: 'server/api/jsonrpc/v1/jsonrpc.swagger.json' })
  assert.equal(catalog.states.ShipmentStatus.SHIPPED, 'SHIPPED')
  assert.equal(catalog.states.WorkflowTaskStatus.DONE, 'done')
  assert.deepEqual(syncOutputs(renderCatalog(catalog), { check: true }), [])
  assert.deepEqual(syncTaskDesignCatalog(catalog, { check: true }), [])
  assert.deepEqual(syncRPCDocumentation(catalog, { check: true }), [])
  const api = fs.readFileSync(new URL('../server/docs/api.md', import.meta.url), 'utf8')
  const calls = readIntegrationCallDetails(api, catalog.rpc)
  const authored = new Set([...api.split('<!-- BEGIN GENERATED RPC FIELD CONTRACTS -->')[0].matchAll(/^#### .*`([a-z_]+\.[a-z_]+)`/gmu)].map((match) => match[1]))
  for (const [domain, methods] of Object.entries(catalog.rpcCalls)) {
    for (const [method, contract] of Object.entries(methods)) {
      const parsed = calls.get(`${domain}.${method}`)
      for (const [part, fields] of [['request', contract.parameters], ['response', contract.response || []]]) {
        for (const field of fields) {
          const actual = parsed?.[part]?.fields?.find((row) => row.name === field.name)
          assert(actual, `${domain}.${method}: ${part} field missing: ${field.name}`)
          const expectedType = field.nullable && !field.type.includes('null') ? `${field.type} | null` : field.type
          if (part === 'request' && authored.has(`${domain}.${method}`)) {
            const accepted = new Set(expectedType.split(' | '))
            assert(actual.type.split(' | ').every((type) => accepted.has(type)), `${domain}.${method}.${field.name}: authored domain type exceeds backend parser`)
            assert(actual.required, `${domain}.${method}.${field.name}: authored requirement absent`)
            if (field.required === '必填') assert.match(actual.required, /必填/u)
          } else {
            assert.equal(actual.type, expectedType, `${domain}.${method}.${field.name}: type column drift`)
            if (part === 'request') assert.equal(actual.required, field.required, `${domain}.${method}.${field.name}: required column drift`)
          }
          assert(!actual.type.endsWith('\\'), `${domain}.${method}.${field.name}: escaped pipe was split into columns`)
        }
      }
    }
  }
  assert(catalog.rpcInspection.admin.change_password.emptyData)
  assert.equal(catalog.rpcInspection.admin.change_password.entry.path, 'server/internal/service/jsonrpc_dispatch_admin.go')
  const outputs = renderCatalog(catalog)
  assert.match(outputs['rpcInspection.generated.mjs'], /仅供 DEV 工作台/u)
  assert(!outputs['rpcMethods.generated.mjs'].includes('old_password'))
})

test('public contracts: generated strings escape tabs without changing source excerpts', async (t) => {
  const excerpts = [
    'map[string]any{\n\t"scope": "inventory",\r\n}',
    "single ' and double \" quotes, backslash \\, tab \t, 中文",
    'literal \\t and literal \\n stay escaped',
  ]
  const inspection = { sample: { read: { expression: excerpts[0], 'guard\tname': excerpts } } }
  const catalog = {
    permissions: { SAMPLE_READ: 'sample.read' },
    permissionLabels: { 'sample.read': '查看示例' },
    sourceActionPermissions: { 'sample.read': [{ permission: 'sample.read' }] },
    states: { SampleStatus: { READY: 'ready' } },
    attachments: { maximum: 1 },
    numeric: { Precision: 20, Scale: 6 },
    policies: { minimum: 1 },
    rpc: { sample: { READ: 'read' } },
    rpcTransport: { method: 'POST', path: '/rpc/{url}' },
    rpcInspection: inspection,
    taskDiscovery: { groups: ['sample'] },
  }
  const outputs = renderCatalog(catalog)
  for (const [name, source] of Object.entries(outputs)) {
    assert.doesNotMatch(source, /\t/u, `${name}: source literals must escape tab characters`)
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'public-contract-module-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  syncOutputs(outputs, { repositoryRoot: directory })
  const generatedModule = path.join(directory, 'web/src/dev-workbench/config/rpcInspection.generated.mjs')
  const { RpcInspection } = await import(pathToFileURL(generatedModule).href)
  assert.deepEqual(RpcInspection, inspection)
})

test('public contracts: RPC documentation preserves authored examples and descriptions, updates fields and stays idempotent', () => {
  const catalog = {
    rpc: { orders: { GET: 'get', LIST: 'list' } },
    rpcCalls: { orders: {
      get: { parameters: [{ name: 'id', type: 'integer', required: '必填', description: '解析器 strictID', source: { path: 'server/internal/service/orders.go', line: 1 } }, { name: 'note', type: 'string', nullable: true, required: '可选', description: '解析器 optionalText', source: { path: 'server/internal/service/orders.go', line: 2 } }], response: [{ name: 'result.data.order.id', type: 'integer', source: { path: 'server/internal/service/orders.go', line: 3 } }], dataType: 'object', example: { params: { id: 1 }, data: { order: { id: 1 } } } },
      list: { parameters: [], response: [{ name: 'result.data.orders', type: 'array', source: { path: 'server/internal/service/orders.go', line: 4 } }], dataType: 'object', example: { params: {}, data: { orders: [] }, basis: 'handler-fixture', test: 'TestOrders', source: { path: 'server/internal/service/orders_test.go', line: 5 } } },
    } },
  }
  const original = `user-owned-before\n### 订单 \`orders\`\n\n| 方法 | 中文名称 | 用途 |\n| --- | --- | --- |\n| \`get\` | 查看订单 | 查看订单用途 |\n| \`list\` | 查询订单 | 查询订单用途 |\n\n#### 查看订单 \`orders.get\`\n\n##### 请求参数\n\n| 字段 | 类型 | 必填条件 | 说明 |\n| --- | --- | --- | --- |\n| \`id\` | integer | 必填 | 读取到的订单 ID。 |\n\n\`\`\`json\n{"jsonrpc":"2.0","method":"get","params":{"id":42},"id":"authored"}\n\`\`\`\n\n##### 返回结果\n\n| 返回字段 | 类型 | 说明 |\n| --- | --- | --- |\n| \`result.code\` | integer | 业务结果码。 |\n| \`result.data\` | object / null | 业务投影。 |\n\n\`\`\`json\n{"result":{"code":0,"data":{"order":{"id":42}}}}\n\`\`\`\nuser-owned-after\n`
  const generated = renderRPCDocumentation(catalog, original)
  assert.match(generated, /\| `id` \| integer \| 必填 \| 读取到的订单 ID。/u)
  assert(generated.includes('| `note` | string &#124; null | 可选 |'))
  assert(generated.includes('"id":42'))
  assert(generated.startsWith('user-owned-before\n'))
  assert(generated.includes('user-owned-after\n'))
  assert.equal((generated.match(/^#### /gmu) || []).length, 2)
  assert.equal((generated.match(/^##### 请求参数/gmu) || []).length, 2)
  assert.equal((generated.match(/^##### 返回结果/gmu) || []).length, 2)
  assert.match(generated, /TestOrders.*orders_test\.go/u)
  assert.equal(renderRPCDocumentation(catalog, generated), generated)
  const changed = structuredClone(catalog)
  changed.rpcCalls.orders.get.parameters[1].required = '条件必填'
  changed.rpcCalls.orders.get.parameters[1].source.line = 10
  const updated = renderRPCDocumentation(changed, generated)
  assert(updated.includes('| `note` | string &#124; null | 条件必填 |'))
  assert(updated.includes('orders.go:10'))
  assert(!updated.includes('orders.go:2'))
})

test('public contracts: RPC documentation checks never write and reject invalid generation boundaries or missing names', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'public-contract-rpc-'))
  const file = path.join(directory, 'server/docs/api.md')
  const catalog = { rpc: { orders: { LIST: 'list' } }, rpcCalls: { orders: { list: { parameters: [], response: [], dataType: 'null', example: { params: {}, data: null, basis: 'backend-wire-shape' } } } } }
  const original = '### 订单 `orders`\n\n| 方法 | 中文名称 | 用途 |\n| --- | --- | --- |\n| `list` | 查询订单 | 查询订单用途 |\n'
  const start = '<!-- BEGIN GENERATED RPC FIELD CONTRACTS -->'
  const end = '<!-- END GENERATED RPC FIELD CONTRACTS -->'
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, original)
    assert.throws(() => syncRPCDocumentation(catalog, { repositoryRoot: directory, check: true }), /未同步/u)
    assert.equal(fs.readFileSync(file, 'utf8'), original)
    syncRPCDocumentation(catalog, { repositoryRoot: directory })
    const generated = fs.readFileSync(file, 'utf8')
    assert.match(generated, /此方法不读取业务参数/u)
    assert(generated.includes('"data": null'))
    assert.deepEqual(syncRPCDocumentation(catalog, { repositoryRoot: directory, check: true }), [])
    for (const invalid of [start, end, end + start, start + start + end, start + end + end]) {
      fs.writeFileSync(file, original + invalid)
      assert.throws(() => syncRPCDocumentation(catalog, { repositoryRoot: directory }), /生成标记/u)
      assert.equal(fs.readFileSync(file, 'utf8'), original + invalid)
    }
    assert.throws(() => renderRPCDocumentation(catalog, ''), /中文名称或用途缺失/u)
    assert.throws(() => renderRPCDocumentation({ ...catalog, rpcCalls: {} }, original), /合同或中文名称缺失/u)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('public contracts: authored result.data tables gain all nested fields and domain request restrictions remain stricter', () => {
  const catalog = { rpc: { orders: { SAVE: 'save' } }, rpcCalls: { orders: { save: {
    parameters: [{ name: 'route', type: 'string', nullable: true, required: '可选', description: '解析器 optionalRoute' }],
    response: [{ name: 'result.data.order', type: 'object' }, { name: 'result.data.order.id', type: 'integer' }],
    dataType: 'object', example: { params: { route: 'route' }, data: { order: { id: 1 } } },
  } } } }
  const source = '### 订单 `orders`\n| 方法 | 中文名称 | 用途 |\n| --- | --- | --- |\n| `save` | 保存订单 | 保存订单用途 |\n\n#### 保存订单 `orders.save`\n\n##### 请求参数\n\n| 字段 | 类型 | 必填条件 | 约束 |\n| --- | --- | --- | --- |\n| `route` | string | 必填 | 领域校验要求显式指定路线。 |\n\n##### 返回结果\n\n| result.data 字段 | 类型 | 说明 |\n| --- | --- | --- |\n| order | object | 当前订单投影。 |\n'
  const result = renderRPCDocumentation(catalog, source)
  assert(result.includes('| `route` | string | 必填 | 领域校验要求显式指定路线。 |'))
  assert(result.includes('| `result.data.order` | object | 当前订单投影。 |'))
  assert(result.includes('| `result.data.order.id` | integer |'))
  assert(result.includes('| `result.code` | integer |'))
  assert(!result.includes('| result.data 字段 |'))
  assert.equal(renderRPCDocumentation(catalog, result), result)
  assert.throws(() => renderRPCDocumentation(catalog, source.replace('| `route` | string |', '| `route` | integer |')), /人工字段类型超出后端/u)
})

test('public contracts: task design synchronization preserves surrounding edits and checks without writing', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'public-contract-design-'))
  const file = path.join(directory, 'docs/product/ui-design/index.html')
  const start = '    // BEGIN GENERATED TASK DISCOVERY'
  const end = '    // END GENERATED TASK DISCOVERY'
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const source = `user-owned-before\n${start}\n    const taskDiscoveryCatalog = {};\n${end}\nuser-owned-after\n`
    fs.writeFileSync(file, source)
    const catalog = { taskDiscovery: { groups: ['one'] } }
    assert.throws(() => syncTaskDesignCatalog(catalog, { repositoryRoot: directory, check: true }), /未同步/u)
    assert.equal(fs.readFileSync(file, 'utf8'), source)
    syncTaskDesignCatalog(catalog, { repositoryRoot: directory })
    const expected = source.replace('taskDiscoveryCatalog = {}', 'taskDiscoveryCatalog = {"groups":["one"]}')
    assert.equal(fs.readFileSync(file, 'utf8'), expected)
    assert.deepEqual(syncTaskDesignCatalog(catalog, { repositoryRoot: directory, check: true }), [])
    for (const invalid of [end + start, start + end + end, start + start + end, 'missing']) {
      fs.writeFileSync(file, invalid)
      assert.throws(() => syncTaskDesignCatalog(catalog, { repositoryRoot: directory }), /生成标记/u)
      assert.equal(fs.readFileSync(file, 'utf8'), invalid)
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('public contracts: check mode detects missing and stale artifacts without writing', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'public-contract-check-'))
  try {
    const destination = path.join(directory, 'web/src/common/consts')
    fs.mkdirSync(destination, { recursive: true })
    const outputs = { 'permissions.generated.mjs': 'expected\n' }
    assert.throws(() => syncOutputs(outputs, { repositoryRoot: directory, check: true }), /未同步/u)
    assert.equal(fs.readdirSync(destination).length, 0)
    fs.writeFileSync(path.join(destination, 'permissions.generated.mjs'), 'stale\n')
    assert.throws(() => syncOutputs(outputs, { repositoryRoot: directory, check: true }), /未同步/u)
    assert.equal(fs.readFileSync(path.join(destination, 'permissions.generated.mjs'), 'utf8'), 'stale\n')
    syncOutputs(outputs, { repositoryRoot: directory })
    assert.deepEqual(syncOutputs(outputs, { repositoryRoot: directory, check: true }), [])
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('public contracts: generated references, comments and fixture text are distinguished by syntax', () => {
  assert.deepEqual(checkConsumerSource(`// 'shipment.read'\nconst access = PermissionCode.SHIPMENT_READ;`), [])
  for (const source of [
    `const access = 'shipment.read'`,
    `hasActionPermission(profile, 'shipment.typo')`,
    `const access = PermissionCode.SHIPMENT_TYPO`,
    `const status = WorkflowTaskStatus.UNKNOWN`,
    `const rpc = new JsonRpc({url: 'inventory'})`,
    `const rpc = new JsonRpc({url: RpcDomain.INVENTORY}); rpc.call('list_inventory_lots')`,
    `const rpc = new JsonRpc({url: RpcDomain.INVENTORY}); rpc.call(RpcMethod.workflow.LIST_TASKS)`,
    `const method = RpcMethod.inventory.UNKNOWN`,
  ]) assert(checkConsumerSource(source).length > 0, source)
  assert.deepEqual(checkConsumerSource(`const rpc = new JsonRpc({url: RpcDomain.INVENTORY}); rpc.call(RpcMethod.inventory.LIST_INVENTORY_LOTS)`), [])
})

test('public contracts: production consumers use valid generated permission and RPC references', () => {
  assert.deepEqual(checkConsumers(), [])
  assert.deepEqual(checkScriptConsumers(), [])
})

test('public contracts: consumer impact retains removed methods through the baseline and ignores lexical shadows', () => {
  const references = []
  const source = `import { RpcMethod as Methods } from './rpcMethods.generated.mjs';
const old = Methods.orders.REMOVED;
function local() { const Methods = { orders: { REMOVED: 'unrelated' } }; return Methods.orders.REMOVED; }
void old; void local;`
  checkConsumerSource(source, 'consumer.mjs', { references, rpcCatalog: { orders: { REMOVED: 'removed_method' } } })
  assert.deepEqual(references.map(({ key, path }) => ({ key, path })), [{ key: 'orders.removed_method', path: 'consumer.mjs' }])
})

test('public contracts: portable deployment RPC envelopes and local wrappers follow the dispatcher', () => {
  for (const source of [
    `rpcCall({rpcPath: '/rpc/customer_config', method: 'publish_typo'})`,
    `rpcCall({rpcPath: '/rpc/customer_config', method: rollback ? 'rollback_customer_config' : 'activate_typo'})`,
    "fetch(origin + '/other', {method: 'POST'}); fetch(`${origin}/rpc/auth`, {body: JSON.stringify({jsonrpc: '2.0', method: 'admin_typo'})})",
    "async function customerConfigRpc(origin, token, method, params) { return fetch(`${origin}/rpc/customer_config`, {body: JSON.stringify({jsonrpc:'2.0', method, params})}) }; customerConfigRpc(origin, token, 'publish_typo', {})",
    "const rpc = (url, method) => fetch(`${origin}/rpc/${url}`, {body: JSON.stringify({jsonrpc:'2.0', method})}); rpc('auth', 'admin_typo')",
  ]) assert(checkScriptConsumerSource(source).length > 0, source)
  assert.deepEqual(checkScriptConsumerSource(`rpcCall({rpcPath: '/rpc/auth', method: 'admin_login'}); fetch('/provider', {method: 'POST'})`), [])
  const stale = { ...RpcMethod, customer_config: { ...RpcMethod.customer_config } }
  delete stale.customer_config.PUBLISH_CUSTOMER_CONFIG
  assert(checkScriptConsumers(undefined, stale).some((issue) => issue.includes('customer-config-release-execute.mjs') && issue.includes('publish_customer_config')))
})

test('public contracts: imports and constant aliases retain contract identity across lexical scopes', () => {
  for (const source of [
    `import { PermissionCode as P } from './permissions.generated.mjs'; const key = P.SHIPMENT_TYPO`,
    `import { ShipmentStatus as S } from './statuses.generated.mjs'; const key = S.SHIPPED_TYPO`,
    `import * as C from './statuses.generated.mjs'; const key = C.ShipmentStatus.UNKNOWN`,
    `import { RpcMethod as M, RpcDomain as D } from './rpcMethods.generated.mjs'; import { JsonRpc as Client } from './jsonRpc.js'; const rpc = new Client({url: D.INVENTORY}); rpc.call(M.workflow.LIST_TASKS)`,
    `const methods = RpcMethod.inventory; const method = methods.UNKNOWN`,
    `import { PrintPolicy as P } from './policies.generated.mjs'; const limit = P.UNKNOWN`,
    `hasAnyPermission(profile, ['shipment.typo'])`,
    `const keys = ['shipment.typo']; hasAnyPermission(profile, [...keys])`,
    `requireAllActionPermission(profile, ['shipment.typo'])`,
  ]) assert(checkConsumerSource(source).length > 0, source)
  for (const source of [
    `import { PermissionCode as P } from './permissions.generated.mjs'; hasAnyPermission(profile, [P.SHIPMENT_READ])`,
    `import * as C from './statuses.generated.mjs'; const key = C.ShipmentStatus.SHIPPED`,
    `import { ShipmentStatus as S } from './statuses.generated.mjs'; function render(S) { return S.UNKNOWN }`,
    `const ShipmentStatus = { UNKNOWN: 'local' }; const key = ShipmentStatus.UNKNOWN`,
    `import { RpcMethod as M, RpcDomain as D } from './rpcMethods.generated.mjs'; import { JsonRpc as Client } from './jsonRpc.js'; const rpc = new Client({url: D.INVENTORY}); rpc.call(M.inventory.LIST_INVENTORY_LOTS)`,
  ]) assert.deepEqual(checkConsumerSource(source), [], source)
})
