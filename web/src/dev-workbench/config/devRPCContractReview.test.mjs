import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeRPCContractReview,
  getRPCExecutionPresentation,
  parseRPCReviewSearch,
  readRPCContractReview,
} from './devRPCContractReview.mjs'

const report = () => ({
  kind: 'plush.rpc-contract-review',
  range: 'worktree',
  base: 'a'.repeat(40),
  repository: {
    commit: 'a'.repeat(40),
    fingerprint: 'b'.repeat(64),
    dirty: true,
  },
  current: true,
  readAt: '2026-10-19T10:00:00Z',
  methodCount: 1,
  changes: [
    {
      key: 'orders.list',
      label: '查询订单',
      kind: 'changed',
      fields: [
        {
          path: 'response.total.type',
          kind: 'changed',
          before: 'integer',
          after: 'string',
        },
      ],
      consumers: [
        { key: 'orders.list', path: 'web/src/erp/api/orderApi.mjs', line: 3 },
      ],
    },
  ],
  checks: ['catalog', 'generated', 'staging'].map((key) => ({
    key,
    status: key === 'staging' ? 'missing' : 'passed',
    message: '检查结果',
  })),
  files: [{ path: 'server/docs/api.md', worktreeChanged: true, staged: false }],
  execution: { status: 'missing', current: false, methods: [], registered: [] },
})

test('RPC review query restores range and method without accepting duplicates or invalid selectors', () => {
  assert.deepEqual(
    parseRPCReviewSearch(
      'contractRange=staged&change=orders.list'
    ),
    { range: 'staged', method: 'orders.list' }
  )
  assert.deepEqual(
    parseRPCReviewSearch(
      'contractRange=staged&contractRange=worktree&change=../bad'
    ),
    { range: 'worktree', method: '' }
  )
})

test('RPC execution only presents current receipt as current success and keeps historical outcomes separate', () => {
  const value = report()
  value.execution = {
    status: 'passed',
    current: false,
    methods: [],
    registered: [],
    receipt: 'output/dev-workbench/contracts/examples.json',
  }
  assert.deepEqual(getRPCExecutionPresentation(value), {
    current: false,
    status: 'missing',
    label: '本轮未验证',
    historical: true,
    message: '历史回执未覆盖当前比较对象。',
  })
  value.execution.current = true
  assert.equal(getRPCExecutionPresentation(value).label, '通过')
  value.current = false
  assert.equal(getRPCExecutionPresentation(value).label, '本轮未验证')
  value.execution.message = '样例回执内容损坏'
  assert.equal(getRPCExecutionPresentation(value).status, 'failed')
  assert.equal(getRPCExecutionPresentation(value).label, '回执读取失败')
  assert.equal(getRPCExecutionPresentation(value).message, '样例回执内容损坏')
})

test('RPC review validates source identity, directory, diff, consumers, status uniqueness and safe paths', () => {
  assert.equal(normalizeRPCContractReview(report()).methodCount, 1)
  for (const mutate of [
    (value) => {
      value.current = 'yes'
    },
    (value) => {
      value.repository.fingerprint = ''
    },
    (value) => {
      value.methodCount = -1
    },
    (value) => {
      value.checks[1].key = 'catalog'
    },
    (value) => {
      value.files[0].path = '/etc/passwd'
    },
    (value) => {
      value.changes[0].fields[0].before = {}
    },
    (value) => {
      value.changes[0].consumers[0].path = '../../secret'
    },
    (value) => {
      value.execution.registered = ['orders.list', 'orders.list']
    },
  ]) {
    const value = report()
    mutate(value)
    assert.throws(() => normalizeRPCContractReview(value))
  }
})

test('RPC review fetch stays read-only, uses caller cancellation, and rejects a result from the wrong range', async () => {
  const controller = new AbortController()
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => report() }
  }
  await readRPCContractReview({ signal: controller.signal, fetchImpl })
  assert.equal(
    request.url,
    '/__dev/api/qa/quality-gates/rpc-contract-review?range=worktree'
  )
  assert.equal(request.options.signal, controller.signal)
  assert.equal(request.options.cache, 'no-store')
  assert.equal(request.options.body, undefined)
  await assert.rejects(
    readRPCContractReview({ range: 'staged', fetchImpl }),
    /范围与请求不一致/u
  )
  await assert.rejects(
    readRPCContractReview({ range: 'arbitrary', fetchImpl }),
    /比较范围无效/u
  )
})
