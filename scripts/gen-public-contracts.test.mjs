import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadCatalog, renderCatalog, syncOutputs } from './gen-public-contracts.mjs'
import { checkConsumerSource, checkConsumers } from './qa/public-contract-consumers.mjs'

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
  assert.equal(catalog.states.ShipmentStatus.SHIPPED, 'SHIPPED')
  assert.equal(catalog.states.WorkflowTaskStatus.DONE, 'done')
  assert.deepEqual(syncOutputs(renderCatalog(catalog), { check: true }), [])
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
})
