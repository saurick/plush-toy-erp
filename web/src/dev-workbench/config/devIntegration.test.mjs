import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import {
  buildIntegrationEntries,
  filterIntegrationEntries,
  integrationContractLocation,
  integrationPermissions,
  parseIntegrationSearch,
} from './devIntegration.mjs'

const api = readFileSync(
  new URL('../../../../server/docs/api.md', import.meta.url),
  'utf8'
)

test('integration inventory comes only from generated RPC methods, with exact domain association', () => {
  const entries = buildIntegrationEntries(RpcMethod, api)
  const expected = Object.entries(RpcMethod)
    .flatMap(([domain, methods]) =>
      Object.values(methods).map((method) => `${domain}.${method}`)
    )
    .sort()
  assert.deepEqual(entries.map((entry) => entry.key).sort(), expected)
  assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length)
  const read = entries.find(
    (entry) => entry.key === 'sales_order.get_sales_order'
  )
  assert.equal(read.contract.kind, 'detail')
  assert.match(read.contract.fields, /正整数/u)
  assert.match(read.contract.authorization, /sales_order.read/u)
  assert.match(
    decodeURIComponent(integrationContractLocation(read.contract).hash),
    /代表性接口合同/u
  )
  const list = entries.find(
    (entry) => entry.key === 'sales_order.list_sales_orders'
  )
  assert.equal(list.contract.kind, 'chapter')
  assert.equal(list.contract.heading.title, '销售订单 sales_order')
  for (const entry of entries) {
    for (const path of entry.contract?.references || []) {
      assert(existsSync(new URL(`../../../../${path}`, import.meta.url)), path)
    }
  }
})

test('integration contracts ignore fences, removed methods, wrong domains and non-test links', () => {
  const rpc = {
    sales_order: { GET: 'get' },
    purchase_order: { GET: 'get', SAVE: 'save' },
  }
  const source = [
    '# API',
    '## 合同',
    '| 域 / 方法 | 入参 | 授权 | 重试 | 来源 |',
    '| --- | --- | --- | --- | --- |',
    '| `sales_order / get` | `id` | `sales.read` | 只读 | [测试](../internal/service/sales_test.go) [外部](https://example.com/test.go) |',
    '| `sales_order / removed` | `id` | 读 | 只读 | |',
    '### 读取 `sales_order.get`',
    '同一方法的后续章节不覆盖已登记明细。',
    '### 采购 `purchase_order`',
    '`get` 为只读。',
    '```md',
    '### 销售 `sales_order`',
    '`save` 不是真实合同。',
    '```',
  ].join('\n')
  const entries = buildIntegrationEntries(rpc, source)
  assert.equal(entries.length, 3)
  assert.equal(
    entries.find((entry) => entry.key === 'purchase_order.get').contract.kind,
    'chapter'
  )
  assert.equal(
    entries.find((entry) => entry.key === 'purchase_order.save').contract,
    null
  )
  assert.deepEqual(
    entries.find((entry) => entry.key === 'sales_order.get').contract
      .references,
    ['server/internal/service/sales_test.go']
  )
})

test('integration permissions invert existing exact method registrations without inferring grants', () => {
  const registration = {
    permission_key: PermissionCode.SALES_ORDER_READ,
    name: '查看销售订单',
    usage: {
      backend_methods: [
        { domain: 'sales_order', method: 'get_sales_order' },
        { domain: 'sales_order', method: 'get_sales_order' },
      ],
      conditions: ['受对象范围限制'],
    },
  }
  const mapped = integrationPermissions([
    registration,
    { permission_key: 'unrelated', usage: { backend_methods: null } },
  ])
  assert.deepEqual(mapped.get('sales_order.get_sales_order'), [
    {
      key: PermissionCode.SALES_ORDER_READ,
      name: '查看销售订单',
      conditions: ['受对象范围限制'],
    },
  ])
  assert.equal(mapped.has('purchase_order.get_sales_order'), false)
  assert.equal(mapped.has('sales_order.cancel_sales_order'), false)
  assert.deepEqual(integrationPermissions().size, 0)
  assert.throws(() => integrationPermissions([null]), /权限标识/u)
  assert.throws(
    () =>
      integrationPermissions([
        {
          ...registration,
          usage: { backend_methods: [null] },
        },
      ]),
    /方法关联/u
  )
  assert.equal(registration.usage.backend_methods.length, 2)
})

test('integration search combines domain and case-insensitive method words and keeps missing matches empty', () => {
  const entries = buildIntegrationEntries(RpcMethod, api)
  const result = filterIntegrationEntries(entries, {
    domain: 'sales_order',
    q: 'CANCEL sales',
  })
  assert.deepEqual(
    result.map((entry) => entry.key),
    ['sales_order.cancel_sales_order']
  )
  assert.deepEqual(
    filterIntegrationEntries(entries, { domain: '__proto__' }),
    []
  )
  assert.deepEqual(
    filterIntegrationEntries(entries, { q: 'method-that-does-not-exist' }),
    []
  )
  assert.equal(filterIntegrationEntries(entries, {}).length, entries.length)
  assert.deepEqual(
    parseIntegrationSearch(
      '?domain=sales_order&q=cancel&page=2&rpc=sales_order.cancel_sales_order'
    ),
    {
      domain: 'sales_order',
      q: 'cancel',
      page: 2,
      rpc: 'sales_order.cancel_sales_order',
      node: '',
    }
  )
  assert.deepEqual(
    parseIntegrationSearch(
      '?domain=sales_order&domain=inventory&q=x&q=y&page=-1&rpc=a&rpc=b&node=x&node=y'
    ),
    {
      domain: '',
      q: '',
      page: 1,
      rpc: '',
      node: '',
    }
  )
})
