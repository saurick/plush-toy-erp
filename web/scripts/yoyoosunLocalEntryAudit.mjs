#!/usr/bin/env node
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { normalizeDevCustomerKey } from '../devCustomerConfigPlugin.mjs'

const execFileAsync = promisify(execFile)
const webRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webRoot, '..')
export const defaultYoyoosunEntryAuditPorts = Object.freeze([
  '5175',
  '5176',
  '5177',
  '5178',
  '5179',
])
const defaultBackendHealthURL = 'http://127.0.0.1:8300/healthz'

function parseArgs(argv) {
  const options = {
    customer: process.env.ERP_CUSTOMER_KEY || 'yoyoosun',
    ports: [...defaultYoyoosunEntryAuditPorts],
    backendHealthURL:
      process.env.YOYOOSUN_ENTRY_AUDIT_BACKEND_HEALTH_URL ||
      defaultBackendHealthURL,
    json: false,
    report: '',
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--') {
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--report') {
      options.report = next || ''
      index += 1
      continue
    }
    if (arg === '--customer') {
      options.customer = next || ''
      index += 1
      continue
    }
    if (arg === '--ports') {
      options.ports = parsePorts(next || '')
      index += 1
      continue
    }
    if (arg === '--backend-health-url') {
      options.backendHealthURL = next || ''
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  options.customer = normalizeDevCustomerKey(options.customer)
  if (!options.customer) {
    throw new Error('customer is required')
  }
  options.ports = parsePorts(options.ports)
  options.backendHealthURL = normalizeSafeURL(
    options.backendHealthURL,
    'backend health URL'
  )
  if (options.report) {
    options.report = resolveReportPath(options.report)
  }

  return options
}

function resolveReportPath(raw) {
  const value = String(raw || '').trim()
  if (!value) {
    throw new Error('report path is required')
  }
  const resolved = path.resolve(repoRoot, value)
  const evidenceRoot = path.resolve(repoRoot, 'deployments')
  if (
    resolved === evidenceRoot ||
    resolved.startsWith(`${evidenceRoot}${path.sep}`)
  ) {
    throw new Error('report path must not be inside deployments evidence')
  }
  return resolved
}

function parsePorts(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',')
  const ports = values.map((item) => String(item || '').trim()).filter(Boolean)
  if (ports.length === 0) {
    throw new Error('at least one port is required')
  }
  for (const port of ports) {
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      throw new Error(`invalid port: ${port}`)
    }
  }
  return [...new Set(ports)]
}

function normalizeSafeURL(raw, label) {
  const value = String(raw || '').trim()
  if (!value) {
    throw new Error(`${label} is required`)
  }
  const url = new URL(value)
  if (url.username || url.password) {
    throw new Error(`${label} must not include username or password`)
  }
  return url.toString()
}

export function classifyCustomerConfigResponse({
  ok,
  status,
  contentType,
  body,
}) {
  const text = String(body || '')
  if (!ok) {
    return {
      status: 'unreachable',
      matchedCustomer: false,
      reason: `http-${status || 'unreachable'}`,
    }
  }
  if (text.includes('customerKey: "yoyoosun"')) {
    return {
      status: 'yoyoosun_config',
      matchedCustomer: true,
      reason: 'customerKey=yoyoosun',
    }
  }
  if (text.includes('window.__PLUSH_ERP_CUSTOMER_CONFIG__ || null')) {
    return {
      status: 'product_core_placeholder',
      matchedCustomer: false,
      reason: 'neutral-placeholder',
    }
  }
  if (
    String(contentType || '').includes('text/html') ||
    /^\s*<!doctype html/i.test(text)
  ) {
    return {
      status: 'html_fallback',
      matchedCustomer: false,
      reason: 'html-fallback',
    }
  }
  return {
    status: 'unknown_config',
    matchedCustomer: false,
    reason: 'unknown-customer-config-response',
  }
}

