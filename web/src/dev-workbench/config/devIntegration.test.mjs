import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { RpcMethod, RpcTransport } from '../../common/consts/rpcMethods.generated.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import {
  buildIntegrationEntries,
  filterIntegrationEntries,
  integrationContractLocation,
  integrationPermissions,
  parseIntegrationSearch,
  readIntegrationScenarios,
  readIntegrationEvidence,
  INTEGRATION_EVIDENCE_API,
  INTEGRATION_GUIDE_DOCUMENT,
  readIntegrationGuide,
  readIntegrationCallDetails,
  readIntegrationNames,
  readIntegrationBoundary,
  readIntegrationRelationshipExamples,
  buildIntegrationCurl,
} from './devIntegration.mjs'
import { RpcInspection } from './rpcInspection.generated.mjs'

const api = readFileSync(
  new URL('../../../../server/docs/api.md', import.meta.url),
  'utf8'
)

test('integration field tables preserve nullable unions, conditions and escaped pipes in descriptions', () => {
  const actual = readIntegrationCallDetails(api, RpcMethod)
  const product = actual.get('masterdata.update_product_sku').request
  const unit = product.fields.find((field) => field.name === 'default_unit_id')
  assert.equal(unit.type, 'integer | null')
  assert.equal(unit.required, '可选')
  assert.match(unit.description, /getOptionalPositiveIntPtr/u)
  const source = [
    '#### 示例 `admin.set_disabled`', '', '##### 请求参数', '',
    '| 字段 | 类型 | 必填条件 | 说明 |', '| --- | --- | --- | --- |',
    '| `disabled` | boolean \\| null | 条件必填 | `a \\|\\| b`；必须保留完整说明。 |', '',
    '```json', '{"jsonrpc":"2.0","method":"set_disabled","params":{"disabled":true},"id":"demo"}', '```',
  ].join('\n')
  const parsed = readIntegrationCallDetails(source, RpcMethod).get('admin.set_disabled').request.fields[0]
  assert.deepEqual(parsed, { name: 'disabled', type: 'boolean | null', required: '条件必填', description: '`a || b`；必须保留完整说明。' })
  assert.deepEqual(readIntegrationCallDetails(source.replaceAll('\\|', '&#124;'), RpcMethod).get('admin.set_disabled').request.fields[0], parsed)
})

