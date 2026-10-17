import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadCatalog, renderCatalog, syncOutputs, syncTaskDesignCatalog } from './gen-public-contracts.mjs'
import { checkConsumerSource, checkConsumers, checkScriptConsumerSource, checkScriptConsumers } from './qa/public-contract-consumers.mjs'
import { RpcMethod } from '../web/src/common/consts/rpcMethods.generated.mjs'

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
