import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'

import { canListenOnPort } from './localPort.mjs'
import { checkDevCustomerPackage } from './startYoyoosunDev.mjs'
import {
  buildYoyoosunLocalEntryAudit,
  classifyAssetResponse,
  classifyCustomerConfigResponse,
} from './yoyoosunLocalEntryAudit.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const webRoot = path.join(repoRoot, 'web')

function runScript(scriptName, env = {}) {
  return spawnSync(
    process.execPath,
    [
      path.join(webRoot, 'scripts', scriptName),
      '--print-plan',
      '--port',
      '5188',
      '--api-origin',
      'http://127.0.0.1:8300',
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ERP_CUSTOMER_KEY: '',
        PORT: '',
        API_ORIGIN: '',
        ERP_FRONTEND_ONLY: '',
        ...env,
      },
    }
  )
}

function assertCommonYoyoosunPlan(output, label) {
  assert.match(output, new RegExp(`\\[${label}\\] customer=yoyoosun`, 'u'))
  assert.match(output, new RegExp(`\\[${label}\\] port=\\d+`, 'u'))
  assert.match(
    output,
    new RegExp(`\\[${label}\\] url=http://localhost:\\d+/erp`, 'u')
  )
  assert.match(
    output,
    new RegExp(`\\[${label}\\] backend=http://127\\.0\\.0\\.1:8300`, 'u')
  )
  assert.match(
    output,
    new RegExp(
      `\\[${label}\\] customer_config publish/activate is not executed`,
      'u'
    )
  )
  assert.match(
    output,
    new RegExp(
      `\\[${label}\\] verify customer config: curl -fsS http://localhost:\\d+/customer-config\\.js \\| grep 'customerKey: "yoyoosun"'`,
      'u'
    )
  )
  assert.match(
    output,
    new RegExp(
      `\\[${label}\\] verify customer asset: curl -fsSI http://localhost:\\d+/customer-assets/yoyoosun/favicon-yoyoosun\\.svg \\| grep -i 'content-type: image/svg\\+xml'`,
      'u'
    )
  )
}

async function findConsecutiveFreePortPair(
  startPort = 39200,
  maxProbeCount = 200
) {
  for (let offset = 0; offset < maxProbeCount; offset += 1) {
    const port = startPort + offset
    if ((await canListenOnPort(port)) && (await canListenOnPort(port + 1))) {
      return port
    }
  }

  throw new Error(
    `no consecutive free ports found from ${startPort} within ${maxProbeCount} ports`
  )
}

test('start:yoyoosun print-plan describes dev injection without publishing customer config', () => {
  const result = runScript('startYoyoosunDev.mjs')

  assert.equal(result.status, 0, result.stderr)
  assertCommonYoyoosunPlan(result.stdout, 'start-yoyoosun')
  assert.match(result.stdout, /mode=vite dev server with HMR/u)
  assert.match(
    result.stdout,
    /preflight=database migration \+ backend health\/ready \+ customer config\/assets/u
  )
  assert.match(result.stdout, /ERP_DEV_CUSTOMER_KEY=yoyoosun/u)
  assert.match(
    result.stdout,
    /\[start-yoyoosun\] desktop fallback=same-key builtin RBAC is local preview only; customer business pages still require an active revision/u
  )
  assert.match(result.stdout, /make dev_restart/u)
  assert.match(result.stdout, /local default=yoyoosun/u)
  assert.match(result.stdout, /local-test gate enabled/u)
  assert.match(result.stdout, /explicit demo override remains available/u)
  assert.match(
    result.stdout,
    /\/__dev\/customer-config\?customer=yoyoosun&view=import&action=test-apply/u
  )
  assert.match(result.stdout, /login, review, then apply explicitly/u)
  assert.match(result.stdout, /ERP_VITE_PORT=\d+/u)
  assert.match(result.stdout, /pnpm start:yoyoosun/u)
})

test('start:yoyoosun statically verifies the dev customer config and public asset sources', () => {
  const result = checkDevCustomerPackage('yoyoosun', repoRoot)
  assert.equal(result.customerKey, 'yoyoosun')
  assert.match(result.configPath, /customer-config\.example\.js$/u)
  assert.match(result.faviconPath, /favicon-yoyoosun\.svg$/u)
})

