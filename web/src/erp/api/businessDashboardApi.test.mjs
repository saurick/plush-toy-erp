import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { dashboardHealthModules } from '../config/dashboardModules.mjs'
import { requireBusinessDashboardStatsResponse } from '../utils/businessDashboardContract.mjs'

function read(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

function validModules() {
  return dashboardHealthModules
    .flatMap((moduleItem) => moduleItem.sources)
    .map((source) => ({
      module_key: source.key,
      available: true,
      total: 0,
    }))
}

async function loadBusinessDashboardApi(call) {
  globalThis.__businessDashboardApiTestCall = call
  globalThis.__businessDashboardApiTestRequireResponse =
    requireBusinessDashboardStatsResponse
  const transformed = read('./businessDashboardApi.mjs')
    .replace(
      "import { AUTH_SCOPE } from '@/common/auth/auth'",
      "const AUTH_SCOPE = { ADMIN: 'business-dashboard-api-test' }"
    )
    .replace(
      "import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'",
      "const ADMIN_BASE_PATH = '/admin'"
    )
    .replace(
      "import { JsonRpc } from '@/common/utils/jsonRpc'",
      `class JsonRpc {
        async call(method, params) {
          return globalThis.__businessDashboardApiTestCall(method, params)
        }
      }`
    )
    .replace(
      "import { requireBusinessDashboardStatsResponse } from '../utils/businessDashboardContract.mjs'",
      'const requireBusinessDashboardStatsResponse = globalThis.__businessDashboardApiTestRequireResponse'
    )
  const encoded = Buffer.from(transformed).toString('base64')
  return import(
    `data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`
  )
}

test('businessDashboardApi: 使用专用统计接口并保留大数、真实零和不可用状态', async () => {
  const calls = []
  const response = {
    modules: validModules().map((item) => ({
      ...item,
      available: item.module_key !== 'invoices',
      total: item.module_key === 'customers' ? 1_234_567 : 0,
    })),
  }
  const api = await loadBusinessDashboardApi(async (method, params) => {
    calls.push({ method, params })
    return { data: response }
  })
  const params = { snapshot: 'current' }

  assert.equal(await api.getBusinessDashboardStats(params), response)
  assert.deepEqual(calls, [{ method: 'dashboard_stats', params }])
})

test('businessDashboardApi: 缺字段、负数和重复对象都拒绝作为成功响应', async () => {
  const completeModules = validModules()
  const malformedResponses = [
    { modules: [] },
    { modules: completeModules.slice(1) },
    {
      modules: completeModules.map((item) =>
        item.module_key === 'customers'
          ? { module_key: item.module_key, total: item.total }
          : item
      ),
    },
    {
      modules: completeModules.map((item) =>
        item.module_key === 'customers' ? { ...item, total: -1 } : item
      ),
    },
    {
      modules: completeModules.map((item) =>
        item.module_key === 'invoices'
          ? { ...item, available: false, total: 12 }
          : item
      ),
    },
    { modules: [...completeModules, { ...completeModules[0] }] },
  ]

  for (const response of malformedResponses) {
    const api = await loadBusinessDashboardApi(async () => ({ data: response }))
    await assert.rejects(
      api.getBusinessDashboardStats(),
      (error) => error.isInvalidResponse === true
    )
  }
})
