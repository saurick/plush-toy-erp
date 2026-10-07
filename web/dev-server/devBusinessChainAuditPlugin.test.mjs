import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createDevBusinessChainAuditMiddleware,
  createDevBusinessChainAuditService,
} from './devBusinessChainAuditPlugin.mjs'
import { createDevOperatorAuthMiddleware } from './devOperatorAuthPlugin.mjs'
import { buildManualAcceptanceBusinessChainContract } from '../../scripts/qa/manual-acceptance-business-chain-contract.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../src/dev-workbench/config/devFlowStateCatalog.mjs'
import {
  DEV_CHAIN_AUDIT_API,
  chainAuditFreshness,
  chainAuditArtifactURL,
  filterChainAuditSteps,
  validateBusinessChainReport,
  buildChainAuditDiagram,
} from '../src/dev-workbench/config/devBusinessChainAudit.mjs'

const COMMIT = 'a'.repeat(40)
const batch = '20261006-test'
function reportFixture() {
  return {
    generatedAt: '2026-10-06T10:00:00Z',
    title: '实跑报告',
    verdict: '财务入口受阻',
    scope: {
      sourceCommit: COMMIT,
      customer: 'demo',
      data: '隔离模拟',
      mode: 'API',
      terminal: '核销',
      notIncluded: ['银行'],
      chainCount: 1,
      stepCount: 1,
      registeredScenarioCount: 1,
    },
    metrics: { stepStates: { failed: 1 } },
    chains: [
      {
        key: 'purchase_posting_corrections',
        label: '采购纠错',
        summary: '到应付',
        status: 'failed',
        statusLabel: '阻断',
        stepCount: 1,
        steps: [
          {
            key: 'payable',
            number: 1,
            label: '财务入口',
            fromLabel: '入库',
            toLabel: '应付',
            responsibleRole: '财务',
            status: 'failed',
            statusLabel: '入口阻断',
            level: '岗位 API',
            observed: '40304',
            preconditions: ['已入库'],
            actions: ['读取应付'],
            results: ['可读取'],
            facts: ['应付事实'],
          },
        ],
        scenarios: [
          {
            key: 'happy_path',
            label: '正常到尾',
            result: '财务岗位受阻；管理员后续通过',
          },
        ],
        evidence: [{ path: 'evidence/readback.json', label: '入口读回' }],
      },
    ],
    findings: [
      {
        id: 'F1',
        priority: 'P1',
        kind: '岗位配置',
        title: '入口拒绝',
        trigger: '财务查询',
        observed: '40304',
        impact: '财务不能继续',
        cause: '缺少权限',
        recommendation: '核对实际配置再复验',
        evidence: [],
      },
    ],
    coverageLimits: ['管理员通过不等于财务岗位通过'],
    evidence: [],
    createEdit: [],
    mobileActions: [],
    pages: [],
    lineage: [],
    printing: { templates: [] },
    pdfValidation: { templates: [] },
  }
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-chain-audit-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = path.join(root, 'output/qa/business-chain-audit', batch)
  await mkdir(path.join(directory, 'evidence'), { recursive: true })
  const files = []
  async function write(file, content) {
    await writeFile(path.join(directory, file), content)
    const entry = {
      path: file,
      bytes: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
    }
    const index = files.findIndex((item) => item.path === file)
    if (index >= 0) files.splice(index, 1, entry)
    else files.push(entry)
    await writeFile(
      path.join(directory, 'artifact-manifest.json'),
      JSON.stringify({ files })
    )
  }
  await write('report.json', JSON.stringify(reportFixture()))
  await write('evidence/readback.json', '{"code":40304}')
  await write('report.html', '<script>fetch("/__dev/api/private")</script>')
  return {
    root,
    directory,
    write,
    service: createDevBusinessChainAuditService({
      projectRoot: root,
      readIdentity: async () => ({ commit: 'b'.repeat(40), dirty: true }),
    }),
  }
}

function request(
  middleware,
  {
    suffix = '',
    method = 'GET',
    headers = {},
    remoteAddress = '127.0.0.1',
  } = {}
) {
  return new Promise((resolve, reject) => {
    const received = {}
    const response = {
      statusCode: 200,
      setHeader: (key, value) => {
        received[key] = value
      },
      end(body) {
        resolve({ status: this.statusCode, headers: received, body })
      },
    }
    Promise.resolve(
      middleware(
        {
          url: `${DEV_CHAIN_AUDIT_API}${suffix}`,
          method,
          headers: { host: '127.0.0.1:5175', ...headers },
          socket: { remoteAddress },
        },
        response,
        () => resolve({ next: true })
      )
    ).catch(reject)
  })
}

