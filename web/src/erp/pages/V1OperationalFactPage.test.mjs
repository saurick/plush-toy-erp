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

test('production progress keeps its view and shared role help explains warehouse handoff', () => {
  assert.match(source, /initialActiveKey: 'production'/u)
  const help = readFileSync(
    new URL('../config/roleHelpContent.mjs', import.meta.url),
    'utf8'
  )
  assert.match(help, /办理领料、提交完工报告和返工来源记录/u)
  assert.match(help, /核对实收数量、仓库和批次后确认成品入库/u)
  assert.match(help, /生产提交完工报告不等于成品已经入库/u)
})

test('operational fact workspace enforces exact outsourcing read and mutation context', () => {
  const workspace = readFileSync(
    fileURLToPath(new URL('./OperationalFactsPage.jsx', import.meta.url)),
    'utf8'
  )
  const viewConfig = readFileSync(
    fileURLToPath(
      new URL(
        '../components/operational-facts/operationalFactPageConfig.mjs',
        import.meta.url
      )
    ),
    'utf8'
  )
  const forms = readFileSync(
    fileURLToPath(
      new URL(
        '../components/operational-facts/OperationalFactForms.jsx',
        import.meta.url
      )
    ),
    'utf8'
  )
  const query = readFileSync(
    new URL(
      '../components/operational-facts/useOperationalFactQuery.mjs',
      import.meta.url
    ),
    'utf8'
  )
  const mutations = readFileSync(
    new URL(
      '../components/operational-facts/useOperationalFactMutations.mjs',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(query, /config\.readPermissions/u)
  assert.match(
    query,
    /hasAnyPermission\(adminProfile, config\.readPermissions\)/u
  )
  assert.match(forms, /productionRead:\s*\['production\.fact\.read'\]/u)
  assert.match(
    viewConfig,
    /production:\s*\{[\s\S]*?readPermissions:\s*ACTION_PERMISSIONS\.productionRead/u
  )
  assert.match(workspace, /currentActiveKey === 'outsourcing'/u)
  assert.match(mutations, /customer_key: activeCustomerKey/u)
})
