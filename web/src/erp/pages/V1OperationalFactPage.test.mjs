import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./V1OperationalFactPage.jsx', import.meta.url)),
  'utf8'
)

test('finance routes keep fact type as their only list projection truth', () => {
  for (const factType of [
    'RECEIVABLE',
    'PAYABLE',
    'INVOICE',
    'RECONCILIATION',
  ]) {
    assert.match(
      source,
      new RegExp(`listParams: \\{ fact_type: '${factType}' \\}`)
    )
  }

  for (const deadConfig of [
    'createLabel',
    'createPrefix',
    'hideCreateAction',
    'modalDescription',
    'initialValues',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${deadConfig}\\b`))
  }
})

test('invoice and reconciliation copy matches the available actions', () => {
  assert.match(source, /取消当前业务发票记录不等于税控红冲/u)
  assert.match(source, /完成核对只关闭当前对账记录/u)
  assert.doesNotMatch(source, /结清对账/u)
})

test('operational fact workspace enforces exact outsourcing read and mutation context', () => {
  const workspace = readFileSync(
    fileURLToPath(new URL('./OperationalFactsPage.jsx', import.meta.url)),
    'utf8'
  )
  assert.match(workspace, /config\.readPermissions/u)
  assert.match(
    workspace,
    /hasAnyPermission\(adminProfile, config\.readPermissions\)/u
  )
  assert.match(workspace, /currentActiveKey === 'outsourcing'/u)
  assert.match(workspace, /customer_key: activeCustomerKey/u)
})