test('start:yoyoosun ignores ambient frontend-only environment state', () => {
  const result = runScript('startYoyoosunDev.mjs', {
    ERP_FRONTEND_ONLY: '1',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    /preflight=database migration \+ backend health\/ready \+ customer config\/assets/u
  )
  assert.doesNotMatch(result.stdout, /frontend-only/u)
})

test('preview:yoyoosun print-plan describes static package injection without publishing customer config', () => {
  const result = runScript('previewYoyoosun.mjs')

  assert.equal(result.status, 0, result.stderr)
  assertCommonYoyoosunPlan(result.stdout, 'preview-yoyoosun')
  assert.match(result.stdout, /pnpm build:all/u)
  assert.match(
    result.stdout,
    /apply-customer-web-config\.mjs --customer yoyoosun/u
  )
  assert.match(
    result.stdout,
    /APP_ID=desktop PORT=\d+ API_ORIGIN=http:\/\/127\.0\.0\.1:8300 pnpm serve:prod/u
  )
})

test('start:yoyoosun and preview:yoyoosun print-plan explain port fallback when requested port is occupied', async () => {
  const occupiedPort = await findConsecutiveFreePortPair()
  const server = net.createServer()

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(occupiedPort, '0.0.0.0', resolve)
  })

  try {
    for (const [scriptName, label] of [
      ['startYoyoosunDev.mjs', 'start-yoyoosun'],
      ['previewYoyoosun.mjs', 'preview-yoyoosun'],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(webRoot, 'scripts', scriptName),
          '--print-plan',
          '--port',
          String(occupiedPort),
          '--api-origin',
          'http://127.0.0.1:8300',
        ],
        {
          cwd: webRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            ERP_CUSTOMER_KEY: '',
            PORT: '',
            API_ORIGIN: '',
          },
        }
      )

      assert.equal(result.status, 0, result.stderr)
      assert.match(
        result.stdout,
        new RegExp(
          `\\[${label}\\] requested port ${occupiedPort} is occupied; using ${
            occupiedPort + 1
          }`,
          'u'
        )
      )
      assert.doesNotMatch(
        result.stdout,
        new RegExp(`\\[${label}\\] port=${occupiedPort}`, 'u')
      )
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('audit:yoyoosun-entry classifies product core, other app fallback, and yoyoosun injection', async () => {
  assert.deepEqual(
    classifyCustomerConfigResponse({
      ok: true,
      status: 200,
      contentType: 'text/javascript',
      body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({ customerKey: "yoyoosun" })',
    }),
    {
      status: 'yoyoosun_config',
      matchedCustomer: true,
      reason: 'customerKey=yoyoosun',
    }
  )
  assert.equal(
    classifyCustomerConfigResponse({
      ok: true,
      status: 200,
      contentType: 'text/javascript',
      body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = window.__PLUSH_ERP_CUSTOMER_CONFIG__ || null',
    }).status,
    'product_core_placeholder'
  )
  assert.equal(
    classifyCustomerConfigResponse({
      ok: true,
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Other App</title>',
    }).status,
    'html_fallback'
  )
  assert.deepEqual(
    classifyAssetResponse({
      ok: true,
      status: 200,
      contentType: 'image/svg+xml',
    }),
    {
      status: 'yoyoosun_asset',
      matchedCustomerAsset: true,
      reason: 'content-type=image/svg+xml',
    }
  )

  const report = await buildYoyoosunLocalEntryAudit(
    {
      ports: ['5175', '5176', '5177'],
      backendHealthURL: 'http://127.0.0.1:8300/healthz',
    },
    {
      getPortProcess: async (port) => ({
        listening: true,
        pid: `pid-${port}`,
        command: `vite-${port}`,
        cwd:
          port === '5176'
            ? '/Users/simon/projects/openai-oauth-api-service/web'
            : '/Users/simon/projects/plush-toy-erp/web',
      }),
      fetchText: async (url) => {
        if (url.endsWith('/healthz')) {
          return {
            ok: true,
            status: 200,
            contentType: 'text/plain',
            body: 'ok',
          }
        }
        if (url.includes(':5177/')) {
          return {
            ok: true,
            status: 200,
            contentType: 'text/javascript',
            body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({ customerKey: "yoyoosun" })',
          }
        }
        if (url.includes(':5175/')) {
          return {
            ok: true,
            status: 200,
            contentType: 'text/javascript',
            body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = window.__PLUSH_ERP_CUSTOMER_CONFIG__ || null',
          }
        }
        return {
          ok: true,
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><title>OpenAI OAuth API Service</title>',
        }
      },
      fetchHead: async (url) => ({
        ok: true,
        status: 200,
        contentType: url.includes(':5177/')
          ? 'image/svg+xml'
          : 'text/html; charset=utf-8',
        body: '',
      }),
    }
  )

  assert.equal(report.scope, 'yoyoosun-local-entry-audit')
  assert.equal(report.readOnly, true)
  assert.equal(report.writesDatabase, false)
  assert.equal(report.writesReport, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.readsSecrets, false)
  assert.deepEqual(report.summary.yoyoosunPorts, ['5177'])
  assert.deepEqual(report.summary.productCorePlaceholderPorts, ['5175'])
  assert.deepEqual(report.summary.htmlFallbackPorts, ['5175', '5176'])
  assert(report.notProvenByThisAudit.includes('real login'))
  assert(
    report.notProvenByThisAudit.includes(
      'customer_config.get_effective_session source'
    )
  )
})

test('audit:yoyoosun-entry default port scan includes second fallback port', async () => {
  const report = await buildYoyoosunLocalEntryAudit(
    {
      backendHealthURL: 'http://127.0.0.1:8300/healthz',
    },
    {
      getPortProcess: async (port) => ({
        listening: false,
        pid: '',
        command: '',
        cwd: `mock-${port}`,
      }),
      fetchText: async (url) => {
        if (url.endsWith('/healthz')) {
          return {
            ok: true,
            status: 200,
            contentType: 'text/plain',
            body: 'ok',
          }
        }
        return {
          ok: false,
          status: 0,
          contentType: '',
          body: '',
        }
      },
      fetchHead: async () => ({
        ok: false,
        status: 0,
        contentType: '',
        body: '',
      }),
    }
  )

  assert.deepEqual(report.summary.checkedPorts, [
    '5175',
    '5176',
    '5177',
    '5178',
    '5179',
  ])
})

test('audit:yoyoosun-entry CLI rejects backend health URLs with credentials', () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(webRoot, 'scripts/yoyoosunLocalEntryAudit.mjs'),
      '--backend-health-url',
      'http://demo:secret@127.0.0.1:8300/healthz',
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
    }
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /must not include username or password/u)
})

