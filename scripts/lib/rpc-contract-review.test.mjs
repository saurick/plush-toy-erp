import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRPCDocumentation, compareRPCContracts, inspectRPCDocumentation, normalizeRPCCatalog, requiresRPCContractCheck } from './rpc-contract-review.mjs'

const rpc = { orders: { LIST: 'list' } }
const table = '### 订单 `orders`\n\n| 方法 | 中文名称 | 用途 |\n| --- | --- | --- |\n| `list` | 查询订单 | 查询当前范围订单 |\n'
const sample = () => ({ rpc, rpcCalls: { orders: { list: {
  dataType: 'object', parameters: [{ name: 'note', type: 'string', required: '可选', nullable: true, description: '缺省值：空', source: { path: 'a.go', line: 1 } }],
  response: [{ name: 'result.data.total', type: 'integer', source: { path: 'a.go', line: 2 } }], example: { basis: 'backend-wire-shape' },
} } }, rpcInspection: { orders: { list: { entry: { path: 'a.go', line: 1 } } } } })

test('RPC directory rejects missing, duplicate, removed and unknown-domain entries', () => {
  assert.equal(assertRPCDocumentation(rpc, table).names.size, 1)
  for (const source of ['', table + '| `list` | 重复 | 重复用途 |\n', table + '| `removed` | 已删除 | 旧用途 |\n', table + '\n### 外部 `unknown`\n| 方法 | 中文名称 | 用途 |\n| --- | --- | --- |\n| `list` | 外部 | 旧用途 |\n', table + '\n#### 已删除 `orders.removed`\n']) {
    assert.throws(() => assertRPCDocumentation(rpc, source), /接口目录不一致/u)
  }
  assert.throws(() => assertRPCDocumentation(rpc, table + '\n#### 详情 `orders.list`\n\n#### 重复详情 `orders.list`\n'), /人工调用合同重复/u)
})

test('RPC directory ignores tables in fences and lets the generator replace old generated sections', () => {
  const source = table + '\n~~~~markdown\n### 伪造 `unknown`\n| 方法 | 中文名称 | 用途 |\n| `oops` | 伪造 | 伪造 |\n~~~~\n<!-- BEGIN GENERATED RPC FIELD CONTRACTS -->\n#### 旧生成 `orders.removed`\n<!-- END GENERATED RPC FIELD CONTRACTS -->'
  assert.deepEqual(inspectRPCDocumentation(rpc, source).issues, [])
  assert.throws(() => assertRPCDocumentation(rpc, table + '<!-- BEGIN GENERATED RPC FIELD CONTRACTS -->'), /生成标记/u)
})

test('RPC comparison ignores source movement and reports type, required, null, default and conditional changes', () => {
  const before = sample()
  const after = structuredClone(before)
  after.rpcCalls.orders.list.parameters[0].source.line = 99
  after.rpcCalls.orders.list.response[0].source.path = 'moved.go'
  after.rpcInspection.orders.list.entry.line = 100
  assert.deepEqual(compareRPCContracts(normalizeRPCCatalog(before, table), normalizeRPCCatalog(after, table)), [])
  Object.assign(after.rpcCalls.orders.list.parameters[0], { nullable: false, required: '条件必填', requiredWhen: [{ field: 'mode', equals: 'edit' }], description: '缺省值：draft' })
  after.rpcCalls.orders.list.response[0].type = 'string'
  const [change] = compareRPCContracts(normalizeRPCCatalog(before, table), normalizeRPCCatalog(after, table))
  assert.equal(change.key, 'orders.list')
  assert.deepEqual(change.fields.map((field) => field.path).sort(), ['parameters.note.description', 'parameters.note.nullable', 'parameters.note.required', 'parameters.note.requiredWhen', 'response.result.data.total.type'].sort())
})

test('RPC comparison reports additions, removals and changed names without inventing compatibility aliases', () => {
  const current = normalizeRPCCatalog(sample(), table)
  assert.equal(compareRPCContracts({}, current)[0].kind, 'added')
  assert.equal(compareRPCContracts(current, {})[0].kind, 'removed')
  const renamed = structuredClone(current)
  renamed['orders.list'].label = '查找订单'
  assert.equal(compareRPCContracts(current, renamed)[0].fields[0].path, 'label')
  assert(requiresRPCContractCheck(['server/internal/service/jsonrpc_inventory.go']))
  assert(requiresRPCContractCheck(['server/cmd/public-contracts/testdata/rpc_examples.json']))
  assert(requiresRPCContractCheck(['web/src/dev-workbench/config/rpcInspection.generated.mjs']))
  assert(!requiresRPCContractCheck(['web/src/erp/styles/app/business-tables.css']))
})
