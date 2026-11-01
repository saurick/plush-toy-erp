import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseProductCoreCapabilities } from './devProductCore.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  PRODUCT_CORE_CHAIN_REFERENCES,
  PRODUCT_CORE_RELEASE_EVIDENCE_URL,
  buildProductCoreChainRelations,
  isProductCoreReadingDestination,
  productCapabilitiesForChain,
  productCoreCapabilityURL,
  productCoreChainURL,
} from './devProductCoreRelations.mjs'

const capabilities = parseProductCoreCapabilities(readFileSync(new URL('../../../../docs/product/产品能力进度台账.md', import.meta.url), 'utf8'))

test('产品能力与链路只引用正式台账和当前目录，前后向关联一致', () => {
  const relations = buildProductCoreChainRelations(capabilities, catalog)
  assert.deepEqual(new Set([...relations.values()].flatMap((rows) => rows.map((row) => row.key))), new Set(catalog.businessChains.map((chain) => chain.key)))
  for (const [capability, chains] of relations) {
    assert(capabilities.some((item) => item.capability === capability))
    for (const chain of chains) {
      assert(productCapabilitiesForChain(chain.key).includes(capability))
      assert.equal(chain.label, catalog.businessChains.find((item) => item.key === chain.key).label)
      assert.deepEqual(Object.keys(chain).sort(), ['definitionURL', 'evidenceURL', 'key', 'label'])
    }
  }
  assert.equal(relations.has('SaaS、多租户、license 与计费'), false)
  assert.deepEqual(productCapabilitiesForChain('unknown'), [])
})

test('订单到结清、质量返工的能力均能定位到所属链路与单独的实测报告', () => {
  const relations = buildProductCoreChainRelations(capabilities, catalog)
  const expected = [
    ['销售订单', 'sales_to_production'],
    ['采购订单、收货、质检、退货与调整', 'purchase_to_inventory'],
    ['生产订单、WIP、生产事实与委外', 'production_to_inventory'],
    ['生产订单、WIP、生产事实与委外', 'production_exception'],
    ['出货', 'delivery_to_settlement'],
    ['应收、应付、发票、收付款、核销与账款调整', 'finance_payment_and_reversal'],
  ]
  for (const [capability, key] of expected) {
    const row = relations.get(capability).find((item) => item.key === key)
    assert(row, `${capability} 应有 ${key} 关联`)
    const definition = new URL(row.definitionURL, 'http://localhost')
    assert.equal(definition.pathname, '/__dev/business-topics')
    assert.equal(definition.searchParams.get('flow_topic'), key)
    const evidence = new URL(row.evidenceURL, 'http://localhost')
    assert.equal(evidence.pathname, '/__dev/business-chain-audit')
    assert.equal(evidence.searchParams.get('chain'), key)
    assert.equal(evidence.searchParams.has('step'), false)
    assert.equal(evidence.searchParams.has('batch'), false, '不预选或伪造某个通过批次')
  }
  assert.equal(PRODUCT_CORE_RELEASE_EVIDENCE_URL, '/__dev/version-center?view=history')
})

test('引用改名、遗漏与重复失败关闭，不把状态或相似名称当成关联依据', () => {
  const reference = PRODUCT_CORE_CHAIN_REFERENCES[0]
  for (const references of [
    [{ ...reference, capability: '不存在的能力' }],
    [{ ...reference, chainKeys: ['不存在的链路'] }],
    [{ ...reference, chainKeys: [] }],
    [{ ...reference, chainKeys: [reference.chainKeys[0], reference.chainKeys[0]] }],
    [reference, reference],
  ]) assert.throws(() => buildProductCoreChainRelations(capabilities, catalog, references), /引用不完整/u)
  const before = JSON.stringify(capabilities)
  buildProductCoreChainRelations(capabilities, catalog)
  assert.equal(JSON.stringify(capabilities), before)
  const changed = capabilities.map((item) => ({ ...item, status: '状态待核对', membershipKey: 'unknown' }))
  assert.deepEqual(buildProductCoreChainRelations(changed, catalog), buildProductCoreChainRelations(capabilities, catalog), '关联不提升产品、发布或验收状态')
})

test('能力名称通过 URL 编码，业务专题保持唯一当前入口', () => {
  const name = '应收、应付、发票、收付款、核销与账款调整'
  assert.equal(new URL(productCoreCapabilityURL(name), 'http://localhost').searchParams.get('capability'), name)
  const topic = new URL(productCoreChainURL('production_exception'), 'http://localhost')
  assert.equal(topic.searchParams.get('chain'), 'all')
  assert.equal(topic.searchParams.get('view'), 'chain')
})

test('关联导航只开放已登记对象和发布记录，不生成通用跨页快捷入口', () => {
  const relations = buildProductCoreChainRelations(capabilities, catalog)
  assert(isProductCoreReadingDestination(PRODUCT_CORE_RELEASE_EVIDENCE_URL))
  for (const [name, chains] of relations) {
    assert(isProductCoreReadingDestination(productCoreCapabilityURL(name)))
    for (const chain of chains) {
      assert(isProductCoreReadingDestination(chain.definitionURL))
      assert(isProductCoreReadingDestination(chain.evidenceURL))
    }
  }
  for (const url of [
    '', '/__dev/product-core', '/__dev/business-topics', '/__dev/business-chain-audit',
    '/__dev/business-chain-audit?chain=all', '/__dev/business-chain-audit?chain=unknown',
    '/__dev/version-center?view=versions', '/__dev/version-center?view=history&action=release',
    '/__dev/version-center?view=history&view=versions', '/__dev/testing',
    '/erp/task-board', 'https://example.com/', '//example.com/',
  ]) assert.equal(isProductCoreReadingDestination(url), false, url)
})