test('integration selection reads the formal guide and links to its chapter', () => {
  const specification = readFileSync(
    new URL(`../../../../${INTEGRATION_GUIDE_DOCUMENT}`, import.meta.url),
    'utf8'
  )
  const guide = readIntegrationGuide(specification)
  assert(specification.includes(guide.source))
  assert.match(guide.selectionSource, /当前优先保障 ERP 核心业务稳定、可扩展、可维护/u)
  assert.match(guide.selectionSource, /明确业务需求、对接对象和数据交换规则后再实施，不作为当前完成条件/u)
  assert.match(guide.selectionSource, /已有实现继续维护/u)
  for (const status of ['已有实现', '模拟验证', '真实接入']) {
    assert(guide.selectionSource.includes(`| ${status} |`), `${status} is visible from the formal source`)
  }
  assert.match(guide.selectionSource, /尚无真实第三方或上下游系统接入/u)
  assert.match(guide.selectionSource, /不能替代真实联调或验收/u)
  assert.match(guide.source, /直接调用已有 API/u)
  assert.match(guide.source, /共用接入代码/u)
  assert.match(guide.source, /增加小型适配器/u)
  assert.match(guide.source, /合作方身份、真实联调和验收/u)
  assert.match(guide.selectionSource, /增加小型适配器/u)
  assert.doesNotMatch(guide.selectionSource, /适配器负责/u)
  assert.match(guide.boundarySource, /授权、状态、数量、并发幂等/u)
  assert.match(guide.detailsSource, /合作方身份、真实联调和验收/u)
  assert.equal(
    new URLSearchParams(guide.location.search).get('path'),
    INTEGRATION_GUIDE_DOCUMENT
  )
  assert.equal(
    decodeURIComponent(guide.location.hash),
    '#接入方式选择--integration-selection'
  )
  assert.doesNotMatch(guide.source, /## 命名/u)
})

test('integration keeps every field across grouped tables and excludes explanatory tables', () => {
  const source = [
    '#### 示例 `admin.set_disabled`', '', '##### 请求参数', '',
    '**账号**', '', '| 字段 | 类型 | 必填条件 | 说明 |', '| --- | --- | --- | --- |',
    '| `id` | integer | 必填 | 账号标识。 |', '',
    '**状态**', '', '| 字段 | 类型 | 必填条件 | 说明 |', '| --- | --- | --- | --- |',
    '| `disabled` | boolean &#124; null | 条件必填 | 新状态。 |', '',
    '| 情况 | 处理 |', '| --- | --- |', '| 停用 | 撤销访问 |', '',
    '```json', '{"jsonrpc":"2.0","method":"set_disabled","params":{"id":1,"disabled":true},"id":"grouped"}', '```',
  ].join('\n')
  const { request } = readIntegrationCallDetails(source, RpcMethod).get('admin.set_disabled')
  assert.deepEqual(request.fields.map(({ name, type }) => ({ name, type })), [
    { name: 'id', type: 'integer' }, { name: 'disabled', type: 'boolean | null' },
  ])
  assert.equal(request.example.params.id, 1)
  assert.match(request.notesSource, /停用.*撤销访问/u)
  assert.doesNotMatch(request.notesSource, /\| `id`/u)
})

test('integration selection respects Markdown fences and chapter boundaries and marks absent guidance', () => {
  const heading = '### 接入方式选择 / Integration Selection'
  const body = '正文\n\n#### 业务含义\n\n保留本节内容\n\n```md\n### 示例标题\n```'
  const source = [
    '```md', heading, '围栏示例不能作为指引', '```',
    heading, '', body, '', '### 其他章节', '其他内容',
  ].join('\n')
  assert.equal(readIntegrationGuide(source).source, body)
  assert.equal(readIntegrationGuide(source.replaceAll('\n', '\r\n')).source, body)
  assert.equal(readIntegrationGuide('没有对应章节'), null)
  assert.equal(readIntegrationGuide(`${heading}\n\n## 其他章节`), null)
})

test('integration scenarios derive unique real methods and tests from the formal table', () => {
  const rows = readIntegrationScenarios(api)
  assert.equal(rows.length, 7)
  assert(rows.some((row) => row.test === 'TestSourceDocumentPostgresIntegrationPartnerReadIsolation' && row.methods.includes('partner.get_sales_order') && row.methods.includes('partner.get_purchase_order')))
  for (const row of rows) {
    assert(row.methods.length > 0 || row.label === 'HTTP 准入')
    for (const key of row.methods) {
      const [domain, method] = key.split('.')
      assert(Object.values(RpcMethod[domain] || {}).includes(method), key)
    }
  }
  assert.equal(
    readIntegrationScenarios(['``````md', api, '``````'].join('\n')).length,
    0
  )
  assert.throws(
    () =>
      readIntegrationScenarios(
        api.replace(
          'TestSourceDocumentPostgresIntegrationDraftDataCorrection',
          'TestSourceDocumentPostgresIntegrationSupplierDelivery'
        )
      ),
    /重复/u
  )
})

test('integration evidence reads only the existing quality gate projection and rejects malformed results', async () => {
  const controller = new AbortController()
  const valid = {
    kind: 'plush.integration-evidence',
    current: false,
    run: null,
    scenarios: [],
  }
  const fetchImpl = async (url, options) => {
    assert.equal(url, INTEGRATION_EVIDENCE_API)
    assert.equal(options.signal, controller.signal)
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'same-origin')
    return { ok: true, json: async () => valid }
  }
  assert.deepEqual(
    await readIntegrationEvidence({ fetchImpl, signal: controller.signal }),
    valid
  )
  await assert.rejects(
    readIntegrationEvidence({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ...valid,
          scenarios: [{ test: 'unknown', status: 'passed' }],
        }),
      }),
    }),
    /不完整/u
  )
  await assert.rejects(
    readIntegrationEvidence({ fetchImpl: async () => ({ ok: false }) }),
    /读取失败/u
  )
})

test('integration inventory comes only from generated RPC methods, with exact domain association', () => {
  const entries = buildIntegrationEntries(RpcMethod, api)
  const chineseDomainMatches = filterIntegrationEntries(entries, { domain: 'sales_order', q: '销售订单' })
  assert(chineseDomainMatches.length > 0)
  assert(chineseDomainMatches.every((entry) => entry.domain === 'sales_order'))
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
    /查看销售订单/u
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
      view: 'inventory',
      page: 2,
      rpc: 'sales_order.cancel_sales_order',
      detail: 'request',
      section: '',
      format: 'json',
      example: '',
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
      view: 'inventory',
      page: 1,
      rpc: '',
      detail: 'request',
      section: '',
      format: 'json',
      example: '',
      node: '',
    }
  )
})

test('integration view selection preserves explicit tabs and direct graph links', () => {
  for (const [search, view] of [
    ['', 'inventory'],
    ['?view=inventory', 'inventory'],
    ['?view=guide', 'guide'],
    ['?view=unknown', 'inventory'],
    ['?view=guide&view=inventory', 'inventory'],
    ['?node=access', 'guide'],
    ['?view=inventory&node=access', 'inventory'],
  ]) {
    assert.equal(parseIntegrationSearch(search).view, view, search)
  }
  assert.deepEqual(
    parseIntegrationSearch('?view=guide&domain=sales_order&q=cancel&page=2&node=access'),
    { view: 'guide', domain: 'sales_order', q: 'cancel', page: 2, node: 'access', rpc: '', detail: 'request', section: '', format: 'json', example: '' }
  )
})

