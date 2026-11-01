import {
  DEV_BUSINESS_CHAIN_AUDIT_ROUTE,
  DEV_BUSINESS_TOPICS_ROUTE,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
} from './devRoutes.mjs'
import { chainStepAuditURL } from './devBusinessChainVerification.mjs'

// References join the capability ledger to existing chains; they carry no status or rules.
export const PRODUCT_CORE_CHAIN_REFERENCES = Object.freeze([
  ['Workflow、ProcessRuntime 与业务事实边界', ['sales_to_production', 'purchase_to_inventory', 'outsourcing_to_inventory', 'delivery_to_settlement', 'finance_payment_and_reversal', 'production_exception']],
  ['主数据、SKU、BOM 与固定生产路线', ['sales_to_production', 'production_to_inventory']],
  ['销售订单', ['sales_to_production', 'delivery_to_settlement']],
  ['采购订单、收货、质检、退货与调整', ['purchase_to_inventory', 'purchase_quality_disposition', 'purchase_posting_corrections']],
  ['库存、批次与预留', ['purchase_to_inventory', 'production_to_inventory', 'outsourcing_to_inventory', 'inventory_adjustment']],
  ['出货', ['delivery_to_settlement']],
  ['应收、应付、发票、收付款、核销与账款调整', ['finance_payment_and_reversal', 'purchase_to_inventory', 'outsourcing_to_inventory', 'delivery_to_settlement', 'purchase_posting_corrections']],
  ['生产订单、WIP、生产事实与委外', ['production_to_inventory', 'outsourcing_to_inventory', 'outsourcing_quality_disposition', 'production_exception']],
].map(([capability, chainKeys]) => Object.freeze({ capability, chainKeys: Object.freeze(chainKeys) })))

export function productCoreCapabilityURL(capability) {
  return `${DEV_PRODUCT_CORE_ROUTE}?${new URLSearchParams({ capability })}`
}

export function productCoreChainURL(chainKey) {
  return `${DEV_BUSINESS_TOPICS_ROUTE}?${new URLSearchParams({ view: 'chain', chain: 'all', flow_topic: chainKey })}`
}

export const PRODUCT_CORE_RELEASE_EVIDENCE_URL = `${DEV_VERSION_CENTER_ROUTE}?view=history`

export function isProductCoreReadingDestination(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false
  const url = new URL(value, 'https://workbench.invalid')
  if (url.hash || url.origin !== 'https://workbench.invalid') return false
  const query = url.searchParams
  if ([...new Set(query.keys())].some((key) => query.getAll(key).length !== 1)) return false
  const onlyKeys = (keys) => [...query.keys()].every((key) => keys.includes(key))
  const knownChain = (key) => PRODUCT_CORE_CHAIN_REFERENCES.some((entry) => entry.chainKeys.includes(key))
  if (url.pathname === DEV_PRODUCT_CORE_ROUTE) {
    return onlyKeys(['capability']) && PRODUCT_CORE_CHAIN_REFERENCES.some((entry) => entry.capability === query.get('capability'))
  }
  if (url.pathname === DEV_BUSINESS_TOPICS_ROUTE) {
    return onlyKeys(['view', 'chain', 'flow_topic']) && query.get('view') === 'chain' && query.get('chain') === 'all' && knownChain(query.get('flow_topic'))
  }
  if (url.pathname === DEV_BUSINESS_CHAIN_AUDIT_ROUTE) {
    return onlyKeys(['chain']) && knownChain(query.get('chain'))
  }
  return url.pathname === DEV_VERSION_CENTER_ROUTE && onlyKeys(['view']) && query.get('view') === 'history'
}

export function productCapabilitiesForChain(chainKey) {
  return PRODUCT_CORE_CHAIN_REFERENCES.filter((entry) => entry.chainKeys.includes(chainKey))
    .map((entry) => entry.capability)
}

export function buildProductCoreChainRelations(capabilities, catalog, references = PRODUCT_CORE_CHAIN_REFERENCES) {
  const names = new Set(capabilities.map((entry) => entry.capability))
  const chains = new Map(catalog.businessChains.map((chain) => [chain.key, chain]))
  const seen = new Set()
  for (const entry of references) {
    if (!names.has(entry.capability) || seen.has(entry.capability) ||
      !entry.chainKeys.length || new Set(entry.chainKeys).size !== entry.chainKeys.length ||
      entry.chainKeys.some((key) => !chains.has(key))) {
      throw new Error('产品能力与业务链路引用不完整')
    }
    seen.add(entry.capability)
  }
  return new Map(references.map((entry) => [entry.capability, entry.chainKeys.map((key) => ({
    key,
    label: chains.get(key).label,
    definitionURL: productCoreChainURL(key),
    evidenceURL: chainStepAuditURL(key, ''),
  }))]))
}
