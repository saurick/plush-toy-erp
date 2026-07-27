export { DEV_CAPABILITY_LEDGER_ROUTE } from './devRoutes.mjs'

export const DEV_CAPABILITY_LEDGER_SOURCE_PATH =
  'docs/product/产品能力进度台账.md'
export const DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH =
  'docs/customers/yoyoosun/客户交付矩阵.md'

export const DEV_CAPABILITY_SOURCE_ITEMS = Object.freeze([
  Object.freeze({
    key: 'product-capability',
    kind: '全局产品',
    title: '产品能力进度台账',
    sourcePath: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    description: '判断一项产品能力成熟到哪一层、当前边界和下一步。',
    questions: Object.freeze([
      '某项能力目前做到 schema、runtime、API、UI 还是交付层',
      '当前缺口、风险和下一步是什么',
    ]),
    boundary: '不记录单个客户是否已发布、可试用或已验收。',
  }),
  Object.freeze({
    key: 'yoyoosun-customer-matrix',
    kind: '当前客户',
    title: 'yoyoosun 客户能力、交付与差异矩阵',
    sourcePath: DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
    description: '判断永绅当前能看到、试用或验收什么，以及差异如何处理。',
    questions: Object.freeze([
      '当前客户能看到、试用、验收或暂不承诺哪些能力',
      '客户差异归入 Product Core、配置、扩展还是延后',
    ]),
    boundary: '不反向定义 Product Core，也不把技术试用写成客户 UAT。',
  }),
])

export function isDevCapabilityLedgerEnabled(env = import.meta.env) {
  return env?.DEV === true
}

export function buildDevCapabilityDocsHref(path = '') {
  const normalizedPath = String(path || '').trim()
  return normalizedPath
    ? `/__dev/docs?path=${encodeURIComponent(normalizedPath)}`
    : '/__dev/docs'
}