test('audit reads frozen failures and evidence while keeping current source distinct', async (t) => {
  const { service } = await fixture(t)
  assert.equal((await service.list()).batches[0].status, 'ready')
  const result = await service.report(batch)
  assert.equal(result.freshness, 'historical')
  assert.equal(result.report.chains[0].status, 'failed')
  assert.equal(result.report.findings[0].id, 'F1')
  assert.equal(result.definitionComparison.status, 'unverified')
  assert.equal(result.definitionDiagram, null)
  assert.equal(
    (await service.artifact(batch, 'evidence/readback.json')).bytes.toString(),
    '{"code":40304}'
  )
  assert.equal(
    chainAuditFreshness(result.report, { commit: COMMIT, dirty: false }),
    'unverified'
  )
  assert.equal(chainAuditFreshness(result.report, null), 'unknown')
})

test('audit API compares frozen definitions without changing failed observations or hiding coverage gaps', async (t) => {
  const { service, write, root } = await fixture(t)
  const catalog = structuredClone(DEV_FLOW_STATE_CATALOG)
  catalog.businessChains[0].steps[0].condition = '执行时的旧条件'
  const snapshot = buildManualAcceptanceBusinessChainContract({
    catalog,
  }).definitionSnapshot
  const report = reportFixture()
  const chain = snapshot.chains[0]
  report.definitionSnapshot = snapshot
  report.chains[0].key = chain.key
  report.chains[0].steps[0].key = chain.steps[0].key
  report.chains[0].scenarios[0].key = chain.scenarios[0].key
  await write('report.json', JSON.stringify(report))
  const response = await request(
    createDevBusinessChainAuditMiddleware({ projectRoot: root }),
    { suffix: `/report?batch=${batch}` }
  )
  assert.equal(response.status, 200)
  const result = JSON.parse(response.body)
  assert.equal(result.definitionComparison.status, 'changed')
  assert.equal(
    result.definitionComparison.chains[0].stepChanges[0].key,
    chain.steps[0].key
  )
  assert.equal(
    result.definitionComparison.chains[0].unrecordedSteps.length,
    chain.steps.length - 1
  )
  assert.equal(result.report.chains[0].status, 'failed')
  assert.equal(result.definitionDiagram.nodes[0].kind, 'danger')
  assert.equal(result.definitionDiagram.nodes[1].detail, '本批次无记录')
  assert.equal(result.definitionDiagram.edges.length, snapshot.relations.length)

  report.definitionSnapshot.chains[0].steps[0].condition = '损坏的定义'
  await write('report.json', JSON.stringify(report))
  assert.equal((await service.list()).batches[0].status, 'invalid')
  assert.equal(
    (
      await request(
        createDevBusinessChainAuditMiddleware({ projectRoot: root }),
        { suffix: `/report?batch=${batch}` }
      )
    ).status,
    422
  )
})

test('missing directory is empty; invalid reports are visible and never silently passed', async (t) => {
  const { root, directory, service } = await fixture(t)
  await writeFile(path.join(directory, 'report.json'), '{}')
  assert.equal((await service.list()).batches[0].status, 'invalid')
  await assert.rejects(service.report(batch), /不完整|变化/u)
  await rm(path.join(root, 'output'), { recursive: true })
  assert.deepEqual(await service.list(), { batches: [] })
})

test('report validation rejects lost counts, unknown states and malformed observations', () => {
  for (const change of [
    (r) => {
      r.scope.stepCount = 2
    },
    (r) => {
      r.metrics.stepStates.failed = 0
    },
    (r) => {
      r.chains[0].steps[0].status = 'done'
    },
    (r) => {
      r.chains[0].status = 'passed'
    },
    (r) => {
      r.chains[0].steps[0].observed = {}
    },
    (r) => {
      r.chains[0].scenarios = []
    },
    (r) => {
      r.chains[0].scenarios.push(r.chains[0].scenarios[0])
      r.scope.registeredScenarioCount += 1
    },
    (r) => {
      r.findings.push(r.findings[0])
    },
    (r) => {
      r.lineage = [{ stage: {} }]
    },
  ]) {
    const report = reportFixture()
    change(report)
    assert.throws(() => validateBusinessChainReport(report), /不完整/u)
  }
})

test('scoped retests preserve historical findings and require a bounded source batch', () => {
  const report = reportFixture()
  report.retests = [{ id: 'F1', title: '财务派生复验', sourceBatch: '20261006-original', status: 'passed', summary: '财务岗位通过；原批次失败保留', evidence: [] }]
  assert.equal(validateBusinessChainReport(report).findings[0].observed, '40304')
  report.retests[0].sourceBatch = '../../outside'
  assert.throws(() => validateBusinessChainReport(report), /格式或计数/u)
  report.retests[0].sourceBatch = '20261006-original'
  report.retests[0].status = 'fixed'
  assert.throws(() => validateBusinessChainReport(report), /格式或计数/u)
})