export function classifyAssetResponse({ ok, status, contentType }) {
  if (!ok) {
    return {
      status: 'unreachable',
      matchedCustomerAsset: false,
      reason: `http-${status || 'unreachable'}`,
    }
  }
  if (
    String(contentType || '')
      .toLowerCase()
      .includes('image/svg+xml')
  ) {
    return {
      status: 'yoyoosun_asset',
      matchedCustomerAsset: true,
      reason: 'content-type=image/svg+xml',
    }
  }
  if (
    String(contentType || '')
      .toLowerCase()
      .includes('text/html')
  ) {
    return {
      status: 'html_fallback',
      matchedCustomerAsset: false,
      reason: 'html-fallback',
    }
  }
  return {
    status: 'unknown_asset',
    matchedCustomerAsset: false,
    reason: `content-type=${contentType || 'unknown'}`,
  }
}

export async function buildYoyoosunLocalEntryAudit(options = {}, runtime = {}) {
  const customer = normalizeDevCustomerKey(options.customer || 'yoyoosun')
  const ports = parsePorts(options.ports || defaultYoyoosunEntryAuditPorts)
  const backendHealthURL = normalizeSafeURL(
    options.backendHealthURL || defaultBackendHealthURL,
    'backend health URL'
  )
  const fetchText = runtime.fetchText || defaultFetchText
  const fetchHead = runtime.fetchHead || defaultFetchHead
  const getPortProcess = runtime.getPortProcess || defaultGetPortProcess

  const portReports = []
  for (const port of ports) {
    const baseURL = `http://localhost:${port}`
    const [processInfo, configResponse, assetResponse] = await Promise.all([
      getPortProcess(port),
      fetchText(`${baseURL}/customer-config.js`),
      fetchHead(
        `${baseURL}/customer-assets/${customer}/favicon-${customer}.svg`
      ),
    ])
    portReports.push({
      port,
      url: `${baseURL}/erp`,
      process: processInfo,
      customerConfig: {
        url: `${baseURL}/customer-config.js`,
        httpStatus: configResponse.status,
        contentType: configResponse.contentType,
        ...classifyCustomerConfigResponse(configResponse),
      },
      customerAsset: {
        url: `${baseURL}/customer-assets/${customer}/favicon-${customer}.svg`,
        httpStatus: assetResponse.status,
        contentType: assetResponse.contentType,
        ...classifyAssetResponse(assetResponse),
      },
    })
  }

  const backendHealth = await fetchText(backendHealthURL)
  const yoyoosunPorts = portReports
    .filter(
      (item) =>
        item.customerConfig.matchedCustomer &&
        item.customerAsset.matchedCustomerAsset
    )
    .map((item) => item.port)

  return {
    scope: 'yoyoosun-local-entry-audit',
    generatedAt: new Date().toISOString(),
    customer,
    readOnly: true,
    writesDatabase: false,
    writesReport: Boolean(options.report),
    callsJSONRPC: false,
    readsSecrets: false,
    startsServer: false,
    notProvenByThisAudit: [
      'real login',
      'backend RBAC authorization',
      'customer_config.get_effective_session source',
      'active customer config revision',
      'ordinary account menu projection',
      'mobile task entry access',
      'target environment release evidence',
    ],
    backendHealth: {
      url: backendHealthURL,
      ok: backendHealth.ok,
      httpStatus: backendHealth.status,
      contentType: backendHealth.contentType,
      bodyPreview: backendHealth.body.slice(0, 80),
    },
    ports: portReports,
    summary: {
      checkedPorts: ports,
      yoyoosunPorts,
      productCorePlaceholderPorts: portReports
        .filter(
          (item) => item.customerConfig.status === 'product_core_placeholder'
        )
        .map((item) => item.port),
      htmlFallbackPorts: portReports
        .filter(
          (item) =>
            item.customerConfig.status === 'html_fallback' ||
            item.customerAsset.status === 'html_fallback'
        )
        .map((item) => item.port),
      readyForStaticYoyoosunPreview: yoyoosunPorts.length > 0,
      nextStep:
        yoyoosunPorts.length > 0
          ? `Open http://localhost:${yoyoosunPorts[0]}/erp for the current yoyoosun static/dev frontend; run real login smoke only after credentials are available.`
          : 'Run pnpm --dir web start:yoyoosun -- --print-plan or preview:yoyoosun -- --print-plan, then audit the printed port.',
    },
  }
}