test('audit:yoyoosun-entry help documents current default port range', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(webRoot, 'scripts/yoyoosunLocalEntryAudit.mjs'), '--help'],
    {
      cwd: webRoot,
      encoding: 'utf8',
    }
  )

  assert.equal(result.status, 0)
  assert.match(result.stdout, /--ports 5175,5176,5177,5178,5179/u)
  assert.match(
    result.stdout,
    /--report output\/yoyoosun-local-entry-audit\.json/u
  )
})

test('audit:yoyoosun-entry CLI can write a local no-write report outside release evidence', () => {
  const reportPath = path.join(
    repoRoot,
    'output',
    'yoyoosun-entry-audit-test.json'
  )
  rmSync(reportPath, { force: true })

  const result = spawnSync(
    process.execPath,
    [
      path.join(webRoot, 'scripts/yoyoosunLocalEntryAudit.mjs'),
      '--ports',
      '51980',
      '--backend-health-url',
      'http://localhost:51981/healthz',
      '--report',
      'output/yoyoosun-entry-audit-test.json',
      '--json',
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
    }
  )
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const stdoutReport = JSON.parse(result.stdout)

  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stderr,
    /report written: output\/yoyoosun-entry-audit-test\.json/u
  )
  assert.equal(report.scope, 'yoyoosun-local-entry-audit')
  assert.equal(report.readOnly, true)
  assert.equal(report.writesDatabase, false)
  assert.equal(report.writesReport, true)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.readsSecrets, false)
  assert.deepEqual(stdoutReport.summary.checkedPorts, ['51980'])

  rmSync(reportPath, { force: true })
})

test('audit:yoyoosun-entry CLI refuses writing reports into deployments evidence', () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(webRoot, 'scripts/yoyoosunLocalEntryAudit.mjs'),
      '--report',
      'deployments/yoyoosun/evidence/releases/2026-06-29/yoyoosun-entry-audit.json',
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
    }
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /must not be inside deployments evidence/u)
})

test('package scripts expose yoyoosun local entry audit', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(webRoot, 'package.json'), 'utf8')
  )

  assert.equal(
    packageJson.scripts['audit:yoyoosun-entry'],
    'node ./scripts/yoyoosunLocalEntryAudit.mjs'
  )
})
