import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolvePublicContractSource } from './publicContractSource.mjs'

const filename = fileURLToPath(new URL('../../src/example.mjs', import.meta.url))
const imports = `import { PermissionCode } from './common/consts/permissions.generated.mjs';\n`

test('contract source inspection resolves imported values and computed keys', () => {
  const source = resolvePublicContractSource(`${imports}const actions = {[PermissionCode.SHIPMENT_READ]: PermissionCode.SHIPMENT_CREATE}`, filename)
  assert.match(source, /'shipment.read': 'shipment.create'/u)
})

test('contract source inspection preserves comments and locally shadowed objects', () => {
  const source = `${imports}// PermissionCode.SHIPMENT_READ\nfunction local(PermissionCode) { return PermissionCode.SHIPMENT_READ }`
  const result = resolvePublicContractSource(source, filename)
  assert.match(result, /\/\/ PermissionCode.SHIPMENT_READ/u)
  assert.match(result, /return PermissionCode.SHIPMENT_READ/u)
})

test('contract source inspection rejects undefined references instead of hiding drift', () => {
  assert.throws(() => resolvePublicContractSource(`${imports}const value = PermissionCode.UNKNOWN`, filename), /Unknown public contract member/u)
})