test('all registered methods have complete call documentation and preserve production decimal strings', () => {
  const details = readIntegrationCallDetails(api, RpcMethod)
  assert.equal(details.size, Object.values(RpcMethod).reduce((count, methods) => count + Object.keys(methods).length, 0))
  for (const [key, value] of details) {
    assert.equal(value.request.example.method, key.split('.')[1])
    assert.equal(value.request.invalidExample, false)
    assert.equal(value.response.invalidExample, false)
    assert.doesNotMatch(value.request.source, /```json/u)
    assert.doesNotMatch(value.response.source, /```json/u)
  }
  const save = details.get('production_order.save_production_order')
  assert(save.request.fields.some((field) => field.name === 'items[].planned_quantity' && field.type === 'string'))
  assert.doesNotMatch(save.request.notesSource, /\| 字段 \|/u)
  assert.match(save.response.notesSource, /投影/u)
  assert.equal(save.request.example.params.items[0].planned_quantity, '10.5')
  assert.equal(save.request.example.params.expected_version, 1)
  assert.match(save.request.source, /line_no/u)
  assert.match(save.response.source, /production_order_items/u)
  const entries = buildIntegrationEntries(RpcMethod, api)
  assert.equal(
    filterIntegrationEntries(entries, { q: '保存生产订单' })[0].key,
    'production_order.save_production_order'
  )
  const get = entries.find((entry) => entry.key === 'production_order.get_production_order')
  assert.equal(get.domainLabel, '生产订单')
  assert.deepEqual(get.contract.documentation.request.fields, [{
    name: 'production_order_id',
type: 'integer',
required: '必填',
    description: '正 JSON 安全整数；不接受 id 别名或额外字段。',
  }])
  assert.equal(get.contract.kind, 'detail')
  assert.match(decodeURIComponent(integrationContractLocation(get.contract).hash), /查看生产订单/u)
  const curl = buildIntegrationCurl(get, RpcTransport)
  assert.match(curl, /POST/u)
  assert.match(curl, /<服务地址>\/rpc\/production_order/u)
  assert.match(curl, /Bearer <访问令牌>/u)
  assert.match(curl, /"production_order_id":1/u)
})

test('all current interfaces have independent Chinese names, purposes and exact source entries', () => {
  const entries = buildIntegrationEntries(RpcMethod, api, RpcInspection)
  const names = readIntegrationNames(api, RpcMethod)
  assert.equal(names.size, entries.length)
  for (const entry of entries) {
    assert.match(entry.label, /\p{Script=Han}/u, entry.key)
    assert(entry.domain === 'bom' || /\p{Script=Han}/u.test(entry.domainLabel), entry.domain)
    assert(entry.description.length > entry.label.length, entry.key)
    assert.match(entry.inspection.entry.path, /^server\/internal\/service\/.+\.go$/u)
    assert(entry.inspection.entry.line > 0)
  }
  const password = entries.find((entry) => entry.key === 'admin.change_password')
  assert.equal(password.label, '修改本人密码')
  assert.equal(password.contract.documentation.response.example.result.data, null)
  assert.deepEqual(password.inspection.parameters.map((field) => field.name), ['new_password', 'old_password'])
  const workflow = entries.find((entry) => entry.key === 'workflow.urge_task')
  assert.equal(workflow.label, '催办任务')
  assert.equal(workflow.contract.documentation.request.example.method, RpcMethod.workflow.URGE_TASK)
  assert(workflow.contract.documentation.request.fields.some((field) => field.name === 'task_id' && field.type === 'integer'))
  assert(workflow.contract.references.includes('server/internal/service/jsonrpc_workflow_test.go'))
  assert(workflow.inspection.parameters.length > 0)
  assert(workflow.inspection.parameters.some((field) => field.name === 'task_id'))
  assert(!workflow.inspection.parameters.some((field) => field.name === 'id'))
  assert.throws(() => readIntegrationNames(api.replace('| `change_password` | 修改本人密码 |', '| `removed_method` | 修改本人密码 |'), RpcMethod), /不一致/u)
})

test('name and purpose tables do not become field contracts or hide a precise existing chapter', () => {
  const source = [
    '### 账号与权限 `admin`', '',
    '| 方法 | 中文名称 | 用途 |', '| --- | --- | --- |',
    '| `read` | 查看资料 | 查询本人资料。 |',
    '| `write` | 保存资料 | 保存当前编辑。 |', '',
    '#### 资料读取规则', '', '`read` 按当前身份读取资料。',
  ].join('\n')
  const entries = buildIntegrationEntries({ admin: { READ: 'read', WRITE: 'write' } }, source)
  assert.equal(entries.find((entry) => entry.method === 'read').contract.heading.title, '资料读取规则')
  assert.equal(entries.find((entry) => entry.method === 'write').contract, null)
  assert.equal(entries.find((entry) => entry.method === 'write').label, '保存资料')
})