async function writeJSONReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`)
  await fs.rename(tmpPath, filePath)
}

async function defaultFetchText(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      body: await response.text(),
      error: '',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      body: '',
      error: String(error?.message || error),
    }
  }
}

async function defaultFetchHead(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(2500),
    })
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      body: '',
      error: '',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      body: '',
      error: String(error?.message || error),
    }
  }
}

async function defaultGetPortProcess(port) {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-nP',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-Fpcn',
    ])
    const entry = parseLsofProcess(stdout)
    if (!entry.pid) {
      return { listening: false, pid: '', command: '', cwd: '' }
    }
    const [command, cwd] = await Promise.all([
      readProcessCommand(entry.pid),
      readProcessCwd(entry.pid),
    ])
    return {
      listening: true,
      pid: entry.pid,
      command: command || entry.command,
      cwd,
    }
  } catch {
    return { listening: false, pid: '', command: '', cwd: '' }
  }
}

function parseLsofProcess(output) {
  const result = { pid: '', command: '' }
  for (const line of String(output || '').split(/\r?\n/)) {
    if (line.startsWith('p') && !result.pid) {
      result.pid = line.slice(1)
    }
    if (line.startsWith('c') && !result.command) {
      result.command = line.slice(1)
    }
  }
  return result
}

async function readProcessCommand(pid) {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', pid, '-o', 'command='])
    return stdout.trim()
  } catch {
    return ''
  }
}

async function readProcessCwd(pid) {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-a',
      '-p',
      pid,
      '-d',
      'cwd',
      '-Fn',
    ])
    return (
      stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith('n'))
        ?.slice(1) || ''
    )
  } catch {
    return ''
  }
}

function printTextReport(report) {
  const lines = [
    `[yoyoosun-entry-audit] scope=${report.scope}`,
    `[yoyoosun-entry-audit] customer=${report.customer}`,
    `[yoyoosun-entry-audit] backend health ${report.backendHealth.ok ? 'ok' : 'not-ok'}: ${report.backendHealth.url}`,
    `[yoyoosun-entry-audit] yoyoosun ports=${report.summary.yoyoosunPorts.join(',') || '-'}`,
  ]
  for (const item of report.ports) {
    lines.push(
      [
        `[yoyoosun-entry-audit] port=${item.port}`,
        `cwd=${item.process.cwd || '-'}`,
        `config=${item.customerConfig.status}`,
        `asset=${item.customerAsset.status}`,
      ].join(' ')
    )
  }
  lines.push(`[yoyoosun-entry-audit] next=${report.summary.nextStep}`)
  lines.push(
    `[yoyoosun-entry-audit] not proven=${report.notProvenByThisAudit.join(', ')}`
  )
  process.stdout.write(`${lines.join('\n')}\n`)
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] || '').href

if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(
        [
          'Usage:',
          '  node web/scripts/yoyoosunLocalEntryAudit.mjs [--ports 5175,5176,5177,5178,5179] [--backend-health-url http://127.0.0.1:8300/healthz] [--json] [--report output/yoyoosun-local-entry-audit.json]',
          '',
        ].join('\n')
      )
      process.exit(0)
    }
    const report = await buildYoyoosunLocalEntryAudit(options)
    if (options.report) {
      await writeJSONReport(options.report, report)
      process.stderr.write(
        `[yoyoosun-entry-audit] report written: ${path.relative(repoRoot, options.report)}\n`
      )
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      printTextReport(report)
    }
  } catch (error) {
    process.stderr.write(`[yoyoosun-entry-audit] ${error.message}\n`)
    process.exit(1)
  }
}