test('step filters preserve failed observations and report evidence levels', () => {
  const report = reportFixture()
  assert.equal(filterChainAuditSteps(report, { status: 'passed' }).length, 0)
  assert.equal(filterChainAuditSteps(report, { chain: 'missing' }).length, 0)
  const rows = filterChainAuditSteps(report, {
    keyword: '40304',
    status: 'failed',
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].level, '岗位 API')
  assert.match(chainAuditArtifactURL('x', '../secret'), /file=\.\.%2Fsecret/u)
  const chart = buildChainAuditDiagram({
    nodes: [{ id: 'x[evil]', label: '<script>"bad"', detail: 'raw' }],
    edges: [],
  })
  assert.doesNotMatch(chart, /<script>|x\[evil\]/u)
  assert.match(chart, /n0\[/u)
})

test('evidence must be listed and unchanged; traversal, hidden paths and symlinks are rejected', async (t) => {
  const { root, directory, service } = await fixture(t)
  await writeFile(path.join(directory, 'unlisted.json'), '{}')
  for (const file of [
    '../secret',
    '/etc/passwd',
    'evidence/../../secret',
    'evidence\\secret',
    '.env',
    'unlisted.json',
    'evidence/%2e%2e/secret',
  ]) {
    await assert.rejects(service.artifact(batch, file))
  }
  await assert.rejects(service.report('../batch'))
  await writeFile(path.join(directory, 'evidence/readback.json'), '{"code":0}')
  await assert.rejects(
    service.artifact(batch, 'evidence/readback.json'),
    /不完整|变化/u
  )
  await rm(path.join(directory, 'evidence/readback.json'))
  await symlink(
    path.join(directory, 'report.json'),
    path.join(directory, 'evidence/readback.json')
  )
  await assert.rejects(service.artifact(batch, 'evidence/readback.json'))
  await rm(path.join(directory, 'evidence'), { recursive: true })
  await symlink(root, path.join(directory, 'evidence'))
  await assert.rejects(service.artifact(batch, 'evidence/readback.json'))
})

test('fixed report root cannot be replaced with a symlink', async (t) => {
  const { root, service } = await fixture(t)
  await rm(path.join(root, 'output'), { recursive: true })
  await symlink(root, path.join(root, 'output'))
  await assert.rejects(service.list())
})

test('API is read-only, network bounded, duplicate-parameter safe and downloads HTML as sandboxed attachment', async (t) => {
  const { root } = await fixture(t)
  const middleware = createDevBusinessChainAuditMiddleware({
    projectRoot: root,
    readIdentity: async () => null,
  })
  assert.equal((await request(middleware, { method: 'POST' })).status, 405)
  assert.equal(
    (await request(middleware, { remoteAddress: '203.0.113.1' })).status,
    403
  )
  assert.equal(
    (await request(middleware, { headers: { 'sec-fetch-site': 'cross-site' } }))
      .status,
    403
  )
  for (const suffix of [
    '?path=/etc/passwd',
    '/report?batch=x&batch=y',
    '/report?batch=..%2Fsecret',
    '/artifact?batch=x&file=%2Fetc%2Fpasswd',
  ]) {
    assert.equal((await request(middleware, { suffix })).status, 400)
  }
  const result = await request(middleware, {
    suffix: `/artifact?batch=${batch}&file=report.html`,
  })
  assert.equal(result.status, 200)
  assert.match(result.headers['content-disposition'], /^attachment;/u)
  assert.match(result.headers['content-security-policy'], /sandbox/u)
  assert.equal(result.headers['x-content-type-options'], 'nosniff')
  assert.equal(result.headers['cache-control'], 'no-store')
  const guarded = createDevOperatorAuthMiddleware({
    readAccessMode: () => 'operator',
    readCredentials: () => ({ username: 'operator', password: 'a'.repeat(24) }),
  })
  assert.equal(
    (
      await request(guarded, {
        suffix: `/artifact?batch=${batch}&file=report.html`,
      })
    ).status,
    401
  )
})

test('oversized reports fail closed without reading their full content', async (t) => {
  const { directory, service } = await fixture(t)
  await writeFile(
    path.join(directory, 'report.json'),
    Buffer.alloc(8 * 1024 * 1024 + 1)
  )
  await assert.rejects(service.report(batch), /上限/u)
})