test('call details reject incorrect examples and ignore fenced headings and removed methods', () => {
  const source = [
    '```md', '#### 伪标题 `production_order.get`', '##### 请求参数', '```',
    '#### 查询 `production_order.get`', '',
    '##### 请求参数', '', '| 字段 | 类型 |', '| --- | --- |', '| production_order_id | integer |', '',
    '```json', '{"jsonrpc":"2.0","id":"example","method":"wrong","params":{}}', '```', '',
    '##### 返回结果', '', '```json', '{"jsonrpc":"2.0","id":"example","result":{"code":"0","data":{}}}', '```', '',
    '#### 已移除 `production_order.removed`', '##### 请求参数', '不会进入清单',
  ].join('\n')
  const details = readIntegrationCallDetails(source, { production_order: { GET: 'get' } })
  assert.equal(details.size, 1)
  assert.equal(details.get('production_order.get').request.example, null)
  assert.equal(details.get('production_order.get').request.invalidExample, true)
  assert.equal(details.get('production_order.get').response.example, null)
  const valid = [
    '#### 查询 `production_order.get`',
    '##### 请求参数', '字段说明',
    '~~~~json', '{"jsonrpc":"2.0","id":"example","method":"get","params":{}}', '~~~~',
    '##### 返回结果', '投影说明',
    '~~~~json', '{"jsonrpc":"2.0","id":"example","result":{"code":0,"data":{}}}', '~~~~',
  ].join('\n')
  const wideFence = readIntegrationCallDetails(valid, { production_order: { GET: 'get' } }).get('production_order.get')
  assert.equal(wideFence.request.example.method, 'get')
  assert.equal(wideFence.request.source, '字段说明')
  assert.equal(wideFence.response.source, '投影说明')
  assert.equal(
    readIntegrationCallDetails(
      valid.replace('"data":{}', '"data":[]'), { production_order: { GET: 'get' } }
    ).get('production_order.get').response.invalidExample,
    true
  )
  assert.equal(readIntegrationCallDetails('# 没有调用资料', RpcMethod).size, 0)
  assert.equal(buildIntegrationCurl({ contract: null }, RpcTransport), '')
})

test('integration access and future examples reuse formal sources without invented actual adapters', () => {
  const boundary = readIntegrationBoundary(api)
  assert.match(boundary, /员工业务接口与合作方订单只读入口分别鉴权/u)
  assert.match(boundary, /没有合作方业务写入、外部小系统或真实第三方联调/u)
  assert.doesNotMatch(boundary, /Swagger/u)
  assert.equal(readIntegrationBoundary('# 缺失'), '')
  const specification = readFileSync(
    new URL(`../../../../${INTEGRATION_GUIDE_DOCUMENT}`, import.meta.url), 'utf8'
  )
  const examples = readIntegrationRelationshipExamples(specification)
  assert.deepEqual(examples.rows.map((row) => row.label), ['直接调用', '适配后调用', 'ERP 主动对接'])
  assert.deepEqual(examples.rows[1].steps.map((step) => step.title), ['对接方', '入站适配器', '现有受控业务 API'])
  assert.equal(examples.rows[1].steps[1].description, '协议、单位与外部编号转换')
  assert.match(examples.rows[2].note, /不一定新增本地 API/u)
  assert.match(specification, /均未实施/u)
  assert.equal(readIntegrationRelationshipExamples('# 缺失'), null)
  assert.equal(parseIntegrationSearch('?detail=response').detail, 'response')
  assert.equal(parseIntegrationSearch('?detail=response&detail=governance').detail, 'request')
  assert.equal(parseIntegrationSearch('?detail=unknown').detail, 'request')
})

test('integration detail links validate section and format and preserve the selected relationship example', () => {
  const selected = parseIntegrationSearch('?detail=governance&section=evidence&format=curl&example=适配后调用')
  assert.equal(selected.section, 'evidence')
  assert.equal(selected.format, 'curl')
  assert.equal(selected.example, '适配后调用')
  for (const section of ['access', 'permissions', 'contract', 'evidence']) {
    assert.equal(parseIntegrationSearch(`?section=${section}`).section, section)
  }
  for (const search of [
    '?section=unknown&format=unknown',
    '?section=contract&section=evidence&format=json&format=curl&example=a&example=b',
  ]) {
    const parsed = parseIntegrationSearch(search)
    assert.equal(parsed.section, '')
    assert.equal(parsed.format, 'json')
    assert.equal(parsed.example, '')
  }
})
